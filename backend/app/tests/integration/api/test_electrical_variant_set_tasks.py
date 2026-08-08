"""Regression contract for explicit electrical ER-set tasks."""

from unittest.mock import AsyncMock, call
from uuid import UUID, uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models.audit_event import AuditEvent
from app.models.background_task import BackgroundTask
from app.services.electrical_variant_set_task_service import ElectricalVariantSetTaskService

pytestmark = pytest.mark.asyncio(loop_scope="session")


class FakeTaskQueue:
    enqueued: list[tuple[str, str]] = []

    async def enqueue(self, task_id, task_type: str) -> str:
        self.__class__.enqueued.append((str(task_id), task_type))
        return f"electrical-set-{len(self.enqueued)}"


async def _project(client: AsyncClient, session_id: str) -> dict:
    response = await client.get("/api/v1/projects", headers={"X-Session-Id": session_id})
    assert response.status_code == 200, response.text
    return response.json()[0]


async def _variants(client: AsyncClient, project_id: str, session_id: str) -> list[dict]:
    headers = {"X-Session-Id": session_id}
    created_object = await client.post(
        f"/api/v1/projects/{project_id}/objects",
        headers=headers,
        json={
            "object_type": "pipe",
            "params": {
                "outer_diameter": 0.108,
                "wall_thickness": 0.004,
                "pipe_material": "carbon_steel",
                "insulation_layers": [
                    {"thickness": 0.05, "material": "mineral_wool_boards_120"}
                ],
                "insulation_temperature_basis": "outdoor_winter",
                "ambient_temperature": -20,
                "process_temperature": 80,
                "pipe_length": 25,
                "placement": "outdoor",
                "wind_speed": 0,
            },
        },
    )
    assert created_object.status_code in (200, 201), created_object.text
    initialized = await client.post(
        f"/api/v1/projects/{project_id}/electrical-variants/initialize", headers=headers
    )
    assert initialized.status_code == 200, initialized.text
    created = await client.post(
        f"/api/v1/projects/{project_id}/electrical-variants",
        headers=headers,
        json={"name": "ЭР2"},
    )
    assert created.status_code == 201, created.text
    return [initialized.json()["variant"], created.json()]


class TestElectricalVariantSetTasks:
    @pytest.mark.parametrize(
        "payload",
        [{}, {"electrical_variant_ids": []}, {"electrical_variant_ids": None}],
    )
    async def test_request_without_explicit_scope_is_rejected_before_enqueue(
        self,
        client: AsyncClient,
        guest_session: str,
        db_session: AsyncSession,
        payload: dict,
    ) -> None:
        project = await _project(client, guest_session)
        response = await client.post(
            f"/api/v1/projects/{project['id']}/electrical-variant-set-tasks",
            headers={"X-Session-Id": guest_session, "Idempotency-Key": "missing-scope"},
            json=payload,
        )
        assert response.status_code == 422
        count = await db_session.scalar(select(func.count(BackgroundTask.id)))
        assert count == 0

    async def test_duplicate_scope_is_rejected_before_enqueue(
        self,
        client: AsyncClient,
        guest_session: str,
        db_session: AsyncSession,
    ) -> None:
        project = await _project(client, guest_session)
        variants = await _variants(client, project["id"], guest_session)
        response = await client.post(
            f"/api/v1/projects/{project['id']}/electrical-variant-set-tasks",
            headers={"X-Session-Id": guest_session, "Idempotency-Key": "duplicate-scope"},
            json={"electrical_variant_ids": [variants[0]["id"], variants[0]["id"]]},
        )
        assert response.status_code == 422
        count = await db_session.scalar(select(func.count(BackgroundTask.id)))
        assert count == 0

    async def test_two_explicit_variants_are_persisted_in_request_order(
        self,
        client: AsyncClient,
        guest_session: str,
        db_session: AsyncSession,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        FakeTaskQueue.enqueued = []
        monkeypatch.setattr(
            "app.services.electrical_variant_set_task_service.TaskQueue", FakeTaskQueue
        )
        project = await _project(client, guest_session)
        variants = await _variants(client, project["id"], guest_session)
        requested = [variants[1]["id"], variants[0]["id"]]
        response = await client.post(
            f"/api/v1/projects/{project['id']}/electrical-variant-set-tasks",
            headers={"X-Session-Id": guest_session, "Idempotency-Key": "ordered-scope"},
            json={"electrical_variant_ids": requested},
        )
        assert response.status_code == 202, response.text
        assert response.json()["electrical_variant_ids"] == requested
        assert response.json()["result"]["requested_electrical_variant_ids"] == requested
        task = await db_session.get(BackgroundTask, UUID(response.json()["id"]))
        assert task is not None
        assert task.type == "electrical_variant_set"
        assert task.request_payload["electrical_variant_ids"] == requested
        assert task.progress_total == 2
        assert FakeTaskQueue.enqueued == [(str(task.id), "electrical_variant_set")]

    async def test_unknown_variant_is_rejected_without_partial_task(
        self,
        client: AsyncClient,
        guest_session: str,
        db_session: AsyncSession,
    ) -> None:
        project = await _project(client, guest_session)
        variants = await _variants(client, project["id"], guest_session)
        response = await client.post(
            f"/api/v1/projects/{project['id']}/electrical-variant-set-tasks",
            headers={"X-Session-Id": guest_session, "Idempotency-Key": "unknown-er"},
            json={"electrical_variant_ids": [variants[0]["id"], str(uuid4())]},
        )
        assert response.status_code == 404
        count = await db_session.scalar(select(func.count(BackgroundTask.id)))
        assert count == 0

    async def test_same_idempotency_key_with_different_order_conflicts(
        self,
        client: AsyncClient,
        guest_session: str,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        FakeTaskQueue.enqueued = []
        monkeypatch.setattr(
            "app.services.electrical_variant_set_task_service.TaskQueue", FakeTaskQueue
        )
        project = await _project(client, guest_session)
        variants = await _variants(client, project["id"], guest_session)
        ids = [variants[0]["id"], variants[1]["id"]]
        headers = {"X-Session-Id": guest_session, "Idempotency-Key": "ordered-replay"}
        first = await client.post(
            f"/api/v1/projects/{project['id']}/electrical-variant-set-tasks",
            headers=headers,
            json={"electrical_variant_ids": ids},
        )
        assert first.status_code == 202, first.text
        conflict = await client.post(
            f"/api/v1/projects/{project['id']}/electrical-variant-set-tasks",
            headers=headers,
            json={"electrical_variant_ids": list(reversed(ids))},
        )
        assert conflict.status_code == 409
        assert conflict.json()["detail"]["code"] == "ELECTRICAL_SET_IDEMPOTENCY_KEY_REUSED"

    async def test_same_idempotency_key_and_scope_replays_the_same_task(
        self,
        client: AsyncClient,
        guest_session: str,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        FakeTaskQueue.enqueued = []
        monkeypatch.setattr(
            "app.services.electrical_variant_set_task_service.TaskQueue", FakeTaskQueue
        )
        project = await _project(client, guest_session)
        variants = await _variants(client, project["id"], guest_session)
        headers = {"X-Session-Id": guest_session, "Idempotency-Key": "same-replay"}
        payload = {"electrical_variant_ids": [variants[0]["id"], variants[1]["id"]]}

        first = await client.post(
            f"/api/v1/projects/{project['id']}/electrical-variant-set-tasks",
            headers=headers,
            json=payload,
        )
        replay = await client.post(
            f"/api/v1/projects/{project['id']}/electrical-variant-set-tasks",
            headers=headers,
            json=payload,
        )

        assert first.status_code == replay.status_code == 202
        assert replay.json()["id"] == first.json()["id"]
        assert FakeTaskQueue.enqueued == [(first.json()["id"], "electrical_variant_set")]

    async def test_worker_runs_exact_scope_sequentially_without_adjacent_stages(
        self,
        client: AsyncClient,
        guest_session: str,
        db_session: AsyncSession,
        test_engine,
    ) -> None:
        project = await _project(client, guest_session)
        first, second = uuid4(), uuid4()
        task = BackgroundTask(
            type="electrical_variant_set",
            status="running",
            project_id=UUID(project["id"]),
            session_id=guest_session,
            request_payload={
                "payload_version": 1,
                "project_id": str(uuid4()),
                "electrical_variant_ids": [str(first), str(second)],
            },
            result_payload={"checkpoints": {"electrical": {}}},
            progress_current=0,
            progress_total=2,
            attempts=1,
            locked_by="worker-a",
        )
        # Keep task project and payload project identical; no project lookup is performed by
        # the orchestration test because the electrical stage is mocked.
        task.request_payload["project_id"] = str(task.project_id)
        db_session.add(task)
        await db_session.commit()
        service = ElectricalVariantSetTaskService(
            db_session,
            session_factory=async_sessionmaker(test_engine, expire_on_commit=False),
        )
        service._run_electrical = AsyncMock()  # type: ignore[method-assign]
        service._succeed = AsyncMock()  # type: ignore[method-assign]

        await service.run_claimed_task(task.id, attempt=1, worker_id="worker-a")

        assert service._run_electrical.await_args_list == [
            call(task.id, task.project_id, first, 1, "worker-a"),
            call(task.id, task.project_id, second, 1, "worker-a"),
        ]
        service._succeed.assert_awaited_once_with(task.id, 1, "worker-a")

    async def test_recovery_skips_persisted_checkpoint_and_keeps_request_order(
        self,
        client: AsyncClient,
        guest_session: str,
        db_session: AsyncSession,
        test_engine,
    ) -> None:
        project = await _project(client, guest_session)
        first, second = uuid4(), uuid4()
        task = BackgroundTask(
            type="electrical_variant_set",
            status="running",
            project_id=UUID(project["id"]),
            session_id=guest_session,
            request_payload={
                "payload_version": 1,
                "project_id": project["id"],
                "electrical_variant_ids": [str(first), str(second)],
            },
            result_payload={
                "checkpoints": {"electrical": {str(first): {"calculated": 1}}}
            },
            progress_current=1,
            progress_total=2,
            attempts=2,
            locked_by="worker-recovery",
        )
        db_session.add(task)
        await db_session.commit()
        service = ElectricalVariantSetTaskService(
            db_session,
            session_factory=async_sessionmaker(test_engine, expire_on_commit=False),
        )
        service._run_electrical = AsyncMock()  # type: ignore[method-assign]
        service._succeed = AsyncMock()  # type: ignore[method-assign]

        await service.run_claimed_task(task.id, attempt=2, worker_id="worker-recovery")

        service._run_electrical.assert_awaited_once_with(
            task.id, task.project_id, second, 2, "worker-recovery"
        )
        service._succeed.assert_awaited_once_with(task.id, 2, "worker-recovery")

    async def test_lost_fencing_token_cannot_publish_terminal_state(
        self,
        client: AsyncClient,
        guest_session: str,
        db_session: AsyncSession,
        test_engine,
    ) -> None:
        project = await _project(client, guest_session)
        variant_id = uuid4()
        task = BackgroundTask(
            type="electrical_variant_set",
            status="running",
            project_id=UUID(project["id"]),
            session_id=guest_session,
            request_payload={
                "payload_version": 1,
                "project_id": project["id"],
                "electrical_variant_ids": [str(variant_id)],
            },
            result_payload={"checkpoints": {"electrical": {}}},
            progress_current=0,
            progress_total=1,
            attempts=1,
            locked_by="worker-owner",
        )
        db_session.add(task)
        await db_session.commit()
        task_id = task.id
        service = ElectricalVariantSetTaskService(
            db_session,
            session_factory=async_sessionmaker(test_engine, expire_on_commit=False),
        )

        await service._terminal(task_id, 1, "worker-stale", "failed", "stale")

        db_session.expire_all()
        persisted = await db_session.get(BackgroundTask, task_id)
        audit_count = await db_session.scalar(
            select(func.count(AuditEvent.id)).where(AuditEvent.task_id == task_id)
        )
        assert persisted is not None
        assert persisted.status == "running"
        assert persisted.locked_by == "worker-owner"
        assert audit_count == 0

    async def test_success_audit_contains_exact_requested_and_completed_sets(
        self,
        client: AsyncClient,
        guest_session: str,
        db_session: AsyncSession,
        test_engine,
    ) -> None:
        project = await _project(client, guest_session)
        first, second = uuid4(), uuid4()
        requested = [str(first), str(second)]
        checkpoints = {str(first): {"calculated": 1}, str(second): {"calculated": 2}}
        task = BackgroundTask(
            type="electrical_variant_set",
            status="running",
            project_id=UUID(project["id"]),
            session_id=guest_session,
            request_payload={
                "payload_version": 1,
                "project_id": project["id"],
                "electrical_variant_ids": requested,
            },
            result_payload={"checkpoints": {"electrical": checkpoints}},
            progress_current=2,
            progress_total=2,
            attempts=1,
            locked_by="worker-audit",
        )
        db_session.add(task)
        await db_session.commit()
        service = ElectricalVariantSetTaskService(
            db_session,
            session_factory=async_sessionmaker(test_engine, expire_on_commit=False),
        )

        await service._succeed(task.id, 1, "worker-audit")

        event = await db_session.scalar(select(AuditEvent).where(AuditEvent.task_id == task.id))
        assert event is not None
        assert event.details["requested_electrical_variant_ids"] == requested
        assert event.details["completed_electrical_variant_ids"] == requested
        assert event.details["failed_electrical_variant_ids"] == []
        assert event.details["per_variant"] == checkpoints
