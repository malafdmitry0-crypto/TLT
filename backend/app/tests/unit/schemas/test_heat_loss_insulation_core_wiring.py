"""Prove Pydantic delegates each insulation layer to core exactly once."""

from __future__ import annotations

import ast
from pathlib import Path
from unittest.mock import MagicMock

import pytest
from pydantic import ValidationError

from app.schemas import heat_loss as heat_loss_schemas
from app.schemas.heat_loss import InsulationLayer, PipeHeatLossParams

MINERAL_WOOL = "mineral_wool_boards_120"
_HEAT_LOSS_SCHEMA_PATH = Path(heat_loss_schemas.__file__)


def _pipe(layer: InsulationLayer | dict[str, object]) -> dict[str, object]:
    return {
        "outer_diameter": 0.108,
        "wall_thickness": 0.004,
        "pipe_material": "carbon_steel",
        "insulation_layers": [layer],
        "insulation_temperature_basis": "outdoor_winter",
        "ambient_temperature": -20.0,
        "process_temperature": 80.0,
        "pipe_length": 10.0,
        "placement": "outdoor",
        "wind_speed": 0.0,
    }


def test_raw_layer_calls_the_unified_core_contract_once(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    contract_spy = MagicMock(wraps=heat_loss_schemas.validate_insulation_contract)
    monkeypatch.setattr(heat_loss_schemas, "validate_insulation_contract", contract_spy)

    layer = InsulationLayer(
        thickness=0.05,
        material="other",
        conductivity=0.04,
        temperature_range=(-90.0, 600.0),
    )

    assert layer.thickness == 0.05
    contract_spy.assert_called_once()


def test_parent_reuses_prebuilt_layer_and_calls_each_public_contract_once(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    layer = InsulationLayer(thickness=0.05, material=MINERAL_WOOL)
    insulation_contract_spy = MagicMock(wraps=heat_loss_schemas.validate_insulation_contract)
    pipe_contract_spy = MagicMock(wraps=heat_loss_schemas.validate_pipe_contract)
    monkeypatch.setattr(
        heat_loss_schemas, "validate_insulation_contract", insulation_contract_spy
    )
    monkeypatch.setattr(heat_loss_schemas, "validate_pipe_contract", pipe_contract_spy)

    params = PipeHeatLossParams.model_validate(_pipe(layer))

    assert params.insulation_layers[0] is layer
    insulation_contract_spy.assert_called_once()
    pipe_contract_spy.assert_called_once()


@pytest.mark.parametrize(
    ("payload", "field", "error_type", "context"),
    [
        (
            {"thickness": "0", "material": MINERAL_WOOL},
            "thickness",
            "greater_than",
            {"gt": 0.0},
        ),
        (
            {
                "thickness": 0.05,
                "material": "other",
                "conductivity": "0",
                "temperature_range": [-90.0, 600.0],
            },
            "conductivity",
            "greater_than",
            {"gt": 0.0},
        ),
    ],
)
def test_core_range_error_preserves_raw_input_and_native_pydantic_shape(
    payload: dict[str, object],
    field: str,
    error_type: str,
    context: dict[str, float],
) -> None:
    with pytest.raises(ValidationError) as exc_info:
        InsulationLayer.model_validate(payload)

    assert exc_info.value.errors(include_url=False) == [
        {
            "type": error_type,
            "loc": (field,),
            "msg": "Input should be greater than 0",
            "input": "0",
            "ctx": context,
        }
    ]


def test_nested_layer_error_keeps_parent_location() -> None:
    with pytest.raises(ValidationError) as exc_info:
        PipeHeatLossParams.model_validate(_pipe({"thickness": "0", "material": MINERAL_WOOL}))

    error = exc_info.value.errors(include_url=False)[0]
    assert error["loc"] == ("insulation_layers", 0, "thickness")
    assert error["type"] == "greater_than"
    assert error["ctx"] == {"gt": 0.0}
    assert error["input"] == "0"


def test_type_parsing_failure_does_not_call_unified_core_contract(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    contract_spy = MagicMock(wraps=heat_loss_schemas.validate_insulation_contract)
    monkeypatch.setattr(heat_loss_schemas, "validate_insulation_contract", contract_spy)

    with pytest.raises(ValidationError) as exc_info:
        InsulationLayer(thickness="not-a-number", material=MINERAL_WOOL)

    assert exc_info.value.errors(include_url=False)[0]["type"] == "float_parsing"
    contract_spy.assert_not_called()


def test_range_failure_stops_later_material_contract() -> None:
    with pytest.raises(ValidationError) as exc_info:
        InsulationLayer(thickness=0, material="other")

    errors = exc_info.value.errors(include_url=False)
    assert [error["loc"] for error in errors] == [("thickness",)]
    assert [error["type"] for error in errors] == ["greater_than"]


def test_insulation_layer_has_one_unified_contract_call_only() -> None:
    module = ast.parse(_HEAT_LOSS_SCHEMA_PATH.read_text())
    layer = next(
        node
        for node in module.body
        if isinstance(node, ast.ClassDef) and node.name == "InsulationLayer"
    )
    calls = [
        node.func.id
        for node in ast.walk(layer)
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name)
    ]

    assert calls.count("validate_insulation_contract") == 1
    assert {
        "validate_insulation_thickness",
        "validate_insulation_conductivity",
        "validate_insulation_layer_ranges",
        "validate_temperature_interval",
        "get_insulation_temperature_range",
    }.isdisjoint(calls)
