"""Rate limiter с двумя backend'ами: in-memory (default) и Redis (для HA).

Используется для защиты `/auth/guest` от ботов. Sliding window реализован
через `collections.deque` (in-memory) или sorted-set ZADD/ZREMRANGEBYSCORE
(Redis — переживает рестарт и работает на N инстансах).

Выбор backend'а — через `settings.REDIS_URL`. Без него подставляется
in-memory вариант.
"""

from __future__ import annotations

import logging
import os
import time
from collections import defaultdict, deque
from threading import Lock
from typing import Protocol

logger = logging.getLogger("heatcalc.rate_limit")

_WINDOW_SECONDS = 3600  # 1 час


class RateLimiter(Protocol):
    def is_allowed(self, ip: str) -> bool: ...
    def remaining(self, ip: str) -> int: ...
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

    def remaining(self, ip: str) -> int:
        now = time.monotonic()
        cutoff = now - self._window
        with self._lock:
            q = self._data[ip]
            while q and q[0] < cutoff:
                q.popleft()
            return max(0, self._max - len(q))

    def reset(self, ip: str | None = None) -> None:
        with self._lock:
            if ip is None:
                self._data.clear()
            else:
                self._data.pop(ip, None)


class RedisRateLimiter:
    """Sliding window через Redis sorted-set. Переживает рестарт и работает
    на нескольких инстансах backend'а.

    Ключ: `ratelimit:<ip>`. Member: уникальный ts (микросекунды). Score: ts.
    На каждый запрос:
      - ZREMRANGEBYSCORE убирает устаревшие записи
      - ZCARD считает текущее окно
      - если < max — ZADD добавляет, EXPIRE на window
    """

    def __init__(
        self, max_calls: int, redis_url: str, window_seconds: int = _WINDOW_SECONDS
    ) -> None:
        # Импорт лениво, чтобы in-memory режим не требовал redis-pip
        from redis import Redis  # type: ignore[import-not-found]

        self._max = max_calls
        self._window = window_seconds
        self._client = Redis.from_url(redis_url, decode_responses=True)

    def _key(self, ip: str) -> str:
        return f"ratelimit:{ip}"

    def is_allowed(self, ip: str) -> bool:
        now_us = int(time.time() * 1_000_000)
        cutoff = now_us - self._window * 1_000_000
        key = self._key(ip)
        pipe = self._client.pipeline()
        pipe.zremrangebyscore(key, 0, cutoff)
        pipe.zcard(key)
        _, count = pipe.execute()
        if count >= self._max:
            return False
        pipe = self._client.pipeline()
        pipe.zadd(key, {str(now_us): now_us})
        pipe.expire(key, self._window)
        pipe.execute()
        return True

    def remaining(self, ip: str) -> int:
        now_us = int(time.time() * 1_000_000)
        cutoff = now_us - self._window * 1_000_000
        key = self._key(ip)
        pipe = self._client.pipeline()
        pipe.zremrangebyscore(key, 0, cutoff)
        pipe.zcard(key)
        _, count = pipe.execute()
        return max(0, self._max - int(count))

    def reset(self, ip: str | None = None) -> None:
        if ip is None:
            for k in self._client.scan_iter("ratelimit:*"):
                self._client.delete(k)
        else:
            self._client.delete(self._key(ip))


def _build_limiter(max_calls: int) -> RateLimiter:
    """Factory: Redis если REDIS_URL задан и доступен, иначе in-memory.

    Если Redis настроен (REDIS_URL задан) и работает — счётчики переживают
    рестарт и работают на N инстансах backend'а. Если Redis не настроен или
    недоступен — graceful fallback на in-memory с WARNING в лог. Это позволяет
    запускать demo/dev без обязательного Redis-сервиса.
    """
    redis_url = os.environ.get("REDIS_URL")
    if redis_url:
        try:
            limiter = RedisRateLimiter(max_calls=max_calls, redis_url=redis_url)
            limiter.is_allowed("__healthcheck__")
            limiter.reset("__healthcheck__")
            logger.info("Rate limiter: Redis @ %s", redis_url)
            return limiter
        except Exception as exc:
            logger.warning(
                "Rate limiter: Redis @ %s недоступен (%s) — fallback на in-memory. "
                "При рестарте счётчики сбросятся.",
                redis_url,
                exc,
            )
    else:
        logger.info("Rate limiter: in-memory (REDIS_URL не задан)")
    return IPRateLimiter(max_calls=max_calls, window_seconds=_WINDOW_SECONDS)


# В dev/test окружении (E2E) поднимаем лимит, иначе 10 сессий/час режет батч-прогон Playwright.
_GUEST_LIMIT = int(os.environ.get("GUEST_SESSION_HOURLY_LIMIT", "10"))

guest_session_limiter: RateLimiter = _build_limiter(_GUEST_LIMIT)
