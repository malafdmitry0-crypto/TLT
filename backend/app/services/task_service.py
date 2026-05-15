"""Durable task service for asynchronous calculations."""

from __future__ import annotations

import hashlib
import json
import logging
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from time import monotonic
from typing import Any
from uuid import UUID

from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.core.dependencies import CurrentPrincipal
from app.models.background_task import BackgroundTask
from app.models.project_object import ProjectObject
from app.schemas.calculation import (
    BatchCalcResponse,
    BatchElectricalResponse,
    CalculationTaskLinks,
    CalculationTaskProgress,
    CalculationTaskResponse,
    ElectricalBatchJobRequest,
    ElectricalCalcSummary,
    HeatLossBatchJobRequest,
)
from app.services.calculation_service import BatchCancelledError, BatchProgress, CalculationService
from app.services.project_service import ProjectService
from app.services.task_queue import TaskQueue

logger = logging.getLogger("heatcalc.worker")

TASK_ELECTRICAL_BATCH = "electrical_batch"
TASK_HEAT_LOSS_BATCH = "heat_loss_batch"
ACTIVE_STATUSES = ("queued", "enqueued", "running")
TERMINAL_STATUSES = ("succeeded", "failed", "cancelled")
MAX_TASK_ERROR_MESSAGE_LENGTH = 4_000


@dataclass(frozen=True)
class ProgressWritePolicy:
    min_interval_ms: int = settings.WORKER_PROGRESS_MIN_INTERVAL_MS
    min_percent_delta: float = settings.WORKER_PROGRESS_MIN_PERCENT_DELTA


class ProgressThrottler:
    """Persist frequent worker progress events only at useful UI checkpoints."""

    def __init__(
        self,
        persist: Callable[[BatchProgress], Awaitable[None]],
        *,
        policy: ProgressWritePolicy | None = None,
        now_func: Callable[[], float] = monotonic,
    ) -> None:
        self._persist = persist
        self._policy = policy or ProgressWritePolicy()
        self._now = now_func
        self._last_persisted: BatchProgress | None = None
        self._last_persisted_at: float | None = None
        self._buffered: BatchProgress | None = None

    async def offer(self, progress: BatchProgress) -> None:
        now = self._now()
        if self._should_persist(progress, now):
            await self._write(progress, now)
            return
        self._buffered = progress

    async def flush(self) -> None:
        if self._buffered is None or self._buffered == self._last_persisted:
            return
        await self._write(self._buffered, self._now())

    async def _write(self, progress: BatchProgress, now: float) -> None:
        await self._persist(progress)
        self._last_persisted = progress
        self._last_persisted_at = now
        self._buffered = None

    def _should_persist(self, progress: BatchProgress, now: float) -> bool:
        if self._last_persisted is None or self._last_persisted_at is None:
            return True
        if progress == self._last_persisted:
            return False
        if progress.phase != self._last_persisted.phase:
            return True
        if progress.phase != "calculate":
            return True

        elapsed_ms = (now - self._last_persisted_at) * 1000
        if elapsed_ms < self._policy.min_interval_ms:
            return False

        current_percent = self._percent(progress)
        previous_percent = self._percent(self._last_persisted)
        if current_percent is None or previous_percent is None:
            return progress.current != self._last_persisted.current
        return (current_percent - previous_percent) >= self._policy.min_percent_delta

    @staticmethod
    def _percent(progress: BatchProgress) -> float | None:
        if progress.total is None or progress.total <= 0:
            return None
        return min(100.0, (progress.current / progress.total) * 100)


def compact_task_error_message(
    error_message: str,
    *,
    max_length: int = MAX_TASK_ERROR_MESSAGE_LENGTH,
) -> str:
    if len(error_message) <= max_length:
        return error_message
    suffix = f"... [truncated, original length: {len(error_message)} chars]"
    return f"{error_message[: max_length - len(suffix)]}{suffix}"


class TaskNotFoundError(Exception):
    pass


class TaskAccessError(Exception):
    pass


class TaskService:
    def __init__(
        self,
        db: AsyncSession,
        *,
        session_factory: async_sessionmaker[AsyncSession] = AsyncSessionLocal,
    ) -> None:
        self.db = db
        self.session_factory = session_factory

    async def create_electrical_batch_task(
        self,
        request: ElectricalBatchJobRequest,
        principal: CurrentPrincipal,
        *,
        queue: TaskQueue | None = None,
        idempotency_key: str | None = None,
    ) -> BackgroundTask:
        await ProjectService(self.db).get_project_basic(request.project_id, principal)
        if request.cable_source != "builtin" and principal.role not in ("employee", "admin"):
            raise TaskAccessError("Расширенный каталог доступен только сотрудникам")
        object_ids = await self._validate_object_ids_belong_to_project(
            request.project_id,
            request.object_ids,
        )

        payload = self._electrical_payload(request, object_ids=object_ids)
        dedupe_key = self._dedupe_key(
            task_type=TASK_ELECTRICAL_BATCH,
            project_id=request.project_id,
            principal=principal,
            payload=payload,
            idempotency_key=idempotency_key,
        )
        existing = await self._find_active_by_dedupe(dedupe_key)
        if existing is not None:
            return existing

        task = BackgroundTask(
            type=TASK_ELECTRICAL_BATCH,
            status="queued",
            project_id=request.project_id,
            user_id=principal.user_id,
            session_id=principal.session_id,
            request_payload=payload,
            progress_current=0,
            progress_total=None,
            progress_phase="queued",
            idempotency_key=dedupe_key,
            cancel_requested=False,
            attempts=0,
            enqueue_attempts=0,
        )
        self.db.add(task)
        try:
            await self.db.commit()
        except IntegrityError:
            await self.db.rollback()
            existing = await self._find_active_by_dedupe(dedupe_key)
            if existing is None:
                raise
            return existing
        await self.db.refresh(task)

        queue = queue or TaskQueue()
        await self.enqueue_existing_task(task, queue=queue)
        return task

    async def create_heat_loss_batch_task(
        self,
        request: HeatLossBatchJobRequest,
        principal: CurrentPrincipal,
        *,
        queue: TaskQueue | None = None,
        idempotency_key: str | None = None,
    ) -> BackgroundTask:
        await ProjectService(self.db).get_project_basic(request.project_id, principal)

        payload = self._heat_loss_payload(request)
        dedupe_key = self._dedupe_key(
            task_type=TASK_HEAT_LOSS_BATCH,
            project_id=request.project_id,
            principal=principal,
            payload=payload,
            idempotency_key=idempotency_key,
        )
        existing = await self._find_active_by_dedupe(dedupe_key)
        if existing is not None:
            return existing

        task = BackgroundTask(
            type=TASK_HEAT_LOSS_BATCH,
            status="queued",
            project_id=request.project_id,
            user_id=principal.user_id,
            session_id=principal.session_id,
            request_payload=payload,
            progress_current=0,
            progress_total=None,
            progress_phase="queued",
            idempotency_key=dedupe_key,
            cancel_requested=False,
            attempts=0,
            enqueue_attempts=0,
        )
        self.db.add(task)
        try:
            await self.db.commit()
        except IntegrityError:
            await self.db.rollback()
            existing = await self._find_active_by_dedupe(dedupe_key)
            if existing is None:
                raise
            return existing
        await self.db.refresh(task)

        queue = queue or TaskQueue()
        await self.enqueue_existing_task(task, queue=queue)
        return task

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
        if task.status in TERMINAL_STATUSES:
            return task
        now = datetime.now(UTC)
        task.cancel_requested = True
        if task.status in ("queued", "enqueued"):
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
        await self.db.commit()
        await self.db.refresh(task)

    async def run_task(self, task_id: UUID, *, worker_id: str) -> None:
        task = await self.db.get(BackgroundTask, task_id)
        if task is None or task.status in TERMINAL_STATUSES:
            return
        if task.cancel_requested:
            await self._mark_cancelled(task_id)
            return
        if task.type not in (TASK_ELECTRICAL_BATCH, TASK_HEAT_LOSS_BATCH):
            await self._mark_failed(task_id, f"Неизвестный тип задачи: {task.type}")
            return

        now = datetime.now(UTC)
        task.status = "running"
        task.attempts += 1
        task.locked_by = worker_id
        task.lock_expires_at = now + timedelta(seconds=settings.WORKER_TASK_STALE_SECONDS)
        task.started_at = task.started_at or now
        task.heartbeat_at = now
        task.progress_phase = "running"
        await self.db.commit()

        if task.type == TASK_HEAT_LOSS_BATCH:
            await self._run_heat_loss_batch(task_id)
        else:
            await self._run_electrical_batch(task_id)

    async def recover_stuck_tasks(
        self,
        *,
        queue: TaskQueue,
        limit: int = 100,
    ) -> int:
        now = datetime.now(UTC)
        recovered = 0
        queued_result = await self.db.execute(
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
        for task in queued_result.scalars().all():
            if task.cancel_requested:
                await self._mark_cancelled(task.id)
                recovered += 1
                continue
            await self.enqueue_existing_task(task, queue=queue)
            recovered += 1

        if recovered >= limit:
            return recovered

        stale_before = now - timedelta(seconds=settings.WORKER_TASK_STALE_SECONDS)
        stale_result = await self.db.execute(
            select(BackgroundTask)
            .where(
                BackgroundTask.status.in_(("enqueued", "running")),
                or_(
                    BackgroundTask.heartbeat_at.is_(None),
                    BackgroundTask.heartbeat_at < stale_before,
                ),
            )
            .order_by(BackgroundTask.created_at)
            .limit(limit - recovered)
        )
        for task in stale_result.scalars().all():
            if task.cancel_requested:
                await self._mark_cancelled(task.id)
                recovered += 1
                continue
            if task.attempts >= settings.WORKER_MAX_ATTEMPTS:
                await self._mark_failed(task.id, "Задача зависла и исчерпала лимит повторов")
                recovered += 1
                continue
            task.status = "queued"
            task.locked_by = None
            task.lock_expires_at = None
            task.progress_phase = "requeued"
            task.next_retry_at = None
            await self.enqueue_existing_task(task, queue=queue)
            recovered += 1
        return recovered

    async def _run_electrical_batch(self, task_id: UUID) -> None:
        task = await self.db.get(BackgroundTask, task_id)
        if task is None:
            return
        payload = dict(task.request_payload or {})
        progress_throttler = ProgressThrottler(
            persist=lambda progress: self._update_progress(task_id, progress)
        )
        try:
            object_ids = [
                UUID(str(object_id)) for object_id in payload.get("object_ids") or []
            ] or None
            async with self.session_factory() as calc_db:
                service = CalculationService(calc_db)
                (
                    calculated,
                    skipped,
                    heat_loss_failed,
                    errors,
                    calcs,
                ) = await service.batch_calc_electrical(
                    UUID(payload["project_id"]),
                    payload.get("cable_source", "builtin"),
                    int(payload.get("variant_number", 1)),
                    payload.get("cable_type", "self_regulating"),
                    payload.get("electrical_params") or {},
                    skip_manual=bool(payload.get("skip_manual", False)),
                    return_calcs=bool(payload.get("include_results", False)),
                    progress_callback=progress_throttler.offer,
                    should_cancel=lambda: self._should_cancel(task_id),
                    object_ids=object_ids,
                )
        except BatchCancelledError:
            await progress_throttler.flush()
            await self._mark_cancelled(task_id)
            return
        except Exception as exc:
            await progress_throttler.flush()
            await self._mark_failed(task_id, f"{type(exc).__name__}: {exc}")
            return

        await progress_throttler.flush()
        include_errors = bool(payload.get("include_errors", True))
        include_results = bool(payload.get("include_results", False))
        result_payload = {
            "calculated": calculated,
            "skipped": skipped,
            "scope": "selected" if payload.get("object_ids") else "all",
            "heat_loss_failed": heat_loss_failed,
            "errors": errors if include_errors else [],
            "results": [
                {
                    "id": str(calc.id),
                    "object_id": str(calc.object_id),
                    "cable_type": calc.cable_type,
                    "cable_mark": calc.cable_mark,
                    "variant_number": calc.variant_number,
                    "results": calc.results,
                }
                for calc in calcs
            ]
            if include_results
            else [],
        }
        await self._mark_succeeded(task_id, result_payload)

    async def _run_heat_loss_batch(self, task_id: UUID) -> None:
        task = await self.db.get(BackgroundTask, task_id)
        if task is None:
            return
        payload = dict(task.request_payload or {})
        progress_throttler = ProgressThrottler(
            persist=lambda progress: self._update_progress(task_id, progress)
        )
        try:
            object_ids = [
                UUID(str(object_id)) for object_id in payload.get("object_ids") or []
            ] or None
            async with self.session_factory() as calc_db:
                updated, failed, errors = await CalculationService(calc_db).batch_recalculate(
                    UUID(payload["project_id"]),
                    progress_callback=progress_throttler.offer,
                    should_cancel=lambda: self._should_cancel(task_id),
                    object_ids=object_ids,
                )
        except BatchCancelledError:
            await progress_throttler.flush()
            await self._mark_cancelled(task_id)
            return
        except Exception as exc:
            await progress_throttler.flush()
            await self._mark_failed(task_id, f"{type(exc).__name__}: {exc}")
            return

        await progress_throttler.flush()
        include_errors = bool(payload.get("include_errors", True))
        result_payload = {
            "updated": updated,
            "failed": failed,
            "errors": errors if include_errors else [],
        }
        await self._mark_succeeded(task_id, result_payload)

    async def _update_progress(self, task_id: UUID, progress: BatchProgress) -> None:
        async with self.session_factory() as db:
            task = await db.get(BackgroundTask, task_id)
            if task is None or task.status in TERMINAL_STATUSES:
                return
            now = datetime.now(UTC)
            task.progress_current = progress.current
            task.progress_total = progress.total
            task.progress_phase = progress.phase
            task.heartbeat_at = now
            task.lock_expires_at = now + timedelta(seconds=settings.WORKER_TASK_STALE_SECONDS)
            await db.commit()

    async def _should_cancel(self, task_id: UUID) -> bool:
        async with self.session_factory() as db:
            row = (
                await db.execute(
                    select(BackgroundTask.cancel_requested, BackgroundTask.status).where(
                        BackgroundTask.id == task_id
                    )
                )
            ).one_or_none()
            if row is None:
                return True
            return bool(row[0]) or row[1] == "cancelled"

    async def _mark_succeeded(self, task_id: UUID, result_payload: dict[str, Any]) -> None:
        task = await self.db.get(BackgroundTask, task_id)
        if task is None:
            return
        await self.db.refresh(task)
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
        await self.db.commit()

    async def _mark_failed(self, task_id: UUID, error_message: str) -> None:
        task = await self.db.get(BackgroundTask, task_id)
        if task is None:
            return
        await self.db.refresh(task)
        now = datetime.now(UTC)
        task.status = "failed"
        task.error_message = compact_task_error_message(error_message)
        task.progress_phase = "failed"
        task.locked_by = None
        task.lock_expires_at = None
        task.heartbeat_at = now
        task.finished_at = now
        await self.db.commit()

    async def _mark_cancelled(self, task_id: UUID) -> None:
        task = await self.db.get(BackgroundTask, task_id)
        if task is None:
            return
        await self.db.refresh(task)
        now = datetime.now(UTC)
        task.status = "cancelled"
        task.cancel_requested = True
        task.progress_phase = "cancelled"
        task.locked_by = None
        task.lock_expires_at = None
        task.heartbeat_at = now
        task.finished_at = now
        await self.db.commit()

    async def _find_active_by_dedupe(self, dedupe_key: str) -> BackgroundTask | None:
        result = await self.db.execute(
            select(BackgroundTask)
            .where(
                BackgroundTask.idempotency_key == dedupe_key,
                BackgroundTask.status.in_(ACTIVE_STATUSES),
            )
            .order_by(BackgroundTask.created_at.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()

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
        found_ids = set(result.scalars().all())
        if len(found_ids) != len(normalized):
            raise ValueError("Все выбранные объекты должны принадлежать проекту")
        return normalized

    @staticmethod
    def _electrical_payload(
        request: ElectricalBatchJobRequest,
        *,
        object_ids: list[UUID] | None,
    ) -> dict[str, Any]:
        payload = {
            "project_id": str(request.project_id),
            "cable_source": request.cable_source,
            "variant_number": request.variant_number,
            "cable_type": request.cable_type,
            "electrical_params": request.electrical_params(),
            "skip_manual": request.skip_manual,
            "include_results": request.include_results,
            "include_errors": request.include_errors,
        }
        if object_ids is not None:
            payload["object_ids"] = [str(object_id) for object_id in object_ids]
        return payload

    @staticmethod
    def _heat_loss_payload(request: HeatLossBatchJobRequest) -> dict[str, Any]:
        payload = {
            "project_id": str(request.project_id),
            "include_errors": request.include_errors,
        }
        if request.object_ids is not None:
            payload["object_ids"] = [str(object_id) for object_id in request.object_ids]
        return payload

    @staticmethod
    def _dedupe_key(
        *,
        task_type: str,
        project_id: UUID,
        principal: CurrentPrincipal,
        payload: dict[str, Any],
        idempotency_key: str | None,
    ) -> str:
        owner = (
            f"session:{principal.session_id}"
            if principal.role == "guest"
            else f"user:{principal.user_id}"
        )
        stable_payload = json.dumps(payload, ensure_ascii=False, sort_keys=True, default=str)
        raw = "|".join(
            [
                task_type,
                str(project_id),
                owner,
                idempotency_key or stable_payload,
            ]
        )
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()

    @staticmethod
    def to_response(task: BackgroundTask) -> CalculationTaskResponse:
        total = task.progress_total
        percent = None
        if total and total > 0:
            percent = min(100.0, round((task.progress_current / total) * 100, 1))
        elif task.status in TERMINAL_STATUSES:
            percent = 100.0
        result = None
        if task.result_payload is not None:
            if task.type == TASK_HEAT_LOSS_BATCH:
                result = BatchCalcResponse(
                    updated=int(task.result_payload.get("updated", 0)),
                    failed=int(task.result_payload.get("failed", 0)),
                    errors=list(task.result_payload.get("errors") or []),
                )
            else:
                result = BatchElectricalResponse(
                    calculated=int(task.result_payload.get("calculated", 0)),
                    skipped=int(task.result_payload.get("skipped", 0)),
                    scope=task.result_payload.get("scope", "all"),
                    heat_loss_failed=int(task.result_payload.get("heat_loss_failed", 0)),
                    errors=list(task.result_payload.get("errors") or []),
                    results=[
                        ElectricalCalcSummary(**item)
                        for item in list(task.result_payload.get("results") or [])
                    ],
                )
        base = f"{settings.API_V1_PREFIX}/calc/jobs/{task.id}"
        return CalculationTaskResponse(
            id=task.id,
            type=task.type,
            status=task.status,
            project_id=task.project_id,
            progress=CalculationTaskProgress(
                current=task.progress_current,
                total=total,
                phase=task.progress_phase,
                percent=percent,
            ),
            result=result,
            error_message=task.error_message,
            cancel_requested=bool(task.cancel_requested),
            created_at=task.created_at,
            started_at=task.started_at,
            finished_at=task.finished_at,
            links=CalculationTaskLinks(
                status=base,
                result=f"{base}/result",
                cancel=f"{base}/cancel",
            ),
        )
