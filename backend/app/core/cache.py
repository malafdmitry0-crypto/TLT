"""Простой Redis-cache wrapper с in-memory fallback.

Использование:
    from app.core.cache import cache

    @cache.cached("references:climate", ttl=3600)
    async def list_climate_cities() -> list[dict]:
        ...

    cache.invalidate("coefficients")
    cache.invalidate_prefix("references:")

Семантика fallback'а — как у rate_limit:
- Если REDIS_URL задан → Redis обязателен (RuntimeError при недоступности).
- Если REDIS_URL пуст → in-memory dict (для dev/тестов).
"""

from __future__ import annotations

import json
import logging
import os
import threading
from collections.abc import Callable
from functools import wraps
from typing import Any, Protocol, TypeVar

logger = logging.getLogger("heatcalc.cache")

T = TypeVar("T")


class _CacheBackend(Protocol):
    def get(self, key: str) -> Any | None: ...
    def set(self, key: str, value: Any, ttl: int | None) -> None: ...
    def delete(self, key: str) -> None: ...
    def delete_prefix(self, prefix: str) -> None: ...


class _InMemoryBackend:
    """Простой dict-кэш без TTL-эвикции (TTL игнорируется — для dev/тестов)."""

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
            for k in list(self._data.keys()):
                if k.startswith(prefix):
                    del self._data[k]


class _RedisBackend:
    """Redis-backed cache. JSON-serialization в payload."""

    def __init__(self, redis_url: str) -> None:
        from redis import Redis  # type: ignore[import-not-found]

        self._client = Redis.from_url(redis_url, decode_responses=True)
        # healthcheck — упадёт громко если Redis недоступен
        self._client.ping()

    def get(self, key: str) -> Any | None:
        raw = self._client.get(f"cache:{key}")
        if raw is None:
            return None
        return json.loads(raw)

    def set(self, key: str, value: Any, ttl: int | None) -> None:
        payload = json.dumps(value, ensure_ascii=False, default=str)
        if ttl:
            self._client.setex(f"cache:{key}", ttl, payload)
        else:
            self._client.set(f"cache:{key}", payload)

    def delete(self, key: str) -> None:
        self._client.delete(f"cache:{key}")

    def delete_prefix(self, prefix: str) -> None:
        for k in self._client.scan_iter(f"cache:{prefix}*"):
            self._client.delete(k)


def _build_backend() -> _CacheBackend:
    """Redis если REDIS_URL задан и доступен, иначе in-memory.

    Graceful fallback — позволяет запускать demo/dev без обязательного
    Redis-сервиса. При недоступности залогируем WARNING.
    """
    redis_url = os.environ.get("REDIS_URL")
    if redis_url:
        try:
            backend = _RedisBackend(redis_url)
            logger.info("Cache: Redis @ %s", redis_url)
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
    """Public-facing API. Singleton."""

    def __init__(self) -> None:
        self._backend = _build_backend()

    def get(self, key: str) -> Any | None:
        return self._backend.get(key)

    def set(self, key: str, value: Any, ttl: int | None = None) -> None:
        self._backend.set(key, value, ttl)

    def invalidate(self, key: str) -> None:
        self._backend.delete(key)

    def invalidate_prefix(self, prefix: str) -> None:
        self._backend.delete_prefix(prefix)

    def cached(
        self, key: str, ttl: int | None = None
    ) -> Callable[[Callable[..., T]], Callable[..., T]]:
        """Декоратор для функций (sync/async). Ключ статический — не зависит от args.

        Пригодно для «глобальных» кэшей вида справочников. Для key-by-args
        используйте `cache.get/set` явно.
        """

        def decorator(fn: Callable[..., T]) -> Callable[..., T]:
            import asyncio

            if asyncio.iscoroutinefunction(fn):

                @wraps(fn)
                async def async_wrapper(*args: Any, **kwargs: Any) -> T:
                    hit = self._backend.get(key)
                    if hit is not None:
                        return hit  # type: ignore[no-any-return]
                    result = await fn(*args, **kwargs)
                    self._backend.set(key, result, ttl)
                    return result

                return async_wrapper  # type: ignore[return-value]

            @wraps(fn)
            def sync_wrapper(*args: Any, **kwargs: Any) -> T:
                hit = self._backend.get(key)
                if hit is not None:
                    return hit  # type: ignore[no-any-return]
                result = fn(*args, **kwargs)
                self._backend.set(key, result, ttl)
                return result

            return sync_wrapper

        return decorator


cache = _Cache()
