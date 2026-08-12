"""Pydantic boundary adapter for generic heat-loss core range validation."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any, Literal, TypeAlias

from pydantic import ValidationError
from pydantic.json_schema import WithJsonSchema
from pydantic_core import InitErrorDetails, PydanticKnownError

from app.formulas.heat_loss.core.validation import (
    FormulaValidationIssue,
    FormulaValidationPath,
    FormulaValidationReport,
    NumericRangeSpec,
    SequenceLengthSpec,
)

PydanticRangeErrorType: TypeAlias = Literal[
    "greater_than_equal",
    "greater_than",
    "less_than_equal",
    "less_than",
    "too_short",
    "too_long",
    "finite_number",
]


def raise_range_validation_errors(
    *,
    model_name: str,
    report: FormulaValidationReport,
    inputs: Mapping[FormulaValidationPath, object],
) -> None:
    """Raise native-shaped Pydantic errors for generic core range issues.

    ``inputs`` keeps the original submitted value available for sequence errors,
    whose core issue deliberately records only a length.
    """

    if report.is_valid:
        return

    line_errors: list[InitErrorDetails] = []
    for issue in report.issues:
        error_type, context = _pydantic_error_for_issue(issue)
        details = issue.details_dict()
        line_error = InitErrorDetails(
            type=error_type,
            loc=issue.path,
            input=inputs.get(issue.path, details.get("value", details.get("length"))),
        )
        if context is not None:
            line_error["ctx"] = context
        line_errors.append(line_error)
    raise ValidationError.from_exception_data(model_name, line_errors)


def raise_range_field_error(report: FormulaValidationReport) -> None:
    """Raise one native Pydantic field error while preserving its raw input.

    Pydantic attaches the field location and original submitted value when this
    helper is called from an after field validator.  A field validator must
    therefore pass a report for exactly one scalar or sequence field.
    """

    if report.is_valid:
        return
    if len(report.issues) != 1:
        raise RuntimeError("Field range validator returned more than one issue")
    error_type, context = _pydantic_error_for_issue(report.issues[0])
    raise PydanticKnownError(error_type, context)


def numeric_range_json_schema(
    spec: NumericRangeSpec,
    *,
    schema_type: Literal["number", "integer"],
) -> WithJsonSchema:
    """Return numeric-branch JSON-schema metadata for a core numeric range."""

    schema: dict[str, object] = {"type": schema_type}
    if spec.minimum is not None:
        schema["minimum" if spec.minimum_inclusive else "exclusiveMinimum"] = spec.minimum
    if spec.maximum is not None:
        schema["maximum" if spec.maximum_inclusive else "exclusiveMaximum"] = spec.maximum
    return WithJsonSchema(schema)


def sequence_length_schema_extra(spec: SequenceLengthSpec) -> dict[str, Any]:
    """Return JSON-schema list-length keywords for a core sequence range."""

    schema_extra: dict[str, Any] = {}
    if spec.minimum_length is not None:
        schema_extra["minItems"] = spec.minimum_length
    if spec.maximum_length is not None:
        schema_extra["maxItems"] = spec.maximum_length
    return schema_extra


def _pydantic_error_for_issue(
    issue: FormulaValidationIssue,
) -> tuple[PydanticRangeErrorType, dict[str, object] | None]:
    details = issue.details_dict()
    match issue.code:
        case "below_min_inclusive":
            return "greater_than_equal", {"ge": details["minimum"]}
        case "below_min_exclusive":
            return "greater_than", {"gt": details["minimum"]}
        case "above_max_inclusive":
            return "less_than_equal", {"le": details["maximum"]}
        case "above_max_exclusive":
            return "less_than", {"lt": details["maximum"]}
        case "sequence_too_short":
            return "too_short", {
                "field_type": "List",
                "min_length": details["minimum_length"],
                "actual_length": details["length"],
            }
        case "sequence_too_long":
            return "too_long", {
                "field_type": "List",
                "max_length": details["maximum_length"],
                "actual_length": details["length"],
            }
        case "not_finite":
            return _non_finite_pydantic_error(details)
        case _:
            raise RuntimeError(f"Нет Pydantic range-маппинга для core-ошибки {issue.code!r}")


def _non_finite_pydantic_error(
    details: Mapping[str, int | float],
) -> tuple[PydanticRangeErrorType, dict[str, object] | None]:
    """Match Pydantic's constraint precedence for NaN and infinities."""

    value = details["value"]
    if value != value:  # NaN: native constrained numbers choose the upper bound first.
        if "maximum" in details:
            return _maximum_error(details)
        if "minimum" in details:
            return _minimum_error(details)
    elif value > 0 and "maximum" in details:
        return _maximum_error(details)
    elif value < 0 and "minimum" in details:
        return _minimum_error(details)
    return "finite_number", None


def _minimum_error(
    details: Mapping[str, int | float],
) -> tuple[PydanticRangeErrorType, dict[str, object]]:
    key = "ge" if details.get("minimum_inclusive", 1) else "gt"
    return ("greater_than_equal" if key == "ge" else "greater_than"), {key: details["minimum"]}


def _maximum_error(
    details: Mapping[str, int | float],
) -> tuple[PydanticRangeErrorType, dict[str, object]]:
    key = "le" if details.get("maximum_inclusive", 1) else "lt"
    return ("less_than_equal" if key == "le" else "less_than"), {key: details["maximum"]}
