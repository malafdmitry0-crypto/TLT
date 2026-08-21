"""Strict catalog parameters consumed by candidate and BOM pipelines."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation

from heatcalc_specification_core.box_matrix import box_row_from_catalog_parts
from heatcalc_specification_core.json_types import JsonObject, JsonValue, json_object, mutable_json
from heatcalc_specification_core.types import BoxRowInput


@dataclass(frozen=True, slots=True)
class CatalogParameters:
    """Parsed parameters; raw JSON is retained only for boundary serialization."""

    temperature_group: str | None = None
    sections_per_kit: Decimal | None = None
    cable_length_per_kit_m: Decimal | None = None
    kits_per_sealant_unit: Decimal | None = None
    reel_length_m: Decimal | None = None
    consumption_m_per_cable_m: Decimal | None = None
    box_row: BoxRowInput | None = None
    _applicability_json: JsonObject = field(default_factory=dict)
    _package_json: JsonObject = field(default_factory=dict)
    _formula_json: JsonObject = field(default_factory=dict)

    @classmethod
    def parse(
        cls,
        *,
        category: str,
        applicability: Mapping[str, object],
        package_parameters: Mapping[str, object],
        formula_parameters: Mapping[str, object],
        item_key: str | None = None,
        mark: str | None = None,
        nomenclature_code: str | None = None,
    ) -> CatalogParameters:
        applicability_json = json_object(applicability)
        package_json = json_object(package_parameters)
        formula_json = json_object(formula_parameters)
        return cls(
            temperature_group=_optional_text(applicability.get("temperature_group")),
            sections_per_kit=_optional_decimal(package_parameters.get("sections_per_kit")),
            cable_length_per_kit_m=_optional_decimal(
                package_parameters.get("cable_length_per_kit_m")
            ),
            kits_per_sealant_unit=_optional_decimal(
                package_parameters.get("kits_per_sealant_unit")
            ),
            reel_length_m=_optional_decimal(package_parameters.get("reel_length_m")),
            consumption_m_per_cable_m=_optional_decimal(
                formula_parameters.get("consumption_m_per_cable_m")
            ),
            box_row=(
                box_row_from_catalog_parts(
                    formula_parameters=formula_parameters,
                    applicability=applicability,
                    item_key=item_key,
                    mark=mark,
                    nomenclature_code=nomenclature_code,
                )
                if category == "box"
                else None
            ),
            _applicability_json=applicability_json,
            _package_json=package_json,
            _formula_json=formula_json,
        )

    def applicability_dict(self) -> dict[str, JsonValue]:
        return _mutable_object(self._applicability_json)

    def package_dict(self) -> dict[str, JsonValue]:
        return _mutable_object(self._package_json)

    def formula_dict(self) -> dict[str, JsonValue]:
        return _mutable_object(self._formula_json)


def _optional_decimal(value: object) -> Decimal | None:
    if value is None or isinstance(value, bool):
        return None
    try:
        result = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return None
    return result if result.is_finite() else None


def _optional_text(value: object) -> str | None:
    return str(value) if value is not None else None


def _mutable_object(value: JsonObject) -> dict[str, JsonValue]:
    mutable = mutable_json(value)
    if not isinstance(mutable, Mapping):
        raise TypeError("catalog parameters must serialize to an object")
    return dict(mutable)
