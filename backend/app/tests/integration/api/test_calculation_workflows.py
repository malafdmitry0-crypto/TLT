"""Integration contract for project-wide calculation workflow locking."""

import asyncio
import copy
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock
from uuid import UUID

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.dependencies import CurrentPrincipal
from app.models.background_task import BackgroundTask
from app.models.project_object import ProjectObject
from app.schemas.calculation_workflow import CalculationWorkflowStartRequest
from app.services.calculation_workflow_service import CalculationWorkflowService

pytestmark = pytest.mark.asyncio(loop_scope="session")


class FakeTaskQueue:
    enqueued: list[tuple[str, str]] = []

    async def enqueue(self, task_id, task_type: str) -> str:
        self.__class__.enqueued.append((str(task_id), task_type))
        return f"workflow-stream-{len(self.enqueued)}"


async def _project(client: AsyncClient, session_id: str) -> dict:
    response = await client.get(
        "/api/v1/projects",
        headers={"X-Session-Id": session_id},
    )
    assert response.status_code == 200, response.text
    return response.json()[0]


async def _variant(client: AsyncClient, project_id: str, session_id: str) -> dict:
    created = await client.post(
        f"/api/v1/projects/{project_id}/objects",
        headers={"X-Session-Id": session_id},
        json={
            "object_type": "pipe",
            "params": {
                "outer_diameter": 0.108,
                "wall_thickness": 0.004,
                "pipe_material": "carbon_steel",
                "insulation_layers": [{"thickness": 0.05, "material": "mineral_wool_boards_120"}],
                "insulation_temperature_basis": "outdoor_winter",
                "ambient_temperature": -20,
                "process_temperature": 80,
                "pipe_length": 25,
                "placement": "outdoor",
                "wind_speed": 0,
            },
        },
    )
    assert created.status_code in (200, 201), created.text
    response = await client.post(
        f"/api/v1/projects/{project_id}/electrical-variants/initialize",
        headers={"X-Session-Id": session_id},
    )
    assert response.status_code == 200, response.text
    return response.json()["variant"]


class TestCalculationWorkflows:
    async def test_worker_orchestration_does_not_mutate_saved_heat_results(
        self,
        client: AsyncClient,
        guest_session: str,
        db_session: AsyncSession,
        test_engine,
    ) -> None:
        project = await _project(client, guest_session)
        variant = await _variant(client, project["id"], guest_session)
        project_id = UUID(project["id"])
        project_object = await db_session.scalar(
            select(ProjectObject).where(ProjectObject.project_id == project_id)
        )
        assert project_object is not None
        assignments = await client.get(
            f"/api/v1/projects/{project['id']}/electrical-variants/{variant['id']}/assignments",
            headers={"X-Session-Id": guest_session},
        )
        assert assignments.status_code == 200, assignments.text
        assignment = next(
            item
            for item in assignments.json()["items"]
            if item["object_id"] == str(project_object.id)
        )
        assigned = await client.patch(
            f"/api/v1/projects/{project['id']}/electrical-variants/{variant['id']}/assignments",
            headers={"X-Session-Id": guest_session},
            json={
                "system_type": "self_regulating",
                "items": [
                    {
                        "object_id": str(project_object.id),
                        "expected_version": assignment["version"],
                    }
                ],
            },
        )
        assert assigned.status_code == 200, assigned.text
        heat_before = (
            copy.deepcopy(project_object.results),
            project_object.is_valid,
            copy.deepcopy(project_object.validation_errors),
        )
        task = BackgroundTask(
            type="project_pipeline",
            status="running",
            project_id=project_id,
            session_id=guest_session,
            request_payload={
                "payload_version": 1,
                "project_id": project["id"],
                "variant_ids": [variant["id"]],
                "options": {},
                "principal_role": "guest",
            },
            result_payload={"checkpoints": {"electrical": {}}},
            progress_current=0,
            progress_total=2,
            progress_phase="running",
            workflow_stage="running",
            attempts=1,
            locked_by="worker-a",
        )
        db_session.add(task)
        await db_session.commit()
        session_factory = async_sessionmaker(test_engine, expire_on_commit=False)
        service = CalculationWorkflowService(db_session, session_factory=session_factory)
        service._run_specification = AsyncMock()  # type: ignore[method-assign]

        await service.run_claimed_task(task.id, attempt=1, worker_id="worker-a")

        await db_session.refresh(project_object)
        assert (
            project_object.results,
            project_object.is_valid,
            project_object.validation_errors,
        ) == heat_before
        await db_session.refresh(task)
        electrical_checkpoint = task.result_payload["checkpoints"]["electrical"][variant["id"]]
        assert (electrical_checkpoint["calculated"] + electrical_checkpoint["skipped"]) == 1
        assert electrical_checkpoint["heat_loss_failed"] == 0
        service._run_specification.assert_awaited_once()

    async def test_global_operation_contract_covers_legacy_calculation_jobs(
        self,
        client: AsyncClient,
        guest_session: str,
        db_session: AsyncSession,
    ) -> None:
        project = await _project(client, guest_session)
        task = BackgroundTask(
            type="heat_loss_batch",
            status="enqueued",
            project_id=UUID(project["id"]),
            session_id=guest_session,
            request_payload={"project_id": project["id"]},
            progress_current=0,
            progress_phase="enqueued",
        )
        db_session.add(task)
        await db_session.commit()

        detail = await client.get(
            f"/api/v1/calculation-workflows/{task.id}",
            headers={"X-Session-Id": guest_session},
        )
        cancelled = await client.post(
            f"/api/v1/calculation-workflows/{task.id}/cancel",
            headers={"X-Session-Id": guest_session},
        )

        assert detail.status_code == 200, detail.text
        assert detail.json()["id"] == str(task.id)
        assert cancelled.status_code == 200, cancelled.text
        assert cancelled.json()["status"] == "cancelled"

    async def test_start_is_idempotent_and_blocks_project_writes(
        self,
        client: AsyncClient,
        guest_session: str,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        FakeTaskQueue.enqueued = []
        monkeypatch.setattr(
            "app.services.calculation_workflow_service.TaskQueue",
            FakeTaskQueue,
        )
        project = await _project(client, guest_session)
        variant = await _variant(client, project["id"], guest_session)
        headers = {
            "X-Session-Id": guest_session,
            "Idempotency-Key": "workflow-click-1",
        }
        payload = {"variant_ids": [variant["id"]]}

        first = await client.post(
            f"/api/v1/projects/{project['id']}/calculation-workflows",
            headers=headers,
            json=payload,
        )
        replay = await client.post(
            f"/api/v1/projects/{project['id']}/calculation-workflows",
            headers=headers,
            json=payload,
        )

        assert first.status_code == 202, first.text
        assert replay.status_code == 202, replay.text
        assert replay.json()["id"] == first.json()["id"]
        assert first.json()["status"] == "enqueued"
        assert first.json()["variant_ids"] == [variant["id"]]
        assert first.json()["progress"] == {"current": 0, "total": 2, "percent": 0.0}

        blocked = await client.post(
            f"/api/v1/projects/{project['id']}/objects",
            headers={"X-Session-Id": guest_session},
            json={"object_type": "pipe", "params": {}},
        )
        assert blocked.status_code == 423, blocked.text
        assert blocked.headers["retry-after"] == "2"
        assert blocked.json()["detail"]["code"] == "PROJECT_CALCULATION_BUSY"
        assert blocked.json()["detail"]["operation_id"] == first.json()["id"]

        renamed = await client.put(
            f"/api/v1/projects/{project['id']}",
            headers={"X-Session-Id": guest_session},
            json={"name": "Must stay locked"},
        )
        assert renamed.status_code == 423, renamed.text
        deleted = await client.delete(
            f"/api/v1/projects/{project['id']}",
            headers={"X-Session-Id": guest_session},
        )
        assert deleted.status_code == 423, deleted.text

        active = await client.get(
            f"/api/v1/projects/{project['id']}/calculation-workflows/active",
            headers={"X-Session-Id": guest_session},
        )
        assert active.status_code == 200, active.text
        assert active.json()["id"] == first.json()["id"]

        cancelled = await client.post(
            f"/api/v1/calculation-workflows/{first.json()['id']}/cancel",
            headers={"X-Session-Id": guest_session},
        )
        assert cancelled.status_code == 200, cancelled.text
        assert cancelled.json()["status"] == "cancelled"

    async def test_concurrent_idempotent_start_returns_one_workflow(
        self,
        client: AsyncClient,
        guest_session: str,
        db_session: AsyncSession,
        test_engine,
    ) -> None:
        FakeTaskQueue.enqueued = []
        project = await _project(client, guest_session)
        variant = await _variant(client, project["id"], guest_session)
        await db_session.rollback()
        session_factory = async_sessionmaker(test_engine, expire_on_commit=False)
        request = CalculationWorkflowStartRequest(variant_ids=[UUID(variant["id"])])
        principal = CurrentPrincipal(role="guest", session_id=guest_session)

        async def create_workflow() -> BackgroundTask:
            async with session_factory() as session:
                return await CalculationWorkflowService(session).create(
                    UUID(project["id"]),
                    request,
                    principal,
                    idempotency_key="workflow-concurrent-click-1",
                    queue=FakeTaskQueue(),
                )

        tasks = await asyncio.gather(*(create_workflow() for _ in range(5)))

        task_ids = {task.id for task in tasks}
        assert len(task_ids) == 1
        await db_session.rollback()
        persisted = await db_session.scalar(
            select(func.count(BackgroundTask.id)).where(
                BackgroundTask.idempotency_key.is_not(None),
                BackgroundTask.project_id == UUID(project["id"]),
            )
        )
        await db_session.rollback()
        assert persisted == 1
        assert len(FakeTaskQueue.enqueued) == 1

    async def test_expired_waiting_input_releases_project(
        self,
        client: AsyncClient,
        guest_session: str,
        db_session: AsyncSession,
    ) -> None:
        project = await _project(client, guest_session)
        variant = await _variant(client, project["id"], guest_session)
        task = BackgroundTask(
            type="project_pipeline",
            status="waiting_input",
            project_id=UUID(project["id"]),
            session_id=guest_session,
            request_payload={
                "payload_version": 1,
                "project_id": project["id"],
                "variant_ids": [variant["id"]],
                "options": {},
                "principal_role": "guest",
            },
            result_payload={"checkpoints": {"electrical": {}}},
            progress_phase="waiting_input",
            workflow_stage="waiting_input",
            interaction_deadline_at=datetime.now(UTC) - timedelta(seconds=1),
        )
        db_session.add(task)
        await db_session.commit()

        active = await client.get(
            f"/api/v1/projects/{project['id']}/calculation-workflows/active",
            headers={"X-Session-Id": guest_session},
        )

        assert active.status_code == 200, active.text
        assert active.json() is None
        await db_session.refresh(task)
        assert task.status == "timed_out"

    async def test_resume_is_idempotent_and_keeps_the_same_workflow(
        self,
        client: AsyncClient,
        guest_session: str,
        db_session: AsyncSession,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        FakeTaskQueue.enqueued = []
        monkeypatch.setattr(
            "app.services.calculation_workflow_service.TaskQueue",
            FakeTaskQueue,
        )
        project = await _project(client, guest_session)
        variant = await _variant(client, project["id"], guest_session)
        task = BackgroundTask(
            type="project_pipeline",
            status="waiting_input",
            project_id=UUID(project["id"]),
            session_id=guest_session,
            request_payload={
                "payload_version": 1,
                "project_id": project["id"],
                "variant_ids": [variant["id"]],
                "options": {},
                "principal_role": "guest",
            },
            result_payload={"checkpoints": {"electrical": {}}},
            progress_current=1,
            progress_total=2,
            progress_phase="waiting_input",
            workflow_stage="waiting_input",
            workflow_version=2,
            interaction_deadline_at=datetime.now(UTC) + timedelta(minutes=5),
        )
        db_session.add(task)
        await db_session.commit()
        headers = {
            "X-Session-Id": guest_session,
            "Idempotency-Key": "resume-click-1",
        }
        payload = {
            "expected_workflow_version": 2,
            "exclude_unassigned_confirmed": True,
            "catalog_selections": {},
        }

        first = await client.post(
            f"/api/v1/calculation-workflows/{task.id}/resume",
            headers=headers,
            json=payload,
        )
        replay = await client.post(
            f"/api/v1/calculation-workflows/{task.id}/resume",
            headers=headers,
            json=payload,
        )

        assert first.status_code == 202, first.text
        assert replay.status_code == 202, replay.text
        assert replay.json()["id"] == first.json()["id"]
        assert replay.json()["workflow_version"] == 3
        assert replay.json()["progress"] == {"current": 1, "total": 2, "percent": 50.0}
        assert len(FakeTaskQueue.enqueued) == 1

    async def test_retry_resets_electrical_only_progress_and_checkpoints(
        self,
        client: AsyncClient,
        guest_session: str,
        db_session: AsyncSession,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        FakeTaskQueue.enqueued = []
        monkeypatch.setattr(
            "app.services.calculation_workflow_service.TaskQueue",
            FakeTaskQueue,
        )
        project = await _project(client, guest_session)
        variant = await _variant(client, project["id"], guest_session)
        task = BackgroundTask(
            type="project_pipeline",
            status="failed",
            project_id=UUID(project["id"]),
            session_id=guest_session,
            request_payload={
                "payload_version": 1,
                "project_id": project["id"],
                "variant_ids": [variant["id"]],
                "options": {},
                "principal_role": "guest",
            },
            result_payload={
                "checkpoints": {
                    "electrical": {variant["id"]: {"calculated": 1}},
                    "specification": {"status": "partial"},
                }
            },
            progress_current=1,
            progress_total=2,
            progress_phase="failed",
            workflow_stage="failed",
            workflow_version=4,
            error_message="later stage failed",
            finished_at=datetime.now(UTC),
        )
        db_session.add(task)
        await db_session.commit()

        response = await client.post(
            f"/api/v1/calculation-workflows/{task.id}/retry",
            headers={
                "X-Session-Id": guest_session,
                "Idempotency-Key": "retry-click-1",
            },
            json={"expected_workflow_version": 4},
        )

        assert response.status_code == 202, response.text
        assert response.json()["progress"] == {"current": 0, "total": 2, "percent": 0.0}
        await db_session.refresh(task)
        assert task.result_payload == {"checkpoints": {"electrical": {}}}
        assert task.workflow_version == 5
        assert len(FakeTaskQueue.enqueued) == 1
