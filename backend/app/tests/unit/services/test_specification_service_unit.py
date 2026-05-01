"""Unit-тесты SpecificationService с мок-БД."""

from __future__ import annotations

import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

from app.schemas.specification import SpecificationItem
from app.services.specification_service import SpecificationService


def _mock_db_with(scalar_first=None, scalars_all=None):
    db = AsyncMock()
    result = MagicMock()
    if scalar_first is not None:
        scalars_mock = MagicMock()
        scalars_mock.first = lambda: scalar_first
        scalars_mock.all = lambda: [scalar_first] if scalar_first else []
        result.scalars = lambda: scalars_mock
    else:
        scalars_mock = MagicMock()
        scalars_mock.first = lambda: None
        scalars_mock.all = lambda: scalars_all or []
        result.scalars = lambda: scalars_mock
    db.execute = AsyncMock(return_value=result)
    db.commit = AsyncMock()
    db.add = MagicMock()
    return db


class TestGetSpecification:
    async def test_returns_existing_spec(self):
        spec = SimpleNamespace(id=uuid.uuid4(), items=[{"name": "X"}])
        db = _mock_db_with(scalar_first=spec)
        result = await SpecificationService(db).get_specification(uuid.uuid4())
        assert result is spec

    async def test_returns_none_when_not_found(self):
        db = _mock_db_with()
        result = await SpecificationService(db).get_specification(uuid.uuid4())
        assert result is None


class TestGenerate:
    async def test_creates_new_spec_when_none_exists(self):
        # Двойной execute: первый — спецификация, второй — electrical
        db = AsyncMock()
        no_spec_result = MagicMock()
        no_spec_result.scalars = lambda: MagicMock(first=lambda: None, all=lambda: [])
        no_calc_result = MagicMock()
        no_calc_result.scalars = lambda: MagicMock(first=lambda: None, all=lambda: [])
        db.execute = AsyncMock(side_effect=[no_spec_result, no_calc_result])
        db.scalar = AsyncMock(return_value=0)  # total_objects_count
        db.commit = AsyncMock()
        db.add = MagicMock()

        items = await SpecificationService(db).generate(uuid.uuid4())
        assert items == []
        db.add.assert_called_once()
        db.commit.assert_awaited_once()

    async def test_replaces_existing_spec(self):
        existing = SimpleNamespace(items=[])
        db = AsyncMock()
        spec_result = MagicMock()
        spec_result.scalars = lambda: MagicMock(first=lambda: existing, all=lambda: [])
        no_calc_result = MagicMock()
        no_calc_result.scalars = lambda: MagicMock(first=lambda: None, all=lambda: [])
        db.execute = AsyncMock(side_effect=[spec_result, no_calc_result])
        db.scalar = AsyncMock(return_value=0)
        db.commit = AsyncMock()
        db.add = MagicMock()

        await SpecificationService(db).generate(uuid.uuid4())
        # add НЕ вызывается (используется existing)
        db.add.assert_not_called()

    async def test_preserves_manual_items_skips_broken(self):
        # Manual item с битым форматом (отсутствует обязательное `name`) — пропускается
        existing = SimpleNamespace(
            items=[
                {
                    "category": "extra",
                    "name": "Good",
                    "unit": "шт",
                    "quantity": 1,
                    "source": "manual",
                },
                {"category": "broken"},  # нет name/quantity → SpecificationItem(**raw) кинет
                {"name": "Auto-old", "source": "auto"},  # auto не сохраняется
            ]
        )
        db = AsyncMock()
        spec_result = MagicMock()
        spec_result.scalars = lambda: MagicMock(first=lambda: existing, all=lambda: [])
        no_calc = MagicMock()
        no_calc.scalars = lambda: MagicMock(first=lambda: None, all=lambda: [])
        db.execute = AsyncMock(side_effect=[spec_result, no_calc])
        db.scalar = AsyncMock(return_value=0)
        db.commit = AsyncMock()
        db.add = MagicMock()

        items = await SpecificationService(db).generate(uuid.uuid4())
        # Только Good пройдёт (broken отфильтруется, Auto-old не manual)
        assert any(i.name == "Good" and i.source == "manual" for i in items)
        assert not any(i.name == "broken" for i in items)

    async def test_accessories_count_uses_project_objects_not_successful_calcs(self):
        """Regression: аксессуары считаются по числу объектов проекта, а не расчётов.

        Сценарий: в проекте 5 объектов, успешно рассчитано только 3.
        Спека должна заказать аксессуары × 5, а не × 3.
        """
        from app.models.electrical_calculation import ElectricalCalculation

        calc = ElectricalCalculation(
            project_id=uuid.uuid4(),
            object_id=uuid.uuid4(),
            variant_number=1,
            cable_type="self_regulating",
            cable_mark="ТЛТ-25",
            params={},
            results={"selected_cable": "ТЛТ-25", "cable_length": 10},
        )
        db = AsyncMock()
        no_spec = MagicMock()
        no_spec.scalars = lambda: MagicMock(first=lambda: None, all=lambda: [])
        calc_result = MagicMock()
        calc_result.scalars = lambda: MagicMock(first=lambda: calc, all=lambda: [calc, calc, calc])
        db.execute = AsyncMock(side_effect=[no_spec, calc_result])
        db.scalar = AsyncMock(return_value=5)  # 5 объектов в проекте
        db.commit = AsyncMock()
        db.add = MagicMock()

        items = await SpecificationService(db).generate(uuid.uuid4())
        accessories = [i for i in items if i.category != "Кабель"]
        assert accessories, "Аксессуары должны быть"
        for acc in accessories:
            per_object = acc.quantity / 5.0
            assert per_object == float(
                int(per_object)
            ), f"{acc.name}: {acc.quantity} не кратно 5 (объектов в проекте)"


class TestSaveItems:
    async def test_creates_new_when_no_existing(self):
        db = _mock_db_with()
        items = [SpecificationItem(category="a", name="A", unit="шт", quantity=1)]
        result = await SpecificationService(db).save_items(uuid.uuid4(), items)
        assert result == items
        db.add.assert_called_once()
        db.commit.assert_awaited_once()

    async def test_replaces_when_existing(self):
        existing = SimpleNamespace(items=[{"old": True}])
        db = _mock_db_with(scalar_first=existing)
        items = [SpecificationItem(category="b", name="B", unit="шт", quantity=2)]
        await SpecificationService(db).save_items(uuid.uuid4(), items, variant_number=2)
        # add НЕ вызывается; existing.items замещается
        db.add.assert_not_called()
        assert existing.items[0]["name"] == "B"
        db.commit.assert_awaited_once()
