"""КРИТИЧЕСКИЕ тесты безопасности подбора кабеля.

Цена ошибки: неверный кабель → перегрев / недогрев / поломка оборудования.
Эти тесты — последняя линия обороны для инженерных решений.
"""

from __future__ import annotations

import pytest

from app.formulas.electrical.self_regulating import calc_self_regulating
from app.schemas.calculation import SelfRegulatingParams


def _params(**kw):
    """Дефолтные параметры с возможностью переопределения."""
    base = dict(
        required_power_per_meter=10.0,
        cable_mark=None,
        supply_voltage=220.0,
        ambient_temperature=-20.0,
        process_temperature=80.0,
        pipe_length=50.0,
        safety_factor=1.1,
        cable_catalog=None,
    )
    base.update(kw)
    return SelfRegulatingParams(**base)


class TestNoOvertemperature:
    """Кабель НЕ должен подбираться, если T процесса > T_max кабеля.
    Перегрев = разрушение саморегулирующейся матрицы."""

    def test_extreme_high_process_no_cable_available(self):
        """T процесса 250°C — нет кабеля в линейке ТЛТ. Должен упасть, не молча подобрать."""
        with pytest.raises(ValueError):
            calc_self_regulating(
                _params(
                    required_power_per_meter=10,
                    process_temperature=250,
                    ambient_temperature=20,
                )
            )

    def test_explicit_cable_too_hot_rejected(self):
        """Явный выбор кабеля для процесса 150°C — нет ТЛТ с T_max≥150 → отказ."""
        with pytest.raises(ValueError, match="превышает|T_max|температур"):
            calc_self_regulating(
                _params(
                    required_power_per_meter=10,
                    cable_mark="ТЛТ-30",
                    process_temperature=150,
                )
            )


class TestNoUndertemperature:
    """Кабель должен работать при заявленной T окружающей среды.
    Если T_min кабеля выше — не запустится в мороз."""

    def test_arctic_temperature_no_suitable_cable(self):
        """T среды -90°C, ни один ТЛТ не работает там."""
        with pytest.raises(ValueError):
            calc_self_regulating(
                _params(
                    required_power_per_meter=5,
                    ambient_temperature=-90,
                    process_temperature=20,
                )
            )

    def test_explicit_cable_min_temp_violation(self):
        """ТЛТ-10 имеет T_min, проверим что error при -100."""
        with pytest.raises(ValueError):
            calc_self_regulating(
                _params(
                    required_power_per_meter=5,
                    cable_mark="ТЛТ-10",
                    ambient_temperature=-100,
                    process_temperature=10,
                )
            )


class TestNoUnderpower:
    """Кабель не должен подбираться если P < required.
    Это же подключаем недогрев — труба замёрзнет."""

    def test_required_500_w_per_meter_no_cable(self):
        """500 Вт/м — выше всей линейки ТЛТ (max ≈ 60). Должен упасть."""
        with pytest.raises(ValueError):
            calc_self_regulating(
                _params(
                    required_power_per_meter=500,
                    ambient_temperature=-20,
                    process_temperature=50,
                )
            )

    def test_safety_factor_pushes_required_higher(self):
        """40 Вт/м × 1.6 = 64 — может потребовать более мощный кабель."""
        # Без safety
        r1 = calc_self_regulating(
            _params(
                required_power_per_meter=40,
                safety_factor=1.0,
                ambient_temperature=-20,
                process_temperature=80,
            )
        )
        # С safety
        r2 = calc_self_regulating(
            _params(
                required_power_per_meter=40,
                safety_factor=1.6,
                ambient_temperature=-20,
                process_temperature=80,
            )
        )
        # safety_factor сделал effective_required выше → кабель не слабее
        assert r2.total_power >= r1.total_power

    def test_explicit_underpowered_cable_rejected(self):
        """Явно слабый ТЛТ-10 для 50 Вт/м → отказ."""
        with pytest.raises(ValueError):
            calc_self_regulating(
                _params(
                    required_power_per_meter=50,
                    cable_mark="ТЛТ-10",
                    ambient_temperature=-20,
                    process_temperature=20,
                )
            )


class TestSafetyFactorBoundaries:
    """Safety factor — критическая страховка. Применение и эффект."""

    def test_safety_1_0_uses_exact_required(self):
        """Без запаса берём минимально подходящий."""
        r = calc_self_regulating(
            _params(
                required_power_per_meter=10,
                safety_factor=1.0,
            )
        )
        assert r.selected_cable is not None

    def test_safety_2_0_picks_more_powerful_cable(self):
        """Большой запас → берём более мощный кабель (по total_power косвенно)."""
        r1 = calc_self_regulating(
            _params(
                required_power_per_meter=10,
                safety_factor=1.0,
                pipe_length=100,
            )
        )
        r2 = calc_self_regulating(
            _params(
                required_power_per_meter=10,
                safety_factor=2.0,
                pipe_length=100,
            )
        )
        # При safety=2.0 нужен кабель с P≥20, при 1.0 достаточно P≥10
        # → r2 имеет либо тот же кабель, либо более мощный → total_power ≥ r1
        assert r2.total_power >= r1.total_power

    def test_negative_safety_factor_input_validation(self):
        """Отрицательный safety не должен пройти валидацию схемы."""
        with pytest.raises(Exception):  # pydantic ValidationError
            SelfRegulatingParams(
                required_power_per_meter=10,
                cable_mark=None,
                supply_voltage=220,
                ambient_temperature=-20,
                process_temperature=80,
                pipe_length=50,
                safety_factor=-1.0,
            )


class TestCableLengthFactor:
    """BR-CABLE-02: order_cable_length = cable_length × 1.1 (запас на муфты/петли).
    Если убрать — заказчик получит слишком короткий кабель."""

    def test_order_cable_length_exactly_1_1_factor(self):
        r = calc_self_regulating(_params(pipe_length=100))
        assert r.cable_length == pytest.approx(100.0)
        assert r.order_cable_length == pytest.approx(110.0)

    def test_order_cable_length_for_short_pipe(self):
        r = calc_self_regulating(_params(pipe_length=1))
        assert r.cable_length == pytest.approx(1.0)
        assert r.order_cable_length == pytest.approx(1.1)

    def test_total_power_proportional_to_cable_length_not_pipe(self):
        """Total power растёт с расчётной длиной, а не с заказным запасом."""
        r10 = calc_self_regulating(_params(pipe_length=10))
        r20 = calc_self_regulating(_params(pipe_length=20))
        # Двойная труба → двойная мощность (та же марка кабеля)
        assert r20.total_power == pytest.approx(r10.total_power * 2, rel=0.001)


class TestCurrentCalculation:
    """Ток = total_power / U. Если ошибка → автомат не выберется правильно."""

    def test_current_for_220v(self):
        r = calc_self_regulating(
            _params(
                required_power_per_meter=20,
                pipe_length=100,
                supply_voltage=220,
            )
        )
        assert r.current == pytest.approx(r.total_power / 220.0, rel=0.01)

    def test_current_for_380v(self):
        r = calc_self_regulating(
            _params(
                required_power_per_meter=20,
                pipe_length=100,
                supply_voltage=380,
            )
        )
        assert r.current == pytest.approx(r.total_power / 380.0, rel=0.01)


class TestAutoSelectionMinimality:
    """Автоподбор должен брать **минимально-мощный** кабель, не первый попавшийся.
    Иначе пользователь переплачивает за избыточно мощный кабель."""

    def test_picks_smallest_sufficient_cable(self):
        """Если требуется 7 Вт/м → должен выбрать ТЛТ-10, не ТЛТ-50.
        Иначе пользователь переплатит."""
        r = calc_self_regulating(
            _params(
                required_power_per_meter=7,
                safety_factor=1.0,
                ambient_temperature=-20,
                process_temperature=20,
            )
        )
        # Минимально-достаточный = ТЛТ-10
        assert r.selected_cable == "ТЛТ-10"


class TestCriticalInputValidation:
    """Защита от 0 / отрицательных значений в формуле — а не падения с ZeroDivisionError."""

    def test_zero_power_rejected_at_schema_level(self):
        # Pydantic схема ловит до самого расчёта — ещё лучше
        from pydantic import ValidationError

        with pytest.raises(ValidationError):
            _params(required_power_per_meter=0)

    def test_negative_power_rejected(self):
        from pydantic import ValidationError

        with pytest.raises(ValidationError):
            _params(required_power_per_meter=-5)

    def test_zero_pipe_length_rejected(self):
        from pydantic import ValidationError

        with pytest.raises(ValidationError):
            _params(pipe_length=0)

    def test_negative_pipe_length_rejected(self):
        from pydantic import ValidationError

        with pytest.raises(ValidationError):
            _params(pipe_length=-10)
