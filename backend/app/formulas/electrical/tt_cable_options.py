"""Build manual TT cable options for GET /calc/cable-options (B1 / E5).

Uses the same series selection and q1×T3+q2 power curve as
``calc_self_regulating_tt`` so FE never recomputes eligibility.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from decimal import Decimal, InvalidOperation
from typing import Any

from app.formulas.electrical.decimal_math import decimal_value, round_result
from app.formulas.electrical.self_regulating import (
    _select_tt_series,
    _tt_row_nominal_power,
    _tt_row_series,
)

REASON_SERIES_MISMATCH = "ELECTRICAL_CABLE_SERIES_MISMATCH"
REASON_POWER_CURVE_INVALID = "ELECTRICAL_CABLE_POWER_CURVE_INVALID"
REASON_POWER_NON_POSITIVE = "ELECTRICAL_CABLE_POWER_NON_POSITIVE"
REASON_CATALOG_PROVISIONAL = "ELECTRICAL_POWER_CATALOG_PROVISIONAL"
REASON_ROW_INVALID = "ELECTRICAL_CATALOG_ROW_INVALID"


def _tt_suffix(*, required_series: str, aggressive_product: bool) -> str:
    """Construction suffix for full_mark_preview (same rule as calc_self_regulating_tt)."""
    return "СР" if required_series != "ТТН" or aggressive_product else "СТ"


def _temperature_group(series: str) -> str:
    return "high" if series in {"ТТВ", "ТТХ"} else "low"


def is_power_catalog_provisional(catalog_meta: Mapping[str, Any] | None) -> bool:
    """True when power catalog is not an approved active DB authority."""
    if not catalog_meta:
        return True
    status = str(catalog_meta.get("status") or "").strip().lower()
    authority = str(catalog_meta.get("authority") or "").strip().lower()
    if status == "active" and authority in {"database", "db"}:
        return False
    if status == "provisional":
        return True
    if authority in {"static", "static_fallback"}:
        return True
    if status and status not in {"active", "registered"}:
        return True
    return authority != "database" and authority != "db"


def evaluate_tt_cable_option(
    row: Mapping[str, Any],
    *,
    required_series: str,
    maintain_temperature_c: float | Decimal,
    aggressive_product: bool,
    catalog_provisional: bool = False,
    strict_provisional: bool = False,
    catalog_meta: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    """Evaluate one power-catalog row for manual selection UI.

    Does not raise on bad rows: returns ``eligible=False`` + reason so the
    dropdown can show disabled options with provenance.

    ``strict_provisional`` (production): provisional catalog rows are not eligible.
    Outside production, series+power still make a row eligible so dev/test can
    exercise manual mark selection against the static fallback catalog.
    """
    t3 = decimal_value(maintain_temperature_c)
    model = "".join(str(row.get("model") or "").split())
    suffix = _tt_suffix(required_series=required_series, aggressive_product=aggressive_product)
    catalog_block = {
        "kind": "power",
        "version": (catalog_meta or {}).get("version"),
        "status": (catalog_meta or {}).get("status"),
        "source_checksum": (catalog_meta or {}).get("source_checksum")
        or (catalog_meta or {}).get("payload_checksum"),
        "authority": (catalog_meta or {}).get("authority"),
        "production_approved": not catalog_provisional,
    }

    base: dict[str, Any] = {
        "model": model or None,
        "series": None,
        "base_model": model or None,
        "full_mark_preview": f"{model}-{suffix}" if model else None,
        "power_at_t3_w_per_m": None,
        "eligible": False,
        "unavailable_reason": None,
        "temperature_group": None,
        "q1": row.get("q1"),
        "q2": row.get("q2"),
        "nominal_power": None,
        "nomenclature_code": row.get("nomenclature_code"),
        "catalog": catalog_block,
    }

    if not model:
        base["unavailable_reason"] = REASON_ROW_INVALID
        return base

    try:
        series = _tt_row_series(row)
        nominal = _tt_row_nominal_power(row)
    except Exception:
        base["unavailable_reason"] = REASON_ROW_INVALID
        return base

    base["series"] = series
    base["temperature_group"] = _temperature_group(series)
    base["nominal_power"] = float(round_result(nominal))

    if series != required_series:
        base["unavailable_reason"] = REASON_SERIES_MISMATCH
        return base

    try:
        power = decimal_value(row["q1"]) * t3 + decimal_value(row["q2"])
    except (InvalidOperation, KeyError, TypeError, ValueError):
        base["unavailable_reason"] = REASON_POWER_CURVE_INVALID
        return base

    if not power.is_finite():
        base["unavailable_reason"] = REASON_POWER_CURVE_INVALID
        return base

    base["power_at_t3_w_per_m"] = float(round_result(power))

    if power <= 0:
        base["unavailable_reason"] = REASON_POWER_NON_POSITIVE
        return base

    if catalog_provisional and strict_provisional:
        base["unavailable_reason"] = REASON_CATALOG_PROVISIONAL
        return base

    base["eligible"] = True
    base["unavailable_reason"] = None
    return base


def build_tt_cable_options(
    catalog_rows: Sequence[Mapping[str, Any]],
    *,
    product_temperature_c: float,
    steam_temperature_c: float | None,
    maintain_temperature_c: float,
    aggressive_product: bool = False,
    catalog_meta: Mapping[str, Any] | None = None,
    strict_provisional: bool = False,
) -> list[dict[str, Any]]:
    """Build full option list for an object (all catalog models, sorted)."""
    required_series = _select_tt_series(product_temperature_c, steam_temperature_c)
    provisional = is_power_catalog_provisional(catalog_meta)

    options: list[dict[str, Any]] = []
    for row in catalog_rows:
        if not isinstance(row, Mapping):
            continue
        options.append(
            evaluate_tt_cable_option(
                row,
                required_series=required_series,
                maintain_temperature_c=maintain_temperature_c,
                aggressive_product=aggressive_product,
                catalog_provisional=provisional,
                strict_provisional=strict_provisional,
                catalog_meta=catalog_meta,
            )
        )

    def sort_key(item: dict[str, Any]) -> tuple:
        series_order = {"ТТН": 0, "ТТВ": 1, "ТТХ": 2}
        series = item.get("series") or ""
        eligible_rank = 0 if item.get("eligible") else 1
        nominal = item.get("nominal_power")
        nominal_key = float(nominal) if isinstance(nominal, int | float) else 1e9
        return (
            eligible_rank,
            series_order.get(str(series), 9),
            nominal_key,
            str(item.get("model") or ""),
        )

    options.sort(key=sort_key)
    # Attach required series for clients that want to label the group.
    for item in options:
        item["required_series"] = required_series
    return options


def extract_power_catalog_rows(
    power_catalog: Mapping[str, Any],
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Normalize active power catalog payload → rows + public metadata."""
    payload = power_catalog.get("payload")
    if not isinstance(payload, Mapping):
        return [], {k: v for k, v in power_catalog.items() if k != "payload"}
    raw_rows = payload.get("rows")
    if raw_rows is None:
        raw_rows = payload.get("cables")
    rows = [dict(row) for row in raw_rows if isinstance(row, Mapping)] if isinstance(raw_rows, list) else []
    meta = {k: v for k, v in power_catalog.items() if k != "payload"}
    return rows, meta
