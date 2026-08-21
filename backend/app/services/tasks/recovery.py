"""Retry, timeout and dead-letter recovery workflows."""

from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import or_, select

from app.core.config import settings
from app.models.background_task import BackgroundTask
from app.services.task_queue import TaskQueue
from app.services.tasks.contracts import (
    ACTIVE_STATUSES,
    SUPPORTED_TASK_TYPES,
    TASK_ELECTRICAL_BATCH,
    TASK_REPORT_EXPORT,
    TaskLimitError,
    TaskNotFoundError,
)
from app.services.tasks.lifecycle import TaskLifecycle


class TaskRecovery(TaskLifecycle):
    async def recover_stuck_tasks(
        self,
        *,
        queue: TaskQueue,
        limit: int = 100,
    ) -> int:
        now = datetime.now(UTC)
        recovered = await self._recover_queued_tasks(queue, now=now, limit=limit)
        recovered += await self._expire_waiting_tasks(now)
        if recovered >= limit:
            return recovered
        recovered += await self._recover_stale_tasks(
            queue,
            now=now,
            limit=limit - recovered,
        )
        return recovered

    async def _recover_queued_tasks(
        self,
        queue: TaskQueue,
        *,
        now: datetime,
        limit: int,
    ) -> int:
        result = await self.db.execute(
            select(BackgroundTask)
            .where(
                BackgroundTask.status == "queued",
                or_(
                    BackgroundTask.next_retry_at.is_(None),
                    BackgroundTask.next_retry_at <= now,
                ),
            )
            .order_by(BackgroundTask.created_at)
            .limit(limit)
        )
        recovered = 0
        for task in result.scalars().all():
            if task.cancel_requested:
                await self._mark_cancelled(task.id)
            else:
                await self.enqueue_existing_task(task, queue=queue)
            recovered += 1
        return recovered

    async def _expire_waiting_tasks(self, now: datetime) -> int:
        result = await self.db.execute(
            select(BackgroundTask).where(
                BackgroundTask.status == "waiting_input",
                BackgroundTask.interaction_deadline_at.is_not(None),
                BackgroundTask.interaction_deadline_at <= now,
            )
        )
        tasks = list(result.scalars().all())
        for task in tasks:
            task.status = "timed_out"
            task.progress_phase = "timed_out"
            task.error_message = "Истекло время ожидания ответа пользователя"
            task.finished_at = now
            task.interaction_deadline_at = None
            task.locked_by = None
            task.lock_expires_at = None
        if tasks:
            await self.db.commit()
        return len(tasks)

    async def _recover_stale_tasks(
        self,
        queue: TaskQueue,
        *,
        now: datetime,
        limit: int,
    ) -> int:
        stale_before = now - timedelta(seconds=settings.WORKER_TASK_STALE_SECONDS)
        result = await self.db.execute(
            select(BackgroundTask)
            .where(
                BackgroundTask.status.in_(("enqueued", "running")),
                or_(
                    BackgroundTask.heartbeat_at.is_(None),
                    BackgroundTask.heartbeat_at < stale_before,
                ),
            )
            .order_by(BackgroundTask.created_at)
            .limit(limit)
        )
        recovered = 0
        for task in result.scalars().all():
            if task.cancel_requested:
                await self._mark_cancelled(task.id)
            elif task.progress_phase == "dead_letter_pending":
                await queue.dead_letter(
                    task.arq_job_id or "postgres-recovery",
                    {"task_id": str(task.id), "type": task.type},
                    reason="worker_attempts_exhausted",
                )
                await self.finalize_dead_letter(task.id)
            elif (
                task.status == "running"
                and task.locked_by
                and await queue.is_worker_ready(task.locked_by)
            ):
                continue
            elif task.attempts >= settings.WORKER_MAX_ATTEMPTS:
                await self._mark_failed(task.id, "Задача зависла и исчерпала лимит повторов")
            else:
                task.status = "queued"
                task.locked_by = None
                task.lock_expires_at = None
                task.progress_phase = "requeued"
                task.next_retry_at = None
                await self.enqueue_existing_task(task, queue=queue)
            recovered += 1
        return recovered

    async def replay_dead_letter(
        self,
        stream_id: str,
        *,
        queue: TaskQueue,
    ) -> tuple[BackgroundTask, bool]:
        entry = await queue.get_dead_letter(stream_id)
        if entry is None:
            raise TaskNotFoundError("Dead-letter запись не найдена")
        _entry_id, fields = entry
        task_id_raw = fields.get("task_id")
        task_type = fields.get("type")
        if not task_id_raw:
            raise ValueError("Dead-letter запись не содержит task_id")
        try:
            task_id = UUID(str(task_id_raw))
        except ValueError as exc:
            raise ValueError("Dead-letter запись содержит некорректный task_id") from exc
        task = await self.db.get(BackgroundTask, task_id)
        if task is None:
            raise TaskNotFoundError("Задача из dead-letter записи не найдена")
        if task_type and task.type != task_type:
            raise ValueError("Тип задачи в dead-letter записи не совпадает с БД")
        if task.type not in SUPPORTED_TASK_TYPES:
            raise ValueError(f"Неизвестный тип задачи: {task.type}")
        if task.status in ACTIVE_STATUSES:
            raise TaskLimitError("Задача уже находится в очереди или выполняется")
        if task.type in (TASK_ELECTRICAL_BATCH, TASK_REPORT_EXPORT):
            await self._validate_replayed_electrical_task(task)
        self._reset_for_replay(task)
        await self.db.commit()
        await self.db.refresh(task)
        await self.enqueue_existing_task(task, queue=queue)
        removed = False
        if task.last_enqueue_error is None:
            removed = await queue.delete_dead_letter(stream_id) > 0
        return task, removed

    async def _validate_replayed_electrical_task(self, task: BackgroundTask) -> None:
        if task.project_id is None or task.electrical_variant_id is None:
            raise ValueError("ELECTRICAL_VARIANT_REPLAY_SCOPE_MISSING")
        await self._lock_project_for_task(task.project_id)
        await self.db.refresh(task)
        if task.status in ACTIVE_STATUSES:
            raise TaskLimitError("Задача уже находится в очереди или выполняется")
        payload = task.request_payload or {}
        try:
            payload_project_id = UUID(str(payload["project_id"]))
            payload_variant_id = UUID(str(payload["electrical_variant_id"]))
        except (KeyError, TypeError, ValueError) as exc:
            raise ValueError("ELECTRICAL_VARIANT_TASK_SCOPE_MISMATCH") from exc
        if (
            payload_project_id != task.project_id
            or payload_variant_id != task.electrical_variant_id
        ):
            raise ValueError("ELECTRICAL_VARIANT_TASK_SCOPE_MISMATCH")
        await self._resolve_electrical_variant(task.project_id, task.electrical_variant_id)

    @staticmethod
    def _reset_for_replay(task: BackgroundTask) -> None:
        task.status = "queued"
        task.result_payload = None
        task.error_message = None
        task.progress_current = 0
        task.progress_phase = "queued"
        task.cancel_requested = False
        task.attempts = 0
        task.enqueue_attempts = 0
        task.arq_job_id = None
        task.last_enqueue_error = None
        task.next_retry_at = None
        task.locked_by = None
        task.lock_expires_at = None
        task.started_at = None
        task.finished_at = None
        task.heartbeat_at = datetime.now(UTC)
