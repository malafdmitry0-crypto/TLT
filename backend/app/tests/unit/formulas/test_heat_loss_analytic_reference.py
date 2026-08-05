"""Аналитические эталоны теплорасчёта труб и резервуаров.

Отличие от `test_pipe_heat_loss.py` / `test_tank_heat_loss.py`: там в основном
свойства (знак, монотонность, «толще изоляция — меньше потери»), здесь — число,
посчитанное в тесте прямо по формуле, без вызова проверяемой функции. Свойство
ловит «стало хуже», эталон ловит «стало неправильно».

Модели:
    труба      цилиндрические оболочки, R = ln(r₂/r₁)/(2πλ);
               наружная теплоотдача R = 1/(2π·r·α);
               грунт R = arccosh(H/r)/(2π·λ_гр)
    резервуар  плоская стенка на единицу площади, R = δ/λ, внешняя R = 1/α

Во всех эталонах материал изоляции — `other` с явной λ: справочная λ зависит от
tm, и эталон проверял бы уже справочник, а не формулу.
"""

import math

import pytest

from app.formulas.heat_loss.pipe import calc_pipe_heat_loss
from app.formulas.heat_loss.tank import calc_tank_heat_loss
from app.schemas.calculation import (
    InsulationLayer,
    PipeHeatLossParams,
    TankHeatLossParams,
)

TEMPERATURE_RANGE = [-100.0, 500.0]

# Труба округляет результат: мощности и длины до 3 знаков, сопротивления до 6.
# Резервуар не округляет, поэтому там допуск на порядки строже.
POWER = {"rel": 1e-5, "abs": 1e-3}
RESISTANCE = {"rel": 1e-6, "abs": 5e-7}
EXACT = {"rel": 1e-9}


def _layer(thickness: float, conductivity: float) -> InsulationLayer:
    """Слой с постоянной λ — эталон не зависит от справочника."""
    return InsulationLayer(
        thickness=thickness,
        material="other",
        conductivity=conductivity,
        temperature_range=TEMPERATURE_RANGE,
    )


def _r_cyl(r_inner: float, r_outer: float, conductivity: float) -> float:
    return math.log(r_outer / r_inner) / (2.0 * math.pi * conductivity)


# ---------------------------------------------------------------------------
# Труба
# ---------------------------------------------------------------------------


class TestPipeAnalyticReference:
    def test_outdoor_single_layer_matches_closed_form(self):
        """R_ст + R_из + R_нар, α = 11,6 + 7·√v."""
        d_outer, wall, lam_wall = 0.108, 0.004, 45.0
        thickness, lam_ins = 0.05, 0.041
        wind, length, k = 4.0, 25.0, 1.2
        t_process, t_ambient = 120.0, -30.0

        result = calc_pipe_heat_loss(
            PipeHeatLossParams(
                outer_diameter=d_outer,
                wall_thickness=wall,
                pipe_lambda=lam_wall,
                insulation_layers=[_layer(thickness, lam_ins)],
                insulation_temperature_basis="outdoor_winter",
                placement="outdoor",
                wind_speed=wind,
                ambient_temperature=t_ambient,
                process_temperature=t_process,
                pipe_length=length,
                safety_factor=k,
            )
        )

        r_pipe = d_outer / 2.0
        r_ins_outer = r_pipe + thickness
        alpha = 11.6 + 7.0 * math.sqrt(wind)
        r_wall = _r_cyl(r_pipe - wall, r_pipe, lam_wall)
        r_ins = _r_cyl(r_pipe, r_ins_outer, lam_ins)
        r_ext = 1.0 / (2.0 * math.pi * r_ins_outer * alpha)
        q_linear = (t_process - t_ambient) / (r_wall + r_ins + r_ext)

        assert result.wall_resistance == pytest.approx(r_wall, **RESISTANCE)
        assert result.insulation_resistance == pytest.approx(r_ins, **RESISTANCE)
        assert result.external_resistance == pytest.approx(r_ext, **RESISTANCE)
        assert result.alpha_vnesh_applied == pytest.approx(alpha, **POWER)
        assert result.heat_loss_per_meter_base == pytest.approx(q_linear, **POWER)
        assert result.total_heat_loss_design == pytest.approx(q_linear * length * k, **POWER)

    def test_indoor_uses_free_convection_alpha_9(self):
        """В помещении α не зависит от ветра и равен 9 Вт/(м²·К)."""
        d_outer, thickness, lam_ins = 0.159, 0.06, 0.045
        t_process, t_ambient = 90.0, 18.0

        result = calc_pipe_heat_loss(
            PipeHeatLossParams(
                outer_diameter=d_outer,
                wall_thickness=0.005,
                pipe_lambda=50.0,
                insulation_layers=[_layer(thickness, lam_ins)],
                insulation_temperature_basis="indoor",
                placement="indoor",
                ambient_temperature=t_ambient,
                process_temperature=t_process,
                pipe_length=10.0,
            )
        )

        r_pipe = d_outer / 2.0
        r_ins_outer = r_pipe + thickness
        r_wall = _r_cyl(r_pipe - 0.005, r_pipe, 50.0)
        r_ins = _r_cyl(r_pipe, r_ins_outer, lam_ins)
        r_ext = 1.0 / (2.0 * math.pi * r_ins_outer * 9.0)

        assert result.alpha_vnesh_applied == pytest.approx(9.0)
        assert result.heat_loss_per_meter_base == pytest.approx(
            (t_process - t_ambient) / (r_wall + r_ins + r_ext), **POWER
        )

    def test_underground_uses_arccosh_ground_resistance(self):
        """Под землёй внешняя теплоотдача заменяется сопротивлением грунта."""
        d_outer, thickness, lam_ins = 0.108, 0.05, 0.04
        lam_ground, depth = 1.2, 1.5
        t_process, t_ground = 80.0, 5.0

        result = calc_pipe_heat_loss(
            PipeHeatLossParams(
                outer_diameter=d_outer,
                wall_thickness=0.004,
                pipe_lambda=45.0,
                insulation_layers=[_layer(thickness, lam_ins)],
                insulation_temperature_basis="channel",
                placement="underground",
                ground_temperature=t_ground,
                ground_conductivity=lam_ground,
                pipe_centerline_depth=depth,
                process_temperature=t_process,
                pipe_length=30.0,
            )
        )

        r_pipe = d_outer / 2.0
        r_ins_outer = r_pipe + thickness
        r_wall = _r_cyl(r_pipe - 0.004, r_pipe, 45.0)
        r_ins = _r_cyl(r_pipe, r_ins_outer, lam_ins)
        x = depth / r_ins_outer
        r_ground = math.log(x + math.sqrt(x * x - 1.0)) / (2.0 * math.pi * lam_ground)

        assert result.external_resistance == pytest.approx(r_ground, **RESISTANCE)
        assert result.alpha_vnesh_applied is None
        assert result.ground_conductivity_applied == pytest.approx(lam_ground)
        # разность температур берётся от грунта, а не от воздуха
        assert result.heat_loss_per_meter_base == pytest.approx(
            (t_process - t_ground) / (r_wall + r_ins + r_ground), **POWER
        )

    def test_layers_resistance_is_sum_of_shells(self):
        """Три слоя = сумма трёх цилиндрических оболочек, без «магии»."""
        d_outer = 0.219
        layers = [(0.04, 0.038), (0.03, 0.052), (0.02, 0.07)]

        result = calc_pipe_heat_loss(
            PipeHeatLossParams(
                outer_diameter=d_outer,
                wall_thickness=0.006,
                pipe_lambda=45.0,
                insulation_layers=[_layer(t, lam) for t, lam in layers],
                insulation_temperature_basis="outdoor_winter",
                placement="outdoor",
                wind_speed=2.0,
                ambient_temperature=-25.0,
                process_temperature=140.0,
                pipe_length=12.0,
            )
        )

        radius = d_outer / 2.0
        expected = 0.0
        for thickness, conductivity in layers:
            expected += _r_cyl(radius, radius + thickness, conductivity)
            radius += thickness

        assert result.insulation_resistance == pytest.approx(expected, **RESISTANCE)

    def test_heat_flux_is_proportional_to_temperature_difference(self):
        """Линейность по ΔT при неизменной геометрии: вдвое больше ΔT — вдвое поток."""

        def flux(process: float) -> float:
            return calc_pipe_heat_loss(
                PipeHeatLossParams(
                    outer_diameter=0.108,
                    wall_thickness=0.004,
                    pipe_lambda=45.0,
                    insulation_layers=[_layer(0.05, 0.04)],
                    insulation_temperature_basis="outdoor_winter",
                    placement="outdoor",
                    wind_speed=3.0,
                    ambient_temperature=0.0,
                    process_temperature=process,
                    pipe_length=10.0,
                )
            ).heat_loss_per_meter_base

        assert flux(100.0) == pytest.approx(2.0 * flux(50.0), **POWER)

    @pytest.mark.parametrize(
        "overrides",
        [
            pytest.param({}, id="outdoor"),
            pytest.param(
                {"placement": "indoor", "wind_speed": None, "insulation_temperature_basis": "indoor"},
                id="indoor",
            ),
            pytest.param({"alpha_vnesh": 15.0, "wind_speed": None}, id="manual-alpha"),
            pytest.param(
                {"num_local_elements": 3, "local_element_equiv_length": 2.0},
                id="local-elements",
            ),
            pytest.param({"safety_factor": 1.35}, id="safety-factor"),
        ],
    )
    def test_result_is_internally_consistent(self, overrides: dict):
        """Сумма сопротивлений, поток и итог согласованы между собой."""
        params = PipeHeatLossParams(
            **{
                "outer_diameter": 0.108,
                "wall_thickness": 0.004,
                "pipe_lambda": 45.0,
                "insulation_layers": [_layer(0.05, 0.042)],
                "insulation_temperature_basis": "outdoor_winter",
                "placement": "outdoor",
                "wind_speed": 3.0,
                "ambient_temperature": -20.0,
                "process_temperature": 95.0,
                "pipe_length": 40.0,
                **overrides,
            }
        )
        result = calc_pipe_heat_loss(params)

        assert result.wall_resistance is not None
        assert result.insulation_resistance is not None
        assert result.external_resistance is not None
        assert (
            result.wall_resistance + result.insulation_resistance + result.external_resistance
        ) == pytest.approx(result.thermal_resistance, abs=4e-6)

        delta_t = params.process_temperature - params.ambient_temperature
        assert result.heat_loss_per_meter_base == pytest.approx(
            delta_t / result.thermal_resistance, **POWER
        )
        assert result.effective_length == pytest.approx(
            params.pipe_length + params.num_local_elements * (params.local_element_equiv_length or 0.0)
        )
        assert result.total_heat_loss_base == pytest.approx(
            result.heat_loss_per_meter_base * result.effective_length, **POWER
        )
        # safety_factor в параметрах может быть не задан — берём применённый
        assert result.total_heat_loss_design == pytest.approx(
            result.total_heat_loss_base * result.safety_factor_applied, **POWER
        )


# ---------------------------------------------------------------------------
# Резервуар
# ---------------------------------------------------------------------------


class TestTankAnalyticReference:
    def test_cylindrical_matches_flat_wall_reference(self):
        """S = πdh + 2π(d/2)², R = δ_ст/λ_ст + δ_из/λ_из + 1/α."""
        diameter, height = 2.0, 3.0
        wall, lam_wall = 0.008, 45.0
        thickness, lam_ins = 0.1, 0.045
        wind, k, q_add = 4.0, 1.15, 250.0
        t_process, t_ambient = 80.0, -20.0

        result = calc_tank_heat_loss(
            TankHeatLossParams(
                shape="cylindrical",
                diameter=diameter,
                height=height,
                wall_thickness=wall,
                wall_lambda=lam_wall,
                insulation_layers=[_layer(thickness, lam_ins)],
                insulation_temperature_basis="outdoor_winter",
                placement="outdoor",
                wind_speed=wind,
                ambient_temperature=t_ambient,
                process_temperature=t_process,
                safety_factor=k,
                q_additional=q_add,
            )
        )

        area = math.pi * diameter * height + 2.0 * math.pi * (diameter / 2.0) ** 2
        alpha = 11.6 + 7.0 * math.sqrt(wind)
        r_areal = wall / lam_wall + thickness / lam_ins + 1.0 / alpha
        flux = (t_process - t_ambient) / r_areal

        assert result.surface_area_bare == pytest.approx(area, **EXACT)
        assert result.wall_resistance_areal_bare == pytest.approx(wall / lam_wall, **EXACT)
        assert result.insulation_resistance_areal_bare == pytest.approx(
            thickness / lam_ins, **EXACT
        )
        assert result.external_resistance_areal_bare == pytest.approx(1.0 / alpha, **EXACT)
        assert result.heat_loss_per_m2_bare_base == pytest.approx(flux, **EXACT)
        assert result.total_heat_loss_base == pytest.approx(flux * area, **EXACT)
        # запас умножает базовые потери, добавочная мощность прибавляется после
        assert result.total_heat_loss_design == pytest.approx(flux * area * k + q_add, **EXACT)

    def test_rectangular_area_matches_box_reference(self):
        """S = 2(LW + LH + WH)."""
        length, width, height = 4.0, 2.0, 2.5
        thickness, lam_ins = 0.08, 0.05

        result = calc_tank_heat_loss(
            TankHeatLossParams(
                shape="rectangular",
                length=length,
                width=width,
                height=height,
                insulation_layers=[_layer(thickness, lam_ins)],
                insulation_temperature_basis="outdoor_winter",
                placement="outdoor",
                wind_speed=0.0,
                ambient_temperature=-15.0,
                process_temperature=70.0,
                safety_factor=1.1,
            )
        )

        area = 2.0 * (length * width + length * height + width * height)
        r_areal = thickness / lam_ins + 1.0 / 11.6
        flux = (70.0 - (-15.0)) / r_areal

        assert result.surface_area_bare == pytest.approx(area, **EXACT)
        assert result.total_heat_loss_base == pytest.approx(flux * area, **EXACT)

    def test_partly_buried_splits_surface_and_temperature_difference(self):
        """Воздушная и подземная части считаются раздельно и складываются."""
        diameter, height, buried = 2.0, 3.0, 1.2
        thickness, lam_ins = 0.1, 0.045
        lam_ground, wind = 1.4, 2.0
        t_process, t_ambient, t_ground = 80.0, -20.0, 4.0

        result = calc_tank_heat_loss(
            TankHeatLossParams(
                shape="cylindrical",
                diameter=diameter,
                height=height,
                insulation_layers=[_layer(thickness, lam_ins)],
                insulation_temperature_basis="channel",
                placement="underground",
                tank_buried_height=buried,
                ground_temperature=t_ground,
                ground_conductivity=lam_ground,
                ambient_temperature=t_ambient,
                wind_speed=wind,
                process_temperature=t_process,
                safety_factor=1.1,
            )
        )

        cap = math.pi * (diameter / 2.0) ** 2
        s_air = cap + math.pi * diameter * (height - buried)
        s_ground = cap + math.pi * diameter * buried
        alpha = 11.6 + 7.0 * math.sqrt(wind)
        r_common = thickness / lam_ins
        flux_air = (t_process - t_ambient) / (r_common + 1.0 / alpha)
        flux_ground = (t_process - t_ground) / (r_common + buried / lam_ground)

        assert result.air_surface_area == pytest.approx(s_air, **EXACT)
        assert result.ground_surface_area == pytest.approx(s_ground, **EXACT)
        assert result.heat_loss_air_base == pytest.approx(flux_air * s_air, **EXACT)
        assert result.heat_loss_ground_base == pytest.approx(flux_ground * s_ground, **EXACT)
        assert result.total_heat_loss_base == pytest.approx(
            flux_air * s_air + flux_ground * s_ground, **EXACT
        )

    def test_layers_resistance_is_sum_of_flat_layers(self):
        """Плоская модель: сопротивление слоёв — сумма δ/λ."""
        layers = [(0.08, 0.042), (0.05, 0.055), (0.03, 0.07)]

        result = calc_tank_heat_loss(
            TankHeatLossParams(
                shape="cylindrical",
                diameter=2.0,
                height=3.0,
                insulation_layers=[_layer(t, lam) for t, lam in layers],
                insulation_temperature_basis="outdoor_winter",
                placement="outdoor",
                wind_speed=1.0,
                ambient_temperature=-10.0,
                process_temperature=95.0,
                safety_factor=1.1,
            )
        )

        assert result.insulation_resistance_areal_bare == pytest.approx(
            sum(thickness / conductivity for thickness, conductivity in layers), **EXACT
        )

    def test_result_is_internally_consistent(self):
        """Сумма удельных сопротивлений, поток, площадь и итог согласованы."""
        params = TankHeatLossParams(
            shape="cylindrical",
            diameter=2.4,
            height=3.5,
            wall_thickness=0.006,
            wall_lambda=45.0,
            insulation_layers=[_layer(0.09, 0.044)],
            insulation_temperature_basis="outdoor_winter",
            placement="outdoor",
            wind_speed=5.0,
            ambient_temperature=-25.0,
            process_temperature=110.0,
            safety_factor=1.25,
            q_additional=100.0,
        )
        result = calc_tank_heat_loss(params)

        assert result.wall_resistance_areal_bare is not None
        assert result.insulation_resistance_areal_bare is not None
        assert result.external_resistance_areal_bare is not None
        r_areal = (
            result.wall_resistance_areal_bare
            + result.insulation_resistance_areal_bare
            + result.external_resistance_areal_bare
        )
        assert result.thermal_resistance_areal_bare == pytest.approx(r_areal, **EXACT)

        delta_t = params.process_temperature - params.ambient_temperature
        assert result.heat_loss_per_m2_bare_base == pytest.approx(delta_t / r_areal, **EXACT)
        assert result.total_heat_loss_base == pytest.approx(
            result.heat_loss_per_m2_bare_base * result.surface_area_bare, **EXACT
        )
        assert result.total_heat_loss_design == pytest.approx(
            result.total_heat_loss_base * params.safety_factor + params.q_additional, **EXACT
        )
