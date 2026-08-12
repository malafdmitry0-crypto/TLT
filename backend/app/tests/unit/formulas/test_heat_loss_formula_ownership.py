"""Architecture tests for formula ownership across validation and facades."""

from unittest.mock import MagicMock

import pytest

from app.formulas.heat_loss import pipe as pipe_facade
from app.formulas.heat_loss.core.geometry import layered_outer_radius, radius_from_diameter
from app.formulas.heat_loss.core.thermal import affine_value, clamp_minimum
from app.reference_data import loader as reference_loader
from app.schemas import calculation as calculation_schemas
from app.schemas.calculation import PipeHeatLossParams, TankHeatLossParams

MINERAL_WOOL = "mineral_wool_boards_120"


def _air_pipe(**overrides: object) -> dict[str, object]:
    values: dict[str, object] = {
        "outer_diameter": 0.108,
        "wall_thickness": 0.004,
        "pipe_material": "carbon_steel",
        "pipe_length": 10.0,
        "insulation_layers": [{"thickness": 0.05, "material": MINERAL_WOOL}],
        "insulation_temperature_basis": "outdoor_winter",
        "ambient_temperature": -20.0,
        "process_temperature": 80.0,
        "placement": "outdoor",
        "wind_speed": 0.0,
        "safety_factor": 1.1,
    }
    values.update(overrides)
    return values


def _tank(**overrides: object) -> dict[str, object]:
    values: dict[str, object] = {
        "shape": "cylindrical",
        "diameter": 2.0,
        "height": 3.0,
        "insulation_layers": [{"thickness": 0.08, "material": MINERAL_WOOL}],
        "insulation_temperature_basis": "outdoor_winter",
        "ambient_temperature": -20.0,
        "process_temperature": 80.0,
        "placement": "outdoor",
        "wind_speed": 0.0,
        "safety_factor": 1.1,
    }
    values.update(overrides)
    return values


def test_wall_geometry_validators_delegate_radius_formula_to_core(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    radius_spy = MagicMock(wraps=radius_from_diameter)
    monkeypatch.setattr(calculation_schemas, "radius_from_diameter", radius_spy)

    PipeHeatLossParams.model_validate(_air_pipe())
    TankHeatLossParams.model_validate(_tank(wall_thickness=0.02, wall_lambda=45.0))

    assert radius_spy.call_args_list[0].args == (0.108,)
    assert radius_spy.call_args_list[1].args == (2.0,)


def test_underground_pipe_validator_delegates_layered_radius_formula_to_core(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    radius_spy = MagicMock(wraps=layered_outer_radius)
    monkeypatch.setattr(calculation_schemas, "layered_outer_radius", radius_spy)
    payload = _air_pipe(
        placement="underground",
        insulation_temperature_basis="channel",
        ambient_temperature=None,
        wind_speed=None,
        ground_temperature=5.0,
        pipe_centerline_depth=1.0,
        ground_conductivity=1.5,
    )

    PipeHeatLossParams.model_validate(payload)

    radius_spy.assert_called_once_with(0.108, (0.05,))


def test_pipe_facade_delegates_mean_wall_temperature_to_core(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    mean_spy = MagicMock(wraps=pipe_facade.arithmetic_mean)
    monkeypatch.setattr(pipe_facade, "arithmetic_mean", mean_spy)
    params = PipeHeatLossParams.model_validate(_air_pipe())

    pipe_facade.calc_pipe_heat_loss(params)

    mean_spy.assert_called_once_with(80.0, -20.0)


def test_pipe_material_loader_delegates_lambda_arithmetic_to_core(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    affine_spy = MagicMock(wraps=affine_value)
    clamp_spy = MagicMock(wraps=clamp_minimum)
    monkeypatch.setattr(reference_loader, "affine_value", affine_spy)
    monkeypatch.setattr(reference_loader, "clamp_minimum", clamp_spy)

    conductivity = reference_loader.get_pipe_material_lambda("carbon_steel", 30.0)

    assert conductivity > 0.0
    assert affine_spy.call_args.kwargs["variable_offset"] == 40.0
    assert clamp_spy.call_args.kwargs == {"minimum": 0.001}
