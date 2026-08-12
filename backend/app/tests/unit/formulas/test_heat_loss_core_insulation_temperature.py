"""Tests for pure insulation reference-temperature formulas."""

import math
from collections.abc import Callable

import pytest

from app.formulas.heat_loss.core.errors import FormulaDomainError
from app.formulas.heat_loss.core.insulation_temperature import (
    calculate_insulation_temperature,
)


@pytest.mark.parametrize(
    ("process_temperature", "expected"),
    [(80.0, 40.0), (-20.0, -10.0), (0.0, 0.0)],
)
def test_half_process_formula(process_temperature: float, expected: float) -> None:
    assert calculate_insulation_temperature(
        process_temperature,
        formula="half_process",
    ) == pytest.approx(expected)


def test_half_process_formula_preserves_negative_zero() -> None:
    result = calculate_insulation_temperature(-0.0, formula="half_process")

    assert result == 0.0
    assert math.copysign(1.0, result) == -1.0


@pytest.mark.parametrize(
    ("process_temperature", "reference_temperature", "expected"),
    [(80.0, 40.0, 60.0), (-20.0, 40.0, 10.0), (20.0, -20.0, 0.0)],
)
def test_mean_with_explicit_reference_formula(
    process_temperature: float,
    reference_temperature: float,
    expected: float,
) -> None:
    assert calculate_insulation_temperature(
        process_temperature,
        formula="mean_with_reference",
        reference_temperature_c=reference_temperature,
    ) == pytest.approx(expected)


def test_mean_formula_requires_explicit_reference_coefficient() -> None:
    with pytest.raises(FormulaDomainError, match="reference_temperature_required"):
        calculate_insulation_temperature(80.0, formula="mean_with_reference")


def test_unknown_formula_is_rejected_at_runtime() -> None:
    with pytest.raises(FormulaDomainError, match="unknown_insulation_temperature_formula"):
        calculate_insulation_temperature(80.0, formula="unknown")  # type: ignore[arg-type]


@pytest.mark.parametrize(
    "call",
    [
        lambda: calculate_insulation_temperature(math.inf, formula="half_process"),
        lambda: calculate_insulation_temperature(
            1e308,
            formula="mean_with_reference",
            reference_temperature_c=1e308,
        ),
    ],
)
def test_formula_preserves_core_non_finite_result_guard(call: Callable[[], float]) -> None:
    with pytest.raises(FormulaDomainError, match="non_finite_result"):
        call()
