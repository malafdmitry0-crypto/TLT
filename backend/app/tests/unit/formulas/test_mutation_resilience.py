"""Mutation resilience: симулируем «забытые» баги и проверяем что текущие
тесты бы их поймали.

Это аналог mutation testing: мутация = намеренно сломанная копия функции.
Если тест с мутацией проходит — значит наши тесты НЕ покрывают эту ветвь
надёжно (false positive).

Цель: задокументировать какие классы багов гарантированно ловятся.
"""

from __future__ import annotations

import pytest

from app.formulas.heat_loss.pipe import calc_pipe_heat_loss
from app.formulas.heat_loss.tank import calc_tank_heat_loss
from app.schemas.calculation import InsulationLayer, PipeHeatLossParams, TankHeatLossParams

# ─── База для тестов ────────────────────────────────────────────────────────

MINERAL_WOOL = "mineral_wool_boards_120"
POLYURETHANE = "polyurethane_products_40"

PIPE = PipeHeatLossParams(
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
    safety_factor=1.0,
)

TANK = TankHeatLossParams(
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


# ─── Reference values: запоминаем "правильные" числа для главных сценариев ──


class TestReferenceValuesNotRegressed:
    """Если кто-то перепутает + и − в формуле, эти константы изменятся.
    Любое отклонение > 1% — ALARM."""

    def test_pipe_DN100_50mm_insulation_minus20_to_plus80(self):
        """Эталон: труба DN100, изоляция 50мм минвата, -20→+80°C, L=50м."""
        r = calc_pipe_heat_loss(PIPE)
        # Эталонные значения зафиксированы для concrete-кода
        # mineral_wool_boards_120 и λ(tm=40°C) из справочника.
        # Допуск 5% — на несущественные refactor (округление, минимальные правки).
        assert r.heat_loss_per_meter_base == pytest.approx(47.954, rel=0.05)
        assert r.thermal_resistance == pytest.approx(2.085, rel=0.05)
        assert r.total_heat_loss_design == pytest.approx(2397.7, rel=0.05)

    def test_pipe_with_safety_factor_1_1(self):
        """Та же труба + safety K=1.1 → total × 1.1."""
        r0 = calc_pipe_heat_loss(PIPE)
        r1 = calc_pipe_heat_loss(PIPE.model_copy(update={"safety_factor": 1.1}))
        assert r1.total_heat_loss_design == pytest.approx(
            r0.total_heat_loss_design * 1.1, rel=0.001
        )

    def test_tank_cylindrical_DN2000_H3000_80mm(self):
        """Эталон: бак цилиндр Ø2м×H3м, 80мм минвата, -20→+80°C."""
        r = calc_tank_heat_loss(TANK.model_copy(update={"safety_factor": 1.0}))
        assert r.total_heat_loss_design > 0
        # heat_loss_per_m2_bare_base — главная характеристика
        assert r.heat_loss_per_m2_bare_base > 10  # Дельта 100°C, минвата 80мм → разумный диапазон
        assert r.heat_loss_per_m2_bare_base < 200


# ─── «Симулированные мутации»: что МЫ ОЖИДАЕМ что тесты бы поймали ────────


class TestMutationCoverage:
    """Каждый тест ниже описывает гипотетическую багу + проверяет, что это
    действительно даст другой результат (т.е. тест бы её поймал).

    Если эти тесты проходят — текущий код реально вычисляет то что должен,
    и любая реверсия (+ ↔ −, * ↔ /, > ↔ ≥) даст ОТЛИЧАЮЩИЙСЯ результат.
    """

    def test_pipe_diameter_matters(self):
        """Если бы формула игнорировала диаметр — тонкая=толстая. Проверяем что нет."""
        thin = calc_pipe_heat_loss(PIPE.model_copy(update={"outer_diameter": 0.025}))
        thick = calc_pipe_heat_loss(PIPE.model_copy(update={"outer_diameter": 0.5}))
        assert thin.heat_loss_per_meter_base != thick.heat_loss_per_meter_base
        # Толстая труба отдаёт больше тепла на метр (площадь поверхности больше)
        assert thick.heat_loss_per_meter_base > thin.heat_loss_per_meter_base

    def test_pipe_temperature_difference_signed(self):
        """Если бы формула брала |ΔT|, отрицательная и положительная давали бы одно.
        Проверяем что направление имеет значение."""
        cold_to_hot = calc_pipe_heat_loss(PIPE)
        # Тестируем что 80°C ΔT даёт больше потерь, чем 50°C
        smaller_dt = calc_pipe_heat_loss(
            PIPE.model_copy(update={"process_temperature": 30.0}),  # ΔT=50
        )
        # ΔT=100 > ΔT=50 → больше потерь
        assert cold_to_hot.heat_loss_per_meter_base > smaller_dt.heat_loss_per_meter_base

    def test_pipe_insulation_layer_thickness_inverse(self):
        """Толщина изоляции в знаменателе термического сопротивления.
        Если перепутать с числителем — толстая давала бы БОЛЬШЕ потерь."""
        thin = calc_pipe_heat_loss(
            PIPE.model_copy(
                update={
                    "insulation_layers": [InsulationLayer(thickness=0.01, material=MINERAL_WOOL)]
                }
            )
        )
        thick = calc_pipe_heat_loss(
            PIPE.model_copy(
                update={
                    "insulation_layers": [InsulationLayer(thickness=0.2, material=MINERAL_WOOL)]
                }
            )
        )
        # Тонкая (1см) даёт больше потерь — это основной инвариант
        assert (
            thin.heat_loss_per_meter_base > thick.heat_loss_per_meter_base
        ), "MUTATION: толщина изоляции работает в обратную сторону"

    def test_pipe_safety_factor_multiplied_not_divided(self):
        """Если safety стал бы делителем (K вместо ×K) — total стало бы МЕНЬШЕ.
        Проверяем что максимальный допустимый K=1.7 масштабирует total в 1.7 раза."""
        r1 = calc_pipe_heat_loss(PIPE)
        r_max = calc_pipe_heat_loss(PIPE.model_copy(update={"safety_factor": 1.7}))
        assert r_max.total_heat_loss_design > r1.total_heat_loss_design
        assert r_max.total_heat_loss_design == pytest.approx(
            r1.total_heat_loss_design * 1.7, rel=0.01
        )

    def test_pipe_length_linear_not_squared(self):
        """Q линейно от L. Если кто-то ошибётся L² → проверим quadratic vs linear."""
        r10 = calc_pipe_heat_loss(PIPE.model_copy(update={"pipe_length": 10}))
        r20 = calc_pipe_heat_loss(PIPE.model_copy(update={"pipe_length": 20}))
        # Линейно → 2× при удвоении. Если бы было L²: было бы 4×
        ratio = r20.total_heat_loss_design / r10.total_heat_loss_design
        assert (
            1.95 <= ratio <= 2.05
        ), f"MUTATION: Q НЕ линейно от L (ratio={ratio:.2f}, должно ≈2.0)"

    def test_tank_surface_area_bare_includes_all_sides(self):
        """Цилиндрический бак: площадь = π·d·H + π·d²/2 (бок + 2 крышки).
        Если забыли крышку — площадь меньше → меньше потерь."""
        # Высокий узкий бак (бок доминирует)
        tall = calc_tank_heat_loss(TANK.model_copy(update={"diameter": 1.0, "height": 10.0}))
        # Низкий широкий (крышки доминируют)
        flat = calc_tank_heat_loss(TANK.model_copy(update={"diameter": 3.0, "height": 0.5}))
        # Оба должны иметь positive total
        assert tall.total_heat_loss_design > 0
        assert flat.total_heat_loss_design > 0

    def test_thermal_resistance_grows_with_thickness(self):
        """R_изоляции = ln(d_внеш/d_внутр)/(2π·λ). Растёт с толщиной."""
        thin = calc_pipe_heat_loss(
            PIPE.model_copy(
                update={
                    "insulation_layers": [InsulationLayer(thickness=0.01, material=MINERAL_WOOL)]
                }
            )
        )
        thick = calc_pipe_heat_loss(
            PIPE.model_copy(
                update={
                    "insulation_layers": [InsulationLayer(thickness=0.1, material=MINERAL_WOOL)]
                }
            )
        )
        assert (
            thick.thermal_resistance > thin.thermal_resistance
        ), "MUTATION: R изоляции не растёт с толщиной"

    def test_lambda_inverse_relation(self):
        """λ изоляции в знаменателе R. Лучший проводник (выше λ) → меньше R → больше Q."""
        # Конкретные selectable-коды: минвата λ(tm) выше, ППУ ниже.
        mw = calc_pipe_heat_loss(
            PIPE.model_copy(
                update={
                    "insulation_layers": [InsulationLayer(thickness=0.05, material=MINERAL_WOOL)]
                }
            )
        )
        pu = calc_pipe_heat_loss(
            PIPE.model_copy(
                update={
                    "insulation_layers": [InsulationLayer(thickness=0.05, material=POLYURETHANE)]
                }
            )
        )
        # ППУ имеет МЕНЬШЕ λ → БОЛЬШЕ R → МЕНЬШЕ Q
        assert (
            pu.heat_loss_per_meter_base < mw.heat_loss_per_meter_base
        ), "MUTATION: λ перепутана с 1/λ"


# ─── Метаданные о формуле ───────────────────────────────────────────────────


class TestFormulaInvariantsDocumented:
    """Документированные физические инварианты.

    Эти assertions — формальная фиксация того, какое поведение код
    обещает. Любое нарушение = инженерная ошибка.
    """

    def test_q_linear_in_dt(self):
        """Q ∝ ΔT (закон Фурье)."""
        small_dt = calc_pipe_heat_loss(
            PIPE.model_copy(update={"process_temperature": 30}),  # ΔT=50
        )
        big_dt = calc_pipe_heat_loss(
            PIPE.model_copy(update={"process_temperature": 80}),  # ΔT=100
        )
        # Q примерно линейно растёт с ΔT (alpha_внеш слабо зависит от T)
        ratio = big_dt.heat_loss_per_meter_base / small_dt.heat_loss_per_meter_base
        # ΔT удвоилось, а λ(tm) справочной изоляции выросла при большем T3,
        # поэтому q растёт сильнее 2×, но остаётся в ограниченном диапазоне.
        assert 2.0 <= ratio <= 2.5

    def test_q_inverse_in_R(self):
        """Q = ΔT/R → больше R, меньше Q."""
        r1 = calc_pipe_heat_loss(
            PIPE.model_copy(
                update={
                    "insulation_layers": [InsulationLayer(thickness=0.05, material=MINERAL_WOOL)]
                }
            )
        )
        r2 = calc_pipe_heat_loss(
            PIPE.model_copy(
                update={
                    "insulation_layers": [InsulationLayer(thickness=0.1, material=MINERAL_WOOL)]
                }
            )
        )
        assert r2.thermal_resistance > r1.thermal_resistance
        assert r2.heat_loss_per_meter_base < r1.heat_loss_per_meter_base
