"""Rate limiter с двумя backend'ами: in-memory (default) и Redis (для HA).

Используется для защиты публичных и дорогих операций от brute force/DoS.
Sliding window реализован через `collections.deque` (in-memory) или sorted-set
ZADD/ZREMRANGEBYSCORE (Redis — переживает рестарт и работает на N инстансах).

Выбор backend'а — через `settings.REDIS_URL`. Без него подставляется
in-memory вариант.
"""

from __future__ import annotations

import asyncio
import ipaddress
import logging
import time
from asyncio import AbstractEventLoop
from collections import defaultdict, deque
from threading import Lock
from typing import Protocol

from fastapi import HTTPException, Request, status

from app.core.config import settings
from app.core.dependencies import CurrentPrincipal

logger = logging.getLogger("heatcalc.rate_limit")

_WINDOW_SECONDS = 3600  # 1 час
RETRY_AFTER_SECONDS = _WINDOW_SECONDS


class RateLimiter(Protocol):
    def is_allowed(self, ip: str) -> bool: ...
    async def ais_allowed(self, ip: str) -> bool: ...
    def remaining(self, ip: str) -> int: ...
    async def aremaining(self, ip: str) -> int: ...
    def reset(self, ip: str | None = None) -> None: ...


class IPRateLimiter:
    """In-memory sliding window. Сбрасывается при рестарте процесса."""

    def __init__(self, max_calls: int, window_seconds: int = _WINDOW_SECONDS) -> None:
        self._max = max_calls
        self._window = window_seconds
        self._data: dict[str, deque[float]] = defaultdict(deque)
        self._lock = Lock()

    def is_allowed(self, ip: str) -> bool:
        now = time.monotonic()
        cutoff = now - self._window
        with self._lock:
            q = self._data[ip]
            while q and q[0] < cutoff:
                q.popleft()
            if len(q) >= self._max:
                return False
            q.append(now)
            return True

    async def ais_allowed(self, ip: str) -> bool:
        return self.is_allowed(ip)

    def remaining(self, ip: str) -> int:
        now = time.monotonic()
        cutoff = now - self._window
        with self._lock:
            q = self._data[ip]
            while q and q[0] < cutoff:
                q.popleft()
            return max(0, self._max - len(q))

    async def aremaining(self, ip: str) -> int:
        return self.remaining(ip)

    def reset(self, ip: str | None = None) -> None:
        with self._lock:
            if ip is None:
                self._data.clear()
            else:
                self._data.pop(ip, None)


class RedisRateLimiter:
    """Sliding window через Redis sorted-set. Переживает рестарт и работает
    на нескольких инстансах backend'а.

    Ключ: `ratelimit:<namespace>:<key>`. Member: уникальный ts (микросекунды).
    Score: ts.
    На каждый запрос:
      - ZREMRANGEBYSCORE убирает устаревшие записи
      - ZCARD считает текущее окно
      - если < max — ZADD добавляет, EXPIRE на window
    """

    def __init__(
        self,
        max_calls: int,
        redis_url: str,
        window_seconds: int = _WINDOW_SECONDS,
        namespace: str = "default",
    ) -> None:
        # Импорт лениво, чтобы in-memory режим не требовал redis-pip
        from redis import Redis as SyncRedis

        self._max = max_calls
        self._window = window_seconds
        self._namespace = namespace
        self._redis_url = redis_url
        self._client = None
        self._client_loop: AbstractEventLoop | None = None
        self._sync_client = SyncRedis.from_url(
            redis_url,
            decode_responses=True,
            max_connections=settings.REDIS_MAX_CONNECTIONS,
            socket_keepalive=True,
            socket_connect_timeout=5,
            retry_on_timeout=True,
            health_check_interval=30,
        )

    def _key(self, ip: str) -> str:
        return f"ratelimit:{self._namespace}:{ip}"

    def _async_client(self):
        from redis.asyncio import Redis as AsyncRedis

        loop = asyncio.get_running_loop()
        if self._client is None or self._client_loop is not loop:
            self._client = AsyncRedis.from_url(
                self._redis_url,
                decode_responses=True,
                max_connections=settings.REDIS_MAX_CONNECTIONS,
                socket_keepalive=True,
                socket_connect_timeout=5,
                retry_on_timeout=True,
                health_check_interval=30,
            )
            self._client_loop = loop
        return self._client

    def is_allowed(self, ip: str) -> bool:
        now_us = int(time.time() * 1_000_000)
        cutoff = now_us - self._window * 1_000_000
        key = self._key(ip)
        pipe = self._sync_client.pipeline()
        pipe.zremrangebyscore(key, 0, cutoff)
        pipe.zcard(key)
        _, count = pipe.execute()
        if count >= self._max:
            return False
        pipe = self._sync_client.pipeline()
        pipe.zadd(key, {str(now_us): now_us})
        pipe.expire(key, self._window)
        pipe.execute()
        return True

    async def ais_allowed(self, ip: str) -> bool:
        client = self._async_client()
        now_us = int(time.time() * 1_000_000)
        cutoff = now_us - self._window * 1_000_000
        key = self._key(ip)
        pipe = client.pipeline()
        pipe.zremrangebyscore(key, 0, cutoff)
        pipe.zcard(key)
        _, count = await pipe.execute()
        if count >= self._max:
            return False
        pipe = client.pipeline()
        pipe.zadd(key, {str(now_us): now_us})
        pipe.expire(key, self._window)
        await pipe.execute()
        return True

    def remaining(self, ip: str) -> int:
        now_us = int(time.time() * 1_000_000)
        cutoff = now_us - self._window * 1_000_000
        key = self._key(ip)
        pipe = self._sync_client.pipeline()
        pipe.zremrangebyscore(key, 0, cutoff)
        pipe.zcard(key)
        _, count = pipe.execute()
        return max(0, self._max - int(count))

    async def aremaining(self, ip: str) -> int:
        client = self._async_client()
        now_us = int(time.time() * 1_000_000)
        cutoff = now_us - self._window * 1_000_000
        key = self._key(ip)
        pipe = client.pipeline()
        pipe.zremrangebyscore(key, 0, cutoff)
        pipe.zcard(key)
        _, count = await pipe.execute()
        return max(0, self._max - int(count))

    def reset(self, ip: str | None = None) -> None:
        if ip is None:
            for key in self._sync_client.scan_iter(f"ratelimit:{self._namespace}:*"):
                self._sync_client.delete(key)
        else:
            self._sync_client.delete(self._key(ip))

    async def areset(self, ip: str | None = None) -> None:
        client = self._async_client()
        if ip is None:
            async for k in client.scan_iter(f"ratelimit:{self._namespace}:*"):
                await client.delete(k)
        else:
            await client.delete(self._key(ip))


def _build_limiter(max_calls: int, *, namespace: str = "default") -> RateLimiter:
    """Factory: Redis если REDIS_URL задан и доступен, иначе in-memory.

    Если Redis настроен (REDIS_URL задан) и работает — счётчики переживают
    рестарт и работают на N инстансах backend'а. Если Redis не настроен или
    недоступен — graceful fallback на in-memory с WARNING в лог. Это позволяет
    запускать demo/dev без обязательного Redis-сервиса.
    """
    redis_url = settings.REDIS_URL
    if redis_url:
        try:
            limiter = RedisRateLimiter(
                max_calls=max_calls,
                redis_url=redis_url,
                namespace=namespace,
            )
            limiter.is_allowed("__healthcheck__")
            limiter.reset("__healthcheck__")
            logger.info("Rate limiter %s: Redis @ %s", namespace, redis_url)
            return limiter
        except Exception as exc:
            logger.warning(
                "Rate limiter: Redis @ %s недоступен (%s) — fallback на in-memory. "
                "При рестарте счётчики сбросятся.",
                redis_url,
                exc,
            )
    else:
        logger.info("Rate limiter %s: in-memory (REDIS_URL не задан)", namespace)
    return IPRateLimiter(max_calls=max_calls, window_seconds=_WINDOW_SECONDS)


def client_ip(request: Request) -> str:
    """Извлекает реальный IP с учётом доверенного reverse proxy."""
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


def principal_rate_limit_key(principal: CurrentPrincipal, request: Request) -> str:
    """Stable bucket for authenticated or guest user plus source IP."""
    ip = client_ip(request)
    if principal.role == "guest":
        owner = f"session:{principal.session_id or 'unknown'}"
    else:
        owner = f"user:{principal.user_id or 'unknown'}"
    return f"{owner}:ip:{ip}"


async def enforce_rate_limit(
    limiter: RateLimiter,
    key: str,
    *,
    detail: str,
) -> None:
    if await limiter.ais_allowed(key):
        return
    raise HTTPException(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        detail=detail,
        headers={"Retry-After": str(RETRY_AFTER_SECONDS)},
    )


async def enforce_principal_rate_limit(
    limiter: RateLimiter,
    principal: CurrentPrincipal,
    request: Request,
    *,
    detail: str,
) -> None:
    await enforce_rate_limit(
        limiter,
        principal_rate_limit_key(principal, request),
        detail=detail,
    )


guest_session_limiter: RateLimiter = _build_limiter(
    settings.GUEST_MAX_SESSIONS_PER_IP,
    namespace="auth_guest",
)
login_limiter: RateLimiter = _build_limiter(
    settings.LOGIN_MAX_ATTEMPTS_PER_IP,
    namespace="auth_login",
)
import_limiter: RateLimiter = _build_limiter(
    settings.IMPORT_MAX_REQUESTS_PER_PRINCIPAL_PER_IP,
    namespace="import",
)
report_limiter: RateLimiter = _build_limiter(
    settings.REPORT_MAX_REQUESTS_PER_PRINCIPAL_PER_IP,
    namespace="report",
)
batch_limiter: RateLimiter = _build_limiter(
    settings.BATCH_MAX_REQUESTS_PER_PRINCIPAL_PER_IP,
    namespace="batch",
)
job_enqueue_limiter: RateLimiter = _build_limiter(
    settings.JOB_ENQUEUE_MAX_REQUESTS_PER_PRINCIPAL_PER_IP,
    namespace="job_enqueue",
)
