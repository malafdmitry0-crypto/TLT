"""Критические edge-cases теплопотерь — границы диапазонов из SRS.

Цена ошибки: расчёт для редкого случая на границе допустимых диапазонов даст бред →
инженер построит обогрев на бредовых данных → авария.

Покрываем границы SRS:
  d_tp:  0.0108 - 3.0 м
  T_zh:  -90 - +600 °C
  T_os:  -70 - +70 °C
  delta_iz: 0.001 - 0.5 м
  L:     0.5 - 200000 м
"""

import math

import pytest

from app.formulas.heat_loss.pipe import calc_pipe_heat_loss
from app.formulas.heat_loss.tank import calc_tank_heat_loss
from app.schemas.heat_loss import InsulationLayer, PipeHeatLossParams, TankHeatLossParams

MINERAL_WOOL = "mineral_wool_boards_120"
LOW_LAMBDA_INSULATION = "polyurethane_products_40"


def _pipe(**kw):
    base = dict(
        outer_diameter=0.108,
        wall_thickness=0.004,
        pipe_material="carbon_steel",
        insulation_layers=[InsulationLayer(thickness=0.05, material=MINERAL_WOOL)],
        insulation_temperature_basis="outdoor_winter",
        ambient_temperature=-20.0,
        process_temperature=80.0,
        pipe_length=50.0,
        placement="outdoor",
        wind_speed=0.0,
    )
    base.update(kw)
    return PipeHeatLossParams(**base)


def _tank(**kw):
    base = dict(
        shape="cylindrical",
        diameter=2.0,
        height=3.0,
        insulation_layers=[InsulationLayer(thickness=0.08, material=MINERAL_WOOL)],
        insulation_temperature_basis="outdoor_winter",
        ambient_temperature=-20.0,
        process_temperature=80.0,
        placement="outdoor",
        wind_speed=0.0,
        safety_factor=1.1,
    )
    base.update(kw)
    return TankHeatLossParams(**base)


class TestPipeBoundaries:
    """Граничные диаметры/длины/температуры по SRS."""

    def test_min_diameter_dn10(self):
        """0.0108м (минимальная DN10) — нижняя граница."""
        r = calc_pipe_heat_loss(_pipe(outer_diameter=0.0108))
        assert r.heat_loss_per_meter_base > 0
        assert math.isfinite(r.total_heat_loss_design)
        assert math.isfinite(r.thermal_resistance)
        assert r.thermal_resistance > 0

    def test_max_diameter_3m(self):
        """3.0м (магистральная труба) — верхняя граница."""
        r = calc_pipe_heat_loss(_pipe(outer_diameter=3.0))
        assert r.heat_loss_per_meter_base > 0
        assert math.isfinite(r.total_heat_loss_design)

    def test_min_pipe_length(self):
        """Полметра — техническая минимальная длина. Учтён safety_factor."""
        r = calc_pipe_heat_loss(_pipe(pipe_length=0.5, safety_factor=1.1))
        # total = q × L × K  (safety_factor ≈1.1)
        assert r.total_heat_loss_design == pytest.approx(
            r.heat_loss_per_meter_base * 0.5 * 1.1, rel=0.01
        )

    def test_max_pipe_length_no_overflow(self):
        """200 км — верхняя граница ТНП. Не должно быть overflow."""
        r = calc_pipe_heat_loss(_pipe(pipe_length=200_000.0))
        assert math.isfinite(r.total_heat_loss_design)
        assert r.total_heat_loss_design > 0


class TestPipeTemperatureExtremes:
    """Экстремальные T — криогеника (LNG -160°C) и пар (300°C)."""

    def test_cryogenic_rejected_by_formula(self):
        """Криогеника (продукт < среды) — формула отклоняет.
        Такие задачи требуют отдельной формулы (приток тепла, не потери)."""
        with pytest.raises(ValueError, match="выше|температур"):
            calc_pipe_heat_loss(
                _pipe(
                    ambient_temperature=20,
                    process_temperature=-50,
                )
            )

    def test_steam_high_process(self):
        """Пар при 300°C → большие теплопотери."""
        r = calc_pipe_heat_loss(
            _pipe(
                ambient_temperature=-30,
                process_temperature=300,
            )
        )
        assert r.heat_loss_per_meter_base > 50  # Большая дельта → большие потери

    def test_arctic_extreme_ambient(self):
        """Граница ТНП: -70°C среда, 80°C продукт."""
        r = calc_pipe_heat_loss(
            _pipe(
                ambient_temperature=-70,
                process_temperature=80,
            )
        )
        assert r.heat_loss_per_meter_base > 0

    def test_zero_delta_t_rejected_by_formula(self):
        """ΔT=0 — формула отклоняет."""
        with pytest.raises(ValueError, match="выше|температур"):
            calc_pipe_heat_loss(
                _pipe(
                    ambient_temperature=20,
                    process_temperature=20,
                )
            )


class TestPipeInsulationExtremes:
    """Толщина изоляции на границах."""

    def test_thin_insulation_10mm(self):
        """Минимальная промышленная толщина — 10мм."""
        thin = calc_pipe_heat_loss(
            _pipe(insulation_layers=[InsulationLayer(thickness=0.01, material=MINERAL_WOOL)])
        )
        thick = calc_pipe_heat_loss(
            _pipe(insulation_layers=[InsulationLayer(thickness=0.2, material=MINERAL_WOOL)])
        )
        # Толстая изоляция → меньше теплопотерь (физический инвариант)
        assert (
            thick.heat_loss_per_meter_base < thin.heat_loss_per_meter_base
        ), "ФИЗИКА СЛОМАНА: толстая изоляция теплее тонкой?"

    def test_extreme_insulation_500mm(self):
        """Полметра изоляции (теплоэлектростанции)."""
        r = calc_pipe_heat_loss(
            _pipe(insulation_layers=[InsulationLayer(thickness=0.5, material=MINERAL_WOOL)])
        )
        assert r.heat_loss_per_meter_base > 0
        assert math.isfinite(r.heat_loss_per_meter_base)


class TestPipePhysicalInvariants:
    """Инварианты, нарушение которых = неправильная физика."""

    def test_doubling_length_doubles_total_loss(self):
        """Q_total линейно зависит от длины."""
        r1 = calc_pipe_heat_loss(_pipe(pipe_length=100))
        r2 = calc_pipe_heat_loss(_pipe(pipe_length=200))
        assert r2.total_heat_loss_design == pytest.approx(r1.total_heat_loss_design * 2, rel=0.01)

    def test_safety_factor_increases_total(self):
        """K на params увеличивает total."""
        r0 = calc_pipe_heat_loss(_pipe(safety_factor=1.0))
        r1 = calc_pipe_heat_loss(_pipe(safety_factor=1.5))
        assert r1.total_heat_loss_design > r0.total_heat_loss_design

    def test_higher_lambda_lowers_resistance(self):
        """Лучший проводник изоляции (выше λ) → меньше R → больше Q."""
        # Конкретные selectable-коды: ППУ имеет меньшую λ(tm), чем минвата ρ120.
        mw = calc_pipe_heat_loss(
            _pipe(insulation_layers=[InsulationLayer(thickness=0.05, material=MINERAL_WOOL)])
        )
        pu = calc_pipe_heat_loss(
            _pipe(
                insulation_layers=[InsulationLayer(thickness=0.05, material=LOW_LAMBDA_INSULATION)]
            )
        )
        # ППУ изолирует лучше → меньше потерь
        assert (
            pu.heat_loss_per_meter_base < mw.heat_loss_per_meter_base
        ), "ФИЗИКА СЛОМАНА: ППУ хуже минваты?"


class TestTankShapeBoundaries:
    """Резервуары на крайних формах/размерах."""

    def test_small_cylindrical_tank(self):
        r = calc_tank_heat_loss(_tank(diameter=0.5, height=1.0))
        assert r.total_heat_loss_design > 0

    def test_large_rectangular_tank(self):
        r = calc_tank_heat_loss(
            _tank(
                shape="rectangular",
                length=10.0,
                width=3.0,
                height=5.0,
                diameter=None,
            )
        )
        assert r.total_heat_loss_design > 0


class TestTankPhysicalInvariants:
    def test_safety_factor_applies_to_tank(self):
        r0 = calc_tank_heat_loss(_tank(safety_factor=1.0))
        r1 = calc_tank_heat_loss(_tank(safety_factor=1.3))
        assert r1.total_heat_loss_design > r0.total_heat_loss_design

    def test_zero_delta_t_rejected_for_tank(self):
        with pytest.raises(ValueError):
            calc_tank_heat_loss(
                _tank(
                    ambient_temperature=50,
                    process_temperature=50,
                )
            )
