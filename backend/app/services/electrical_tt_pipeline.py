"""Pure orchestration for one resolved self-regulating TT calculation."""

from __future__ import annotations

import hashlib
import json
from collections.abc import Mapping
from decimal import Decimal
from typing import Any

from app.electrical_domain import ElectricalFormulaError
from app.formulas.electrical.decimal_math import SIX_PLACES, decimal_value, round_result
from app.formulas.electrical.sections import compute_section_plan, section_catalog_meta
from app.formulas.electrical.self_regulating import calc_self_regulating_tt, compute_winding_factor
from app.reference_data.loader import (
    get_electrical_tt_bom_entry,
    get_tt_cable_by_model,
    list_tt_cables,
)
from app.schemas.calculation import SelfRegulatingTTParams
from app.schemas.electrical_inputs import ResolvedElectricalInputs

ELECTRICAL_TT_FORMULA_VERSION = "electrical-tt-v2"
_FORMULA_CONTRACT = (
    "T1/T2-strict;q1*T3+q2;technical-minimum;threads=1..3;"
    "U=230;winding-pitch;equal-sections;Lfact-totals;order=ceil(Lfact*1.10,0.001)"
)
ELECTRICAL_TT_FORMULA_FINGERPRINT = "sha256:" + hashlib.sha256(
    _FORMULA_CONTRACT.encode("utf-8")
).hexdigest()


def _stable_hash(value: Any) -> str:
    payload = json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        default=str,
    )
    return "sha256:" + hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _merged_snapshot(
    default: Mapping[str, Any], override: Mapping[str, Any] | None
) -> dict[str, Any]:
    return {**default, **dict(override or {})}


def _power_catalog_snapshot(
    cable_row: Mapping[str, Any], override: Mapping[str, Any] | None
) -> dict[str, Any]:
    rows = list_tt_cables()
    default = {
        "kind": "power",
        "version": "tt-power-v1-provisional",
        "schema_version": 1,
        "status": "provisional",
        "source": "backend/app/reference_data/cables_tt.json",
        "payload_checksum": _stable_hash(rows),
        "row": dict(cable_row),
    }
    return _merged_snapshot(default, override)


def _section_catalog_snapshot(
    plan: Any,
    base_model: str,
    override: Mapping[str, Any] | None,
) -> dict[str, Any]:
    meta = section_catalog_meta()
    row = {
        "base_model": base_model,
        "cold_start_temperature_c": plan.cold_start_temp_c,
        "l_max_m": plan.l_max_m,
        "specific_start_current_a_per_m": plan.i_st_ud_a_per_m,
    }
    default = {
        "kind": "section",
        **meta,
        "row": row,
        "row_checksum": _stable_hash(row),
    }
    return _merged_snapshot(default, override)


def _bom_catalog_snapshot(
    bom_entry: Mapping[str, Any], override: Mapping[str, Any] | None
) -> dict[str, Any]:
    catalog = bom_entry.get("catalog")
    default = {
        **(dict(catalog) if isinstance(catalog, Mapping) else {}),
        "row": {key: value for key, value in bom_entry.items() if key != "catalog"},
    }
    return _merged_snapshot(default, override)


def _source_snapshot(
    provenance: Mapping[str, Any], key: str
) -> Mapping[str, Any] | None:
    value = provenance.get(key)
    return value if isinstance(value, Mapping) else None


def calculate_electrical_tt(
    resolved: ResolvedElectricalInputs,
    *,
    provenance: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    """Calculate cable, winding, equal sections, BOM identity and provenance.

    ``resolved`` is the only engineering input. Optional ``provenance`` may
    supply immutable object/Heat snapshots and catalog version metadata; it
    never changes the calculation.
    """
    values = resolved.values
    source_provenance = dict(provenance or {})
    if values.winding_pitch_mm in (None, 0):
        winding_factor = Decimal(1)
    else:
        if values.outer_diameter_mm is None:
            raise ElectricalFormulaError(
                "ELECTRICAL_WINDING_PITCH_INVALID",
                "Для навива требуется наружный диаметр трубопровода",
            )
        winding_factor = compute_winding_factor(
            outer_diameter_mm=float(values.outer_diameter_mm),
            winding_pitch_mm=float(values.winding_pitch_mm),
        )

    params = SelfRegulatingTTParams(
        required_power_per_meter=float(values.heat_loss_per_meter_w),
        pipe_length=float(values.base_length_m),
        process_temperature=float(values.product_temperature_c),
        maintain_temperature=float(values.maintain_temperature_c),
        supply_voltage=230,
        max_start_current_per_section=float(values.max_section_start_current_a),
        vapor_temperature=(
            float(values.steam_temperature_c) if values.steam_temperature_c is not None else None
        ),
        aggressive_product=values.aggressive_product,
        winding_coefficient=float(winding_factor),
        winding_pitch=(
            float(values.winding_pitch_mm) if values.winding_pitch_mm is not None else None
        ),
        number_of_threads=values.thread_count,
        cable_mark=values.manual_cable_model,
        safety_factor=float(values.safety_factor),
    ).model_copy(update={"selection_policy": values.selection_policy})
    preliminary = calc_self_regulating_tt(params)

    cable_row = get_tt_cable_by_model(preliminary.cable_model or preliminary.selected_cable)
    if cable_row is None:  # defensive: the formula selected from this exact catalog
        raise ElectricalFormulaError(
            "ELECTRICAL_CABLE_NOT_FOUND", "Выбранная модель отсутствует в power-каталоге"
        )
    power_exact = (
        decimal_value(cable_row["q1"]) * values.maintain_temperature_c
        + decimal_value(cable_row["q2"])
    )
    required_length = (
        values.base_length_m * winding_factor * Decimal(preliminary.num_circuits)
    )
    plan = compute_section_plan(
        mark=preliminary.cable_mark,
        installed_cable_length_m=float(required_length),
        power_per_meter_w=float(power_exact),
        voltage_v=230,
        cold_start_temp_c=float(values.cold_start_temperature_c),
        max_start_current_per_section_a=float(values.max_section_start_current_a),
    )
    bom_entry = get_electrical_tt_bom_entry(preliminary.cable_mark)
    if bom_entry is None:
        raise ElectricalFormulaError(
            "SPEC_CABLE_NOMENCLATURE_MISSING",
            "Для полного маркоразмера отсутствует точная BOM-позиция",
            details={"full_mark": preliminary.cable_mark},
        )

    power_catalog = _power_catalog_snapshot(
        cable_row, _source_snapshot(source_provenance, "power_catalog")
    )
    section_catalog = _section_catalog_snapshot(
        plan,
        preliminary.cable_model or preliminary.selected_cable,
        _source_snapshot(source_provenance, "section_catalog"),
    )
    bom_catalog = _bom_catalog_snapshot(
        bom_entry, _source_snapshot(source_provenance, "bom_catalog")
    )
    resolved_values = values.model_dump(mode="json")
    calculation_fingerprint = _stable_hash(
        {
            "formula": ELECTRICAL_TT_FORMULA_FINGERPRINT,
            "inputs": resolved_values,
            "source_provenance": source_provenance,
            "power_catalog": power_catalog,
            "section_catalog": section_catalog,
            "bom_catalog": bom_catalog,
        }
    )
    suffix = preliminary.cable_mark.rsplit("-", 1)[-1]
    sections = [
        {
            "index": index + 1,
            "length_m": plan.section_length_m,
            "power_w": plan.power_per_section_w,
            "start_current_a": plan.start_current_per_section_a,
            "working_current_a": plan.working_current_per_section_a,
            "voltage_v": 230,
        }
        for index in range(plan.section_count)
    ]
    applied_threads = preliminary.num_circuits
    required_power = values.heat_loss_per_meter_w * values.safety_factor
    installed_power = power_exact * winding_factor * Decimal(applied_threads)

    return {
        "status": "ready",
        "inputs": resolved_values,
        "cable": {
            "type": "self_regulating_tt",
            "series": preliminary.series,
            "base_model": preliminary.cable_model,
            "mark": preliminary.cable_mark,
            "suffix": suffix,
            "nomenclature_code": bom_entry["nomenclature_code"],
            "q1": cable_row["q1"],
            "q2": cable_row["q2"],
            "power_at_maintain_temperature_w_per_m": float(round_result(power_exact)),
            "selection_source": "manual" if values.manual_cable_model else "auto",
            "selection_policy": values.selection_policy,
        },
        "layout": {
            "requested_threads": values.thread_count,
            "threads": applied_threads,
            "thread_selection_source": "manual" if values.thread_count else "auto",
            "winding_pitch_mm": (
                float(values.winding_pitch_mm) if values.winding_pitch_mm is not None else None
            ),
            "winding_factor": float(round_result(winding_factor, SIX_PLACES)),
            "required_installed_length_m": float(round_result(required_length)),
            "actual_installed_length_m": plan.l_fact_m,
            "excess_installed_length_m": plan.l_excess_m,
            "required_order_length_m": plan.order_cable_length_m,
        },
        "section_plan": {
            "count": plan.section_count,
            "length_m": plan.section_length_m,
            "l_max_m": plan.l_max_m,
            "l_tok_m": plan.l_tok_m,
            "l_ogr_m": plan.l_ogr_m,
            "max_start_current_a": plan.i_dop_a,
            "specific_start_current_a_per_m": plan.i_st_ud_a_per_m,
            "start_current_per_section_a": plan.start_current_per_section_a,
            "working_current_per_section_a": plan.working_current_per_section_a,
            "power_per_section_w": plan.power_per_section_w,
            "items": sections,
        },
        "electrical": {
            "nominal_voltage_v": 230,
            "required_power_per_meter_w": float(round_result(required_power)),
            "installed_power_per_meter_w": float(round_result(installed_power)),
            "total_power_w": plan.total_power_w,
            "working_current_a": plan.working_current_a,
            "start_current_a": plan.start_current_a,
        },
        "catalogs": {
            "power": power_catalog,
            "section": section_catalog,
            "bom": bom_catalog,
        },
        "provenance": {
            **{
                key: value
                for key, value in source_provenance.items()
                if key not in {"power_catalog", "section_catalog", "bom_catalog"}
            },
            "resolved_inputs": resolved_values,
            "input_sources": dict(resolved.sources),
            "mocked_fields": list(resolved.mocked_fields),
            "legacy_aliases": list(resolved.legacy_aliases),
            "warnings": list(resolved.warnings),
            "production_eligible": resolved.production_eligible,
            "formula_version": ELECTRICAL_TT_FORMULA_VERSION,
            "formula_fingerprint": ELECTRICAL_TT_FORMULA_FINGERPRINT,
            "calculation_fingerprint": calculation_fingerprint,
            "catalogs": {
                "power": power_catalog,
                "section": section_catalog,
                "bom": bom_catalog,
            },
        },
        # Compatibility fields consumed by the current calculation/specification layer.
        "cable_type": "self_regulating_tt",
        "selected_cable": preliminary.selected_cable,
        "cable_model": preliminary.cable_model,
        "cable_mark": preliminary.cable_mark,
        "nomenclature_code": bom_entry["nomenclature_code"],
        "series": preliminary.series,
        "temperature_group": preliminary.temperature_group,
        "num_circuits": applied_threads,
        "power_per_meter": float(round_result(power_exact)),
        "installed_power_per_meter": float(round_result(installed_power)),
        "cable_length": plan.l_fact_m,
        "installed_cable_length": plan.l_fact_m,
        "order_cable_length": plan.order_cable_length_m,
        "total_power": plan.total_power_w,
        "current": plan.working_current_a,
        "voltage": 230,
        "winding_pitch": (
            float(values.winding_pitch_mm) if values.winding_pitch_mm is not None else 0.0
        ),
        "winding_coefficient": float(round_result(winding_factor, SIX_PLACES)),
        "num_sections": plan.section_count,
        "section_count": plan.section_count,
        "section_length_m": plan.section_length_m,
        "section_l_max_m": plan.l_max_m,
        "section_l_tok_m": plan.l_tok_m,
        "section_l_ogr_m": plan.l_ogr_m,
        "section_l_fact_m": plan.l_fact_m,
        "section_l_excess_m": plan.l_excess_m,
        "section_start_current_a": plan.start_current_a,
        "section_working_current_a": plan.working_current_a,
        "section_power_w": plan.power_per_section_w,
        "sections": sections,
        "start_current": plan.start_current_a,
        "working_current": plan.working_current_a,
        "resolved_inputs": resolved_values,
        "input_sources": dict(resolved.sources),
        "mocked_fields": list(resolved.mocked_fields),
        "legacy_aliases": list(resolved.legacy_aliases),
        "warnings": list(resolved.warnings),
        "production_eligible": resolved.production_eligible,
    }
