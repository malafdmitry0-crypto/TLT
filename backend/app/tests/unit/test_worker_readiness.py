"""Worker heartbeat, readiness endpoint, and enqueue gate contracts."""

import json
import threading
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from fastapi.routing import APIRoute

from app.core.worker_dependency import require_worker_ready
from app.main import app, health_ready
from app.services.worker_readiness import (
    WorkerHeartbeat,
    WorkerReadinessSnapshot,
    readiness_snapshot,
)
from app.worker_healthcheck import main as worker_healthcheck_main


class FakeAsyncRedis:
    def __init__(self, values: dict[str, str] | None = None) -> None:
        self.values = values or {}

    async def ping(self) -> bool:
        return True

    async def scan_iter(self, *, match: str, count: int):
        del match, count
        for key in self.values:
            yield key

    async def mget(self, keys: list[str]):
        return [self.values.get(key) for key in keys]


class FakeDbContext:
    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    async def execute(self, _statement) -> None:
        return None


class FailingDbContext(FakeDbContext):
    async def execute(self, _statement) -> None:
        raise RuntimeError("database unavailable")


async def test_readiness_snapshot_reports_active_consumers() -> None:
    snapshot = await readiness_snapshot(
        FakeAsyncRedis(
            {
                "heatcalc:workers:ready:a": "2026-08-07T10:00:00+00:00",
                "heatcalc:workers:ready:b": "2026-08-07T10:00:01+00:00",
            }
        )
    )

    assert snapshot.active_consumers == 2
    assert snapshot.last_heartbeat_at == "2026-08-07T10:00:01+00:00"
    assert snapshot.ready is True


async def test_enqueue_dependency_rejects_when_no_consumer(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr("app.core.worker_dependency.AsyncSessionLocal", FakeDbContext)
    monkeypatch.setattr("app.core.worker_dependency.get_redis", lambda: FakeAsyncRedis())

    with pytest.raises(HTTPException) as raised:
        await require_worker_ready()

    assert raised.value.status_code == 503
    assert raised.value.detail == {
        "code": "WORKER_NOT_READY",
        "message": "Фоновая обработка временно недоступна. Повторите позже.",
        "retryable": True,
        "reason": "no_consumer",
    }


async def test_enqueue_dependency_allows_ready_consumer(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr("app.core.worker_dependency.AsyncSessionLocal", FakeDbContext)
    redis = FakeAsyncRedis({"heatcalc:workers:ready:a": "2026-08-07T10:00:00+00:00"})
    monkeypatch.setattr("app.core.worker_dependency.get_redis", lambda: redis)

    await require_worker_ready()


async def test_enqueue_dependency_rejects_when_database_is_unavailable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr("app.core.worker_dependency.AsyncSessionLocal", FailingDbContext)
    redis = FakeAsyncRedis({"heatcalc:workers:ready:a": "2026-08-07T10:00:00+00:00"})
    monkeypatch.setattr("app.core.worker_dependency.get_redis", lambda: redis)

    with pytest.raises(HTTPException) as raised:
        await require_worker_ready()

    assert raised.value.status_code == 503
    assert raised.value.headers == {"Retry-After": "5"}
    assert raised.value.detail["reason"] == "database_unavailable"


async def test_health_ready_returns_stable_ready_payload(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr("app.main.AsyncSessionLocal", FakeDbContext)
    monkeypatch.setattr("app.main.get_redis", lambda: FakeAsyncRedis())
    monkeypatch.setattr(
        "app.main.readiness_snapshot",
        lambda _redis: _async_value(
            WorkerReadinessSnapshot(
                active_consumers=1,
                last_heartbeat_at="2026-08-07T10:00:00+00:00",
            )
        ),
    )

    response = await health_ready()
    payload = json.loads(response.body)

    assert response.status_code == 200
    assert payload["status"] == "ready"
    assert payload["database"] == {"ready": True}
    assert payload["redis"] == {"ready": True}
    assert payload["worker"]["ready"] is True
    assert payload["worker"]["active_consumers"] == 1
    assert payload["worker"]["reason"] is None


def test_readiness_routes_are_available_for_orchestrator_and_frontend_proxy() -> None:
    paths = {route.path for route in app.routes}

    assert "/health/live" in paths
    assert "/health/ready" in paths
    assert "/api/v1/health/ready" in paths


def test_background_enqueue_routes_require_ready_worker() -> None:
    guarded_paths = {
        "/api/v1/calc/heat-loss/batch/jobs",
        "/api/v1/calc/electrical/batch/jobs",
        "/api/v1/reports/{project_id}/export/{format}/jobs",
        "/api/v1/projects/{project_id}/objects/import-excel",
    }
    routes = {
        route.path: route
        for route in app.routes
        if isinstance(route, APIRoute) and route.path in guarded_paths
    }

    assert routes.keys() == guarded_paths
    for route in routes.values():
        dependencies = {dependency.call for dependency in route.dependant.dependencies}
        assert require_worker_ready in dependencies


async def _async_value(value):
    return value


def test_worker_watchdog_exits_if_event_loop_stops(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    exits: list[int] = []
    fake_redis = SimpleNamespace(delete=lambda _key: None, close=lambda: None)
    monkeypatch.setattr(
        "app.services.worker_readiness.SyncRedis.from_url",
        lambda *_args, **_kwargs: fake_redis,
    )
    monkeypatch.setattr(
        "app.services.worker_readiness.settings.WORKER_EVENT_LOOP_STALE_SECONDS",
        0,
    )
    heartbeat = WorkerHeartbeat("redis://test", "worker-a", fatal_exit=exits.append)

    heartbeat._run()

    assert exits == [70]


def test_paused_heartbeat_withdraws_key_and_does_not_refresh(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class RecordingRedis:
        def __init__(self) -> None:
            self.set_count = 0
            self.set_event = threading.Event()
            self.delete_event = threading.Event()

        def set(self, *_args, **_kwargs) -> None:
            self.set_count += 1
            self.set_event.set()

        def delete(self, _key) -> None:
            self.delete_event.set()

        def close(self) -> None:
            return None

    redis = RecordingRedis()
    monkeypatch.setattr(
        "app.services.worker_readiness.SyncRedis.from_url",
        lambda *_args, **_kwargs: redis,
    )
    heartbeat = WorkerHeartbeat("redis://test", "worker-a")
    heartbeat.start()
    assert redis.set_event.wait(timeout=1)

    heartbeat.pause()
    assert redis.delete_event.wait(timeout=1)
    set_count_after_pause = redis.set_count
    assert heartbeat._publish_once(redis) is False
    assert redis.set_count == set_count_after_pause

    heartbeat.stop()


def test_heartbeat_transport_error_requires_consumer_reprobe() -> None:
    class FailingRedis:
        def set(self, *_args, **_kwargs) -> None:
            raise ConnectionError("partition")

    heartbeat = WorkerHeartbeat("redis://test", "worker-a")

    with pytest.raises(ConnectionError, match="partition"):
        heartbeat._publish_once(FailingRedis())  # type: ignore[arg-type]

    assert heartbeat.is_paused is True
    heartbeat.resume()
    assert heartbeat.is_paused is False


def test_worker_healthcheck_uses_exact_consumer_heartbeat(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr("app.worker_healthcheck.settings.REDIS_URL", "redis://test")
    monkeypatch.setattr("app.worker_healthcheck.worker_consumer_name", lambda: "worker-a")
    monkeypatch.setattr("app.worker_healthcheck.worker_is_ready_sync", lambda *_args: True)
    assert worker_healthcheck_main() == 0
    monkeypatch.setattr("app.worker_healthcheck.worker_is_ready_sync", lambda *_args: False)
    assert worker_healthcheck_main() == 1
