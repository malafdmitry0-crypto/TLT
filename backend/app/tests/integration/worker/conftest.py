"""Isolated live Redis fixture for explicit worker chaos tests."""

import asyncio
import os
import uuid

import pytest
import pytest_asyncio

from app.core.config import settings
from app.services.task_queue import TaskQueue


@pytest_asyncio.fixture
async def live_queue(monkeypatch: pytest.MonkeyPatch):
    redis_url = os.getenv("WORKER_LIVE_REDIS_URL")
    if not redis_url:
        pytest.skip("WORKER_LIVE_REDIS_URL is required for the explicit live Redis worker gate")

    namespace = f"tlt:test:worker:{uuid.uuid4().hex}"
    monkeypatch.setattr(settings, "WORKER_QUEUE_STREAM", f"{namespace}:stream")
    monkeypatch.setattr(settings, "WORKER_QUEUE_GROUP", f"{namespace}:group")
    monkeypatch.setattr(settings, "WORKER_DEAD_LETTER_STREAM", f"{namespace}:dead")
    monkeypatch.setattr(settings, "WORKER_READINESS_KEY_PREFIX", f"{namespace}:ready")

    queue = TaskQueue(redis_url=redis_url)
    try:
        await asyncio.wait_for(queue.redis.ping(), timeout=3)
    except Exception as exc:
        await queue.close()
        pytest.fail(f"Live Redis is unavailable at {redis_url}: {exc}")

    try:
        yield queue
    finally:
        keys = [key async for key in queue.redis.scan_iter(match=f"{namespace}:*")]
        if keys:
            await queue.redis.delete(*keys)
        await queue.close()
