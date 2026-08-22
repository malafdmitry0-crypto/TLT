"""Typed adapter over the canonical standalone grouping implementation."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from enum import StrEnum
from typing import Protocol, TypeAlias
from uuid import UUID

from heatcalc_specification_core.bom.contracts import BomItem
from heatcalc_specification_core.json_types import JsonValue, json_object

MODE_SEPARATE_BY_OBJECT_TYPE = "separate_by_object_type"
MODE_MERGE_MATERIALS = "merge_materials"
_VALID_MODES = frozenset({MODE_SEPARATE_BY_OBJECT_TYPE, MODE_MERGE_MATERIALS})


class GroupingMode(StrEnum):
    SEPARATE_BY_OBJECT_TYPE = MODE_SEPARATE_BY_OBJECT_TYPE
    MERGE_MATERIALS = MODE_MERGE_MATERIALS


class GroupingModeValue(Protocol):
    @property
    def value(self) -> str: ...


GroupingModeInput: TypeAlias = GroupingMode | GroupingModeValue | str


@dataclass(frozen=True, slots=True)
class GroupingIdentity:
    electrical_variant_id: object
    catalog_id: object
    catalog_version: object
    object_type_section: object
    nomenclature_code: object
    supply_unit: object

    @classmethod
    def from_row(cls, item: Mapping[str, object]) -> GroupingIdentity:
        return cls(
            electrical_variant_id=item.get("electrical_variant_id"),
            catalog_id=item.get("catalog_id"),
            catalog_version=item.get("catalog_version"),
            object_type_section=item.get("object_type_section"),
            nomenclature_code=item.get("nomenclature_code"),
            supply_unit=item.get("supply_unit"),
        )


def grouping_key(
    mode: GroupingModeInput,
    *,
    electrical_variant_id: object,
    catalog_id: object,
    catalog_version: object,
    object_type_section: object,
    nomenclature_code: object,
    supply_unit: object,
) -> tuple[object, ...]:
    """Return the exact immutable BOM grouping key for the selected mode."""
    mode_value = _normalize_mode(mode)
    identity = GroupingIdentity(
        electrical_variant_id=_require_identity("electrical_variant_id", electrical_variant_id),
        catalog_id=_require_identity("catalog_id", catalog_id),
        catalog_version=_require_identity("catalog_version", catalog_version),
        object_type_section=object_type_section,
        nomenclature_code=_require_identity("nomenclature_code", nomenclature_code),
        supply_unit=_require_identity("supply_unit", supply_unit),
    )
    if mode_value is GroupingMode.SEPARATE_BY_OBJECT_TYPE:
        return (
            identity.electrical_variant_id,
            identity.catalog_id,
            identity.catalog_version,
            _require_identity("object_type_section", identity.object_type_section),
            identity.nomenclature_code,
            identity.supply_unit,
        )
    return (
        identity.electrical_variant_id,
        identity.catalog_id,
        identity.catalog_version,
        identity.nomenclature_code,
        identity.supply_unit,
    )


def merge_items(
    items: Sequence[Mapping[str, object]],
    mode: GroupingModeInput,
) -> list[dict[str, object]]:
    """Merge BOM-like rows by their exact domain identity."""
    mode_value = _normalize_mode(mode)
    order: list[tuple[object, ...]] = []
    buckets: dict[tuple[object, ...], dict[str, object]] = {}
    for item in items:
        identity = GroupingIdentity.from_row(item)
        key = grouping_key(
            mode_value,
            electrical_variant_id=identity.electrical_variant_id,
            catalog_id=identity.catalog_id,
            catalog_version=identity.catalog_version,
            object_type_section=identity.object_type_section,
            nomenclature_code=identity.nomenclature_code,
            supply_unit=identity.supply_unit,
        )
        quantity = _quantity_to_decimal(item.get("quantity"))
        if key not in buckets:
            row = dict(item)
            row["quantity"] = quantity
            if "provenance" in item:
                row["provenance"] = _normalize_provenance_list(item.get("provenance"))
            buckets[key] = row
            order.append(key)
            continue
        existing = buckets[key]
        existing_quantity = existing["quantity"]
        if not isinstance(existing_quantity, Decimal):
            raise TypeError("grouped quantity must be Decimal")
        existing["quantity"] = existing_quantity + quantity
        if "provenance" in item or "provenance" in existing:
            base = existing.get("provenance")
            if not isinstance(base, list):
                base = _normalize_provenance_list(base)
                existing["provenance"] = base
            if "provenance" in item:
                base.extend(_normalize_provenance_list(item.get("provenance")))
    return [buckets[key] for key in order]


def _normalize_mode(mode: GroupingModeInput) -> GroupingMode:
    value = mode.value if not isinstance(mode, str) else mode
    text = str(value)
    if text not in _VALID_MODES:
        raise ValueError(f"unknown grouping mode: {mode!r}; expected one of {sorted(_VALID_MODES)}")
    return GroupingMode(text)


def _require_identity(name: str, value: object) -> object:
    if value is None or isinstance(value, bool):
        raise ValueError(f"grouping identity field {name} is required")
    if isinstance(value, str) and not value.strip():
        raise ValueError(f"grouping identity field {name} must not be blank")
    return value


def _quantity_to_decimal(value: object) -> Decimal:
    if isinstance(value, Decimal):
        return value
    if isinstance(value, bool):
        raise TypeError("boolean is not a valid quantity")
    if value is None:
        raise TypeError("quantity is required")
    try:
        if isinstance(value, int):
            return Decimal(value)
        if isinstance(value, float):
            return Decimal(str(value))
        if isinstance(value, str):
            text = value.strip()
            if not text:
                raise TypeError("empty string is not a valid quantity")
            return Decimal(text)
        raise TypeError(f"invalid quantity: {value!r}")
    except (InvalidOperation, ValueError, TypeError) as exc:
        raise TypeError(f"invalid quantity: {value!r}") from exc


def _normalize_provenance_list(value: object) -> list[object]:
    if value is None:
        return []
    if isinstance(value, list):
        return list(value)
    return [value]


def apply_grouping(
    items: Sequence[BomItem],
    *,
    grouping_mode: object,
    electrical_variant_id: UUID,
    catalog_id: UUID,
    catalog_version: str,
) -> tuple[BomItem, ...]:
    if not items:
        return ()
    mode = str(getattr(grouping_mode, "value", grouping_mode))
    rows: list[dict[str, object]] = []
    for item in items:
        params = dict(item.params)
        rows.append(
            {
                "category": item.category,
                "name": item.name,
                "article": item.article,
                "unit": item.unit,
                "quantity": item.quantity,
                "params": params,
                "source": item.source,
                "electrical_variant_id": params.get(
                    "electrical_variant_id", str(electrical_variant_id)
                ),
                "catalog_id": params.get("catalog_id", str(catalog_id)),
                "catalog_version": params.get("catalog_version", catalog_version),
                "object_type_section": params.get("object_type_section", "common"),
                "nomenclature_code": params.get("nomenclature_code", item.article or ""),
                "supply_unit": params.get("supply_unit", item.unit),
            }
        )

    result: list[BomItem] = []
    for row in merge_items(rows, mode):
        params = _json_mapping(row.get("params"))
        section = str(
            row.get("object_type_section") or params.get("object_type_section") or "common"
        )
        if mode == MODE_MERGE_MATERIALS:
            section = "common"
        params.update(
            {
                "object_type_section": section,
                "electrical_variant_id": str(
                    row.get("electrical_variant_id")
                    or params.get("electrical_variant_id")
                    or electrical_variant_id
                ),
                "catalog_id": str(row.get("catalog_id") or params.get("catalog_id") or catalog_id),
                "catalog_version": str(
                    row.get("catalog_version") or params.get("catalog_version") or catalog_version
                ),
                "nomenclature_code": str(
                    row.get("nomenclature_code")
                    or params.get("nomenclature_code")
                    or row.get("article")
                    or ""
                ),
                "supply_unit": str(
                    row.get("supply_unit") or params.get("supply_unit") or row.get("unit") or ""
                ),
            }
        )
        quantity = row.get("quantity")
        if not isinstance(quantity, Decimal):
            raise TypeError("grouped quantity must be Decimal")
        result.append(
            BomItem(
                category=str(row.get("category") or ""),
                name=str(row.get("name") or ""),
                article=str(row["article"]) if row.get("article") is not None else None,
                unit=str(row.get("unit") or params["supply_unit"] or "шт."),
                quantity=quantity,
                params=json_object(params),
            )
        )
    return tuple(result)


def _json_mapping(value: object) -> dict[str, JsonValue]:
    if not isinstance(value, Mapping):
        return {}
    return dict(json_object(value))
