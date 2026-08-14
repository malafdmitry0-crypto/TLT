"""Canonical cylindrical/rectangular tank heat-loss coverage (Slice 3)."""

import math

import pytest

from app.formulas.heat_loss.tank import calc_tank_heat_loss
from app.schemas.calculation import InsulationLayer, TankHeatLossParams


def _cyl(**overrides: object) -> TankHeatLossParams:
    data: dict[str, object] = {
        "shape": "cylindrical", "diameter": 2.0, "height": 3.0,
        "placement": "outdoor", "ambient_temperature": -20.0,
        "process_temperature": 80.0, "wind_speed": 0.0, "safety_factor": 1.1,
        "insulation_temperature_basis": "outdoor_winter",
        "insulation_layers": [InsulationLayer(thickness=0.1, material="mineral_wool_boards_120")],
    }
    data.update(overrides)
    return TankHeatLossParams(**data)


def _rect(**overrides: object) -> TankHeatLossParams:
    data: dict[str, object] = {
        "shape": "rectangular", "length": 4.0, "width": 2.0, "height": 2.0,
        "placement": "outdoor", "ambient_temperature": -20.0,
        "process_temperature": 80.0, "wind_speed": 0.0, "safety_factor": 1.1,
        "insulation_temperature_basis": "outdoor_winter",
        "insulation_layers": [InsulationLayer(thickness=0.1, material="mineral_wool_boards_120")],
    }
    data.update(overrides)
    return TankHeatLossParams(**data)


def test_cylindrical_and_rectangular_surface_areas():
    assert calc_tank_heat_loss(_cyl()).surface_area_bare == pytest.approx(8 * math.pi)
    assert calc_tank_heat_loss(_rect()).surface_area_bare == pytest.approx(40.0)


def test_areal_external_resistance_uses_wind_alpha():
    result = calc_tank_heat_loss(_cyl(wind_speed=8.0))
    expected_alpha = 11.6 + 7 * math.sqrt(8.0)
    assert result.external_resistance_areal_bare == pytest.approx(1 / expected_alpha)
    assert result.alpha_vnesh_applied == pytest.approx(expected_alpha)
    assert result.wind_speed_applied == 8.0


def test_auto_alpha_indoor_and_outdoor():
    indoor = calc_tank_heat_loss(
        _cyl(
            placement="indoor",
            ambient_temperature=20,
            wind_speed=None,
            insulation_temperature_basis="indoor",
        )
    )
    outdoor = calc_tank_heat_loss(_cyl(wind_speed=4.0))
    assert indoor.alpha_vnesh_applied == pytest.approx(9.0)
    assert outdoor.alpha_vnesh_applied == pytest.approx(25.6)


def test_partly_buried_tank_uses_distinct_boundary_temperatures_and_areas():
    result = calc_tank_heat_loss(_cyl(
        placement="underground", ground_temperature=5.0, ground_conductivity=1.5,
        tank_buried_height=1.5, wind_speed=2.0, insulation_temperature_basis="channel",
    ))
    assert result.air_surface_area + result.ground_surface_area == pytest.approx(8 * math.pi)
    assert result.ground_temperature_applied == 5.0
    assert result.heat_loss_air_base != result.heat_loss_ground_base


@pytest.mark.parametrize(
    ("field", "value", "code"),
    [("ambient_temperature", 70.0, "process_temperature_not_above_ambient"),
     ("ground_temperature", 70.0, "process_temperature_not_above_ground")],
)
def test_boundary_temperature_validation(field: str, value: float, code: str):
    data = {field: value}
    if field == "ground_temperature":
        data.update(placement="underground", tank_buried_height=1.0, ground_conductivity=1.5,
                    insulation_temperature_basis="channel", process_temperature=70.0)
    elif field == "ambient_temperature":
        data["process_temperature"] = 70.0
    with pytest.raises(ValueError, match=code):
        _cyl(**data)


def test_q_additional_is_after_safety_factor():
    base = calc_tank_heat_loss(_cyl(q_additional=0.0, safety_factor=1.2))
    result = calc_tank_heat_loss(_cyl(q_additional=17.0, safety_factor=1.2))
    assert result.total_heat_loss_base == pytest.approx(base.total_heat_loss_base)
    assert result.total_heat_loss_design == pytest.approx(base.total_heat_loss_design + 17.0)


def test_multiple_layers_and_wall_pair_are_supported():
    result = calc_tank_heat_loss(_cyl(
        wall_thickness=0.008, wall_lambda=50.0,
        insulation_layers=[
            InsulationLayer(thickness=0.04, material="mineral_wool_boards_120"),
            InsulationLayer(thickness=0.02, material="mineral_wool_boards_120"),
        ],
    ))
    assert len(result.insulation_layers_applied) == 2
    assert result.wall_resistance_areal_bare == pytest.approx(0.008 / 50.0)
