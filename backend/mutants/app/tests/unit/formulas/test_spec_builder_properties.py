"""Свойственные тесты построителя спецификации.

Критично: спецификация используется для заказа оборудования. Ошибка в
суммировании длин = неправильный заказ кабеля на реальном объекте.
"""

import pytest

from app.formulas.specification.builder import build_basic_specification


class TestSpecBuilder:
    def test_empty_input_returns_empty_spec(self):
        assert build_basic_specification([]) == []

    def test_single_cable_included(self):
        items = build_basic_specification(
            [
                {"selected_cable": "ТЛТ-25", "order_cable_length": 55.0},
            ]
        )
        # Должен быть один кабель + базовые аксессуары
        cables = [i for i in items if i.category == "Кабель"]
        assert len(cables) == 1
        assert cables[0].article == "ТЛТ-25"
        assert cables[0].quantity == 55.0
        assert cables[0].unit == "м"

    def test_order_mark_has_priority_over_base_selected_cable(self):
        items = build_basic_specification(
            [
                {
                    "selected_cable": "30ТТВ2",
                    "cable_mark": "30ТТВ2-СТ",
                    "order_cable_length": 55.0,
                },
            ]
        )
        cables = [i for i in items if i.category == "Кабель"]
        assert len(cables) == 1
        assert cables[0].article == "30ТТВ2-СТ"

    def test_same_cable_summed_across_objects(self):
        """Одинаковые марки суммируются по длине."""
        items = build_basic_specification(
            [
                {"selected_cable": "ТЛТ-25", "order_cable_length": 10.0},
                {"selected_cable": "ТЛТ-25", "order_cable_length": 15.5},
                {"selected_cable": "ТЛТ-25", "order_cable_length": 4.5},
            ]
        )
        cables = [i for i in items if i.category == "Кабель"]
        assert len(cables) == 1
        assert cables[0].quantity == pytest.approx(30.0, rel=1e-6)

    def test_different_cables_kept_separate(self):
        items = build_basic_specification(
            [
                {"selected_cable": "ТЛТ-25", "order_cable_length": 20.0},
                {"selected_cable": "ТЛТ-50", "order_cable_length": 30.0},
            ]
        )
        cables = [i for i in items if i.category == "Кабель"]
        assert len(cables) == 2
        marks = sorted(c.article for c in cables)
        assert marks == ["ТЛТ-25", "ТЛТ-50"]

    def test_none_or_zero_cable_skipped(self):
        """Объекты без selected_cable не учитываются в кабелях."""
        items = build_basic_specification(
            [
                {"selected_cable": None, "order_cable_length": 20.0},
                {"selected_cable": "ТЛТ-25", "order_cable_length": 0},
                {"selected_cable": "ТЛТ-25", "order_cable_length": 10.0},
            ]
        )
        cables = [i for i in items if i.category == "Кабель"]
        assert len(cables) == 1
        assert cables[0].quantity == 10.0

    def test_accessories_multiplied_by_object_count(self):
        """Аксессуары умножаются на число объектов."""
        items = build_basic_specification(
            [
                {"selected_cable": "ТЛТ-25", "order_cable_length": 10.0},
                {"selected_cable": "ТЛТ-25", "order_cable_length": 20.0},
            ]
        )
        non_cable = [i for i in items if i.category != "Кабель"]
        # per_object × 2 (два объекта)
        for item in non_cable:
            assert item.quantity > 0

    def test_items_sorted_by_category_then_name(self):
        items = build_basic_specification(
            [
                {"selected_cable": "ТЛТ-100", "order_cable_length": 50.0},
                {"selected_cable": "ТЛТ-10", "order_cable_length": 20.0},
            ]
        )
        keys = [(i.category, i.name) for i in items]
        assert keys == sorted(keys)
