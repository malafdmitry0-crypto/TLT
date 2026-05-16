"""FastAPI application entrypoint."""

import asyncio
import logging
from contextlib import asynccontextmanager, suppress
from typing import ClassVar

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, ORJSONResponse
from sqlalchemy import select

from app.api.v1.router import api_router
from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.core.redis_client import close_redis, get_redis
from app.core.security import hash_password
from app.models.user import User
from app.reference_data.loader import preload_all
from app.services.auth_service import AuthService

logger = logging.getLogger("heatcalc")
logging.basicConfig(level=logging.INFO)


async def ensure_first_admin() -> None:
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.email == settings.FIRST_ADMIN_EMAIL))
        if result.scalar_one_or_none() is not None:
            return
        admin = User(
            email=settings.FIRST_ADMIN_EMAIL,
            hashed_password=hash_password(settings.FIRST_ADMIN_PASSWORD),
            full_name="Администратор",
            role="admin",
            is_active=True,
        )
        db.add(admin)
        await db.commit()
        logger.info("Создан администратор по умолчанию: %s", settings.FIRST_ADMIN_EMAIL)


async def _try_acquire_cleanup_lock(ttl_seconds: int) -> bool:
    """Distributed lock через Redis SETNX. Возвращает True если этот инстанс
    получил эксклюзивное право на cleanup в этом окне.

    Без Redis (нет REDIS_URL) — всегда True (single-instance режим).
    """
    redis_url = settings.REDIS_URL
    if not redis_url:
        return True
    try:
        # SET key value NX EX ttl — атомарный «set if not exists» с TTL
        return bool(await get_redis().set("lock:guest_cleanup", "1", nx=True, ex=ttl_seconds))
    except Exception as exc:
        logger.warning("Cleanup lock через Redis недоступен: %s", exc)
        return True


async def cleanup_guest_sessions() -> None:
    """Удаляет пользовательские сессии без активности дольше GUEST_SESSION_TTL_MINUTES."""
    try:
        async with AsyncSessionLocal() as db:
            service = AuthService(db)
            await service.cleanup_expired_guest_sessions(settings.GUEST_SESSION_TTL_MINUTES)
    except Exception as exc:
        logger.warning("Не удалось выполнить cleanup пользовательских сессий: %s", exc)


async def _periodic_guest_cleanup() -> None:
    """Фоновая задача: раз в GUEST_CLEANUP_INTERVAL_MINUTES чистит протухшие сессии.

    При scale=N все инстансы запускают эту задачу, но только один получает
    лок в Redis на каждое окно — остальные skip'ают итерацию. Без Redis
    лок всегда «свободен» (single-instance режим).
    """
    interval = max(60, settings.GUEST_CLEANUP_INTERVAL_MINUTES * 60)
    while True:
        try:
            await asyncio.sleep(interval)
            # TTL лока чуть меньше интервала — освободится перед следующим окном
            if await _try_acquire_cleanup_lock(ttl_seconds=interval - 5):
                await cleanup_guest_sessions()
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.warning("Периодический cleanup упал: %s", exc)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Инициализация при старте: справочники, первый админ, cleanup сессий.

    Миграции Alembic применяются в entrypoint контейнера до запуска uvicorn
    (см. command в docker-compose.dev.yml / Dockerfile).
    """
    settings.validate_runtime_security()
    preload_all()
    try:
        await ensure_first_admin()
    except Exception as exc:
        logger.warning("Не удалось создать первого админа: %s", exc)
    await cleanup_guest_sessions()
    cleanup_task = asyncio.create_task(_periodic_guest_cleanup())
    try:
        yield
    finally:
        cleanup_task.cancel()
        with suppress(asyncio.CancelledError, Exception):
            await cleanup_task
        await close_redis()


app = FastAPI(
    title=settings.PROJECT_NAME,
    version="0.1.0",
    openapi_url=f"{settings.API_V1_PREFIX}/openapi.json",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
    default_response_class=ORJSONResponse,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class PayloadTooLargeError(Exception):
    pass


async def _send_payload_too_large(send) -> None:
    response = JSONResponse(
        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
        content={
            "detail": f"Размер запроса превышает лимит {settings.MAX_UPLOAD_BYTES // 1024} КБ",
            "error_code": "PAYLOAD_TOO_LARGE",
        },
    )

    async def empty_receive():
        return {"type": "http.disconnect"}

    await response({"type": "http", "method": "POST", "path": ""}, empty_receive, send)


class MaxBodySizeMiddleware:
    """Rejects oversized requests both by Content-Length and by streamed body bytes."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        headers = {
            key.decode("latin1").lower(): value.decode("latin1")
            for key, value in scope.get("headers", [])
        }
        content_length = headers.get("content-length")
        if content_length is not None:
            try:
                if int(content_length) > settings.MAX_UPLOAD_BYTES:
                    await _send_payload_too_large(send)
                    return
            except ValueError:
                pass

        seen = 0
        response_started = False

        async def send_wrapper(message):
            nonlocal response_started
            if message["type"] == "http.response.start":
                response_started = True
            await send(message)

        async def receive_wrapper():
            nonlocal seen
            message = await receive()
            if message["type"] == "http.request":
                seen += len(message.get("body") or b"")
                if seen > settings.MAX_UPLOAD_BYTES:
                    raise PayloadTooLargeError
            return message

        try:
            await self.app(scope, receive_wrapper, send_wrapper)
        except PayloadTooLargeError:
            if not response_started:
                await _send_payload_too_large(send)


class CsrfCookieMiddleware:
    """Require an explicit CSRF header when browser auth cookies are present."""

    SAFE_METHODS: ClassVar[set[str]] = {"GET", "HEAD", "OPTIONS"}
    EXEMPT_PATHS: ClassVar[set[str]] = {
        settings.API_V1_PREFIX + "/auth/login",
        settings.API_V1_PREFIX + "/auth/guest",
        settings.API_V1_PREFIX + "/auth/refresh",
    }

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope.get("method") in self.SAFE_METHODS:
            await self.app(scope, receive, send)
            return
        path = scope.get("path") or ""
        if path in self.EXEMPT_PATHS:
            await self.app(scope, receive, send)
            return
        request = Request(scope, receive=receive)
        has_bearer = bool(request.headers.get("Authorization"))
        has_auth_cookie = not has_bearer and bool(
            request.cookies.get(settings.ACCESS_COOKIE_NAME)
            or request.cookies.get(settings.REFRESH_COOKIE_NAME)
        )
        if has_auth_cookie:
            csrf_cookie = request.cookies.get(settings.CSRF_COOKIE_NAME)
            csrf_header = request.headers.get("X-CSRF-Token")
            if not csrf_cookie or not csrf_header or csrf_cookie != csrf_header:
                response = JSONResponse(
                    status_code=status.HTTP_403_FORBIDDEN,
                    content={"detail": "CSRF token mismatch", "error_code": "CSRF_TOKEN_MISMATCH"},
                )
                await response(scope, receive, send)
                return
        await self.app(scope, receive, send)


app.add_middleware(CsrfCookieMiddleware)
app.add_middleware(MaxBodySizeMiddleware)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "detail": "Ошибка валидации входных данных",
            "error_code": "VALIDATION_ERROR",
            "fields": {".".join(str(x) for x in e["loc"]): e["msg"] for e in exc.errors()},
        },
    )


app.include_router(api_router, prefix=settings.API_V1_PREFIX)


@app.get("/health", tags=["system"], summary="Проверка здоровья")
async def health() -> dict[str, str]:
    return {"status": "ok"}
