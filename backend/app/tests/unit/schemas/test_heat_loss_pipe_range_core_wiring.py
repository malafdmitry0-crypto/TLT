"""Prove pipe scalar ranges are owned by and delegated to the pure core."""

from unittest.mock import MagicMock

import pytest
from heatcalc_heat_loss_core.pipe_contract import validate_pipe_contract
from pydantic import ValidationError

from app.schemas import calculation as calculation_schemas
from app.schemas.calculation import PipeHeatLossParams, StoredPipeHeatParams

MINERAL_WOOL = "mineral_wool_boards_120"


def _pipe(**updates: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "outer_diameter": 0.108,
        "wall_thickness": 0.004,
        "pipe_material": "carbon_steel",
        "insulation_layers": [{"thickness": 0.05, "material": MINERAL_WOOL}],
        "insulation_temperature_basis": "outdoor_winter",
        "ambient_temperature": -20.0,
        "process_temperature": 80.0,
        "pipe_length": 10.0,
        "num_local_elements": 0,
        "wind_speed": 0.0,
        "safety_factor": 1.1,
        "placement": "outdoor",
    }
    payload.update(updates)
    return payload


@pytest.mark.parametrize("model", [PipeHeatLossParams, StoredPipeHeatParams])
def test_pipe_and_stored_pipe_call_the_unified_core_contract_once(
    monkeypatch: pytest.MonkeyPatch,
    model: type[PipeHeatLossParams] | type[StoredPipeHeatParams],
) -> None:
    contract_spy = MagicMock(wraps=validate_pipe_contract)
    monkeypatch.setattr(calculation_schemas, "validate_pipe_contract", contract_spy)

    params = model.model_validate(_pipe())

    assert params.outer_diameter == 0.108
    contract_spy.assert_called_once()


def test_pipe_range_failure_is_returned_by_the_unified_contract(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    contract_spy = MagicMock(wraps=validate_pipe_contract)
    monkeypatch.setattr(calculation_schemas, "validate_pipe_contract", contract_spy)

    with pytest.raises(ValidationError) as exc_info:
        PipeHeatLossParams.model_validate(_pipe(outer_diameter=0.0))

    assert exc_info.value.errors(include_url=False) == [
        {
            "type": "greater_than_equal",
            "loc": ("outer_diameter",),
            "msg": "Input should be greater than or equal to 0.0108",
            "input": 0.0,
            "ctx": {"ge": 0.0108},
        }
    ]
    contract_spy.assert_called_once()


def test_pipe_parse_failure_never_calls_aggregate_core_validator(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    contract_spy = MagicMock(wraps=validate_pipe_contract)
    monkeypatch.setattr(calculation_schemas, "validate_pipe_contract", contract_spy)

    with pytest.raises(ValidationError) as exc_info:
        PipeHeatLossParams.model_validate(_pipe(outer_diameter="not-a-number"))

    assert exc_info.value.errors(include_url=False)[0]["type"] == "float_parsing"
    contract_spy.assert_not_called()


def test_pipe_multiple_range_errors_keep_legacy_order_shape_and_raw_inputs() -> None:
    payload = _pipe(
        outer_diameter="0",
        pipe_material=None,
        pipe_lambda="0",
        insulation_layers=[],
    )

    with pytest.raises(ValidationError) as exc_info:
        PipeHeatLossParams.model_validate(payload)

    assert exc_info.value.errors(include_url=False) == [
        {
            "type": "greater_than_equal",
            "loc": ("outer_diameter",),
            "msg": "Input should be greater than or equal to 0.0108",
            "input": "0",
            "ctx": {"ge": 0.0108},
        },
        {
            "type": "greater_than",
            "loc": ("pipe_lambda",),
            "msg": "Input should be greater than 0",
            "input": "0",
            "ctx": {"gt": 0},
        },
        {
            "type": "too_short",
            "loc": ("insulation_layers",),
            "msg": "List should have at least 1 item after validation, not 0",
            "input": [],
            "ctx": {"field_type": "List", "min_length": 1, "actual_length": 0},
        },
    ]
