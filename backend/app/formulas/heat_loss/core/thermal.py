"""Small, policy-free thermal math primitives.

Callers choose every coefficient, threshold, and reference value.  This module
only evaluates the already selected numerical relation.
"""

import math

from .errors import FormulaDomainError


def arithmetic_mean(first: float, second: float) -> float:
    """Return the arithmetic mean of two finite values."""
    _validate_finite_input(first, second)
    return _finite_result((first + second) / 2.0)


def quotient(dividend: float, *, divisor: float) -> float:
    """Divide two explicitly supplied finite values."""
    _validate_finite_input(dividend, divisor)
    if divisor == 0:
        raise FormulaDomainError("zero_divisor")
    return _finite_result(dividend / divisor)


def affine_value(variable: float, *, intercept: float, slope: float) -> float:
    """Evaluate ``intercept + slope * variable`` with explicit coefficients."""
    _validate_finite_input(variable, intercept, slope)
    return _finite_result(intercept + slope * variable)


def piecewise_constant(
    variable: float,
    *,
    threshold: float,
    at_or_above: float,
    below: float,
) -> float:
    """Select one of two explicit constants around an explicit threshold."""
    _validate_finite_input(variable, threshold, at_or_above, below)
    return at_or_above if variable >= threshold else below


def alpha_from_wind(
    wind_speed_m_s: float,
    *,
    intercept: float,
    sqrt_coefficient: float,
) -> float:
    """Evaluate an explicitly parameterized wind-to-air-film relation."""
    _validate_finite_input(wind_speed_m_s, intercept, sqrt_coefficient)
    if wind_speed_m_s < 0:
        raise FormulaDomainError("negative_wind_speed", wind_speed_m_s=wind_speed_m_s)
    return _finite_result(intercept + sqrt_coefficient * math.sqrt(wind_speed_m_s))


def _validate_finite_input(*values: float) -> None:
    if not all(math.isfinite(value) for value in values):
        raise FormulaDomainError("non_finite_input")


def _finite_result(value: float) -> float:
    if not math.isfinite(value):
        raise FormulaDomainError("non_finite_result")
    return value
