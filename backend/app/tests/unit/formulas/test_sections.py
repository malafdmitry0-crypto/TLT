"""Unit tests for heating sections from ``Параметры Кабеля.xlsx``."""

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
    # 25ТТН2 at -20°C: passport Lmax=112 m.  No breaker Iдоп is supplied,
    # therefore the passport limit is used as-is.
    plan = compute_section_plan(
        mark="25ТТН2-СТ",
        installed_cable_length_m=200.0,
        power_per_meter_w=25.0,
        working_current_total_a=10.0,
        voltage_v=220.0,
        cold_start_temp_c=-20.0,
    )
    assert plan is not None
    assert plan.section_length_m == 112
    assert plan.l_tok_m is None
    assert plan.section_count == 2
    assert plan.section_length_m == plan.l_ogr_m
    assert plan.l_fact_m + 1e-9 >= 200.0
    assert abs(plan.section_length_m * plan.section_count - plan.l_fact_m) < 1e-6


def test_section_plan_pdf_style_example():
    # 75ТТХ2 at -20°C: Lmax=49 m, therefore 200 m requires five equal sections.
    plan = compute_section_plan(
        mark="75ТТХ2-СР",
        installed_cable_length_m=200.0,
        power_per_meter_w=75.0,
        working_current_total_a=20.0,
        voltage_v=220.0,
        cold_start_temp_c=-20.0,
    )
    assert plan is not None
    assert plan.section_count == 5
    assert plan.start_current_a > 0


def test_tt_order_mark_uses_exact_passport_mark():
    """Commercial suffix is removed; no ТТ→ТЛТ fallback exists."""
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


def test_explicit_start_current_limit_can_reduce_passport_length():
    plan = compute_section_plan(
        mark="25ТТН2-СТ",
        installed_cable_length_m=100.0,
        power_per_meter_w=25.0,
        working_current_total_a=5.0,
        voltage_v=220.0,
        cold_start_temp_c=-20.0,
        max_start_current_per_section_a=20.0,
    )

    assert plan is not None
    assert plan.l_max_m == 112
    assert plan.l_tok_m == 77.22
    assert plan.l_ogr_m == 77.22
    assert plan.section_count == 2
