"""Pure Decimal geometry and winding calculations."""

from __future__ import annotations

from decimal import Decimal

from .decimal_math import SIX_PLACES, round_result
from .errors import TTFormulaDomainError

_PI = Decimal("3.14159265358979323846264338327950288419716939937510")


def max_winding_factor(outer_diameter_mm: Decimal) -> Decimal:
    if outer_diameter_mm < Decimal("57"):
        return Decimal("1")
    if outer_diameter_mm == Decimal("57"):
        return Decimal("1.1")
    if outer_diameter_mm <= Decimal("75"):
        return Decimal("1.2")
    if outer_diameter_mm <= Decimal("89"):
        return Decimal("1.3")
    if outer_diameter_mm <= Decimal("108"):
        return Decimal("1.4")
    return Decimal("1.5")


def compute_winding_factor(
    *, outer_diameter_mm: Decimal, winding_pitch_mm: Decimal | None
) -> Decimal:
    if outer_diameter_mm <= 0:
        raise TTFormulaDomainError(
            "ELECTRICAL_WINDING_PITCH_INVALID",
            outer_diameter_mm=outer_diameter_mm,
            winding_pitch_mm=winding_pitch_mm,
        )
    if winding_pitch_mm is None:
        return Decimal("1")
    if winding_pitch_mm <= outer_diameter_mm:
        raise TTFormulaDomainError(
            "ELECTRICAL_WINDING_PITCH_INVALID",
            outer_diameter_mm=outer_diameter_mm,
            winding_pitch_mm=winding_pitch_mm,
        )
    ratio = _PI * outer_diameter_mm / winding_pitch_mm
    factor = (Decimal("1") + ratio * ratio).sqrt()
    if factor > max_winding_factor(outer_diameter_mm):
        raise TTFormulaDomainError(
            "ELECTRICAL_WINDING_FACTOR_LIMIT_EXCEEDED",
            winding_factor=factor,
            maximum=max_winding_factor(outer_diameter_mm),
            outer_diameter_mm=outer_diameter_mm,
            winding_pitch_mm=winding_pitch_mm,
        )
    return round_result(factor, SIX_PLACES)


def compute_tank_cable_length(
    *,
    shape: str,
    diameter: Decimal | None = None,
    length: Decimal | None = None,
    width: Decimal | None = None,
    heating_height: Decimal,
    laying_step: Decimal,
) -> Decimal:
    """Return physical tank cable length or a typed geometry domain failure."""
    if (
        not heating_height.is_finite()
        or not laying_step.is_finite()
        or heating_height <= 0
        or not (Decimal("0.1") <= laying_step <= Decimal("0.4"))
    ):
        raise TTFormulaDomainError("ELECTRICAL_TANK_LAYOUT_INVALID")
    if shape == "cylindrical" and diameter is not None and diameter.is_finite() and diameter > 0:
        perimeter = _PI * diameter
    elif (
        shape == "rectangular"
        and length is not None
        and width is not None
        and length.is_finite()
        and width.is_finite()
        and length > 0
        and width > 0
    ):
        perimeter = Decimal("2") * (length + width)
    else:
        raise TTFormulaDomainError("ELECTRICAL_TANK_LAYOUT_INVALID")
    return perimeter / Decimal("2") * heating_height / laying_step
