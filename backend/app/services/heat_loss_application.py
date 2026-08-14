"""Heat-loss application service: climate, K, formula run, validation_errors."""

from collections.abc import Mapping
from typing import Any, cast

from pydantic import ValidationError

from app.formulas.heat_loss.catalog_preparation import HeatLossPreparationError
from app.formulas.heat_loss.evaluator import evaluate_validated_heat_loss
from app.reference_data.loader import get_climate_entry
from app.schemas.heat_loss import (
    PipeHeatLossParams,
    StoredPipeHeatParams,
    StoredTankHeatParams,
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
)


def _calculation_error(message: str) -> Exception:
    return CalculationError(message)


def _clean_exception_message(exc: Exception) -> str:
    message = str(exc).strip()
    return message or type(exc).__name__


def _missing_fields_from_message(message: str) -> list[str]:
    prefix = "Не заполнены обязательные поля объекта:"
    if prefix not in message:
        return []
    return [field.strip() for field in message.split(prefix, 1)[1].split(",") if field.strip()]


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
    lower_message = message.lower()
    category = "validation"
    error_code = "invalid_object_params"
    field: str | None = None
    hint: str | None = "Проверьте параметры объекта и повторите расчёт."
    extra: dict[str, Any] = {}

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

    if "process_temperature_not_above_ambient" in message:
        error_code = "process_temperature_not_above_ambient"
        field = "process_temperature"
        hint = "Температура продукта должна быть выше температуры воздуха."
    elif "process_temperature_not_above_ground" in message:
        error_code = "process_temperature_not_above_ground"
        field = "process_temperature"
        hint = "Температура продукта должна быть выше температуры грунта."
    if isinstance(exc, ProjectObjectParamsError):
        missing_fields = _missing_fields_from_message(message)
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
        elif "неподдерживаемый тип объекта" in lower_message:
            category = "unsupported"
            error_code = "unsupported_object_type"
            field = "object_type"
            hint = "Для теплорасчёта поддерживаются только трубопроводы и резервуары."
        elif "режим tm" in lower_message or "режим температуры изоляции" in lower_message:
            field = "insulation_temperature_basis"
            hint = "Выберите режим tm, соответствующий размещению объекта."
        elif missing_fields:
            error_code = "missing_required_fields"
            field = missing_fields[0] if len(missing_fields) == 1 else None
            extra["missing_fields"] = missing_fields
            hint = "Заполните обязательные поля объекта."
    elif isinstance(exc, ValidationError):
        if "process_temperature_not_above_ambient" not in message and (
            "process_temperature_not_above_ground" not in message
        ):
            error_code = "schema_validation_error"
        if error_code == "schema_validation_error":
            field = _first_validation_field(exc)
        if error_code == "schema_validation_error":
            hint = "Проверьте формат и диапазоны значений."
    elif "неподдерживаемый тип объекта" in lower_message or "неизвестная форма" in lower_message:
        category = "unsupported"
        error_code = (
            "unsupported_object_type" if "тип объекта" in lower_message else "unsupported_shape"
        )
        field = "object_type" if "тип объекта" in lower_message else "shape"
        hint = "Выберите поддерживаемый тип или форму объекта."
    elif any(
        marker in lower_message
        for marker in (
            "требует",
            "требуются",
            "требуется",
            "долж",
            "диапазон",
            "положитель",
            "выше",
            "ниже",
            "превыш",
            "не может",
        )
    ):
        error_code = "invalid_object_params"
    else:
        category = "formula"
        error_code = "heat_loss_formula_error"
        hint = "Расчётная формула завершилась ошибкой; проверьте исходные данные."

    return {
        "error_code": error_code,
        "category": category,
        "message": message,
        "field": field,
        "hint": hint,
        **extra,
    }


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


def _climate_entry(data: dict[str, Any]) -> dict[str, Any] | None:
    return get_climate_entry(
        climate_key=str(data["climate_key"]) if data.get("climate_key") else None,
        city=str(data["climate_city"]) if data.get("climate_city") else None,
        region=str(data["climate_region"]) if data.get("climate_region") else None,
    )


def apply_climate_policy(object_type: str, data: dict[str, Any]) -> dict[str, Any]:
    """Применяет VSDX climate policy к K и расчетной температуре.

    Если город не задан или справочник не содержит нужной температуры,
    ambient_temperature остается пользовательским. safety_factor заполняется
    по типу объекта и диаметру трубы только если он не задан явно.
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
