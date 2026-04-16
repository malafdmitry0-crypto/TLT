"""Сервис авторизации: логин, гостевые сессии, создание пользователей."""

import logging
import secrets
from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.models.guest_session import GuestSession
from app.models.user import User
from app.schemas.auth import TokenPair

logger = logging.getLogger("heatcalc.auth")


class AuthError(Exception):
    """Ошибка авторизации."""


class AuthService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def create_guest_session(self) -> GuestSession:
        session_id = secrets.token_urlsafe(32)
        session = GuestSession(session_id=session_id)
        self.db.add(session)
        await self.db.commit()
        await self.db.refresh(session)
        return session

    async def cleanup_expired_guest_sessions(self, ttl_minutes: int) -> int:
        """Удаляет пользовательские (гостевые) сессии без активности дольше ttl_minutes.

        Каскадно удаляет связанные проекты, объекты и расчёты
        (`ON DELETE CASCADE`). Возвращает количество удалённых сессий.
        """
        cutoff = datetime.now(UTC) - timedelta(minutes=ttl_minutes)
        result = await self.db.execute(
            delete(GuestSession).where(GuestSession.last_activity < cutoff)
        )
        await self.db.commit()
        deleted = result.rowcount
        if deleted:
            logger.info(
                "Cleanup: удалено %d просроченных пользовательских сессий (TTL %d мин.)",
                deleted,
                ttl_minutes,
            )
        return deleted

    async def touch_guest_session(self, session_id: str) -> None:
        """Обновляет last_activity при каждом обращении."""
        result = await self.db.execute(
            select(GuestSession).where(GuestSession.session_id == session_id)
        )
        session = result.scalar_one_or_none()
        if session:
            session.last_activity = datetime.now(UTC)
            await self.db.commit()

    async def login(self, email: str, password: str) -> TokenPair:
        result = await self.db.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()
        if user is None or not verify_password(password, user.hashed_password):
            raise AuthError("Неверный email или пароль")
        if not user.is_active:
            raise AuthError("Пользователь деактивирован")

        return TokenPair(
            access_token=create_access_token(str(user.id), role=user.role),
            refresh_token=create_refresh_token(str(user.id)),
        )

    async def refresh(self, refresh_token: str) -> TokenPair:
        try:
            payload = decode_token(refresh_token)
        except ValueError as exc:
            raise AuthError("Недействительный refresh-токен") from exc
        if payload.get("type") != "refresh":
            raise AuthError("Ожидался refresh-токен")
        user_id = payload.get("sub")
        if not user_id:
            raise AuthError("Некорректный токен")
        result = await self.db.execute(select(User).where(User.id == UUID(user_id)))
        user = result.scalar_one_or_none()
        if user is None or not user.is_active:
            raise AuthError("Пользователь не найден")
        return TokenPair(
            access_token=create_access_token(str(user.id), role=user.role),
            refresh_token=create_refresh_token(str(user.id)),
        )

    async def create_user(
        self,
        email: str,
        password: str,
        role: str,
        full_name: str | None = None,
    ) -> User:
        existing = await self.db.execute(select(User).where(User.email == email))
        if existing.scalar_one_or_none() is not None:
            raise AuthError(f"Пользователь {email} уже существует")
        user = User(
            email=email,
            hashed_password=hash_password(password),
            full_name=full_name,
            role=role,
            is_active=True,
        )
        self.db.add(user)
        await self.db.commit()
        await self.db.refresh(user)
        return user
