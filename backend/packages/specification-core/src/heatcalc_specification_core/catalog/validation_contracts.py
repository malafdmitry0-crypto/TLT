"""Typed contracts for pure catalog-content validation."""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import StrEnum

from heatcalc_specification_core.json_types import JsonObject, JsonValue, json_object, mutable_json


class CatalogCategory(StrEnum):
    CABLE = "cable"
    CONNECTION_KIT = "connection_kit"
    REPAIR_KIT = "repair_kit"
    SEALANT = "sealant"
    FIBERGLASS_TAPE = "fiberglass_tape"
    ALUMINIUM_TAPE = "aluminium_tape"
    BOX = "box"


@dataclass(frozen=True, slots=True)
class CatalogContentItem:
    item_key: str
    category: CatalogCategory
    name: str
    mark: str
    nomenclature_code: str
    supply_unit: str
    applicability: JsonObject
    package_parameters: JsonObject
    formula_parameters: JsonObject
    source_ref: str
    is_demo_source: bool = False

    def __post_init__(self) -> None:
        object.__setattr__(self, "applicability", json_object(self.applicability))
        object.__setattr__(self, "package_parameters", json_object(self.package_parameters))
        object.__setattr__(self, "formula_parameters", json_object(self.formula_parameters))


@dataclass(frozen=True, slots=True)
class CatalogValidationIssue:
    code: str
    reason: str
    item_key: str | None = None
    category: str | None = None
    details: JsonObject = field(default_factory=dict)

    def __post_init__(self) -> None:
        object.__setattr__(self, "details", json_object(self.details))

    def to_dict(self) -> dict[str, JsonValue]:
        result: dict[str, JsonValue] = {"code": self.code, "reason": self.reason}
        if self.item_key is not None:
            result["item_key"] = self.item_key
        if self.category is not None:
            result["category"] = self.category
        if self.details:
            result["details"] = mutable_json(self.details)
        return result


@dataclass(frozen=True, slots=True)
class CatalogValidation:
    is_complete: bool
    issues: tuple[CatalogValidationIssue, ...]
