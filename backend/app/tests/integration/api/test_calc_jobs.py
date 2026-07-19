"""Integration tests for asynchronous calculation tasks."""

import asyncio
from uuid import UUID

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.dependencies import CurrentPrincipal
from app.models.audit_event import AuditEvent
from app.models.background_task import BackgroundTask
from app.models.project import Project
from app.schemas.calculation import HeatLossBatchJobRequest
from app.services.task_service import TASK_HEAT_LOSS_BATCH, TaskService

pytestmark = pytest.mark.asyncio(loop_scope="session")

MINERAL_WOOL = "mineral_wool_boards_120"


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
                "insulation_material": MINERAL_WOOL,
                "insulation_temperature_basis": "outdoor_winter",
                "ambient_temperature": -20,
                "process_temperature": 80,
                "pipe_length": 25,
            },
        },
        headers={"X-Session-Id": session_id},
    )
    assert resp.status_code in (200, 201), resp.text
    return resp.json()


async def _initialize_electrical_variants(
    client: AsyncClient,
    project_id: str,
    session_id: str,
) -> dict:
    resp = await client.post(
        f"/api/v1/projects/{project_id}/electrical-variants/initialize",
        headers={"X-Session-Id": session_id},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["project_id"] == project_id
    assert body["variant"]["legacy_variant_number"] == 1
    return body["variant"]


async def _assign_electrical_objects(
    client: AsyncClient,
    project_id: str,
    session_id: str,
    variant: dict,
    object_ids: list[str],
    *,
    system_type: str = "self_regulating",
) -> None:
    headers = {"X-Session-Id": session_id}
    assignments = await client.get(
        f"/api/v1/projects/{project_id}/electrical-variants/{variant['id']}/assignments",
        headers=headers,
    )
    assert assignments.status_code == 200, assignments.text
    by_object_id = {item["object_id"]: item for item in assignments.json()["items"]}
    response = await client.patch(
        f"/api/v1/projects/{project_id}/electrical-variants/{variant['id']}/assignments",
        headers=headers,
        json={
            "system_type": system_type,
            "items": [
                {
                    "object_id": object_id,
                    "expected_version": by_object_id[object_id]["version"],
                }
                for object_id in object_ids
            ],
        },
    )
    assert response.status_code == 200, response.text


class TestCalcJobs:
    async def test_first_legacy_numeric_one_enqueue_initializes_er1_then_requires_assignment(
        self,
        client: AsyncClient,
        guest_session: str,
        monkeypatch: pytest.MonkeyPatch,
    ):
        monkeypatch.setattr("app.services.task_service.TaskQueue", FakeTaskQueue)
        project = await _guest_project(client, guest_session)
        await _create_pipe(client, project["id"], guest_session)

        response = await client.post(
            "/api/v1/calc/electrical/batch/jobs",
            json={"project_id": project["id"], "variant_number": 1},
            headers={"X-Session-Id": guest_session},
        )

        assert response.status_code == 409, response.text
        assert response.json()["detail"]["code"] == "ELECTRICAL_ASSIGNMENT_REQUIRED"
        variants = await client.get(
            f"/api/v1/projects/{project['id']}/electrical-variants",
            headers={"X-Session-Id": guest_session},
        )
        assert variants.status_code == 200, variants.text
        assert [item["legacy_variant_number"] for item in variants.json()] == [1]
        assert variants.json()[0]["is_active"] is True

    async def test_first_legacy_numeric_four_enqueue_creates_sparse_er_then_requires_assignment(
        self,
        client: AsyncClient,
        guest_session: str,
        monkeypatch: pytest.MonkeyPatch,
    ):
        monkeypatch.setattr("app.services.task_service.TaskQueue", FakeTaskQueue)
        project = await _guest_project(client, guest_session)
        await _create_pipe(client, project["id"], guest_session)

        response = await client.post(
            "/api/v1/calc/electrical/batch/jobs",
            json={"project_id": project["id"], "variant_number": 4},
            headers={"X-Session-Id": guest_session},
        )

        assert response.status_code == 409, response.text
        assert response.json()["detail"]["code"] == "ELECTRICAL_ASSIGNMENT_REQUIRED"
        variants = await client.get(
            f"/api/v1/projects/{project['id']}/electrical-variants",
            headers={"X-Session-Id": guest_session},
        )
        assert variants.status_code == 200, variants.text
        body = variants.json()
        assert [item["legacy_variant_number"] for item in body] == [1, 4]

    async def test_first_legacy_numeric_enqueue_returns_structured_readiness_error(
        self,
        client: AsyncClient,
        guest_session: str,
        monkeypatch: pytest.MonkeyPatch,
    ):
        monkeypatch.setattr("app.services.task_service.TaskQueue", FakeTaskQueue)
        project = await _guest_project(client, guest_session)

        response = await client.post(
            "/api/v1/calc/electrical/batch/jobs",
            json={"project_id": project["id"], "variant_number": 1},
            headers={"X-Session-Id": guest_session},
        )

        assert response.status_code == 409, response.text
        assert response.json()["detail"]["code"] == "ELECTRICAL_READINESS_FAILED"
        assert response.json()["detail"]["issues"]

    async def test_enqueue_rejects_ambiguous_uuid_and_legacy_number(
        self,
        client: AsyncClient,
        guest_session: str,
    ):
        project = await _guest_project(client, guest_session)

        response = await client.post(
            "/api/v1/calc/electrical/batch/jobs",
            json={
                "project_id": project["id"],
                "electrical_variant_id": "00000000-0000-0000-0000-000000000001",
                "variant_number": 1,
            },
            headers={"X-Session-Id": guest_session},
        )

        assert response.status_code == 422, response.text
        assert "ELECTRICAL_VARIANT_SELECTOR_CONFLICT" in response.text

    async def test_enqueue_rejects_explicit_null_variant_selector(
        self,
        client: AsyncClient,
        guest_session: str,
    ):
        project = await _guest_project(client, guest_session)

        response = await client.post(
            "/api/v1/calc/electrical/batch/jobs",
            json={"project_id": project["id"], "variant_number": None},
            headers={"X-Session-Id": guest_session},
        )

        assert response.status_code == 422, response.text
        assert "ELECTRICAL_VARIANT_SELECTOR_REQUIRED" in response.text
        variants = await client.get(
            f"/api/v1/projects/{project['id']}/electrical-variants",
            headers={"X-Session-Id": guest_session},
        )
        assert variants.status_code == 200, variants.text
        assert variants.json() == []

    async def test_enqueue_status_and_idempotency(
        self,
        client: AsyncClient,
        guest_session: str,
        db_session: AsyncSession,
        monkeypatch: pytest.MonkeyPatch,
    ):
        monkeypatch.setattr("app.services.task_service.TaskQueue", FakeTaskQueue)
        project = await _guest_project(client, guest_session)
        obj = await _create_pipe(client, project["id"], guest_session)
        variant = await _initialize_electrical_variants(client, project["id"], guest_session)
        await _assign_electrical_objects(
            client,
            project["id"],
            guest_session,
            variant,
            [obj["id"]],
        )
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

        persisted = await db_session.get(BackgroundTask, UUID(first.json()["id"]))
        assert persisted is not None
        persisted.status = "succeeded"
        await db_session.commit()
        terminal_retry = await client.post(
            "/api/v1/calc/electrical/batch/jobs",
            json=payload,
            headers=headers,
        )
        assert terminal_retry.status_code == 202, terminal_retry.text
        assert terminal_retry.json()["id"] == first.json()["id"]
        assert terminal_retry.json()["status"] == "succeeded"

        terminal_replay_audit = await db_session.scalar(
            select(AuditEvent).where(
                AuditEvent.event_type == "task.electrical_batch.idempotency_replayed",
                AuditEvent.task_id == UUID(first.json()["id"]),
                AuditEvent.result == "success",
            )
        )
        assert terminal_replay_audit is not None
        assert terminal_replay_audit.message == (
            "Идемпотентный повтор вернул существующую задачу электрорасчёта"
        )
        assert terminal_replay_audit.details["idempotency_replay"] is True
        assert terminal_replay_audit.details["task_status"] == "succeeded"

    async def test_project_scoped_idempotency_key_rejects_different_er_or_payload(
        self,
        client: AsyncClient,
        guest_session: str,
        monkeypatch: pytest.MonkeyPatch,
    ):
        monkeypatch.setattr("app.services.task_service.TaskQueue", FakeTaskQueue)
        project = await _guest_project(client, guest_session)
        obj = await _create_pipe(client, project["id"], guest_session)
        first_variant = await _initialize_electrical_variants(
            client,
            project["id"],
            guest_session,
        )
        second_variant_response = await client.post(
            f"/api/v1/projects/{project['id']}/electrical-variants",
            json={"name": "ЭР2"},
            headers={"X-Session-Id": guest_session},
        )
        assert second_variant_response.status_code == 201, second_variant_response.text
        second_variant = second_variant_response.json()
        for variant in (first_variant, second_variant):
            await _assign_electrical_objects(
                client,
                project["id"],
                guest_session,
                variant,
                [obj["id"]],
            )
        headers = {
            "X-Session-Id": guest_session,
            "Idempotency-Key": "electrical-one-key-one-operation",
        }
        first_payload = {
            "project_id": project["id"],
            "electrical_variant_id": first_variant["id"],
        }

        first = await client.post(
            "/api/v1/calc/electrical/batch/jobs",
            json=first_payload,
            headers=headers,
        )
        retry = await client.post(
            "/api/v1/calc/electrical/batch/jobs",
            json=first_payload,
            headers=headers,
        )
        different_er = await client.post(
            "/api/v1/calc/electrical/batch/jobs",
            json={
                "project_id": project["id"],
                "electrical_variant_id": second_variant["id"],
            },
            headers=headers,
        )
        different_payload = await client.post(
            "/api/v1/calc/electrical/batch/jobs",
            json={**first_payload, "skip_manual": False},
            headers=headers,
        )

        assert first.status_code == 202, first.text
        assert retry.status_code == 202, retry.text
        assert retry.json()["id"] == first.json()["id"]
        for conflict in (different_er, different_payload):
            assert conflict.status_code == 409, conflict.text
            assert conflict.json()["detail"] == {
                "code": "TASK_IDEMPOTENCY_KEY_REUSED",
                "message": "Idempotency-Key уже использован для другой операции",
            }

    async def test_cancel_enqueued_task(
        self, client: AsyncClient, guest_session: str, monkeypatch: pytest.MonkeyPatch
    ):
        monkeypatch.setattr("app.services.task_service.TaskQueue", FakeTaskQueue)
        project = await _guest_project(client, guest_session)
        obj = await _create_pipe(client, project["id"], guest_session)
        variant = await _initialize_electrical_variants(client, project["id"], guest_session)
        await _assign_electrical_objects(
            client,
            project["id"],
            guest_session,
            variant,
            [obj["id"]],
        )
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
        self,
        client: AsyncClient,
        guest_session: str,
        db_session: AsyncSession,
        monkeypatch: pytest.MonkeyPatch,
    ):
        monkeypatch.setattr("app.services.task_service.TaskQueue", FakeTaskQueue)
        project = await _guest_project(client, guest_session)
        obj = await _create_pipe(client, project["id"], guest_session)
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

        changed_include_errors = await client.post(
            "/api/v1/calc/heat-loss/batch/jobs",
            json={"project_id": project["id"], "include_errors": True},
            headers=headers,
        )
        changed_object_ids = await client.post(
            "/api/v1/calc/heat-loss/batch/jobs",
            json={**payload, "object_ids": [obj["id"]]},
            headers=headers,
        )
        for conflict in (changed_include_errors, changed_object_ids):
            assert conflict.status_code == 409, conflict.text
            assert conflict.json()["detail"]["code"] == "TASK_IDEMPOTENCY_KEY_REUSED"

        persisted = await db_session.get(BackgroundTask, UUID(first.json()["id"]))
        assert persisted is not None
        persisted.status = "succeeded"
        await db_session.commit()
        terminal_retry = await client.post(
            "/api/v1/calc/heat-loss/batch/jobs",
            json=payload,
            headers=headers,
        )
        assert terminal_retry.status_code == 202, terminal_retry.text
        assert terminal_retry.json()["id"] == first.json()["id"]
        assert terminal_retry.json()["status"] == "succeeded"
        assert "payload_version" not in persisted.request_payload

        terminal_replay_audit = await db_session.scalar(
            select(AuditEvent).where(
                AuditEvent.event_type == "task.heat_loss_batch.idempotency_replayed",
                AuditEvent.task_id == UUID(first.json()["id"]),
                AuditEvent.result == "success",
            )
        )
        assert terminal_replay_audit is not None
        assert terminal_replay_audit.message == (
            "Идемпотентный повтор вернул существующую задачу пересчёта теплопотерь"
        )
        assert terminal_replay_audit.details["idempotency_replay"] is True
        assert terminal_replay_audit.details["task_status"] == "succeeded"

    async def test_heat_loss_explicit_key_is_serialized_across_terminal_transition(
        self,
        client: AsyncClient,
        guest_session: str,
        test_engine,
    ):
        project = await _guest_project(client, guest_session)
        project_id = UUID(project["id"])
        request = HeatLossBatchJobRequest(project_id=project_id, include_errors=False)
        principal = CurrentPrincipal(role="guest", session_id=guest_session)
        idempotency_key = "heat-two-session-terminal-race"
        payload = TaskService._heat_loss_payload(request)
        dedupe_key = TaskService._dedupe_key(
            task_type=TASK_HEAT_LOSS_BATCH,
            project_id=project_id,
            principal=principal,
            payload=payload,
            idempotency_key=idempotency_key,
        )
        session_factory = async_sessionmaker(test_engine, expire_on_commit=False)
        access_checked = asyncio.Event()
        lookup_finished = asyncio.Event()
        resume_retry = asyncio.Event()

        async with session_factory() as first_db, session_factory() as retry_db:
            await first_db.execute(
                select(Project).where(Project.id == project_id).with_for_update()
            )

            retry_service = TaskService(retry_db, session_factory=session_factory)
            original_require_project_write = retry_service._require_project_write
            original_find = retry_service._find_active_by_dedupe

            async def require_then_signal(project_id_arg, principal_arg):
                await original_require_project_write(project_id_arg, principal_arg)
                access_checked.set()

            async def pause_after_lookup(*args, **kwargs):
                found = await original_find(*args, **kwargs)
                lookup_finished.set()
                await resume_retry.wait()
                return found

            retry_service._require_project_write = require_then_signal  # type: ignore[method-assign]
            retry_service._find_active_by_dedupe = pause_after_lookup  # type: ignore[method-assign]
            retry_create = asyncio.create_task(
                retry_service.create_heat_loss_batch_task(
                    request,
                    principal,
                    queue=FakeTaskQueue(),
                    idempotency_key=idempotency_key,
                )
            )

            await asyncio.wait_for(access_checked.wait(), timeout=3)
            lookup_bypassed_project_lock = False
            try:
                await asyncio.wait_for(
                    asyncio.shield(lookup_finished.wait()),
                    timeout=0.2,
                )
            except TimeoutError:
                pass
            else:
                lookup_bypassed_project_lock = True

            terminal_binding = BackgroundTask(
                type=TASK_HEAT_LOSS_BATCH,
                status="enqueued",
                project_id=project_id,
                session_id=guest_session,
                request_payload=payload,
                progress_current=0,
                progress_phase="enqueued",
                idempotency_key=dedupe_key,
                cancel_requested=False,
                attempts=0,
                enqueue_attempts=1,
            )
            first_db.add(terminal_binding)
            await first_db.flush()
            terminal_binding.status = "succeeded"
            terminal_binding.progress_phase = "succeeded"
            await first_db.commit()
            resume_retry.set()

            replayed = await asyncio.wait_for(retry_create, timeout=5)

        async with session_factory() as verify_db:
            matching_tasks = (
                (
                    await verify_db.execute(
                        select(BackgroundTask).where(BackgroundTask.idempotency_key == dedupe_key)
                    )
                )
                .scalars()
                .all()
            )

        assert lookup_bypassed_project_lock is False
        assert replayed.id == terminal_binding.id
        assert replayed.status == "succeeded"
        assert TaskService.is_idempotency_replay(replayed) is True
        assert [task.id for task in matching_tasks] == [terminal_binding.id]

    async def test_worker_executes_enqueued_electrical_batch(
        self,
        client: AsyncClient,
        guest_session: str,
        db_session: AsyncSession,
        test_engine,
        monkeypatch: pytest.MonkeyPatch,
    ):
        monkeypatch.setattr("app.services.task_service.TaskQueue", FakeTaskQueue)
        project = await _guest_project(client, guest_session)
        obj = await _create_pipe(client, project["id"], guest_session)
        variant = await _initialize_electrical_variants(client, project["id"], guest_session)
        await _assign_electrical_objects(
            client,
            project["id"],
            guest_session,
            variant,
            [obj["id"]],
        )
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
        assert body["result"]["scope"] == "all"
        assert body["result"]["calculated"] == 1

        persisted = await db_session.get(BackgroundTask, task_id)
        assert persisted is not None
        assert persisted.request_payload["requested_scope"] == "all"
        assert persisted.request_payload["object_ids"] == [obj["id"]]
        assert persisted.result_payload["requested_scope"] == "all"

        succeeded_audit = await db_session.scalar(
            select(AuditEvent).where(
                AuditEvent.event_type == "task.electrical_batch.succeeded",
                AuditEvent.task_id == task_id,
            )
        )
        assert succeeded_audit is not None
        assert succeeded_audit.details["requested_scope"] == "all"
        assert succeeded_audit.details["scope"] == "all"

        result_resp = await client.get(
            f"/api/v1/calc/jobs/{task_id}/result",
            headers={"X-Session-Id": guest_session},
        )
        assert result_resp.status_code == 200, result_resp.text
        assert result_resp.json()["calculated"] == 1

    async def test_all_scope_rejects_override_outside_materialized_assignments(
        self,
        client: AsyncClient,
        guest_session: str,
        db_session: AsyncSession,
        monkeypatch: pytest.MonkeyPatch,
    ):
        monkeypatch.setattr("app.services.task_service.TaskQueue", FakeTaskQueue)
        project = await _guest_project(client, guest_session)
        assigned = await _create_pipe(client, project["id"], guest_session)
        outside = await _create_pipe(client, project["id"], guest_session)
        variant = await _initialize_electrical_variants(client, project["id"], guest_session)
        await _assign_electrical_objects(
            client,
            project["id"],
            guest_session,
            variant,
            [assigned["id"]],
        )
        tasks_before = list(
            (
                await db_session.execute(
                    select(BackgroundTask).where(
                        BackgroundTask.project_id == UUID(project["id"])
                    )
                )
            ).scalars()
        )

        response = await client.post(
            "/api/v1/calc/electrical/batch/jobs",
            json={
                "project_id": project["id"],
                "object_overrides": [
                    {"object_id": outside["id"], "cable_type": "self_regulating"}
                ],
                "include_results": False,
            },
            headers={"X-Session-Id": guest_session},
        )

        assert response.status_code == 409, response.text
        assert response.json()["detail"] == {
            "code": "ELECTRICAL_ASSIGNMENT_SCOPE_MISMATCH",
            "message": "Переопределения должны входить в назначенный scope выбранного ЭР",
            "details": {
                "electrical_variant_id": variant["id"],
                "object_ids": [outside["id"]],
            },
        }
        tasks_after = list(
            (
                await db_session.execute(
                    select(BackgroundTask).where(
                        BackgroundTask.project_id == UUID(project["id"])
                    )
                )
            ).scalars()
        )
        assert [task.id for task in tasks_after] == [task.id for task in tasks_before]

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
        variant = await _initialize_electrical_variants(client, project["id"], guest_session)
        await _assign_electrical_objects(
            client,
            project["id"],
            guest_session,
            variant,
            [selected["id"]],
            system_type="resistive",
        )
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

    async def test_worker_force_cable_type_preserves_requested_all_scope(
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
        variant = await _initialize_electrical_variants(client, project["id"], guest_session)
        await _assign_electrical_objects(
            client,
            project["id"],
            guest_session,
            variant,
            [first["id"], second["id"]],
        )

        selected_resp = await client.post(
            "/api/v1/calc/electrical/batch/jobs",
            json={
                "project_id": project["id"],
                "object_ids": [first["id"]],
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
