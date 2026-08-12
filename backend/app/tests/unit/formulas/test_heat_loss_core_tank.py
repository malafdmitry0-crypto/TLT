"""Focused unit tests for the pure numeric tank heat-loss core."""

import math

import pytest

from app.formulas.heat_loss.core.errors import FormulaDomainError
from app.formulas.heat_loss.core.tank import (
    AirTankHeatLossInput,
    BuriedTankHeatLossInput,
    CylindricalTankGeometry,
    RectangularTankGeometry,
    TankInsulationLayer,
    calculate_air_tank_heat_loss,
    calculate_buried_tank_heat_loss,
)


def _layers() -> tuple[TankInsulationLayer, ...]:
    return (TankInsulationLayer(thickness_m=0.1, conductivity_w_mk=0.05),)


def _air_input(**overrides: object) -> AirTankHeatLossInput:
    values: dict[str, object] = {
        "geometry": CylindricalTankGeometry(diameter_m=2.0, height_m=3.0),
        "wall_thickness_m": 0.01,
        "wall_conductivity_w_mk": 0.5,
        "insulation_layers": _layers(),
        "process_temperature_c": 80.0,
        "ambient_temperature_c": -20.0,
        "external_alpha_w_m2k": 11.6,
        "safety_factor": 1.2,
        "additional_heat_loss_w": 50.0,
    }
    values.update(overrides)
    return AirTankHeatLossInput(**values)  # type: ignore[arg-type]


def test_air_tank_matches_flat_wall_hand_calculation() -> None:
    result = calculate_air_tank_heat_loss(_air_input())

    area = 8.0 * math.pi
    resistance = 0.01 / 0.5 + 0.1 / 0.05 + 1.0 / 11.6
    flux = 100.0 / resistance

    assert result.surface_area_m2 == pytest.approx(area)
    assert result.thermal_resistance_areal_m2k_w == pytest.approx(resistance)
    assert result.heat_loss_per_m2_base_w_m2 == pytest.approx(flux)
    assert result.total_heat_loss_base_w == pytest.approx(flux * area)
    assert result.total_heat_loss_design_w == pytest.approx(flux * area * 1.2 + 50.0)


def test_buried_rectangular_tank_separates_branches_and_adds_load_after_k() -> None:
    result = calculate_buried_tank_heat_loss(
        BuriedTankHeatLossInput(
            geometry=RectangularTankGeometry(length_m=4.0, width_m=2.0, height_m=3.0),
            wall_thickness_m=0.01,
            wall_conductivity_w_mk=0.5,
            insulation_layers=_layers(),
            process_temperature_c=80.0,
            ambient_temperature_c=-20.0,
            ground_temperature_c=0.0,
            external_alpha_w_m2k=11.6,
            buried_height_m=1.0,
            ground_conductivity_w_mk=2.0,
            safety_factor=1.2,
            additional_heat_loss_w=50.0,
        )
    )

    r_common = 0.01 / 0.5 + 0.1 / 0.05
    q_air = 100.0 / (r_common + 1.0 / 11.6)
    q_ground = 80.0 / (r_common + 1.0 / 2.0)
    air_loss = q_air * 32.0
    ground_loss = q_ground * 20.0

    assert result.air_surface_area_m2 == pytest.approx(32.0)
    assert result.ground_surface_area_m2 == pytest.approx(20.0)
    assert result.heat_loss_air_base_w == pytest.approx(air_loss)
    assert result.heat_loss_ground_base_w == pytest.approx(ground_loss)
    assert result.total_heat_loss_base_w == pytest.approx(air_loss + ground_loss)
    assert result.total_heat_loss_design_w == pytest.approx((air_loss + ground_loss) * 1.2 + 50.0)


def test_core_returns_layer_boundaries_for_both_buried_branches() -> None:
    result = calculate_buried_tank_heat_loss(
        BuriedTankHeatLossInput(
            geometry=CylindricalTankGeometry(diameter_m=2.0, height_m=3.0),
            wall_thickness_m=0.0,
            wall_conductivity_w_mk=1.0,
            insulation_layers=(
                TankInsulationLayer(thickness_m=0.04, conductivity_w_mk=0.04),
                TankInsulationLayer(thickness_m=0.02, conductivity_w_mk=0.05),
            ),
            process_temperature_c=80.0,
            ambient_temperature_c=-20.0,
            ground_temperature_c=5.0,
            external_alpha_w_m2k=20.0,
            buried_height_m=1.0,
            ground_conductivity_w_mk=1.5,
            safety_factor=1.1,
            additional_heat_loss_w=0.0,
        )
    )

    assert len(result.air_layer_boundary_temperatures) == 2
    assert len(result.ground_layer_boundary_temperatures) == 2
    assert result.air_layer_boundary_temperatures[0].cold_side_c == pytest.approx(
        result.air_layer_boundary_temperatures[1].hot_side_c
    )
    assert result.ground_layer_boundary_temperatures[0].cold_side_c == pytest.approx(
        result.ground_layer_boundary_temperatures[1].hot_side_c
    )


@pytest.mark.parametrize(
    ("input_factory", "code"),
    [
        (lambda: _air_input(external_alpha_w_m2k=0.0), "nonpositive_external_alpha"),
        (
            lambda: _air_input(insulation_layers=(TankInsulationLayer(1e308, 0.05),)),
            "non_finite_result",
        ),
    ],
)
def test_air_core_rejects_invalid_or_nonfinite_numeric_domain(input_factory, code: str) -> None:
    with pytest.raises(FormulaDomainError) as exc_info:
        calculate_air_tank_heat_loss(input_factory())
    assert exc_info.value.code == code


def test_buried_core_rejects_buried_height_outside_geometry() -> None:
    data = BuriedTankHeatLossInput(
        geometry=CylindricalTankGeometry(diameter_m=2.0, height_m=3.0),
        wall_thickness_m=0.0,
        wall_conductivity_w_mk=1.0,
        insulation_layers=_layers(),
        process_temperature_c=80.0,
        ambient_temperature_c=-20.0,
        ground_temperature_c=5.0,
        external_alpha_w_m2k=20.0,
        buried_height_m=3.1,
        ground_conductivity_w_mk=1.5,
        safety_factor=1.1,
        additional_heat_loss_w=0.0,
    )

    with pytest.raises(FormulaDomainError) as exc_info:
        calculate_buried_tank_heat_loss(data)
    assert exc_info.value.code == "invalid_buried_height"
