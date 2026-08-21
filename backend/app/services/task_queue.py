"""Redis Stream transport for durable background tasks."""

import logging
from collections.abc import Awaitable, Sequence
from typing import Any, cast
from uuid import UUID

from redis.asyncio import Redis
from redis.exceptions import ResponseError

from app.core.config import settings
from app.services.worker_readiness import worker_is_ready

logger = logging.getLogger("heatcalc.task_queue")

_DEAD_LETTER_LUA = """
local existing = redis.call('GET', KEYS[2])
if existing then
  return existing
end
local id = redis.call('XADD', KEYS[1], 'MAXLEN', '~', ARGV[1], '*', unpack(ARGV, 3))
redis.call('SET', KEYS[2], id, 'EX', ARGV[2])
return id
"""


class TaskQueueError(RuntimeError):
    pass


class TaskQueue:
    """Small Redis Streams wrapper.

    Postgres is the source of truth for task state and recovery. Redis only
    carries task IDs to worker processes, so losing a stream message does not
    lose the task itself.
    """

    def __init__(self, redis_url: str | None = None) -> None:
        self.redis_url = redis_url or settings.REDIS_URL
        if not self.redis_url:
            raise TaskQueueError("REDIS_URL is required for background task queue")
        self.stream = settings.WORKER_QUEUE_STREAM
        self.group = settings.WORKER_QUEUE_GROUP
        self._redis: Redis | None = None

    @property
    def redis(self) -> Redis:
        if self._redis is None:
            # XREADGROUP is intentionally blocking, but its socket must not
            # remain wedged forever after a Docker/network partition. Keep the
            # transport timeout above the normal block window so the worker
            # can withdraw readiness, reconnect, and resume consumption.
            socket_timeout = max(
                3.0,
                (settings.WORKER_POLL_TIMEOUT_MS / 1000) + 2.0,
            )
            redis_url = cast(str, self.redis_url)
            self._redis = Redis.from_url(
                redis_url,
                decode_responses=True,
                socket_connect_timeout=3,
                socket_timeout=socket_timeout,
            )
        return self._redis

    async def close(self) -> None:
        redis, self._redis = self._redis, None
        if redis is not None:
            await redis.aclose()

    async def ensure_group(self) -> None:
        try:
            await self.redis.xgroup_create(self.stream, self.group, id="0", mkstream=True)
        except ResponseError as exc:
            if "BUSYGROUP" not in str(exc):
                raise

    async def enqueue(self, task_id: UUID, task_type: str) -> str:
        await self.ensure_group()
        stream_id = await self.redis.xadd(
            self.stream,
            {"task_id": str(task_id), "type": task_type},
            maxlen=settings.WORKER_QUEUE_MAXLEN,
            approximate=True,
        )
        return str(stream_id)

    async def read(
        self,
        *,
        consumer: str,
        count: int = 1,
        block_ms: int | None = None,
    ) -> Sequence[tuple[str, list[tuple[str, dict[str, str]]]]]:
        await self.ensure_group()
        return cast(
            Sequence[tuple[str, list[tuple[str, dict[str, str]]]]],
            await self.redis.xreadgroup(
                self.group,
                consumer,
                streams={self.stream: ">"},
                count=count,
                block=block_ms or settings.WORKER_POLL_TIMEOUT_MS,
            ),
        )

    async def ack(self, stream_id: str) -> None:
        await self.redis.xack(self.stream, self.group, stream_id)

    async def is_worker_ready(self, consumer: str) -> bool:
        return await worker_is_ready(self.redis, consumer)

    async def reclaim_pending(
        self,
        *,
        consumer: str,
        min_idle_ms: int,
        start_id: str = "0-0",
        count: int = 10,
    ) -> tuple[str, list[tuple[str, dict[str, str]]]]:
        """Claim stale pending entries from dead or crashed consumers."""
        await self.ensure_group()
        response = await self.redis.xautoclaim(
            self.stream,
            self.group,
            consumer,
            min_idle_ms,
            start_id=start_id,
            count=count,
        )
        next_start_id = str(response[0])
        entries = list(response[1] or [])
        return next_start_id, entries

    async def dead_letter(
        self,
        stream_id: str,
        fields: dict[str, str],
        *,
        reason: str,
    ) -> str:
        payload = dict(fields)
        payload["original_stream_id"] = stream_id
        payload["dead_letter_reason"] = reason
        field_args = [item for pair in payload.items() for item in pair]
        dedupe_key = f"{settings.WORKER_DEAD_LETTER_STREAM}:dedupe:{stream_id}"
        dead_id = await cast(
            Awaitable[Any],
            self.redis.eval(
                _DEAD_LETTER_LUA,
                2,
                settings.WORKER_DEAD_LETTER_STREAM,
                dedupe_key,
                str(settings.WORKER_DEAD_LETTER_MAXLEN),
                str(settings.WORKER_DEAD_LETTER_DEDUPE_TTL_SECONDS),
                *field_args,
            ),
        )
        logger.warning(
            "Task moved to dead-letter stream",
            extra={
                "task_id": payload.get("task_id"),
                "task_type": payload.get("type"),
                "original_stream_id": stream_id,
                "dead_letter_stream_id": str(dead_id),
                "dead_letter_stream": settings.WORKER_DEAD_LETTER_STREAM,
                "reason": reason,
            },
        )
        return str(dead_id)

    async def dead_letter_count(self) -> int:
        return int(await self.redis.xlen(settings.WORKER_DEAD_LETTER_STREAM))

    async def list_dead_letters(
        self,
        *,
        count: int = 100,
        start: str = "+",
        end: str = "-",
    ) -> Sequence[tuple[str, dict[str, str]]]:
        return cast(
            Sequence[tuple[str, dict[str, str]]],
            await self.redis.xrevrange(
                settings.WORKER_DEAD_LETTER_STREAM,
                max=start,
                min=end,
                count=count,
            ),
        )

    async def get_dead_letter(self, stream_id: str) -> tuple[str, dict[str, str]] | None:
        entries = await self.redis.xrange(
            settings.WORKER_DEAD_LETTER_STREAM,
            min=stream_id,
            max=stream_id,
            count=1,
        )
        return entries[0] if entries else None

    async def delete_dead_letter(self, stream_id: str) -> int:
        return int(await self.redis.xdel(settings.WORKER_DEAD_LETTER_STREAM, stream_id))
