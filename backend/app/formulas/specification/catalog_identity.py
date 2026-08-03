"""PDL-ER-33 catalog identity helpers for specification BOM rows.

Mark, nomenclature code, temperature group and applicability must come from
explicit catalog/snapshot fields — never from prefix/suffix or row-order hacks.
"""

from __future__ import annotations

from typing import Any


def accessory_identity(rule: dict[str, Any]) -> dict[str, Any] | None:
    """Return explicit identity fields or None if incomplete (PDL-ER-33)."""
    mark = rule.get("mark") or rule.get("article")
    code = rule.get("nomenclature_code") or rule.get("code")
    if not mark or not code:
        return None
    supplier = (
        rule.get("supplier") or rule.get("supplier_name") or rule.get("manufacturer") or "ТЛТ"
    )
    supply_unit = rule.get("supply_unit") or rule.get("unit") or "шт."
    return {
        "mark": str(mark),
        "nomenclature_code": str(code),
        "temperature_group": rule.get("temperature_group"),
        "catalog_base": rule.get("catalog_base") or rule.get("rule") or rule.get("name"),
        "catalog_source": rule.get("catalog_source") or "spec_accessories",
        "catalog_version": rule.get("catalog_version"),
        "supplier": str(supplier),
        "supply_unit": str(supply_unit),
    }


def resolve_accessory_rule(rule_key: str) -> tuple[dict[str, Any] | None, str | None]:
    """Legacy lookup is fail-closed; canonical generation injects DB catalog rows.

    Static accessory JSON is not an authoritative production source. The
    canonical candidate/materialization pipeline never calls this adapter.
    """
    del rule_key
    return None, "CATALOG_RULE_NOT_FOUND"


def temperature_group_from_result(result: dict[str, Any]) -> str | None:
    """Return only an explicit typed temperature group from the saved result."""
    snapshot = (
        result.get("cable_snapshot") if isinstance(result.get("cable_snapshot"), dict) else {}
    )
    technical = snapshot.get("technical") if isinstance(snapshot.get("technical"), dict) else {}
    selection = snapshot.get("selection") if isinstance(snapshot.get("selection"), dict) else {}
    cable = result.get("cable") if isinstance(result.get("cable"), dict) else {}

    for source in (result, cable, snapshot, technical, selection):
        if not isinstance(source, dict):
            continue
        raw = source.get("temperature_group")
        if not isinstance(raw, str):
            continue
        normalized = raw.strip().upper().replace("-", "_")
        if normalized == "LOW":
            return "low"
        if normalized in {"MEDIUM", "MEDIUM_HIGH", "MED_HIGH", "HIGH"}:
            return "high"

    return None


def tt_catalog_issue_from_result(result: dict[str, Any]) -> dict[str, Any] | None:
    """Validate saved TT catalogs and their exact immutable BOM row."""
    cable = result.get("cable") if isinstance(result.get("cable"), dict) else {}
    mark = result.get("cable_mark") or cable.get("mark") or cable.get("full_mark")
    if not isinstance(mark, str) or not mark.strip():
        return None
    provenance = result.get("provenance")
    provenance = provenance if isinstance(provenance, dict) else {}
    catalogs = result.get("catalogs")
    if not isinstance(catalogs, dict):
        catalogs = provenance.get("catalogs")
    if not isinstance(catalogs, dict):
        return {"reason": "catalog_snapshots_missing", "invalid_catalogs": ["all"]}

    allowed_statuses = {
        "power": {"active"},
        "section": {"active", "registered"},
        "bom": {"active"},
    }
    invalid: list[dict[str, Any]] = []
    for kind, allowed in allowed_statuses.items():
        raw = catalogs.get(kind)
        catalog = raw if isinstance(raw, dict) else {}
        checksum = catalog.get("source_checksum") or catalog.get("payload_checksum")
        if catalog.get("status") not in allowed or not checksum:
            invalid.append(
                {
                    "kind": kind,
                    "status": catalog.get("status"),
                    "version": catalog.get("version"),
                    "checksum": checksum,
                }
            )

    saved_bom = catalogs.get("bom")
    saved_bom = saved_bom if isinstance(saved_bom, dict) else {}
    saved_row = saved_bom.get("row")
    saved_row = saved_row if isinstance(saved_row, dict) else {}
    if (
        saved_row.get("full_mark") != mark
        or not str(saved_row.get("nomenclature_code") or "").strip()
    ):
        # The caller reports the stable SPEC_CABLE_NOMENCLATURE_MISSING error.
        return None
    if invalid:
        return {"reason": "catalog_not_active_or_stale", "invalid_catalogs": invalid}
    return None


def cable_identity_from_result(result: dict[str, Any]) -> dict[str, Any] | None:
    """Build cable catalog identity from explicit snapshot/result fields."""
    snapshot = (
        result.get("cable_snapshot") if isinstance(result.get("cable_snapshot"), dict) else {}
    )
    cable = result.get("cable") if isinstance(result.get("cable"), dict) else {}
    mark = (
        result.get("cable_mark")
        or cable.get("mark")
        or cable.get("full_mark")
        or snapshot.get("cable_mark")
        or result.get("selected_cable")
    )
    if not mark:
        return None
    technical = snapshot.get("technical") if isinstance(snapshot.get("technical"), dict) else {}
    cable_type = result.get("cable_type") or cable.get("type")
    if cable_type == "self_regulating_tt":
        if tt_catalog_issue_from_result(result) is not None:
            return None
        provenance = result.get("provenance")
        provenance = provenance if isinstance(provenance, dict) else {}
        catalogs = result.get("catalogs")
        if not isinstance(catalogs, dict):
            catalogs = provenance.get("catalogs")
        catalogs = catalogs if isinstance(catalogs, dict) else {}
        catalog = catalogs.get("bom")
        catalog = catalog if isinstance(catalog, dict) else {}
        bom = catalog.get("row")
        bom = bom if isinstance(bom, dict) else {}
        if bom.get("full_mark") != str(mark) or not bom.get("nomenclature_code"):
            return None
        return {
            "mark": str(bom["full_mark"]),
            "nomenclature_code": str(bom["nomenclature_code"]),
            "temperature_group": temperature_group_from_result(result),
            "catalog_base": "heating_cable",
            "catalog_source": catalog.get("source"),
            "catalog_version": catalog.get("version"),
            "catalog_checksum": catalog.get("source_checksum") or catalog.get("payload_checksum"),
            "catalog_schema_version": catalog.get("schema_version"),
            "catalog_status": catalog.get("status"),
            "supplier": str(bom.get("supplier") or "ТЛТ"),
            "supply_unit": str(bom.get("unit") or "м"),
        }
    code = (
        result.get("nomenclature_code")
        or result.get("article")
        or snapshot.get("nomenclature_code")
        or technical.get("nomenclature_code")
        or technical.get("article")
        or technical.get("code")
    )
    if not isinstance(code, str) or not code.strip():
        return None
    temp = temperature_group_from_result(result)
    supplier = (
        result.get("supplier")
        or result.get("supplier_name")
        or snapshot.get("supplier_name")
        or technical.get("supplier_name")
        or technical.get("supplier")
        or "ТЛТ"
    )
    supply_unit = (
        result.get("supply_unit")
        or snapshot.get("supply_unit")
        or technical.get("supply_unit")
        or technical.get("unit")
        or "м"
    )
    return {
        "mark": str(mark),
        "nomenclature_code": str(code),
        "temperature_group": temp,
        "catalog_base": "heating_cable",
        "catalog_source": snapshot.get("actual_catalog_source"),
        "catalog_entry_id": snapshot.get("catalog_entry_id"),
        "catalog_version": snapshot.get("schema_version"),
        "supplier": str(supplier),
        "supply_unit": str(supply_unit),
    }
