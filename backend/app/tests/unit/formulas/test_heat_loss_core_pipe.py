"""Focused unit tests for the pure numeric pipe heat-loss core."""

import math
from unittest.mock import MagicMock

import pytest

from app.formulas.heat_loss.core import pipe as pipe_core
from app.formulas.heat_loss.core.errors import FormulaDomainError
from app.formulas.heat_loss.core.pipe import (
    AbovegroundPipeInput,
    PipeInsulationLayer,
    UndergroundPipeInput,
    calculate_aboveground_pipe,
    calculate_underground_pipe,
)
from app.formulas.heat_loss.core.thermal import alpha_from_wind


def _layers() -> tuple[PipeInsulationLayer, ...]:
    return (PipeInsulationLayer(thickness_m=0.05, conductivity_w_mk=0.0534),)


def _air_input(**overrides: float | int | tuple[PipeInsulationLayer, ...]) -> AbovegroundPipeInput:
    values: dict[str, float | int | tuple[PipeInsulationLayer, ...]] = {
        "outer_diameter_m": 0.1,
        "wall_thickness_m": 0.004,
        "wall_conductivity_w_mk": 53.0,
        "insulation_layers": _layers(),
        "process_temperature_c": 80.0,
        "ambient_temperature_c": -20.0,
        "pipe_length_m": 10.0,
        "local_elements_count": 2,
        "local_element_equiv_length_m": 0.5,
        "safety_factor": 1.2,
        "external_alpha_w_m2k": 25.6,
    }
    values.update(overrides)
    return AbovegroundPipeInput(**values)  # type: ignore[arg-type]


def test_aboveground_pipe_matches_cylindrical_hand_calculation() -> None:
    result = calculate_aboveground_pipe(_air_input())

    r_wall = math.log(0.05 / 0.046) / (2 * math.pi * 53.0)
    r_ins = math.log(0.10 / 0.05) / (2 * math.pi * 0.0534)
    r_external = 1.0 / (2 * math.pi * 0.10 * 25.6)
    expected_q = 100.0 / (r_wall + r_ins + r_external)

    assert result.wall_resistance_mk_w == pytest.approx(r_wall)
    assert result.insulation_resistance_mk_w == pytest.approx(r_ins)
    assert result.external_resistance_mk_w == pytest.approx(r_external)
    assert result.heat_loss_per_meter_base_w_m == pytest.approx(expected_q)
    assert result.effective_length_m == pytest.approx(11.0)
    assert result.total_heat_loss_base_w == pytest.approx(expected_q * 11.0)
    assert result.total_heat_loss_design_w == pytest.approx(expected_q * 11.0 * 1.2)


def test_core_returns_each_layer_boundary_temperature() -> None:
    layers = (
        PipeInsulationLayer(thickness_m=0.02, conductivity_w_mk=0.04),
        PipeInsulationLayer(thickness_m=0.03, conductivity_w_mk=0.05),
    )
    result = calculate_aboveground_pipe(_air_input(insulation_layers=layers))

    assert len(result.layer_resistances_mk_w) == 2
    assert len(result.layer_boundary_temperatures) == 2
    assert result.layer_boundary_temperatures[0].cold_side_c == pytest.approx(
        result.layer_boundary_temperatures[1].hot_side_c
    )


def test_underground_pipe_preserves_log_sqrt_ground_resistance() -> None:
    result = calculate_underground_pipe(
        UndergroundPipeInput(
            outer_diameter_m=0.1,
            wall_thickness_m=0.004,
            wall_conductivity_w_mk=45.0,
            insulation_layers=(PipeInsulationLayer(thickness_m=0.05, conductivity_w_mk=0.05),),
            process_temperature_c=80.0,
            ground_temperature_c=5.0,
            pipe_length_m=10.0,
            local_elements_count=0,
            local_element_equiv_length_m=0.0,
            safety_factor=1.1,
            centerline_depth_m=1.0,
            ground_conductivity_w_mk=1.5,
        )
    )

    x = 1.0 / 0.10
    expected_ground = math.log(x + math.sqrt(x * x - 1)) / (2 * math.pi * 1.5)
    assert result.external_resistance_mk_w == pytest.approx(expected_ground)


def test_input_guards_are_dormant_on_the_core_calculation_path(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    guard_names = (
        "_validate_pipe_input",
        "_validate_ground_input",
        "_validate_insulation_outer_radius_input",
        "_validate_external_resistance_input",
        "_validate_cylindrical_resistance_input",
        "_validate_thermal_resistance_input",
    )
    for name in guard_names:
        monkeypatch.setattr(
            pipe_core,
            name,
            MagicMock(side_effect=AssertionError(f"production called dormant guard {name}")),
        )

    assert calculate_aboveground_pipe(_air_input()).total_heat_loss_design_w > 0
    underground = UndergroundPipeInput(
        outer_diameter_m=0.1,
        wall_thickness_m=0.004,
        wall_conductivity_w_mk=45.0,
        insulation_layers=(PipeInsulationLayer(thickness_m=0.05, conductivity_w_mk=0.05),),
        process_temperature_c=80.0,
        ground_temperature_c=5.0,
        pipe_length_m=10.0,
        local_elements_count=0,
        local_element_equiv_length_m=0.0,
        safety_factor=1.1,
        centerline_depth_m=1.0,
        ground_conductivity_w_mk=1.5,
    )
    assert calculate_underground_pipe(underground).total_heat_loss_design_w > 0


def test_dormant_pipe_guard_preserves_wall_domain_error() -> None:
    data = _air_input(wall_thickness_m=0.05)
    with pytest.raises(FormulaDomainError) as exc_info:
        pipe_core._validate_pipe_input(
            outer_diameter_m=data.outer_diameter_m,
            wall_thickness_m=data.wall_thickness_m,
            wall_conductivity_w_mk=data.wall_conductivity_w_mk,
            insulation_layers=data.insulation_layers,
            process_temperature_c=data.process_temperature_c,
            environment_temperature_c=data.ambient_temperature_c,
            pipe_length_m=data.pipe_length_m,
            local_elements_count=data.local_elements_count,
            local_element_equiv_length_m=data.local_element_equiv_length_m,
            safety_factor=data.safety_factor,
            external_resistance_mk_w=0.1,
        )
    assert exc_info.value.code == "wall_exceeds_pipe_radius"


def test_dormant_pipe_guard_preserves_ground_domain_error() -> None:
    with pytest.raises(FormulaDomainError) as exc_info:
        pipe_core._validate_ground_input(0.1, 0.09, 1.5)
    assert exc_info.value.code == "ground_centerline_inside_pipe"


def test_pipe_result_guard_rejects_nonfinite_computed_fields() -> None:
    """Finite inputs may still overflow a derived resistance or temperature."""

    with pytest.raises(FormulaDomainError) as exc_info:
        calculate_aboveground_pipe(
            _air_input(
                insulation_layers=(PipeInsulationLayer(thickness_m=1e308, conductivity_w_mk=0.05),)
            )
        )
    assert exc_info.value.code == "non_finite_result"


def test_dormant_pipe_resistance_guard_preserves_zero_error() -> None:
    with pytest.raises(FormulaDomainError) as exc_info:
        pipe_core._validate_thermal_resistance_input(0.0)
    assert exc_info.value.code == "zero_thermal_resistance"


def test_wind_alpha_requires_explicit_coefficients() -> None:
    assert alpha_from_wind(4.0, intercept=11.6, sqrt_coefficient=7.0) == pytest.approx(25.6)
