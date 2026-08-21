"""Application adapter contract for immutable electrical-core failures."""

from __future__ import annotations

import json
from decimal import Decimal

import pytest
from heatcalc_electrical_core.errors import TTFormulaDomainError
from heatcalc_electrical_core.validation import TTFormulaIssue, TTFormulaReport

from app.electrical_domain import ElectricalFormulaError
from app.formulas.electrical.outcome_errors import (
    electrical_error_from_domain,
    electrical_error_from_report,
    raise_electrical_formula_domain_error,
)


def test_temperature_report_restores_legacy_message_and_json_friendly_details() -> None:
    issue = TTFormulaIssue.with_details(
        "ELECTRICAL_CABLE_TEMPERATURE_LIMIT_EXCEEDED",
        product_temperature_c=Decimal("66"),
        ambient_temperature_c=Decimal("-41"),
        minimum_supported_ambient_temperature_c=Decimal("-40"),
        maximum_supported_product_temperature_c=Decimal("65"),
        violations=("ambient_below_minimum", "product_above_maximum"),
        manual_cable_model="10ТТН2-СТ",
        nested={"models": ("10ТТН2-СТ", "25ТТН2-СТ")},
    )

    error = electrical_error_from_report(TTFormulaReport((issue,)))

    assert error.code == "ELECTRICAL_CABLE_TEMPERATURE_LIMIT_EXCEEDED"
    assert error.status_code == 422
    assert error.message == (
        "Выбранная марка 10ТТН2-СТ не подходит: температура окружающей среды -41 °C "
        "ниже допустимого минимума -40 °C; температура продукта 66 °C выше "
        "допустимого максимума 65 °C"
    )
    assert error.details == {
        "product_temperature_c": 66.0,
        "ambient_temperature_c": -41.0,
        "minimum_supported_ambient_temperature_c": -40.0,
        "maximum_supported_product_temperature_c": 65.0,
        "violations": ["ambient_below_minimum", "product_above_maximum"],
        "manual_cable_model": "10ТТН2-СТ",
        "nested": {"models": ["10ТТН2-СТ", "25ТТН2-СТ"]},
    }


def test_power_report_keeps_manual_mark_dynamic_message() -> None:
    issue = TTFormulaIssue.with_details(
        "ELECTRICAL_CABLE_POWER_INSUFFICIENT",
        required_power_per_meter_w=Decimal("45"),
        maximum_available_power_per_meter_w=Decimal("10"),
        maximum_threads=1,
        manual_cable_model="10ТТН2-СТ",
    )

    error = electrical_error_from_report(TTFormulaReport((issue,)))

    assert error.message == "Выбранная марка 10ТТН2-СТ не обеспечивает требуемую мощность 45 Вт/м"
    assert error.details["required_power_per_meter_w"] == 45.0


def test_domain_final_gate_keeps_code_details_and_russian_message() -> None:
    domain_error = TTFormulaDomainError(
        "ELECTRICAL_FINAL_GATE_FAILED",
        check="equal_sections",
        left={"index": 2, "field": "power_w", "value": Decimal("2000")},
        right=Decimal("2050"),
    )

    error = electrical_error_from_domain(domain_error)

    assert error.code == "ELECTRICAL_FINAL_GATE_FAILED"
    assert error.message == "Автоматические секции должны иметь одинаковые расчётные параметры"
    assert error.details == {
        "check": "equal_sections",
        "left": {"index": 2, "field": "power_w", "value": 2000.0},
        "right": 2050.0,
    }


@pytest.mark.parametrize(
    ("code", "details", "message"),
    [
        (
            "ELECTRICAL_CATALOG_ROW_INVALID",
            {"model": "10ТТН2", "missing_fields": ("min_temperature",)},
            "Для модели отсутствует T_min из каталога секционирования",
        ),
        (
            "ELECTRICAL_WINDING_PITCH_INVALID",
            {"outer_diameter_mm": Decimal("89"), "winding_pitch_mm": Decimal("80")},
            "Шаг навива должен быть больше наружного диаметра трубы",
        ),
        (
            "ELECTRICAL_SECTION_CATALOG_ROW_NOT_FOUND",
            {"mark": "25ТТН2-СТ", "cold_start_temperature_c": Decimal("-20")},
            "Не найдена строка каталога секционирования для модели и температуры",
        ),
    ],
)
def test_core_codes_keep_legacy_messages(
    code: str,
    details: dict[str, object],
    message: str,
) -> None:
    error = electrical_error_from_domain(TTFormulaDomainError(code, details=details))

    assert error.code == code
    assert error.message == message
    assert error.details


def test_unknown_report_code_fails_closed() -> None:
    with pytest.raises(RuntimeError, match="Нет backend-маппинга для core-ошибки"):
        electrical_error_from_report(TTFormulaReport((TTFormulaIssue("future_core_code"),)))


def test_unknown_domain_code_fails_closed_without_wrapping() -> None:
    with pytest.raises(RuntimeError, match="Нет backend-маппинга для core-ошибки"):
        raise_electrical_formula_domain_error(TTFormulaDomainError("future_core_code"))


def test_domain_raise_preserves_the_core_error_as_cause() -> None:
    domain_error = TTFormulaDomainError("SECTION_CURRENT_LIMIT_REQUIRED")

    with pytest.raises(ElectricalFormulaError) as caught:
        raise_electrical_formula_domain_error(domain_error)

    assert caught.value.message == "Допустимый стартовый ток секции должен быть положительным"
    assert caught.value.__cause__ is domain_error


@pytest.mark.parametrize(
    ("code", "value", "message"),
    [
        (
            "ELECTRICAL_INPUT_NOT_FINITE",
            Decimal("NaN"),
            "Параметр «supply_voltage_v» должен быть конечным числом",
        ),
        (
            "ELECTRICAL_INPUT_OUT_OF_RANGE",
            Decimal("0"),
            "Параметр «supply_voltage_v» должен быть больше 0",
        ),
    ],
)
def test_input_reports_keep_path_russian_message_and_strict_json_details(
    code: str, value: Decimal, message: str
) -> None:
    details: dict[str, object] = {"value": value}
    if code == "ELECTRICAL_INPUT_OUT_OF_RANGE":
        details.update({"minimum": Decimal("0"), "minimum_exclusive": True})
    issue = TTFormulaIssue.with_details(code, path=("supply_voltage_v",), **details)

    error = electrical_error_from_report(TTFormulaReport((issue,)))

    assert error.message == message
    assert error.details["path"] == ["supply_voltage_v"]
    assert error.details["value"] == ("NaN" if value.is_nan() else 0.0)
    json.dumps(error.as_detail(), allow_nan=False)


@pytest.mark.parametrize(
    "code",
    ["ELECTRICAL_SECTION_PLAN_INVALID", "ELECTRICAL_TANK_LAYOUT_INVALID"],
)
def test_remaining_core_domain_codes_have_backend_mapping(code: str) -> None:
    error = electrical_error_from_domain(TTFormulaDomainError(code))

    assert error.code == code
    assert error.message
