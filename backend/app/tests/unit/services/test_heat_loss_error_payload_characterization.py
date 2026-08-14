"""Freeze post-Pydantic heat-loss error channels and their current payloads.

Catalog unknown-material → HeatLossPreparationError + structured payload is
already covered by test_unknown_second_layer_has_structured_path. This module
adds the remaining housing: process-T structured payload, exact hot-side
ValueError type, facade range/domain ValueError, and as-is reconstruction
of code/field from a plain ValueError message.
"""

from __future__ import annotations

from typing import Any
from unittest.mock import MagicMock

import pytest
from heatcalc_heat_loss_core.errors import FormulaDomainError

from app.formulas.heat_loss import pipe as pipe_facade
from app.formulas.heat_loss.catalog_preparation import HeatLossPreparationError
from app.formulas.heat_loss.pipe import calc_pipe_heat_loss
from app.schemas.calculation import PipeHeatLossParams
from app.services.calculation_service import build_heat_loss_error_payload

MINERAL_WOOL = "mineral_wool_boards_120"
HOT_SIDE_PIPE_LITERAL = (
    "Температура горячей стороны слоя изоляции #1 (79.9856 °C) вне диапазона "
    "материала 'other': -90…60 °C"
)
WALL_EXCEEDS_LITERAL = "Толщина стенки (40.0 мм) превышает радиус трубы (5.4 мм)"
RANGE_SAFETY_FACTOR_LITERAL = "safety_factor должно быть не меньше 1 (получено 0)"
DEFAULT_VALIDATION_HINT = "Проверьте параметры объекта и повторите расчёт."


def _pipe_payload(**overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
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
    payload.update(overrides)
    return payload


def _reconstructed_value_error_payload(message: str) -> dict[str, Any]:
    return {
        "error_code": "invalid_object_params",
        "category": "validation",
        "message": message,
        "field": None,
        "hint": DEFAULT_VALIDATION_HINT,
    }


def test_process_temperature_error_payload_uses_path_without_parsing_message() -> None:
    params = PipeHeatLossParams.model_validate(_pipe_payload(process_temperature=500.0))

    with pytest.raises(HeatLossPreparationError) as caught:
        calc_pipe_heat_loss(params)

    error = caught.value
    assert type(error) is HeatLossPreparationError
    assert error.code == "process_temperature_outside_interval"
    assert error.path == "insulation_layers.0.material"
    assert "диапазон" in error.message

    payload = build_heat_loss_error_payload(error, object_type="pipe")
    assert payload == {
        "error_code": "process_temperature_outside_interval",
        "category": "validation",
        "message": (
            "Температура продукта 500 °C вне диапазона материала "
            "изоляции #1 'mineral_wool_boards_120': -60…400 °C"
        ),
        "field": "insulation_layers.0.material",
        "fields": {
            "insulation_layers.0.material": (
                "Температура продукта 500 °C вне диапазона материала "
                "изоляции #1 'mineral_wool_boards_120': -60…400 °C"
            )
        },
        "hint": DEFAULT_VALIDATION_HINT,
    }


def test_hot_side_value_error_payload_is_reconstructed_from_message_as_is() -> None:
    params = PipeHeatLossParams.model_validate(
        _pipe_payload(
            insulation_layers=[
                {
                    "thickness": 0.05,
                    "material": "other",
                    "conductivity": 0.04,
                    "temperature_range": [-90, 60],
                }
            ],
            ambient_temperature=-30.0,
            wind_speed=3.0,
            wall_thickness=0.006,
            pipe_length=50.0,
            safety_factor=None,
        )
    )

    with pytest.raises(ValueError) as caught:
        calc_pipe_heat_loss(params)

    error = caught.value
    assert type(error) is ValueError
    assert not isinstance(error, HeatLossPreparationError)
    assert str(error) == HOT_SIDE_PIPE_LITERAL

    payload = build_heat_loss_error_payload(error, object_type="pipe")
    assert payload == _reconstructed_value_error_payload(HOT_SIDE_PIPE_LITERAL)
    assert "fields" not in payload


def test_facade_range_value_error_payload_is_reconstructed_from_message_as_is() -> None:
    params = PipeHeatLossParams.model_validate(_pipe_payload(safety_factor=None))

    with pytest.raises(ValueError) as caught:
        calc_pipe_heat_loss(params, coefficients={"safety_factor": 0.0})

    error = caught.value
    assert type(error) is ValueError
    assert not isinstance(error, HeatLossPreparationError)
    assert str(error) == RANGE_SAFETY_FACTOR_LITERAL

    payload = build_heat_loss_error_payload(error, object_type="pipe")
    assert payload == _reconstructed_value_error_payload(RANGE_SAFETY_FACTOR_LITERAL)
    assert "fields" not in payload


def test_facade_domain_value_error_payload_is_reconstructed_from_message_as_is(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    params = PipeHeatLossParams.model_validate(_pipe_payload())
    monkeypatch.setattr(
        pipe_facade,
        "run_validated_pipe_formula",
        MagicMock(
            side_effect=FormulaDomainError(
                "wall_exceeds_pipe_radius",
                wall_thickness_m=0.04,
                outer_radius_m=0.0054,
            )
        ),
    )

    with pytest.raises(ValueError) as caught:
        calc_pipe_heat_loss(params)

    error = caught.value
    assert type(error) is ValueError
    assert not isinstance(error, HeatLossPreparationError)
    assert str(error) == WALL_EXCEEDS_LITERAL

    payload = build_heat_loss_error_payload(error, object_type="pipe")
    assert payload == _reconstructed_value_error_payload(WALL_EXCEEDS_LITERAL)
    assert "fields" not in payload
