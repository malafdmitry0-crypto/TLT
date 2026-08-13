"""C5: catalog lookup lives only in application preparation."""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest
from pydantic import ValidationError

from app.formulas.heat_loss import pipe as pipe_facade
from app.formulas.heat_loss.catalog_preparation import HeatLossPreparationError
from app.reference_data import loader as reference_loader
from app.schemas.calculation import InsulationLayer, PipeHeatLossParams, TankHeatLossParams
from app.services.calculation_service import build_heat_loss_error_payload

MINERAL_WOOL = "mineral_wool_boards_120"


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


def test_standalone_and_parent_validation_do_not_call_catalog(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    range_spy = MagicMock(wraps=reference_loader.get_insulation_temperature_range)
    resolve_spy = MagicMock(wraps=reference_loader.resolve_reference_insulation)
    monkeypatch.setattr(reference_loader, "get_insulation_temperature_range", range_spy)
    monkeypatch.setattr(reference_loader, "resolve_reference_insulation", resolve_spy)

    InsulationLayer.model_validate({"thickness": 0.05, "material": MINERAL_WOOL})
    PipeHeatLossParams.model_validate(_pipe_payload())
    TankHeatLossParams.model_validate(
        {
            "shape": "cylindrical",
            "diameter": 2.0,
            "height": 3.0,
            "insulation_layers": [{"thickness": 0.08, "material": MINERAL_WOOL}],
            "insulation_temperature_basis": "outdoor_winter",
            "ambient_temperature": -20.0,
            "process_temperature": 80.0,
            "placement": "outdoor",
            "wind_speed": 0.0,
            "safety_factor": 1.1,
        }
    )

    range_spy.assert_not_called()
    resolve_spy.assert_not_called()


def test_three_reference_layers_resolve_once_each(monkeypatch: pytest.MonkeyPatch) -> None:
    resolve_spy = MagicMock(wraps=reference_loader.resolve_reference_insulation)
    monkeypatch.setattr(
        "app.formulas.heat_loss.catalog_preparation.resolve_reference_insulation",
        resolve_spy,
    )
    params = PipeHeatLossParams.model_validate(
        _pipe_payload(
            insulation_layers=[
                {"thickness": 0.05, "material": MINERAL_WOOL},
                {"thickness": 0.03, "material": MINERAL_WOOL},
                {"thickness": 0.02, "material": MINERAL_WOOL},
            ]
        )
    )
    pipe_facade.calc_pipe_heat_loss(params)
    assert resolve_spy.call_count == 3


def test_unknown_second_layer_has_structured_path() -> None:
    params = PipeHeatLossParams.model_validate(
        _pipe_payload(
            insulation_layers=[
                {"thickness": 0.05, "material": MINERAL_WOOL},
                {"thickness": 0.04, "material": "not_a_catalog_material"},
            ]
        )
    )
    with pytest.raises(HeatLossPreparationError) as caught:
        pipe_facade.calc_pipe_heat_loss(params)
    assert caught.value.path == "insulation_layers.1.material"
    payload = build_heat_loss_error_payload(caught.value, object_type="pipe")
    assert payload["field"] == "insulation_layers.1.material"
    assert payload["fields"] == {
        "insulation_layers.1.material": "Неизвестный материал изоляции: not_a_catalog_material"
    }
    assert payload["error_code"] == "unknown_insulation_material"
    assert payload["message"] == "Неизвестный материал изоляции: not_a_catalog_material"


def test_manual_layer_schema_errors_remain_catalog_free() -> None:
    payload = {"thickness": 0.05, "material": "other", "temperature_range": [-90.0, 600.0]}
    with pytest.raises(ValidationError) as caught:
        InsulationLayer.model_validate(payload)
    error = caught.value.errors(include_url=False)[0]
    assert error["loc"] == ()
    assert "необходимо задать λ слоя" in error["msg"]
