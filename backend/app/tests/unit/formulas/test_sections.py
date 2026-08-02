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
    assert lookup_section_row(mark="25ТТН2-СТ", voltage_v=230, cold_start_temp_c=-10).cold_start_temp_c == -10
    assert lookup_section_row(mark="25ТТН2", voltage_v=230, cold_start_temp_c=-17).cold_start_temp_c == -20


def test_lookup_never_falls_back_to_warmer_row(monkeypatch):
    rows = [SectionCatalogRow("25ТТН2", 220, -10, 100, None, 0.2)]
    monkeypatch.setattr("app.formulas.electrical.sections._parse_rows", lambda: rows)
    assert lookup_section_row(mark="25ТТН2", voltage_v=230, cold_start_temp_c=-20) is None


def test_missing_current_limit_is_fail_closed():
    with pytest.raises(ElectricalFormulaError) as exc:
        compute_section_plan(
            mark="25ТТН2-СТ",
            installed_cable_length_m=200,
            power_per_meter_w=25,
            cold_start_temp_c=-20,
        )
    assert exc.value.code == "SECTION_CURRENT_LIMIT_REQUIRED"


def test_non_positive_current_limit_is_fail_closed():
    params = dict(
        mark="25ТТН2-СТ",
        installed_cable_length_m=200,
        power_per_meter_w=25,
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
    assert {item["length_m"] for item in section_plan_to_result_fields(plan)["sections"]} == {67}


def test_short_object_still_gets_one_full_equal_section(monkeypatch):
    row = SectionCatalogRow("25ТТН2", 220, -20, 100, None, 1)
    monkeypatch.setattr("app.formulas.electrical.sections._parse_rows", lambda: [row])
    plan = compute_section_plan(
        mark="25ТТН2",
        installed_cable_length_m=10,
        power_per_meter_w=25,
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
        cold_start_temp_c=-20,
        max_start_current_per_section_a=67.1239,
    )
    assert plan.l_ogr_m == 67.123


def test_section_plan_requires_230_v():
    with pytest.raises(ElectricalFormulaError) as exc:
        compute_section_plan(
            mark="25ТТН2",
            installed_cable_length_m=10,
            power_per_meter_w=25,
            voltage_v=220,
            max_start_current_per_section_a=10,
        )
    assert exc.value.code == "ELECTRICAL_NOMINAL_VOLTAGE_UNSUPPORTED"
