"""Independent leader recovery contracts."""

import asyncio
from unittest.mock import AsyncMock

import pytest

from app.main import _periodic_task_recovery
from app.services.task_recovery import TaskRecoveryCoordinator


class FakeRedis:
    def __init__(self, acquired: bool) -> None:
        self.acquired = acquired
        self.calls: list[tuple] = []

    async def set(self, *args, **kwargs):
        self.calls.append((args, kwargs))
        return self.acquired

    async def eval(self, *args):
        self.calls.append((args, {}))
        return 1


class FakeQueue:
    def __init__(self, *, acquired: bool = True) -> None:
        self.redis = FakeRedis(acquired)
        self.closed = False

    async def close(self) -> None:
        self.closed = True


class FakeSessionFactory:
    def __call__(self):
        return self

    async def __aenter__(self):
        return "db"

    async def __aexit__(self, exc_type, exc, tb):
        return False


async def test_recovery_coordinator_runs_without_consumer_worker(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    recovered = AsyncMock(return_value=2)

    class FakeTaskService:
        def __init__(self, db) -> None:
            assert db == "db"

        recover_stuck_tasks = recovered

    monkeypatch.setattr("app.services.task_recovery.TaskService", FakeTaskService)
    queue = FakeQueue()
    coordinator = TaskRecoveryCoordinator(
        queue=queue,  # type: ignore[arg-type]
        session_factory=FakeSessionFactory(),
    )

    result = await coordinator.run_once()

    assert result == 2
    recovered.assert_awaited_once_with(queue=queue)
    assert queue.redis.calls


async def test_non_leader_does_not_run_recovery(monkeypatch: pytest.MonkeyPatch) -> None:
    service = AsyncMock()
    monkeypatch.setattr("app.services.task_recovery.TaskService", service)
    queue = FakeQueue(acquired=False)
    coordinator = TaskRecoveryCoordinator(
        queue=queue,  # type: ignore[arg-type]
        session_factory=FakeSessionFactory(),
    )

    assert await coordinator.run_once() == 0
    service.assert_not_called()


async def test_backend_periodic_recovery_runs_and_closes(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    events: list[str] = []

    class FakeCoordinator:
        async def run_once(self) -> int:
            events.append("recover")
            return 0

        async def close(self) -> None:
            events.append("close")

    async def cancel_after_iteration(_seconds: int) -> None:
        raise asyncio.CancelledError

    monkeypatch.setattr("app.main.TaskRecoveryCoordinator", FakeCoordinator)
    monkeypatch.setattr("app.main.asyncio.sleep", cancel_after_iteration)

    with pytest.raises(asyncio.CancelledError):
        await _periodic_task_recovery()

    assert events == ["recover", "close"]
