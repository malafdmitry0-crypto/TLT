"""Read-only UUID data plane for specification preflight."""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Mapping, Sequence
from datetime import UTC, datetime
from decimal import Decimal, InvalidOperation
from typing import Any
from uuid import UUID

from pydantic import ValidationError
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import CurrentPrincipal
from app.models.electrical_calculation import ElectricalCalculation
from app.models.electrical_variant import ElectricalVariant, ElectricalVariantObject
from app.models.project import Project
from app.models.project_object import ProjectObject
from app.schemas.specification import (
    SpecificationCatalogSnapshot,
    SpecificationDiagnostic,
    SpecificationDiagnosticCode,
    SpecificationGenerationRequest,
    SpecificationGroupingMode,
    SpecificationIssueKind,
    SpecificationPreflightStatus,
    SpecificationRequestedOptions,
    SpecificationResolvedOptions,
    SpecificationVariantPreflightResult,
)
from app.services.project_service import ProjectService
from app.services.specification_catalog_service import (
    ResolvedSpecificationCatalog,
    SpecificationCatalogService,
    SpecificationCatalogServiceError,
)
from app.services.specification_preflight_rules import (
    ImmutableSpecificationCatalog,
    ImmutableSpecificationCatalogItem,
    SpecificationPreflightAssignment,
    canonical_fingerprint,
    evaluate_specification_preflight,
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
    ) -> list[SpecificationVariantPreflightResult]:
        project = await ProjectService(self.db).get_project_basic(project_id, principal)
        variants = await self._variants(project_id, request.variant_ids)
        rows_by_variant = await self._assignment_rows(project_id, request.variant_ids)

        catalog, catalog_error = await self._catalog(request.options)
        catalog_snapshot = _catalog_snapshot(catalog) if catalog is not None else None
        immutable_catalog = _immutable_catalog(catalog) if catalog is not None else None
        resolved_options, options_diagnostic = _resolve_options(
            project,
            request.options,
            catalog,
        )
        selection_diagnostic = _selection_diagnostic(request, catalog)

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
            if not rows:
                diagnostics.append(
                    _diagnostic(
                        SpecificationDiagnosticCode.VARIANT_NOT_READY,
                        SpecificationIssueKind.BLOCKING,
                        "В выбранном ЭР нет assignment snapshot",
                        issues=[{"reason": "variant_has_no_assignments"}],
                        details={"electrical_variant_id": str(variant.id)},
                    )
                )
            if options_diagnostic is not None:
                diagnostics.append(options_diagnostic)
            if selection_diagnostic is not None:
                diagnostics.append(selection_diagnostic)

            status = _status_for(diagnostics)
            fingerprint = None
            if status is SpecificationPreflightStatus.READY:
                assert catalog_snapshot is not None
                assert resolved_options is not None
                fingerprint = _input_fingerprint(
                    project_id=project_id,
                    project_settings_version=int(
                        getattr(project, "specification_settings_version", 1) or 1
                    ),
                    variant_id=variant.id,
                    rows=rows,
                    resolved_options=resolved_options,
                    catalog=catalog_snapshot,
                    catalog_selections=request.catalog_selections,
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
                    catalog_selections=request.catalog_selections,
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
        try:
            catalog = await SpecificationCatalogService(self.db).resolve_active(
                catalog_id=options.catalog_id,
                catalog_version=options.catalog_version,
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


def _resolve_options(
    project: Project,
    requested: SpecificationRequestedOptions,
    catalog: ResolvedSpecificationCatalog | None,
) -> tuple[SpecificationResolvedOptions | None, SpecificationDiagnostic | None]:
    raw_stored = getattr(project, "specification_settings", None)
    stored = raw_stored if isinstance(raw_stored, Mapping) else {}
    grouping_mode = requested.grouping_mode
    if grouping_mode is None:
        stored_grouping = stored.get("grouping_mode")
        if stored_grouping is not None:
            grouping_mode = stored_grouping
        elif "merge_identical" in stored:
            grouping_mode = (
                SpecificationGroupingMode.MERGE_MATERIALS
                if stored.get("merge_identical") is True
                else SpecificationGroupingMode.SEPARATE_BY_OBJECT_TYPE
            )

    values: dict[str, Any] = {
        "catalog_id": catalog.version.id if catalog is not None else None,
        "catalog_version": catalog.version.version if catalog is not None else None,
        "grouping_mode": grouping_mode,
        "Ex": _option(requested.ex, stored, "Ex", "ex", "ex_zone"),
        "K1i": _option(
            requested.k1i,
            stored,
            "K1i",
            "k1i",
            "indication_on_boxes",
        ),
        "K2i": _option(
            requested.k2i,
            stored,
            "K2i",
            "k2i",
            "end_section_indication",
        ),
        "Kiu": _option(
            requested.kiu,
            stored,
            "Kiu",
            "kiu",
            "top_indication",
        ),
        "L_K2i_m": _option(
            requested.l_k2i_m,
            stored,
            "L_K2i_m",
            "l_k2i_m",
            "min_length_for_end_indication",
        ),
        "R_gr": _option(
            requested.r_gr,
            stored,
            "R_gr",
            "r_gr",
            "reserve_coefficient",
        ),
    }
    missing = sorted(key for key, value in values.items() if value is None)
    if missing:
        return None, _diagnostic(
            SpecificationDiagnosticCode.FORMULA_INPUT_INVALID,
            SpecificationIssueKind.BLOCKING,
            "Не разрешены обязательные настройки спецификации",
            issues=[{"reason": "required_option_unresolved", "field": field} for field in missing],
            details={
                "settings_version": int(getattr(project, "specification_settings_version", 1) or 1)
            },
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


def _option(
    explicit: Any,
    stored: Mapping[str, Any],
    *keys: str,
) -> Any:
    if explicit is not None:
        return explicit
    for key in keys:
        if key in stored and stored[key] is not None:
            return stored[key]
    return None


def _selection_diagnostic(
    request: SpecificationGenerationRequest,
    catalog: ResolvedSpecificationCatalog | None,
) -> SpecificationDiagnostic | None:
    if catalog is None or not request.catalog_selections:
        return None
    item_ids = {item.id for item in catalog.items}
    invalid = [
        {"group_key": key, "catalog_item_id": str(item_id)}
        for key, item_id in sorted(request.catalog_selections.items())
        if item_id not in item_ids
    ]
    if not invalid:
        return None
    return _diagnostic(
        SpecificationDiagnosticCode.ACCESSORY_SELECTION_REQUIRED,
        SpecificationIssueKind.SELECTION_REQUIRED,
        "Сохранённый выбор отсутствует в активной версии каталога",
        issues=[{**item, "reason": "catalog_selection_inactive"} for item in invalid],
        details={
            "catalog_id": str(catalog.version.id),
            "catalog_version": catalog.version.version,
            "payload_checksum": catalog.version.payload_checksum,
        },
    )


def _input_fingerprint(
    *,
    project_id: UUID,
    project_settings_version: int,
    variant_id: UUID,
    rows: Sequence[tuple[ElectricalVariantObject, ProjectObject, ElectricalCalculation | None]],
    resolved_options: SpecificationResolvedOptions,
    catalog: SpecificationCatalogSnapshot,
    catalog_selections: Mapping[str, UUID],
    excluded_unassigned_object_ids: Sequence[UUID],
) -> str:
    assignments = [
        _fingerprint_row(assignment, obj, calculation)
        for assignment, obj, calculation in sorted(rows, key=lambda row: str(row[1].id))
        if assignment.assignment_state != "unassigned"
    ]
    return canonical_fingerprint(
        {
            "fingerprint_schema": _FINGERPRINT_SCHEMA,
            "project_id": project_id,
            "project_settings_version": project_settings_version,
            "electrical_variant_id": variant_id,
            "resolved_options": resolved_options.model_dump(mode="json", by_alias=True),
            "specification_catalog": catalog.model_dump(mode="json"),
            "catalog_selections": {
                key: str(value) for key, value in sorted(catalog_selections.items())
            },
            "excluded_unassigned_object_ids": sorted(
                excluded_unassigned_object_ids,
                key=str,
            ),
            "assignments": assignments,
        }
    )


def _fingerprint_row(
    assignment: ElectricalVariantObject,
    obj: ProjectObject,
    calculation: ElectricalCalculation | None,
) -> dict[str, Any]:
    result = calculation.results if calculation is not None else None
    result = result if isinstance(result, Mapping) else {}
    provenance = result.get("provenance")
    provenance = provenance if isinstance(provenance, Mapping) else {}
    cable = result.get("cable")
    cable = cable if isinstance(cable, Mapping) else {}
    section_plan = result.get("section_plan")
    section_plan = section_plan if isinstance(section_plan, Mapping) else {}
    layout = result.get("layout")
    layout = layout if isinstance(layout, Mapping) else {}
    return {
        "assignment": {
            "id": assignment.id,
            "version": assignment.version,
            "state": assignment.assignment_state,
            "system_type": assignment.system_type,
            "object_version_snapshot": assignment.object_version_snapshot,
        },
        "object": {
            "id": obj.id,
            "version": obj.version,
            "object_type": str(getattr(obj.object_type, "value", obj.object_type)),
            "is_valid": obj.is_valid,
        },
        "electrical_result": {
            "id": calculation.id if calculation is not None else None,
            "updated_at": _timestamp(calculation.updated_at if calculation else None),
            "production_eligible": provenance.get(
                "production_eligible",
                result.get("production_eligible"),
            ),
            "mocked_fields": sorted(
                str(item)
                for item in (provenance.get("mocked_fields") or result.get("mocked_fields") or [])
            ),
            "cable": {
                "mark": cable.get("mark"),
                "nomenclature_code": cable.get("nomenclature_code"),
            },
            "section_plan": {
                "count": _decimal(section_plan.get("count")),
                "length_m": _decimal(section_plan.get("length_m")),
                "origin": section_plan.get("origin", "automatic"),
            },
            "layout": {
                "actual_installed_length_m": _decimal(layout.get("actual_installed_length_m")),
                "required_order_length_m": _decimal(layout.get("required_order_length_m")),
            },
            "provenance": {
                "formula_version": provenance.get("formula_version"),
                "formula_fingerprint": provenance.get("formula_fingerprint"),
                "calculation_fingerprint": provenance.get("calculation_fingerprint"),
                "object_version": provenance.get("object_version"),
                "heat_result_version": provenance.get("heat_result_version"),
                "assignment_version": provenance.get("assignment_version"),
                "catalogs": _catalog_result_fingerprints(
                    provenance.get("catalogs") or result.get("catalogs")
                ),
            },
        },
    }


def _decimal(value: Any) -> Decimal | None:
    if value is None or isinstance(value, bool):
        return None
    try:
        result = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return None
    return result if result.is_finite() else None


def _timestamp(value: datetime | None) -> str | None:
    if value is None:
        return None
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError("calculation.updated_at must be timezone-aware")
    return value.astimezone(UTC).isoformat().replace("+00:00", "Z")


def _catalog_result_fingerprints(value: Any) -> dict[str, dict[str, Any]]:
    catalogs = value if isinstance(value, Mapping) else {}
    fingerprints: dict[str, dict[str, Any]] = {}
    for kind in ("power", "section", "bom"):
        item = catalogs.get(kind)
        item = item if isinstance(item, Mapping) else {}
        fingerprints[kind] = {
            key: item.get(key)
            for key in (
                "id",
                "catalog_id",
                "catalog_key",
                "version",
                "status",
                "source_checksum",
                "payload_checksum",
                "schema_version",
            )
            if item.get(key) is not None
        }
    return fingerprints


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
