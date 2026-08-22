"""Immutable contracts for catalog candidate discovery and selection."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from enum import Enum
from typing import overload
from uuid import UUID

from heatcalc_specification_core.candidates.condition_contracts import CandidateCondition
from heatcalc_specification_core.catalog import CatalogParameters
from heatcalc_specification_core.json_types import (
    JsonObject,
    JsonValue,
    json_object,
    mutable_json,
)


@overload
def thaw(value: JsonObject) -> dict[str, object]: ...


@overload
def thaw(value: JsonValue) -> object: ...


def thaw(value: JsonValue) -> object:
    """Return mutable JSON-compatible data for application adapters."""
    mutable = mutable_json(value)
    if isinstance(value, Mapping):
        if not isinstance(mutable, dict):
            raise TypeError("JSON object must thaw to a dictionary")
        return mutable
    return mutable


def _frozen_mapping(value: object | None = None) -> JsonObject:
    return json_object(value or {})


class CandidateDiagnosticCode(str, Enum):
    CABLE_NOMENCLATURE_MISSING = "SPEC_CABLE_NOMENCLATURE_MISSING"
    FORMULA_INPUT_INVALID = "SPEC_FORMULA_INPUT_INVALID"
    ACCESSORY_CATALOG_ITEM_MISSING = "SPEC_ACCESSORY_CATALOG_ITEM_MISSING"
    ACCESSORY_SELECTION_REQUIRED = "SPEC_ACCESSORY_SELECTION_REQUIRED"


class CandidateIssueKind(str, Enum):
    BLOCKING = "blocking"
    SELECTION_REQUIRED = "selection_required"


class SelectionSource(str, Enum):
    AUTO_SINGLE = "auto_single"
    EXPLICIT = "explicit"
    NONE = "none"


@dataclass(frozen=True, slots=True)
class CandidateDiagnostic:
    code: CandidateDiagnosticCode
    kind: CandidateIssueKind
    message: str
    issues: tuple[JsonObject, ...] = ()
    details: JsonObject = field(default_factory=_frozen_mapping)

    def __post_init__(self) -> None:
        object.__setattr__(self, "issues", tuple(_frozen_mapping(item) for item in self.issues))
        object.__setattr__(self, "details", _frozen_mapping(self.details))


@dataclass(frozen=True, slots=True)
class CandidateCatalogVersion:
    id: UUID
    version: str
    payload_checksum: str


@dataclass(frozen=True, slots=True)
class CandidateCatalogItem:
    id: UUID
    category: str
    name: str
    mark: str
    nomenclature_code: str
    supply_unit: str
    parameters: CatalogParameters = field(default_factory=CatalogParameters)


@dataclass(frozen=True, slots=True)
class CandidateCatalog:
    version: CandidateCatalogVersion
    items: tuple[CandidateCatalogItem, ...]

    def __post_init__(self) -> None:
        if not isinstance(self.items, tuple):
            raise TypeError("items must be a tuple")


@dataclass(frozen=True, slots=True)
class SpecificationCandidate:
    catalog_item_id: UUID
    catalog_id: UUID
    catalog_version: str
    category: str
    name: str
    mark: str
    nomenclature_code: str
    supply_unit: str
    parameters: CatalogParameters = field(default_factory=CatalogParameters)


@dataclass(frozen=True, slots=True)
class CandidateGroup:
    group_key: str
    electrical_variant_id: UUID
    category: str
    object_type_section: str | None
    condition: CandidateCondition
    candidates: tuple[SpecificationCandidate, ...]
    selected_catalog_item_id: UUID | None
    selection_source: SelectionSource
    candidate_set_fingerprint: str | None

    def __post_init__(self) -> None:
        if not isinstance(self.candidates, tuple):
            raise TypeError("candidates must be a tuple")


@dataclass(frozen=True, slots=True)
class CandidateBuildResult:
    groups: tuple[CandidateGroup, ...]
    diagnostics: tuple[CandidateDiagnostic, ...]

    def __post_init__(self) -> None:
        if not isinstance(self.groups, tuple):
            raise TypeError("groups must be a tuple")
        if not isinstance(self.diagnostics, tuple):
            raise TypeError("diagnostics must be a tuple")


def diagnostic(
    code: CandidateDiagnosticCode,
    kind: CandidateIssueKind,
    message: str,
    *,
    issues: Sequence[JsonObject] = (),
    details: JsonObject | None = None,
) -> CandidateDiagnostic:
    return CandidateDiagnostic(
        code=code,
        kind=kind,
        message=message,
        issues=tuple(issues),
        details=_frozen_mapping(details),
    )
