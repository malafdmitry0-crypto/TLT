"""Endpoints авторизации."""

import secrets
from datetime import UTC, datetime
from typing import Literal, cast
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.dependencies import CurrentPrincipal, get_current_user
from app.core.rate_limit import client_ip, enforce_rate_limit, guest_session_limiter, login_limiter
from app.core.security import decode_token
from app.models.guest_session import GuestSession
from app.models.project import Project
from app.models.user import User
from app.schemas.auth import (
    GuestSessionResponse,
    LoginRequest,
    RefreshRequest,
    TokenPair,
)
from app.schemas.user import UserResponse
from app.services.audit_service import AuditService
from app.services.auth_service import AuthError, AuthService

router = APIRouter()
CookieSameSite = Literal["lax", "strict", "none"]


def _cookie_samesite() -> CookieSameSite:
    return cast(CookieSameSite, settings.AUTH_COOKIE_SAMESITE)


def _set_auth_cookies(response: Response, tokens: TokenPair) -> None:
    response.delete_cookie(settings.GUEST_COOKIE_NAME, path="/")
    csrf_token = secrets.token_urlsafe(32)
    response.set_cookie(
        settings.ACCESS_COOKIE_NAME,
        tokens.access_token,
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        httponly=True,
        secure=settings.auth_cookie_secure,
        samesite=_cookie_samesite(),
        path="/",
    )
    if tokens.refresh_token:
        response.set_cookie(
            settings.REFRESH_COOKIE_NAME,
            tokens.refresh_token,
            max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60,
            httponly=True,
            secure=settings.auth_cookie_secure,
            samesite=_cookie_samesite(),
            path=settings.API_V1_PREFIX + "/auth",
        )
    response.set_cookie(
        settings.CSRF_COOKIE_NAME,
        csrf_token,
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60,
        httponly=False,
        secure=settings.auth_cookie_secure,
        samesite=_cookie_samesite(),
        path="/",
    )


def _clear_auth_cookies(response: Response) -> None:
    response.delete_cookie(settings.ACCESS_COOKIE_NAME, path="/")
    response.delete_cookie(settings.REFRESH_COOKIE_NAME, path=settings.API_V1_PREFIX + "/auth")
    response.delete_cookie(settings.CSRF_COOKIE_NAME, path="/")
    response.delete_cookie(settings.GUEST_COOKIE_NAME, path="/")


def _set_guest_cookies(response: Response, session_id: str) -> None:
    """Persist guest identity server-side while keeping CSRF protection explicit."""
    max_age = settings.GUEST_SESSION_TTL_MINUTES * 60
    response.set_cookie(
        settings.GUEST_COOKIE_NAME,
        session_id,
        max_age=max_age,
        httponly=True,
        secure=settings.auth_cookie_secure,
        samesite=_cookie_samesite(),
        path="/",
    )
    response.set_cookie(
        settings.CSRF_COOKIE_NAME,
        secrets.token_urlsafe(32),
        max_age=max_age,
        httponly=False,
        secure=settings.auth_cookie_secure,
        samesite=_cookie_samesite(),
        path="/",
    )


async def _guest_project(db: AsyncSession, session_id: str) -> Project | None:
    return cast(
        Project | None,
        await db.scalar(
            select(Project)
            .where(Project.session_id == session_id)
            .order_by(Project.created_at.asc())
            .limit(1)
        ),
    )


def _session_not_found() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Сессия не найдена или истекла",
    )


async def _persisted_guest_session(
    db: AsyncSession,
    request: Request,
) -> GuestSession | None:
    """Resolve only the canonical persisted-cookie guest identity."""
    session_id = request.cookies.get(settings.GUEST_COOKIE_NAME)
    if session_id is None:
        if request.headers.get("X-Session-Id") is not None:
            raise _session_not_found()
        return None
    session = await db.scalar(select(GuestSession).where(GuestSession.session_id == session_id))
    if session is None:
        raise _session_not_found()
    return session


@router.post(
    "/guest",
    response_model=GuestSessionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Создать гостевую сессию",
)
async def create_guest_session(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> GuestSessionResponse:
    """Создать анонимную гостевую сессию. Возвращает `session_id` для X-Session-Id.

    Лимит: 10 новых сессий с одного IP за 1 час.
    """
    ip = client_ip(request)
    if not await guest_session_limiter.ais_allowed(ip):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Превышен лимит создания пользовательских сессий. Повторите через час.",
            headers={"Retry-After": "3600"},
        )
    service = AuthService(db)
    session = await service.create_guest_session()
    # У пользователя (гостя) ровно один авто-проект — создаём сразу,
    # чтобы UI не показывал выбор/создание проекта.
    project = Project(
        name="Мой проект",
        session_id=session.session_id,
    )
    db.add(project)
    await db.commit()
    await db.refresh(project)
    _set_guest_cookies(response, session.session_id)
    auth_response = GuestSessionResponse(session_id=session.session_id, project=project)
    await AuditService(db).try_record(
        event_type="auth.guest_session.created",
        category="auth",
        principal=CurrentPrincipal(role="guest", session_id=session.session_id),
        project_id=project.id,
        details={"project_id": str(project.id), "client_ip": ip},
        message="Создана гостевая сессия и авто-проект",
    )
    return auth_response


@router.post(
    "/guest/resolve",
    response_model=GuestSessionResponse,
    summary="Восстановить или создать гостевую сессию",
)
async def resolve_guest_session(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> GuestSessionResponse:
    """Return the authoritative project for the persisted guest session."""
    session = await _persisted_guest_session(db, request)

    created = session is None
    if created:
        ip = client_ip(request)
        if not await guest_session_limiter.ais_allowed(ip):
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Превышен лимит создания пользовательских сессий. Повторите через час.",
                headers={"Retry-After": "3600"},
            )
        session = await AuthService(db).create_guest_session()

    if session is None:  # pragma: no cover - create_guest_session contract
        raise RuntimeError("Guest session creation returned no session")

    project = await _guest_project(db, session.session_id)
    if project is None:
        project = Project(name="Мой проект", session_id=session.session_id)
        db.add(project)
        await db.commit()
        await db.refresh(project)
    else:
        session.last_activity = datetime.now(UTC)
        await db.commit()

    _set_guest_cookies(response, session.session_id)
    if created:
        await AuditService(db).try_record(
            event_type="auth.guest_session.created",
            category="auth",
            principal=CurrentPrincipal(role="guest", session_id=session.session_id),
            project_id=project.id,
            details={"project_id": str(project.id), "client_ip": client_ip(request)},
            message="Создана гостевая сессия через resolve",
        )
    return GuestSessionResponse(session_id=session.session_id, project=project)


@router.get(
    "/guest/current",
    response_model=GuestSessionResponse | None,
    summary="Получить текущую гостевую сессию",
)
async def current_guest_session(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> GuestSessionResponse | None:
    """Probe persisted guest identity without creating anonymous server data."""
    session = await _persisted_guest_session(db, request)
    if session is None:
        return None
    project = await _guest_project(db, session.session_id)
    if project is None:
        raise _session_not_found()
    session.last_activity = datetime.now(UTC)
    await db.commit()
    _set_guest_cookies(response, session.session_id)
    return GuestSessionResponse(session_id=session.session_id, project=project)


@router.post(
    "/login",
    response_model=TokenPair,
    summary="Логин сотрудника / админа",
)
async def login(
    request: Request,
    data: LoginRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> TokenPair:
    """Авторизация сотрудника/администратора."""
    await enforce_rate_limit(
        login_limiter,
        client_ip(request),
        detail="Слишком много попыток входа с этого IP. Повторите через час.",
    )
    service = AuthService(db)
    try:
        tokens = await service.login(data.email, data.password, expected_role=data.role)
    except AuthError as exc:
        await AuditService(db).try_record(
            event_type="auth.login.failed",
            category="security",
            severity="warning",
            result="failure",
            details={"role": data.role, "client_ip": client_ip(request)},
            error_code="invalid_credentials",
            message=str(exc),
        )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc
    token_payload = decode_token(tokens.access_token)
    await AuditService(db).try_record(
        event_type="auth.login.succeeded",
        category="auth",
        principal=CurrentPrincipal(
            role=token_payload["role"],
            user_id=UUID(str(token_payload["sub"])),
        ),
        details={"role": token_payload["role"], "client_ip": client_ip(request)},
        message="Пользователь вошёл в систему",
    )
    _set_auth_cookies(response, tokens)
    return tokens


@router.post(
    "/refresh",
    response_model=TokenPair,
    summary="Обновить access token",
)
async def refresh(
    request: Request,
    response: Response,
    data: RefreshRequest | None = None,
    db: AsyncSession = Depends(get_db),
) -> TokenPair:
    """Обменять refresh-токен на новую пару токенов."""
    refresh_token = (data.refresh_token if data else None) or request.cookies.get(
        settings.REFRESH_COOKIE_NAME
    )
    if not refresh_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh-токен не найден"
        )
    service = AuthService(db)
    try:
        tokens = await service.refresh(refresh_token)
    except AuthError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc
    _set_auth_cookies(response, tokens)
    return tokens


@router.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Выйти и отозвать refresh-сессию",
)
async def logout(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> Response:
    refresh_token = request.cookies.get(settings.REFRESH_COOKIE_NAME)
    if refresh_token:
        await AuthService(db).revoke_refresh_token(refresh_token)
    _clear_auth_cookies(response)
    return response


@router.get(
    "/me",
    response_model=UserResponse,
    summary="Текущий пользователь",
)
async def me(
    user: User = Depends(get_current_user),
) -> User:
    """Вернуть текущего авторизованного пользователя."""
    return user
