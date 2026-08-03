"""Object-level params normalization and validation.

Formula schemas own physical/material constraints. Project objects add UI/business
semantics: fields with form defaults must be persisted, and non-defaultable
required fields must make the object invalid before formulas run.
"""

from collections.abc import Mapping
from typing import Any

from app.schemas.calculation import StoredPipeHeatParams, StoredTankHeatParams
from app.services.heat_contract import (
    COMMON_HEAT_PARAM_KEYS,
    PIPE_HEAT_PARAM_KEYS,
    TANK_HEAT_PARAM_KEYS,
)


class ProjectObjectParamsError(ValueError):
    """Object params are incomplete for a project object."""


LEGACY_SPECIFICATION_OBJECT_PARAM_KEYS = frozenset(
    {
        "explosion_zone_type",
        "power_indication_on_boxes",
        "end_of_section_indication",
        "top_of_box_indication",
        "min_length_for_k2i",
        "hot_reserve_coefficient",
    }
)


class LegacySpecificationObjectParamsError(ProjectObjectParamsError):
    """A write attempted to put project-scoped specification options on an object."""

    code = "OBJECT_SPECIFICATION_SETTINGS_SCOPE_VIOLATION"

    def __init__(self, fields: tuple[str, ...]) -> None:
        super().__init__("Параметры спецификации запрещены в данных объекта")
        self.fields = fields


def reject_legacy_specification_object_params(params: Mapping[str, Any] | None) -> None:
    """Reject legacy specification keys at object-write boundaries.

    This is intentionally separate from normalization: existing database rows
    may still contain these inert keys and must remain readable until a future
    explicit data migration removes them.
    """

    fields = tuple(sorted(LEGACY_SPECIFICATION_OBJECT_PARAM_KEYS.intersection(params or {})))
    if fields:
        raise LegacySpecificationObjectParamsError(fields)


COMMON_OBJECT_DEFAULTS: dict[str, Any] = {
    "insulation_cover_material": "none",
    "max_ambient_temperature": 30,
    "max_process_temperature": 90,
    "environment": "normal",
    "zone_classification": "safe",
    "temperature_group": "T1",
    "min_switch_temperature": -20,
    "supply_voltage": 220,
    "steam_tracing": "no",
}

TANK_OBJECT_DEFAULTS: dict[str, Any] = {
    "shape": "cylindrical",
    "q_additional": 0,
}


def normalize_project_object_params(
    object_type: str, params: Mapping[str, Any] | None
) -> dict[str, Any]:
    """Return params with object-form defaults persisted.

    Defaults are applied only when a key is absent. Explicit ``None`` / empty
    values are left intact so validation can catch deliberately blank required
    fields.
    """

    normalized = dict(params or {})
    if object_type not in ("pipe", "tank"):
        return normalized

    _apply_defaults(normalized, COMMON_OBJECT_DEFAULTS)
    if "safety_factor" not in normalized:
        normalized["safety_factor"] = 1.1
        normalized.setdefault("safety_factor_source", "default")
    if object_type == "pipe":
        _normalize_climate_key(normalized)
        if "num_local_elements" not in normalized:
            normalized["num_local_elements"] = 0
        return normalized
    elif object_type == "tank":
        _normalize_climate_key(normalized)
        _apply_defaults(normalized, TANK_OBJECT_DEFAULTS)

    return normalized


def prepare_project_object_params(
    object_type: str, params: Mapping[str, Any] | None
) -> dict[str, Any]:
    """Normalize params and raise when required project-object fields are missing."""

    normalized = normalize_project_object_params(object_type, params)
    validate_project_object_params(object_type, normalized)
    if object_type == "pipe":
        heat_keys = COMMON_HEAT_PARAM_KEYS | PIPE_HEAT_PARAM_KEYS
        stored = StoredPipeHeatParams(
            **{key: value for key, value in normalized.items() if key in heat_keys}
        )
        normalized = {
            **{key: value for key, value in normalized.items() if key not in heat_keys},
            **stored.model_dump(exclude_none=True),
        }
    elif object_type == "tank":
        heat_keys = COMMON_HEAT_PARAM_KEYS | TANK_HEAT_PARAM_KEYS
        stored = StoredTankHeatParams(
            **{key: value for key, value in normalized.items() if key in heat_keys}
        )
        normalized = {
            **{key: value for key, value in normalized.items() if key not in heat_keys},
            **stored.model_dump(exclude_none=True),
        }
    return normalized


def validate_project_object_params(object_type: str, params: Mapping[str, Any]) -> None:
    """Validate object-level required fields before heat-loss formulas run."""

    missing: list[str] = []
    if object_type == "pipe":
        _validate_pipe_params(params, missing)
    elif object_type == "tank":
        _validate_tank_params(params, missing)
    else:
        raise ProjectObjectParamsError(f"Неподдерживаемый тип объекта: {object_type}")

    if missing:
        unique_missing = list(dict.fromkeys(missing))
        raise ProjectObjectParamsError(
            "Не заполнены обязательные поля объекта: " + ", ".join(unique_missing)
        )


def _apply_defaults(params: dict[str, Any], defaults: Mapping[str, Any]) -> None:
    for key, value in defaults.items():
        if key not in params:
            params[key] = value


def _normalize_climate_key(params: dict[str, Any]) -> None:
    key = params.get("climate_key")
    if key and "|||" in str(key):
        region_from_key, city_from_key = str(key).split("|||", 1)
        params.setdefault("climate_region", region_from_key)
        params.setdefault("climate_city", city_from_key)
    city = params.get("climate_city")
    region = params.get("climate_region")
    if not city or not region:
        return
    params["climate_key"] = f"{region}|||{city}"


def _validate_pipe_params(params: Mapping[str, Any], missing: list[str]) -> None:
    heat_keys = COMMON_HEAT_PARAM_KEYS | PIPE_HEAT_PARAM_KEYS
    heat_payload = {key: value for key, value in params.items() if key in heat_keys}
    try:
        StoredPipeHeatParams(**heat_payload)
    except ValueError as exc:
        raise ProjectObjectParamsError(str(exc)) from exc


def _validate_tank_params(params: Mapping[str, Any], missing: list[str]) -> None:
    heat_keys = COMMON_HEAT_PARAM_KEYS | TANK_HEAT_PARAM_KEYS
    try:
        StoredTankHeatParams(**{key: value for key, value in params.items() if key in heat_keys})
    except ValueError as exc:
        raise ProjectObjectParamsError(str(exc)) from exc
