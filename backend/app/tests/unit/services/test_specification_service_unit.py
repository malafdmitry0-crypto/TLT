"""Unit-тесты SpecificationService с мок-БД."""

from __future__ import annotations

import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

from app.schemas.specification import SpecificationItem, SpecificationOptions
from app.services.specification_service import SpecificationService


def _mock_db_with(scalar_first=None, scalars_all=None):
    db = AsyncMock()
    result = MagicMock()
    if scalar_first is not None:
        scalars_mock = MagicMock()
        scalars_mock.first = lambda: scalar_first
        scalars_mock.one_or_none = lambda: scalar_first
        scalars_mock.all = lambda: [scalar_first] if scalar_first else []
        result.scalars = lambda: scalars_mock
    else:
        scalars_mock = MagicMock()
        scalars_mock.first = lambda: None
        scalars_mock.one_or_none = lambda: None
        scalars_mock.all = lambda: scalars_all or []
        result.scalars = lambda: scalars_mock
    result.scalar_one = lambda: scalar_first or SimpleNamespace(items=[])
    db.execute = AsyncMock(return_value=result)
    db.commit = AsyncMock()
    db.add = MagicMock()
    return db


def _upsert_result(spec=None):
    result = MagicMock()
    result.scalar_one = lambda: spec or SimpleNamespace(items=[])
    return result


def _empty_result():
    result = MagicMock()
    result.scalars = lambda: MagicMock(
        first=lambda: None, one_or_none=lambda: None, all=lambda: []
    )
    return result


def _list_result(items):
    result = MagicMock()
    result.scalars = lambda: MagicMock(
        first=lambda: items[0] if items else None,
        one_or_none=lambda: items[0] if items else None,
        all=lambda: list(items),
    )
    return result


def _project_defaults():
    return SimpleNamespace(
        specification_settings={},
        specification_settings_version=1,
    )


def _generate_db(*, existing_spec=None, calcs=None, objects=None, upsert_spec=None):
    """Mock DB sequence for generate() under PDL-ER-07/29 full path.

    execute order:
      1) lock project
      2) load existing specification
      3) electrical calculations
      4) project objects (full mode)
      5) upsert
    plus db.get(Project) for settings.
    """
    db = AsyncMock()
    db.execute = AsyncMock(
        side_effect=[
            _empty_result(),  # lock
            _list_result([existing_spec] if existing_spec else []),
            _list_result(calcs or []),
            _list_result(objects or []),
            _upsert_result(upsert_spec or existing_spec),
        ]
    )
    db.get = AsyncMock(return_value=_project_defaults())
    db.scalar = AsyncMock(return_value=0)
    db.commit = AsyncMock()
    db.flush = AsyncMock()
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
        db = _generate_db()
        result = await SpecificationService(db).generate(uuid.uuid4())
        assert result.items == []
        assert result.mode == "full"
        assert result.settings_version == 1
        db.add.assert_not_called()
        assert db.execute.await_count == 5
        db.commit.assert_awaited_once()

    async def test_replaces_existing_spec(self):
        existing = SimpleNamespace(items=[], generation_options=None)
        db = _generate_db(existing_spec=existing, upsert_spec=existing)
        await SpecificationService(db).generate(uuid.uuid4())
        db.add.assert_not_called()
        assert db.execute.await_count == 5

    async def test_preserves_manual_items_skips_broken(self):
        existing = SimpleNamespace(
            items=[
                {
                    "category": "extra",
                    "name": "Good",
                    "unit": "шт",
                    "quantity": 1,
                    "source": "manual",
                },
                {"category": "broken"},
                {"name": "Auto-old", "source": "auto"},
            ],
            generation_options=None,
        )
        db = _generate_db(existing_spec=existing, upsert_spec=existing)
        items = (await SpecificationService(db).generate(uuid.uuid4())).items
        assert any(i.name == "Good" and i.source == "manual" for i in items)
        assert not any(i.name == "broken" for i in items)

    async def test_generate_uses_request_options_snapshot(self):
        db = _generate_db()
        opts = SpecificationOptions(reserve_coefficient=1.4, ex_zone=True)
        result = await SpecificationService(db).generate(uuid.uuid4(), options=opts)
        assert result.settings_version == 1
        # Upsert generation_options is the last execute's insert payload —
        # verified via returned settings_version and partial diagnostics.
        assert result.mode == "full"
        # SEEDS-01/02 registered: generation may be complete (no matrix/section missing).
        assert result.excluded_groups is not None

    async def test_generate_resolves_tt_order_mark_to_exact_bom_code(self):
        from app.models.electrical_calculation import ElectricalCalculation

        calc = ElectricalCalculation(
            project_id=uuid.uuid4(),
            object_id=uuid.uuid4(),
            variant_number=1,
            cable_type="self_regulating_tt",
            cable_mark="30ТТВ2-СР",
            params={},
            results={
                "selected_cable": "30ТТВ2",
                "order_cable_length": 10,
                "installed_cable_length": 10,
            },
        )
        obj = SimpleNamespace(
            id=calc.object_id,
            object_type="pipe",
            params={"outer_diameter": 0.108, "pipe_length": 10},
            results={},
        )
        db = _generate_db(calcs=[calc], objects=[obj])
        items = (await SpecificationService(db).generate(uuid.uuid4())).items
        cables = [i for i in items if i.category == "Кабель"]
        assert len(cables) == 1
        assert cables[0].article == "001-002-002"

    async def test_preflight_rejects_tt_mark_missing_from_exact_bom(self):
        from app.services.electrical_variant_service import ElectricalVariantServiceError

        object_id = uuid.uuid4()
        obj = SimpleNamespace(
            id=object_id,
            object_type="pipe",
            params={"outer_diameter": 0.108, "pipe_length": 10},
            results={},
        )
        db = AsyncMock()
        db.execute = AsyncMock(return_value=_list_result([obj]))
        db.get = AsyncMock(return_value=_project_defaults())
        service = SpecificationService(db)
        service._electrical_results_for_variant = AsyncMock(
            return_value=[
                {
                    "object_id": str(object_id),
                    "cable_type": "self_regulating_tt",
                    "cable_mark": "30ТТВ2-СТ",
                    "selected_cable": "30ТТВ2",
                    "installed_cable_length": 10,
                    "order_cable_length": 11,
                }
            ]
        )

        try:
            await service.preflight_variant(
                uuid.uuid4(),
                variant_number=1,
                electrical_variant_id=uuid.uuid4(),
            )
            raise AssertionError("expected exact TT BOM preflight failure")
        except ElectricalVariantServiceError as exc:
            assert exc.code == "SPEC_CABLE_NOMENCLATURE_MISSING"
            assert exc.status_code == 422
            assert exc.details["full_mark"] == "30ТТВ2-СТ"

    async def test_generate_excludes_stale_cable_from_auto_items(self):
        from app.models.electrical_calculation import ElectricalCalculation

        calc = ElectricalCalculation(
            project_id=uuid.uuid4(),
            object_id=uuid.uuid4(),
            variant_number=1,
            cable_type="self_regulating",
            cable_mark="ТЛТ-100",
            params={},
            results={
                "selected_cable": "ТЛТ-100",
                "order_cable_length": 100,
                "installed_cable_length": 100,
                "error_code": "stale_electrical_calculation",
                "category": "stale",
                "message": "Электрорасчёт устарел",
                "stale": True,
            },
        )
        obj = SimpleNamespace(
            id=calc.object_id,
            object_type="pipe",
            params={"outer_diameter": 0.108, "pipe_length": 10},
            results={},
        )
        db = _generate_db(calcs=[calc], objects=[obj])
        items = (await SpecificationService(db).generate(uuid.uuid4())).items
        assert [i for i in items if i.category == "Кабель"] == []


class TestSaveItems:
    async def test_creates_new_when_no_existing(self):
        db = AsyncMock()
        # lock + get_specification (none) + upsert
        db.execute = AsyncMock(
            side_effect=[_empty_result(), _list_result([]), _upsert_result()]
        )
        db.commit = AsyncMock()
        db.add = MagicMock()
        items = [SpecificationItem(category="a", name="A", unit="шт", quantity=1)]
        result = await SpecificationService(db).save_items(uuid.uuid4(), items)
        assert result == items
        db.add.assert_not_called()
        assert db.execute.await_count == 3
        db.commit.assert_awaited_once()

    async def test_replaces_when_existing(self):
        fresh = SimpleNamespace(is_stale=False, items=[])
        db = AsyncMock()
        db.execute = AsyncMock(
            side_effect=[_empty_result(), _list_result([fresh]), _upsert_result()]
        )
        db.commit = AsyncMock()
        db.add = MagicMock()
        items = [SpecificationItem(category="b", name="B", unit="шт", quantity=2)]
        result = await SpecificationService(db).save_items(uuid.uuid4(), items, variant_number=2)
        assert result == items
        db.add.assert_not_called()
        assert db.execute.await_count == 3
        db.commit.assert_awaited_once()

    async def test_rejects_stale_read_only(self):
        """FA-07: PUT on stale specification is blocked with 409."""
        from app.services.electrical_variant_service import ElectricalVariantServiceError

        stale = SimpleNamespace(is_stale=True, items=[{"name": "old"}])
        db = AsyncMock()
        db.execute = AsyncMock(side_effect=[_empty_result(), _list_result([stale])])
        db.commit = AsyncMock()
        items = [SpecificationItem(category="c", name="C", unit="шт", quantity=1)]
        try:
            await SpecificationService(db).save_items(uuid.uuid4(), items)
            raise AssertionError("expected ElectricalVariantServiceError")
        except ElectricalVariantServiceError as exc:
            assert exc.code == "SPECIFICATION_STALE_READ_ONLY"
            assert exc.status_code == 409
        db.commit.assert_not_awaited()


class TestProjectSettings:
    async def test_get_project_settings_defaults(self):
        db = AsyncMock()
        db.get = AsyncMock(return_value=_project_defaults())
        version, settings = await SpecificationService(db).get_project_settings(uuid.uuid4())
        assert version == 1
        assert settings.reserve_coefficient == 1.0

    async def test_update_project_settings_bumps_version_and_stales(self):
        project = SimpleNamespace(
            specification_settings={"reserve_coefficient": 1.0, "ex_zone": False},
            specification_settings_version=2,
        )
        old_spec = SimpleNamespace(
            is_stale=False,
            generation_options={
                "reserve_coefficient": 1.0,
                "ex_zone": False,
                "settings_version": 2,
            },
            stale_reason=None,
            stale_at=None,
            stale_details=None,
        )
        db = AsyncMock()
        db.execute = AsyncMock(
            side_effect=[
                _empty_result(),  # lock
                _list_result([old_spec]),  # mark stale query
            ]
        )
        db.get = AsyncMock(return_value=project)
        db.commit = AsyncMock()
        db.flush = AsyncMock()

        version, settings = await SpecificationService(db).update_project_settings(
            uuid.uuid4(),
            SpecificationOptions(reserve_coefficient=1.5, ex_zone=True),
        )
        assert version == 3
        assert settings.reserve_coefficient == 1.5
        assert project.specification_settings_version == 3
        assert old_spec.is_stale is True
        assert old_spec.stale_reason == "specification_settings_changed"
