"""Unit tests for Case 1 Revision 4 §6.14 TT final ready gate."""

from __future__ import annotations

from dataclasses import replace

import pytest

from app.electrical_domain import ElectricalFormulaError
from app.formulas.electrical import tt_final_gate as final_gate_adapter
from app.formulas.electrical.sections import SectionPlan
from app.formulas.electrical.tt_final_gate import assert_electrical_tt_ready


def _plan(**overrides) -> SectionPlan:
    base = SectionPlan(
        section_count=3,
        section_length_m=67.0,
        l_max_m=67.0,
        l_tok_m=100.0,
        l_ogr_m=67.0,
        l_required_m=200.0,
        l_fact_m=201.0,
        i_dop_a=13.065,
        i_st_ud_a_per_m=0.195,
        start_current_a=39.195,
        working_current_a=26.7,
        start_current_per_section_a=13.065,
        working_current_per_section_a=8.9,
        power_per_section_w=2050.0,
        total_power_w=6150.0,
        l_excess_m=1.0,
        order_cable_length_m=221.1,
        catalog_source="test",
        catalog_version="v1",
        voltage_v=230.0,
        cold_start_temp_c=-20.0,
    )
    return replace(base, **overrides) if overrides else base


def _sections(
    count: int = 3,
    length: float = 67.0,
    *,
    voltage: float = 230.0,
) -> list[dict]:
    return [
        {
            "index": i + 1,
            "length_m": length,
            "voltage_v": voltage,
            "power_w": 2050.0,
            "working_current_a": 8.9,
            "start_current_a": 13.065,
        }
        for i in range(count)
    ]


def _catalogs() -> dict:
    return {
        "power": {"version": "p1", "payload_checksum": "sha256:aaa"},
        "section": {"version": "s1", "source_checksum": "sha256:bbb"},
        "bom": {"version": "b1", "payload_checksum": "sha256:ccc"},
    }


@pytest.mark.parametrize("voltage", [230, 380])
def test_ready_gate_passes_for_valid_plan_at_any_positive_voltage(voltage: int):
    assert_electrical_tt_ready(
        cable_mark="30ТТВ2-СР",
        series="ТТВ",
        threads=1,
        voltage_v=voltage,
        required_power_per_meter_w=22.0,
        installed_power_per_meter_w=30.59,
        plan=_plan(voltage_v=float(voltage)),
        sections=_sections(voltage=float(voltage)),
        catalogs=_catalogs(),
    )


def test_ready_gate_fails_when_installed_power_below_required():
    with pytest.raises(ElectricalFormulaError) as exc:
        assert_electrical_tt_ready(
            cable_mark="30ТТВ2-СР",
            series="ТТВ",
            threads=1,
            voltage_v=230,
            required_power_per_meter_w=40.0,
            installed_power_per_meter_w=30.59,
            plan=_plan(),
            sections=_sections(),
            catalogs=_catalogs(),
        )
    assert exc.value.code == "ELECTRICAL_FINAL_GATE_FAILED"
    assert exc.value.details["check"] == "installed_power_ge_required"


def test_ready_gate_fails_when_l_fact_below_required():
    with pytest.raises(ElectricalFormulaError) as exc:
        assert_electrical_tt_ready(
            cable_mark="30ТТВ2-СР",
            series="ТТВ",
            threads=1,
            voltage_v=230,
            required_power_per_meter_w=20.0,
            installed_power_per_meter_w=30.0,
            plan=_plan(l_fact_m=199.0, l_required_m=200.0),
            sections=_sections(),
            catalogs=_catalogs(),
        )
    assert exc.value.details["check"] == "l_fact_ge_l_req"


def test_ready_gate_fails_unequal_sections():
    with pytest.raises(ElectricalFormulaError) as exc:
        assert_electrical_tt_ready(
            cable_mark="30ТТВ2-СР",
            series="ТТВ",
            threads=1,
            voltage_v=230,
            required_power_per_meter_w=20.0,
            installed_power_per_meter_w=30.0,
            plan=_plan(),
            sections=[*_sections(count=2), *_sections(count=1, length=66.0)],
            catalogs=_catalogs(),
        )
    assert exc.value.details["check"] == "equal_sections"


@pytest.mark.parametrize(
    "field,value",
    [
        ("voltage_v", 380.0),
        ("power_w", 2000.0),
        ("working_current_a", 9.0),
        ("start_current_a", 13.5),
    ],
)
def test_ready_gate_fails_when_section_calculation_differs_from_plan(
    field: str,
    value: float,
):
    sections = _sections()
    sections[1][field] = value

    with pytest.raises(ElectricalFormulaError) as exc:
        assert_electrical_tt_ready(
            cable_mark="30ТТВ2-СР",
            series="ТТВ",
            threads=1,
            voltage_v=230,
            required_power_per_meter_w=20.0,
            installed_power_per_meter_w=30.0,
            plan=_plan(),
            sections=sections,
            catalogs=_catalogs(),
        )

    assert exc.value.details["check"] == "equal_sections"
    assert exc.value.details["left"]["field"] == field


def test_ready_gate_fails_when_plan_voltage_differs_from_input() -> None:
    with pytest.raises(ElectricalFormulaError) as exc:
        assert_electrical_tt_ready(
            cable_mark="30ТТВ2-СР",
            series="ТТВ",
            threads=1,
            voltage_v=380,
            required_power_per_meter_w=20.0,
            installed_power_per_meter_w=30.0,
            plan=_plan(voltage_v=230),
            sections=_sections(voltage=380),
            catalogs=_catalogs(),
        )

    assert exc.value.details["check"] == "plan_voltage_match"


def test_ready_gate_fails_non_positive_voltage_or_bad_threads():
    with pytest.raises(ElectricalFormulaError) as exc_v:
        assert_electrical_tt_ready(
            cable_mark="30ТТВ2-СР",
            series="ТТВ",
            threads=1,
            voltage_v=0,
            required_power_per_meter_w=20.0,
            installed_power_per_meter_w=30.0,
            plan=_plan(),
            sections=_sections(),
            catalogs=_catalogs(),
        )
    assert exc_v.value.details["check"] == "nominal_voltage_v"

    with pytest.raises(ElectricalFormulaError) as exc_t:
        assert_electrical_tt_ready(
            cable_mark="30ТТВ2-СР",
            series="ТТВ",
            threads=4,
            voltage_v=230,
            required_power_per_meter_w=20.0,
            installed_power_per_meter_w=30.0,
            plan=_plan(),
            sections=_sections(),
            catalogs=_catalogs(),
        )
    assert exc_t.value.details["check"] == "threads"


def test_ready_gate_passes_boundary_equal_power_and_length():
    """Pуст == Pтреб and Lфакт == Lтреб are accepted."""
    assert_electrical_tt_ready(
        cable_mark="30ТТВ2-СР",
        series="ТТВ",
        threads=2,
        voltage_v=230,
        required_power_per_meter_w=30.0,
        installed_power_per_meter_w=30.0,
        plan=_plan(l_fact_m=200.0, l_required_m=200.0, l_excess_m=0.0),
        sections=_sections(count=3, length=67.0),
        catalogs=_catalogs(),
    )


def test_final_gate_adapter_owns_no_alternate_physical_validation(monkeypatch):
    calls = 0
    original = final_gate_adapter.validate_final_physical_gate

    def spy(*args, **kwargs):
        nonlocal calls
        calls += 1
        return original(*args, **kwargs)

    monkeypatch.setattr(final_gate_adapter, "validate_final_physical_gate", spy)

    assert_electrical_tt_ready(
        cable_mark="30ТТВ2-СР",
        series="ТТВ",
        threads=1,
        voltage_v=230,
        required_power_per_meter_w=22.0,
        installed_power_per_meter_w=30.59,
        plan=_plan(),
        sections=_sections(),
        catalogs=_catalogs(),
    )

    assert calls == 1
