from __future__ import annotations

import math
from typing import Annotated

import pytest
from pydantic import BaseModel, Field, FiniteFloat, ValidationError
from pydantic_core import ErrorDetails

from app.formulas.heat_loss.core.validation import (
    FormulaValidationIssue,
    FormulaValidationPath,
    FormulaValidationReport,
    NumericRangeSpec,
    SequenceLengthSpec,
    validate_numeric_range,
    validate_sequence_length,
)
from app.schemas.heat_loss_core_validation import (
    numeric_range_json_schema,
    raise_range_validation_errors,
    sequence_length_schema_extra,
)


class _BoundsReference(BaseModel):
    ge: float = Field(ge=1)
    gt: float = Field(gt=1)
    le: float = Field(le=3)
    lt: float = Field(lt=3)


class _ListReference(BaseModel):
    values: list[int] = Field(min_length=2, max_length=3)


class _FiniteReference(BaseModel):
    value: FiniteFloat


def _adapter_errors(
    report: FormulaValidationReport, inputs: dict[FormulaValidationPath, object]
) -> list[ErrorDetails]:
    with pytest.raises(ValidationError) as exc_info:
        raise_range_validation_errors(model_name="Reference", report=report, inputs=inputs)
    return exc_info.value.errors(include_url=False)


@pytest.mark.parametrize(
    ("field", "value", "spec"),
    [
        ("ge", 0.0, NumericRangeSpec(minimum=1)),
        ("gt", 1.0, NumericRangeSpec(minimum=1, minimum_inclusive=False)),
        ("le", 4.0, NumericRangeSpec(maximum=3)),
        ("lt", 3.0, NumericRangeSpec(maximum=3, maximum_inclusive=False)),
    ],
)
def test_range_errors_match_native_pydantic_bounds(
    field: str, value: float, spec: NumericRangeSpec
) -> None:
    report = validate_numeric_range(path=(field,), value=value, spec=spec)
    adapter_errors = _adapter_errors(report, {(field,): value})

    native_input = {"ge": 1.0, "gt": 2.0, "le": 3.0, "lt": 2.0}
    native_input[field] = value
    with pytest.raises(ValidationError) as exc_info:
        _BoundsReference(**native_input)
    native_error = next(
        error for error in exc_info.value.errors(include_url=False) if error["loc"] == (field,)
    )

    assert adapter_errors == [native_error]


@pytest.mark.parametrize(
    ("value", "spec"),
    [
        (math.nan, NumericRangeSpec(maximum=3)),
        (math.inf, NumericRangeSpec(maximum=3)),
        (-math.inf, NumericRangeSpec(minimum=1)),
    ],
)
def test_non_finite_range_errors_match_native_bounds(value: float, spec: NumericRangeSpec) -> None:
    report = validate_numeric_range(path=("value",), value=value, spec=spec)
    adapter_errors = _adapter_errors(report, {("value",): value})

    class Reference(BaseModel):
        value: float = Field(le=3) if spec.maximum is not None else Field(ge=1)

    with pytest.raises(ValidationError) as exc_info:
        Reference(value=value)
    assert adapter_errors == exc_info.value.errors(include_url=False)


@pytest.mark.parametrize("value", [math.nan, math.inf, -math.inf])
def test_unbounded_non_finite_error_matches_native_finite_float(value: float) -> None:
    report = validate_numeric_range(path=("value",), value=value, spec=NumericRangeSpec())
    adapter_errors = _adapter_errors(report, {("value",): value})

    with pytest.raises(ValidationError) as exc_info:
        _FiniteReference(value=value)
    assert adapter_errors == exc_info.value.errors(include_url=False)


@pytest.mark.parametrize("values", [[], [1, 2, 3, 4]])
def test_sequence_errors_match_native_pydantic_list(values: list[int]) -> None:
    report = validate_sequence_length(
        path=("values",),
        length=len(values),
        spec=SequenceLengthSpec(minimum_length=2, maximum_length=3),
    )
    adapter_errors = _adapter_errors(report, {("values",): values})

    with pytest.raises(ValidationError) as exc_info:
        _ListReference(values=values)
    assert adapter_errors == exc_info.value.errors(include_url=False)


def test_numeric_schema_metadata_keeps_bounds_in_optional_numeric_branch() -> None:
    spec = NumericRangeSpec(minimum=1, maximum=3, minimum_inclusive=False)

    class Model(BaseModel):
        required_number: Annotated[float, numeric_range_json_schema(spec, schema_type="number")]
        optional_integer: (
            Annotated[int, numeric_range_json_schema(spec, schema_type="integer")] | None
        ) = None

    schema = Model.model_json_schema()
    assert schema["properties"]["required_number"] == {
        "exclusiveMinimum": 1.0,
        "maximum": 3.0,
        "title": "Required Number",
        "type": "number",
    }
    assert schema["properties"]["optional_integer"] == {
        "anyOf": [
            {"exclusiveMinimum": 1, "maximum": 3, "type": "integer"},
            {"type": "null"},
        ],
        "default": None,
        "title": "Optional Integer",
    }
    assert schema["required"] == ["required_number"]


def test_sequence_schema_extra_uses_json_schema_list_keywords() -> None:
    assert sequence_length_schema_extra(SequenceLengthSpec(minimum_length=1, maximum_length=3)) == {
        "minItems": 1,
        "maxItems": 3,
    }


def test_relational_core_issue_is_not_silently_represented_as_a_range_error() -> None:
    report = FormulaValidationReport((FormulaValidationIssue("wall_exceeds_pipe_radius"),))

    with pytest.raises(RuntimeError, match="Нет Pydantic range-маппинга"):
        raise_range_validation_errors(model_name="Reference", report=report, inputs={})
