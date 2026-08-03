"""Canonical project-scoped specification generation orchestration."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import CurrentPrincipal
from app.models.electrical_variant import ElectricalVariant
from app.models.project import Project
from app.models.project_object import ProjectObject
from app.models.specification import Specification
from app.schemas.specification import (
    SpecificationDiagnostic,
    SpecificationDiagnosticCode,
    SpecificationGenerationRequest,
    SpecificationGenerationResponse,
    SpecificationGenerationStatus,
    SpecificationIssueKind,
    SpecificationItem,
    SpecificationPreflightStatus,
    SpecificationRequestedOptions,
    SpecificationSettingsResponse,
    SpecificationVariantGenerationResult,
    SpecificationVariantPreflightResult,
)
from app.services.specification_bom_builder import (
    BomBuildFailure,
    BomBuildSuccess,
    materialize_specification_bom,
)
from app.services.specification_catalog_service import (
    SpecificationCatalogService,
    SpecificationCatalogServiceError,
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

        has_ready = any(item.status is SpecificationPreflightStatus.READY for item in preflight)
        if has_ready:
            await SpecificationService(self.db)._lock_project(project_id)

        wrote_any = False
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

            # Per-ER savepoint: one blocked/failed ER must not undo another generated.
            try:
                async with self.db.begin_nested():
                    outcome = await self._generate_ready_variant(
                        project_id=project_id,
                        principal=principal,
                        request=request,
                        original=item,
                    )
                    if outcome.status is SpecificationGenerationStatus.GENERATED:
                        wrote_any = True
                    results.append(outcome)
            except Exception as exc:  # noqa: BLE001 — fail closed for this ER only
                # Nested transaction rolled back; no partial auto rows for this ER.
                results.append(
                    self._blocked(
                        item.electrical_variant_id,
                        item.electrical_variant_name,
                        SpecificationDiagnosticCode.FORMULA_INPUT_INVALID,
                        f"Ошибка формирования BOM: {exc}",
                        issues=[{"reason": "generation_exception", "error": type(exc).__name__}],
                    )
                )

        if wrote_any:
            await self.db.commit()

        return SpecificationGenerationResponse(
            project_id=project_id,
            settings_version=settings_version,
            results=results,
        )

    async def _generate_ready_variant(
        self,
        *,
        project_id: UUID,
        principal: CurrentPrincipal,
        request: SpecificationGenerationRequest,
        original: SpecificationVariantPreflightResult,
    ) -> SpecificationVariantGenerationResult:
        """Re-check preflight under lock, materialize BOM, upsert by UUID identity."""
        single_request = SpecificationGenerationRequest(
            variant_ids=[original.electrical_variant_id],
            options=request.options,
            exclude_unassigned_confirmed=request.exclude_unassigned_confirmed,
            catalog_selections=request.catalog_selections,
        )
        rechecked = await SpecificationPreflightService(self.db).preflight_variants(
            project_id, principal, single_request
        )
        if not rechecked:
            return self._blocked(
                original.electrical_variant_id,
                original.electrical_variant_name,
                SpecificationDiagnosticCode.VARIANT_NOT_READY,
                "Повторный preflight не вернул результат для ЭР",
            )
        current = rechecked[0]

        if current.status is not SpecificationPreflightStatus.READY:
            return SpecificationVariantGenerationResult(
                electrical_variant_id=current.electrical_variant_id,
                electrical_variant_name=current.electrical_variant_name,
                status=SpecificationGenerationStatus(current.status.value),
                excluded_unassigned_object_ids=current.excluded_unassigned_object_ids,
                diagnostics=current.diagnostics,
                candidate_groups=list(current.candidate_groups),
            )

        if (
            current.input_fingerprint is None
            or original.input_fingerprint is None
            or current.input_fingerprint != original.input_fingerprint
        ):
            return SpecificationVariantGenerationResult(
                electrical_variant_id=current.electrical_variant_id,
                electrical_variant_name=current.electrical_variant_name,
                status=SpecificationGenerationStatus.BLOCKED,
                excluded_unassigned_object_ids=current.excluded_unassigned_object_ids,
                candidate_groups=list(current.candidate_groups),
                diagnostics=[
                    SpecificationDiagnostic(
                        code=SpecificationDiagnosticCode.GENERATION_CONFLICT,
                        kind=SpecificationIssueKind.BLOCKING,
                        message=(
                            "Входные данные ЭР изменились между preflight и генерацией; "
                            "запись отменена"
                        ),
                        issues=[{"reason": "preflight_fingerprint_mismatch"}],
                        details={
                            "electrical_variant_id": str(current.electrical_variant_id),
                            "original_fingerprint": original.input_fingerprint,
                            "current_fingerprint": current.input_fingerprint,
                        },
                    )
                ],
            )

        assert current.resolved_options is not None
        try:
            catalog = await SpecificationCatalogService(self.db).resolve_active(
                catalog_id=current.resolved_options.catalog_id,
                catalog_version=current.resolved_options.catalog_version,
            )
        except SpecificationCatalogServiceError as exc:
            try:
                code = SpecificationDiagnosticCode(exc.code)
            except ValueError:
                code = SpecificationDiagnosticCode.CATALOG_UNAVAILABLE
            return self._blocked(
                current.electrical_variant_id,
                current.electrical_variant_name,
                code,
                exc.message,
                issues=list(exc.details.get("issues", [])),
            )

        contributing, objects_by_id = await self._load_contributing_context(
            project_id=project_id,
            electrical_variant_id=current.electrical_variant_id,
            excluded_unassigned_object_ids=current.excluded_unassigned_object_ids,
        )
        if not contributing:
            return self._blocked(
                current.electrical_variant_id,
                current.electrical_variant_name,
                SpecificationDiagnosticCode.VARIANT_NOT_READY,
                "Нет contributing electrical results для формирования BOM",
            )

        bom = materialize_specification_bom(
            electrical_variant_id=current.electrical_variant_id,
            contributing_results=contributing,
            objects_by_id=objects_by_id,
            catalog=catalog,
            candidate_groups=current.candidate_groups,
            resolved_options=current.resolved_options,
            preflight_fingerprint=current.input_fingerprint,
            excluded_unassigned_object_ids=current.excluded_unassigned_object_ids,
        )
        if isinstance(bom, BomBuildFailure):
            return SpecificationVariantGenerationResult(
                electrical_variant_id=current.electrical_variant_id,
                electrical_variant_name=current.electrical_variant_name,
                status=SpecificationGenerationStatus.BLOCKED,
                excluded_unassigned_object_ids=current.excluded_unassigned_object_ids,
                diagnostics=bom.diagnostics,
                candidate_groups=list(current.candidate_groups),
            )

        assert isinstance(bom, BomBuildSuccess)
        existing = await SpecificationService(self.db).get_specification(
            project_id,
            electrical_variant_id=current.electrical_variant_id,
        )
        manual_items = _extract_manual_items(existing)
        all_items = list(bom.items) + manual_items
        items_payload = [item.model_dump(mode="json") for item in all_items]

        variant_number = await self._resolve_variant_number(
            project_id=project_id,
            electrical_variant_id=current.electrical_variant_id,
            existing=existing,
        )
        await SpecificationService(self.db)._upsert_specification(
            project_id=project_id,
            variant_number=variant_number,
            items_payload=items_payload,
            generation_mode="full",
            generation_options=bom.snapshot,
            electrical_variant_id=current.electrical_variant_id,
        )

        return SpecificationVariantGenerationResult(
            electrical_variant_id=current.electrical_variant_id,
            electrical_variant_name=current.electrical_variant_name,
            status=SpecificationGenerationStatus.GENERATED,
            items=all_items,
            excluded_unassigned_object_ids=current.excluded_unassigned_object_ids,
            diagnostics=[],
            candidate_groups=list(current.candidate_groups),
            snapshot=bom.snapshot,
        )

    async def _load_contributing_context(
        self,
        *,
        project_id: UUID,
        electrical_variant_id: UUID,
        excluded_unassigned_object_ids: list[UUID],
    ) -> tuple[list[dict[str, Any]], dict[str, dict[str, Any]]]:
        """Load assignment-scoped calculation results + object params for BOM."""
        from sqlalchemy import and_

        from app.models.electrical_calculation import ElectricalCalculation
        from app.models.electrical_variant import ElectricalVariantObject

        excluded = set(excluded_unassigned_object_ids)
        result = await self.db.execute(
            select(ElectricalVariantObject, ProjectObject, ElectricalCalculation)
            .join(
                ProjectObject,
                and_(
                    ProjectObject.id == ElectricalVariantObject.object_id,
                    ProjectObject.project_id == ElectricalVariantObject.project_id,
                ),
            )
            .outerjoin(
                ElectricalCalculation,
                and_(
                    ElectricalCalculation.project_id == ElectricalVariantObject.project_id,
                    ElectricalCalculation.object_id == ElectricalVariantObject.object_id,
                    ElectricalCalculation.electrical_variant_id
                    == ElectricalVariantObject.electrical_variant_id,
                ),
            )
            .where(
                ElectricalVariantObject.project_id == project_id,
                ElectricalVariantObject.electrical_variant_id == electrical_variant_id,
            )
            .order_by(ProjectObject.sort_order, ProjectObject.id)
        )

        contributing: list[dict[str, Any]] = []
        objects_by_id: dict[str, dict[str, Any]] = {}
        for assignment, obj, calculation in result.all():
            objects_by_id[str(obj.id)] = {
                "object_type": str(getattr(obj.object_type, "value", obj.object_type)),
                "outer_diameter": (obj.params or {}).get("outer_diameter")
                or (obj.params or {}).get("diameter"),
                "params": dict(obj.params or {}),
            }
            if obj.id in excluded:
                continue
            if assignment.assignment_state == "unassigned":
                continue
            if calculation is None or not isinstance(calculation.results, dict):
                continue
            payload = {
                **dict(calculation.results),
                "cable_mark": calculation.cable_mark,
                "cable_type": calculation.cable_type,
                "cable_snapshot": calculation.cable_snapshot,
                "object_id": str(obj.id),
            }
            contributing.append(payload)
        return contributing, objects_by_id

    async def _resolve_variant_number(
        self,
        *,
        project_id: UUID,
        electrical_variant_id: UUID,
        existing: Specification | None,
    ) -> int:
        """Prefer ER legacy slot, then existing row, else synthetic unique number."""
        if existing is not None and existing.variant_number is not None:
            return int(existing.variant_number)

        variant = await self.db.get(ElectricalVariant, electrical_variant_id)
        if variant is not None and variant.legacy_variant_number is not None:
            return int(variant.legacy_variant_number)

        max_number = await self.db.scalar(
            select(func.coalesce(func.max(Specification.variant_number), 0)).where(
                Specification.project_id == project_id
            )
        )
        return int(max_number or 0) + 1

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


def _extract_manual_items(existing: Specification | None) -> list[SpecificationItem]:
    if existing is None or not existing.items:
        return []
    manual: list[SpecificationItem] = []
    for raw in existing.items:
        if not isinstance(raw, dict) or raw.get("source") != "manual":
            continue
        try:
            manual.append(SpecificationItem(**raw))
        except Exception:
            continue
    return manual
