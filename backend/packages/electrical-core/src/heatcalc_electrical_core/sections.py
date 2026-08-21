"""Equal-section planning from a resolved immutable catalog bundle."""

from __future__ import annotations

from dataclasses import dataclass
from decimal import ROUND_CEILING, Decimal

from .catalogs import SectionCatalogRow, normalize_mark
from .decimal_math import round_down, round_result, round_up
from .errors import TTFormulaDomainError


@dataclass(frozen=True, slots=True)
class EqualSection:
    length_m: Decimal
    voltage_v: Decimal
    power_w: Decimal
    working_current_a: Decimal
    start_current_a: Decimal


@dataclass(frozen=True, slots=True)
class SectionPlan:
    section_count: int
    section_length_m: Decimal
    l_max_m: Decimal
    l_tok_m: Decimal
    l_ogr_m: Decimal
    l_required_m: Decimal
    l_fact_m: Decimal
    i_dop_a: Decimal
    i_st_ud_a_per_m: Decimal
    start_current_a: Decimal
    working_current_a: Decimal
    start_current_per_section_a: Decimal
    working_current_per_section_a: Decimal
    power_per_section_w: Decimal
    total_power_w: Decimal
    l_excess_m: Decimal
    order_cable_length_m: Decimal
    voltage_v: Decimal
    cold_start_temperature: Decimal
    i_dop_source: str

    @property
    def equal_sections(self) -> tuple[EqualSection, ...]:
        one = EqualSection(
            self.section_length_m,
            self.voltage_v,
            self.power_per_section_w,
            self.working_current_per_section_a,
            self.start_current_per_section_a,
        )
        return tuple(one for _ in range(self.section_count))


def lookup_section_row(
    *, mark: str, cold_start_temperature: Decimal, catalog_rows: tuple[SectionCatalogRow, ...]
) -> SectionCatalogRow | None:
    base = normalize_mark(mark)
    for suffix in ("-СТ", "-СР"):
        if base.endswith(suffix):
            base = base[: -len(suffix)]
    matched = tuple(
        row
        for row in catalog_rows
        if normalize_mark(row.base_model) == base
        and row.cold_start_temperature <= cold_start_temperature
        and row.planning_eligible
        and row.l_max_m is not None
        and row.i_st_ud_a_per_m is not None
        and row.voltage_v is not None
        and row.l_max_m > 0
        and row.i_st_ud_a_per_m > 0
        and row.voltage_v > 0
    )
    return max(matched, key=lambda row: row.cold_start_temperature) if matched else None


def compute_section_plan(
    *,
    mark: str,
    installed_cable_length_m: Decimal,
    power_per_meter_w: Decimal,
    voltage_v: Decimal,
    cold_start_temperature: Decimal,
    catalog_rows: tuple[SectionCatalogRow, ...],
    max_start_current_per_section_a: Decimal | None,
    max_start_current_source: str,
) -> SectionPlan:
    if installed_cable_length_m <= 0 or power_per_meter_w <= 0 or voltage_v <= 0:
        raise TTFormulaDomainError("ELECTRICAL_SECTION_PLAN_INVALID")
    row = lookup_section_row(
        mark=mark, cold_start_temperature=cold_start_temperature, catalog_rows=catalog_rows
    )
    if row is None:
        raise TTFormulaDomainError(
            "ELECTRICAL_SECTION_CATALOG_ROW_NOT_FOUND",
            mark=mark,
            cold_start_temperature_c=cold_start_temperature,
        )
    if (
        row.l_max_m is None
        or row.i_st_ud_a_per_m is None
        or row.l_max_m <= 0
        or row.i_st_ud_a_per_m <= 0
    ):
        raise TTFormulaDomainError("ELECTRICAL_SECTION_PLAN_INVALID")
    limit = max_start_current_per_section_a
    source = max_start_current_source if limit is not None else "section_catalog_derived"
    if limit is None:
        limit = row.l_max_m * row.i_st_ud_a_per_m
    if limit <= 0:
        raise TTFormulaDomainError("SECTION_CURRENT_LIMIT_REQUIRED")
    l_tok = limit / row.i_st_ud_a_per_m
    l_ogr = round_down(min(row.l_max_m, l_tok))
    if l_ogr <= 0:
        raise TTFormulaDomainError("ELECTRICAL_SECTION_PLAN_INVALID")
    count = int((installed_cable_length_m / l_ogr).to_integral_value(rounding=ROUND_CEILING))
    l_fact = l_ogr * count
    start_one = row.i_st_ud_a_per_m * l_ogr
    if start_one > limit:
        raise TTFormulaDomainError("ELECTRICAL_SECTION_PLAN_INVALID")
    power_one = power_per_meter_w * l_ogr
    working_one = power_one / voltage_v
    return SectionPlan(
        count,
        l_ogr,
        row.l_max_m,
        round_result(l_tok),
        l_ogr,
        round_result(installed_cable_length_m),
        round_result(l_fact),
        round_result(limit),
        row.i_st_ud_a_per_m,
        round_result(start_one * count),
        round_result(working_one * count),
        round_result(start_one),
        round_result(working_one),
        round_result(power_one),
        round_result(power_one * count),
        round_result(l_fact - installed_cable_length_m),
        round_up(l_fact * Decimal("1.10")),
        voltage_v,
        row.cold_start_temperature,
        source,
    )
