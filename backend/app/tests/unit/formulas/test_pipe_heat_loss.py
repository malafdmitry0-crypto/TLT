"""Unit-тесты расчёта теплопотерь трубопровода.

Покрытие:
- Базовые свойства (знак, монотонность, пропорциональность длине)
- Многослойная изоляция (1–3 слоя)
- Учёт стенки трубы (lambda = f(T))
- Подземная прокладка (R_ground)
- Локальные элементы (фланцы)
- Коэффициент запаса K
- Внешняя теплоотдача: alpha из скорости ветра
- Валидация входных данных
"""

import math

import pytest

from app.formulas.heat_loss.pipe import (
    calc_alpha_vnesh,
    calc_pipe_heat_loss,
    pipe_material_lambda,
)
from app.schemas.calculation import InsulationLayer, PipeHeatLossParams

# ---------------------------------------------------------------------------
# Фабрика параметров по умолчанию
# ---------------------------------------------------------------------------


def _params(**overrides) -> PipeHeatLossParams:
    defaults = dict(
        outer_diameter=0.108,  # DN100
        wall_thickness=0.004,
        pipe_material="carbon_steel",
        insulation_layers=[
            InsulationLayer(thickness=0.05, material="mineral_wool_boards_120")
        ],
        insulation_temperature_basis="outdoor_winter",
        ambient_temperature=-30.0,
        process_temperature=150.0,
        pipe_length=100.0,
        placement="outdoor",
        wind_speed=0.0,
    )
    defaults.update(overrides)
    if defaults.get("placement") == "indoor":
        defaults.pop("wind_speed", None)
    if defaults.get("placement") == "indoor" and "insulation_temperature_basis" not in overrides:
        defaults["insulation_temperature_basis"] = "indoor"
    return PipeHeatLossParams(**defaults)


# ---------------------------------------------------------------------------
# Базовые свойства
# ---------------------------------------------------------------------------


class TestBasicProperties:
    def test_returns_positive_values(self):
        r = calc_pipe_heat_loss(_params())
        assert r.heat_loss_per_meter_base > 0
        assert r.total_heat_loss_design > 0
        assert r.thermal_resistance > 0

    def test_total_equals_per_meter_times_effective_length(self):
        k = 1.2
        params = _params(pipe_length=100.0, safety_factor=k)
        r = calc_pipe_heat_loss(params)
        assert r.total_heat_loss_design == pytest.approx(r.heat_loss_per_meter_base * 100.0 * k, rel=1e-3)
        assert r.heat_loss_per_meter_design == pytest.approx(
            r.heat_loss_per_meter_base * k,
            rel=1e-3,
        )
        assert r.total_heat_loss_base == pytest.approx(
            r.heat_loss_per_meter_base * r.effective_length,
            rel=1e-3,
        )

    def test_result_trace_contains_resolved_layer_and_stable_formula_revision(self):
        result = calc_pipe_heat_loss(_params())

        assert result.formula_model == "pipe_heat_loss"
        assert result.formula_model_version == "2"
        assert len(result.insulation_layers_applied) == 1
        layer = result.insulation_layers_applied[0]
        assert layer.conductivity_applied > 0
        assert layer.conductivity_source == "reference_data"
        assert layer.resistance_unit == "m*K/W"

    def test_manual_alpha_does_not_claim_wind_was_applied(self):
        result = calc_pipe_heat_loss(_params(alpha_vnesh=15.0, wind_speed=8.0))

        assert result.alpha_vnesh_applied == pytest.approx(15.0)
        assert result.wind_speed_applied is None

    def test_effective_length_default_equals_pipe_length(self):
        params = _params(pipe_length=80.0)
        r = calc_pipe_heat_loss(params)
        assert r.effective_length == pytest.approx(80.0)

    def test_thicker_insulation_reduces_loss(self):
        thin = calc_pipe_heat_loss(
            _params(insulation_layers=[InsulationLayer(thickness=0.02, material="mineral_wool_boards_120")])
        )
        thick = calc_pipe_heat_loss(
            _params(insulation_layers=[InsulationLayer(thickness=0.10, material="mineral_wool_boards_120")])
        )
        assert thick.heat_loss_per_meter_base < thin.heat_loss_per_meter_base

    def test_colder_ambient_increases_loss(self):
        warm = calc_pipe_heat_loss(_params(ambient_temperature=10))
        cold = calc_pipe_heat_loss(_params(ambient_temperature=-50))
        assert cold.heat_loss_per_meter_base > warm.heat_loss_per_meter_base

    @pytest.mark.parametrize("temp", [-60, -40, -20, 0, 20])
    def test_various_ambient_temperatures(self, temp):
        r = calc_pipe_heat_loss(_params(ambient_temperature=temp))
        assert r.heat_loss_per_meter_base > 0


# ---------------------------------------------------------------------------
# Многослойная изоляция
# ---------------------------------------------------------------------------


class TestMultiLayerInsulation:
    def test_single_layer_via_list(self):
        params = PipeHeatLossParams(
            outer_diameter=0.108,
            wall_thickness=0.004,
            pipe_material="carbon_steel",
            insulation_layers=[InsulationLayer(thickness=0.05, material="mineral_wool_boards_120")],
            ambient_temperature=-30.0,
            process_temperature=150.0,
            pipe_length=100.0,
            insulation_temperature_basis="outdoor_winter",
            placement="outdoor",
            wind_speed=0.0,
        )
        r = calc_pipe_heat_loss(params)
        assert r.heat_loss_per_meter_base > 0

    def test_two_layers_less_loss_than_one(self):
        single = _params()
        two = PipeHeatLossParams(
            outer_diameter=0.108,
            wall_thickness=0.004,
            pipe_material="carbon_steel",
            insulation_layers=[
                InsulationLayer(thickness=0.05, material="mineral_wool_boards_120"),
                InsulationLayer(thickness=0.05, material="mineral_wool_boards_120"),
            ],
            ambient_temperature=-30.0,
            process_temperature=150.0,
            pipe_length=100.0,
            insulation_temperature_basis="outdoor_winter",
            placement="outdoor",
            wind_speed=0.0,
        )
        assert (
            calc_pipe_heat_loss(two).heat_loss_per_meter_base
            < calc_pipe_heat_loss(single).heat_loss_per_meter_base
        )

    def test_three_layers_max(self):
        params = PipeHeatLossParams(
            outer_diameter=0.108,
            wall_thickness=0.004,
            pipe_material="carbon_steel",
            insulation_layers=[
                InsulationLayer(thickness=0.03, material="mineral_wool_boards_120"),
                InsulationLayer(thickness=0.03, material="polyurethane_products_50"),
                InsulationLayer(thickness=0.03, material="polystyrene_products_50"),
            ],
            ambient_temperature=-30.0,
            process_temperature=150.0,
            pipe_length=100.0,
            insulation_temperature_basis="outdoor_winter",
            placement="outdoor",
            wind_speed=0.0,
        )
        r = calc_pipe_heat_loss(params)
        assert r.heat_loss_per_meter_base > 0

    def test_four_layers_raises(self):
        from pydantic import ValidationError

        with pytest.raises(ValidationError):
            PipeHeatLossParams(
                outer_diameter=0.108,
                wall_thickness=0.004,
                pipe_material="carbon_steel",
                insulation_layers=[
                    InsulationLayer(thickness=0.03, material="mineral_wool_boards_120")
                ]
                * 4,
                ambient_temperature=-30.0,
                process_temperature=150.0,
                pipe_length=100.0,
                insulation_temperature_basis="outdoor_winter",
                placement="outdoor",
                wind_speed=0.0,
            )

    def test_layer_with_explicit_conductivity(self):
        params = PipeHeatLossParams(
            outer_diameter=0.108,
            wall_thickness=0.004,
            pipe_material="carbon_steel",
            insulation_layers=[
                InsulationLayer(
                    thickness=0.05,
                    material="other",
                    conductivity=0.040,
                    temperature_range=(-90, 600),
                )
            ],
            ambient_temperature=-30.0,
            process_temperature=150.0,
            pipe_length=100.0,
            insulation_temperature_basis="outdoor_winter",
            placement="outdoor",
            wind_speed=0.0,
        )
        r = calc_pipe_heat_loss(params)
        assert r.heat_loss_per_meter_base > 0

    def test_layer_temperature_above_material_range_raises(self):
        with pytest.raises(ValueError, match="вне диапазона"):
            PipeHeatLossParams(
                outer_diameter=0.108,
                wall_thickness=0.004,
                pipe_material="carbon_steel",
                insulation_layers=[
                    InsulationLayer(thickness=0.02, material="polystyrene_products_50"),
                ],
                ambient_temperature=-20.0,
                process_temperature=500.0,
                pipe_length=100.0,
                insulation_temperature_basis="outdoor_winter",
                placement="outdoor",
                wind_speed=0.0,
            )

    def test_outer_layer_is_checked_by_actual_layer_temperature(self):
        params = PipeHeatLossParams(
            outer_diameter=0.108,
            wall_thickness=0.004,
            pipe_material="carbon_steel",
            insulation_layers=[
                InsulationLayer(thickness=0.20, material="mineral_wool_boards_120"),
                InsulationLayer(thickness=0.02, material="polystyrene_products_50"),
            ],
            ambient_temperature=-20.0,
            process_temperature=200.0,
            pipe_length=100.0,
            insulation_temperature_basis="outdoor_winter",
            placement="outdoor",
            wind_speed=0.0,
        )

        assert calc_pipe_heat_loss(params).heat_loss_per_meter_base > 0

    def test_other_layer_uses_manual_temperature_range(self):
        params = PipeHeatLossParams(
            outer_diameter=0.108,
            wall_thickness=0.004,
            pipe_material="carbon_steel",
            insulation_layers=[
                InsulationLayer(
                    thickness=0.02,
                    material="other",
                    conductivity=0.061,
                    temperature_range=(-60, 100),
                ),
            ],
            ambient_temperature=-20.0,
            process_temperature=150.0,
            pipe_length=100.0,
            insulation_temperature_basis="outdoor_winter",
            placement="outdoor",
            wind_speed=0.0,
        )

        with pytest.raises(ValueError, match="вне диапазона"):
            calc_pipe_heat_loss(params)


# ---------------------------------------------------------------------------
# Стенка трубы
# ---------------------------------------------------------------------------


class TestPipeWall:
    def test_wall_increases_thermal_resistance(self):
        without = calc_pipe_heat_loss(_params(wall_thickness=0.0001))
        with_wall = calc_pipe_heat_loss(_params(wall_thickness=0.004, pipe_material="carbon_steel"))
        # Стенка добавляет сопротивление → меньше потерь (незначительно)
        assert with_wall.thermal_resistance > without.thermal_resistance

    def test_carbon_steel_default_lambda(self):
        lam = pipe_material_lambda("carbon_steel", 60.0)
        expected = 60.0 - 0.10 * (60.0 + 40)
        assert lam == pytest.approx(expected, rel=1e-6)

    def test_stainless_304_lambda(self):
        lam = pipe_material_lambda("stainless_304", 100.0)
        expected = 14.0 + 0.01 * (100.0 + 40)
        assert lam == pytest.approx(expected, rel=1e-6)

    def test_copper_lambda(self):
        lam = pipe_material_lambda("copper", 20.0)
        expected = 410.0 - 0.16 * (20.0 + 40)
        assert lam == pytest.approx(expected, rel=1e-6)

    def test_aluminum_lambda(self):
        lam = pipe_material_lambda("aluminum", 20.0)
        expected = 242.0 - 0.07 * (20.0 + 40)
        assert lam == pytest.approx(expected, rel=1e-6)

    def test_plastic_lambda(self):
        lam = pipe_material_lambda("plastic", 20.0)
        expected = 0.20 + 0.0005 * (20.0 + 40)
        assert lam == pytest.approx(expected, rel=1e-6)

    def test_unknown_pipe_material_raises(self):
        with pytest.raises(ValueError, match="Неизвестный материал трубы"):
            pipe_material_lambda("titanium", 20.0)

    def test_wall_thickness_exceeding_radius_raises(self):
        # DN10 (OD=0.0108м, r=5.4мм): стенка 6мм > 5.4мм → невозможно физически
        with pytest.raises(ValueError, match="wall_thickness"):
            PipeHeatLossParams(
                outer_diameter=0.0108,
                wall_thickness=0.006,
                pipe_material="carbon_steel",
                insulation_layers=[
                    InsulationLayer(thickness=0.05, material="mineral_wool_boards_120")
                ],
                insulation_temperature_basis="outdoor_winter",
                ambient_temperature=-30,
                process_temperature=150,
                pipe_length=10,
                placement="outdoor",
                wind_speed=0.0,
            )

    def test_pipe_lambda_override(self):
        # Используем маленькую трубу DN10 (OD=0.0108м) с толстой стенкой 4мм,
        # чтобы вклад стенки в R_total был ощутимым
        base = dict(
            outer_diameter=0.0108,
            wall_thickness=0.004,
            insulation_layers=[
                InsulationLayer(thickness=0.03, material="mineral_wool_boards_120")
            ],
            insulation_temperature_basis="outdoor_winter",
            ambient_temperature=-30,
            process_temperature=150,
            pipe_length=100,
            placement="outdoor",
            wind_speed=0.0,
        )
        r1 = calc_pipe_heat_loss(PipeHeatLossParams(**{**base, "pipe_material": "carbon_steel"}))
        r2 = calc_pipe_heat_loss(PipeHeatLossParams(**{**base, "pipe_lambda": 0.5}))  # пластик-like
        # Справочная λ стали vs λ=0.5 → вклад стенки становится заметно выше.
        assert r2.thermal_resistance > r1.thermal_resistance


# ---------------------------------------------------------------------------
# Подземная прокладка
# ---------------------------------------------------------------------------


class TestBuriedPipe:
    def test_buried_pipe_has_result(self):
        params = _params(
            placement="underground",
            ambient_temperature=None,
            wind_speed=None,
            pipe_centerline_depth=1.5,
            ground_temperature=-30.0,
            ground_conductivity=1.5,
            insulation_temperature_basis="channel",
        )
        r = calc_pipe_heat_loss(params)
        assert r.heat_loss_per_meter_base > 0

    def test_buried_deeper_reduces_loss(self):
        shallow = calc_pipe_heat_loss(
            _params(
                placement="underground",
                ambient_temperature=None,
                wind_speed=None,
                pipe_centerline_depth=0.5,
                ground_temperature=-30.0,
                ground_conductivity=1.5,
                insulation_temperature_basis="channel",
            )
        )
        deep = calc_pipe_heat_loss(
            _params(
                placement="underground",
                ambient_temperature=None,
                wind_speed=None,
                pipe_centerline_depth=3.0,
                ground_temperature=-30.0,
                ground_conductivity=1.5,
                insulation_temperature_basis="channel",
            )
        )
        assert deep.heat_loss_per_meter_base < shallow.heat_loss_per_meter_base

    def test_pipe_centerline_depth_less_than_radius_raises(self):
        with pytest.raises(ValueError, match="Глубина заложения"):
            calc_pipe_heat_loss(
                _params(
                    outer_diameter=0.5,
                    insulation_layers=[
                        InsulationLayer(thickness=0.2, material="mineral_wool_boards_120")
                    ],
                    placement="underground",
                    ambient_temperature=None,
                    wind_speed=None,
                    pipe_centerline_depth=0.1,
                    ground_temperature=-30.0,
                    ground_conductivity=1.5,
                    insulation_temperature_basis="channel",
                )
            )

    def test_higher_ground_conductivity_increases_loss(self):
        low = calc_pipe_heat_loss(
            _params(
                placement="underground",
                ambient_temperature=None,
                wind_speed=None,
                pipe_centerline_depth=1.5,
                ground_temperature=-30.0,
                ground_conductivity=0.8,
                insulation_temperature_basis="channel",
            )
        )
        high = calc_pipe_heat_loss(
            _params(
                placement="underground",
                ambient_temperature=None,
                wind_speed=None,
                pipe_centerline_depth=1.5,
                ground_temperature=-30.0,
                ground_conductivity=3.0,
                insulation_temperature_basis="channel",
            )
        )
        assert high.heat_loss_per_meter_base > low.heat_loss_per_meter_base


# ---------------------------------------------------------------------------
# Локальные элементы
# ---------------------------------------------------------------------------


class TestLocalElements:
    def test_local_elements_increase_total_loss(self):
        base = calc_pipe_heat_loss(_params())
        with_elements = calc_pipe_heat_loss(
            _params(num_local_elements=5, local_element_equiv_length=1.0)
        )
        assert with_elements.total_heat_loss_design > base.total_heat_loss_design

    def test_effective_length_with_elements(self):
        params = _params(pipe_length=100.0, num_local_elements=4, local_element_equiv_length=2.5)
        r = calc_pipe_heat_loss(params)
        assert r.effective_length == pytest.approx(100.0 + 4 * 2.5)

    def test_zero_elements_no_change(self):
        base = calc_pipe_heat_loss(_params(pipe_length=100.0))
        same = calc_pipe_heat_loss(_params(pipe_length=100.0, num_local_elements=0))
        assert base.total_heat_loss_design == pytest.approx(same.total_heat_loss_design)


# ---------------------------------------------------------------------------
# Коэффициент запаса
# ---------------------------------------------------------------------------


class TestSafetyFactor:
    def test_higher_safety_factor_increases_total(self):
        low_k = calc_pipe_heat_loss(_params(safety_factor=1.05))
        high_k = calc_pipe_heat_loss(_params(safety_factor=1.5))
        assert high_k.total_heat_loss_design > low_k.total_heat_loss_design

    def test_safety_factor_proportional_to_total(self):
        r1 = calc_pipe_heat_loss(_params(safety_factor=1.1))
        r2 = calc_pipe_heat_loss(_params(safety_factor=1.3))
        ratio = r2.total_heat_loss_design / r1.total_heat_loss_design
        assert ratio == pytest.approx(1.3 / 1.1, rel=1e-3)


# ---------------------------------------------------------------------------
# Legacy-коэффициенты не входят в формулу ТНП
# ---------------------------------------------------------------------------


class TestLegacyFactorsIgnored:
    def test_location_coefficients_do_not_change_total(self):
        base = calc_pipe_heat_loss(
            _params(placement="indoor"),
            coefficients={"location_indoor": 1.0},
        )
        adjusted = calc_pipe_heat_loss(
            _params(placement="indoor"),
            coefficients={"location_indoor": 0.9},
        )

        assert adjusted.heat_loss_per_meter_base == pytest.approx(base.heat_loss_per_meter_base, rel=1e-6)
        assert adjusted.total_heat_loss_design == pytest.approx(base.total_heat_loss_design, rel=1e-6)
        assert "location_factor" not in adjusted.model_dump()

    def test_legacy_wind_factor_does_not_change_alpha_or_total(self):
        base = calc_pipe_heat_loss(_params(wind_speed=4.0))
        legacy = calc_pipe_heat_loss(_params(wind_speed=4.0), coefficients={"wind_factor": 0.5})
        assert legacy.alpha_vnesh_applied == pytest.approx(base.alpha_vnesh_applied)
        assert legacy.total_heat_loss_design == pytest.approx(base.total_heat_loss_design)


class TestTnpGoldenFormula:
    def test_pipe_total_is_independent_tnp_oracle(self):
        """Число вычислено напрямую по формуле P-PIPE, не production-функцией."""
        params = _params(
            outer_diameter=0.1,
            insulation_layers=[
                InsulationLayer(thickness=0.05, material="mineral_wool_boards_120")
            ],
            ambient_temperature=-20.0,
            process_temperature=80.0,
            pipe_length=10.0,
            num_local_elements=2,
            local_element_equiv_length=0.5,
            wind_speed=4.0,
            safety_factor=1.2,
        )
        # λиз = 0.045 + 0.00021 × tm; outdoor_winter: tm=Tж/2=40°C.
        lam_ins = 0.045 + 0.00021 * 40.0
        d = 0.1
        d_out = d + 2 * 0.05
        alpha = 11.6 + 7.0 * math.sqrt(4.0)
        r_ins = math.log(d_out / d) / (2 * math.pi * lam_ins)
        lam_wall = 60.0 - 0.10 * (30.0 + 40.0)
        r_wall = math.log((d / 2) / (d / 2 - 0.004)) / (2 * math.pi * lam_wall)
        r_ext = 1.0 / (math.pi * alpha * d_out)
        expected_q = (80.0 - (-20.0)) / (r_wall + r_ins + r_ext)
        expected_total = expected_q * (10.0 + 2 * 0.5) * 1.2

        result = calc_pipe_heat_loss(params)
        assert result.heat_loss_per_meter_base == pytest.approx(expected_q, abs=1e-3)
        assert result.total_heat_loss_design == pytest.approx(expected_total, abs=1e-3)


# ---------------------------------------------------------------------------
# Коэффициент теплоотдачи из скорости ветра
# ---------------------------------------------------------------------------


class TestAlphaVnesh:
    def test_zero_wind_indoor(self):
        alpha = calc_alpha_vnesh(wind_speed=0, placement="indoor")
        assert alpha == pytest.approx(9.0)

    def test_zero_wind_outdoor(self):
        # α = 11,6 + 7·√v, при v=0 → 11,6  (SNiP 41-03-2003)
        alpha = calc_alpha_vnesh(wind_speed=0, placement="outdoor")
        assert alpha == pytest.approx(11.6)

    def test_low_wind_linear(self):
        alpha = calc_alpha_vnesh(wind_speed=3.0, placement="outdoor")
        assert alpha == pytest.approx(11.6 + 7.0 * math.sqrt(3.0), rel=1e-3)

    def test_high_wind_follows_primary_formula_without_cap(self):
        alpha = calc_alpha_vnesh(wind_speed=34.0, placement="outdoor")
        assert alpha == pytest.approx(11.6 + 7.0 * math.sqrt(34.0))

    def test_alpha_in_range(self):
        for v in [0, 1, 5, 10, 20]:
            alpha = calc_alpha_vnesh(wind_speed=v, placement="outdoor")
            assert 11.6 <= alpha <= 52.0

    def test_higher_wind_higher_alpha(self):
        a1 = calc_alpha_vnesh(wind_speed=2.0, placement="outdoor")
        a2 = calc_alpha_vnesh(wind_speed=8.0, placement="outdoor")
        assert a2 > a1

    def test_explicit_alpha_overrides_wind(self):
        params = _params(wind_speed=20.0, alpha_vnesh=15.0)
        r = calc_pipe_heat_loss(params)
        # При alpha=15 потери меньше чем при alpha от v=20 (~48 Вт/м²К)
        params_high_alpha = _params(wind_speed=20.0)  # α ≈ 42.9 Вт/(м²·К)
        r_high = calc_pipe_heat_loss(params_high_alpha)
        assert r.heat_loss_per_meter_base < r_high.heat_loss_per_meter_base


# ---------------------------------------------------------------------------
# Валидация параметров (схема)
# ---------------------------------------------------------------------------


class TestSchemaValidation:
    def test_negative_diameter_rejected(self):
        from pydantic import ValidationError

        with pytest.raises(ValidationError):
            PipeHeatLossParams(
                outer_diameter=-0.1,
                wall_thickness=0.004,
                pipe_material="carbon_steel",
                insulation_layers=[
                    InsulationLayer(thickness=0.05, material="mineral_wool_boards_120")
                ],
                insulation_temperature_basis="outdoor_winter",
                ambient_temperature=-30,
                process_temperature=150,
                pipe_length=100,
                placement="outdoor",
                wind_speed=0.0,
            )

    def test_diameter_below_minimum_rejected(self):
        from pydantic import ValidationError

        with pytest.raises(ValidationError):
            _params(outer_diameter=0.005)  # меньше 0.0108

    def test_ambient_temperature_too_cold_rejected(self):
        from pydantic import ValidationError

        with pytest.raises(ValidationError):
            _params(ambient_temperature=-80.0)  # меньше -70°C

    def test_process_temperature_too_hot_rejected(self):
        from pydantic import ValidationError

        with pytest.raises(ValidationError):
            _params(process_temperature=700.0)  # больше 600°C

    def test_pipe_length_too_short_rejected(self):
        from pydantic import ValidationError

        with pytest.raises(ValidationError):
            _params(pipe_length=0.005)  # меньше 0.5 м (минимум по SRS)

    def test_temperature_inversion_raises(self):
        # Оба в допустимом диапазоне схемы, но T_os > T_zh
        with pytest.raises(ValueError, match="температуры"):
            calc_pipe_heat_loss(_params(ambient_temperature=50, process_temperature=40))

    def test_no_insulation_raises(self):
        from pydantic import ValidationError

        with pytest.raises(ValidationError):
            PipeHeatLossParams(
                outer_diameter=0.108,
                wall_thickness=0.004,
                pipe_material="carbon_steel",
                ambient_temperature=-30,
                process_temperature=150,
                pipe_length=100,
                placement="outdoor",
                wind_speed=0.0,
            )

    def test_unknown_insulation_raises(self):
        from pydantic import ValidationError

        with pytest.raises(ValidationError, match="Неизвестный материал"):
            _params(
                insulation_layers=[InsulationLayer(thickness=0.05, material="unobtanium")]
            )
