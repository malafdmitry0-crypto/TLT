"""Полный условный расчёт спецификации (BOM) по PDF / PDL Phase 5.

Канон: PDF 07.07.2026 + PDL-ER-16/34; XLSX — catalog identity only where
PDF-approved. PDL-ER-44: соединительные комплекты — pick-one
``qty = ceil(Nсек / sections_per_kit)``, не dual XLSX emission.

PDL-ER-32: tank/resistive — только доказанный кабель.
PDL-ER-35: box matrix missing → fail-closed.
SEEDS: sections/matrix empty → partial diagnostics, no invented quantities.

PDF-BOM-07: коробки — data-driven rows из box_ex_rgr_matrix.json.
Упаковка: kits_per_unit / reel_m / package_factor из каталога (PDF-BOM-03…06).
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
    tt_catalog_issue_from_result,
)
from app.formulas.specification.source_mapping import (
    box_ex_rgr_matrix_meta,
    box_ex_rgr_matrix_registered,
    is_rule_approved,
    list_box_ex_rgr_matrix_rows,
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

_BOX_RULE_KEYS = frozenset(
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
    }
)

_DEFAULT_REPAIR_LENGTH_PER_KIT = 150.0


def box_ex_rgr_matrix_available() -> bool:
    """True only when an official per-row Ex/Rгр matrix is registered (PDL-ER-35)."""
    return box_ex_rgr_matrix_registered()


def heating_sections_ready() -> bool:
    """True when Phase 4 section catalog is registered (PDL-ER-15/28 / SEEDS-01)."""
    from app.formulas.electrical.sections import section_catalog_registered

    return section_catalog_registered()


def _is_successful(result: dict[str, Any]) -> bool:
    return is_successful_electrical_result(None, result)


def _ceil(value: float) -> float:
    """Округление вверх с гашением накопленной float-ошибки (1.3×10 → 13, не 14)."""
    return float(math.ceil(round(value, 9)))


def _floor(value: float) -> float:
    return float(math.floor(round(value, 9)))


def _cable_type(result: dict[str, Any]) -> str | None:
    cable = result.get("cable") if isinstance(result.get("cable"), dict) else {}
    raw = result.get("cable_type") or cable.get("type")
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
    return _installed_cable_length(result) > 0


def _installed_cable_length(result: dict[str, Any]) -> float:
    layout = result.get("layout") if isinstance(result.get("layout"), dict) else {}
    return _num(
        layout.get("actual_installed_length_m")
        or result.get("installed_cable_length")
        or result.get("cable_length")
    )


def _mocked_fields(result: dict[str, Any]) -> list[str]:
    provenance = result.get("provenance") if isinstance(result.get("provenance"), dict) else {}
    resolved = (
        result.get("resolved_inputs") if isinstance(result.get("resolved_inputs"), dict) else {}
    )
    raw = result.get("mocked_fields")
    if raw is None:
        raw = provenance.get("mocked_fields")
    if raw is None:
        raw = resolved.get("mocked_fields")
    if not isinstance(raw, list):
        return []
    return [str(item) for item in raw if str(item)]


def _is_explicitly_production_ineligible(result: dict[str, Any]) -> bool:
    provenance = result.get("provenance") if isinstance(result.get("provenance"), dict) else {}
    resolved = (
        result.get("resolved_inputs") if isinstance(result.get("resolved_inputs"), dict) else {}
    )
    return any(
        source.get("production_eligible") is False for source in (result, provenance, resolved)
    )


def _tt_section_plan_issue(result: dict[str, Any]) -> dict[str, Any] | None:
    """Validate proof that TT order quantity was produced after sectioning."""
    layout = result.get("layout") if isinstance(result.get("layout"), dict) else {}
    section_summary = result.get("sections") if isinstance(result.get("sections"), dict) else {}
    count = _num(
        result.get("section_count") or result.get("num_sections") or section_summary.get("count")
    )
    section_length = _num(result.get("section_length_m") or section_summary.get("length_m"))
    l_fact = _num(result.get("section_l_fact_m") or layout.get("actual_installed_length_m"))
    installed = _installed_cable_length(result)
    order_length = _order_cable_qty(result, installed)

    missing: list[str] = []
    for field_name, value in (
        ("section_count", count),
        ("section_length_m", section_length),
        ("actual_installed_length_m", l_fact),
        ("required_order_length_m", order_length),
    ):
        if value <= 0:
            missing.append(field_name)
    if missing:
        return {"missing_or_invalid_fields": missing}
    if abs(section_length * count - l_fact) > 0.001 or abs(installed - l_fact) > 0.001:
        return {
            "section_count": count,
            "section_length_m": section_length,
            "actual_installed_length_m": l_fact,
            "result_installed_length_m": installed,
        }
    expected_order_length = _ceil(l_fact * 1.10 * 1000.0) / 1000.0
    if abs(order_length - expected_order_length) > 0.001:
        return {
            "actual_installed_length_m": l_fact,
            "required_order_length_m": order_length,
            "expected_order_length_m": expected_order_length,
        }
    return None


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
    """Legacy Nk bucket (tests / derived mapping). Prefer matrix rows for SKUs."""
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


def _match_box_conditions(
    conds: dict[str, Any],
    *,
    d_mm: float,
    n_sec: int,
    k1i: bool,
    k2i: bool,
    kiu: bool,
    ex_zone: bool,
    l_sec: float,
) -> bool:
    """PDF §7.15 tri-state conditions. d_mm_min inclusive, d_mm_max exclusive."""
    if not isinstance(conds, dict):
        return False
    d_min = conds.get("d_mm_min")
    d_max = conds.get("d_mm_max")
    if d_min is not None and d_mm < float(d_min):
        return False
    if d_max is not None and d_mm >= float(d_max):
        return False
    n_min = conds.get("n_sec_min")
    n_max = conds.get("n_sec_max")
    if n_min is not None and n_sec < int(n_min):
        return False
    if n_max is not None and n_sec > int(n_max):
        return False
    for key, actual in (
        ("requires_k1i", k1i),
        ("requires_k2i", k2i),
        ("requires_kiu", kiu),
        ("requires_ex", ex_zone),
    ):
        if key not in conds or conds[key] is None:
            continue
        if bool(conds[key]) is not bool(actual):
            return False
    l_sec_min = conds.get("l_sec_min")
    return l_sec_min is None or l_sec >= float(l_sec_min)


def _qty_from_box_row(row: dict[str, Any], n_sec: int) -> float:
    """raw=Nсек/divider → round up|down → max(result, min_quantity)."""
    divider = _num(row.get("divider"), 1.0) or 1.0
    raw = float(n_sec) / divider
    round_mode = str(row.get("round") or "up").strip().lower()
    rounded = _floor(raw) if round_mode == "down" else _ceil(raw)
    min_q = _num(row.get("min_quantity"), 1.0)
    if min_q < 1:
        min_q = 1.0
    return max(rounded, min_q)


def evaluate_box_matrix_for_object(
    *,
    d_mm: float,
    n_sec: int,
    k1i: bool,
    k2i: bool,
    kiu: bool,
    ex_zone: bool,
    l_sec: float,
    rows: list[dict[str, Any]] | None = None,
) -> dict[str, float]:
    """PDF-BOM-07: match matrix rows → qty by rule_key (sum by code via rule emission)."""
    matrix_rows = rows if rows is not None else list_box_ex_rgr_matrix_rows()
    out: dict[str, float] = defaultdict(float)
    for row in matrix_rows:
        conds = row.get("conditions") if isinstance(row.get("conditions"), dict) else {}
        if not _match_box_conditions(
            conds,
            d_mm=d_mm,
            n_sec=n_sec,
            k1i=k1i,
            k2i=k2i,
            kiu=kiu,
            ex_zone=ex_zone,
            l_sec=l_sec,
        ):
            continue
        rule_key = str(row.get("rule_key") or row.get("row_id") or "")
        if not rule_key:
            continue
        out[rule_key] += _qty_from_box_row(row, n_sec)
    return dict(out)


def _order_cable_qty(result: dict[str, Any], section_total: float) -> float:
    """PDL-ER-02/31: final commercial order length first (not raw +10%).

    Priority: commercial.required_order_length → snapshot commercial_context →
    raw order_cable_length → installed section_total.
    """
    if _cable_type(result) == "self_regulating_tt":
        layout = result.get("layout") if isinstance(result.get("layout"), dict) else {}
        # TT v2: procurement quantity is the final Lзаказ produced after
        # equal-section expansion. Commercial/minimum-order fields may not
        # override this engineering result.
        for candidate in (
            layout.get("required_order_length_m"),
            result.get("required_order_length_m"),
            result.get("order_cable_length"),
        ):
            value = _num(candidate)
            if value > 0:
                return value
        return 0.0

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


def _repair_length_per_kit() -> float:
    for rule in list_spec_accessory_rules():
        if rule.get("rule") in {"repair_kit_low", "repair_kit_high"}:
            value = _num(rule.get("cable_length_per_kit"), 0.0)
            if value > 0:
                return value
    return _DEFAULT_REPAIR_LENGTH_PER_KIT


def _package_quantity(raw_value: float, resolved: dict[str, Any]) -> tuple[float, dict[str, Any]]:
    """PDF packing: kits_per_unit / reel_m preferred over float package_factor."""
    extra: dict[str, Any] = {}
    unit = resolved.get("unit", "шт.")
    if raw_value is None or raw_value <= 0:
        return 0.0, extra

    kits_per_unit = resolved.get("kits_per_unit")
    reel_m = resolved.get("reel_m")
    package_factor = resolved.get("package_factor")

    if kits_per_unit is not None and _num(kits_per_unit) > 0:
        extra["kits_per_unit"] = float(kits_per_unit)
        return _ceil(raw_value / float(kits_per_unit)), extra

    if reel_m is not None and _num(reel_m) > 0 and unit != "м":
        extra["reel_m"] = float(reel_m)
        if package_factor is not None:
            extra["package_factor"] = package_factor
        return _ceil(raw_value / float(reel_m)), extra

    if package_factor is not None and _num(package_factor) > 0:
        extra["package_factor"] = package_factor
        return _ceil(raw_value * float(package_factor)), extra

    if unit == "м":
        return round(float(raw_value), 2), extra
    return _ceil(float(raw_value)), extra


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
    matrix_rows = list_box_ex_rgr_matrix_rows() if matrix_ok else []

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
    # (mark, bom_section) → order qty / installed qty
    cable_by_key: dict[tuple[str, str], float] = defaultdict(float)
    installed_by_key: dict[tuple[str, str], float] = defaultdict(float)
    cable_meta: dict[str, dict[str, Any]] = {}
    length_low = 0.0  # ΣL1 installed
    length_high = 0.0  # ΣL2
    n_low = 0.0  # Σ N,секц (низк.) с резервом
    n_high = 0.0  # Σ N,секц (выс.) с резервом
    boxes: dict[str, float] = defaultdict(float)  # rule_key → qty
    homut = 0.0
    tape_low = 0.0
    tape_high = 0.0
    label_warning = 0.0

    contributing_ids: list[str] = []
    tank_accessory_excluded: list[str] = []
    resistive_accessory_excluded: list[str] = []
    repair_per_kit = _repair_length_per_kit()

    for result in electrical_results:
        obj_id = str(result.get("object_id") or "")
        is_successful_tt = _cable_type(result) == "self_regulating_tt" and _is_successful(result)
        if is_successful_tt and _mocked_fields(result):
            excluded_groups.append(
                {
                    "group": "heating_cable",
                    "error_code": "ELECTRICAL_MOCK_INPUTS_NOT_ALLOWED",
                    "message": "Non-production electrical result cannot drive a specification.",
                    "object_ids": [obj_id],
                    "mocked_fields": _mocked_fields(result),
                }
            )
            continue
        catalog_issue = tt_catalog_issue_from_result(result) if is_successful_tt else None
        if catalog_issue is not None:
            excluded_groups.append(
                {
                    "group": "heating_cable",
                    "error_code": "ELECTRICAL_CATALOG_SOURCE_UNREGISTERED",
                    "message": "TT catalog snapshots are missing, inactive, or stale.",
                    "object_ids": [obj_id],
                    **catalog_issue,
                }
            )
            continue
        if is_successful_tt and _is_explicitly_production_ineligible(result):
            excluded_groups.append(
                {
                    "group": "heating_cable",
                    "error_code": "ELECTRICAL_MOCK_INPUTS_NOT_ALLOWED",
                    "message": "Non-production electrical result cannot drive a specification.",
                    "object_ids": [obj_id],
                    "mocked_fields": _mocked_fields(result),
                }
            )
            continue
        section_issue = _tt_section_plan_issue(result) if is_successful_tt else None
        if section_issue is not None:
            excluded_groups.append(
                {
                    "group": "heating_cable",
                    "error_code": "ELECTRICAL_SECTION_PLAN_INVALID",
                    "message": "TT cable result has no proven final section plan and order length.",
                    "object_ids": [obj_id],
                    **section_issue,
                }
            )
            continue
        if not contributes_cable_to_bom(result):
            continue

        identity = cable_identity_from_result(result)
        if identity is None:
            if _cable_type(result) == "self_regulating_tt":
                cable = result.get("cable") if isinstance(result.get("cable"), dict) else {}
                mark = (
                    result.get("cable_mark")
                    or cable.get("mark")
                    or cable.get("full_mark")
                    or result.get("selected_cable")
                )
                excluded_groups.append(
                    {
                        "group": "heating_cable",
                        "error_code": "SPEC_CABLE_NOMENCLATURE_MISSING",
                        "message": "No exact active BOM entry exists for the full TT cable mark.",
                        "object_ids": [obj_id],
                        "full_mark": mark,
                    }
                )
            continue
        mark = str(identity["mark"])
        # Prefer real Phase-4 section_count; never invent from catalog absence.
        n_sec_raw = result.get("section_count")
        if n_sec_raw is None:
            n_sec_raw = result.get("num_sections")
        if n_sec_raw is None and sections_ready:
            # Interim: threads/circuits only when catalog is registered but
            # this result was not section-enriched (legacy row).
            n_sec_raw = result.get("num_circuits")
        n_sec = max(1, int(round(_num(n_sec_raw, 1) or 1))) if n_sec_raw is not None else 1
        if not sections_ready:
            n_sec = 1  # kits gated separately; keep non-kit paths stable
        section_total = _installed_cable_length(result)
        obj = objects_by_id.get(obj_id, {})
        obj_type = _object_type(obj)
        bom_section = "tank" if obj_type == "tank" else "pipe"
        d_mm = _num(obj.get("outer_diameter")) * 1000.0
        l_tr = _num(obj.get("pipe_length"))
        tclass = _temp_class_from_result(result, mark)
        section_length = section_total / n_sec if n_sec else section_total

        cable_qty = _order_cable_qty(result, section_total)
        if cable_qty <= 0:
            continue
        contributing_ids.append(obj_id)
        cable_by_key[(mark, bom_section)] += cable_qty
        installed_by_key[(mark, bom_section)] += section_total
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

        # PDF-BOM-07: data-driven matrix rows when registered + sections ready.
        if matrix_ok and sections_ready:
            matched = evaluate_box_matrix_for_object(
                d_mm=d_mm,
                n_sec=n_sec,
                k1i=bool(opt.indication_on_boxes),
                k2i=bool(k2i_active),
                kiu=bool(opt.top_indication),
                ex_zone=bool(opt.ex_zone),
                l_sec=section_length,
                rows=matrix_rows,
            )
            for rule_key, qty in matched.items():
                boxes[rule_key] += qty
            # Clamp length for large-diameter boxes (legacy derived formula).
            d_large = d_mm >= 57.0
            box_count = sum(matched.values())
            if d_large and box_count > 0:
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

    def b(rule_key: str) -> float:
        return boxes.get(rule_key, 0.0)

    nk_large_plain = b("box_Nk1") + b("box_Nk2")
    nk_large_k1i = b("box_Nk3") + b("box_Nk4")
    nk_small_plain = b("box_Nk7") + b("box_Nk8")
    # PDL-ER-44 / PDF §7.10: pick ONE kit capacity per temp group.
    kit_cap = int(getattr(opt, "connector_kit_sections_per_kit", 1) or 1)
    if kit_cap not in (1, 2):
        kit_cap = 1
    conn_low = _ceil(n_low / float(kit_cap)) if sections_ready and n_low > 0 else 0.0
    conn_high = _ceil(n_high / float(kit_cap)) if sections_ready and n_high > 0 else 0.0
    # Emit only the selected capacity rule; other capacity stays 0.
    fl1 = conn_low if kit_cap == 1 else 0.0
    fl2 = conn_low if kit_cap == 2 else 0.0
    fl3 = conn_high if kit_cap == 1 else 0.0
    fl4 = conn_high if kit_cap == 2 else 0.0
    repair_low = _ceil(length_low / repair_per_kit) if length_low > 0 else 0.0
    repair_high = _ceil(length_high / repair_per_kit) if length_high > 0 else 0.0
    # FA-04 / PDF §7.12: ceil((connector_kits + repair_kits) / kits_per_unit).
    glue_kits = fl1 + fl2 + fl3 + fl4 + repair_low + repair_high

    rule_values: dict[str, float] = {
        "connector_kit_low_1": fl1,
        "connector_kit_low_2": fl2,
        "connector_kit_high_1": fl3,
        "connector_kit_high_2": fl4,
        "repair_kit_low": repair_low,
        "repair_kit_high": repair_high,
        "box_Nk1": b("box_Nk1"),
        "box_Nk2": b("box_Nk2"),
        "box_Nk3": b("box_Nk3"),
        "box_Nk4": b("box_Nk4"),
        "box_Nk5": b("box_Nk5"),
        "box_Nk6": b("box_Nk6"),
        "box_Nk7": b("box_Nk7"),
        "box_Nk8": b("box_Nk8"),
        "box_Nk9": b("box_Nk9"),
        "box_Nk10": b("box_Nk10"),
        "box_Nk11": b("box_Nk11"),
        "box_Nk12": b("box_Nk12"),
        "cable_entry_plastic": (
            (nk_large_plain + nk_large_k1i + b("box_Nk7"))
            if (matrix_ok and not opt.ex_zone)
            else 0.0
        ),
        "cable_entry_armored": (
            (nk_large_plain + nk_large_k1i + b("box_Nk7")) if (matrix_ok and opt.ex_zone) else 0.0
        ),
        "cable_entry_under_insulation": (
            (
                b("box_Nk7")
                + b("box_Nk8")
                + b("box_Nk9")
                + b("box_Nk10")
                + b("box_Nk11")
                + b("box_Nk12")
            )
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
            (nk_large_plain + nk_large_k1i + nk_small_plain + b("box_Nk11") + b("box_Nk12"))
            if matrix_ok
            else 0.0
        ),
        "z_profile": (
            (
                b("box_Nk7")
                + b("box_Nk8")
                + b("box_Nk9")
                + b("box_Nk10")
                + b("box_Nk11")
                + b("box_Nk12")
            )
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
        for (mark, bom_section), qty in sorted(cable_by_key.items()):
            if qty <= 0:
                continue
            meta = cable_meta.get(mark, {})
            installed_qty = installed_by_key.get((mark, bom_section), 0.0)
            items.append(
                SpecificationItem(
                    category="Кабель",
                    name=f"Греющий кабель {mark}",
                    article=str(meta.get("nomenclature_code") or mark),
                    unit="м",
                    quantity=round(qty, 2),
                    params={
                        "mark": mark,
                        "cable_mark": mark,
                        "nomenclature_code": meta.get("nomenclature_code") or mark,
                        "temperature_group": meta.get("temperature_group")
                        or meta.get("temp_class"),
                        "temp_class": meta.get("temp_class"),
                        "catalog_base": "heating_cable",
                        "cable_type": meta.get("cable_type"),
                        "catalog_source": meta.get("catalog_source"),
                        "catalog_version": meta.get("catalog_version"),
                        "catalog_checksum": meta.get("catalog_checksum"),
                        "catalog_schema_version": meta.get("catalog_schema_version"),
                        "bom_section": bom_section,
                        "order_qty": round(qty, 2),
                        "installed_qty": round(installed_qty, 2),
                        "supplier": meta.get("supplier") or "ТЛТ",
                        "supply_unit": meta.get("supply_unit") or "м",
                    },
                )
            )

    # Accessories from self-reg pipe formulas → pipe section (PDL-ER-38).
    accessory_bom_section = "pipe"

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
                and excl.get("error_code") not in {g.get("error_code") for g in excluded_groups}
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
                        f"Позиция «{rule_key}» без явных mark/nomenclature_code " "(PDL-ER-33)."
                    ),
                }
            )
            continue
        value = rule_values.get(rule_key, 0.0)
        if value is None or value <= 0:
            continue
        quantity, pack_params = _package_quantity(float(value), resolved)
        if quantity <= 0:
            continue
        unit = resolved.get("unit", "шт.")
        params: dict[str, Any] = {
            "bom_section": accessory_bom_section,
            "mark": resolved.get("mark"),
            "nomenclature_code": resolved.get("nomenclature_code"),
            "temperature_group": resolved.get("temperature_group"),
            "catalog_base": resolved.get("catalog_base"),
            "catalog_source": resolved.get("catalog_source"),
            "catalog_version": resolved.get("catalog_version"),
            "code": resolved.get("nomenclature_code"),
            "supplier": resolved.get("supplier") or resolved.get("supplier_name") or "ТЛТ",
            "supply_unit": resolved.get("supply_unit") or unit,
            **pack_params,
        }
        if resolved.get("mass_kg") is not None:
            params["mass_kg"] = resolved["mass_kg"]
        if resolved.get("cable_length_per_kit") is not None:
            params["cable_length_per_kit"] = resolved["cable_length_per_kit"]
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
