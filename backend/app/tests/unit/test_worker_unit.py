"""Unit tests for calculation worker message handling."""

from uuid import uuid4

import pytest

from app.worker import CalculationWorker


class FakeQueue:
    def __init__(self):
        self.acked: list[str] = []

    async def ack(self, stream_id: str) -> None:
        self.acked.append(stream_id)


class FakeSessionContext:
    async def __aenter__(self):
        return "db"

    async def __aexit__(self, exc_type, exc, tb):
        return False


class FakeTaskService:
    run_calls: list[tuple[str, str]] = []
    recovered = 0

    def __init__(self, db):
        self.db = db

    async def run_task(self, task_id, *, worker_id: str) -> None:
        self.__class__.run_calls.append((str(task_id), worker_id))

    async def recover_stuck_tasks(self, *, queue):
        self.__class__.recovered += 1
        return 1


def _worker() -> CalculationWorker:
    worker = CalculationWorker.__new__(CalculationWorker)
    worker.consumer = "test-worker"
    worker.queue = FakeQueue()
    worker._last_recovery = 0.0
    return worker


async def test_worker_acks_messages_without_task_id():
    worker = _worker()

    await worker._handle_message("1-0", {})

    assert worker.queue.acked == ["1-0"]


async def test_worker_acks_invalid_task_id():
    worker = _worker()

    await worker._handle_message("1-1", {"task_id": "not-a-uuid"})

    assert worker.queue.acked == ["1-1"]


async def test_worker_runs_valid_task_and_acks(monkeypatch: pytest.MonkeyPatch):
    FakeTaskService.run_calls = []
    monkeypatch.setattr("app.worker.AsyncSessionLocal", lambda: FakeSessionContext())
    monkeypatch.setattr("app.worker.TaskService", FakeTaskService)
    worker = _worker()
    task_id = uuid4()

    await worker._handle_message("1-2", {"task_id": str(task_id)})

    assert FakeTaskService.run_calls == [(str(task_id), "test-worker")]
    assert worker.queue.acked == ["1-2"]


async def test_worker_periodic_recovery(monkeypatch: pytest.MonkeyPatch):
    FakeTaskService.recovered = 0
    monkeypatch.setattr("app.worker.AsyncSessionLocal", lambda: FakeSessionContext())
    monkeypatch.setattr("app.worker.TaskService", FakeTaskService)
    monkeypatch.setattr("app.worker.settings.WORKER_RECOVERY_INTERVAL_SECONDS", 0)
    worker = _worker()

    await worker._recover_if_due()

    assert FakeTaskService.recovered == 1
