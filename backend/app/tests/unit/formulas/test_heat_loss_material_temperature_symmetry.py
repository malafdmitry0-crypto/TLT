"""Reference and manual insulation share calculated-boundary validation."""

from collections.abc import Callable
from typing import Any

import pytest

from app.formulas.heat_loss.catalog_preparation import HeatLossPreparationError
from app.formulas.heat_loss.pipe import calc_pipe_heat_loss
from app.formulas.heat_loss.tank import calc_tank_heat_loss
from app.schemas.heat_loss import PipeHeatLossParams, TankHeatLossParams

MINERAL_WOOL = "mineral_wool_boards_120"


def _layer(source: str) -> dict[str, object]:
    if source == "reference":
        return {"thickness": 0.05, "material": MINERAL_WOOL}
    return {
        "thickness": 0.05,
        "material": "other",
        "conductivity": 0.04,
        "temperature_range": [-60.0, 400.0],
    }


def _pipe(source: str, *, insulating_wall: bool) -> PipeHeatLossParams:
    return PipeHeatLossParams(
        outer_diameter=0.1,
        wall_thickness=0.04 if insulating_wall else 0.004,
        pipe_lambda=0.001 if insulating_wall else None,
        pipe_material=None if insulating_wall else "carbon_steel",
        insulation_layers=[_layer(source)],
        insulation_temperature_basis="outdoor_winter",
        ambient_temperature=-20.0,
        process_temperature=500.0,
        pipe_length=10.0,
        placement="outdoor",
        wind_speed=4.0,
        safety_factor=1.1,
    )


def _tank(source: str, *, insulating_wall: bool) -> TankHeatLossParams:
    return TankHeatLossParams(
        shape="cylindrical",
        diameter=2.0,
        height=3.0,
        wall_thickness=0.04 if insulating_wall else 0.008,
        wall_lambda=0.001 if insulating_wall else 50.0,
        insulation_layers=[_layer(source)],
        insulation_temperature_basis="outdoor_winter",
        ambient_temperature=-20.0,
        process_temperature=500.0,
        placement="outdoor",
        wind_speed=4.0,
        safety_factor=1.1,
    )


@pytest.mark.parametrize(
    ("factory", "calculate"),
    [
        pytest.param(_pipe, calc_pipe_heat_loss, id="pipe"),
        pytest.param(_tank, calc_tank_heat_loss, id="tank"),
    ],
)
@pytest.mark.parametrize("source", ["reference", "manual"])
def test_process_temperature_outside_range_is_allowed_when_layer_boundaries_are_inside(
    factory: Callable[..., Any],
    calculate: Callable[[Any], Any],
    source: str,
) -> None:
    result = calculate(factory(source, insulating_wall=True))

    assert result.total_heat_loss_design > 0


@pytest.mark.parametrize(
    ("factory", "calculate"),
    [
        pytest.param(_pipe, calc_pipe_heat_loss, id="pipe"),
        pytest.param(_tank, calc_tank_heat_loss, id="tank"),
    ],
)
@pytest.mark.parametrize("source", ["reference", "manual"])
def test_actual_hot_boundary_outside_range_is_rejected_for_both_sources(
    factory: Callable[..., Any],
    calculate: Callable[[Any], Any],
    source: str,
) -> None:
    with pytest.raises(HeatLossPreparationError) as caught:
        calculate(factory(source, insulating_wall=False))

    assert caught.value.code == "temperature_outside_interval"
    assert caught.value.path == "insulation_layers.0"
    assert "Температура горячей стороны" in caught.value.message
