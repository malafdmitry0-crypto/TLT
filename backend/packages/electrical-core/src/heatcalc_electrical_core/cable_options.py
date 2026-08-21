"""Manual options sharing the selector's one candidate builder."""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal

from .catalogs import CatalogBundle
from .selection import build_tt_catalog_candidates
from .tt_contract import validate_tt_option_inputs
from .validation import TTFormulaReport

REASON_TEMPERATURE_LIMIT = "ELECTRICAL_CABLE_TEMPERATURE_LIMIT_EXCEEDED"

__all__ = ["CableOption", "OptionsOutcome", "list_tt_cable_options"]


@dataclass(frozen=True, slots=True)
class CableOption:
    model: str
    series: str
    base_model: str
    full_mark_preview: str
    eligible: bool
    unavailable_reason: str | None
    temperature_group: str
    nominal_power: Decimal
    passport_power_per_meter: Decimal
    min_ambient_temperature: Decimal
    max_product_temperature: Decimal
    nomenclature_code: str


OptionsOutcome = tuple[CableOption, ...] | TTFormulaReport


def list_tt_cable_options(
    bundle: CatalogBundle, *, product_temperature: Decimal, ambient_temperature: Decimal
) -> OptionsOutcome:
    report = validate_tt_option_inputs(
        bundle,
        product_temperature=product_temperature,
        ambient_temperature=ambient_temperature,
    )
    if not report.is_valid:
        return report
    candidates = build_tt_catalog_candidates(bundle)
    if isinstance(candidates, TTFormulaReport):
        return candidates
    options = tuple(
        CableOption(
            row.full_mark,
            row.series,
            row.base_model,
            row.full_mark,
            ambient_temperature >= row.min_ambient_temperature
            and product_temperature <= row.max_product_temperature,
            None
            if ambient_temperature >= row.min_ambient_temperature
            and product_temperature <= row.max_product_temperature
            else REASON_TEMPERATURE_LIMIT,
            "high" if row.series in {"ТТВ", "ТТХ"} else "low",
            row.passport_power,
            row.passport_power,
            row.min_ambient_temperature,
            row.max_product_temperature,
            row.bom.nomenclature_code,
        )
        for row in candidates
    )
    return tuple(
        sorted(options, key=lambda row: (not row.eligible, row.passport_power_per_meter, row.model))
    )
