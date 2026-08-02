"""Exact radial spherical tank model (Slice 4)."""

import math

import pytest

from app.formulas.heat_loss.tank import _sphere_shell_resistance, calc_tank_heat_loss
from app.schemas.calculation import InsulationLayer, TankHeatLossParams


def _sphere(**overrides: object) -> TankHeatLossParams:
    data: dict[str, object] = {
        "shape": "spherical",
        "diameter": 2.0,
        "wall_thickness": 0.01,
        "wall_lambda": 45.0,
        "insulation_layers": [
            InsulationLayer(
                thickness=0.1,
                material="other",
                conductivity=0.05,
                temperature_range=(-90.0, 600.0),
            )
        ],
        "placement": "outdoor",
        "ambient_temperature": 20.0,
        "process_temperature": 100.0,
        "alpha_vnesh": 15.0,
        "safety_factor": 1.1,
        "q_additional": 0.0,
        "insulation_temperature_basis": "outdoor_summer",
    }
    data.update(overrides)
    return TankHeatLossParams(**data)


def test_spherical_manual_golden_uses_exact_radial_resistances():
    result = calc_tank_heat_loss(_sphere())
    assert result.outer_insulation_radius == pytest.approx(1.1)
    assert result.critical_insulation_radius == pytest.approx(0.006666666667)
    assert result.surface_area_bare == pytest.approx(12.5663706144)
    assert result.surface_area_outer == pytest.approx(15.2053084434)
    assert result.wall_resistance_total == pytest.approx(0.000017862508)
    assert result.insulation_resistance_total == pytest.approx(0.144686311902)
    assert result.external_resistance_total == pytest.approx(0.004384433694)
    assert result.thermal_resistance_total == pytest.approx(0.149088608103)
    assert result.total_heat_loss_base == pytest.approx(536.593647347)
    assert result.total_heat_loss_design == pytest.approx(590.253012081)
    assert result.heat_loss_per_m2_bare_base == pytest.approx(42.700765703)
    assert result.external_heat_flux_base == pytest.approx(35.289889011)
    assert result.critical_radius_check_passed is True
    assert result.insulation_layers_applied[0].resistance_unit == "K/W"


def test_spherical_rejects_below_critical_radius_with_context():
    with pytest.raises(ValueError, match="sphere_below_critical_insulation_radius") as error:
        calc_tank_heat_loss(
            _sphere(
                diameter=0.1,
                alpha_vnesh=7.0,
                wall_thickness=None,
                wall_lambda=None,
                insulation_layers=[
                    InsulationLayer(
                        thickness=0.1,
                        material="other",
                        conductivity=1.0,
                        temperature_range=(-90.0, 600.0),
                    )
                ],
            )
        )
    assert "router=" in str(error.value)
    assert "rcritical=" in str(error.value)
    assert "conductivity_outermost=" in str(error.value)
    assert "alpha_vnesh_applied=" in str(error.value)


def test_spherical_accepts_critical_radius_boundary_and_manual_alpha_wins():
    # r_outer = 0.1 m and 2*lambda/alpha = 0.1 m exactly.
    result = calc_tank_heat_loss(
        _sphere(
            diameter=0.1,
            alpha_vnesh=7.0,
            wall_thickness=None,
            wall_lambda=None,
            insulation_layers=[
                InsulationLayer(
                    thickness=0.05,
                    material="other",
                    conductivity=0.35,
                    temperature_range=(-90.0, 600.0),
                )
            ],
        )
    )
    assert result.outer_insulation_radius == pytest.approx(result.critical_insulation_radius)
    assert result.wind_speed_applied is None


def test_spherical_accepts_decimal_critical_boundary_despite_float_roundoff():
    # Decimal equality: r_outer = 0.05 + 0.005 = 0.055 m and
    # r_critical = 2 * 0.275 / 10 = 0.055 m.  Binary floats place the latter
    # one ULP above the former, which must not turn the allowed boundary into
    # a rejection.
    result = calc_tank_heat_loss(
        _sphere(
            diameter=0.1,
            alpha_vnesh=10.0,
            wall_thickness=None,
            wall_lambda=None,
            insulation_layers=[
                InsulationLayer(
                    thickness=0.005,
                    material="other",
                    conductivity=0.275,
                    temperature_range=(-90.0, 600.0),
                )
            ],
        )
    )

    assert result.outer_insulation_radius == pytest.approx(0.055)
    assert result.critical_insulation_radius == pytest.approx(0.055)
    assert result.critical_radius_check_passed is True


def test_thicker_spherical_insulation_reduces_loss_above_critical_radius():
    thin = calc_tank_heat_loss(
        _sphere(
            alpha_vnesh=7.0,
            insulation_layers=[
                InsulationLayer(
                    thickness=0.2,
                    material="other",
                    conductivity=0.05,
                    temperature_range=(-90, 600),
                )
            ],
        )
    )
    thick = calc_tank_heat_loss(
        _sphere(
            alpha_vnesh=7.0,
            insulation_layers=[
                InsulationLayer(
                    thickness=0.4,
                    material="other",
                    conductivity=0.05,
                    temperature_range=(-90, 600),
                )
            ],
        )
    )
    assert thick.total_heat_loss_base < thin.total_heat_loss_base


def test_multilayer_critical_radius_uses_outermost_conductivity():
    with pytest.raises(ValueError, match="sphere_below_critical_insulation_radius") as error:
        calc_tank_heat_loss(
            _sphere(
                diameter=0.2,
                wall_thickness=None,
                wall_lambda=None,
                alpha_vnesh=10.0,
                insulation_layers=[
                    InsulationLayer(
                        thickness=0.1,
                        material="other",
                        conductivity=0.05,
                        temperature_range=(-90.0, 600.0),
                    ),
                    InsulationLayer(
                        thickness=0.1,
                        material="other",
                        conductivity=2.0,
                        temperature_range=(-90.0, 600.0),
                    ),
                ],
            )
        )

    message = str(error.value)
    assert "router=0.3" in message
    assert "rcritical=0.4" in message
    assert "conductivity_outermost=2" in message
    assert "alpha_vnesh_applied=10" in message


def test_multilayer_sphere_builds_each_shell_from_previous_outer_radius():
    result = calc_tank_heat_loss(
        _sphere(
            insulation_layers=[
                InsulationLayer(
                    thickness=0.1,
                    material="other",
                    conductivity=0.05,
                    temperature_range=(-90.0, 600.0),
                ),
                InsulationLayer(
                    thickness=0.2,
                    material="other",
                    conductivity=0.1,
                    temperature_range=(-90.0, 600.0),
                ),
            ]
        )
    )

    first_expected = (1.0 / (4.0 * math.pi * 0.05)) * (1.0 / 1.0 - 1.0 / 1.1)
    second_expected = (1.0 / (4.0 * math.pi * 0.1)) * (1.0 / 1.1 - 1.0 / 1.3)
    assert result.insulation_layers_applied[0].resistance == pytest.approx(first_expected)
    assert result.insulation_layers_applied[1].resistance == pytest.approx(second_expected)
    assert result.insulation_resistance_total == pytest.approx(first_expected + second_expected)
    assert result.outer_insulation_radius == pytest.approx(1.3)


def test_thin_spherical_shell_converges_to_plane_wall_limit():
    radius = 1.0
    thickness = 1e-7
    conductivity = 0.05

    radial = _sphere_shell_resistance(radius, radius + thickness, conductivity)
    plane_wall_limit = thickness / (conductivity * 4.0 * math.pi * radius**2)

    assert radial == pytest.approx(plane_wall_limit, rel=2e-7)


def test_spherical_tank_without_wall_reports_zero_wall_resistance():
    result = calc_tank_heat_loss(_sphere(wall_thickness=None, wall_lambda=None))

    assert result.wall_resistance_total == 0.0
    assert result.wall_resistance_areal_bare == 0.0


def test_spherical_design_load_applies_factor_once_then_additional_load():
    safety_factor = 1.23
    q_additional = 17.0
    result = calc_tank_heat_loss(
        _sphere(safety_factor=safety_factor, q_additional=q_additional)
    )

    assert result.total_heat_loss_design == (
        result.total_heat_loss_base * safety_factor + q_additional
    )
