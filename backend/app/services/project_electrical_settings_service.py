"""Persistence and optimistic updates for project electrical settings."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import CurrentPrincipal
from app.models.project_electrical_settings import ProjectElectricalSettings
from app.schemas.project_electrical_settings import ProjectElectricalSettingsPatch
from app.services.audit_service import AuditService
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
        settings.max_section_start_current_a = data.max_section_start_current_a
        settings.version += 1
        settings.updated_by = _principal_reference(principal)
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
