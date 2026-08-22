"""Application errors exposed by the specification catalog boundary."""

from __future__ import annotations

from typing import Any


class SpecificationCatalogServiceError(Exception):
    def __init__(
        self,
        code: str,
        message: str,
        *,
        status_code: int,
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details = details or {}

    def as_detail(self) -> dict[str, Any]:
        issues = self.details.get("issues", [])
        details = {key: value for key, value in self.details.items() if key != "issues"}
        return {
            "code": self.code,
            "message": self.message,
            "issues": issues,
            "details": details,
        }
