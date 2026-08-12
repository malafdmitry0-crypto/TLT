"""Characterize Pydantic boundaries at heat-loss evaluation entrypoints."""

from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.api.v1 import admin as admin_api
from app.formulas.heat_loss.evaluator import evaluate_validated_heat_loss
from app.schemas.calculation import PipeHeatLossParams, TankHeatLossParams


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
async def test_admin_formula_check_constructs_pydantic_model_before_evaluation(
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
    audit_service = MagicMock()
    audit_service.try_record = AsyncMock()

    monkeypatch.setattr(admin_api, constructor_name, constructor)
    monkeypatch.setattr(admin_api, "evaluate_validated_heat_loss", evaluator)
    monkeypatch.setattr(admin_api, "AuditService", MagicMock(return_value=audit_service))

    response = await admin_api.formula_check(
        admin_api.FormulaCheckRequest(formula_type=formula_type, params=payload),
        principal=MagicMock(),
        db=MagicMock(),
    )

    assert response == {"formula_model": formula_type}
    assert constructor.call_count == 1
    assert evaluator.call_count == 1
    assert evaluator.call_args.args[0] is models[0]
    audit_service.try_record.assert_awaited_once()
