"""Shared authorization, validation and idempotency operations."""

from typing import Any, Literal
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.core.dependencies import CurrentPrincipal
from app.models.background_task import BackgroundTask
from app.models.electrical_variant import ElectricalVariant
from app.models.project import Project
from app.models.project_object import ProjectObject
from app.schemas.calculation import ElectricalBatchJobRequest, ElectricalObjectBatchOverride
from app.services.project_service import (
    ProjectAccessError,
    ProjectNotFoundError,
    ProjectService,
)
from app.services.tasks.contracts import (
    ACTIVE_STATUSES,
    ELECTRICAL_VARIANT_NOT_FOUND,
    IDEMPOTENCY_REPLAY_ATTR,
    TaskAccessError,
    TaskIdempotencyConflictError,
    TaskLimitError,
    TaskNotFoundError,
)
from app.services.tasks.payloads import (
    dedupe_key,
    electrical_payload,
    heat_loss_payload,
    report_export_payload,
)


class TaskBase:
    def __init__(
        self,
        db: AsyncSession,
        *,
        session_factory: async_sessionmaker[AsyncSession] = AsyncSessionLocal,
    ) -> None:
        self.db = db
        self.session_factory = session_factory

    @staticmethod
    def is_idempotency_replay(task: BackgroundTask) -> bool:
        return bool(getattr(task, IDEMPOTENCY_REPLAY_ATTR, False))

    @staticmethod
    def audit_result_for_task(
        task: BackgroundTask,
    ) -> Literal["success", "failure", "queued", "cancelled"]:
        if task.status in ACTIVE_STATUSES:
            return "queued"
        if task.status == "succeeded":
            return "success"
        if task.status in ("failed", "timed_out"):
            return "failure"
        if task.status == "cancelled":
            return "cancelled"
        raise ValueError(f"Unsupported background task status: {task.status}")

    @staticmethod
    def _mark_idempotency_replay(
        task: BackgroundTask,
        *,
        replay: bool,
    ) -> BackgroundTask:
        setattr(task, IDEMPOTENCY_REPLAY_ATTR, replay)
        return task

    async def _require_project_write(
        self,
        project_id: UUID,
        principal: CurrentPrincipal,
        *,
        calculation_owner_task_id: UUID | None = None,
    ) -> None:
        try:
            await ProjectService(self.db).get_project_for_write(
                project_id,
                principal,
                calculation_owner_task_id=calculation_owner_task_id,
            )
        except ProjectNotFoundError as exc:
            raise TaskNotFoundError(str(exc)) from exc
        except ProjectAccessError as exc:
            raise TaskAccessError(str(exc)) from exc

    async def _resolve_electrical_variant(
        self,
        project_id: UUID,
        electrical_variant_id: UUID,
        *,
        db: AsyncSession | None = None,
    ) -> ElectricalVariant:
        result = await (db or self.db).execute(
            select(ElectricalVariant).where(
                ElectricalVariant.project_id == project_id,
                ElectricalVariant.id == electrical_variant_id,
            )
        )
        variant = result.scalar_one_or_none()
        if variant is None:
            raise TaskNotFoundError(ELECTRICAL_VARIANT_NOT_FOUND)
        return variant

    async def _lock_project_for_task(self, project_id: UUID) -> None:
        result = await self.db.execute(
            select(Project)
            .where(Project.id == project_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        if result.scalar_one_or_none() is None:
            raise TaskNotFoundError(f"Проект {project_id} не найден")

    async def _lock_project_for_electrical_task(self, project_id: UUID) -> None:
        await self._lock_project_for_task(project_id)

    async def has_active_tasks_for_electrical_variant(
        self,
        project_id: UUID,
        electrical_variant_id: UUID,
    ) -> bool:
        result = await self.db.execute(
            select(func.count(BackgroundTask.id)).where(
                BackgroundTask.project_id == project_id,
                BackgroundTask.electrical_variant_id == electrical_variant_id,
                BackgroundTask.status.in_(ACTIVE_STATUSES),
            )
        )
        return int(result.scalar_one()) > 0

    async def _find_active_by_dedupe(
        self,
        key: str,
        *,
        include_terminal: bool = False,
    ) -> BackgroundTask | None:
        stmt = select(BackgroundTask).where(BackgroundTask.idempotency_key == key)
        if not include_terminal:
            stmt = stmt.where(BackgroundTask.status.in_(ACTIVE_STATUSES))
        result = await self.db.execute(stmt.order_by(BackgroundTask.created_at.desc()).limit(1))
        return result.scalar_one_or_none()

    async def _explicit_idempotency_binding(
        self,
        task_type: str,
        project_id: UUID,
        principal: CurrentPrincipal,
        idempotency_key: str | None,
    ) -> BackgroundTask | None:
        if not idempotency_key:
            return None
        await ProjectService(self.db).get_project_for_write(
            project_id,
            principal,
            guard_calculation=False,
        )
        key = dedupe_key(
            task_type=task_type,
            project_id=project_id,
            principal=principal,
            payload={},
            idempotency_key=idempotency_key,
        )
        return await self._find_active_by_dedupe(key, include_terminal=True)

    @staticmethod
    def _require_matching_idempotency_binding(
        task: BackgroundTask,
        *,
        explicit_idempotency: bool,
        task_type: str,
        project_id: UUID,
        electrical_variant_id: UUID | None,
        payload: dict[str, Any],
    ) -> None:
        if explicit_idempotency and (
            task.type != task_type
            or task.project_id != project_id
            or task.electrical_variant_id != electrical_variant_id
            or task.request_payload != payload
        ):
            raise TaskIdempotencyConflictError

    async def _enforce_active_task_limits(
        self,
        project_id: UUID,
        principal: CurrentPrincipal,
    ) -> None:
        if (
            settings.MAX_ACTIVE_TASKS_GLOBAL > 0
            and await self._active_global_task_count() >= settings.MAX_ACTIVE_TASKS_GLOBAL
        ):
            raise TaskLimitError("Очередь задач перегружена. Повторите позже.")
        if settings.MAX_ACTIVE_TASKS_PER_PROJECT > 0:
            count = await self._active_project_task_count(project_id)
            if count >= settings.MAX_ACTIVE_TASKS_PER_PROJECT:
                raise TaskLimitError(
                    "Превышен лимит активных задач для проекта. Дождитесь завершения "
                    "или отмените одну из задач."
                )
        if settings.MAX_ACTIVE_TASKS_PER_PRINCIPAL > 0:
            count = await self._active_principal_task_count(principal)
            if count >= settings.MAX_ACTIVE_TASKS_PER_PRINCIPAL:
                raise TaskLimitError(
                    "Превышен лимит активных задач для пользователя. Дождитесь "
                    "завершения или отмените одну из задач."
                )

    async def _active_global_task_count(self) -> int:
        result = await self.db.execute(
            select(func.count(BackgroundTask.id)).where(BackgroundTask.status.in_(ACTIVE_STATUSES))
        )
        return int(result.scalar_one())

    async def _active_project_task_count(self, project_id: UUID) -> int:
        result = await self.db.execute(
            select(func.count(BackgroundTask.id)).where(
                BackgroundTask.project_id == project_id,
                BackgroundTask.status.in_(ACTIVE_STATUSES),
            )
        )
        return int(result.scalar_one())

    async def _active_principal_task_count(self, principal: CurrentPrincipal) -> int:
        stmt = select(func.count(BackgroundTask.id)).where(
            BackgroundTask.status.in_(ACTIVE_STATUSES)
        )
        if principal.role == "guest":
            stmt = stmt.where(BackgroundTask.session_id == principal.session_id)
        else:
            stmt = stmt.where(BackgroundTask.user_id == principal.user_id)
        result = await self.db.execute(stmt)
        return int(result.scalar_one())

    async def _validate_object_ids_belong_to_project(
        self,
        project_id: UUID,
        object_ids: list[UUID] | None,
    ) -> list[UUID] | None:
        if object_ids is None:
            return None
        normalized = list(dict.fromkeys(object_ids))
        if not normalized:
            raise ValueError("Список выбранных объектов не должен быть пустым")
        result = await self.db.execute(
            select(ProjectObject.id).where(
                ProjectObject.project_id == project_id,
                ProjectObject.id.in_(normalized),
            )
        )
        if len(set(result.scalars().all())) != len(normalized):
            raise ValueError("Все выбранные объекты должны принадлежать проекту")
        return normalized

    async def _validate_electrical_object_overrides(
        self,
        project_id: UUID,
        object_overrides: list[ElectricalObjectBatchOverride] | None,
        *,
        object_ids: list[UUID] | None,
    ) -> list[dict[str, str]] | None:
        if object_overrides is None:
            return None
        normalized = {item.object_id: item for item in object_overrides}
        if not normalized:
            return None
        override_ids = list(normalized)
        if object_ids is not None and not set(override_ids).issubset(object_ids):
            raise ValueError("Переопределения должны относиться только к выбранным объектам")
        result = await self.db.execute(
            select(ProjectObject.id).where(
                ProjectObject.project_id == project_id,
                ProjectObject.id.in_(override_ids),
            )
        )
        if len(set(result.scalars().all())) != len(override_ids):
            raise ValueError("Все переопределения должны принадлежать объектам проекта")
        return [
            {"object_id": str(item.object_id), "cable_type": item.cable_type}
            for item in normalized.values()
            if item.cable_type is not None
        ] or None

    @staticmethod
    def _electrical_payload(
        request: ElectricalBatchJobRequest,
        *,
        electrical_variant_id: UUID | None = None,
        object_ids: list[UUID] | None,
        object_overrides: list[dict[str, str]] | None,
    ) -> dict[str, Any]:
        if (
            electrical_variant_id is not None
            and electrical_variant_id != request.electrical_variant_id
        ):
            raise ValueError("ELECTRICAL_VARIANT_TASK_SCOPE_MISMATCH")
        return electrical_payload(
            request,
            object_ids=object_ids,
            object_overrides=object_overrides,
        )

    _heat_loss_payload = staticmethod(heat_loss_payload)
    _report_export_payload = staticmethod(report_export_payload)
    _dedupe_key = staticmethod(dedupe_key)
