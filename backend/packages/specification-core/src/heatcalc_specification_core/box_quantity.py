"""Quantity arithmetic for specification junction boxes."""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from heatcalc_specification_core.common import (
    ceil_div,
    floor_div,
    require_positive_divider,
    to_non_negative_decimal,
    to_non_negative_int,
)
from heatcalc_specification_core.types import (
    BoxQuantityResult,
    BoxRoundingMode,
    FormulaInputError,
)

# Stable code aligned with schema / catalog validation (fail-closed).
SPEC_BOX_EX_RGR_MATRIX_MISSING = "SPEC_BOX_EX_RGR_MATRIX_MISSING"

_DIAMETER_THRESHOLD_MM = Decimal("57")
_N_SEC_GE_THRESHOLD = 3


def compute_d_ge_57(outer_diameter_mm: Any) -> bool:
    """Inclusive diameter gate: outer_diameter_mm >= 57."""
    diameter = to_non_negative_decimal(outer_diameter_mm, name="outer_diameter_mm")
    return diameter >= _DIAMETER_THRESHOLD_MM


def normalize_box_rounding_mode(value: BoxRoundingMode | str | Any) -> BoxRoundingMode:
    """Normalize ``up`` / ``down`` (also accepts catalog ``rounding`` alias callers)."""
    if isinstance(value, BoxRoundingMode):
        return value
    if isinstance(value, bool) or value is None:
        raise FormulaInputError(
            "INVALID_ROUNDING_MODE",
            f"rounding_mode: expected 'up' or 'down' (got {value!r})",
            field="rounding_mode",
            value=value,
        )
    text = str(value).strip().lower()
    if text == BoxRoundingMode.UP.value:
        return BoxRoundingMode.UP
    if text == BoxRoundingMode.DOWN.value:
        return BoxRoundingMode.DOWN
    raise FormulaInputError(
        "INVALID_ROUNDING_MODE",
        f"rounding_mode: expected 'up' or 'down' (got {value!r})",
        field="rounding_mode",
        value=value,
    )

def calculate_box_quantity(
    section_count: Any,
    section_divider: Any,
    rounding: BoxRoundingMode | str,
    *,
    min_quantity: Any = 1,
) -> BoxQuantityResult:
    """raw=N_sec/divider → ceil|floor → max(calculated, min_quantity)."""
    n_sec = to_non_negative_int(section_count, name="section_count")
    divider = require_positive_divider(section_divider, name="section_divider")
    mode = normalize_box_rounding_mode(rounding)
    min_q = to_non_negative_int(min_quantity, name="min_quantity")

    raw = Decimal(n_sec) / divider
    if mode is BoxRoundingMode.UP:
        calculated = ceil_div(Decimal(n_sec), divider, divider_name="section_divider")
    else:
        calculated = floor_div(Decimal(n_sec), divider, divider_name="section_divider")

    quantity = max(calculated, min_q)
    return BoxQuantityResult(
        quantity=quantity,
        raw=raw,
        calculated=calculated,
        section_count=n_sec,
        section_divider=divider,
        rounding_mode=mode,
        min_quantity=min_q,
    )
