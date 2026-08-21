"""Translate dependency-free TT core failures to the legacy app error contract."""

from __future__ import annotations

from collections.abc import Mapping
from decimal import Decimal
from typing import Any, Never

from heatcalc_electrical_core import TTFormulaDomainError, TTFormulaIssue, TTFormulaReport

from app.electrical_domain import ElectricalFormulaError

_FINAL_GATE_MESSAGES = {
    "cable_mark": "Марка кабеля не определена",
    "series": "Серия кабеля не определена",
    "nominal_voltage_v": "Рабочее напряжение должно быть положительным",
    "plan_voltage_match": "Напряжение плана секций не совпадает с входным напряжением",
    "threads": "Число ниток должно быть целым от 1 до 3",
    "section_count": "Количество секций должно быть больше нуля",
    "section_length": "Длина секции должна быть больше нуля",
    "section_length_le_l_max": "Длина секции превышает Lмакс",
    "start_current_le_idop": "Стартовый ток секции превышает Iдоп",
    "l_fact_ge_l_req": "Фактическая длина секций меньше требуемой",
    "sections_count_match": "Число секций в списке не совпадает с планом",
    "equal_sections": "Автоматические секции должны иметь одинаковые расчётные параметры",
    "required_power": "Требуемая мощность на метр должна быть положительной",
    "installed_power_ge_required": "Установленная мощность на метр меньше требуемой",
    "catalog_missing": "Отсутствует snapshot каталога",
    "catalog_identity": "Каталог без version/checksum",
}


def raise_electrical_formula_report(report: TTFormulaReport) -> None:
    """Raise the legacy application error for a blocking core report."""

    if report.is_valid:
        return
    raise electrical_error_from_report(report)


def raise_electrical_formula_issue(issue: TTFormulaIssue) -> Never:
    """Raise the legacy application error for one blocking core issue."""

    raise electrical_error_from_issue(issue)


def raise_electrical_formula_domain_error(error: TTFormulaDomainError) -> Never:
    """Raise the legacy application error while retaining the core exception cause."""

    raise electrical_error_from_domain(error) from error


def electrical_error_from_report(report: TTFormulaReport) -> ElectricalFormulaError:
    """Build an application error from the first blocking core issue."""

    if report.is_valid:
        raise RuntimeError("valid TT formula report cannot become an electrical error")
    return electrical_error_from_issue(report.issues[0])


def electrical_error_from_issue(issue: TTFormulaIssue) -> ElectricalFormulaError:
    """Build an application error from one immutable core issue."""

    details_method = getattr(issue, "details_dict", None)
    raw_details = details_method() if callable(details_method) else issue.details
    details = _legacy_details(raw_details)
    if issue.code in {"ELECTRICAL_INPUT_NOT_FINITE", "ELECTRICAL_INPUT_OUT_OF_RANGE"}:
        # The legacy error has no separate path field; retain the immutable core
        # path in details for clients to identify the rejected public DTO field.
        details["path"] = list(issue.path)
    return _electrical_error(issue.code, details)


def electrical_error_from_domain(error: TTFormulaDomainError) -> ElectricalFormulaError:
    """Build an application error from an exceptional TT core domain failure."""

    return _electrical_error(error.code, _legacy_details(error.details))


def _electrical_error(code: str, details: dict[str, Any]) -> ElectricalFormulaError:
    return ElectricalFormulaError(code, _message_for(code, details), details=details)


def _message_for(code: str, details: Mapping[str, Any]) -> str:
    if code == "ELECTRICAL_INPUT_NOT_FINITE":
        return f"Параметр «{_input_path(details)}» должен быть конечным числом"
    if code == "ELECTRICAL_INPUT_OUT_OF_RANGE":
        return _input_range_message(details)
    if code == "ELECTRICAL_CATALOG_ROW_INVALID":
        return _catalog_message(details)
    if code == "ELECTRICAL_SELECTION_POLICY_UNSUPPORTED":
        return "В MVP поддерживается только политика technical_minimum"
    if code == "ELECTRICAL_THREAD_COUNT_INVALID":
        return "Число ниток должно быть от 1 до 3"
    if code == "ELECTRICAL_LEGACY_CABLE_MARK_UNSUPPORTED":
        return "Условные legacy-марки ТЛТ не поддерживаются в новом расчёте"
    if code == "ELECTRICAL_CABLE_NOT_FOUND":
        mark = _required(details, "requested_model", "manual_cable_model", "cable_mark")
        return f"Кабель «{mark}» не найден в справочнике"
    if code == "ELECTRICAL_CABLE_TEMPERATURE_LIMIT_EXCEEDED":
        return _temperature_limit_message(details)
    if code == "ELECTRICAL_CABLE_POWER_INSUFFICIENT":
        manual_mark = details.get("manual_cable_model")
        if manual_mark is None:
            return "Ни одна допустимая марка не обеспечивает требуемую мощность"
        return (
            f"Выбранная марка {manual_mark} не обеспечивает требуемую мощность "
            f"{_format_decimal(_required(details, 'required_power_per_meter_w'))} Вт/м"
        )
    if code == "ELECTRICAL_WINDING_PITCH_INVALID":
        if details.get("outer_diameter_mm") is None and details.get("winding_pitch_mm") is not None:
            return "Для системного расчёта Kнав требуется наружный диаметр трубы"
        if "winding_pitch_mm" in details:
            return "Шаг навива должен быть больше наружного диаметра трубы"
        return "Наружный диаметр должен быть положительным"
    if code == "ELECTRICAL_WINDING_FACTOR_LIMIT_EXCEEDED":
        return "Коэффициент навива превышает допустимый предел для диаметра трубы"
    if code == "ELECTRICAL_TANK_LAYOUT_REQUIRED":
        return "Для резервуара обязательны форма, высота обогрева и шаг укладки"
    if code == "ELECTRICAL_TANK_LAYOUT_INVALID":
        return "Некорректны параметры укладки кабеля на резервуаре"
    if code == "ELECTRICAL_NOMINAL_VOLTAGE_INVALID":
        return "Рабочее напряжение должно быть положительным"
    if code == "ELECTRICAL_SECTION_PLAN_INVALID":
        return "Длина и мощность кабеля должны быть положительными"
    if code == "ELECTRICAL_SECTION_CATALOG_ROW_NOT_FOUND":
        return "Не найдена строка каталога секционирования для модели и температуры"
    if code == "SECTION_CURRENT_LIMIT_REQUIRED":
        return "Допустимый стартовый ток секции должен быть положительным"
    if code == "ELECTRICAL_FINAL_GATE_FAILED":
        return _final_gate_message(details)
    raise RuntimeError(f"Нет backend-маппинга для core-ошибки {code!r}")


def _input_path(details: Mapping[str, Any]) -> str:
    path = details.get("path")
    if (
        not isinstance(path, list)
        or not path
        or not all(isinstance(item, str | int) for item in path)
    ):
        raise RuntimeError("В core-ошибке отсутствует корректный path входного параметра")
    return ".".join(str(item) for item in path)


def _input_range_message(details: Mapping[str, Any]) -> str:
    path = _input_path(details)
    minimum = details.get("minimum")
    maximum = details.get("maximum")
    if minimum is not None and maximum is not None:
        return (
            f"Параметр «{path}» должен быть в диапазоне от "
            f"{_format_decimal(minimum)} до {_format_decimal(maximum)}"
        )
    if minimum is not None:
        comparison = "больше" if details.get("minimum_exclusive") is True else "не меньше"
        return f"Параметр «{path}» должен быть {comparison} {_format_decimal(minimum)}"
    if maximum is not None:
        return f"Параметр «{path}» не должен превышать {_format_decimal(maximum)}"
    raise RuntimeError("В core-ошибке диапазона отсутствуют minimum/maximum")


def _catalog_message(details: Mapping[str, Any]) -> str:
    missing = _detail_names(details, "missing_fields")
    invalid = _detail_names(details, "invalid_fields")
    if missing == {"catalog_rows"}:
        return "Power-каталог не содержит строк"
    if missing == {"model"}:
        return "Строка power-каталога не содержит модель"
    if missing == {"nominal_power"}:
        return "Строка power-каталога не содержит паспортную мощность"
    if invalid == {"nominal_power"}:
        return "Паспортная мощность строки power-каталога некорректна"
    if missing == {"max_product_temp"}:
        return "Строка power-каталога не содержит T_max"
    if invalid == {"max_product_temp"}:
        return "T_max строки power-каталога некорректна"
    if missing == {"min_temperature"}:
        return "Для модели отсутствует T_min из каталога секционирования"
    if missing == {"full_mark"}:
        return "Для базовой модели отсутствует exact full_mark в BOM-каталоге"
    if missing == {"nomenclature_code"} or missing == {"full_mark", "nomenclature_code"}:
        return "BOM-строка технической марки неполна"
    if "duplicate_full_mark" in details:
        return "BOM-каталог содержит дублирующуюся техническую марку"
    if not missing and not invalid:
        return "Строка power-каталога не содержит допустимую серию"
    raise RuntimeError(
        "Нет backend-маппинга для деталей core-ошибки 'ELECTRICAL_CATALOG_ROW_INVALID'"
    )


def _temperature_limit_message(details: Mapping[str, Any]) -> str:
    manual_mark = details.get("manual_cable_model")
    if manual_mark is None:
        return "Температуры объекта находятся вне допустимого диапазона кабелей"

    violations = _detail_names(details, "violations")
    reasons: list[str] = []
    if "ambient_below_minimum" in violations:
        reasons.append(
            "температура окружающей среды "
            f"{_format_decimal(_required(details, 'ambient_temperature_c'))} °C ниже "
            "допустимого минимума "
            f"{_format_decimal(_required(details, 'minimum_supported_ambient_temperature_c'))} °C"
        )
    if "product_above_maximum" in violations:
        reasons.append(
            f"температура продукта {_format_decimal(_required(details, 'product_temperature_c'))} °C "
            "выше допустимого максимума "
            f"{_format_decimal(_required(details, 'maximum_supported_product_temperature_c'))} °C"
        )
    if not reasons:
        reasons.append("заданное сочетание температур не поддерживается")
    return f"Выбранная марка {manual_mark} не подходит: {'; '.join(reasons)}"


def _final_gate_message(details: Mapping[str, Any]) -> str:
    check = _required(details, "check")
    try:
        message = _FINAL_GATE_MESSAGES[str(check)]
    except KeyError as exc:
        raise RuntimeError(f"Нет backend-маппинга для проверки final-gate {check!r}") from exc
    if check == "catalog_missing":
        return f"{message} {_required(details, 'left')}"
    if check == "catalog_identity":
        return f"Каталог {_required(details, 'left')} без version/checksum"
    return message


def _legacy_details(value: object) -> dict[str, Any]:
    if isinstance(value, tuple) and not value:
        return {}
    thawed = _thaw(value)
    if not isinstance(thawed, dict):
        raise RuntimeError("details core-ошибки должны быть отображением")
    return thawed


def _thaw(value: object) -> Any:
    """Convert core's frozen mappings/sequences without serializing them to text."""

    if isinstance(value, Mapping):
        return {str(key): _thaw(item) for key, item in value.items()}
    if isinstance(value, tuple):
        if value and _tuple_mapping(value):
            return {str(key): _thaw(item) for key, item in value}
        return [_thaw(item) for item in value]
    if isinstance(value, list):
        return [_thaw(item) for item in value]
    if isinstance(value, frozenset):
        return [_thaw(item) for item in sorted(value, key=repr)]
    if isinstance(value, Decimal):
        if not value.is_finite():
            return str(value)
        return float(value)
    return value


def _tuple_mapping(value: tuple[object, ...]) -> bool:
    return all(
        isinstance(item, tuple) and len(item) == 2 and isinstance(item[0], str) for item in value
    )


def _detail_names(details: Mapping[str, Any], key: str) -> set[str]:
    raw = details.get(key, [])
    if not isinstance(raw, list):
        raise RuntimeError(f"Деталь {key!r} core-ошибки должна быть списком")
    return {str(item) for item in raw}


def _required(details: Mapping[str, Any], *names: str) -> Any:
    for name in names:
        if name in details and details[name] is not None:
            return details[name]
    joined = ", ".join(repr(name) for name in names)
    raise RuntimeError(f"В core-ошибке отсутствует обязательная detail: {joined}")


def _format_decimal(value: object) -> str:
    if isinstance(value, Decimal):
        return format(value.normalize(), "f")
    if isinstance(value, int):
        return str(value)
    if isinstance(value, float):
        return format(Decimal(str(value)).normalize(), "f")
    raise RuntimeError(f"Ожидалось числовое значение в detail core-ошибки, получено {value!r}")
