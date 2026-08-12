"""Prove Pydantic delegates insulation ranges to core exactly once."""

from unittest.mock import MagicMock

import pytest
from pydantic import ValidationError

from app.formulas.heat_loss.core.insulation_validation import (
    validate_insulation_conductivity,
    validate_insulation_layer_count,
    validate_insulation_thickness,
)
from app.schemas import calculation as calculation_schemas
from app.schemas.calculation import InsulationLayer, PipeHeatLossParams

MINERAL_WOOL = "mineral_wool_boards_120"


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


def test_layer_calls_each_applicable_core_range_validator_once(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    thickness_spy = MagicMock(wraps=validate_insulation_thickness)
    conductivity_spy = MagicMock(wraps=validate_insulation_conductivity)
    monkeypatch.setattr(calculation_schemas, "validate_insulation_thickness", thickness_spy)
    monkeypatch.setattr(calculation_schemas, "validate_insulation_conductivity", conductivity_spy)

    layer = InsulationLayer(
        thickness=0.05,
        material="other",
        conductivity=0.04,
        temperature_range=(-90.0, 600.0),
    )

    assert layer.thickness == 0.05
    thickness_spy.assert_called_once_with(0.05)
    conductivity_spy.assert_called_once_with(0.04)


def test_parent_reuses_prebuilt_layer_and_only_validates_collection_count(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    layer = InsulationLayer(thickness=0.05, material=MINERAL_WOOL)
    thickness_spy = MagicMock(wraps=validate_insulation_thickness)
    conductivity_spy = MagicMock(wraps=validate_insulation_conductivity)
    count_spy = MagicMock(wraps=validate_insulation_layer_count)
    monkeypatch.setattr(calculation_schemas, "validate_insulation_thickness", thickness_spy)
    monkeypatch.setattr(calculation_schemas, "validate_insulation_conductivity", conductivity_spy)
    monkeypatch.setattr(calculation_schemas, "validate_insulation_layer_count", count_spy)

    params = PipeHeatLossParams.model_validate(_pipe(layer))

    assert params.insulation_layers[0] is layer
    thickness_spy.assert_not_called()
    conductivity_spy.assert_not_called()
    count_spy.assert_called_once_with(1)


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


def test_type_parsing_failure_does_not_call_core_range_validator(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    thickness_spy = MagicMock(wraps=validate_insulation_thickness)
    monkeypatch.setattr(calculation_schemas, "validate_insulation_thickness", thickness_spy)

    with pytest.raises(ValidationError) as exc_info:
        InsulationLayer(thickness="not-a-number", material=MINERAL_WOOL)

    assert exc_info.value.errors(include_url=False)[0]["type"] == "float_parsing"
    thickness_spy.assert_not_called()


def test_range_failure_stops_later_material_contract() -> None:
    with pytest.raises(ValidationError) as exc_info:
        InsulationLayer(thickness=0, material="other")

    errors = exc_info.value.errors(include_url=False)
    assert [error["loc"] for error in errors] == [("thickness",)]
    assert [error["type"] for error in errors] == ["greater_than"]
