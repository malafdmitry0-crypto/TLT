"""Pure Decimal fiberglass tape calculator (SPEC §7.13).

Per pipe (object):
  L_fiberglass_object =
      ((pi * outer_diameter_mm * 2.5 / 1000)
       * (actual_installed_length_m / 0.3))
      * 1.1

Then sum object lengths and ceil once:
  N_fiberglass_reels = ceil(sum(L_fiberglass_object) / reel_length_m)

Reserve 1.1 is applied exactly once per object (NOT R_gr).
Example: ceil(8939/30) = 298 when total already includes factors.
"""

from __future__ import annotations

from collections.abc import Sequence
from decimal import Decimal
from typing import Any

from app.formulas.specification.calculators.common import (
    FIBERGLASS_PITCH_M,
    FIBERGLASS_RESERVE,
    FIBERGLASS_WRAP_FACTOR,
    MM_TO_M,
    PI,
    ceil_div,
    require_positive_divider,
    sum_decimals,
    to_non_negative_decimal,
    to_positive_decimal,
)
from app.formulas.specification.calculators.types import (
    FiberglassObjectInput,
    FiberglassObjectResult,
    FiberglassTapeInput,
    FiberglassTapeResult,
)


def calculate_fiberglass_object_length(
    outer_diameter_mm: Any,
    actual_installed_length_m: Any,
) -> FiberglassObjectResult:
    """Compute L_fiberglass_object with reserve 1.1 applied once."""
    d_mm = to_positive_decimal(outer_diameter_mm, name="outer_diameter_mm")
    length_m = to_non_negative_decimal(
        actual_installed_length_m, name="actual_installed_length_m"
    )

    # ((pi * d_mm * 2.5 / 1000) * (L / 0.3)) * 1.1
    circumference_term = (PI * d_mm * FIBERGLASS_WRAP_FACTOR) / MM_TO_M
    pitch_term = length_m / FIBERGLASS_PITCH_M
    required = (circumference_term * pitch_term) * FIBERGLASS_RESERVE
    return FiberglassObjectResult(required_length_m=required)


def calculate_fiberglass_reels_from_total(
    total_required_length_m: Any,
    reel_length_m: Any,
) -> int:
    """N_fiberglass_reels = ceil(total_required_length_m / reel_length_m).

    Use when object lengths are already summed (e.g. golden fixtures).
    """
    total = to_non_negative_decimal(
        total_required_length_m, name="total_required_length_m"
    )
    reel = require_positive_divider(reel_length_m, name="reel_length_m")
    return ceil_div(total, reel, divider_name="reel_length_m")


def calculate_fiberglass_tape(
    objects: Sequence[FiberglassObjectInput | dict[str, Any]],
    reel_length_m: Any,
) -> FiberglassTapeResult:
    """Per-object lengths → sum → single ceil to reels."""
    object_lengths: list[Decimal] = []
    for obj in objects:
        if isinstance(obj, FiberglassObjectInput):
            d_mm = obj.outer_diameter_mm
            length_m = obj.actual_installed_length_m
        else:
            d_mm = obj["outer_diameter_mm"]
            length_m = obj["actual_installed_length_m"]
        result = calculate_fiberglass_object_length(d_mm, length_m)
        object_lengths.append(result.required_length_m)

    total = sum_decimals(object_lengths)
    reel = require_positive_divider(reel_length_m, name="reel_length_m")
    quantity = ceil_div(total, reel, divider_name="reel_length_m")
    return FiberglassTapeResult(
        quantity=quantity,
        total_required_length_m=total,
        object_lengths_m=tuple(object_lengths),
        reel_length_m=reel,
    )


def calculate_fiberglass_tape_from_input(inputs: FiberglassTapeInput) -> FiberglassTapeResult:
    return calculate_fiberglass_tape(inputs.objects, inputs.reel_length_m)
