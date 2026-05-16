"""Endpoints авторизации."""

import ipaddress
import secrets

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.core.rate_limit import guest_session_limiter
from app.models.project import Project
from app.models.user import User
from app.schemas.auth import (
    GuestSessionResponse,
    LoginRequest,
    RefreshRequest,
    TokenPair,
)
from app.schemas.user import UserResponse
from app.services.auth_service import AuthError, AuthService

router = APIRouter()


def _client_ip(request: Request) -> str:
    """Извлекает реальный IP с учётом reverse proxy (X-Forwarded-For)."""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded and _is_trusted_proxy(request):
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _is_trusted_proxy(request: Request) -> bool:
    if request.client is None:
        return False
    client_host = request.client.host
    for trusted in settings.trusted_proxy_ips_list:
        try:
            if ipaddress.ip_address(client_host) in ipaddress.ip_network(trusted, strict=False):
                return True
        except ValueError:
            if client_host == trusted:
                return True
    return False


def _set_auth_cookies(response: Response, tokens: TokenPair) -> None:
    csrf_token = secrets.token_urlsafe(32)
    response.set_cookie(
        settings.ACCESS_COOKIE_NAME,
        tokens.access_token,
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        httponly=True,
        secure=settings.AUTH_COOKIE_SECURE,
        samesite=settings.AUTH_COOKIE_SAMESITE,
        path="/",
    )
    if tokens.refresh_token:
        response.set_cookie(
            settings.REFRESH_COOKIE_NAME,
            tokens.refresh_token,
            max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60,
            httponly=True,
            secure=settings.AUTH_COOKIE_SECURE,
            samesite=settings.AUTH_COOKIE_SAMESITE,
            path=settings.API_V1_PREFIX + "/auth",
        )
    response.set_cookie(
        settings.CSRF_COOKIE_NAME,
        csrf_token,
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60,
        httponly=False,
        secure=settings.AUTH_COOKIE_SECURE,
        samesite=settings.AUTH_COOKIE_SAMESITE,
        path="/",
    )


def _clear_auth_cookies(response: Response) -> None:
    response.delete_cookie(settings.ACCESS_COOKIE_NAME, path="/")
    response.delete_cookie(settings.REFRESH_COOKIE_NAME, path=settings.API_V1_PREFIX + "/auth")
    response.delete_cookie(settings.CSRF_COOKIE_NAME, path="/")


@router.post(
    "/guest",
    response_model=GuestSessionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Создать гостевую сессию",
)
async def create_guest_session(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> GuestSessionResponse:
    """Создать анонимную гостевую сессию. Возвращает `session_id` для X-Session-Id.

    Лимит: 10 новых сессий с одного IP за 1 час.
    """
    ip = _client_ip(request)
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
    return GuestSessionResponse(session_id=session.session_id, project=project)


@router.post(
    "/login",
    response_model=TokenPair,
    summary="Логин сотрудника / админа",
)
async def login(
    data: LoginRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> TokenPair:
    """Авторизация сотрудника/администратора."""
    service = AuthService(db)
    try:
        tokens = await service.login(data.email, data.password, expected_role=data.role)
    except AuthError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc
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
