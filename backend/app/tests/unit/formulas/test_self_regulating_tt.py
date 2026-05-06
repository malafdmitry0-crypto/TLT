"""Unit-тесты расчёта саморегулирующихся кабелей ТТН/ТТВ/ТТХ."""

import math

import pytest

from app.formulas.electrical.self_regulating import calc_self_regulating_tt
from app.schemas.calculation import SelfRegulatingTTParams


def _params(**kwargs) -> SelfRegulatingTTParams:
    defaults = {
        "required_power_per_meter": 18.0,
        "pipe_length": 50.0,
        "process_temperature": 50.0,
        "safety_factor": 1.1,
    }
    defaults.update(kwargs)
    return SelfRegulatingTTParams(**defaults)


class TestSeriesSelection:
    def test_selects_ttn_for_low_temp(self):
        r = calc_self_regulating_tt(_params(process_temperature=40.0, required_power_per_meter=5.0))
        assert r.series == "ТТН"

    def test_selects_ttv_when_ttn_exceeded(self):
        r = calc_self_regulating_tt(_params(process_temperature=80.0, required_power_per_meter=5.0))
        assert r.series == "ТТВ"

    def test_selects_ttx_when_ttv_exceeded(self):
        r = calc_self_regulating_tt(
            _params(process_temperature=130.0, required_power_per_meter=5.0)
        )
        assert r.series == "ТТХ"

    def test_raises_when_all_exceeded(self):
        with pytest.raises(ValueError, match="превышает предел ТТХ"):
            calc_self_regulating_tt(
                _params(process_temperature=160.0, required_power_per_meter=5.0)
            )

    def test_vapor_temp_forces_higher_series(self):
        # vapor_temp=100 не проходит ТТН (max 85), переходим к ТТВ
        r = calc_self_regulating_tt(
            _params(
                process_temperature=50.0,
                vapor_temperature=100.0,
                required_power_per_meter=5.0,
            )
        )
        assert r.series == "ТТВ"


class TestCableSelection:
    def test_autoselect_uses_multiple_threads_before_escalating_series(self):
        """T=50°C, q=18 Вт/м: 2 нитки 33ТТН2 закрывают 19.8 Вт/м."""
        r = calc_self_regulating_tt(
            _params(
                process_temperature=50.0,
                required_power_per_meter=18.0,
                safety_factor=1.1,
            )
        )
        assert "33ТТН2" in r.selected_cable
        assert r.series == "ТТН"
        assert r.num_circuits == 2
        assert r.power_per_meter == pytest.approx(-0.491 * 50 + 37.5, rel=1e-3)

    def test_user_threads_participate_in_autoselect(self):
        """При заданных 2 нитках можно выбрать 30ТТВ2 вместо более мощного 45ТТВ2."""
        r = calc_self_regulating_tt(
            _params(
                process_temperature=50.0,
                required_power_per_meter=30.0,
                safety_factor=1.0,
                number_of_threads=2,
            )
        )
        assert "30ТТВ2" in r.selected_cable
        assert r.series == "ТТВ"
        assert r.num_circuits == 2
        assert r.power_per_meter * r.num_circuits >= 30.0

    def test_suffix_sr_for_non_aggressive(self):
        r = calc_self_regulating_tt(_params(aggressive_product=False))
        assert r.cable_mark.endswith("-СР")

    def test_suffix_st_for_aggressive(self):
        r = calc_self_regulating_tt(_params(aggressive_product=True))
        assert r.cable_mark.endswith("-СТ")

    def test_cable_length_uses_winding_coefficient(self):
        r = calc_self_regulating_tt(_params(pipe_length=100.0, winding_coefficient=1.2))
        assert r.cable_length == pytest.approx(100.0 * 1.2 * r.num_circuits, rel=1e-3)

    def test_geometric_winding_coefficient_above_1_5_is_allowed(self):
        """Шаг навива чуть больше диаметра трубы даёт k > 1.5 и должен проходить схему."""
        r = calc_self_regulating_tt(
            _params(
                pipe_length=20.0,
                winding_coefficient=2.7949559992123163,
                winding_pitch=120.0,
                number_of_threads=1,
                required_power_per_meter=5.0,
            )
        )
        assert r.winding_coefficient == pytest.approx(2.7949559992123163)
        assert r.cable_length == pytest.approx(20.0 * 2.7949559992123163, rel=1e-3)

    def test_num_circuits_is_one_when_single_cable_sufficient(self):
        r = calc_self_regulating_tt(
            _params(
                required_power_per_meter=5.0,
                process_temperature=30.0,
                safety_factor=1.0,
            )
        )
        assert r.num_circuits == 1

    def test_user_threads_are_applied_to_length_and_power(self):
        r = calc_self_regulating_tt(
            _params(
                cable_mark="30ТТВ2-СР",
                required_power_per_meter=18.0,
                pipe_length=50.0,
                process_temperature=50.0,
                safety_factor=1.0,
                winding_coefficient=1.2,
                number_of_threads=2,
                winding_pitch=90,
            )
        )
        assert r.num_circuits == 2
        assert r.winding_pitch == 90
        assert r.cable_length == pytest.approx(50.0 * 1.2 * 2, rel=1e-3)
        assert r.total_power == pytest.approx(r.power_per_meter * r.cable_length, rel=1e-3)

    def test_user_threads_must_cover_required_power(self):
        with pytest.raises(ValueError, match="требуется"):
            calc_self_regulating_tt(
                _params(
                    cable_mark="10ТТН2-СР",
                    required_power_per_meter=30.0,
                    process_temperature=40.0,
                    safety_factor=1.0,
                    number_of_threads=1,
                )
            )

    def test_raises_when_power_not_achievable(self):
        with pytest.raises(ValueError, match="Ни один кабель"):
            calc_self_regulating_tt(
                _params(
                    process_temperature=40.0,
                    required_power_per_meter=500.0,
                    safety_factor=1.0,
                )
            )


class TestManualMark:
    def test_manual_mark_overrides_autoselect(self):
        r = calc_self_regulating_tt(
            _params(
                cable_mark="60ТТВ2",
                process_temperature=50.0,
                required_power_per_meter=5.0,
            )
        )
        assert "60ТТВ2" in r.selected_cable

    def test_manual_mark_suffix_is_preserved(self):
        r = calc_self_regulating_tt(
            _params(
                cable_mark="60ТТВ2-СТ",
                process_temperature=50.0,
                required_power_per_meter=5.0,
                aggressive_product=False,
            )
        )
        assert r.cable_mark == "60ТТВ2-СТ"

    def test_manual_mark_unknown_raises(self):
        with pytest.raises(ValueError, match="не найден"):
            calc_self_regulating_tt(_params(cable_mark="99ТТВ9"))

    def test_manual_mark_respects_product_temperature_limit(self):
        with pytest.raises(ValueError, match="превышает"):
            calc_self_regulating_tt(
                _params(
                    cable_mark="33ТТН2",
                    process_temperature=70.0,
                    required_power_per_meter=1.0,
                    safety_factor=1.0,
                )
            )

    def test_manual_mark_respects_vapor_temperature_limit(self):
        with pytest.raises(ValueError, match="пропар"):
            calc_self_regulating_tt(
                _params(
                    cable_mark="33ТТН2",
                    process_temperature=50.0,
                    vapor_temperature=100.0,
                    required_power_per_meter=1.0,
                    safety_factor=1.0,
                )
            )


class TestTankGeometry:
    """Когда задана геометрия резервуара — длина кабеля считается через периметр."""

    def test_explicit_pipe_length_when_no_tank(self):
        r = calc_self_regulating_tt(_params(pipe_length=50.0, winding_coefficient=1.0))
        assert r.cable_length == pytest.approx(50.0 * r.num_circuits, rel=1e-4)

    def test_cylinder_tank_overrides(self):
        """Цилиндр Ø2 м, h=3 м, w=0.1 → length = π × 2 / 2 × 30 ≈ 94.25."""
        r = calc_self_regulating_tt(
            _params(
                pipe_length=1.0,
                winding_coefficient=1.0,
                tank_shape="cylindrical",
                tank_diameter=2.0,
                heating_height=3.0,
                laying_step=0.1,
            )
        )
        expected = math.pi * 2.0 / 2.0 * (3.0 / 0.1)
        assert r.cable_length == pytest.approx(expected * r.num_circuits, rel=1e-4)

    def test_rectangular_tank(self):
        """Прямоугольник 4×3 м, h=2 м, w=0.1 → length = 7 × 20 = 140."""
        r = calc_self_regulating_tt(
            _params(
                pipe_length=1.0,
                winding_coefficient=1.0,
                tank_shape="rectangular",
                tank_length=4.0,
                tank_width=3.0,
                heating_height=2.0,
                laying_step=0.1,
            )
        )
        assert r.cable_length == pytest.approx(140.0 * r.num_circuits, rel=1e-4)
