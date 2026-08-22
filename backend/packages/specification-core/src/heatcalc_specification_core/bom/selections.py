"""Fail-closed validation and resolution of catalog selections."""

from __future__ import annotations

import hashlib
import json
import re
from collections.abc import Mapping, Sequence
from uuid import UUID

from heatcalc_specification_core.bom.contracts import (
    CandidateGroup,
    CatalogItem,
    DiagnosticKind,
    GenerationFailure,
    SpecificationDiagnostic,
)
from heatcalc_specification_core.json_types import JsonValue

_GROUP_KEY_RE = re.compile(r"^cg_([0-9a-f]{32})_[0-9a-f]{40}$")


def candidate_set_fingerprint(candidate_ids: Sequence[UUID]) -> str:
    material = [str(item_id) for item_id in sorted(candidate_ids, key=str)]
    encoded = json.dumps(material, ensure_ascii=False, separators=(",", ":")).encode()
    return f"sha256:{hashlib.sha256(encoded).hexdigest()}"


def resolve_selected_items(
    groups: Sequence[CandidateGroup],
    items_by_id: Mapping[UUID, CatalogItem],
    electrical_variant_id: UUID,
) -> dict[str, CatalogItem] | GenerationFailure:
    diagnostics: list[SpecificationDiagnostic] = []
    selected: dict[str, CatalogItem] = {}
    seen_keys: set[str] = set()

    for group in groups:
        if group.group_key in seen_keys:
            diagnostics.append(
                _blocking(
                    "SPEC_ACCESSORY_SELECTION_REQUIRED",
                    "Группа выбора каталога продублирована",
                    reason="catalog_selection_duplicate_group",
                    group_key=group.group_key,
                )
            )
            continue
        seen_keys.add(group.group_key)

        match = _GROUP_KEY_RE.fullmatch(group.group_key)
        if match is None or match.group(1) != electrical_variant_id.hex:
            diagnostics.append(
                _blocking(
                    "SPEC_ACCESSORY_SELECTION_REQUIRED",
                    "Группа выбора относится к другой ЭР или имеет неверный ключ",
                    reason="catalog_selection_invalid_group_scope",
                    group_key=group.group_key,
                )
            )
            continue
        if group.electrical_variant_id != electrical_variant_id:
            diagnostics.append(
                _blocking(
                    "SPEC_ACCESSORY_SELECTION_REQUIRED",
                    "Группа выбора относится к другой ЭР",
                    reason="catalog_selection_variant_mismatch",
                    group_key=group.group_key,
                )
            )
            continue

        candidates = tuple(group.candidate_catalog_item_ids)
        expected = candidate_set_fingerprint(candidates) if candidates else None
        if expected != group.candidate_set_fingerprint:
            diagnostics.append(
                _blocking(
                    "SPEC_ACCESSORY_SELECTION_REQUIRED",
                    "Набор кандидатов изменился",
                    reason="candidate_set_fingerprint_mismatch",
                    group_key=group.group_key,
                )
            )
            continue
        missing_candidates = [item_id for item_id in candidates if item_id not in items_by_id]
        if missing_candidates:
            diagnostics.append(
                _blocking(
                    "SPEC_ACCESSORY_CATALOG_ITEM_MISSING",
                    "Кандидат отсутствует в разрешённом каталоге",
                    reason="candidate_not_in_catalog",
                    group_key=group.group_key,
                    catalog_item_ids=[str(item_id) for item_id in missing_candidates],
                )
            )
            continue

        selected_id = group.selected_catalog_item_id
        if selected_id is None:
            diagnostics.append(
                _blocking(
                    "SPEC_ACCESSORY_SELECTION_REQUIRED",
                    "Не выбран элемент каталога для группы комплектующих",
                    reason="catalog_selection_missing",
                    group_key=group.group_key,
                    category=group.category,
                )
            )
            continue
        if selected_id not in candidates:
            diagnostics.append(
                _blocking(
                    "SPEC_ACCESSORY_SELECTION_REQUIRED",
                    "Выбранная позиция не входит в кандидатов группы",
                    reason="catalog_selection_not_in_group",
                    group_key=group.group_key,
                    catalog_item_id=str(selected_id),
                )
            )
            continue

        item = items_by_id[selected_id]
        if item.category != group.category:
            diagnostics.append(
                _blocking(
                    "SPEC_ACCESSORY_SELECTION_REQUIRED",
                    "Категория выбранной позиции не соответствует группе",
                    reason="catalog_selection_category_mismatch",
                    group_key=group.group_key,
                    catalog_item_id=str(selected_id),
                )
            )
            continue
        selected[group.group_key] = item

    if diagnostics:
        return GenerationFailure(tuple(diagnostics))
    return selected


def _blocking(
    code: str,
    message: str,
    *,
    reason: str,
    **issue: JsonValue,
) -> SpecificationDiagnostic:
    return SpecificationDiagnostic(
        code=code,
        kind=DiagnosticKind.BLOCKING,
        message=message,
        issues=({"reason": reason, **issue},),
    )
