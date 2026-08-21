"""Shared async Redis client helpers."""

from __future__ import annotations

import asyncio
from asyncio import AbstractEventLoop
from typing import cast

from redis.asyncio import Redis

from app.core.config import settings

_redis: Redis | None = None
_redis_loop: AbstractEventLoop | None = None


def redis_enabled() -> bool:
    return bool(settings.REDIS_URL)


def get_redis() -> Redis:
    """Return a process-local async Redis client.

    The client is created lazily after uvicorn/worker process start, so it is
    safe with multiple worker processes.
    """
    global _redis, _redis_loop
    if not settings.REDIS_URL:
        raise RuntimeError("REDIS_URL is not configured")
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None
    if _redis is None or (loop is not None and _redis_loop is not loop):
        client = cast(
            Redis,
            Redis.from_url(
                settings.REDIS_URL,
                decode_responses=True,
                max_connections=settings.REDIS_MAX_CONNECTIONS,
                socket_keepalive=True,
                socket_connect_timeout=5,
                socket_timeout=5,
                retry_on_timeout=True,
                health_check_interval=30,
            ),
        )
        _redis = client
        _redis_loop = loop
        return client
    return _redis


async def close_redis() -> None:
    global _redis, _redis_loop
    redis, _redis = _redis, None
    _redis_loop = None
    if redis is not None:
        await redis.aclose()
