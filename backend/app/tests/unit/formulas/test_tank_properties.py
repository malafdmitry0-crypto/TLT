"""Physical properties of canonical cylindrical and rectangular tank inputs."""

import pytest

from app.formulas.heat_loss.tank import calc_tank_heat_loss
from app.schemas.heat_loss import InsulationLayer, TankHeatLossParams


def _tank(**overrides: object) -> TankHeatLossParams:
    data: dict[str, object] = {
        "shape": "cylindrical",
        "diameter": 2.0,
        "height": 3.0,
        "placement": "outdoor",
        "ambient_temperature": -20.0,
        "process_temperature": 80.0,
        "wind_speed": 1.0,
        "safety_factor": 1.1,
        "insulation_temperature_basis": "outdoor_winter",
        "insulation_layers": [InsulationLayer(thickness=0.08, material="mineral_wool_boards_120")],
    }
    data.update(overrides)
    return TankHeatLossParams(**data)


def test_thicker_insulation_reduces_heat_loss():
    thin = calc_tank_heat_loss(
        _tank(
            insulation_layers=[InsulationLayer(thickness=0.02, material="mineral_wool_boards_120")]
        )
    )
    thick = calc_tank_heat_loss(
        _tank(
            insulation_layers=[InsulationLayer(thickness=0.15, material="mineral_wool_boards_120")]
        )
    )
    assert thick.heat_loss_per_m2_bare_base < thin.heat_loss_per_m2_bare_base


def test_larger_surface_increases_total_loss():
    small = calc_tank_heat_loss(_tank(diameter=1.0, height=2.0))
    large = calc_tank_heat_loss(_tank(diameter=3.0, height=4.0))
    assert large.surface_area_bare > small.surface_area_bare
    assert large.total_heat_loss_base > small.total_heat_loss_base


def test_wall_resistance_reduces_loss():
    bare = calc_tank_heat_loss(_tank())
    wall = calc_tank_heat_loss(_tank(wall_thickness=0.02, wall_lambda=50.0))
    assert wall.heat_loss_per_m2_bare_base < bare.heat_loss_per_m2_bare_base


def test_rectangular_geometry_and_full_burial_area_partition():
    result = calc_tank_heat_loss(
        _tank(
            shape="rectangular",
            diameter=None,
            length=4.0,
            width=2.0,
            height=3.0,
            placement="underground",
            ambient_temperature=-20,
            ground_temperature=0,
            ground_conductivity=1.5,
            tank_buried_height=3.0,
            insulation_temperature_basis="channel",
        )
    )
    assert result.air_surface_area == pytest.approx(8.0)
    assert result.ground_surface_area == pytest.approx(44.0)


def test_invalid_wall_pair_and_shape_dimensions_are_rejected():
    with pytest.raises(ValueError, match="wall_thickness"):
        _tank(wall_thickness=0.01)
    with pytest.raises(ValueError, match="length"):
        _tank(length=1.0)
    with pytest.raises(ValueError, match="diameter"):
        _tank(shape="rectangular", diameter=2.0, length=2.0, width=2.0)
