"""Focused unit tests for the pure numeric pipe heat-loss core."""

import math

import pytest

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


@pytest.mark.parametrize(
    ("input_factory", "code"),
    [
        (lambda: _air_input(wall_thickness_m=0.05), "wall_exceeds_pipe_radius"),
        (
            lambda: _air_input(insulation_layers=(PipeInsulationLayer(0.0, 0.05),)),
            "nonpositive_layer_thickness",
        ),
    ],
)
def test_air_core_rejects_invalid_numeric_domain(input_factory, code: str) -> None:
    with pytest.raises(FormulaDomainError) as exc_info:
        calculate_aboveground_pipe(input_factory())
    assert exc_info.value.code == code


def test_underground_core_rejects_centerline_inside_outer_radius() -> None:
    data = UndergroundPipeInput(
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
        centerline_depth_m=0.09,
        ground_conductivity_w_mk=1.5,
    )

    with pytest.raises(FormulaDomainError) as exc_info:
        calculate_underground_pipe(data)
    assert exc_info.value.code == "ground_centerline_inside_pipe"


def test_core_rejects_non_finite_computed_result_fields() -> None:
    """Finite inputs may still overflow a layer resistance and boundary temperature."""
    with pytest.raises(FormulaDomainError) as exc_info:
        calculate_aboveground_pipe(
            _air_input(
                insulation_layers=(PipeInsulationLayer(thickness_m=1e308, conductivity_w_mk=0.05),)
            )
        )
    assert exc_info.value.code == "non_finite_result"


def test_wind_alpha_requires_explicit_coefficients() -> None:
    assert alpha_from_wind(4.0, intercept=11.6, sqrt_coefficient=7.0) == pytest.approx(25.6)
