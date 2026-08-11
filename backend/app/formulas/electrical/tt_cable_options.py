"""Build Case 1 manual TT full-mark options from active catalog snapshots."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any

from app.formulas.electrical.self_regulating import build_tt_catalog_candidates

REASON_CATALOG_PROVISIONAL = "ELECTRICAL_POWER_CATALOG_PROVISIONAL"
REASON_TEMPERATURE_LIMIT = "ELECTRICAL_CABLE_TEMPERATURE_LIMIT_EXCEEDED"


def _temperature_group(series: str) -> str:
    return "high" if series in {"ТТВ", "ТТХ"} else "low"


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
    """Build exact full-mark options using the calculation selector's catalog join."""
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
    candidates = build_tt_catalog_candidates(
        catalog_rows,
        section_catalog_rows,
        bom_catalog_rows,
    )
    options: list[dict[str, Any]] = []
    for candidate in candidates:
        temperature_eligible = ambient_temperature_c >= float(
            candidate.min_ambient_temperature
        ) and product_temperature_c <= float(candidate.max_product_temperature)
        provisional_blocked = provisional and strict_provisional
        options.append(
            {
                "model": candidate.full_mark,
                "series": candidate.series,
                "base_model": candidate.base_model,
                "full_mark_preview": candidate.full_mark,
                "eligible": temperature_eligible and not provisional_blocked,
                "unavailable_reason": (
                    REASON_CATALOG_PROVISIONAL
                    if provisional_blocked
                    else None
                    if temperature_eligible
                    else REASON_TEMPERATURE_LIMIT
                ),
                "temperature_group": _temperature_group(candidate.series),
                "nominal_power": float(candidate.passport_power),
                "passport_power_w_per_m": float(candidate.passport_power),
                "min_ambient_temperature_c": float(candidate.min_ambient_temperature),
                "max_product_temperature_c": float(candidate.max_product_temperature),
                "nomenclature_code": candidate.bom_row["nomenclature_code"],
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


def extract_power_catalog_rows(
    power_catalog: Mapping[str, Any],
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Compatibility wrapper for callers which need only the power snapshot."""
    return extract_tt_catalog_rows(power_catalog, "power")
