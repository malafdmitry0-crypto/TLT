"""PDL-ER-33 catalog identity helpers for specification BOM rows.

Mark, nomenclature code, temperature group and applicability must come from
explicit catalog/snapshot fields — never from prefix/suffix or row-order hacks.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Any

from app.reference_data.loader import list_spec_accessory_rules, list_tlt_cables, list_tt_cables


@lru_cache
def _accessory_by_rule() -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    for rule in list_spec_accessory_rules():
        key = str(rule.get("rule") or "")
        if key:
            out[key] = dict(rule)
    return out


@lru_cache
def _tt_by_model() -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    for row in list_tt_cables():
        model = str(row.get("model") or "").strip()
        if model:
            out[model] = dict(row)
    return out


@lru_cache
def _tlt_by_model() -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    for row in list_tlt_cables():
        model = str(row.get("model") or "").strip()
        if model:
            out[model] = dict(row)
    return out


def accessory_identity(rule: dict[str, Any]) -> dict[str, Any] | None:
    """Return explicit identity fields or None if incomplete (PDL-ER-33)."""
    mark = rule.get("mark") or rule.get("article")
    code = rule.get("nomenclature_code") or rule.get("code")
    if not mark or not code:
        return None
    return {
        "mark": str(mark),
        "nomenclature_code": str(code),
        "temperature_group": rule.get("temperature_group"),
        "catalog_base": rule.get("catalog_base") or rule.get("rule") or rule.get("name"),
        "catalog_source": rule.get("catalog_source") or "spec_accessories",
        "catalog_version": rule.get("catalog_version"),
    }


def resolve_accessory_rule(rule_key: str) -> tuple[dict[str, Any] | None, str | None]:
    """Lookup accessory by stable rule key (not row order)."""
    rule = _accessory_by_rule().get(rule_key)
    if rule is None:
        return None, "CATALOG_RULE_NOT_FOUND"
    identity = accessory_identity(rule)
    if identity is None:
        return None, "CATALOG_IDENTITY_INCOMPLETE"
    return {**rule, **identity}, None


def temperature_group_from_result(result: dict[str, Any]) -> str | None:
    """Explicit temperature group only — no mark prefix inference (PDL-ER-33)."""
    snapshot = result.get("cable_snapshot") if isinstance(result.get("cable_snapshot"), dict) else {}
    technical = snapshot.get("technical") if isinstance(snapshot.get("technical"), dict) else {}
    selection = snapshot.get("selection") if isinstance(snapshot.get("selection"), dict) else {}

    for source in (result, snapshot, technical, selection):
        if not isinstance(source, dict):
            continue
        raw = source.get("temperature_group") or source.get("temp_class")
        if raw in {"low", "high"}:
            return str(raw)
        if raw in {"ТТН", "ТЛТ", "low", "LOW"}:
            return "low"
        if raw in {"ТТВ", "ТТХ", "high", "HIGH"}:
            return "high"
        series = source.get("series")
        if series in {"ТТН", "ТЛТ"}:
            return "low"
        if series in {"ТТВ", "ТТХ"}:
            return "high"

    # Catalog lookup by explicit model field only (not mark suffix inference).
    # selected_cable / cable_model are authoritative model keys from calculation.
    model = (
        result.get("cable_model")
        or result.get("selected_cable")
        or technical.get("model")
        or selection.get("model")
        or snapshot.get("cable_model")
        or snapshot.get("selected_cable")
    )
    if isinstance(model, str) and model:
        tt = _tt_by_model().get(model)
        if tt is not None:
            series = str(tt.get("series") or "")
            if series in {"ТТН"}:
                return "low"
            if series in {"ТТВ", "ТТХ"}:
                return "high"
            explicit = tt.get("temperature_group")
            if explicit in {"low", "high"}:
                return str(explicit)
        tlt = _tlt_by_model().get(model)
        if tlt is not None:
            explicit = tlt.get("temperature_group")
            if explicit in {"low", "high"}:
                return str(explicit)
            # ТЛТ catalog is low-temp family by registered series field.
            if str(tlt.get("brand") or tlt.get("series") or "") == "ТЛТ":
                return "low"

    return None


def cable_identity_from_result(result: dict[str, Any]) -> dict[str, Any] | None:
    """Build cable catalog identity from explicit snapshot/result fields."""
    mark = result.get("cable_mark") or result.get("selected_cable")
    if not mark:
        return None
    snapshot = result.get("cable_snapshot") if isinstance(result.get("cable_snapshot"), dict) else {}
    technical = snapshot.get("technical") if isinstance(snapshot.get("technical"), dict) else {}
    code = (
        result.get("nomenclature_code")
        or result.get("article")
        or snapshot.get("nomenclature_code")
        or technical.get("nomenclature_code")
        or technical.get("article")
        or technical.get("code")
        or mark  # mark doubles as procurement article when catalog code absent
    )
    temp = temperature_group_from_result(result)
    return {
        "mark": str(mark),
        "nomenclature_code": str(code),
        "temperature_group": temp,
        "catalog_base": "heating_cable",
        "catalog_source": snapshot.get("actual_catalog_source") or "builtin",
        "catalog_entry_id": snapshot.get("catalog_entry_id"),
        "catalog_version": snapshot.get("schema_version"),
    }
