"""Unit tests for calculation worker message handling."""

from uuid import uuid4

import pytest

from app.worker import CalculationWorker


class FakeQueue:
    def __init__(self):
        self.acked: list[str] = []
        self.dead_letters: list[tuple[str, dict[str, str], str]] = []
        self.pending_entries: list[tuple[str, dict[str, str]]] = []

    async def ack(self, stream_id: str) -> None:
        self.acked.append(stream_id)

    async def dead_letter(self, stream_id: str, fields: dict[str, str], *, reason: str) -> str:
        self.dead_letters.append((stream_id, fields, reason))
        return f"dead:{stream_id}"

    async def reclaim_pending(self, *, consumer: str, min_idle_ms: int, start_id: str, count: int):
        return "0-0", self.pending_entries[:count]


class FakeSessionContext:
    async def __aenter__(self):
        return "db"

    async def __aexit__(self, exc_type, exc, tb):
        return False


class FakeTaskService:
    run_calls: list[tuple[str, str]] = []
    failure_calls: list[tuple[str, str, str]] = []
    recovered = 0
    run_error: Exception | None = None
    failure_action = "retry"

    def __init__(self, db):
        self.db = db

    async def run_task(self, task_id, *, worker_id: str) -> None:
        self.__class__.run_calls.append((str(task_id), worker_id))
        if self.__class__.run_error is not None:
            raise self.__class__.run_error

    async def recover_stuck_tasks(self, *, queue):
        self.__class__.recovered += 1
        return 1

    async def record_worker_exception(self, task_id, *, worker_id: str, error_message: str):
        self.__class__.failure_calls.append((str(task_id), worker_id, error_message))
        return self.__class__.failure_action


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
    FakeTaskService.run_error = None
    monkeypatch.setattr("app.worker.AsyncSessionLocal", lambda: FakeSessionContext())
    monkeypatch.setattr("app.worker.TaskService", FakeTaskService)
    worker = _worker()
    task_id = uuid4()

    await worker._handle_message("1-2", {"task_id": str(task_id)})

    assert FakeTaskService.run_calls == [(str(task_id), "test-worker")]
    assert worker.queue.acked == ["1-2"]


async def test_worker_leaves_pending_message_for_retry(monkeypatch: pytest.MonkeyPatch):
    FakeTaskService.run_calls = []
    FakeTaskService.failure_calls = []
    FakeTaskService.run_error = RuntimeError("db glitch")
    FakeTaskService.failure_action = "retry"
    monkeypatch.setattr("app.worker.AsyncSessionLocal", lambda: FakeSessionContext())
    monkeypatch.setattr("app.worker.TaskService", FakeTaskService)
    worker = _worker()
    task_id = uuid4()

    await worker._handle_message("1-3", {"task_id": str(task_id)})

    assert FakeTaskService.run_calls == [(str(task_id), "test-worker")]
    assert FakeTaskService.failure_calls == [
        (str(task_id), "test-worker", "RuntimeError: db glitch")
    ]
    assert worker.queue.acked == []
    assert worker.queue.dead_letters == []


async def test_worker_dead_letters_and_acks_exhausted_attempts(monkeypatch: pytest.MonkeyPatch):
    FakeTaskService.run_calls = []
    FakeTaskService.failure_calls = []
    FakeTaskService.run_error = RuntimeError("boom")
    FakeTaskService.failure_action = "dead_letter"
    monkeypatch.setattr("app.worker.AsyncSessionLocal", lambda: FakeSessionContext())
    monkeypatch.setattr("app.worker.TaskService", FakeTaskService)
    worker = _worker()
    task_id = uuid4()
    fields = {"task_id": str(task_id), "type": "electrical_batch"}

    await worker._handle_message("1-4", fields)

    assert worker.queue.dead_letters == [("1-4", fields, "worker_attempts_exhausted")]
    assert worker.queue.acked == ["1-4"]


async def test_worker_claims_pending_entries(monkeypatch: pytest.MonkeyPatch):
    FakeTaskService.run_calls = []
    FakeTaskService.run_error = None
    monkeypatch.setattr("app.worker.AsyncSessionLocal", lambda: FakeSessionContext())
    monkeypatch.setattr("app.worker.TaskService", FakeTaskService)
    monkeypatch.setattr("app.worker.settings.WORKER_RECOVERY_INTERVAL_SECONDS", 0)
    monkeypatch.setattr("app.worker.settings.WORKER_TASK_STALE_SECONDS", 120)
    worker = _worker()
    task_id = uuid4()
    worker.queue.pending_entries = [("2-0", {"task_id": str(task_id)})]

    await worker._recover_if_due()

    assert FakeTaskService.recovered == 1
    assert FakeTaskService.run_calls == [(str(task_id), "test-worker")]
    assert worker.queue.acked == ["2-0"]


async def test_worker_periodic_recovery(monkeypatch: pytest.MonkeyPatch):
    FakeTaskService.recovered = 0
    monkeypatch.setattr("app.worker.AsyncSessionLocal", lambda: FakeSessionContext())
    monkeypatch.setattr("app.worker.TaskService", FakeTaskService)
    monkeypatch.setattr("app.worker.settings.WORKER_RECOVERY_INTERVAL_SECONDS", 0)
    worker = _worker()

    await worker._recover_if_due()

    assert FakeTaskService.recovered == 1
