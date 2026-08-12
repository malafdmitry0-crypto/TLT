"""Focused unit tests for the pure numeric pipe heat-loss core."""

import math

import pytest

from app.formulas.heat_loss.core import pipe as pipe_core
from app.formulas.heat_loss.core.errors import FormulaDomainError
from app.formulas.heat_loss.core.pipe import (
    AbovegroundPipeInput,
    PipeInsulationLayer,
    UndergroundPipeInput,
    calculate_aboveground_pipe,
    calculate_underground_pipe,
    validate_pipe_formula_domain,
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


def test_formula_domain_validation_is_explicit_not_part_of_calculation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def fail_if_called(**_: object) -> None:
        raise AssertionError("calculation revalidated input")

    monkeypatch.setattr(
        pipe_core,
        "validate_pipe_formula_domain",
        fail_if_called,
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


def test_pipe_formula_domain_collects_all_derived_issues_with_numeric_details() -> None:
    report = validate_pipe_formula_domain(
        outer_diameter_m=0.1,
        wall_thickness_m=0.05,
        insulation_layer_thicknesses_m=(0.05,),
        process_temperature_c=5.0,
        environment_temperature_c=5.0,
        environment="ground",
        centerline_depth_m=0.1,
    )

    assert [issue.code for issue in report.issues] == [
        "wall_exceeds_pipe_radius",
        "process_temperature_not_above_ground",
        "ground_centerline_inside_pipe",
    ]
    assert report.issues[0].details_dict() == {
        "outer_diameter_m": 0.1,
        "wall_thickness_m": 0.05,
        "outer_radius_m": 0.05,
    }
    assert report.issues[2].details_dict()["outer_radius_m"] == pytest.approx(0.1)


def test_valid_pipe_formula_domain_returns_empty_report() -> None:
    report = validate_pipe_formula_domain(
        outer_diameter_m=0.1,
        wall_thickness_m=0.004,
        insulation_layer_thicknesses_m=(0.05,),
        process_temperature_c=80.0,
        environment_temperature_c=-20.0,
        environment="ambient",
    )

    assert report.is_valid is True
    assert report.issues == ()


def test_pipe_result_guard_rejects_nonfinite_computed_fields() -> None:
    """Finite inputs may still overflow a derived resistance or temperature."""

    with pytest.raises(FormulaDomainError) as exc_info:
        calculate_aboveground_pipe(
            _air_input(
                insulation_layers=(PipeInsulationLayer(thickness_m=1e308, conductivity_w_mk=0.05),)
            )
        )
    assert exc_info.value.code == "non_finite_result"


def test_wind_alpha_requires_explicit_coefficients() -> None:
    assert alpha_from_wind(4.0, intercept=11.6, sqrt_coefficient=7.0) == pytest.approx(25.6)
