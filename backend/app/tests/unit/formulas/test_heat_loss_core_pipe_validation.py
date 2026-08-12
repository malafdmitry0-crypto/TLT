"""Tests for pure scalar pipe input-range validation."""

import math

import pytest

from app.formulas.heat_loss.core.pipe_validation import validate_pipe_input_ranges
from app.formulas.heat_loss.core.validation import (
    PIPE_AMBIENT_TEMPERATURE_RANGE,
    PIPE_CENTERLINE_DEPTH_RANGE,
    PIPE_CONDUCTIVITY_RANGE,
    PIPE_GROUND_CONDUCTIVITY_RANGE,
    PIPE_GROUND_TEMPERATURE_RANGE,
    PIPE_LENGTH_RANGE,
    PIPE_LOCAL_ELEMENT_EQUIVALENT_LENGTH_RANGE,
    PIPE_LOCAL_ELEMENTS_COUNT_RANGE,
    PIPE_OUTER_DIAMETER_RANGE,
    PIPE_PROCESS_TEMPERATURE_RANGE,
    PIPE_SAFETY_FACTOR_RANGE,
    PIPE_WALL_THICKNESS_RANGE,
    PIPE_WIND_SPEED_RANGE,
    NumericRangeSpec,
)


def _valid_input(**overrides: float | int | None) -> dict[str, float | int | None]:
    values: dict[str, float | int | None] = {
        "outer_diameter": 0.108,
        "wall_thickness": 0.004,
        "pipe_lambda": 45.0,
        "ambient_temperature": -20.0,
        "process_temperature": 80.0,
        "pipe_length": 10.0,
        "pipe_centerline_depth": 1.0,
        "num_local_elements": 2,
        "local_element_equiv_length": 1.5,
        "wind_speed": 4.0,
        "ground_conductivity": 1.5,
        "ground_temperature": 5.0,
        "safety_factor": 1.1,
        "insulation_layer_count": 2,
    }
    values.update(overrides)
    return values


@pytest.mark.parametrize(
    ("field", "value", "spec"),
    [
        ("outer_diameter", 0.0, PIPE_OUTER_DIAMETER_RANGE),
        ("wall_thickness", 0.0, PIPE_WALL_THICKNESS_RANGE),
        ("pipe_lambda", 0.0, PIPE_CONDUCTIVITY_RANGE),
        ("ambient_temperature", -71.0, PIPE_AMBIENT_TEMPERATURE_RANGE),
        ("process_temperature", -91.0, PIPE_PROCESS_TEMPERATURE_RANGE),
        ("pipe_length", 0.0, PIPE_LENGTH_RANGE),
        ("pipe_centerline_depth", -1.0, PIPE_CENTERLINE_DEPTH_RANGE),
        ("num_local_elements", -1, PIPE_LOCAL_ELEMENTS_COUNT_RANGE),
        (
            "local_element_equiv_length",
            0.0,
            PIPE_LOCAL_ELEMENT_EQUIVALENT_LENGTH_RANGE,
        ),
        ("wind_speed", -1.0, PIPE_WIND_SPEED_RANGE),
        ("ground_conductivity", 0.0, PIPE_GROUND_CONDUCTIVITY_RANGE),
        ("ground_temperature", -71.0, PIPE_GROUND_TEMPERATURE_RANGE),
        ("safety_factor", 0.0, PIPE_SAFETY_FACTOR_RANGE),
    ],
)
def test_each_scalar_uses_its_canonical_path_and_spec(
    field: str, value: float | int, spec: NumericRangeSpec
) -> None:
    report = validate_pipe_input_ranges(**_valid_input(**{field: value}))

    assert len(report.issues) == 1
    issue = report.issues[0]
    assert issue.path == (field,)
    assert issue.details_dict()["minimum"] == spec.minimum


@pytest.mark.parametrize(
    ("field", "minimum", "maximum"),
    [
        ("outer_diameter", 0.0108, 3.0),
        ("wall_thickness", 0.0001, 0.04),
        ("ambient_temperature", -70.0, 70.0),
        ("process_temperature", -90.0, 600.0),
        ("pipe_length", 0.5, 200_000.0),
        ("pipe_centerline_depth", 0.0, 200.0),
        ("num_local_elements", 0, 100),
        ("local_element_equiv_length", 0.1, 6.9),
        ("wind_speed", 0.0, 20.0),
        ("ground_conductivity", 0.5, 3.0),
        ("ground_temperature", -70.0, 70.0),
        ("safety_factor", 1.0, 1.7),
    ],
)
def test_inclusive_scalar_bounds_are_valid(field: str, minimum: float, maximum: float) -> None:
    assert validate_pipe_input_ranges(**_valid_input(**{field: minimum})).is_valid
    assert validate_pipe_input_ranges(**_valid_input(**{field: maximum})).is_valid


def test_pipe_conductivity_minimum_is_exclusive() -> None:
    assert not validate_pipe_input_ranges(**_valid_input(pipe_lambda=0.0)).is_valid
    assert validate_pipe_input_ranges(
        **_valid_input(pipe_lambda=math.nextafter(0.0, math.inf))
    ).is_valid
    assert validate_pipe_input_ranges(**_valid_input(pipe_lambda=400.0)).is_valid


def test_layer_count_uses_its_canonical_path_and_range() -> None:
    short = validate_pipe_input_ranges(**_valid_input(insulation_layer_count=0))
    long = validate_pipe_input_ranges(**_valid_input(insulation_layer_count=4))

    assert [(issue.code, issue.path) for issue in short.issues] == [
        ("sequence_too_short", ("insulation_layers",))
    ]
    assert [(issue.code, issue.path) for issue in long.issues] == [
        ("sequence_too_long", ("insulation_layers",))
    ]


def test_optional_values_are_skipped_when_absent() -> None:
    assert validate_pipe_input_ranges(
        **_valid_input(
            pipe_lambda=None,
            ambient_temperature=None,
            pipe_centerline_depth=None,
            local_element_equiv_length=None,
            wind_speed=None,
            ground_conductivity=None,
            ground_temperature=None,
            safety_factor=None,
        )
    ).is_valid


def test_all_independent_issues_are_collected() -> None:
    report = validate_pipe_input_ranges(
        **_valid_input(outer_diameter=0.0, pipe_lambda=0.0, insulation_layer_count=0)
    )

    assert [(issue.code, issue.path) for issue in report.issues] == [
        ("below_min_inclusive", ("outer_diameter",)),
        ("below_min_exclusive", ("pipe_lambda",)),
        ("sequence_too_short", ("insulation_layers",)),
    ]


@pytest.mark.parametrize("value", [math.nan, math.inf, -math.inf])
@pytest.mark.parametrize("field", ["outer_diameter", "pipe_lambda", "safety_factor"])
def test_non_finite_supplied_values_are_rejected(field: str, value: float) -> None:
    report = validate_pipe_input_ranges(**_valid_input(**{field: value}))

    assert [(issue.code, issue.path) for issue in report.issues] == [("not_finite", (field,))]
