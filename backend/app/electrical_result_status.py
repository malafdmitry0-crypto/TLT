"""Shared status rules for saved electrical calculation results."""

from typing import Any

FAILED_ELECTRICAL_CATEGORIES = {"validation", "formula", "external"}


def _result_cable_mark(cable_mark: str | None, results: dict[str, Any]) -> Any:
    snapshot = results.get("cable_snapshot")
    snapshot_mark = snapshot.get("cable_mark") if isinstance(snapshot, dict) else None
    return cable_mark or results.get("cable_mark") or results.get("selected_cable") or snapshot_mark


def is_successful_electrical_result(
    cable_mark: str | None,
    results: dict[str, Any] | None,
) -> bool:
    """A result can drive reports/specification only when it has cable data and no issue."""
    if not results:
        return False
    if results.get("error_code") or results.get("category") or results.get("stale") is True:
        return False
    return bool(_result_cable_mark(cable_mark, results))


def is_failed_electrical_result(results: dict[str, Any] | None) -> bool:
    """Structured electrical failure. A plain message is not an error marker."""
    if not results:
        return False
    category = results.get("category")
    return bool(results.get("error_code") or category in FAILED_ELECTRICAL_CATEGORIES)


def electrical_result_status(cable_mark: str | None, results: dict[str, Any] | None) -> str:
    if is_successful_electrical_result(cable_mark, results):
        return "success"
    category = results.get("category") if isinstance(results, dict) else None
    if category == "unsupported":
        return "unsupported"
    if category == "stale" or (isinstance(results, dict) and results.get("stale") is True):
        return "stale"
    return "failed"
