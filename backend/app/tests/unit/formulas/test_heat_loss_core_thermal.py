"""Unit tests for policy-free thermal math primitives."""

import math

import pytest

from app.formulas.heat_loss.core.errors import FormulaDomainError
from app.formulas.heat_loss.core.thermal import (
    affine_value,
    alpha_from_wind,
    arithmetic_mean,
    clamp_minimum,
    higher_temperature,
    multiply_factors,
    piecewise_constant,
    quotient,
)
from app.formulas.heat_loss.insulation import resolve_insulation_tm
from app.reference_data.loader import get_insulation_conductivity, get_pipe_material_lambda


def test_arithmetic_mean_uses_only_supplied_values() -> None:
    assert arithmetic_mean(80.0, 40.0) == 60.0


def test_quotient_preserves_signed_zero() -> None:
    result = quotient(-0.0, divisor=2.0)
    assert result == 0.0
    assert math.copysign(1.0, result) == -1.0


def test_affine_value_uses_only_supplied_coefficients() -> None:
    assert affine_value(35.0, intercept=0.04, slope=0.0003) == pytest.approx(0.0505)


def test_affine_value_applies_explicit_variable_offset() -> None:
    assert affine_value(60.0, intercept=40.1, slope=-0.025, variable_offset=40.0) == pytest.approx(
        37.6
    )


def test_policy_free_numeric_helpers_use_only_supplied_values() -> None:
    assert clamp_minimum(-2.0, minimum=0.0) == 0.0
    assert higher_temperature(-20.0, 80.0) == 80.0
    assert multiply_factors(10.0, (1.1, 1.2)) == pytest.approx(13.2)


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


def test_backend_policy_paths_keep_using_core_thermal_primitives() -> None:
    assert resolve_insulation_tm(
        process_temperature=80.0,
        basis="outdoor_winter",
        location=None,
        placement="outdoor",
    ) == pytest.approx(40.0)
    assert resolve_insulation_tm(
        process_temperature=80.0,
        basis="indoor",
        location="indoor",
        placement="indoor",
    ) == pytest.approx(60.0)
    assert get_insulation_conductivity("mineral_wool_boards_120", 60.0) > 0
    assert get_insulation_conductivity("mineral_wool_boards_120", -20.0) > 0
    assert get_pipe_material_lambda("carbon_steel", 80.0) > 0


@pytest.mark.parametrize(
    "call",
    [
        lambda: arithmetic_mean(1e308, 1e308),
        lambda: quotient(1e308, divisor=1e-308),
        lambda: affine_value(1e308, intercept=1e308, slope=1e308),
        lambda: affine_value(1e308, intercept=0.0, slope=1.0, variable_offset=1e308),
        lambda: clamp_minimum(float("inf"), minimum=0.0),
        lambda: higher_temperature(float("inf"), 0.0),
        lambda: multiply_factors(1e308, (1e308,)),
        lambda: piecewise_constant(
            1.0,
            threshold=0.0,
            at_or_above=float("inf"),
            below=0.0,
        ),
        lambda: piecewise_constant(
            1.0,
            threshold=0.0,
            at_or_above=float("nan"),
            below=0.0,
        ),
        lambda: alpha_from_wind(4.0, intercept=1e308, sqrt_coefficient=1e308),
    ],
)
def test_thermal_primitives_reject_nonfinite_results(call) -> None:
    with pytest.raises(FormulaDomainError) as exc_info:
        call()
    assert exc_info.value.code == "non_finite_result"
