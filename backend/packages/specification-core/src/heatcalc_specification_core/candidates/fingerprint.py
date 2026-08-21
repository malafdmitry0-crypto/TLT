"""Stable identities and fingerprint payloads for candidate groups."""

from __future__ import annotations

import hashlib
import json
from collections.abc import Mapping, Sequence
from typing import Any
from uuid import UUID

from heatcalc_specification_core.candidates.contracts import CandidateGroup, thaw


def stable_group_key(
    *,
    electrical_variant_id: UUID,
    category: str,
    conditions: Mapping[str, Any],
    object_type_section: str | None = None,
) -> str:
    material = {
        "electrical_variant_id": str(electrical_variant_id),
        "category": category,
        "conditions": {str(key): thaw(conditions[key]) for key in sorted(conditions, key=str)},
        "object_type_section": object_type_section,
        "scope": "specification-candidate/v1",
    }
    digest = hashlib.sha256(
        json.dumps(material, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()
    return f"cg_{electrical_variant_id.hex}_{digest[:40]}"


def candidate_set_fingerprint(candidate_ids: Sequence[UUID]) -> str:
    material = [str(item_id) for item_id in sorted(candidate_ids, key=str)]
    digest = hashlib.sha256(
        json.dumps(material, separators=(",", ":"), ensure_ascii=False).encode()
    ).hexdigest()
    return f"sha256:{digest}"


def candidate_groups_fingerprint_payload(
    groups: Sequence[CandidateGroup],
) -> list[dict[str, Any]]:
    payload: list[dict[str, Any]] = []
    for group in sorted(groups, key=lambda item: item.group_key):
        payload.append(
            {
                "group_key": group.group_key,
                "category": group.category,
                "conditions": thaw(group.conditions),
                "object_type_section": group.object_type_section,
                "candidate_ids": sorted(str(item.catalog_item_id) for item in group.candidates),
                "selected_catalog_item_id": (
                    str(group.selected_catalog_item_id)
                    if group.selected_catalog_item_id is not None
                    else None
                ),
            }
        )
    return payload
