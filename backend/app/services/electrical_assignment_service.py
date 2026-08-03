"""Transactional service for object assignments inside one named ER."""

from __future__ import annotations

import math
from collections import defaultdict
from time import perf_counter
from typing import Any
from uuid import UUID

from sqlalchemy import and_, delete, func, or_, select, tuple_, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import CurrentPrincipal
from app.electrical_result_status import electrical_result_status
from app.models.background_task import BackgroundTask
from app.models.electrical_calculation import ElectricalCalculation
from app.models.electrical_candidate import ElectricalCandidate
from app.models.electrical_candidate_folder import (
    ElectricalCandidateFolder,
    ElectricalCandidateFolderItem,
)
from app.models.electrical_variant import ElectricalVariant, ElectricalVariantObject
from app.models.project import Project
from app.models.project_object import ProjectObject
from app.models.specification import Specification
from app.schemas.electrical_assignment import (
    ElectricalAssignmentCounts,
    ElectricalAssignmentCurrentLimitPatch,
    ElectricalAssignmentMutationItem,
    ElectricalAssignmentResponse,
    ElectricalAssignmentsListResponse,
    ElectricalAssignmentsMutationResponse,
    ElectricalAssignmentStateCounts,
    ElectricalAssignmentSystemCounts,
    ElectricalAssignmentView,
)
from app.schemas.electrical_variant import ElectricalAssignmentState, ElectricalSystemType
from app.schemas.project import (
    ProjectObjectResponse,
    ProjectObjectsPageCursor,
    ProjectObjectsPageInfo,
)
from app.services.audit_service import AuditService
from app.services.electrical_variant_service import ElectricalVariantServiceError
from app.services.project_service import ProjectService
from app.services.specification_service import SpecificationService

_SUPPORTED_SYSTEM_TYPES = {"self_regulating", "resistive"}
_ACTIVE_TASK_STATUSES = ("queued", "enqueued", "running")
_ELECTRICAL_TASK = "electrical_batch"
_HEAT_TASK = "heat_loss_batch"
_REPORT_TASK = "report_export"


class ElectricalAssignmentServiceError(ElectricalVariantServiceError):
    """Stable assignment error reusing the lifecycle API error envelope."""


class ElectricalAssignmentService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def list_assignments(
        self,
        project_id: UUID,
        variant_id: UUID,
        principal: CurrentPrincipal,
        *,
        view: ElectricalAssignmentView = "all",
        assignment_state: ElectricalAssignmentState | None = None,
        page: int = 1,
        page_size: int = 50,
    ) -> ElectricalAssignmentsListResponse:
        await ProjectService(self.db).get_project_basic(project_id, principal)
        await self._require_variant(project_id, variant_id)

        aggregate = (
            (
                await self.db.execute(
                    select(
                        func.count(ElectricalVariantObject.id).label("total"),
                        func.count(ElectricalVariantObject.id)
                        .filter(ElectricalVariantObject.system_type.is_(None))
                        .label("system_unassigned"),
                        func.count(ElectricalVariantObject.id)
                        .filter(ElectricalVariantObject.system_type == "self_regulating")
                        .label("system_self_regulating"),
                        func.count(ElectricalVariantObject.id)
                        .filter(ElectricalVariantObject.system_type == "resistive")
                        .label("system_resistive"),
                        func.count(ElectricalVariantObject.id)
                        .filter(ElectricalVariantObject.system_type == "skin")
                        .label("system_skin"),
                        func.count(ElectricalVariantObject.id)
                        .filter(ElectricalVariantObject.system_type == "mineral")
                        .label("system_mineral"),
                        func.count(ElectricalVariantObject.id)
                        .filter(ElectricalVariantObject.assignment_state == "unassigned")
                        .label("state_unassigned"),
                        func.count(ElectricalVariantObject.id)
                        .filter(ElectricalVariantObject.assignment_state == "ready")
                        .label("state_ready"),
                        func.count(ElectricalVariantObject.id)
                        .filter(ElectricalVariantObject.assignment_state == "unsupported")
                        .label("state_unsupported"),
                        func.count(ElectricalVariantObject.id)
                        .filter(ElectricalVariantObject.assignment_state == "stale")
                        .label("state_stale"),
                        func.count(ElectricalVariantObject.id)
                        .filter(ElectricalVariantObject.assignment_state == "error")
                        .label("state_error"),
                    ).where(
                        ElectricalVariantObject.project_id == project_id,
                        ElectricalVariantObject.electrical_variant_id == variant_id,
                    )
                )
            )
            .one()
            ._mapping
        )

        filters = [
            ElectricalVariantObject.project_id == project_id,
            ElectricalVariantObject.electrical_variant_id == variant_id,
        ]
        if view == "unassigned":
            filters.append(ElectricalVariantObject.system_type.is_(None))
        elif view != "all":
            filters.append(ElectricalVariantObject.system_type == view)
        if assignment_state is not None:
            filters.append(ElectricalVariantObject.assignment_state == assignment_state)

        filtered = int(
            (
                await self.db.execute(
                    select(func.count(ElectricalVariantObject.id)).where(*filters)
                )
            ).scalar_one()
            or 0
        )
        offset = (page - 1) * page_size
        result = await self.db.execute(
            select(ElectricalVariantObject, ProjectObject)
            .join(
                ProjectObject,
                ProjectObject.id == ElectricalVariantObject.object_id,
            )
            .where(*filters)
            .order_by(ProjectObject.sort_order, ProjectObject.id)
            .offset(offset)
            .limit(page_size)
        )
        rows = list(result.all())
        total_pages = math.ceil(filtered / page_size) if filtered else 0
        next_cursor = None
        if rows and page < total_pages:
            last_object = rows[-1][1]
            next_cursor = ProjectObjectsPageCursor(
                sort_order=last_object.sort_order,
                id=last_object.id,
            )

        return ElectricalAssignmentsListResponse(
            project_id=project_id,
            electrical_variant_id=variant_id,
            items=[self._response(assignment, obj) for assignment, obj in rows],
            counts=ElectricalAssignmentCounts(
                total=int(aggregate["total"] or 0),
                filtered=filtered,
                by_system=ElectricalAssignmentSystemCounts(
                    unassigned=int(aggregate["system_unassigned"] or 0),
                    self_regulating=int(aggregate["system_self_regulating"] or 0),
                    resistive=int(aggregate["system_resistive"] or 0),
                    skin=int(aggregate["system_skin"] or 0),
                    mineral=int(aggregate["system_mineral"] or 0),
                ),
                by_state=ElectricalAssignmentStateCounts(
                    unassigned=int(aggregate["state_unassigned"] or 0),
                    ready=int(aggregate["state_ready"] or 0),
                    unsupported=int(aggregate["state_unsupported"] or 0),
                    stale=int(aggregate["state_stale"] or 0),
                    error=int(aggregate["state_error"] or 0),
                ),
            ),
            page_info=ProjectObjectsPageInfo(
                page=page,
                page_size=page_size,
                offset=offset,
                total_pages=total_pages,
                has_next_page=page < total_pages,
                has_previous_page=page > 1 and filtered > 0,
                next_cursor=next_cursor,
            ),
        )

    async def patch_section_current_limit(
        self,
        project_id: UUID,
        variant_id: UUID,
        object_id: UUID,
        data: ElectricalAssignmentCurrentLimitPatch,
        principal: CurrentPrincipal,
    ) -> ElectricalAssignmentResponse:
        """Optimistically update the object-level Iдоп override for one exact ER."""
        try:
            await self._guard_and_lock_project(project_id, principal)
            await self._require_variant(project_id, variant_id)
            item = ElectricalAssignmentMutationItem(
                object_id=object_id,
                expected_version=data.expected_version,
            )
            assignment, obj = (await self._lock_assignments(project_id, variant_id, [item]))[
                object_id
            ]
            if assignment.system_type != "self_regulating":
                raise ElectricalAssignmentServiceError(
                    "ELECTRICAL_ASSIGNMENT_SYSTEM_MISMATCH",
                    "Iдоп секции применяется только к саморегулирующемуся кабелю",
                    status_code=409,
                    details={"object_id": str(object_id)},
                )
            await self._require_no_active_job_conflict(project_id, variant_id, {object_id})
            if assignment.max_section_start_current_a == data.max_section_start_current_a:
                await self.db.commit()
                await self.db.refresh(assignment)
                return self._response(assignment, obj)

            before = assignment.max_section_start_current_a
            assignment.max_section_start_current_a = data.max_section_start_current_a
            calculation_result = await self.db.execute(
                select(ElectricalCalculation)
                .where(
                    ElectricalCalculation.project_id == project_id,
                    ElectricalCalculation.electrical_variant_id == variant_id,
                    ElectricalCalculation.object_id == object_id,
                )
                .with_for_update()
            )
            for calculation in calculation_result.scalars().all():
                previous = dict(calculation.results or {})
                calculation.results = {
                    **previous,
                    "stale": True,
                    "category": "stale",
                    "stale_reason": "section_current_limit_changed",
                    "error_code": "ELECTRICAL_RECALCULATION_REQUIRED",
                    "message": "Допустимый стартовый ток секции изменён",
                }
            await self.db.execute(
                update(ElectricalCandidate)
                .where(
                    ElectricalCandidate.project_id == project_id,
                    ElectricalCandidate.electrical_variant_id == variant_id,
                    ElectricalCandidate.object_id == object_id,
                )
                .values(status="stale", is_applied=False)
            )
            await self.mark_assignments_stale(
                project_id,
                variant_id,
                [object_id],
                reason="section_current_limit_changed",
                operation="assignment_current_limit_patch",
            )
            await AuditService(self.db).stage(
                event_type="project.electrical_assignment.current_limit_updated",
                category="project",
                principal=principal,
                project_id=project_id,
                object_id=object_id,
                requirement_refs=["DEC-05", "BE-17"],
                before_state={"max_section_start_current_a": before},
                after_state={
                    "max_section_start_current_a": data.max_section_start_current_a,
                    "assignment_version": assignment.version,
                },
                message="Updated assignment section current limit",
            )
            await self.db.commit()
            await self.db.refresh(assignment)
            return self._response(assignment, obj)
        except Exception:
            await self.db.rollback()
            raise

    async def assign(
        self,
        project_id: UUID,
        variant_id: UUID,
        principal: CurrentPrincipal,
        *,
        system_type: ElectricalSystemType,
        items: list[ElectricalAssignmentMutationItem],
    ) -> ElectricalAssignmentsMutationResponse:
        started_at = perf_counter()
        try:
            return await self._assign(
                project_id,
                variant_id,
                principal,
                system_type=system_type,
                items=items,
                started_at=started_at,
            )
        except Exception as exc:
            await self.db.rollback()
            await self._record_mutation_failure(
                project_id,
                variant_id,
                principal,
                action="assign",
                items=items,
                started_at=started_at,
                exc=exc,
                system_type=system_type,
            )
            raise

    async def _assign(
        self,
        project_id: UUID,
        variant_id: UUID,
        principal: CurrentPrincipal,
        *,
        system_type: ElectricalSystemType,
        items: list[ElectricalAssignmentMutationItem],
        started_at: float,
    ) -> ElectricalAssignmentsMutationResponse:
        if system_type not in _SUPPORTED_SYSTEM_TYPES:
            raise ElectricalAssignmentServiceError(
                "ELECTRICAL_SYSTEM_UNSUPPORTED",
                "Выбранный тип электрической системы пока не поддерживается",
                status_code=409,
                details={"system_type": system_type},
            )
        await self._guard_and_lock_project(project_id, principal)
        variant = await self._require_variant(project_id, variant_id)
        locked = await self._lock_assignments(project_id, variant_id, items)
        selected_ids = {item.object_id for item in items}
        await self._require_no_active_job_conflict(project_id, variant_id, selected_ids)
        await self._require_scoped_downstream_integrity(
            project_id,
            variant,
            selected_ids,
        )
        before_assignments = {
            str(object_id): {
                "system_type": assignment.system_type,
                "assignment_state": assignment.assignment_state,
                "version": assignment.version,
            }
            for object_id, (assignment, _obj) in locked.items()
        }

        downstream_object_ids = await self._downstream_object_ids(
            project_id,
            variant_id,
            selected_ids,
        )
        changed = 0
        for item in items:
            assignment, obj = locked[item.object_id]
            if assignment.system_type == system_type:
                continue
            if assignment.system_type is not None:
                raise ElectricalAssignmentServiceError(
                    "ELECTRICAL_ASSIGNMENT_REASSIGN_REQUIRES_UNASSIGN",
                    "Для смены типа системы сначала верните объект в нераспределённые",
                    status_code=409,
                    details={"object_ids": [str(item.object_id)]},
                )

            if item.object_id in downstream_object_ids:
                raise ElectricalAssignmentServiceError(
                    "ELECTRICAL_ASSIGNMENT_CLEANUP_REQUIRED",
                    "Перед назначением требуется подтвердить очистку электрических данных",
                    status_code=409,
                    details={
                        "object_ids": [str(item.object_id)],
                    },
                )

            assignment.system_type = system_type
            assignment.object_version_snapshot = obj.version
            assignment.assignment_state = "stale"
            assignment.requested_cable_type = None
            assignment.diagnostics = self._recalculation_required_diagnostics()
            assignment.version += 1
            changed += 1

        specification_state = await self._specification_state(project_id, variant_id)
        if changed:
            await SpecificationService(self.db).mark_electrical_variant_specification_stale(
                project_id,
                variant_id,
                "electrical_assignment_changed",
                object_ids=selected_ids,
                operation="assign",
            )
            specification_state = await self._specification_state(project_id, variant_id)
            await AuditService(self.db).stage(
                event_type="electrical_assignment.assigned",
                category="calculation",
                result="success",
                error_code=None,
                principal=principal,
                project_id=project_id,
                requirement_refs=["PDL-ER-10", "PDL-ER-11", "PDF-ER-06"],
                details={
                    "electrical_variant_id": str(variant_id),
                    "electrical_variant_name": variant.name,
                    "action": "assign",
                    "result": "success",
                    "object_ids": [str(item.object_id) for item in items],
                    "object_count": len(items),
                    "changed_count": changed,
                    "system_type": system_type,
                    "before_assignments": before_assignments,
                    "after_state": "stale",
                    "duration_ms": self._duration_ms(started_at),
                },
                message="Объекты назначены в электрическую систему ЭР",
            )
        await self.db.commit()
        responses = await self._load_assignment_responses(
            project_id,
            variant_id,
            [item.object_id for item in items],
        )
        return ElectricalAssignmentsMutationResponse(
            project_id=project_id,
            electrical_variant_id=variant_id,
            changed_count=changed,
            assignments=[responses[item.object_id] for item in items],
            cleanup={},
            specification_state=specification_state,
        )

    async def unassign(
        self,
        project_id: UUID,
        variant_id: UUID,
        principal: CurrentPrincipal,
        *,
        confirm: bool,
        items: list[ElectricalAssignmentMutationItem],
    ) -> ElectricalAssignmentsMutationResponse:
        started_at = perf_counter()
        try:
            return await self._unassign(
                project_id,
                variant_id,
                principal,
                confirm=confirm,
                items=items,
                started_at=started_at,
            )
        except Exception as exc:
            await self.db.rollback()
            await self._record_mutation_failure(
                project_id,
                variant_id,
                principal,
                action="unassign",
                items=items,
                started_at=started_at,
                exc=exc,
            )
            raise

    async def _unassign(
        self,
        project_id: UUID,
        variant_id: UUID,
        principal: CurrentPrincipal,
        *,
        confirm: bool,
        items: list[ElectricalAssignmentMutationItem],
        started_at: float,
    ) -> ElectricalAssignmentsMutationResponse:
        if not confirm:
            raise ElectricalAssignmentServiceError(
                "ELECTRICAL_UNASSIGN_CONFIRMATION_REQUIRED",
                "Возврат в нераспределённые требует явного подтверждения",
                status_code=409,
            )
        await self._guard_and_lock_project(project_id, principal)
        variant = await self._require_variant(project_id, variant_id)
        locked = await self._lock_assignments(project_id, variant_id, items)
        selected_ids = {item.object_id for item in items}
        await self._require_no_active_job_conflict(project_id, variant_id, selected_ids)
        await self._require_scoped_downstream_integrity(
            project_id,
            variant,
            selected_ids,
        )
        before_assignments = {
            str(object_id): {
                "system_type": assignment.system_type,
                "assignment_state": assignment.assignment_state,
                "version": assignment.version,
            }
            for object_id, (assignment, _obj) in locked.items()
        }

        cleanup, downstream_object_ids = await self._delete_scoped_graph(
            project_id,
            variant_id,
            selected_ids,
        )
        changed = 0
        for item in items:
            assignment, obj = locked[item.object_id]
            row_changed = (
                assignment.system_type is not None
                or assignment.assignment_state != "unassigned"
                or assignment.requested_cable_type is not None
                or bool(assignment.diagnostics)
                or item.object_id in downstream_object_ids
            )
            if not row_changed:
                continue
            assignment.system_type = None
            assignment.assignment_state = "unassigned"
            assignment.requested_cable_type = None
            assignment.object_version_snapshot = obj.version
            assignment.diagnostics = {}
            assignment.version += 1
            changed += 1

        specification_state = await self._specification_state(project_id, variant_id)
        if changed:
            await SpecificationService(self.db).mark_electrical_variant_specification_stale(
                project_id,
                variant_id,
                "electrical_assignment_unassigned",
                object_ids=selected_ids,
                operation="unassign",
            )
            specification_state = await self._specification_state(project_id, variant_id)
        await AuditService(self.db).stage(
            event_type="electrical_assignment.unassigned",
            category="calculation",
            result="success",
            error_code=None,
            principal=principal,
            project_id=project_id,
            requirement_refs=["PDF-ER-15", "PDF-ER-16"],
            details={
                "electrical_variant_id": str(variant_id),
                "electrical_variant_name": variant.name,
                "action": "unassign",
                "result": "success",
                "object_ids": [str(item.object_id) for item in items],
                "object_count": len(items),
                "changed_count": changed,
                "before_assignments": before_assignments,
                "after_state": "unassigned",
                "cleanup": cleanup,
                "heat_data_preserved": True,
                "duration_ms": self._duration_ms(started_at),
            },
            message="Объекты возвращены в нераспределённые внутри ЭР",
        )
        await self.db.commit()
        responses = await self._load_assignment_responses(
            project_id,
            variant_id,
            [item.object_id for item in items],
        )
        return ElectricalAssignmentsMutationResponse(
            project_id=project_id,
            electrical_variant_id=variant_id,
            changed_count=changed,
            assignments=[responses[item.object_id] for item in items],
            cleanup=cleanup,
            specification_state=specification_state,
        )

    @staticmethod
    def _duration_ms(started_at: float) -> float:
        return round(max(0.0, (perf_counter() - started_at) * 1000), 3)

    async def _record_mutation_failure(
        self,
        project_id: UUID,
        variant_id: UUID,
        principal: CurrentPrincipal,
        *,
        action: str,
        items: list[ElectricalAssignmentMutationItem],
        started_at: float,
        exc: Exception,
        system_type: ElectricalSystemType | None = None,
    ) -> None:
        error_code = str(getattr(exc, "code", None) or "ELECTRICAL_ASSIGNMENT_INTERNAL_ERROR")
        details: dict[str, Any] = {
            "electrical_variant_id": str(variant_id),
            "action": action,
            "result": "failure",
            "object_ids": [str(item.object_id) for item in items],
            "object_count": len(items),
            "error_code": error_code,
            "duration_ms": self._duration_ms(started_at),
        }
        if system_type is not None:
            details["system_type"] = system_type
        try:
            await AuditService(self.db).try_record(
                event_type=f"electrical_assignment.{action}_failed",
                category="calculation",
                severity="warning",
                result="failure",
                principal=principal,
                project_id=project_id,
                requirement_refs=["PDL-ER-10", "PDL-ER-11", "PDF-ER-15"],
                details=details,
                error_code=error_code,
                message="Операция назначения объекта в ЭР завершилась ошибкой",
            )
        except Exception:
            # The business exception remains authoritative even in fail-closed
            # audit mode; the failed mutation has already been rolled back.
            return

    async def sync_from_calculation_rows(self, rows: list[dict[str, Any]]) -> int:
        """Synchronize successful/failed calculation upserts with assignments."""
        scoped_rows: dict[tuple[UUID, UUID], dict[str, Any]] = {}
        for row in rows:
            variant_id = row.get("electrical_variant_id")
            object_id = row.get("object_id")
            if isinstance(variant_id, UUID) and isinstance(object_id, UUID):
                scoped_rows[(variant_id, object_id)] = row
        if not scoped_rows:
            return 0

        result = await self.db.execute(
            select(ElectricalVariantObject, ProjectObject)
            .join(ProjectObject, ProjectObject.id == ElectricalVariantObject.object_id)
            .where(
                tuple_(
                    ElectricalVariantObject.electrical_variant_id,
                    ElectricalVariantObject.object_id,
                ).in_(list(scoped_rows))
            )
            .order_by(
                ElectricalVariantObject.electrical_variant_id,
                ElectricalVariantObject.object_id,
            )
            .with_for_update()
        )
        assignments = {
            (assignment.electrical_variant_id, assignment.object_id): (assignment, obj)
            for assignment, obj in result.all()
        }
        missing = [pair for pair in scoped_rows if pair not in assignments]
        if missing:
            raise ElectricalAssignmentServiceError(
                "ELECTRICAL_ASSIGNMENT_REQUIRED",
                "Для электрического расчёта отсутствует assignment выбранного ЭР",
                status_code=409,
                details={
                    "assignments": [
                        {"electrical_variant_id": str(variant_id), "object_id": str(object_id)}
                        for variant_id, object_id in missing
                    ]
                },
            )

        affected: dict[UUID, list[UUID]] = defaultdict(list)
        for pair, row in scoped_rows.items():
            assignment, obj = assignments[pair]
            cable_type = str(row.get("cable_type") or "")
            mapped_system = self.normalize_system_type(cable_type)
            if (
                assignment.system_type != mapped_system
                or mapped_system not in _SUPPORTED_SYSTEM_TYPES
            ):
                raise ElectricalAssignmentServiceError(
                    "ELECTRICAL_ASSIGNMENT_SYSTEM_MISMATCH",
                    "Тип расчёта не соответствует назначенной системе объекта",
                    status_code=409,
                    details={
                        "object_id": str(assignment.object_id),
                        "assigned_system_type": assignment.system_type,
                        "requested_cable_type": cable_type,
                    },
                )
            assignment.assignment_state = self._state_for_values(
                row.get("cable_mark"),
                row.get("results"),
            )
            assignment.requested_cable_type = cable_type or None
            assignment.object_version_snapshot = obj.version
            assignment.diagnostics = self._diagnostics_for_results(row.get("results"))
            assignment.version += 1
            affected[assignment.electrical_variant_id].append(assignment.object_id)

        specification_service = SpecificationService(self.db)
        project_by_variant = {
            assignment.electrical_variant_id: assignment.project_id
            for assignment, _obj in assignments.values()
        }
        for variant_id, object_ids in affected.items():
            await specification_service.mark_electrical_variant_specification_stale(
                project_by_variant[variant_id],
                variant_id,
                "electrical_calculation_changed",
                object_ids=object_ids,
                operation="calculation_upsert",
            )
        return len(scoped_rows)

    async def validate_calculation_rows(self, rows: list[dict[str, Any]]) -> None:
        """Fail before calculation persistence unless exact ER assignments match."""
        scoped_rows: dict[tuple[UUID, UUID], dict[str, Any]] = {}
        for row in rows:
            variant_id = row.get("electrical_variant_id")
            object_id = row.get("object_id")
            if isinstance(variant_id, UUID) and isinstance(object_id, UUID):
                scoped_rows[(variant_id, object_id)] = row
        if not scoped_rows:
            return
        result = await self.db.execute(
            select(ElectricalVariantObject).where(
                tuple_(
                    ElectricalVariantObject.electrical_variant_id,
                    ElectricalVariantObject.object_id,
                ).in_(list(scoped_rows))
            )
        )
        assignments = {
            (item.electrical_variant_id, item.object_id): item for item in result.scalars().all()
        }
        missing = [pair for pair in scoped_rows if pair not in assignments]
        if missing:
            raise ElectricalAssignmentServiceError(
                "ELECTRICAL_ASSIGNMENT_REQUIRED",
                "Для электрического расчёта отсутствует assignment выбранного ЭР",
                status_code=409,
                details={
                    "assignments": [
                        {"electrical_variant_id": str(variant_id), "object_id": str(object_id)}
                        for variant_id, object_id in missing
                    ]
                },
            )
        mismatches: list[dict[str, Any]] = []
        for pair, row in scoped_rows.items():
            assignment = assignments[pair]
            requested_cable_type = str(row.get("cable_type") or "")
            requested_system = self.normalize_system_type(requested_cable_type)
            if (
                requested_system not in _SUPPORTED_SYSTEM_TYPES
                or assignment.system_type != requested_system
            ):
                mismatches.append(
                    {
                        "object_id": str(assignment.object_id),
                        "electrical_variant_id": str(assignment.electrical_variant_id),
                        "assigned_system_type": assignment.system_type,
                        "requested_cable_type": requested_cable_type,
                    }
                )
        if mismatches:
            raise ElectricalAssignmentServiceError(
                "ELECTRICAL_ASSIGNMENT_SYSTEM_MISMATCH",
                "Тип расчёта не соответствует назначенной системе объекта",
                status_code=409,
                details={"mismatches": mismatches},
            )

    async def require_supported_assignment(
        self,
        project_id: UUID,
        variant_id: UUID,
        object_id: UUID,
        *,
        requested_cable_type: str | None = None,
        lock_project: bool = True,
    ) -> ElectricalVariantObject:
        """Lock and validate the exact P+ER+object assignment graph.

        Candidate/folder creation must not rely on the assignment foreign key:
        unassign deliberately retains that parent row.  This precondition also
        serializes creation with confirmed unassign using the common project ->
        object -> assignment lock order.
        """
        if lock_project:
            project = await self.db.scalar(
                select(Project).where(Project.id == project_id).with_for_update()
            )
            if project is None:
                raise ElectricalAssignmentServiceError(
                    "ELECTRICAL_ASSIGNMENT_REQUIRED",
                    "Проект назначения не найден",
                    status_code=409,
                )
        obj = await self.db.scalar(
            select(ProjectObject)
            .where(
                ProjectObject.project_id == project_id,
                ProjectObject.id == object_id,
            )
            .with_for_update()
        )
        assignment = await self.db.scalar(
            select(ElectricalVariantObject)
            .where(
                ElectricalVariantObject.project_id == project_id,
                ElectricalVariantObject.electrical_variant_id == variant_id,
                ElectricalVariantObject.object_id == object_id,
            )
            .with_for_update()
        )
        if obj is None or assignment is None or assignment.system_type is None:
            raise ElectricalAssignmentServiceError(
                "ELECTRICAL_ASSIGNMENT_REQUIRED",
                "Объект должен быть назначен в систему выбранного ЭР",
                status_code=409,
                details={
                    "electrical_variant_id": str(variant_id),
                    "object_ids": [str(object_id)],
                },
            )
        if assignment.system_type not in _SUPPORTED_SYSTEM_TYPES:
            raise ElectricalAssignmentServiceError(
                "ELECTRICAL_SYSTEM_UNSUPPORTED",
                "Назначенный тип электрической системы пока не поддерживается",
                status_code=409,
                details={"system_type": assignment.system_type},
            )
        if requested_cable_type is not None:
            requested_system = self.normalize_system_type(requested_cable_type)
            if requested_system not in _SUPPORTED_SYSTEM_TYPES:
                raise ElectricalAssignmentServiceError(
                    "ELECTRICAL_SYSTEM_UNSUPPORTED",
                    "Запрошенный тип электрической системы пока не поддерживается",
                    status_code=409,
                    details={"requested_cable_type": requested_cable_type},
                )
            if assignment.system_type != requested_system:
                raise ElectricalAssignmentServiceError(
                    "ELECTRICAL_ASSIGNMENT_SYSTEM_MISMATCH",
                    "Тип расчёта не соответствует назначенной системе объекта",
                    status_code=409,
                    details={
                        "electrical_variant_id": str(variant_id),
                        "object_id": str(object_id),
                        "assigned_system_type": assignment.system_type,
                        "requested_cable_type": requested_cable_type,
                    },
                )
        return assignment

    async def assignment_object_ids_for_system(
        self,
        project_id: UUID,
        variant_id: UUID,
        requested_cable_type: str,
        *,
        lock_project: bool = True,
    ) -> list[UUID]:
        """Return the exact ER scope for a recalculate-all operation."""
        requested_system = self.normalize_system_type(requested_cable_type)
        if requested_system not in _SUPPORTED_SYSTEM_TYPES:
            raise ElectricalAssignmentServiceError(
                "ELECTRICAL_SYSTEM_UNSUPPORTED",
                "Запрошенный тип электрической системы пока не поддерживается",
                status_code=409,
                details={"requested_cable_type": requested_cable_type},
            )
        if lock_project:
            await self.db.execute(select(Project).where(Project.id == project_id).with_for_update())
        result = await self.db.execute(
            select(ElectricalVariantObject.object_id)
            .where(
                ElectricalVariantObject.project_id == project_id,
                ElectricalVariantObject.electrical_variant_id == variant_id,
                ElectricalVariantObject.system_type == requested_system,
            )
            .order_by(ElectricalVariantObject.object_id)
        )
        return list(result.scalars().all())

    async def validate_supported_assignment_objects(
        self,
        project_id: UUID,
        variant_id: UUID,
        requested_cable_types: dict[UUID, str],
        *,
        lock_project: bool = True,
    ) -> None:
        """Atomically validate an explicit object selection before calculation."""
        object_ids = sorted(requested_cable_types, key=str)
        if not object_ids:
            return
        if lock_project:
            project = await self.db.scalar(
                select(Project).where(Project.id == project_id).with_for_update()
            )
            if project is None:
                raise ElectricalAssignmentServiceError(
                    "ELECTRICAL_ASSIGNMENT_REQUIRED",
                    "Проект назначения не найден",
                    status_code=409,
                )
        result = await self.db.execute(
            select(ProjectObject, ElectricalVariantObject)
            .join(
                ElectricalVariantObject,
                and_(
                    ElectricalVariantObject.project_id == ProjectObject.project_id,
                    ElectricalVariantObject.object_id == ProjectObject.id,
                    ElectricalVariantObject.electrical_variant_id == variant_id,
                ),
            )
            .where(
                ProjectObject.project_id == project_id,
                ProjectObject.id.in_(object_ids),
            )
            .order_by(ProjectObject.id)
            .with_for_update()
        )
        assignments = {assignment.object_id: assignment for _obj, assignment in result.all()}
        missing = [object_id for object_id in object_ids if object_id not in assignments]
        if missing:
            raise ElectricalAssignmentServiceError(
                "ELECTRICAL_ASSIGNMENT_REQUIRED",
                "Объекты должны быть назначены в систему выбранного ЭР",
                status_code=409,
                details={
                    "electrical_variant_id": str(variant_id),
                    "object_ids": [str(object_id) for object_id in missing],
                },
            )

        unsupported: list[dict[str, str]] = []
        mismatches: list[dict[str, str | None]] = []
        for object_id in object_ids:
            assignment = assignments[object_id]
            requested_cable_type = requested_cable_types[object_id]
            requested_system = self.normalize_system_type(requested_cable_type)
            if requested_system not in _SUPPORTED_SYSTEM_TYPES:
                unsupported.append(
                    {
                        "object_id": str(object_id),
                        "requested_cable_type": requested_cable_type,
                    }
                )
                continue
            if assignment.system_type not in _SUPPORTED_SYSTEM_TYPES:
                if assignment.system_type is not None:
                    unsupported.append(
                        {
                            "object_id": str(object_id),
                            "requested_cable_type": assignment.system_type,
                        }
                    )
                else:
                    mismatches.append(
                        {
                            "object_id": str(object_id),
                            "assigned_system_type": None,
                            "requested_cable_type": requested_cable_type,
                        }
                    )
                continue
            if assignment.system_type != requested_system:
                mismatches.append(
                    {
                        "object_id": str(object_id),
                        "assigned_system_type": assignment.system_type,
                        "requested_cable_type": requested_cable_type,
                    }
                )
        if unsupported:
            raise ElectricalAssignmentServiceError(
                "ELECTRICAL_SYSTEM_UNSUPPORTED",
                "Запрошенный или назначенный тип системы пока не поддерживается",
                status_code=409,
                details={"assignments": unsupported},
            )
        if mismatches:
            code = (
                "ELECTRICAL_ASSIGNMENT_REQUIRED"
                if any(item["assigned_system_type"] is None for item in mismatches)
                else "ELECTRICAL_ASSIGNMENT_SYSTEM_MISMATCH"
            )
            raise ElectricalAssignmentServiceError(
                code,
                "Тип расчёта не соответствует назначенной системе объекта",
                status_code=409,
                details={"mismatches": mismatches},
            )

    async def mark_assignments_stale(
        self,
        project_id: UUID,
        variant_id: UUID,
        object_ids: list[UUID] | set[UUID] | tuple[UUID, ...],
        *,
        reason: str,
        operation: str,
    ) -> int:
        unique_ids = list(dict.fromkeys(object_ids))
        if not unique_ids:
            return 0
        result = await self.db.execute(
            select(ElectricalVariantObject)
            .where(
                ElectricalVariantObject.project_id == project_id,
                ElectricalVariantObject.electrical_variant_id == variant_id,
                ElectricalVariantObject.object_id.in_(unique_ids),
                ElectricalVariantObject.system_type.is_not(None),
            )
            .order_by(ElectricalVariantObject.object_id)
            .with_for_update()
        )
        assignments = list(result.scalars().all())
        for assignment in assignments:
            assignment.assignment_state = "stale"
            assignment.diagnostics = {
                "error_code": "ELECTRICAL_RECALCULATION_REQUIRED",
                "category": "stale",
                "reason": reason,
                "message": "Электрический расчёт требует повторного запуска",
            }
            assignment.version += 1
        if assignments:
            await SpecificationService(self.db).mark_electrical_variant_specification_stale(
                project_id,
                variant_id,
                reason,
                object_ids=unique_ids,
                operation=operation,
            )
        return len(assignments)

    async def mark_assignments_stale_for_objects(
        self,
        project_id: UUID,
        object_ids: list[UUID] | set[UUID] | tuple[UUID, ...],
        *,
        reason: str,
    ) -> int:
        unique_ids = list(dict.fromkeys(object_ids))
        if not unique_ids:
            return 0
        result = await self.db.execute(
            select(ElectricalVariantObject)
            .where(
                ElectricalVariantObject.project_id == project_id,
                ElectricalVariantObject.object_id.in_(unique_ids),
                ElectricalVariantObject.system_type.is_not(None),
            )
            .order_by(
                ElectricalVariantObject.electrical_variant_id,
                ElectricalVariantObject.object_id,
            )
            .with_for_update()
        )
        assignments = list(result.scalars().all())
        by_variant: dict[UUID, list[UUID]] = defaultdict(list)
        for assignment in assignments:
            assignment.assignment_state = "stale"
            assignment.diagnostics = {
                "error_code": "ELECTRICAL_RECALCULATION_REQUIRED",
                "category": "stale",
                "reason": reason,
                "message": "Исходные данные объекта изменились",
            }
            assignment.version += 1
            by_variant[assignment.electrical_variant_id].append(assignment.object_id)
        specification_service = SpecificationService(self.db)
        for variant_id, affected_ids in by_variant.items():
            await specification_service.mark_electrical_variant_specification_stale(
                project_id,
                variant_id,
                reason,
                object_ids=affected_ids,
                operation="object_stale",
            )
        return len(assignments)

    async def _guard_and_lock_project(
        self,
        project_id: UUID,
        principal: CurrentPrincipal,
    ) -> Project:
        await ProjectService(self.db).get_project_for_write(project_id, principal)
        result = await self.db.execute(
            select(Project)
            .where(Project.id == project_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        return result.scalar_one()

    async def _require_variant(self, project_id: UUID, variant_id: UUID) -> ElectricalVariant:
        result = await self.db.execute(
            select(ElectricalVariant).where(
                ElectricalVariant.project_id == project_id,
                ElectricalVariant.id == variant_id,
            )
        )
        variant = result.scalar_one_or_none()
        if variant is None:
            raise ElectricalAssignmentServiceError(
                "ELECTRICAL_VARIANT_NOT_FOUND",
                "ЭР не найден в указанном проекте",
                status_code=404,
            )
        return variant

    async def _lock_assignments(
        self,
        project_id: UUID,
        variant_id: UUID,
        items: list[ElectricalAssignmentMutationItem],
    ) -> dict[UUID, tuple[ElectricalVariantObject, ProjectObject]]:
        object_ids = [item.object_id for item in items]
        if len(set(object_ids)) != len(object_ids):
            raise ElectricalAssignmentServiceError(
                "ELECTRICAL_ASSIGNMENT_DUPLICATE_OBJECT",
                "Список assignment содержит повторяющиеся object_id",
                status_code=422,
            )
        object_result = await self.db.execute(
            select(ProjectObject)
            .where(
                ProjectObject.project_id == project_id,
                ProjectObject.id.in_(object_ids),
            )
            .order_by(ProjectObject.id)
            .with_for_update()
        )
        objects = {obj.id: obj for obj in object_result.scalars().all()}
        assignment_result = await self.db.execute(
            select(ElectricalVariantObject)
            .where(
                ElectricalVariantObject.project_id == project_id,
                ElectricalVariantObject.electrical_variant_id == variant_id,
                ElectricalVariantObject.object_id.in_(object_ids),
            )
            .order_by(ElectricalVariantObject.object_id)
            .with_for_update()
        )
        locked = {
            assignment.object_id: (assignment, objects[assignment.object_id])
            for assignment in assignment_result.scalars().all()
            if assignment.object_id in objects
        }
        missing_ids = [object_id for object_id in object_ids if object_id not in locked]
        if missing_ids:
            raise ElectricalAssignmentServiceError(
                "ELECTRICAL_ASSIGNMENT_REQUIRED",
                "Для выбранного объекта отсутствует assignment указанного ЭР",
                status_code=409,
                details={"object_ids": [str(item) for item in missing_ids]},
            )
        expected_by_id = {item.object_id: item.expected_version for item in items}
        conflicts = [
            {
                "object_id": str(object_id),
                "expected_version": expected_by_id[object_id],
                "current_version": assignment.version,
            }
            for object_id, (assignment, _obj) in locked.items()
            if assignment.version != expected_by_id[object_id]
        ]
        if conflicts:
            raise ElectricalAssignmentServiceError(
                "ELECTRICAL_ASSIGNMENT_VERSION_CONFLICT",
                "Assignment был изменён другим запросом; обновите данные",
                status_code=409,
                details={"conflicts": conflicts},
            )
        return locked

    async def _require_no_active_job_conflict(
        self,
        project_id: UUID,
        variant_id: UUID,
        selected_ids: set[UUID],
    ) -> None:
        result = await self.db.execute(
            select(BackgroundTask).where(
                BackgroundTask.project_id == project_id,
                BackgroundTask.status.in_(_ACTIVE_TASK_STATUSES),
                or_(
                    BackgroundTask.type == _HEAT_TASK,
                    (BackgroundTask.electrical_variant_id == variant_id)
                    & BackgroundTask.type.in_((_ELECTRICAL_TASK, _REPORT_TASK)),
                ),
            )
        )
        blocking: list[dict[str, str]] = []
        for task in result.scalars().all():
            if task.type == _HEAT_TASK and not self._task_overlaps_objects(
                task.request_payload,
                selected_ids,
            ):
                continue
            blocking.append(
                {
                    "task_id": str(task.id),
                    "type": task.type,
                    "status": task.status,
                    "cancel_requested": str(bool(task.cancel_requested)).lower(),
                }
            )
        if blocking:
            raise ElectricalAssignmentServiceError(
                "ELECTRICAL_ASSIGNMENT_JOB_CONFLICT",
                "Назначение нельзя изменить во время связанной фоновой задачи",
                status_code=409,
                details={"blocking_tasks": blocking},
            )

    @staticmethod
    def _task_overlaps_objects(payload: dict[str, Any] | None, selected_ids: set[UUID]) -> bool:
        raw_ids = (payload or {}).get("object_ids")
        if not isinstance(raw_ids, list) or not raw_ids:
            return True
        try:
            task_ids = {UUID(str(item)) for item in raw_ids}
        except (TypeError, ValueError):
            return True
        return bool(task_ids & selected_ids)

    async def _require_scoped_downstream_integrity(
        self,
        project_id: UUID,
        variant: ElectricalVariant,
        object_ids: set[UUID],
    ) -> None:
        """Reject legacy/null or mismatched rows; never clean them by numeric fallback."""
        if variant.legacy_variant_number is None:
            return
        conflicts: dict[str, int] = {}
        for model in (
            ElectricalCalculation,
            ElectricalCandidate,
            ElectricalCandidateFolder,
        ):
            count = int(
                (
                    await self.db.execute(
                        select(func.count(model.id)).where(
                            model.project_id == project_id,
                            model.object_id.in_(object_ids),
                            model.variant_number == variant.legacy_variant_number,
                            model.electrical_variant_id.is_distinct_from(variant.id),
                        )
                    )
                ).scalar_one()
                or 0
            )
            if count:
                conflicts[model.__tablename__] = count
        specification_count = int(
            (
                await self.db.execute(
                    select(func.count(Specification.id)).where(
                        Specification.project_id == project_id,
                        Specification.variant_number == variant.legacy_variant_number,
                        Specification.electrical_variant_id.is_distinct_from(variant.id),
                    )
                )
            ).scalar_one()
            or 0
        )
        if specification_count:
            conflicts[Specification.__tablename__] = specification_count

        # Folder-item has two independent foreign keys.  Reject a corrupt
        # cross-ER/cross-object edge before any exact-ER graph deletion.
        folder_item_count = int(
            (
                await self.db.execute(
                    select(func.count(ElectricalCandidateFolderItem.folder_id))
                    .select_from(ElectricalCandidateFolderItem)
                    .join(
                        ElectricalCandidateFolder,
                        ElectricalCandidateFolder.id == ElectricalCandidateFolderItem.folder_id,
                    )
                    .join(
                        ElectricalCandidate,
                        ElectricalCandidate.id == ElectricalCandidateFolderItem.candidate_id,
                    )
                    .where(
                        or_(
                            and_(
                                ElectricalCandidateFolder.project_id == project_id,
                                ElectricalCandidateFolder.object_id.in_(object_ids),
                                ElectricalCandidateFolder.variant_number
                                == variant.legacy_variant_number,
                            ),
                            and_(
                                ElectricalCandidate.project_id == project_id,
                                ElectricalCandidate.object_id.in_(object_ids),
                                ElectricalCandidate.variant_number == variant.legacy_variant_number,
                            ),
                        ),
                        or_(
                            ElectricalCandidateFolder.project_id != ElectricalCandidate.project_id,
                            ElectricalCandidateFolder.object_id != ElectricalCandidate.object_id,
                            ElectricalCandidateFolder.variant_number
                            != ElectricalCandidate.variant_number,
                            ElectricalCandidateFolder.electrical_variant_id.is_distinct_from(
                                ElectricalCandidate.electrical_variant_id
                            ),
                            ElectricalCandidateFolder.electrical_variant_id.is_distinct_from(
                                variant.id
                            ),
                            ElectricalCandidate.electrical_variant_id.is_distinct_from(variant.id),
                        ),
                    )
                )
            ).scalar_one()
            or 0
        )
        if folder_item_count:
            conflicts[ElectricalCandidateFolderItem.__tablename__] = folder_item_count
        if conflicts:
            raise ElectricalAssignmentServiceError(
                "ELECTRICAL_ASSIGNMENT_DOWNSTREAM_SCOPE_CONFLICT",
                "Электрические данные имеют NULL или несовместимый UUID ЭР",
                status_code=409,
                details={"conflicts": conflicts},
            )

    async def _downstream_object_ids(
        self,
        project_id: UUID,
        variant_id: UUID,
        object_ids: set[UUID],
    ) -> set[UUID]:
        downstream: set[UUID] = set()
        for model in (
            ElectricalCalculation,
            ElectricalCandidate,
            ElectricalCandidateFolder,
        ):
            result = await self.db.execute(
                select(model.object_id).where(
                    model.project_id == project_id,
                    model.electrical_variant_id == variant_id,
                    model.object_id.in_(object_ids),
                )
            )
            downstream.update(result.scalars().all())
        return downstream

    async def _load_assignment_responses(
        self,
        project_id: UUID,
        variant_id: UUID,
        object_ids: list[UUID],
    ) -> dict[UUID, ElectricalAssignmentResponse]:
        """Read back committed rows in one query; avoid expired async attributes."""
        result = await self.db.execute(
            select(ElectricalVariantObject, ProjectObject)
            .join(ProjectObject, ProjectObject.id == ElectricalVariantObject.object_id)
            .where(
                ElectricalVariantObject.project_id == project_id,
                ElectricalVariantObject.electrical_variant_id == variant_id,
                ElectricalVariantObject.object_id.in_(object_ids),
            )
            .execution_options(populate_existing=True)
        )
        return {
            assignment.object_id: self._response(assignment, obj)
            for assignment, obj in result.all()
        }

    async def _delete_scoped_graph(
        self,
        project_id: UUID,
        variant_id: UUID,
        object_ids: set[UUID],
    ) -> tuple[dict[str, int], set[UUID]]:
        calculations = list(
            (
                await self.db.execute(
                    select(ElectricalCalculation.id, ElectricalCalculation.object_id).where(
                        ElectricalCalculation.project_id == project_id,
                        ElectricalCalculation.electrical_variant_id == variant_id,
                        ElectricalCalculation.object_id.in_(object_ids),
                    )
                )
            ).all()
        )
        candidates = list(
            (
                await self.db.execute(
                    select(ElectricalCandidate.id, ElectricalCandidate.object_id).where(
                        ElectricalCandidate.project_id == project_id,
                        ElectricalCandidate.electrical_variant_id == variant_id,
                        ElectricalCandidate.object_id.in_(object_ids),
                    )
                )
            ).all()
        )
        folders = list(
            (
                await self.db.execute(
                    select(ElectricalCandidateFolder.id, ElectricalCandidateFolder.object_id).where(
                        ElectricalCandidateFolder.project_id == project_id,
                        ElectricalCandidateFolder.electrical_variant_id == variant_id,
                        ElectricalCandidateFolder.object_id.in_(object_ids),
                    )
                )
            ).all()
        )
        folder_ids = [item[0] for item in folders]
        folder_item_count = 0
        if folder_ids:
            folder_item_count = int(
                (
                    await self.db.execute(
                        select(func.count(ElectricalCandidateFolderItem.folder_id)).where(
                            ElectricalCandidateFolderItem.folder_id.in_(folder_ids)
                        )
                    )
                ).scalar_one()
                or 0
            )

        await self.db.execute(
            delete(ElectricalCandidateFolder).where(
                ElectricalCandidateFolder.project_id == project_id,
                ElectricalCandidateFolder.electrical_variant_id == variant_id,
                ElectricalCandidateFolder.object_id.in_(object_ids),
            )
        )
        await self.db.execute(
            delete(ElectricalCandidate).where(
                ElectricalCandidate.project_id == project_id,
                ElectricalCandidate.electrical_variant_id == variant_id,
                ElectricalCandidate.object_id.in_(object_ids),
            )
        )
        await self.db.execute(
            delete(ElectricalCalculation).where(
                ElectricalCalculation.project_id == project_id,
                ElectricalCalculation.electrical_variant_id == variant_id,
                ElectricalCalculation.object_id.in_(object_ids),
            )
        )
        downstream_object_ids = {
            object_id for _row_id, object_id in [*calculations, *candidates, *folders]
        }
        return (
            {
                "electrical_calculations": len(calculations),
                "electrical_candidates": len(candidates),
                "electrical_candidate_folders": len(folders),
                "electrical_candidate_folder_items": folder_item_count,
            },
            downstream_object_ids,
        )

    async def _specification_state(self, project_id: UUID, variant_id: UUID) -> str:
        result = await self.db.execute(
            select(Specification.is_stale).where(
                Specification.project_id == project_id,
                Specification.electrical_variant_id == variant_id,
            )
        )
        value = result.scalar_one_or_none()
        if value is None:
            return "not_generated"
        return "stale" if value else "generated"

    @staticmethod
    def normalize_system_type(cable_type: str | None) -> str | None:
        if cable_type in {"self_regulating", "self_regulating_tt"}:
            return "self_regulating"
        if cable_type in {"single_core", "three_core"}:
            return "resistive"
        if cable_type in {"skin", "mineral"}:
            return cable_type
        return None

    @staticmethod
    def _state_for_values(cable_mark: Any, results: Any) -> str:
        payload = results if isinstance(results, dict) else None
        status = electrical_result_status(
            cable_mark if isinstance(cable_mark, str) else None,
            payload,
        )
        if status == "success":
            return "ready"
        if status == "stale":
            return "stale"
        if status == "unsupported":
            return "unsupported"
        return "error"

    @classmethod
    def _state_for_calculation(cls, calculation: ElectricalCalculation) -> str:
        results = calculation.results
        if calculation.cable_type == "self_regulating_tt" and isinstance(results, dict):
            results = {**results, "cable_type": calculation.cable_type}
        return cls._state_for_values(calculation.cable_mark, results)

    @staticmethod
    def _diagnostics_for_results(results: Any) -> dict[str, Any]:
        if not isinstance(results, dict):
            return {}
        return {
            key: results[key]
            for key in ("error_code", "category", "message", "hint", "stale_reason")
            if results.get(key) is not None
        }

    @staticmethod
    def _recalculation_required_diagnostics() -> dict[str, str]:
        return {
            "error_code": "ELECTRICAL_CALCULATION_REQUIRED",
            "category": "stale",
            "message": "После назначения требуется электрический расчёт",
        }

    @staticmethod
    def _response(
        assignment: ElectricalVariantObject,
        obj: ProjectObject,
    ) -> ElectricalAssignmentResponse:
        return ElectricalAssignmentResponse.model_validate(
            {
                "id": assignment.id,
                "project_id": assignment.project_id,
                "electrical_variant_id": assignment.electrical_variant_id,
                "object_id": assignment.object_id,
                "system_type": assignment.system_type,
                "assignment_state": assignment.assignment_state,
                "requested_cable_type": assignment.requested_cable_type,
                "max_section_start_current_a": assignment.max_section_start_current_a,
                "object_version_snapshot": assignment.object_version_snapshot,
                "version": assignment.version,
                "diagnostics": assignment.diagnostics or {},
                "object": ProjectObjectResponse.model_validate(obj),
                "created_at": assignment.created_at,
                "updated_at": assignment.updated_at,
            }
        )
