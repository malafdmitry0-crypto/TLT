"""FastAPI application entrypoint."""

import asyncio
import logging
import re
import time
import uuid
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
from app.core.logging_config import configure_logging
from app.core.redis_client import close_redis, get_redis
from app.core.request_context import reset_request_id, set_request_id
from app.core.security import hash_password
from app.electrical_variant_limits import MAX_ELECTRICAL_VARIANTS
from app.models.user import User
from app.reference_data.loader import preload_all
from app.services.auth_service import AuthService
from app.services.project_calculation_guard import ProjectCalculationBusyError
from app.services.task_recovery import TaskRecoveryCoordinator
from app.services.worker_readiness import readiness_snapshot

configure_logging()
logger = logging.getLogger("heatcalc")
http_logger = logging.getLogger("heatcalc.http")
_REQUEST_ID_RE = re.compile(r"^[A-Za-z0-9_.:-]{1,128}$")


def _safe_request_id(value: str | None) -> str:
    if value and _REQUEST_ID_RE.fullmatch(value):
        return value
    return uuid.uuid4().hex


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


async def _periodic_task_recovery() -> None:
    """Recover durable tasks even when no calculation consumer is running."""
    interval = max(5, settings.WORKER_RECOVERY_INTERVAL_SECONDS)
    coordinator: TaskRecoveryCoordinator | None = None
    try:
        while True:
            try:
                if coordinator is None:
                    coordinator = TaskRecoveryCoordinator()
                recovered = await coordinator.run_once()
                if recovered:
                    logger.info("Independent recovery processed %s background tasks", recovered)
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                logger.warning("Independent task recovery failed: %s", exc)
            await asyncio.sleep(interval)
    finally:
        if coordinator is not None:
            await coordinator.close()


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
    recovery_task = asyncio.create_task(_periodic_task_recovery())
    try:
        yield
    finally:
        cleanup_task.cancel()
        recovery_task.cancel()
        with suppress(asyncio.CancelledError, Exception):
            await cleanup_task
        with suppress(asyncio.CancelledError, Exception):
            await recovery_task
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


@app.middleware("http")
async def request_logging_middleware(request: Request, call_next):
    request_id = _safe_request_id(request.headers.get("X-Request-Id"))
    token = set_request_id(request_id)
    started = time.perf_counter()
    response = None
    status_code = 500
    try:
        response = await call_next(request)
        status_code = response.status_code
        return response
    except Exception:
        http_logger.exception(
            "http.request.failed",
            extra={
                "method": request.method,
                "path": request.url.path,
                "status_code": status_code,
                "client_ip": request.client.host if request.client else None,
            },
        )
        raise
    finally:
        duration_ms = round((time.perf_counter() - started) * 1000, 2)
        if response is not None:
            response.headers["X-Request-Id"] = request_id
        http_logger.info(
            "http.request",
            extra={
                "method": request.method,
                "path": request.url.path,
                "status_code": status_code,
                "duration_ms": duration_ms,
                "client_ip": request.client.host if request.client else None,
                "user_agent": request.headers.get("user-agent", "")[:200],
            },
        )
        reset_request_id(token)


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


@app.exception_handler(ProjectCalculationBusyError)
async def project_calculation_busy_handler(
    _request: Request,
    exc: ProjectCalculationBusyError,
) -> JSONResponse:
    return JSONResponse(
        status_code=status.HTTP_423_LOCKED,
        content={"detail": exc.as_detail()},
        headers={"Retry-After": str(exc.busy.retry_after_seconds)},
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    errors = exc.errors()
    is_specification_generate = (
        request.url.path.endswith("/generate") and "/specifications/" in request.url.path
    )
    variant_ids_required = any(
        tuple(error["loc"][-2:]) == ("body", "variant_ids")
        and (
            error["type"] == "missing"
            or (error["type"] == "too_short" and error.get("ctx", {}).get("actual_length") == 0)
        )
        for error in errors
    )
    issues = [
        {
            "path": ".".join(str(component) for component in error["loc"]),
            "message": error["msg"],
            "type": error["type"],
        }
        for error in errors
    ]
    if is_specification_generate and variant_ids_required:
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            content={
                "detail": {
                    "code": "SPEC_VARIANT_IDS_REQUIRED",
                    "message": (
                        "variant_ids must contain from one to " f"{MAX_ELECTRICAL_VARIANTS} UUIDs"
                    ),
                    "issues": issues,
                    "details": {},
                }
            },
        )
    if is_specification_generate:
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            content={
                "detail": {
                    "code": "SPEC_REQUEST_INVALID",
                    "message": "Invalid specification generation request",
                    "issues": issues,
                    "details": {},
                }
            },
        )
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        content={
            "detail": "Ошибка валидации входных данных",
            "error_code": "VALIDATION_ERROR",
            "fields": {".".join(str(x) for x in e["loc"]): e["msg"] for e in exc.errors()},
        },
    )


app.include_router(api_router, prefix=settings.API_V1_PREFIX)


@app.get("/health", tags=["system"], summary="Проверка liveness")
@app.get("/health/live", tags=["system"], summary="Проверка liveness")
async def health_live() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/health/ready", tags=["system"], summary="Проверка готовности приложения")
@app.get(
    f"{settings.API_V1_PREFIX}/health/ready",
    tags=["system"],
    summary="Проверка готовности приложения",
)
async def health_ready() -> JSONResponse:
    database_ready = False
    redis_ready = False
    active_consumers = 0
    last_heartbeat_at: str | None = None
    worker_reason: str | None = "starting"

    try:
        async with AsyncSessionLocal() as db:
            await db.execute(select(1))
        database_ready = True
    except Exception as exc:
        logger.warning("Readiness database probe failed: %s", exc)

    try:
        redis = get_redis()
        await redis.ping()
        redis_ready = True
        snapshot = await readiness_snapshot(redis)
        active_consumers = snapshot.active_consumers
        last_heartbeat_at = snapshot.last_heartbeat_at
        worker_reason = None if snapshot.ready else "no_consumer"
    except Exception as exc:
        worker_reason = "redis_unavailable"
        logger.warning("Readiness Redis/worker probe failed: %s", exc)

    ready = database_ready and redis_ready and active_consumers > 0
    content = {
        "status": "ready" if ready else "not_ready",
        "database": {"ready": database_ready},
        "redis": {"ready": redis_ready},
        "worker": {
            "ready": active_consumers > 0,
            "active_consumers": active_consumers,
            "last_heartbeat_at": last_heartbeat_at,
            "heartbeat_max_age_seconds": settings.WORKER_HEARTBEAT_TTL_SECONDS,
            "reason": worker_reason,
        },
    }
    return JSONResponse(
        status_code=status.HTTP_200_OK if ready else status.HTTP_503_SERVICE_UNAVAILABLE,
        content=content,
    )
