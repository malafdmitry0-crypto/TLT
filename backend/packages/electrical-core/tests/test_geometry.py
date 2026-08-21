from decimal import Decimal

import pytest
from heatcalc_electrical_core import compute_tank_cable_length as public_tank_cable_length
from heatcalc_electrical_core.errors import TTFormulaDomainError
from heatcalc_electrical_core.geometry import (
    compute_tank_cable_length,
    compute_winding_factor,
    max_winding_factor,
)


def test_winding_factor_and_normative_boundaries() -> None:
    assert compute_winding_factor(outer_diameter_mm=Decimal("108"), winding_pitch_mm=None) == 1
    assert max_winding_factor(Decimal("57")) == Decimal("1.1")
    assert compute_winding_factor(
        outer_diameter_mm=Decimal("108"), winding_pitch_mm=Decimal("350")
    ) < Decimal("1.4")


def test_winding_and_tank_geometry_domain_failures_have_codes() -> None:
    with pytest.raises(TTFormulaDomainError) as winding:
        compute_winding_factor(outer_diameter_mm=Decimal("108"), winding_pitch_mm=Decimal("100"))
    assert winding.value.code == "ELECTRICAL_WINDING_PITCH_INVALID"
    with pytest.raises(TTFormulaDomainError) as tank:
        compute_tank_cable_length(
            shape="bad", heating_height=Decimal("1"), laying_step=Decimal("0.2")
        )
    assert tank.value.code == "ELECTRICAL_TANK_LAYOUT_INVALID"


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("diameter", Decimal("NaN")),
        ("diameter", Decimal("Infinity")),
        ("heating_height", Decimal("NaN")),
        ("heating_height", Decimal("-Infinity")),
        ("laying_step", Decimal("NaN")),
        ("laying_step", Decimal("Infinity")),
    ],
)
def test_public_tank_geometry_maps_non_finite_decimal_to_typed_error(
    field: str, value: Decimal
) -> None:
    values: dict[str, Decimal | str] = {
        "shape": "cylindrical",
        "diameter": Decimal("2"),
        "heating_height": Decimal("3"),
        "laying_step": Decimal("0.2"),
    }
    values[field] = value

    with pytest.raises(TTFormulaDomainError) as failure:
        public_tank_cable_length(**values)  # type: ignore[arg-type]

    assert failure.value.code == "ELECTRICAL_TANK_LAYOUT_INVALID"
