"""Filter immutable catalog items for a candidate condition slice."""

from __future__ import annotations

from heatcalc_specification_core.candidates.condition_contracts import (
    CableCondition,
    CandidateCondition,
    InvalidCondition,
    TemperatureCondition,
)
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
    condition: CandidateCondition,
) -> tuple[SpecificationCandidate, ...]:
    filtered = [
        item
        for item in catalog.items
        if item.category == category and item_matches(item, category, condition)
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
    condition: CandidateCondition,
) -> bool:
    if isinstance(condition, InvalidCondition):
        return False
    parameters = item.parameters
    if category in MARK_FILTER_CATEGORIES:
        return isinstance(condition, CableCondition) and (
            item.mark == condition.mark and item.nomenclature_code == condition.nomenclature_code
        )

    if category in TEMP_FILTER_CATEGORIES:
        if not isinstance(condition, TemperatureCondition):
            return True
        item_temperature = parameters.temperature_group
        if item_temperature is None:
            return False
        try:
            normalized_item = normalize_temperature_group(str(item_temperature))
        except FormulaInputError:
            return False
        return normalized_item == condition.temperature_group

    return True
