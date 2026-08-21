"""Deterministic typed generation snapshot construction."""

from __future__ import annotations

import re
from collections.abc import Mapping

from heatcalc_specification_core.bom.contracts import CatalogItem, GenerationInput
from heatcalc_specification_core.bom.rows import FORMULA_FINGERPRINTS, formula_provenance
from heatcalc_specification_core.bom.snapshot_contracts import (
    CatalogSelectionSnapshot,
    FormulaProvenance,
    GenerationSnapshot,
    normalized_object,
)


def build_snapshot(
    inputs: GenerationInput,
    *,
    selected: Mapping[str, CatalogItem],
) -> GenerationSnapshot:
    _require_aware(inputs.generated_at, name="generated_at")
    _require_aware(inputs.revision_context.variant_updated_at, name="variant_updated_at")
    if inputs.preflight_fingerprint_schema != "specification-preflight/v1":
        raise ValueError("unknown preflight fingerprint schema")
    if not re.fullmatch(r"sha256:[0-9a-f]{64}", inputs.preflight_fingerprint):
        raise ValueError("snapshot requires a canonical preflight fingerprint")

    groups = tuple(sorted(inputs.candidate_groups, key=lambda group: group.group_key))
    provenance = {
        category: FormulaProvenance(**formula_provenance(identity))
        for category, identity in sorted(FORMULA_FINGERPRINTS.items())
    }
    return GenerationSnapshot(
        electrical_variant_id=inputs.electrical_variant_id,
        variant_updated_at=inputs.revision_context.variant_updated_at,
        resolved_options=inputs.options,
        settings_revision=inputs.revision_context.settings_revision,
        catalog=inputs.catalog.identity,
        selections={
            group.group_key: group.selected_catalog_item_id
            for group in groups
            if group.selected_catalog_item_id is not None
        },
        selected_catalog_item_ids={key: item.id for key, item in sorted(selected.items())},
        formula_fingerprints=dict(FORMULA_FINGERPRINTS),
        formula_provenance=provenance,
        normalized_objects=tuple(
            sorted(
                (normalized_object(row) for row in inputs.contributions),
                key=lambda item: str(item.object_id),
            )
        ),
        input_revisions=inputs.revision_context.input_revisions,
        preflight_fingerprint_schema=inputs.preflight_fingerprint_schema,
        preflight_fingerprint=inputs.preflight_fingerprint,
        excluded_unassigned_object_ids=inputs.excluded_unassigned_object_ids,
        generated_at=inputs.generated_at,
        catalog_selections={
            group.group_key: CatalogSelectionSnapshot(
                catalog_item_id=group.selected_catalog_item_id,
                selection_source=str(
                    getattr(group.selection_source, "value", group.selection_source)
                ),
                candidate_set_fingerprint=group.candidate_set_fingerprint,
                candidate_count=len(group.candidate_catalog_item_ids),
            )
            for group in groups
        },
    )


def _require_aware(value: object, *, name: str) -> None:
    from datetime import datetime

    if not isinstance(value, datetime) or value.tzinfo is None or value.utcoffset() is None:
        raise ValueError(f"{name} must be timezone-aware")
