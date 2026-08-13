"""Success-or-failure outcomes for high-level heat-loss formula calls."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Generic, TypeVar

from .validation import VALID_FORMULA_VALIDATION_REPORT, FormulaValidationReport

ResultT = TypeVar("ResultT")


@dataclass(frozen=True)
class FormulaOutcome(Generic[ResultT]):
    """Either a successful result or a blocking report, never both."""

    result: ResultT | None
    report: FormulaValidationReport = VALID_FORMULA_VALIDATION_REPORT

    def __post_init__(self) -> None:
        if self.result is not None and not self.report.is_valid:
            raise ValueError("successful formula result cannot carry blocking errors")
        if self.result is None and self.report.is_valid:
            raise ValueError("formula failure requires a non-empty validation report")

    @property
    def is_success(self) -> bool:
        return self.result is not None
