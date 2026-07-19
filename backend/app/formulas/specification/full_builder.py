"""Полный условный расчёт спецификации (BOM) по алгоритму ТНП.

Источник: `ТНП/Расчет_спецификации_трубы_самрег29_05_26.xlsx`, лист
«Список материалов Самрег». Реализована формульная (авто-считаемая) часть:
кабель с резервом, соединительные/ремонтные комплекты, взрывозащищённые коробки
по условиям диаметра/количества секций/индикации, кабельные вводы,
крепёж, ленты, герметики, маркировка.

PDL-ER-32: для tank/resistive включаются только доказанные позиции (кабель с
успешным электрорасчётом). Pipe self-reg accessories не переносятся на tank и
не применяются к resistive — исключённые группы дают partial.

PDL-ER-35: per-row матрица условий коробок Ex/Rгр официально не зарегистрирована.
Пока `BOX_EX_RGR_MATRIX` пуста, зависимые коробки и box-derived позиции
fail-closed (не считаются, не заполняются defaults из XLSX).

Количества штучных позиций перед округлением вверх умножаются на
``package_factor`` правила (колонка I источника — коэффициент пересчёта в
упаковку производителя: рулоны лент, картриджи клея и т.п.).

Не входят (проектные/ручные позиции без формул в источнике): КИП
(термопреобразователи, шкаф управления), монтажные кабели/лотки/трубы, ЗИП.

Параметры на позицию электрорасчёта:
  M,секц = марка; L,секц·N,секц = installed_cable_length; N,секц = num_circuits;
  T,секц = температурный класс (низк./выс.); dтр = наружный диаметр; Lтр = длина.
"""

from __future__ import annotations

import math
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Any

from app.electrical_result_status import is_successful_electrical_result
from app.reference_data.loader import list_spec_accessory_rules
from app.schemas.specification import SpecificationItem, SpecificationOptions

PI = math.pi

# BOM accessories источника описывают только саморегулирующиеся кабели.
# Отсутствие cable_type (legacy-результаты) трактуем как саморег.
_SELF_REGULATING_TYPES = {"self_regulating", "self_regulating_tt"}
_RESISTIVE_TYPES = {"single_core", "three_core", "resistive"}

# PDL-ER-35: official per-row Ex/Rгр box condition matrix.
# Until a source/version artifact is registered, the matrix stays empty and
# box-dependent quantities fail closed (no silent XLSX defaults).
BOX_EX_RGR_MATRIX: dict[str, Any] | None = None
BOX_EX_RGR_MATRIX_SOURCE: dict[str, Any] | None = None

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
        # Cable entries depend on Ex condition of box assembly context.
        "cable_entry_plastic",
        "cable_entry_armored",
        "cable_entry_under_insulation",
    }
)


def box_ex_rgr_matrix_available() -> bool:
    """True only when an official per-row Ex/Rгр matrix is registered."""
    return BOX_EX_RGR_MATRIX is not None and len(BOX_EX_RGR_MATRIX) > 0


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


def _temp_class(mark: str) -> str:
    """Низкотемпературный (ТТН, ТЛТ) или высокотемпературный (ТТВ/ТТХ) класс."""
    upper = (mark or "").upper()
    if "ТТВ" in upper or "ТТХ" in upper:
        return "high"
    return "low"


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
    """PDL-ER-02/31: order/commercial length, not Rгр."""
    commercial = result.get("commercial") if isinstance(result.get("commercial"), dict) else {}
    snapshot = (
        result.get("cable_snapshot") if isinstance(result.get("cable_snapshot"), dict) else {}
    )
    snap_ctx = (
        snapshot.get("commercial_context")
        if isinstance(snapshot.get("commercial_context"), dict)
        else {}
    )
    order_len = _num(
        result.get("order_cable_length")
        or commercial.get("required_order_length")
        or snap_ctx.get("required_order_length")
    )
    return order_len if order_len > 0 else section_total


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
                "source": BOX_EX_RGR_MATRIX_SOURCE,
            }
        )

    # --- Аккумуляторы ---
    cable_by_mark: dict[str, float] = defaultdict(float)
    cable_meta: dict[str, dict[str, Any]] = {}
    length_low = 0.0  # ΣL1
    length_high = 0.0  # ΣL2
    n_low = 0.0  # Σ N,секц (низк.) с резервом
    n_high = 0.0  # Σ N,секц (выс.) с резервом
    n_low_k2i = 0.0
    n_high_k2i = 0.0
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

        mark = str(result.get("cable_mark") or result.get("selected_cable"))
        n_sec = max(1, int(round(_num(result.get("num_circuits"), 1) or 1)))
        section_total = _num(
            result.get("installed_cable_length") or result.get("cable_length")
        )
        obj = objects_by_id.get(obj_id, {})
        obj_type = _object_type(obj)
        d_mm = _num(obj.get("outer_diameter")) * 1000.0
        l_tr = _num(obj.get("pipe_length"))
        tclass = _temp_class(mark)
        section_length = section_total / n_sec if n_sec else section_total

        cable_qty = _order_cable_qty(result, section_total)
        cable_by_mark[mark] += cable_qty
        cable_meta.setdefault(
            mark,
            {
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

        k2i_active = (
            opt.end_section_indication
            and section_length >= opt.min_length_for_end_indication
        )

        if tclass == "low":
            length_low += section_total
            n_low += n_sec * r_res
            if k2i_active:
                n_low_k2i += n_sec * r_res
            tape_low += (PI * d_mm * 2.5 / 1000.0) * (cable_qty / 0.3) * 1.1 if d_mm > 0 else 0.0
        else:
            length_high += section_total
            n_high += n_sec * r_res
            if k2i_active:
                n_high_k2i += n_sec * r_res
            tape_high += (PI * d_mm * 2.5 / 1000.0) * (cable_qty / 0.3) * 1.1 if d_mm > 0 else 0.0

        # Boxes only when official Ex/Rгр matrix is available (PDL-ER-35).
        if matrix_ok:
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

    def b(key: str) -> float:
        return boxes.get(key, 0.0)

    nk_large_plain = b("Nk1") + b("Nk2")
    nk_large_k1i = b("Nk3") + b("Nk4")
    nk_small_plain = b("Nk7") + b("Nk8")
    fl1 = n_low
    fl2 = n_low_k2i * 2
    fl3 = n_high
    fl4 = n_high_k2i * 2

    rule_values: dict[str, float] = {
        "connector_kit_low_1": fl1,
        "connector_kit_low_2": fl2,
        "connector_kit_high_1": fl3,
        "connector_kit_high_2": fl4,
        "repair_kit_low": _ceil(length_low / 150.0) if length_low > 0 else 0.0,
        "repair_kit_high": _ceil(length_high / 150.0) if length_high > 0 else 0.0,
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
        "sealant_glue": fl1 + fl2 + fl3 + fl4,
        "sealant_silicone": (nk_large_plain + nk_large_k1i) if matrix_ok else 0.0,
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

    for mark, qty in sorted(cable_by_mark.items()):
        if qty <= 0:
            continue
        meta = cable_meta.get(mark, {})
        items.append(
            SpecificationItem(
                category="Кабель",
                name=f"Греющий кабель {mark}",
                article=mark,
                unit="м",
                quantity=round(qty, 2),
                params={
                    "temp_class": meta.get("temp_class"),
                    "catalog_base": "heating_cable",
                    "cable_type": meta.get("cable_type"),
                    "bom_section": "common",
                },
            )
        )

    for rule in list_spec_accessory_rules():
        rule_key = rule["rule"]
        if rule_key in _BOX_MATRIX_RULES and not matrix_ok:
            continue
        value = rule_values.get(rule_key, 0.0)
        if value is None or value <= 0:
            continue
        package_factor = rule.get("package_factor")
        if package_factor:
            value *= float(package_factor)
        unit = rule.get("unit", "шт.")
        quantity = round(value, 2) if unit == "м" else _ceil(value)
        params: dict[str, Any] = {
            "bom_section": "common",
            "catalog_base": rule.get("rule") or rule.get("name"),
        }
        if package_factor:
            params["package_factor"] = package_factor
        if rule.get("mass_kg") is not None:
            params["mass_kg"] = rule["mass_kg"]
        if rule.get("code"):
            params["code"] = rule["code"]
        items.append(
            SpecificationItem(
                category=rule["category"],
                name=rule["name"],
                article=rule.get("article"),
                unit=unit,
                quantity=quantity,
                params=params,
            )
        )

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
