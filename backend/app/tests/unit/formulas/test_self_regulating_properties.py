"""Property-based / метаморфные тесты автоподбора кабеля ТЛТ.

Расчёт электрической части — критично для безопасности: неправильно
подобранный кабель может перегреться или не компенсировать теплопотери.
"""

from __future__ import annotations

import pytest

from app.formulas.electrical.self_regulating import calc_self_regulating
from app.reference_data.loader import list_tlt_cables
from app.schemas.calculation import SelfRegulatingParams


def _p(**o) -> SelfRegulatingParams:
    defaults = dict(
        required_power_per_meter=20.0,
        cable_mark=None,  # по умолчанию автоподбор
        supply_voltage=220.0,
        ambient_temperature=-30.0,
        process_temperature=60.0,
        pipe_length=50.0,
        safety_factor=1.1,
    )
    defaults.update(o)
    return SelfRegulatingParams(**defaults)


# ═══════════════════════════════════════════════════════════════════════════
# МЕТАМОРФИЧЕСКИЕ ИНВАРИАНТЫ
# ═══════════════════════════════════════════════════════════════════════════


class TestMetamorphicElectrical:
    def test_order_cable_length_equals_pipe_length_times_1_1(self):
        """MR: L_заказ = L_расч × 1.1 (BR-CABLE-02)."""
        for L in (10, 50, 100, 500, 1000):
            r = calc_self_regulating(_p(pipe_length=L))
            assert r.cable_length == pytest.approx(L, rel=1e-6)
            assert r.order_cable_length == pytest.approx(L * 1.1, rel=1e-6)

    def test_current_equals_power_over_voltage(self):
        """MR: I = P_total / U (закон Ома)."""
        r = calc_self_regulating(
            _p(pipe_length=50, required_power_per_meter=30, supply_voltage=220)
        )
        assert r.current == pytest.approx(r.total_power / r.voltage, rel=1e-4)

    def test_total_power_equals_cable_power_times_length(self):
        """MR: P_total = P_кабеля × L_кабеля."""
        r = calc_self_regulating(_p(required_power_per_meter=20, pipe_length=50))
        # Найдём мощность выбранной марки в справочнике
        cables_by_mark = {c["model"]: c["power_per_meter"] for c in list_tlt_cables()}
        p_per_m = cables_by_mark[r.selected_cable]
        assert r.total_power == pytest.approx(p_per_m * r.cable_length, rel=1e-3)

    def test_total_power_linear_in_length(self):
        """MR: Удвоение длины трубы → удвоение P_total и I."""
        r1 = calc_self_regulating(_p(pipe_length=50))
        r2 = calc_self_regulating(_p(pipe_length=100))
        # Марка одна и та же (ничего не менялось кроме L)
        assert r1.selected_cable == r2.selected_cable
        assert r2.total_power == pytest.approx(2 * r1.total_power, rel=1e-6)
        assert r2.current == pytest.approx(2 * r1.current, rel=1e-6)

    def test_safety_factor_may_escalate_cable_choice(self):
        """↑K может переключить выбор на более мощный кабель."""
        # required=22 Вт/м, K=1.1 → 24.2 → ТЛТ-25
        r1 = calc_self_regulating(
            _p(
                required_power_per_meter=22,
                safety_factor=1.1,
                process_temperature=60,
                ambient_temperature=-20,
            )
        )
        # required=22, K=1.5 → 33 → ТЛТ-40
        r2 = calc_self_regulating(
            _p(
                required_power_per_meter=22,
                safety_factor=1.5,
                process_temperature=60,
                ambient_temperature=-20,
            )
        )
        # Второй выбор не слабее первого по мощности
        cables_by_mark = {c["model"]: c["power_per_meter"] for c in list_tlt_cables()}
        assert cables_by_mark[r2.selected_cable] >= cables_by_mark[r1.selected_cable]

    def test_auto_select_picks_minimally_sufficient(self):
        """Автоподбор — минимально-мощный из подходящих."""
        r = calc_self_regulating(
            _p(
                required_power_per_meter=11,
                safety_factor=1.0,  # req = 11
                process_temperature=50,
                ambient_temperature=-20,
            )
        )
        # ТЛТ-15 (15 Вт/м) — минимально-мощный ≥ 11, T_max=65 ≥ 50, T_min=-40 ≤ -20
        assert r.selected_cable == "ТЛТ-15"

    def test_auto_skip_cables_with_insufficient_tmax(self):
        """MR (регрессия): при T_продукта=100°C выбор исключает ТЛТ-10..30 (T_max=65-85)."""
        r = calc_self_regulating(
            _p(
                required_power_per_meter=5,
                safety_factor=1.1,  # req=5.5, но T_max важнее
                process_temperature=100,
                ambient_temperature=-20,
            )
        )
        # Первый кабель с T_max ≥ 100 — ТЛТ-40 (T_max=110)
        assert r.selected_cable == "ТЛТ-40"

    def test_auto_skip_cables_with_insufficient_tmin(self):
        """При T_среды=-58°C только ТЛТ-100 (T_min=-60) подходит."""
        r = calc_self_regulating(
            _p(
                required_power_per_meter=5,
                safety_factor=1.1,
                ambient_temperature=-58,
                process_temperature=40,
            )
        )
        assert r.selected_cable == "ТЛТ-100"

    # ── Ошибки автоподбора — диагностированные ────────────────────────────

    def test_error_message_distinguishes_power_from_tmax(self):
        """Разные ошибки для разных причин."""
        # Слишком мощно даже для 3 ниток
        with pytest.raises(ValueError, match="максимум линейки"):
            calc_self_regulating(
                _p(
                    required_power_per_meter=400,
                    process_temperature=50,
                    ambient_temperature=-20,
                )
            )
        # Слишком горячо
        with pytest.raises(ValueError, match="T продукта"):
            calc_self_regulating(
                _p(
                    required_power_per_meter=10,
                    process_temperature=200,  # > 150 (max T_max)
                    ambient_temperature=-20,
                )
            )
        # Слишком холодно
        with pytest.raises(ValueError, match="T среды"):
            calc_self_regulating(
                _p(
                    required_power_per_meter=10,
                    process_temperature=40,
                    ambient_temperature=-70,  # < -60 (min T_min)
                )
            )

    def test_manual_errors_distinguish_three_reasons(self):
        """Ручной выбор сообщает конкретную причину отказа."""
        # Слабый кабель
        with pytest.raises(ValueError, match="не обеспечивает"):
            calc_self_regulating(
                _p(
                    required_power_per_meter=50,
                    cable_mark="ТЛТ-10",
                )
            )
        # Слишком холодная среда
        with pytest.raises(ValueError, match="ниже минимальной"):
            calc_self_regulating(
                _p(
                    cable_mark="ТЛТ-15",  # T_min=-40
                    ambient_temperature=-50,
                    required_power_per_meter=5,
                )
            )
        # Слишком горячий продукт
        with pytest.raises(ValueError, match="превышает"):
            calc_self_regulating(
                _p(
                    cable_mark="ТЛТ-15",  # T_max=65
                    process_temperature=90,
                    ambient_temperature=-20,
                    required_power_per_meter=5,
                )
            )

    def test_unknown_cable_mark_raises_specific_message(self):
        with pytest.raises(ValueError, match="не найден в справочнике"):
            calc_self_regulating(_p(cable_mark="Nexans-XYZ"))

    def test_zero_pipe_length_rejected_by_pydantic(self):
        from pydantic import ValidationError

        with pytest.raises(ValidationError):
            _p(pipe_length=0)

    def test_zero_required_power_rejected_by_pydantic(self):
        from pydantic import ValidationError

        with pytest.raises(ValidationError):
            _p(required_power_per_meter=0)


# ═══════════════════════════════════════════════════════════════════════════
# GOLDEN TESTS из formules.md
# ═══════════════════════════════════════════════════════════════════════════


class TestGoldenElectrical:
    def test_example_from_formules_md(self):
        """Пример из formules.md §4.2–4.4:
        req=123 Вт/м, K=1.1 → 135.3 → ТЛТ-... (реально T>=120 нужен)
        L=50 м → L_кабеля=55 м
        P=P_каб × 55
        I=P/220

        В formules.md наивно взят ТЛТ-100 (без учёта T_max), но с учётом температур
        можем получить другой кабель. Проверим вычисления вокруг (длина, ток).
        """
        # Для чистоты берём параметры, где всё сходится
        r = calc_self_regulating(
            _p(
                required_power_per_meter=60,
                safety_factor=1.1,  # req=66 → ТЛТ-75
                process_temperature=80,
                ambient_temperature=-20,
                pipe_length=50,
                supply_voltage=220,
            )
        )
        assert r.selected_cable == "ТЛТ-75"
        assert r.cable_length == pytest.approx(50.0, rel=1e-6)
        assert r.order_cable_length == pytest.approx(55.0, rel=1e-6)
        assert r.total_power == pytest.approx(75 * 50, rel=1e-3)  # 3750 Вт
        assert r.current == pytest.approx(3750 / 220, rel=1e-3)  # 17.05 А
        assert r.voltage == 220
