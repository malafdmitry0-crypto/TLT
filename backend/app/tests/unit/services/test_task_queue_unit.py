"""Unit tests for Redis Stream task queue wrapper."""

from unittest.mock import MagicMock
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
        self.eval_indexes: dict[str, str] = {}

    async def xgroup_create(self, stream, group, id="0", mkstream=True):
        self.calls.append(("xgroup_create", (stream, group, id, mkstream)))
        if self.busy_group:
            raise ResponseError("BUSYGROUP Consumer Group name already exists")
        if self.fail_group:
            raise ResponseError("NOAUTH Authentication required")

    async def xadd(self, stream, fields, maxlen=None, approximate=True):
        self.calls.append(("xadd", (stream, fields, maxlen, approximate)))
        return "1-0"

    async def eval(self, script, numkeys, stream, dedupe_key, maxlen, ttl, *field_args):
        del script, numkeys, ttl
        if dedupe_key in self.eval_indexes:
            return self.eval_indexes[dedupe_key]
        fields = dict(zip(field_args[::2], field_args[1::2], strict=True))
        stream_id = await self.xadd(
            stream,
            fields,
            maxlen=int(maxlen),
            approximate=True,
        )
        self.eval_indexes[dedupe_key] = stream_id
        return stream_id

    async def xreadgroup(self, group, consumer, *, streams, count, block):
        self.calls.append(("xreadgroup", (group, consumer, streams, count, block)))
        return [("stream", [("1-0", {"task_id": str(uuid4())})])]

    async def xack(self, stream, group, stream_id):
        self.calls.append(("xack", (stream, group, stream_id)))

    async def xautoclaim(self, stream, group, consumer, min_idle_ms, start_id, count):
        self.calls.append(("xautoclaim", (stream, group, consumer, min_idle_ms, start_id, count)))
        return ["0-0", [("1-0", {"task_id": str(uuid4())})]]

    async def xlen(self, stream):
        self.calls.append(("xlen", stream))
        return 1

    async def xrevrange(self, stream, *, max="+", min="-", count=None):
        self.calls.append(("xrevrange", (stream, max, min, count)))
        return [("2-0", {"task_id": str(uuid4()), "type": "electrical_batch"})]

    async def xrange(self, stream, *, min="-", max="+", count=None):
        self.calls.append(("xrange", (stream, min, max, count)))
        return [("2-0", {"task_id": str(uuid4()), "type": "electrical_batch"})]

    async def xdel(self, stream, *stream_ids):
        self.calls.append(("xdel", (stream, stream_ids)))
        return len(stream_ids)

    async def aclose(self):
        self.closed = True


class FakeRedisFactory:
    def __init__(self, redis: FakeRedis):
        self.redis = redis

    def __call__(self, *args, **kwargs):
        return self.redis


def test_task_queue_uses_bounded_socket_timeout(monkeypatch: pytest.MonkeyPatch):
    fake = FakeRedis()
    captured: dict[str, object] = {}

    def factory(*args, **kwargs):
        captured.update(kwargs)
        return fake

    monkeypatch.setattr("app.services.task_queue.Redis.from_url", factory)
    monkeypatch.setattr("app.services.task_queue.settings.WORKER_POLL_TIMEOUT_MS", 5_000)
    queue = TaskQueue("redis://test")

    assert queue.redis is fake
    assert captured["socket_connect_timeout"] == 3
    assert captured["socket_timeout"] == 7.0


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


async def test_task_queue_reclaims_pending_entries(monkeypatch: pytest.MonkeyPatch):
    fake = FakeRedis()
    monkeypatch.setattr("app.services.task_queue.Redis.from_url", FakeRedisFactory(fake))
    queue = TaskQueue("redis://test")

    next_start_id, entries = await queue.reclaim_pending(
        consumer="worker-a",
        min_idle_ms=120_000,
        start_id="0-0",
        count=5,
    )

    assert next_start_id == "0-0"
    assert entries
    assert [call[0] for call in fake.calls] == ["xgroup_create", "xautoclaim"]
    assert fake.calls[1][1][2:] == ("worker-a", 120_000, "0-0", 5)


async def test_task_queue_dead_letters_original_payload(
    monkeypatch: pytest.MonkeyPatch,
):
    fake = FakeRedis()
    warning = MagicMock()
    monkeypatch.setattr("app.services.task_queue.Redis.from_url", FakeRedisFactory(fake))
    monkeypatch.setattr("app.services.task_queue.logger.warning", warning)
    monkeypatch.setattr(
        "app.services.task_queue.settings.WORKER_DEAD_LETTER_STREAM",
        "tasks:dead",
    )
    monkeypatch.setattr("app.services.task_queue.settings.WORKER_DEAD_LETTER_MAXLEN", 1_000)
    queue = TaskQueue("redis://test")

    dead_id = await queue.dead_letter(
        "1-0",
        {"task_id": "task-1", "type": "electrical_batch"},
        reason="worker_attempts_exhausted",
    )

    assert dead_id == "1-0"
    assert fake.calls == [
        (
            "xadd",
            (
                "tasks:dead",
                {
                    "task_id": "task-1",
                    "type": "electrical_batch",
                    "original_stream_id": "1-0",
                    "dead_letter_reason": "worker_attempts_exhausted",
                },
                1_000,
                True,
            ),
        )
    ]
    warning.assert_called_once()
    assert warning.call_args.args[0] == "Task moved to dead-letter stream"


async def test_task_queue_dead_letter_is_idempotent_by_original_stream_id(
    monkeypatch: pytest.MonkeyPatch,
):
    fake = FakeRedis()
    monkeypatch.setattr("app.services.task_queue.Redis.from_url", FakeRedisFactory(fake))
    queue = TaskQueue("redis://test")
    fields = {"task_id": "task-1", "type": "electrical_batch"}

    first = await queue.dead_letter("1-0", fields, reason="worker_attempts_exhausted")
    second = await queue.dead_letter("1-0", fields, reason="worker_attempts_exhausted")

    assert first == second
    assert [call[0] for call in fake.calls].count("xadd") == 1


async def test_task_queue_reads_and_deletes_dead_letter_entries(
    monkeypatch: pytest.MonkeyPatch,
):
    fake = FakeRedis()
    monkeypatch.setattr("app.services.task_queue.Redis.from_url", FakeRedisFactory(fake))
    monkeypatch.setattr(
        "app.services.task_queue.settings.WORKER_DEAD_LETTER_STREAM",
        "tasks:dead",
    )
    queue = TaskQueue("redis://test")

    count = await queue.dead_letter_count()
    entries = await queue.list_dead_letters(count=10)
    entry = await queue.get_dead_letter("2-0")
    deleted = await queue.delete_dead_letter("2-0")

    assert count == 1
    assert entries
    assert entry is not None
    assert deleted == 1
    assert [call[0] for call in fake.calls] == ["xlen", "xrevrange", "xrange", "xdel"]
    assert fake.calls[1][1] == ("tasks:dead", "+", "-", 10)
    assert fake.calls[3][1] == ("tasks:dead", ("2-0",))


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
