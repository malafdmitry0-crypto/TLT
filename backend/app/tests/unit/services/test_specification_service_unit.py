"""Unit tests for the UUID-only specification persistence repository."""

from __future__ import annotations

import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.schemas.specification import SpecificationItem
from app.services.electrical_variant_service import ElectricalVariantServiceError
from app.services.specification_service import SpecificationService


def _scalars_result(value=None, values=None):
    result = MagicMock()
    scalars = MagicMock()
    scalars.one_or_none.return_value = value
    scalars.all.return_value = list(values or ([] if value is None else [value]))
    result.scalars.return_value = scalars
    return result


def _upsert_result(value=None):
    result = MagicMock()
    result.scalar_one.return_value = value or SimpleNamespace(items=[])
    return result


def _manual(name: str = "Manual") -> SpecificationItem:
    return SpecificationItem(
        category="extra",
        name=name,
        unit="шт.",
        quantity="2.5",
        source="manual",
    )


def _auto_payload(name: str = "Auto") -> dict[str, object]:
    return {
        "category": "cable",
        "name": name,
        "unit": "м",
        "quantity": "10",
        "source": "auto",
    }


class TestGetSpecification:
    async def test_returns_exact_uuid_specification(self):
        spec = SimpleNamespace(id=uuid.uuid4())
        db = AsyncMock()
        db.execute = AsyncMock(return_value=_scalars_result(spec))

        result = await SpecificationService(db).get_specification(
            uuid.uuid4(),
            electrical_variant_id=uuid.uuid4(),
        )

        assert result is spec

    async def test_returns_none_when_not_found(self):
        db = AsyncMock()
        db.execute = AsyncMock(return_value=_scalars_result())

        result = await SpecificationService(db).get_specification(
            uuid.uuid4(),
            electrical_variant_id=uuid.uuid4(),
        )

        assert result is None


class TestSaveManualItems:
    async def test_creates_uuid_scoped_manual_specification(self):
        db = AsyncMock()
        db.execute = AsyncMock(
            side_effect=[
                MagicMock(),
                _scalars_result(),
                _upsert_result(),
            ]
        )
        db.commit = AsyncMock()
        item = _manual()

        result = await SpecificationService(db).save_items(
            uuid.uuid4(),
            uuid.uuid4(),
            [item],
        )

        assert result == [item]
        db.commit.assert_awaited_once()

    async def test_replaces_only_manual_rows_and_preserves_auto_rows(self):
        existing = SimpleNamespace(
            is_stale=False,
            items=[
                _auto_payload(),
                _manual("Old manual").model_dump(mode="json"),
            ],
        )
        db = AsyncMock()
        db.execute = AsyncMock(
            side_effect=[MagicMock(), _scalars_result(existing), _upsert_result(existing)]
        )
        db.commit = AsyncMock()

        result = await SpecificationService(db).save_items(
            uuid.uuid4(),
            uuid.uuid4(),
            [_manual("New manual")],
        )

        assert [(item.name, item.source) for item in result] == [
            ("Auto", "auto"),
            ("New manual", "manual"),
        ]

    async def test_rejects_client_owned_auto_rows(self):
        db = AsyncMock()
        auto = SpecificationItem.model_validate(_auto_payload())

        with pytest.raises(ElectricalVariantServiceError) as captured:
            await SpecificationService(db).save_items(
                uuid.uuid4(),
                uuid.uuid4(),
                [auto],
            )

        assert captured.value.code == "SPEC_REQUEST_INVALID"
        db.execute.assert_not_awaited()

    async def test_corrupt_stored_auto_row_blocks_without_data_loss(self):
        existing = SimpleNamespace(
            is_stale=False,
            items=[{"category": "cable", "source": "auto"}],
        )
        db = AsyncMock()
        db.execute = AsyncMock(side_effect=[MagicMock(), _scalars_result(existing)])
        db.commit = AsyncMock()

        with pytest.raises(ElectricalVariantServiceError) as captured:
            await SpecificationService(db).save_items(
                uuid.uuid4(),
                uuid.uuid4(),
                [_manual()],
            )

        assert captured.value.code == "SPEC_STORED_AUTO_ITEM_INVALID"
        db.commit.assert_not_awaited()
        assert db.execute.await_count == 2

    async def test_stale_specification_is_read_only(self):
        existing = SimpleNamespace(is_stale=True, items=[_auto_payload()])
        db = AsyncMock()
        db.execute = AsyncMock(side_effect=[MagicMock(), _scalars_result(existing)])
        db.commit = AsyncMock()

        with pytest.raises(ElectricalVariantServiceError) as captured:
            await SpecificationService(db).save_items(
                uuid.uuid4(),
                uuid.uuid4(),
                [_manual()],
            )

        assert captured.value.code == "SPECIFICATION_STALE_READ_ONLY"
        assert captured.value.status_code == 409
        db.commit.assert_not_awaited()


class TestPreciseStaleHooks:
    async def test_mark_project_specifications_stales_all(self):
        specs = [
            SimpleNamespace(
                is_stale=False,
                stale_reason=None,
                stale_at=None,
                stale_details=None,
            ),
            SimpleNamespace(
                is_stale=False,
                stale_reason=None,
                stale_at=None,
                stale_details=None,
            ),
        ]
        db = AsyncMock()
        db.execute = AsyncMock(return_value=_scalars_result(values=specs))
        db.flush = AsyncMock()

        count = await SpecificationService(db).mark_project_specifications_stale(
            uuid.uuid4(),
            "specification_settings_changed",
            operation="settings_update",
        )

        assert count == 2
        assert all(spec.is_stale for spec in specs)
        assert all(spec.stale_reason == "specification_settings_changed" for spec in specs)

    async def test_mark_electrical_variant_stales_only_exact_specification(self):
        target = SimpleNamespace(
            is_stale=False,
            stale_reason=None,
            stale_at=None,
            stale_details=None,
        )
        result = MagicMock()
        result.scalar_one_or_none.return_value = target
        db = AsyncMock()
        db.execute = AsyncMock(return_value=result)
        db.flush = AsyncMock()
        variant_id = uuid.uuid4()

        count = await SpecificationService(db).mark_electrical_variant_specification_stale(
            uuid.uuid4(),
            variant_id,
            "electrical_calculation_changed",
            operation="calculation_upsert",
        )

        assert count == 1
        assert target.is_stale is True
        assert target.stale_details["electrical_variant_id"] == str(variant_id)

    async def test_object_stale_scope_follows_assigned_er_ids(self):
        variant_id = uuid.uuid4()
        object_id = uuid.uuid4()
        variants_result = MagicMock()
        variants_result.all.return_value = [(variant_id,)]
        spec = SimpleNamespace(
            is_stale=False,
            stale_reason=None,
            stale_at=None,
            stale_details=None,
        )
        spec_result = MagicMock()
        spec_result.scalar_one_or_none.return_value = spec
        db = AsyncMock()
        db.execute = AsyncMock(side_effect=[variants_result, spec_result])
        db.flush = AsyncMock()

        count = await SpecificationService(db).mark_specifications_stale_for_objects(
            uuid.uuid4(),
            [object_id],
            "object_deleted",
            operation="delete",
        )

        assert count == 1
        assert spec.is_stale is True
        assert spec.stale_details["object_ids"] == [str(object_id)]
