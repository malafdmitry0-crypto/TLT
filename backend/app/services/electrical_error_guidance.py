"""Structured guidance for persisted electrical calculation errors."""

from __future__ import annotations

import re
from typing import Any, Final, Literal, TypedDict

ElectricalErrorCode = Literal[
    "unsupported_layout",
    "MISSING_TANK_LAYOUT",
    "POWER_TOO_HIGH",
    "TEMPERATURE_TOO_HIGH",
    "RESISTIVE_SECTION_NOT_FOUND",
    "UNKNOWN",
]

ElectricalErrorCategory = Literal["validation", "formula", "unsupported", "external"]

ElectricalSuggestedAction = Literal[
    "SET_HEATING_HEIGHT",
    "SET_LAYING_STEP",
    "SET_TANK_LAYOUT",
    "TRY_2_THREADS",
    "TRY_3_THREADS",
    "TRY_TT",
    "TRY_RESISTIVE",
    "TRY_SINGLE_CORE_RESISTIVE",
    "TRY_THREE_CORE_RESISTIVE",
    "TRY_SELF_REGULATING",
    "TRY_OTHER_CONNECTION",
    "CHECK_VOLTAGE",
    "CHECK_PROCESS_TEMPERATURE",
    "CHECK_AMBIENT_TEMPERATURE",
    "CHECK_VAPOR_TEMPERATURE",
    "CHECK_OBJECT_PARAMS",
    "TRY_OTHER_CABLE_TYPE",
]


class ElectricalErrorPayload(TypedDict, total=False):
    error_code: ElectricalErrorCode
    category: ElectricalErrorCategory
    message: str
    field: str | None
    hint: str | None
    suggested_actions: list[ElectricalSuggestedAction]
    error_context: dict[str, Any]
    object_type: str
    object_name: str | None


SUGGESTED_ACTIONS_BY_ERROR_CODE: Final[
    dict[ElectricalErrorCode, list[ElectricalSuggestedAction]]
] = {
    "unsupported_layout": [],
    "MISSING_TANK_LAYOUT": [
        "SET_HEATING_HEIGHT",
        "SET_LAYING_STEP",
        "SET_TANK_LAYOUT",
    ],
    "POWER_TOO_HIGH": [
        "TRY_OTHER_CABLE_TYPE",
    ],
    "TEMPERATURE_TOO_HIGH": [
        "CHECK_PROCESS_TEMPERATURE",
        "CHECK_VAPOR_TEMPERATURE",
        "TRY_OTHER_CABLE_TYPE",
    ],
    "RESISTIVE_SECTION_NOT_FOUND": [
        "TRY_OTHER_CONNECTION",
        "CHECK_VOLTAGE",
        "TRY_OTHER_CABLE_TYPE",
    ],
    "UNKNOWN": [
        "CHECK_OBJECT_PARAMS",
        "TRY_OTHER_CABLE_TYPE",
    ],
}

_ERROR_PREFIX_RE = re.compile(r"^[A-Za-z_][\w.]*Error:\s*")
_FLOAT_RE = r"[-+]?\d+(?:[.,]\d+)?"
_SUPPORTED_TANK_LAYOUT_SHAPES = {"cylindrical", "rectangular"}


def clean_electrical_error_message(error_message: str) -> str:
    """Return user-facing message without Python exception class prefix."""

    return _ERROR_PREFIX_RE.sub("", str(error_message)).strip()


def classify_electrical_error(error_message: str) -> ElectricalErrorCode:
    """Classify known calculation errors by message until formulas raise typed errors."""

    text = clean_electrical_error_message(error_message).lower()

    if not text:
        return "UNKNOWN"

    if ("геометр" in text and "уклад" in text) or (
        "высота обогрева" in text and "шаг укладки" in text
    ):
        return "MISSING_TANK_LAYOUT"

    if ("не найден" in text and ("sк" in text or "ск" in text or "сечен" in text)) or (
        "resistive" in text and "not found" in text
    ):
        return "RESISTIVE_SECTION_NOT_FOUND"

    if (
        "max_product_temp" in text
        or "max_vapor_temp" in text
        or "t продукта" in text
        or "t среды" in text
        or "t проп" in text
        or ("температур" in text and ("превыш" in text or "выше" in text or "допустим" in text))
    ):
        return "TEMPERATURE_TOO_HIGH"

    if (
        "не найден кабель с мощностью" in text
        or "максимум линейки" in text
        or ("не найден кабель" in text and "вт/м" in text)
        or ("не обеспечивает" in text and "вт/м" in text)
    ):
        return "POWER_TOO_HIGH"

    return "UNKNOWN"


def _parse_float(value: str | None) -> float | None:
    if value is None:
        return None
    try:
        return float(value.replace(",", "."))
    except ValueError:
        return None


def _extract_float(pattern: str, text: str) -> float | None:
    match = re.search(pattern, text, flags=re.IGNORECASE)
    if not match:
        return None
    return _parse_float(match.group(1))


def _add_context_value(context: dict[str, Any], key: str, value: Any) -> None:
    if value is not None and value != "":
        context[key] = value


def _context_str(context: dict[str, Any], key: str) -> str | None:
    value = context.get(key)
    return str(value) if value is not None and value != "" else None


def _context_positive_number(context: dict[str, Any], key: str) -> bool:
    value = context.get(key)
    if value is None or value == "":
        return False
    try:
        return float(value) > 0
    except (TypeError, ValueError):
        return False


def _append_unique(
    actions: list[ElectricalSuggestedAction],
    action: ElectricalSuggestedAction,
) -> None:
    if action not in actions:
        actions.append(action)


def suggested_actions_for_electrical_error(
    error_code: ElectricalErrorCode,
    context: dict[str, Any],
) -> list[ElectricalSuggestedAction]:
    """Return actions that are applicable to current cable/object context."""

    if error_code == "unsupported_layout":
        return []

    if error_code == "MISSING_TANK_LAYOUT":
        actions: list[ElectricalSuggestedAction] = []
        shape = _context_str(context, "shape")
        if shape not in _SUPPORTED_TANK_LAYOUT_SHAPES:
            return ["SET_TANK_LAYOUT"]
        if not _context_positive_number(context, "heating_height"):
            _append_unique(actions, "SET_HEATING_HEIGHT")
        if not _context_positive_number(context, "laying_step"):
            _append_unique(actions, "SET_LAYING_STEP")
        return actions or ["SET_TANK_LAYOUT"]

    if error_code == "POWER_TOO_HIGH":
        return ["TRY_OTHER_CABLE_TYPE"]

    if error_code == "TEMPERATURE_TOO_HIGH":
        actions = []
        subject = _context_str(context, "temperature_subject")
        if subject == "ambient":
            _append_unique(actions, "CHECK_AMBIENT_TEMPERATURE")
        elif subject == "vapor":
            _append_unique(actions, "CHECK_VAPOR_TEMPERATURE")
        elif subject == "product":
            _append_unique(actions, "CHECK_PROCESS_TEMPERATURE")
        else:
            _append_unique(actions, "CHECK_PROCESS_TEMPERATURE")
            _append_unique(actions, "CHECK_VAPOR_TEMPERATURE")
        _append_unique(actions, "TRY_OTHER_CABLE_TYPE")
        return actions or ["CHECK_OBJECT_PARAMS"]

    if error_code == "RESISTIVE_SECTION_NOT_FOUND":
        actions = []
        _append_unique(actions, "TRY_OTHER_CONNECTION")
        _append_unique(actions, "CHECK_VOLTAGE")
        _append_unique(actions, "TRY_OTHER_CABLE_TYPE")
        return actions

    return list(SUGGESTED_ACTIONS_BY_ERROR_CODE[error_code])


def build_electrical_error_context(
    error_message: str,
    *,
    cable_type: str | None = None,
    request_data: dict[str, Any] | None = None,
) -> dict[str, Any]:
    message = clean_electrical_error_message(error_message)
    lower_message = message.lower()
    data = request_data or {}
    context: dict[str, Any] = {}

    _add_context_value(context, "cable_type", cable_type)
    if "t3" in lower_message or "maintain_temperature" in lower_message:
        context["temperature_subject"] = "maintain"
    elif "t среды" in lower_message:
        context["temperature_subject"] = "ambient"
    elif (
        "пропарк" in lower_message or "max_vapor_temp" in lower_message or "t проп" in lower_message
    ):
        context["temperature_subject"] = "vapor"
    elif "продукт" in lower_message or "max_product_temp" in lower_message:
        context["temperature_subject"] = "product"
    for key in (
        "number_of_threads",
        "winding_pitch",
        "winding_pitch_mm",
        "winding_coefficient",
        "supply_voltage",
        "connection_type",
        "heating_height",
        "laying_step",
        "vapor_temperature",
        "maintain_temperature",
        "process_temperature",
        "shape",
        "height",
        "diameter",
        "length",
        "width",
    ):
        _add_context_value(context, key, data.get(key))

    _add_context_value(
        context,
        "required_power_per_meter",
        _extract_float(rf"мощностью\s*[≥>=]\s*({_FLOAT_RE})\s*Вт/м", message),
    )
    _add_context_value(
        context,
        "max_power_per_meter",
        _extract_float(rf"максимум линейки\s*[—-]\s*({_FLOAT_RE})\s*Вт/м", message),
    )
    _add_context_value(
        context,
        "product_temperature",
        _extract_float(rf"T продукта\s*=\s*({_FLOAT_RE})\s*°?C", message),
    )
    _add_context_value(
        context,
        "ambient_temperature",
        _extract_float(rf"T среды\s*=\s*({_FLOAT_RE})\s*°?C", message),
    )
    _add_context_value(
        context,
        "min_cross_section",
        _extract_float(rf"Sк\s*[≥>=]\s*({_FLOAT_RE})\s*мм", message),
    )
    return context


def _normalize_error_code_for_context(
    error_code: ElectricalErrorCode,
    context: dict[str, Any],
) -> ElectricalErrorCode:
    if error_code != "MISSING_TANK_LAYOUT":
        return error_code
    shape = _context_str(context, "shape")
    if shape and shape not in _SUPPORTED_TANK_LAYOUT_SHAPES:
        return "unsupported_layout"
    return error_code


def _category_for_electrical_error(error_code: ElectricalErrorCode) -> ElectricalErrorCategory:
    if error_code == "unsupported_layout":
        return "unsupported"
    if error_code in ("MISSING_TANK_LAYOUT", "TEMPERATURE_TOO_HIGH"):
        return "validation"
    return "formula"


def _field_for_electrical_error(
    error_code: ElectricalErrorCode,
    context: dict[str, Any],
) -> str | None:
    if error_code == "unsupported_layout":
        return "shape"
    if error_code == "MISSING_TANK_LAYOUT":
        if not _context_positive_number(context, "heating_height"):
            return "heating_height"
        if not _context_positive_number(context, "laying_step"):
            return "laying_step"
        return "tank_layout"
    if error_code == "TEMPERATURE_TOO_HIGH":
        subject = _context_str(context, "temperature_subject")
        if subject == "ambient":
            return "ambient_temperature"
        if subject == "vapor":
            return "vapor_temperature"
        if subject in ("product", "maintain"):
            return "process_temperature"
    if error_code == "RESISTIVE_SECTION_NOT_FOUND":
        return "connection_type"
    return None


def _hint_for_electrical_error(error_code: ElectricalErrorCode) -> str | None:
    if error_code == "unsupported_layout":
        return (
            "Теплопотери доступны, но формула укладки кабеля для сферического "
            "резервуара не утверждена."
        )
    if error_code == "MISSING_TANK_LAYOUT":
        return "Заполните высоту обогрева и шаг укладки для резервуара."
    if error_code == "POWER_TOO_HIGH":
        return "Подберите другой тип кабеля или снизьте требуемую удельную мощность."
    if error_code == "TEMPERATURE_TOO_HIGH":
        return "Проверьте температуры объекта и допустимые температуры выбранной серии кабеля."
    if error_code == "RESISTIVE_SECTION_NOT_FOUND":
        return "Проверьте схему подключения, напряжение и доступный каталог резистивного кабеля."
    return "Проверьте параметры объекта и выбранный тип кабеля."


def _message_for_electrical_error(
    error_code: ElectricalErrorCode,
    error_message: str,
) -> str:
    if error_code == "unsupported_layout":
        return (
            "Электрорасчёт укладки кабеля для сферического резервуара не применим: "
            "формула укладки не определена."
        )
    return clean_electrical_error_message(error_message)


def build_electrical_error_payload(
    error_message: str,
    *,
    object_type: str | None = None,
    object_name: str | None = None,
    cable_type: str | None = None,
    request_data: dict[str, Any] | None = None,
) -> ElectricalErrorPayload:
    error_code = classify_electrical_error(error_message)
    context = build_electrical_error_context(
        error_message,
        cable_type=cable_type,
        request_data=request_data,
    )
    _add_context_value(context, "object_type", object_type)
    error_code = _normalize_error_code_for_context(error_code, context)
    payload: ElectricalErrorPayload = {
        "error_code": error_code,
        "category": _category_for_electrical_error(error_code),
        "message": _message_for_electrical_error(error_code, error_message),
        "field": _field_for_electrical_error(error_code, context),
        "hint": _hint_for_electrical_error(error_code),
        "suggested_actions": suggested_actions_for_electrical_error(error_code, context),
        "error_context": context,
    }
    if object_type is not None:
        payload["object_type"] = object_type
    payload["object_name"] = object_name
    return payload
