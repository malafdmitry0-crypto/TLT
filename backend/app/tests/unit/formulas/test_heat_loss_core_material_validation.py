"""Tests for policy-free material temperature validation in the core."""

import math

import pytest

from app.formulas.heat_loss.core.errors import FormulaDomainError
from app.formulas.heat_loss.core.material_validation import (
    validate_hot_side_temperature_in_interval,
    validate_temperature_in_interval,
    validate_temperature_interval,
)


@pytest.mark.parametrize(
    ("minimum", "maximum"),
    [(-90.0, 600.0), (-math.inf, math.inf), (math.nan, 100.0)],
)
def test_ordered_interval_preserves_legacy_comparison_semantics(
    minimum: float,
    maximum: float,
) -> None:
    assert validate_temperature_interval(minimum_c=minimum, maximum_c=maximum).is_valid


@pytest.mark.parametrize(("minimum", "maximum"), [(100.0, 100.0), (101.0, 100.0)])
def test_equal_or_reversed_interval_returns_structured_issue(
    minimum: float,
    maximum: float,
) -> None:
    report = validate_temperature_interval(
        minimum_c=minimum,
        maximum_c=maximum,
        path=("temperature_range",),
    )

    assert [(issue.code, issue.path, issue.details_dict()) for issue in report.issues] == [
        (
            "invalid_temperature_interval",
            ("temperature_range",),
            {"minimum_c": minimum, "maximum_c": maximum},
        )
    ]


@pytest.mark.parametrize("temperature", [-60.0, 60.0, 0.0])
def test_temperature_interval_is_inclusive(temperature: float) -> None:
    assert validate_temperature_in_interval(
        temperature_c=temperature,
        minimum_c=-60.0,
        maximum_c=60.0,
    ).is_valid


def test_temperature_outside_interval_returns_numeric_evidence() -> None:
    report = validate_temperature_in_interval(
        temperature_c=61.0,
        minimum_c=-60.0,
        maximum_c=60.0,
        path=("insulation_layers", 0),
    )

    assert [(issue.code, issue.path, issue.details_dict()) for issue in report.issues] == [
        (
            "temperature_outside_interval",
            ("insulation_layers", 0),
            {"temperature_c": 61.0, "minimum_c": -60.0, "maximum_c": 60.0},
        )
    ]


def test_hot_side_validation_uses_the_higher_boundary_temperature() -> None:
    report = validate_hot_side_temperature_in_interval(
        first_side_c=40.0,
        second_side_c=80.0,
        minimum_c=-60.0,
        maximum_c=60.0,
    )

    assert report.issues[0].details_dict()["temperature_c"] == 80.0


def test_hot_side_validation_keeps_core_finite_result_guard() -> None:
    with pytest.raises(FormulaDomainError, match="non_finite_result"):
        validate_hot_side_temperature_in_interval(
            first_side_c=math.inf,
            second_side_c=20.0,
            minimum_c=-60.0,
            maximum_c=600.0,
        )
