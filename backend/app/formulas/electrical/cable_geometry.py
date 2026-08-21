"""Application compatibility adapter for TT tank cable geometry.

The canonical Decimal calculation lives in :mod:`heatcalc_electrical_core`.
This module retains the historical float API and its Russian validation errors
for CalculationService and the admin formula-preview endpoint.
"""

from __future__ import annotations

from decimal import Decimal, InvalidOperation
from typing import Never

from heatcalc_electrical_core import (
    TTFormulaDomainError,
)
from heatcalc_electrical_core import (
    compute_tank_cable_length as _core_compute_tank_cable_length,
)

LAYING_STEP_MIN = 0.1
LAYING_STEP_MAX = 0.4


def _invalid_numeric(field: str, value: object) -> Never:
    if field == "heating_height":
        raise ValueError(f"heating_height должна быть > 0, получено {value}")
    raise ValueError(
        f"laying_step должен быть в диапазоне {LAYING_STEP_MIN}–{LAYING_STEP_MAX} м, "
        f"получено {value}"
    )


def _finite_decimal(value: object) -> Decimal | None:
    try:
        decimal = Decimal(str(value))
    except (InvalidOperation, ValueError):
        return None
    if not decimal.is_finite():
        return None
    return decimal


def compute_tank_cable_length(
    *,
    shape: str,
    diameter: float | None = None,
    length: float | None = None,
    width: float | None = None,
    heating_height: float,
    laying_step: float,
) -> float:
    """Return the cable length for a tank, preserving the legacy float facade.

    Validation and error text are an application compatibility responsibility;
    the normative perimeter and length arithmetic is delegated exactly once to
    the standalone electrical core.
    """
    heating_height_decimal = _finite_decimal(heating_height)
    laying_step_decimal = _finite_decimal(laying_step)
    if heating_height_decimal is None or heating_height_decimal <= 0:
        _invalid_numeric("heating_height", heating_height)
    if laying_step_decimal is None or not (
        Decimal(str(LAYING_STEP_MIN)) <= laying_step_decimal <= Decimal(str(LAYING_STEP_MAX))
    ):
        _invalid_numeric("laying_step", laying_step)

    diameter_decimal: Decimal | None = None
    length_decimal: Decimal | None = None
    width_decimal: Decimal | None = None
    if shape == "cylindrical":
        if diameter is None:
            raise ValueError("Для цилиндра требуется diameter > 0")
        diameter_decimal = _finite_decimal(diameter)
        if diameter_decimal is None or diameter_decimal <= 0:
            raise ValueError("Для цилиндра требуется diameter > 0")
    elif shape == "rectangular":
        if length is None or width is None:
            raise ValueError("Для прямоугольника требуются length и width > 0")
        length_decimal = _finite_decimal(length)
        width_decimal = _finite_decimal(width)
        if (
            length_decimal is None
            or width_decimal is None
            or length_decimal <= 0
            or width_decimal <= 0
        ):
            raise ValueError("Для прямоугольника требуются length и width > 0")
    else:
        raise ValueError(
            f"Укладка кабеля не поддерживается для формы '{shape}'. "
            "Допустимы только cylindrical и rectangular."
        )

    try:
        result = _core_compute_tank_cable_length(
            shape=shape,
            diameter=diameter_decimal,
            length=length_decimal,
            width=width_decimal,
            heating_height=heating_height_decimal,
            laying_step=laying_step_decimal,
        )
    except TTFormulaDomainError as exc:
        raise ValueError("Tank cable layout inputs are invalid") from exc
    return float(result)
