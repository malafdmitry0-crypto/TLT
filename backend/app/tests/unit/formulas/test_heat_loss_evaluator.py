"""Tests for the single application-level heat-loss evaluator."""

from typing import cast
from unittest.mock import MagicMock

import pytest

from app.formulas.heat_loss import evaluator as evaluator_module
from app.formulas.heat_loss.evaluator import evaluate_validated_heat_loss
from app.schemas.calculation import (
    PipeHeatLossParams,
    PipeHeatLossResult,
    TankHeatLossParams,
    TankHeatLossResult,
)

MINERAL_WOOL = "mineral_wool_boards_120"


def _pipe_params() -> PipeHeatLossParams:
    return PipeHeatLossParams(
        outer_diameter=0.108,
        wall_thickness=0.004,
        pipe_material="carbon_steel",
        pipe_length=10.0,
        insulation_layers=[{"thickness": 0.05, "material": MINERAL_WOOL}],
        insulation_temperature_basis="outdoor_winter",
        ambient_temperature=-20.0,
        process_temperature=80.0,
        placement="outdoor",
        wind_speed=0.0,
    )


def _tank_params() -> TankHeatLossParams:
    return TankHeatLossParams(
        shape="cylindrical",
        diameter=2.0,
        height=3.0,
        insulation_layers=[{"thickness": 0.08, "material": MINERAL_WOOL}],
        insulation_temperature_basis="outdoor_winter",
        ambient_temperature=-20.0,
        process_temperature=80.0,
        placement="outdoor",
        wind_speed=0.0,
        safety_factor=1.1,
    )


@pytest.mark.parametrize(
    ("params", "facade_name", "result_type"),
    [
        (
            _pipe_params(),
            "calc_pipe_heat_loss",
            PipeHeatLossResult,
        ),
        (
            _tank_params(),
            "calc_tank_heat_loss",
            TankHeatLossResult,
        ),
    ],
)
def test_evaluator_dispatches_same_validated_instance_without_revalidation(
    monkeypatch: pytest.MonkeyPatch,
    params: PipeHeatLossParams | TankHeatLossParams,
    facade_name: str,
    result_type: type[PipeHeatLossResult] | type[TankHeatLossResult],
) -> None:
    result = MagicMock(spec=result_type)
    facade = MagicMock(return_value=result)
    monkeypatch.setattr(evaluator_module, facade_name, facade)

    actual = evaluate_validated_heat_loss(params)

    assert actual is result
    facade.assert_called_once_with(params)


def test_evaluator_rejects_unknown_model_type() -> None:
    params = cast(PipeHeatLossParams, object())

    with pytest.raises(TypeError, match="Unsupported heat-loss parameter model: object"):
        evaluate_validated_heat_loss(params)
