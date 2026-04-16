"""Property-based / метаморфные тесты для расчёта теплопотерь резервуара.

Методология та же, что в test_pipe_properties.py:
- Метаморфические соотношения
- BVA на формы и геометрию
- Golden tests из formules.md (плоская стенка)
"""

from __future__ import annotations

import math

import pytest
from pydantic import ValidationError

from app.formulas.heat_loss.tank import calc_tank_heat_loss
from app.schemas.calculation import TankHeatLossParams


def _cyl(**o) -> TankHeatLossParams:
    defaults = dict(
        shape="cylindrical",
        diameter=2.0,
        height=3.0,
        insulation_thickness=0.08,
        insulation_material="mineral_wool",
        ambient_temperature=-20.0,
        process_temperature=80.0,
        location="outdoor",
        safety_factor=1.1,
    )
    defaults.update(o)
    return TankHeatLossParams(**defaults)


def _rect(**o) -> TankHeatLossParams:
    defaults = dict(
        shape="rectangular",
        length=5.0,
        width=3.0,
        height=4.0,
        insulation_thickness=0.08,
        insulation_material="mineral_wool",
        ambient_temperature=-20.0,
        process_temperature=80.0,
        location="outdoor",
        safety_factor=1.1,
    )
    defaults.update(o)
    return TankHeatLossParams(**defaults)


def _sph(**o) -> TankHeatLossParams:
    defaults = dict(
        shape="spherical",
        diameter=1.5,
        insulation_thickness=0.06,
        insulation_material="mineral_wool",
        ambient_temperature=-20.0,
        process_temperature=60.0,
        location="outdoor",
        safety_factor=1.1,
    )
    defaults.update(o)
    return TankHeatLossParams(**defaults)


# ═══════════════════════════════════════════════════════════════════════════
# 1. ФОРМУЛЫ ПЛОЩАДЕЙ — ТОЧНЫЕ ЗНАЧЕНИЯ
# ═══════════════════════════════════════════════════════════════════════════


class TestSurfaceAreaFormulas:
    """Проверяем формулы S для всех форм — это критично для Q = q·S·K."""

    def test_cylinder_area_formula(self):
        """S = π·d·H + 2·π·(d/2)²"""
        r = calc_tank_heat_loss(_cyl(diameter=2.0, height=3.0))
        # Боковая: π·2·3 = 6π ≈ 18.85
        # Донышки: 2·π·1² = 2π ≈ 6.28
        expected = math.pi * 2.0 * 3.0 + 2 * math.pi * (1.0) ** 2
        assert r.surface_area == pytest.approx(expected, rel=1e-3)

    def test_rectangular_area_formula(self):
        """S = 2·(L·W + L·H + W·H) = 2·(15+20+12) = 94 м² при 5×3×4."""
        r = calc_tank_heat_loss(_rect(length=5, width=3, height=4))
        assert r.surface_area == pytest.approx(94.0, rel=1e-3)

    def test_sphere_area_formula(self):
        """S = 4·π·r² = π·d² при d=1.5 → π·2.25 ≈ 7.069 м²."""
        r = calc_tank_heat_loss(_sph(diameter=1.5))
        expected = 4 * math.pi * (1.5 / 2) ** 2
        assert r.surface_area == pytest.approx(expected, rel=1e-3)
        # Эквивалентно π·d²
        assert r.surface_area == pytest.approx(math.pi * 1.5**2, rel=1e-3)


# ═══════════════════════════════════════════════════════════════════════════
# 2. МЕТАМОРФИЧЕСКИЕ ИНВАРИАНТЫ
# ═══════════════════════════════════════════════════════════════════════════


class TestMetamorphicTank:
    def test_total_loss_proportional_to_area(self):
        """MR: умножение размеров цилиндра на √2 → S ×2 → Q ×2 (q остаётся)."""
        r1 = calc_tank_heat_loss(_cyl(diameter=1.5, height=2.0))
        # Увеличим площадь ровно в 2 раза (домножим линейные размеры на √2)
        import math

        k = math.sqrt(2)
        r2 = calc_tank_heat_loss(_cyl(diameter=1.5 * k, height=2.0 * k))
        assert r2.surface_area == pytest.approx(2 * r1.surface_area, rel=1e-3)
        # q на м² не зависит от геометрии (плоская стенка)
        assert r2.heat_loss_per_m2 == pytest.approx(r1.heat_loss_per_m2, rel=1e-3)
        assert r2.total_heat_loss == pytest.approx(2 * r1.total_heat_loss, rel=1e-3)

    def test_q_per_m2_independent_of_shape_when_same_thermal_config(self):
        """q на м² — это свойство стенки (ΔT, изоляция, α), не зависит от формы."""
        # Одинаковые: δ_из, материал, T, местоположение, v
        r_cyl = calc_tank_heat_loss(
            _cyl(
                diameter=2,
                height=3,
                insulation_thickness=0.1,
                ambient_temperature=-10,
                process_temperature=70,
            )
        )
        r_rect = calc_tank_heat_loss(
            _rect(
                length=4,
                width=3,
                height=2,
                insulation_thickness=0.1,
                ambient_temperature=-10,
                process_temperature=70,
            )
        )
        r_sph = calc_tank_heat_loss(
            _sph(
                diameter=2,
                insulation_thickness=0.1,
                ambient_temperature=-10,
                process_temperature=70,
            )
        )
        # q на м² одинаковое для всех трёх форм — формула плоской стенки
        assert r_cyl.heat_loss_per_m2 == pytest.approx(r_rect.heat_loss_per_m2, rel=1e-3)
        assert r_cyl.heat_loss_per_m2 == pytest.approx(r_sph.heat_loss_per_m2, rel=1e-3)

    def test_thicker_insulation_reduces_q(self):
        q_thin = calc_tank_heat_loss(_cyl(insulation_thickness=0.02)).heat_loss_per_m2
        q_thick = calc_tank_heat_loss(_cyl(insulation_thickness=0.15)).heat_loss_per_m2
        assert q_thick < q_thin

    @pytest.mark.parametrize("v", [0, 1, 3, 5, 10])
    def test_wind_monotonically_increases_q(self, v):
        """∂q/∂v ≥ 0."""
        q_calm = calc_tank_heat_loss(_cyl(wind_speed=0)).heat_loss_per_m2
        q_windy = calc_tank_heat_loss(_cyl(wind_speed=v)).heat_loss_per_m2
        assert q_windy >= q_calm - 1e-6

    def test_indoor_less_than_outdoor(self):
        q_indoor = calc_tank_heat_loss(_cyl(location="indoor")).heat_loss_per_m2
        q_outdoor = calc_tank_heat_loss(_cyl(location="outdoor", wind_speed=0)).heat_loss_per_m2
        assert q_indoor < q_outdoor

    def test_safety_factor_scales_only_total(self):
        """K влияет на Q, не на q. Диапазон ТЗ: 1.05…1.7."""
        r1 = calc_tank_heat_loss(_cyl(safety_factor=1.1))
        r2 = calc_tank_heat_loss(_cyl(safety_factor=1.65))
        assert r2.heat_loss_per_m2 == pytest.approx(r1.heat_loss_per_m2, rel=1e-6)
        assert r2.total_heat_loss == pytest.approx((1.65 / 1.1) * r1.total_heat_loss, rel=1e-3)

    def test_wall_resistance_reduces_loss(self):
        """Если указать стенку с низкой λ — q уменьшится."""
        q_no_wall = calc_tank_heat_loss(_cyl()).heat_loss_per_m2
        q_with_wall = calc_tank_heat_loss(
            _cyl(
                wall_thickness=0.01,
                wall_lambda=0.5,  # "плохой" металл
            )
        ).heat_loss_per_m2
        assert q_with_wall < q_no_wall


# ═══════════════════════════════════════════════════════════════════════════
# 3. GOLDEN — пример из formules.md
# ═══════════════════════════════════════════════════════════════════════════


class TestGoldenTankFromDocs:
    def test_cylinder_example_from_formules_md(self):
        """Пример из formules.md: цил, δ=0.08, λ=0.045, v=0, ΔT=100°C.

        Ожидание: q ≈ 53.6 Вт/м²  (1/11.6 + 0.08/0.045 = 0.086 + 1.778 = 1.864 м²·К/Вт)
        """
        r = calc_tank_heat_loss(
            _cyl(
                insulation_thickness=0.08,
                insulation_material="mineral_wool",  # λ ≈ 0.045
                ambient_temperature=-20,
                process_temperature=80,
                wind_speed=0,
                location="outdoor",
                wall_thickness=None,
                wall_lambda=None,
            )
        )
        # q ≈ 53.6 Вт/м² ±15%
        assert r.heat_loss_per_m2 == pytest.approx(53.6, rel=0.15)


# ═══════════════════════════════════════════════════════════════════════════
# 4. BVA / ОТКАЗЫ
# ═══════════════════════════════════════════════════════════════════════════


class TestTankValidation:
    def test_cylinder_missing_diameter_raises(self):
        """Для цилиндра требуются diameter и height."""
        with pytest.raises(ValueError, match="цилиндр"):
            calc_tank_heat_loss(
                TankHeatLossParams(
                    shape="cylindrical",
                    height=3.0,
                    insulation_thickness=0.05,
                    insulation_material="mineral_wool",
                    ambient_temperature=-20,
                    process_temperature=80,
                )
            )

    def test_cylinder_missing_height_raises(self):
        with pytest.raises(ValueError, match="цилиндр"):
            calc_tank_heat_loss(
                TankHeatLossParams(
                    shape="cylindrical",
                    diameter=2.0,
                    insulation_thickness=0.05,
                    insulation_material="mineral_wool",
                    ambient_temperature=-20,
                    process_temperature=80,
                )
            )

    def test_rectangular_missing_dimension_raises(self):
        """Для параллелепипеда требуются length, width, height."""
        with pytest.raises(ValueError, match="параллелепипед"):
            calc_tank_heat_loss(
                TankHeatLossParams(
                    shape="rectangular",
                    length=5.0,
                    width=3.0,  # height отсутствует
                    insulation_thickness=0.05,
                    insulation_material="mineral_wool",
                    ambient_temperature=-20,
                    process_temperature=80,
                )
            )

    def test_sphere_missing_diameter_raises(self):
        with pytest.raises(ValueError, match="сфер"):
            calc_tank_heat_loss(
                TankHeatLossParams(
                    shape="spherical",
                    insulation_thickness=0.05,
                    insulation_material="mineral_wool",
                    ambient_temperature=-20,
                    process_temperature=80,
                )
            )

    def test_unknown_shape_rejected_by_pydantic(self):
        with pytest.raises(ValidationError):
            TankHeatLossParams(
                shape="pyramid",  # нет в Literal
                diameter=1.0,
                insulation_thickness=0.05,
                insulation_material="mineral_wool",
                ambient_temperature=-20,
                process_temperature=80,
            )

    def test_process_below_ambient_raises(self):
        with pytest.raises(ValueError, match="выше"):
            calc_tank_heat_loss(_cyl(ambient_temperature=60, process_temperature=40))

    def test_invalid_wall_lambda_rejected(self):
        """Pydantic отвергает wall_lambda=0 (constraint gt=0)."""
        with pytest.raises(ValidationError):
            _cyl(wall_thickness=0.01, wall_lambda=0)

    def test_invalid_wall_thickness_rejected(self):
        """Pydantic отвергает толщину стенки 0 (constraint ge=0.001)."""
        with pytest.raises(ValidationError):
            _cyl(wall_thickness=0, wall_lambda=50)

    def test_insulation_thickness_bva(self):
        """δ_из > 0 обязательно."""
        from pydantic import ValidationError as VE

        # Нулевая толщина — отклоняется Pydantic (ge=0.001)
        with pytest.raises(VE):
            _cyl(insulation_thickness=0)
