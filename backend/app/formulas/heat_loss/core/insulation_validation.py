"""Pure numeric validation for one insulation layer."""

from __future__ import annotations

from .validation import (
    INSULATION_CONDUCTIVITY_RANGE,
    INSULATION_LAYER_COUNT_RANGE,
    INSULATION_THICKNESS_RANGE,
    FormulaValidationPath,
    FormulaValidationReport,
    NumericRangeCheck,
    SequenceLengthCheck,
    validate_numeric_range,
    validate_range_checks,
)


def validate_insulation_thickness(
    thickness_m: float,
    path: FormulaValidationPath = ("thickness",),
) -> FormulaValidationReport:
    """Validate one insulation thickness against the core-owned bounds."""

    return validate_numeric_range(
        path=path,
        value=thickness_m,
        spec=INSULATION_THICKNESS_RANGE,
    )


def validate_insulation_conductivity(
    conductivity_w_mk: float,
    path: FormulaValidationPath = ("conductivity",),
) -> FormulaValidationReport:
    """Validate one supplied insulation conductivity against core bounds."""

    return validate_numeric_range(
        path=path,
        value=conductivity_w_mk,
        spec=INSULATION_CONDUCTIVITY_RANGE,
    )


def validate_insulation_layer_ranges(
    thickness_m: float,
    conductivity_w_mk: float | None,
    path: FormulaValidationPath = (),
) -> FormulaValidationReport:
    """Validate supplied numeric insulation-layer values without material policy."""

    checks: tuple[NumericRangeCheck, ...] = (
        NumericRangeCheck(
            path=(*path, "thickness"),
            value=thickness_m,
            spec=INSULATION_THICKNESS_RANGE,
        ),
    )
    if conductivity_w_mk is not None:
        checks += (
            NumericRangeCheck(
                path=(*path, "conductivity"),
                value=conductivity_w_mk,
                spec=INSULATION_CONDUCTIVITY_RANGE,
            ),
        )
    return validate_range_checks(checks)


def validate_insulation_layer_count(
    count: int,
    path: FormulaValidationPath = ("insulation_layers",),
) -> FormulaValidationReport:
    """Validate the number of supplied insulation layers."""

    return validate_range_checks(
        (SequenceLengthCheck(path=path, length=count, spec=INSULATION_LAYER_COUNT_RANGE),)
    )
