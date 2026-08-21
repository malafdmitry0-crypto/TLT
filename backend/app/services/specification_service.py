"""UUID-only persistence and stale-state operations for specifications."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.project import Project
from app.models.specification import Specification
from app.schemas.specification import (
    SpecificationCandidateGroup,
    SpecificationDiagnostic,
    SpecificationGenerationStatus,
    SpecificationItem,
)
from app.services.electrical_variant_service import ElectricalVariantServiceError

_SNAPSHOT_UNSET = object()
_ITEMS_UNSET = object()


class SpecificationService:
    """Repository boundary shared by generation, manual edits and stale hooks."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_specification(
        self,
        project_id: UUID,
        *,
        electrical_variant_id: UUID,
    ) -> Specification | None:
        result = await self.db.execute(
            select(Specification).where(
                Specification.project_id == project_id,
                Specification.electrical_variant_id == electrical_variant_id,
            )
        )
        return result.scalars().one_or_none()

    async def record_last_generation(
        self,
        *,
        project_id: UUID,
        electrical_variant_id: UUID,
        status: SpecificationGenerationStatus | str,
        diagnostics: Sequence[SpecificationDiagnostic | Mapping[str, Any]] = (),
        candidate_groups: Sequence[SpecificationCandidateGroup | Mapping[str, Any]] = (),
        items_payload: list[dict[str, Any]] | object = _ITEMS_UNSET,
        snapshot: dict[str, Any] | None | object = _SNAPSHOT_UNSET,
        clear_stale: bool = False,
    ) -> Specification:
        """Persist last generate attempt so GET/F5 restores status without re-generate.

        When ``items_payload`` is unset, existing items/snapshot are preserved
        (outcome-only write for selection_required / blocked). Generated path
        must pass items + snapshot explicitly.
        """
        status_value = str(getattr(status, "value", status))
        diagnostics_payload = [
            d.model_dump(mode="json") if hasattr(d, "model_dump") else dict(d)
            for d in diagnostics
        ]
        groups_payload = [
            g.model_dump(mode="json") if hasattr(g, "model_dump") else dict(g)
            for g in candidate_groups
        ]
        now = datetime.now(UTC)
        is_generated = status_value == SpecificationGenerationStatus.GENERATED.value

        existing = await self.get_specification(
            project_id, electrical_variant_id=electrical_variant_id
        )
        if items_payload is _ITEMS_UNSET:
            retained_items = list(existing.items) if existing is not None else []
            retained_snapshot = existing.snapshot if existing is not None else None
            return await self._upsert_specification(
                project_id=project_id,
                electrical_variant_id=electrical_variant_id,
                items_payload=retained_items,
                snapshot=retained_snapshot,
                generation_status=status_value,
                generation_diagnostics=diagnostics_payload,
                generation_candidate_groups=groups_payload,
                generation_at=now,
                clear_stale=clear_stale,
            )

        return await self._upsert_specification(
            project_id=project_id,
            electrical_variant_id=electrical_variant_id,
            items_payload=list(items_payload),  # type: ignore[arg-type]
            snapshot=snapshot,
            generation_status=status_value,
            generation_diagnostics=diagnostics_payload,
            generation_candidate_groups=groups_payload,
            generation_at=now,
            clear_stale=clear_stale or is_generated,
        )

    async def save_items(
        self,
        project_id: UUID,
        electrical_variant_id: UUID,
        manual_items: list[SpecificationItem],
    ) -> list[SpecificationItem]:
        """Replace only manual rows while preserving backend-owned auto rows."""
        if any(item.source != "manual" for item in manual_items):
            raise ElectricalVariantServiceError(
                "SPEC_REQUEST_INVALID",
                "Ручное сохранение принимает только позиции source=manual",
                status_code=422,
            )

        await self._lock_project(project_id)
        existing = await self.get_specification(
            project_id,
            electrical_variant_id=electrical_variant_id,
        )
        if existing is not None and existing.is_stale:
            raise ElectricalVariantServiceError(
                "SPECIFICATION_STALE_READ_ONLY",
                "Устаревшая спецификация доступна только для чтения; "
                "требуется явная перегенерация.",
                status_code=409,
            )

        auto_items = _validated_auto_items(existing)
        combined = [*auto_items, *manual_items]
        await self._upsert_specification(
            project_id=project_id,
            electrical_variant_id=electrical_variant_id,
            items_payload=[item.model_dump(mode="json") for item in combined],
        )
        await self.db.commit()
        return combined

    async def _lock_project(self, project_id: UUID) -> None:
        await self.db.execute(
            select(Project)
            .where(Project.id == project_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )

    async def mark_project_specifications_stale(
        self,
        project_id: UUID,
        reason: str,
        *,
        object_ids: list[UUID] | set[UUID] | tuple[UUID, ...] | None = None,
        operation: str | None = None,
        commit: bool = False,
    ) -> int:
        """Mark every specification in one project stale without deleting history."""
        result = await self.db.execute(
            select(Specification).where(Specification.project_id == project_id)
        )
        specs = list(result.scalars().all())
        if not specs:
            return 0

        now = datetime.now(UTC)
        details = _stale_details(reason, object_ids=object_ids, operation=operation)
        for spec in specs:
            spec.is_stale = True
            spec.stale_reason = reason
            spec.stale_at = now
            spec.stale_details = details

        if commit:
            await self.db.commit()
        else:
            await self.db.flush()
        return len(specs)

    async def mark_electrical_variant_specification_stale(
        self,
        project_id: UUID,
        electrical_variant_id: UUID,
        reason: str,
        *,
        object_ids: list[UUID] | set[UUID] | tuple[UUID, ...] | None = None,
        operation: str | None = None,
        commit: bool = False,
    ) -> int:
        """Mark exactly one UUID-scoped ER specification stale."""
        result = await self.db.execute(
            select(Specification).where(
                Specification.project_id == project_id,
                Specification.electrical_variant_id == electrical_variant_id,
            )
        )
        spec = result.scalar_one_or_none()
        if spec is None:
            return 0

        spec.is_stale = True
        spec.stale_reason = reason
        spec.stale_at = datetime.now(UTC)
        spec.stale_details = {
            **_stale_details(reason, object_ids=object_ids, operation=operation),
            "electrical_variant_id": str(electrical_variant_id),
        }
        if commit:
            await self.db.commit()
        else:
            await self.db.flush()
        return 1

    async def mark_specifications_stale_for_objects(
        self,
        project_id: UUID,
        object_ids: list[UUID] | set[UUID] | tuple[UUID, ...],
        reason: str,
        *,
        operation: str | None = None,
        commit: bool = False,
    ) -> int:
        """Mark only specifications of ERs currently assigned affected objects."""
        unique_ids = list(dict.fromkeys(object_ids))
        if not unique_ids:
            return 0

        from app.models.electrical_variant import ElectricalVariantObject

        result = await self.db.execute(
            select(ElectricalVariantObject.electrical_variant_id)
            .where(
                ElectricalVariantObject.project_id == project_id,
                ElectricalVariantObject.object_id.in_(unique_ids),
                ElectricalVariantObject.system_type.is_not(None),
            )
            .distinct()
        )
        variant_ids = [row[0] for row in result.all() if row[0] is not None]
        if not variant_ids:
            return 0

        total = 0
        for variant_id in variant_ids:
            total += await self.mark_electrical_variant_specification_stale(
                project_id,
                variant_id,
                reason,
                object_ids=unique_ids,
                operation=operation,
                commit=False,
            )
        if commit:
            await self.db.commit()
        return total

    async def _upsert_specification(
        self,
        *,
        project_id: UUID,
        electrical_variant_id: UUID,
        items_payload: list[dict[str, Any]],
        snapshot: dict[str, Any] | None | object = _SNAPSHOT_UNSET,
        generation_status: str | None | object = _SNAPSHOT_UNSET,
        generation_diagnostics: list[dict[str, Any]] | object = _SNAPSHOT_UNSET,
        generation_candidate_groups: list[dict[str, Any]] | object = _SNAPSHOT_UNSET,
        generation_at: datetime | None | object = _SNAPSHOT_UNSET,
        clear_stale: bool = True,
    ) -> Specification:
        """Upsert exactly one specification by ``(project_id, ER UUID)``."""
        values: dict[str, Any] = {
            "project_id": project_id,
            "electrical_variant_id": electrical_variant_id,
            "items": items_payload,
        }
        if clear_stale:
            values["is_stale"] = False
            values["stale_reason"] = None
            values["stale_at"] = None
            values["stale_details"] = None
        if snapshot is not _SNAPSHOT_UNSET:
            values["snapshot"] = snapshot
        if generation_status is not _SNAPSHOT_UNSET:
            values["generation_status"] = generation_status
        if generation_diagnostics is not _SNAPSHOT_UNSET:
            values["generation_diagnostics"] = generation_diagnostics
        if generation_candidate_groups is not _SNAPSHOT_UNSET:
            values["generation_candidate_groups"] = generation_candidate_groups
        if generation_at is not _SNAPSHOT_UNSET:
            values["generation_at"] = generation_at

        # Defaults for insert when generation fields omitted (manual PUT path).
        if "generation_diagnostics" not in values:
            values["generation_diagnostics"] = []
        if "generation_candidate_groups" not in values:
            values["generation_candidate_groups"] = []

        insert_stmt = pg_insert(Specification).values(**values)
        set_: dict[str, Any] = {
            "items": insert_stmt.excluded["items"],
            "updated_at": func.now(),
        }
        if clear_stale:
            set_["is_stale"] = False
            set_["stale_reason"] = None
            set_["stale_at"] = None
            set_["stale_details"] = None
        if snapshot is not _SNAPSHOT_UNSET:
            set_["snapshot"] = insert_stmt.excluded["snapshot"]
        if generation_status is not _SNAPSHOT_UNSET:
            set_["generation_status"] = insert_stmt.excluded["generation_status"]
        if generation_diagnostics is not _SNAPSHOT_UNSET:
            set_["generation_diagnostics"] = insert_stmt.excluded["generation_diagnostics"]
        if generation_candidate_groups is not _SNAPSHOT_UNSET:
            set_["generation_candidate_groups"] = insert_stmt.excluded[
                "generation_candidate_groups"
            ]
        if generation_at is not _SNAPSHOT_UNSET:
            set_["generation_at"] = insert_stmt.excluded["generation_at"]

        upsert_stmt = insert_stmt.on_conflict_do_update(
            constraint="uq_specifications_project_electrical_variant",
            set_=set_,
        ).returning(Specification)
        result = await self.db.execute(
            select(Specification)
            .from_statement(upsert_stmt)
            .execution_options(populate_existing=True)
        )
        specification: Specification = result.scalar_one()
        return specification


def _validated_auto_items(existing: Specification | None) -> list[SpecificationItem]:
    if existing is None or not existing.items:
        return []
    auto_items: list[SpecificationItem] = []
    for index, raw in enumerate(existing.items):
        if isinstance(raw, dict) and raw.get("source") == "manual":
            continue
        try:
            item = SpecificationItem.model_validate(raw)
        except Exception as exc:
            raise ElectricalVariantServiceError(
                "SPEC_STORED_AUTO_ITEM_INVALID",
                "Сохранённая автоматическая позиция повреждена; ручное сохранение отменено",
                status_code=409,
                details={"item_index": index, "error": type(exc).__name__},
            ) from exc
        if item.source != "auto":
            raise ElectricalVariantServiceError(
                "SPEC_STORED_AUTO_ITEM_INVALID",
                "Сохранённая позиция не имеет допустимого source",
                status_code=409,
                details={"item_index": index},
            )
        auto_items.append(item)
    return auto_items


def _stale_details(
    reason: str,
    *,
    object_ids: list[UUID] | set[UUID] | tuple[UUID, ...] | None,
    operation: str | None,
) -> dict[str, Any]:
    details: dict[str, Any] = {"reason": reason}
    if operation:
        details["operation"] = operation
    if object_ids:
        details["object_ids"] = [str(item) for item in dict.fromkeys(object_ids)]
    return details
