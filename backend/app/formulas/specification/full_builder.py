"""Полный условный расчёт спецификации (BOM) по PDF / PDL Phase 5.

Канон: PDF 07.07.2026 + PDL-ER-16/34; XLSX — catalog identity only where
PDF-approved. PDL-ER-44: соединительные комплекты — pick-one
``qty = ceil(Nсек / sections_per_kit)``, не dual XLSX emission.

PDL-ER-32: tank/resistive — только доказанный кабель.
PDL-ER-35: box matrix missing → fail-closed.
SEEDS: sections/matrix empty → partial diagnostics, no invented quantities.

Количества штучных позиций: ``package_factor`` каталога перед ceil (ленты/клей).
"""

from __future__ import annotations

import math
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Any

from app.electrical_result_status import is_successful_electrical_result
from app.formulas.specification.catalog_identity import (
    cable_identity_from_result,
    resolve_accessory_rule,
    temperature_group_from_result,
)
from app.formulas.specification.source_mapping import (
    box_ex_rgr_matrix_meta,
    box_ex_rgr_matrix_registered,
    is_rule_approved,
    rule_exclusion,
)
from app.reference_data.loader import list_spec_accessory_rules
from app.schemas.specification import SpecificationItem, SpecificationOptions

PI = math.pi

# BOM accessories источника описывают только саморегулирующиеся кабели.
# Отсутствие cable_type (legacy-результаты) трактуем как саморег.
_SELF_REGULATING_TYPES = {"self_regulating", "self_regulating_tt"}
_RESISTIVE_TYPES = {"single_core", "three_core", "resistive"}

# Rules that require the official Ex/Rгр matrix (box SKUs + derived hardware).
_BOX_MATRIX_RULES = frozenset(
    {
        "box_Nk1",
        "box_Nk2",
        "box_Nk3",
        "box_Nk4",
        "box_Nk5",
        "box_Nk6",
        "box_Nk7",
        "box_Nk8",
        "box_Nk9",
        "box_Nk10",
        "box_Nk11",
        "box_Nk12",
        "clamp_hk30",
        "clamp_fastener",
        "sealant_silicone",
        "z_profile",
        "label_grounding",
        "cable_entry_plastic",
        "cable_entry_armored",
        "cable_entry_under_insulation",
    }
)


def box_ex_rgr_matrix_available() -> bool:
    """True only when an official per-row Ex/Rгр matrix is registered (PDL-ER-35)."""
    return box_ex_rgr_matrix_registered()


def heating_sections_ready() -> bool:
    """True only when Phase 4 section catalog is registered (PDL-ER-15/28).

    Production default is False. Tests/catalog registration may override.
    """
    return False


def _is_successful(result: dict[str, Any]) -> bool:
    return is_successful_electrical_result(None, result)


def _ceil(value: float) -> float:
    """Округление вверх с гашением накопленной float-ошибки (1.3×10 → 13, не 14)."""
    return float(math.ceil(round(value, 9)))


def _cable_type(result: dict[str, Any]) -> str | None:
    raw = result.get("cable_type")
    if raw is None:
        return None
    return str(raw)


def is_self_regulating_result(result: dict[str, Any]) -> bool:
    cable_type = _cable_type(result)
    # Legacy rows without cable_type are treated as self-reg for compatibility.
    return cable_type is None or cable_type in _SELF_REGULATING_TYPES


def is_resistive_result(result: dict[str, Any]) -> bool:
    cable_type = _cable_type(result)
    return cable_type in _RESISTIVE_TYPES


def contributes_cable_to_bom(result: dict[str, Any]) -> bool:
    """Proven cable line: successful electrical result with mark and length.

    PDL-ER-32: cable is independently proven for self-reg and resistive flows.
    Unsupported mineral/skin stay out.
    """
    if not _is_successful(result):
        return False
    cable_type = _cable_type(result)
    if cable_type in {"skin", "mineral"}:
        return False
    if not (result.get("cable_mark") or result.get("selected_cable")):
        return False
    return _num(result.get("installed_cable_length") or result.get("cable_length")) > 0


def contributes_self_reg_accessories(result: dict[str, Any]) -> bool:
    """Self-reg accessory formulas (kits/tapes) — only self-reg rows."""
    return contributes_cable_to_bom(result) and is_self_regulating_result(result)


def contributes_to_full_bom(result: dict[str, Any]) -> bool:
    """Даёт ли позиция электрорасчёта вклад в полный BOM.

    PDL-ER-32: proven cable (incl. resistive) contributes; accessory transfer
    is gated separately. Used by preflight/skipped_objects accounting.
    """
    return contributes_cable_to_bom(result)


def _num(value: Any, default: float = 0.0) -> float:
    try:
        if value is None:
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def _temp_class_from_result(result: dict[str, Any], mark: str) -> str | None:
    """PDL-ER-33: temperature group from explicit fields only (no mark prefix)."""
    del mark  # mark string is not an identity oracle
    return temperature_group_from_result(result)


def _box_bucket(*, d_large: bool, n_ge3: bool, k1i: bool, k2i_active: bool, kiu: bool) -> str:
    """Возвращает ключ Nk-корзины коробки по условиям ТНП."""
    if k2i_active:
        if d_large:
            return "Nk6" if kiu else "Nk5"
        return "Nk10" if kiu else "Nk9"
    if k1i:
        if d_large:
            return "Nk4" if kiu else "Nk3"
        return "Nk12" if kiu else "Nk11"
    if d_large:
        return "Nk2" if n_ge3 else "Nk1"
    return "Nk8" if n_ge3 else "Nk7"


def _order_cable_qty(result: dict[str, Any], section_total: float) -> float:
    """PDL-ER-02/31: final commercial order length first (not raw +10%).

    Priority: commercial.required_order_length → snapshot commercial_context →
    raw order_cable_length → installed section_total.
    """
    commercial = result.get("commercial") if isinstance(result.get("commercial"), dict) else {}
    snapshot = (
        result.get("cable_snapshot") if isinstance(result.get("cable_snapshot"), dict) else {}
    )
    snap_ctx = (
        snapshot.get("commercial_context")
        if isinstance(snapshot.get("commercial_context"), dict)
        else {}
    )
    # FA-03: commercial final must win over raw order_cable_length.
    for candidate in (
        commercial.get("required_order_length"),
        snap_ctx.get("required_order_length"),
        result.get("order_cable_length"),
    ):
        value = _num(candidate)
        if value > 0:
            return value
    return section_total


def _object_type(obj: dict[str, Any]) -> str:
    raw = obj.get("object_type") or obj.get("type") or "pipe"
    text = str(raw).strip().lower()
    if text in {"tank", "barrel", "ёмкость", "емкость", "бочка", "резервуар"}:
        return "tank"
    return "pipe"


@dataclass
class FullSpecificationBuild:
    """Detailed full BOM build with PDL-ER-32/35 diagnostics."""

    items: list[SpecificationItem] = field(default_factory=list)
    excluded_groups: list[dict[str, Any]] = field(default_factory=list)
    partial: bool = False
    contributing_object_ids: list[str] = field(default_factory=list)
    excluded_object_ids: list[str] = field(default_factory=list)


def build_full_specification_detailed(
    electrical_results: list[dict[str, Any]],
    objects_by_id: dict[str, dict[str, Any]],
    *,
    options: SpecificationOptions | None = None,
) -> FullSpecificationBuild:
    """Полная спецификация с partial/exclusion diagnostics (PDL-ER-32/35)."""
    opt = options or SpecificationOptions()
    r_res = opt.reserve_coefficient
    excluded_groups: list[dict[str, Any]] = []
    matrix_ok = box_ex_rgr_matrix_available()

    if not matrix_ok:
        excluded_groups.append(
            {
                "group": "boxes_ex_rgr",
                "error_code": "BOX_EX_RGR_MATRIX_MISSING",
                "message": (
                    "Официальная per-row матрица условий коробок Ex/Rгр не "
                    "зарегистрирована (PDL-ER-35). Зависимые коробки и "
                    "box-derived позиции fail-closed."
                ),
                "matrix": box_ex_rgr_matrix_meta(),
            }
        )
    # FA-02 / PDL-ER-15: real sections require Lmax/Iдоп/Iст.уд catalog — absent.
    # num_circuits must not drive connector/box-dependent BOM quantities.
    # Unit tests may monkeypatch heating_sections_ready() after catalog arrives.
    sections_ready = heating_sections_ready()
    if not sections_ready:
        excluded_groups.append(
            {
                "group": "heating_sections",
                "error_code": "SECTION_DATA_SOURCE_MISSING",
                "message": (
                    "Официальный каталог секционирования (Lmax, Iдоп, Iст.уд) не "
                    "зарегистрирован (PDL-ER-15/28). Соединительные комплекты и "
                    "другие Nсек-зависимые позиции исключены; num_circuits не "
                    "подменяет секции."
                ),
            }
        )
    missing_temp_objects: list[str] = []

    # --- Аккумуляторы ---
    cable_by_mark: dict[str, float] = defaultdict(float)
    cable_meta: dict[str, dict[str, Any]] = {}
    length_low = 0.0  # ΣL1
    length_high = 0.0  # ΣL2
    n_low = 0.0  # Σ N,секц (низк.) с резервом
    n_high = 0.0  # Σ N,секц (выс.) с резервом
    boxes: dict[str, float] = defaultdict(float)
    homut = 0.0
    tape_low = 0.0
    tape_high = 0.0
    label_warning = 0.0

    contributing_ids: list[str] = []
    tank_accessory_excluded: list[str] = []
    resistive_accessory_excluded: list[str] = []

    for result in electrical_results:
        obj_id = str(result.get("object_id") or "")
        if not contributes_cable_to_bom(result):
            continue
        contributing_ids.append(obj_id)

        identity = cable_identity_from_result(result)
        if identity is None:
            continue
        mark = str(identity["mark"])
        n_sec = max(1, int(round(_num(result.get("num_circuits"), 1) or 1)))
        section_total = _num(
            result.get("installed_cable_length") or result.get("cable_length")
        )
        obj = objects_by_id.get(obj_id, {})
        obj_type = _object_type(obj)
        d_mm = _num(obj.get("outer_diameter")) * 1000.0
        l_tr = _num(obj.get("pipe_length"))
        tclass = _temp_class_from_result(result, mark)
        section_length = section_total / n_sec if n_sec else section_total

        cable_qty = _order_cable_qty(result, section_total)
        cable_by_mark[mark] += cable_qty
        cable_meta.setdefault(
            mark,
            {
                **identity,
                "temp_class": tclass,
                "cable_type": _cable_type(result) or "self_regulating",
            },
        )

        # PDL-ER-32: accessories only for self-reg pipe; tank/resistive stay cable-only.
        if is_resistive_result(result):
            resistive_accessory_excluded.append(obj_id)
            continue
        if obj_type == "tank":
            tank_accessory_excluded.append(obj_id)
            continue
        if not is_self_regulating_result(result):
            continue
        if tclass is None:
            # Cannot allocate kits without explicit temperature group (PDL-ER-33).
            missing_temp_objects.append(obj_id)
            continue

        k2i_active = (
            sections_ready
            and opt.end_section_indication
            and section_length >= opt.min_length_for_end_indication
        )

        # Length-based groups use installed length (not order) for engineering
        # formulas; commercial order is only for cable procurement rows.
        if tclass == "low":
            length_low += section_total
            if sections_ready:
                n_low += n_sec * r_res
            # FA-04 glass tape: PDF already includes ×1.1; use installed length once.
            tape_low += (
                (PI * d_mm * 2.5 / 1000.0) * (section_total / 0.3) * 1.1 if d_mm > 0 else 0.0
            )
        else:
            length_high += section_total
            if sections_ready:
                n_high += n_sec * r_res
            tape_high += (
                (PI * d_mm * 2.5 / 1000.0) * (section_total / 0.3) * 1.1 if d_mm > 0 else 0.0
            )

        # Boxes only when matrix available AND real sections ready.
        if matrix_ok and sections_ready:
            box_count = math.ceil(n_sec / 3)
            d_large = d_mm >= 57.0
            n_ge3 = n_sec >= 3
            bucket = _box_bucket(
                d_large=d_large,
                n_ge3=n_ge3,
                k1i=opt.indication_on_boxes,
                k2i_active=k2i_active,
                kiu=opt.top_indication,
            )
            boxes[bucket] += box_count
            if d_large and bucket in {"Nk1", "Nk2", "Nk3", "Nk4", "Nk5", "Nk6"}:
                homut += ((d_mm * PI * 1.2) + 50.0) / 1000.0 * 2.0 * box_count

        if l_tr > 0:
            label_warning += math.ceil(l_tr / 3.5)

    if tank_accessory_excluded:
        excluded_groups.append(
            {
                "group": "tank_accessories",
                "error_code": "TANK_ACCESSORY_METHOD_UNPROVEN",
                "message": (
                    "Для ёмкостей в BOM включён только доказанный кабель; "
                    "pipe/self-reg accessories не переносятся (PDL-ER-32)."
                ),
                "object_ids": list(dict.fromkeys(tank_accessory_excluded)),
            }
        )
    if resistive_accessory_excluded:
        excluded_groups.append(
            {
                "group": "resistive_accessories",
                "error_code": "RESISTIVE_ACCESSORY_METHOD_UNPROVEN",
                "message": (
                    "Для резистивного кабеля в BOM включён только доказанный "
                    "кабель; self-reg accessories не применяются (PDL-ER-32)."
                ),
                "object_ids": list(dict.fromkeys(resistive_accessory_excluded)),
            }
        )
    if missing_temp_objects:
        excluded_groups.append(
            {
                "group": "temperature_group",
                "error_code": "CATALOG_TEMPERATURE_GROUP_MISSING",
                "message": (
                    "temperature_group не задан явным catalog/snapshot полем; "
                    "комплекты/ленты не распределены (PDL-ER-33)."
                ),
                "object_ids": list(dict.fromkeys(missing_temp_objects)),
            }
        )

    def b(key: str) -> float:
        return boxes.get(key, 0.0)

    nk_large_plain = b("Nk1") + b("Nk2")
    nk_large_k1i = b("Nk3") + b("Nk4")
    nk_small_plain = b("Nk7") + b("Nk8")
    # PDL-ER-44 / PDF §7.10: pick ONE kit capacity per temp group.
    # qty = ceil(Nсек / sections_per_kit); default capacity=1 (КСН-1/КСВ-1).
    # Dual XLSX «КСН-1=N and КСН-2=N×2 end-kits» is not the PDF oracle.
    kit_cap = int(getattr(opt, "connector_kit_sections_per_kit", 1) or 1)
    if kit_cap not in (1, 2):
        kit_cap = 1
    conn_low = (
        _ceil(n_low / float(kit_cap)) if sections_ready and n_low > 0 else 0.0
    )
    conn_high = (
        _ceil(n_high / float(kit_cap)) if sections_ready and n_high > 0 else 0.0
    )
    # Emit only the selected capacity rule; other capacity stays 0.
    fl1 = conn_low if kit_cap == 1 else 0.0
    fl2 = conn_low if kit_cap == 2 else 0.0
    fl3 = conn_high if kit_cap == 1 else 0.0
    fl4 = conn_high if kit_cap == 2 else 0.0
    repair_low = _ceil(length_low / 150.0) if length_low > 0 else 0.0
    repair_high = _ceil(length_high / 150.0) if length_high > 0 else 0.0
    # FA-04 / PDF §7.12: ceil((connector_kits + repair_kits) / 7) via package_factor.
    glue_kits = fl1 + fl2 + fl3 + fl4 + repair_low + repair_high

    rule_values: dict[str, float] = {
        "connector_kit_low_1": fl1,
        "connector_kit_low_2": fl2,
        "connector_kit_high_1": fl3,
        "connector_kit_high_2": fl4,
        "repair_kit_low": repair_low,
        "repair_kit_high": repair_high,
        "box_Nk1": b("Nk1"),
        "box_Nk2": b("Nk2"),
        "box_Nk3": b("Nk3"),
        "box_Nk4": b("Nk4"),
        "box_Nk5": b("Nk5"),
        "box_Nk6": b("Nk6"),
        "box_Nk7": b("Nk7"),
        "box_Nk8": b("Nk8"),
        "box_Nk9": b("Nk9"),
        "box_Nk10": b("Nk10"),
        "box_Nk11": b("Nk11"),
        "box_Nk12": b("Nk12"),
        "cable_entry_plastic": (
            (nk_large_plain + nk_large_k1i + b("Nk7")) if (matrix_ok and not opt.ex_zone) else 0.0
        ),
        "cable_entry_armored": (
            (nk_large_plain + nk_large_k1i + b("Nk7")) if (matrix_ok and opt.ex_zone) else 0.0
        ),
        "cable_entry_under_insulation": (
            (b("Nk7") + b("Nk8") + b("Nk9") + b("Nk10") + b("Nk11") + b("Nk12"))
            if matrix_ok
            else 0.0
        ),
        "clamp_hk30": homut if matrix_ok else 0.0,
        "clamp_fastener": (nk_large_plain + nk_large_k1i) * 2 if matrix_ok else 0.0,
        "tape_glass_low": tape_low,
        "tape_glass_high": tape_high,
        "tape_aluminium": length_low + length_high,
        "sealant_glue": glue_kits,
        "sealant_silicone": (
            (nk_large_plain + nk_large_k1i) if (matrix_ok and sections_ready) else 0.0
        ),
        "label_warning": label_warning,
        "label_grounding": (
            (nk_large_plain + nk_large_k1i + nk_small_plain + b("Nk11") + b("Nk12"))
            if matrix_ok
            else 0.0
        ),
        "z_profile": (
            (b("Nk7") + b("Nk8") + b("Nk9") + b("Nk10") + b("Nk11") + b("Nk12"))
            if matrix_ok
            else 0.0
        ),
    }

    # Explicit zero for matrix-gated rules when matrix missing (fail-closed).
    if not matrix_ok:
        for rule in _BOX_MATRIX_RULES:
            rule_values[rule] = 0.0

    items: list[SpecificationItem] = []

    if is_rule_approved("heating_cable_order_length"):
        for mark, qty in sorted(cable_by_mark.items()):
            if qty <= 0:
                continue
            meta = cable_meta.get(mark, {})
            items.append(
                SpecificationItem(
                    category="Кабель",
                    name=f"Греющий кабель {mark}",
                    article=str(meta.get("nomenclature_code") or mark),
                    unit="м",
                    quantity=round(qty, 2),
                    params={
                        "mark": mark,
                        "nomenclature_code": meta.get("nomenclature_code") or mark,
                        "temperature_group": meta.get("temperature_group") or meta.get("temp_class"),
                        "temp_class": meta.get("temp_class"),
                        "catalog_base": "heating_cable",
                        "cable_type": meta.get("cable_type"),
                        "catalog_source": meta.get("catalog_source"),
                        "catalog_version": meta.get("catalog_version"),
                        "bom_section": "common",
                    },
                )
            )

    identity_excluded: list[str] = []
    for rule in list_spec_accessory_rules():
        rule_key = str(rule["rule"])
        # PDL-ER-34: only PDF-approved rules; PDL-ER-35 gates box matrix rules.
        if not is_rule_approved(rule_key):
            excl = rule_exclusion(rule_key)
            # Aggregate matrix missing once; other exclusions listed per group.
            if (
                excl
                and excl.get("error_code") != "BOX_EX_RGR_MATRIX_MISSING"
                and excl.get("error_code")
                not in {g.get("error_code") for g in excluded_groups}
            ):
                excluded_groups.append(excl)
            continue
        resolved, err = resolve_accessory_rule(rule_key)
        if resolved is None:
            identity_excluded.append(rule_key)
            excluded_groups.append(
                {
                    "group": rule_key,
                    "error_code": err or "CATALOG_IDENTITY_INCOMPLETE",
                    "message": (
                        f"Позиция «{rule_key}» без явных mark/nomenclature_code "
                        "(PDL-ER-33)."
                    ),
                }
            )
            continue
        value = rule_values.get(rule_key, 0.0)
        if value is None or value <= 0:
            continue
        package_factor = resolved.get("package_factor")
        if package_factor:
            value *= float(package_factor)
        unit = resolved.get("unit", "шт.")
        quantity = round(value, 2) if unit == "м" else _ceil(value)
        params: dict[str, Any] = {
            "bom_section": "common",
            "mark": resolved.get("mark"),
            "nomenclature_code": resolved.get("nomenclature_code"),
            "temperature_group": resolved.get("temperature_group"),
            "catalog_base": resolved.get("catalog_base"),
            "catalog_source": resolved.get("catalog_source"),
            "catalog_version": resolved.get("catalog_version"),
            "code": resolved.get("nomenclature_code"),
        }
        if package_factor:
            params["package_factor"] = package_factor
        if resolved.get("mass_kg") is not None:
            params["mass_kg"] = resolved["mass_kg"]
        items.append(
            SpecificationItem(
                category=resolved["category"],
                name=resolved["name"],
                article=str(resolved.get("mark") or resolved.get("article")),
                unit=unit,
                quantity=quantity,
                params=params,
            )
        )
    del identity_excluded

    items.sort(key=lambda i: (i.category, i.name))

    all_object_ids = {str(oid) for oid in objects_by_id}
    excluded_object_ids = sorted(all_object_ids - set(contributing_ids))
    partial = bool(excluded_groups) or bool(excluded_object_ids)

    return FullSpecificationBuild(
        items=items,
        excluded_groups=excluded_groups,
        partial=partial,
        contributing_object_ids=list(dict.fromkeys(contributing_ids)),
        excluded_object_ids=excluded_object_ids,
    )


def build_full_specification(
    electrical_results: list[dict[str, Any]],
    objects_by_id: dict[str, dict[str, Any]],
    *,
    options: SpecificationOptions | None = None,
) -> list[SpecificationItem]:
    """Полная спецификация по ТНП-алгоритму (items only, compatibility API)."""
    return build_full_specification_detailed(
        electrical_results,
        objects_by_id,
        options=options,
    ).items
