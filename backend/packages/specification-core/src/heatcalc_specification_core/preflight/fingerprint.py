"""Single canonical generation-grade preflight fingerprint."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any, Literal
from uuid import UUID

from heatcalc_specification_core.immutable_json import canonical_fingerprint

from .contracts import CatalogIdentity, PreflightAssignment

FINGERPRINT_SCHEMA: Literal["specification-preflight/v1"] = "specification-preflight/v1"


def preflight_fingerprint(
    *,
    project_id: UUID | None,
    electrical_variant_id: UUID,
    assignments: Sequence[PreflightAssignment],
    catalog: CatalogIdentity,
    resolved_options: Mapping[str, Any] | None,
    catalog_selections: Mapping[str, UUID],
    candidate_groups: Sequence[Mapping[str, Any]],
    excluded_unassigned_object_ids: Sequence[UUID],
) -> str:
    rows = [
        _fingerprint_row(row)
        for row in sorted(assignments, key=lambda item: str(item.object_id))
        if row.assignment_state != "unassigned"
    ]
    payload: dict[str, Any] = {
        "fingerprint_schema": FINGERPRINT_SCHEMA,
        "electrical_variant_id": electrical_variant_id,
        "specification_catalog": {
            "id": catalog.catalog_id,
            "catalog_key": catalog.catalog_key,
            "version": catalog.version,
            "source_checksum": catalog.source_checksum,
            "payload_checksum": catalog.payload_checksum,
            "schema_version": catalog.schema_version,
        },
        "catalog_selections": {
            key: str(value) for key, value in sorted(catalog_selections.items())
        },
        "candidate_groups": list(candidate_groups),
        "excluded_unassigned_object_ids": sorted(excluded_unassigned_object_ids, key=str),
        "assignments": rows,
    }
    if project_id is not None:
        payload["project_id"] = project_id
    if resolved_options is not None:
        payload["resolved_options"] = resolved_options
    return canonical_fingerprint(payload)


def _fingerprint_row(row: PreflightAssignment) -> dict[str, Any]:
    result = row.result
    return {
        "assignment": {
            "id": row.assignment_id,
            "version": row.assignment_version,
            "state": row.assignment_state,
            "system_type": row.system_type,
            "object_version_snapshot": row.assignment_object_version,
        },
        "object": {
            "id": row.object_id,
            "version": row.object_version,
            "object_type": row.object_type,
            "is_valid": row.object_is_valid,
        },
        "electrical_result": {
            "id": row.calculation_id,
            "updated_at": row.calculation_updated_at,
            "production_eligible": result.provenance_production_eligible if result else None,
            "mocked_fields": sorted(result.provenance_mocked_fields or result.mocked_fields)
            if result
            else [],
            "cable": {
                "mark": result.cable_mark if result else None,
                "nomenclature_code": result.nomenclature_code if result else None,
            },
            "section_plan": {
                "count": result.section_count if result else None,
                "length_m": result.section_length_m if result else None,
                "origin": result.section_plan_origin if result else "automatic",
            },
            "layout": {
                "actual_installed_length_m": result.actual_installed_length_m if result else None,
                "required_order_length_m": result.required_order_length_m if result else None,
            },
            "provenance": {
                "formula_version": result.formula_version if result else None,
                "formula_fingerprint": result.formula_fingerprint if result else None,
                "calculation_fingerprint": result.calculation_fingerprint if result else None,
                "object_version": result.provenance_object_version if result else None,
                "heat_result_version": result.heat_result_version if result else None,
                "assignment_version": result.provenance_assignment_version if result else None,
                "catalogs": result.catalog_fingerprints if result else {},
            },
        },
    }
