"""Unit-тесты билдера спецификации."""

from app.formulas.specification.builder import build_basic_specification


class TestSpecBuilder:
    def test_empty_input_returns_empty(self):
        assert build_basic_specification([]) == []

    def test_groups_cable_by_mark(self):
        results = [
            {"selected_cable": "ТЛТ-25", "cable_length": 30},
            {"selected_cable": "ТЛТ-25", "cable_length": 20},
            {"selected_cable": "ТЛТ-40", "cable_length": 15},
        ]
        items = build_basic_specification(results)
        cables = [i for i in items if i.category == "Кабель"]
        by_mark = {c.article: c.quantity for c in cables}
        assert by_mark == {"ТЛТ-25": 50.0, "ТЛТ-40": 15.0}

    def test_adds_accessories(self):
        results = [{"selected_cable": "ТЛТ-25", "cable_length": 10}]
        items = build_basic_specification(results)
        assert any(i.category == "Управление" for i in items)
        assert any(i.category == "Защита" for i in items)

    def test_items_sorted(self):
        results = [{"selected_cable": "ТЛТ-25", "cable_length": 10}]
        items = build_basic_specification(results)
        keys = [(i.category, i.name) for i in items]
        assert keys == sorted(keys)

    def test_accessories_count_uses_total_objects_when_given(self):
        """Аксессуары считаются по всем объектам, даже если часть не рассчитана.

        Сценарий: 100 объектов в проекте, 93 успешно рассчитаны, 7 fail.
        УЗО/муфты/термостаты должны быть на все 100, чтобы заказчик не
        недополучил оборудование.
        """
        results = [{"selected_cable": "ТЛТ-25", "cable_length": 10}] * 93
        items = build_basic_specification(results, total_objects_count=100)
        # Считаем аксессуары (всё кроме кабельной позиции)
        accessories = [i for i in items if i.category != "Кабель"]
        assert accessories, "Должны быть аксессуары"
        for acc in accessories:
            per_object = acc.quantity / 100.0
            assert per_object == float(int(per_object)), (
                f"Количество {acc.name} = {acc.quantity} не кратно 100 — "
                "значит считается не по всем объектам"
            )

    def test_accessories_fallback_to_results_count_when_total_missing(self):
        """Backwards-compat: без total_objects_count аксессуары считаются по расчётам."""
        results = [{"selected_cable": "ТЛТ-25", "cable_length": 10}] * 3
        items_no_total = build_basic_specification(results)
        items_with_total = build_basic_specification(results, total_objects_count=3)
        qty_no = {(i.category, i.name): i.quantity for i in items_no_total}
        qty_with = {(i.category, i.name): i.quantity for i in items_with_total}
        assert qty_no == qty_with

    def test_failed_results_dont_reduce_accessories(self):
        """Даже если на входе fail-записи (без selected_cable), аксессуары считаются
        по total_objects_count, а не по числу успешных расчётов."""
        results = [
            {"selected_cable": "ТЛТ-25", "cable_length": 10},
            {"error": "Кабель не подобран"},  # fail
            {"error": "Теплопотери = 0"},  # fail
        ]
        items = build_basic_specification(results, total_objects_count=3)
        accessories = [i for i in items if i.category != "Кабель"]
        for acc in accessories:
            per_object = acc.quantity / 3.0
            assert per_object == float(int(per_object))

    def test_zero_total_produces_no_accessories(self):
        assert build_basic_specification([], total_objects_count=0) == []

    def test_cable_only_from_successful(self):
        """Fail-записи не добавляют кабель."""
        results = [
            {"selected_cable": "ТЛТ-25", "cable_length": 10},
            {"error": "fail"},
        ]
        items = build_basic_specification(results, total_objects_count=2)
        cables = [i for i in items if i.category == "Кабель"]
        assert len(cables) == 1
        assert cables[0].quantity == 10.0
