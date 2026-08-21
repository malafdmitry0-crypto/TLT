"""Resolved, dependency-free contracts for one specification preflight."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from typing import Any, Literal
from uuid import UUID

from heatcalc_specification_core.diagnostics import Diagnostic, PreflightStatus


@dataclass(frozen=True, slots=True)
class CatalogIdentity:
    catalog_id: UUID | str
    catalog_key: str
    version: str
    source_checksum: str
    payload_checksum: str
    schema_version: int


@dataclass(frozen=True, slots=True)
class PreflightCatalogItem:
    item_id: UUID | str
    category: str
    mark: str
    nomenclature_code: str


@dataclass(frozen=True, slots=True)
class PreflightCatalog:
    identity: CatalogIdentity
    is_active: bool
    is_complete: bool
    authority: str
    items: tuple[PreflightCatalogItem, ...]
    completeness_issues: tuple[Mapping[str, Any], ...] = ()


@dataclass(frozen=True, slots=True)
class ElectricalResultSnapshot:
    """The electrical adapter's immutable downstream contract."""

    upstream_status: Literal["success", "stale", "failed", "unsupported"]
    production_eligible: bool
    provenance_production_eligible: bool
    mocked_fields: tuple[str, ...]
    provenance_mocked_fields: tuple[str, ...]
    cable_mark: str | None
    nomenclature_code: str | None
    section_count: Decimal | None
    section_length_m: Decimal | None
    section_plan_origin: str
    actual_installed_length_m: Decimal | None
    required_order_length_m: Decimal | None
    object_snapshot_version: int | None
    heat_snapshot_version: int | None
    provenance_object_version: int | None
    heat_result_version: int | None
    provenance_assignment_version: int | None
    formula_version: str | None = None
    formula_fingerprint: str | None = None
    calculation_fingerprint: str | None = None
    catalog_fingerprints: Mapping[str, Mapping[str, Any]] | None = None


@dataclass(frozen=True, slots=True)
class PreflightAssignment:
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
    upstream_reason: str | None = None
    upstream_error_code: str | None = None
    result: ElectricalResultSnapshot | None = None


@dataclass(frozen=True, slots=True)
class PreflightSummary:
    electrical_variant_id: UUID
    electrical_variant_name: str | None
    status: PreflightStatus
    total_objects: int
    contributing_objects: int
    unassigned_object_ids: tuple[UUID, ...]
    excluded_unassigned_object_ids: tuple[UUID, ...]
    diagnostics: tuple[Diagnostic, ...]


@dataclass(frozen=True, slots=True)
class PreparedSpecification:
    fingerprint_schema: Literal["specification-preflight/v1"]
    input_fingerprint: str
    contributing_assignments: tuple[PreflightAssignment, ...]


@dataclass(frozen=True, slots=True)
class PreflightOutcome:
    summary: PreflightSummary
    result: PreparedSpecification | None

    def __post_init__(self) -> None:
        ready = self.summary.status is PreflightStatus.READY
        if ready != (self.result is not None):
            raise ValueError("only a ready preflight may carry a prepared result")
