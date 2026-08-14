"""Durable task service for asynchronous calculations."""

from __future__ import annotations

import hashlib
import json
import logging
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from time import monotonic
from typing import Any, Literal
from uuid import UUID

from sqlalchemy import func, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.core.dependencies import CurrentPrincipal
from app.models.background_task import BackgroundTask
from app.models.electrical_variant import ElectricalVariant
from app.models.project import Project
from app.models.project_object import ProjectObject
from app.schemas.calculation import (
    BatchElectricalResponse,
    CalculationTaskLinks,
    CalculationTaskProgress,
    CalculationTaskResponse,
    ElectricalBatchJobRequest,
    ElectricalCalcSummary,
    ElectricalObjectBatchOverride,
)
from app.schemas.heat_loss import BatchCalcResponse, HeatLossBatchJobRequest
from app.schemas.report import ReportExportJobRequest, ReportExportTaskResult
from app.services.audit_service import AuditService
from app.services.calculation_service import BatchCancelledError, BatchProgress, CalculationService
from app.services.electrical_assignment_service import (
    ElectricalAssignmentService,
    ElectricalAssignmentServiceError,
)
from app.services.electrical_variant_service import ElectricalVariantService
from app.services.project_service import (
    ProjectAccessError,
    ProjectNotFoundError,
    ProjectService,
)
from app.services.report_artifact_service import delete_report_artifact, write_report_artifact
from app.services.report_service import ReportService
from app.services.task_queue import TaskQueue

logger = logging.getLogger("heatcalc.worker")

TASK_ELECTRICAL_BATCH = "electrical_batch"
TASK_HEAT_LOSS_BATCH = "heat_loss_batch"
TASK_REPORT_EXPORT = "report_export"
ACTIVE_STATUSES = ("queued", "enqueued", "running", "waiting_input")
TERMINAL_STATUSES = ("succeeded", "failed", "cancelled", "timed_out")
MAX_TASK_ERROR_MESSAGE_LENGTH = 4_000
MAX_AUDIT_MESSAGE_LENGTH = 1_000
ELECTRICAL_VARIANT_NOT_FOUND = "ELECTRICAL_VARIANT_NOT_FOUND"
ELECTRICAL_VARIANT_LEGACY_ADAPTER_UNAVAILABLE = "ELECTRICAL_VARIANT_LEGACY_ADAPTER_UNAVAILABLE"
TASK_IDEMPOTENCY_KEY_REUSED = "TASK_IDEMPOTENCY_KEY_REUSED"
_IDEMPOTENCY_REPLAY_ATTR = "_idempotency_replay"
WorkerFailureAction = Literal["ack", "retry", "dead_letter"]


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


class TaskLimitError(Exception):
    pass


class TaskIdempotencyConflictError(Exception):
    """An explicit key was already bound to a different operation payload."""

    code = TASK_IDEMPOTENCY_KEY_REUSED
    message = "Idempotency-Key уже использован для другой операции"

    def __init__(self) -> None:
        super().__init__(self.message)

    def as_detail(self) -> dict[str, str]:
        return {"code": self.code, "message": self.message}


class TaskService:
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
        """Tell API callers whether create returned an existing task binding."""
        return bool(getattr(task, _IDEMPOTENCY_REPLAY_ATTR, False))

    @staticmethod
    def audit_result_for_task(
        task: BackgroundTask,
    ) -> Literal["success", "failure", "queued", "cancelled"]:
        """Map durable task state to the constrained audit result vocabulary."""
        if task.status in ACTIVE_STATUSES:
            return "queued"
        if task.status == "succeeded":
            return "success"
        if task.status == "failed":
            return "failure"
        if task.status == "timed_out":
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
        setattr(task, _IDEMPOTENCY_REPLAY_ATTR, replay)
        return task

    async def _require_project_write(
        self,
        project_id: UUID,
        principal: CurrentPrincipal,
        *,
        calculation_owner_task_id: UUID | None = None,
    ) -> None:
        try:
            project_service = ProjectService(self.db)
            if calculation_owner_task_id is None:
                await project_service.get_project_for_write(project_id, principal)
            else:
                await project_service.get_project_for_write(
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
        *,
        electrical_variant_id: UUID | None,
        legacy_variant_number: int | None,
        db: AsyncSession | None = None,
    ) -> ElectricalVariant:
        """Resolve one ER inside its project and expose only the legacy bridge."""
        if electrical_variant_id is not None and legacy_variant_number is not None:
            raise ValueError("ELECTRICAL_VARIANT_SELECTOR_CONFLICT")
        stmt = select(ElectricalVariant).where(ElectricalVariant.project_id == project_id)
        if electrical_variant_id is not None:
            stmt = stmt.where(ElectricalVariant.id == electrical_variant_id)
        elif legacy_variant_number is not None:
            stmt = stmt.where(ElectricalVariant.legacy_variant_number == legacy_variant_number)
        else:
            raise ValueError("electrical_variant_id or deprecated variant_number is required")

        result = await (db or self.db).execute(stmt)
        variant = result.scalar_one_or_none()
        if variant is None:
            # Unknown and cross-project UUIDs intentionally have the same result.
            raise TaskNotFoundError(ELECTRICAL_VARIANT_NOT_FOUND)
        if variant.legacy_variant_number is None:
            raise ValueError(ELECTRICAL_VARIANT_LEGACY_ADAPTER_UNAVAILABLE)
        return variant

    async def _lock_project_for_electrical_task(self, project_id: UUID) -> None:
        """Serialize enqueue with ER lifecycle mutations on the project row."""
        result = await self.db.execute(
            select(Project)
            .where(Project.id == project_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        if result.scalar_one_or_none() is None:
            raise TaskNotFoundError(f"Проект {project_id} не найден")

    async def _prepare_legacy_variant_for_enqueue(
        self,
        project_id: UUID,
        principal: CurrentPrincipal,
        legacy_variant_number: int,
    ) -> ElectricalVariant:
        return await ElectricalVariantService(self.db).prepare_legacy_variant_for_write(
            project_id,
            principal,
            legacy_variant_number,
        )

    async def has_active_tasks_for_electrical_variant(
        self,
        project_id: UUID,
        electrical_variant_id: UUID,
    ) -> bool:
        """Lifecycle hook: only active tasks block deletion of an ER."""
        result = await self.db.execute(
            select(func.count(BackgroundTask.id)).where(
                BackgroundTask.project_id == project_id,
                BackgroundTask.electrical_variant_id == electrical_variant_id,
                BackgroundTask.status.in_(ACTIVE_STATUSES),
            )
        )
        return int(result.scalar_one()) > 0

    async def create_electrical_batch_task(
        self,
        request: ElectricalBatchJobRequest,
        principal: CurrentPrincipal,
        *,
        queue: TaskQueue | None = None,
        idempotency_key: str | None = None,
    ) -> BackgroundTask:
        # Serialize explicit idempotency binding lookup with task creation.
        # Without the common project lock two equal requests can both miss the
        # binding; the second then sees the first task as a foreign calculation
        # and incorrectly returns 423 instead of replaying the same task.
        await ProjectService(self.db).get_project_for_write(
            request.project_id,
            principal,
            guard_calculation=False,
        )
        await self._lock_project_for_electrical_task(request.project_id)
        existing_binding = await self._explicit_idempotency_binding(
            TASK_ELECTRICAL_BATCH,
            request.project_id,
            principal,
            idempotency_key,
        )
        await self._require_project_write(
            request.project_id,
            principal,
            calculation_owner_task_id=(existing_binding.id if existing_binding else None),
        )
        if request.cable_source in ("extended", "all") and principal.role not in (
            "employee",
            "admin",
        ):
            raise TaskAccessError("Расширенный каталог доступен только сотрудникам")
        # Lifecycle delete takes the same project lock before checking active
        # tasks. Keep it until the queued task row is committed below.
        request_values = request.model_dump()
        legacy_variant_number = request_values["variant_number"]
        if request.electrical_variant_id is None:
            if legacy_variant_number is None:
                raise ValueError("ELECTRICAL_VARIANT_SELECTOR_REQUIRED")
            if existing_binding is not None and existing_binding.electrical_variant_id is not None:
                variant = await self._resolve_electrical_variant(
                    request.project_id,
                    electrical_variant_id=existing_binding.electrical_variant_id,
                    legacy_variant_number=None,
                )
                if variant.legacy_variant_number != legacy_variant_number:
                    raise TaskIdempotencyConflictError
            else:
                variant = await self._prepare_legacy_variant_for_enqueue(
                    request.project_id,
                    principal,
                    legacy_variant_number,
                )
        else:
            await self._lock_project_for_electrical_task(request.project_id)
            variant = await self._resolve_electrical_variant(
                request.project_id,
                electrical_variant_id=request.electrical_variant_id,
                legacy_variant_number=None,
            )
        # The legacy adapter may have committed while creating its ER.  Retake
        # the common lifecycle lock and keep it through task INSERT.
        await self._lock_project_for_electrical_task(request.project_id)
        object_ids = await self._validate_object_ids_belong_to_project(
            request.project_id,
            request.object_ids,
        )
        object_overrides = await self._validate_electrical_object_overrides(
            request.project_id,
            request.object_overrides,
            object_ids=object_ids,
        )
        assignment_service = ElectricalAssignmentService(self.db)
        if object_ids is None:
            object_ids = await assignment_service.assignment_object_ids_for_system(
                request.project_id,
                variant.id,
                request.cable_type,
                lock_project=False,
            )
            if not object_ids:
                raise ElectricalAssignmentServiceError(
                    "ELECTRICAL_ASSIGNMENT_REQUIRED",
                    "В выбранном ЭР нет объектов для указанной системы",
                    status_code=409,
                    details={"electrical_variant_id": str(variant.id)},
                )
        override_ids = {
            UUID(str(item["object_id"])) for item in object_overrides or []
        }
        outside_scope = sorted(override_ids.difference(object_ids), key=str)
        if outside_scope:
            raise ElectricalAssignmentServiceError(
                "ELECTRICAL_ASSIGNMENT_SCOPE_MISMATCH",
                "Переопределения должны входить в назначенный scope выбранного ЭР",
                status_code=409,
                details={
                    "electrical_variant_id": str(variant.id),
                    "object_ids": [str(object_id) for object_id in outside_scope],
                },
            )
        override_by_id = {
            UUID(str(item["object_id"])): str(item["cable_type"])
            for item in object_overrides or []
        }
        calculation_service = CalculationService(self.db)
        existing_scope = await calculation_service._load_existing_electrical_by_object_id(
            request.project_id,
            variant_number=variant.legacy_variant_number or 1,
            object_ids=object_ids,
            electrical_variant_id=variant.id,
        )
        requested_types: dict[UUID, str] = {}
        for object_id in object_ids:
            existing = existing_scope.get(object_id)
            requested_types[object_id] = str(
                request.cable_type
                if request.force_cable_type
                else override_by_id.get(object_id)
                or (existing.cable_type if existing is not None else request.cable_type)
            )
        await assignment_service.validate_supported_assignment_objects(
            request.project_id,
            variant.id,
            requested_types,
            lock_project=False,
        )

        payload = self._electrical_payload(
            request,
            electrical_variant_id=variant.id,
            object_ids=object_ids,
            object_overrides=object_overrides,
        )
        dedupe_key = self._dedupe_key(
            task_type=TASK_ELECTRICAL_BATCH,
            project_id=request.project_id,
            principal=principal,
            payload=payload,
            idempotency_key=idempotency_key,
        )
        explicit_idempotency = bool(idempotency_key)
        existing = await self._find_active_by_dedupe(
            dedupe_key,
            include_terminal=explicit_idempotency,
        )
        if existing is not None:
            self._require_matching_idempotency_binding(
                existing,
                explicit_idempotency=explicit_idempotency,
                task_type=TASK_ELECTRICAL_BATCH,
                project_id=request.project_id,
                electrical_variant_id=variant.id,
                payload=payload,
            )
            await self.db.commit()
            return self._mark_idempotency_replay(existing, replay=True)
        await self._enforce_active_task_limits(request.project_id, principal)

        task = BackgroundTask(
            type=TASK_ELECTRICAL_BATCH,
            status="queued",
            project_id=request.project_id,
            electrical_variant_id=variant.id,
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
            existing = await self._find_active_by_dedupe(
                dedupe_key,
                include_terminal=explicit_idempotency,
            )
            if existing is None:
                raise
            self._require_matching_idempotency_binding(
                existing,
                explicit_idempotency=explicit_idempotency,
                task_type=TASK_ELECTRICAL_BATCH,
                project_id=request.project_id,
                electrical_variant_id=variant.id,
                payload=payload,
            )
            return self._mark_idempotency_replay(existing, replay=True)
        await self.db.refresh(task)

        queue = queue or TaskQueue()
        await self.enqueue_existing_task(task, queue=queue)
        return self._mark_idempotency_replay(task, replay=False)

    async def create_heat_loss_batch_task(
        self,
        request: HeatLossBatchJobRequest,
        principal: CurrentPrincipal,
        *,
        queue: TaskQueue | None = None,
        idempotency_key: str | None = None,
    ) -> BackgroundTask:
        existing_binding = await self._explicit_idempotency_binding(
            TASK_HEAT_LOSS_BATCH,
            request.project_id,
            principal,
            idempotency_key,
        )
        await self._require_project_write(
            request.project_id,
            principal,
            calculation_owner_task_id=(existing_binding.id if existing_binding else None),
        )
        # Keep the dedupe lookup and insert in one project-scoped critical
        # section. Otherwise an explicit-key retry can observe no active
        # binding after the first request turns terminal and create a duplicate.
        await self._lock_project_for_electrical_task(request.project_id)

        payload = self._heat_loss_payload(request)
        dedupe_key = self._dedupe_key(
            task_type=TASK_HEAT_LOSS_BATCH,
            project_id=request.project_id,
            principal=principal,
            payload=payload,
            idempotency_key=idempotency_key,
        )
        explicit_idempotency = bool(idempotency_key)
        existing = await self._find_active_by_dedupe(
            dedupe_key,
            include_terminal=explicit_idempotency,
        )
        if existing is not None:
            self._require_matching_idempotency_binding(
                existing,
                explicit_idempotency=explicit_idempotency,
                task_type=TASK_HEAT_LOSS_BATCH,
                project_id=request.project_id,
                electrical_variant_id=None,
                payload=payload,
            )
            await self.db.commit()
            return self._mark_idempotency_replay(existing, replay=True)
        await self._enforce_active_task_limits(request.project_id, principal)

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
            existing = await self._find_active_by_dedupe(
                dedupe_key,
                include_terminal=explicit_idempotency,
            )
            if existing is None:
                raise
            self._require_matching_idempotency_binding(
                existing,
                explicit_idempotency=explicit_idempotency,
                task_type=TASK_HEAT_LOSS_BATCH,
                project_id=request.project_id,
                electrical_variant_id=None,
                payload=payload,
            )
            return self._mark_idempotency_replay(existing, replay=True)
        await self.db.refresh(task)

        queue = queue or TaskQueue()
        await self.enqueue_existing_task(task, queue=queue)
        return self._mark_idempotency_replay(task, replay=False)

    async def create_report_export_task(
        self,
        request: ReportExportJobRequest,
        principal: CurrentPrincipal,
        *,
        queue: TaskQueue | None = None,
        idempotency_key: str | None = None,
    ) -> BackgroundTask:
        if principal.role not in ("employee", "admin"):
            raise TaskAccessError("Экспорт отчёта доступен только сотрудникам")
        await self._require_project_write(request.project_id, principal)

        request_values = request.model_dump()
        legacy_variant_number = request_values["variant_number"]
        if request.electrical_variant_id is None:
            if legacy_variant_number is None:
                raise ValueError("ELECTRICAL_VARIANT_SELECTOR_REQUIRED")
            variant = await self._prepare_legacy_variant_for_enqueue(
                request.project_id,
                principal,
                legacy_variant_number,
            )
        else:
            await self._lock_project_for_electrical_task(request.project_id)
            variant = await self._resolve_electrical_variant(
                request.project_id,
                electrical_variant_id=request.electrical_variant_id,
                legacy_variant_number=None,
            )

        payload = self._report_export_payload(
            request,
            electrical_variant_id=variant.id,
        )
        dedupe_key = self._dedupe_key(
            task_type=TASK_REPORT_EXPORT,
            project_id=request.project_id,
            principal=principal,
            payload=payload,
            idempotency_key=idempotency_key,
        )
        explicit_idempotency = bool(idempotency_key)
        existing = await self._find_active_by_dedupe(
            dedupe_key,
            include_terminal=explicit_idempotency,
        )
        if existing is not None:
            self._require_matching_idempotency_binding(
                existing,
                explicit_idempotency=explicit_idempotency,
                task_type=TASK_REPORT_EXPORT,
                project_id=request.project_id,
                electrical_variant_id=variant.id,
                payload=payload,
            )
            await self.db.commit()
            return self._mark_idempotency_replay(existing, replay=True)
        await self._enforce_active_task_limits(request.project_id, principal)

        task = BackgroundTask(
            type=TASK_REPORT_EXPORT,
            status="queued",
            project_id=request.project_id,
            electrical_variant_id=variant.id,
            user_id=principal.user_id,
            session_id=principal.session_id,
            request_payload=payload,
            progress_current=0,
            progress_total=3,
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
            existing = await self._find_active_by_dedupe(
                dedupe_key,
                include_terminal=explicit_idempotency,
            )
            if existing is None:
                raise
            self._require_matching_idempotency_binding(
                existing,
                explicit_idempotency=explicit_idempotency,
                task_type=TASK_REPORT_EXPORT,
                project_id=request.project_id,
                electrical_variant_id=variant.id,
                payload=payload,
            )
            return self._mark_idempotency_replay(existing, replay=True)
        await self.db.refresh(task)

        queue = queue or TaskQueue()
        await self.enqueue_existing_task(task, queue=queue)
        return self._mark_idempotency_replay(task, replay=False)

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

    async def run_task(self, task_id: UUID, *, worker_id: str) -> None:
        task = await self._claim_task_for_run(task_id, worker_id=worker_id)
        if task is None:
            current = await self.db.get(BackgroundTask, task_id)
            if (
                current is not None
                and current.cancel_requested
                and current.status not in TERMINAL_STATUSES
            ):
                await self._mark_cancelled(task_id)
            return
        if task.type not in (
            TASK_ELECTRICAL_BATCH,
            TASK_HEAT_LOSS_BATCH,
            TASK_REPORT_EXPORT,
        ):
            await self._mark_failed(
                task_id,
                f"Неизвестный тип задачи: {task.type}",
                attempt=task.attempts,
                worker_id=worker_id,
            )
            return

        if task.type == TASK_HEAT_LOSS_BATCH:
            await self._run_heat_loss_batch(task_id, attempt=task.attempts, worker_id=worker_id)
        elif task.type == TASK_ELECTRICAL_BATCH:
            await self._run_electrical_batch(task_id, attempt=task.attempts, worker_id=worker_id)
        else:
            await self._run_report_export(task_id, attempt=task.attempts, worker_id=worker_id)

    async def record_worker_exception(
        self,
        task_id: UUID,
        *,
        worker_id: str,
        error_message: str,
    ) -> WorkerFailureAction:
        """Persist worker-level crashes that escape normal task execution.

        Formula/calculation errors are handled inside the task runners and end
        in a terminal DB state. This covers infrastructure or runtime failures
        that would otherwise leave the Redis Stream entry in PEL forever.
        """
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
            # Keep the task non-terminal until its DLQ entry is durable. The
            # worker retries only the DLQ transfer, never the calculation.
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
        await self._mark_failed(
            task_id,
            task.error_message or "Задача исчерпала лимит повторов",
        )

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

        waiting_result = await self.db.execute(
            select(BackgroundTask).where(
                BackgroundTask.status == "waiting_input",
                BackgroundTask.interaction_deadline_at.is_not(None),
                BackgroundTask.interaction_deadline_at <= now,
            )
        )
        expired_waiting = list(waiting_result.scalars().all())
        for task in expired_waiting:
            task.status = "timed_out"
            task.progress_phase = "timed_out"
            task.error_message = "Истекло время ожидания ответа пользователя"
            task.finished_at = now
            task.interaction_deadline_at = None
            task.locked_by = None
            task.lock_expires_at = None
            recovered += 1
        if expired_waiting:
            await self.db.commit()

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
            if task.progress_phase == "dead_letter_pending":
                await queue.dead_letter(
                    task.arq_job_id or "postgres-recovery",
                    {"task_id": str(task.id), "type": task.type},
                    reason="worker_attempts_exhausted",
                )
                await self.finalize_dead_letter(task.id)
                recovered += 1
                continue
            if (
                task.status == "running"
                and task.locked_by
                and await queue.is_worker_ready(task.locked_by)
            ):
                # A separate heartbeat thread proves the owning process is
                # alive even when its asyncio loop is busy. Requeueing here
                # would allow two attempts to mutate the same calculation.
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
        if task.type not in (
            TASK_ELECTRICAL_BATCH,
            TASK_HEAT_LOSS_BATCH,
            TASK_REPORT_EXPORT,
        ):
            raise ValueError(f"Неизвестный тип задачи: {task.type}")
        if task.status in ACTIVE_STATUSES:
            raise TaskLimitError("Задача уже находится в очереди или выполняется")

        if task.type in (TASK_ELECTRICAL_BATCH, TASK_REPORT_EXPORT):
            await self._validate_and_upgrade_replayed_electrical_task(task)

        now = datetime.now(UTC)
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
        task.heartbeat_at = now
        await self.db.commit()
        await self.db.refresh(task)

        await self.enqueue_existing_task(task, queue=queue)
        removed = False
        if task.last_enqueue_error is None:
            removed = await queue.delete_dead_letter(stream_id) > 0
        return task, removed

    async def _validate_and_upgrade_replayed_electrical_task(
        self,
        task: BackgroundTask,
    ) -> None:
        """Serialize replay with deletion and normalize representable v2 payloads."""
        if task.project_id is None or task.electrical_variant_id is None:
            raise ValueError("ELECTRICAL_VARIANT_REPLAY_SCOPE_MISSING")

        await self._lock_project_for_electrical_task(task.project_id)
        await self.db.refresh(task)
        if task.status in ACTIVE_STATUSES:
            raise TaskLimitError("Задача уже находится в очереди или выполняется")

        payload = dict(task.request_payload or {})
        try:
            payload_project_id = UUID(str(payload["project_id"]))
        except (KeyError, TypeError, ValueError) as exc:
            raise ValueError("ELECTRICAL_VARIANT_TASK_SCOPE_MISMATCH") from exc
        if payload_project_id != task.project_id:
            raise ValueError("ELECTRICAL_VARIANT_TASK_SCOPE_MISMATCH")

        variant = await self._resolve_electrical_variant(
            task.project_id,
            electrical_variant_id=task.electrical_variant_id,
            legacy_variant_number=None,
        )
        raw_version = payload.get("payload_version")
        if raw_version is None or raw_version == 2:
            raw_variant_number = payload.get(
                "variant_number",
                1 if task.type == TASK_ELECTRICAL_BATCH else None,
            )
            try:
                legacy_variant_number = int(raw_variant_number)
            except (TypeError, ValueError) as exc:
                raise ValueError("ELECTRICAL_VARIANT_TASK_SCOPE_MISMATCH") from exc
            if variant.legacy_variant_number != legacy_variant_number:
                raise ValueError("ELECTRICAL_VARIANT_TASK_SCOPE_MISMATCH")
        elif raw_version == 3:
            try:
                payload_variant_id = UUID(str(payload["electrical_variant_id"]))
            except (KeyError, TypeError, ValueError) as exc:
                raise ValueError("ELECTRICAL_VARIANT_TASK_SCOPE_MISMATCH") from exc
            if payload_variant_id != task.electrical_variant_id:
                raise ValueError("ELECTRICAL_VARIANT_TASK_SCOPE_MISMATCH")
        else:
            raise ValueError(f"UNSUPPORTED_TASK_PAYLOAD_VERSION: {raw_version}")

        payload["payload_version"] = 3
        payload["project_id"] = str(task.project_id)
        payload["electrical_variant_id"] = str(task.electrical_variant_id)
        payload.pop("variant_number", None)
        task.request_payload = payload

    async def _run_electrical_batch(
        self,
        task_id: UUID,
        *,
        attempt: int,
        worker_id: str,
    ) -> None:
        task = await self.db.get(BackgroundTask, task_id)
        if task is None:
            return
        payload = dict(task.request_payload or {})
        progress_throttler = ProgressThrottler(
            persist=lambda progress: self._update_progress(
                task_id,
                progress,
                attempt=attempt,
                worker_id=worker_id,
            )
        )
        try:
            object_ids = [
                UUID(str(object_id)) for object_id in payload.get("object_ids") or []
            ] or None
            object_overrides = [
                {
                    "object_id": UUID(str(item["object_id"])),
                    "cable_type": item.get("cable_type"),
                }
                for item in payload.get("object_overrides") or []
            ]
            async with self.session_factory() as calc_db:
                (
                    variant_number,
                    electrical_variant_id,
                ) = await self._resolve_worker_electrical_variant(
                    task,
                    payload,
                    db=calc_db,
                    default_legacy_variant_number=1,
                )
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
                    variant_number,
                    payload.get("cable_type", "self_regulating_tt"),
                    payload.get("electrical_params") or {},
                    skip_manual=bool(payload.get("skip_manual", True)),
                    return_calcs=bool(payload.get("include_results", False)),
                    progress_callback=progress_throttler.offer,
                    should_cancel=lambda: self._should_cancel(
                        task_id,
                        attempt=attempt,
                        worker_id=worker_id,
                    ),
                    object_ids=object_ids,
                    object_overrides=object_overrides,
                    force_cable_type=bool(payload.get("force_cable_type", False)),
                    electrical_variant_id=electrical_variant_id,
                )
        except BatchCancelledError:
            await progress_throttler.flush()
            await self._mark_cancelled(task_id, attempt=attempt, worker_id=worker_id)
            return
        except Exception as exc:
            await progress_throttler.flush()
            await self._mark_failed(
                task_id,
                f"{type(exc).__name__}: {exc}",
                attempt=attempt,
                worker_id=worker_id,
            )
            return

        await progress_throttler.flush()
        include_errors = bool(payload.get("include_errors", True))
        include_results = bool(payload.get("include_results", False))
        requested_scope = str(
            payload.get("requested_scope")
            or ("selected" if payload.get("object_ids") else "all")
        )
        result_payload = {
            "electrical_variant_id": (
                str(electrical_variant_id) if electrical_variant_id is not None else None
            ),
            "variant_number": variant_number,
            "calculated": calculated,
            "skipped": skipped,
            "requested_scope": requested_scope,
            "scope": requested_scope,
            "heat_loss_failed": heat_loss_failed,
            "errors": errors if include_errors else [],
            "results": [
                {
                    "id": str(calc.id),
                    "object_id": str(calc.object_id),
                    "cable_type": calc.cable_type,
                    "cable_type_source": calc.cable_type_source,
                    "cable_mark": calc.cable_mark,
                    "cable_mark_source": calc.cable_mark_source,
                    "cable_snapshot": calc.cable_snapshot,
                    "variant_number": calc.variant_number,
                    "results": calc.results,
                }
                for calc in calcs
            ]
            if include_results
            else [],
        }
        await self._mark_succeeded(
            task_id,
            result_payload,
            attempt=attempt,
            worker_id=worker_id,
        )

    async def _run_heat_loss_batch(
        self,
        task_id: UUID,
        *,
        attempt: int,
        worker_id: str,
    ) -> None:
        task = await self.db.get(BackgroundTask, task_id)
        if task is None:
            return
        payload = dict(task.request_payload or {})
        progress_throttler = ProgressThrottler(
            persist=lambda progress: self._update_progress(
                task_id,
                progress,
                attempt=attempt,
                worker_id=worker_id,
            )
        )
        try:
            object_ids = [
                UUID(str(object_id)) for object_id in payload.get("object_ids") or []
            ] or None
            async with self.session_factory() as calc_db:
                updated, failed, errors = await CalculationService(calc_db).batch_recalculate(
                    UUID(payload["project_id"]),
                    progress_callback=progress_throttler.offer,
                    should_cancel=lambda: self._should_cancel(
                        task_id,
                        attempt=attempt,
                        worker_id=worker_id,
                    ),
                    object_ids=object_ids,
                )
        except BatchCancelledError:
            await progress_throttler.flush()
            await self._mark_cancelled(task_id, attempt=attempt, worker_id=worker_id)
            return
        except Exception as exc:
            await progress_throttler.flush()
            await self._mark_failed(
                task_id,
                f"{type(exc).__name__}: {exc}",
                attempt=attempt,
                worker_id=worker_id,
            )
            return

        await progress_throttler.flush()
        include_errors = bool(payload.get("include_errors", True))
        result_payload = {
            "updated": updated,
            "failed": failed,
            "errors": errors if include_errors else [],
        }
        await self._mark_succeeded(
            task_id,
            result_payload,
            attempt=attempt,
            worker_id=worker_id,
        )

    async def _run_report_export(
        self,
        task_id: UUID,
        *,
        attempt: int,
        worker_id: str,
    ) -> None:
        task = await self.db.get(BackgroundTask, task_id)
        if task is None:
            return
        payload = dict(task.request_payload or {})
        try:
            project_id = UUID(payload["project_id"])
            fmt = payload["format"]
            sections = payload.get("sections")
            await self._update_progress(
                task_id,
                BatchProgress(current=1, total=3, phase="load"),
                attempt=attempt,
                worker_id=worker_id,
            )
            if await self._should_cancel(task_id, attempt=attempt, worker_id=worker_id):
                await self._mark_cancelled(task_id, attempt=attempt, worker_id=worker_id)
                return
            async with self.session_factory() as report_db:
                (
                    variant_number,
                    electrical_variant_id,
                ) = await self._resolve_worker_electrical_variant(
                    task,
                    payload,
                    db=report_db,
                    default_legacy_variant_number=None,
                )
                data = await ReportService(report_db).export_trusted(
                    project_id,
                    fmt,
                    sections,
                    variant_number=variant_number,
                )
            await self._update_progress(
                task_id,
                BatchProgress(current=2, total=3, phase="write"),
                attempt=attempt,
                worker_id=worker_id,
            )
            if await self._should_cancel(task_id, attempt=attempt, worker_id=worker_id):
                await self._mark_cancelled(task_id, attempt=attempt, worker_id=worker_id)
                return
            artifact = write_report_artifact(task_id, fmt, data, attempt=attempt)
        except BatchCancelledError:
            await self._mark_cancelled(task_id, attempt=attempt, worker_id=worker_id)
            return
        except Exception as exc:
            await self._mark_failed(
                task_id,
                f"{type(exc).__name__}: {exc}",
                attempt=attempt,
                worker_id=worker_id,
            )
            return

        filename = f"report.{fmt}"
        result_payload = {
            "project_id": str(project_id),
            "format": fmt,
            "electrical_variant_id": (
                str(electrical_variant_id) if electrical_variant_id is not None else None
            ),
            "variant_number": variant_number,
            "filename": filename,
            "media_type": _REPORT_MEDIA_TYPES[fmt],
            "download_url": f"{settings.API_V1_PREFIX}/reports/jobs/{task_id}/download",
            **artifact,
        }
        published = await self._mark_succeeded(
            task_id,
            result_payload,
            attempt=attempt,
            worker_id=worker_id,
        )
        if not published:
            delete_report_artifact(str(artifact["artifact_name"]))

    async def _resolve_worker_electrical_variant(
        self,
        task: BackgroundTask,
        payload: dict[str, Any],
        *,
        db: AsyncSession,
        default_legacy_variant_number: int | None,
    ) -> tuple[int, UUID | None]:
        """Resolve v3 UUID payloads; keep no-version/v2 task replay compatible."""
        raw_version = payload.get("payload_version")
        if raw_version is None or raw_version == 2:
            raw_variant_number = payload.get(
                "variant_number",
                default_legacy_variant_number,
            )
            if raw_variant_number is None:
                raise ValueError("deprecated variant_number is required for v2 task payload")
            return int(raw_variant_number), task.electrical_variant_id
        if raw_version != 3:
            raise ValueError(f"UNSUPPORTED_TASK_PAYLOAD_VERSION: {raw_version}")

        try:
            project_id = UUID(str(payload["project_id"]))
            electrical_variant_id = UUID(str(payload["electrical_variant_id"]))
        except (KeyError, TypeError, ValueError) as exc:
            raise ValueError("INVALID_ELECTRICAL_VARIANT_V3_PAYLOAD") from exc
        if task.project_id != project_id or task.electrical_variant_id != electrical_variant_id:
            raise ValueError("ELECTRICAL_VARIANT_TASK_SCOPE_MISMATCH")

        variant = await self._resolve_electrical_variant(
            project_id,
            electrical_variant_id=electrical_variant_id,
            legacy_variant_number=None,
            db=db,
        )
        # The legacy implementation still requires the bridge number. The UUID
        # is re-resolved on every worker run and any numeric v3 key is ignored.
        assert variant.legacy_variant_number is not None
        return variant.legacy_variant_number, variant.id

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
                        lock_expires_at=now
                        + timedelta(seconds=settings.WORKER_TASK_STALE_SECONDS),
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
            if row is None:
                return True
            return bool(row[0]) or row[1] == "cancelled"

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
            task_id,
            attempt=attempt,
            worker_id=worker_id,
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
            task_id,
            attempt=attempt,
            worker_id=worker_id,
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
        audit_message = compact_task_error_message(
            task.error_message,
            max_length=MAX_AUDIT_MESSAGE_LENGTH,
        )
        await self._record_task_audit(
            task,
            "failed",
            error_code="task_failed",
            message=audit_message,
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
            task_id,
            attempt=attempt,
            worker_id=worker_id,
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
        actor_type = "user" if task.user_id is not None else "guest"
        actor_id = str(task.user_id or task.session_id or "")
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
            actor_type=actor_type,
            actor_id=actor_id,
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
        summary_keys = (
            "updated",
            "failed",
            "calculated",
            "skipped",
            "heat_loss_failed",
            "format",
            "electrical_variant_id",
            "variant_number",
            "requested_scope",
            "scope",
        )
        summary = {key: result_payload[key] for key in summary_keys if key in result_payload}
        if isinstance(result_payload.get("errors"), list):
            summary["errors_count"] = len(result_payload["errors"])
        if isinstance(result_payload.get("results"), list):
            summary["results_count"] = len(result_payload["results"])
        if "artifact_name" in result_payload:
            summary["artifact_name"] = result_payload["artifact_name"]
        return summary

    async def _find_active_by_dedupe(
        self,
        dedupe_key: str,
        *,
        include_terminal: bool = False,
    ) -> BackgroundTask | None:
        stmt = select(BackgroundTask).where(BackgroundTask.idempotency_key == dedupe_key)
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
        # Authenticate without taking the calculation gate first: an exact
        # replay must be allowed to address the task that already owns it.
        await ProjectService(self.db).get_project_for_write(
            project_id,
            principal,
            guard_calculation=False,
        )
        dedupe_key = self._dedupe_key(
            task_type=task_type,
            project_id=project_id,
            principal=principal,
            payload={},
            idempotency_key=idempotency_key,
        )
        return await self._find_active_by_dedupe(dedupe_key, include_terminal=True)

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
        if not explicit_idempotency:
            return
        if (
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
        global_limit = settings.MAX_ACTIVE_TASKS_GLOBAL
        if global_limit > 0 and await self._active_global_task_count() >= global_limit:
            raise TaskLimitError("Очередь задач перегружена. Повторите позже.")

        project_limit = settings.MAX_ACTIVE_TASKS_PER_PROJECT
        if project_limit > 0:
            project_count = await self._active_project_task_count(project_id)
            if project_count >= project_limit:
                raise TaskLimitError(
                    "Превышен лимит активных задач для проекта. Дождитесь завершения "
                    "или отмените одну из задач."
                )

        principal_limit = settings.MAX_ACTIVE_TASKS_PER_PRINCIPAL
        if principal_limit > 0:
            principal_count = await self._active_principal_task_count(principal)
            if principal_count >= principal_limit:
                raise TaskLimitError(
                    "Превышен лимит активных задач для пользователя. Дождитесь "
                    "завершения или отмените одну из задач."
                )

    async def _active_global_task_count(self) -> int:
        result = await self.db.execute(
            select(func.count(BackgroundTask.id)).where(
                BackgroundTask.status.in_(ACTIVE_STATUSES),
            )
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
            BackgroundTask.status.in_(ACTIVE_STATUSES),
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
        found_ids = set(result.scalars().all())
        if len(found_ids) != len(normalized):
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
        normalized: dict[UUID, ElectricalObjectBatchOverride] = {}
        for item in object_overrides:
            normalized[item.object_id] = item
        if not normalized:
            return None

        override_ids = list(normalized)
        if object_ids is not None and not set(override_ids).issubset(set(object_ids)):
            raise ValueError("Переопределения должны относиться только к выбранным объектам")

        result = await self.db.execute(
            select(ProjectObject.id).where(
                ProjectObject.project_id == project_id,
                ProjectObject.id.in_(override_ids),
            )
        )
        found_ids = set(result.scalars().all())
        if len(found_ids) != len(override_ids):
            raise ValueError("Все переопределения должны принадлежать объектам проекта")

        return [
            {
                "object_id": str(item.object_id),
                "cable_type": item.cable_type,
            }
            for item in normalized.values()
            if item.cable_type is not None
        ] or None

    @staticmethod
    def _electrical_payload(
        request: ElectricalBatchJobRequest,
        *,
        electrical_variant_id: UUID,
        object_ids: list[UUID] | None,
        object_overrides: list[dict[str, str]] | None,
    ) -> dict[str, Any]:
        payload = {
            "payload_version": 3,
            "project_id": str(request.project_id),
            "electrical_variant_id": str(electrical_variant_id),
            "cable_source": request.cable_source,
            "cable_type": request.cable_type,
            "force_cable_type": request.force_cable_type,
            "electrical_params": request.electrical_params(),
            "skip_manual": request.skip_manual,
            "include_results": request.include_results,
            "include_errors": request.include_errors,
            # `object_ids` is materialized for worker stability. Keep the
            # caller's all-vs-selected intent as a separate product contract.
            "requested_scope": "all" if request.object_ids is None else "selected",
        }
        if object_ids is not None:
            payload["object_ids"] = [str(object_id) for object_id in object_ids]
        if object_overrides is not None:
            payload["object_overrides"] = object_overrides
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
    def _report_export_payload(
        request: ReportExportJobRequest,
        *,
        electrical_variant_id: UUID,
    ) -> dict[str, Any]:
        payload = {
            "payload_version": 3,
            "project_id": str(request.project_id),
            "electrical_variant_id": str(electrical_variant_id),
            "format": request.format,
        }
        if request.sections is not None:
            payload["sections"] = request.sections
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
        # An explicit key is scoped by task type + project + principal. The
        # payload stays out of this group hash deliberately: a changed ER or
        # payload must find the original binding and produce a stable 409.
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
            elif task.type == TASK_ELECTRICAL_BATCH:
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
            elif task.type == TASK_REPORT_EXPORT:
                result = ReportExportTaskResult(
                    project_id=UUID(str(task.result_payload["project_id"])),
                    format=task.result_payload["format"],
                    electrical_variant_id=(
                        UUID(str(task.result_payload["electrical_variant_id"]))
                        if task.result_payload.get("electrical_variant_id") is not None
                        else task.electrical_variant_id
                    ),
                    variant_number=int(task.result_payload["variant_number"]),
                    filename=task.result_payload["filename"],
                    media_type=task.result_payload["media_type"],
                    size_bytes=int(task.result_payload.get("size_bytes", 0)),
                    download_url=task.result_payload["download_url"],
                )
        if task.type == TASK_REPORT_EXPORT:
            base = f"{settings.API_V1_PREFIX}/reports/jobs/{task.id}"
            result_url = f"{base}/download"
        else:
            base = f"{settings.API_V1_PREFIX}/calc/jobs/{task.id}"
            result_url = f"{base}/result"
        return CalculationTaskResponse(
            id=task.id,
            type=task.type,
            status=task.status,
            project_id=task.project_id,
            electrical_variant_id=task.electrical_variant_id,
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
                result=result_url,
                cancel=f"{base}/cancel",
            ),
        )


_REPORT_MEDIA_TYPES = {
    "pdf": "application/pdf",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}
