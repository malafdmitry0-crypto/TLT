"""Unit-тесты билдера спецификации."""

from app.formulas.specification.builder import build_basic_specification


class TestSpecBuilder:
    def test_empty_input_returns_empty(self):
        assert build_basic_specification([]) == []

    def test_groups_cable_by_mark(self):
        results = [
            {"selected_cable": "ТЛТ-25", "order_cable_length": 30},
            {"selected_cable": "ТЛТ-25", "order_cable_length": 20},
            {"selected_cable": "ТЛТ-40", "order_cable_length": 15},
        ]
        items = build_basic_specification(results)
        cables = [i for i in items if i.category == "Кабель"]
        by_mark = {c.article: c.quantity for c in cables}
        assert by_mark == {"ТЛТ-25": 50.0, "ТЛТ-40": 15.0}

    def test_uses_order_cable_length_for_cable_quantity(self):
        results = [
            {"selected_cable": "ТЛТ-25", "order_cable_length": 33},
            {"selected_cable": "ТЛТ-25", "order_cable_length": 22},
        ]
        items = build_basic_specification(results)
        cables = [i for i in items if i.category == "Кабель"]
        assert {c.article: c.quantity for c in cables} == {"ТЛТ-25": 55.0}

    def test_commercial_required_order_length_has_priority(self):
        results = [
            {
                "selected_cable": "ТЛТ-25",
                "order_cable_length": 33,
                "commercial": {"required_order_length": 40},
            },
        ]
        items = build_basic_specification(results)
        cables = [i for i in items if i.category == "Кабель"]
        assert {c.article: c.quantity for c in cables} == {"ТЛТ-25": 40.0}

    def test_adds_accessories(self):
        results = [{"selected_cable": "ТЛТ-25", "order_cable_length": 10}]
        items = build_basic_specification(results)
        assert any(i.category == "Управление" for i in items)
        assert any(i.category == "Защита" for i in items)

    def test_items_sorted(self):
        results = [{"selected_cable": "ТЛТ-25", "order_cable_length": 10}]
        items = build_basic_specification(results)
        keys = [(i.category, i.name) for i in items]
        assert keys == sorted(keys)

    def test_accessories_count_uses_total_objects_when_given(self):
        """Аксессуары считаются по всем объектам, даже если часть не рассчитана.

        Сценарий: 100 объектов в проекте, 93 успешно рассчитаны, 7 fail.
        УЗО/муфты/термостаты должны быть на все 100, чтобы заказчик не
        недополучил оборудование.
        """
        results = [{"selected_cable": "ТЛТ-25", "order_cable_length": 10}] * 93
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
        """Без total_objects_count аксессуары считаются по успешным расчётам."""
        results = [{"selected_cable": "ТЛТ-25", "order_cable_length": 10}] * 3
        items_no_total = build_basic_specification(results)
        items_with_total = build_basic_specification(results, total_objects_count=3)
        qty_no = {(i.category, i.name): i.quantity for i in items_no_total}
        qty_with = {(i.category, i.name): i.quantity for i in items_with_total}
        assert qty_no == qty_with

    def test_failed_results_dont_reduce_accessories(self):
        """Даже если на входе fail-записи (без selected_cable), аксессуары считаются
        по total_objects_count, а не по числу успешных расчётов."""
        results = [
            {"selected_cable": "ТЛТ-25", "order_cable_length": 10},
            {
                "error_code": "POWER_TOO_HIGH",
                "category": "formula",
                "message": "Кабель не подобран",
            },
            {
                "error_code": "ZERO_HEAT_LOSS",
                "category": "validation",
                "message": "Теплопотери = 0",
            },
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
            {"selected_cable": "ТЛТ-25", "order_cable_length": 10},
            {"error_code": "UNKNOWN", "category": "formula", "message": "fail"},
        ]
        items = build_basic_specification(results, total_objects_count=2)
        cables = [i for i in items if i.category == "Кабель"]
        assert len(cables) == 1
        assert cables[0].quantity == 10.0

    def test_successful_result_with_service_message_is_ordered(self):
        """Служебный message без error_code/category не делает расчёт failed."""
        results = [
            {
                "selected_cable": "ТЛТ-25",
                "order_cable_length": 10,
                "message": "Использована коммерческая политика balanced",
            },
        ]

        items = build_basic_specification(results, total_objects_count=1)

        cables = [i for i in items if i.category == "Кабель"]
        assert len(cables) == 1
        assert cables[0].article == "ТЛТ-25"
        assert cables[0].quantity == 10.0

    def test_stale_result_with_saved_cable_is_not_ordered(self):
        """Stale-расчёт хранит старые cable fields, но не должен попадать в заказ."""
        results = [
            {"selected_cable": "ТЛТ-25", "order_cable_length": 10},
            {
                "selected_cable": "ТЛТ-100",
                "cable_mark": "ТЛТ-100",
                "order_cable_length": 999,
                "error_code": "stale_electrical_calculation",
                "category": "stale",
                "message": "Электрорасчёт устарел",
                "stale": True,
            },
        ]
        items = build_basic_specification(results, total_objects_count=2)
        cables = [i for i in items if i.category == "Кабель"]
        assert len(cables) == 1
        assert cables[0].article == "ТЛТ-25"
        assert cables[0].quantity == 10.0

    def test_structured_issue_with_snapshot_cable_is_not_ordered(self):
        """Даже snapshot с маркой не делает failed/stale результат пригодным для BoM."""
        results = [
            {
                "selected_cable": "ТЛТ-100",
                "order_cable_length": 100,
                "cable_snapshot": {
                    "cable_mark": "ТЛТ-100",
                    "commercial_context": {"required_order_length": 100},
                },
                "error_code": "POWER_TOO_HIGH",
                "category": "formula",
                "message": "Кабель не подобран",
            },
        ]
        items = build_basic_specification(results, total_objects_count=1)
        assert [i for i in items if i.category == "Кабель"] == []
        assert [i for i in items if i.category != "Кабель"]

    def test_snapshot_only_successful_result_is_ordered(self):
        """Валидный snapshot остаётся источником марки и коммерческой длины."""
        results = [
            {
                "cable_snapshot": {
                    "cable_mark": "ТЛТ-40",
                    "commercial_context": {"required_order_length": 44},
                }
            },
        ]
        items = build_basic_specification(results, total_objects_count=1)
        cables = [i for i in items if i.category == "Кабель"]
        assert len(cables) == 1
        assert cables[0].article == "ТЛТ-40"
        assert cables[0].quantity == 44.0

    def test_tt_cable_uses_full_order_mark_with_suffix(self):
        """В спецификацию попадает полная марка с суффиксом (-СТ/-СР), не база."""
        results = [
            {
                "selected_cable": "30ТТВ2",
                "cable_mark": "30ТТВ2-СТ",
                "order_cable_length": 42.5,
            }
        ]
        items = build_basic_specification(results, total_objects_count=1)
        cables = [i for i in items if i.category == "Кабель"]
        assert len(cables) == 1
        assert cables[0].article == "30ТТВ2-СТ"
        assert cables[0].name == "Греющий кабель 30ТТВ2-СТ"
