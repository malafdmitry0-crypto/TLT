"""Pure numeric heat-loss core with no application-layer dependencies."""

from .errors import FormulaDomainError
from .pipe import validate_pipe_formula_domain
from .tank import validate_tank_formula_domain
from .validation import FormulaValidationCode, FormulaValidationIssue, FormulaValidationReport

__all__ = [
    "FormulaDomainError",
    "FormulaValidationCode",
    "FormulaValidationIssue",
    "FormulaValidationReport",
    "validate_pipe_formula_domain",
    "validate_tank_formula_domain",
]
