"""FastAPI-зависимости: текущий пользователь / гость / проверка роли."""

from collections.abc import Awaitable, Callable, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Literal, cast
from uuid import UUID

from fastapi import Cookie, Depends, Header, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.guest_activity import should_touch_guest_session_in_db
from app.core.security import decode_token
from app.models.guest_session import GuestSession
from app.models.user import User

bearer_scheme = HTTPBearer(auto_error=False)

Role = Literal["guest", "employee", "admin"]


@dataclass
class CurrentPrincipal:
    """Унифицированное представление текущего актора.

    Для Guest: user_id=None, session_id заполнен.
    Для Employee/Admin: user_id заполнен, session_id=None.
    """

    role: Role
    user_id: UUID | None = None
    session_id: str | None = None
    email: str | None = None


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    access_cookie: str | None = Cookie(default=None, alias=settings.ACCESS_COOKIE_NAME),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Возвращает User из JWT или 401."""
    token = credentials.credentials if credentials is not None else access_cookie
    if token is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Требуется авторизация",
        )
    try:
        payload = decode_token(token)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Недействительный токен",
        ) from exc
    if payload.get("type") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Ожидался access-токен",
        )
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Некорректный токен",
        )
    result = await db.execute(select(User).where(User.id == UUID(user_id)))
    user = result.scalar_one_or_none()
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Пользователь не найден или неактивен",
        )
    return user


async def get_current_user_or_guest(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    access_cookie: str | None = Cookie(default=None, alias=settings.ACCESS_COOKIE_NAME),
    x_session_id: str | None = Header(default=None, alias="X-Session-Id"),
    guest_cookie: str | None = Cookie(default=None, alias=settings.GUEST_COOKIE_NAME),
    db: AsyncSession = Depends(get_db),
) -> CurrentPrincipal:
    """JWT → Employee/Admin, иначе X-Session-Id → Guest."""
    if credentials is not None:
        user = await get_current_user(credentials, access_cookie, db)
        # user.role — строка из ENUM в БД; типизируется как Role (employee|admin).
        # Guest не попадает сюда (приходит по X-Session-Id), поэтому cast безопасен.
        return CurrentPrincipal(
            role=cast(Role, user.role),
            user_id=user.id,
            email=user.email,
        )
    guest_session_ids = dict.fromkeys(
        session_id for session_id in (x_session_id, guest_cookie) if session_id
    )
    if guest_session_ids:
        session = None
        for guest_session_id in guest_session_ids:
            result = await db.execute(
                select(GuestSession).where(GuestSession.session_id == guest_session_id)
            )
            session = result.scalar_one_or_none()
            if session is not None:
                break
        if session is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Сессия не найдена или истекла",
            )
        # Redis stores a fresh heartbeat on every request, while Postgres
        # last_activity is throttled to avoid UPDATE+COMMIT on every GET.
        if await should_touch_guest_session_in_db(session.session_id):
            session.last_activity = datetime.now(UTC)
            await db.commit()
        return CurrentPrincipal(role="guest", session_id=session.session_id)
    if access_cookie is not None:
        user = await get_current_user(credentials, access_cookie, db)
        return CurrentPrincipal(
            role=cast(Role, user.role),
            user_id=user.id,
            email=user.email,
        )
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Требуется авторизация или X-Session-Id",
    )


PrincipalDependency = Callable[..., Awaitable[CurrentPrincipal]]


def require_role(allowed_roles: Sequence[Role]) -> PrincipalDependency:
    """Factory: проверяет, что у текущего принципала допустимая роль."""

    async def checker(
        principal: CurrentPrincipal = Depends(get_current_user_or_guest),
    ) -> CurrentPrincipal:
        if principal.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Недостаточно прав",
            )
        return principal

    return checker


def require_admin() -> PrincipalDependency:
    return require_role(["admin"])


def require_employee() -> PrincipalDependency:
    return require_role(["employee", "admin"])


def require_any() -> PrincipalDependency:
    return require_role(["guest", "employee", "admin"])
