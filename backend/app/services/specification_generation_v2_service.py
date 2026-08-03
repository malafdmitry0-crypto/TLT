"""Canonical project-scoped specification generation orchestration."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import CurrentPrincipal
from app.models.electrical_variant import ElectricalVariant
from app.models.project import Project
from app.models.specification import Specification
from app.schemas.specification import (
    SpecificationDiagnostic,
    SpecificationDiagnosticCode,
    SpecificationGenerationRequestV2,
    SpecificationGenerationResponseV2,
    SpecificationGenerationStatus,
    SpecificationGroupingMode,
    SpecificationIssueKind,
    SpecificationPreflightStatus,
    SpecificationRequestedOptions,
    SpecificationSettingsResponse,
    SpecificationVariantGenerationResultV2,
)
from app.services.specification_preflight_service import SpecificationPreflightService
from app.services.specification_service import SpecificationService


def _settings_payload(settings: SpecificationRequestedOptions) -> dict[str, Any]:
    return settings.model_dump(mode="json", by_alias=True, exclude_none=True)


def _canonical_stored_settings(raw: object) -> dict[str, Any]:
    """Read old project settings without turning missing values into defaults."""
    if not isinstance(raw, dict):
        return {}
    aliases = {
        "Ex": ("Ex", "ex", "ex_zone"),
        "K1i": ("K1i", "k1i", "indication_on_boxes"),
        "K2i": ("K2i", "k2i", "end_section_indication"),
        "Kiu": ("Kiu", "kiu", "top_indication"),
        "L_K2i_m": ("L_K2i_m", "l_k2i_m", "min_length_for_end_indication"),
        "R_gr": ("R_gr", "r_gr", "reserve_coefficient"),
    }
    canonical = {
        key: raw[key]
        for key in ("catalog_id", "catalog_version", "grouping_mode")
        if key in raw and raw[key] is not None
    }
    if "grouping_mode" not in canonical and "merge_identical" in raw:
        canonical["grouping_mode"] = (
            SpecificationGroupingMode.MERGE_MATERIALS
            if raw["merge_identical"] is True
            else SpecificationGroupingMode.SEPARATE_BY_OBJECT_TYPE
        )
    for canonical_key, candidates in aliases.items():
        for candidate in candidates:
            if candidate in raw and raw[candidate] is not None:
                canonical[canonical_key] = raw[candidate]
                break
    return canonical


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


class SpecificationGenerationV2Service:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def generate(
        self,
        project_id: UUID,
        principal: CurrentPrincipal,
        request: SpecificationGenerationRequestV2,
    ) -> SpecificationGenerationResponseV2:
        preflight = await SpecificationPreflightService(self.db).preflight_variants(
            project_id, principal, request
        )
        project = await self.db.get(Project, project_id)
        assert project is not None
        settings_version = int(project.specification_settings_version or 1)
        variants_result = await self.db.execute(
            select(ElectricalVariant).where(
                ElectricalVariant.project_id == project_id,
                ElectricalVariant.id.in_(request.variant_ids),
            )
        )
        variants = {item.id: item for item in variants_result.scalars().all()}
        results: list[SpecificationVariantGenerationResultV2] = []
        generator = SpecificationService(self.db)

        for item in preflight:
            if item.status is not SpecificationPreflightStatus.READY:
                results.append(
                    SpecificationVariantGenerationResultV2(
                        electrical_variant_id=item.electrical_variant_id,
                        status=SpecificationGenerationStatus(item.status.value),
                        excluded_unassigned_object_ids=item.excluded_unassigned_object_ids,
                        diagnostics=item.diagnostics,
                    )
                )
                continue
            assert item.resolved_options is not None
            variant = variants[item.electrical_variant_id]
            if variant.legacy_variant_number is None:
                results.append(
                    self._blocked(
                        item.electrical_variant_id,
                        SpecificationDiagnosticCode.VARIANT_PROJECT_MISMATCH,
                        "Для выбранного ЭР отсутствует generation data plane",
                    )
                )
                continue
            async with self.db.begin_nested() as savepoint:
                generated = await generator.generate(
                    project_id,
                    variant.legacy_variant_number,
                    commit=False,
                    mode="full",
                    options=item.resolved_options,
                    electrical_variant_id=variant.id,
                )
                if generated.partial or generated.excluded_groups:
                    await savepoint.rollback()
                    diagnostic = generated.excluded_groups[0] if generated.excluded_groups else {}
                    results.append(
                        self._blocked(
                            variant.id,
                            self._diagnostic_code(diagnostic.get("error_code")),
                            str(diagnostic.get("message") or "Формирование заблокировано"),
                            issues=generated.excluded_groups,
                        )
                    )
                    continue
                snapshot = {
                    "schema": "specification-generation/v2",
                    "resolved_options": item.resolved_options.model_dump(
                        mode="json", by_alias=True
                    ),
                    "settings_version": settings_version,
                    "catalog": item.catalog.model_dump(mode="json") if item.catalog else None,
                    "catalog_selections": {
                        key: str(value) for key, value in request.catalog_selections.items()
                    },
                    "input_fingerprint": item.input_fingerprint,
                    "generated_at": datetime.now(UTC).isoformat(),
                }
                spec_result = await self.db.execute(
                    select(Specification).where(
                        Specification.project_id == project_id,
                        Specification.electrical_variant_id == variant.id,
                    )
                )
                spec = spec_result.scalars().one()
                spec.generation_options = snapshot
                results.append(
                    SpecificationVariantGenerationResultV2(
                        electrical_variant_id=variant.id,
                        status=SpecificationGenerationStatus.GENERATED,
                        items=generated.items,
                        excluded_unassigned_object_ids=item.excluded_unassigned_object_ids,
                        snapshot=snapshot,
                    )
                )

        await self.db.commit()
        return SpecificationGenerationResponseV2(
            project_id=project_id,
            settings_version=settings_version,
            results=results,
        )

    @staticmethod
    def _diagnostic_code(raw: object) -> SpecificationDiagnosticCode:
        try:
            return SpecificationDiagnosticCode(str(raw))
        except ValueError:
            return SpecificationDiagnosticCode.FORMULA_INPUT_INVALID

    @staticmethod
    def _blocked(
        variant_id: UUID,
        code: SpecificationDiagnosticCode,
        message: str,
        *,
        issues: list[dict[str, Any]] | None = None,
    ) -> SpecificationVariantGenerationResultV2:
        return SpecificationVariantGenerationResultV2(
            electrical_variant_id=variant_id,
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
