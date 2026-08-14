"""Prove invalid raw heat inputs are rejected before formula facades run."""

from __future__ import annotations

from copy import deepcopy
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from pydantic import ValidationError

import app.services.heat_loss_application as heat_loss_application_module
from app.schemas.heat_loss import PipeHeatLossParams, TankHeatLossParams
from app.services.calculation_service import CalculationService


def _pipe(**updates: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "outer_diameter": 0.108,
        "wall_thickness": 0.006,
        "pipe_material": "carbon_steel",
        "pipe_length": 10.0,
        "insulation_layers": [{"thickness": 0.05, "material": "mineral_wool_boards_120"}],
        "insulation_temperature_basis": "outdoor_winter",
        "ambient_temperature": -20.0,
        "process_temperature": 80.0,
        "placement": "outdoor",
        "wind_speed": 0.0,
        "safety_factor": 1.1,
    }
    payload.update(updates)
    return payload


def _underground_pipe(**updates: object) -> dict[str, object]:
    payload = _pipe(
        placement="underground",
        insulation_temperature_basis="channel",
        ambient_temperature=None,
        wind_speed=None,
        ground_temperature=5.0,
        ground_conductivity=1.5,
        pipe_centerline_depth=1.0,
    )
    payload.update(updates)
    return payload


def _tank(**updates: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "shape": "cylindrical",
        "diameter": 2.0,
        "height": 3.0,
        "insulation_layers": [{"thickness": 0.08, "material": "mineral_wool_boards_120"}],
        "insulation_temperature_basis": "outdoor_winter",
        "ambient_temperature": -20.0,
        "process_temperature": 80.0,
        "placement": "outdoor",
        "wind_speed": 0.0,
        "safety_factor": 1.1,
        "q_additional": 0.0,
    }
    payload.update(updates)
    return payload


def _underground_tank(**updates: object) -> dict[str, object]:
    payload = _tank(
        placement="underground",
        insulation_temperature_basis="channel",
        ground_temperature=5.0,
        ground_conductivity=1.5,
        tank_buried_height=1.0,
    )
    payload.update(updates)
    return payload


INVALID_INPUTS = [
    pytest.param("pipe", _pipe(outer_diameter=0.0), id="pipe-outer-diameter"),
    pytest.param("pipe", _pipe(outer_diameter="invalid"), id="pipe-outer-diameter-type"),
    pytest.param(
        "pipe",
        _pipe(outer_diameter=0.108, wall_thickness=0.06),
        id="pipe-wall-exceeds-radius",
    ),
    pytest.param("pipe", _pipe(pipe_length=0.0), id="pipe-length"),
    pytest.param("pipe", _pipe(safety_factor="invalid"), id="pipe-safety-factor-type"),
    pytest.param(
        "pipe",
        _pipe(insulation_layers=[{"thickness": 0.0, "material": "mineral_wool_boards_120"}]),
        id="pipe-layer-thickness",
    ),
    pytest.param(
        "pipe",
        _pipe(ambient_temperature=80.0, process_temperature=80.0),
        id="pipe-air-temperature-order",
    ),
    pytest.param(
        "pipe",
        _underground_pipe(ground_temperature=80.0, process_temperature=80.0),
        id="pipe-ground-temperature-order",
    ),
    pytest.param(
        "pipe",
        _pipe(
            insulation_layers=[
                {
                    "thickness": 0.05,
                    "material": "other",
                    "temperature_range": [-90.0, 600.0],
                }
            ]
        ),
        id="pipe-manual-conductivity",
    ),
    pytest.param(
        "pipe",
        _underground_pipe(pipe_centerline_depth=None),
        id="pipe-underground-depth",
    ),
    pytest.param(
        "pipe",
        _underground_pipe(pipe_centerline_depth=0.09),
        id="pipe-underground-shallow-depth",
    ),
    pytest.param(
        "pipe",
        _underground_pipe(ground_conductivity=None),
        id="pipe-underground-ground-conductivity",
    ),
    pytest.param(
        "pipe",
        _underground_pipe(ground_temperature=None),
        id="pipe-underground-ground-temperature",
    ),
    pytest.param(
        "pipe",
        _pipe(ambient_temperature=None),
        id="pipe-air-ambient-temperature",
    ),
    pytest.param(
        "pipe",
        _pipe(ambient_temperature="invalid", ambient_temperature_source="manual"),
        id="pipe-manual-ambient-temperature-type",
    ),
    pytest.param(
        "tank",
        _tank(ambient_temperature=None),
        id="tank-ambient-temperature",
    ),
    pytest.param(
        "tank",
        _tank(ambient_temperature=80.0, process_temperature=80.0),
        id="tank-temperature-order",
    ),
    pytest.param(
        "tank",
        _tank(wall_thickness=0.0, wall_lambda=50.0),
        id="tank-wall-thickness",
    ),
    pytest.param(
        "tank",
        _tank(wall_thickness=0.008, wall_lambda=0.0),
        id="tank-wall-conductivity",
    ),
    pytest.param(
        "tank",
        _tank(
            insulation_layers=[
                {"thickness": 0.02, "material": "mineral_wool_boards_120"} for _ in range(4)
            ]
        ),
        id="tank-layer-count",
    ),
    pytest.param(
        "tank",
        _tank(insulation_layers=[{"thickness": 0.0, "material": "mineral_wool_boards_120"}]),
        id="tank-layer-thickness",
    ),
    pytest.param(
        "tank",
        _tank(
            insulation_layers=[
                {
                    "thickness": 0.08,
                    "material": "other",
                    "temperature_range": [-90.0, 600.0],
                }
            ]
        ),
        id="tank-manual-conductivity",
    ),
    pytest.param(
        "tank",
        _underground_tank(ground_temperature=None),
        id="tank-ground-temperature",
    ),
    pytest.param(
        "tank",
        _underground_tank(ground_conductivity=None),
        id="tank-ground-conductivity-required",
    ),
    pytest.param(
        "tank",
        _underground_tank(ground_conductivity=0.0),
        id="tank-ground-conductivity-positive",
    ),
    pytest.param(
        "tank",
        _underground_tank(tank_buried_height=3.1),
        id="tank-buried-height-within-geometry",
    ),
    pytest.param(
        "tank",
        _tank(diameter=None),
        id="tank-cylindrical-geometry",
    ),
    pytest.param(
        "tank",
        _tank(shape="rectangular", diameter=None, length=None, width=2.0),
        id="tank-rectangular-geometry",
    ),
    pytest.param(
        "tank",
        _tank(wind_speed=None),
        id="tank-outdoor-wind",
    ),
    pytest.param(
        "tank",
        _tank(wind_speed=-1.0),
        id="tank-negative-wind",
    ),
    pytest.param("tank", _tank(safety_factor="invalid"), id="tank-safety-factor-type"),
]


@pytest.mark.parametrize(("object_type", "payload"), INVALID_INPUTS)
async def test_invalid_raw_input_is_rejected_before_formula_facade(
    monkeypatch: pytest.MonkeyPatch,
    object_type: str,
    payload: dict[str, object],
) -> None:
    """The production service boundary rejects every removable facade-guard case."""

    schema = PipeHeatLossParams if object_type == "pipe" else TankHeatLossParams
    with pytest.raises(ValidationError):
        schema.model_validate(payload)

    evaluator = MagicMock(name="evaluate_validated_heat_loss")
    monkeypatch.setattr(heat_loss_application_module, "evaluate_validated_heat_loss", evaluator)

    project_payload = deepcopy(payload)
    project_payload["min_switch_temperature"] = -20.0
    if object_type == "tank":
        project_payload.update(heating_height=2.0, laying_step=0.2)
    obj = SimpleNamespace(
        id=uuid4(),
        object_type=object_type,
        params=project_payload,
        results={"stale": "must be cleared"},
        is_valid=True,
        validation_errors=None,
    )

    result = await CalculationService(AsyncMock()).try_recalculate(obj, coefficients={})

    assert result.is_err is True
    assert obj.results is None
    assert obj.is_valid is False
    assert obj.validation_errors is not None
    assert obj.validation_errors["category"] == "validation"
    assert obj.validation_errors["error_code"] == "invalid_object_params"
    evaluator.assert_not_called()


def test_zero_values_allowed_by_the_contract_still_reach_facades(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Zero is data, not absence, for wind/count/additional heat inputs."""

    pipe_result = MagicMock()
    pipe_result.model_dump.return_value = {"kind": "pipe"}
    tank_result = MagicMock()
    tank_result.model_dump.return_value = {"kind": "tank"}
    evaluator = MagicMock(side_effect=[pipe_result, tank_result])
    monkeypatch.setattr(heat_loss_application_module, "evaluate_validated_heat_loss", evaluator)
    service = CalculationService(AsyncMock())

    pipe_payload = _pipe(num_local_elements=0, wind_speed=0.0)
    tank_payload = _tank(wind_speed=0.0, q_additional=0.0)

    assert service._calc_heat_loss_with_coefficients(
        "pipe", pipe_payload, {}, apply_climate_policy=False
    ) == {"kind": "pipe"}
    assert service._calc_heat_loss_with_coefficients(
        "tank", tank_payload, {}, apply_climate_policy=False
    ) == {"kind": "tank"}
    passed_pipe = evaluator.call_args_list[0].args[0]
    passed_tank = evaluator.call_args_list[1].args[0]
    assert passed_pipe.num_local_elements == 0
    assert passed_pipe.wind_speed == 0.0
    assert passed_tank.wind_speed == 0.0
    assert passed_tank.q_additional == 0.0
