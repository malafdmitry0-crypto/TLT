"""Tests for pure numeric insulation-layer validation."""

import pytest

from app.formulas.heat_loss.core.insulation_validation import (
    validate_insulation_layer_count,
    validate_insulation_layer_ranges,
)


def test_layer_ranges_accept_the_valid_bounds() -> None:
    assert validate_insulation_layer_ranges(0.0001, 0.0001).is_valid
    assert validate_insulation_layer_ranges(0.5, 400).is_valid


@pytest.mark.parametrize(
    ("thickness_m", "conductivity_w_mk", "code", "field"),
    [
        (0, 0.04, "below_min_exclusive", "thickness"),
        (0.5001, 0.04, "above_max_inclusive", "thickness"),
        (0.05, 0, "below_min_exclusive", "conductivity"),
        (0.05, 400.1, "above_max_inclusive", "conductivity"),
    ],
)
def test_layer_ranges_reject_values_outside_limits(
    thickness_m: float, conductivity_w_mk: float, code: str, field: str
) -> None:
    report = validate_insulation_layer_ranges(thickness_m, conductivity_w_mk)

    assert [issue.code for issue in report.issues] == [code]
    assert report.issues[0].path == (field,)


def test_layer_ranges_skip_optional_conductivity_when_absent() -> None:
    assert validate_insulation_layer_ranges(0.05, None).is_valid


def test_layer_ranges_collect_issues_with_nested_paths() -> None:
    report = validate_insulation_layer_ranges(0, 0, path=("pipe", "insulation_layers", 1))

    assert [issue.code for issue in report.issues] == [
        "below_min_exclusive",
        "below_min_exclusive",
    ]
    assert [issue.path for issue in report.issues] == [
        ("pipe", "insulation_layers", 1, "thickness"),
        ("pipe", "insulation_layers", 1, "conductivity"),
    ]


@pytest.mark.parametrize(
    ("count", "is_valid", "code"),
    [
        (0, False, "sequence_too_short"),
        (1, True, None),
        (3, True, None),
        (4, False, "sequence_too_long"),
    ],
)
def test_layer_count_uses_the_shared_layer_count_range(
    count: int, is_valid: bool, code: str | None
) -> None:
    report = validate_insulation_layer_count(count)

    assert report.is_valid is is_valid
    assert [issue.code for issue in report.issues] == ([] if code is None else [code])
    if code is not None:
        assert report.issues[0].path == ("insulation_layers",)
