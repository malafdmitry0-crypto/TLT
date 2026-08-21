"""Boundary-level engineering checks for the electrical TT kernel.

These examples deliberately state physical invariants (rather than mutation
implementation details): catalogue lookup must choose the nearest colder row,
planning is constrained by the start current, and final acceptance has exact
tolerances for every projected equal-section value.
"""

from dataclasses import replace
from decimal import Decimal

import pytest
from heatcalc_electrical_core import SectionCatalogRow
from heatcalc_electrical_core.decimal_math import round_down, round_result, round_up
from heatcalc_electrical_core.errors import TTFormulaDomainError
from heatcalc_electrical_core.final_gate import validate_final_physical_gate
from heatcalc_electrical_core.geometry import (
    compute_tank_cable_length,
    compute_winding_factor,
    max_winding_factor,
)
from heatcalc_electrical_core.sections import (
    EqualSection,
    SectionPlan,
    compute_section_plan,
    lookup_section_row,
)
from heatcalc_electrical_core.validation import TTFormulaReport


def _raises_code(callable_: object, code: str) -> None:
    with pytest.raises(TTFormulaDomainError) as failure:
        callable_()  # type: ignore[operator]
    assert failure.value.code == code


@pytest.mark.parametrize(
    ("diameter", "expected"),
    [
        ("56.999", "1"),
        ("57", "1.1"),
        ("57.001", "1.2"),
        ("75", "1.2"),
        ("75.001", "1.3"),
        ("89", "1.3"),
        ("89.001", "1.4"),
        ("108", "1.4"),
        ("108.001", "1.5"),
    ],
)
def test_winding_factor_limit_table_has_closed_and_open_boundaries(
    diameter: str, expected: str
) -> None:
    assert max_winding_factor(Decimal(diameter)) == Decimal(expected)


@pytest.mark.parametrize("diameter", ["0", "-0.001"])
def test_winding_requires_positive_outer_diameter_even_without_pitch(diameter: str) -> None:
    _raises_code(
        lambda: compute_winding_factor(outer_diameter_mm=Decimal(diameter), winding_pitch_mm=None),
        "ELECTRICAL_WINDING_PITCH_INVALID",
    )


@pytest.mark.parametrize("pitch", ["57", "56.999", "0", "-1"])
def test_winding_pitch_must_be_strictly_larger_than_diameter(pitch: str) -> None:
    _raises_code(
        lambda: compute_winding_factor(
            outer_diameter_mm=Decimal("57"), winding_pitch_mm=Decimal(pitch)
        ),
        "ELECTRICAL_WINDING_PITCH_INVALID",
    )


def test_winding_factor_uses_decimal_pi_formula_and_six_place_rounding() -> None:
    assert compute_winding_factor(
        outer_diameter_mm=Decimal("57"), winding_pitch_mm=Decimal("1000")
    ) == Decimal("1.015907")
    assert compute_winding_factor(
        outer_diameter_mm=Decimal("108"), winding_pitch_mm=None
    ) == Decimal("1")


def test_winding_factor_rejects_a_physically_too_tight_valid_pitch() -> None:
    with pytest.raises(TTFormulaDomainError) as failure:
        compute_winding_factor(outer_diameter_mm=Decimal("57"), winding_pitch_mm=Decimal("58"))
    assert failure.value.code == "ELECTRICAL_WINDING_FACTOR_LIMIT_EXCEEDED"
    assert failure.value.details["maximum"] == Decimal("1.1")


@pytest.mark.parametrize(
    ("shape", "kwargs", "expected"),
    [
        (
            "cylindrical",
            {
                "diameter": Decimal("2"),
                "heating_height": Decimal("3"),
                "laying_step": Decimal("0.2"),
            },
            Decimal("47.12388980384689857693965076"),
        ),
        (
            "rectangular",
            {
                "length": Decimal("4"),
                "width": Decimal("3"),
                "heating_height": Decimal("2"),
                "laying_step": Decimal("0.2"),
            },
            Decimal("70"),
        ),
    ],
)
def test_tank_cable_length_uses_shape_specific_perimeter(
    shape: str, kwargs: dict[str, Decimal], expected: Decimal
) -> None:
    assert compute_tank_cable_length(shape=shape, **kwargs) == expected


@pytest.mark.parametrize("step", ["0.1", "0.4"])
def test_tank_step_includes_both_normative_endpoints(step: str) -> None:
    assert (
        compute_tank_cable_length(
            shape="rectangular",
            length=Decimal("1"),
            width=Decimal("1"),
            heating_height=Decimal("1"),
            laying_step=Decimal(step),
        )
        > 0
    )


@pytest.mark.parametrize(
    ("shape", "kwargs"),
    [
        ("cylindrical", {"diameter": Decimal("0")}),
        ("cylindrical", {"diameter": Decimal("-1")}),
        ("cylindrical", {"diameter": Decimal("NaN")}),
        ("cylindrical", {}),
        ("rectangular", {"length": Decimal("0"), "width": Decimal("1")}),
        ("rectangular", {"length": Decimal("1"), "width": Decimal("-1")}),
        ("rectangular", {"length": Decimal("1"), "width": Decimal("NaN")}),
        ("rectangular", {"length": Decimal("1")}),
        ("other", {}),
    ],
)
def test_tank_shape_requires_all_finite_positive_dimensions(
    shape: str, kwargs: dict[str, Decimal]
) -> None:
    _raises_code(
        lambda: compute_tank_cable_length(
            shape=shape,
            heating_height=Decimal("1"),
            laying_step=Decimal("0.2"),
            **kwargs,
        ),
        "ELECTRICAL_TANK_LAYOUT_INVALID",
    )


@pytest.mark.parametrize(
    ("height", "step"),
    [
        ("0", "0.2"),
        ("-1", "0.2"),
        ("NaN", "0.2"),
        ("Infinity", "0.2"),
        ("1", "0.099"),
        ("1", "0.401"),
        ("1", "NaN"),
        ("1", "Infinity"),
    ],
)
def test_tank_height_and_step_have_independent_strict_validation(height: str, step: str) -> None:
    _raises_code(
        lambda: compute_tank_cable_length(
            shape="cylindrical",
            diameter=Decimal("1"),
            heating_height=Decimal(height),
            laying_step=Decimal(step),
        ),
        "ELECTRICAL_TANK_LAYOUT_INVALID",
    )


def _section_row(
    temperature: str,
    *,
    l_max: str | None = "10",
    current_per_m: str | None = "1",
    voltage: str | None = "230",
    eligible: bool = True,
) -> SectionCatalogRow:
    return SectionCatalogRow(
        " ТТН 20 ",
        Decimal(temperature),
        Decimal(l_max) if l_max is not None else None,
        Decimal(current_per_m) if current_per_m is not None else None,
        Decimal(voltage) if voltage is not None else None,
        planning_eligible=eligible,
    )


def test_section_lookup_selects_nearest_colder_row_including_exact_temperature() -> None:
    rows = (_section_row("-30"), _section_row("-20"), _section_row("-10"))
    assert (
        lookup_section_row(
            mark="ттн 20-СТ", cold_start_temperature=Decimal("-20"), catalog_rows=rows
        )
        == rows[1]
    )
    assert (
        lookup_section_row(
            mark="ТТН20-СР", cold_start_temperature=Decimal("-19.999"), catalog_rows=rows
        )
        == rows[1]
    )
    assert (
        lookup_section_row(mark="ТТН20", cold_start_temperature=Decimal("-30"), catalog_rows=rows)
        == rows[0]
    )
    assert (
        lookup_section_row(
            mark="ТТН20", cold_start_temperature=Decimal("-30.001"), catalog_rows=rows
        )
        is None
    )


@pytest.mark.parametrize(
    "bad_row",
    [
        _section_row("-10", eligible=False),
        _section_row("-10", l_max=None),
        _section_row("-10", current_per_m=None),
        _section_row("-10", voltage=None),
        _section_row("-10", l_max="0"),
        _section_row("-10", current_per_m="0"),
        _section_row("-10", voltage="0"),
    ],
)
def test_section_lookup_skips_invalid_nearer_rows_in_favour_of_valid_colder_row(
    bad_row: SectionCatalogRow,
) -> None:
    valid_colder = _section_row("-20")
    assert (
        lookup_section_row(
            mark="ТТН20", cold_start_temperature=Decimal("0"), catalog_rows=(valid_colder, bad_row)
        )
        == valid_colder
    )


@pytest.mark.parametrize("bad", ["installed", "power", "voltage"])
def test_section_plan_requires_positive_input_quantities(bad: str) -> None:
    values = {
        "installed_cable_length_m": Decimal("5"),
        "power_per_meter_w": Decimal("10"),
        "voltage_v": Decimal("230"),
    }
    values[
        {
            "installed": "installed_cable_length_m",
            "power": "power_per_meter_w",
            "voltage": "voltage_v",
        }[bad]
    ] = Decimal("0")
    _raises_code(
        lambda: compute_section_plan(
            mark="ТТН20",
            cold_start_temperature=Decimal("-20"),
            catalog_rows=(_section_row("-20"),),
            max_start_current_per_section_a=None,
            max_start_current_source="automatic",
            **values,
        ),
        "ELECTRICAL_SECTION_PLAN_INVALID",
    )


def test_section_plan_rejects_missing_catalog_and_nonpositive_manual_limit() -> None:
    _raises_code(
        lambda: compute_section_plan(
            mark="absent",
            installed_cable_length_m=Decimal("1"),
            power_per_meter_w=Decimal("1"),
            voltage_v=Decimal("230"),
            cold_start_temperature=Decimal("-20"),
            catalog_rows=(_section_row("-20"),),
            max_start_current_per_section_a=None,
            max_start_current_source="automatic",
        ),
        "ELECTRICAL_SECTION_CATALOG_ROW_NOT_FOUND",
    )
    _raises_code(
        lambda: compute_section_plan(
            mark="ТТН20",
            installed_cable_length_m=Decimal("1"),
            power_per_meter_w=Decimal("1"),
            voltage_v=Decimal("230"),
            cold_start_temperature=Decimal("-20"),
            catalog_rows=(_section_row("-20"),),
            max_start_current_per_section_a=Decimal("0"),
            max_start_current_source="project",
        ),
        "SECTION_CURRENT_LIMIT_REQUIRED",
    )


def test_section_plan_rounds_down_allowable_length_then_rounds_all_projections() -> None:
    plan = compute_section_plan(
        mark="ТТН20",
        installed_cable_length_m=Decimal("18.003"),
        power_per_meter_w=Decimal("10.1234"),
        voltage_v=Decimal("230"),
        cold_start_temperature=Decimal("-20"),
        catalog_rows=(_section_row("-20", l_max="10", current_per_m="1"),),
        max_start_current_per_section_a=Decimal("9.0014"),
        max_start_current_source="project_limit",
    )
    assert (
        plan.section_count,
        plan.section_length_m,
        plan.l_tok_m,
        plan.l_fact_m,
        plan.l_excess_m,
        plan.order_cable_length_m,
        plan.i_dop_a,
        plan.start_current_per_section_a,
        plan.power_per_section_w,
        plan.working_current_per_section_a,
        plan.total_power_w,
        plan.working_current_a,
        plan.i_dop_source,
    ) == (
        3,
        Decimal("9.001"),
        Decimal("9.001"),
        Decimal("27.003"),
        Decimal("9.000"),
        Decimal("29.704"),
        Decimal("9.001"),
        Decimal("9.001"),
        Decimal("91.121"),
        Decimal("0.396"),
        Decimal("273.362"),
        Decimal("1.189"),
        "project_limit",
    )


def test_section_plan_derives_limit_from_catalog_and_ceilings_section_count() -> None:
    row = _section_row("-20", l_max="10", current_per_m="0.3")
    exact = compute_section_plan(
        mark="ТТН20",
        installed_cable_length_m=Decimal("10"),
        power_per_meter_w=Decimal("10"),
        voltage_v=Decimal("230"),
        cold_start_temperature=Decimal("-20"),
        catalog_rows=(row,),
        max_start_current_per_section_a=None,
        max_start_current_source="ignored",
    )
    longer = compute_section_plan(
        mark="ТТН20",
        installed_cable_length_m=Decimal("10.001"),
        power_per_meter_w=Decimal("10"),
        voltage_v=Decimal("230"),
        cold_start_temperature=Decimal("-20"),
        catalog_rows=(row,),
        max_start_current_per_section_a=None,
        max_start_current_source="ignored",
    )
    assert (exact.section_count, longer.section_count) == (1, 2)
    assert (exact.i_dop_a, exact.l_tok_m, exact.i_dop_source) == (
        Decimal("3.000"),
        Decimal("10.000"),
        "section_catalog_derived",
    )


def test_section_plan_rejects_limit_that_rounds_down_to_zero_length() -> None:
    _raises_code(
        lambda: compute_section_plan(
            mark="ТТН20",
            installed_cable_length_m=Decimal("1"),
            power_per_meter_w=Decimal("1"),
            voltage_v=Decimal("230"),
            cold_start_temperature=Decimal("-20"),
            catalog_rows=(_section_row("-20"),),
            max_start_current_per_section_a=Decimal("0.0009"),
            max_start_current_source="project",
        ),
        "ELECTRICAL_SECTION_PLAN_INVALID",
    )


def _valid_plan() -> SectionPlan:
    return SectionPlan(
        section_count=2,
        section_length_m=Decimal("50"),
        l_max_m=Decimal("50"),
        l_tok_m=Decimal("50"),
        l_ogr_m=Decimal("50"),
        l_required_m=Decimal("80"),
        l_fact_m=Decimal("100"),
        i_dop_a=Decimal("10"),
        i_st_ud_a_per_m=Decimal("0.2"),
        start_current_a=Decimal("20"),
        working_current_a=Decimal("10"),
        start_current_per_section_a=Decimal("10"),
        working_current_per_section_a=Decimal("5"),
        power_per_section_w=Decimal("100"),
        total_power_w=Decimal("200"),
        l_excess_m=Decimal("20"),
        order_cable_length_m=Decimal("110"),
        voltage_v=Decimal("230"),
        cold_start_temperature=Decimal("-20"),
        i_dop_source="project",
    )


def _gate(
    *,
    plan: SectionPlan | None = None,
    sections: tuple[EqualSection, ...] | None = None,
    **overrides: object,
) -> TTFormulaReport:
    values: dict[str, object] = {
        "cable_mark": "ТТН20",
        "series": "ТТН",
        "threads": 1,
        "voltage_v": Decimal("230"),
        "required_power_per_meter_w": Decimal("10"),
        "installed_power_per_meter_w": Decimal("10"),
        "plan": _valid_plan() if plan is None else plan,
        "sections": (
            EqualSection(
                Decimal("50"), Decimal("230"), Decimal("100"), Decimal("5"), Decimal("10")
            ),
            EqualSection(
                Decimal("50"), Decimal("230"), Decimal("100"), Decimal("5"), Decimal("10")
            ),
        )
        if sections is None
        else sections,
    }
    values.update(overrides)
    return validate_final_physical_gate(**values)  # type: ignore[arg-type]


def test_final_gate_accepts_valid_plan_and_values_at_every_tolerance() -> None:
    plan = _valid_plan()
    sections = (
        EqualSection(
            Decimal("50.001"),
            Decimal("230.001"),
            Decimal("100.01"),
            Decimal("5.001"),
            Decimal("10.002"),
        ),
        EqualSection(
            Decimal("50"), Decimal("229.999"), Decimal("99.99"), Decimal("4.999"), Decimal("10")
        ),
    )
    report = _gate(
        plan=replace(
            plan,
            voltage_v=Decimal("230.001"),
            section_length_m=Decimal("50.0005"),
            start_current_per_section_a=Decimal("10.001"),
            l_fact_m=Decimal("79.9995"),
        ),
        sections=sections,
        installed_power_per_meter_w=Decimal("9.99"),
    )
    assert report.is_valid


@pytest.mark.parametrize(
    ("overrides", "plan", "sections", "check"),
    [
        ({"cable_mark": "  "}, None, None, "cable_mark"),
        ({"series": "  "}, None, None, "series"),
        ({"voltage_v": Decimal("0")}, None, None, "nominal_voltage_v"),
        ({"threads": 0}, None, None, "threads"),
        ({"threads": 4}, None, None, "threads"),
        ({}, replace(_valid_plan(), voltage_v=Decimal("230.0011")), None, "plan_voltage_match"),
        ({}, replace(_valid_plan(), section_count=0), None, "section_count"),
        ({}, replace(_valid_plan(), section_length_m=Decimal("0")), None, "section_length"),
        (
            {},
            replace(_valid_plan(), section_length_m=Decimal("50.000501")),
            None,
            "section_length_le_l_max",
        ),
        (
            {},
            replace(_valid_plan(), start_current_per_section_a=Decimal("10.0011")),
            None,
            "start_current_le_idop",
        ),
        ({}, replace(_valid_plan(), l_fact_m=Decimal("79.999499")), None, "l_fact_ge_l_req"),
        (
            {},
            None,
            (
                EqualSection(
                    Decimal("50"), Decimal("230"), Decimal("100"), Decimal("5"), Decimal("10")
                ),
            ),
            "sections_count_match",
        ),
        ({"required_power_per_meter_w": Decimal("0")}, None, None, "required_power"),
        (
            {"installed_power_per_meter_w": Decimal("9.989")},
            None,
            None,
            "installed_power_ge_required",
        ),
    ],
)
def test_final_gate_rejects_each_scalar_physical_invariant(
    overrides: dict[str, object],
    plan: SectionPlan | None,
    sections: tuple[EqualSection, ...] | None,
    check: str,
) -> None:
    report = _gate(plan=plan, sections=sections, **overrides)
    assert not report.is_valid
    assert report.issues[0].details["check"] == check


@pytest.mark.parametrize(
    ("field", "actual"),
    [
        ("length_m", Decimal("50.000501")),
        ("voltage_v", Decimal("230.0011")),
        ("power_w", Decimal("100.0101")),
        ("working_current_a", Decimal("5.0011")),
        ("start_current_a", Decimal("10.0011")),
    ],
)
def test_final_gate_rejects_each_equal_section_field_above_its_tolerance(
    field: str, actual: Decimal
) -> None:
    expected = EqualSection(
        Decimal("50"), Decimal("230"), Decimal("100"), Decimal("5"), Decimal("10")
    )
    broken = replace(expected, **{field: actual})
    report = _gate(sections=(broken, expected))
    assert report.issues[0].details == {
        "check": "equal_sections",
        "index": 1,
        "field": field,
        "left": actual,
        "right": getattr(expected, field),
    }


@pytest.mark.parametrize(
    ("value", "expected_result", "expected_down", "expected_up"),
    [
        ("1.2345", "1.235", "1.234", "1.235"),
        ("-1.2345", "-1.235", "-1.234", "-1.235"),
        ("1.2340", "1.234", "1.234", "1.234"),
    ],
)
def test_rounding_modes_are_distinct_for_positive_negative_and_exact_values(
    value: str, expected_result: str, expected_down: str, expected_up: str
) -> None:
    number = Decimal(value)
    assert round_result(number) == Decimal(expected_result)
    assert round_down(number) == Decimal(expected_down)
    assert round_up(number) == Decimal(expected_up)
