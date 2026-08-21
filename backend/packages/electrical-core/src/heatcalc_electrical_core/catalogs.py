"""Immutable engineering catalog snapshots for the TT formula."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation

from .validation import TTFormulaIssue, TTFormulaReport


@dataclass(frozen=True, slots=True)
class PowerCatalogRow:
    model: str
    series: str | None
    nominal_power: Decimal
    max_product_temperature: Decimal


@dataclass(frozen=True, slots=True)
class SectionCatalogRow:
    """One row serves both T_min selection and equal-section planning."""

    base_model: str
    cold_start_temperature: Decimal
    l_max_m: Decimal | None
    i_st_ud_a_per_m: Decimal | None
    voltage_v: Decimal | None
    i_dop_a: Decimal | None = None
    planning_eligible: bool = True


@dataclass(frozen=True, slots=True)
class BomCatalogRow:
    full_mark: str
    nomenclature_code: str


@dataclass(frozen=True, slots=True)
class CatalogBundle:
    power_rows: tuple[PowerCatalogRow, ...]
    section_rows: tuple[SectionCatalogRow, ...]
    bom_rows: tuple[BomCatalogRow, ...]


def normalize_mark(value: str) -> str:
    return "".join(value.split()).upper()


def _decimal(value: object) -> Decimal | None:
    try:
        parsed = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return None
    return parsed if parsed.is_finite() else None


def _catalog_issue(
    model: object, field: str, *, invalid: bool = False, reason: str | None = None
) -> TTFormulaReport:
    details: dict[str, object] = {"model": None if model is None else str(model)}
    details["invalid_fields" if invalid else "missing_fields"] = (field,)
    if reason is not None:
        details["reason"] = reason
    return TTFormulaReport(
        (
            TTFormulaIssue.with_details(
                "ELECTRICAL_CATALOG_ROW_INVALID",
                path=("catalog",),
                **details,
            ),
        )
    )


def catalog_bundle_from_payload(
    *,
    power_rows: Sequence[Mapping[str, object]],
    section_rows: Sequence[Mapping[str, object]],
    bom_rows: Sequence[Mapping[str, object]],
) -> CatalogBundle | TTFormulaReport:
    """Adapt raw engineering rows only; metadata/provenance never crosses here."""
    typed_power: list[PowerCatalogRow] = []
    for row in power_rows:
        model = str(row.get("model") or "")
        if not normalize_mark(model):
            return _catalog_issue(row.get("model"), "model")
        power = _decimal(row.get("nominal_power"))
        if row.get("nominal_power") is None:
            return _catalog_issue(row.get("model"), "nominal_power")
        if power is None or power <= 0:
            return _catalog_issue(
                row.get("model"), "nominal_power", invalid=True, reason="nonpositive_or_malformed"
            )
        maximum = _decimal(row.get("max_product_temp", row.get("max_product_temperature")))
        if row.get("max_product_temp", row.get("max_product_temperature")) is None:
            return _catalog_issue(row.get("model"), "max_product_temp")
        if maximum is None:
            return _catalog_issue(
                row.get("model"), "max_product_temp", invalid=True, reason="malformed"
            )
        series = str(row.get("series") or "").strip() or None
        typed_power.append(PowerCatalogRow(model, series, power, maximum))

    typed_sections: list[SectionCatalogRow] = []
    for row in section_rows:
        model = str(row.get("base_model") or row.get("mark") or "")
        cold = _decimal(row.get("cold_start_temperature_c", row.get("cold_start_temp_c")))
        # Keep valid model/temperature evidence for candidate T_min selection.  A
        # malformed planning payload is retained only as planning-ineligible, so
        # it can never win the nearest-temperature section lookup.
        if not normalize_mark(model) or cold is None:
            continue
        l_max = _decimal(row.get("l_max_m"))
        specific = _decimal(row.get("i_st_ud_a_per_m"))
        voltage = _decimal(row.get("voltage_v", 230))
        raw_i_dop = row.get("i_dop_a")
        i_dop = _decimal(raw_i_dop) if raw_i_dop is not None else None
        planning_eligible = not (
            l_max is None
            or l_max <= 0
            or specific is None
            or specific <= 0
            or voltage is None
            or voltage <= 0
            or (raw_i_dop is not None and (i_dop is None or i_dop <= 0))
        )
        typed_sections.append(
            SectionCatalogRow(model, cold, l_max, specific, voltage, i_dop, planning_eligible)
        )

    typed_bom = tuple(
        BomCatalogRow(
            str(row.get("full_mark") or ""), str(row.get("nomenclature_code") or "").strip()
        )
        for row in bom_rows
    )
    return CatalogBundle(tuple(typed_power), tuple(typed_sections), typed_bom)
