"""Server-side persistence for multi-candidate specification catalog selections."""

from __future__ import annotations

import hashlib
import json
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.specification import (
    SpecificationCatalogItem,
    SpecificationCatalogSelection,
    SpecificationCatalogVersion,
)
from app.services.electrical_variant_service import ElectricalVariantServiceError


@dataclass(frozen=True)
class StoredSelection:
    candidate_group_key: str
    catalog_version_id: UUID
    catalog_item_id: UUID
    candidate_set_fingerprint: str
    collection_version: int


@dataclass(frozen=True)
class SelectionCollection:
    project_id: UUID
    electrical_variant_id: UUID
    collection_version: int
    selections: tuple[StoredSelection, ...]


def candidate_set_fingerprint(candidate_ids: Sequence[UUID]) -> str:
    """Stable fingerprint of an applicable candidate set for invalidation."""
    material = [str(item_id) for item_id in sorted(candidate_ids, key=str)]
    digest = hashlib.sha256(
        json.dumps(material, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    ).hexdigest()
    return f"sha256:{digest}"


class SpecificationSelectionService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_collection(
        self,
        project_id: UUID,
        electrical_variant_id: UUID,
    ) -> SelectionCollection:
        rows = list(
            (
                await self.db.execute(
                    select(SpecificationCatalogSelection)
                    .where(
                        SpecificationCatalogSelection.project_id == project_id,
                        SpecificationCatalogSelection.electrical_variant_id
                        == electrical_variant_id,
                    )
                    .order_by(SpecificationCatalogSelection.candidate_group_key)
                )
            )
            .scalars()
            .all()
        )
        collection_version = max((row.collection_version for row in rows), default=1)
        return SelectionCollection(
            project_id=project_id,
            electrical_variant_id=electrical_variant_id,
            collection_version=collection_version,
            selections=tuple(
                StoredSelection(
                    candidate_group_key=row.candidate_group_key,
                    catalog_version_id=row.catalog_version_id,
                    catalog_item_id=row.catalog_item_id,
                    candidate_set_fingerprint=row.candidate_set_fingerprint,
                    collection_version=row.collection_version,
                )
                for row in rows
            ),
        )

    async def as_selection_map(
        self,
        project_id: UUID,
        electrical_variant_id: UUID,
        *,
        catalog_version_id: UUID | None = None,
        group_fingerprints: Mapping[str, str] | None = None,
    ) -> dict[str, UUID]:
        """Return stored choices still valid for current catalog/candidate sets."""
        collection = await self.get_collection(project_id, electrical_variant_id)
        valid: dict[str, UUID] = {}
        for row in collection.selections:
            if catalog_version_id is not None and row.catalog_version_id != catalog_version_id:
                continue
            if group_fingerprints is not None:
                expected = group_fingerprints.get(row.candidate_group_key)
                if expected is None or expected != row.candidate_set_fingerprint:
                    continue
            valid[row.candidate_group_key] = row.catalog_item_id
        return valid

    async def replace_collection(
        self,
        *,
        project_id: UUID,
        electrical_variant_id: UUID,
        expected_version: int,
        selections: Sequence[Mapping[str, Any]],
        commit: bool = True,
    ) -> SelectionCollection:
        """Atomically replace explicit multi-candidate selections for one ER."""
        await self.db.execute(
            select(SpecificationCatalogSelection)
            .where(
                SpecificationCatalogSelection.project_id == project_id,
                SpecificationCatalogSelection.electrical_variant_id == electrical_variant_id,
            )
            .with_for_update()
        )
        current = await self.get_collection(project_id, electrical_variant_id)
        if current.selections and current.collection_version != expected_version:
            raise ElectricalVariantServiceError(
                "SPEC_SELECTION_VERSION_CONFLICT",
                "Конфликт версии catalog selections; перечитайте коллекцию",
                status_code=409,
                details={
                    "expected_version": expected_version,
                    "current_version": current.collection_version,
                    "electrical_variant_id": str(electrical_variant_id),
                },
            )
        if not current.selections and expected_version not in {0, 1}:
            raise ElectricalVariantServiceError(
                "SPEC_SELECTION_VERSION_CONFLICT",
                "Конфликт версии catalog selections; перечитайте коллекцию",
                status_code=409,
                details={
                    "expected_version": expected_version,
                    "current_version": 1,
                    "electrical_variant_id": str(electrical_variant_id),
                },
            )

        normalized = _normalize_selection_rows(selections)
        next_version = 1 if not current.selections else current.collection_version + 1

        # Validate FKs exist and item belongs to catalog version.
        for row in normalized:
            version = await self.db.scalar(
                select(SpecificationCatalogVersion).where(
                    SpecificationCatalogVersion.id == row["catalog_version_id"]
                )
            )
            if version is None:
                raise ElectricalVariantServiceError(
                    "SPEC_REQUEST_INVALID",
                    "catalog_version_id не найден",
                    status_code=422,
                    details={"catalog_version_id": str(row["catalog_version_id"])},
                )
            item = await self.db.scalar(
                select(SpecificationCatalogItem).where(
                    SpecificationCatalogItem.id == row["catalog_item_id"],
                    SpecificationCatalogItem.catalog_version_id == row["catalog_version_id"],
                )
            )
            if item is None:
                raise ElectricalVariantServiceError(
                    "SPEC_REQUEST_INVALID",
                    "catalog_item_id не принадлежит указанной версии каталога",
                    status_code=422,
                    details={
                        "catalog_item_id": str(row["catalog_item_id"]),
                        "catalog_version_id": str(row["catalog_version_id"]),
                    },
                )

        await self.db.execute(
            delete(SpecificationCatalogSelection).where(
                SpecificationCatalogSelection.project_id == project_id,
                SpecificationCatalogSelection.electrical_variant_id == electrical_variant_id,
            )
        )
        now = datetime.now(UTC)
        for row in normalized:
            self.db.add(
                SpecificationCatalogSelection(
                    project_id=project_id,
                    electrical_variant_id=electrical_variant_id,
                    candidate_group_key=row["candidate_group_key"],
                    catalog_version_id=row["catalog_version_id"],
                    catalog_item_id=row["catalog_item_id"],
                    candidate_set_fingerprint=row["candidate_set_fingerprint"],
                    collection_version=next_version,
                    created_at=now,
                    updated_at=now,
                )
            )
        await self.db.flush()
        if commit:
            await self.db.commit()
        return await self.get_collection(project_id, electrical_variant_id)

    async def persist_explicit_from_groups(
        self,
        *,
        project_id: UUID,
        electrical_variant_id: UUID,
        catalog_version_id: UUID,
        groups: Sequence[Any],
        commit: bool = False,
    ) -> None:
        """Upsert multi-candidate explicit choices after successful generate."""
        rows: list[dict[str, Any]] = []
        for group in groups:
            candidates = list(getattr(group, "candidates", []) or [])
            selected = getattr(group, "selected_catalog_item_id", None)
            source = getattr(group, "selection_source", None)
            if selected is None or len(candidates) <= 1:
                continue
            if source not in {None, "explicit"} and source == "auto_single":
                # auto_single — do not invent persisted rows
                continue
            fingerprint = candidate_set_fingerprint([item.catalog_item_id for item in candidates])
            rows.append(
                {
                    "candidate_group_key": group.group_key,
                    "catalog_version_id": catalog_version_id,
                    "catalog_item_id": selected,
                    "candidate_set_fingerprint": fingerprint,
                }
            )
        if not rows:
            return
        current = await self.get_collection(project_id, electrical_variant_id)
        await self.replace_collection(
            project_id=project_id,
            electrical_variant_id=electrical_variant_id,
            expected_version=current.collection_version if current.selections else 1,
            selections=rows,
            commit=commit,
        )


def _normalize_selection_rows(
    selections: Sequence[Mapping[str, Any]],
) -> list[dict[str, Any]]:
    seen: set[str] = set()
    normalized: list[dict[str, Any]] = []
    for raw in selections:
        key = str(raw.get("candidate_group_key") or "").strip()
        if not key or len(key) > 128:
            raise ElectricalVariantServiceError(
                "SPEC_REQUEST_INVALID",
                "candidate_group_key обязателен и не длиннее 128 символов",
                status_code=422,
            )
        if key in seen:
            raise ElectricalVariantServiceError(
                "SPEC_REQUEST_INVALID",
                "Дубликат candidate_group_key в selections",
                status_code=422,
                details={"candidate_group_key": key},
            )
        seen.add(key)
        try:
            catalog_version_id = UUID(str(raw["catalog_version_id"]))
            catalog_item_id = UUID(str(raw["catalog_item_id"]))
        except (KeyError, TypeError, ValueError) as exc:
            raise ElectricalVariantServiceError(
                "SPEC_REQUEST_INVALID",
                "catalog_version_id и catalog_item_id обязательны как UUID",
                status_code=422,
            ) from exc
        fingerprint = str(raw.get("candidate_set_fingerprint") or "").strip()
        if not fingerprint.startswith("sha256:") or len(fingerprint) != 71:
            raise ElectricalVariantServiceError(
                "SPEC_REQUEST_INVALID",
                "candidate_set_fingerprint должен быть sha256:<64 hex>",
                status_code=422,
            )
        normalized.append(
            {
                "candidate_group_key": key,
                "catalog_version_id": catalog_version_id,
                "catalog_item_id": catalog_item_id,
                "candidate_set_fingerprint": fingerprint,
            }
        )
    return normalized
