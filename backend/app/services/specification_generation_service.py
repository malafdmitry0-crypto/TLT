"""Canonical project-scoped specification generation orchestration."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import CurrentPrincipal
from app.models.project import Project
from app.schemas.specification import (
    SpecificationDiagnostic,
    SpecificationDiagnosticCode,
    SpecificationGenerationRequest,
    SpecificationGenerationResponse,
    SpecificationGenerationStatus,
    SpecificationIssueKind,
    SpecificationPreflightStatus,
    SpecificationRequestedOptions,
    SpecificationSettingsResponse,
    SpecificationVariantGenerationResult,
)
from app.services.specification_preflight_service import (
    SpecificationPreflightService,
    SpecificationPreflightServiceError,
)
from app.services.specification_service import SpecificationService


def _settings_payload(settings: SpecificationRequestedOptions) -> dict[str, Any]:
    return settings.model_dump(mode="json", by_alias=True, exclude_none=True)


def _canonical_stored_settings(raw: object) -> dict[str, Any]:
    """Read canonical project settings without turning missing values into defaults."""
    if not isinstance(raw, dict):
        return {}
    return {
        key: raw[key]
        for key in ("catalog_id", "catalog_version", "grouping_mode", "Ex", "K1i", "K2i", "Kiu", "L_K2i_m", "R_gr")
        if key in raw and raw[key] is not None
    }


class SpecificationProjectSettingsService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get(self, project_id: UUID) -> SpecificationSettingsResponse:
        project = await self.db.get(Project, project_id)
        if project is None:
            raise ValueError(f"Project {project_id} not found")
        settings = SpecificationRequestedOptions.model_validate(
            _canonical_stored_settings(project.specification_settings)
        )
        return SpecificationSettingsResponse(
            project_id=project_id,
            version=int(project.specification_settings_version or 1),
            settings=settings,
        )

    async def update(
        self,
        project_id: UUID,
        settings: SpecificationRequestedOptions,
    ) -> SpecificationSettingsResponse:
        await self.db.execute(
            select(Project)
            .where(Project.id == project_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        project = await self.db.get(Project, project_id)
        if project is None:
            raise ValueError(f"Project {project_id} not found")
        payload = _settings_payload(settings)
        old_payload = _canonical_stored_settings(project.specification_settings)
        version = int(project.specification_settings_version or 1)
        if payload != old_payload:
            version += 1
            project.specification_settings = payload
            project.specification_settings_version = version
            await SpecificationService(self.db).mark_project_specifications_stale(
                project_id,
                "specification_settings_changed",
                operation="settings_update",
            )
            await self.db.commit()
        return SpecificationSettingsResponse(
            project_id=project_id,
            version=version,
            settings=settings,
        )


class SpecificationGenerationService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def generate(
        self,
        project_id: UUID,
        principal: CurrentPrincipal,
        request: SpecificationGenerationRequest,
    ) -> SpecificationGenerationResponse:
        preflight = await SpecificationPreflightService(self.db).preflight_variants(
            project_id, principal, request
        )
        if all(
            any(
                diagnostic.code is SpecificationDiagnosticCode.CATALOG_UNAVAILABLE
                for diagnostic in item.diagnostics
            )
            for item in preflight
        ):
            raise SpecificationPreflightServiceError(
                SpecificationDiagnosticCode.CATALOG_UNAVAILABLE,
                "Нет разрешимой active approved complete версии каталога спецификации",
                status_code=503,
            )
        project = await self.db.get(Project, project_id)
        assert project is not None
        settings_version = int(project.specification_settings_version or 1)
        results: list[SpecificationVariantGenerationResult] = []

        for item in preflight:
            if item.status is not SpecificationPreflightStatus.READY:
                results.append(
                    SpecificationVariantGenerationResult(
                        electrical_variant_id=item.electrical_variant_id,
                        electrical_variant_name=item.electrical_variant_name,
                        status=SpecificationGenerationStatus(item.status.value),
                        excluded_unassigned_object_ids=item.excluded_unassigned_object_ids,
                        diagnostics=item.diagnostics,
                        candidate_groups=list(item.candidate_groups),
                    )
                )
                continue
            # Auto-selected groups are ready for calculators (CANON-06); fail closed.
            results.append(
                SpecificationVariantGenerationResult(
                    electrical_variant_id=item.electrical_variant_id,
                    electrical_variant_name=item.electrical_variant_name,
                    status=SpecificationGenerationStatus.BLOCKED,
                    excluded_unassigned_object_ids=item.excluded_unassigned_object_ids,
                    candidate_groups=list(item.candidate_groups),
                    diagnostics=[
                        SpecificationDiagnostic(
                            code=SpecificationDiagnosticCode.CANONICAL_CALCULATORS_UNAVAILABLE,
                            kind=SpecificationIssueKind.BLOCKING,
                            message=(
                                "Канонические калькуляторы спецификации ещё не подключены; "
                                "формирование из provisional/static builder запрещено"
                            ),
                        )
                    ],
                )
            )

        return SpecificationGenerationResponse(
            project_id=project_id,
            settings_version=settings_version,
            results=results,
        )

    @staticmethod
    def _blocked(
        variant_id: UUID,
        variant_name: str | None,
        code: SpecificationDiagnosticCode,
        message: str,
        *,
        issues: list[dict[str, Any]] | None = None,
    ) -> SpecificationVariantGenerationResult:
        return SpecificationVariantGenerationResult(
            electrical_variant_id=variant_id,
            electrical_variant_name=variant_name,
            status=SpecificationGenerationStatus.BLOCKED,
            diagnostics=[
                SpecificationDiagnostic(
                    code=code,
                    kind=SpecificationIssueKind.BLOCKING,
                    message=message,
                    issues=issues or [],
                )
            ],
        )
