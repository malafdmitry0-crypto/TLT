"""Live Redis contracts for worker recovery and readiness.

These tests run only when WORKER_LIVE_REDIS_URL is configured. They belong to
the explicit chaos gate, not to the dependency-free default backend suite.
"""

import asyncio
import uuid

import pytest

from app.core.config import settings
from app.services.task_queue import TaskQueue
from app.services.worker_readiness import (
    clear_worker_ready,
    mark_worker_ready,
    readiness_snapshot,
)

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def test_real_xautoclaim_moves_pending_entry_to_second_worker(live_queue: TaskQueue):
    task_id = uuid.uuid4()
    await live_queue.enqueue(task_id, "heat_loss_batch")

    messages = await live_queue.read(consumer="worker-a", count=1, block_ms=50)
    assert messages and messages[0][1]
    stream_id, fields = messages[0][1][0]
    assert fields["task_id"] == str(task_id)

    _next_id, claimed = await live_queue.reclaim_pending(
        consumer="worker-b",
        min_idle_ms=0,
        count=10,
    )
    assert claimed == [(stream_id, fields)]

    await live_queue.ack(stream_id)
    pending = await live_queue.redis.xpending(live_queue.stream, live_queue.group)
    assert pending["pending"] == 0


async def test_real_dlq_write_is_idempotent_after_finalize_crash(live_queue: TaskQueue):
    fields = {"task_id": str(uuid.uuid4()), "type": "heat_loss_batch"}

    first = await live_queue.dead_letter(
        "42-0",
        fields,
        reason="worker_attempts_exhausted",
    )
    second = await live_queue.dead_letter(
        "42-0",
        fields,
        reason="worker_attempts_exhausted",
    )

    assert second == first
    assert await live_queue.redis.xlen(settings.WORKER_DEAD_LETTER_STREAM) == 1


async def test_real_readiness_tracks_late_and_multiple_workers(live_queue: TaskQueue):
    assert (await readiness_snapshot(live_queue.redis)).active_consumers == 0

    await mark_worker_ready(live_queue.redis, "worker-late")
    assert (await readiness_snapshot(live_queue.redis)).active_consumers == 1

    await mark_worker_ready(live_queue.redis, "worker-second")
    snapshot = await readiness_snapshot(live_queue.redis)
    assert snapshot.ready is True
    assert snapshot.active_consumers == 2

    await clear_worker_ready(live_queue.redis, "worker-late")
    await clear_worker_ready(live_queue.redis, "worker-second")
    assert (await readiness_snapshot(live_queue.redis)).active_consumers == 0


async def test_real_readiness_expires_after_worker_disappears(
    live_queue: TaskQueue,
    monkeypatch: pytest.MonkeyPatch,
):
    monkeypatch.setattr(settings, "WORKER_HEARTBEAT_TTL_SECONDS", 1)
    await mark_worker_ready(live_queue.redis, "worker-killed")
    assert (await readiness_snapshot(live_queue.redis)).ready is True

    async with asyncio.timeout(3):
        while (await readiness_snapshot(live_queue.redis)).ready:
            await asyncio.sleep(0.05)

    assert (await readiness_snapshot(live_queue.redis)).ready is False
