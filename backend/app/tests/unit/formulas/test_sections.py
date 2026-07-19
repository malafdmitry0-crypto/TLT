"""Unit tests for heating section algorithm (PDF §6.14 / SEEDS-01)."""

from app.formulas.electrical.sections import (
    clear_section_catalog_cache,
    compute_section_plan,
    section_catalog_registered,
)


def setup_function() -> None:
    clear_section_catalog_cache()


def test_catalog_registered_after_seeds():
    assert section_catalog_registered() is True


def test_section_plan_ceil_equal_sections():
    # Lreq=200, Logr ~ min(140, 20/0.15)=min(140,133.33)=133 → floor 133
    # N = ceil(200/133) = 2, Lfact = 266
    plan = compute_section_plan(
        mark="ТЛТ-25",
        installed_cable_length_m=200.0,
        power_per_meter_w=25.0,
        working_current_total_a=10.0,
        voltage_v=220.0,
        cold_start_temp_c=-20.0,
    )
    assert plan is not None
    assert plan.section_count >= 2
    assert plan.section_length_m == plan.l_ogr_m
    assert plan.l_fact_m + 1e-9 >= 200.0
    assert abs(plan.section_length_m * plan.section_count - plan.l_fact_m) < 1e-6


def test_section_plan_pdf_style_example():
    # Synthetic: Lmax=67, Ltok large → Logr=67, Lreq=200 → N=3, Lfact=201
    plan = compute_section_plan(
        mark="ТЛТ-75",
        installed_cable_length_m=200.0,
        power_per_meter_w=75.0,
        working_current_total_a=20.0,
        voltage_v=220.0,
        cold_start_temp_c=-20.0,
    )
    assert plan is not None
    assert plan.section_count >= 1
    assert plan.start_current_a > 0


def test_tt_order_mark_falls_back_to_tlt_power_band_without_new_lmax():
    """TT order marks reuse existing ТЛТ-{power} catalog rows (no invented numbers)."""
    plan = compute_section_plan(
        mark="25ТТН2-СТ",
        installed_cable_length_m=100.0,
        power_per_meter_w=25.0,
        working_current_total_a=5.0,
        voltage_v=220.0,
        cold_start_temp_c=-20.0,
    )
    assert plan is not None
    assert plan.section_count >= 1
