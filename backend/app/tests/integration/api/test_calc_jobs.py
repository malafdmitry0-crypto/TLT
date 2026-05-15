"""Integration tests for asynchronous calculation tasks."""

from uuid import UUID

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.services.task_service import TaskService

pytestmark = pytest.mark.asyncio(loop_scope="session")


class FakeTaskQueue:
    enqueued: list[tuple[str, str]] = []

    async def enqueue(self, task_id, task_type: str) -> str:
        self.__class__.enqueued.append((str(task_id), task_type))
        return f"stream-{len(self.enqueued)}"


async def _guest_project(client: AsyncClient, session_id: str) -> dict:
    resp = await client.get("/api/v1/projects", headers={"X-Session-Id": session_id})
    assert resp.status_code == 200, resp.text
    return resp.json()[0]


async def _create_pipe(client: AsyncClient, project_id: str, session_id: str) -> dict:
    resp = await client.post(
        f"/api/v1/projects/{project_id}/objects",
        json={
            "object_type": "pipe",
            "params": {
                "outer_diameter": 0.108,
                "insulation_thickness": 0.05,
                "insulation_material": "mineral_wool",
                "ambient_temperature": -20,
                "process_temperature": 80,
                "pipe_length": 25,
            },
        },
        headers={"X-Session-Id": session_id},
    )
    assert resp.status_code in (200, 201), resp.text
    return resp.json()


class TestCalcJobs:
    async def test_enqueue_status_and_idempotency(
        self, client: AsyncClient, guest_session: str, monkeypatch: pytest.MonkeyPatch
    ):
        monkeypatch.setattr("app.services.task_service.TaskQueue", FakeTaskQueue)
        project = await _guest_project(client, guest_session)
        payload = {"project_id": project["id"], "variant_number": 1}
        headers = {"X-Session-Id": guest_session, "Idempotency-Key": "same-click"}

        first = await client.post(
            "/api/v1/calc/electrical/batch/jobs",
            json=payload,
            headers=headers,
        )
        second = await client.post(
            "/api/v1/calc/electrical/batch/jobs",
            json=payload,
            headers=headers,
        )

        assert first.status_code == 202, first.text
        assert second.status_code == 202, second.text
        assert first.json()["id"] == second.json()["id"]
        assert first.json()["status"] == "enqueued"

        status_resp = await client.get(
            f"/api/v1/calc/jobs/{first.json()['id']}",
            headers={"X-Session-Id": guest_session},
        )
        assert status_resp.status_code == 200, status_resp.text
        assert status_resp.json()["links"]["cancel"].endswith("/cancel")

    async def test_cancel_enqueued_task(
        self, client: AsyncClient, guest_session: str, monkeypatch: pytest.MonkeyPatch
    ):
        monkeypatch.setattr("app.services.task_service.TaskQueue", FakeTaskQueue)
        project = await _guest_project(client, guest_session)
        job = (
            await client.post(
                "/api/v1/calc/electrical/batch/jobs",
                json={"project_id": project["id"]},
                headers={"X-Session-Id": guest_session},
            )
        ).json()

        cancel_resp = await client.post(
            f"/api/v1/calc/jobs/{job['id']}/cancel",
            headers={"X-Session-Id": guest_session},
        )

        assert cancel_resp.status_code == 200, cancel_resp.text
        assert cancel_resp.json()["status"] == "cancelled"
        assert cancel_resp.json()["cancel_requested"] is True

    async def test_enqueue_heat_loss_batch_job(
        self, client: AsyncClient, guest_session: str, monkeypatch: pytest.MonkeyPatch
    ):
        monkeypatch.setattr("app.services.task_service.TaskQueue", FakeTaskQueue)
        project = await _guest_project(client, guest_session)
        payload = {"project_id": project["id"], "include_errors": False}
        headers = {"X-Session-Id": guest_session, "Idempotency-Key": "same-heat-click"}

        first = await client.post(
            "/api/v1/calc/heat-loss/batch/jobs",
            json=payload,
            headers=headers,
        )
        second = await client.post(
            "/api/v1/calc/heat-loss/batch/jobs",
            json=payload,
            headers=headers,
        )

        assert first.status_code == 202, first.text
        assert second.status_code == 202, second.text
        assert first.json()["id"] == second.json()["id"]
        assert first.json()["type"] == "heat_loss_batch"
        assert first.json()["status"] == "enqueued"

    async def test_worker_executes_enqueued_electrical_batch(
        self,
        client: AsyncClient,
        guest_session: str,
        test_engine,
        monkeypatch: pytest.MonkeyPatch,
    ):
        monkeypatch.setattr("app.services.task_service.TaskQueue", FakeTaskQueue)
        project = await _guest_project(client, guest_session)
        await _create_pipe(client, project["id"], guest_session)
        job_resp = await client.post(
            "/api/v1/calc/electrical/batch/jobs",
            json={"project_id": project["id"], "include_results": False},
            headers={"X-Session-Id": guest_session},
        )
        assert job_resp.status_code == 202, job_resp.text
        task_id = UUID(job_resp.json()["id"])

        session_factory = async_sessionmaker(test_engine, expire_on_commit=False)
        async with session_factory() as worker_db:
            await TaskService(worker_db, session_factory=session_factory).run_task(
                task_id,
                worker_id="test-worker",
            )

        status_resp = await client.get(
            f"/api/v1/calc/jobs/{task_id}",
            headers={"X-Session-Id": guest_session},
        )
        assert status_resp.status_code == 200, status_resp.text
        body = status_resp.json()
        assert body["status"] == "succeeded"
        assert body["result"]["calculated"] == 1

        result_resp = await client.get(
            f"/api/v1/calc/jobs/{task_id}/result",
            headers={"X-Session-Id": guest_session},
        )
        assert result_resp.status_code == 200, result_resp.text
        assert result_resp.json()["calculated"] == 1

    async def test_worker_executes_selected_electrical_batch(
        self,
        client: AsyncClient,
        guest_session: str,
        test_engine,
        monkeypatch: pytest.MonkeyPatch,
    ):
        monkeypatch.setattr("app.services.task_service.TaskQueue", FakeTaskQueue)
        project = await _guest_project(client, guest_session)
        selected = await _create_pipe(client, project["id"], guest_session)
        skipped = await _create_pipe(client, project["id"], guest_session)
        job_resp = await client.post(
            "/api/v1/calc/electrical/batch/jobs",
            json={
                "project_id": project["id"],
                "object_ids": [selected["id"]],
                "object_overrides": [{"object_id": selected["id"], "cable_type": "single_core"}],
                "connection_type": "line_1ph",
                "include_results": False,
            },
            headers={"X-Session-Id": guest_session},
        )
        assert job_resp.status_code == 202, job_resp.text
        task_id = UUID(job_resp.json()["id"])

        session_factory = async_sessionmaker(test_engine, expire_on_commit=False)
        async with session_factory() as worker_db:
            await TaskService(worker_db, session_factory=session_factory).run_task(
                task_id,
                worker_id="test-worker",
            )

        status_resp = await client.get(
            f"/api/v1/calc/jobs/{task_id}",
            headers={"X-Session-Id": guest_session},
        )
        assert status_resp.status_code == 200, status_resp.text
        body = status_resp.json()
        assert body["status"] == "succeeded"
        assert body["result"]["scope"] == "selected"
        assert body["result"]["calculated"] == 1

        listing_resp = await client.get(
            "/api/v1/calc/electrical",
            params={"project_id": project["id"]},
            headers={"X-Session-Id": guest_session},
        )
        assert listing_resp.status_code == 200, listing_resp.text
        calculations = listing_resp.json()
        calculation_object_ids = {item["object_id"] for item in calculations}
        assert selected["id"] in calculation_object_ids
        assert skipped["id"] not in calculation_object_ids
        selected_calc = next(item for item in calculations if item["object_id"] == selected["id"])
        assert selected_calc["cable_type"] == "single_core"
        assert selected_calc["cable_type_source"] == "manual"
        assert selected_calc["cable_mark_source"] == "auto"

    async def test_worker_force_cable_type_replaces_existing_types_for_all(
        self,
        client: AsyncClient,
        guest_session: str,
        test_engine,
        monkeypatch: pytest.MonkeyPatch,
    ):
        monkeypatch.setattr("app.services.task_service.TaskQueue", FakeTaskQueue)
        project = await _guest_project(client, guest_session)
        first = await _create_pipe(client, project["id"], guest_session)
        second = await _create_pipe(client, project["id"], guest_session)

        selected_resp = await client.post(
            "/api/v1/calc/electrical/batch/jobs",
            json={
                "project_id": project["id"],
                "object_ids": [first["id"]],
                "object_overrides": [{"object_id": first["id"], "cable_type": "single_core"}],
                "connection_type": "line_1ph",
                "include_results": False,
            },
            headers={"X-Session-Id": guest_session},
        )
        assert selected_resp.status_code == 202, selected_resp.text

        session_factory = async_sessionmaker(test_engine, expire_on_commit=False)
        async with session_factory() as worker_db:
            await TaskService(worker_db, session_factory=session_factory).run_task(
                UUID(selected_resp.json()["id"]),
                worker_id="test-worker",
            )

        force_resp = await client.post(
            "/api/v1/calc/electrical/batch/jobs",
            json={
                "project_id": project["id"],
                "cable_type": "self_regulating",
                "force_cable_type": True,
                "include_results": False,
            },
            headers={"X-Session-Id": guest_session},
        )
        assert force_resp.status_code == 202, force_resp.text
        task_id = UUID(force_resp.json()["id"])

        async with session_factory() as worker_db:
            await TaskService(worker_db, session_factory=session_factory).run_task(
                task_id,
                worker_id="test-worker",
            )

        status_resp = await client.get(
            f"/api/v1/calc/jobs/{task_id}",
            headers={"X-Session-Id": guest_session},
        )
        assert status_resp.status_code == 200, status_resp.text
        body = status_resp.json()
        assert body["status"] == "succeeded"
        assert body["result"]["scope"] == "all"
        assert body["result"]["calculated"] >= 2

        listing_resp = await client.get(
            "/api/v1/calc/electrical",
            params={"project_id": project["id"]},
            headers={"X-Session-Id": guest_session},
        )
        assert listing_resp.status_code == 200, listing_resp.text
        calculations = {
            item["object_id"]: item
            for item in listing_resp.json()
            if item["object_id"] in {first["id"], second["id"]}
        }
        assert calculations[first["id"]]["cable_type"] == "self_regulating"
        assert calculations[second["id"]]["cable_type"] == "self_regulating"
        assert calculations[first["id"]]["cable_type_source"] == "bulk"
        assert calculations[second["id"]]["cable_type_source"] == "bulk"
        assert calculations[first["id"]]["cable_mark_source"] == "auto"
        assert calculations[second["id"]]["cable_mark_source"] == "auto"

    async def test_worker_executes_enqueued_heat_loss_batch(
        self,
        client: AsyncClient,
        guest_session: str,
        test_engine,
        monkeypatch: pytest.MonkeyPatch,
    ):
        monkeypatch.setattr("app.services.task_service.TaskQueue", FakeTaskQueue)
        project = await _guest_project(client, guest_session)
        await _create_pipe(client, project["id"], guest_session)
        job_resp = await client.post(
            "/api/v1/calc/heat-loss/batch/jobs",
            json={"project_id": project["id"], "include_errors": True},
            headers={"X-Session-Id": guest_session},
        )
        assert job_resp.status_code == 202, job_resp.text
        task_id = UUID(job_resp.json()["id"])

        session_factory = async_sessionmaker(test_engine, expire_on_commit=False)
        async with session_factory() as worker_db:
            await TaskService(worker_db, session_factory=session_factory).run_task(
                task_id,
                worker_id="test-worker",
            )

        status_resp = await client.get(
            f"/api/v1/calc/jobs/{task_id}",
            headers={"X-Session-Id": guest_session},
        )
        assert status_resp.status_code == 200, status_resp.text
        body = status_resp.json()
        assert body["status"] == "succeeded"
        assert body["result"]["updated"] == 1
        assert body["result"]["failed"] == 0

        result_resp = await client.get(
            f"/api/v1/calc/jobs/{task_id}/result",
            headers={"X-Session-Id": guest_session},
        )
        assert result_resp.status_code == 200, result_resp.text
        assert result_resp.json()["updated"] == 1
