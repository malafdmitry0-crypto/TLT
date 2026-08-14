"""Freeze the future unified core boundary for heat-loss input models."""

from __future__ import annotations

import ast
from pathlib import Path
from unittest.mock import MagicMock

import pytest
from pydantic import ValidationError

from app.schemas import heat_loss as heat_loss_schemas
from app.schemas.calculation import (
    InsulationLayer,
    PipeHeatLossParams,
    StoredPipeHeatParams,
    StoredTankHeatParams,
    TankHeatLossParams,
)

MINERAL_WOOL = "mineral_wool_boards_120"
_HEAT_LOSS_SCHEMA_PATH = Path(heat_loss_schemas.__file__)


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


@pytest.mark.parametrize(
    ("model", "payload", "validator_name"),
    [
        (PipeHeatLossParams, _pipe, "validate_pipe_contract"),
        (StoredPipeHeatParams, _pipe, "validate_pipe_contract"),
        (TankHeatLossParams, _tank, "validate_tank_contract"),
        (StoredTankHeatParams, _tank, "validate_tank_contract"),
    ],
)
def test_models_call_their_unified_core_contract_once(
    monkeypatch: pytest.MonkeyPatch,
    model: type[
        PipeHeatLossParams | StoredPipeHeatParams | TankHeatLossParams | StoredTankHeatParams
    ],
    payload: object,
    validator_name: str,
) -> None:
    validator = getattr(heat_loss_schemas, validator_name)
    spy = MagicMock(wraps=validator)
    monkeypatch.setattr(heat_loss_schemas, validator_name, spy)

    model.model_validate(payload())  # type: ignore[operator]

    spy.assert_called_once()


@pytest.mark.parametrize(
    ("model", "payload", "invalid_field", "validator_name"),
    [
        (PipeHeatLossParams, _pipe, "outer_diameter", "validate_pipe_contract"),
        (TankHeatLossParams, _tank, "diameter", "validate_tank_contract"),
    ],
)
def test_parse_failure_skips_unified_contract(
    monkeypatch: pytest.MonkeyPatch,
    model: type[PipeHeatLossParams | TankHeatLossParams],
    payload: object,
    invalid_field: str,
    validator_name: str,
) -> None:
    validator = getattr(heat_loss_schemas, validator_name)
    spy = MagicMock(wraps=validator)
    monkeypatch.setattr(heat_loss_schemas, validator_name, spy)

    with pytest.raises(ValidationError):
        model.model_validate(payload(**{invalid_field: "not-a-number"}))  # type: ignore[operator]

    spy.assert_not_called()


@pytest.mark.parametrize(
    ("model", "payload", "validator_name"),
    [
        (PipeHeatLossParams, _pipe, "validate_pipe_contract"),
        (TankHeatLossParams, _tank, "validate_tank_contract"),
    ],
)
def test_prebuilt_layer_is_reused_and_each_public_contract_runs_once(
    monkeypatch: pytest.MonkeyPatch,
    model: type[PipeHeatLossParams | TankHeatLossParams],
    payload: object,
    validator_name: str,
) -> None:
    layer = InsulationLayer(thickness=0.05, material=MINERAL_WOOL)
    insulation_contract_spy = MagicMock(wraps=heat_loss_schemas.validate_insulation_contract)
    contract_spy = MagicMock(wraps=getattr(heat_loss_schemas, validator_name))
    monkeypatch.setattr(
        heat_loss_schemas,
        "validate_insulation_contract",
        insulation_contract_spy,
    )
    monkeypatch.setattr(heat_loss_schemas, validator_name, contract_spy)

    params = model.model_validate(payload(insulation_layers=[layer]))  # type: ignore[operator]

    assert params.insulation_layers[0] is layer
    insulation_contract_spy.assert_called_once()
    contract_spy.assert_called_once()


def _class_calls(class_name: str) -> list[str]:
    module = ast.parse(_HEAT_LOSS_SCHEMA_PATH.read_text())
    class_node = next(
        node for node in module.body if isinstance(node, ast.ClassDef) and node.name == class_name
    )
    return [
        node.func.id
        for node in ast.walk(class_node)
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name)
    ]


@pytest.mark.parametrize(
    ("class_name", "unified_name", "legacy_names"),
    [
        (
            "PipeHeatLossParams",
            "validate_pipe_contract",
            {"validate_pipe_input_ranges", "validate_pipe_formula_domain"},
        ),
        (
            "TankHeatLossParams",
            "validate_tank_contract",
            {"validate_tank_input_ranges", "validate_tank_formula_domain"},
        ),
    ],
)
def test_base_models_have_one_unified_contract_call_only(
    class_name: str,
    unified_name: str,
    legacy_names: set[str],
) -> None:
    calls = _class_calls(class_name)

    assert calls.count(unified_name) == 1
    assert legacy_names.isdisjoint(calls)


@pytest.mark.parametrize("class_name", ["StoredPipeHeatParams", "StoredTankHeatParams"])
def test_stored_models_do_not_call_core_contracts_directly(class_name: str) -> None:
    calls = _class_calls(class_name)

    assert not {"validate_pipe_contract", "validate_tank_contract"}.intersection(calls)
