"""Unit-тесты расчёта теплопотерь ёмкости.

Покрытие:
- Базовые свойства (знак, монотонность)
- Площадь поверхности для всех форм
- Новая формула: q = ΔT / (δ_р/λ_р + δ_из/λ_из + 1/α)
- Влияние стенки резервуара (wall_thickness / wall_lambda)
- Коэффициент наружной теплоотдачи α = 11,6 + 7·v
- Коэффициент запаса K
- Параметры indoor / outdoor
- Валидация входных данных
"""

import math

import pytest

from app.formulas.heat_loss.tank import _calc_alpha, calc_tank_heat_loss
from app.schemas.calculation import InsulationLayer, TankHeatLossParams

# ---------------------------------------------------------------------------
# Фабрика параметров
# ---------------------------------------------------------------------------


def _cyl(**o) -> TankHeatLossParams:
    base = {
        "shape": "cylindrical",
        "diameter": 2.0,
        "height": 3.0,
        "insulation_thickness": 0.1,
        "insulation_material": "mineral_wool",
        "ambient_temperature": -20.0,
        "process_temperature": 80.0,
    }
    base.update(o)
    return TankHeatLossParams(**base)


# ---------------------------------------------------------------------------
# Площадь поверхности
# ---------------------------------------------------------------------------


class TestSurfaceArea:
    def test_cylindrical(self):
        r = calc_tank_heat_loss(_cyl(diameter=2.0, height=3.0))
        expected = math.pi * 2.0 * 3.0 + 2 * math.pi * 1.0**2
        assert r.surface_area == pytest.approx(expected, rel=1e-3)

    def test_rectangular(self):
        params = TankHeatLossParams(
            shape="rectangular",
            length=4.0,
            width=2.0,
            height=2.0,
            insulation_thickness=0.1,
            insulation_material="mineral_wool",
            ambient_temperature=-20,
            process_temperature=80,
        )
        r = calc_tank_heat_loss(params)
        # 2*(L*W + L*H + W*H) = 2*(8+8+4) = 40
        assert r.surface_area == pytest.approx(40.0, rel=1e-3)

    def test_spherical(self):
        params = TankHeatLossParams(
            shape="spherical",
            diameter=3.0,
            insulation_thickness=0.1,
            insulation_material="mineral_wool",
            ambient_temperature=-20,
            process_temperature=80,
        )
        r = calc_tank_heat_loss(params)
        assert r.surface_area == pytest.approx(4 * math.pi * 1.5**2, rel=1e-3)

    def test_rectangular_requires_dimensions(self):
        with pytest.raises(ValueError, match="параллелепипед"):
            calc_tank_heat_loss(
                TankHeatLossParams(
                    shape="rectangular",
                    insulation_thickness=0.1,
                    insulation_material="mineral_wool",
                    ambient_temperature=-20,
                    process_temperature=80,
                )
            )


# ---------------------------------------------------------------------------
# Формула q = ΔT / (r_wall + r_ins + r_ext)
# ---------------------------------------------------------------------------


class TestHeatLossFormula:
    def test_positive_result(self):
        r = calc_tank_heat_loss(_cyl())
        assert r.heat_loss_per_m2 > 0
        assert r.total_heat_loss > 0

    def test_manual_calculation_no_wall(self):
        """Проверяем q вручную: только изоляция + внешнее (без стенки)."""
        from app.reference_data.loader import get_insulation_conductivity

        params = _cyl(insulation_thickness=0.08, wind_speed=0.0)
        # α = 11.6 + 7*0 = 11.6
        alpha = 11.6
        r_ext = 1.0 / alpha
        lam = get_insulation_conductivity("mineral_wool", (-20 + 80) / 2)
        r_ins = 0.08 / lam
        delta_t = 80 - (-20)
        expected_q = delta_t / (r_ins + r_ext)
        # K=1.1 (default)
        r = calc_tank_heat_loss(params)
        assert r.heat_loss_per_m2 == pytest.approx(expected_q, rel=0.01)

    def test_wall_resistance_reduces_heat_loss(self):
        """С учётом стенки потери должны быть меньше — добавляется сопротивление."""
        without_wall = calc_tank_heat_loss(_cyl())
        with_wall = calc_tank_heat_loss(_cyl(wall_thickness=0.008, wall_lambda=50.0))
        assert with_wall.heat_loss_per_m2 < without_wall.heat_loss_per_m2

    def test_three_insulation_layers_reduce_heat_loss(self):
        """Три слоя должны учитываться как сумма сопротивлений изоляции."""
        one_layer = calc_tank_heat_loss(_cyl(insulation_thickness=0.04))
        three_layers = calc_tank_heat_loss(
            _cyl(
                insulation_thickness=0.04,
                insulation_layers=[
                    InsulationLayer(thickness=0.04, material="mineral_wool"),
                    InsulationLayer(thickness=0.02, material="polyurethane"),
                    InsulationLayer(thickness=0.01, material="foam_glass"),
                ],
            )
        )
        assert three_layers.heat_loss_per_m2 < one_layer.heat_loss_per_m2

    def test_wall_resistance_manual(self):
        """q с учётом стенки."""
        from app.reference_data.loader import get_insulation_conductivity

        params = _cyl(
            insulation_thickness=0.08, wind_speed=0.0, wall_thickness=0.008, wall_lambda=50.0
        )
        alpha = 11.6
        r_wall = 0.008 / 50.0
        lam = get_insulation_conductivity("mineral_wool", 30.0)
        r_ins = 0.08 / lam
        r_ext = 1.0 / alpha
        delta_t = 100.0
        expected_q = delta_t / (r_wall + r_ins + r_ext)
        r = calc_tank_heat_loss(params)
        assert r.heat_loss_per_m2 == pytest.approx(expected_q, rel=0.01)


# ---------------------------------------------------------------------------
# Коэффициент теплоотдачи α = 11,6 + 7·v
# ---------------------------------------------------------------------------


class TestAlpha:
    def test_still_air_outdoor(self):
        # α = 11.6 + 7*0 = 11.6
        alpha = _calc_alpha(_cyl(wind_speed=0.0))
        assert alpha == pytest.approx(11.6)

    def test_wind_3ms(self):
        alpha = _calc_alpha(_cyl(wind_speed=3.0))
        assert alpha == pytest.approx(11.6 + 7.0 * 3.0, rel=1e-3)

    def test_indoor_fixed(self):
        alpha = _calc_alpha(_cyl(location="indoor"))
        assert alpha == pytest.approx(9.0)

    def test_capped_at_52(self):
        alpha = _calc_alpha(_cyl(wind_speed=20.0))
        assert alpha == pytest.approx(52.0)

    def test_higher_wind_higher_losses(self):
        """Больше ветра → меньше R_ext → больше теплопотерь."""
        low = calc_tank_heat_loss(_cyl(wind_speed=0.0))
        high = calc_tank_heat_loss(_cyl(wind_speed=5.0))
        assert high.heat_loss_per_m2 > low.heat_loss_per_m2

    def test_indoor_less_than_outdoor(self):
        indoor = calc_tank_heat_loss(_cyl(location="indoor"))
        outdoor = calc_tank_heat_loss(_cyl(location="outdoor", wind_speed=0.0))
        # indoor α=9.0, outdoor α=11.6 → indoor R_ext больше → потери меньше
        assert indoor.heat_loss_per_m2 < outdoor.heat_loss_per_m2


# ---------------------------------------------------------------------------
# Коэффициент запаса K
# ---------------------------------------------------------------------------


class TestSafetyFactor:
    def test_default_k_applied(self):
        """Без явного K используется 1.1 из DEFAULT_COEFFICIENTS."""
        r_no_k = calc_tank_heat_loss(_cyl())
        area = r_no_k.surface_area
        # q * area * 1.1 == total_heat_loss
        assert r_no_k.total_heat_loss == pytest.approx(
            r_no_k.heat_loss_per_m2 * area * 1.1, rel=1e-3
        )

    def test_explicit_k(self):
        r_k11 = calc_tank_heat_loss(_cyl(safety_factor=1.1))
        r_k15 = calc_tank_heat_loss(_cyl(safety_factor=1.5))
        assert r_k15.total_heat_loss == pytest.approx(r_k11.total_heat_loss * (1.5 / 1.1), rel=1e-3)

    def test_larger_k_larger_total(self):
        r1 = calc_tank_heat_loss(_cyl())
        r2 = calc_tank_heat_loss(_cyl(), coefficients={"safety_factor": 1.3})
        assert r2.total_heat_loss > r1.total_heat_loss


# ---------------------------------------------------------------------------
# Монотонность
# ---------------------------------------------------------------------------


class TestMonotonicity:
    def test_thicker_insulation_reduces_losses(self):
        thin = calc_tank_heat_loss(_cyl(insulation_thickness=0.05))
        thick = calc_tank_heat_loss(_cyl(insulation_thickness=0.20))
        assert thick.heat_loss_per_m2 < thin.heat_loss_per_m2

    def test_higher_delta_t_more_losses(self):
        small = calc_tank_heat_loss(_cyl(process_temperature=50.0))
        large = calc_tank_heat_loss(_cyl(process_temperature=150.0))
        assert large.heat_loss_per_m2 > small.heat_loss_per_m2

    def test_total_proportional_to_area(self):
        """Одинаковый цилиндр но вдвое выше → примерно вдвое больше площадь."""
        r_h3 = calc_tank_heat_loss(_cyl(height=3.0))
        r_h6 = calc_tank_heat_loss(_cyl(height=6.0))
        # q/m2 одинаковый, площадь разная
        assert r_h3.heat_loss_per_m2 == pytest.approx(r_h6.heat_loss_per_m2, rel=0.05)
        assert r_h6.total_heat_loss > r_h3.total_heat_loss


# ---------------------------------------------------------------------------
# Валидация
# ---------------------------------------------------------------------------


class TestValidation:
    def test_zero_insulation_raises(self):
        with pytest.raises(ValueError):
            calc_tank_heat_loss(_cyl(insulation_thickness=0))

    def test_process_below_ambient_raises(self):
        with pytest.raises(ValueError):
            calc_tank_heat_loss(_cyl(process_temperature=-30.0, ambient_temperature=20.0))

    def test_zero_wall_lambda_not_applied(self):
        """Если wall_lambda не задана — стенка игнорируется."""
        without = calc_tank_heat_loss(_cyl())
        with_thickness_only = calc_tank_heat_loss(_cyl(wall_thickness=0.01))
        # wall_lambda=None → стенка не учитывается → результат одинаковый
        assert without.heat_loss_per_m2 == pytest.approx(
            with_thickness_only.heat_loss_per_m2, rel=1e-6
        )
