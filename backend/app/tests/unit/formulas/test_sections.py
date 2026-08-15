"""Focused goldens for fail-closed equal-section calculation."""

import pytest

from app.electrical_domain import ElectricalFormulaError
from app.formulas.electrical.sections import (
    SectionCatalogRow,
    clear_section_catalog_cache,
    compute_section_plan,
    lookup_section_row,
    section_catalog_registered,
    section_plan_to_result_fields,
)


def setup_function() -> None:
    clear_section_catalog_cache()


def test_catalog_registered_after_seeds():
    assert section_catalog_registered() is True


def test_lookup_exact_and_nearest_lower_temperature(monkeypatch):
    rows = [
        SectionCatalogRow("25ТТН2", 220, temp, 100, None, 0.2)
        for temp in (-20, -10)
    ]
    monkeypatch.setattr("app.formulas.electrical.sections._parse_rows", lambda: rows)
    assert lookup_section_row(mark="25ТТН2-СТ", cold_start_temp_c=-10).cold_start_temp_c == -10
    assert lookup_section_row(mark="25ТТН2", cold_start_temp_c=-17).cold_start_temp_c == -20


def test_lookup_never_falls_back_to_warmer_row(monkeypatch):
    rows = [SectionCatalogRow("25ТТН2", 220, -10, 100, None, 0.2)]
    monkeypatch.setattr("app.formulas.electrical.sections._parse_rows", lambda: rows)
    assert lookup_section_row(mark="25ТТН2", cold_start_temp_c=-20) is None


def test_missing_current_limit_is_derived_from_nearest_colder_catalog_row(monkeypatch):
    rows = [
        SectionCatalogRow("25ТТН2", 230, -10, 118, None, 0.246),
        SectionCatalogRow("25ТТН2", 230, -20, 112, None, 0.259),
    ]
    monkeypatch.setattr("app.formulas.electrical.sections._parse_rows", lambda: rows)

    plan = compute_section_plan(
        mark="25ТТН2-СТ",
        installed_cable_length_m=200,
        power_per_meter_w=25,
        voltage_v=230,
        cold_start_temp_c=-17,
    )

    assert plan.cold_start_temp_c == -20
    assert plan.i_dop_a == 29.008
    assert plan.i_dop_source == "section_catalog_derived"
    assert plan.l_tok_m == 112
    assert plan.l_ogr_m == 112
    assert plan.start_current_per_section_a == 29.008
    assert plan.start_current_per_section_a <= plan.i_dop_a


def test_manual_current_limit_precedes_catalog_derived_limit(monkeypatch):
    row = SectionCatalogRow("25ТТН2", 230, -20, 112, None, 0.259)
    monkeypatch.setattr("app.formulas.electrical.sections._parse_rows", lambda: [row])

    plan = compute_section_plan(
        mark="25ТТН2-СТ",
        installed_cable_length_m=200,
        power_per_meter_w=25,
        voltage_v=230,
        cold_start_temp_c=-20,
        max_start_current_per_section_a=13.065,
        max_start_current_source="project_setting",
    )

    assert plan.i_dop_a == 13.065
    assert plan.i_dop_source == "project_setting"
    assert plan.l_tok_m == 50.444
    assert plan.l_ogr_m == 50.444
    assert plan.start_current_per_section_a == 13.065


def test_non_positive_current_limit_is_fail_closed():
    params = dict(
        mark="25ТТН2-СТ",
        installed_cable_length_m=200,
        power_per_meter_w=25,
        voltage_v=230,
        cold_start_temp_c=-20,
    )
    with pytest.raises(ElectricalFormulaError) as exc:
        compute_section_plan(**params, max_start_current_per_section_a=0)
    assert exc.value.code == "SECTION_CURRENT_LIMIT_REQUIRED"


def test_equal_sections_and_totals_are_recalculated_from_l_fact(monkeypatch):
    row = SectionCatalogRow("25ТТН2", 220, -20, 100, None, 1)
    monkeypatch.setattr("app.formulas.electrical.sections._parse_rows", lambda: [row])
    plan = compute_section_plan(
        mark="25ТТН2-СТ",
        installed_cable_length_m=200,
        power_per_meter_w=25,
        voltage_v=230,
        cold_start_temp_c=-20,
        max_start_current_per_section_a=67,
    )
    assert plan.section_count == 3
    assert plan.section_length_m == 67
    assert plan.l_fact_m == 201
    assert plan.l_excess_m == 1
    assert plan.total_power_w == 5025
    assert plan.working_current_a == pytest.approx(5025 / 230, abs=0.001)
    assert plan.start_current_a == 201
    assert plan.order_cable_length_m == 221.1
    section_items = section_plan_to_result_fields(plan)["sections"]
    assert {item["length_m"] for item in section_items} == {67}
    assert {item["voltage_v"] for item in section_items} == {230}


def test_short_object_still_gets_one_full_equal_section(monkeypatch):
    row = SectionCatalogRow("25ТТН2", 220, -20, 100, None, 1)
    monkeypatch.setattr("app.formulas.electrical.sections._parse_rows", lambda: [row])
    plan = compute_section_plan(
        mark="25ТТН2",
        installed_cable_length_m=10,
        power_per_meter_w=25,
        voltage_v=230,
        cold_start_temp_c=-20,
        max_start_current_per_section_a=67,
    )
    assert (plan.section_count, plan.section_length_m, plan.l_fact_m, plan.l_excess_m) == (1, 67, 67, 57)


def test_l_ogr_is_rounded_down_not_half_up(monkeypatch):
    row = SectionCatalogRow("25ТТН2", 220, -20, 100, None, 1)
    monkeypatch.setattr("app.formulas.electrical.sections._parse_rows", lambda: [row])
    plan = compute_section_plan(
        mark="25ТТН2",
        installed_cable_length_m=10,
        power_per_meter_w=25,
        voltage_v=230,
        cold_start_temp_c=-20,
        max_start_current_per_section_a=67.1239,
    )
    assert plan.l_ogr_m == 67.123


def test_section_plan_uses_positive_request_voltage_for_working_current(monkeypatch):
    row = SectionCatalogRow("25ТТН2", 230, -20, 100, None, 1)
    monkeypatch.setattr("app.formulas.electrical.sections._parse_rows", lambda: [row])

    at_230 = compute_section_plan(
        mark="25ТТН2",
        installed_cable_length_m=10,
        power_per_meter_w=25,
        voltage_v=230,
        cold_start_temp_c=-20,
        max_start_current_per_section_a=10,
    )
    at_380 = compute_section_plan(
        mark="25ТТН2",
        installed_cable_length_m=10,
        power_per_meter_w=25,
        voltage_v=380,
        cold_start_temp_c=-20,
        max_start_current_per_section_a=10,
    )

    assert at_230.total_power_w == at_380.total_power_w
    assert at_230.working_current_a == pytest.approx(at_230.total_power_w / 230, abs=0.001)
    assert at_380.working_current_a == pytest.approx(at_380.total_power_w / 380, abs=0.001)
