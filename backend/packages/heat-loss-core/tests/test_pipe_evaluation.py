"""Tests for high-level resolved pipe evaluation."""

from __future__ import annotations

import math
from typing import Any, cast
from unittest.mock import MagicMock

import pytest
from heatcalc_heat_loss_core.conductivity import (
    AffineConductivity,
    ConstantConductivity,
    UnavailableConductivity,
)
from heatcalc_heat_loss_core.errors import FormulaDomainError
from heatcalc_heat_loss_core.pipe import (
    AbovegroundPipeInput,
    PipeInsulationLayer,
    calculate_aboveground_pipe,
)
from heatcalc_heat_loss_core.pipe_evaluation import (
    AirPipeEvaluationInput,
    PipeEvaluationInput,
    PipeEvaluationLayer,
    UndergroundPipeEvaluationInput,
    evaluate_pipe,
)


def _input(**changes: object) -> PipeEvaluationInput:
    values: dict[str, object] = {
        "outer_diameter_m": 0.108,
        "wall_thickness_m": 0.004,
        "wall_conductivity_law": ConstantConductivity(45.0),
        "insulation_layers": (
            PipeEvaluationLayer(0.05, ConstantConductivity(0.04), (-70.0, 200.0)),
        ),
        "process_temperature_c": 80.0,
        "insulation_temperature_basis": "outdoor_winter",
        "pipe_length_m": 50.0,
        "local_elements_count": 2,
        "local_element_equiv_length_m": 1.5,
        "safety_factor_primary": 1.2,
        "safety_factor_override": 1.1,
        "environment": AirPipeEvaluationInput("outdoor", -20.0, 3.0),
    }
    values.update(changes)
    return PipeEvaluationInput(**values)  # type: ignore[arg-type]


def test_outdoor_result_matches_exact_direct_low_level_calculation() -> None:
    result = evaluate_pipe(_input())
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
    result = evaluate_pipe(_input(environment=AirPipeEvaluationInput("indoor", -20.0, None)))

    assert result.external_alpha_w_m2k == 9.0
    assert result.source_corrections == ("base_and_design_heat_losses_reported_separately",)


def test_underground_uses_ground_profile_and_warm_tm() -> None:
    result = evaluate_pipe(
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
    result = evaluate_pipe(
        _input(
            wall_conductivity_law=AffineConductivity(10.0, 1.0),
            insulation_layers=(
                PipeEvaluationLayer(0.05, AffineConductivity(0.01, 0.001), (-70.0, 200.0)),
            ),
        )
    )

    assert result.wall_conductivity_w_mk == 40.0
    assert result.layer_results[0].conductivity_w_mk == pytest.approx(0.05)


def test_safety_factor_primary_then_override_precedence() -> None:
    assert (
        evaluate_pipe(_input(safety_factor_primary=1.3, safety_factor_override=1.4)).safety_factor
        == 1.3
    )
    assert (
        evaluate_pipe(_input(safety_factor_primary=0.0, safety_factor_override=1.4)).safety_factor
        == 1.4
    )


def test_layer_temperature_report_collects_all_issues_in_layer_order() -> None:
    result = evaluate_pipe(
        _input(
            insulation_layers=(
                PipeEvaluationLayer(0.05, ConstantConductivity(0.04), (-10.0, 10.0)),
                PipeEvaluationLayer(0.04, ConstantConductivity(0.04), (-10.0, 10.0)),
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


def test_evaluation_calls_each_law_and_low_level_branch_once(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from heatcalc_heat_loss_core import pipe_evaluation

    implementation = cast(Any, pipe_evaluation)
    conductivity_spy = MagicMock(wraps=implementation.evaluate_conductivity)
    calculate_spy = MagicMock(wraps=implementation.calculate_aboveground_pipe)
    monkeypatch.setattr(pipe_evaluation, "evaluate_conductivity", conductivity_spy)
    monkeypatch.setattr(pipe_evaluation, "calculate_aboveground_pipe", calculate_spy)

    evaluate_pipe(_input())

    assert conductivity_spy.call_count == 2
    calculate_spy.assert_called_once()


@pytest.mark.parametrize("value", [math.nan, math.inf, -math.inf])
def test_nonfinite_law_result_is_rejected(value: float) -> None:
    with pytest.raises(FormulaDomainError, match="non_finite_result"):
        evaluate_pipe(_input(wall_conductivity_law=ConstantConductivity(value)))


def test_unavailable_layer_law_reports_layer_and_temperature() -> None:
    with pytest.raises(FormulaDomainError, match="conductivity_law_unavailable") as exc_info:
        evaluate_pipe(
            _input(
                insulation_layers=(
                    PipeEvaluationLayer(0.05, UnavailableConductivity(), (-70.0, 200.0)),
                )
            )
        )

    assert exc_info.value.details == {"layer_index": 0, "temperature_c": 40.0}
