"""Unit tests for §9.15 TT final ready gate (E4)."""

from __future__ import annotations

from dataclasses import replace

import pytest

from app.electrical_domain import ElectricalFormulaError
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


def _sections(count: int = 3, length: float = 67.0) -> list[dict]:
    return [{"index": i + 1, "length_m": length} for i in range(count)]


def _catalogs() -> dict:
    return {
        "power": {"version": "p1", "payload_checksum": "sha256:aaa"},
        "section": {"version": "s1", "source_checksum": "sha256:bbb"},
        "bom": {"version": "b1", "payload_checksum": "sha256:ccc"},
    }


def test_ready_gate_passes_for_valid_plan():
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
            sections=[
                {"index": 1, "length_m": 67.0},
                {"index": 2, "length_m": 67.0},
                {"index": 3, "length_m": 66.0},
            ],
            catalogs=_catalogs(),
        )
    assert exc.value.details["check"] == "equal_sections"


def test_ready_gate_fails_bad_voltage_or_threads():
    with pytest.raises(ElectricalFormulaError) as exc_v:
        assert_electrical_tt_ready(
            cable_mark="30ТТВ2-СР",
            series="ТТВ",
            threads=1,
            voltage_v=220,
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
