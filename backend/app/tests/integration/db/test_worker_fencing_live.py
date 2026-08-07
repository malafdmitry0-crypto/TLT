"""PostgreSQL-backed worker claim and generation-fencing contracts."""

import asyncio
import uuid

import pytest
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from app.models.background_task import BackgroundTask
from app.models.guest_session import GuestSession
from app.services.task_service import BatchProgress, TaskService

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def _task(
    db: AsyncSession,
    *,
    status: str = "enqueued",
    attempts: int = 0,
    locked_by: str | None = None,
) -> BackgroundTask:
    session_id = f"worker-live-{uuid.uuid4().hex}"
    db.add(GuestSession(session_id=session_id))
    # BackgroundTask references GuestSession by session_id without an ORM
    # relationship, so make the parent row durable before inserting the task.
    await db.flush()
    task = BackgroundTask(
        type="heat_loss_batch",
        status=status,
        session_id=session_id,
        request_payload={},
        progress_current=0,
        progress_total=10,
        progress_phase=status,
        attempts=attempts,
        enqueue_attempts=1,
        locked_by=locked_by,
        cancel_requested=False,
    )
    db.add(task)
    await db.commit()
    await db.refresh(task)
    return task


async def test_two_real_sessions_cannot_claim_the_same_task(
    test_engine: AsyncEngine,
    db_session: AsyncSession,
):
    task = await _task(db_session)
    factory = async_sessionmaker(test_engine, expire_on_commit=False)

    async with factory() as first_db, factory() as second_db:
        first, second = await asyncio.gather(
            TaskService(first_db)._claim_task_for_run(task.id, worker_id="worker-a"),
            TaskService(second_db)._claim_task_for_run(task.id, worker_id="worker-b"),
        )

    winners = [claimed for claimed in (first, second) if claimed is not None]
    assert len(winners) == 1
    assert winners[0].attempts == 1
    assert winners[0].locked_by in {"worker-a", "worker-b"}


async def test_stale_generation_cannot_publish_progress_or_result(
    test_engine: AsyncEngine,
    db_session: AsyncSession,
):
    task = await _task(db_session, status="running", attempts=2, locked_by="worker-new")
    factory = async_sessionmaker(test_engine, expire_on_commit=False)

    async with factory() as service_db:
        service = TaskService(service_db, session_factory=factory)
        await service._update_progress(
            task.id,
            BatchProgress(current=9, total=10, phase="stale"),
            attempt=1,
            worker_id="worker-old",
        )
        stale_published = await service._mark_succeeded(
            task.id,
            {"winner": "stale"},
            attempt=1,
            worker_id="worker-old",
        )

    async with factory() as winner_db:
        winner = TaskService(winner_db)
        current_published = await winner._mark_succeeded(
            task.id,
            {"winner": "current"},
            attempt=2,
            worker_id="worker-new",
        )

    await db_session.refresh(task)
    assert stale_published is False
    assert current_published is True
    assert task.status == "succeeded"
    assert task.result_payload == {"winner": "current"}
    assert task.progress_phase == "done"


async def test_redelivery_after_success_commit_does_not_open_second_attempt(
    test_engine: AsyncEngine,
    db_session: AsyncSession,
):
    task = await _task(db_session, status="running", attempts=1, locked_by="worker-a")
    factory = async_sessionmaker(test_engine, expire_on_commit=False)

    async with factory() as first_db:
        committed = await TaskService(first_db)._mark_succeeded(
            task.id,
            {"committed_before_ack": True},
            attempt=1,
            worker_id="worker-a",
        )
    async with factory() as redelivery_db:
        claimed_again = await TaskService(redelivery_db)._claim_task_for_run(
            task.id,
            worker_id="worker-b",
        )

    await db_session.refresh(task)
    assert committed is True
    assert claimed_again is None
    assert task.status == "succeeded"
    assert task.attempts == 1
    assert task.result_payload == {"committed_before_ack": True}
