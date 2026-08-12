"""Structured validation results for the pure heat-loss formula domain."""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Literal, Self, TypeAlias

FormulaValidationNumber: TypeAlias = float | int
FormulaValidationPathSegment: TypeAlias = str | int
FormulaValidationPath: TypeAlias = tuple[FormulaValidationPathSegment, ...]
FormulaValidationCode: TypeAlias = Literal[
    "wall_exceeds_pipe_radius",
    "process_temperature_not_above_ambient",
    "process_temperature_not_above_ground",
    "ground_centerline_inside_pipe",
    "wall_exceeds_tank_radius",
    "invalid_buried_height",
    "not_finite",
    "below_min_inclusive",
    "below_min_exclusive",
    "above_max_inclusive",
    "above_max_exclusive",
    "sequence_too_short",
    "sequence_too_long",
]


@dataclass(frozen=True)
class FormulaValidationIssue:
    """One policy-free mathematical-domain violation.

    Field names and user-facing text intentionally do not belong to the formula
    library.  ``details`` contains only numerical evidence needed by a caller
    to present or log the violation without parsing exception text.
    """

    code: FormulaValidationCode
    details: tuple[tuple[str, FormulaValidationNumber], ...] = ()
    path: FormulaValidationPath = ()

    @classmethod
    def with_details(
        cls,
        code: FormulaValidationCode,
        /,
        path: FormulaValidationPath = (),
        **details: FormulaValidationNumber,
    ) -> Self:
        return cls(code=code, details=tuple(details.items()), path=path)

    def details_dict(self) -> dict[str, FormulaValidationNumber]:
        return dict(self.details)


@dataclass(frozen=True)
class FormulaValidationReport:
    """Complete result of one formula-domain validation pass."""

    issues: tuple[FormulaValidationIssue, ...] = ()

    @property
    def is_valid(self) -> bool:
        return not self.issues


VALID_FORMULA_VALIDATION_REPORT = FormulaValidationReport()


@dataclass(frozen=True)
class NumericRangeSpec:
    """Inclusive or exclusive numeric bounds owned by the formula core."""

    minimum: FormulaValidationNumber | None = None
    maximum: FormulaValidationNumber | None = None
    minimum_inclusive: bool = True
    maximum_inclusive: bool = True
    allow_positive_infinity: bool = False
    allow_negative_infinity: bool = False


@dataclass(frozen=True)
class SequenceLengthSpec:
    """Inclusive bounds for the length of a supplied sequence."""

    minimum_length: int | None = None
    maximum_length: int | None = None


@dataclass(frozen=True)
class NumericRangeCheck:
    """One required numeric value checked against an immutable range spec."""

    path: FormulaValidationPath
    value: FormulaValidationNumber
    spec: NumericRangeSpec


@dataclass(frozen=True)
class SequenceLengthCheck:
    """One supplied sequence length checked against an immutable length spec."""

    path: FormulaValidationPath
    length: int
    spec: SequenceLengthSpec


RangeCheck: TypeAlias = NumericRangeCheck | SequenceLengthCheck


def validate_numeric_range(
    *,
    path: FormulaValidationPath,
    value: FormulaValidationNumber,
    spec: NumericRangeSpec,
) -> FormulaValidationReport:
    """Return all generic range issues for one required numeric value.

    Optional-field presence is deliberately not handled here.  A domain
    validator chooses whether a supplied ``None`` should be skipped, required,
    or validated by a different branch before constructing this check.
    """

    if math.isnan(value):
        return FormulaValidationReport(
            (FormulaValidationIssue.with_details("not_finite", path=path, value=value),)
        )
    if math.isinf(value):
        infinity_is_allowed = (value > 0 and spec.allow_positive_infinity) or (
            value < 0 and spec.allow_negative_infinity
        )
        if infinity_is_allowed:
            return VALID_FORMULA_VALIDATION_REPORT
        return FormulaValidationReport(
            (FormulaValidationIssue.with_details("not_finite", path=path, value=value),)
        )

    issues: tuple[FormulaValidationIssue, ...] = ()
    if spec.minimum is not None:
        if value < spec.minimum:
            issues += (
                FormulaValidationIssue.with_details(
                    "below_min_inclusive" if spec.minimum_inclusive else "below_min_exclusive",
                    path=path,
                    value=value,
                    minimum=spec.minimum,
                ),
            )
        elif value == spec.minimum and not spec.minimum_inclusive:
            issues += (
                FormulaValidationIssue.with_details(
                    "below_min_exclusive",
                    path=path,
                    value=value,
                    minimum=spec.minimum,
                ),
            )
    if spec.maximum is not None:
        if value > spec.maximum:
            issues += (
                FormulaValidationIssue.with_details(
                    "above_max_inclusive" if spec.maximum_inclusive else "above_max_exclusive",
                    path=path,
                    value=value,
                    maximum=spec.maximum,
                ),
            )
        elif value == spec.maximum and not spec.maximum_inclusive:
            issues += (
                FormulaValidationIssue.with_details(
                    "above_max_exclusive",
                    path=path,
                    value=value,
                    maximum=spec.maximum,
                ),
            )
    return FormulaValidationReport(issues) if issues else VALID_FORMULA_VALIDATION_REPORT


def validate_sequence_length(
    *,
    path: FormulaValidationPath,
    length: int,
    spec: SequenceLengthSpec,
) -> FormulaValidationReport:
    """Return generic sequence-length issues without inspecting its contents."""

    issues: tuple[FormulaValidationIssue, ...] = ()
    if spec.minimum_length is not None and length < spec.minimum_length:
        issues += (
            FormulaValidationIssue.with_details(
                "sequence_too_short",
                path=path,
                length=length,
                minimum_length=spec.minimum_length,
            ),
        )
    if spec.maximum_length is not None and length > spec.maximum_length:
        issues += (
            FormulaValidationIssue.with_details(
                "sequence_too_long",
                path=path,
                length=length,
                maximum_length=spec.maximum_length,
            ),
        )
    return FormulaValidationReport(issues) if issues else VALID_FORMULA_VALIDATION_REPORT


def validate_range_checks(checks: tuple[RangeCheck, ...]) -> FormulaValidationReport:
    """Collect issues from independent required-value range checks."""

    issues: tuple[FormulaValidationIssue, ...] = ()
    for check in checks:
        report = (
            validate_numeric_range(path=check.path, value=check.value, spec=check.spec)
            if isinstance(check, NumericRangeCheck)
            else validate_sequence_length(path=check.path, length=check.length, spec=check.spec)
        )
        issues += report.issues
    return FormulaValidationReport(issues) if issues else VALID_FORMULA_VALIDATION_REPORT


# Current backend input limits, expressed as immutable pure-core specifications.
# Production schemas and facades still own calling these checks during Phase A.
INSULATION_THICKNESS_RANGE = NumericRangeSpec(minimum=0, maximum=0.5, minimum_inclusive=False)
INSULATION_CONDUCTIVITY_RANGE = NumericRangeSpec(minimum=0, maximum=400, minimum_inclusive=False)
INSULATION_LAYER_COUNT_RANGE = SequenceLengthSpec(minimum_length=1, maximum_length=3)

PIPE_OUTER_DIAMETER_RANGE = NumericRangeSpec(minimum=0.0108, maximum=3.0)
PIPE_WALL_THICKNESS_RANGE = NumericRangeSpec(minimum=0.0001, maximum=0.04)
PIPE_CONDUCTIVITY_RANGE = NumericRangeSpec(minimum=0, maximum=400, minimum_inclusive=False)
PIPE_AMBIENT_TEMPERATURE_RANGE = NumericRangeSpec(minimum=-70, maximum=70)
PIPE_PROCESS_TEMPERATURE_RANGE = NumericRangeSpec(minimum=-90, maximum=600)
PIPE_LENGTH_RANGE = NumericRangeSpec(minimum=0.5, maximum=200_000)
PIPE_CENTERLINE_DEPTH_RANGE = NumericRangeSpec(minimum=0, maximum=200)
PIPE_LOCAL_ELEMENTS_COUNT_RANGE = NumericRangeSpec(minimum=0, maximum=100)
PIPE_LOCAL_ELEMENT_EQUIVALENT_LENGTH_RANGE = NumericRangeSpec(minimum=0.1, maximum=6.9)
PIPE_WIND_SPEED_RANGE = NumericRangeSpec(minimum=0, maximum=20)
PIPE_GROUND_CONDUCTIVITY_RANGE = NumericRangeSpec(minimum=0.5, maximum=3.0)
PIPE_GROUND_TEMPERATURE_RANGE = NumericRangeSpec(minimum=-70, maximum=70)
PIPE_SAFETY_FACTOR_RANGE = NumericRangeSpec(minimum=1.0, maximum=1.7)

TANK_DIAMETER_RANGE = NumericRangeSpec(minimum=0.1, maximum=30.0)
TANK_HEIGHT_RANGE = NumericRangeSpec(minimum=0.1, maximum=50.0)
TANK_SIDE_RANGE = NumericRangeSpec(minimum=0.1, maximum=100.0)
TANK_AMBIENT_TEMPERATURE_RANGE = NumericRangeSpec(minimum=-70, maximum=70)
TANK_GROUND_TEMPERATURE_RANGE = NumericRangeSpec(minimum=-70, maximum=70)
TANK_PROCESS_TEMPERATURE_RANGE = NumericRangeSpec(minimum=-90, maximum=600)
TANK_WALL_THICKNESS_RANGE = NumericRangeSpec(minimum=0.001, maximum=0.5)
TANK_WALL_CONDUCTIVITY_RANGE = NumericRangeSpec(minimum=0, maximum=500, minimum_inclusive=False)
TANK_BURIED_HEIGHT_RANGE = NumericRangeSpec(minimum=0, maximum=50.0, minimum_inclusive=False)
TANK_GROUND_CONDUCTIVITY_RANGE = NumericRangeSpec(minimum=0.5, maximum=3.0)
TANK_WIND_SPEED_RANGE = NumericRangeSpec(minimum=0, maximum=20)
TANK_SAFETY_FACTOR_RANGE = NumericRangeSpec(minimum=1.0, maximum=1.7)
TANK_ADDITIONAL_HEAT_LOSS_RANGE = NumericRangeSpec(
    minimum=0,
    allow_positive_infinity=True,
)
