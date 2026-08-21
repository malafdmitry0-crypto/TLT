"""Physical-only final acceptance gate; catalog authority is an adapter concern."""

from __future__ import annotations

from decimal import Decimal

from .sections import EqualSection, SectionPlan
from .validation import VALID_TT_FORMULA_REPORT, TTFormulaIssue, TTFormulaReport

_LENGTH_EPS = Decimal("0.0005")
_POWER_EPS = Decimal("0.01")
_CURRENT_EPS = Decimal("0.001")


def _issue(check: str, **details: object) -> TTFormulaReport:
    return TTFormulaReport(
        (
            TTFormulaIssue(
                "ELECTRICAL_FINAL_GATE_FAILED",
                details={"check": check, **details},
            ),
        )
    )


def validate_final_physical_gate(
    *,
    cable_mark: str,
    series: str,
    threads: int,
    voltage_v: Decimal,
    required_power_per_meter_w: Decimal,
    installed_power_per_meter_w: Decimal,
    plan: SectionPlan,
    sections: tuple[EqualSection, ...],
) -> TTFormulaReport:
    """Check result physics only; mandatory rows were resolved before selection."""
    if not cable_mark.strip():
        return _issue("cable_mark")
    if not series.strip():
        return _issue("series")
    if voltage_v <= 0:
        return _issue("nominal_voltage_v", left=voltage_v, right="> 0")
    if threads not in {1, 2, 3}:
        return _issue("threads", left=threads, right="1..3")
    if abs(plan.voltage_v - voltage_v) > _CURRENT_EPS:
        return _issue("plan_voltage_match", left=plan.voltage_v, right=voltage_v)
    if plan.section_count <= 0:
        return _issue("section_count")
    if plan.section_length_m <= 0:
        return _issue("section_length")
    if plan.section_length_m > plan.l_max_m + _LENGTH_EPS:
        return _issue("section_length_le_l_max", left=plan.section_length_m, right=plan.l_max_m)
    if plan.start_current_per_section_a > plan.i_dop_a + _CURRENT_EPS:
        return _issue(
            "start_current_le_idop",
            left=plan.start_current_per_section_a,
            right=plan.i_dop_a,
        )
    if plan.l_fact_m + _LENGTH_EPS < plan.l_required_m:
        return _issue("l_fact_ge_l_req", left=plan.l_fact_m, right=plan.l_required_m)
    if len(sections) != plan.section_count:
        return _issue("sections_count_match", left=len(sections), right=plan.section_count)

    expected_values = (
        ("length_m", plan.section_length_m, _LENGTH_EPS),
        ("voltage_v", voltage_v, _CURRENT_EPS),
        ("power_w", plan.power_per_section_w, _POWER_EPS),
        ("working_current_a", plan.working_current_per_section_a, _CURRENT_EPS),
        ("start_current_a", plan.start_current_per_section_a, _CURRENT_EPS),
    )
    for index, section in enumerate(sections, 1):
        for field, expected, tolerance in expected_values:
            actual = getattr(section, field)
            if abs(actual - expected) > tolerance:
                return _issue(
                    "equal_sections",
                    index=index,
                    field=field,
                    left=actual,
                    right=expected,
                )
    if required_power_per_meter_w <= 0:
        return _issue("required_power", left=required_power_per_meter_w)
    if installed_power_per_meter_w + _POWER_EPS < required_power_per_meter_w:
        return _issue(
            "installed_power_ge_required",
            left=installed_power_per_meter_w,
            right=required_power_per_meter_w,
        )
    return VALID_TT_FORMULA_REPORT
