"""Shared Decimal validation and ceil-division helpers for pure specification calculators.

No database, FastAPI, filesystem, or static JSON imports.
"""

from __future__ import annotations

import math
from decimal import ROUND_CEILING, ROUND_FLOOR, Decimal, InvalidOperation
from typing import Any

from app.formulas.specification.calculators.types import FormulaInputError, TemperatureGroup

# High-precision π for fiberglass tape circumference calculations.
PI = Decimal("3.141592653589793238462643383279502884197")

# Normative fiberglass reserve (applied once per object length; not R_gr).
FIBERGLASS_RESERVE = Decimal("1.1")
FIBERGLASS_WRAP_FACTOR = Decimal("2.5")
FIBERGLASS_PITCH_M = Decimal("0.3")
MM_TO_M = Decimal("1000")


def to_decimal(
    value: Any,
    *,
    name: str,
    allow_zero: bool = True,
    allow_negative: bool = False,
) -> Decimal:
    """Convert a numeric-like value to Decimal with strict validation.

    Rejects bool-as-number, NaN, Infinity, and (by default) negatives.
    """
    if isinstance(value, bool):
        raise FormulaInputError(
            "BOOL_AS_NUMBER",
            f"{name}: boolean is not a valid numeric input",
            field=name,
            value=value,
        )
    if value is None:
        raise FormulaInputError(
            "MISSING_VALUE",
            f"{name}: value is required",
            field=name,
            value=value,
        )

    try:
        if isinstance(value, Decimal):
            result = value
        elif isinstance(value, int):
            result = Decimal(value)
        elif isinstance(value, str):
            text = value.strip()
            if not text:
                raise FormulaInputError(
                    "INVALID_NUMBER",
                    f"{name}: empty string is not a valid number",
                    field=name,
                    value=value,
                )
            result = Decimal(text)
        elif isinstance(value, float):
            if math.isnan(value):
                raise FormulaInputError(
                    "NAN_VALUE",
                    f"{name}: NaN is not allowed",
                    field=name,
                    value=value,
                )
            if math.isinf(value):
                raise FormulaInputError(
                    "INFINITY_VALUE",
                    f"{name}: Infinity is not allowed",
                    field=name,
                    value=value,
                )
            # str() avoids binary float artefacts before Decimal conversion.
            result = Decimal(str(value))
        else:
            raise FormulaInputError(
                "INVALID_TYPE",
                f"{name}: unsupported type {type(value).__name__}",
                field=name,
                value=value,
            )
    except (InvalidOperation, ValueError) as exc:
        if isinstance(exc, FormulaInputError):
            raise
        raise FormulaInputError(
            "INVALID_NUMBER",
            f"{name}: cannot convert to Decimal ({value!r})",
            field=name,
            value=value,
        ) from exc

    if not result.is_finite():
        code = "NAN_VALUE" if result.is_nan() else "INFINITY_VALUE"
        raise FormulaInputError(
            code,
            f"{name}: non-finite Decimal is not allowed",
            field=name,
            value=value,
        )

    if not allow_negative and result < 0:
        raise FormulaInputError(
            "NEGATIVE_VALUE",
            f"{name}: negative values are not allowed (got {result})",
            field=name,
            value=value,
        )

    if not allow_zero and result == 0:
        raise FormulaInputError(
            "ZERO_VALUE",
            f"{name}: zero is not allowed",
            field=name,
            value=value,
        )

    return result


def to_non_negative_decimal(value: Any, *, name: str) -> Decimal:
    """Non-negative Decimal (zero allowed)."""
    return to_decimal(value, name=name, allow_zero=True, allow_negative=False)


def to_positive_decimal(value: Any, *, name: str) -> Decimal:
    """Strictly positive Decimal (zero rejected)."""
    return to_decimal(value, name=name, allow_zero=False, allow_negative=False)


def to_non_negative_int(value: Any, *, name: str) -> int:
    """Non-negative integer count (bool rejected; fractional rejected)."""
    d = to_non_negative_decimal(value, name=name)
    if d != d.to_integral_value():
        raise FormulaInputError(
            "NON_INTEGER",
            f"{name}: expected an integer count (got {d})",
            field=name,
            value=value,
        )
    return int(d)


def require_positive_divider(value: Any, *, name: str) -> Decimal:
    """Positive divider for ceil-division (zero and negative rejected)."""
    return to_positive_decimal(value, name=name)


def ceil_div(numerator: Decimal, denominator: Decimal, *, divider_name: str = "divider") -> int:
    """Integer ceiling of numerator / denominator using Decimal throughout.

    Both arguments must already be validated Decimals. Denominator must be > 0.
    """
    if not isinstance(numerator, Decimal) or not isinstance(denominator, Decimal):
        raise FormulaInputError(
            "INVALID_TYPE",
            "ceil_div requires Decimal numerator and denominator",
        )
    if denominator <= 0:
        raise FormulaInputError(
            "ZERO_DIVIDER",
            f"{divider_name}: divider must be > 0 (got {denominator})",
            field=divider_name,
            value=denominator,
        )
    if numerator < 0:
        raise FormulaInputError(
            "NEGATIVE_VALUE",
            f"numerator must be non-negative (got {numerator})",
            value=numerator,
        )
    if numerator == 0:
        return 0

    quotient = numerator / denominator
    return int(quotient.to_integral_value(rounding=ROUND_CEILING))


def floor_div(numerator: Decimal, denominator: Decimal, *, divider_name: str = "divider") -> int:
    """Integer floor of numerator / denominator using Decimal throughout.

    Both arguments must already be validated Decimals. Denominator must be > 0.
    """
    if not isinstance(numerator, Decimal) or not isinstance(denominator, Decimal):
        raise FormulaInputError(
            "INVALID_TYPE",
            "floor_div requires Decimal numerator and denominator",
        )
    if denominator <= 0:
        raise FormulaInputError(
            "ZERO_DIVIDER",
            f"{divider_name}: divider must be > 0 (got {denominator})",
            field=divider_name,
            value=denominator,
        )
    if numerator < 0:
        raise FormulaInputError(
            "NEGATIVE_VALUE",
            f"numerator must be non-negative (got {numerator})",
            value=numerator,
        )
    if numerator == 0:
        return 0

    quotient = numerator / denominator
    return int(quotient.to_integral_value(rounding=ROUND_FLOOR))


def sum_decimals(values: list[Decimal] | tuple[Decimal, ...]) -> Decimal:
    """Sum a sequence of Decimals (empty sum is 0)."""
    total = Decimal("0")
    for item in values:
        if not isinstance(item, Decimal):
            raise FormulaInputError(
                "INVALID_TYPE",
                f"sum_decimals expects Decimal items (got {type(item).__name__})",
                value=item,
            )
        total += item
    return total


def normalize_temperature_group(
    value: TemperatureGroup | str | None,
) -> TemperatureGroup | None:
    """Normalize temperature group labels used by kit/tape calculators."""
    if value is None:
        return None
    if isinstance(value, TemperatureGroup):
        return value
    text = str(value).strip().upper().replace("-", "_")
    aliases = {
        "LOW": TemperatureGroup.LOW,
        "MEDIUM_HIGH": TemperatureGroup.MEDIUM_HIGH,
        "MEDIUM": TemperatureGroup.MEDIUM_HIGH,
        "HIGH": TemperatureGroup.MEDIUM_HIGH,
        "MED_HIGH": TemperatureGroup.MEDIUM_HIGH,
    }
    if text not in aliases:
        raise FormulaInputError(
            "INVALID_TEMPERATURE_GROUP",
            f"temperature_group: unknown group {value!r}",
            field="temperature_group",
            value=value,
        )
    return aliases[text]
