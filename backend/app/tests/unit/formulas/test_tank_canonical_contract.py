import math

import pytest

from app.formulas.heat_loss.tank import calc_tank_heat_loss
from app.schemas.calculation import TankHeatLossParams


def _tank(**overrides: object) -> TankHeatLossParams:
    data: dict[str, object] = {
        "shape": "cylindrical",
        "diameter": 2.0,
        "height": 3.0,
        "placement": "underground",
        "ambient_temperature": -20.0,
        "ground_temperature": 5.0,
        "process_temperature": 80.0,
        "wind_speed": 2.0,
        "ground_conductivity": 1.5,
        "tank_buried_height": 1.5,
        "safety_factor": 1.2,
        "q_additional": 17.0,
        "insulation_temperature_basis": "channel",
        "insulation_layers": [{"thickness": 0.1, "material": "mineral_wool_boards_120"}],
    }
    data.update(overrides)
    return TankHeatLossParams(**data)


def test_partly_buried_tank_uses_separate_air_and_ground_temperatures():
    result = calc_tank_heat_loss(_tank())

    assert result.air_surface_area + result.ground_surface_area == pytest.approx(
        math.pi * 2.0**2 / 2 + math.pi * 2.0 * 3.0
    )
    assert result.ambient_temperature_applied == -20.0
    assert result.ground_temperature_applied == 5.0
    assert result.external_resistance_areal_bare == pytest.approx(1 / (11.6 + 7 * math.sqrt(2)))


def test_additional_load_is_added_after_safety_factor():
    without_additional = calc_tank_heat_loss(_tank(q_additional=0.0))
    with_additional = calc_tank_heat_loss(_tank(q_additional=17.0))

    assert with_additional.total_heat_loss_base == pytest.approx(without_additional.total_heat_loss_base)
    assert with_additional.total_heat_loss_design == pytest.approx(
        without_additional.total_heat_loss_design + 17.0
    )


@pytest.mark.parametrize(
    ("overrides", "error"),
    [
        (
            {"ambient_temperature": 60.0, "process_temperature": 60.0},
            "process_temperature_not_above_ambient",
        ),
        (
            {"ground_temperature": 60.0, "process_temperature": 60.0},
            "process_temperature_not_above_ground",
        ),
        ({"tank_buried_height": 3.1}, "tank_buried_height"),
    ],
)
def test_partly_buried_tank_validates_each_boundary(
    overrides: dict[str, float], error: str
):
    with pytest.raises(ValueError, match=error):
        _tank(**overrides)
