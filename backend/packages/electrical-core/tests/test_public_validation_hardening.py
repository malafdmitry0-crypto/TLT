"""Adversarial checks for the dependency-free public DTO boundary."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import replace
from decimal import Decimal

import pytest
from heatcalc_electrical_core import (
    CatalogBundle,
    PipeLayout,
    TTFormulaIssue,
    TTFormulaReport,
    TTPreparationInput,
    run_tt_formula,
)
from heatcalc_electrical_core.cable_options import list_tt_cable_options

from .test_tt_formula import _catalog, _input


def _issue(data: TTPreparationInput) -> TTFormulaIssue:
    outcome = run_tt_formula(data)
    assert not outcome.is_success
    return outcome.report.issues[0]


@pytest.mark.parametrize(
    ("field", "value", "path"),
    [
        ("required_power_per_meter_w", Decimal("0"), "required_power_per_meter_w"),
        ("required_power_per_meter_w", Decimal("-1"), "required_power_per_meter_w"),
        ("supply_voltage_v", Decimal("0"), "supply_voltage_v"),
        ("supply_voltage_v", Decimal("-1"), "supply_voltage_v"),
    ],
)
def test_required_positive_public_scalars_reject_zero_and_negative_at_boundary(
    field: str, value: Decimal, path: str
) -> None:
    issue = _issue(_input(**{field: value}))

    assert issue.code == "ELECTRICAL_INPUT_OUT_OF_RANGE"
    assert issue.path == (path,)
    assert issue.details["minimum"] == Decimal("0")
    assert issue.details["minimum_exclusive"] is True


@pytest.mark.parametrize("value", [Decimal("0"), Decimal("-1")])
def test_base_length_rejects_zero_and_negative_at_boundary(value: Decimal) -> None:
    issue = _issue(_input(layout=PipeLayout(value)))

    assert issue.code == "ELECTRICAL_INPUT_OUT_OF_RANGE"
    assert issue.path == ("layout", "base_length_m")


@pytest.mark.parametrize("value", [Decimal("NaN"), Decimal("Infinity"), Decimal("-Infinity")])
@pytest.mark.parametrize(
    ("field", "path"),
    [
        ("required_power_per_meter_w", "required_power_per_meter_w"),
        ("product_temperature_c", "product_temperature_c"),
        ("ambient_temperature_c", "ambient_temperature_c"),
        ("supply_voltage_v", "supply_voltage_v"),
        ("safety_factor", "safety_factor"),
        ("cold_start_temperature_c", "cold_start_temperature_c"),
        ("max_start_current_per_section_a", "max_start_current_per_section_a"),
    ],
)
def test_nonfinite_preparation_decimals_are_reports(field: str, path: str, value: Decimal) -> None:
    issue = _issue(_input(**{field: value}))

    assert issue.code == "ELECTRICAL_INPUT_NOT_FINITE"
    assert issue.path == (path,)


@pytest.mark.parametrize("value", [Decimal("NaN"), Decimal("Infinity"), Decimal("-Infinity")])
@pytest.mark.parametrize(
    ("layout", "path"),
    [
        (lambda value: PipeLayout(Decimal("10"), value), ("layout", "outer_diameter_mm")),
        (
            lambda value: PipeLayout(Decimal("10"), Decimal("108"), value),
            ("layout", "winding_pitch_mm"),
        ),
    ],
)
def test_nonfinite_optional_pipe_decimals_are_reports(
    layout: Callable[[Decimal], PipeLayout], path: tuple[str, str], value: Decimal
) -> None:
    issue = _issue(_input(layout=layout(value)))

    assert issue.code == "ELECTRICAL_INPUT_NOT_FINITE"
    assert issue.path == path


@pytest.mark.parametrize("value", [Decimal("NaN"), Decimal("Infinity"), Decimal("-Infinity")])
@pytest.mark.parametrize(
    ("row_type", "field"),
    [
        ("power", "nominal_power"),
        ("power", "max_product_temperature"),
        ("section", "cold_start_temperature"),
        ("section", "l_max_m"),
        ("section", "i_st_ud_a_per_m"),
        ("section", "voltage_v"),
        ("section", "i_dop_a"),
    ],
)
def test_nonfinite_direct_catalog_decimals_are_reports(
    row_type: str, field: str, value: Decimal
) -> None:
    catalog = _catalog()
    if row_type == "power":
        power = catalog.power_rows[0]
        invalid_power = (
            replace(power, nominal_power=value)
            if field == "nominal_power"
            else replace(power, max_product_temperature=value)
        )
        bundle = CatalogBundle(
            (invalid_power, *catalog.power_rows[1:]),
            catalog.section_rows,
            catalog.bom_rows,
        )
        path = ("catalogs", "power_rows", 0, field)
    else:
        section = catalog.section_rows[0]
        invalid_section = {
            "cold_start_temperature": replace(section, cold_start_temperature=value),
            "l_max_m": replace(section, l_max_m=value),
            "i_st_ud_a_per_m": replace(section, i_st_ud_a_per_m=value),
            "voltage_v": replace(section, voltage_v=value),
            "i_dop_a": replace(section, i_dop_a=value),
        }[field]
        bundle = CatalogBundle(
            catalog.power_rows,
            (invalid_section, *catalog.section_rows[1:]),
            catalog.bom_rows,
        )
        path = ("catalogs", "section_rows", 0, field)

    issue = _issue(_input(catalogs=bundle))

    assert issue.code == "ELECTRICAL_INPUT_NOT_FINITE"
    assert issue.path == path


def test_validation_order_and_bool_thread_rejection_are_deterministic() -> None:
    invalid_catalog = CatalogBundle(
        (replace(_catalog().power_rows[0], nominal_power=Decimal("NaN")),), (), ()
    )
    first = _issue(_input(required_power_per_meter_w=Decimal("0"), catalogs=invalid_catalog))
    current_before_geometry = _issue(
        _input(
            max_start_current_per_section_a=Decimal("0"),
            layout=PipeLayout(Decimal("10"), Decimal("0")),
        )
    )
    threads = _issue(_input(number_of_threads=True))

    assert first.path == ("required_power_per_meter_w",)
    assert current_before_geometry.path == ("max_start_current_per_section_a",)
    assert threads.code == "ELECTRICAL_THREAD_COUNT_INVALID"


def test_cable_options_validate_its_public_temperatures_and_typed_catalogs() -> None:
    bad_temperature = list_tt_cable_options(
        _catalog(), product_temperature=Decimal("NaN"), ambient_temperature=Decimal("20")
    )
    bad_catalog = list_tt_cable_options(
        CatalogBundle(
            (replace(_catalog().power_rows[0], nominal_power=Decimal("Infinity")),), (), ()
        ),
        product_temperature=Decimal("20"),
        ambient_temperature=Decimal("20"),
    )

    assert isinstance(bad_temperature, TTFormulaReport)
    assert isinstance(bad_catalog, TTFormulaReport)
    assert bad_temperature.issues[0].path == ("product_temperature",)
    assert bad_catalog.issues[0].path == ("catalogs", "power_rows", 0, "nominal_power")
