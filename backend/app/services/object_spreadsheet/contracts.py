"""Typed contracts shared by object spreadsheet import owners."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class PreparedImportRows:
    rows: list[tuple[dict[str, Any], dict[str, Any]]]
    errors: list[dict[str, Any]]
    validation_errors: list[dict[str, Any]]
    invalid: int
