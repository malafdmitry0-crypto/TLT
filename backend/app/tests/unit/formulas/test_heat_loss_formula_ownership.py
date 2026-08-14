"""Architecture tests for formula ownership across validation and facades."""

from unittest.mock import MagicMock

import pytest
from heatcalc_heat_loss_core import pipe_evaluation
from heatcalc_heat_loss_core.pipe_contract import validate_pipe_contract
from heatcalc_heat_loss_core.tank_contract import validate_tank_contract
from pydantic import ValidationError

from app.formulas.heat_loss import pipe as pipe_facade
from app.reference_data import loader as reference_loader
from app.schemas import heat_loss as heat_loss_schemas
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


def test_pipe_schema_calls_public_core_contract_once(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    validation_spy = MagicMock(wraps=validate_pipe_contract)
    monkeypatch.setattr(heat_loss_schemas, "validate_pipe_contract", validation_spy)

    PipeHeatLossParams.model_validate(_air_pipe())

    validation_spy.assert_called_once()
    contract = validation_spy.call_args.args[0]
    assert contract.outer_diameter == pytest.approx(0.108)
    assert contract.wall_thickness == pytest.approx(0.004)
    assert contract.process_temperature == pytest.approx(80.0)
    assert contract.ambient_temperature == pytest.approx(-20.0)
    assert contract.placement == "outdoor"


def test_tank_schema_calls_public_core_contract_once(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    validation_spy = MagicMock(wraps=validate_tank_contract)
    monkeypatch.setattr(heat_loss_schemas, "validate_tank_contract", validation_spy)

    TankHeatLossParams.model_validate(_tank(wall_thickness=0.02, wall_lambda=45.0))

    validation_spy.assert_called_once()
    contract = validation_spy.call_args.args[0]
    assert contract.wall_thickness == pytest.approx(0.02)
    assert contract.process_temperature == pytest.approx(80.0)
    assert contract.ambient_temperature == pytest.approx(-20.0)
    assert contract.ground_temperature is None


def test_core_issue_codes_become_field_errors_without_message_parsing() -> None:
    payload = _air_pipe(
        outer_diameter=0.0108,
        wall_thickness=0.04,
        process_temperature=5.0,
        placement="underground",
        insulation_temperature_basis="channel",
        ambient_temperature=None,
        wind_speed=None,
        ground_temperature=5.0,
        pipe_centerline_depth=0.05,
        ground_conductivity=1.5,
    )

    with pytest.raises(ValidationError) as exc_info:
        PipeHeatLossParams.model_validate(payload)

    errors = exc_info.value.errors()
    assert [error["loc"] for error in errors] == [
        ("wall_thickness",),
        ("process_temperature",),
        ("pipe_centerline_depth",),
    ]
    assert [error["ctx"]["formula_code"] for error in errors] == [
        "wall_exceeds_pipe_radius",
        "process_temperature_not_above_ground",
        "ground_centerline_inside_pipe",
    ]


def test_pipe_facade_delegates_mean_wall_temperature_to_core(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    mean_spy = MagicMock(wraps=pipe_evaluation.arithmetic_mean)
    monkeypatch.setattr(pipe_evaluation, "arithmetic_mean", mean_spy)
    params = PipeHeatLossParams.model_validate(_air_pipe())

    pipe_facade.calc_pipe_heat_loss(params)

    mean_spy.assert_called_once_with(80.0, -20.0)


def test_pipe_material_loader_delegates_lambda_arithmetic_to_core(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    evaluate_spy = MagicMock(wraps=reference_loader.evaluate_conductivity)
    monkeypatch.setattr(reference_loader, "evaluate_conductivity", evaluate_spy)

    conductivity = reference_loader.get_pipe_material_lambda("carbon_steel", 30.0)

    assert conductivity > 0.0
    evaluate_spy.assert_called_once()
    law, temperature = evaluate_spy.call_args.args
    assert isinstance(law, reference_loader.AffineConductivity)
    assert law.temperature_offset_c == 40.0
    assert law.minimum_w_mk == 0.001
    assert temperature == 30.0
