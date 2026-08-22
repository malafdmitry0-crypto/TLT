"""Typed contracts for catalog applicability conditions."""

from __future__ import annotations

from dataclasses import dataclass
from dataclasses import field as dataclass_field
from typing import Literal, TypeAlias

from heatcalc_specification_core.json_types import JsonObject, JsonValue, json_object

ConditionKind: TypeAlias = Literal["bool", "ex", "r_gr"]
ConditionInput: TypeAlias = JsonValue | None


@dataclass(frozen=True, slots=True)
class ConditionValidationIssue:
    code: str
    reason: str
    field: str | None = None
    details: JsonObject = dataclass_field(default_factory=dict)

    def __post_init__(self) -> None:
        object.__setattr__(self, "details", json_object(self.details))
