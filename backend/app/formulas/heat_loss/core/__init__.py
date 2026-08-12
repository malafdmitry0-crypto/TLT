"""Pure numeric heat-loss core with no application-layer dependencies."""

from .errors import FormulaDomainError
from .insulation_validation import (
    validate_insulation_conductivity,
    validate_insulation_layer_count,
    validate_insulation_layer_ranges,
    validate_insulation_thickness,
)
from .pipe import validate_pipe_formula_domain
from .pipe_validation import validate_pipe_input_ranges
from .tank import validate_tank_formula_domain
from .tank_validation import validate_tank_input_ranges
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
    "validate_insulation_conductivity",
    "validate_insulation_layer_count",
    "validate_insulation_layer_ranges",
    "validate_insulation_thickness",
    "validate_numeric_range",
    "validate_pipe_formula_domain",
    "validate_pipe_input_ranges",
    "validate_range_checks",
    "validate_sequence_length",
    "validate_tank_formula_domain",
    "validate_tank_input_ranges",
]
