"""Exceptional failures reserved for impossible mathematics/invariants."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from .validation import _freeze


class TTFormulaDomainError(ValueError):
    """An internal invariant or mathematical operation was impossible."""

    __slots__ = ("code", "details")

    def __init__(
        self, code: str, /, details: Mapping[str, Any] | None = None, **values: Any
    ) -> None:
        if details is not None and values:
            raise TypeError("supply details as mapping or keyword values, not both")
        self.code = code
        self.details = _freeze(dict(details or values))
        super().__init__(code)
