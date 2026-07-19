"""Heating section algorithm (PDF §6.14 / PDL-ER-15…24).

Uses registered provisional catalog (SEEDS-01). Official manufacturer table
should replace section_catalog.json without changing this API.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from functools import lru_cache
from typing import Any

from app.reference_data.loader import _load_json  # type: ignore[attr-defined]


@dataclass(frozen=True, slots=True)
class SectionCatalogRow:
    mark: str
    voltage_v: float
    cold_start_temp_c: float
    l_max_m: float
    i_dop_a: float
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
    power_per_section_w: float
    total_power_w: float
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
                    i_dop_a=float(item["i_dop_a"]),
                    i_st_ud_a_per_m=float(item["i_st_ud_a_per_m"]),
                )
            )
        except (KeyError, TypeError, ValueError):
            continue
    return out


def _mark_lookup_keys(mark: str) -> list[str]:
    """Catalog keys for a result mark without inventing new Lmax numbers.

    TLT marks match as-is. TT-series order marks (25ТТН2-СТ) fall back to the
    same power band ТЛТ-{n} row already registered in provisional catalog.
    """
    raw = mark.strip()
    keys = [raw]
    # 25ТТН2 / 30ТТВ2-СТ → ТЛТ-25 / ТЛТ-30 (power proxy, existing TLT rows only)
    import re
    m = re.match(r"^(\d{1,3})\s*ТТ", raw, flags=re.IGNORECASE)
    if m:
        keys.append(f"ТЛТ-{int(m.group(1))}")
    # Strip commercial suffix if present
    for suffix in ("-СТ", "-СР"):
        if raw.endswith(suffix):
            keys.append(raw[: -len(suffix)])
            break
    # Deduplicate preserving order
    seen: set[str] = set()
    out: list[str] = []
    for key in keys:
        if key not in seen:
            seen.add(key)
            out.append(key)
    return out


def lookup_section_row(
    *,
    mark: str,
    voltage_v: float,
    cold_start_temp_c: float,
) -> SectionCatalogRow | None:
    """Exact mark + nearest colder-or-equal cold-start row for voltage."""
    if not section_catalog_registered():
        return None
    all_rows = _parse_rows()
    for mark_key in _mark_lookup_keys(mark):
        rows = [
            r
            for r in all_rows
            if r.mark == mark_key and abs(r.voltage_v - voltage_v) < 0.5
        ]
        if not rows:
            continue
        # Prefer cold_start_temp <= ambient cold-start, closest from below; else nearest.
        colder = [r for r in rows if r.cold_start_temp_c <= cold_start_temp_c]
        pool = colder if colder else rows
        return min(pool, key=lambda r: abs(r.cold_start_temp_c - cold_start_temp_c))
    return None


def compute_section_plan(
    *,
    mark: str,
    installed_cable_length_m: float,
    power_per_meter_w: float,
    working_current_total_a: float,
    voltage_v: float = 220.0,
    cold_start_temp_c: float = -20.0,
) -> SectionPlan | None:
    """PDF §6.14: Lток, Lогр, N=ceil, equal sections.

    Returns None when catalog row missing (fail-closed for that mark).
    """
    if installed_cable_length_m <= 0 or power_per_meter_w <= 0:
        return None
    row = lookup_section_row(
        mark=mark,
        voltage_v=voltage_v,
        cold_start_temp_c=cold_start_temp_c,
    )
    if row is None or row.i_st_ud_a_per_m <= 0 or row.l_max_m <= 0:
        return None

    l_tok = row.i_dop_a / row.i_st_ud_a_per_m
    # PDL-ER-24: floor for Lогр per catalog rounding=floor_l_ogr
    l_ogr = math.floor(min(row.l_max_m, l_tok) * 1000.0) / 1000.0
    if l_ogr <= 0:
        return None

    l_req = float(installed_cable_length_m)
    n = max(1, int(math.ceil(l_req / l_ogr - 1e-12)))
    l_sec = l_ogr
    l_fact = l_sec * n
    # Equal auto-sections (PDF): last is not remainder — all length Lогр.
    start_per_section = row.i_st_ud_a_per_m * l_sec
    start_total = start_per_section * n
    power_per_section = power_per_meter_w * l_sec
    meta = section_catalog_meta()

    return SectionPlan(
        section_count=n,
        section_length_m=round(l_sec, 3),
        l_max_m=row.l_max_m,
        l_tok_m=round(l_tok, 3),
        l_ogr_m=round(l_ogr, 3),
        l_required_m=round(l_req, 3),
        l_fact_m=round(l_fact, 3),
        i_dop_a=row.i_dop_a,
        i_st_ud_a_per_m=row.i_st_ud_a_per_m,
        start_current_a=round(start_total, 3),
        working_current_a=round(working_current_total_a, 3),
        power_per_section_w=round(power_per_section, 3),
        total_power_w=round(power_per_section * n, 3),
        catalog_source=str(meta.get("source") or ""),
        catalog_version=str(meta.get("version") or ""),
        voltage_v=row.voltage_v,
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
        "section_start_current_a": plan.start_current_a,
        "section_working_current_a": plan.working_current_a,
        "start_current": plan.start_current_a,
        "working_current": plan.working_current_a,
        "section_power_w": plan.power_per_section_w,
        "section_catalog_source": plan.catalog_source,
        "section_catalog_version": plan.catalog_version,
        "sections": [
            {
                "index": i + 1,
                "length_m": plan.section_length_m,
                "power_w": plan.power_per_section_w,
                "start_current_a": round(plan.start_current_a / plan.section_count, 3),
                "working_current_a": round(plan.working_current_a / plan.section_count, 3),
            }
            for i in range(plan.section_count)
        ],
    }
