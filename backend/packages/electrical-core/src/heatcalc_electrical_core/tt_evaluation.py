"""The sole deterministic TT execution kernel."""

from __future__ import annotations

from decimal import Decimal

from .contracts import PipeLayout, TTFormulaResult, TTPreparationInput
from .decimal_math import round_result
from .final_gate import validate_final_physical_gate
from .geometry import compute_winding_factor
from .sections import compute_section_plan
from .selection import CableSelectionInput, select_tt_cable
from .tt_contract import ELECTRICAL_TT_FORMULA_FINGERPRINT, ELECTRICAL_TT_FORMULA_VERSION
from .validation import TTFormulaReport


def execute_tt_kernel(data: TTPreparationInput) -> TTFormulaResult | TTFormulaReport:
    if not isinstance(data.layout, PipeLayout) or data.layout.winding_pitch_mm is None:
        winding = Decimal("1")
    else:
        winding = compute_winding_factor(
            outer_diameter_mm=data.layout.outer_diameter_mm or Decimal("0"),
            winding_pitch_mm=data.layout.winding_pitch_mm,
        )
    selected = select_tt_cable(
        data.catalogs,
        CableSelectionInput(
            data.required_power_per_meter_w,
            data.product_temperature_c,
            data.ambient_temperature_c,
            data.safety_factor,
            winding,
            data.number_of_threads,
            data.manual_cable_mark,
            data.selection_policy,
        ),
    )
    if isinstance(selected, TTFormulaReport):
        return selected
    required_length = data.layout.base_length_m * winding * selected.num_circuits
    plan = compute_section_plan(
        mark=selected.candidate.full_mark,
        installed_cable_length_m=required_length,
        power_per_meter_w=selected.candidate.passport_power,
        voltage_v=data.supply_voltage_v,
        cold_start_temperature=data.cold_start_temperature_c,
        catalog_rows=data.catalogs.section_rows,
        max_start_current_per_section_a=data.max_start_current_per_section_a,
        max_start_current_source=data.max_start_current_source,
    )
    sections = plan.equal_sections
    physical = validate_final_physical_gate(
        cable_mark=selected.candidate.full_mark,
        series=selected.candidate.series,
        threads=selected.num_circuits,
        voltage_v=data.supply_voltage_v,
        required_power_per_meter_w=selected.required_power_per_meter,
        installed_power_per_meter_w=selected.installed_power_per_meter,
        plan=plan,
        sections=sections,
    )
    if not physical.is_valid:
        return physical
    return TTFormulaResult(
        selected_cable=selected.candidate.power.model,
        cable_mark=selected.candidate.full_mark,
        series=selected.candidate.series,
        temperature_group="high" if selected.candidate.series in {"ТТВ", "ТТХ"} else "low",
        num_circuits=selected.num_circuits,
        power_per_meter_w=selected.candidate.passport_power,
        required_power_per_meter_w=selected.required_power_per_meter,
        installed_power_per_meter_w=round_result(selected.installed_power_per_meter),
        winding_factor=winding,
        winding_pitch_mm=(
            data.layout.winding_pitch_mm if isinstance(data.layout, PipeLayout) else None
        ),
        required_cable_length_m=round_result(required_length),
        installed_cable_length_m=plan.l_fact_m,
        order_cable_length_m=plan.order_cable_length_m,
        total_power_w=plan.total_power_w,
        current_a=plan.working_current_a,
        voltage_v=data.supply_voltage_v,
        execution_defaulted=selected.execution_defaulted,
        section_plan=plan,
        equal_sections=sections,
        formula_version=ELECTRICAL_TT_FORMULA_VERSION,
        formula_fingerprint=ELECTRICAL_TT_FORMULA_FINGERPRINT,
    )
