"""Typed electrical-result and candidate-condition contracts."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from enum import StrEnum
from typing import TypeAlias

from heatcalc_specification_core.common import normalize_temperature_group
from heatcalc_specification_core.json_types import JsonObject, json_object
from heatcalc_specification_core.types import FormulaInputError, TemperatureGroup


class InvalidConditionReason(StrEnum):
    CABLE_IDENTITY_UNRESOLVED = "cable_identity_unresolved"
    TEMPERATURE_GROUP_UNRESOLVED = "temperature_group_unresolved"


@dataclass(frozen=True, slots=True)
class CableIdentity:
    mark: str
    nomenclature_code: str


@dataclass(frozen=True, slots=True)
class CandidateResultSnapshot:
    """Only the electrical-result fields used by candidate discovery."""

    cable_identity: CableIdentity | None
    temperature_group: TemperatureGroup | None

    @classmethod
    def from_mapping(cls, value: Mapping[str, object]) -> CandidateResultSnapshot:
        cable = _mapping(value.get("cable"))
        mark = _non_blank_text(cable.get("mark") or cable.get("full_mark"))
        code = _non_blank_text(cable.get("nomenclature_code"))
        if mark is None:
            mark = _non_blank_text(value.get("cable_mark"))
        if code is None:
            code = _non_blank_text(value.get("nomenclature_code"))
        identity = CableIdentity(mark, code) if mark is not None and code is not None else None
        return cls(
            cable_identity=identity,
            temperature_group=_temperature_group(value),
        )


@dataclass(frozen=True, slots=True)
class CableCondition:
    mark: str
    nomenclature_code: str


@dataclass(frozen=True, slots=True)
class TemperatureCondition:
    temperature_group: TemperatureGroup


@dataclass(frozen=True, slots=True)
class UniversalCondition:
    pass


@dataclass(frozen=True, slots=True)
class InvalidCondition:
    reason: InvalidConditionReason


CandidateCondition: TypeAlias = (
    CableCondition | TemperatureCondition | UniversalCondition | InvalidCondition
)


def condition_json(condition: CandidateCondition) -> JsonObject:
    if isinstance(condition, CableCondition):
        return json_object(
            {
                "mark": condition.mark,
                "nomenclature_code": condition.nomenclature_code,
            }
        )
    if isinstance(condition, TemperatureCondition):
        return json_object({"temperature_group": condition.temperature_group.value})
    if isinstance(condition, InvalidCondition):
        key = (
            "_invalid_cable_identity"
            if condition.reason is InvalidConditionReason.CABLE_IDENTITY_UNRESOLVED
            else "_invalid_temperature_group"
        )
        return json_object({key: True})
    return json_object({})


def condition_from_json(value: Mapping[str, object]) -> CandidateCondition:
    """Parse the persisted condition shape without permissive fallbacks."""
    if value.get("_invalid_cable_identity") is True:
        return InvalidCondition(InvalidConditionReason.CABLE_IDENTITY_UNRESOLVED)
    if value.get("_invalid_temperature_group") is True:
        return InvalidCondition(InvalidConditionReason.TEMPERATURE_GROUP_UNRESOLVED)
    mark = _non_blank_text(value.get("mark"))
    code = _non_blank_text(value.get("nomenclature_code"))
    if mark is not None or code is not None:
        if mark is None or code is None:
            raise ValueError("cable condition requires mark and nomenclature_code")
        return CableCondition(mark, code)
    temperature_group = _normalized_temperature_group(value.get("temperature_group"))
    if temperature_group is not None:
        return TemperatureCondition(temperature_group)
    if value:
        raise ValueError("unknown candidate condition fields")
    return UniversalCondition()


def _temperature_group(result: Mapping[str, object]) -> TemperatureGroup | None:
    snapshot = _mapping(result.get("cable_snapshot"))
    sources = (
        result,
        _mapping(result.get("cable")),
        snapshot,
        _mapping(snapshot.get("technical")),
        _mapping(snapshot.get("selection")),
    )
    for source in sources:
        normalized = _normalized_temperature_group(source.get("temperature_group"))
        if normalized is not None:
            return normalized
    return None


def _normalized_temperature_group(value: object) -> TemperatureGroup | None:
    if not isinstance(value, str):
        return None
    try:
        return normalize_temperature_group(value)
    except FormulaInputError:
        return None


def _mapping(value: object) -> Mapping[str, object]:
    if not isinstance(value, Mapping):
        return {}
    return {str(key): item for key, item in value.items()}


def _non_blank_text(value: object) -> str | None:
    return value.strip() if isinstance(value, str) and value.strip() else None
