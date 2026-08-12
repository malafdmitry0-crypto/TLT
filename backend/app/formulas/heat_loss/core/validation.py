"""Structured validation results for the pure heat-loss formula domain."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Self, TypeAlias

FormulaValidationNumber: TypeAlias = float | int
FormulaValidationCode: TypeAlias = Literal[
    "wall_exceeds_pipe_radius",
    "process_temperature_not_above_ambient",
    "process_temperature_not_above_ground",
    "ground_centerline_inside_pipe",
    "wall_exceeds_tank_radius",
    "invalid_buried_height",
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

    @classmethod
    def with_details(
        cls,
        code: FormulaValidationCode,
        /,
        **details: FormulaValidationNumber,
    ) -> Self:
        return cls(code=code, details=tuple(details.items()))

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
