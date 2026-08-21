"""Fail-closed selection scoping and candidate selection rules."""

from __future__ import annotations

import re
from collections.abc import Mapping, Sequence
from typing import Any
from uuid import UUID

from heatcalc_specification_core.candidates.contracts import (
    CandidateCatalog,
    CandidateDiagnostic,
    CandidateDiagnosticCode,
    CandidateIssueKind,
    SelectionSource,
    SpecificationCandidate,
    diagnostic,
)

GROUP_KEY_RE = re.compile(r"^cg_([0-9a-f]{32})_[0-9a-f]{40}$")


def catalog_selections_for_variant(
    selections: Mapping[str, UUID],
    electrical_variant_id: UUID,
    requested_variant_ids: Sequence[UUID] | None = None,
) -> dict[str, UUID]:
    """Keep this ER's keys and malformed/out-of-request keys for fail-closed checks."""
    known_scopes = {item.hex for item in (requested_variant_ids or (electrical_variant_id,))}
    scoped: dict[str, UUID] = {}
    for key, item_id in selections.items():
        match = GROUP_KEY_RE.fullmatch(key)
        key_scope = match.group(1) if match is not None else None
        if (
            key_scope is None
            or key_scope == electrical_variant_id.hex
            or key_scope not in known_scopes
        ):
            scoped[key] = item_id
    return scoped


def resolve_selection(
    *,
    group_key: str,
    category: str,
    conditions: Mapping[str, Any],
    candidates: Sequence[SpecificationCandidate],
    selections: Mapping[str, UUID],
    electrical_variant_id: UUID,
    catalog: CandidateCatalog,
) -> tuple[UUID | None, SelectionSource, tuple[CandidateDiagnostic, ...]]:
    candidate_ids = {item.catalog_item_id for item in candidates}
    submitted = selections.get(group_key)

    if not candidates:
        return (
            None,
            SelectionSource.NONE,
            (
                diagnostic(
                    CandidateDiagnosticCode.ACCESSORY_CATALOG_ITEM_MISSING,
                    CandidateIssueKind.BLOCKING,
                    "В активном каталоге нет подходящей позиции для комплектующих",
                    issues=(
                        {
                            "reason": "no_matching_catalog_item",
                            "category": category,
                            "conditions": dict(conditions),
                            "group_key": group_key,
                        },
                    ),
                    details={
                        "electrical_variant_id": str(electrical_variant_id),
                        "category": category,
                        "conditions": dict(conditions),
                        "catalog_id": str(catalog.version.id),
                        "catalog_version": catalog.version.version,
                    },
                ),
            ),
        )

    if len(candidates) == 1:
        only = candidates[0].catalog_item_id
        if submitted is not None and submitted != only:
            return _not_in_group(
                submitted=submitted,
                group_key=group_key,
                category=category,
                electrical_variant_id=electrical_variant_id,
                catalog=catalog,
            )
        return only, SelectionSource.AUTO_SINGLE, ()

    if submitted is None:
        return (
            None,
            SelectionSource.NONE,
            (
                diagnostic(
                    CandidateDiagnosticCode.ACCESSORY_SELECTION_REQUIRED,
                    CandidateIssueKind.SELECTION_REQUIRED,
                    "Требуется выбор позиции каталога для комплектующих",
                    issues=(
                        {
                            "reason": "catalog_selection_missing",
                            "group_key": group_key,
                            "category": category,
                            "candidate_count": len(candidates),
                        },
                    ),
                    details={
                        "electrical_variant_id": str(electrical_variant_id),
                        "group_key": group_key,
                        "category": category,
                        "conditions": dict(conditions),
                        "catalog_id": str(catalog.version.id),
                        "catalog_version": catalog.version.version,
                    },
                ),
            ),
        )

    if submitted not in candidate_ids:
        return _not_in_group(
            submitted=submitted,
            group_key=group_key,
            category=category,
            electrical_variant_id=electrical_variant_id,
            catalog=catalog,
        )
    return submitted, SelectionSource.EXPLICIT, ()


def stale_selection_diagnostic(
    *,
    stale_keys: Sequence[str],
    catalog: CandidateCatalog,
) -> CandidateDiagnostic:
    return diagnostic(
        CandidateDiagnosticCode.ACCESSORY_SELECTION_REQUIRED,
        CandidateIssueKind.SELECTION_REQUIRED,
        "Сохранённый выбор относится к другой группе или версии каталога",
        issues=tuple(
            {"group_key": key, "reason": "catalog_selection_stale_group"} for key in stale_keys
        ),
        details={
            "catalog_id": str(catalog.version.id),
            "catalog_version": catalog.version.version,
            "payload_checksum": catalog.version.payload_checksum,
        },
    )


def _not_in_group(
    *,
    submitted: UUID,
    group_key: str,
    category: str,
    electrical_variant_id: UUID,
    catalog: CandidateCatalog,
) -> tuple[None, SelectionSource, tuple[CandidateDiagnostic, ...]]:
    return (
        None,
        SelectionSource.NONE,
        (
            diagnostic(
                CandidateDiagnosticCode.ACCESSORY_SELECTION_REQUIRED,
                CandidateIssueKind.SELECTION_REQUIRED,
                "Выбранная позиция не входит в кандидатов группы",
                issues=(
                    {
                        "reason": "catalog_selection_not_in_group",
                        "group_key": group_key,
                        "catalog_item_id": str(submitted),
                        "category": category,
                    },
                ),
                details={
                    "electrical_variant_id": str(electrical_variant_id),
                    "group_key": group_key,
                    "catalog_id": str(catalog.version.id),
                    "catalog_version": catalog.version.version,
                },
            ),
        ),
    )
