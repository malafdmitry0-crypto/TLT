"""Redis Stream transport for durable background tasks."""

from collections.abc import Sequence
from uuid import UUID

from redis.asyncio import Redis
from redis.exceptions import ResponseError

from app.core.config import settings


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
            self._redis = Redis.from_url(self.redis_url, decode_responses=True)
        return self._redis

    async def close(self) -> None:
        if self._redis is not None:
            await self._redis.aclose()
            self._redis = None

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
        return await self.redis.xreadgroup(
            self.group,
            consumer,
            streams={self.stream: ">"},
            count=count,
            block=block_ms or settings.WORKER_POLL_TIMEOUT_MS,
        )

    async def ack(self, stream_id: str) -> None:
        await self.redis.xack(self.stream, self.group, stream_id)
