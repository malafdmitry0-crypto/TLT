"""Canonical validate → prepare → evaluate TT public flow."""

from __future__ import annotations

from .contracts import TTFormulaResult, TTPreparationInput
from .errors import TTFormulaDomainError
from .formula_outcome import TTFormulaOutcome
from .tt_contract import validate_tt_contract
from .tt_evaluation import execute_tt_kernel
from .validation import VALID_TT_FORMULA_REPORT, TTFormulaIssue, TTFormulaReport

__all__ = [
    "evaluate_prepared_tt",
    "execute_tt_kernel",
    "prepare_tt_calculation",
    "run_tt_formula",
    "validate_tt_preparation",
]


def validate_tt_preparation(data: TTPreparationInput) -> TTFormulaReport:
    return validate_tt_contract(data)


def prepare_tt_calculation(data: TTPreparationInput) -> TTPreparationInput | TTFormulaReport:
    report = validate_tt_preparation(data)
    return data if report.is_valid else report


def evaluate_prepared_tt(data: TTPreparationInput) -> TTFormulaOutcome[TTFormulaResult]:
    try:
        evaluated = execute_tt_kernel(data)
    except TTFormulaDomainError as error:
        # These are reachable selections/section rows, not transport exceptions.
        if error.code in {
            "ELECTRICAL_SECTION_CATALOG_ROW_NOT_FOUND",
            "ELECTRICAL_SECTION_PLAN_INVALID",
            "SECTION_CURRENT_LIMIT_REQUIRED",
            "ELECTRICAL_WINDING_PITCH_INVALID",
            "ELECTRICAL_WINDING_FACTOR_LIMIT_EXCEEDED",
        }:
            return TTFormulaOutcome(
                None, TTFormulaReport((TTFormulaIssue(error.code, details=error.details),))
            )
        raise
    if isinstance(evaluated, TTFormulaReport):
        return TTFormulaOutcome(None, evaluated)
    return TTFormulaOutcome(evaluated, VALID_TT_FORMULA_REPORT)


def run_tt_formula(data: TTPreparationInput) -> TTFormulaOutcome[TTFormulaResult]:
    prepared = prepare_tt_calculation(data)
    if isinstance(prepared, TTFormulaReport):
        return TTFormulaOutcome(None, prepared)
    return evaluate_prepared_tt(prepared)
