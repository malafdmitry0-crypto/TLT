"""Immutable contracts for the canonical specification generation pipeline."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal
from enum import StrEnum
from typing import TYPE_CHECKING, Literal, TypeAlias
from uuid import UUID

from heatcalc_specification_core.catalog import CatalogParameters
from heatcalc_specification_core.json_types import JsonObject, json_object

if TYPE_CHECKING:
    from heatcalc_specification_core.bom.snapshot_contracts import GenerationSnapshot


class ObjectTypeSection(StrEnum):
    PIPE = "pipe"
    TANK = "tank"
    COMMON = "common"


class GroupingMode(StrEnum):
    SEPARATE_BY_OBJECT_TYPE = "separate_by_object_type"
    MERGE_MATERIALS = "merge_materials"


class SelectionSource(StrEnum):
    AUTO_SINGLE = "auto_single"
    EXPLICIT = "explicit"
    NONE = "none"


class DiagnosticKind(StrEnum):
    BLOCKING = "blocking"
    SELECTION_REQUIRED = "selection_required"


@dataclass(frozen=True, slots=True)
class CatalogIdentity:
    id: UUID
    catalog_key: str
    version: str
    source_checksum: str
    payload_checksum: str
    schema_version: int


@dataclass(frozen=True, slots=True)
class CatalogItem:
    id: UUID
    item_key: str
    category: str
    name: str
    mark: str
    nomenclature_code: str
    supply_unit: str
    parameters: CatalogParameters = field(default_factory=CatalogParameters)


@dataclass(frozen=True, slots=True)
class SpecificationCatalog:
    identity: CatalogIdentity
    items: tuple[CatalogItem, ...]


@dataclass(frozen=True, slots=True)
class ResolvedOptions:
    catalog_id: UUID | str
    catalog_version: str
    grouping_mode: GroupingMode | str
    ex: bool
    k1i: bool
    k2i: bool
    kiu: bool
    l_k2i_m: Decimal
    r_gr: Decimal

    def snapshot_dict(self) -> dict[str, object]:
        return {
            "catalog_id": str(self.catalog_id),
            "catalog_version": self.catalog_version,
            "grouping_mode": str(getattr(self.grouping_mode, "value", self.grouping_mode)),
            "Ex": self.ex,
            "K1i": self.k1i,
            "K2i": self.k2i,
            "Kiu": self.kiu,
            "L_K2i_m": str(self.l_k2i_m),
            "R_gr": str(self.r_gr),
        }


@dataclass(frozen=True, slots=True)
class SpecificationContribution:
    object_id: UUID
    object_type_section: ObjectTypeSection | str
    outer_diameter_mm: Decimal | None
    cable_mark: str
    nomenclature_code: str
    temperature_group: str
    section_count: int
    section_length_m: Decimal
    actual_installed_length_m: Decimal
    required_order_length_m: Decimal


@dataclass(frozen=True, slots=True)
class CandidateGroup:
    group_key: str
    electrical_variant_id: UUID
    category: str
    candidate_catalog_item_ids: tuple[UUID, ...]
    selected_catalog_item_id: UUID | None
    selection_source: SelectionSource | str = SelectionSource.NONE
    candidate_set_fingerprint: str | None = None
    object_type_section: str | None = None
    conditions: JsonObject = field(default_factory=dict)


@dataclass(frozen=True, slots=True)
class RevisionContext:
    variant_updated_at: datetime
    settings_revision: int
    input_revisions: tuple[InputRevision, ...]


@dataclass(frozen=True, slots=True)
class ObjectRevision:
    id: UUID
    version: int


@dataclass(frozen=True, slots=True)
class AssignmentRevision:
    id: UUID
    version: int
    object_version_snapshot: int
    state: str
    system_type: str | None


@dataclass(frozen=True, slots=True)
class ElectricalResultRevision:
    id: UUID
    updated_at: datetime
    formula_version: str | None
    formula_fingerprint: str | None
    calculation_fingerprint: str | None
    object_version: int | None
    heat_result_version: int | None
    assignment_version: int | None


@dataclass(frozen=True, slots=True)
class SectionPlanRevision:
    payload: JsonObject
    calculation_fingerprint: str | None
    result_updated_at: datetime | None


@dataclass(frozen=True, slots=True)
class InputRevision:
    object: ObjectRevision
    assignment: AssignmentRevision | None = None
    electrical_result: ElectricalResultRevision | None = None
    section_plan_revision: SectionPlanRevision | None = None
    excluded: bool = False


@dataclass(frozen=True, slots=True)
class GenerationInput:
    electrical_variant_id: UUID
    contributions: tuple[SpecificationContribution, ...]
    catalog: SpecificationCatalog
    candidate_groups: tuple[CandidateGroup, ...]
    options: ResolvedOptions
    revision_context: RevisionContext
    preflight_fingerprint: str
    generated_at: datetime
    preflight_fingerprint_schema: str = "specification-preflight/v1"
    excluded_unassigned_object_ids: tuple[UUID, ...] = ()


@dataclass(frozen=True, slots=True)
class BomItem:
    category: str
    name: str
    article: str | None
    unit: str
    quantity: Decimal
    params: JsonObject
    source: Literal["auto"] = "auto"

    def __post_init__(self) -> None:
        object.__setattr__(self, "params", json_object(self.params))


@dataclass(frozen=True, slots=True)
class SpecificationDiagnostic:
    code: str
    kind: DiagnosticKind
    message: str
    issues: tuple[JsonObject, ...] = ()
    details: JsonObject = field(default_factory=dict)

    def __post_init__(self) -> None:
        object.__setattr__(self, "issues", tuple(json_object(item) for item in self.issues))
        object.__setattr__(self, "details", json_object(self.details))


@dataclass(frozen=True, slots=True)
class GenerationSuccess:
    items: tuple[BomItem, ...]
    snapshot: GenerationSnapshot


@dataclass(frozen=True, slots=True)
class GenerationFailure:
    diagnostics: tuple[SpecificationDiagnostic, ...]

    def __post_init__(self) -> None:
        if not self.diagnostics:
            raise ValueError("failed specification outcome requires diagnostics")


GenerationOutcome: TypeAlias = GenerationSuccess | GenerationFailure


class BlockingBomError(Exception):
    """Internal control flow for expected fail-closed domain outcomes."""

    def __init__(self, diagnostics: tuple[SpecificationDiagnostic, ...]) -> None:
        if not diagnostics:
            raise ValueError("blocking BOM error requires diagnostics")
        super().__init__(diagnostics[0].message)
        self.diagnostics = diagnostics
