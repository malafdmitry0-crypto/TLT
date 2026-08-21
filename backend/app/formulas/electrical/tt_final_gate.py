"""Case 1 Revision 4 §6.14 final acceptance gate for TT electrical results.

A result may be stored as ``status=ready`` only after these checks pass.
Fails closed with ``ELECTRICAL_FINAL_GATE_FAILED``.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from decimal import Decimal
from typing import Any, Never

from app.electrical_domain import ElectricalFormulaError
from app.formulas.electrical.decimal_math import decimal_value
from app.formulas.electrical.sections import SectionPlan

_LENGTH_EPS = Decimal("0.0005")
_POWER_EPS = Decimal("0.01")
_CURRENT_EPS = Decimal("0.001")


def _fail(check: str, message: str, *, left: Any = None, right: Any = None) -> Never:
    raise ElectricalFormulaError(
        "ELECTRICAL_FINAL_GATE_FAILED",
        message,
        details={"check": check, "left": left, "right": right},
    )


def _ge(left: Decimal, right: Decimal, eps: Decimal) -> bool:
    return left + eps >= right


def _le(left: Decimal, right: Decimal, eps: Decimal) -> bool:
    return left <= right + eps


def _eq(left: Decimal, right: Decimal, eps: Decimal) -> bool:
    return abs(left - right) <= eps


def assert_electrical_tt_ready(
    *,
    cable_mark: str | None,
    series: str | None,
    threads: int,
    voltage_v: float | int | Decimal,
    required_power_per_meter_w: float | Decimal,
    installed_power_per_meter_w: float | Decimal,
    plan: SectionPlan,
    sections: Sequence[Mapping[str, Any]],
    catalogs: Mapping[str, Any] | None = None,
) -> None:
    """Raise if the TT result must not be marked ready (§6.14)."""
    mark = str(cable_mark or "").strip()
    if not mark:
        _fail("cable_mark", "Марка кабеля не определена")

    series_s = str(series or "").strip()
    if not series_s:
        _fail("series", "Серия кабеля не определена")

    voltage = decimal_value(voltage_v)
    if voltage <= 0:
        _fail(
            "nominal_voltage_v",
            "Рабочее напряжение должно быть положительным",
            left=float(voltage),
            right="> 0",
        )
    plan_voltage = decimal_value(plan.voltage_v)
    if not _eq(plan_voltage, voltage, _CURRENT_EPS):
        _fail(
            "plan_voltage_match",
            "Напряжение плана секций не совпадает с входным напряжением",
            left=float(plan_voltage),
            right=float(voltage),
        )

    if not isinstance(threads, int) or threads < 1 or threads > 3:
        _fail(
            "threads",
            "Число ниток должно быть целым от 1 до 3",
            left=threads,
            right="1..3",
        )

    if plan.section_count <= 0:
        _fail("section_count", "Количество секций должно быть больше нуля", left=plan.section_count)

    section_len = decimal_value(plan.section_length_m)
    if section_len <= 0:
        _fail("section_length", "Длина секции должна быть больше нуля", left=plan.section_length_m)

    l_max = decimal_value(plan.l_max_m)
    if not _le(section_len, l_max, _LENGTH_EPS):
        _fail(
            "section_length_le_l_max",
            "Длина секции превышает Lмакс",
            left=plan.section_length_m,
            right=plan.l_max_m,
        )

    i_st = decimal_value(plan.start_current_per_section_a)
    i_dop = decimal_value(plan.i_dop_a)
    if not _le(i_st, i_dop, _CURRENT_EPS):
        _fail(
            "start_current_le_idop",
            "Стартовый ток секции превышает Iдоп",
            left=plan.start_current_per_section_a,
            right=plan.i_dop_a,
        )

    l_fact = decimal_value(plan.l_fact_m)
    l_req = decimal_value(plan.l_required_m)
    if not _ge(l_fact, l_req, _LENGTH_EPS):
        _fail(
            "l_fact_ge_l_req",
            "Фактическая длина секций меньше требуемой",
            left=plan.l_fact_m,
            right=plan.l_required_m,
        )

    if len(sections) != plan.section_count:
        _fail(
            "sections_count_match",
            "Число секций в списке не совпадает с планом",
            left=len(sections),
            right=plan.section_count,
        )

    expected_section_values = {
        "length_m": (section_len, _LENGTH_EPS),
        "voltage_v": (voltage, _CURRENT_EPS),
        "power_w": (decimal_value(plan.power_per_section_w), _POWER_EPS),
        "working_current_a": (
            decimal_value(plan.working_current_per_section_a),
            _CURRENT_EPS,
        ),
        "start_current_a": (
            decimal_value(plan.start_current_per_section_a),
            _CURRENT_EPS,
        ),
    }
    for index, item in enumerate(sections, start=1):
        for field, (expected, tolerance) in expected_section_values.items():
            raw_actual = item.get(field)
            if raw_actual is None:
                _fail(
                    "equal_sections",
                    "Секция содержит отсутствующее расчётное поле",
                    left={"index": index, "field": field},
                    right=float(expected),
                )
            try:
                actual = decimal_value(raw_actual)
            except (ArithmeticError, TypeError, ValueError):
                _fail(
                    "equal_sections",
                    "Секция содержит отсутствующее или некорректное расчётное поле",
                    left={"index": index, "field": field, "value": item.get(field)},
                    right=float(expected),
                )
            if not _eq(actual, expected, tolerance):
                _fail(
                    "equal_sections",
                    "Автоматические секции должны иметь одинаковые расчётные параметры",
                    left={"index": index, "field": field, "value": float(actual)},
                    right=float(expected),
                )

    p_req = decimal_value(required_power_per_meter_w)
    p_inst = decimal_value(installed_power_per_meter_w)
    if p_req <= 0:
        _fail(
            "required_power",
            "Требуемая мощность на метр должна быть положительной",
            left=float(p_req),
        )
    if not _ge(p_inst, p_req, _POWER_EPS):
        _fail(
            "installed_power_ge_required",
            "Установленная мощность на метр меньше требуемой",
            left=float(p_inst),
            right=float(p_req),
        )

    if catalogs is not None:
        for kind in ("power", "section", "bom"):
            cat = catalogs.get(kind)
            if not isinstance(cat, Mapping):
                _fail("catalog_missing", f"Отсутствует snapshot каталога {kind}", left=kind)
            checksum = cat.get("source_checksum") or cat.get("payload_checksum")
            version = cat.get("version")
            if not (isinstance(checksum, str) and checksum.strip()) and not (
                isinstance(version, str) and version.strip()
            ):
                _fail(
                    "catalog_identity",
                    f"Каталог {kind} без version/checksum",
                    left=kind,
                )
