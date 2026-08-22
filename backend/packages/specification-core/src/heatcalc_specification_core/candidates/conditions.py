"""Derive deterministic category-condition slices from typed electrical results."""

from __future__ import annotations

from collections.abc import Sequence

from heatcalc_specification_core.candidates.condition_contracts import (
    CableCondition,
    CandidateCondition,
    CandidateResultSnapshot,
    InvalidCondition,
    InvalidConditionReason,
    TemperatureCondition,
    UniversalCondition,
)

TEMP_FILTER_CATEGORIES = frozenset({"connection_kit", "repair_kit", "fiberglass_tape"})


def conditions_for_categories(
    results: Sequence[CandidateResultSnapshot],
) -> dict[str, list[CandidateCondition]]:
    cable_identities = {
        result.cable_identity for result in results if result.cable_identity is not None
    }
    temperature_groups = {
        result.temperature_group for result in results if result.temperature_group is not None
    }

    invalid_cable_identity = any(result.cable_identity is None for result in results)
    invalid_temperature_group = any(result.temperature_group is None for result in results)

    conditions: dict[str, list[CandidateCondition]] = {}
    if invalid_cable_identity:
        conditions["cable"] = [InvalidCondition(InvalidConditionReason.CABLE_IDENTITY_UNRESOLVED)]
    elif cable_identities:
        conditions["cable"] = [
            CableCondition(identity.mark, identity.nomenclature_code)
            for identity in sorted(
                cable_identities,
                key=lambda item: (item.mark, item.nomenclature_code),
            )
        ]
    else:
        conditions["cable"] = [InvalidCondition(InvalidConditionReason.CABLE_IDENTITY_UNRESOLVED)]

    if invalid_temperature_group:
        for category in sorted(TEMP_FILTER_CATEGORIES):
            conditions[category] = [
                InvalidCondition(InvalidConditionReason.TEMPERATURE_GROUP_UNRESOLVED)
            ]
    elif temperature_groups:
        for category in sorted(TEMP_FILTER_CATEGORIES):
            conditions[category] = [
                TemperatureCondition(group) for group in sorted(temperature_groups)
            ]
    else:
        for category in sorted(TEMP_FILTER_CATEGORIES):
            conditions[category] = [UniversalCondition()]

    conditions["sealant"] = [UniversalCondition()]
    conditions["aluminium_tape"] = [UniversalCondition()]
    return conditions
