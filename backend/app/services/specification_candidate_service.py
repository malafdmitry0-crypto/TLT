"""Application adapter for dependency-free specification candidate resolution."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any
from uuid import UUID

from heatcalc_specification_core import build_candidate_groups as build_core_candidate_groups
from heatcalc_specification_core.candidates import (
    CandidateCatalog,
    CandidateCatalogItem,
    CandidateCatalogVersion,
    CandidateResultSnapshot,
    SelectionSource,
    condition_from_json,
    condition_json,
)
from heatcalc_specification_core.candidates import (
    CandidateGroup as CoreCandidateGroup,
)
from heatcalc_specification_core.candidates import (
    SpecificationCandidate as CoreCandidate,
)
from heatcalc_specification_core.candidates import (
    candidate_groups_fingerprint_payload as core_groups_fingerprint_payload,
)
from heatcalc_specification_core.candidates import (
    catalog_selections_for_variant as core_selections_for_variant,
)
from heatcalc_specification_core.candidates import (
    stable_group_key as core_stable_group_key,
)
from heatcalc_specification_core.candidates.contracts import thaw
from heatcalc_specification_core.catalog import CatalogParameters

from app.schemas.specification import (
    SpecificationCandidate,
    SpecificationCandidateGroup,
    SpecificationDiagnostic,
    SpecificationDiagnosticCode,
    SpecificationIssueKind,
    SpecificationSelectionSource,
)
from app.services.specification_catalog import ResolvedSpecificationCatalog


@dataclass(frozen=True)
class CandidateBuildResult:
    groups: list[SpecificationCandidateGroup]
    diagnostics: list[SpecificationDiagnostic]


def build_candidate_groups(
    *,
    electrical_variant_id: UUID,
    catalog: ResolvedSpecificationCatalog,
    contributing_results: Sequence[Mapping[str, Any]],
    catalog_selections: Mapping[str, UUID] | None = None,
    object_type_section: str | None = None,
) -> CandidateBuildResult:
    """Adapt ORM snapshots to the canonical candidate pipeline and back."""
    result = build_core_candidate_groups(
        electrical_variant_id=electrical_variant_id,
        catalog=_core_catalog(catalog),
        contributing_results=tuple(
            CandidateResultSnapshot.from_mapping(item) for item in contributing_results
        ),
        catalog_selections=catalog_selections,
        object_type_section=object_type_section,
    )
    return CandidateBuildResult(
        groups=[_application_group(item) for item in result.groups],
        diagnostics=[
            SpecificationDiagnostic(
                code=SpecificationDiagnosticCode(item.code.value),
                kind=SpecificationIssueKind(item.kind.value),
                message=item.message,
                issues=[thaw(issue) for issue in item.issues],
                details=thaw(item.details),
            )
            for item in result.diagnostics
        ],
    )


def stable_group_key(
    *,
    electrical_variant_id: UUID,
    category: str,
    conditions: Mapping[str, Any],
    object_type_section: str | None = None,
) -> str:
    return core_stable_group_key(
        electrical_variant_id=electrical_variant_id,
        category=category,
        condition=condition_from_json(conditions),
        object_type_section=object_type_section,
    )


def catalog_selections_for_variant(
    selections: Mapping[str, UUID],
    electrical_variant_id: UUID,
    requested_variant_ids: Sequence[UUID] | None = None,
) -> dict[str, UUID]:
    return core_selections_for_variant(
        selections,
        electrical_variant_id,
        requested_variant_ids,
    )


def candidate_groups_fingerprint_payload(
    groups: Sequence[SpecificationCandidateGroup],
) -> list[dict[str, Any]]:
    return [
        dict(item)
        for item in core_groups_fingerprint_payload([_core_group(item) for item in groups])
    ]


def _core_catalog(catalog: ResolvedSpecificationCatalog) -> CandidateCatalog:
    return CandidateCatalog(
        version=CandidateCatalogVersion(
            id=catalog.version.id,
            version=catalog.version.version,
            payload_checksum=catalog.version.payload_checksum,
        ),
        items=tuple(
            CandidateCatalogItem(
                id=item.id,
                category=item.category,
                name=item.name,
                mark=item.mark,
                nomenclature_code=item.nomenclature_code,
                supply_unit=item.supply_unit,
                parameters=CatalogParameters.parse(
                    category=item.category,
                    applicability=_mapping(item.applicability),
                    package_parameters=_mapping(item.package_parameters),
                    formula_parameters=_mapping(item.formula_parameters),
                    item_key=item.item_key,
                    mark=item.mark,
                    nomenclature_code=item.nomenclature_code,
                ),
            )
            for item in catalog.items
        ),
    )


def _application_group(group: CoreCandidateGroup) -> SpecificationCandidateGroup:
    return SpecificationCandidateGroup(
        group_key=group.group_key,
        electrical_variant_id=group.electrical_variant_id,
        category=group.category,
        object_type_section=group.object_type_section,
        conditions=thaw(condition_json(group.condition)),
        candidates=[_application_candidate(item) for item in group.candidates],
        selected_catalog_item_id=group.selected_catalog_item_id,
        selection_source=SpecificationSelectionSource(group.selection_source.value),
        candidate_set_fingerprint=group.candidate_set_fingerprint,
    )


def _application_candidate(candidate: CoreCandidate) -> SpecificationCandidate:
    return SpecificationCandidate(
        catalog_item_id=candidate.catalog_item_id,
        catalog_id=candidate.catalog_id,
        catalog_version=candidate.catalog_version,
        category=candidate.category,
        name=candidate.name,
        mark=candidate.mark,
        nomenclature_code=candidate.nomenclature_code,
        supply_unit=candidate.supply_unit,
        applicability=candidate.parameters.applicability_dict(),
        package_parameters=candidate.parameters.package_dict(),
        formula_parameters=candidate.parameters.formula_dict(),
    )


def _core_group(group: SpecificationCandidateGroup) -> CoreCandidateGroup:
    return CoreCandidateGroup(
        group_key=group.group_key,
        electrical_variant_id=group.electrical_variant_id,
        category=group.category,
        object_type_section=group.object_type_section,
        condition=condition_from_json(group.conditions),
        candidates=tuple(_core_candidate(item) for item in group.candidates),
        selected_catalog_item_id=group.selected_catalog_item_id,
        selection_source=SelectionSource(group.selection_source.value),
        candidate_set_fingerprint=group.candidate_set_fingerprint,
    )


def _core_candidate(candidate: SpecificationCandidate) -> CoreCandidate:
    return CoreCandidate(
        catalog_item_id=candidate.catalog_item_id,
        catalog_id=candidate.catalog_id,
        catalog_version=candidate.catalog_version,
        category=candidate.category,
        name=candidate.name,
        mark=candidate.mark,
        nomenclature_code=candidate.nomenclature_code,
        supply_unit=candidate.supply_unit,
        parameters=CatalogParameters.parse(
            category=candidate.category,
            applicability=candidate.applicability,
            package_parameters=candidate.package_parameters,
            formula_parameters=candidate.formula_parameters,
            mark=candidate.mark,
            nomenclature_code=candidate.nomenclature_code,
        ),
    )


def _mapping(value: Any) -> Mapping[str, Any]:
    return value if isinstance(value, Mapping) else {}
