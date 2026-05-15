"""Сервис авторизации: логин, гостевые сессии, создание пользователей."""

import hashlib
import logging
import secrets
from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.models.guest_session import GuestSession
from app.models.refresh_session import RefreshSession
from app.models.user import User, UserRole
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

    async def login(
        self,
        email: str,
        password: str,
        expected_role: UserRole | str | None = None,
    ) -> TokenPair:
        result = await self.db.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()
        if user is None or not verify_password(password, user.hashed_password):
            raise AuthError("Неверный email или пароль")
        if not user.is_active:
            raise AuthError("Пользователь деактивирован")
        user_role = user.role.value if isinstance(user.role, UserRole) else user.role
        expected_role_value = (
            expected_role.value if isinstance(expected_role, UserRole) else expected_role
        )
        if expected_role_value is not None and user_role != expected_role_value:
            raise AuthError("Неверный email или пароль")

        return await self._issue_token_pair(user)

    async def refresh(self, refresh_token: str) -> TokenPair:
        try:
            payload = decode_token(refresh_token)
        except ValueError as exc:
            raise AuthError("Недействительный refresh-токен") from exc
        if payload.get("type") != "refresh":
            raise AuthError("Ожидался refresh-токен")
        user_id = payload.get("sub")
        jti = payload.get("jti")
        if not user_id or not jti:
            raise AuthError("Некорректный токен")
        user_uuid = UUID(user_id)
        session_result = await self.db.execute(
            select(RefreshSession).where(
                RefreshSession.user_id == user_uuid,
                RefreshSession.jti_hash == self._hash_jti(str(jti)),
            )
        )
        session = session_result.scalar_one_or_none()
        now = datetime.now(UTC)
        if session is None:
            raise AuthError("Refresh-сессия не найдена")
        if session.revoked_at is not None:
            await self.revoke_all_refresh_sessions(user_uuid)
            raise AuthError("Refresh-токен уже был отозван")
        if session.expires_at <= now:
            session.revoked_at = now
            await self.db.commit()
            raise AuthError("Refresh-токен истёк")

        result = await self.db.execute(select(User).where(User.id == user_uuid))
        user = result.scalar_one_or_none()
        if user is None or not user.is_active:
            raise AuthError("Пользователь не найден")
        session.revoked_at = now
        return await self._issue_token_pair(user)

    async def revoke_refresh_token(self, refresh_token: str) -> None:
        try:
            payload = decode_token(refresh_token)
        except ValueError:
            return
        if payload.get("type") != "refresh":
            return
        user_id = payload.get("sub")
        jti = payload.get("jti")
        if not user_id or not jti:
            return
        now = datetime.now(UTC)
        await self.db.execute(
            update(RefreshSession)
            .where(
                RefreshSession.user_id == UUID(str(user_id)),
                RefreshSession.jti_hash == self._hash_jti(str(jti)),
                RefreshSession.revoked_at.is_(None),
            )
            .values(revoked_at=now)
        )
        await self.db.commit()

    async def revoke_all_refresh_sessions(self, user_id: UUID) -> None:
        await self.db.execute(
            update(RefreshSession)
            .where(
                RefreshSession.user_id == user_id,
                RefreshSession.revoked_at.is_(None),
            )
            .values(revoked_at=datetime.now(UTC))
        )
        await self.db.commit()

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

    async def _issue_token_pair(self, user: User) -> TokenPair:
        jti = secrets.token_urlsafe(32)
        expires_at = datetime.now(UTC) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
        session = RefreshSession(
            user_id=user.id,
            jti_hash=self._hash_jti(jti),
            expires_at=expires_at,
        )
        self.db.add(session)
        await self.db.commit()
        return TokenPair(
            access_token=create_access_token(str(user.id), role=user.role),
            refresh_token=create_refresh_token(str(user.id), jti=jti),
        )

    @staticmethod
    def _hash_jti(jti: str) -> str:
        return hashlib.sha256(jti.encode("utf-8")).hexdigest()
