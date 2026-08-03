"""Catalog candidate resolution and selection protocol for specification generation.

Pure-ish boundary over resolved catalog items and contributing electrical results.
Boxes are intentionally excluded from the multi-select protocol (matrix-applied later).
"""

from __future__ import annotations

import hashlib
import json
import re
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any
from uuid import UUID

from app.formulas.specification.calculators.common import normalize_temperature_group
from app.formulas.specification.calculators.types import FormulaInputError, TemperatureGroup
from app.formulas.specification.catalog_identity import temperature_group_from_result
from app.models.specification import SpecificationCatalogItem
from app.schemas.specification import (
    SpecificationCandidate,
    SpecificationCandidateGroup,
    SpecificationDiagnostic,
    SpecificationDiagnosticCode,
    SpecificationIssueKind,
    SpecificationSelectionSource,
)
from app.services.specification_catalog_service import ResolvedSpecificationCatalog
from app.services.specification_selection_service import candidate_set_fingerprint

# Categories that participate in the single-choice selection protocol.
_SELECTION_CATEGORIES: tuple[str, ...] = (
    "cable",
    "connection_kit",
    "repair_kit",
    "sealant",
    "fiberglass_tape",
    "aluminium_tape",
)

_TEMP_FILTER_CATEGORIES = frozenset(
    {"connection_kit", "repair_kit", "fiberglass_tape"}
)
_MARK_FILTER_CATEGORIES = frozenset({"cable"})
_GROUP_KEY_RE = re.compile(r"^cg_([0-9a-f]{32})_[0-9a-f]{40}$")


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
    """Build selection groups and apply auto-select / selection protocol.

    ``contributing_results`` must already exclude unassigned/confirmed-excluded
    objects. Empty contributing set yields empty groups (nothing to select for).
    """
    selections = catalog_selections_for_variant(
        catalog_selections or {},
        electrical_variant_id,
    )
    if not contributing_results:
        return CandidateBuildResult(groups=[], diagnostics=[])

    conditions_by_category = _conditions_for_categories(contributing_results)
    groups: list[SpecificationCandidateGroup] = []
    diagnostics: list[SpecificationDiagnostic] = []

    for category in _SELECTION_CATEGORIES:
        slices = conditions_by_category.get(category) or [{}]
        for conditions in slices:
            if conditions.get("_invalid_cable_identity"):
                diagnostics.append(
                    _diagnostic(
                        SpecificationDiagnosticCode.CABLE_NOMENCLATURE_MISSING,
                        SpecificationIssueKind.BLOCKING,
                        "Не задана точная номенклатурная идентичность кабеля",
                        issues=[
                            {
                                "reason": "cable_identity_unresolved",
                                "required_fields": ["mark", "nomenclature_code"],
                            }
                        ],
                        details={
                            "electrical_variant_id": str(electrical_variant_id),
                            "category": category,
                        },
                    )
                )
                continue
            if conditions.get("_invalid_temperature_group"):
                diagnostics.append(
                    _diagnostic(
                        SpecificationDiagnosticCode.FORMULA_INPUT_INVALID,
                        SpecificationIssueKind.BLOCKING,
                        "Не задана температурная группа для подбора комплектующих",
                        issues=[
                            {
                                "reason": "temperature_group_unresolved",
                                "category": category,
                            }
                        ],
                        details={
                            "electrical_variant_id": str(electrical_variant_id),
                            "category": category,
                        },
                    )
                )
                continue

            candidates = _filter_candidates(
                catalog=catalog,
                category=category,
                conditions=conditions,
            )
            group_key = stable_group_key(
                electrical_variant_id=electrical_variant_id,
                category=category,
                conditions=conditions,
                object_type_section=object_type_section,
            )
            selected, source, group_diags = _resolve_selection(
                group_key=group_key,
                category=category,
                conditions=conditions,
                candidates=candidates,
                selections=selections,
                electrical_variant_id=electrical_variant_id,
                catalog=catalog,
            )
            diagnostics.extend(group_diags)
            groups.append(
                SpecificationCandidateGroup(
                    group_key=group_key,
                    electrical_variant_id=electrical_variant_id,
                    category=category,
                    object_type_section=object_type_section,
                    conditions=dict(conditions),
                    candidates=candidates,
                    selected_catalog_item_id=selected,
                    selection_source=source,
                    candidate_set_fingerprint=candidate_set_fingerprint(
                        [item.catalog_item_id for item in candidates]
                    )
                    if candidates
                    else None,
                )
            )

    # Selections whose group_key is not among current groups are stale.
    known_keys = {group.group_key for group in groups}
    stale = sorted(key for key in selections if key not in known_keys)
    if stale:
        diagnostics.append(
            _diagnostic(
                SpecificationDiagnosticCode.ACCESSORY_SELECTION_REQUIRED,
                SpecificationIssueKind.SELECTION_REQUIRED,
                "Сохранённый выбор относится к другой группе или версии каталога",
                issues=[
                    {"group_key": key, "reason": "catalog_selection_stale_group"}
                    for key in stale
                ],
                details={
                    "catalog_id": str(catalog.version.id),
                    "catalog_version": catalog.version.version,
                    "payload_checksum": catalog.version.payload_checksum,
                },
            )
        )

    groups.sort(key=lambda item: (item.category, item.group_key))
    return CandidateBuildResult(groups=groups, diagnostics=diagnostics)


def stable_group_key(
    *,
    electrical_variant_id: UUID,
    category: str,
    conditions: Mapping[str, Any],
    object_type_section: str | None = None,
) -> str:
    """Opaque collision-free key stable for the same ER/category/conditions."""
    material = {
        "electrical_variant_id": str(electrical_variant_id),
        "category": category,
        "conditions": {
            str(key): conditions[key] for key in sorted(conditions, key=str)
        },
        "object_type_section": object_type_section,
        "scope": "specification-candidate/v1",
    }
    digest = hashlib.sha256(
        json.dumps(material, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode(
            "utf-8"
        )
    ).hexdigest()
    return f"cg_{electrical_variant_id.hex}_{digest[:40]}"


def catalog_selections_for_variant(
    selections: Mapping[str, UUID],
    electrical_variant_id: UUID,
    requested_variant_ids: Sequence[UUID] | None = None,
) -> dict[str, UUID]:
    """Keep this ER's opaque keys and malformed keys that must fail closed.

    A valid key carries a backend-only UUID scope. Keys belonging to another
    requested ER are ignored here and validated in that ER's own preflight.
    Unparseable keys stay in scope so they cannot silently bypass stale
    selection diagnostics.
    """
    known_scopes = {
        item.hex for item in (requested_variant_ids or (electrical_variant_id,))
    }
    scoped: dict[str, UUID] = {}
    for key, item_id in selections.items():
        match = _GROUP_KEY_RE.fullmatch(key)
        key_scope = match.group(1) if match is not None else None
        if (
            key_scope is None
            or key_scope == electrical_variant_id.hex
            or key_scope not in known_scopes
        ):
            scoped[key] = item_id
    return scoped


def candidate_groups_fingerprint_payload(
    groups: Sequence[SpecificationCandidateGroup],
) -> list[dict[str, Any]]:
    """Deterministic fingerprint contribution for candidate groups + selections."""
    payload: list[dict[str, Any]] = []
    for group in sorted(groups, key=lambda item: item.group_key):
        payload.append(
            {
                "group_key": group.group_key,
                "category": group.category,
                "conditions": group.conditions,
                "object_type_section": group.object_type_section,
                "candidate_ids": sorted(
                    str(item.catalog_item_id) for item in group.candidates
                ),
                "selected_catalog_item_id": (
                    str(group.selected_catalog_item_id)
                    if group.selected_catalog_item_id is not None
                    else None
                ),
            }
        )
    return payload


def _conditions_for_categories(
    results: Sequence[Mapping[str, Any]],
) -> dict[str, list[dict[str, Any]]]:
    cable_identities: set[tuple[str, str]] = set()
    temperature_groups: set[str] = set()
    for result in results:
        identity = _cable_identity(result)
        if identity is not None:
            cable_identities.add(identity)
        temp = _normalized_temperature_group(result)
        if temp is not None:
            temperature_groups.add(temp.value)

    invalid_cable_identity = any(_cable_identity(result) is None for result in results)
    # Temp-filtered categories need an explicit group from every contributing result.
    invalid_temp = any(_normalized_temperature_group(result) is None for result in results)

    out: dict[str, list[dict[str, Any]]] = {}

    if invalid_cable_identity:
        out["cable"] = [{"_invalid_cable_identity": True}]
    elif cable_identities:
        out["cable"] = [
            {"mark": mark, "nomenclature_code": code}
            for mark, code in sorted(cable_identities)
        ]
    else:
        out["cable"] = [{"_invalid_cable_identity": True}]

    if invalid_temp:
        for category in sorted(_TEMP_FILTER_CATEGORIES):
            out[category] = [{"_invalid_temperature_group": True}]
    elif temperature_groups:
        for category in sorted(_TEMP_FILTER_CATEGORIES):
            out[category] = [
                {"temperature_group": group} for group in sorted(temperature_groups)
            ]
    else:
        for category in sorted(_TEMP_FILTER_CATEGORIES):
            out[category] = [{}]

    out["sealant"] = [{}]
    out["aluminium_tape"] = [{}]
    return out


def _filter_candidates(
    *,
    catalog: ResolvedSpecificationCatalog,
    category: str,
    conditions: Mapping[str, Any],
) -> list[SpecificationCandidate]:
    items = [item for item in catalog.items if item.category == category]
    filtered: list[SpecificationCatalogItem] = []
    for item in items:
        if not _item_matches(item, category, conditions):
            continue
        filtered.append(item)

    filtered.sort(key=lambda item: (item.mark, item.nomenclature_code, str(item.id)))
    return [
        SpecificationCandidate(
            catalog_item_id=item.id,
            catalog_id=catalog.version.id,
            catalog_version=catalog.version.version,
            category=item.category,
            name=item.name,
            mark=item.mark,
            nomenclature_code=item.nomenclature_code,
            supply_unit=item.supply_unit,
            applicability=_bounded_mapping(item.applicability),
            package_parameters=_bounded_mapping(item.package_parameters),
            formula_parameters=_bounded_mapping(item.formula_parameters),
        )
        for item in filtered
    ]


def _item_matches(
    item: SpecificationCatalogItem,
    category: str,
    conditions: Mapping[str, Any],
) -> bool:
    applicability = item.applicability if isinstance(item.applicability, Mapping) else {}
    if category in _MARK_FILTER_CATEGORIES:
        mark = conditions.get("mark")
        code = conditions.get("nomenclature_code")
        return (
            isinstance(mark, str)
            and isinstance(code, str)
            and item.mark == mark
            and item.nomenclature_code == code
        )

    if category in _TEMP_FILTER_CATEGORIES:
        required = conditions.get("temperature_group")
        if required is None:
            # No required temp → accept items without temp applicability, or all.
            return True
        item_temp = applicability.get("temperature_group")
        if item_temp is None:
            return False
        try:
            normalized_item = normalize_temperature_group(str(item_temp))
            normalized_required = normalize_temperature_group(str(required))
        except FormulaInputError:
            return False
        return normalized_item == normalized_required

    # sealant / aluminium_tape: all items of the category (optional filters if present)
    for key, expected in conditions.items():
        if key.startswith("_"):
            continue
        actual = applicability.get(key)
        if actual is None:
            continue
        if str(actual) != str(expected):
            return False
    return True


def _resolve_selection(
    *,
    group_key: str,
    category: str,
    conditions: Mapping[str, Any],
    candidates: Sequence[SpecificationCandidate],
    selections: Mapping[str, UUID],
    electrical_variant_id: UUID,
    catalog: ResolvedSpecificationCatalog,
) -> tuple[UUID | None, SpecificationSelectionSource, list[SpecificationDiagnostic]]:
    candidate_ids = {item.catalog_item_id for item in candidates}
    submitted = selections.get(group_key)

    if len(candidates) == 0:
        return None, SpecificationSelectionSource.NONE, [
            _diagnostic(
                SpecificationDiagnosticCode.ACCESSORY_CATALOG_ITEM_MISSING,
                SpecificationIssueKind.BLOCKING,
                "В активном каталоге нет подходящей позиции для комплектующих",
                issues=[
                    {
                        "reason": "no_matching_catalog_item",
                        "category": category,
                        "conditions": dict(conditions),
                        "group_key": group_key,
                    }
                ],
                details={
                    "electrical_variant_id": str(electrical_variant_id),
                    "category": category,
                    "conditions": dict(conditions),
                    "catalog_id": str(catalog.version.id),
                    "catalog_version": catalog.version.version,
                },
            )
        ]

    if len(candidates) == 1:
        only = candidates[0].catalog_item_id
        if submitted is not None and submitted != only:
            return None, SpecificationSelectionSource.NONE, [
                _diagnostic(
                    SpecificationDiagnosticCode.ACCESSORY_SELECTION_REQUIRED,
                    SpecificationIssueKind.SELECTION_REQUIRED,
                    "Выбранная позиция не входит в кандидатов группы",
                    issues=[
                        {
                            "reason": "catalog_selection_not_in_group",
                            "group_key": group_key,
                            "catalog_item_id": str(submitted),
                            "category": category,
                        }
                    ],
                    details={
                        "electrical_variant_id": str(electrical_variant_id),
                        "group_key": group_key,
                        "catalog_id": str(catalog.version.id),
                        "catalog_version": catalog.version.version,
                    },
                )
            ]
        return only, SpecificationSelectionSource.AUTO_SINGLE, []

    # >1 candidates
    if submitted is None:
        return None, SpecificationSelectionSource.NONE, [
            _diagnostic(
                SpecificationDiagnosticCode.ACCESSORY_SELECTION_REQUIRED,
                SpecificationIssueKind.SELECTION_REQUIRED,
                "Требуется выбор позиции каталога для комплектующих",
                issues=[
                    {
                        "reason": "catalog_selection_missing",
                        "group_key": group_key,
                        "category": category,
                        "candidate_count": len(candidates),
                    }
                ],
                details={
                    "electrical_variant_id": str(electrical_variant_id),
                    "group_key": group_key,
                    "category": category,
                    "conditions": dict(conditions),
                    "catalog_id": str(catalog.version.id),
                    "catalog_version": catalog.version.version,
                },
            )
        ]

    if submitted not in candidate_ids:
        return None, SpecificationSelectionSource.NONE, [
            _diagnostic(
                SpecificationDiagnosticCode.ACCESSORY_SELECTION_REQUIRED,
                SpecificationIssueKind.SELECTION_REQUIRED,
                "Выбранная позиция не входит в кандидатов группы",
                issues=[
                    {
                        "reason": "catalog_selection_not_in_group",
                        "group_key": group_key,
                        "catalog_item_id": str(submitted),
                        "category": category,
                    }
                ],
                details={
                    "electrical_variant_id": str(electrical_variant_id),
                    "group_key": group_key,
                    "catalog_id": str(catalog.version.id),
                    "catalog_version": catalog.version.version,
                },
            )
        ]

    return submitted, SpecificationSelectionSource.EXPLICIT, []


def _cable_identity(result: Mapping[str, Any]) -> tuple[str, str] | None:
    cable = result.get("cable")
    mark: Any = None
    code: Any = None
    if isinstance(cable, Mapping):
        mark = cable.get("mark") or cable.get("full_mark")
        code = cable.get("nomenclature_code")
    if not isinstance(mark, str) or not mark.strip():
        mark = result.get("cable_mark")
    if not isinstance(code, str) or not code.strip():
        code = result.get("nomenclature_code")
    if not isinstance(mark, str) or not mark.strip():
        return None
    if not isinstance(code, str) or not code.strip():
        return None
    return mark.strip(), code.strip()


def _normalized_temperature_group(
    result: Mapping[str, Any],
) -> TemperatureGroup | None:
    raw = temperature_group_from_result(dict(result))
    if raw is None:
        return None
    try:
        return normalize_temperature_group(raw)
    except FormulaInputError:
        return None


def _bounded_mapping(value: Any, *, max_keys: int = 32) -> dict[str, Any]:
    if not isinstance(value, Mapping):
        return {}
    out: dict[str, Any] = {}
    for index, (key, item) in enumerate(value.items()):
        if index >= max_keys:
            break
        out[str(key)] = item
    return out


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
