from dataclasses import replace

from heatcalc_electrical_core import run_tt_formula
from heatcalc_electrical_core.final_gate import validate_final_physical_gate

from .test_tt_formula import _input


def test_final_gate_rejects_current_above_limit_and_never_checks_catalog_identity() -> None:
    result = run_tt_formula(_input()).result
    assert result is not None
    broken = replace(
        result.section_plan, start_current_per_section_a=result.section_plan.i_dop_a + 1
    )
    report = validate_final_physical_gate(
        cable_mark=result.cable_mark,
        series=result.series,
        threads=1,
        voltage_v=result.voltage_v,
        required_power_per_meter_w=result.required_power_per_meter_w,
        installed_power_per_meter_w=result.installed_power_per_meter_w,
        plan=broken,
        sections=result.equal_sections,
    )
    assert report.issues[0].details["check"] == "start_current_le_idop"
