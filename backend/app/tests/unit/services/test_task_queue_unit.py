"""Unit tests for Redis Stream task queue wrapper."""

from uuid import uuid4

import pytest
from redis.exceptions import ResponseError

from app.services.task_queue import TaskQueue, TaskQueueError


class FakeRedis:
    def __init__(self, *, busy_group: bool = False, fail_group: bool = False):
        self.busy_group = busy_group
        self.fail_group = fail_group
        self.closed = False
        self.calls: list[tuple[str, object]] = []

    async def xgroup_create(self, stream, group, id="0", mkstream=True):
        self.calls.append(("xgroup_create", (stream, group, id, mkstream)))
        if self.busy_group:
            raise ResponseError("BUSYGROUP Consumer Group name already exists")
        if self.fail_group:
            raise ResponseError("NOAUTH Authentication required")

    async def xadd(self, stream, fields, maxlen=None, approximate=True):
        self.calls.append(("xadd", (stream, fields, maxlen, approximate)))
        return "1-0"

    async def xreadgroup(self, group, consumer, *, streams, count, block):
        self.calls.append(("xreadgroup", (group, consumer, streams, count, block)))
        return [("stream", [("1-0", {"task_id": str(uuid4())})])]

    async def xack(self, stream, group, stream_id):
        self.calls.append(("xack", (stream, group, stream_id)))

    async def aclose(self):
        self.closed = True


class FakeRedisFactory:
    def __init__(self, redis: FakeRedis):
        self.redis = redis

    def __call__(self, *args, **kwargs):
        return self.redis


async def test_task_queue_requires_redis_url(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr("app.services.task_queue.settings.REDIS_URL", None)
    with pytest.raises(TaskQueueError):
        TaskQueue()


async def test_task_queue_enqueue_read_ack_and_close(monkeypatch: pytest.MonkeyPatch):
    fake = FakeRedis()
    monkeypatch.setattr("app.services.task_queue.Redis.from_url", FakeRedisFactory(fake))
    queue = TaskQueue("redis://test")

    stream_id = await queue.enqueue(uuid4(), "electrical_batch")
    messages = await queue.read(consumer="worker-a", count=2, block_ms=10)
    await queue.ack(stream_id)
    await queue.close()

    assert stream_id == "1-0"
    assert messages
    assert fake.closed is True
    assert [call[0] for call in fake.calls] == [
        "xgroup_create",
        "xadd",
        "xgroup_create",
        "xreadgroup",
        "xack",
    ]
    assert fake.calls[1][1][2:] == (10_000, True)


async def test_task_queue_ignores_existing_consumer_group(monkeypatch: pytest.MonkeyPatch):
    fake = FakeRedis(busy_group=True)
    monkeypatch.setattr("app.services.task_queue.Redis.from_url", FakeRedisFactory(fake))
    queue = TaskQueue("redis://test")

    await queue.ensure_group()

    assert fake.calls[0][0] == "xgroup_create"


async def test_task_queue_reraises_unexpected_group_error(monkeypatch: pytest.MonkeyPatch):
    fake = FakeRedis(fail_group=True)
    monkeypatch.setattr("app.services.task_queue.Redis.from_url", FakeRedisFactory(fake))
    queue = TaskQueue("redis://test")

    with pytest.raises(ResponseError, match="NOAUTH"):
        await queue.ensure_group()
