"""Worker readiness heartbeat shared by workers, health checks, and the API."""

from __future__ import annotations

import logging
import os
import socket
import threading
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from time import monotonic
from typing import Any, cast

from redis import Redis as SyncRedis
from redis.asyncio import Redis

from app.core.config import settings

logger = logging.getLogger("heatcalc.worker_readiness")


def worker_consumer_name() -> str:
    return f"{settings.WORKER_QUEUE_CONSUMER}-{socket.gethostname()}"


def worker_readiness_key(consumer: str) -> str:
    return f"{settings.WORKER_READINESS_KEY_PREFIX}:{consumer}"


def _heartbeat_value() -> str:
    return datetime.now(UTC).isoformat()


@dataclass(frozen=True)
class WorkerReadinessSnapshot:
    active_consumers: int
    last_heartbeat_at: str | None

    @property
    def ready(self) -> bool:
        return self.active_consumers > 0


async def mark_worker_ready(redis: Redis, consumer: str) -> None:
    await redis.set(
        worker_readiness_key(consumer),
        _heartbeat_value(),
        ex=settings.WORKER_HEARTBEAT_TTL_SECONDS,
    )


async def clear_worker_ready(redis: Redis, consumer: str) -> None:
    await redis.delete(worker_readiness_key(consumer))


async def worker_is_ready(redis: Redis, consumer: str) -> bool:
    return bool(await redis.exists(worker_readiness_key(consumer)))


async def readiness_snapshot(redis: Redis) -> WorkerReadinessSnapshot:
    keys = [
        key
        async for key in redis.scan_iter(
            match=f"{settings.WORKER_READINESS_KEY_PREFIX}:*",
            count=100,
        )
    ]
    if not keys:
        return WorkerReadinessSnapshot(active_consumers=0, last_heartbeat_at=None)
    values = await redis.mget(keys)
    heartbeats = sorted(str(value) for value in values if value)
    return WorkerReadinessSnapshot(
        active_consumers=len(heartbeats),
        last_heartbeat_at=heartbeats[-1] if heartbeats else None,
    )


class WorkerHeartbeat:
    """Refresh readiness from a separate thread, independent of the event loop.

    Calculation code must not make a healthy worker disappear merely because a
    CPU-heavy section temporarily monopolizes the asyncio loop. Process death,
    however, stops this thread and lets the Redis TTL expire.
    """

    def __init__(
        self,
        redis_url: str,
        consumer: str,
        *,
        fatal_exit: Callable[[int], None] = os._exit,
    ) -> None:
        self.redis_url = redis_url
        self.consumer = consumer
        self._stop = threading.Event()
        self._paused = threading.Event()
        self._wake = threading.Event()
        self._last_event_loop_tick = monotonic()
        self._fatal_exit = fatal_exit
        self._thread = threading.Thread(
            target=self._run,
            name=f"worker-heartbeat-{consumer}",
            daemon=True,
        )

    def start(self) -> None:
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        self._wake.set()
        self._thread.join(timeout=max(1, settings.WORKER_HEARTBEAT_INTERVAL_SECONDS + 1))

    def tick(self) -> None:
        self._last_event_loop_tick = monotonic()

    def pause(self) -> None:
        self._paused.set()
        self._wake.set()

    def resume(self) -> None:
        self.tick()
        self._paused.clear()
        self._wake.set()

    @property
    def is_paused(self) -> bool:
        return self._paused.is_set()

    def _publish_once(self, redis: SyncRedis) -> bool:
        if self._paused.is_set():
            return False
        key = worker_readiness_key(self.consumer)
        try:
            redis.set(
                key,
                _heartbeat_value(),
                ex=settings.WORKER_HEARTBEAT_TTL_SECONDS,
            )
        except Exception:
            # Do not let this independent connection restore readiness by
            # itself. The consumer loop must successfully reprobe Redis and
            # PostgreSQL, then call resume().
            self._paused.set()
            self._wake.set()
            raise
        if self._paused.is_set():
            # Close the set-vs-pause race: a publish already in flight when
            # runtime readiness is withdrawn must not resurrect the key.
            redis.delete(key)
            return False
        return True

    def _run(self) -> None:
        redis = SyncRedis.from_url(
            self.redis_url,
            decode_responses=True,
            socket_connect_timeout=3,
            socket_timeout=3,
        )
        try:
            readiness_published = False
            while not self._stop.is_set():
                if self._paused.is_set():
                    if readiness_published:
                        try:
                            redis.delete(worker_readiness_key(self.consumer))
                        except Exception as exc:
                            logger.warning("Failed to withdraw worker readiness: %s", exc)
                        readiness_published = False
                    self._wake.wait(settings.WORKER_HEARTBEAT_INTERVAL_SECONDS)
                    self._wake.clear()
                    continue
                loop_stale_seconds = monotonic() - self._last_event_loop_tick
                if loop_stale_seconds > settings.WORKER_EVENT_LOOP_STALE_SECONDS:
                    logger.critical(
                        "Worker event loop is unresponsive for %.1f seconds; exiting",
                        loop_stale_seconds,
                    )
                    self._fatal_exit(70)
                    return
                try:
                    readiness_published = self._publish_once(redis)
                except Exception as exc:
                    logger.warning("Worker readiness heartbeat failed: %s", exc)
                self._wake.wait(settings.WORKER_HEARTBEAT_INTERVAL_SECONDS)
                self._wake.clear()
        finally:
            try:
                redis.delete(worker_readiness_key(self.consumer))
            except Exception as exc:
                logger.warning("Failed to clear worker readiness heartbeat: %s", exc)
            cast(Any, redis).close()


def worker_is_ready_sync(redis_url: str, consumer: str) -> bool:
    redis = SyncRedis.from_url(
        redis_url,
        decode_responses=True,
        socket_connect_timeout=3,
        socket_timeout=3,
    )
    try:
        return bool(redis.exists(worker_readiness_key(consumer)))
    finally:
        cast(Any, redis).close()
