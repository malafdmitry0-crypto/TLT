"""Real process-death contracts around worker claim and Redis ACK windows."""

import asyncio
import os
import signal
import sys
import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from app.models.background_task import BackgroundTask
from app.models.guest_session import GuestSession
from app.services.task_queue import TaskQueue
from app.services.task_service import TaskService

pytestmark = pytest.mark.asyncio(loop_scope="session")

_CLAIM_AND_KILL = """
import asyncio, os, signal, sys
from uuid import UUID
from app.core.database import AsyncSessionLocal
from app.services.task_service import TaskService

async def main():
    async with AsyncSessionLocal() as db:
        claimed = await TaskService(db)._claim_task_for_run(UUID(sys.argv[1]), worker_id=sys.argv[2])
        assert claimed is not None
    os.kill(os.getpid(), signal.SIGKILL)

asyncio.run(main())
"""

_COMMIT_AND_KILL = """
import asyncio, os, signal, sys
from uuid import UUID
from app.core.database import AsyncSessionLocal
from app.services.task_service import TaskService

async def main():
    task_id = UUID(sys.argv[1])
    worker_id = sys.argv[2]
    async with AsyncSessionLocal() as db:
        claimed = await TaskService(db)._claim_task_for_run(task_id, worker_id=worker_id)
        assert claimed is not None
    async with AsyncSessionLocal() as db:
        committed = await TaskService(db)._mark_succeeded(
            task_id,
            {"committed_before_ack": True},
            attempt=claimed.attempts,
            worker_id=worker_id,
        )
        assert committed is True
    os.kill(os.getpid(), signal.SIGKILL)

asyncio.run(main())
"""


async def _task(db: AsyncSession) -> BackgroundTask:
    session_id = f"worker-sigkill-{uuid.uuid4().hex}"
    db.add(GuestSession(session_id=session_id))
    # BackgroundTask references GuestSession by session_id without an ORM
    # relationship, so make the parent row durable before inserting the task.
    await db.flush()
    task = BackgroundTask(
        type="heat_loss_batch",
        status="enqueued",
        session_id=session_id,
        request_payload={},
        progress_current=0,
        progress_total=1,
        progress_phase="enqueued",
        attempts=0,
        enqueue_attempts=1,
        cancel_requested=False,
    )
    db.add(task)
    await db.commit()
    await db.refresh(task)
    return task


async def _killed_subprocess(code: str, task_id: uuid.UUID, worker_id: str) -> None:
    database_url = os.getenv("TEST_DATABASE_URL")
    assert database_url, "TEST_DATABASE_URL is required for the live SIGKILL gate"
    env = os.environ.copy()
    env.update(
        {
            "APP_ENV": "test",
            "DATABASE_URL": database_url,
            "SECRET_KEY": env.get("SECRET_KEY", "worker-chaos-secret"),
        }
    )
    process = await asyncio.create_subprocess_exec(
        sys.executable,
        "-c",
        code,
        str(task_id),
        worker_id,
        env=env,
    )
    return_code = await asyncio.wait_for(process.wait(), timeout=15)
    assert return_code == -signal.SIGKILL


async def test_sigkill_after_claim_is_recovered_from_postgres(
    test_engine: AsyncEngine,
    db_session: AsyncSession,
    live_queue: TaskQueue,
):
    task = await _task(db_session)
    await _killed_subprocess(_CLAIM_AND_KILL, task.id, "worker-killed-after-claim")

    await db_session.refresh(task)
    assert task.status == "running"
    assert task.attempts == 1
    task.heartbeat_at = datetime.now(UTC) - timedelta(minutes=10)
    task.lock_expires_at = datetime.now(UTC) - timedelta(minutes=10)
    await db_session.commit()

    recovered = await TaskService(db_session).recover_stuck_tasks(queue=live_queue)
    await db_session.refresh(task)
    assert recovered == 1
    assert task.status == "enqueued"
    assert task.attempts == 1


async def test_sigkill_after_success_commit_before_ack_is_safe_on_redelivery(
    test_engine: AsyncEngine,
    db_session: AsyncSession,
    live_queue: TaskQueue,
):
    task = await _task(db_session)
    stream_id = await live_queue.enqueue(task.id, task.type)
    messages = await live_queue.read(consumer="worker-before-ack", count=1, block_ms=50)
    assert messages and messages[0][1][0][0] == stream_id

    await _killed_subprocess(_COMMIT_AND_KILL, task.id, "worker-before-ack")
    await db_session.refresh(task)
    assert task.status == "succeeded"
    assert task.result_payload == {"committed_before_ack": True}

    _next_id, claimed = await live_queue.reclaim_pending(
        consumer="worker-redelivery",
        min_idle_ms=0,
        count=10,
    )
    assert claimed and claimed[0][0] == stream_id

    factory = async_sessionmaker(test_engine, expire_on_commit=False)
    async with factory() as redelivery_db:
        duplicate = await TaskService(redelivery_db)._claim_task_for_run(
            task.id,
            worker_id="worker-redelivery",
        )
    assert duplicate is None
    await live_queue.ack(stream_id)
    pending = await live_queue.redis.xpending(live_queue.stream, live_queue.group)
    assert pending["pending"] == 0

    await db_session.refresh(task)
    assert task.attempts == 1
    assert task.result_payload == {"committed_before_ack": True}
