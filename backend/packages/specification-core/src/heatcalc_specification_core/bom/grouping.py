"""Typed adapter over the canonical standalone grouping implementation."""

from __future__ import annotations

from collections.abc import Sequence
from uuid import UUID

from heatcalc_specification_core.bom.contracts import BomItem
from heatcalc_specification_core.grouping import MODE_MERGE_MATERIALS, merge_items


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
        params = dict(row.get("params") or {})
        section = row.get("object_type_section") or params.get("object_type_section") or "common"
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
        result.append(
            BomItem(
                category=str(row.get("category") or ""),
                name=str(row.get("name") or ""),
                article=str(row["article"]) if row.get("article") is not None else None,
                unit=str(row.get("unit") or params["supply_unit"] or "шт."),
                quantity=row["quantity"],
                params=params,
            )
        )
    return tuple(result)
