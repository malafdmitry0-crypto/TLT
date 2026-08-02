"""Heating section algorithm (PDF §6.14).

Uses the registered ``Параметры Кабеля.xlsx`` table for the ТТН/ТТВ/ТТХ
product line.  The passport table defines ``Lмакс`` and the specific start
current; an optional upstream breaker limit can further reduce ``Lогр``.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import ROUND_CEILING, Decimal
from functools import lru_cache
from typing import Any

from app.electrical_domain import ElectricalFormulaError
from app.formulas.electrical.decimal_math import decimal_value, round_down, round_result, round_up
from app.reference_data.loader import _load_json  # type: ignore[attr-defined]


@dataclass(frozen=True, slots=True)
class SectionCatalogRow:
    mark: str
    voltage_v: float
    cold_start_temp_c: float
    l_max_m: float
    i_dop_a: float | None
    i_st_ud_a_per_m: float


@dataclass(frozen=True, slots=True)
class SectionPlan:
    section_count: int
    section_length_m: float
    l_max_m: float
    l_tok_m: float
    l_ogr_m: float
    l_required_m: float
    l_fact_m: float
    i_dop_a: float
    i_st_ud_a_per_m: float
    start_current_a: float
    working_current_a: float
    start_current_per_section_a: float
    working_current_per_section_a: float
    power_per_section_w: float
    total_power_w: float
    l_excess_m: float
    order_cable_length_m: float
    catalog_source: str
    catalog_version: str
    voltage_v: float
    cold_start_temp_c: float


@lru_cache
def _catalog_payload() -> dict[str, Any]:
    try:
        return dict(_load_json("section_catalog.json"))
    except Exception:
        return {"status": "missing", "rows": []}


def clear_section_catalog_cache() -> None:
    _catalog_payload.cache_clear()


def section_catalog_registered() -> bool:
    data = _catalog_payload()
    if data.get("status") != "registered":
        return False
    rows = data.get("rows")
    return isinstance(rows, list) and len(rows) > 0


def section_catalog_meta() -> dict[str, Any]:
    data = _catalog_payload()
    return {
        "status": data.get("status"),
        "source": data.get("source"),
        "version": data.get("version"),
        "registered_at": data.get("registered_at"),
    }


def _parse_rows() -> list[SectionCatalogRow]:
    data = _catalog_payload()
    raw = data.get("rows") or []
    out: list[SectionCatalogRow] = []
    if not isinstance(raw, list):
        return out
    for item in raw:
        if not isinstance(item, dict):
            continue
        try:
            out.append(
                SectionCatalogRow(
                    mark=str(item["mark"]).strip(),
                    voltage_v=float(item["voltage_v"]),
                    cold_start_temp_c=float(item["cold_start_temp_c"]),
                    l_max_m=float(item["l_max_m"]),
                    i_dop_a=(
                        float(item["i_dop_a"])
                        if item.get("i_dop_a") is not None
                        else None
                    ),
                    i_st_ud_a_per_m=float(item["i_st_ud_a_per_m"]),
                )
            )
        except (KeyError, TypeError, ValueError):
            continue
    return out


def _mark_lookup_keys(mark: str) -> list[str]:
    """Return exact TT model keys, accepting only its commercial suffix."""
    raw = mark.strip()
    for suffix in ("-СТ", "-СР"):
        if raw.endswith(suffix):
            return [raw[: -len(suffix)]]
    return [raw]


def lookup_section_row(
    *,
    mark: str,
    voltage_v: float,
    cold_start_temp_c: float,
) -> SectionCatalogRow | None:
    """Exact model + exact/nearest-colder cold-start row, never warmer fallback."""
    if not section_catalog_registered():
        return None
    all_rows = _parse_rows()
    for mark_key in _mark_lookup_keys(mark):
        rows = [r for r in all_rows if r.mark == mark_key]
        if not rows:
            continue
        # Imported rows may carry legacy 220 V; lookup is temperature/model based and
        # the new calculation is normalized to 230 V at the formula boundary.
        colder = [r for r in rows if r.cold_start_temp_c <= cold_start_temp_c]
        if not colder:
            return None
        return max(colder, key=lambda r: r.cold_start_temp_c)
    return None


def compute_section_plan(
    *,
    mark: str,
    installed_cable_length_m: float,
    power_per_meter_w: float,
    working_current_total_a: float | None = None,
    voltage_v: float = 230.0,
    cold_start_temp_c: float = -20.0,
    max_start_current_per_section_a: float | None = None,
) -> SectionPlan:
    """Compute equal fail-closed sections and totals from physical installed length."""
    del working_current_total_a  # preserved in the public signature; totals are authoritative here
    if voltage_v != 230:
        raise ElectricalFormulaError(
            "ELECTRICAL_NOMINAL_VOLTAGE_UNSUPPORTED",
            "Новый электрический расчёт поддерживает только напряжение 230 В",
        )
    if installed_cable_length_m <= 0 or power_per_meter_w <= 0:
        raise ElectricalFormulaError(
            "ELECTRICAL_SECTION_PLAN_INVALID", "Длина и мощность кабеля должны быть положительными"
        )
    row = lookup_section_row(
        mark=mark,
        voltage_v=voltage_v,
        cold_start_temp_c=cold_start_temp_c,
    )
    if row is None:
        raise ElectricalFormulaError(
            "ELECTRICAL_SECTION_CATALOG_ROW_NOT_FOUND",
            "Не найдена строка каталога секционирования для модели и температуры",
            details={"mark": mark, "cold_start_temperature_c": cold_start_temp_c},
        )
    if row.i_st_ud_a_per_m <= 0 or row.l_max_m <= 0:
        raise ElectricalFormulaError(
            "ELECTRICAL_SECTION_PLAN_INVALID", "Параметры строки секционирования неположительны"
        )
    if max_start_current_per_section_a is None:
        raise ElectricalFormulaError(
            "SECTION_CURRENT_LIMIT_REQUIRED", "Требуется допустимый стартовый ток секции Iдоп"
        )
    current_limit = decimal_value(max_start_current_per_section_a)
    if current_limit <= 0:
        raise ElectricalFormulaError(
            "SECTION_CURRENT_LIMIT_REQUIRED", "Допустимый стартовый ток секции должен быть положительным"
        )

    specific_start = decimal_value(row.i_st_ud_a_per_m)
    l_tok = current_limit / specific_start
    l_ogr_limit = min(decimal_value(row.l_max_m), l_tok)
    l_ogr = round_down(l_ogr_limit)
    if l_ogr <= 0:
        raise ElectricalFormulaError(
            "ELECTRICAL_SECTION_PLAN_INVALID", "Расчётный предел длины секции неположителен"
        )

    l_req = decimal_value(installed_cable_length_m)
    n = int((l_req / l_ogr).to_integral_value(rounding=ROUND_CEILING))
    l_sec = l_ogr
    l_fact = l_sec * n
    l_excess = l_fact - l_req
    order_length = round_up(l_fact * Decimal("1.10"))
    start_per_section = specific_start * l_sec
    if start_per_section > current_limit:
        raise ElectricalFormulaError(
            "ELECTRICAL_SECTION_PLAN_INVALID", "Стартовый ток секции превышает Iдоп"
        )
    start_total = start_per_section * n
    power_per_section = decimal_value(power_per_meter_w) * l_sec
    working_per_section = power_per_section / Decimal(230)
    working_total = working_per_section * n
    meta = section_catalog_meta()

    return SectionPlan(
        section_count=n,
        section_length_m=float(l_sec),
        l_max_m=row.l_max_m,
        l_tok_m=float(round_result(l_tok)),
        l_ogr_m=float(l_ogr),
        l_required_m=float(round_result(l_req)),
        l_fact_m=float(round_result(l_fact)),
        i_dop_a=float(current_limit),
        i_st_ud_a_per_m=row.i_st_ud_a_per_m,
        start_current_a=float(round_result(start_total)),
        working_current_a=float(round_result(working_total)),
        start_current_per_section_a=float(round_result(start_per_section)),
        working_current_per_section_a=float(round_result(working_per_section)),
        power_per_section_w=float(round_result(power_per_section)),
        total_power_w=float(round_result(power_per_section * n)),
        l_excess_m=float(round_result(l_excess)),
        order_cable_length_m=float(order_length),
        catalog_source=str(meta.get("source") or ""),
        catalog_version=str(meta.get("version") or ""),
        voltage_v=230.0,
        cold_start_temp_c=row.cold_start_temp_c,
    )


def section_plan_to_result_fields(plan: SectionPlan) -> dict[str, Any]:
    """Fields merged into electrical calculation results."""
    return {
        "section_count": plan.section_count,
        "num_sections": plan.section_count,
        "section_length_m": plan.section_length_m,
        "section_l_max_m": plan.l_max_m,
        "section_l_tok_m": plan.l_tok_m,
        "section_l_ogr_m": plan.l_ogr_m,
        "section_l_fact_m": plan.l_fact_m,
        "section_l_excess_m": plan.l_excess_m,
        "order_cable_length": plan.order_cable_length_m,
        "cable_length": plan.l_fact_m,
        "installed_cable_length": plan.l_fact_m,
        "section_start_current_a": plan.start_current_a,
        "section_working_current_a": plan.working_current_a,
        "start_current": plan.start_current_a,
        "working_current": plan.working_current_a,
        "current": plan.working_current_a,
        "section_power_w": plan.power_per_section_w,
        "total_power": plan.total_power_w,
        "section_catalog_source": plan.catalog_source,
        "section_catalog_version": plan.catalog_version,
        "sections": [
            {
                "index": i + 1,
                "length_m": plan.section_length_m,
                "power_w": plan.power_per_section_w,
                "start_current_a": plan.start_current_per_section_a,
                "working_current_a": plan.working_current_per_section_a,
            }
            for i in range(plan.section_count)
        ],
    }
