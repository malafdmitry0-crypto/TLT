"""Pure Decimal cable length calculators (SPEC §7.9).

Normative formulas:
  L_group_actual = section_length_m * section_count
  L_mark_actual  = sum(L_group_actual)
  L_mark_order   = sum(required_order_length_m)

Purchase row uses L_mark_order; accessories use actual length.
No R_gr multiplication.
"""

from __future__ import annotations

from collections.abc import Sequence
from decimal import Decimal
from typing import Any

from app.formulas.specification.calculators.common import (
    sum_decimals,
    to_non_negative_decimal,
    to_non_negative_int,
)
from app.formulas.specification.calculators.types import (
    CableGroupResult,
    CableMarkInput,
    CableMarkResult,
)


def calculate_group_actual(
    section_length_m: Any,
    section_count: Any,
) -> CableGroupResult:
    """L_group_actual = section_length_m * section_count."""
    length = to_non_negative_decimal(section_length_m, name="section_length_m")
    count = to_non_negative_int(section_count, name="section_count")
    actual = length * Decimal(count)
    return CableGroupResult(actual_installed_length_m=actual)


def calculate_mark_actual(
    group_actuals: Sequence[Any],
) -> Decimal:
    """L_mark_actual = sum(L_group_actual)."""
    values = [
        to_non_negative_decimal(item, name=f"group_actuals[{index}]")
        for index, item in enumerate(group_actuals)
    ]
    return sum_decimals(values)


def calculate_mark_order(
    required_order_lengths_m: Sequence[Any],
) -> Decimal:
    """L_mark_order = sum(required_order_length_m)."""
    values = [
        to_non_negative_decimal(item, name=f"required_order_lengths_m[{index}]")
        for index, item in enumerate(required_order_lengths_m)
    ]
    return sum_decimals(values)


def calculate_cable_mark(inputs: CableMarkInput) -> CableMarkResult:
    """Aggregate group actuals and ER order lengths for one cable mark."""
    group_actuals: list[Decimal] = []
    for group in inputs.groups:
        result = calculate_group_actual(group.section_length_m, group.section_count)
        group_actuals.append(result.actual_installed_length_m)

    l_mark_actual = sum_decimals(group_actuals)
    l_mark_order = calculate_mark_order(inputs.order_lengths_m)
    return CableMarkResult(
        l_mark_actual=l_mark_actual,
        l_mark_order=l_mark_order,
        group_actuals=tuple(group_actuals),
    )
