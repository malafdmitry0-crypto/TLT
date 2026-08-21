"""Chunked project heat-loss recalculation use case."""

import asyncio
from collections.abc import Awaitable, Callable
from typing import Any
from uuid import UUID

from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import load_only

from app.core.database import use_fast_commit_for_current_transaction
from app.models.project import Project
from app.models.project_object import ProjectObject
from app.result import Result
from app.services.calculation.batch_execution import BatchCancelChecker, maybe_await
from app.services.calculation.contracts import (
    BatchProgress,
    CancelChecker,
    ProgressCallback,
)

BATCH_HEAT_RECALCULATE_CHUNK_SIZE = 2_000
BATCH_HEAT_RECALCULATE_YIELD_EVERY_OBJECTS = 25

CoefficientLoader = Callable[[], Awaitable[dict[str, float]]]
HeatRecalculator = Callable[..., Awaitable[Result[ProjectObject, str]]]
StaleMarker = Callable[..., Awaitable[int]]


class HeatBatchCalculationService:
    """Own transaction, cancellation and progress for project heat recalculation."""

    def __init__(
        self,
        db: AsyncSession,
        *,
        load_coefficients: CoefficientLoader,
        try_recalculate: HeatRecalculator,
        mark_electrical_stale: StaleMarker,
    ) -> None:
        self.db = db
        self._load_coefficients = load_coefficients
        self._try_recalculate = try_recalculate
        self._mark_electrical_stale = mark_electrical_stale

    async def count(
        self,
        project_id: UUID,
        object_ids: list[UUID] | None = None,
    ) -> int:
        filters = [ProjectObject.project_id == project_id]
        if object_ids is not None:
            if not object_ids:
                return 0
            filters.append(ProjectObject.id.in_(object_ids))
        result = await self.db.execute(select(func.count(ProjectObject.id)).where(*filters))
        return int(result.scalar() or 0)

    async def load_chunk(
        self,
        project_id: UUID,
        *,
        limit: int,
        after_sort_order: int | None = None,
        after_id: UUID | None = None,
        object_ids: list[UUID] | None = None,
    ) -> list[ProjectObject]:
        filters = [ProjectObject.project_id == project_id]
        if object_ids is not None:
            if not object_ids:
                return []
            filters.append(ProjectObject.id.in_(object_ids))
        if after_sort_order is not None and after_id is not None:
            filters.append(
                or_(
                    ProjectObject.sort_order > after_sort_order,
                    and_(
                        ProjectObject.sort_order == after_sort_order,
                        ProjectObject.id > after_id,
                    ),
                )
            )
        result = await self.db.execute(
            select(ProjectObject)
            .options(
                load_only(
                    ProjectObject.id,
                    ProjectObject.project_id,
                    ProjectObject.object_type,
                    ProjectObject.sort_order,
                    ProjectObject.version,
                    ProjectObject.params,
                    ProjectObject.results,
                    ProjectObject.is_valid,
                    ProjectObject.validation_errors,
                )
            )
            .where(*filters)
            .order_by(ProjectObject.sort_order, ProjectObject.id)
            .limit(limit)
        )
        return list(result.scalars().all())

    async def recalculate(
        self,
        project_id: UUID,
        progress_callback: ProgressCallback | None = None,
        should_cancel: CancelChecker | None = None,
        object_ids: list[UUID] | None = None,
        *,
        commit: bool = True,
    ) -> tuple[int, int, list[dict[str, Any]]]:
        async def emit_progress(progress: BatchProgress) -> None:
            if progress_callback is not None:
                await maybe_await(progress_callback(progress))

        cancel_checker = BatchCancelChecker(
            should_cancel,
            cancel_message="Пакетный пересчёт теплопотерь отменён",
        )
        await self.db.execute(
            select(Project)
            .where(Project.id == project_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        total_count = await self.count(project_id, object_ids)
        updated = 0
        failed = 0
        errors: list[dict[str, Any]] = []

        await emit_progress(BatchProgress(current=0, total=total_count, phase="prepare"))
        await cancel_checker.check(0, force=True)

        coefficients = await self._load_coefficients() if total_count > 0 else {}
        processed = 0
        last_sort_order: int | None = None
        last_id: UUID | None = None

        while processed < total_count:
            objects = await self.load_chunk(
                project_id,
                limit=BATCH_HEAT_RECALCULATE_CHUNK_SIZE,
                after_sort_order=last_sort_order,
                after_id=last_id,
                object_ids=object_ids,
            )
            if not objects:
                break
            last_sort_order = getattr(objects[-1], "sort_order", None)
            last_id = objects[-1].id

            for obj in objects:
                await cancel_checker.check(processed)
                await self._try_recalculate(obj, coefficients=coefficients)
                if obj.is_valid:
                    updated += 1
                else:
                    failed += 1
                    errors.append({"object_id": str(obj.id), "error": obj.validation_errors})
                processed += 1
                await emit_progress(
                    BatchProgress(
                        current=processed,
                        total=total_count,
                        phase="calculate",
                        calculated=updated,
                        skipped=failed,
                        heat_loss_failed=failed,
                        object_id=obj.id,
                    )
                )
                if processed % BATCH_HEAT_RECALCULATE_YIELD_EVERY_OBJECTS == 0:
                    await asyncio.sleep(0)

            await cancel_checker.check(processed, force=True)
            chunk_object_ids = [obj.id for obj in objects]
            await self._mark_electrical_stale(
                project_id,
                chunk_object_ids,
                reason="heat_loss_batch_recalculate",
            )
            await self.db.flush()
            await asyncio.sleep(0)

        await cancel_checker.check(processed, force=True)
        await emit_progress(
            BatchProgress(
                current=processed,
                total=total_count,
                phase="commit",
                calculated=updated,
                skipped=failed,
                heat_loss_failed=failed,
            )
        )
        if commit:
            await use_fast_commit_for_current_transaction(self.db)
            await self.db.commit()
        else:
            await self.db.flush()
        await emit_progress(
            BatchProgress(
                current=processed,
                total=total_count,
                phase="done",
                calculated=updated,
                skipped=failed,
                heat_loss_failed=failed,
            )
        )
        return updated, failed, errors
