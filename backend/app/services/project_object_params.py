"""Object-level params normalization and validation.

Formula schemas own physical/material constraints. Project objects add UI/business
semantics: fields with form defaults must be persisted, and non-defaultable
required fields must make the object invalid before formulas run.
"""

import math
from collections.abc import Mapping
from numbers import Real
from typing import Any

from pydantic import ValidationError

from app.schemas.calculation import StoredPipeHeatParams, StoredTankHeatParams
from app.services.heat_contract import (
    COMMON_HEAT_PARAM_KEYS,
    PIPE_HEAT_PARAM_KEYS,
    TANK_HEAT_PARAM_KEYS,
)


class ProjectObjectParamsError(ValueError):
    """Object params are incomplete for a project object."""

    code: str | None = None
    fields: tuple[str, ...] = ()
    reason: str | None = None

    def __init__(
        self,
        message: str,
        *,
        code: str | None = None,
        fields: tuple[str, ...] = (),
        reason: str | None = None,
    ) -> None:
        super().__init__(message)
        if code is not None:
            self.code = code
        if fields:
            self.fields = fields
        if reason is not None:
            self.reason = reason


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


SUPPORTED_TANK_SHAPES = frozenset({"cylindrical", "rectangular"})


class UnsupportedTankShapeError(ProjectObjectParamsError):
    """A write or import used a tank shape removed from the product contract."""

    code = "TANK_SHAPE_UNSUPPORTED"
    fields = ("shape",)

    def __init__(self, shape: object) -> None:
        super().__init__(
            f"Форма резервуара {shape!r} больше не поддерживается. "
            "Допустимые формы: cylindrical, rectangular."
        )


def reject_legacy_specification_object_params(params: Mapping[str, Any] | None) -> None:
    """Reject legacy specification keys at object-write boundaries.

    This is intentionally separate from normalization: existing database rows
    may still contain these inert keys and must remain readable until a future
    explicit data migration removes them.
    """

    fields = tuple(sorted(LEGACY_SPECIFICATION_OBJECT_PARAM_KEYS.intersection(params or {})))
    if fields:
        raise LegacySpecificationObjectParamsError(fields)


def reject_unsupported_tank_shape(
    object_type: str,
    params: Mapping[str, Any] | None,
) -> None:
    """Reject removed or unknown tank shapes at every object-write boundary."""

    if object_type != "tank" or "shape" not in (params or {}):
        return
    shape = (params or {}).get("shape")
    if not isinstance(shape, str) or shape not in SUPPORTED_TANK_SHAPES:
        raise UnsupportedTankShapeError(shape)


COMMON_OBJECT_DEFAULTS: dict[str, Any] = {
    "insulation_cover_material": "none",
    "max_ambient_temperature": 30,
    "max_process_temperature": 90,
    "environment": "normal",
    "zone_classification": "safe",
    "temperature_group": "T1",
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

    reject_unsupported_tank_shape(object_type, normalized)

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

    missing, invalid = _validate_downstream_required_inputs(object_type, params)
    schema_error: ProjectObjectParamsError | None = None
    try:
        if object_type == "pipe":
            _validate_pipe_params(params, [])
        elif object_type == "tank":
            _validate_tank_params(params, [])
        else:
            raise ProjectObjectParamsError(f"Неподдерживаемый тип объекта: {object_type}")
    except ProjectObjectParamsError as exc:
        schema_error = exc

    if schema_error is not None:
        fields = tuple(dict.fromkeys((*schema_error.fields, *missing, *invalid)))
        has_invalid = schema_error.code != "OBJECT_REQUIRED_FIELDS_MISSING" or bool(invalid)
        raise ProjectObjectParamsError(
            "Проверьте параметры объекта" if has_invalid else "Заполните обязательные поля объекта",
            code="OBJECT_PARAMS_INVALID" if has_invalid else "OBJECT_REQUIRED_FIELDS_MISSING",
            fields=fields,
            reason=schema_error.reason,
        ) from schema_error

    if invalid:
        raise ProjectObjectParamsError(
            "Проверьте параметры объекта",
            code="OBJECT_PARAMS_INVALID",
            fields=tuple(dict.fromkeys((*missing, *invalid))),
        )
    if missing:
        raise ProjectObjectParamsError(
            "Заполните обязательные поля объекта",
            code="OBJECT_REQUIRED_FIELDS_MISSING",
            fields=tuple(dict.fromkeys(missing)),
        )


def _validate_downstream_required_inputs(
    object_type: str,
    params: Mapping[str, Any],
) -> tuple[list[str], list[str]]:
    """Validate required object-card inputs used after the heat formula."""

    required_ranges: dict[str, tuple[float | None, float | None]] = {
        "min_switch_temperature": (-40.0, 10.0),
    }
    if object_type == "tank":
        required_ranges.update(
            {
                "heating_height": (0.0, None),
                "laying_step": (0.1, 0.4),
            }
        )

    missing: list[str] = []
    invalid: list[str] = []
    for field, (minimum, maximum) in required_ranges.items():
        value = params.get(field)
        if value is None or value == "":
            missing.append(field)
            continue
        if isinstance(value, bool) or not isinstance(value, Real):
            invalid.append(field)
            continue
        numeric = float(value)
        if not math.isfinite(numeric):
            invalid.append(field)
            continue
        if minimum is not None:
            if field == "heating_height" and numeric <= minimum:
                invalid.append(field)
                continue
            if field != "heating_height" and numeric < minimum:
                invalid.append(field)
                continue
        if maximum is not None and numeric > maximum:
            invalid.append(field)
    return missing, invalid


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
    except ValidationError as exc:
        raise _project_object_params_validation_error(exc) from exc


def _validate_tank_params(params: Mapping[str, Any], missing: list[str]) -> None:
    heat_keys = COMMON_HEAT_PARAM_KEYS | TANK_HEAT_PARAM_KEYS
    try:
        StoredTankHeatParams(**{key: value for key, value in params.items() if key in heat_keys})
    except ValidationError as exc:
        raise _project_object_params_validation_error(exc) from exc


def _project_object_params_validation_error(exc: ValidationError) -> ProjectObjectParamsError:
    errors = exc.errors()
    fields = _validation_error_fields(errors)
    reason = _validation_error_reason(errors)
    only_missing = bool(errors) and all(error.get("type") == "missing" for error in errors)
    if only_missing:
        return ProjectObjectParamsError(
            "Заполните обязательные поля объекта",
            code="OBJECT_REQUIRED_FIELDS_MISSING",
            fields=fields,
            reason=reason,
        )
    return ProjectObjectParamsError(
        "Проверьте параметры объекта",
        code="OBJECT_PARAMS_INVALID",
        fields=fields,
        reason=reason,
    )


def _validation_error_fields(errors: list[dict[str, Any]]) -> tuple[str, ...]:
    fields: list[str] = []
    model_error_fields = (
        ("режим tm", ("insulation_temperature_basis",)),
        ("process_temperature_not_above", ("process_temperature",)),
        ("для цилиндра требуются diameter и height", ("diameter", "height")),
        (
            "для параллелепипеда требуются length, width и height",
            ("length", "width", "height"),
        ),
    )
    for error in errors:
        loc = error.get("loc")
        context = error.get("ctx")
        message = str(context.get("error", "")) if isinstance(context, dict) else ""
        lower_message = message.lower()
        if isinstance(loc, tuple | list) and loc:
            path = ".".join(str(part) for part in loc)
            if "неизвестный материал" in lower_message and path.startswith(
                "insulation_layers."
            ):
                path = f"{path}.material"
            fields.append(path)
            continue
        for marker, inferred_fields in model_error_fields:
            if marker in lower_message:
                fields.extend(inferred_fields)
                break
    return tuple(dict.fromkeys(fields))


def _validation_error_reason(errors: list[dict[str, Any]]) -> str | None:
    for error in errors:
        context = error.get("ctx")
        message = str(context.get("error", "")) if isinstance(context, dict) else ""
        for reason in (
            "process_temperature_not_above_ambient",
            "process_temperature_not_above_ground",
        ):
            if reason in message:
                return reason
    return None
