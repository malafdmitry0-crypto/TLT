"""Build Case 1 manual TT full-mark options from active catalog snapshots."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from decimal import Decimal
from typing import Any

from heatcalc_electrical_core import TTFormulaReport, list_tt_cable_options

from app.formulas.electrical.catalog_preparation import prepare_tt_catalog_bundle
from app.formulas.electrical.outcome_errors import raise_electrical_formula_report

REASON_CATALOG_PROVISIONAL = "ELECTRICAL_POWER_CATALOG_PROVISIONAL"


def is_power_catalog_provisional(catalog_meta: Mapping[str, Any] | None) -> bool:
    """True when power catalog is not an approved active authority."""
    if not catalog_meta:
        return True
    status = str(catalog_meta.get("status") or "").strip().lower()
    authority = str(catalog_meta.get("authority") or "").strip().lower()
    approved = catalog_meta.get("production_approved") is True
    if status == "active" and (authority in {"database", "db"} or approved):
        return False
    if status == "provisional":
        return True
    if authority in {"static", "static_fallback"}:
        return True
    if status and status not in {"active", "registered"}:
        return True
    return authority != "database" and authority != "db"


def build_tt_cable_options(
    catalog_rows: Sequence[Mapping[str, Any]],
    *,
    product_temperature_c: float,
    ambient_temperature_c: float,
    section_catalog_rows: Sequence[Mapping[str, Any]],
    bom_catalog_rows: Sequence[Mapping[str, Any]],
    catalog_meta: Mapping[str, Any] | None = None,
    strict_provisional: bool = False,
) -> list[dict[str, Any]]:
    """Build exact full-mark options through the standalone engineering core."""
    provisional = is_power_catalog_provisional(catalog_meta)
    metadata = catalog_meta or {}
    catalog_block = {
        "kind": "power",
        "version": metadata.get("version"),
        "status": metadata.get("status"),
        "source_checksum": metadata.get("source_checksum") or metadata.get("payload_checksum"),
        "authority": metadata.get("authority"),
        "production_approved": not provisional,
    }
    bundle = prepare_tt_catalog_bundle(
        power_rows=catalog_rows,
        section_rows=section_catalog_rows,
        bom_rows=bom_catalog_rows,
    )

    outcome = list_tt_cable_options(
        bundle,
        product_temperature=Decimal(str(product_temperature_c)),
        ambient_temperature=Decimal(str(ambient_temperature_c)),
    )
    if isinstance(outcome, TTFormulaReport):
        raise_electrical_formula_report(outcome)
        raise AssertionError("invalid options report must raise an application error")

    provisional_blocked = provisional and strict_provisional
    options: list[dict[str, Any]] = []
    for option in outcome:
        options.append(
            {
                "model": option.model,
                "series": option.series,
                "base_model": option.base_model,
                "full_mark_preview": option.full_mark_preview,
                "eligible": option.eligible and not provisional_blocked,
                "unavailable_reason": (
                    REASON_CATALOG_PROVISIONAL if provisional_blocked else option.unavailable_reason
                ),
                "temperature_group": option.temperature_group,
                "nominal_power": float(option.nominal_power),
                "passport_power_w_per_m": float(option.passport_power_per_meter),
                "min_ambient_temperature_c": float(option.min_ambient_temperature),
                "max_product_temperature_c": float(option.max_product_temperature),
                "nomenclature_code": option.nomenclature_code,
                "catalog": catalog_block,
            }
        )
    options.sort(
        key=lambda item: (
            0 if item["eligible"] else 1,
            item["passport_power_w_per_m"],
            item["model"],
        )
    )
    return options


def extract_tt_catalog_rows(
    catalog: Mapping[str, Any],
    kind: str,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Normalize one active TT catalog payload into rows + public metadata."""
    payload = catalog.get("payload")
    if not isinstance(payload, Mapping):
        return [], {key: value for key, value in catalog.items() if key != "payload"}
    raw_rows = payload.get("entries") if kind == "bom" else payload.get("rows")
    if kind == "power" and raw_rows is None:
        raw_rows = payload.get("cables")
    rows = (
        [dict(row) for row in raw_rows if isinstance(row, Mapping)]
        if isinstance(raw_rows, list)
        else []
    )
    meta = {key: value for key, value in catalog.items() if key != "payload"}
    return rows, meta
