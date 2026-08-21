"""Heat-loss application service: object preparation, climate, K, and formulas."""

from collections.abc import Awaitable, Callable, Mapping
from dataclasses import dataclass
from typing import Any, Literal, cast

from pydantic import ValidationError

from app.formulas.heat_loss.catalog_preparation import HeatLossPreparationError
from app.formulas.heat_loss.evaluator import evaluate_validated_heat_loss
from app.reference_data.loader import get_climate_entry
from app.schemas.heat_loss import (
    PipeHeatLossParams,
    StoredPipeHeatParams,
    StoredTankHeatParams,
    TankHeatLossParams,
)
from app.schemas.json_shapes import (
    HeatLossResultDict,
    PipeHeatLossResultDict,
    TankHeatLossResultDict,
)
from app.services.calculation_errors import CalculationError
from app.services.heat_contract import (
    PIPE_FORBIDDEN_HEAT_PARAM_KEYS,
    TANK_FORBIDDEN_HEAT_PARAM_KEYS,
)
from app.services.project_object_params import (
    ProjectObjectParamsError,
    StoredHeatParams,
    build_stored_heat_params,
    normalize_project_object_params,
    validate_ambient_temperature_maximum,
    validate_and_canonicalize_project_object_params,
)

CoefficientProvider = Callable[[], Awaitable[Mapping[str, Any]]]

_PIPE_WALL_RELATION_MESSAGE = "Толщина стенки должна быть меньше половины наружного диаметра"


@dataclass(frozen=True)
class ProjectObjectHeatOutcome:
    """Heat evaluation state that a persistence owner can apply to its object."""

    params_to_persist: dict[str, Any] | None
    is_valid: bool
    results: dict[str, Any] | None
    validation_errors: dict[str, Any] | None
    error_message: str | None


def _calculation_error(message: str) -> Exception:
    return CalculationError(message)


def _clean_exception_message(exc: Exception) -> str:
    message = str(exc).strip()
    return message or type(exc).__name__


def _first_validation_field(exc: ValidationError) -> str | None:
    errors = exc.errors()
    if not errors:
        return None
    loc = errors[0].get("loc")
    if isinstance(loc, tuple) and loc:
        return ".".join(str(part) for part in loc)
    if isinstance(loc, list) and loc:
        return ".".join(str(part) for part in loc)
    return None


def build_heat_loss_error_payload(
    exc: Exception,
    *,
    object_type: str,
) -> dict[str, Any]:
    """Structured `project_objects.validation_errors`."""

    message = _clean_exception_message(exc)
    hint: str | None = "Проверьте параметры объекта и повторите расчёт."

    if isinstance(exc, HeatLossPreparationError):
        if not exc.path:
            raise RuntimeError("HeatLossPreparationError.path is required")
        return {
            "error_code": exc.code,
            "category": exc.category,
            "message": exc.message,
            "field": exc.path,
            "fields": {exc.path: exc.message},
            "hint": hint,
        }

    if isinstance(exc, ProjectObjectParamsError):
        category = "validation"
        error_code = "invalid_object_params"
        field: str | None = None
        extra: dict[str, Any] = {}
        structured_fields = list(exc.fields)
        if exc.reason == "process_temperature_not_above_ambient":
            error_code = exc.reason
            field = "process_temperature"
            message = "Температура продукта должна быть выше температуры воздуха."
            hint = message
        elif exc.reason == "process_temperature_not_above_ground":
            error_code = exc.reason
            field = "process_temperature"
            message = "Температура продукта должна быть выше температуры грунта."
            hint = message
        elif (
            object_type == "pipe"
            and exc.reason == "wall_exceeds_pipe_radius"
            and structured_fields == ["wall_thickness"]
        ):
            error_code = exc.reason
            field = "wall_thickness"
            message = _PIPE_WALL_RELATION_MESSAGE
            extra["fields"] = {field: message}
            hint = message
        elif exc.code == "OBJECT_TYPE_UNSUPPORTED":
            category = "unsupported"
            error_code = "unsupported_object_type"
            field = "object_type"
            hint = "Для теплорасчёта поддерживаются только трубопроводы и резервуары."
        elif exc.code == "OBJECT_REQUIRED_FIELDS_MISSING":
            error_code = "missing_required_fields"
            field = structured_fields[0] if len(structured_fields) == 1 else None
            extra["missing_fields"] = structured_fields
            hint = "Заполните обязательные поля объекта."
        elif exc.code == "OBJECT_PARAMS_INVALID":
            field = structured_fields[0] if len(structured_fields) == 1 else None
            if structured_fields:
                extra["fields"] = {
                    validation_field: message for validation_field in structured_fields
                }
            hint = "Проверьте формат и диапазоны значений."
        return {
            "error_code": error_code,
            "category": category,
            "message": message,
            "field": field,
            "hint": hint,
            **extra,
        }

    if isinstance(exc, ValidationError):
        process_temperature_code = next(
            (
                str(context["formula_code"])
                for error in exc.errors()
                if isinstance((context := error.get("ctx")), dict)
                and context.get("formula_code")
                in (
                    "process_temperature_not_above_ambient",
                    "process_temperature_not_above_ground",
                )
            ),
            None,
        )
        if process_temperature_code == "process_temperature_not_above_ambient":
            hint = "Температура продукта должна быть выше температуры воздуха."
        elif process_temperature_code == "process_temperature_not_above_ground":
            hint = "Температура продукта должна быть выше температуры грунта."
        else:
            hint = "Проверьте формат и диапазоны значений."
        return {
            "error_code": process_temperature_code or "schema_validation_error",
            "category": "validation",
            "message": message,
            "field": (
                "process_temperature"
                if process_temperature_code is not None
                else _first_validation_field(exc)
            ),
            "hint": hint,
        }

    return {
        "error_code": "heat_loss_formula_error",
        "category": "formula",
        "message": message,
        "field": None,
        "hint": "Расчётная формула завершилась ошибкой; проверьте исходные данные.",
    }


def _invalid_project_object_heat_outcome(
    exc: Exception,
    *,
    object_type: str,
    params_to_persist: dict[str, Any] | None,
) -> ProjectObjectHeatOutcome:
    message = _clean_exception_message(exc)
    return ProjectObjectHeatOutcome(
        params_to_persist=params_to_persist,
        is_valid=False,
        results=None,
        validation_errors=build_heat_loss_error_payload(exc, object_type=object_type),
        error_message=message,
    )


def effective_pipe_safety_factor(
    params: PipeHeatLossParams,
    coefficients: Mapping[str, Any] | None,
) -> float | None:
    """User/climate K wins; admin K is used only when the first value is absent."""

    if params.safety_factor is not None:
        return params.safety_factor
    if coefficients is not None and "safety_factor" in coefficients:
        return cast(float, coefficients["safety_factor"])
    return None


def pipe_params_with_effective_safety_factor(
    params: PipeHeatLossParams,
    coefficients: Mapping[str, Any] | None,
) -> PipeHeatLossParams:
    """Copy params only when admin K fills a missing user/climate value."""

    chosen = effective_pipe_safety_factor(params, coefficients)
    if chosen == params.safety_factor:
        return params
    return params.model_copy(update={"safety_factor": chosen})


resolve_pipe_admin_safety_factor = effective_pipe_safety_factor


def preview_validated_heat_formula(
    formula_type: Literal["pipe", "tank"],
    params: Mapping[str, Any],
) -> dict[str, Any]:
    """Validate and evaluate an admin heat preview without climate or coefficients."""

    params_data = dict(params)
    if formula_type == "pipe":
        return evaluate_validated_heat_loss(PipeHeatLossParams(**params_data)).model_dump()
    elif formula_type == "tank":
        return evaluate_validated_heat_loss(TankHeatLossParams(**params_data)).model_dump()
    else:
        raise ValueError(f"Unsupported heat-loss formula type: {formula_type}")


def _num(value: Any, default: float | None = None) -> float | None:
    if value is None or value == "":
        return default
    return float(value)


def _climate_temperature(entry: dict[str, Any] | None, key: str) -> float | None:
    if entry is None:
        return None
    value = entry.get(key)
    if value is None:
        return None
    return float(value)


def _climate_wind(entry: dict[str, Any] | None) -> float | None:
    cold_period_average = _climate_temperature(entry, "wind_avg_cold")
    if cold_period_average is not None:
        return cold_period_average
    return _climate_temperature(entry, "wind_max_jan")


def _climate_entry(data: dict[str, Any]) -> dict[str, Any] | None:
    return get_climate_entry(
        climate_key=str(data["climate_key"]) if data.get("climate_key") else None,
        city=str(data["climate_city"]) if data.get("climate_city") else None,
        region=str(data["climate_region"]) if data.get("climate_region") else None,
    )


def _apply_climate_wind_policy(
    object_type: str,
    normalized: dict[str, Any],
    climate: dict[str, Any] | None,
) -> None:
    placement = normalized.get("placement")
    wind_source = normalized.get("wind_speed_source")
    explicit_manual_wind = "wind_speed" in normalized and wind_source != "climate"
    uses_climate_wind = (object_type == "pipe" and placement == "outdoor") or (
        object_type == "tank" and placement in {"outdoor", "underground"}
    )

    if object_type == "pipe" and placement == "underground":
        normalized.pop("wind_speed", None)
        normalized.pop("wind_speed_source", None)
        return

    if not uses_climate_wind:
        if wind_source == "climate":
            normalized.pop("wind_speed", None)
            normalized.pop("wind_speed_source", None)
        elif explicit_manual_wind and wind_source is None:
            normalized["wind_speed_source"] = "manual"
        return

    climate_wind = _climate_wind(climate)
    if climate_wind is not None and not explicit_manual_wind:
        normalized["wind_speed"] = climate_wind
        normalized["wind_speed_source"] = "climate"
    elif wind_source == "climate":
        normalized.pop("wind_speed", None)
        normalized.pop("wind_speed_source", None)
    elif explicit_manual_wind and wind_source is None:
        normalized["wind_speed_source"] = "manual"


def apply_climate_policy(object_type: str, data: dict[str, Any]) -> dict[str, Any]:
    """Применяет VSDX climate policy к K, температуре воздуха и ветру.

    Климатический ветер заполняется только для размещений, где он участвует в
    формуле, и не перезаписывает ручное значение. Если город не задан или
    справочник не содержит нужной температуры, ambient_temperature остается
    пользовательским. safety_factor заполняется по типу объекта и диаметру
    трубы только если он не задан явно.
    """
    normalized = dict(data)
    climate = _climate_entry(normalized)
    safety_factor_source = normalized.get("safety_factor_source")
    safety_factor_present = "safety_factor" in normalized
    try:
        parsed_safety_factor = _num(normalized.get("safety_factor"))
    except (TypeError, ValueError):
        parsed_safety_factor = None
    explicit_safety_factor = safety_factor_present and (
        safety_factor_source not in ("default", "climate_policy") or parsed_safety_factor is None
    )
    safety_factor_from_policy = False

    if object_type == "pipe":
        try:
            diameter = _num(normalized.get("outer_diameter"))
        except (TypeError, ValueError):
            diameter = None
        if diameter is None or diameter <= 0:
            normalized.pop("climate_temperature_basis", None)
            _apply_climate_wind_policy(object_type, normalized, climate)
            return normalized
        diameter_mm = diameter * 1000.0
        if diameter_mm >= 100.0:
            if not explicit_safety_factor:
                normalized["safety_factor"] = 1.1
                safety_factor_from_policy = True
            basis = "t_0_92"
            rule = "pipe_diameter_ge_100"
        else:
            if not explicit_safety_factor:
                normalized["safety_factor"] = 1.12
                safety_factor_from_policy = True
            basis = "t_abs_min"
            rule = "pipe_diameter_lt_100"
    elif object_type == "tank":
        if not explicit_safety_factor:
            normalized["safety_factor"] = 1.1
            safety_factor_from_policy = True
        basis = "t_0_92"
        rule = "non_pipe_cold_fiveday_0_92"
    else:
        return normalized

    climate_temperature = _climate_temperature(climate, basis)
    manual_ambient_temperature = (
        normalized.get("ambient_temperature_source") == "manual"
        and "ambient_temperature" in normalized
    )
    uses_air_temperature = not (
        object_type == "pipe" and normalized.get("placement") == "underground"
    )
    if climate_temperature is not None and uses_air_temperature:
        if not manual_ambient_temperature:
            normalized["ambient_temperature"] = climate_temperature
            normalized["ambient_temperature_source"] = "climate"
        normalized["climate_temperature_basis"] = basis
    else:
        normalized.pop("climate_temperature_basis", None)
        if not uses_air_temperature:
            normalized.pop("ambient_temperature", None)
            normalized.pop("ambient_temperature_source", None)
    _apply_climate_wind_policy(object_type, normalized, climate)
    normalized["climate_policy_rule"] = rule
    if safety_factor_from_policy:
        normalized["safety_factor_source"] = "climate_policy"
    elif explicit_safety_factor and safety_factor_source is None:
        normalized["safety_factor_source"] = "manual"
    return normalized


def calc_heat_loss(
    object_type: str,
    data: dict[str, Any],
    *,
    coefficients: Mapping[str, Any] | None,
    apply_climate: bool = True,
    stored: StoredHeatParams | None = None,
) -> HeatLossResultDict:
    """Run climate, K selection, and the formula facade. Coefficients stay here."""

    if apply_climate:
        data = apply_climate_policy(object_type, data)
    if object_type == "pipe":
        forbidden = sorted(PIPE_FORBIDDEN_HEAT_PARAM_KEYS.intersection(data))
        if forbidden:
            raise ValueError("Forbidden pipe heat params: " + ", ".join(forbidden))
        pipe_stored = stored if stored is not None else build_stored_heat_params(object_type, data)
        if not isinstance(pipe_stored, StoredPipeHeatParams):
            raise _calculation_error("Тип валидированных параметров не соответствует pipe")
        formula_params = pipe_params_with_effective_safety_factor(pipe_stored, coefficients)
        pipe_result = evaluate_validated_heat_loss(formula_params)
        result = pipe_result.model_dump()
        return cast(PipeHeatLossResultDict, result)
    if object_type == "tank":
        forbidden = sorted(TANK_FORBIDDEN_HEAT_PARAM_KEYS.intersection(data))
        if forbidden:
            raise ValueError("Forbidden tank heat params: " + ", ".join(forbidden))
        tank_stored = stored if stored is not None else build_stored_heat_params(object_type, data)
        if not isinstance(tank_stored, StoredTankHeatParams):
            raise _calculation_error("Тип валидированных параметров не соответствует tank")
        tank_result = evaluate_validated_heat_loss(tank_stored)
        result = tank_result.model_dump()
        return cast(TankHeatLossResultDict, result)
    raise _calculation_error(f"Неподдерживаемый тип объекта: {object_type}")


async def evaluate_project_object_heat(
    object_type: str,
    params: Mapping[str, Any] | None,
    *,
    coefficients: Mapping[str, Any] | None = None,
    load_coefficients: CoefficientProvider | None = None,
) -> ProjectObjectHeatOutcome:
    """Prepare and evaluate heat loss without knowing the persistence model.

    Normalization and climate failures leave persistence params untouched. Once
    canonical validation finishes, every outcome carries those canonical params.
    Coefficients are loaded lazily, after the final validation report succeeds.
    """

    try:
        normalized = normalize_project_object_params(object_type, params)
        climate_resolved = apply_climate_policy(object_type, normalized)
    except Exception as exc:
        return _invalid_project_object_heat_outcome(
            exc,
            object_type=object_type,
            params_to_persist=None,
        )

    try:
        validate_ambient_temperature_maximum(climate_resolved)
    except ProjectObjectParamsError as exc:
        return _invalid_project_object_heat_outcome(
            exc,
            object_type=object_type,
            params_to_persist=climate_resolved,
        )

    try:
        prepared = validate_and_canonicalize_project_object_params(
            object_type,
            climate_resolved,
        )
    except Exception as exc:
        return _invalid_project_object_heat_outcome(
            exc,
            object_type=object_type,
            params_to_persist=None,
        )

    canonical_params = prepared.params
    if not prepared.report.is_valid:
        return _invalid_project_object_heat_outcome(
            prepared.report.to_legacy_error(),
            object_type=object_type,
            params_to_persist=canonical_params,
        )

    try:
        if prepared.heat_params is None:  # pragma: no cover - report/model invariant
            raise RuntimeError("Валидный отчёт не содержит formula input")
        resolved_coefficients = coefficients
        if resolved_coefficients is None and load_coefficients is not None:
            resolved_coefficients = await load_coefficients()
        result = calc_heat_loss(
            object_type,
            canonical_params,
            coefficients=resolved_coefficients,
            apply_climate=False,
            stored=prepared.heat_params,
        )
    except Exception as exc:
        return _invalid_project_object_heat_outcome(
            exc,
            object_type=object_type,
            params_to_persist=canonical_params,
        )

    return ProjectObjectHeatOutcome(
        params_to_persist=canonical_params,
        is_valid=True,
        results=cast(dict[str, Any], result),
        validation_errors=None,
        error_message=None,
    )
