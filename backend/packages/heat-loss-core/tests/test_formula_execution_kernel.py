"""The canonical APIs execute exactly one kernel per domain."""

from __future__ import annotations

from typing import Any, cast
from unittest.mock import MagicMock

import pytest
from heatcalc_heat_loss_core.conductivity import ConstantConductivity
from heatcalc_heat_loss_core.pipe_evaluation import PreparedPipeCalculation
from heatcalc_heat_loss_core.pipe_formula import (
    PipePreparationInput,
    PipePreparationLayer,
    evaluate_prepared_pipe,
    prepare_pipe_calculation,
    run_pipe_formula,
)
from heatcalc_heat_loss_core.pipe_formula import (
    PreparedPipeCalculation as FormulaPreparedPipe,
)
from heatcalc_heat_loss_core.tank_evaluation import (
    PreparedTankCalculation,
)
from heatcalc_heat_loss_core.tank_formula import (
    PreparedTankCalculation as FormulaPreparedTank,
)
from heatcalc_heat_loss_core.tank_formula import (
    TankPreparationInput,
    TankPreparationLayer,
    evaluate_prepared_tank,
    prepare_tank_calculation,
    run_tank_formula,
)
from heatcalc_heat_loss_core.validation import FormulaValidationReport


def _pipe_layer(**changes: object) -> PipePreparationLayer:
    values: dict[str, object] = {
        "thickness_m": 0.05,
        "source": "manual",
        "conductivity_supplied": True,
        "manual_temperature_range_c": (-90.0, 600.0),
        "reference_temperature_interval_c": None,
        "conductivity_law": ConstantConductivity(0.04),
    }
    values.update(changes)
    return PipePreparationLayer(**values)  # type: ignore[arg-type]


def _pipe_prep(**changes: object) -> PipePreparationInput:
    values: dict[str, object] = {
        "outer_diameter": 0.108,
        "wall_thickness": 0.004,
        "pipe_lambda": 45.0,
        "has_pipe_material": False,
        "layers": (_pipe_layer(),),
        "ambient_temperature": -20.0,
        "process_temperature": 80.0,
        "pipe_length": 50.0,
        "pipe_centerline_depth": None,
        "num_local_elements": 0,
        "local_element_equiv_length": None,
        "wind_speed": 3.0,
        "ground_conductivity": None,
        "ground_temperature": None,
        "safety_factor": 1.2,
        "placement": "outdoor",
        "insulation_temperature_basis": "outdoor_winter",
        "wall_conductivity_law": ConstantConductivity(45.0),
    }
    values.update(changes)
    return PipePreparationInput(**values)  # type: ignore[arg-type]


def _tank_layer(**changes: object) -> TankPreparationLayer:
    values: dict[str, object] = {
        "thickness_m": 0.08,
        "source": "manual",
        "conductivity_supplied": True,
        "manual_temperature_range_c": (-90.0, 600.0),
        "reference_temperature_range_c": None,
        "conductivity_law": ConstantConductivity(0.04),
    }
    values.update(changes)
    return TankPreparationLayer(**values)  # type: ignore[arg-type]


def _tank_prep(**changes: object) -> TankPreparationInput:
    values: dict[str, object] = {
        "shape": "cylindrical",
        "placement": "outdoor",
        "insulation_temperature_basis": "outdoor_winter",
        "diameter": 2.0,
        "height": 3.0,
        "length": None,
        "width": None,
        "layers": (_tank_layer(),),
        "ambient_temperature": -30.0,
        "ground_temperature": None,
        "process_temperature": 70.0,
        "wall_thickness": 0.008,
        "wall_lambda": 50.0,
        "tank_buried_height": None,
        "ground_conductivity": None,
        "wind_speed": 3.0,
        "safety_factor": 1.1,
        "q_additional": 0.0,
        "wall_conductivity_law": ConstantConductivity(50.0),
    }
    values.update(changes)
    return TankPreparationInput(**values)  # type: ignore[arg-type]


def _require_prepared_pipe(data: PipePreparationInput) -> PreparedPipeCalculation:
    prepared = prepare_pipe_calculation(data)
    assert not isinstance(prepared, FormulaValidationReport)
    return prepared


def _require_prepared_tank(data: TankPreparationInput) -> PreparedTankCalculation:
    prepared = prepare_tank_calculation(data)
    assert not isinstance(prepared, FormulaValidationReport)
    return prepared


def test_prepared_types_are_reexported_by_identity() -> None:
    assert FormulaPreparedPipe is PreparedPipeCalculation
    assert FormulaPreparedTank is PreparedTankCalculation


def test_prepared_pipe_calls_one_kernel(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from heatcalc_heat_loss_core import pipe_evaluation

    kernel_spy = MagicMock(wraps=pipe_evaluation.execute_prepared_pipe)
    monkeypatch.setattr(pipe_evaluation, "execute_prepared_pipe", kernel_spy)

    outcome = evaluate_prepared_pipe(_require_prepared_pipe(_pipe_prep()))

    assert outcome.is_success
    kernel_spy.assert_called_once()


def test_prepared_pipe_evaluates_tm_lambda_alpha_and_branch_once(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from heatcalc_heat_loss_core import pipe_evaluation

    implementation = cast(Any, pipe_evaluation)
    layers = (_pipe_layer(), _pipe_layer(thickness_m=0.03), _pipe_layer(thickness_m=0.02))
    tm = MagicMock(wraps=implementation.resolve_insulation_temperature)
    shared_temperature_conductivity = MagicMock(wraps=implementation.evaluate_conductivity)
    reference_conductivity = MagicMock(wraps=implementation.evaluate_insulation_conductivity)
    alpha = MagicMock(wraps=implementation.resolve_external_alpha)
    aboveground = MagicMock(wraps=implementation.calculate_aboveground_pipe)
    underground = MagicMock(wraps=implementation.calculate_underground_pipe)
    monkeypatch.setattr(pipe_evaluation, "resolve_insulation_temperature", tm)
    monkeypatch.setattr(
        pipe_evaluation,
        "evaluate_conductivity",
        shared_temperature_conductivity,
    )
    monkeypatch.setattr(
        pipe_evaluation,
        "evaluate_insulation_conductivity",
        reference_conductivity,
    )
    monkeypatch.setattr(pipe_evaluation, "resolve_external_alpha", alpha)
    monkeypatch.setattr(pipe_evaluation, "calculate_aboveground_pipe", aboveground)
    monkeypatch.setattr(pipe_evaluation, "calculate_underground_pipe", underground)

    assert run_pipe_formula(_pipe_prep(layers=layers)).is_success

    tm.assert_called_once()
    alpha.assert_called_once()
    aboveground.assert_called_once()
    underground.assert_not_called()
    assert shared_temperature_conductivity.call_count == 1 + len(layers)
    reference_conductivity.assert_not_called()


def test_underground_prepared_pipe_skips_alpha_and_uses_one_buried_branch(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from heatcalc_heat_loss_core import pipe_evaluation

    implementation = cast(Any, pipe_evaluation)
    alpha = MagicMock(wraps=implementation.resolve_external_alpha)
    aboveground = MagicMock(wraps=implementation.calculate_aboveground_pipe)
    underground = MagicMock(wraps=implementation.calculate_underground_pipe)
    monkeypatch.setattr(pipe_evaluation, "resolve_external_alpha", alpha)
    monkeypatch.setattr(pipe_evaluation, "calculate_aboveground_pipe", aboveground)
    monkeypatch.setattr(pipe_evaluation, "calculate_underground_pipe", underground)

    outcome = run_pipe_formula(
        _pipe_prep(
            placement="underground",
            insulation_temperature_basis="channel",
            ambient_temperature=None,
            wind_speed=None,
            ground_temperature=5.0,
            ground_conductivity=1.5,
            pipe_centerline_depth=1.2,
        )
    )

    assert outcome.is_success
    alpha.assert_not_called()
    aboveground.assert_not_called()
    underground.assert_called_once()


def test_prepared_tank_calls_one_kernel(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from heatcalc_heat_loss_core import tank_evaluation

    kernel_spy = MagicMock(wraps=tank_evaluation.execute_prepared_tank)
    monkeypatch.setattr(tank_evaluation, "execute_prepared_tank", kernel_spy)

    outcome = evaluate_prepared_tank(_require_prepared_tank(_tank_prep()))

    assert outcome.is_success
    kernel_spy.assert_called_once()


def test_prepared_tank_evaluates_tm_lambda_alpha_and_one_branch(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from heatcalc_heat_loss_core import tank_evaluation

    implementation = cast(Any, tank_evaluation)
    layers = (_tank_layer(), _tank_layer(thickness_m=0.04), _tank_layer(thickness_m=0.03))
    tm = MagicMock(wraps=implementation.resolve_insulation_temperature)
    manual_conductivity = MagicMock(wraps=implementation.evaluate_conductivity)
    reference_conductivity = MagicMock(wraps=implementation.evaluate_insulation_conductivity)
    alpha = MagicMock(wraps=implementation.resolve_external_alpha)
    air = MagicMock(wraps=implementation.calculate_air_tank_heat_loss)
    buried = MagicMock(wraps=implementation.calculate_buried_tank_heat_loss)
    monkeypatch.setattr(tank_evaluation, "resolve_insulation_temperature", tm)
    monkeypatch.setattr(tank_evaluation, "evaluate_conductivity", manual_conductivity)
    monkeypatch.setattr(
        tank_evaluation,
        "evaluate_insulation_conductivity",
        reference_conductivity,
    )
    monkeypatch.setattr(tank_evaluation, "resolve_external_alpha", alpha)
    monkeypatch.setattr(tank_evaluation, "calculate_air_tank_heat_loss", air)
    monkeypatch.setattr(tank_evaluation, "calculate_buried_tank_heat_loss", buried)

    assert run_tank_formula(_tank_prep(layers=layers)).is_success

    tm.assert_called_once()
    alpha.assert_called_once()
    air.assert_called_once()
    buried.assert_not_called()
    assert manual_conductivity.call_count == len(layers)
    reference_conductivity.assert_not_called()
