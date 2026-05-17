"""Shared guards for spreadsheet exports."""

from __future__ import annotations

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
