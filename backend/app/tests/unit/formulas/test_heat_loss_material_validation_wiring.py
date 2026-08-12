"""Prove backend material policy delegates all temperature math to the core."""

from collections.abc import Callable
from typing import Any
from unittest.mock import MagicMock

import pytest
from pydantic import ValidationError

from app.formulas.heat_loss import pipe as pipe_formulas
from app.formulas.heat_loss import tank as tank_formulas
from app.formulas.heat_loss.core.material_validation import (
    validate_hot_side_temperature_in_interval,
    validate_temperature_in_interval,
    validate_temperature_interval,
)
from app.schemas import calculation as calculation_schemas
from app.schemas.calculation import InsulationLayer, PipeHeatLossParams, TankHeatLossParams

MINERAL_WOOL = "mineral_wool_boards_120"


def _pipe() -> PipeHeatLossParams:
    return PipeHeatLossParams(
        outer_diameter=0.108,
        wall_thickness=0.004,
        pipe_material="carbon_steel",
        insulation_layers=[{"thickness": 0.05, "material": MINERAL_WOOL}],
        insulation_temperature_basis="outdoor_winter",
        ambient_temperature=-20.0,
        process_temperature=80.0,
        pipe_length=10.0,
        wind_speed=4.0,
        placement="outdoor",
    )


def _tank() -> TankHeatLossParams:
    return TankHeatLossParams(
        shape="cylindrical",
        diameter=2.0,
        height=3.0,
        insulation_layers=[{"thickness": 0.05, "material": MINERAL_WOOL}],
        insulation_temperature_basis="outdoor_winter",
        ambient_temperature=-20.0,
        process_temperature=80.0,
        wind_speed=4.0,
        safety_factor=1.1,
        placement="outdoor",
    )


def test_manual_material_interval_shape_delegates_to_core_once(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    validator = MagicMock(wraps=validate_temperature_interval)
    monkeypatch.setattr(calculation_schemas, "validate_temperature_interval", validator)

    layer = InsulationLayer(
        thickness=0.05,
        material="other",
        conductivity=0.04,
        temperature_range=(-90.0, 600.0),
    )

    assert layer.temperature_range == (-90.0, 600.0)
    validator.assert_called_once_with(minimum_c=-90.0, maximum_c=600.0)


def test_invalid_manual_interval_keeps_existing_pydantic_error() -> None:
    payload = {
        "thickness": 0.05,
        "material": "other",
        "conductivity": 0.04,
        "temperature_range": [100.0, -60.0],
    }

    with pytest.raises(ValidationError) as exc_info:
        InsulationLayer.model_validate(payload)

    error = exc_info.value.errors(include_url=False)[0]
    assert error["type"] == "value_error"
    assert error["loc"] == ()
    assert error["input"] == payload
    assert error["msg"] == (
        "Value error, Температурный диапазон материала изоляции 'other': "
        "нижняя граница должна быть меньше верхней"
    )


@pytest.mark.parametrize("factory", [_pipe, _tank])
def test_reference_material_temperature_check_delegates_to_core(
    monkeypatch: pytest.MonkeyPatch,
    factory: Callable[[], Any],
) -> None:
    validator = MagicMock(wraps=validate_temperature_in_interval)
    monkeypatch.setattr(calculation_schemas, "validate_temperature_in_interval", validator)

    factory()

    validator.assert_called_once()


@pytest.mark.parametrize(
    ("module", "calculate", "factory"),
    [
        (pipe_formulas, pipe_formulas.calc_pipe_heat_loss, _pipe),
        (tank_formulas, tank_formulas.calc_tank_heat_loss, _tank),
    ],
)
def test_facade_layer_temperature_check_delegates_to_core(
    monkeypatch: pytest.MonkeyPatch,
    module: Any,
    calculate: Callable[[Any], Any],
    factory: Callable[[], Any],
) -> None:
    validator = MagicMock(wraps=validate_hot_side_temperature_in_interval)
    monkeypatch.setattr(module, "validate_hot_side_temperature_in_interval", validator)

    calculate(factory())

    validator.assert_called_once()
