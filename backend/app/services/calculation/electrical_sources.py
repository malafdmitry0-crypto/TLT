"""Normalization rules for persisted electrical input provenance."""

from typing import Any

from app.models.electrical_calculation import ElectricalCalculation

CABLE_TYPE_SOURCE_AUTO = "auto"
CABLE_TYPE_SOURCE_MANUAL = "manual"
CABLE_TYPE_SOURCE_BULK = "bulk"
VALID_CABLE_TYPE_SOURCES = {
    CABLE_TYPE_SOURCE_AUTO,
    CABLE_TYPE_SOURCE_MANUAL,
    CABLE_TYPE_SOURCE_BULK,
}
CABLE_MARK_SOURCE_AUTO = "auto"
CABLE_MARK_SOURCE_MANUAL = "manual"
VALID_CABLE_MARK_SOURCES = {
    CABLE_MARK_SOURCE_AUTO,
    CABLE_MARK_SOURCE_MANUAL,
}
THREAD_SOURCE_MANUAL = "manual"
THREAD_SOURCE_AUTO = "auto"
THREAD_SOURCE_DEFAULT = "default"
THREAD_SOURCE_PREVIOUS_RESULT = "previous_result"
VALID_THREAD_SOURCES = {
    THREAD_SOURCE_MANUAL,
    THREAD_SOURCE_AUTO,
    THREAD_SOURCE_DEFAULT,
    THREAD_SOURCE_PREVIOUS_RESULT,
}


def normalize_cable_type_source(value: Any) -> str:
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in VALID_CABLE_TYPE_SOURCES:
            return normalized
    return CABLE_TYPE_SOURCE_AUTO


def existing_cable_type_source(calculation: ElectricalCalculation | None) -> str:
    if calculation is None:
        return CABLE_TYPE_SOURCE_AUTO
    calculation_dict = getattr(calculation, "__dict__", {})
    if "cable_type_source" in calculation_dict:
        return normalize_cable_type_source(calculation_dict.get("cable_type_source"))
    params = getattr(calculation, "params", None)
    if isinstance(params, dict):
        return normalize_cable_type_source(params.get("cable_type_source"))
    return CABLE_TYPE_SOURCE_AUTO


def normalize_cable_mark_source(value: Any) -> str:
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in VALID_CABLE_MARK_SOURCES:
            return normalized
    return CABLE_MARK_SOURCE_AUTO


def is_manual_cable_selection(calculation: ElectricalCalculation) -> bool:
    source = getattr(calculation, "cable_mark_source", None)
    if normalize_cable_mark_source(source) == CABLE_MARK_SOURCE_MANUAL:
        return True
    source_is_known_auto = (
        isinstance(source, str) and source.strip().lower() == CABLE_MARK_SOURCE_AUTO
    )
    params = getattr(calculation, "params", None)
    if isinstance(params, dict):
        params_source = params.get("cable_mark_source")
        if normalize_cable_mark_source(params_source) == CABLE_MARK_SOURCE_MANUAL:
            return True
        if (
            isinstance(params_source, str)
            and params_source.strip().lower() == CABLE_MARK_SOURCE_AUTO
        ):
            source_is_known_auto = True
        cable_mark = params.get("cable_mark")
        if isinstance(cable_mark, str) and cable_mark.strip() != "":
            return True
    cable_mark = getattr(calculation, "cable_mark", None)
    return isinstance(cable_mark, str) and cable_mark.strip() != "" and not source_is_known_auto


def normalize_thread_source(value: Any) -> str | None:
    if isinstance(value, str) and value in VALID_THREAD_SOURCES:
        return value
    return None


def resolve_cable_mark_source(data: dict[str, Any]) -> str:
    source = data.get("cable_mark_source")
    if isinstance(source, str):
        normalized = source.strip().lower()
        if normalized in VALID_CABLE_MARK_SOURCES:
            return normalized
    return CABLE_MARK_SOURCE_MANUAL if data.get("cable_mark") else CABLE_MARK_SOURCE_AUTO


def compact_electrical_params(data: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in data.items() if key != "cable_catalog"}
