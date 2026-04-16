"""Unit-тесты AuthService с мок-БД."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.core.security import create_access_token, create_refresh_token, hash_password
from app.services.auth_service import AuthError, AuthService


def _mock_db(
    scalar_value=None,
    rowcount: int = 0,
) -> AsyncMock:
    db = AsyncMock()
    result = MagicMock()
    result.scalar_one_or_none = lambda: scalar_value
    result.rowcount = rowcount
    db.execute = AsyncMock(return_value=result)
    db.commit = AsyncMock()
    db.refresh = AsyncMock()
    db.add = MagicMock()
    return db


class TestCreateGuestSession:
    async def test_creates_session_with_random_token(self):
        db = _mock_db()
        service = AuthService(db)
        session = await service.create_guest_session()
        # token_urlsafe(32) → ~43 символа
        assert len(session.session_id) >= 40
        db.add.assert_called_once()
        db.commit.assert_awaited_once()
        db.refresh.assert_awaited_once()


class TestCleanupExpiredGuestSessions:
    async def test_returns_zero_when_nothing_to_delete(self):
        db = _mock_db(rowcount=0)
        service = AuthService(db)
        assert await service.cleanup_expired_guest_sessions(ttl_minutes=20) == 0

    async def test_returns_rowcount(self):
        db = _mock_db(rowcount=5)
        service = AuthService(db)
        assert await service.cleanup_expired_guest_sessions(ttl_minutes=20) == 5
        db.commit.assert_awaited_once()


class TestTouchGuestSession:
    async def test_updates_activity_when_session_found(self):
        session = SimpleNamespace(
            session_id="abc",
            last_activity=datetime.now(UTC) - timedelta(days=5),
        )
        db = _mock_db(scalar_value=session)
        service = AuthService(db)
        await service.touch_guest_session("abc")
        # last_activity обновлено
        assert session.last_activity > datetime.now(UTC) - timedelta(seconds=5)
        db.commit.assert_awaited_once()

    async def test_ignores_unknown_session(self):
        db = _mock_db(scalar_value=None)
        service = AuthService(db)
        await service.touch_guest_session("missing")
        db.commit.assert_not_awaited()


class TestLogin:
    async def test_invalid_email_raises(self):
        db = _mock_db(scalar_value=None)
        with pytest.raises(AuthError, match="Неверный"):
            await AuthService(db).login("a@b.c", "pw")

    async def test_wrong_password_raises(self):
        user = SimpleNamespace(
            id=uuid.uuid4(),
            email="a@b.c",
            hashed_password=hash_password("correct"),
            is_active=True,
            role="employee",
        )
        db = _mock_db(scalar_value=user)
        with pytest.raises(AuthError, match="Неверный"):
            await AuthService(db).login("a@b.c", "wrong-password")

    async def test_inactive_user_raises(self):
        user = SimpleNamespace(
            id=uuid.uuid4(),
            email="a@b.c",
            hashed_password=hash_password("pw"),
            is_active=False,
            role="employee",
        )
        db = _mock_db(scalar_value=user)
        with pytest.raises(AuthError, match="деактивирован"):
            await AuthService(db).login("a@b.c", "pw")

    async def test_success_returns_token_pair(self):
        user = SimpleNamespace(
            id=uuid.uuid4(),
            email="a@b.c",
            hashed_password=hash_password("pw"),
            is_active=True,
            role="employee",
        )
        db = _mock_db(scalar_value=user)
        tokens = await AuthService(db).login("a@b.c", "pw")
        assert tokens.access_token
        assert tokens.refresh_token
        assert tokens.access_token != tokens.refresh_token


class TestRefresh:
    async def test_invalid_token_raises(self):
        db = _mock_db()
        with pytest.raises(AuthError, match="Недействительный"):
            await AuthService(db).refresh("not-a-jwt")

    async def test_non_refresh_token_rejected(self):
        access = create_access_token("00000000-0000-0000-0000-000000000001", role="employee")
        db = _mock_db()
        with pytest.raises(AuthError, match="refresh"):
            await AuthService(db).refresh(access)

    async def test_unknown_user_rejected(self):
        refresh = create_refresh_token("00000000-0000-0000-0000-000000000001")
        db = _mock_db(scalar_value=None)
        with pytest.raises(AuthError, match="не найден"):
            await AuthService(db).refresh(refresh)

    async def test_deactivated_user_rejected(self):
        user_id = uuid.uuid4()
        refresh = create_refresh_token(str(user_id))
        user = SimpleNamespace(id=user_id, is_active=False, role="employee")
        db = _mock_db(scalar_value=user)
        with pytest.raises(AuthError, match="не найден"):
            await AuthService(db).refresh(refresh)

    async def test_happy_path_returns_new_tokens(self):
        user_id = uuid.uuid4()
        refresh = create_refresh_token(str(user_id))
        user = SimpleNamespace(id=user_id, is_active=True, role="admin")
        db = _mock_db(scalar_value=user)
        pair = await AuthService(db).refresh(refresh)
        assert pair.access_token
        assert pair.refresh_token


class TestCreateUser:
    async def test_duplicate_email_rejected(self):
        existing = SimpleNamespace(id=uuid.uuid4(), email="a@b.c")
        db = _mock_db(scalar_value=existing)
        with pytest.raises(AuthError, match="уже существует"):
            await AuthService(db).create_user("a@b.c", "pw", "employee")

    async def test_creates_new_user(self):
        db = _mock_db(scalar_value=None)
        user = await AuthService(db).create_user("new@x.com", "secret", "employee", full_name="New")
        assert user.email == "new@x.com"
        assert user.role == "employee"
        assert user.full_name == "New"
        assert user.is_active is True
        assert user.hashed_password != "secret"
        db.commit.assert_awaited_once()
