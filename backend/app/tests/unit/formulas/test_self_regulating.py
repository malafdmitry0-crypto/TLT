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
        "process_temperature": 80,
        "pipe_length": 50,
        "safety_factor": 1.1,
    }
    base.update(o)
    return SelfRegulatingParams(**base)


class TestSelfRegulating:
    def test_valid_selection(self):
        r = calc_self_regulating(_params())
        assert r.selected_cable == "ТЛТ-25"
        assert r.cable_length == pytest.approx(50, rel=1e-3)
        assert r.installed_cable_length == pytest.approx(50, rel=1e-3)
        assert r.order_cable_length == pytest.approx(50 * CABLE_LENGTH_FACTOR, rel=1e-3)
        assert r.power_per_meter == pytest.approx(25, rel=1e-3)
        assert r.installed_power_per_meter == pytest.approx(25, rel=1e-3)
        assert r.total_power == pytest.approx(25 * 50, rel=1e-3)
        assert r.current == pytest.approx(25 * 50 / 220, rel=1e-3)

    def test_order_cable_length_has_10_percent_factor(self):
        """BR-CABLE-02: заказная длина должна быть на 10% больше расчётной."""
        pipe_length = 100.0
        r = calc_self_regulating(_params(pipe_length=pipe_length))
        assert r.cable_length == pytest.approx(pipe_length, rel=1e-3)
        assert r.order_cable_length == pytest.approx(pipe_length * CABLE_LENGTH_FACTOR, rel=1e-3)

    def test_total_power_uses_cable_length_not_pipe_length(self):
        """Суммарная мощность считается от расчётной длины кабеля без заказного запаса."""
        pipe_length = 80.0
        r = calc_self_regulating(_params(pipe_length=pipe_length))
        # Находим мощность кабеля через total_power / cable_length
        power_per_meter = r.total_power / r.cable_length
        assert power_per_meter == pytest.approx(25.0, rel=1e-3)  # ТЛТ-25 = 25 Вт/м
        assert r.power_per_meter == pytest.approx(power_per_meter, rel=1e-3)

    def test_auto_selection_when_mark_is_none(self):
        r = calc_self_regulating(_params(cable_mark=None))
        # должен автоматически подобрать ≥ 20 * 1.1 = 22 → ТЛТ-25
        assert r.selected_cable == "ТЛТ-25"
        assert r.num_circuits == 1
        assert r.number_of_threads_source == "auto"
        assert r.requested_number_of_threads is None
        assert r.applied_number_of_threads == 1

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
                process_temperature=80,
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

    def test_catalog_voltage_overrides_request_voltage_for_tlt(self):
        r = calc_self_regulating(_params(supply_voltage=380))
        assert r.voltage == 220
        assert r.current == pytest.approx(r.total_power / 220, rel=1e-4)

    def test_request_voltage_is_fallback_for_custom_catalog_without_voltage(self):
        catalog = [
            {
                "brand": "custom",
                "model": "Кастом-25",
                "power_per_meter": 25,
                "max_temperature": 120,
                "min_temperature": -60,
            }
        ]

        r = calc_self_regulating(
            _params(cable_mark="Кастом-25", supply_voltage=380, cable_catalog=catalog)
        )

        assert r.voltage == 380
        assert r.current == pytest.approx(r.total_power / 380, rel=1e-3)

    def test_current_equals_power_over_voltage(self):
        r = calc_self_regulating(_params())
        assert r.current == pytest.approx(r.total_power / r.voltage, rel=1e-4)

    def test_threads_and_winding_can_compensate_lower_power_cable(self):
        """US-G-20: проверка идёт по совокупной мощности укладки, а не только по Вт/м марки."""
        r = calc_self_regulating(
            _params(
                cable_mark="ТЛТ-15",
                required_power_per_meter=20,
                process_temperature=60,
                winding_coefficient=1.0,
                number_of_threads=2,
            )
        )
        assert r.selected_cable == "ТЛТ-15"
        assert r.num_circuits == 2
        assert r.number_of_threads_source == "manual"
        assert r.requested_number_of_threads == 2
        assert r.cable_length == pytest.approx(50 * 2, rel=1e-3)
        assert r.order_cable_length == pytest.approx(50 * CABLE_LENGTH_FACTOR * 2, rel=1e-3)

    def test_auto_selection_can_increase_threads_when_one_thread_is_not_enough(self):
        r = calc_self_regulating(
            _params(
                cable_mark=None,
                required_power_per_meter=167.858,
                safety_factor=1.1,
                ambient_temperature=-20,
                process_temperature=90,
            )
        )

        assert r.num_circuits == 2
        assert r.applied_number_of_threads == 2
        assert r.requested_number_of_threads is None
        assert r.number_of_threads_source == "auto"
        assert r.selected_cable == "ТЛТ-100"

    def test_layout_is_reported_in_result(self):
        r = calc_self_regulating(
            _params(winding_pitch=80, winding_coefficient=1.25, number_of_threads=2)
        )
        assert r.winding_pitch == 80
        assert r.winding_coefficient == pytest.approx(1.25)
        assert r.num_circuits == 2

    def test_lowest_cost_uses_total_order_cost(self):
        catalog = [
            {
                "brand": "ТЛТ",
                "model": "Дешевле-за-метр",
                "power_per_meter": 25,
                "max_temperature": 120,
                "min_temperature": -60,
                "price_per_meter": 100.0,
                "order_multiple_m": 100.0,
                "min_order_quantity_m": 0.0,
                "stock_status": "in_stock",
            },
            {
                "brand": "ТЛТ",
                "model": "Дешевле-за-заказ",
                "power_per_meter": 30,
                "max_temperature": 120,
                "min_temperature": -60,
                "price_per_meter": 120.0,
                "order_multiple_m": 1.0,
                "min_order_quantity_m": 0.0,
                "stock_status": "in_stock",
            },
        ]

        r = calc_self_regulating(
            _params(cable_mark=None, cable_catalog=catalog, selection_policy="lowest_cost")
        )

        assert r.selected_cable == "Дешевле-за-заказ"
        assert r.applied_selection_policy == "lowest_cost"
        assert r.commercial is not None
        assert r.commercial["total_cost"] == pytest.approx(55 * 120)

    def test_lowest_cost_falls_back_without_prices(self):
        catalog = [
            {
                "brand": "ТЛТ",
                "model": "Тех-25",
                "power_per_meter": 25,
                "max_temperature": 120,
                "min_temperature": -60,
            },
            {
                "brand": "ТЛТ",
                "model": "Тех-40",
                "power_per_meter": 40,
                "max_temperature": 120,
                "min_temperature": -60,
            },
        ]

        r = calc_self_regulating(
            _params(cable_mark=None, cable_catalog=catalog, selection_policy="lowest_cost")
        )

        assert r.selected_cable == "Тех-25"
        assert r.selection_policy == "lowest_cost"
        assert r.applied_selection_policy == "technical_minimum"
        assert r.warnings

    def test_fastest_delivery_and_in_stock_do_not_treat_null_as_zero(self):
        catalog = [
            {
                "brand": "ТЛТ",
                "model": "Неизвестный-срок",
                "power_per_meter": 25,
                "max_temperature": 120,
                "min_temperature": -60,
                "lead_time_days": None,
                "stock_quantity_m": None,
                "stock_status": "unknown",
            },
            {
                "brand": "ТЛТ",
                "model": "Известный-срок",
                "power_per_meter": 30,
                "max_temperature": 120,
                "min_temperature": -60,
                "lead_time_days": 4,
                "stock_quantity_m": 100,
                "stock_status": "in_stock",
            },
        ]

        fastest = calc_self_regulating(
            _params(cable_mark=None, cable_catalog=catalog, selection_policy="fastest_delivery")
        )
        in_stock = calc_self_regulating(
            _params(cable_mark=None, cable_catalog=catalog, selection_policy="in_stock")
        )

        assert fastest.selected_cable == "Известный-срок"
        assert fastest.applied_selection_policy == "fastest_delivery"
        assert in_stock.selected_cable == "Известный-срок"
        assert in_stock.applied_selection_policy == "in_stock"

    def test_preferred_supplier_and_balanced_fallback(self):
        catalog = [
            {
                "brand": "ТЛТ",
                "model": "Обычный",
                "power_per_meter": 25,
                "max_temperature": 120,
                "min_temperature": -60,
                "supplier_priority": 50,
                "is_preferred": False,
            },
            {
                "brand": "ТЛТ",
                "model": "Предпочтительный",
                "power_per_meter": 30,
                "max_temperature": 120,
                "min_temperature": -60,
                "supplier_priority": 100,
                "is_preferred": True,
            },
        ]

        preferred = calc_self_regulating(
            _params(cable_mark=None, cable_catalog=catalog, selection_policy="preferred_supplier")
        )
        balanced = calc_self_regulating(
            _params(cable_mark=None, cable_catalog=catalog, selection_policy="balanced")
        )

        assert preferred.selected_cable == "Предпочтительный"
        assert preferred.applied_selection_policy == "preferred_supplier"
        assert balanced.selected_cable == "Обычный"
        assert balanced.applied_selection_policy == "technical_minimum"
        assert balanced.warnings


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
        """Req выше доступной мощности при 3 нитках — сообщение про максимум линейки."""
        with pytest.raises(ValueError, match="максимум линейки"):
            calc_self_regulating(
                _params(
                    cable_mark=None,
                    required_power_per_meter=400,
                    ambient_temperature=-20,
                    process_temperature=40,
                    safety_factor=1.1,
                )
            )
