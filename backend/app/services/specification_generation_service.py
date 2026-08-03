"""Canonical project-scoped specification generation orchestration.

Production entry for ``POST /api/v1/specifications/{project_id}/generate``.

Does not import or call the legacy specification builders.
BOM materialization goes through :func:`materialize_specification_bom`.
"""

from __future__ import annotations

from collections.abc import Mapping
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from sqlalchemy import select
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
            except Exception as exc:
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

        contributing, objects_by_id, input_revisions = await self._load_contributing_context(
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

        variant = await self.db.get(ElectricalVariant, current.electrical_variant_id)
        project = await self.db.get(Project, project_id)
        if variant is None or project is None:
            return self._blocked(
                current.electrical_variant_id,
                current.electrical_variant_name,
                SpecificationDiagnosticCode.GENERATION_CONFLICT,
                "ЭР или проект исчезли до сохранения спецификации",
                issues=[{"reason": "snapshot_owner_missing"}],
            )
        assert current.fingerprint_schema is not None
        snapshot_context = {
            "variant_revision": {
                "updated_at": _snapshot_value(variant.updated_at),
            },
            "settings_revision": int(project.specification_settings_version),
            "input_revisions": input_revisions,
            "fingerprint_schema": current.fingerprint_schema,
        }

        bom = materialize_specification_bom(
            electrical_variant_id=current.electrical_variant_id,
            contributing_results=contributing,
            objects_by_id=objects_by_id,
            catalog=catalog,
            candidate_groups=current.candidate_groups,
            resolved_options=current.resolved_options,
            snapshot_context=snapshot_context,
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
        try:
            manual_items = _extract_manual_items(existing)
        except ManualItemValidationError as exc:
            return self._blocked(
                current.electrical_variant_id,
                current.electrical_variant_name,
                SpecificationDiagnosticCode.FORMULA_INPUT_INVALID,
                "Сохранённые ручные позиции повреждены; перегенерация отменена",
                issues=exc.issues,
            )
        all_items = list(bom.items) + manual_items
        items_payload = [item.model_dump(mode="json") for item in all_items]

        await SpecificationService(self.db)._upsert_specification(
            project_id=project_id,
            items_payload=items_payload,
            snapshot=bom.snapshot,
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
    ) -> tuple[
        list[dict[str, Any]],
        dict[str, dict[str, Any]],
        list[dict[str, Any]],
    ]:
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
        input_revisions: list[dict[str, Any]] = []
        for assignment, obj, calculation in result.all():
            objects_by_id[str(obj.id)] = {
                "object_type": str(getattr(obj.object_type, "value", obj.object_type)),
                "outer_diameter": (obj.params or {}).get("outer_diameter")
                or (obj.params or {}).get("diameter"),
                "params": dict(obj.params or {}),
            }
            calculation_result = (
                calculation.results
                if calculation is not None and isinstance(calculation.results, Mapping)
                else {}
            )
            provenance = calculation_result.get("provenance")
            provenance = provenance if isinstance(provenance, Mapping) else {}
            section_plan = calculation_result.get("section_plan")
            section_plan = section_plan if isinstance(section_plan, Mapping) else None
            input_revisions.append(
                {
                    "object": {
                        "id": str(obj.id),
                        "version": obj.version,
                    },
                    "assignment": {
                        "id": str(assignment.id),
                        "version": assignment.version,
                        "object_version_snapshot": assignment.object_version_snapshot,
                        "state": assignment.assignment_state,
                        "system_type": assignment.system_type,
                    },
                    "electrical_result": (
                        {
                            "id": str(calculation.id),
                            "updated_at": _snapshot_value(calculation.updated_at),
                            "formula_version": provenance.get("formula_version"),
                            "formula_fingerprint": provenance.get("formula_fingerprint"),
                            "calculation_fingerprint": provenance.get(
                                "calculation_fingerprint"
                            ),
                            "object_version": provenance.get("object_version"),
                            "heat_result_version": provenance.get("heat_result_version"),
                            "assignment_version": provenance.get("assignment_version"),
                        }
                        if calculation is not None
                        else None
                    ),
                    "section_plan_revision": (
                        {
                            "payload": _snapshot_value(section_plan),
                            "calculation_fingerprint": provenance.get(
                                "calculation_fingerprint"
                            ),
                            "result_updated_at": (
                                _snapshot_value(calculation.updated_at)
                                if calculation is not None
                                else None
                            ),
                        }
                        if section_plan is not None
                        else None
                    ),
                    "excluded": obj.id in excluded,
                }
            )
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
        return contributing, objects_by_id, input_revisions

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


class ManualItemValidationError(ValueError):
    def __init__(self, issues: list[dict[str, Any]]) -> None:
        super().__init__("stored manual specification items are invalid")
        self.issues = issues


def _extract_manual_items(existing: Specification | None) -> list[SpecificationItem]:
    if existing is None or not existing.items:
        return []
    manual: list[SpecificationItem] = []
    issues: list[dict[str, Any]] = []
    for index, raw in enumerate(existing.items):
        if not isinstance(raw, dict) or raw.get("source") != "manual":
            continue
        try:
            manual.append(SpecificationItem(**raw))
        except Exception as exc:  # Pydantic error is intentionally kept behind this boundary.
            issues.append(
                {
                    "reason": "invalid_stored_manual_item",
                    "item_index": index,
                    "error": type(exc).__name__,
                }
            )
    if issues:
        raise ManualItemValidationError(issues)
    return manual


def _snapshot_value(value: Any) -> Any:
    if isinstance(value, datetime):
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("snapshot datetime must be timezone-aware")
        return value.astimezone(UTC).isoformat().replace("+00:00", "Z")
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, Mapping):
        return {str(key): _snapshot_value(item) for key, item in value.items()}
    if isinstance(value, list | tuple):
        return [_snapshot_value(item) for item in value]
    return value
