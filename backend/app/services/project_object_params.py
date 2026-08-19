"""Object-level params normalization and validation.

Formula schemas own physical/material constraints. Project objects add UI/business
semantics: fields with form defaults must be persisted, and non-defaultable
required fields must make the object invalid before formulas run.
"""

import math
from collections.abc import Mapping
from dataclasses import dataclass
from numbers import Real
from typing import Any, TypeAlias

from pydantic import ValidationError
from pydantic_core import ErrorDetails

from app.schemas.heat_loss import StoredPipeHeatParams, StoredTankHeatParams
from app.services.heat_contract import (
    COMMON_HEAT_PARAM_KEYS,
    PIPE_HEAT_PARAM_KEYS,
    TANK_HEAT_PARAM_KEYS,
)

StoredHeatParams: TypeAlias = StoredPipeHeatParams | StoredTankHeatParams


@dataclass(frozen=True)
class ValidationIssue:
    """One structured object-input problem found at the final backend boundary."""

    code: str
    field: str | None
    message: str
    category: str = "validation"
    reason: str | None = None


@dataclass(frozen=True)
class ValidationReport:
    """Complete validation outcome without using expected invalidity as control flow."""

    issues: tuple[ValidationIssue, ...] = ()

    @property
    def is_valid(self) -> bool:
        return not self.issues

    @property
    def fields(self) -> tuple[str, ...]:
        return tuple(dict.fromkeys(issue.field for issue in self.issues if issue.field is not None))

    def to_legacy_error(self) -> "ProjectObjectParamsError":
        """Adapt the internal report to the existing exception/error-JSON contract."""

        if self.is_valid:
            raise RuntimeError("Нельзя преобразовать валидный отчёт в ошибку")
        unsupported = next(
            (issue for issue in self.issues if issue.category == "unsupported"),
            None,
        )
        if unsupported is not None:
            return ProjectObjectParamsError(
                unsupported.message,
                code=unsupported.code,
                fields=self.fields,
                reason=unsupported.reason,
            )
        has_invalid = any(issue.code != "OBJECT_REQUIRED_FIELDS_MISSING" for issue in self.issues)
        reason = next((issue.reason for issue in self.issues if issue.reason is not None), None)
        return ProjectObjectParamsError(
            "Проверьте параметры объекта" if has_invalid else "Заполните обязательные поля объекта",
            code="OBJECT_PARAMS_INVALID" if has_invalid else "OBJECT_REQUIRED_FIELDS_MISSING",
            fields=self.fields,
            reason=reason,
        )


@dataclass(frozen=True)
class PreparedProjectObjectParams:
    """Normalized params, their report, and a trusted formula input when valid."""

    params: dict[str, Any]
    report: ValidationReport
    heat_params: StoredHeatParams | None


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
AMBIENT_TEMPERATURE_MINIMUM = -70.0
AMBIENT_TEMPERATURE_MAXIMUM = 70.0
MAX_AMBIENT_TEMPERATURE_FIELD = "max_ambient_temperature"


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

    validate_ambient_temperature_maximum(normalized)
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


def validate_ambient_temperature_maximum(params: Mapping[str, Any]) -> None:
    """Validate optional ambient metadata against the resolved minimum."""

    if MAX_AMBIENT_TEMPERATURE_FIELD not in params:
        return
    value = params[MAX_AMBIENT_TEMPERATURE_FIELD]
    if value is None:
        return

    numeric = _finite_real(value)
    if (
        numeric is None
        or numeric < AMBIENT_TEMPERATURE_MINIMUM
        or numeric > AMBIENT_TEMPERATURE_MAXIMUM
    ):
        raise ProjectObjectParamsError(
            "Максимальная температура окружающей среды должна быть конечным числом "
            "в диапазоне −70…70 °C",
            code="OBJECT_PARAMS_INVALID",
            fields=(MAX_AMBIENT_TEMPERATURE_FIELD,),
        )

    minimum = _finite_real(params.get("ambient_temperature"))
    if minimum is not None and numeric < minimum:
        raise ProjectObjectParamsError(
            "Максимальная температура окружающей среды не может быть ниже минимальной",
            code="OBJECT_PARAMS_INVALID",
            fields=(MAX_AMBIENT_TEMPERATURE_FIELD,),
        )


def _finite_real(value: object) -> float | None:
    if isinstance(value, bool) or not isinstance(value, Real):
        return None
    try:
        numeric = float(value)
    except (OverflowError, ValueError):
        return None
    return numeric if math.isfinite(numeric) else None


def prepare_project_object_params(
    object_type: str, params: Mapping[str, Any] | None
) -> dict[str, Any]:
    """Compatibility wrapper around the report-based preparation boundary."""

    normalized = normalize_project_object_params(object_type, params)
    prepared = validate_and_canonicalize_project_object_params(object_type, normalized)
    if not prepared.report.is_valid:
        raise prepared.report.to_legacy_error()
    return prepared.params


def build_stored_heat_params(
    object_type: str,
    params: Mapping[str, Any],
) -> StoredHeatParams:
    """Run the canonical heat-input Pydantic contract exactly once."""

    if object_type == "pipe":
        heat_keys = COMMON_HEAT_PARAM_KEYS | PIPE_HEAT_PARAM_KEYS
        return StoredPipeHeatParams(
            **{key: value for key, value in params.items() if key in heat_keys}
        )
    if object_type == "tank":
        heat_keys = COMMON_HEAT_PARAM_KEYS | TANK_HEAT_PARAM_KEYS
        return StoredTankHeatParams(
            **{key: value for key, value in params.items() if key in heat_keys}
        )
    raise ProjectObjectParamsError(
        f"Неподдерживаемый тип объекта: {object_type}",
        code="OBJECT_TYPE_UNSUPPORTED",
    )


def validate_and_canonicalize_project_object_params(
    object_type: str,
    params: Mapping[str, Any],
) -> PreparedProjectObjectParams:
    """Return the one final report and canonical formula input without raising."""

    stored: StoredHeatParams | None = None
    issues: list[ValidationIssue] = []
    try:
        stored = build_stored_heat_params(object_type, params)
    except ValidationError as exc:
        issues.extend(_pydantic_validation_issues(exc))
    except ProjectObjectParamsError as exc:
        issues.append(
            ValidationIssue(
                code=exc.code or "OBJECT_PARAMS_INVALID",
                field=exc.fields[0] if len(exc.fields) == 1 else None,
                message=str(exc),
                category="unsupported" if exc.code == "OBJECT_TYPE_UNSUPPORTED" else "validation",
                reason=exc.reason,
            )
        )

    missing, invalid = _validate_downstream_required_inputs(object_type, params)
    issues.extend(
        ValidationIssue(
            code="OBJECT_REQUIRED_FIELDS_MISSING",
            field=field,
            message="Заполните обязательные поля объекта",
        )
        for field in missing
    )
    issues.extend(
        ValidationIssue(
            code="OBJECT_PARAMS_INVALID",
            field=field,
            message="Проверьте параметры объекта",
        )
        for field in invalid
    )

    report = ValidationReport(tuple(issues))
    if stored is None or not report.is_valid:
        return PreparedProjectObjectParams(params=dict(params), report=report, heat_params=None)

    heat_keys = (
        COMMON_HEAT_PARAM_KEYS | PIPE_HEAT_PARAM_KEYS
        if object_type == "pipe"
        else COMMON_HEAT_PARAM_KEYS | TANK_HEAT_PARAM_KEYS
    )
    canonical = {
        **{key: value for key, value in params.items() if key not in heat_keys},
        **stored.model_dump(exclude_none=True),
    }
    return PreparedProjectObjectParams(
        params=canonical,
        report=report,
        heat_params=stored,
    )


def validate_project_object_params(
    object_type: str,
    params: Mapping[str, Any],
) -> StoredHeatParams:
    """Compatibility wrapper returning the trusted model or the legacy exception."""

    prepared = validate_and_canonicalize_project_object_params(object_type, params)
    if not prepared.report.is_valid:
        raise prepared.report.to_legacy_error()
    if prepared.heat_params is None:  # pragma: no cover - guarded by report.is_valid
        raise RuntimeError("Валидный отчёт не содержит formula input")
    return prepared.heat_params


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


def _pydantic_validation_issues(exc: ValidationError) -> tuple[ValidationIssue, ...]:
    """Preserve every Pydantic issue instead of collapsing to the first error."""

    issues: list[ValidationIssue] = []
    for error in exc.errors():
        context = error.get("ctx")
        formula_code = (
            str(context["formula_code"])
            if isinstance(context, dict) and context.get("formula_code")
            else None
        )
        code = formula_code or (
            "OBJECT_REQUIRED_FIELDS_MISSING"
            if error.get("type") == "missing"
            else "OBJECT_PARAMS_INVALID"
        )
        fields = _validation_error_fields([error]) or (None,)
        reason = _validation_error_reason([error])
        context_message = (
            str(context.get("error", "")) if isinstance(context, dict) else ""
        ).strip()
        message = context_message or str(error.get("msg") or "Проверьте параметры объекта")
        issues.extend(
            ValidationIssue(
                code=code,
                field=field,
                message=message,
                reason=reason,
            )
            for field in fields
        )
    return tuple(issues)


def _validation_error_fields(errors: list[ErrorDetails]) -> tuple[str, ...]:
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
            if "неизвестный материал" in lower_message and path.startswith("insulation_layers."):
                path = f"{path}.material"
            fields.append(path)
            continue
        for marker, inferred_fields in model_error_fields:
            if marker in lower_message:
                fields.extend(inferred_fields)
                break
    return tuple(dict.fromkeys(fields))


def _validation_error_reason(errors: list[ErrorDetails]) -> str | None:
    for error in errors:
        context = error.get("ctx")
        if isinstance(context, dict) and context.get("formula_code"):
            return str(context["formula_code"])
        message = str(context.get("error", "")) if isinstance(context, dict) else ""
        for reason in (
            "process_temperature_not_above_ambient",
            "process_temperature_not_above_ground",
        ):
            if reason in message:
                return reason
    return None
