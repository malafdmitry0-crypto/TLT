"""Tests for the unconnected pure-core numeric range API."""

import math
from dataclasses import FrozenInstanceError

import pytest
from heatcalc_heat_loss_core.validation import (
    INSULATION_LAYER_COUNT_RANGE,
    PIPE_OUTER_DIAMETER_RANGE,
    TANK_ADDITIONAL_HEAT_LOSS_RANGE,
    TANK_BURIED_HEIGHT_RANGE,
    FormulaValidationIssue,
    NumericRangeCheck,
    NumericRangeSpec,
    SequenceLengthCheck,
    SequenceLengthSpec,
    validate_numeric_range,
    validate_range_checks,
    validate_sequence_length,
)


def test_numeric_range_accepts_inclusive_boundaries() -> None:
    spec = NumericRangeSpec(minimum=1, maximum=3)

    assert validate_numeric_range(path=("value",), value=1, spec=spec).is_valid
    assert validate_numeric_range(path=("value",), value=3, spec=spec).is_valid


def test_numeric_range_rejects_exclusive_boundaries() -> None:
    spec = NumericRangeSpec(minimum=1, maximum=3, minimum_inclusive=False, maximum_inclusive=False)

    minimum = validate_numeric_range(path=("value",), value=1, spec=spec)
    maximum = validate_numeric_range(path=("value",), value=3, spec=spec)

    assert minimum.issues[0].code == "below_min_exclusive"
    assert minimum.issues[0].details_dict() == {"value": 1, "minimum": 1}
    assert maximum.issues[0].code == "above_max_exclusive"
    assert maximum.issues[0].details_dict() == {"value": 3, "maximum": 3}


@pytest.mark.parametrize(
    ("value", "code"),
    [
        (0, "below_min_inclusive"),
        (4, "above_max_inclusive"),
    ],
)
def test_numeric_range_rejects_values_outside_bounds(value: int, code: str) -> None:
    report = validate_numeric_range(
        path=("pipe", "outer_diameter"),
        value=value,
        spec=NumericRangeSpec(minimum=1, maximum=3),
    )

    assert report.issues[0].code == code
    assert report.issues[0].path == ("pipe", "outer_diameter")


@pytest.mark.parametrize("value", [math.nan, math.inf, -math.inf])
def test_numeric_range_rejects_non_finite_values(value: float) -> None:
    report = validate_numeric_range(
        path=("process_temperature",), value=value, spec=NumericRangeSpec(minimum=-90, maximum=600)
    )

    assert [issue.code for issue in report.issues] == ["not_finite"]
    reported_value = report.issues[0].details_dict()["value"]
    assert report.issues[0].details_dict()["minimum"] == -90
    assert report.issues[0].details_dict()["maximum"] == 600
    assert report.issues[0].details_dict()["minimum_inclusive"] == 1
    assert report.issues[0].details_dict()["maximum_inclusive"] == 1
    if math.isnan(value):
        assert math.isnan(reported_value)
    else:
        assert reported_value == value


def test_numeric_range_can_preserve_an_explicit_legacy_infinity_boundary() -> None:
    assert validate_numeric_range(
        path=("q_additional",),
        value=math.inf,
        spec=TANK_ADDITIONAL_HEAT_LOSS_RANGE,
    ).is_valid
    assert not validate_numeric_range(
        path=("q_additional",),
        value=-math.inf,
        spec=TANK_ADDITIONAL_HEAT_LOSS_RANGE,
    ).is_valid
    assert not validate_numeric_range(
        path=("q_additional",),
        value=math.nan,
        spec=TANK_ADDITIONAL_HEAT_LOSS_RANGE,
    ).is_valid


def test_range_checks_collect_issues_and_preserve_nested_paths() -> None:
    report = validate_range_checks(
        (
            NumericRangeCheck(
                path=("pipe", "insulation_layers", 1, "thickness"),
                value=0,
                spec=NumericRangeSpec(minimum=0, minimum_inclusive=False),
            ),
            NumericRangeCheck(
                path=("pipe", "outer_diameter"),
                value=4,
                spec=NumericRangeSpec(maximum=3),
            ),
            SequenceLengthCheck(
                path=("pipe", "insulation_layers"),
                length=4,
                spec=SequenceLengthSpec(minimum_length=1, maximum_length=3),
            ),
        )
    )

    assert [issue.code for issue in report.issues] == [
        "below_min_exclusive",
        "above_max_inclusive",
        "sequence_too_long",
    ]
    assert report.issues[0].path == ("pipe", "insulation_layers", 1, "thickness")
    assert report.issues[2].details_dict() == {"length": 4, "maximum_length": 3}


def test_sequence_length_checks_both_bounds() -> None:
    spec = SequenceLengthSpec(minimum_length=1, maximum_length=3)

    short = validate_sequence_length(path=("layers",), length=0, spec=spec)
    long = validate_sequence_length(path=("layers",), length=4, spec=spec)

    assert short.issues[0].code == "sequence_too_short"
    assert long.issues[0].code == "sequence_too_long"


def test_range_specs_are_immutable_and_capture_current_backend_bounds() -> None:
    with pytest.raises(FrozenInstanceError):
        PIPE_OUTER_DIAMETER_RANGE.maximum = 2.0  # type: ignore[misc]

    assert NumericRangeSpec(minimum=0.0108, maximum=3.0) == PIPE_OUTER_DIAMETER_RANGE
    assert SequenceLengthSpec(minimum_length=1, maximum_length=3) == INSULATION_LAYER_COUNT_RANGE
    assert (
        NumericRangeSpec(minimum=0, maximum=50.0, minimum_inclusive=False)
        == TANK_BURIED_HEIGHT_RANGE
    )


def test_existing_issue_constructors_remain_compatible() -> None:
    positional = FormulaValidationIssue("invalid_buried_height", (("height_m", 2.0),))
    detailed = FormulaValidationIssue.with_details("invalid_buried_height", height_m=2.0)

    assert positional.path == ()
    assert positional.details_dict() == {"height_m": 2.0}
    assert detailed.path == ()
    assert detailed.details_dict() == {"height_m": 2.0}
