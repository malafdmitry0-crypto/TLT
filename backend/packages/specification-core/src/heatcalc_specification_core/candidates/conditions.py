"""Derive deterministic category-condition slices from electrical results."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any

from heatcalc_specification_core.catalog_identity import temperature_group_from_result
from heatcalc_specification_core.common import normalize_temperature_group
from heatcalc_specification_core.types import FormulaInputError, TemperatureGroup

TEMP_FILTER_CATEGORIES = frozenset({"connection_kit", "repair_kit", "fiberglass_tape"})


def conditions_for_categories(
    results: Sequence[Mapping[str, Any]],
) -> dict[str, list[dict[str, Any]]]:
    cable_identities: set[tuple[str, str]] = set()
    temperature_groups: set[str] = set()
    for result in results:
        identity = cable_identity(result)
        if identity is not None:
            cable_identities.add(identity)
        temperature_group = normalized_temperature_group(result)
        if temperature_group is not None:
            temperature_groups.add(temperature_group.value)

    invalid_cable_identity = any(cable_identity(result) is None for result in results)
    invalid_temperature_group = any(
        normalized_temperature_group(result) is None for result in results
    )

    conditions: dict[str, list[dict[str, Any]]] = {}
    if invalid_cable_identity:
        conditions["cable"] = [{"_invalid_cable_identity": True}]
    elif cable_identities:
        conditions["cable"] = [
            {"mark": mark, "nomenclature_code": code} for mark, code in sorted(cable_identities)
        ]
    else:
        conditions["cable"] = [{"_invalid_cable_identity": True}]

    if invalid_temperature_group:
        for category in sorted(TEMP_FILTER_CATEGORIES):
            conditions[category] = [{"_invalid_temperature_group": True}]
    elif temperature_groups:
        for category in sorted(TEMP_FILTER_CATEGORIES):
            conditions[category] = [
                {"temperature_group": group} for group in sorted(temperature_groups)
            ]
    else:
        for category in sorted(TEMP_FILTER_CATEGORIES):
            conditions[category] = [{}]

    conditions["sealant"] = [{}]
    conditions["aluminium_tape"] = [{}]
    return conditions


def cable_identity(result: Mapping[str, Any]) -> tuple[str, str] | None:
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


def normalized_temperature_group(result: Mapping[str, Any]) -> TemperatureGroup | None:
    raw = temperature_group_from_result(dict(result))
    if raw is None:
        return None
    try:
        return normalize_temperature_group(raw)
    except FormulaInputError:
        return None
