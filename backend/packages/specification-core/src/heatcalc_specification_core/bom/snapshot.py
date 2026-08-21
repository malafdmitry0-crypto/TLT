"""Deterministic generation snapshot construction."""

from __future__ import annotations

import re
from collections.abc import Mapping, Sequence
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from heatcalc_specification_core.bom.contracts import (
    CandidateGroup,
    CatalogItem,
    GenerationInput,
    SpecificationContribution,
)
from heatcalc_specification_core.bom.rows import FORMULA_FINGERPRINTS, formula_provenance


def build_snapshot(
    inputs: GenerationInput,
    *,
    selected: Mapping[str, CatalogItem],
) -> dict[str, Any]:
    _require_aware(inputs.generated_at, name="generated_at")
    _require_aware(inputs.revision_context.variant_updated_at, name="variant_updated_at")
    if inputs.preflight_fingerprint_schema != "specification-preflight/v1":
        raise ValueError("unknown preflight fingerprint schema")
    if not re.fullmatch(r"sha256:[0-9a-f]{64}", inputs.preflight_fingerprint):
        raise ValueError("snapshot requires a canonical preflight fingerprint")

    identity = inputs.catalog.identity
    options = inputs.options.snapshot_dict()
    groups = tuple(sorted(inputs.candidate_groups, key=lambda group: group.group_key))
    return {
        "schema": "specification-generation",
        "schema_version": 1,
        "electrical_variant_id": str(inputs.electrical_variant_id),
        "variant_revision": {
            "updated_at": _snapshot_value(inputs.revision_context.variant_updated_at)
        },
        "resolved_options": options,
        "settings_revision": inputs.revision_context.settings_revision,
        "catalog": {
            "id": str(identity.id),
            "catalog_key": identity.catalog_key,
            "version": identity.version,
            "source_checksum": identity.source_checksum,
            "payload_checksum": identity.payload_checksum,
            "schema_version": identity.schema_version,
        },
        "selections": _selection_ids(groups),
        "selected_catalog_item_ids": {key: str(item.id) for key, item in sorted(selected.items())},
        "formula_fingerprints": dict(FORMULA_FINGERPRINTS),
        "formula_provenance": {
            category: formula_provenance(identity)
            for category, identity in sorted(FORMULA_FINGERPRINTS.items())
        },
        "normalized_inputs": {
            "resolved_options": options,
            "objects": normalized_formula_inputs(inputs.contributions),
        },
        "input_revisions": _snapshot_value(inputs.revision_context.input_revisions),
        "preflight_fingerprint_schema": inputs.preflight_fingerprint_schema,
        "preflight_fingerprint": inputs.preflight_fingerprint,
        "excluded_unassigned_object_ids": [
            str(item) for item in sorted(inputs.excluded_unassigned_object_ids, key=str)
        ],
        "generated_at": inputs.generated_at.astimezone(UTC).isoformat(),
        "catalog_selections": {
            group.group_key: {
                "catalog_item_id": (
                    str(group.selected_catalog_item_id)
                    if group.selected_catalog_item_id is not None
                    else None
                ),
                "selection_source": str(
                    getattr(group.selection_source, "value", group.selection_source)
                ),
                "candidate_set_fingerprint": group.candidate_set_fingerprint,
                "candidate_count": len(group.candidate_catalog_item_ids),
            }
            for group in groups
        },
    }


def normalized_formula_inputs(
    contributions: Sequence[SpecificationContribution],
) -> list[dict[str, object]]:
    normalized: list[dict[str, object]] = []
    for row in contributions:
        section = str(getattr(row.object_type_section, "value", row.object_type_section))
        item: dict[str, object] = {
            "object_id": str(row.object_id),
            "object_type_section": section,
            "cable_mark": row.cable_mark,
            "temperature_group": row.temperature_group,
            "section_plan": {
                "count": str(Decimal(row.section_count)),
                "length_m": str(row.section_length_m),
            },
            "layout": {
                "actual_installed_length_m": str(row.actual_installed_length_m),
                "required_order_length_m": str(row.required_order_length_m),
            },
        }
        if section == "pipe":
            if row.outer_diameter_mm is None:
                raise ValueError("pipe contribution requires outer_diameter_mm")
            item["outer_diameter_mm"] = str(row.outer_diameter_mm)
        normalized.append(item)
    return sorted(normalized, key=lambda item: str(item["object_id"]))


def _selection_ids(groups: Sequence[CandidateGroup]) -> dict[str, str]:
    return {
        group.group_key: str(group.selected_catalog_item_id)
        for group in groups
        if group.selected_catalog_item_id is not None
    }


def _require_aware(value: datetime, *, name: str) -> None:
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError(f"{name} must be timezone-aware")


def _snapshot_value(value: Any) -> Any:
    if isinstance(value, datetime):
        _require_aware(value, name="snapshot datetime")
        return value.astimezone(UTC).isoformat().replace("+00:00", "Z")
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, Mapping):
        return {str(key): _snapshot_value(item) for key, item in value.items()}
    if isinstance(value, tuple | list):
        return [_snapshot_value(item) for item in value]
    return value
