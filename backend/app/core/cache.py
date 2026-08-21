"""Async Redis cache wrapper with in-memory fallback."""

from __future__ import annotations

import asyncio
import json
import logging
import os
import threading
from collections.abc import Callable
from functools import wraps
from typing import Any, Protocol, TypeVar

from app.core.config import settings
from app.core.redis_client import get_redis

logger = logging.getLogger("heatcalc.cache")

T = TypeVar("T")


class _CacheBackend(Protocol):
    def get(self, key: str) -> Any | None: ...
    def set(self, key: str, value: Any, ttl: int | None) -> None: ...
    def delete(self, key: str) -> None: ...
    def delete_prefix(self, prefix: str) -> None: ...
    async def aget(self, key: str) -> Any | None: ...
    async def aset(self, key: str, value: Any, ttl: int | None) -> None: ...
    async def adelete(self, key: str) -> None: ...
    async def adelete_prefix(self, prefix: str) -> None: ...


class _InMemoryBackend:
    """Simple dict cache for dev/tests. TTL is intentionally ignored."""

    def __init__(self) -> None:
        self._data: dict[str, Any] = {}
        self._lock = threading.Lock()

    def get(self, key: str) -> Any | None:
        with self._lock:
            return self._data.get(key)

    def set(self, key: str, value: Any, ttl: int | None) -> None:
        with self._lock:
            self._data[key] = value

    def delete(self, key: str) -> None:
        with self._lock:
            self._data.pop(key, None)

    def delete_prefix(self, prefix: str) -> None:
        with self._lock:
            for key in list(self._data.keys()):
                if key.startswith(prefix):
                    del self._data[key]

    async def aget(self, key: str) -> Any | None:
        return self.get(key)

    async def aset(self, key: str, value: Any, ttl: int | None) -> None:
        self.set(key, value, ttl)

    async def adelete(self, key: str) -> None:
        self.delete(key)

    async def adelete_prefix(self, prefix: str) -> None:
        self.delete_prefix(prefix)


class _RedisBackend:
    """Redis-backed cache. Values are JSON payloads."""

    def __init__(self, redis_url: str) -> None:
        # Sync Redis is kept for tests and synchronous utilities. Request paths
        # use redis.asyncio through the async methods below.
        from redis import Redis

        self._sync_client = Redis.from_url(
            redis_url,
            decode_responses=True,
            max_connections=settings.REDIS_MAX_CONNECTIONS,
            socket_keepalive=True,
            socket_connect_timeout=5,
            retry_on_timeout=True,
            health_check_interval=30,
        )

    def ping(self) -> None:
        self._sync_client.ping()

    def _key(self, key: str) -> str:
        return f"cache:{key}"

    def get(self, key: str) -> Any | None:
        raw = self._sync_client.get(self._key(key))
        if raw is None:
            return None
        return json.loads(raw)

    def set(self, key: str, value: Any, ttl: int | None) -> None:
        payload = json.dumps(value, ensure_ascii=False, default=str)
        if ttl:
            self._sync_client.setex(self._key(key), ttl, payload)
        else:
            self._sync_client.set(self._key(key), payload)

    def delete(self, key: str) -> None:
        self._sync_client.delete(self._key(key))

    def delete_prefix(self, prefix: str) -> None:
        for key in self._sync_client.scan_iter(self._key(f"{prefix}*")):
            self._sync_client.delete(key)

    async def aget(self, key: str) -> Any | None:
        raw = await get_redis().get(self._key(key))
        if raw is None:
            return None
        return json.loads(raw)

    async def aset(self, key: str, value: Any, ttl: int | None) -> None:
        payload = json.dumps(value, ensure_ascii=False, default=str)
        if ttl:
            await get_redis().setex(self._key(key), ttl, payload)
        else:
            await get_redis().set(self._key(key), payload)

    async def adelete(self, key: str) -> None:
        await get_redis().delete(self._key(key))

    async def adelete_prefix(self, prefix: str) -> None:
        async for key in get_redis().scan_iter(self._key(f"{prefix}*")):
            await get_redis().delete(key)


def _build_backend() -> _CacheBackend:
    redis_url = os.getenv("REDIS_URL")
    if redis_url:
        try:
            backend = _RedisBackend(redis_url)
            backend.ping()
            logger.info("Cache: Redis async backend")
            return backend
        except Exception as exc:
            logger.warning(
                "Cache: Redis @ %s недоступен (%s) — fallback на in-memory.",
                redis_url,
                exc,
            )
    else:
        logger.info("Cache: in-memory (REDIS_URL не задан)")
    return _InMemoryBackend()


class _Cache:
    """Public-facing cache API.

    Use async methods from async request/task paths. Sync methods are kept for
    tests and synchronous utilities.
    """

    def __init__(self) -> None:
        self._backend = _build_backend()

    def get(self, key: str) -> Any | None:
        return self._backend.get(key)

    async def aget(self, key: str) -> Any | None:
        return await self._backend.aget(key)

    def set(self, key: str, value: Any, ttl: int | None = None) -> None:
        self._backend.set(key, value, ttl)

    async def aset(self, key: str, value: Any, ttl: int | None = None) -> None:
        await self._backend.aset(key, value, ttl)

    def invalidate(self, key: str) -> None:
        self._backend.delete(key)

    async def ainvalidate(self, key: str) -> None:
        await self._backend.adelete(key)

    def invalidate_prefix(self, prefix: str) -> None:
        self._backend.delete_prefix(prefix)

    async def ainvalidate_prefix(self, prefix: str) -> None:
        await self._backend.adelete_prefix(prefix)

    def cached(
        self, key: str, ttl: int | None = None
    ) -> Callable[[Callable[..., T]], Callable[..., T]]:
        """Static-key cache decorator for sync and async callables."""

        def decorator(fn: Callable[..., T]) -> Callable[..., T]:
            if asyncio.iscoroutinefunction(fn):

                @wraps(fn)
                async def async_wrapper(*args: Any, **kwargs: Any) -> T:
                    hit = await self.aget(key)
                    if hit is not None:
                        return hit  # type: ignore[no-any-return]
                    result = await fn(*args, **kwargs)
                    await self.aset(key, result, ttl)
                    return result

                return async_wrapper  # type: ignore[return-value]

            @wraps(fn)
            def sync_wrapper(*args: Any, **kwargs: Any) -> T:
                hit = self.get(key)
                if hit is not None:
                    return hit  # type: ignore[no-any-return]
                result = fn(*args, **kwargs)
                self.set(key, result, ttl)
                return result

            return sync_wrapper

        return decorator


cache = _Cache()
