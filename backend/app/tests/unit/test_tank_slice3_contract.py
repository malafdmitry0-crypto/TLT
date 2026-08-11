"""Acceptance contract for Slice 3 cylindrical and rectangular tanks only.

These examples deliberately use a manual insulation conductivity so the
numbers document the physical contract independently of reference-data tables.
"""

import math

import pytest
from pydantic import ValidationError

from app.formulas.heat_loss.tank import calc_tank_heat_loss
from app.schemas.calculation import InsulationLayer, TankHeatLossParams
from app.services.heat_contract import replace_heat_owned_params


def _layer() -> InsulationLayer:
    return InsulationLayer(
        thickness=0.1,
        material="other",
        conductivity=0.05,
        temperature_range=(-100.0, 700.0),
    )


def _cylindrical(**overrides: object) -> TankHeatLossParams:
    data: dict[str, object] = {
        "shape": "cylindrical",
        "diameter": 2.0,
        "height": 3.0,
        "wall_thickness": 0.01,
        "wall_lambda": 0.5,
        "insulation_layers": [_layer()],
        "ambient_temperature": -20.0,
        "process_temperature": 80.0,
        "insulation_temperature_basis": "outdoor_winter",
        "placement": "outdoor",
        "wind_speed": 0.0,
        "safety_factor": 1.2,
        "q_additional": 50.0,
    }
    data.update(overrides)
    return TankHeatLossParams(**data)


def _buried_rectangular(**overrides: object) -> TankHeatLossParams:
    data: dict[str, object] = {
        "shape": "rectangular",
        "length": 4.0,
        "width": 2.0,
        "height": 3.0,
        "wall_thickness": 0.01,
        "wall_lambda": 0.5,
        "insulation_layers": [_layer()],
        "ambient_temperature": -20.0,
        "ground_temperature": 0.0,
        "process_temperature": 80.0,
        "insulation_temperature_basis": "channel",
        "placement": "underground",
        "tank_buried_height": 1.0,
        "ground_conductivity": 2.0,
        "wind_speed": 0.0,
        "safety_factor": 1.2,
        "q_additional": 50.0,
    }
    data.update(overrides)
    return TankHeatLossParams(**data)


def test_tank_schema_is_strict_and_rejects_legacy_tank_keys() -> None:
    with pytest.raises(ValidationError):
        _cylindrical(location="outdoor")
    with pytest.raises(ValidationError):
        _cylindrical(burial_depth=1.0)
    with pytest.raises(ValidationError):
        _cylindrical(insulation_thickness=0.1)
    with pytest.raises(ValidationError):
        _cylindrical(insulation_material="mineral_wool_boards_120")
    with pytest.raises(ValidationError, match="Extra inputs are not permitted"):
        _cylindrical(alpha_vnesh=10.0)


def test_cylindrical_air_auto_alpha_golden_uses_areal_resistances_and_area_once() -> None:
    result = calc_tank_heat_loss(_cylindrical())

    area = 8.0 * math.pi
    r_wall = 0.01 / 0.5
    r_insulation = 0.1 / 0.05
    r_external = 1.0 / 11.6
    q_base = 100.0 / (r_wall + r_insulation + r_external)
    q_base_total = q_base * area
    q_design = q_base_total * 1.2 + 50.0

    assert result.surface_area_bare == pytest.approx(area, abs=1e-3)
    assert result.wall_resistance_areal_bare == pytest.approx(r_wall, abs=1e-6)
    assert result.insulation_resistance_areal_bare == pytest.approx(r_insulation, abs=1e-6)
    assert result.external_resistance_areal_bare == pytest.approx(r_external, abs=1e-6)
    assert result.heat_loss_per_m2_bare_base == pytest.approx(q_base, abs=1e-3)
    assert result.total_heat_loss_base == pytest.approx(q_base_total, abs=1e-3)
    assert result.total_heat_loss_design == pytest.approx(q_design, abs=1e-3)


def test_partially_buried_rectangular_golden_uses_separate_temperatures_and_areas() -> None:
    result = calc_tank_heat_loss(_buried_rectangular())

    air_area, ground_area = 32.0, 20.0
    r_common = 0.01 / 0.5 + 0.1 / 0.05
    q_air = (80.0 - (-20.0)) / (r_common + 1.0 / 11.6)
    q_ground = (80.0 - 0.0) / (r_common + 1.0 / 2.0)
    air_loss = q_air * air_area
    ground_loss = q_ground * ground_area
    base = air_loss + ground_loss

    assert result.air_surface_area == pytest.approx(air_area, abs=1e-3)
    assert result.ground_surface_area == pytest.approx(ground_area, abs=1e-3)
    assert result.surface_area_bare == pytest.approx(air_area + ground_area, abs=1e-3)
    assert result.heat_loss_air_base == pytest.approx(air_loss, abs=1e-3)
    assert result.heat_loss_ground_base == pytest.approx(ground_loss, abs=1e-3)
    assert result.total_heat_loss_base == pytest.approx(base, abs=1e-3)
    assert result.total_heat_loss_design == pytest.approx(base * 1.2 + 50.0, abs=1e-3)
    assert result.ground_temperature_applied == 0.0


def test_partial_burial_ambient_and_ground_temperature_affect_only_their_branches() -> None:
    baseline = calc_tank_heat_loss(_buried_rectangular(q_additional=0.0))
    warmer_air = calc_tank_heat_loss(_buried_rectangular(ambient_temperature=-10.0, q_additional=0.0))
    warmer_ground = calc_tank_heat_loss(_buried_rectangular(ground_temperature=10.0, q_additional=0.0))

    assert warmer_air.heat_loss_air_base < baseline.heat_loss_air_base
    assert warmer_air.heat_loss_ground_base == pytest.approx(baseline.heat_loss_ground_base)
    assert warmer_ground.heat_loss_air_base == pytest.approx(baseline.heat_loss_air_base)
    assert warmer_ground.heat_loss_ground_base < baseline.heat_loss_ground_base


def test_q_additional_is_applied_after_safety_factor() -> None:
    result = calc_tank_heat_loss(_cylindrical(q_additional=50.0))

    assert result.total_heat_loss_design == pytest.approx(
        result.total_heat_loss_base * 1.2 + 50.0,
        abs=1e-3,
    )


@pytest.mark.parametrize("buried_height", [0.0, 3.001])
def test_buried_height_requires_zero_to_height_interval(buried_height: float) -> None:
    with pytest.raises(ValidationError):
        _buried_rectangular(tank_buried_height=buried_height)


def test_buried_height_equal_to_tank_height_is_valid_boundary() -> None:
    result = calc_tank_heat_loss(_buried_rectangular(tank_buried_height=3.0))

    assert result.air_surface_area == pytest.approx(8.0, abs=1e-3)
    assert result.ground_surface_area == pytest.approx(44.0, abs=1e-3)


def test_partly_buried_auto_alpha_requires_explicit_wind_speed() -> None:
    with pytest.raises(ValidationError, match="wind_speed"):
        _buried_rectangular(wind_speed=None)

    result = calc_tank_heat_loss(
        _buried_rectangular(wind_speed=0.0)
    )

    assert result.alpha_vnesh_applied == pytest.approx(11.6)
    assert result.wind_speed_applied == 0.0


def test_tank_heat_replacement_preserves_metadata_and_drops_legacy_keys() -> None:
    existing = {
        "volume": 12.5,
        "name": "Tank T-1",
        "supply_voltage": 380,
        "location": "outdoor",
        "burial_depth": 1.0,
        "insulation_thickness": 0.1,
        "insulation_material": "legacy",
        "shape": "cylindrical",
    }
    incoming = _buried_rectangular().model_dump()

    replaced = replace_heat_owned_params(existing, incoming)

    assert replaced["volume"] == 12.5
    assert replaced["name"] == "Tank T-1"
    assert replaced["supply_voltage"] == 380
    assert "location" not in replaced
    assert "burial_depth" not in replaced
    assert "insulation_thickness" not in replaced
    assert "insulation_material" not in replaced
    assert replaced["shape"] == "rectangular"
    assert replaced["tank_buried_height"] == 1.0
