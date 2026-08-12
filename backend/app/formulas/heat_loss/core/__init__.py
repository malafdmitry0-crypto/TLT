"""Pure numeric heat-loss core with no application-layer dependencies."""

from .errors import FormulaDomainError
from .pipe import validate_pipe_formula_domain
from .tank import validate_tank_formula_domain
from .validation import (
    FormulaValidationCode,
    FormulaValidationIssue,
    FormulaValidationReport,
    NumericRangeCheck,
    NumericRangeSpec,
    SequenceLengthCheck,
    SequenceLengthSpec,
    validate_numeric_range,
    validate_range_checks,
    validate_sequence_length,
)

__all__ = [
    "FormulaDomainError",
    "FormulaValidationCode",
    "FormulaValidationIssue",
    "FormulaValidationReport",
    "NumericRangeCheck",
    "NumericRangeSpec",
    "SequenceLengthCheck",
    "SequenceLengthSpec",
    "validate_numeric_range",
    "validate_pipe_formula_domain",
    "validate_range_checks",
    "validate_sequence_length",
    "validate_tank_formula_domain",
]
