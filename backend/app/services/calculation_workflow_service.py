"""Durable saga for heat -> electrical -> specification generation."""

from __future__ import annotations

import hashlib
from datetime import UTC, datetime, timedelta
from typing import Any, cast
from uuid import UUID

from anyio import fail_after
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.core.dependencies import CurrentPrincipal, Role
from app.models.background_task import BackgroundTask
from app.models.electrical_variant import ElectricalVariant
from app.models.project import Project
from app.models.user import User
from app.schemas.calculation_workflow import (
    CalculationWorkflowProgress,
    CalculationWorkflowResponse,
    CalculationWorkflowResumeRequest,
    CalculationWorkflowRetryRequest,
    CalculationWorkflowStartRequest,
)
from app.schemas.specification import (
    SpecificationGenerationRequest,
    SpecificationGenerationResponse,
    SpecificationPreflightStatus,
    SpecificationVariantPreflightResult,
)
from app.services.calculation_service import BatchCancelledError, CalculationService
from app.services.project_calculation_guard import (
    CALCULATION_TASK_TYPES,
    ProjectCalculationBusy,
    ProjectCalculationBusyError,
    ProjectCalculationGuard,
)
from app.services.project_service import ProjectService
from app.services.specification_generation_service import SpecificationGenerationService
from app.services.specification_preflight_service import SpecificationPreflightService
from app.services.task_queue import TaskQueue

TASK_PROJECT_PIPELINE = "project_pipeline"


class CalculationWorkflowNotFoundError(Exception):
    pass


class CalculationWorkflowConflictError(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message

    def as_detail(self) -> dict[str, str]:
        return {"code": self.code, "message": self.message}


class CalculationWorkflowService:
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
        request: CalculationWorkflowStartRequest,
        principal: CurrentPrincipal,
        *,
        idempotency_key: str,
        queue: TaskQueue | None = None,
    ) -> BackgroundTask:
        normalized_key = idempotency_key.strip()
        if not normalized_key or len(normalized_key) > 128:
            raise CalculationWorkflowConflictError(
                "WORKFLOW_IDEMPOTENCY_KEY_REQUIRED",
                "Idempotency-Key обязателен и не должен превышать 128 символов",
            )
        # Authenticate first without rejecting an idempotent replay of the
        # workflow that currently owns the project lock.
        await ProjectService(self.db).get_project_for_write(
            project_id,
            principal,
            guard_calculation=False,
        )
        variants = list(
            (
                await self.db.execute(
                    select(ElectricalVariant).where(
                        ElectricalVariant.project_id == project_id,
                        ElectricalVariant.id.in_(request.variant_ids),
                    )
                )
            ).scalars()
        )
        if {item.id for item in variants} != set(request.variant_ids):
            raise CalculationWorkflowNotFoundError(
                "Один или несколько вариантов ЭР не принадлежат проекту"
            )
        if any(item.legacy_variant_number is None for item in variants):
            raise CalculationWorkflowConflictError(
                "ELECTRICAL_VARIANT_LEGACY_ADAPTER_UNAVAILABLE",
                "Выбранный ЭР пока нельзя передать расчётному ядру",
            )

        payload = {
            "payload_version": 1,
            "project_id": str(project_id),
            "variant_ids": [str(item) for item in request.variant_ids],
            "options": request.options.model_dump(mode="json", by_alias=True),
            "exclude_unassigned_confirmed": False,
            "catalog_selections": {},
            "principal_role": principal.role,
        }
        dedupe_key = self._dedupe_key(project_id, principal, normalized_key)
        existing = (
            await self.db.execute(
                select(BackgroundTask)
                .where(BackgroundTask.idempotency_key == dedupe_key)
                .order_by(BackgroundTask.created_at.desc())
                .limit(1)
            )
        ).scalar_one_or_none()
        if existing is not None:
            if existing.type != TASK_PROJECT_PIPELINE or existing.request_payload != payload:
                raise CalculationWorkflowConflictError(
                    "WORKFLOW_IDEMPOTENCY_KEY_REUSED",
                    "Idempotency-Key уже связан с другим workflow",
                )
            return existing

        await ProjectCalculationGuard(self.db).lock_and_check(project_id)

        now = datetime.now(UTC)
        task = BackgroundTask(
            type=TASK_PROJECT_PIPELINE,
            status="queued",
            project_id=project_id,
            user_id=principal.user_id,
            session_id=principal.session_id,
            request_payload=payload,
            result_payload={"checkpoints": {"electrical": {}}},
            progress_current=0,
            progress_total=2 + len(request.variant_ids),
            progress_phase="queued",
            workflow_stage="queued",
            workflow_version=1,
            idempotency_key=dedupe_key,
            queue_deadline_at=now
            + timedelta(seconds=settings.WORKFLOW_QUEUE_TIMEOUT_SECONDS),
        )
        self.db.add(task)
        try:
            await self.db.commit()
        except IntegrityError as exc:
            await self.db.rollback()
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
        self,
        project_id: UUID,
        principal: CurrentPrincipal,
    ) -> BackgroundTask | None:
        await ProjectService(self.db).get_project_basic(project_id, principal)
        await self._expire_waiting_for_project(project_id)
        return await ProjectCalculationGuard(self.db).active_task(project_id)

    async def get(self, task_id: UUID, principal: CurrentPrincipal) -> BackgroundTask:
        from app.services.task_service import TaskService

        task = await TaskService(self.db).get_task_for_principal(task_id, principal)
        if task.type not in CALCULATION_TASK_TYPES:
            raise CalculationWorkflowNotFoundError("Расчётная операция не найдена")
        await self._expire_waiting(task)
        return task

    async def resume(
        self,
        task_id: UUID,
        request: CalculationWorkflowResumeRequest,
        principal: CurrentPrincipal,
        *,
        idempotency_key: str,
        queue: TaskQueue | None = None,
    ) -> BackgroundTask:
        task = await self.get(task_id, principal)
        if task.type != TASK_PROJECT_PIPELINE:
            raise CalculationWorkflowNotFoundError("Workflow не найден")
        assert task.project_id is not None
        await ProjectService(self.db).get_project_for_write(
            task.project_id,
            principal,
            calculation_owner_task_id=task.id,
        )
        await self.db.refresh(task, with_for_update=True)
        normalized_key = idempotency_key.strip()
        if not normalized_key:
            raise CalculationWorkflowConflictError(
                "WORKFLOW_IDEMPOTENCY_KEY_REQUIRED",
                "Idempotency-Key обязателен",
            )
        request_fingerprint = hashlib.sha256(
            request.model_dump_json().encode("utf-8")
        ).hexdigest()
        current_payload = dict(task.request_payload or {})
        if current_payload.get("last_resume_idempotency_key") == normalized_key:
            if current_payload.get("last_resume_request_fingerprint") != request_fingerprint:
                raise CalculationWorkflowConflictError(
                    "WORKFLOW_IDEMPOTENCY_KEY_REUSED",
                    "Idempotency-Key уже связан с другим ответом workflow",
                )
            return task
        if task.status != "waiting_input":
            raise CalculationWorkflowConflictError(
                "WORKFLOW_NOT_WAITING_INPUT",
                "Workflow не ожидает пользовательский ответ",
            )
        self._require_version(task, request.expected_workflow_version)
        if task.interaction_deadline_at is None or task.interaction_deadline_at <= datetime.now(UTC):
            await self._set_terminal_locked(task, "timed_out", "Истекло время ожидания ответа")
            raise CalculationWorkflowConflictError(
                "WORKFLOW_INTERACTION_TIMEOUT",
                "Истекло время ожидания ответа; запустите workflow повторно",
            )
        payload = current_payload
        payload["exclude_unassigned_confirmed"] = request.exclude_unassigned_confirmed
        payload["catalog_selections"] = {
            key: str(value) for key, value in request.catalog_selections.items()
        }
        payload["last_resume_idempotency_key"] = normalized_key
        payload["last_resume_request_fingerprint"] = request_fingerprint
        task.request_payload = payload
        task.status = "queued"
        task.progress_phase = "queued"
        task.workflow_stage = "specification_preflight"
        task.workflow_version += 1
        task.interaction_deadline_at = None
        task.locked_by = None
        task.lock_expires_at = None
        task.error_message = None
        task.finished_at = None
        await self.db.commit()
        await self.db.refresh(task)
        from app.services.task_service import TaskService

        await TaskService(self.db).enqueue_existing_task(task, queue=queue or TaskQueue())
        return task

    async def retry(
        self,
        task_id: UUID,
        request: CalculationWorkflowRetryRequest,
        principal: CurrentPrincipal,
        *,
        queue: TaskQueue | None = None,
    ) -> BackgroundTask:
        task = await self.get(task_id, principal)
        if task.type != TASK_PROJECT_PIPELINE:
            raise CalculationWorkflowNotFoundError("Workflow не найден")
        assert task.project_id is not None
        await ProjectService(self.db).get_project_for_write(task.project_id, principal)
        await self.db.refresh(task, with_for_update=True)
        if task.status not in ("failed", "timed_out"):
            raise CalculationWorkflowConflictError(
                "WORKFLOW_NOT_RETRYABLE",
                "Повтор доступен только для failed или timed_out workflow",
            )
        self._require_version(task, request.expected_workflow_version)
        now = datetime.now(UTC)
        # A terminal workflow releases the project. Recompute from heat after
        # reacquiring it; retaining old domain rows is safe, skipping them is not.
        task.result_payload = {"checkpoints": {"electrical": {}}}
        task.status = "queued"
        task.progress_current = 0
        task.progress_phase = "queued"
        task.workflow_stage = "queued"
        task.workflow_version += 1
        task.queue_deadline_at = now + timedelta(seconds=settings.WORKFLOW_QUEUE_TIMEOUT_SECONDS)
        task.execution_deadline_at = None
        task.interaction_deadline_at = None
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
        if task is None or task.type != TASK_PROJECT_PIPELINE:
            return
        if (
            task.queue_deadline_at is not None
            and task.started_at is not None
            and task.started_at > task.queue_deadline_at
        ):
            await self._terminal(
                task_id,
                attempt,
                worker_id,
                "timed_out",
                "Истекло время в очереди",
            )
            return
        try:
            principal = await self._principal_for_task(task)
            payload = dict(task.request_payload or {})
            project_id = UUID(str(payload["project_id"]))
            variant_ids = [UUID(str(value)) for value in payload["variant_ids"]]
            checkpoints = dict((task.result_payload or {}).get("checkpoints") or {})

            if "heat" not in checkpoints:
                await self._run_heat(task_id, project_id, attempt, worker_id)
            for variant_id in variant_ids:
                refreshed = await self._task_snapshot(task_id)
                electrical = dict(
                    ((refreshed.result_payload or {}).get("checkpoints") or {}).get(
                        "electrical"
                    )
                    or {}
                )
                if str(variant_id) not in electrical:
                    await self._run_electrical(
                        task_id,
                        project_id,
                        variant_id,
                        attempt,
                        worker_id,
                    )

            await self._run_specification(
                task_id,
                project_id,
                variant_ids,
                principal,
                attempt,
                worker_id,
            )
        except BatchCancelledError:
            await self._terminal(task_id, attempt, worker_id, "cancelled", None)
        except TimeoutError:
            await self._terminal(
                task_id,
                attempt,
                worker_id,
                "timed_out",
                "Превышен таймаут стадии workflow",
            )
        except Exception as exc:
            await self._terminal(
                task_id,
                attempt,
                worker_id,
                "failed",
                f"{type(exc).__name__}: {exc}",
            )

    async def _run_heat(
        self,
        task_id: UUID,
        project_id: UUID,
        attempt: int,
        worker_id: str,
    ) -> None:
        async with self.session_factory() as db:
            budget = await self._stage_budget(
                task_id,
                settings.WORKFLOW_HEAT_TIMEOUT_SECONDS,
            )
            with fail_after(budget):
                updated, failed, errors = await CalculationService(db).batch_recalculate(
                    project_id,
                    should_cancel=lambda: self._should_cancel(task_id, attempt, worker_id),
                    commit=False,
                )
            await self._checkpoint_in_transaction(
                db,
                task_id,
                attempt,
                worker_id,
                stage="electrical",
                checkpoint_key="heat",
                value={"updated": updated, "failed": failed, "errors": errors},
                progress_increment=1,
            )
            await db.commit()

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
                raise CalculationWorkflowConflictError(
                    "WORKFLOW_INPUT_CHANGED",
                    "Выбранный ЭР был удалён или потерял расчётный адаптер",
                )
            budget = await self._stage_budget(
                task_id,
                settings.WORKFLOW_ELECTRICAL_TIMEOUT_SECONDS,
            )
            with fail_after(budget):
                calculated, skipped, heat_failed, errors, _ = (
                    await CalculationService(db).batch_calc_electrical(
                        project_id,
                        cable_source="builtin",
                        variant_number=variant.legacy_variant_number,
                        cable_type="self_regulating_tt",
                        skip_manual=True,
                        return_calcs=False,
                        should_cancel=lambda: self._should_cancel(task_id, attempt, worker_id),
                        electrical_variant_id=variant_id,
                        commit=False,
                    )
                )
            await self._checkpoint_in_transaction(
                db,
                task_id,
                attempt,
                worker_id,
                stage="electrical",
                checkpoint_key=f"electrical.{variant_id}",
                value={
                    "calculated": calculated,
                    "skipped": skipped,
                    "heat_loss_failed": heat_failed,
                    "errors": errors,
                },
                progress_increment=1,
            )
            await db.commit()

    async def _run_specification(
        self,
        task_id: UUID,
        project_id: UUID,
        variant_ids: list[UUID],
        principal: CurrentPrincipal,
        attempt: int,
        worker_id: str,
    ) -> None:
        task = await self._task_snapshot(task_id)
        payload = dict(task.request_payload or {})
        request = SpecificationGenerationRequest(
            variant_ids=variant_ids,
            options=payload.get("options") or {},
            exclude_unassigned_confirmed=bool(payload.get("exclude_unassigned_confirmed")),
            catalog_selections=payload.get("catalog_selections") or {},
        )
        async with self.session_factory() as db:
            preflight_budget = await self._stage_budget(
                task_id,
                settings.WORKFLOW_SPECIFICATION_TIMEOUT_SECONDS * len(variant_ids),
            )
            with fail_after(preflight_budget):
                preflight = await SpecificationPreflightService(db).preflight_variants(
                    project_id,
                    principal,
                    request,
                )
        statuses = {item.status for item in preflight}
        if SpecificationPreflightStatus.BLOCKED in statuses:
            await self._terminal(
                task_id,
                attempt,
                worker_id,
                "failed",
                "Specification preflight blocked",
                waiting_results=preflight,
            )
            return
        if statuses.intersection(
            {
                SpecificationPreflightStatus.CONFIRMATION_REQUIRED,
                SpecificationPreflightStatus.SELECTION_REQUIRED,
            }
        ):
            await self._waiting_input(task_id, attempt, worker_id, preflight)
            return

        async with self.session_factory() as db:
            generation_budget = await self._stage_budget(
                task_id,
                settings.WORKFLOW_SPECIFICATION_TIMEOUT_SECONDS * len(variant_ids),
            )
            with fail_after(generation_budget):
                generated = await SpecificationGenerationService(db).generate(
                    project_id,
                    principal,
                    request,
                    commit=False,
                )
            generated_variant_ids = {item.electrical_variant_id for item in generated.results}
            if generated_variant_ids != set(variant_ids) or any(
                item.status.value != "generated" for item in generated.results
            ):
                raise CalculationWorkflowConflictError(
                    "WORKFLOW_GENERATION_NOT_FINAL",
                    "Формирование спецификации вернуло незавершённый результат",
                )
            locked = await self._fenced_task(db, task_id, attempt, worker_id)
            result_payload = dict(locked.result_payload or {})
            checkpoints = dict(result_payload.get("checkpoints") or {})
            checkpoints["specification"] = generated.model_dump(mode="json")
            result_payload["checkpoints"] = checkpoints
            result_payload["generation"] = generated.model_dump(mode="json")
            now = datetime.now(UTC)
            locked.result_payload = result_payload
            locked.status = "succeeded"
            locked.workflow_stage = "done"
            locked.progress_phase = "done"
            locked.progress_current = locked.progress_total or locked.progress_current
            locked.error_message = None
            locked.locked_by = None
            locked.lock_expires_at = None
            locked.heartbeat_at = now
            locked.finished_at = now
            await db.commit()

    async def _checkpoint_in_transaction(
        self,
        db: AsyncSession,
        task_id: UUID,
        attempt: int,
        worker_id: str,
        *,
        stage: str,
        checkpoint_key: str,
        value: dict[str, Any],
        progress_increment: int,
    ) -> None:
        task = await self._fenced_task(db, task_id, attempt, worker_id)
        result_payload = dict(task.result_payload or {})
        checkpoints = dict(result_payload.get("checkpoints") or {})
        if checkpoint_key.startswith("electrical."):
            electrical = dict(checkpoints.get("electrical") or {})
            electrical[checkpoint_key.split(".", 1)[1]] = value
            checkpoints["electrical"] = electrical
        else:
            checkpoints[checkpoint_key] = value
        result_payload["checkpoints"] = checkpoints
        task.result_payload = result_payload
        task.workflow_stage = stage
        task.progress_phase = stage
        task.progress_current += progress_increment
        task.heartbeat_at = datetime.now(UTC)

    async def _waiting_input(
        self,
        task_id: UUID,
        attempt: int,
        worker_id: str,
        preflight: list[SpecificationVariantPreflightResult],
    ) -> None:
        snapshot = await self._task_snapshot(task_id)
        if snapshot.project_id is None:
            raise CalculationWorkflowNotFoundError("Workflow не связан с проектом")
        async with self.session_factory() as db:
            await db.execute(
                select(Project.id)
                .where(Project.id == snapshot.project_id)
                .with_for_update()
            )
            task = await self._fenced_task(db, task_id, attempt, worker_id)
            result_payload = dict(task.result_payload or {})
            result_payload["waiting_results"] = [item.model_dump(mode="json") for item in preflight]
            now = datetime.now(UTC)
            task.result_payload = result_payload
            task.status = "waiting_input"
            task.workflow_stage = "waiting_input"
            task.progress_phase = "waiting_input"
            task.workflow_version += 1
            task.interaction_deadline_at = now + timedelta(
                seconds=settings.WORKFLOW_INTERACTION_TIMEOUT_SECONDS
            )
            task.locked_by = None
            task.lock_expires_at = None
            task.heartbeat_at = now
            await db.commit()

    async def _terminal(
        self,
        task_id: UUID,
        attempt: int,
        worker_id: str,
        status: str,
        message: str | None,
        *,
        waiting_results: list[SpecificationVariantPreflightResult] | None = None,
    ) -> None:
        async with self.session_factory() as db:
            snapshot = await db.get(BackgroundTask, task_id)
            if snapshot is None or snapshot.project_id is None:
                return
            await db.execute(
                select(Project.id).where(Project.id == snapshot.project_id).with_for_update()
            )
            task = await self._fenced_task(db, task_id, attempt, worker_id)
            result_payload = dict(task.result_payload or {})
            if waiting_results is not None:
                result_payload["waiting_results"] = [
                    item.model_dump(mode="json") for item in waiting_results
                ]
            now = datetime.now(UTC)
            task.result_payload = result_payload
            task.status = status
            task.workflow_stage = status
            task.progress_phase = status
            task.error_message = message
            task.finished_at = now
            task.heartbeat_at = now
            task.locked_by = None
            task.lock_expires_at = None
            task.interaction_deadline_at = None
            await db.commit()

    async def _set_terminal_locked(
        self,
        task: BackgroundTask,
        status: str,
        message: str,
    ) -> None:
        now = datetime.now(UTC)
        task.status = status
        task.workflow_stage = status
        task.progress_phase = status
        task.error_message = message
        task.finished_at = now
        task.interaction_deadline_at = None
        task.locked_by = None
        task.lock_expires_at = None
        await self.db.commit()

    async def _fenced_task(
        self,
        db: AsyncSession,
        task_id: UUID,
        attempt: int,
        worker_id: str,
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
            raise BatchCancelledError("Workflow attempt lost its fencing token")
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

    async def _task_snapshot(self, task_id: UUID) -> BackgroundTask:
        async with self.session_factory() as db:
            task = await db.get(BackgroundTask, task_id)
            if task is None:
                raise CalculationWorkflowNotFoundError("Workflow не найден")
            return task

    async def _stage_budget(self, task_id: UUID, configured_seconds: int) -> float:
        task = await self._task_snapshot(task_id)
        configured = float(max(1, configured_seconds))
        if task.execution_deadline_at is None:
            return configured
        remaining = (task.execution_deadline_at - datetime.now(UTC)).total_seconds()
        if remaining <= 0:
            raise TimeoutError("Истёк общий таймаут workflow")
        return max(0.001, min(configured, remaining))

    async def _principal_for_task(self, task: BackgroundTask) -> CurrentPrincipal:
        role = str((task.request_payload or {}).get("principal_role") or "guest")
        if task.user_id is not None:
            user = await self.db.get(User, task.user_id)
            if user is None or not user.is_active:
                raise CalculationWorkflowConflictError(
                    "WORKFLOW_PRINCIPAL_UNAVAILABLE",
                    "Пользователь workflow недоступен",
                )
            return CurrentPrincipal(
                role=cast(Role, user.role),
                user_id=user.id,
                email=user.email,
            )
        if task.session_id is None or role != "guest":
            raise CalculationWorkflowConflictError(
                "WORKFLOW_PRINCIPAL_UNAVAILABLE",
                "Гостевая сессия workflow недоступна",
            )
        return CurrentPrincipal(role="guest", session_id=task.session_id)

    async def _expire_waiting_for_project(self, project_id: UUID) -> None:
        task = await ProjectCalculationGuard(self.db).active_task(project_id)
        if task is not None:
            await self._expire_waiting(task)

    async def _expire_waiting(self, task: BackgroundTask) -> None:
        if (
            task.status == "waiting_input"
            and task.interaction_deadline_at is not None
            and task.interaction_deadline_at <= datetime.now(UTC)
        ):
            await self._set_terminal_locked(
                task,
                "timed_out",
                "Истекло время ожидания ответа пользователя",
            )

    @staticmethod
    def _require_version(task: BackgroundTask, expected: int) -> None:
        if task.workflow_version != expected:
            raise CalculationWorkflowConflictError(
                "WORKFLOW_VERSION_CONFLICT",
                "Workflow был изменён; обновите состояние",
            )

    @staticmethod
    def _dedupe_key(
        project_id: UUID,
        principal: CurrentPrincipal,
        idempotency_key: str,
    ) -> str:
        owner = (
            f"session:{principal.session_id}"
            if principal.role == "guest"
            else f"user:{principal.user_id}"
        )
        raw = f"{TASK_PROJECT_PIPELINE}|{project_id}|{owner}|{idempotency_key}"
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()

    @staticmethod
    def to_response(task: BackgroundTask) -> CalculationWorkflowResponse:
        payload = dict(task.request_payload or {})
        result_payload = dict(task.result_payload or {})
        waiting_results = [
            SpecificationVariantPreflightResult.model_validate(item)
            for item in result_payload.get("waiting_results") or []
        ]
        generation = result_payload.get("generation")
        result = (
            SpecificationGenerationResponse.model_validate(generation)
            if generation is not None
            else None
        )
        total = task.progress_total
        percent = (
            min(100.0, round(task.progress_current / total * 100, 1))
            if total and total > 0
            else None
        )
        base = f"/api/v1/calculation-workflows/{task.id}"
        return CalculationWorkflowResponse(
            id=task.id,
            project_id=task.project_id,
            status=task.status,
            stage=task.workflow_stage or task.progress_phase or task.status,
            workflow_version=task.workflow_version,
            variant_ids=[UUID(str(value)) for value in payload.get("variant_ids") or []],
            progress=CalculationWorkflowProgress(
                current=task.progress_current,
                total=total,
                percent=percent,
            ),
            queue_deadline_at=task.queue_deadline_at,
            execution_deadline_at=task.execution_deadline_at,
            interaction_deadline_at=task.interaction_deadline_at,
            waiting_results=waiting_results,
            result=result,
            error_message=task.error_message,
            cancel_requested=task.cancel_requested,
            created_at=task.created_at,
            started_at=task.started_at,
            finished_at=task.finished_at,
            status_url=base,
            cancel_url=f"{base}/cancel",
            resume_url=f"{base}/resume",
            retry_url=f"{base}/retry",
        )
