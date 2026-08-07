"""Executable resilience contracts discovered by the 2026-08-07 worker audit."""

import asyncio

import pytest

from app.worker import CalculationWorker


class StartupQueue:
    def __init__(self, *, group_error: Exception | None = None) -> None:
        self.group_error = group_error
        self.events: list[str] = []
        self.redis_url = "redis://test"
        self.redis = object()

    async def ensure_group(self) -> None:
        self.events.append("ensure_group")
        if self.group_error is not None:
            raise self.group_error

    async def read(self, **_kwargs):
        self.events.append("read")
        raise asyncio.CancelledError

    async def close(self) -> None:
        self.events.append("close")


class DeadLetterFailureQueue:
    def __init__(self) -> None:
        self.acked: list[str] = []

    async def dead_letter(self, *_args, **_kwargs) -> str:
        raise RuntimeError("redis unavailable")

    async def ack(self, stream_id: str) -> None:
        self.acked.append(stream_id)


class TransientReadFailureQueue(StartupQueue):
    def __init__(self) -> None:
        super().__init__()
        self.read_count = 0

    async def read(self, **_kwargs):
        self.read_count += 1
        self.events.append("read")
        if self.read_count == 1:
            raise RuntimeError("temporary redis disconnect")
        raise asyncio.CancelledError


def _bare_worker(queue) -> CalculationWorker:
    worker = CalculationWorker.__new__(CalculationWorker)
    worker.consumer = "audit-worker"
    worker.queue = queue
    worker._last_recovery = 0.0
    worker._jitter_func = lambda lower, upper: (lower + upper) / 2
    return worker


class FakeHeartbeat:
    instances: list["FakeHeartbeat"] = []

    def __init__(self, *_args) -> None:
        self.started = False
        self.paused = False
        self.events: list[str] = []
        self.__class__.instances.append(self)

    def start(self) -> None:
        self.started = True
        self.events.append("start")

    def stop(self) -> None:
        self.started = False
        self.events.append("stop")

    def tick(self) -> None:
        return None

    def pause(self) -> None:
        self.paused = True
        self.events.append("pause")

    def resume(self) -> None:
        self.paused = False
        self.events.append("resume")


def _patch_ready_startup(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        CalculationWorker,
        "_probe_runtime_dependencies",
        lambda _self: _noop(),
    )
    monkeypatch.setattr("app.worker.mark_worker_ready", lambda *_args: _noop())
    monkeypatch.setattr("app.worker.clear_worker_ready", lambda *_args: _noop())
    monkeypatch.setattr("app.worker.WorkerHeartbeat", FakeHeartbeat)


async def test_ready_log_boundary_is_after_preload_and_consumer_group(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The internal ready boundary has the right order even though it is not exported."""
    events: list[str] = []
    queue = StartupQueue()
    monkeypatch.setattr("app.worker.preload_all", lambda: events.append("preload"))
    monkeypatch.setattr("app.worker.logger.info", lambda *_args: events.append("started"))
    monkeypatch.setattr(CalculationWorker, "_recover_if_due", lambda _self: _noop())
    _patch_ready_startup(monkeypatch)

    async def probe(_self) -> None:
        await queue.ensure_group()

    monkeypatch.setattr(CalculationWorker, "_probe_runtime_dependencies", probe)
    worker = _bare_worker(queue)

    with pytest.raises(asyncio.CancelledError):
        await worker.run()

    combined = events[:1] + queue.events[:1] + events[1:]
    assert combined == ["preload", "ensure_group", "started"]
    assert queue.events[-1] == "close"


async def _noop() -> None:
    return None


def test_retry_jitter_is_injectable_and_bounded(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("app.worker.settings.WORKER_RETRY_BACKOFF_MAX_SECONDS", 30)
    worker = CalculationWorker.__new__(CalculationWorker)
    worker._jitter_func = lambda lower, _upper: lower
    assert worker._retry_delay(4) == 2

    worker._jitter_func = lambda _lower, _upper: 999
    assert worker._retry_delay(30) == 30


async def test_group_initialization_failure_closes_redis_queue(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    queue = StartupQueue(group_error=RuntimeError("redis unavailable"))
    monkeypatch.setattr("app.worker.preload_all", lambda: None)
    worker = _bare_worker(queue)

    with pytest.raises(RuntimeError, match="redis unavailable"):
        await worker.run()

    assert queue.events == ["ensure_group", "close"]


async def test_transient_queue_read_error_does_not_terminate_worker(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    queue = TransientReadFailureQueue()
    monkeypatch.setattr("app.worker.preload_all", lambda: None)
    monkeypatch.setattr(CalculationWorker, "_recover_if_due", lambda _self: _noop())
    _patch_ready_startup(monkeypatch)
    FakeHeartbeat.instances = []
    probes: list[str] = []
    published: list[str] = []

    async def probe(_self) -> None:
        probes.append("probe")

    async def publish(_redis, _consumer) -> None:
        published.append("ready")

    monkeypatch.setattr(CalculationWorker, "_probe_runtime_dependencies", probe)
    monkeypatch.setattr("app.worker.mark_worker_ready", publish)
    worker = _bare_worker(queue)

    with pytest.raises(asyncio.CancelledError):
        await worker.run()

    assert queue.read_count == 2
    assert queue.events[-1] == "close"
    assert probes == ["probe", "probe"]
    assert published == ["ready", "ready"]
    assert FakeHeartbeat.instances[0].events == ["start", "pause", "resume", "stop"]


async def test_missing_task_id_is_not_acked_when_dead_letter_write_fails() -> None:
    queue = DeadLetterFailureQueue()
    worker = _bare_worker(queue)

    await worker._handle_message("1-0", {"type": "electrical_batch"})

    assert queue.acked == []


async def test_invalid_task_id_is_not_acked_when_dead_letter_write_fails() -> None:
    queue = DeadLetterFailureQueue()
    worker = _bare_worker(queue)

    await worker._handle_message(
        "1-1",
        {"task_id": "not-a-uuid", "type": "electrical_batch"},
    )

    assert queue.acked == []
