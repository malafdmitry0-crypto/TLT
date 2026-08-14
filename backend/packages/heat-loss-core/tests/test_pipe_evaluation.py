"""Tests for the internal prepared pipe execution kernel."""

from __future__ import annotations

import math
from typing import Any, cast
from unittest.mock import MagicMock

import pytest
from heatcalc_heat_loss_core.conductivity import (
    AffineConductivity,
    ConstantConductivity,
    PiecewiseConductivity,
    UnavailableConductivity,
)
from heatcalc_heat_loss_core.errors import FormulaDomainError
from heatcalc_heat_loss_core.pipe import (
    AbovegroundPipeInput,
    PipeInsulationLayer,
    calculate_aboveground_pipe,
    calculate_underground_pipe,
)
from heatcalc_heat_loss_core.pipe_evaluation import (
    AirPipeEvaluationInput,
    PreparedPipeCalculation,
    PreparedPipeLayer,
    UndergroundPipeEvaluationInput,
    execute_prepared_pipe,
)


def mineral_wool_boards_120_law() -> PiecewiseConductivity:
    return PiecewiseConductivity(
        threshold_c=20.0,
        at_or_above=AffineConductivity(0.045, 0.00021),
        below=PiecewiseConductivity(
            threshold_c=-60.0,
            at_or_above=ConstantConductivity(0.044),
            below=ConstantConductivity(0.035),
        ),
    )


def _reference_layer() -> PreparedPipeLayer:
    return PreparedPipeLayer(
        0.05,
        "reference",
        mineral_wool_boards_120_law(),
        (-60.0, 400.0),
    )


def _input(**changes: object) -> PreparedPipeCalculation:
    values: dict[str, object] = {
        "outer_diameter_m": 0.108,
        "wall_thickness_m": 0.004,
        "wall_conductivity_law": ConstantConductivity(45.0),
        "layers": (PreparedPipeLayer(0.05, "manual", ConstantConductivity(0.04), (-70.0, 200.0)),),
        "process_temperature_c": 80.0,
        "insulation_temperature_basis": "outdoor_winter",
        "pipe_length_m": 50.0,
        "local_elements_count": 2,
        "local_element_equiv_length_m": 1.5,
        "safety_factor": 1.2,
        "environment": AirPipeEvaluationInput("outdoor", -20.0, 3.0),
    }
    values.update(changes)
    return PreparedPipeCalculation(**values)  # type: ignore[arg-type]


def test_outdoor_result_matches_exact_direct_low_level_calculation() -> None:
    result = execute_prepared_pipe(_input())
    direct = calculate_aboveground_pipe(
        AbovegroundPipeInput(
            outer_diameter_m=0.108,
            wall_thickness_m=0.004,
            wall_conductivity_w_mk=45.0,
            insulation_layers=(PipeInsulationLayer(0.05, 0.04),),
            process_temperature_c=80.0,
            ambient_temperature_c=-20.0,
            pipe_length_m=50.0,
            local_elements_count=2,
            local_element_equiv_length_m=1.5,
            safety_factor=1.2,
            external_alpha_w_m2k=11.6 + 7.0 * math.sqrt(3.0),
        )
    )

    assert result.core_result == direct
    assert result.external_alpha_w_m2k == 11.6 + 7.0 * math.sqrt(3.0)
    assert result.insulation_temperature_c == 40.0
    assert result.safety_factor == 1.2
    assert result.layer_temperature_report.is_valid
    assert result.formula_model == "pipe_heat_loss"
    assert result.formula_model_version == "2"
    assert result.source_corrections[-1] == "outdoor_auto_alpha_requires_explicit_wind_speed"


def test_indoor_uses_constant_alpha_without_wind() -> None:
    result = execute_prepared_pipe(
        _input(environment=AirPipeEvaluationInput("indoor", -20.0, None))
    )

    assert result.external_alpha_w_m2k == 9.0
    assert result.source_corrections == ("base_and_design_heat_losses_reported_separately",)


def test_underground_uses_ground_profile_and_warm_tm() -> None:
    result = execute_prepared_pipe(
        _input(
            environment=UndergroundPipeEvaluationInput(5.0, 1.2, 1.5),
            insulation_temperature_basis="channel",
            local_elements_count=0,
            local_element_equiv_length_m=0.0,
        )
    )

    assert result.external_alpha_w_m2k is None
    assert result.ground_conductivity_w_mk == 1.5
    assert result.insulation_temperature_c == 60.0
    assert result.model_assumptions[-1] == "direct_buried_pipe_in_homogeneous_ground"


def test_affine_laws_use_wall_mean_and_resolved_tm() -> None:
    result = execute_prepared_pipe(
        _input(
            wall_conductivity_law=AffineConductivity(10.0, 1.0),
            layers=(
                PreparedPipeLayer(
                    0.05,
                    "manual",
                    AffineConductivity(0.01, 0.001),
                    (-70.0, 200.0),
                ),
            ),
        )
    )

    assert result.wall_conductivity_w_mk == 40.0
    assert result.layer_results[0].conductivity_w_mk == pytest.approx(0.05)


def test_layer_temperature_report_collects_all_issues_in_layer_order() -> None:
    result = execute_prepared_pipe(
        _input(
            layers=(
                PreparedPipeLayer(0.05, "manual", ConstantConductivity(0.04), (-10.0, 10.0)),
                PreparedPipeLayer(0.04, "manual", ConstantConductivity(0.04), (-10.0, 10.0)),
            )
        )
    )

    assert [(issue.code, issue.path) for issue in result.layer_temperature_report.issues] == [
        ("temperature_outside_interval", ("insulation_layers", 0)),
        ("temperature_outside_interval", ("insulation_layers", 1)),
    ]
    assert all(
        "temperature_c" in issue.details_dict() for issue in result.layer_temperature_report.issues
    )


def test_layer_temperature_report_rejects_cold_boundary_below_material_minimum() -> None:
    result = execute_prepared_pipe(
        _input(
            layers=(
                PreparedPipeLayer(
                    0.05,
                    "manual",
                    ConstantConductivity(0.04),
                    (-10.0, 200.0),
                ),
            )
        )
    )

    assert len(result.layer_temperature_report.issues) == 1
    issue = result.layer_temperature_report.issues[0]
    assert (issue.code, issue.path) == (
        "temperature_outside_interval",
        ("insulation_layers", 0),
    )
    assert issue.details_dict()["temperature_c"] < -10.0


def test_evaluation_calls_each_law_and_low_level_branch_once(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from heatcalc_heat_loss_core import pipe_evaluation

    implementation = cast(Any, pipe_evaluation)
    wall_conductivity_spy = MagicMock(wraps=implementation.evaluate_conductivity)
    layer_conductivity_spy = MagicMock(wraps=implementation.evaluate_insulation_conductivity)
    calculate_spy = MagicMock(wraps=implementation.calculate_aboveground_pipe)
    underground_spy = MagicMock(wraps=implementation.calculate_underground_pipe)
    monkeypatch.setattr(pipe_evaluation, "evaluate_conductivity", wall_conductivity_spy)
    monkeypatch.setattr(pipe_evaluation, "evaluate_insulation_conductivity", layer_conductivity_spy)
    monkeypatch.setattr(pipe_evaluation, "calculate_aboveground_pipe", calculate_spy)
    monkeypatch.setattr(pipe_evaluation, "calculate_underground_pipe", underground_spy)

    execute_prepared_pipe(_input(layers=(_reference_layer(),)))

    assert wall_conductivity_spy.call_count == 1
    assert layer_conductivity_spy.call_count == 1
    calculate_spy.assert_called_once()
    underground_spy.assert_not_called()


def test_underground_execution_calls_only_underground_branch(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from heatcalc_heat_loss_core import pipe_evaluation

    aboveground_spy = MagicMock(wraps=calculate_aboveground_pipe)
    underground_spy = MagicMock(wraps=calculate_underground_pipe)
    monkeypatch.setattr(pipe_evaluation, "calculate_aboveground_pipe", aboveground_spy)
    monkeypatch.setattr(pipe_evaluation, "calculate_underground_pipe", underground_spy)

    execute_prepared_pipe(
        _input(
            environment=UndergroundPipeEvaluationInput(5.0, 1.2, 1.5),
            insulation_temperature_basis="channel",
        )
    )

    aboveground_spy.assert_not_called()
    underground_spy.assert_called_once()


@pytest.mark.parametrize("value", [math.nan, math.inf, -math.inf])
def test_nonfinite_law_result_is_rejected(value: float) -> None:
    with pytest.raises(FormulaDomainError, match="non_finite_result"):
        execute_prepared_pipe(_input(wall_conductivity_law=ConstantConductivity(value)))


def test_unavailable_layer_law_reports_layer_and_temperature() -> None:
    with pytest.raises(FormulaDomainError, match="conductivity_law_unavailable") as exc_info:
        execute_prepared_pipe(
            _input(
                layers=(
                    PreparedPipeLayer(0.05, "manual", UnavailableConductivity(), (-70.0, 200.0)),
                )
            )
        )

    assert exc_info.value.details == {"layer_index": 0, "temperature_c": 40.0}


@pytest.mark.parametrize(
    (
        "process_temperature_c",
        "basis",
        "ambient_temperature_c",
        "expected_tm",
        "expected_lambda",
    ),
    [
        (80.0, "outdoor_winter", -20.0, 40.0, 0.0534),
        (30.0, "outdoor_winter", -20.0, 15.0, 0.04815),
        (10.0, "indoor", -20.0, 25.0, 0.044),
        (20.0, "outdoor_winter", -20.0, 10.0, 0.0471),
        (19.0, "outdoor_winter", -20.0, 9.5, 0.044),
        (-60.0, "outdoor_winter", -70.0, -30.0, 0.044),
    ],
)
def test_prepared_pipe_uses_process_temperature_to_select_reference_branch(
    process_temperature_c: float,
    basis: str,
    ambient_temperature_c: float,
    expected_tm: float,
    expected_lambda: float,
) -> None:
    result = execute_prepared_pipe(
        _input(
            layers=(_reference_layer(),),
            process_temperature_c=process_temperature_c,
            insulation_temperature_basis=basis,
            environment=AirPipeEvaluationInput(
                "indoor" if basis == "indoor" else "outdoor",
                ambient_temperature_c,
                None if basis == "indoor" else 3.0,
            ),
        )
    )

    assert result.insulation_temperature_c == pytest.approx(expected_tm)
    assert result.layer_results[0].conductivity_w_mk == pytest.approx(expected_lambda)


def test_prepared_pipe_keeps_manual_constant_conductivity() -> None:
    result = execute_prepared_pipe(
        _input(
            layers=(PreparedPipeLayer(0.05, "manual", ConstantConductivity(0.04), (-90.0, 600.0)),),
            process_temperature_c=30.0,
        )
    )

    assert result.insulation_temperature_c == pytest.approx(15.0)
    assert result.layer_results[0].conductivity_w_mk == 0.04


def test_prepared_pipe_keeps_manual_piecewise_tm_semantics() -> None:
    result = execute_prepared_pipe(
        _input(
            layers=(
                PreparedPipeLayer(
                    0.05,
                    "manual",
                    PiecewiseConductivity(
                        threshold_c=20.0,
                        at_or_above=ConstantConductivity(0.05),
                        below=ConstantConductivity(0.04),
                    ),
                    (-90.0, 600.0),
                ),
            ),
            process_temperature_c=30.0,
        )
    )

    assert result.insulation_temperature_c == pytest.approx(15.0)
    assert result.layer_results[0].conductivity_w_mk == 0.04
