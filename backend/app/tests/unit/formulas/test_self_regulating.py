"""Unit-тесты электротехнического расчёта саморегулирующегося кабеля."""

import pytest

from app.formulas.electrical.self_regulating import calc_self_regulating
from app.schemas.calculation import SelfRegulatingParams

CABLE_LENGTH_FACTOR = 1.1  # BR-CABLE-02


def _params(**o) -> SelfRegulatingParams:
    base = {
        "required_power_per_meter": 20,
        "cable_mark": "ТЛТ-25",
        "supply_voltage": 220,
        "ambient_temperature": -30,
        "pipe_length": 50,
        "safety_factor": 1.1,
    }
    base.update(o)
    return SelfRegulatingParams(**base)


class TestSelfRegulating:
    def test_valid_selection(self):
        r = calc_self_regulating(_params())
        assert r.selected_cable == "ТЛТ-25"
        # BR-CABLE-02: длина кабеля = длина трубы × 1.1
        assert r.cable_length == pytest.approx(50 * CABLE_LENGTH_FACTOR, rel=1e-3)
        assert r.total_power == pytest.approx(25 * 50 * CABLE_LENGTH_FACTOR, rel=1e-3)
        assert r.current == pytest.approx(25 * 50 * CABLE_LENGTH_FACTOR / 220, rel=1e-3)

    def test_cable_length_has_10_percent_factor(self):
        """BR-CABLE-02: длина кабеля должна быть на 10% больше длины трубопровода."""
        pipe_length = 100.0
        r = calc_self_regulating(_params(pipe_length=pipe_length))
        assert r.cable_length == pytest.approx(pipe_length * CABLE_LENGTH_FACTOR, rel=1e-3)

    def test_total_power_uses_cable_length_not_pipe_length(self):
        """Суммарная мощность считается от длины кабеля (с запасом), не от длины трубы."""
        pipe_length = 80.0
        r = calc_self_regulating(_params(pipe_length=pipe_length))
        cable_length = pipe_length * CABLE_LENGTH_FACTOR
        # Находим мощность кабеля через total_power / cable_length
        power_per_meter = r.total_power / cable_length
        assert power_per_meter == pytest.approx(25.0, rel=1e-3)  # ТЛТ-25 = 25 Вт/м

    def test_auto_selection_when_mark_is_none(self):
        r = calc_self_regulating(_params(cable_mark=None))
        # должен автоматически подобрать ≥ 20 * 1.1 = 22 → ТЛТ-25
        assert r.selected_cable == "ТЛТ-25"

    def test_unknown_cable_mark_raises(self):
        # Ручной выбор несуществующей марки → явная ошибка
        with pytest.raises(ValueError, match="не найден в справочнике"):
            calc_self_regulating(_params(cable_mark="ТЛТ-999"))

    def test_auto_no_suitable_cable_raises(self):
        # Автоподбор при требовании 1000 Вт/м — такого кабеля нет
        with pytest.raises(ValueError, match="Не найден кабель"):
            calc_self_regulating(_params(cable_mark=None, required_power_per_meter=1000))

    def test_cable_below_required_power_raises(self):
        # ТЛТ-10 (10 Вт/м) явно задан, но требуется 20*1.1=22 Вт/м → ошибка
        with pytest.raises(ValueError, match="не обеспечивает"):
            calc_self_regulating(_params(cable_mark="ТЛТ-10", ambient_temperature=-60))

    def test_zero_power_rejected(self):
        from pydantic import ValidationError

        with pytest.raises(ValidationError):
            SelfRegulatingParams(
                required_power_per_meter=0,
                cable_mark="ТЛТ-25",
                ambient_temperature=-30,
                pipe_length=50,
            )

    def test_safety_factor_applied(self):
        # required=22, safety=1.5 → need 33 → ТЛТ-40
        r = calc_self_regulating(
            _params(
                required_power_per_meter=22,
                safety_factor=1.5,
                cable_mark=None,
            )
        )
        assert r.selected_cable == "ТЛТ-40"

    def test_voltage_in_result(self):
        r = calc_self_regulating(_params(supply_voltage=220))
        assert r.voltage == 220

    def test_current_equals_power_over_voltage(self):
        r = calc_self_regulating(_params())
        assert r.current == pytest.approx(r.total_power / r.voltage, rel=1e-4)


class TestAutoSelectionWithTemperature:
    """Автоподбор учитывает T_max и T_min кабелей (регрессия-тест)."""

    def test_auto_skips_cables_with_low_tmax(self):
        """Низкая req-мощность (хватит ТЛТ-15), но T_proc=120°C — должен выбраться более тёплый кабель."""
        r = calc_self_regulating(
            _params(
                cable_mark=None,
                required_power_per_meter=10,  # x1.1 = 11 Вт/м
                ambient_temperature=-20,
                process_temperature=120,
                safety_factor=1.1,
            )
        )
        # ТЛТ-60 (T_max=120) — самый слабый, кто выдержит 120°C
        assert r.selected_cable == "ТЛТ-60"

    def test_auto_skips_cables_with_high_tmin(self):
        """Экстремально холодная среда -60°C — подходит только ТЛТ-100."""
        r = calc_self_regulating(
            _params(
                cable_mark=None,
                required_power_per_meter=5,
                ambient_temperature=-60,
                process_temperature=40,
                safety_factor=1.1,
            )
        )
        assert r.selected_cable == "ТЛТ-100"

    def test_auto_no_cable_for_very_hot_product_with_low_power(self):
        """Если T_max = 170°C > всех кабелей — явная ошибка про T_max."""
        with pytest.raises(ValueError, match="T продукта"):
            calc_self_regulating(
                _params(
                    cable_mark=None,
                    required_power_per_meter=5,
                    ambient_temperature=-20,
                    process_temperature=170,
                    safety_factor=1.1,
                )
            )

    def test_auto_no_cable_due_to_power_limit(self):
        """Req > 100 Вт/м — всегда сообщение про максимум линейки."""
        with pytest.raises(ValueError, match="максимум линейки"):
            calc_self_regulating(
                _params(
                    cable_mark=None,
                    required_power_per_meter=150,
                    ambient_temperature=-20,
                    process_temperature=40,
                    safety_factor=1.1,
                )
            )
