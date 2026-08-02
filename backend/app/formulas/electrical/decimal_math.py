"""Deterministic Decimal conversions and normative electrical rounding."""

from __future__ import annotations

from decimal import ROUND_DOWN, ROUND_HALF_UP, ROUND_UP, Decimal

THREE_PLACES = Decimal("0.001")
SIX_PLACES = Decimal("0.000001")


def decimal_value(value: int | float | str | Decimal) -> Decimal:
    if isinstance(value, Decimal):
        return value
    return Decimal(str(value))


def round_result(value: Decimal, quantum: Decimal = THREE_PLACES) -> Decimal:
    return value.quantize(quantum, rounding=ROUND_HALF_UP)


def round_down(value: Decimal, quantum: Decimal = THREE_PLACES) -> Decimal:
    return value.quantize(quantum, rounding=ROUND_DOWN)


def round_up(value: Decimal, quantum: Decimal = THREE_PLACES) -> Decimal:
    return value.quantize(quantum, rounding=ROUND_UP)
