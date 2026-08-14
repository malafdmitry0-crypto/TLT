"""Freeze current heat-loss application housing around the formula facades.

K-matrix results and unused-key result equality already live in
test_heat_loss_canonical_flow_characterization. Evaluator dispatch to the
facades is already in test_heat_loss_evaluator. This module freezes the
remaining housing: signatures, which coefficient keys the pipe facade
reads, and that calc_heat_loss plus admin formula-check call the same
evaluate_validated_heat_loss.
"""

from __future__ import annotations

import ast
import inspect
from pathlib import Path
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.api.v1 import admin as admin_api
from app.formulas.heat_loss.evaluator import evaluate_validated_heat_loss
from app.formulas.heat_loss.pipe import calc_pipe_heat_loss
from app.formulas.heat_loss.tank import calc_tank_heat_loss
from app.schemas.calculation import PipeHeatLossParams, TankHeatLossParams
from app.services import heat_loss_application as heat_loss_application_module
from app.services.calculation_service import CalculationService

MINERAL_WOOL = "mineral_wool_boards_120"


class _KeyReadDict(dict[str, Any]):
    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        self.read_keys: list[object] = []

    def __getitem__(self, key: object) -> Any:
        self.read_keys.append(key)
        return super().__getitem__(key)

    def __contains__(self, key: object) -> bool:
        self.read_keys.append(key)
        return super().__contains__(key)

    def get(self, key: object, default: Any = None) -> Any:
        self.read_keys.append(key)
        return super().get(key, default)


def _pipe(**overrides: object) -> dict[str, object]:
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


def _tank(**overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
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
    payload.update(overrides)
    return payload


def _assert_params_only(function: Any) -> None:
    signature = inspect.signature(function)
    assert tuple(signature.parameters) == ("params",)


def test_facade_and_evaluator_signatures_are_params_only() -> None:
    _assert_params_only(calc_pipe_heat_loss)
    _assert_params_only(calc_tank_heat_loss)
    _assert_params_only(evaluate_validated_heat_loss)


def test_application_applies_admin_safety_factor_when_user_k_absent() -> None:
    from app.services.calculation_service import pipe_params_with_effective_safety_factor

    params = PipeHeatLossParams.model_validate(_pipe(safety_factor=None))
    coefficients = _KeyReadDict(
        {
            "safety_factor": 1.4,
            "ground_conductivity": 2.9,
            "wind_factor": 9.0,
        }
    )

    result = calc_pipe_heat_loss(
        pipe_params_with_effective_safety_factor(params, coefficients)
    )

    assert result.safety_factor_applied == 1.4
    assert set(coefficients.read_keys) == {"safety_factor"}


def test_calc_heat_loss_and_admin_formula_check_import_the_same_evaluator() -> None:
    assert admin_api.evaluate_validated_heat_loss is evaluate_validated_heat_loss
    assert heat_loss_application_module.evaluate_validated_heat_loss is evaluate_validated_heat_loss


async def test_calc_heat_loss_and_admin_formula_check_call_evaluate_validated_heat_loss(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    dumped = {"formula_model": "pipe_heat_loss"}
    result = MagicMock()
    result.model_dump.return_value = dumped
    evaluator = MagicMock(return_value=result)
    monkeypatch.setattr(admin_api, "evaluate_validated_heat_loss", evaluator)
    monkeypatch.setattr(heat_loss_application_module, "evaluate_validated_heat_loss", evaluator)

    coefficients = {"safety_factor": 1.2}
    service = CalculationService(AsyncMock())
    service.get_coefficients = AsyncMock(return_value=coefficients)  # type: ignore[method-assign]
    service_result = await service.calc_heat_loss("pipe", _pipe())

    audit_service = MagicMock()
    audit_service.try_record = AsyncMock()
    monkeypatch.setattr(admin_api, "AuditService", MagicMock(return_value=audit_service))
    admin_result = await admin_api.formula_check(
        admin_api.FormulaCheckRequest(formula_type="pipe", params=_pipe()),
        principal=MagicMock(),
        db=MagicMock(),
    )

    assert service_result == dumped
    assert admin_result == dumped
    assert evaluator.call_count == 2
    service_call, admin_call = evaluator.call_args_list
    assert isinstance(service_call.args[0], PipeHeatLossParams)
    assert service_call.args[0].safety_factor == 1.1
    assert service_call.kwargs == {}
    assert isinstance(admin_call.args[0], PipeHeatLossParams)
    assert admin_call.kwargs == {}
    audit_service.try_record.assert_awaited_once()


def test_tank_facade_ignores_admin_coefficients() -> None:
    params = TankHeatLossParams.model_validate(_tank())

    result = calc_tank_heat_loss(params)

    assert result.safety_factor_applied == 1.1


def test_calculation_error_is_shared_without_importing_the_service() -> None:
    from app.services.calculation_errors import CalculationError as NeutralError
    from app.services.calculation_service import CalculationError as ServiceError

    assert NeutralError is ServiceError
    assert isinstance(
        heat_loss_application_module._calculation_error("boom"),
        NeutralError,
    )

    tree = ast.parse(
        Path(heat_loss_application_module.__file__).read_text(encoding="utf-8")
    )
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom) and node.module == "app.services.calculation_service":
            raise AssertionError("heat_loss_application imports calculation_service")
        if isinstance(node, ast.Import):
            for alias in node.names:
                if alias.name == "app.services.calculation_service" or alias.name.startswith(
                    "app.services.calculation_service."
                ):
                    raise AssertionError("heat_loss_application imports calculation_service")
