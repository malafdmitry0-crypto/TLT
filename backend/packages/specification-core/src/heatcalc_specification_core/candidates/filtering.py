"""Filter immutable catalog items for a candidate condition slice."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from heatcalc_specification_core.candidates.conditions import TEMP_FILTER_CATEGORIES
from heatcalc_specification_core.candidates.contracts import (
    CandidateCatalog,
    CandidateCatalogItem,
    SpecificationCandidate,
)
from heatcalc_specification_core.common import normalize_temperature_group
from heatcalc_specification_core.types import FormulaInputError

MARK_FILTER_CATEGORIES = frozenset({"cable"})


def filter_candidates(
    *,
    catalog: CandidateCatalog,
    category: str,
    conditions: Mapping[str, Any],
) -> tuple[SpecificationCandidate, ...]:
    filtered = [
        item
        for item in catalog.items
        if item.category == category and item_matches(item, category, conditions)
    ]
    filtered.sort(key=lambda item: (item.mark, item.nomenclature_code, str(item.id)))
    return tuple(
        SpecificationCandidate(
            catalog_item_id=item.id,
            catalog_id=catalog.version.id,
            catalog_version=catalog.version.version,
            category=item.category,
            name=item.name,
            mark=item.mark,
            nomenclature_code=item.nomenclature_code,
            supply_unit=item.supply_unit,
            parameters=item.parameters,
        )
        for item in filtered
    )


def item_matches(
    item: CandidateCatalogItem,
    category: str,
    conditions: Mapping[str, Any],
) -> bool:
    parameters = item.parameters
    if category in MARK_FILTER_CATEGORIES:
        mark = conditions.get("mark")
        code = conditions.get("nomenclature_code")
        return (
            isinstance(mark, str)
            and isinstance(code, str)
            and item.mark == mark
            and item.nomenclature_code == code
        )

    if category in TEMP_FILTER_CATEGORIES:
        required = conditions.get("temperature_group")
        if required is None:
            return True
        item_temperature = parameters.temperature_group
        if item_temperature is None:
            return False
        try:
            normalized_item = normalize_temperature_group(str(item_temperature))
            normalized_required = normalize_temperature_group(str(required))
        except FormulaInputError:
            return False
        return normalized_item == normalized_required

    for key, expected in conditions.items():
        if key.startswith("_"):
            continue
        actual = parameters.applicability_dict().get(key)
        if actual is None:
            continue
        if str(actual) != str(expected):
            return False
    return True
