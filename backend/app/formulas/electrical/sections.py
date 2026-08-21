"""Heating section algorithm (PDF §6.14).

Uses the registered ``Параметры Кабеля.xlsx`` table for the ТТН/ТТВ/ТТХ
product line.  The passport table defines ``Lмакс`` and the specific start
current; an optional upstream breaker limit can further reduce ``Lогр``.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from copy import deepcopy
from dataclasses import dataclass
from decimal import Decimal
from functools import lru_cache
from typing import Any

from heatcalc_electrical_core import (
    SectionCatalogRow as CoreSectionCatalogRow,
)
from heatcalc_electrical_core import (
    TTFormulaDomainError,
)
from heatcalc_electrical_core.sections import compute_section_plan as _core_compute_section_plan
from heatcalc_electrical_core.sections import lookup_section_row as _core_lookup_section_row

from app.electrical_domain import ElectricalFormulaError
from app.formulas.electrical.decimal_math import decimal_value
from app.formulas.electrical.outcome_errors import raise_electrical_formula_domain_error
from app.reference_data.loader import _load_json


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
    i_dop_source: str = "manual_input"


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
        "source_checksum": data.get("source_checksum"),
        "version": data.get("version"),
        "schema_version": data.get("schema_version"),
        "registered_at": data.get("registered_at"),
    }


def section_catalog_payload_snapshot() -> dict[str, Any]:
    """Return an isolated copy for the dev/test catalog authority adapter."""
    return deepcopy(_catalog_payload())


def _parse_catalog_rows(raw: Any) -> list[SectionCatalogRow]:
    out: list[SectionCatalogRow] = []
    if not isinstance(raw, list):
        return out
    for item in raw:
        if not isinstance(item, dict):
            continue
        try:
            cold_start = item["cold_start_temperature_c"]
            specific_start_current = (
                item["specific_start_current_a_per_m"]
                if "specific_start_current_a_per_m" in item
                else item["i_st_ud_a_per_m"]
            )
            out.append(
                SectionCatalogRow(
                    mark=str(item.get("base_model") or item["mark"]).strip(),
                    voltage_v=float(item.get("voltage_v", 230)),
                    cold_start_temp_c=float(cold_start),
                    l_max_m=float(item["l_max_m"]),
                    i_dop_a=(float(item["i_dop_a"]) if item.get("i_dop_a") is not None else None),
                    i_st_ud_a_per_m=float(specific_start_current),
                )
            )
        except (KeyError, TypeError, ValueError):
            continue
    return out


def _parse_rows() -> list[SectionCatalogRow]:
    return _parse_catalog_rows(_catalog_payload().get("rows") or [])


def _core_rows(rows: Sequence[SectionCatalogRow]) -> tuple[CoreSectionCatalogRow, ...]:
    """Project app-owned parsed catalog rows to the immutable core DTO."""
    return tuple(
        CoreSectionCatalogRow(
            base_model=row.mark,
            cold_start_temperature=decimal_value(row.cold_start_temp_c),
            l_max_m=decimal_value(row.l_max_m),
            i_st_ud_a_per_m=decimal_value(row.i_st_ud_a_per_m),
            voltage_v=decimal_value(row.voltage_v),
            i_dop_a=decimal_value(row.i_dop_a) if row.i_dop_a is not None else None,
        )
        for row in rows
    )


def _legacy_row(row: CoreSectionCatalogRow | None) -> SectionCatalogRow | None:
    if row is None:
        return None
    return SectionCatalogRow(
        mark=row.base_model,
        voltage_v=float(row.voltage_v or Decimal("230")),
        cold_start_temp_c=float(row.cold_start_temperature),
        l_max_m=float(row.l_max_m or Decimal("0")),
        i_dop_a=float(row.i_dop_a) if row.i_dop_a is not None else None,
        i_st_ud_a_per_m=float(row.i_st_ud_a_per_m or Decimal("0")),
    )


def lookup_section_row(
    *,
    mark: str,
    cold_start_temp_c: float,
    catalog_rows: Sequence[Mapping[str, Any]] | None = None,
) -> SectionCatalogRow | None:
    """Exact model + exact/nearest-colder cold-start row, never warmer fallback."""
    if catalog_rows is None:
        if not section_catalog_registered():
            return None
        all_rows = _parse_rows()
    else:
        all_rows = _parse_catalog_rows(list(catalog_rows))
    # Case 1 §6.14 lookup is model + temperature based. Working voltage is
    # downstream input for current calculation, not a catalog eligibility key.
    return _legacy_row(
        _core_lookup_section_row(
            mark=mark,
            cold_start_temperature=decimal_value(cold_start_temp_c),
            catalog_rows=_core_rows(all_rows),
        )
    )


def compute_section_plan(
    *,
    mark: str,
    installed_cable_length_m: float,
    power_per_meter_w: float,
    working_current_total_a: float | None = None,
    voltage_v: float,
    cold_start_temp_c: float,
    max_start_current_per_section_a: float | None = None,
    max_start_current_source: str | None = None,
    catalog_rows: Sequence[Mapping[str, Any]] | None = None,
    catalog_metadata: Mapping[str, Any] | None = None,
) -> SectionPlan:
    """Legacy DTO adapter over the core equal-section planner."""
    del working_current_total_a  # preserved public signature; core totals are authoritative
    if voltage_v <= 0:
        raise ElectricalFormulaError(
            "ELECTRICAL_NOMINAL_VOLTAGE_INVALID",
            "Рабочее напряжение должно быть положительным",
        )
    if catalog_rows is None:
        all_rows = _parse_rows() if section_catalog_registered() else []
    else:
        all_rows = _parse_catalog_rows(list(catalog_rows))
    try:
        plan = _core_compute_section_plan(
            mark=mark,
            installed_cable_length_m=decimal_value(installed_cable_length_m),
            power_per_meter_w=decimal_value(power_per_meter_w),
            voltage_v=decimal_value(voltage_v),
            cold_start_temperature=decimal_value(cold_start_temp_c),
            catalog_rows=_core_rows(all_rows),
            max_start_current_per_section_a=(
                decimal_value(max_start_current_per_section_a)
                if max_start_current_per_section_a is not None
                else None
            ),
            max_start_current_source=max_start_current_source or "manual_input",
        )
    except TTFormulaDomainError as error:
        raise_electrical_formula_domain_error(error)
        raise AssertionError("core section-plan error mapping must raise") from error
    meta = dict(catalog_metadata) if catalog_metadata is not None else section_catalog_meta()
    return SectionPlan(
        section_count=plan.section_count,
        section_length_m=float(plan.section_length_m),
        l_max_m=float(plan.l_max_m),
        l_tok_m=float(plan.l_tok_m),
        l_ogr_m=float(plan.l_ogr_m),
        l_required_m=float(plan.l_required_m),
        l_fact_m=float(plan.l_fact_m),
        i_dop_a=float(plan.i_dop_a),
        i_dop_source=plan.i_dop_source,
        i_st_ud_a_per_m=float(plan.i_st_ud_a_per_m),
        start_current_a=float(plan.start_current_a),
        working_current_a=float(plan.working_current_a),
        start_current_per_section_a=float(plan.start_current_per_section_a),
        working_current_per_section_a=float(plan.working_current_per_section_a),
        power_per_section_w=float(plan.power_per_section_w),
        total_power_w=float(plan.total_power_w),
        l_excess_m=float(plan.l_excess_m),
        order_cable_length_m=float(plan.order_cable_length_m),
        catalog_source=str(meta.get("source") or ""),
        catalog_version=str(meta.get("version") or ""),
        voltage_v=float(plan.voltage_v),
        cold_start_temp_c=float(plan.cold_start_temperature),
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
        "section_max_start_current_a": plan.i_dop_a,
        "section_max_start_current_source": plan.i_dop_source,
        "sections": [
            {
                "index": i + 1,
                "length_m": plan.section_length_m,
                "power_w": plan.power_per_section_w,
                "start_current_a": plan.start_current_per_section_a,
                "working_current_a": plan.working_current_per_section_a,
                "voltage_v": plan.voltage_v,
            }
            for i in range(plan.section_count)
        ],
    }
