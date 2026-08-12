"""Unit tests for policy-free thermal math primitives."""

import math

import pytest

from app.formulas.heat_loss.core.errors import FormulaDomainError
from app.formulas.heat_loss.core.thermal import (
    affine_value,
    alpha_from_wind,
    arithmetic_mean,
    piecewise_constant,
    quotient,
)


def test_arithmetic_mean_uses_only_supplied_values() -> None:
    assert arithmetic_mean(80.0, 40.0) == 60.0


def test_quotient_preserves_signed_zero() -> None:
    result = quotient(-0.0, divisor=2.0)
    assert result == 0.0
    assert math.copysign(1.0, result) == -1.0


def test_affine_value_uses_only_supplied_coefficients() -> None:
    assert affine_value(35.0, intercept=0.04, slope=0.0003) == pytest.approx(0.0505)


@pytest.mark.parametrize(
    ("variable", "expected"),
    [(-59.0, 0.03), (-60.0, 0.03), (-61.0, 0.04)],
)
def test_piecewise_constant_uses_supplied_threshold(variable: float, expected: float) -> None:
    assert (
        piecewise_constant(
            variable,
            threshold=-60.0,
            at_or_above=0.03,
            below=0.04,
        )
        == expected
    )


def test_alpha_from_wind_uses_supplied_coefficients() -> None:
    assert alpha_from_wind(4.0, intercept=11.6, sqrt_coefficient=7.0) == pytest.approx(25.6)


@pytest.mark.parametrize(
    ("call", "code"),
    [
        (lambda: arithmetic_mean(float("inf"), 0.0), "non_finite_input"),
        (lambda: quotient(1.0, divisor=0.0), "zero_divisor"),
        (lambda: affine_value(1e308, intercept=1e308, slope=1e308), "non_finite_result"),
        (
            lambda: alpha_from_wind(-1.0, intercept=11.6, sqrt_coefficient=7.0),
            "negative_wind_speed",
        ),
    ],
)
def test_primitives_report_numeric_domain_errors(call, code: str) -> None:
    with pytest.raises(FormulaDomainError) as exc_info:
        call()
    assert exc_info.value.code == code
