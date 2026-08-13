"""Prepared and legacy APIs must share one execution kernel per domain."""

from __future__ import annotations

from typing import Any, cast
from unittest.mock import MagicMock

import pytest
from heatcalc_heat_loss_core.conductivity import ConstantConductivity
from heatcalc_heat_loss_core.pipe_evaluation import (
    AirPipeEvaluationInput,
    PipeEvaluationInput,
    PipeEvaluationLayer,
    PreparedPipeCalculation,
    evaluate_pipe,
)
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
from heatcalc_heat_loss_core.tank import CylindricalTankGeometry, RectangularTankGeometry
from heatcalc_heat_loss_core.tank_evaluation import (
    BuriedTankFormulaEnvironment,
    PreparedTankCalculation,
    ResolvedAirTankEvaluationInput,
    ResolvedBuriedTankEvaluationInput,
    ResolvedTankLayer,
    evaluate_resolved_air_tank,
    evaluate_resolved_buried_tank,
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


def test_prepared_pipe_does_not_call_legacy_evaluate_pipe(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from heatcalc_heat_loss_core import pipe_evaluation

    evaluate_spy = MagicMock(wraps=pipe_evaluation.evaluate_pipe)
    kernel_spy = MagicMock(wraps=pipe_evaluation.execute_prepared_pipe)
    monkeypatch.setattr(pipe_evaluation, "evaluate_pipe", evaluate_spy)
    monkeypatch.setattr(pipe_evaluation, "execute_prepared_pipe", kernel_spy)

    outcome = evaluate_prepared_pipe(_require_prepared_pipe(_pipe_prep()))

    assert outcome.is_success
    kernel_spy.assert_called_once()
    evaluate_spy.assert_not_called()


def test_legacy_evaluate_pipe_enters_the_same_kernel(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from heatcalc_heat_loss_core import pipe_evaluation

    kernel_spy = MagicMock(wraps=pipe_evaluation.execute_prepared_pipe)
    monkeypatch.setattr(pipe_evaluation, "execute_prepared_pipe", kernel_spy)

    evaluate_pipe(
        PipeEvaluationInput(
            outer_diameter_m=0.108,
            wall_thickness_m=0.004,
            wall_conductivity_law=ConstantConductivity(45.0),
            insulation_layers=(
                PipeEvaluationLayer(0.05, ConstantConductivity(0.04), (-90.0, 600.0)),
            ),
            process_temperature_c=80.0,
            insulation_temperature_basis="outdoor_winter",
            pipe_length_m=50.0,
            local_elements_count=0,
            local_element_equiv_length_m=0.0,
            safety_factor_primary=1.2,
            safety_factor_override=None,
            environment=AirPipeEvaluationInput("outdoor", -20.0, 3.0),
        )
    )

    kernel_spy.assert_called_once()
    assert kernel_spy.call_args.args[0].safety_factor == pytest.approx(1.2)


def test_prepared_pipe_evaluates_tm_lambda_alpha_and_branch_once(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from heatcalc_heat_loss_core import pipe_evaluation

    implementation = cast(Any, pipe_evaluation)
    layers = (_pipe_layer(), _pipe_layer(thickness_m=0.03), _pipe_layer(thickness_m=0.02))
    tm = MagicMock(wraps=implementation.resolve_insulation_temperature)
    conductivity = MagicMock(wraps=implementation.evaluate_conductivity)
    alpha = MagicMock(wraps=implementation.resolve_external_alpha)
    aboveground = MagicMock(wraps=implementation.calculate_aboveground_pipe)
    underground = MagicMock(wraps=implementation.calculate_underground_pipe)
    monkeypatch.setattr(pipe_evaluation, "resolve_insulation_temperature", tm)
    monkeypatch.setattr(pipe_evaluation, "evaluate_conductivity", conductivity)
    monkeypatch.setattr(pipe_evaluation, "resolve_external_alpha", alpha)
    monkeypatch.setattr(pipe_evaluation, "calculate_aboveground_pipe", aboveground)
    monkeypatch.setattr(pipe_evaluation, "calculate_underground_pipe", underground)

    assert run_pipe_formula(_pipe_prep(layers=layers)).is_success

    tm.assert_called_once()
    alpha.assert_called_once()
    aboveground.assert_called_once()
    underground.assert_not_called()
    assert conductivity.call_count == 1 + len(layers)


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


@pytest.mark.parametrize(
    "changes",
    [
        {},
        {"placement": "indoor", "insulation_temperature_basis": "indoor", "wind_speed": None},
        {
            "placement": "underground",
            "insulation_temperature_basis": "channel",
            "ambient_temperature": None,
            "wind_speed": None,
            "ground_temperature": 5.0,
            "ground_conductivity": 1.5,
            "pipe_centerline_depth": 1.2,
        },
        {"layers": (_pipe_layer(), _pipe_layer(thickness_m=0.03), _pipe_layer(thickness_m=0.02))},
        {
            "layers": (
                _pipe_layer(
                    source="reference",
                    conductivity_supplied=False,
                    manual_temperature_range_c=None,
                    reference_temperature_interval_c=(-70.0, 200.0),
                ),
            )
        },
    ],
)
def test_prepared_pipe_matches_legacy_core_result(changes: dict[str, Any]) -> None:
    prep = _pipe_prep(**changes)
    outcome = run_pipe_formula(prep)
    prepared = _require_prepared_pipe(prep)
    assert outcome.is_success
    assert outcome.result is not None
    legacy = evaluate_pipe(
        PipeEvaluationInput(
            outer_diameter_m=prepared.outer_diameter_m,
            wall_thickness_m=prepared.wall_thickness_m,
            wall_conductivity_law=prepared.wall_conductivity_law,
            insulation_layers=tuple(
                PipeEvaluationLayer(
                    layer.thickness_m,
                    layer.conductivity_law,
                    layer.temperature_interval_c,
                )
                for layer in prepared.layers
            ),
            process_temperature_c=prepared.process_temperature_c,
            insulation_temperature_basis=prepared.insulation_temperature_basis,
            pipe_length_m=prepared.pipe_length_m,
            local_elements_count=prepared.local_elements_count,
            local_element_equiv_length_m=prepared.local_element_equiv_length_m,
            safety_factor_primary=prepared.safety_factor,
            safety_factor_override=None,
            environment=prepared.environment,
            profile=prepared.profile,
        )
    )
    assert outcome.result.core_result == legacy.core_result
    assert outcome.result.safety_factor == pytest.approx(legacy.safety_factor)
    assert outcome.result.insulation_temperature_c == pytest.approx(legacy.insulation_temperature_c)


def test_prepared_tank_does_not_call_legacy_resolved_evaluators(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from heatcalc_heat_loss_core import tank_evaluation

    air_spy = MagicMock(wraps=tank_evaluation.evaluate_resolved_air_tank)
    buried_spy = MagicMock(wraps=tank_evaluation.evaluate_resolved_buried_tank)
    kernel_spy = MagicMock(wraps=tank_evaluation.execute_prepared_tank)
    monkeypatch.setattr(tank_evaluation, "evaluate_resolved_air_tank", air_spy)
    monkeypatch.setattr(tank_evaluation, "evaluate_resolved_buried_tank", buried_spy)
    monkeypatch.setattr(tank_evaluation, "execute_prepared_tank", kernel_spy)

    outcome = evaluate_prepared_tank(_require_prepared_tank(_tank_prep()))

    assert outcome.is_success
    kernel_spy.assert_called_once()
    air_spy.assert_not_called()
    buried_spy.assert_not_called()


def test_legacy_tank_evaluators_enter_the_same_kernel(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from heatcalc_heat_loss_core import tank_evaluation

    kernel_spy = MagicMock(wraps=tank_evaluation.execute_prepared_tank)
    monkeypatch.setattr(tank_evaluation, "execute_prepared_tank", kernel_spy)

    evaluate_resolved_air_tank(
        ResolvedAirTankEvaluationInput(
            geometry=CylindricalTankGeometry(2.0, 3.0),
            wall_thickness_m=0.008,
            wall_conductivity_w_mk=50.0,
            insulation_layers=(ResolvedTankLayer(0.08, ConstantConductivity(0.04), -90.0, 600.0),),
            process_temperature_c=70.0,
            ambient_temperature_c=-30.0,
            placement="outdoor",
            wind_speed_m_s=3.0,
            insulation_temperature_basis="outdoor_winter",
            safety_factor=1.1,
            additional_heat_loss_w=0.0,
        )
    )
    evaluate_resolved_buried_tank(
        ResolvedBuriedTankEvaluationInput(
            geometry=CylindricalTankGeometry(2.0, 3.0),
            wall_thickness_m=0.008,
            wall_conductivity_w_mk=50.0,
            insulation_layers=(ResolvedTankLayer(0.08, ConstantConductivity(0.04), -90.0, 600.0),),
            process_temperature_c=70.0,
            ambient_temperature_c=-30.0,
            ground_temperature_c=5.0,
            buried_height_m=1.0,
            ground_conductivity_w_mk=1.5,
            placement="underground",
            wind_speed_m_s=3.0,
            insulation_temperature_basis="channel",
            safety_factor=1.1,
            additional_heat_loss_w=0.0,
        )
    )

    assert kernel_spy.call_count == 2


def test_prepared_tank_evaluates_tm_lambda_alpha_and_one_branch(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from heatcalc_heat_loss_core import tank_evaluation

    implementation = cast(Any, tank_evaluation)
    layers = (_tank_layer(), _tank_layer(thickness_m=0.04), _tank_layer(thickness_m=0.03))
    tm = MagicMock(wraps=implementation.resolve_insulation_temperature)
    conductivity = MagicMock(wraps=implementation.evaluate_conductivity)
    alpha = MagicMock(wraps=implementation.resolve_external_alpha)
    air = MagicMock(wraps=implementation.calculate_air_tank_heat_loss)
    buried = MagicMock(wraps=implementation.calculate_buried_tank_heat_loss)
    monkeypatch.setattr(tank_evaluation, "resolve_insulation_temperature", tm)
    monkeypatch.setattr(tank_evaluation, "evaluate_conductivity", conductivity)
    monkeypatch.setattr(tank_evaluation, "resolve_external_alpha", alpha)
    monkeypatch.setattr(tank_evaluation, "calculate_air_tank_heat_loss", air)
    monkeypatch.setattr(tank_evaluation, "calculate_buried_tank_heat_loss", buried)

    assert run_tank_formula(_tank_prep(layers=layers)).is_success

    tm.assert_called_once()
    alpha.assert_called_once()
    air.assert_called_once()
    buried.assert_not_called()
    assert conductivity.call_count == len(layers)


@pytest.mark.parametrize(
    ("prep_changes", "legacy_kind"),
    [
        ({}, "air"),
        (
            {
                "placement": "indoor",
                "insulation_temperature_basis": "indoor",
                "wind_speed": None,
            },
            "air",
        ),
        (
            {
                "placement": "underground",
                "insulation_temperature_basis": "channel",
                "ground_temperature": 5.0,
                "tank_buried_height": 1.0,
                "ground_conductivity": 1.5,
            },
            "buried",
        ),
        (
            {
                "shape": "rectangular",
                "diameter": None,
                "length": 4.0,
                "width": 2.5,
            },
            "air",
        ),
        (
            {"layers": (_tank_layer(), _tank_layer(thickness_m=0.04), _tank_layer(thickness_m=0.03))},
            "air",
        ),
    ],
)
def test_prepared_tank_matches_legacy_core_result(
    prep_changes: dict[str, Any],
    legacy_kind: str,
) -> None:
    prep = _tank_prep(**prep_changes)
    outcome = run_tank_formula(prep)
    prepared = _require_prepared_tank(prep)
    assert outcome.is_success
    assert outcome.result is not None
    resolved_layers = tuple(
        ResolvedTankLayer(
            layer.thickness_m,
            layer.conductivity_law,
            layer.temperature_min_c,
            layer.temperature_max_c,
        )
        for layer in prepared.layers
    )
    if legacy_kind == "buried":
        assert isinstance(prepared.environment, BuriedTankFormulaEnvironment)
        environment = prepared.environment
        legacy = evaluate_resolved_buried_tank(
            ResolvedBuriedTankEvaluationInput(
                geometry=prepared.geometry,
                wall_thickness_m=prepared.wall_thickness_m,
                wall_conductivity_w_mk=prepared.wall_conductivity_w_mk,
                insulation_layers=resolved_layers,
                process_temperature_c=prepared.process_temperature_c,
                ambient_temperature_c=environment.ambient_temperature_c,
                ground_temperature_c=environment.ground_temperature_c,
                buried_height_m=environment.buried_height_m,
                ground_conductivity_w_mk=environment.ground_conductivity_w_mk,
                placement="underground",
                wind_speed_m_s=environment.wind_speed_m_s,
                insulation_temperature_basis=prepared.insulation_temperature_basis,
                safety_factor=prepared.safety_factor,
                additional_heat_loss_w=prepared.additional_heat_loss_w,
                profile=prepared.profile,
            )
        )
    else:
        air_environment = prepared.environment
        legacy = evaluate_resolved_air_tank(
            ResolvedAirTankEvaluationInput(
                geometry=prepared.geometry,
                wall_thickness_m=prepared.wall_thickness_m,
                wall_conductivity_w_mk=prepared.wall_conductivity_w_mk,
                insulation_layers=resolved_layers,
                process_temperature_c=prepared.process_temperature_c,
                ambient_temperature_c=air_environment.ambient_temperature_c,
                placement=air_environment.placement,
                wind_speed_m_s=air_environment.wind_speed_m_s,
                insulation_temperature_basis=prepared.insulation_temperature_basis,
                safety_factor=prepared.safety_factor,
                additional_heat_loss_w=prepared.additional_heat_loss_w,
                profile=prepared.profile,
            )
        )
    assert outcome.result.core_result == legacy.core_result
    assert isinstance(prepared.geometry, CylindricalTankGeometry | RectangularTankGeometry)
