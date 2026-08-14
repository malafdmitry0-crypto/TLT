"""Pure temperature-domain validation for heat-loss materials."""

from __future__ import annotations

import math

from .errors import FormulaDomainError
from .validation import (
    VALID_FORMULA_VALIDATION_REPORT,
    FormulaValidationIssue,
    FormulaValidationPath,
    FormulaValidationReport,
)


def validate_temperature_interval(
    *,
    minimum_c: float,
    maximum_c: float,
    path: FormulaValidationPath = (),
) -> FormulaValidationReport:
    """Require an ordered temperature interval without owning its source."""

    if minimum_c >= maximum_c:
        return FormulaValidationReport(
            (
                FormulaValidationIssue.with_details(
                    "invalid_temperature_interval",
                    path=path,
                    minimum_c=minimum_c,
                    maximum_c=maximum_c,
                ),
            )
        )
    return VALID_FORMULA_VALIDATION_REPORT


def validate_temperature_in_interval(
    *,
    temperature_c: float,
    minimum_c: float,
    maximum_c: float,
    path: FormulaValidationPath = (),
) -> FormulaValidationReport:
    """Check inclusive membership in an already resolved temperature interval."""

    if minimum_c <= temperature_c <= maximum_c:
        return VALID_FORMULA_VALIDATION_REPORT
    return FormulaValidationReport(
        (
            FormulaValidationIssue.with_details(
                "temperature_outside_interval",
                path=path,
                temperature_c=temperature_c,
                minimum_c=minimum_c,
                maximum_c=maximum_c,
            ),
        )
    )


def validate_layer_boundary_temperatures_in_interval(
    *,
    first_side_c: float,
    second_side_c: float,
    minimum_c: float,
    maximum_c: float,
    path: FormulaValidationPath = (),
) -> FormulaValidationReport:
    """Require the complete layer temperature span to fit an inclusive interval."""

    if not math.isfinite(first_side_c) or not math.isfinite(second_side_c):
        raise FormulaDomainError("non_finite_result")

    hotter_side_c = max(first_side_c, second_side_c)
    if hotter_side_c > maximum_c:
        return validate_temperature_in_interval(
            temperature_c=hotter_side_c,
            minimum_c=minimum_c,
            maximum_c=maximum_c,
            path=path,
        )

    colder_side_c = min(first_side_c, second_side_c)
    if colder_side_c < minimum_c:
        return validate_temperature_in_interval(
            temperature_c=colder_side_c,
            minimum_c=minimum_c,
            maximum_c=maximum_c,
            path=path,
        )

    return VALID_FORMULA_VALIDATION_REPORT
