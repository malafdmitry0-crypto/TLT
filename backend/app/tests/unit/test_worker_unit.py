"""Unit tests for calculation worker message handling."""

from uuid import uuid4

import pytest

from app.worker import CalculationWorker


class FakeQueue:
    def __init__(self):
        self.acked: list[str] = []
        self.dead_letters: list[tuple[str, dict[str, str], str]] = []
        self.pending_entries: list[tuple[str, dict[str, str]]] = []
        self.reclaim_calls = 0

    async def ack(self, stream_id: str) -> None:
        self.acked.append(stream_id)

    async def dead_letter(self, stream_id: str, fields: dict[str, str], *, reason: str) -> str:
        self.dead_letters.append((stream_id, fields, reason))
        return f"dead:{stream_id}"

    async def reclaim_pending(self, *, consumer: str, min_idle_ms: int, start_id: str, count: int):
        self.reclaim_calls += 1
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
    dead_letter_pending = False
    finalized: list[str] = []

    def __init__(self, db):
        self.db = db

    async def run_task(self, task_id, *, worker_id: str) -> None:
        self.__class__.run_calls.append((str(task_id), worker_id))
        if self.__class__.run_error is not None:
            raise self.__class__.run_error

    async def recover_stuck_tasks(self, *, queue):
        self.__class__.recovered += 1
        return 1

    async def is_dead_letter_pending(self, task_id) -> bool:
        del task_id
        return self.__class__.dead_letter_pending

    async def finalize_dead_letter(self, task_id) -> None:
        self.__class__.finalized.append(str(task_id))

    async def record_worker_exception(self, task_id, *, worker_id: str, error_message: str):
        self.__class__.failure_calls.append((str(task_id), worker_id, error_message))
        return self.__class__.failure_action


def _worker() -> CalculationWorker:
    worker = CalculationWorker.__new__(CalculationWorker)
    worker.consumer = "test-worker"
    worker.queue = FakeQueue()
    worker._last_recovery = 0.0
    worker._jitter_func = lambda lower, upper: (lower + upper) / 2
    return worker


def test_retry_jitter_is_injectable_clamped_and_capped(
    monkeypatch: pytest.MonkeyPatch,
):
    monkeypatch.setattr("app.worker.settings.WORKER_RETRY_BACKOFF_MAX_SECONDS", 10)
    worker = _worker()
    bounds: list[tuple[float, float]] = []

    def injected(lower: float, upper: float) -> float:
        bounds.append((lower, upper))
        return 7.5

    worker._jitter_func = injected
    assert worker._retry_delay(8) == 7.5
    assert bounds == [(4.0, 10.0)]

    worker._jitter_func = lambda _lower, _upper: -100.0
    assert worker._retry_delay(8) == 4.0
    worker._jitter_func = lambda _lower, _upper: 100.0
    assert worker._retry_delay(8) == 10.0


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


async def test_worker_retries_only_dlq_transfer_for_pending_task(
    monkeypatch: pytest.MonkeyPatch,
):
    FakeTaskService.run_calls = []
    FakeTaskService.dead_letter_pending = True
    FakeTaskService.finalized = []
    monkeypatch.setattr("app.worker.AsyncSessionLocal", lambda: FakeSessionContext())
    monkeypatch.setattr("app.worker.TaskService", FakeTaskService)
    worker = _worker()
    task_id = uuid4()
    fields = {"task_id": str(task_id), "type": "electrical_batch"}

    await worker._handle_message("1-5", fields)

    assert FakeTaskService.run_calls == []
    assert worker.queue.dead_letters == [("1-5", fields, "worker_attempts_exhausted")]
    assert FakeTaskService.finalized == [str(task_id)]
    assert worker.queue.acked == ["1-5"]
    FakeTaskService.dead_letter_pending = False


async def test_crash_after_durable_dlq_before_finalize_is_idempotent(
    monkeypatch: pytest.MonkeyPatch,
):
    class IdempotentQueue(FakeQueue):
        def __init__(self) -> None:
            super().__init__()
            self.durable_ids: set[str] = set()

        async def dead_letter(
            self,
            stream_id: str,
            fields: dict[str, str],
            *,
            reason: str,
        ) -> str:
            if stream_id not in self.durable_ids:
                self.durable_ids.add(stream_id)
                self.dead_letters.append((stream_id, fields, reason))
            return f"dead:{stream_id}"

    class CrashOnceTaskService(FakeTaskService):
        finalize_calls = 0
        dead_letter_pending = True

        async def finalize_dead_letter(self, task_id) -> None:
            del task_id
            self.__class__.finalize_calls += 1
            if self.__class__.finalize_calls == 1:
                raise RuntimeError("crash after durable DLQ")

    monkeypatch.setattr("app.worker.AsyncSessionLocal", lambda: FakeSessionContext())
    monkeypatch.setattr("app.worker.TaskService", CrashOnceTaskService)
    worker = _worker()
    worker.queue = IdempotentQueue()
    task_id = uuid4()
    fields = {"task_id": str(task_id), "type": "electrical_batch"}

    with pytest.raises(RuntimeError, match="crash after durable DLQ"):
        await worker._handle_message("1-6", fields)
    await worker._handle_message("1-6", fields)

    assert len(worker.queue.dead_letters) == 1
    assert CrashOnceTaskService.finalize_calls == 2
    assert worker.queue.acked == ["1-6"]


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

    assert FakeTaskService.run_calls == [(str(task_id), "test-worker")]
    assert worker.queue.acked == ["2-0"]


async def test_worker_periodic_recovery(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr("app.worker.settings.WORKER_RECOVERY_INTERVAL_SECONDS", 60)
    worker = _worker()

    await worker._recover_if_due()
    await worker._recover_if_due()

    assert worker.queue.reclaim_calls == 1
