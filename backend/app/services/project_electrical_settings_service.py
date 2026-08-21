"""Persistence and optimistic updates for project electrical settings."""

from __future__ import annotations

from collections import defaultdict
from uuid import UUID

from sqlalchemy import select, tuple_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import CurrentPrincipal
from app.models.electrical_calculation import ElectricalCalculation
from app.models.electrical_candidate import ElectricalCandidate
from app.models.electrical_variant import ElectricalVariantObject
from app.models.project import Project
from app.models.project_electrical_settings import ProjectElectricalSettings
from app.schemas.project_electrical_settings import ProjectElectricalSettingsPatch
from app.services.audit_service import AuditService
from app.services.electrical_assignment_service import ElectricalAssignmentService
from app.services.project_service import ProjectService


class ProjectElectricalSettingsConflictError(Exception):
    def __init__(self, *, expected_version: int, current_version: int) -> None:
        super().__init__("Project electrical settings were changed concurrently")
        self.expected_version = expected_version
        self.current_version = current_version


def _principal_reference(principal: CurrentPrincipal) -> str | None:
    if principal.user_id is not None:
        return str(principal.user_id)
    return principal.session_id


class ProjectElectricalSettingsService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get(
        self,
        project_id: UUID,
        principal: CurrentPrincipal,
    ) -> ProjectElectricalSettings:
        await ProjectService(self.db).get_project_basic(project_id, principal)
        settings = await self.db.get(ProjectElectricalSettings, project_id)
        if settings is None:
            settings = ProjectElectricalSettings(project_id=project_id)
            self.db.add(settings)
            await self.db.commit()
            await self.db.refresh(settings)
        return settings

    async def patch(
        self,
        project_id: UUID,
        data: ProjectElectricalSettingsPatch,
        principal: CurrentPrincipal,
    ) -> ProjectElectricalSettings:
        await ProjectService(self.db).get_project_for_write(project_id, principal)
        await self.db.execute(
            select(Project)
            .where(Project.id == project_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        settings = await self.db.scalar(
            select(ProjectElectricalSettings)
            .where(ProjectElectricalSettings.project_id == project_id)
            .with_for_update()
        )
        if settings is None:
            settings = ProjectElectricalSettings(project_id=project_id)
            self.db.add(settings)
            await self.db.flush()

        if settings.version != data.expected_version:
            raise ProjectElectricalSettingsConflictError(
                expected_version=data.expected_version,
                current_version=settings.version,
            )

        before = {
            "nominal_voltage_v": settings.nominal_voltage_v,
            "max_section_start_current_a": settings.max_section_start_current_a,
            "version": settings.version,
        }
        if settings.max_section_start_current_a == data.max_section_start_current_a:
            await self.db.commit()
            await self.db.refresh(settings)
            return settings
        settings.max_section_start_current_a = data.max_section_start_current_a
        settings.version += 1
        settings.updated_by = _principal_reference(principal)
        await self._mark_current_limit_dependents_stale(project_id)
        await AuditService(self.db).stage(
            event_type="project.electrical_settings.updated",
            category="project",
            principal=principal,
            project_id=project_id,
            requirement_refs=["DEC-05", "BE-17"],
            before_state=before,
            after_state={
                "nominal_voltage_v": settings.nominal_voltage_v,
                "max_section_start_current_a": settings.max_section_start_current_a,
                "version": settings.version,
            },
            message="Updated project electrical settings",
        )
        await self.db.commit()
        await self.db.refresh(settings)
        return settings

    async def _mark_current_limit_dependents_stale(self, project_id: UUID) -> None:
        """Stale only assignments which inherit Iдоп from the project setting."""
        assignment_result = await self.db.execute(
            select(ElectricalVariantObject)
            .where(
                ElectricalVariantObject.project_id == project_id,
                ElectricalVariantObject.system_type == "self_regulating",
                ElectricalVariantObject.max_section_start_current_a.is_(None),
            )
            .order_by(
                ElectricalVariantObject.electrical_variant_id,
                ElectricalVariantObject.object_id,
            )
            .with_for_update()
        )
        assignments = list(assignment_result.scalars().all())
        if not assignments:
            return
        pairs = {
            (assignment.electrical_variant_id, assignment.object_id) for assignment in assignments
        }
        exact_pairs = sorted(pairs, key=lambda item: (str(item[0]), str(item[1])))

        calculation_result = await self.db.execute(
            select(ElectricalCalculation)
            .where(
                ElectricalCalculation.project_id == project_id,
                tuple_(
                    ElectricalCalculation.electrical_variant_id,
                    ElectricalCalculation.object_id,
                ).in_(exact_pairs),
            )
            .with_for_update()
        )
        stale_pairs = set(pairs)
        for calculation in calculation_result.scalars().all():
            pair = (calculation.electrical_variant_id, calculation.object_id)
            if not self._uses_project_current_limit(calculation.results):
                stale_pairs.discard(pair)
                continue
            previous = dict(calculation.results or {})
            calculation.results = {
                **previous,
                "stale": True,
                "category": "stale",
                "stale_reason": "project_section_current_limit_changed",
                "error_code": "ELECTRICAL_RECALCULATION_REQUIRED",
                "message": "Проектный допустимый стартовый ток секции изменён",
            }

        candidate_result = await self.db.execute(
            select(ElectricalCandidate)
            .where(
                ElectricalCandidate.project_id == project_id,
                tuple_(
                    ElectricalCandidate.electrical_variant_id,
                    ElectricalCandidate.object_id,
                ).in_(exact_pairs),
            )
            .with_for_update()
        )
        for candidate in candidate_result.scalars().all():
            if not self._uses_project_current_limit(candidate.results):
                continue
            candidate.status = "stale"
            candidate.is_applied = False

        if not stale_pairs:
            return
        by_variant: dict[UUID, list[UUID]] = defaultdict(list)
        for variant_id, object_id in stale_pairs:
            by_variant[variant_id].append(object_id)
        assignment_service = ElectricalAssignmentService(self.db)
        for variant_id, affected_object_ids in by_variant.items():
            await assignment_service.mark_assignments_stale(
                project_id,
                variant_id,
                affected_object_ids,
                reason="project_section_current_limit_changed",
                operation="project_electrical_settings_patch",
            )

    @staticmethod
    def _uses_project_current_limit(result: dict | None) -> bool:
        """Treat unknown/legacy provenance as dependent; exempt proven overrides."""
        if not isinstance(result, dict):
            return True
        provenance = result.get("provenance")
        provenance = provenance if isinstance(provenance, dict) else {}
        sources = result.get("input_sources")
        if not isinstance(sources, dict):
            sources = provenance.get("input_sources")
        if not isinstance(sources, dict):
            return True
        return sources.get("max_section_start_current_a") not in {
            "assignment_override",
            "explicit_request",
        }
