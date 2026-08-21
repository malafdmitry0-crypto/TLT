"""Cable BOM rows: pure sum by presentation section and mark."""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Mapping, Sequence
from uuid import UUID

from heatcalc_specification_core.bom.contracts import (
    BlockingBomError,
    BomItem,
    CatalogItem,
    DiagnosticKind,
    SpecificationContribution,
    SpecificationDiagnostic,
)
from heatcalc_specification_core.bom.rows import FORMULA_FINGERPRINTS, item_from_catalog
from heatcalc_specification_core.cable import calculate_cable_mark
from heatcalc_specification_core.types import CableGroupInput, CableMarkInput


def build_cable_items(
    *,
    electrical_variant_id: UUID,
    contributions: Sequence[SpecificationContribution],
    catalog_id: UUID,
    catalog_version: str,
    selected: Mapping[str, CatalogItem],
) -> list[BomItem]:
    by_section_mark: dict[tuple[str, str], list[SpecificationContribution]] = defaultdict(list)
    for row in contributions:
        section = str(getattr(row.object_type_section, "value", row.object_type_section))
        by_section_mark[(section, row.cable_mark)].append(row)

    items: list[BomItem] = []
    for (section, mark), rows in sorted(by_section_mark.items()):
        catalog_item = next(
            (item for item in selected.values() if item.category == "cable" and item.mark == mark),
            None,
        )
        if catalog_item is None:
            raise BlockingBomError(
                (
                    SpecificationDiagnostic(
                        code="SPEC_ACCESSORY_CATALOG_ITEM_MISSING",
                        kind=DiagnosticKind.BLOCKING,
                        message=f"Нет выбранной позиции кабеля для марки {mark}",
                        issues=({"reason": "cable_selection_missing", "mark": mark},),
                    ),
                )
            )
        result = calculate_cable_mark(
            CableMarkInput(
                groups=tuple(
                    CableGroupInput(
                        section_length_m=row.section_length_m,
                        section_count=row.section_count,
                    )
                    for row in rows
                ),
                order_lengths_m=tuple(row.required_order_length_m for row in rows),
            )
        )
        items.append(
            item_from_catalog(
                catalog_item,
                quantity=result.l_mark_order,
                catalog_id=catalog_id,
                catalog_version=catalog_version,
                electrical_variant_id=electrical_variant_id,
                object_type_section=section,
                extra_params={
                    "cable_mark": mark,
                    "l_mark_actual": str(result.l_mark_actual),
                    "l_mark_order": str(result.l_mark_order),
                    "raw_sum": str(result.l_mark_order),
                    "rounding_rule": "sum_order_length",
                    "formula_id": FORMULA_FINGERPRINTS["cable"],
                },
            )
        )
    return items
