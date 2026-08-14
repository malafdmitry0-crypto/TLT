"""Characterize Pydantic boundaries at heat-loss evaluation entrypoints."""

from __future__ import annotations

from typing import Any
from unittest.mock import MagicMock

import pytest

from app.formulas.heat_loss.evaluator import evaluate_validated_heat_loss
from app.schemas.calculation import PipeHeatLossParams, TankHeatLossParams
from app.services import heat_loss_application


def _pipe() -> dict[str, object]:
    return {
        "outer_diameter": 0.108,
        "wall_thickness": 0.004,
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


def _tank() -> dict[str, object]:
    return {
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
    }


def test_evaluator_requires_a_prevalidated_pydantic_model() -> None:
    """Raw mappings cannot bypass the caller-owned Pydantic boundary."""

    with pytest.raises(TypeError, match="Unsupported heat-loss parameter model"):
        evaluate_validated_heat_loss(_pipe())  # type: ignore[arg-type]


@pytest.mark.parametrize(
    ("formula_type", "payload", "model_type", "constructor_name"),
    [
        pytest.param("pipe", _pipe(), PipeHeatLossParams, "PipeHeatLossParams", id="pipe"),
        pytest.param("tank", _tank(), TankHeatLossParams, "TankHeatLossParams", id="tank"),
    ],
)
def test_application_preview_constructs_pydantic_model_before_evaluation(
    monkeypatch: pytest.MonkeyPatch,
    formula_type: str,
    payload: dict[str, object],
    model_type: type[PipeHeatLossParams] | type[TankHeatLossParams],
    constructor_name: str,
) -> None:
    """The admin preview passes one validated model, never its raw request mapping."""

    models: list[PipeHeatLossParams | TankHeatLossParams] = []

    def construct(**kwargs: Any) -> PipeHeatLossParams | TankHeatLossParams:
        model = model_type(**kwargs)
        models.append(model)
        return model

    constructor = MagicMock(side_effect=construct)
    evaluator_result = MagicMock()
    evaluator_result.model_dump.return_value = {"formula_model": formula_type}
    evaluator = MagicMock(return_value=evaluator_result)
    monkeypatch.setattr(heat_loss_application, constructor_name, constructor)
    monkeypatch.setattr(heat_loss_application, "evaluate_validated_heat_loss", evaluator)

    response = heat_loss_application.preview_validated_heat_formula(
        formula_type,  # type: ignore[arg-type]
        payload,
    )

    assert response == {"formula_model": formula_type}
    assert constructor.call_count == 1
    assert evaluator.call_count == 1
    assert evaluator.call_args.args[0] is models[0]
