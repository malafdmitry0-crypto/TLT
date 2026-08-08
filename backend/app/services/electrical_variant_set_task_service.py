"""Durable sequential calculation of an explicit ordered electrical ER set."""

from __future__ import annotations

import hashlib
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

from anyio import fail_after
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.core.dependencies import CurrentPrincipal
from app.models.background_task import BackgroundTask
from app.models.electrical_variant import ElectricalVariant
from app.schemas.electrical_variant_set_task import (
    ElectricalVariantSetResult,
    ElectricalVariantSetTaskProgress,
    ElectricalVariantSetTaskResponse,
    ElectricalVariantSetTaskRetryRequest,
    ElectricalVariantSetTaskStartRequest,
)
from app.services.audit_service import AuditService
from app.services.calculation_service import BatchCancelledError, CalculationService
from app.services.project_calculation_guard import (
    ProjectCalculationBusy,
    ProjectCalculationBusyError,
    ProjectCalculationGuard,
)
from app.services.project_service import ProjectService
from app.services.task_queue import TaskQueue

TASK_ELECTRICAL_VARIANT_SET = "electrical_variant_set"


class ElectricalVariantSetTaskNotFoundError(Exception):
    pass


class ElectricalVariantSetTaskConflictError(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message

    def as_detail(self) -> dict[str, str]:
        return {"code": self.code, "message": self.message}


class ElectricalVariantSetTaskService:
    def __init__(
        self,
        db: AsyncSession,
        *,
        session_factory: async_sessionmaker[AsyncSession] = AsyncSessionLocal,
    ) -> None:
        self.db = db
        self.session_factory = session_factory

    async def create(
        self,
        project_id: UUID,
        request: ElectricalVariantSetTaskStartRequest,
        principal: CurrentPrincipal,
        *,
        idempotency_key: str,
        queue: TaskQueue | None = None,
    ) -> BackgroundTask:
        key = idempotency_key.strip()
        if not key or len(key) > 128:
            raise ElectricalVariantSetTaskConflictError(
                "ELECTRICAL_SET_IDEMPOTENCY_KEY_REQUIRED",
                "Idempotency-Key обязателен и не должен превышать 128 символов",
            )
        await ProjectService(self.db).get_project_for_write(
            project_id,
            principal,
            guard_calculation=False,
        )
        ids = request.electrical_variant_ids
        variants = list(
            (
                await self.db.execute(
                    select(ElectricalVariant).where(
                        ElectricalVariant.project_id == project_id,
                        ElectricalVariant.id.in_(ids),
                    )
                )
            ).scalars()
        )
        by_id = {item.id: item for item in variants}
        if any(variant_id not in by_id for variant_id in ids):
            raise ElectricalVariantSetTaskNotFoundError(
                "Один или несколько ЭР не принадлежат проекту"
            )
        if any(by_id[variant_id].legacy_variant_number is None for variant_id in ids):
            raise ElectricalVariantSetTaskConflictError(
                "ELECTRICAL_VARIANT_ADAPTER_UNAVAILABLE",
                "Выбранный ЭР пока нельзя передать расчётному ядру",
            )
        payload = {
            "payload_version": 1,
            "project_id": str(project_id),
            "electrical_variant_ids": [str(item) for item in ids],
        }
        dedupe_key = self._dedupe_key(project_id, principal, key)
        existing = await self._task_for_idempotency_key(dedupe_key)
        if existing is not None:
            self._require_matching_replay(existing, payload)
            return existing
        try:
            await ProjectCalculationGuard(self.db).lock_and_check(project_id)
        except ProjectCalculationBusyError:
            await self.db.rollback()
            existing = await self._task_for_idempotency_key(dedupe_key)
            if existing is not None:
                self._require_matching_replay(existing, payload)
                return existing
            raise
        now = datetime.now(UTC)
        task = BackgroundTask(
            type=TASK_ELECTRICAL_VARIANT_SET,
            status="queued",
            project_id=project_id,
            user_id=principal.user_id,
            session_id=principal.session_id,
            request_payload=payload,
            result_payload={"checkpoints": {"electrical": {}}},
            progress_current=0,
            progress_total=len(ids),
            progress_phase="queued",
            workflow_stage="queued",
            workflow_version=1,
            idempotency_key=dedupe_key,
            queue_deadline_at=now + timedelta(seconds=settings.WORKFLOW_QUEUE_TIMEOUT_SECONDS),
        )
        self.db.add(task)
        try:
            await self.db.commit()
        except IntegrityError as exc:
            await self.db.rollback()
            existing = await self._task_for_idempotency_key(dedupe_key)
            if existing is not None:
                self._require_matching_replay(existing, payload)
                return existing
            active = await ProjectCalculationGuard(self.db).active_task(project_id)
            if active is not None:
                raise ProjectCalculationBusyError(
                    ProjectCalculationBusy(
                        task_id=active.id,
                        task_type=active.type,
                        status=active.status,
                        stage=active.workflow_stage or active.progress_phase,
                    )
                ) from exc
            raise
        await self.db.refresh(task)
        from app.services.task_service import TaskService

        await TaskService(self.db).enqueue_existing_task(task, queue=queue or TaskQueue())
        return task

    async def active_for_project(
        self, project_id: UUID, principal: CurrentPrincipal
    ) -> BackgroundTask | None:
        await ProjectService(self.db).get_project_basic(project_id, principal)
        return await ProjectCalculationGuard(self.db).active_task(project_id)

    async def get(self, task_id: UUID, principal: CurrentPrincipal) -> BackgroundTask:
        from app.services.task_service import TaskService

        task = await TaskService(self.db).get_task_for_principal(task_id, principal)
        if task.type != TASK_ELECTRICAL_VARIANT_SET:
            raise ElectricalVariantSetTaskNotFoundError("Задача пересчёта ЭР не найдена")
        return task

    async def retry(
        self,
        task_id: UUID,
        request: ElectricalVariantSetTaskRetryRequest,
        principal: CurrentPrincipal,
        *,
        queue: TaskQueue | None = None,
    ) -> BackgroundTask:
        task = await self.get(task_id, principal)
        assert task.project_id is not None
        await ProjectService(self.db).get_project_for_write(task.project_id, principal)
        await self.db.refresh(task, with_for_update=True)
        if task.status not in ("failed", "timed_out"):
            raise ElectricalVariantSetTaskConflictError(
                "ELECTRICAL_SET_NOT_RETRYABLE",
                "Повтор доступен только для failed или timed_out задачи",
            )
        if task.workflow_version != request.expected_task_version:
            raise ElectricalVariantSetTaskConflictError(
                "ELECTRICAL_SET_VERSION_CONFLICT",
                "Задача была изменена; обновите состояние",
            )
        ids = (task.request_payload or {}).get("electrical_variant_ids") or []
        now = datetime.now(UTC)
        task.result_payload = {"checkpoints": {"electrical": {}}}
        task.status = "queued"
        task.progress_current = 0
        task.progress_total = len(ids)
        task.progress_phase = "queued"
        task.workflow_stage = "queued"
        task.workflow_version += 1
        task.queue_deadline_at = now + timedelta(seconds=settings.WORKFLOW_QUEUE_TIMEOUT_SECONDS)
        task.execution_deadline_at = None
        task.error_message = None
        task.cancel_requested = False
        task.finished_at = None
        task.locked_by = None
        task.lock_expires_at = None
        await self.db.commit()
        await self.db.refresh(task)
        from app.services.task_service import TaskService

        await TaskService(self.db).enqueue_existing_task(task, queue=queue or TaskQueue())
        return task

    async def run_claimed_task(self, task_id: UUID, *, attempt: int, worker_id: str) -> None:
        task = await self.db.get(BackgroundTask, task_id)
        if task is None or task.type != TASK_ELECTRICAL_VARIANT_SET:
            return
        if (
            task.queue_deadline_at is not None
            and task.started_at is not None
            and task.started_at > task.queue_deadline_at
        ):
            await self._terminal(
                task_id, attempt, worker_id, "timed_out", "Истекло время в очереди"
            )
            return
        try:
            payload = dict(task.request_payload or {})
            project_id = UUID(str(payload["project_id"]))
            variant_ids = [UUID(str(value)) for value in payload["electrical_variant_ids"]]
            for variant_id in variant_ids:
                snapshot = await self._snapshot(task_id)
                completed = dict(
                    ((snapshot.result_payload or {}).get("checkpoints") or {}).get("electrical")
                    or {}
                )
                if str(variant_id) not in completed:
                    await self._run_electrical(
                        task_id, project_id, variant_id, attempt, worker_id
                    )
            await self._succeed(task_id, attempt, worker_id)
        except BatchCancelledError:
            await self._terminal(task_id, attempt, worker_id, "cancelled", None)
        except TimeoutError:
            await self._terminal(
                task_id, attempt, worker_id, "timed_out", "Превышен таймаут пересчёта ЭР"
            )
        except Exception as exc:
            await self._terminal(
                task_id, attempt, worker_id, "failed", f"{type(exc).__name__}: {exc}"
            )

    async def _run_electrical(
        self,
        task_id: UUID,
        project_id: UUID,
        variant_id: UUID,
        attempt: int,
        worker_id: str,
    ) -> None:
        async with self.session_factory() as db:
            variant = await db.scalar(
                select(ElectricalVariant).where(
                    ElectricalVariant.project_id == project_id,
                    ElectricalVariant.id == variant_id,
                )
            )
            if variant is None or variant.legacy_variant_number is None:
                raise ElectricalVariantSetTaskConflictError(
                    "ELECTRICAL_SET_INPUT_CHANGED",
                    "Выбранный ЭР был удалён или потерял расчётный адаптер",
                )
            budget = await self._stage_budget(
                task_id, settings.WORKFLOW_ELECTRICAL_TIMEOUT_SECONDS
            )
            with fail_after(budget):
                calculated, skipped, heat_failed, errors, _ = await CalculationService(
                    db
                ).batch_calc_electrical(
                    project_id,
                    cable_source="builtin",
                    variant_number=variant.legacy_variant_number,
                    cable_type="self_regulating_tt",
                    electrical_params={"selection_policy": "technical_minimum"},
                    skip_manual=True,
                    return_calcs=False,
                    should_cancel=lambda: self._should_cancel(task_id, attempt, worker_id),
                    electrical_variant_id=variant_id,
                    commit=False,
                )
            task = await self._fenced_task(db, task_id, attempt, worker_id)
            result_payload = dict(task.result_payload or {})
            checkpoints = dict(result_payload.get("checkpoints") or {})
            electrical = dict(checkpoints.get("electrical") or {})
            electrical[str(variant_id)] = {
                "calculated": calculated,
                "skipped": skipped,
                "heat_loss_failed": heat_failed,
                "errors": errors,
            }
            checkpoints["electrical"] = electrical
            result_payload["checkpoints"] = checkpoints
            task.result_payload = result_payload
            task.workflow_stage = f"electrical.{variant_id}"
            task.progress_phase = "electrical"
            task.progress_current += 1
            task.heartbeat_at = datetime.now(UTC)
            await db.commit()

    async def _succeed(self, task_id: UUID, attempt: int, worker_id: str) -> None:
        async with self.session_factory() as db:
            task = await self._fenced_task(db, task_id, attempt, worker_id)
            now = datetime.now(UTC)
            task.status = "succeeded"
            task.workflow_stage = "done"
            task.progress_phase = "done"
            task.error_message = None
            task.finished_at = now
            task.heartbeat_at = now
            task.locked_by = None
            task.lock_expires_at = None
            await self._record_terminal_audit(db, task, "succeeded")
            await db.commit()

    async def _terminal(
        self,
        task_id: UUID,
        attempt: int,
        worker_id: str,
        status: str,
        message: str | None,
    ) -> None:
        async with self.session_factory() as db:
            try:
                task = await self._fenced_task(db, task_id, attempt, worker_id)
            except BatchCancelledError:
                return
            now = datetime.now(UTC)
            task.status = status
            task.workflow_stage = status
            task.progress_phase = status
            task.error_message = message
            task.finished_at = now
            task.heartbeat_at = now
            task.locked_by = None
            task.lock_expires_at = None
            await self._record_terminal_audit(db, task, status)
            await db.commit()

    @staticmethod
    async def _record_terminal_audit(
        db: AsyncSession,
        task: BackgroundTask,
        status: str,
    ) -> None:
        requested = [
            str(value)
            for value in (task.request_payload or {}).get("electrical_variant_ids") or []
        ]
        checkpoints = dict(
            ((task.result_payload or {}).get("checkpoints") or {}).get("electrical") or {}
        )
        completed = [variant_id for variant_id in requested if variant_id in checkpoints]
        failed = (
            requested[len(completed) : len(completed) + 1]
            if status in {"failed", "timed_out"}
            else []
        )
        await AuditService(db).record(
            event_type=f"task.{TASK_ELECTRICAL_VARIANT_SET}.{status}",
            category="task",
            source="worker",
            result=(
                "success"
                if status == "succeeded"
                else "cancelled"
                if status == "cancelled"
                else "failure"
            ),
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
                "requested_electrical_variant_ids": requested,
                "completed_electrical_variant_ids": completed,
                "failed_electrical_variant_ids": failed,
                "per_variant": checkpoints,
            },
            message=task.error_message,
        )

    async def _fenced_task(
        self, db: AsyncSession, task_id: UUID, attempt: int, worker_id: str
    ) -> BackgroundTask:
        task = (
            await db.execute(
                select(BackgroundTask)
                .where(
                    BackgroundTask.id == task_id,
                    BackgroundTask.status == "running",
                    BackgroundTask.attempts == attempt,
                    BackgroundTask.locked_by == worker_id,
                    BackgroundTask.cancel_requested.is_(False),
                )
                .with_for_update()
                .execution_options(populate_existing=True)
            )
        ).scalar_one_or_none()
        if task is None:
            raise BatchCancelledError("Electrical ER-set task lost its fencing token")
        return task

    async def _should_cancel(self, task_id: UUID, attempt: int, worker_id: str) -> bool:
        async with self.session_factory() as db:
            task = await db.get(BackgroundTask, task_id)
            return bool(
                task is None
                or task.cancel_requested
                or task.status != "running"
                or task.attempts != attempt
                or task.locked_by != worker_id
            )

    async def _snapshot(self, task_id: UUID) -> BackgroundTask:
        async with self.session_factory() as db:
            task = await db.get(BackgroundTask, task_id)
            if task is None:
                raise ElectricalVariantSetTaskNotFoundError("Задача пересчёта ЭР не найдена")
            return task

    async def _stage_budget(self, task_id: UUID, configured_seconds: int) -> float:
        task = await self._snapshot(task_id)
        configured = float(max(1, configured_seconds))
        if task.execution_deadline_at is None:
            return configured
        remaining = (task.execution_deadline_at - datetime.now(UTC)).total_seconds()
        if remaining <= 0:
            raise TimeoutError("Истёк общий таймаут пересчёта ЭР")
        return max(0.001, min(configured, remaining))

    async def _task_for_idempotency_key(self, key: str) -> BackgroundTask | None:
        return (
            await self.db.execute(
                select(BackgroundTask)
                .where(BackgroundTask.idempotency_key == key)
                .order_by(BackgroundTask.created_at.desc())
                .limit(1)
            )
        ).scalar_one_or_none()

    @staticmethod
    def _require_matching_replay(task: BackgroundTask, payload: dict[str, Any]) -> None:
        if task.type != TASK_ELECTRICAL_VARIANT_SET or task.request_payload != payload:
            raise ElectricalVariantSetTaskConflictError(
                "ELECTRICAL_SET_IDEMPOTENCY_KEY_REUSED",
                "Idempotency-Key уже связан с другим scope",
            )

    @staticmethod
    def _dedupe_key(
        project_id: UUID, principal: CurrentPrincipal, idempotency_key: str
    ) -> str:
        owner = (
            f"session:{principal.session_id}"
            if principal.role == "guest"
            else f"user:{principal.user_id}"
        )
        raw = f"{TASK_ELECTRICAL_VARIANT_SET}|{project_id}|{owner}|{idempotency_key}"
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()

    @staticmethod
    def to_response(task: BackgroundTask) -> ElectricalVariantSetTaskResponse:
        payload = dict(task.request_payload or {})
        ids = [UUID(str(value)) for value in payload.get("electrical_variant_ids") or []]
        checkpoints = dict(
            ((task.result_payload or {}).get("checkpoints") or {}).get("electrical") or {}
        )
        completed = [variant_id for variant_id in ids if str(variant_id) in checkpoints]
        failed = ids[len(completed) : len(completed) + 1] if task.status == "failed" else []
        total = task.progress_total
        percent = min(100.0, round(task.progress_current / total * 100, 1)) if total else None
        base = f"/api/v1/electrical-variant-set-tasks/{task.id}"
        return ElectricalVariantSetTaskResponse(
            id=task.id,
            project_id=task.project_id,
            status=task.status,
            stage=task.workflow_stage or task.progress_phase or task.status,
            task_version=task.workflow_version,
            electrical_variant_ids=ids,
            progress=ElectricalVariantSetTaskProgress(
                current=task.progress_current, total=total, percent=percent
            ),
            queue_deadline_at=task.queue_deadline_at,
            execution_deadline_at=task.execution_deadline_at,
            result=ElectricalVariantSetResult(
                requested_electrical_variant_ids=ids,
                completed_electrical_variant_ids=completed,
                failed_electrical_variant_ids=failed,
                per_variant=checkpoints,
            ),
            error_message=task.error_message,
            cancel_requested=task.cancel_requested,
            created_at=task.created_at,
            started_at=task.started_at,
            finished_at=task.finished_at,
            status_url=base,
            cancel_url=f"{base}/cancel",
            retry_url=f"{base}/retry",
        )
