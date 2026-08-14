"""Prove tank validation uses its unified pure-core contract once."""

from unittest.mock import MagicMock

import pytest
from heatcalc_heat_loss_core.tank_contract import validate_tank_contract
from pydantic import ValidationError

from app.schemas import heat_loss as heat_loss_schemas
from app.schemas.heat_loss import StoredTankHeatParams, TankHeatLossParams

MINERAL_WOOL = "mineral_wool_boards_120"


def _tank(**updates: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "shape": "cylindrical",
        "diameter": 2.0,
        "height": 3.0,
        "insulation_layers": [{"thickness": 0.05, "material": MINERAL_WOOL}],
        "insulation_temperature_basis": "outdoor_winter",
        "ambient_temperature": -20.0,
        "process_temperature": 80.0,
        "placement": "outdoor",
        "wind_speed": 4.0,
        "safety_factor": 1.1,
        "q_additional": 0.0,
    }
    payload.update(updates)
    return payload


@pytest.mark.parametrize("model", [TankHeatLossParams, StoredTankHeatParams])
def test_tank_and_stored_tank_call_the_unified_core_contract_once(
    monkeypatch: pytest.MonkeyPatch,
    model: type[TankHeatLossParams] | type[StoredTankHeatParams],
) -> None:
    contract_spy = MagicMock(wraps=validate_tank_contract)
    monkeypatch.setattr(heat_loss_schemas, "validate_tank_contract", contract_spy)

    params = model.model_validate(_tank())

    assert params.diameter == 2.0
    contract_spy.assert_called_once()


def test_tank_range_failure_runs_the_unified_contract_once(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    contract_spy = MagicMock(wraps=validate_tank_contract)
    monkeypatch.setattr(heat_loss_schemas, "validate_tank_contract", contract_spy)

    with pytest.raises(ValidationError):
        TankHeatLossParams.model_validate(_tank(diameter=0.0))

    contract_spy.assert_called_once()


def test_tank_parse_failure_never_calls_the_unified_core_contract(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    contract_spy = MagicMock(wraps=validate_tank_contract)
    monkeypatch.setattr(heat_loss_schemas, "validate_tank_contract", contract_spy)

    with pytest.raises(ValidationError) as exc_info:
        TankHeatLossParams.model_validate(_tank(diameter="not-a-number"))

    assert exc_info.value.errors(include_url=False)[0]["type"] == "float_parsing"
    contract_spy.assert_not_called()


def test_tank_multiple_range_errors_keep_legacy_order_shape_and_raw_inputs() -> None:
    payload = _tank(
        diameter="0",
        insulation_layers=[],
        process_temperature="601",
        wall_lambda="0",
        q_additional="-1",
    )

    with pytest.raises(ValidationError) as exc_info:
        TankHeatLossParams.model_validate(payload)

    assert exc_info.value.errors(include_url=False) == [
        {
            "type": "greater_than_equal",
            "loc": ("diameter",),
            "msg": "Input should be greater than or equal to 0.1",
            "input": "0",
            "ctx": {"ge": 0.1},
        },
        {
            "type": "too_short",
            "loc": ("insulation_layers",),
            "msg": "List should have at least 1 item after validation, not 0",
            "input": [],
            "ctx": {"field_type": "List", "min_length": 1, "actual_length": 0},
        },
        {
            "type": "less_than_equal",
            "loc": ("process_temperature",),
            "msg": "Input should be less than or equal to 600",
            "input": "601",
            "ctx": {"le": 600.0},
        },
        {
            "type": "greater_than",
            "loc": ("wall_lambda",),
            "msg": "Input should be greater than 0",
            "input": "0",
            "ctx": {"gt": 0},
        },
        {
            "type": "greater_than_equal",
            "loc": ("q_additional",),
            "msg": "Input should be greater than or equal to 0",
            "input": "-1",
            "ctx": {"ge": 0.0},
        },
    ]
