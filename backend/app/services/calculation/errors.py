"""Stable application errors shared by calculation use cases and API adapters."""

from __future__ import annotations

from typing import Any

from app.services.calculation_errors import CalculationError


class BatchCancelledError(CalculationError):
    pass


class ElectricalCalcConcurrencyError(CalculationError):
    """409-class conflicts for assignment version / idempotency."""

    def __init__(
        self,
        *,
        code: str,
        message: str,
        status_code: int = 409,
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details = details or {}

    def as_detail(self) -> dict[str, Any]:
        return {
            "code": self.code,
            "message": self.message,
            "issues": [],
            "details": self.details,
        }


class ElectricalCandidateApplyError(CalculationError):
    """Expected candidate-apply failure with a stable API contract."""

    def __init__(
        self,
        *,
        code: str,
        message: str,
        status_code: int,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code

    def as_detail(self) -> dict[str, str]:
        return {"code": self.code, "message": self.message}
