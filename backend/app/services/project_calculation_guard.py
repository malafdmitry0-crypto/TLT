"""Server-authoritative project write gate for calculation workflows."""

from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from sqlalchemy import select, text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.background_task import BackgroundTask
from app.models.project import Project

ACTIVE_CALCULATION_STATUSES = ("queued", "enqueued", "running", "waiting_input")
CALCULATION_TASK_TYPES = ("heat_loss_batch", "electrical_batch", "electrical_variant_set")


@dataclass(frozen=True)
class ProjectCalculationBusy:
    task_id: UUID | None
    task_type: str | None
    status: str
    stage: str | None = None
    retry_after_seconds: int = 2


class ProjectCalculationBusyError(Exception):
    code = "PROJECT_CALCULATION_BUSY"
    message = "Проект заблокирован активным расчётом"

    def __init__(self, busy: ProjectCalculationBusy) -> None:
        super().__init__(self.message)
        self.busy = busy

    def as_detail(self) -> dict[str, object]:
        task_id = str(self.busy.task_id) if self.busy.task_id is not None else None
        return {
            "code": self.code,
            "message": self.message,
            "operation_id": task_id,
            "operation_type": self.busy.task_type,
            "status": self.busy.status,
            "stage": self.busy.stage,
            "retry_after_seconds": self.busy.retry_after_seconds,
            "status_url": (
                (
                    f"/api/v1/electrical-variant-set-tasks/{task_id}"
                    if self.busy.task_type == "electrical_variant_set"
                    else f"/api/v1/calc/jobs/{task_id}"
                )
                if task_id is not None
                else None
            ),
        }


class ProjectCalculationGuard:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def lock_and_check(
        self,
        project_id: UUID,
        *,
        owner_task_id: UUID | None = None,
    ) -> None:
        """Take the common project lock, then fail fast on a foreign active task."""
        bind = self.db.get_bind()
        dialect_name = getattr(getattr(bind, "dialect", None), "name", None)
        try:
            if dialect_name == "postgresql" and settings.DB_CALCULATION_LOCK_TIMEOUT_MS > 0:
                await self.db.execute(
                    text(
                        "SET LOCAL lock_timeout = "
                        f"'{settings.DB_CALCULATION_LOCK_TIMEOUT_MS}ms'"
                    )
                )
            await self.db.execute(
                select(Project.id).where(Project.id == project_id).with_for_update()
            )
        except DBAPIError as exc:
            await self.db.rollback()
            raise ProjectCalculationBusyError(
                ProjectCalculationBusy(
                    task_id=None,
                    task_type=None,
                    status="locked",
                )
            ) from exc

        task = (
            await self.db.execute(
                select(BackgroundTask)
                .where(
                    BackgroundTask.project_id == project_id,
                    BackgroundTask.type.in_(CALCULATION_TASK_TYPES),
                    BackgroundTask.status.in_(ACTIVE_CALCULATION_STATUSES),
                )
                .order_by(BackgroundTask.created_at)
                .limit(1)
            )
        ).scalar_one_or_none()
        if task is not None and task.id != owner_task_id:
            raise ProjectCalculationBusyError(
                ProjectCalculationBusy(
                    task_id=task.id,
                    task_type=task.type,
                    status=task.status,
                    stage=task.workflow_stage or task.progress_phase,
                )
            )

    async def active_task(self, project_id: UUID) -> BackgroundTask | None:
        return (
            await self.db.execute(
                select(BackgroundTask)
                .where(
                    BackgroundTask.project_id == project_id,
                    BackgroundTask.type.in_(CALCULATION_TASK_TYPES),
                    BackgroundTask.status.in_(ACTIVE_CALCULATION_STATUSES),
                )
                .order_by(BackgroundTask.created_at)
                .limit(1)
            )
        ).scalar_one_or_none()
