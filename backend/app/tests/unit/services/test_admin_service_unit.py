"""Unit-тесты AdminService с мок-БД — гарантированное покрытие веток CRUD."""

from __future__ import annotations

import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.services.admin_service import AdminError, AdminService


def _mock_db(scalar=None, scalars_all=None):
    db = AsyncMock()
    result = MagicMock()
    result.scalar_one_or_none = lambda: scalar
    result.scalars = lambda: MagicMock(all=lambda: scalars_all or [])
    db.execute = AsyncMock(return_value=result)
    db.commit = AsyncMock()
    db.refresh = AsyncMock()
    db.delete = AsyncMock()
    db.add = MagicMock()
    return db


# ─── Users ─────────────────────────────────────────────────────────────────


class TestUsers:
    async def test_list_users_returns_rows(self):
        users = [SimpleNamespace(id=uuid.uuid4(), email="a@b")]
        db = _mock_db(scalars_all=users)
        result = await AdminService(db).list_users()
        assert result == users

    async def test_create_user_happy_path(self):
        from app.schemas.user import UserCreate

        # Первый execute — проверка дубликата (нет), второй — после refresh
        db = _mock_db()
        user = await AdminService(db).create_user(
            UserCreate(
                email="new@x.com",
                password="qwerty12",
                role="employee",
                full_name="New",
            )
        )
        assert user.email == "new@x.com"
        assert user.role == "employee"
        assert user.is_active is True
        # пароль захэширован, не равен оригиналу
        assert user.hashed_password != "qwerty12"
        db.add.assert_called_once()

    async def test_create_user_duplicate_raises(self):
        from app.schemas.user import UserCreate

        existing = SimpleNamespace(id=uuid.uuid4(), email="dup@x.com")
        db = _mock_db(scalar=existing)
        with pytest.raises(AdminError, match="уже существует"):
            await AdminService(db).create_user(
                UserCreate(email="dup@x.com", password="q12345", role="employee")
            )

    async def test_update_user_full_name(self):
        from app.schemas.user import UserUpdate

        existing = SimpleNamespace(
            id=uuid.uuid4(),
            full_name="Old",
            role="employee",
            is_active=True,
            hashed_password="hash",
        )
        db = _mock_db(scalar=existing)
        result = await AdminService(db).update_user(existing.id, UserUpdate(full_name="New"))
        assert result.full_name == "New"

    async def test_update_user_password_rehashed(self):
        from app.schemas.user import UserUpdate

        existing = SimpleNamespace(
            id=uuid.uuid4(),
            full_name="X",
            role="employee",
            is_active=True,
            hashed_password="oldhash",
        )
        db = _mock_db(scalar=existing)
        await AdminService(db).update_user(existing.id, UserUpdate(password="newpassword12"))
        # Хэш изменился (passlib не вернёт исходник)
        assert existing.hashed_password != "oldhash"
        assert existing.hashed_password != "newpassword12"

    async def test_update_user_unknown_raises(self):
        from app.schemas.user import UserUpdate

        db = _mock_db(scalar=None)
        with pytest.raises(AdminError, match="не найден"):
            await AdminService(db).update_user(uuid.uuid4(), UserUpdate(full_name="X"))

    async def test_deactivate_user(self):
        existing = SimpleNamespace(id=uuid.uuid4(), is_active=True)
        db = _mock_db(scalar=existing)
        result = await AdminService(db).deactivate_user(existing.id)
        assert result.is_active is False

    async def test_deactivate_user_unknown_raises(self):
        db = _mock_db(scalar=None)
        with pytest.raises(AdminError):
            await AdminService(db).deactivate_user(uuid.uuid4())


# ─── Coefficients ──────────────────────────────────────────────────────────


class TestCoefficients:
    async def test_list_coefficients(self):
        rows = [SimpleNamespace(key="k1", value=1.0)]
        db = _mock_db(scalars_all=rows)
        assert await AdminService(db).list_coefficients() == rows

    async def test_upsert_creates_new_when_missing(self):
        from app.schemas.coefficient import CoefficientUpdate

        db = _mock_db(scalar=None)
        coeff = await AdminService(db).upsert_coefficient(
            "new_k", CoefficientUpdate(value=1.5, description="d"), uuid.uuid4()
        )
        assert coeff.key == "new_k"
        assert coeff.value == 1.5
        db.add.assert_called_once()

    async def test_upsert_updates_existing(self):
        from app.schemas.coefficient import CoefficientUpdate

        existing = SimpleNamespace(
            key="k",
            value=1.0,
            description="old",
            updated_by=None,
        )
        db = _mock_db(scalar=existing)
        u_id = uuid.uuid4()
        result = await AdminService(db).upsert_coefficient(
            "k", CoefficientUpdate(value=2.0, description="new"), u_id
        )
        assert result.value == 2.0
        assert result.description == "new"
        assert result.updated_by == u_id
        db.add.assert_not_called()

    async def test_upsert_keeps_description_if_not_provided(self):
        from app.schemas.coefficient import CoefficientUpdate

        existing = SimpleNamespace(
            key="k",
            value=1.0,
            description="keep_me",
            updated_by=None,
        )
        db = _mock_db(scalar=existing)
        await AdminService(db).upsert_coefficient("k", CoefficientUpdate(value=3.0), uuid.uuid4())
        assert existing.description == "keep_me"

    async def test_create_coefficient_delegates_to_upsert(self):
        from app.schemas.coefficient import CoefficientCreate

        db = _mock_db(scalar=None)
        result = await AdminService(db).create_coefficient(
            CoefficientCreate(key="cc", value=0.5, description="x"), uuid.uuid4()
        )
        assert result.key == "cc"


# ─── Cables ────────────────────────────────────────────────────────────────


class TestCables:
    async def test_list_cables(self):
        cables = [SimpleNamespace(id=uuid.uuid4())]
        db = _mock_db(scalars_all=cables)
        assert await AdminService(db).list_cables() == cables

    async def test_create_cable(self):
        from app.schemas.reference import CableExtendedCreate

        db = _mock_db()
        cable = await AdminService(db).create_cable(
            CableExtendedCreate(
                cable_type="self_regulating",
                brand="X",
                model="X-1",
                power_per_meter=20.0,
                max_temperature=100.0,
                min_temperature=-30.0,
            )
        )
        assert cable.brand == "X"
        db.add.assert_called_once()

    async def test_update_cable_unknown_raises(self):
        from app.schemas.reference import CableExtendedUpdate

        db = _mock_db(scalar=None)
        with pytest.raises(AdminError, match="Кабель не найден"):
            await AdminService(db).update_cable(
                uuid.uuid4(), CableExtendedUpdate(power_per_meter=10.0)
            )

    async def test_update_cable_applies_fields(self):
        from app.schemas.reference import CableExtendedUpdate

        existing = SimpleNamespace(
            id=uuid.uuid4(),
            brand="Old",
            power_per_meter=10.0,
        )
        db = _mock_db(scalar=existing)
        result = await AdminService(db).update_cable(
            existing.id,
            CableExtendedUpdate(brand="New", power_per_meter=15.0),
        )
        assert result.brand == "New"
        assert result.power_per_meter == 15.0

    async def test_delete_cable_unknown_raises(self):
        db = _mock_db(scalar=None)
        with pytest.raises(AdminError):
            await AdminService(db).delete_cable(uuid.uuid4())

    async def test_delete_cable_calls_db_delete(self):
        existing = SimpleNamespace(id=uuid.uuid4())
        db = _mock_db(scalar=existing)
        await AdminService(db).delete_cable(existing.id)
        db.delete.assert_awaited_once_with(existing)


# ─── Accessories ───────────────────────────────────────────────────────────


class TestAccessories:
    async def test_list_accessories(self):
        accs = [SimpleNamespace(id=uuid.uuid4())]
        db = _mock_db(scalars_all=accs)
        assert await AdminService(db).list_accessories() == accs

    async def test_create_accessory(self):
        from app.schemas.reference import AccessoryExtendedCreate

        db = _mock_db()
        acc = await AdminService(db).create_accessory(
            AccessoryExtendedCreate(category="cat", name="A", article="ART-1")
        )
        assert acc.name == "A"
        db.add.assert_called_once()

    async def test_update_accessory_unknown_raises(self):
        from app.schemas.reference import AccessoryExtendedUpdate

        db = _mock_db(scalar=None)
        with pytest.raises(AdminError, match="Аксессуар не найден"):
            await AdminService(db).update_accessory(uuid.uuid4(), AccessoryExtendedUpdate(name="X"))

    async def test_update_accessory_applies(self):
        from app.schemas.reference import AccessoryExtendedUpdate

        existing = SimpleNamespace(id=uuid.uuid4(), name="Old", article="A")
        db = _mock_db(scalar=existing)
        result = await AdminService(db).update_accessory(
            existing.id, AccessoryExtendedUpdate(name="New")
        )
        assert result.name == "New"

    async def test_delete_accessory_unknown_raises(self):
        db = _mock_db(scalar=None)
        with pytest.raises(AdminError):
            await AdminService(db).delete_accessory(uuid.uuid4())

    async def test_delete_accessory_calls_db_delete(self):
        existing = SimpleNamespace(id=uuid.uuid4())
        db = _mock_db(scalar=existing)
        await AdminService(db).delete_accessory(existing.id)
        db.delete.assert_awaited_once_with(existing)
