"""§9.15 final acceptance gate for TT electrical results.

A result may be stored as ``status=ready`` only after these checks pass.
Fails closed with ``ELECTRICAL_FINAL_GATE_FAILED``.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from decimal import Decimal
from typing import Any

from app.electrical_domain import ElectricalFormulaError
from app.formulas.electrical.decimal_math import decimal_value
from app.formulas.electrical.sections import SectionPlan

_LENGTH_EPS = Decimal("0.0005")
_POWER_EPS = Decimal("0.01")
_CURRENT_EPS = Decimal("0.001")


def _fail(check: str, message: str, *, left: Any = None, right: Any = None) -> None:
    raise ElectricalFormulaError(
        "ELECTRICAL_FINAL_GATE_FAILED",
        message,
        details={"check": check, "left": left, "right": right},
    )


def _ge(left: Decimal, right: Decimal, eps: Decimal) -> bool:
    return left + eps >= right


def _le(left: Decimal, right: Decimal, eps: Decimal) -> bool:
    return left <= right + eps


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
    """Raise if the TT result must not be marked ready (§9.15)."""
    mark = str(cable_mark or "").strip()
    if not mark:
        _fail("cable_mark", "Марка кабеля не определена")

    series_s = str(series or "").strip()
    if not series_s:
        _fail("series", "Серия кабеля не определена")

    voltage = decimal_value(voltage_v)
    if voltage != Decimal("230"):
        _fail(
            "nominal_voltage_v",
            "Нормативное напряжение нового расчёта должно быть 230 В",
            left=float(voltage),
            right=230,
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

    lengths = {decimal_value(item.get("length_m")) for item in sections}
    if len(lengths) != 1 or next(iter(lengths)) != section_len:
        _fail(
            "equal_sections",
            "Автоматические секции должны иметь одинаковую длину",
            left=sorted(float(x) for x in lengths),
            right=plan.section_length_m,
        )

    p_req = decimal_value(required_power_per_meter_w)
    p_inst = decimal_value(installed_power_per_meter_w)
    if p_req <= 0:
        _fail("required_power", "Требуемая мощность на метр должна быть положительной", left=float(p_req))
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
