"""Unit tests for shared pure geometry formulas."""

import pytest

from app.formulas.heat_loss.core.errors import FormulaDomainError
from app.formulas.heat_loss.core.geometry import (
    layered_outer_radius,
    outer_radius_after_layer,
    radius_from_diameter,
)


def test_radius_from_diameter() -> None:
    assert radius_from_diameter(0.108) == pytest.approx(0.054)


def test_layered_outer_radius_applies_layers_in_order() -> None:
    assert layered_outer_radius(0.108, (0.01, 0.02, 0.03)) == pytest.approx(0.114)


def test_outer_radius_after_layer_is_the_shared_radial_step() -> None:
    assert outer_radius_after_layer(0.054, 0.05) == pytest.approx(0.104)


@pytest.mark.parametrize(
    "call",
    [
        lambda: radius_from_diameter(float("inf")),
        lambda: outer_radius_after_layer(1.7e308, 1.7e308),
        lambda: layered_outer_radius(1.7e308, (1.7e308,)),
    ],
)
def test_geometry_formulas_reject_nonfinite_results(call) -> None:
    with pytest.raises(FormulaDomainError) as exc_info:
        call()
    assert exc_info.value.code == "non_finite_result"
