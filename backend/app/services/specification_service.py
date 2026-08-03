"""UUID-only persistence and stale-state operations for specifications."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.project import Project
from app.models.specification import Specification
from app.schemas.specification import SpecificationItem
from app.services.electrical_variant_service import ElectricalVariantServiceError

_SNAPSHOT_UNSET = object()


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
    ) -> Specification:
        """Upsert exactly one specification by ``(project_id, ER UUID)``."""
        values: dict[str, Any] = {
            "project_id": project_id,
            "electrical_variant_id": electrical_variant_id,
            "items": items_payload,
            "is_stale": False,
            "stale_reason": None,
            "stale_at": None,
            "stale_details": None,
        }
        if snapshot is not _SNAPSHOT_UNSET:
            values["snapshot"] = snapshot

        insert_stmt = pg_insert(Specification).values(**values)
        set_: dict[str, Any] = {
            "items": insert_stmt.excluded["items"],
            "is_stale": False,
            "stale_reason": None,
            "stale_at": None,
            "stale_details": None,
            "updated_at": func.now(),
        }
        if snapshot is not _SNAPSHOT_UNSET:
            set_["snapshot"] = insert_stmt.excluded["snapshot"]

        upsert_stmt = insert_stmt.on_conflict_do_update(
            constraint="uq_specifications_project_electrical_variant",
            set_=set_,
        ).returning(Specification)
        result = await self.db.execute(
            select(Specification)
            .from_statement(upsert_stmt)
            .execution_options(populate_existing=True)
        )
        return result.scalar_one()


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
