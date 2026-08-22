"""Canonical dependency-free candidate discovery and selection pipeline."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from uuid import UUID

from heatcalc_specification_core.candidates.condition_contracts import (
    CandidateCondition,
    CandidateResultSnapshot,
    InvalidCondition,
    InvalidConditionReason,
    UniversalCondition,
)
from heatcalc_specification_core.candidates.conditions import conditions_for_categories
from heatcalc_specification_core.candidates.contracts import (
    CandidateBuildResult,
    CandidateCatalog,
    CandidateDiagnostic,
    CandidateDiagnosticCode,
    CandidateGroup,
    CandidateIssueKind,
    diagnostic,
)
from heatcalc_specification_core.candidates.filtering import filter_candidates
from heatcalc_specification_core.candidates.fingerprint import (
    candidate_set_fingerprint,
    stable_group_key,
)
from heatcalc_specification_core.candidates.selections import (
    catalog_selections_for_variant,
    resolve_selection,
    stale_selection_diagnostic,
)

SELECTION_CATEGORIES: tuple[str, ...] = (
    "cable",
    "connection_kit",
    "repair_kit",
    "sealant",
    "fiberglass_tape",
    "aluminium_tape",
)


def build_candidate_groups(
    *,
    electrical_variant_id: UUID,
    catalog: CandidateCatalog,
    contributing_results: Sequence[CandidateResultSnapshot],
    catalog_selections: Mapping[str, UUID] | None = None,
    object_type_section: str | None = None,
) -> CandidateBuildResult:
    selections = catalog_selections_for_variant(
        catalog_selections or {},
        electrical_variant_id,
    )
    if not contributing_results:
        return CandidateBuildResult(groups=(), diagnostics=())

    conditions_by_category = conditions_for_categories(contributing_results)
    groups: list[CandidateGroup] = []
    diagnostics: list[CandidateDiagnostic] = []

    for category in SELECTION_CATEGORIES:
        slices = conditions_by_category.get(category) or [UniversalCondition()]
        for condition in slices:
            invalid = _invalid_condition_diagnostic(
                electrical_variant_id=electrical_variant_id,
                category=category,
                condition=condition,
            )
            if invalid is not None:
                diagnostics.append(invalid)
                continue

            candidates = filter_candidates(
                catalog=catalog,
                category=category,
                condition=condition,
            )
            group_key = stable_group_key(
                electrical_variant_id=electrical_variant_id,
                category=category,
                condition=condition,
                object_type_section=object_type_section,
            )
            selected, source, group_diagnostics = resolve_selection(
                group_key=group_key,
                category=category,
                condition=condition,
                candidates=candidates,
                selections=selections,
                electrical_variant_id=electrical_variant_id,
                catalog=catalog,
            )
            diagnostics.extend(group_diagnostics)
            groups.append(
                CandidateGroup(
                    group_key=group_key,
                    electrical_variant_id=electrical_variant_id,
                    category=category,
                    object_type_section=object_type_section,
                    condition=condition,
                    candidates=candidates,
                    selected_catalog_item_id=selected,
                    selection_source=source,
                    candidate_set_fingerprint=(
                        candidate_set_fingerprint([item.catalog_item_id for item in candidates])
                        if candidates
                        else None
                    ),
                )
            )

    known_keys = {group.group_key for group in groups}
    stale = sorted(key for key in selections if key not in known_keys)
    if stale:
        diagnostics.append(stale_selection_diagnostic(stale_keys=stale, catalog=catalog))

    groups.sort(key=lambda item: (item.category, item.group_key))
    return CandidateBuildResult(groups=tuple(groups), diagnostics=tuple(diagnostics))


def _invalid_condition_diagnostic(
    *,
    electrical_variant_id: UUID,
    category: str,
    condition: CandidateCondition,
) -> CandidateDiagnostic | None:
    if not isinstance(condition, InvalidCondition):
        return None
    if condition.reason is InvalidConditionReason.CABLE_IDENTITY_UNRESOLVED:
        return diagnostic(
            CandidateDiagnosticCode.CABLE_NOMENCLATURE_MISSING,
            CandidateIssueKind.BLOCKING,
            "Не задана точная номенклатурная идентичность кабеля",
            issues=(
                {
                    "reason": "cable_identity_unresolved",
                    "required_fields": ["mark", "nomenclature_code"],
                },
            ),
            details={
                "electrical_variant_id": str(electrical_variant_id),
                "category": category,
            },
        )
    if condition.reason is InvalidConditionReason.TEMPERATURE_GROUP_UNRESOLVED:
        return diagnostic(
            CandidateDiagnosticCode.FORMULA_INPUT_INVALID,
            CandidateIssueKind.BLOCKING,
            "Не задана температурная группа для подбора комплектующих",
            issues=(
                {
                    "reason": "temperature_group_unresolved",
                    "category": category,
                },
            ),
            details={
                "electrical_variant_id": str(electrical_variant_id),
                "category": category,
            },
        )
    return None
