"""Small, policy-free thermal math primitives.

Callers choose every coefficient, threshold, and reference value.  This module
only evaluates the already selected numerical relation.
"""

import math

from .errors import FormulaDomainError


def arithmetic_mean(first: float, second: float) -> float:
    """Return the arithmetic mean of two finite values."""
    return _finite_result((first + second) / 2.0)


def quotient(dividend: float, *, divisor: float) -> float:
    """Divide two explicitly supplied finite values."""
    return _finite_result(dividend / divisor)


def affine_value(
    variable: float,
    *,
    intercept: float,
    slope: float,
    variable_offset: float = 0.0,
) -> float:
    """Evaluate ``intercept + slope * variable`` with explicit coefficients."""

    resolved_variable = variable if variable_offset == 0.0 else variable + variable_offset
    return _finite_result(intercept + slope * resolved_variable)


def clamp_minimum(value: float, *, minimum: float) -> float:
    """Apply an explicitly supplied numeric lower bound."""

    return _finite_result(max(value, minimum))


def higher_temperature(first_c: float, second_c: float) -> float:
    """Return the hotter of two explicitly supplied temperatures."""

    return _finite_result(max(first_c, second_c))


def multiply_factors(base_value: float, factors: tuple[float, ...]) -> float:
    """Apply ordered multiplicative factors to a base value."""

    result = base_value
    for factor in factors:
        result *= factor
    return _finite_result(result)


def piecewise_constant(
    variable: float,
    *,
    threshold: float,
    at_or_above: float,
    below: float,
) -> float:
    """Select one of two explicit constants around an explicit threshold."""
    return _finite_result(at_or_above if variable >= threshold else below)


def alpha_from_wind(
    wind_speed_m_s: float,
    *,
    intercept: float,
    sqrt_coefficient: float,
) -> float:
    """Evaluate an explicitly parameterized wind-to-air-film relation."""
    return _finite_result(intercept + sqrt_coefficient * math.sqrt(wind_speed_m_s))


def _validate_quotient_input(dividend: float, divisor: float) -> None:
    """Dormant division guard retained outside the production path."""

    _validate_finite_input(dividend, divisor)
    if divisor == 0:
        raise FormulaDomainError("zero_divisor")


def _validate_wind_input(
    wind_speed_m_s: float,
    intercept: float,
    sqrt_coefficient: float,
) -> None:
    """Dormant wind-relation guard retained outside the production path."""

    _validate_finite_input(wind_speed_m_s, intercept, sqrt_coefficient)
    if wind_speed_m_s < 0:
        raise FormulaDomainError("negative_wind_speed", wind_speed_m_s=wind_speed_m_s)


def _validate_finite_input(*values: float) -> None:
    if not all(math.isfinite(value) for value in values):
        raise FormulaDomainError("non_finite_input")


def _finite_result(value: float) -> float:
    if not math.isfinite(value):
        raise FormulaDomainError("non_finite_result")
    return value
