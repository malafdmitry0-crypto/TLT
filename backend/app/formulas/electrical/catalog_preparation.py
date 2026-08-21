"""Prepare raw application TT catalogs for the dependency-free formula core."""

from __future__ import annotations

from collections.abc import Mapping, Sequence

from heatcalc_electrical_core import CatalogBundle, TTFormulaReport, catalog_bundle_from_payload

from app.formulas.electrical.outcome_errors import raise_electrical_formula_report


def _copied_rows(rows: Sequence[Mapping[str, object]]) -> list[dict[str, object]]:
    """Copy catalog authority rows before adding core-facing aliases."""

    return [dict(row) for row in rows]


def _prepared_section_rows(rows: Sequence[Mapping[str, object]]) -> list[dict[str, object]]:
    """Supply canonical core keys while retaining the authority's raw schema."""

    prepared = _copied_rows(rows)
    for row in prepared:
        if "base_model" not in row and "mark" in row:
            row["base_model"] = row["mark"]
        if "cold_start_temperature_c" not in row and "cold_start_temp_c" in row:
            row["cold_start_temperature_c"] = row["cold_start_temp_c"]
        if "i_st_ud_a_per_m" not in row and "specific_start_current_a_per_m" in row:
            row["i_st_ud_a_per_m"] = row["specific_start_current_a_per_m"]
    return prepared


def prepare_tt_catalog_bundle(
    *,
    power_rows: Sequence[Mapping[str, object]],
    section_rows: Sequence[Mapping[str, object]],
    bom_rows: Sequence[Mapping[str, object]],
) -> CatalogBundle:
    """Adapt raw TT authority rows once, translating core reports at the boundary."""

    bundle = catalog_bundle_from_payload(
        power_rows=_copied_rows(power_rows),
        section_rows=_prepared_section_rows(section_rows),
        bom_rows=_copied_rows(bom_rows),
    )
    if isinstance(bundle, TTFormulaReport):
        raise_electrical_formula_report(bundle)
        raise AssertionError("blocking core catalog report must raise")
    return bundle
