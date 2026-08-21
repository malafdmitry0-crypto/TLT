"""Task state transitions, worker fencing and audit."""

import logging
from datetime import UTC, datetime, timedelta
from typing import Any, Literal
from uuid import UUID

from sqlalchemy import func, select, update

from app.core.config import settings
from app.core.dependencies import CurrentPrincipal
from app.models.background_task import BackgroundTask
from app.services.audit_service import AuditService
from app.services.calculation.contracts import BatchProgress
from app.services.project_service import ProjectService
from app.services.task_queue import TaskQueue
from app.services.tasks.base import TaskBase
from app.services.tasks.contracts import (
    MAX_AUDIT_MESSAGE_LENGTH,
    TERMINAL_STATUSES,
    TaskAccessError,
    TaskNotFoundError,
    WorkerFailureAction,
    compact_task_error_message,
)

logger = logging.getLogger("heatcalc.worker")


class TaskLifecycle(TaskBase):
    async def get_task_for_principal(
        self,
        task_id: UUID,
        principal: CurrentPrincipal,
    ) -> BackgroundTask:
        task = await self.db.get(BackgroundTask, task_id)
        if task is None:
            raise TaskNotFoundError("Задача не найдена")
        if task.project_id is not None:
            try:
                await ProjectService(self.db).get_project_basic(task.project_id, principal)
            except Exception as exc:
                raise TaskAccessError("Нет доступа к задаче") from exc
        elif principal.role == "guest":
            if task.session_id != principal.session_id:
                raise TaskAccessError("Нет доступа к задаче")
        elif principal.role == "employee":
            if task.user_id != principal.user_id:
                raise TaskAccessError("Нет доступа к задаче")
        else:
            raise TaskAccessError("Нет доступа к задаче")
        return task

    async def cancel_task(
        self,
        task_id: UUID,
        principal: CurrentPrincipal,
    ) -> BackgroundTask:
        task = await self.get_task_for_principal(task_id, principal)
        if task.project_id is not None:
            await self._require_project_write(
                task.project_id,
                principal,
                calculation_owner_task_id=task.id,
            )
        if task.status in TERMINAL_STATUSES:
            return task
        now = datetime.now(UTC)
        task.cancel_requested = True
        if task.status in ("queued", "enqueued", "waiting_input"):
            task.status = "cancelled"
            task.progress_phase = "cancelled"
            task.finished_at = now
        task.heartbeat_at = now
        await self.db.commit()
        await self.db.refresh(task)
        return task

    async def enqueue_existing_task(self, task: BackgroundTask, *, queue: TaskQueue) -> None:
        now = datetime.now(UTC)
        task.enqueue_attempts = (task.enqueue_attempts or 0) + 1
        try:
            stream_id = await queue.enqueue(task.id, task.type)
        except Exception as exc:
            task.status = "queued"
            task.last_enqueue_error = f"{type(exc).__name__}: {exc}"
            task.next_retry_at = now + timedelta(seconds=15 * min(task.enqueue_attempts, 4))
            logger.warning("Task enqueue failed for %s: %s", task.id, task.last_enqueue_error)
        else:
            task.status = "enqueued"
            task.arq_job_id = stream_id
            task.last_enqueue_error = None
            task.next_retry_at = None
            task.progress_phase = "enqueued"
            task.heartbeat_at = now
        await self.db.commit()
        await self.db.refresh(task)

    async def record_worker_exception(
        self,
        task_id: UUID,
        *,
        worker_id: str,
        error_message: str,
    ) -> WorkerFailureAction:
        task = (
            await self.db.execute(
                select(BackgroundTask)
                .where(
                    BackgroundTask.id == task_id,
                    BackgroundTask.status == "running",
                    BackgroundTask.locked_by == worker_id,
                )
                .with_for_update()
                .execution_options(populate_existing=True)
            )
        ).scalar_one_or_none()
        if task is None:
            await self.db.rollback()
            return "ack"
        now = datetime.now(UTC)
        task.error_message = compact_task_error_message(error_message)
        task.locked_by = None
        task.lock_expires_at = None
        task.heartbeat_at = now
        if task.cancel_requested:
            task.status = "cancelled"
            task.progress_phase = "cancelled"
            task.finished_at = now
            await self.db.commit()
            return "ack"
        if task.attempts >= settings.WORKER_MAX_ATTEMPTS:
            task.status = "enqueued"
            task.progress_phase = "dead_letter_pending"
            task.finished_at = None
            await self.db.commit()
            return "dead_letter"
        task.status = "enqueued"
        task.progress_phase = "retry_pending"
        task.next_retry_at = None
        await self.db.commit()
        return "retry"

    async def is_dead_letter_pending(self, task_id: UUID) -> bool:
        task = await self.db.get(BackgroundTask, task_id)
        return bool(
            task is not None
            and task.status == "enqueued"
            and task.progress_phase == "dead_letter_pending"
        )

    async def finalize_dead_letter(self, task_id: UUID) -> None:
        task = await self.db.get(BackgroundTask, task_id)
        if task is None or task.progress_phase != "dead_letter_pending":
            return
        await self._mark_failed(task_id, task.error_message or "Задача исчерпала лимит повторов")

    async def _claim_task_for_run(
        self,
        task_id: UUID,
        *,
        worker_id: str,
    ) -> BackgroundTask | None:
        now = datetime.now(UTC)
        result = await self.db.execute(
            update(BackgroundTask)
            .where(
                BackgroundTask.id == task_id,
                BackgroundTask.status.in_(("queued", "enqueued")),
                BackgroundTask.cancel_requested.is_(False),
            )
            .values(
                status="running",
                attempts=BackgroundTask.attempts + 1,
                locked_by=worker_id,
                lock_expires_at=now + timedelta(seconds=settings.WORKER_TASK_STALE_SECONDS),
                started_at=func.coalesce(BackgroundTask.started_at, now),
                heartbeat_at=now,
                progress_phase="running",
                execution_deadline_at=func.coalesce(
                    BackgroundTask.execution_deadline_at,
                    now + timedelta(seconds=settings.WORKFLOW_EXECUTION_TIMEOUT_SECONDS),
                ),
            )
            .returning(BackgroundTask)
        )
        task = result.scalar_one_or_none()
        if task is None:
            await self.db.rollback()
            return None
        await self.db.commit()
        return task

    async def _update_progress(
        self,
        task_id: UUID,
        progress: BatchProgress,
        *,
        attempt: int | None = None,
        worker_id: str | None = None,
    ) -> None:
        async with self.session_factory() as db:
            now = datetime.now(UTC)
            if attempt is not None and worker_id is not None:
                await db.execute(
                    update(BackgroundTask)
                    .where(
                        BackgroundTask.id == task_id,
                        BackgroundTask.status == "running",
                        BackgroundTask.attempts == attempt,
                        BackgroundTask.locked_by == worker_id,
                    )
                    .values(
                        progress_current=progress.current,
                        progress_total=progress.total,
                        progress_phase=progress.phase,
                        heartbeat_at=now,
                        lock_expires_at=now + timedelta(seconds=settings.WORKER_TASK_STALE_SECONDS),
                    )
                )
                await db.commit()
                return
            task = await db.get(BackgroundTask, task_id)
            if task is None or task.status in TERMINAL_STATUSES:
                return
            task.progress_current = progress.current
            task.progress_total = progress.total
            task.progress_phase = progress.phase
            task.heartbeat_at = now
            task.lock_expires_at = now + timedelta(seconds=settings.WORKER_TASK_STALE_SECONDS)
            await db.commit()

    async def _should_cancel(
        self,
        task_id: UUID,
        *,
        attempt: int | None = None,
        worker_id: str | None = None,
    ) -> bool:
        async with self.session_factory() as db:
            filters = [BackgroundTask.id == task_id]
            if attempt is not None and worker_id is not None:
                filters.extend(
                    (
                        BackgroundTask.status == "running",
                        BackgroundTask.attempts == attempt,
                        BackgroundTask.locked_by == worker_id,
                    )
                )
            row = (
                await db.execute(
                    select(BackgroundTask.cancel_requested, BackgroundTask.status).where(*filters)
                )
            ).one_or_none()
            return row is None or bool(row[0]) or row[1] == "cancelled"

    async def _task_for_terminal_transition(
        self,
        task_id: UUID,
        *,
        attempt: int | None,
        worker_id: str | None,
    ) -> BackgroundTask | None:
        if attempt is None or worker_id is None:
            task = await self.db.get(BackgroundTask, task_id)
            if task is not None:
                await self.db.refresh(task)
            return task
        task = (
            await self.db.execute(
                select(BackgroundTask)
                .where(
                    BackgroundTask.id == task_id,
                    BackgroundTask.status == "running",
                    BackgroundTask.attempts == attempt,
                    BackgroundTask.locked_by == worker_id,
                )
                .with_for_update()
                .execution_options(populate_existing=True)
            )
        ).scalar_one_or_none()
        if task is None:
            await self.db.rollback()
        return task

    async def _mark_succeeded(
        self,
        task_id: UUID,
        result_payload: dict[str, Any],
        *,
        attempt: int | None = None,
        worker_id: str | None = None,
    ) -> bool:
        task = await self._task_for_terminal_transition(
            task_id, attempt=attempt, worker_id=worker_id
        )
        if task is None:
            return False
        now = datetime.now(UTC)
        task.status = "succeeded"
        task.result_payload = result_payload
        task.error_message = None
        task.progress_phase = "done"
        task.progress_current = task.progress_total or task.progress_current
        task.cancel_requested = False
        task.locked_by = None
        task.lock_expires_at = None
        task.heartbeat_at = now
        task.finished_at = now
        await self._record_task_audit(task, "succeeded", result_payload=result_payload)
        await self.db.commit()
        return True

    async def _mark_failed(
        self,
        task_id: UUID,
        error_message: str,
        *,
        attempt: int | None = None,
        worker_id: str | None = None,
    ) -> bool:
        task = await self._task_for_terminal_transition(
            task_id, attempt=attempt, worker_id=worker_id
        )
        if task is None:
            return False
        now = datetime.now(UTC)
        task.status = "failed"
        task.error_message = compact_task_error_message(error_message)
        task.progress_phase = "failed"
        task.locked_by = None
        task.lock_expires_at = None
        task.heartbeat_at = now
        task.finished_at = now
        await self._record_task_audit(
            task,
            "failed",
            error_code="task_failed",
            message=compact_task_error_message(
                task.error_message, max_length=MAX_AUDIT_MESSAGE_LENGTH
            ),
        )
        await self.db.commit()
        return True

    async def _mark_cancelled(
        self,
        task_id: UUID,
        *,
        attempt: int | None = None,
        worker_id: str | None = None,
    ) -> bool:
        task = await self._task_for_terminal_transition(
            task_id, attempt=attempt, worker_id=worker_id
        )
        if task is None:
            return False
        now = datetime.now(UTC)
        task.status = "cancelled"
        task.cancel_requested = True
        task.progress_phase = "cancelled"
        task.locked_by = None
        task.lock_expires_at = None
        task.heartbeat_at = now
        task.finished_at = now
        await self._record_task_audit(task, "cancelled")
        await self.db.commit()
        return True

    async def _record_task_audit(
        self,
        task: BackgroundTask,
        status: Literal["succeeded", "failed", "cancelled"],
        *,
        result_payload: dict[str, Any] | None = None,
        error_code: str | None = None,
        message: str | None = None,
    ) -> None:
        audit_result = {
            "succeeded": "success",
            "failed": "failure",
            "cancelled": "cancelled",
        }[status]
        await AuditService(self.db).record(
            event_type=f"task.{task.type}.{status}",
            category="task",
            source="worker",
            result=audit_result,
            severity="info" if status == "succeeded" else "warning",
            actor_type="user" if task.user_id is not None else "guest",
            actor_id=str(task.user_id or task.session_id or ""),
            user_id=task.user_id,
            session_id=task.session_id,
            project_id=task.project_id,
            task_id=task.id,
            details={
                "task_type": task.type,
                "attempts": task.attempts,
                "progress_current": task.progress_current,
                "progress_total": task.progress_total,
                **self._task_result_summary(result_payload or {}),
            },
            error_code=error_code,
            message=message,
        )

    @staticmethod
    def _task_result_summary(result_payload: dict[str, Any]) -> dict[str, Any]:
        keys = (
            "updated",
            "failed",
            "calculated",
            "skipped",
            "heat_loss_failed",
            "format",
            "electrical_variant_id",
            "requested_scope",
            "scope",
        )
        summary = {key: result_payload[key] for key in keys if key in result_payload}
        if isinstance(result_payload.get("errors"), list):
            summary["errors_count"] = len(result_payload["errors"])
        if isinstance(result_payload.get("results"), list):
            summary["results_count"] = len(result_payload["results"])
        if "artifact_name" in result_payload:
            summary["artifact_name"] = result_payload["artifact_name"]
        return summary
