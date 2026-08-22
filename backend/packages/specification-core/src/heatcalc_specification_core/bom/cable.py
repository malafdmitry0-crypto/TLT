"""Cable BOM rows: pure sum by presentation section and mark."""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Mapping, Sequence
from decimal import Decimal
from typing import Any
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
from heatcalc_specification_core.common import (
    sum_decimals,
    to_non_negative_decimal,
    to_non_negative_int,
)
from heatcalc_specification_core.types import (
    CableGroupInput,
    CableGroupResult,
    CableMarkInput,
    CableMarkResult,
)


def calculate_group_actual(
    section_length_m: Any,
    section_count: Any,
) -> CableGroupResult:
    """Calculate installed cable length for one equal-section group."""
    length = to_non_negative_decimal(section_length_m, name="section_length_m")
    count = to_non_negative_int(section_count, name="section_count")
    return CableGroupResult(actual_installed_length_m=length * Decimal(count))


def calculate_mark_actual(group_actuals: Sequence[Any]) -> Decimal:
    """Sum installed lengths for one cable mark."""
    return sum_decimals(
        [
            to_non_negative_decimal(item, name=f"group_actuals[{index}]")
            for index, item in enumerate(group_actuals)
        ]
    )


def calculate_mark_order(required_order_lengths_m: Sequence[Any]) -> Decimal:
    """Sum order lengths for one cable mark without applying reserve again."""
    return sum_decimals(
        [
            to_non_negative_decimal(item, name=f"required_order_lengths_m[{index}]")
            for index, item in enumerate(required_order_lengths_m)
        ]
    )


def calculate_cable_mark(inputs: CableMarkInput) -> CableMarkResult:
    """Aggregate actual and order lengths for one cable mark."""
    group_actuals = tuple(
        calculate_group_actual(
            group.section_length_m, group.section_count
        ).actual_installed_length_m
        for group in inputs.groups
    )
    return CableMarkResult(
        l_mark_actual=sum_decimals(group_actuals),
        l_mark_order=calculate_mark_order(inputs.order_lengths_m),
        group_actuals=group_actuals,
    )


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
