"""Read-only UUID data plane for specification preflight."""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Mapping, Sequence
from typing import Any, cast
from uuid import UUID

from heatcalc_specification_core.preflight import CatalogIdentity as CoreCatalogIdentity
from heatcalc_specification_core.preflight.fingerprint import preflight_fingerprint
from pydantic import ValidationError
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import CurrentPrincipal
from app.models.electrical_calculation import ElectricalCalculation
from app.models.electrical_variant import ElectricalVariant, ElectricalVariantObject
from app.models.project_object import ProjectObject
from app.schemas.specification import (
    SpecificationCatalogSnapshot,
    SpecificationDiagnostic,
    SpecificationDiagnosticCode,
    SpecificationGenerationRequest,
    SpecificationIssueKind,
    SpecificationPreflightStatus,
    SpecificationRequestedOptions,
    SpecificationResolvedOptions,
    SpecificationVariantPreflightResult,
)
from app.services.project_service import ProjectService
from app.services.specification_candidate_service import (
    build_candidate_groups,
    candidate_groups_fingerprint_payload,
    catalog_selections_for_variant,
)
from app.services.specification_catalog_service import (
    ResolvedSpecificationCatalog,
    SpecificationCatalogService,
    SpecificationCatalogServiceError,
)
from app.services.specification_preflight_rules import (
    ImmutableSpecificationCatalog,
    ImmutableSpecificationCatalogItem,
    SpecificationPreflightAssignment,
    evaluate_specification_preflight,
    to_core_preflight_assignment,
)

_FINGERPRINT_SCHEMA = "specification-preflight/v1"


class SpecificationPreflightServiceError(Exception):
    """Canonical request/scope failure before per-ER evaluation is possible."""

    def __init__(
        self,
        code: SpecificationDiagnosticCode,
        message: str,
        *,
        status_code: int,
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details = details or {}

    def as_detail(self) -> dict[str, Any]:
        return {
            "code": self.code.value,
            "message": self.message,
            "issues": [],
            "details": dict(self.details),
        }


class SpecificationPreflightService:
    """Build independent preflight results from exact UUID-scoped snapshots."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def preflight_variants(
        self,
        project_id: UUID,
        principal: CurrentPrincipal,
        request: SpecificationGenerationRequest,
        *,
        include_candidate_selection: bool = True,
    ) -> list[SpecificationVariantPreflightResult]:
        await ProjectService(self.db).get_project_basic(project_id, principal)
        variants = await self._variants(project_id, request.variant_ids)
        rows_by_variant = await self._assignment_rows(project_id, request.variant_ids)

        catalog, catalog_error = await self._catalog(request.options)
        catalog_snapshot = _catalog_snapshot(catalog) if catalog is not None else None
        immutable_catalog = _immutable_catalog(catalog) if catalog is not None else None
        resolved_options, options_diagnostic = _resolve_options(
            request.options,
            catalog,
        )

        results: list[SpecificationVariantPreflightResult] = []
        for variant_id in request.variant_ids:
            variant = variants[variant_id]
            rows = rows_by_variant.get(variant_id, [])
            assignments = [_preflight_assignment(*row) for row in rows]
            base = evaluate_specification_preflight(
                electrical_variant_id=variant.id,
                electrical_variant_name=variant.name,
                assignments=assignments,
                catalog=immutable_catalog,
                exclude_unassigned_confirmed=request.exclude_unassigned_confirmed,
            )
            diagnostics = list(base.diagnostics)
            if catalog_error is not None:
                diagnostics = [
                    item
                    for item in diagnostics
                    if item.code != SpecificationDiagnosticCode.CATALOG_UNAVAILABLE
                ]
                diagnostics.insert(0, catalog_error)
            if options_diagnostic is not None:
                diagnostics.append(options_diagnostic)

            candidate_groups = []
            variant_catalog_selections: dict[str, UUID] = catalog_selections_for_variant(
                dict(request.catalog_selections or {}),
                variant.id,
                request.variant_ids,
            )
            # Selection protocol runs only when catalog is resolved and at least
            # one object contributes conditions (excluded unassigned stay out).
            if (
                include_candidate_selection
                and catalog is not None
                and base.contributing_objects > 0
            ):
                contributing_results = _contributing_results(
                    assignments=assignments,
                    base_diagnostics=base.diagnostics,
                    excluded_unassigned_object_ids=base.excluded_unassigned_object_ids,
                )
                if contributing_results:
                    from app.services.specification_selection_service import (
                        SpecificationSelectionService,
                    )

                    # Pass 1: candidate-set fingerprints do not depend on selection.
                    probe = build_candidate_groups(
                        electrical_variant_id=variant.id,
                        catalog=catalog,
                        contributing_results=contributing_results,
                        catalog_selections={},
                    )
                    group_fingerprints = {
                        group.group_key: group.candidate_set_fingerprint
                        for group in probe.groups
                        if group.candidate_set_fingerprint
                    }
                    # Fail-closed: drop stored choices whose candidate set moved.
                    stored_map = await SpecificationSelectionService(self.db).as_selection_map(
                        project_id,
                        variant.id,
                        catalog_version_id=catalog.version.id,
                        group_fingerprints=group_fingerprints,
                    )
                    # Request overrides server store; store fills remaining multi gaps.
                    merged_selections = {
                        **stored_map,
                        **dict(request.catalog_selections or {}),
                    }
                    variant_catalog_selections = catalog_selections_for_variant(
                        merged_selections,
                        variant.id,
                        request.variant_ids,
                    )
                    built = build_candidate_groups(
                        electrical_variant_id=variant.id,
                        catalog=catalog,
                        contributing_results=contributing_results,
                        catalog_selections=variant_catalog_selections,
                    )
                    candidate_groups = built.groups
                    diagnostics.extend(built.diagnostics)

            status = _status_for(diagnostics)
            fingerprint = None
            if status is SpecificationPreflightStatus.READY:
                assert catalog_snapshot is not None
                assert resolved_options is not None
                fingerprint = _input_fingerprint(
                    project_id=project_id,
                    variant_id=variant.id,
                    assignments=assignments,
                    resolved_options=resolved_options,
                    catalog=catalog_snapshot,
                    catalog_selections=variant_catalog_selections,
                    candidate_groups=candidate_groups,
                    excluded_unassigned_object_ids=base.excluded_unassigned_object_ids,
                )

            results.append(
                SpecificationVariantPreflightResult(
                    electrical_variant_id=variant.id,
                    electrical_variant_name=variant.name,
                    status=status,
                    total_objects=base.total_objects,
                    contributing_objects=base.contributing_objects,
                    unassigned_object_ids=base.unassigned_object_ids,
                    excluded_unassigned_object_ids=(base.excluded_unassigned_object_ids),
                    diagnostics=diagnostics,
                    resolved_options=resolved_options,
                    catalog=catalog_snapshot,
                    catalog_selections=variant_catalog_selections,
                    candidate_groups=candidate_groups,
                    fingerprint_schema=_FINGERPRINT_SCHEMA if fingerprint else None,
                    input_fingerprint=fingerprint,
                )
            )
        return results

    async def _variants(
        self,
        project_id: UUID,
        requested: Sequence[UUID],
    ) -> dict[UUID, ElectricalVariant]:
        result = await self.db.execute(
            select(ElectricalVariant).where(
                ElectricalVariant.project_id == project_id,
                ElectricalVariant.id.in_(requested),
            )
        )
        by_id = {variant.id: variant for variant in result.scalars().all()}
        missing = [variant_id for variant_id in requested if variant_id not in by_id]
        if missing:
            raise SpecificationPreflightServiceError(
                SpecificationDiagnosticCode.VARIANT_NOT_FOUND,
                "Один или несколько ЭР не найдены в проекте",
                status_code=404,
                details={"missing_variant_ids": [str(item) for item in missing]},
            )
        return by_id

    async def _assignment_rows(
        self,
        project_id: UUID,
        requested: Sequence[UUID],
    ) -> dict[
        UUID,
        list[tuple[ElectricalVariantObject, ProjectObject, ElectricalCalculation | None]],
    ]:
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
                ElectricalVariantObject.electrical_variant_id.in_(requested),
            )
            .order_by(
                ElectricalVariantObject.electrical_variant_id,
                ProjectObject.sort_order,
                ProjectObject.id,
            )
        )
        by_variant: defaultdict[
            UUID,
            list[tuple[ElectricalVariantObject, ProjectObject, ElectricalCalculation | None]],
        ] = defaultdict(list)
        for assignment, obj, calculation in result.all():
            by_variant[assignment.electrical_variant_id].append((assignment, obj, calculation))
        return dict(by_variant)

    async def _catalog(
        self,
        options: SpecificationRequestedOptions,
    ) -> tuple[ResolvedSpecificationCatalog | None, SpecificationDiagnostic | None]:
        catalog_id, catalog_version = _resolve_catalog_pin(options)
        try:
            catalog = await SpecificationCatalogService(self.db).resolve_active(
                catalog_id=catalog_id,
                catalog_version=catalog_version,
            )
        except SpecificationCatalogServiceError as exc:
            try:
                code = SpecificationDiagnosticCode(exc.code)
            except ValueError:
                code = SpecificationDiagnosticCode.CATALOG_UNAVAILABLE
            return None, _diagnostic(
                code,
                SpecificationIssueKind.BLOCKING,
                exc.message,
                issues=list(exc.details.get("issues", [])),
                details={key: value for key, value in exc.details.items() if key != "issues"},
            )
        return catalog, None


def _preflight_assignment(
    assignment: ElectricalVariantObject,
    obj: ProjectObject,
    calculation: ElectricalCalculation | None,
) -> SpecificationPreflightAssignment:
    """Convert one exact join row; no legacy numeric fallback is possible here."""
    return SpecificationPreflightAssignment(
        assignment_id=assignment.id,
        calculation_id=calculation.id if calculation is not None else None,
        calculation_updated_at=(calculation.updated_at if calculation is not None else None),
        object_id=obj.id,
        object_type=str(getattr(obj.object_type, "value", obj.object_type)),
        object_is_valid=obj.is_valid,
        assignment_state=assignment.assignment_state,
        system_type=assignment.system_type,
        object_version=obj.version,
        assignment_version=assignment.version,
        assignment_object_version=assignment.object_version_snapshot,
        assignment_diagnostics=dict(assignment.diagnostics or {}),
        result=(dict(calculation.results or {}) if calculation is not None else None),
    )


def _catalog_snapshot(
    catalog: ResolvedSpecificationCatalog,
) -> SpecificationCatalogSnapshot:
    version = catalog.version
    return SpecificationCatalogSnapshot(
        id=version.id,
        catalog_key=version.catalog_key,
        version=version.version,
        source_checksum=version.source_checksum,
        payload_checksum=version.payload_checksum,
        schema_version=version.schema_version,
    )


def _immutable_catalog(
    catalog: ResolvedSpecificationCatalog,
) -> ImmutableSpecificationCatalog:
    version = catalog.version
    return ImmutableSpecificationCatalog(
        catalog_id=version.id,
        version=version.version,
        checksum=version.payload_checksum,
        is_active=version.status == "active",
        is_complete=version.is_complete,
        authority=version.authority,
        items=tuple(
            ImmutableSpecificationCatalogItem(
                item_id=item.id,
                category=item.category,
                mark=item.mark,
                nomenclature_code=item.nomenclature_code,
            )
            for item in catalog.items
        ),
        completeness_issues=tuple(version.validation_issues),
    )


def _resolve_catalog_pin(
    requested: SpecificationRequestedOptions,
) -> tuple[UUID | str | None, str | None]:
    """Resolve request catalog pin; empty means the unique active default."""
    catalog_id = requested.catalog_id
    catalog_version = requested.catalog_version
    if isinstance(catalog_version, str):
        catalog_version = catalog_version.strip() or None
    return catalog_id, catalog_version


def _resolve_options(
    requested: SpecificationRequestedOptions,
    catalog: ResolvedSpecificationCatalog | None,
) -> tuple[SpecificationResolvedOptions | None, SpecificationDiagnostic | None]:
    values: dict[str, Any] = {
        "catalog_id": catalog.version.id if catalog is not None else None,
        "catalog_version": catalog.version.version if catalog is not None else None,
        "grouping_mode": requested.grouping_mode,
        "Ex": requested.ex,
        "K1i": requested.k1i,
        "K2i": requested.k2i,
        "Kiu": requested.kiu,
        "L_K2i_m": requested.l_k2i_m,
        "R_gr": requested.r_gr,
    }
    missing = sorted(key for key, value in values.items() if value is None)
    if missing:
        return None, _diagnostic(
            SpecificationDiagnosticCode.FORMULA_INPUT_INVALID,
            SpecificationIssueKind.BLOCKING,
            "Не разрешены обязательные настройки спецификации",
            issues=[{"reason": "required_option_unresolved", "field": field} for field in missing],
        )
    try:
        return SpecificationResolvedOptions.model_validate(values), None
    except ValidationError as exc:
        fields = sorted(
            {
                ".".join(str(component) for component in error["loc"])
                for error in exc.errors(include_url=False, include_input=False)
            }
        )
        return None, _diagnostic(
            SpecificationDiagnosticCode.FORMULA_INPUT_INVALID,
            SpecificationIssueKind.BLOCKING,
            "Настройки спецификации не прошли валидацию",
            issues=[{"reason": "resolved_option_invalid", "field": field} for field in fields],
        )


def _contributing_results(
    *,
    assignments: Sequence[SpecificationPreflightAssignment],
    base_diagnostics: Sequence[SpecificationDiagnostic],
    excluded_unassigned_object_ids: Sequence[UUID],
) -> list[Mapping[str, Any]]:
    """Results that feed candidate conditions (confirmed-excluded unassigned stay out)."""
    excluded = set(excluded_unassigned_object_ids)
    blocked_object_ids: set[str] = set()
    for diagnostic in base_diagnostics:
        object_id = diagnostic.details.get("object_id")
        if isinstance(object_id, str):
            blocked_object_ids.add(object_id)
    results: list[Mapping[str, Any]] = []
    for row in assignments:
        if row.object_id in excluded:
            continue
        if row.assignment_state == "unassigned":
            continue
        if str(row.object_id) in blocked_object_ids:
            continue
        if not isinstance(row.result, Mapping):
            continue
        results.append(row.result)
    return results


def _input_fingerprint(
    *,
    project_id: UUID,
    variant_id: UUID,
    assignments: Sequence[SpecificationPreflightAssignment],
    resolved_options: SpecificationResolvedOptions,
    catalog: SpecificationCatalogSnapshot,
    catalog_selections: Mapping[str, UUID],
    candidate_groups: Sequence[Any],
    excluded_unassigned_object_ids: Sequence[UUID],
) -> str:
    return cast(
        str,
        preflight_fingerprint(
            project_id=project_id,
            electrical_variant_id=variant_id,
            assignments=tuple(to_core_preflight_assignment(row) for row in assignments),
            catalog=CoreCatalogIdentity(
                catalog_id=catalog.id,
                catalog_key=catalog.catalog_key,
                version=catalog.version,
                source_checksum=catalog.source_checksum,
                payload_checksum=catalog.payload_checksum,
                schema_version=catalog.schema_version,
            ),
            resolved_options=resolved_options.model_dump(mode="json", by_alias=True),
            catalog_selections=catalog_selections,
            candidate_groups=candidate_groups_fingerprint_payload(candidate_groups),
            excluded_unassigned_object_ids=excluded_unassigned_object_ids,
        ),
    )


def _status_for(
    diagnostics: Sequence[SpecificationDiagnostic],
) -> SpecificationPreflightStatus:
    kinds = {item.kind for item in diagnostics}
    if SpecificationIssueKind.BLOCKING in kinds:
        return SpecificationPreflightStatus.BLOCKED
    if SpecificationIssueKind.SELECTION_REQUIRED in kinds:
        return SpecificationPreflightStatus.SELECTION_REQUIRED
    if SpecificationIssueKind.CONFIRMABLE in kinds:
        return SpecificationPreflightStatus.CONFIRMATION_REQUIRED
    return SpecificationPreflightStatus.READY


def _diagnostic(
    code: SpecificationDiagnosticCode,
    kind: SpecificationIssueKind,
    message: str,
    *,
    issues: list[dict[str, Any]] | None = None,
    details: dict[str, Any] | None = None,
) -> SpecificationDiagnostic:
    return SpecificationDiagnostic(
        code=code,
        kind=kind,
        message=message,
        issues=issues or [],
        details=details or {},
    )
