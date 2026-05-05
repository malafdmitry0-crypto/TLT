"""Endpoints авторизации."""

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

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
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


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
    if not guest_session_limiter.is_allowed(ip):
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
    db: AsyncSession = Depends(get_db),
) -> TokenPair:
    """Авторизация сотрудника/администратора."""
    service = AuthService(db)
    try:
        return await service.login(data.email, data.password, expected_role=data.role)
    except AuthError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc


@router.post(
    "/refresh",
    response_model=TokenPair,
    summary="Обновить access token",
)
async def refresh(
    data: RefreshRequest,
    db: AsyncSession = Depends(get_db),
) -> TokenPair:
    """Обменять refresh-токен на новую пару токенов."""
    service = AuthService(db)
    try:
        return await service.refresh(data.refresh_token)
    except AuthError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc


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
