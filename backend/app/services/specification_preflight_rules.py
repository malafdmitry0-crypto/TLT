"""Application adapter for the dependency-free specification preflight core."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import Any, cast
from uuid import UUID

from heatcalc_specification_core.diagnostics import Diagnostic as CoreDiagnostic
from heatcalc_specification_core.immutable_json import (
    canonical_fingerprint as _canonical_fingerprint,
)
from heatcalc_specification_core.preflight import (
    CatalogIdentity,
    ElectricalResultSnapshot,
    PreflightAssignment,
    PreflightCatalog,
    PreflightCatalogItem,
    prepare_specification,
)

from app.electrical_result_status import electrical_result_status
from app.schemas.specification import (
    SpecificationDiagnostic,
    SpecificationDiagnosticCode,
    SpecificationIssueKind,
    SpecificationPreflightStatus,
    SpecificationVariantPreflightResult,
)


@dataclass(frozen=True)
class ImmutableSpecificationCatalogItem:
    item_id: UUID | str
    category: str
    mark: str
    nomenclature_code: str


@dataclass(frozen=True)
class ImmutableSpecificationCatalog:
    catalog_id: UUID | str
    version: str
    checksum: str
    is_active: bool
    is_complete: bool
    authority: str
    items: tuple[ImmutableSpecificationCatalogItem, ...]
    completeness_issues: tuple[Mapping[str, Any], ...] = ()


@dataclass(frozen=True)
class SpecificationPreflightAssignment:
    """One already ER-scoped object, assignment, and saved calculation snapshot."""

    assignment_id: UUID
    calculation_id: UUID | None
    calculation_updated_at: datetime | None
    object_id: UUID
    object_type: str
    object_is_valid: bool
    assignment_state: str
    system_type: str | None
    object_version: int
    assignment_version: int
    assignment_object_version: int
    assignment_diagnostics: Mapping[str, Any] | None = None
    result: Mapping[str, Any] | None = None


def canonical_fingerprint(payload: Any) -> str:
    """Compatibility export while canonical serialization is owned by core."""
    return cast(str, _canonical_fingerprint(payload))


def evaluate_specification_preflight(
    *,
    electrical_variant_id: UUID,
    assignments: Sequence[SpecificationPreflightAssignment],
    catalog: ImmutableSpecificationCatalog | None,
    exclude_unassigned_confirmed: bool,
    electrical_variant_name: str | None = None,
) -> SpecificationVariantPreflightResult:
    """Adapt persisted application snapshots to the canonical core preflight."""
    outcome = prepare_specification(
        electrical_variant_id=electrical_variant_id,
        electrical_variant_name=electrical_variant_name,
        assignments=tuple(to_core_preflight_assignment(row) for row in assignments),
        catalog=_core_catalog(catalog),
        exclude_unassigned_confirmed=exclude_unassigned_confirmed,
    )
    summary = outcome.summary
    return SpecificationVariantPreflightResult(
        electrical_variant_id=summary.electrical_variant_id,
        electrical_variant_name=summary.electrical_variant_name,
        status=SpecificationPreflightStatus(summary.status.value),
        total_objects=summary.total_objects,
        contributing_objects=summary.contributing_objects,
        unassigned_object_ids=list(summary.unassigned_object_ids),
        excluded_unassigned_object_ids=list(summary.excluded_unassigned_object_ids),
        diagnostics=[_application_diagnostic(item) for item in summary.diagnostics],
        fingerprint_schema=(outcome.result.fingerprint_schema if outcome.result else None),
        input_fingerprint=(outcome.result.input_fingerprint if outcome.result else None),
    )


def _core_catalog(catalog: ImmutableSpecificationCatalog | None) -> PreflightCatalog | None:
    if catalog is None:
        return None
    return PreflightCatalog(
        identity=CatalogIdentity(
            catalog_id=catalog.catalog_id,
            catalog_key="legacy-preflight-adapter",
            version=catalog.version,
            source_checksum=catalog.checksum,
            payload_checksum=catalog.checksum,
            schema_version=1,
        ),
        is_active=catalog.is_active,
        is_complete=catalog.is_complete,
        authority=catalog.authority,
        items=tuple(
            PreflightCatalogItem(
                item_id=item.item_id,
                category=item.category,
                mark=item.mark,
                nomenclature_code=item.nomenclature_code,
            )
            for item in catalog.items
        ),
        completeness_issues=catalog.completeness_issues,
    )


def to_core_preflight_assignment(
    row: SpecificationPreflightAssignment,
) -> PreflightAssignment:
    """Convert an application snapshot to the typed core contract."""
    diagnostics = row.assignment_diagnostics
    reason = None
    upstream_error_code = None
    if isinstance(diagnostics, Mapping):
        raw_reason = diagnostics.get("reason") or diagnostics.get("stale_reason")
        reason = raw_reason if isinstance(raw_reason, str) and raw_reason else None
        raw_code = diagnostics.get("error_code")
        upstream_error_code = raw_code if isinstance(raw_code, str) and raw_code else None
    return PreflightAssignment(
        assignment_id=row.assignment_id,
        calculation_id=row.calculation_id,
        calculation_updated_at=row.calculation_updated_at,
        object_id=row.object_id,
        object_type=row.object_type,
        object_is_valid=row.object_is_valid,
        assignment_state=row.assignment_state,
        system_type=row.system_type,
        object_version=row.object_version,
        assignment_version=row.assignment_version,
        assignment_object_version=row.assignment_object_version,
        upstream_reason=reason,
        upstream_error_code=upstream_error_code,
        result=_core_result(row.result),
    )


def _core_result(result: Mapping[str, Any] | None) -> ElectricalResultSnapshot | None:
    if not isinstance(result, Mapping):
        return None
    provenance = _mapping(result.get("provenance"))
    cable = _mapping(result.get("cable"))
    section_plan = _mapping(result.get("section_plan"))
    layout = _mapping(result.get("layout"))
    canonical_mark = cable.get("mark")
    status = electrical_result_status(
        canonical_mark if isinstance(canonical_mark, str) else None,
        dict(result),
    )
    upstream_status = status if status in {"success", "stale", "failed"} else "unsupported"
    return ElectricalResultSnapshot(
        upstream_status=upstream_status,
        production_eligible=result.get("production_eligible") is True,
        provenance_production_eligible=provenance.get("production_eligible") is True,
        mocked_fields=_string_tuple(result.get("mocked_fields")),
        provenance_mocked_fields=_string_tuple(provenance.get("mocked_fields")),
        cable_mark=cable.get("mark") if isinstance(cable.get("mark"), str) else None,
        nomenclature_code=(
            cable.get("nomenclature_code")
            if isinstance(cable.get("nomenclature_code"), str)
            else None
        ),
        section_count=_decimal(
            result.get("section_count", result.get("num_sections", section_plan.get("count")))
        ),
        section_length_m=_decimal(result.get("section_length_m", section_plan.get("length_m"))),
        section_plan_origin=str(section_plan.get("origin", "automatic")),
        actual_installed_length_m=_decimal(layout.get("actual_installed_length_m")),
        required_order_length_m=_decimal(layout.get("required_order_length_m")),
        object_snapshot_version=_version(
            _mapping(provenance.get("object_snapshot")).get("version")
        ),
        heat_snapshot_version=_version(_mapping(provenance.get("heat_snapshot")).get("version")),
        provenance_object_version=_version(provenance.get("object_version")),
        heat_result_version=_version(provenance.get("heat_result_version")),
        provenance_assignment_version=_version(provenance.get("assignment_version")),
        formula_version=_optional_string(provenance.get("formula_version")),
        formula_fingerprint=_optional_string(provenance.get("formula_fingerprint")),
        calculation_fingerprint=_optional_string(provenance.get("calculation_fingerprint")),
        catalog_fingerprints=_catalog_fingerprints(
            provenance.get("catalogs") or result.get("catalogs")
        ),
    )


def _application_diagnostic(item: CoreDiagnostic) -> SpecificationDiagnostic:
    return SpecificationDiagnostic(
        code=SpecificationDiagnosticCode(item.code),
        kind=SpecificationIssueKind(item.kind.value),
        message=item.message,
        issues=[dict(issue) for issue in item.issues],
        details=dict(item.details),
    )


def _mapping(value: Any) -> Mapping[str, Any]:
    return value if isinstance(value, Mapping) else {}


def _decimal(value: Any) -> Decimal | None:
    if value is None or isinstance(value, bool):
        return None
    try:
        decimal = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return None
    return decimal if decimal.is_finite() else None


def _version(value: Any) -> int | None:
    return value if isinstance(value, int) and not isinstance(value, bool) else None


def _optional_string(value: Any) -> str | None:
    return value if isinstance(value, str) else None


def _string_tuple(value: Any) -> tuple[str, ...]:
    return tuple(str(item) for item in value) if isinstance(value, list | tuple) else ()


def _catalog_fingerprints(value: Any) -> dict[str, dict[str, Any]]:
    catalogs = _mapping(value)
    return {
        kind: {
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
        for kind in ("power", "section", "bom")
        for item in [_mapping(catalogs.get(kind))]
    }
