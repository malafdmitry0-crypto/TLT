"""Shared guards for spreadsheet exports."""

from __future__ import annotations

from collections.abc import Iterable
from typing import Any

DANGEROUS_SPREADSHEET_PREFIXES = ("=", "+", "-", "@")


def safe_spreadsheet_cell(value: Any) -> Any:
    """Prevent spreadsheet clients from interpreting exported text as a formula."""
    if not isinstance(value, str):
        return value
    stripped = value.lstrip()
    if stripped.startswith(DANGEROUS_SPREADSHEET_PREFIXES):
        return "'" + value
    return value


def safe_spreadsheet_row(values: Iterable[Any]) -> list[Any]:
    """Return a row with every text cell guarded for spreadsheet export."""
    return [safe_spreadsheet_cell(value) for value in values]


def set_safe_cell(ws: Any, row: int, column: int, value: Any) -> Any:
    """Set an openpyxl cell after formula-injection guarding."""
    return ws.cell(row=row, column=column, value=safe_spreadsheet_cell(value))


def append_safe_row(ws: Any, values: Iterable[Any]) -> None:
    """Append an openpyxl row after formula-injection guarding."""
    ws.append(safe_spreadsheet_row(values))
