"""Tests for pure tank-input scalar range validation."""

import math

import pytest

from app.formulas.heat_loss.core.tank_validation import validate_tank_input_ranges
from app.formulas.heat_loss.core.validation import FormulaValidationReport


def _validate(**overrides: object) -> FormulaValidationReport:
    values: dict[str, object] = {
        "diameter": 1.0,
        "height": 2.0,
        "length": 3.0,
        "width": 4.0,
        "insulation_layer_count": 1,
        "ambient_temperature": -20.0,
        "ground_temperature": 5.0,
        "process_temperature": 70.0,
        "wall_thickness": 0.01,
        "wall_lambda": 45.0,
        "tank_buried_height": 1.0,
        "ground_conductivity": 1.5,
        "wind_speed": 3.0,
        "safety_factor": 1.1,
        "q_additional": 0.0,
    }
    values.update(overrides)
    return validate_tank_input_ranges(**values)  # type: ignore[arg-type]


@pytest.mark.parametrize(
    ("field", "minimum", "maximum", "minimum_code"),
    [
        ("diameter", 0.1, 30.0, "below_min_inclusive"),
        ("height", 0.1, 50.0, "below_min_inclusive"),
        ("length", 0.1, 100.0, "below_min_inclusive"),
        ("width", 0.1, 100.0, "below_min_inclusive"),
        ("ambient_temperature", -70.0, 70.0, "below_min_inclusive"),
        ("ground_temperature", -70.0, 70.0, "below_min_inclusive"),
        ("process_temperature", -90.0, 600.0, "below_min_inclusive"),
        ("wall_thickness", 0.001, 0.5, "below_min_inclusive"),
        ("wall_lambda", 0.0, 500.0, "below_min_exclusive"),
        ("tank_buried_height", 0.0, 50.0, "below_min_exclusive"),
        ("ground_conductivity", 0.5, 3.0, "below_min_inclusive"),
        ("wind_speed", 0.0, 20.0, "below_min_inclusive"),
        ("safety_factor", 1.0, 1.7, "below_min_inclusive"),
    ],
)
def test_scalar_ranges_map_to_canonical_paths_and_thresholds(
    field: str, minimum: float, maximum: float, minimum_code: str
) -> None:
    at_minimum = _validate(**{field: minimum})
    at_maximum = _validate(**{field: maximum})
    below = _validate(**{field: minimum - 0.01})
    above = _validate(**{field: maximum + 0.01})

    assert at_minimum.is_valid is (minimum_code != "below_min_exclusive")
    assert at_maximum.is_valid
    assert [(issue.code, issue.path) for issue in below.issues] == [(minimum_code, (field,))]
    assert [(issue.code, issue.path) for issue in above.issues] == [
        ("above_max_inclusive", (field,))
    ]


@pytest.mark.parametrize("count", [1, 3])
def test_layer_count_accepts_thresholds(count: int) -> None:
    assert _validate(insulation_layer_count=count).is_valid


@pytest.mark.parametrize(("count", "code"), [(0, "sequence_too_short"), (4, "sequence_too_long")])
def test_layer_count_uses_the_canonical_insulation_layers_path(count: int, code: str) -> None:
    report = _validate(insulation_layer_count=count)

    assert [(issue.code, issue.path) for issue in report.issues] == [(code, ("insulation_layers",))]


def test_optional_scalars_are_skipped_when_absent() -> None:
    assert _validate(
        diameter=None,
        height=None,
        length=None,
        width=None,
        ambient_temperature=None,
        ground_temperature=None,
        wall_thickness=None,
        wall_lambda=None,
        tank_buried_height=None,
        ground_conductivity=None,
        wind_speed=None,
    ).is_valid


@pytest.mark.parametrize(
    "field",
    [
        "diameter",
        "height",
        "length",
        "width",
        "ambient_temperature",
        "ground_temperature",
        "process_temperature",
        "wall_thickness",
        "wall_lambda",
        "tank_buried_height",
        "ground_conductivity",
        "wind_speed",
        "safety_factor",
    ],
)
@pytest.mark.parametrize("value", [math.nan, math.inf, -math.inf])
def test_scalar_ranges_reject_non_finite_values(field: str, value: float) -> None:
    report = _validate(**{field: value})

    assert [(issue.code, issue.path) for issue in report.issues] == [("not_finite", (field,))]


@pytest.mark.parametrize("value", [math.nan, -math.inf])
def test_q_additional_rejects_nan_and_negative_infinity(value: float) -> None:
    report = _validate(q_additional=value)

    assert [(issue.code, issue.path) for issue in report.issues] == [
        ("not_finite", ("q_additional",))
    ]


def test_q_additional_preserves_legacy_positive_infinity_acceptance() -> None:
    assert _validate(q_additional=math.inf).is_valid


def test_ranges_collect_all_independent_errors_in_check_order() -> None:
    report = _validate(
        diameter=0.0,
        insulation_layer_count=4,
        process_temperature=601.0,
        wall_lambda=0.0,
        q_additional=-1.0,
    )

    assert [(issue.code, issue.path) for issue in report.issues] == [
        ("below_min_inclusive", ("diameter",)),
        ("sequence_too_long", ("insulation_layers",)),
        ("above_max_inclusive", ("process_temperature",)),
        ("below_min_exclusive", ("wall_lambda",)),
        ("below_min_inclusive", ("q_additional",)),
    ]
