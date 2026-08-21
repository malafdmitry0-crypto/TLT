"""Task creation, idempotency and enqueue orchestration."""

from typing import Any
from uuid import UUID

from sqlalchemy.exc import IntegrityError

from app.core.dependencies import CurrentPrincipal
from app.models.background_task import BackgroundTask
from app.schemas.calculation import ElectricalBatchJobRequest
from app.schemas.heat_loss import HeatLossBatchJobRequest
from app.schemas.report import ReportExportJobRequest
from app.services.calculation.electrical_repository import ElectricalCalculationRepository
from app.services.electrical_assignment_service import (
    ElectricalAssignmentService,
    ElectricalAssignmentServiceError,
)
from app.services.project_service import ProjectService
from app.services.task_queue import TaskQueue
from app.services.tasks.contracts import (
    TASK_ELECTRICAL_BATCH,
    TASK_HEAT_LOSS_BATCH,
    TASK_REPORT_EXPORT,
    TaskAccessError,
)
from app.services.tasks.payloads import (
    dedupe_key,
    electrical_payload,
    heat_loss_payload,
    report_export_payload,
)
from app.services.tasks.runners.report_export import ReportExportRunner


class TaskCreation(ReportExportRunner):
    async def create_electrical_batch_task(
        self,
        request: ElectricalBatchJobRequest,
        principal: CurrentPrincipal,
        *,
        queue: TaskQueue | None = None,
        idempotency_key: str | None = None,
    ) -> BackgroundTask:
        if request.cable_source in ("extended", "all") and principal.role not in (
            "employee",
            "admin",
        ):
            raise TaskAccessError("Расширенный каталог доступен только сотрудникам")
        await ProjectService(self.db).get_project_for_write(
            request.project_id,
            principal,
            guard_calculation=False,
        )
        await self._lock_project_for_electrical_task(request.project_id)
        variant = await self._resolve_electrical_variant(
            request.project_id,
            request.electrical_variant_id,
        )
        object_ids = await self._validate_object_ids_belong_to_project(
            request.project_id,
            request.object_ids,
        )
        object_overrides = await self._validate_electrical_object_overrides(
            request.project_id,
            request.object_overrides,
            object_ids=object_ids,
        )
        assignments = ElectricalAssignmentService(self.db)
        if object_ids is None:
            object_ids = await assignments.assignment_object_ids_for_system(
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
        override_ids = {UUID(str(item["object_id"])) for item in object_overrides or []}
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
            UUID(str(item["object_id"])): str(item["cable_type"]) for item in object_overrides or []
        }
        existing_scope = await ElectricalCalculationRepository(self.db).load_existing_for_variant(
            request.project_id, variant.id, object_ids
        )
        requested_types = {
            object_id: str(
                request.cable_type
                if request.force_cable_type
                else override_by_id.get(object_id)
                or (
                    existing_scope[object_id].cable_type
                    if object_id in existing_scope
                    else request.cable_type
                )
            )
            for object_id in object_ids
        }
        await assignments.validate_supported_assignment_objects(
            request.project_id,
            variant.id,
            requested_types,
            lock_project=False,
        )
        payload = electrical_payload(
            request,
            object_ids=object_ids,
            object_overrides=object_overrides,
        )
        return await self._create_task(
            task_type=TASK_ELECTRICAL_BATCH,
            project_id=request.project_id,
            electrical_variant_id=variant.id,
            principal=principal,
            payload=payload,
            progress_total=None,
            queue=queue,
            idempotency_key=idempotency_key,
        )

    async def create_heat_loss_batch_task(
        self,
        request: HeatLossBatchJobRequest,
        principal: CurrentPrincipal,
        *,
        queue: TaskQueue | None = None,
        idempotency_key: str | None = None,
    ) -> BackgroundTask:
        return await self._create_task(
            task_type=TASK_HEAT_LOSS_BATCH,
            project_id=request.project_id,
            electrical_variant_id=None,
            principal=principal,
            payload=heat_loss_payload(request),
            progress_total=None,
            queue=queue,
            idempotency_key=idempotency_key,
        )

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
        await self._lock_project_for_electrical_task(request.project_id)
        variant = await self._resolve_electrical_variant(
            request.project_id,
            request.electrical_variant_id,
        )
        return await self._create_task(
            task_type=TASK_REPORT_EXPORT,
            project_id=request.project_id,
            electrical_variant_id=variant.id,
            principal=principal,
            payload=report_export_payload(request),
            progress_total=3,
            queue=queue,
            idempotency_key=idempotency_key,
        )

    async def _create_task(
        self,
        *,
        task_type: str,
        project_id: UUID,
        electrical_variant_id: UUID | None,
        principal: CurrentPrincipal,
        payload: dict[str, Any],
        progress_total: int | None,
        queue: TaskQueue | None,
        idempotency_key: str | None,
    ) -> BackgroundTask:
        existing_binding = await self._explicit_idempotency_binding(
            task_type,
            project_id,
            principal,
            idempotency_key,
        )
        await self._require_project_write(
            project_id,
            principal,
            calculation_owner_task_id=(existing_binding.id if existing_binding else None),
        )
        await self._lock_project_for_electrical_task(project_id)
        key = dedupe_key(
            task_type=task_type,
            project_id=project_id,
            principal=principal,
            payload=payload,
            idempotency_key=idempotency_key,
        )
        explicit = bool(idempotency_key)
        existing = await self._find_active_by_dedupe(key, include_terminal=explicit)
        if existing is not None:
            self._require_matching_idempotency_binding(
                existing,
                explicit_idempotency=explicit,
                task_type=task_type,
                project_id=project_id,
                electrical_variant_id=electrical_variant_id,
                payload=payload,
            )
            await self.db.commit()
            return self._mark_idempotency_replay(existing, replay=True)
        await self._enforce_active_task_limits(project_id, principal)
        task = BackgroundTask(
            type=task_type,
            status="queued",
            project_id=project_id,
            electrical_variant_id=electrical_variant_id,
            user_id=principal.user_id,
            session_id=principal.session_id,
            request_payload=payload,
            progress_current=0,
            progress_total=progress_total,
            progress_phase="queued",
            idempotency_key=key,
            cancel_requested=False,
            attempts=0,
            enqueue_attempts=0,
        )
        self.db.add(task)
        try:
            await self.db.commit()
        except IntegrityError:
            await self.db.rollback()
            existing = await self._find_active_by_dedupe(key, include_terminal=explicit)
            if existing is None:
                raise
            self._require_matching_idempotency_binding(
                existing,
                explicit_idempotency=explicit,
                task_type=task_type,
                project_id=project_id,
                electrical_variant_id=electrical_variant_id,
                payload=payload,
            )
            return self._mark_idempotency_replay(existing, replay=True)
        await self.db.refresh(task)
        await self.enqueue_existing_task(task, queue=queue or TaskQueue())
        return self._mark_idempotency_replay(task, replay=False)
