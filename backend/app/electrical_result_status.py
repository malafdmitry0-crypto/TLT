"""Shared status rules for saved electrical calculation results."""

from decimal import Decimal, InvalidOperation
from typing import Any

from heatcalc_electrical_core import (
    ELECTRICAL_TT_FORMULA_FINGERPRINT,
    ELECTRICAL_TT_FORMULA_VERSION,
)

FAILED_ELECTRICAL_CATEGORIES = {"validation", "formula", "external"}


def _result_cable_mark(cable_mark: str | None, results: dict[str, Any]) -> Any:
    snapshot = results.get("cable_snapshot")
    snapshot_mark = snapshot.get("cable_mark") if isinstance(snapshot, dict) else None
    return cable_mark or results.get("cable_mark") or results.get("selected_cable") or snapshot_mark


def _mapping(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _positive_number(value: Any) -> bool:
    try:
        number = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return False
    return number.is_finite() and number > 0


def electrical_result_stale_reason(
    cable_mark: str | None,
    results: dict[str, Any] | None,
) -> str | None:
    """Classify a saved TT-v3 snapshot against the current immutable contract.

    Legacy ``ТЛТ-*`` marks are stale even in untyped historical rows. Other
    untyped/non-TT payloads remain outside this TT lifecycle gate.
    """
    if not isinstance(results, dict):
        return None
    mark = str(_result_cable_mark(cable_mark, results) or "").strip().upper()
    if mark.startswith("ТЛТ-"):
        return "legacy_cable_mark"
    if results.get("cable_type") != "self_regulating_tt":
        return None
    category = results.get("category")
    if (
        results.get("error_code")
        or category in FAILED_ELECTRICAL_CATEGORIES
        or category in {"stale", "unsupported"}
        or results.get("stale") is True
    ):
        return None
    electrical = _mapping(results.get("electrical"))
    resolved = _mapping(results.get("resolved_inputs"))
    voltage = electrical.get("nominal_voltage_v", resolved.get("nominal_voltage_v"))
    if voltage is None:
        voltage = results.get("voltage")
    if not _positive_number(voltage):
        return "invalid_or_missing_nominal_voltage"

    provenance = _mapping(results.get("provenance"))
    formula_version = provenance.get("formula_version")
    formula_fingerprint = provenance.get("formula_fingerprint")
    if not formula_version or not formula_fingerprint:
        return "formula_fingerprint_missing"
    if (
        formula_version != ELECTRICAL_TT_FORMULA_VERSION
        or formula_fingerprint != ELECTRICAL_TT_FORMULA_FINGERPRINT
    ):
        return "formula_version_changed"

    catalogs = _mapping(results.get("catalogs")) or _mapping(provenance.get("catalogs"))
    for kind in ("power", "section", "bom"):
        catalog = _mapping(catalogs.get(kind))
        checksum = catalog.get("source_checksum") or catalog.get("payload_checksum")
        if not isinstance(checksum, str) or not checksum.strip():
            return f"{kind}_catalog_fingerprint_missing"

    section_plan = _mapping(results.get("section_plan"))
    current_limit = resolved.get("max_section_start_current_a")
    if current_limit is None:
        current_limit = section_plan.get("max_start_current_a")
    if current_limit is None or str(current_limit).strip() == "":
        return "section_current_limit_missing"
    return None


def electrical_result_with_lifecycle(
    cable_mark: str | None,
    results: dict[str, Any] | None,
) -> dict[str, Any] | None:
    """Return a read-only stale overlay without rewriting the stored snapshot."""
    if not isinstance(results, dict):
        return results
    reason = electrical_result_stale_reason(cable_mark, results)
    if reason is None or results.get("category") == "stale" or results.get("stale") is True:
        return results
    return {
        **results,
        "stale": True,
        "category": "stale",
        "error_code": "ELECTRICAL_RECALCULATION_REQUIRED",
        "stale_reason": reason,
        "message": "Сохранённый электрорасчёт не соответствует текущему контракту",
    }


def is_successful_electrical_result(
    cable_mark: str | None,
    results: dict[str, Any] | None,
) -> bool:
    """A result can drive reports/specification only when it has cable data and no issue."""
    if not results:
        return False
    if electrical_result_stale_reason(cable_mark, results) is not None:
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
    category = results.get("category") if isinstance(results, dict) else None
    if category == "unsupported":
        return "unsupported"
    if category == "stale" or (isinstance(results, dict) and results.get("stale") is True):
        return "stale"
    if electrical_result_stale_reason(cable_mark, results) is not None:
        return "stale"
    if is_successful_electrical_result(cable_mark, results):
        return "success"
    return "failed"
