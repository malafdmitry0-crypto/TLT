"""Pure BOM row grouping for SPEC-CANON-07.

Exact grouping keys within one ER:

* ``separate_by_object_type`` —
  ``(electrical_variant_id, catalog_id, catalog_version,
  object_type_section, nomenclature_code, supply_unit)``
* ``merge_materials`` —
  ``(electrical_variant_id, catalog_id, catalog_version,
  nomenclature_code, supply_unit)``

Never merges different electrical variants, catalog versions, nomenclature
codes, or supply units.

Dependency-free pure layer: no FastAPI, SQLAlchemy, or schema imports.
Mode values are string literals matching ``SpecificationGroupingMode``.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from decimal import Decimal, InvalidOperation
from typing import Any

# String mode values aligned with app.schemas.specification.SpecificationGroupingMode
MODE_SEPARATE_BY_OBJECT_TYPE = "separate_by_object_type"
MODE_MERGE_MATERIALS = "merge_materials"

_VALID_MODES = frozenset({MODE_SEPARATE_BY_OBJECT_TYPE, MODE_MERGE_MATERIALS})


def _require_identity(name: str, value: Any) -> Any:
    if value is None or isinstance(value, bool):
        raise ValueError(f"grouping identity field {name} is required")
    if isinstance(value, str) and not value.strip():
        raise ValueError(f"grouping identity field {name} must not be blank")
    return value


def _normalize_mode(mode: Any) -> str:
    """Accept string literals or enum-like objects with a ``.value`` attribute."""
    value = getattr(mode, "value", mode)
    text = str(value)
    if text not in _VALID_MODES:
        raise ValueError(
            f"unknown grouping mode: {mode!r}; " f"expected one of {sorted(_VALID_MODES)}"
        )
    return text


def grouping_key(
    mode: Any,
    *,
    electrical_variant_id: Any,
    catalog_id: Any,
    catalog_version: Any,
    object_type_section: Any,
    nomenclature_code: Any,
    supply_unit: Any,
) -> tuple[Any, ...]:
    """Return the exact immutable grouping key for the given mode.

    Parameters are intentionally untyped so callers can pass domain IDs without
    coupling this pure module to schemas. Missing/blank identity is rejected:
    such rows cannot be safely grouped.
    """
    mode_value = _normalize_mode(mode)
    identity = {
        "electrical_variant_id": _require_identity("electrical_variant_id", electrical_variant_id),
        "catalog_id": _require_identity("catalog_id", catalog_id),
        "catalog_version": _require_identity("catalog_version", catalog_version),
        "nomenclature_code": _require_identity("nomenclature_code", nomenclature_code),
        "supply_unit": _require_identity("supply_unit", supply_unit),
    }
    if mode_value == MODE_SEPARATE_BY_OBJECT_TYPE:
        return (
            identity["electrical_variant_id"],
            identity["catalog_id"],
            identity["catalog_version"],
            _require_identity("object_type_section", object_type_section),
            identity["nomenclature_code"],
            identity["supply_unit"],
        )
    # merge_materials — object_type_section is intentionally excluded
    return (
        identity["electrical_variant_id"],
        identity["catalog_id"],
        identity["catalog_version"],
        identity["nomenclature_code"],
        identity["supply_unit"],
    )


def _quantity_to_decimal(value: Any) -> Decimal:
    """Coerce quantity to Decimal without inventing defaults for missing values."""
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
            # str() avoids binary float artefacts before Decimal conversion
            return Decimal(str(value))
        if isinstance(value, str):
            text = value.strip()
            if not text:
                raise TypeError("empty string is not a valid quantity")
            return Decimal(text)
        return Decimal(value)
    except (InvalidOperation, ValueError, TypeError) as exc:
        raise TypeError(f"invalid quantity: {value!r}") from exc


def _item_grouping_fields(item: Mapping[str, Any]) -> dict[str, Any]:
    return {
        "electrical_variant_id": item.get("electrical_variant_id"),
        "catalog_id": item.get("catalog_id"),
        "catalog_version": item.get("catalog_version"),
        "object_type_section": item.get("object_type_section"),
        "nomenclature_code": item.get("nomenclature_code"),
        "supply_unit": item.get("supply_unit"),
    }


def _normalize_provenance_list(value: Any) -> list[Any]:
    if value is None:
        return []
    if isinstance(value, list):
        return list(value)
    return [value]


def merge_items(
    items: Sequence[Mapping[str, Any]],
    mode: Any,
) -> list[dict[str, Any]]:
    """Merge BOM-like items by exact grouping key for ``mode``.

    * Same key → sum ``quantity`` as :class:`~decimal.Decimal`.
    * ``provenance`` lists (if present on any contributor) are concatenated
      in encounter order.
    * Other fields are taken from the first item for that key (stable).
    * Output order is first-seen key order.
    """
    mode_value = _normalize_mode(mode)
    order: list[tuple[Any, ...]] = []
    buckets: dict[tuple[Any, ...], dict[str, Any]] = {}

    for item in items:
        fields = _item_grouping_fields(item)
        key = grouping_key(mode_value, **fields)
        qty = _quantity_to_decimal(item.get("quantity"))

        if key not in buckets:
            row = dict(item)
            row["quantity"] = qty
            if "provenance" in item:
                row["provenance"] = _normalize_provenance_list(item.get("provenance"))
            buckets[key] = row
            order.append(key)
            continue

        existing = buckets[key]
        existing["quantity"] = existing["quantity"] + qty
        if "provenance" in item or "provenance" in existing:
            base = existing.get("provenance")
            if not isinstance(base, list):
                base = _normalize_provenance_list(base)
                existing["provenance"] = base
            if "provenance" in item:
                base.extend(_normalize_provenance_list(item.get("provenance")))

    return [buckets[key] for key in order]
