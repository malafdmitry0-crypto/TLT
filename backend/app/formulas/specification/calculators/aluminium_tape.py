"""Pure Decimal aluminium tape calculator (SPEC §7.14).

Per object:
  L_aluminium_object = actual_installed_length_m * consumption_m_per_cable_m

Then:
  N_aluminium_reels = ceil(sum(L_aluminium_object) / reel_length_m)

Example: ceil(729 * 1 / 50) = 15.
No R_gr multiplication. Consumption and reel length from selected catalog row.
"""

from __future__ import annotations

from collections.abc import Sequence
from decimal import Decimal
from typing import Any

from app.formulas.specification.calculators.common import (
    ceil_div,
    require_positive_divider,
    sum_decimals,
    to_non_negative_decimal,
)
from app.formulas.specification.calculators.types import (
    AluminiumObjectInput,
    AluminiumObjectResult,
    AluminiumTapeInput,
    AluminiumTapeResult,
)


def calculate_aluminium_object_length(
    actual_installed_length_m: Any,
    consumption_m_per_cable_m: Any,
) -> AluminiumObjectResult:
    """L_aluminium_object = actual_installed_length_m * consumption_m_per_cable_m."""
    length = to_non_negative_decimal(
        actual_installed_length_m, name="actual_installed_length_m"
    )
    # Consumption may be zero only if catalog says so; still must be non-negative.
    # Zero consumption → zero length (valid but unusual). Positive reel still required later.
    consumption = to_non_negative_decimal(
        consumption_m_per_cable_m, name="consumption_m_per_cable_m"
    )
    return AluminiumObjectResult(required_length_m=length * consumption)


def calculate_aluminium_reels_from_total(
    total_required_length_m: Any,
    reel_length_m: Any,
) -> int:
    """N_aluminium_reels = ceil(total / reel_length_m)."""
    total = to_non_negative_decimal(
        total_required_length_m, name="total_required_length_m"
    )
    reel = require_positive_divider(reel_length_m, name="reel_length_m")
    return ceil_div(total, reel, divider_name="reel_length_m")


def calculate_aluminium_tape(
    objects: Sequence[AluminiumObjectInput | dict[str, Any]],
    reel_length_m: Any,
) -> AluminiumTapeResult:
    """Per-object lengths → sum → single ceil to reels."""
    object_lengths: list[Decimal] = []
    for obj in objects:
        if isinstance(obj, AluminiumObjectInput):
            length_m = obj.actual_installed_length_m
            consumption = obj.consumption_m_per_cable_m
        else:
            length_m = obj["actual_installed_length_m"]
            consumption = obj["consumption_m_per_cable_m"]
        result = calculate_aluminium_object_length(length_m, consumption)
        object_lengths.append(result.required_length_m)

    total = sum_decimals(object_lengths)
    reel = require_positive_divider(reel_length_m, name="reel_length_m")
    quantity = ceil_div(total, reel, divider_name="reel_length_m")
    return AluminiumTapeResult(
        quantity=quantity,
        total_required_length_m=total,
        object_lengths_m=tuple(object_lengths),
        reel_length_m=reel,
    )


def calculate_aluminium_from_scalar(
    actual_installed_length_m: Any,
    consumption_m_per_cable_m: Any,
    reel_length_m: Any,
) -> AluminiumTapeResult:
    """Convenience for a single aggregated length (golden SPEC-BE-16)."""
    return calculate_aluminium_tape(
        [
            AluminiumObjectInput(
                actual_installed_length_m=actual_installed_length_m,
                consumption_m_per_cable_m=consumption_m_per_cable_m,
            )
        ],
        reel_length_m,
    )


def calculate_aluminium_tape_from_input(inputs: AluminiumTapeInput) -> AluminiumTapeResult:
    return calculate_aluminium_tape(inputs.objects, inputs.reel_length_m)
