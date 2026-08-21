"""Focused Phase 3 contract tests for object assignments inside named ERs."""

import asyncio
from uuid import UUID, uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select, text, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.dependencies import CurrentPrincipal
from app.models.audit_event import AuditEvent
from app.models.background_task import BackgroundTask
from app.models.electrical_calculation import ElectricalCalculation
from app.models.electrical_candidate import ElectricalCandidate
from app.models.electrical_candidate_folder import (
    ElectricalCandidateFolder,
    ElectricalCandidateFolderItem,
)
from app.models.electrical_variant import ElectricalVariantObject
from app.models.project import Project
from app.models.project_object import ProjectObject
from app.models.specification import Specification
from app.schemas.calculation import ElectricalRequest
from app.schemas.electrical_assignment import ElectricalAssignmentMutationItem
from app.services.calculation.container import CalculationContainer
from app.services.electrical_assignment_service import (
    ElectricalAssignmentService,
    ElectricalAssignmentServiceError,
)

pytestmark = pytest.mark.asyncio(loop_scope="session")

MINERAL_WOOL = "mineral_wool_boards_120"
READY_PIPE_PARAMS = {
    "name": "Трубопровод assignment",
    "outer_diameter": 0.108,
    "wall_thickness": 0.004,
    "pipe_material": "carbon_steel",
    "insulation_layers": [{"thickness": 0.05, "material": MINERAL_WOOL}],
    "insulation_temperature_basis": "outdoor_winter",
    "ambient_temperature": -30.0,
    "min_switch_temperature": -30.0,
    "process_temperature": 80.0,
    "pipe_length": 50.0,
    "placement": "outdoor",
    "wind_speed": 0.0,
}


async def _guest_project(client: AsyncClient, session_id: str) -> dict:
    response = await client.get("/api/v1/projects", headers={"X-Session-Id": session_id})
    assert response.status_code == 200, response.text
    return response.json()[0]


async def _add_ready_pipe(
    client: AsyncClient,
    project_id: str,
    headers: dict[str, str],
    *,
    name: str,
) -> dict:
    response = await client.post(
        f"/api/v1/projects/{project_id}/objects",
        json={
            "object_type": "pipe",
            "params": {**READY_PIPE_PARAMS, "name": name},
        },
        headers=headers,
    )
    assert response.status_code == 201, response.text
    return response.json()


async def _initialize(client: AsyncClient, project_id: str, headers: dict[str, str]) -> dict:
    response = await client.post(
        f"/api/v1/projects/{project_id}/electrical-variants/initialize",
        headers=headers,
    )
    assert response.status_code == 200, response.text
    return response.json()["variant"]


async def _assignments(
    client: AsyncClient,
    project_id: str,
    variant_id: str,
    headers: dict[str, str],
    **params,
) -> dict:
    response = await client.get(
        f"/api/v1/projects/{project_id}/electrical-variants/{variant_id}/assignments",
        headers=headers,
        params=params,
    )
    assert response.status_code == 200, response.text
    return response.json()


async def _patch_assignments(
    client: AsyncClient,
    project_id: str,
    variant_id: str,
    headers: dict[str, str],
    *,
    system_type: str,
    items: list[dict],
):
    return await client.patch(
        f"/api/v1/projects/{project_id}/electrical-variants/{variant_id}/assignments",
        headers=headers,
        json={"system_type": system_type, "items": items},
    )


class TestElectricalAssignmentApi:
    async def test_assignment_section_current_limit_endpoint_and_response_are_removed(
        self,
        client: AsyncClient,
        guest_session: str,
    ):
        project = await _guest_project(client, guest_session)
        headers = {"X-Session-Id": guest_session}
        obj = await _add_ready_pipe(client, project["id"], headers, name="Iдоп")
        variant = await _initialize(client, project["id"], headers)
        initial = (await _assignments(client, project["id"], variant["id"], headers))["items"][0]
        assigned = await _patch_assignments(
            client,
            project["id"],
            variant["id"],
            headers,
            system_type="self_regulating",
            items=[
                {
                    "object_id": obj["id"],
                    "expected_version": initial["version"],
                }
            ],
        )
        assert assigned.status_code == 200, assigned.text
        assignment = assigned.json()["assignments"][0]
        assert "max_section_start_current_a" not in assignment

        url = (
            f"/api/v1/projects/{project['id']}/electrical-variants/{variant['id']}"
            f"/assignments/{obj['id']}/section-current-limit"
        )
        removed = await client.patch(
            url,
            headers=headers,
            json={
                "expected_version": assignment["version"],
                "max_section_start_current_a": "17.500",
            },
        )
        assert removed.status_code == 404

    async def test_project_current_change_stales_all_self_regulating_assignments(
        self,
        client: AsyncClient,
        guest_session: str,
        db_session: AsyncSession,
    ):
        project = await _guest_project(client, guest_session)
        headers = {"X-Session-Id": guest_session}
        inherited_obj = await _add_ready_pipe(client, project["id"], headers, name="project-Iдоп")
        overridden_obj = await _add_ready_pipe(client, project["id"], headers, name="old-source")
        explicit_obj = await _add_ready_pipe(client, project["id"], headers, name="old-explicit")
        variant = await _initialize(client, project["id"], headers)
        initial = await _assignments(client, project["id"], variant["id"], headers)
        assigned = await _patch_assignments(
            client,
            project["id"],
            variant["id"],
            headers,
            system_type="self_regulating",
            items=[
                {
                    "object_id": item["object_id"],
                    "expected_version": item["version"],
                }
                for item in initial["items"]
            ],
        )
        assert assigned.status_code == 200, assigned.text
        await db_session.execute(
            update(ElectricalVariantObject)
            .where(
                ElectricalVariantObject.project_id == UUID(project["id"]),
                ElectricalVariantObject.electrical_variant_id == UUID(variant["id"]),
            )
            .values(assignment_state="ready", diagnostics={})
        )
        db_session.add_all(
            [
                ElectricalCalculation(
                    project_id=UUID(project["id"]),
                    object_id=UUID(object_id),
                    variant_number=variant["legacy_variant_number"],
                    electrical_variant_id=UUID(variant["id"]),
                    cable_type="self_regulating_tt",
                    cable_type_source="manual",
                    cable_mark="30ТТВ2-СР",
                    cable_mark_source="auto",
                    params={},
                    results={
                        "cable_mark": "30ТТВ2-СР",
                        **(
                            {"input_sources": {"max_section_start_current_a": "explicit_request"}}
                            if object_id == explicit_obj["id"]
                            else {}
                        ),
                    },
                )
                for object_id in (
                    inherited_obj["id"],
                    overridden_obj["id"],
                    explicit_obj["id"],
                )
            ]
        )
        await db_session.commit()

        settings_url = f"/api/v1/projects/{project['id']}/electrical-settings"
        settings = await client.get(settings_url, headers=headers)
        assert settings.status_code == 200, settings.text
        patched = await client.patch(
            settings_url,
            headers=headers,
            json={
                "expected_version": settings.json()["version"],
                "max_section_start_current_a": "13.065",
            },
        )
        assert patched.status_code == 200, patched.text

        db_session.expire_all()
        assignment_rows = list(
            (
                await db_session.execute(
                    select(ElectricalVariantObject).where(
                        ElectricalVariantObject.electrical_variant_id == UUID(variant["id"])
                    )
                )
            )
            .scalars()
            .all()
        )
        current_by_object = {str(row.object_id): row for row in assignment_rows}
        assert current_by_object[inherited_obj["id"]].assignment_state == "stale"
        assert current_by_object[overridden_obj["id"]].assignment_state == "stale"
        assert current_by_object[explicit_obj["id"]].assignment_state == "stale"

        calculation_rows = list(
            (
                await db_session.execute(
                    select(ElectricalCalculation).where(
                        ElectricalCalculation.electrical_variant_id == UUID(variant["id"])
                    )
                )
            )
            .scalars()
            .all()
        )
        result_by_object = {str(row.object_id): dict(row.results or {}) for row in calculation_rows}
        assert result_by_object[inherited_obj["id"]]["stale"] is True
        assert result_by_object[overridden_obj["id"]]["stale"] is True
        assert result_by_object[explicit_obj["id"]]["stale"] is True

    async def test_get_assign_and_same_system_noop_have_authoritative_readback(
        self,
        client: AsyncClient,
        guest_session: str,
        db_session: AsyncSession,
    ):
        project = await _guest_project(client, guest_session)
        headers = {
            "X-Session-Id": guest_session,
            "X-Request-Id": "assignment-success-audit",
        }
        first = await _add_ready_pipe(client, project["id"], headers, name="A")
        await _add_ready_pipe(client, project["id"], headers, name="B")
        variant = await _initialize(client, project["id"], headers)

        initial = await _assignments(
            client,
            project["id"],
            variant["id"],
            headers,
            page=1,
            page_size=1,
        )
        assert initial["counts"] == {
            "total": 2,
            "filtered": 2,
            "by_system": {
                "unassigned": 2,
                "self_regulating": 0,
                "resistive": 0,
                "skin": 0,
                "mineral": 0,
            },
            "by_state": {
                "unassigned": 2,
                "ready": 0,
                "unsupported": 0,
                "stale": 0,
                "error": 0,
            },
        }
        assert initial["page_info"]["total_pages"] == 2
        assert initial["page_info"]["has_next_page"] is True
        assert initial["items"][0]["object"]["id"] == initial["items"][0]["object_id"]
        assert initial["items"][0]["object"]["params"]["name"] in {"A", "B"}

        version = next(
            item["version"]
            for item in (await _assignments(client, project["id"], variant["id"], headers))["items"]
            if item["object_id"] == first["id"]
        )
        assigned = await _patch_assignments(
            client,
            project["id"],
            variant["id"],
            headers,
            system_type="self_regulating",
            items=[{"object_id": first["id"], "expected_version": version}],
        )
        assert assigned.status_code == 200, assigned.text
        body = assigned.json()
        assert body["changed_count"] == 1
        assert body["assignments"][0]["system_type"] == "self_regulating"
        assert body["assignments"][0]["assignment_state"] == "stale"
        assert body["assignments"][0]["diagnostics"]["error_code"] == (
            "ELECTRICAL_CALCULATION_REQUIRED"
        )
        assert body["assignments"][0]["version"] == version + 1
        success_audit = await db_session.scalar(
            select(AuditEvent)
            .where(
                AuditEvent.event_type == "electrical_assignment.assigned",
                AuditEvent.project_id == UUID(project["id"]),
            )
            .order_by(AuditEvent.created_at.desc())
        )
        assert success_audit is not None
        assert success_audit.category == "calculation"
        assert success_audit.result == "success"
        assert success_audit.error_code is None
        assert success_audit.request_id == "assignment-success-audit"
        assert success_audit.details["electrical_variant_id"] == variant["id"]
        assert success_audit.details["object_ids"] == [first["id"]]
        assert success_audit.details["action"] == "assign"
        assert success_audit.details["result"] == "success"
        assert success_audit.details["duration_ms"] >= 0

        audit_count_before = int(
            await db_session.scalar(
                select(func.count(AuditEvent.id)).where(
                    AuditEvent.event_type == "electrical_assignment.assigned"
                )
            )
            or 0
        )
        noop = await _patch_assignments(
            client,
            project["id"],
            variant["id"],
            headers,
            system_type="self_regulating",
            items=[{"object_id": first["id"], "expected_version": version + 1}],
        )
        assert noop.status_code == 200, noop.text
        assert noop.json()["changed_count"] == 0
        assert noop.json()["assignments"][0]["version"] == version + 1
        audit_count_after = int(
            await db_session.scalar(
                select(func.count(AuditEvent.id)).where(
                    AuditEvent.event_type == "electrical_assignment.assigned"
                )
            )
            or 0
        )
        assert audit_count_after == audit_count_before

        filtered = await _assignments(
            client,
            project["id"],
            variant["id"],
            headers,
            view="self_regulating",
        )
        assert filtered["counts"]["total"] == 2
        assert filtered["counts"]["filtered"] == 1
        assert [item["object_id"] for item in filtered["items"]] == [first["id"]]

    async def test_bulk_version_conflict_rolls_back_and_reassign_requires_unassign(
        self,
        client: AsyncClient,
        guest_session: str,
        db_session: AsyncSession,
    ):
        project = await _guest_project(client, guest_session)
        headers = {
            "X-Session-Id": guest_session,
            "X-Request-Id": "assignment-conflict-audit",
        }
        await _add_ready_pipe(client, project["id"], headers, name="A")
        await _add_ready_pipe(client, project["id"], headers, name="B")
        variant = await _initialize(client, project["id"], headers)
        rows = (await _assignments(client, project["id"], variant["id"], headers))["items"]

        conflict_items = [
            {"object_id": rows[0]["object_id"], "expected_version": rows[0]["version"]},
            {"object_id": rows[1]["object_id"], "expected_version": 99},
        ]
        conflict = await _patch_assignments(
            client,
            project["id"],
            variant["id"],
            headers,
            system_type="self_regulating",
            items=conflict_items,
        )
        assert conflict.status_code == 409
        assert conflict.json()["detail"]["code"] == "ELECTRICAL_ASSIGNMENT_VERSION_CONFLICT"
        assert conflict.json()["detail"]["details"]["conflicts"] == [
            {
                "object_id": rows[1]["object_id"],
                "expected_version": 99,
                "current_version": 1,
            }
        ]
        failure_audit = await db_session.scalar(
            select(AuditEvent)
            .where(
                AuditEvent.event_type == "electrical_assignment.assign_failed",
                AuditEvent.project_id == UUID(project["id"]),
            )
            .order_by(AuditEvent.created_at.desc())
        )
        assert failure_audit is not None
        assert failure_audit.category == "calculation"
        assert failure_audit.result == "failure"
        assert failure_audit.error_code == "ELECTRICAL_ASSIGNMENT_VERSION_CONFLICT"
        assert failure_audit.request_id == "assignment-conflict-audit"
        assert failure_audit.details["electrical_variant_id"] == variant["id"]
        assert failure_audit.details["object_ids"] == [
            rows[0]["object_id"],
            rows[1]["object_id"],
        ]
        assert failure_audit.details["action"] == "assign"
        assert failure_audit.details["result"] == "failure"
        assert failure_audit.details["duration_ms"] >= 0
        persisted = list(
            (
                await db_session.execute(
                    select(ElectricalVariantObject).where(
                        ElectricalVariantObject.electrical_variant_id == UUID(variant["id"])
                    )
                )
            ).scalars()
        )
        assert all(item.system_type is None and item.version == 1 for item in persisted)

        success_items = [
            {"object_id": row["object_id"], "expected_version": row["version"]} for row in rows
        ]
        success = await _patch_assignments(
            client,
            project["id"],
            variant["id"],
            headers,
            system_type="self_regulating",
            items=success_items,
        )
        assert success.status_code == 200, success.text
        assert success.json()["changed_count"] == 2

        reassign = await _patch_assignments(
            client,
            project["id"],
            variant["id"],
            headers,
            system_type="resistive",
            items=[
                {
                    "object_id": row["object_id"],
                    "expected_version": row["version"],
                }
                for row in success.json()["assignments"]
            ],
        )
        assert reassign.status_code == 409
        assert reassign.json()["detail"]["code"] == (
            "ELECTRICAL_ASSIGNMENT_REASSIGN_REQUIRES_UNASSIGN"
        )

    async def test_concurrent_assignment_and_unassign_have_single_revision_winner(
        self,
        client: AsyncClient,
        guest_session: str,
        test_engine,
        db_session: AsyncSession,
    ):
        project = await _guest_project(client, guest_session)
        headers = {"X-Session-Id": guest_session}
        obj = await _add_ready_pipe(client, project["id"], headers, name="Race")
        variant = await _initialize(client, project["id"], headers)
        project_id = UUID(project["id"])
        variant_id = UUID(variant["id"])
        object_id = UUID(obj["id"])
        principal = CurrentPrincipal(role="guest", session_id=guest_session)
        factory = async_sessionmaker(test_engine, expire_on_commit=False)

        async def concurrent_assign(system_type: str):
            async with factory() as session:
                return await ElectricalAssignmentService(session).assign(
                    project_id,
                    variant_id,
                    principal,
                    system_type=system_type,
                    items=[
                        ElectricalAssignmentMutationItem(
                            object_id=object_id,
                            expected_version=1,
                        )
                    ],
                )

        assign_results = await asyncio.gather(
            concurrent_assign("self_regulating"),
            concurrent_assign("resistive"),
            return_exceptions=True,
        )
        assign_successes = [
            result for result in assign_results if not isinstance(result, Exception)
        ]
        assign_failures = [result for result in assign_results if isinstance(result, Exception)]
        assert len(assign_successes) == len(assign_failures) == 1
        assert isinstance(assign_failures[0], ElectricalAssignmentServiceError)
        assert assign_failures[0].code == "ELECTRICAL_ASSIGNMENT_VERSION_CONFLICT"
        db_session.expire_all()
        persisted = await db_session.scalar(
            select(ElectricalVariantObject).where(
                ElectricalVariantObject.electrical_variant_id == variant_id,
                ElectricalVariantObject.object_id == object_id,
            )
        )
        assert persisted is not None
        assert persisted.system_type in {"self_regulating", "resistive"}
        assert persisted.version == 2

        async def concurrent_unassign():
            async with factory() as session:
                return await ElectricalAssignmentService(session).unassign(
                    project_id,
                    variant_id,
                    principal,
                    confirm=True,
                    items=[
                        ElectricalAssignmentMutationItem(
                            object_id=object_id,
                            expected_version=2,
                        )
                    ],
                )

        unassign_results = await asyncio.gather(
            concurrent_unassign(),
            concurrent_unassign(),
            return_exceptions=True,
        )
        unassign_successes = [
            result for result in unassign_results if not isinstance(result, Exception)
        ]
        unassign_failures = [result for result in unassign_results if isinstance(result, Exception)]
        assert len(unassign_successes) == len(unassign_failures) == 1
        assert isinstance(unassign_failures[0], ElectricalAssignmentServiceError)
        assert unassign_failures[0].code == "ELECTRICAL_ASSIGNMENT_VERSION_CONFLICT"
        db_session.expire_all()
        final_assignment = await db_session.scalar(
            select(ElectricalVariantObject).where(
                ElectricalVariantObject.electrical_variant_id == variant_id,
                ElectricalVariantObject.object_id == object_id,
            )
        )
        assert final_assignment is not None
        assert final_assignment.system_type is None
        assert final_assignment.assignment_state == "unassigned"
        assert final_assignment.version == 3

    async def test_unsupported_and_dirty_legacy_scope_fail_without_mutation(
        self,
        client: AsyncClient,
        guest_session: str,
        db_session: AsyncSession,
    ):
        project = await _guest_project(client, guest_session)
        headers = {"X-Session-Id": guest_session}
        obj = await _add_ready_pipe(client, project["id"], headers, name="Dirty")
        variant = await _initialize(client, project["id"], headers)
        row = (await _assignments(client, project["id"], variant["id"], headers))["items"][0]

        unsupported = await _patch_assignments(
            client,
            project["id"],
            variant["id"],
            headers,
            system_type="skin",
            items=[{"object_id": obj["id"], "expected_version": row["version"]}],
        )
        assert unsupported.status_code == 409
        assert unsupported.json()["detail"]["code"] == "ELECTRICAL_SYSTEM_UNSUPPORTED"

        legacy_calculation = ElectricalCalculation(
            project_id=UUID(project["id"]),
            object_id=UUID(obj["id"]),
            variant_number=1,
            electrical_variant_id=None,
            cable_type="self_regulating",
            cable_type_source="auto",
            cable_mark=None,
            cable_mark_source="auto",
            params={},
            results={"category": "stale"},
        )
        db_session.add(legacy_calculation)
        await db_session.commit()
        # 0027's expand-window trigger normally backfills this UUID.  Recreate
        # a genuinely dirty legacy row to prove Phase 3 rejects, rather than
        # numerically cleaning, pre-existing NULL scope.
        await db_session.execute(
            text(
                "ALTER TABLE electrical_calculations DISABLE TRIGGER "
                "trg_0027_sync_electrical_variant_id"
            )
        )
        try:
            await db_session.execute(
                update(ElectricalCalculation)
                .where(ElectricalCalculation.id == legacy_calculation.id)
                .values(electrical_variant_id=None)
            )
        finally:
            await db_session.execute(
                text(
                    "ALTER TABLE electrical_calculations ENABLE TRIGGER "
                    "trg_0027_sync_electrical_variant_id"
                )
            )
        await db_session.commit()
        assert (
            await db_session.scalar(
                select(ElectricalCalculation.electrical_variant_id).where(
                    ElectricalCalculation.id == legacy_calculation.id
                )
            )
            is None
        )
        dirty = await _patch_assignments(
            client,
            project["id"],
            variant["id"],
            headers,
            system_type="self_regulating",
            items=[{"object_id": obj["id"], "expected_version": row["version"]}],
        )
        assert dirty.status_code == 409
        assert dirty.json()["detail"]["code"] == ("ELECTRICAL_ASSIGNMENT_DOWNSTREAM_SCOPE_CONFLICT")
        assignment = await db_session.scalar(
            select(ElectricalVariantObject).where(
                ElectricalVariantObject.electrical_variant_id == UUID(variant["id"]),
                ElectricalVariantObject.object_id == UUID(obj["id"]),
            )
        )
        assert assignment is not None
        assert assignment.system_type is None
        assert assignment.assignment_state == "unassigned"
        assert assignment.version == 1

    async def test_active_target_er_task_blocks_assignment_even_when_cancel_requested(
        self,
        client: AsyncClient,
        guest_session: str,
        db_session: AsyncSession,
    ):
        project = await _guest_project(client, guest_session)
        headers = {"X-Session-Id": guest_session}
        obj = await _add_ready_pipe(client, project["id"], headers, name="Job")
        variant = await _initialize(client, project["id"], headers)
        db_session.add(
            BackgroundTask(
                type="electrical_batch",
                status="running",
                project_id=UUID(project["id"]),
                electrical_variant_id=UUID(variant["id"]),
                session_id=guest_session,
                request_payload={
                    "project_id": project["id"],
                    "electrical_variant_id": variant["id"],
                    "object_ids": [str(uuid4())],
                },
                progress_current=0,
                cancel_requested=True,
                attempts=0,
                enqueue_attempts=0,
            )
        )
        await db_session.commit()

        blocked = await _patch_assignments(
            client,
            project["id"],
            variant["id"],
            headers,
            system_type="self_regulating",
            items=[{"object_id": obj["id"], "expected_version": 1}],
        )
        assert blocked.status_code == 423
        assert blocked.json()["detail"]["code"] == "PROJECT_CALCULATION_BUSY"
        assert blocked.json()["detail"]["operation_type"] == "electrical_batch"
        assert blocked.json()["detail"]["status"] == "running"

    async def test_candidate_only_downstream_requires_cleanup_before_assignment(
        self,
        client: AsyncClient,
        guest_session: str,
        db_session: AsyncSession,
    ):
        project = await _guest_project(client, guest_session)
        headers = {"X-Session-Id": guest_session}
        obj = await _add_ready_pipe(client, project["id"], headers, name="Candidate only")
        variant = await _initialize(client, project["id"], headers)
        candidate = ElectricalCandidate(
            project_id=UUID(project["id"]),
            object_id=UUID(obj["id"]),
            variant_number=1,
            electrical_variant_id=UUID(variant["id"]),
            cable_type="three_core",
            cable_source="builtin",
            cable_mark="R-legacy",
            dedupe_key="candidate-only-assignment-preflight",
            mode="manual",
            status="applicable",
            params={},
            results={"selected_cable": "R-legacy"},
        )
        db_session.add(candidate)
        await db_session.commit()
        candidate_id = candidate.id

        blocked = await _patch_assignments(
            client,
            project["id"],
            variant["id"],
            headers,
            system_type="self_regulating",
            items=[{"object_id": obj["id"], "expected_version": 1}],
        )
        assert blocked.status_code == 409
        assert blocked.json()["detail"]["code"] == "ELECTRICAL_ASSIGNMENT_CLEANUP_REQUIRED"
        assert await db_session.get(ElectricalCandidate, candidate_id) is not None
        assignment = await db_session.scalar(
            select(ElectricalVariantObject).where(
                ElectricalVariantObject.electrical_variant_id == UUID(variant["id"]),
                ElectricalVariantObject.object_id == UUID(obj["id"]),
            )
        )
        assert assignment is not None
        assert assignment.system_type is None
        assert assignment.version == 1

    async def test_confirmed_unassign_deletes_only_exact_er_and_preserves_heat(
        self,
        client: AsyncClient,
        guest_session: str,
        db_session: AsyncSession,
    ):
        project = await _guest_project(client, guest_session)
        project_id = UUID(project["id"])
        headers = {
            "X-Session-Id": guest_session,
            "X-Request-Id": "assignment-unassign-audit",
        }
        obj_payload = await _add_ready_pipe(client, project["id"], headers, name="Cleanup")
        object_id = UUID(obj_payload["id"])
        first = await _initialize(client, project["id"], headers)
        second_response = await client.post(
            f"/api/v1/projects/{project['id']}/electrical-variants",
            headers=headers,
            json={"name": "ЭР2 cleanup"},
        )
        assert second_response.status_code == 201, second_response.text
        second = second_response.json()

        first_assign = await _patch_assignments(
            client,
            project["id"],
            first["id"],
            headers,
            system_type="self_regulating",
            items=[{"object_id": str(object_id), "expected_version": 1}],
        )
        second_assign = await _patch_assignments(
            client,
            project["id"],
            second["id"],
            headers,
            system_type="resistive",
            items=[{"object_id": str(object_id), "expected_version": 1}],
        )
        assert first_assign.status_code == second_assign.status_code == 200

        obj = await db_session.get(ProjectObject, object_id)
        assert obj is not None
        heat_before = dict(obj.results or {})
        params_before = dict(obj.params or {})
        object_version_before = obj.version

        target_candidate = ElectricalCandidate(
            project_id=project_id,
            object_id=object_id,
            variant_number=1,
            electrical_variant_id=UUID(first["id"]),
            cable_type="self_regulating",
            cable_source="builtin",
            cable_mark="ТЛТ-25",
            dedupe_key="target-cleanup",
            mode="manual",
            status="applicable",
            params={},
            results={"selected_cable": "ТЛТ-25"},
        )
        other_candidate = ElectricalCandidate(
            project_id=project_id,
            object_id=object_id,
            variant_number=2,
            electrical_variant_id=UUID(second["id"]),
            cable_type="three_core",
            cable_source="builtin",
            cable_mark="R-3",
            dedupe_key="other-cleanup",
            mode="manual",
            status="applicable",
            params={},
            results={"selected_cable": "R-3"},
        )
        target_folder = ElectricalCandidateFolder(
            project_id=project_id,
            object_id=object_id,
            variant_number=1,
            electrical_variant_id=UUID(first["id"]),
            name="Target",
            sort_order=10,
            created_by_session_id=guest_session,
        )
        other_folder = ElectricalCandidateFolder(
            project_id=project_id,
            object_id=object_id,
            variant_number=2,
            electrical_variant_id=UUID(second["id"]),
            name="Other",
            sort_order=10,
            created_by_session_id=guest_session,
        )
        db_session.add_all(
            [
                ElectricalCalculation(
                    project_id=project_id,
                    object_id=object_id,
                    variant_number=1,
                    electrical_variant_id=UUID(first["id"]),
                    cable_type="self_regulating",
                    cable_type_source="auto",
                    cable_mark="ТЛТ-25",
                    cable_mark_source="auto",
                    params={},
                    results={"selected_cable": "ТЛТ-25"},
                ),
                ElectricalCalculation(
                    project_id=project_id,
                    object_id=object_id,
                    variant_number=2,
                    electrical_variant_id=UUID(second["id"]),
                    cable_type="three_core",
                    cable_type_source="auto",
                    cable_mark="R-3",
                    cable_mark_source="auto",
                    params={},
                    results={"selected_cable": "R-3"},
                ),
                target_candidate,
                other_candidate,
                target_folder,
                other_folder,
                Specification(
                    project_id=project_id,
                    electrical_variant_id=UUID(first["id"]),
                    items=[{"name": "target-manual", "quantity": 1}],
                    is_stale=False,
                ),
                Specification(
                    project_id=project_id,
                    electrical_variant_id=UUID(second["id"]),
                    items=[{"name": "other", "quantity": 1}],
                    is_stale=False,
                ),
            ]
        )
        await db_session.flush()
        db_session.add_all(
            [
                ElectricalCandidateFolderItem(
                    folder_id=target_folder.id,
                    candidate_id=target_candidate.id,
                ),
                ElectricalCandidateFolderItem(
                    folder_id=other_folder.id,
                    candidate_id=other_candidate.id,
                ),
            ]
        )
        await db_session.commit()

        not_confirmed = await client.post(
            f"/api/v1/projects/{project['id']}/electrical-variants/{first['id']}/unassign",
            headers=headers,
            json={
                "confirm": False,
                "items": [{"object_id": str(object_id), "expected_version": 2}],
            },
        )
        assert not_confirmed.status_code == 409
        assert not_confirmed.json()["detail"]["code"] == (
            "ELECTRICAL_UNASSIGN_CONFIRMATION_REQUIRED"
        )
        failure_audit = await db_session.scalar(
            select(AuditEvent)
            .where(
                AuditEvent.event_type == "electrical_assignment.unassign_failed",
                AuditEvent.project_id == project_id,
            )
            .order_by(AuditEvent.created_at.desc())
        )
        assert failure_audit is not None
        assert failure_audit.category == "calculation"
        assert failure_audit.result == "failure"
        assert failure_audit.error_code == "ELECTRICAL_UNASSIGN_CONFIRMATION_REQUIRED"
        assert failure_audit.request_id == "assignment-unassign-audit"
        assert failure_audit.details["action"] == "unassign"
        assert failure_audit.details["result"] == "failure"
        assert failure_audit.details["duration_ms"] >= 0

        response = await client.post(
            f"/api/v1/projects/{project['id']}/electrical-variants/{first['id']}/unassign",
            headers=headers,
            json={
                "confirm": True,
                "items": [{"object_id": str(object_id), "expected_version": 2}],
            },
        )
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["changed_count"] == 1
        assert body["cleanup"] == {
            "electrical_calculations": 1,
            "electrical_candidates": 1,
            "electrical_candidate_folders": 1,
            "electrical_candidate_folder_items": 1,
        }
        assert body["assignments"][0]["system_type"] is None
        assert body["assignments"][0]["assignment_state"] == "unassigned"
        assert body["assignments"][0]["version"] == 3
        success_audit = await db_session.scalar(
            select(AuditEvent)
            .where(
                AuditEvent.event_type == "electrical_assignment.unassigned",
                AuditEvent.project_id == project_id,
            )
            .order_by(AuditEvent.created_at.desc())
        )
        assert success_audit is not None
        assert success_audit.category == "calculation"
        assert success_audit.result == "success"
        assert success_audit.error_code is None
        assert success_audit.request_id == "assignment-unassign-audit"
        assert success_audit.details["electrical_variant_id"] == first["id"]
        assert success_audit.details["object_ids"] == [str(object_id)]
        assert success_audit.details["action"] == "unassign"
        assert success_audit.details["result"] == "success"
        assert success_audit.details["duration_ms"] >= 0

        target_calc = await db_session.scalar(
            select(ElectricalCalculation).where(
                ElectricalCalculation.electrical_variant_id == UUID(first["id"]),
                ElectricalCalculation.object_id == object_id,
            )
        )
        other_calc = await db_session.scalar(
            select(ElectricalCalculation).where(
                ElectricalCalculation.electrical_variant_id == UUID(second["id"]),
                ElectricalCalculation.object_id == object_id,
            )
        )
        assert target_calc is None
        assert other_calc is not None
        target_spec = await db_session.scalar(
            select(Specification).where(Specification.electrical_variant_id == UUID(first["id"]))
        )
        other_spec = await db_session.scalar(
            select(Specification).where(Specification.electrical_variant_id == UUID(second["id"]))
        )
        assert target_spec is not None and target_spec.is_stale is True
        assert target_spec.items == [{"name": "target-manual", "quantity": 1}]
        assert target_spec.stale_details["electrical_variant_id"] == first["id"]
        assert other_spec is not None and other_spec.is_stale is False
        refreshed_obj = await db_session.get(ProjectObject, object_id, populate_existing=True)
        assert refreshed_obj is not None
        assert refreshed_obj.params == params_before
        assert refreshed_obj.results == heat_before
        assert refreshed_obj.version == object_version_before

    async def test_fourth_er_assignment_and_cross_guest_rbac(
        self,
        client: AsyncClient,
        guest_session: str,
    ):
        project = await _guest_project(client, guest_session)
        headers = {"X-Session-Id": guest_session}
        obj = await _add_ready_pipe(client, project["id"], headers, name="ER4")
        variants = [await _initialize(client, project["id"], headers)]
        for number in range(2, 5):
            response = await client.post(
                f"/api/v1/projects/{project['id']}/electrical-variants",
                headers=headers,
                json={"name": f"ЭР{number}"},
            )
            assert response.status_code == 201, response.text
            variants.append(response.json())
        fourth = variants[-1]
        assert fourth["legacy_variant_number"] == 4

        assigned = await _patch_assignments(
            client,
            project["id"],
            fourth["id"],
            headers,
            system_type="resistive",
            items=[{"object_id": obj["id"], "expected_version": 1}],
        )
        assert assigned.status_code == 200, assigned.text
        assert assigned.json()["assignments"][0]["system_type"] == "resistive"

        other_session = (await client.post("/api/v1/auth/guest")).json()["session_id"]
        forbidden_headers = {"X-Session-Id": other_session}
        forbidden_get = await client.get(
            f"/api/v1/projects/{project['id']}/electrical-variants/" f"{fourth['id']}/assignments",
            headers=forbidden_headers,
        )
        assert forbidden_get.status_code == 403
        forbidden_patch = await _patch_assignments(
            client,
            project["id"],
            fourth["id"],
            forbidden_headers,
            system_type="resistive",
            items=[{"object_id": obj["id"], "expected_version": 2}],
        )
        assert forbidden_patch.status_code == 403

        unassigned = await client.post(
            f"/api/v1/projects/{project['id']}/electrical-variants/" f"{fourth['id']}/unassign",
            headers=headers,
            json={
                "confirm": True,
                "items": [{"object_id": obj["id"], "expected_version": 2}],
            },
        )
        assert unassigned.status_code == 200, unassigned.text
        assert unassigned.json()["assignments"][0]["system_type"] is None

    async def test_candidate_and_folder_require_live_compatible_assignment(
        self,
        client: AsyncClient,
        guest_session: str,
        db_session: AsyncSession,
    ):
        project = await _guest_project(client, guest_session)
        headers = {"X-Session-Id": guest_session}
        obj = await _add_ready_pipe(client, project["id"], headers, name="Candidate guard")
        variant = await _initialize(client, project["id"], headers)
        candidate_payload = {
            "project_id": project["id"],
            "object_id": obj["id"],
            "variant_number": 1,
            "electrical_variant_id": variant["id"],
            "cable_type": "self_regulating_tt",
            "cable_source": "builtin",
            "mode": "auto",
        }
        folder_payload = {
            "project_id": project["id"],
            "object_id": obj["id"],
            "variant_number": 1,
            "electrical_variant_id": variant["id"],
            "name": "Guarded",
        }

        candidate_blocked = await client.post(
            "/api/v1/calc/electrical/candidates",
            headers=headers,
            json=candidate_payload,
        )
        folder_blocked = await client.post(
            "/api/v1/calc/electrical/candidate-folders",
            headers=headers,
            json=folder_payload,
        )
        assert candidate_blocked.status_code == folder_blocked.status_code == 409
        assert candidate_blocked.json()["detail"]["code"] == "ELECTRICAL_ASSIGNMENT_REQUIRED"
        assert folder_blocked.json()["detail"]["code"] == "ELECTRICAL_ASSIGNMENT_REQUIRED"

        # Единственный расчётный тип — self_regulating_tt, поэтому несовпадение
        # моделируем назначением объекта в другую поддерживаемую систему.
        assigned = await _patch_assignments(
            client,
            project["id"],
            variant["id"],
            headers,
            system_type="resistive",
            items=[{"object_id": obj["id"], "expected_version": 1}],
        )
        assert assigned.status_code == 200, assigned.text
        mismatch = await client.post(
            "/api/v1/calc/electrical/candidates",
            headers=headers,
            json=candidate_payload,
        )
        assert mismatch.status_code == 409
        assert mismatch.json()["detail"]["code"] == ("ELECTRICAL_ASSIGNMENT_SYSTEM_MISMATCH")

        unassigned = await client.post(
            f"/api/v1/projects/{project['id']}/electrical-variants/" f"{variant['id']}/unassign",
            headers=headers,
            json={
                "confirm": True,
                "items": [{"object_id": obj["id"], "expected_version": 2}],
            },
        )
        assert unassigned.status_code == 200, unassigned.text
        post_candidate = await client.post(
            "/api/v1/calc/electrical/candidates",
            headers=headers,
            json=candidate_payload,
        )
        post_folder = await client.post(
            "/api/v1/calc/electrical/candidate-folders",
            headers=headers,
            json=folder_payload,
        )
        assert post_candidate.status_code == post_folder.status_code == 409
        assert (
            await db_session.scalar(
                select(func.count(ElectricalCandidate.id)).where(
                    ElectricalCandidate.project_id == UUID(project["id"])
                )
            )
            == 0
        )
        assert (
            await db_session.scalar(
                select(func.count(ElectricalCandidateFolder.id)).where(
                    ElectricalCandidateFolder.project_id == UUID(project["id"])
                )
            )
            == 0
        )

    async def test_candidate_and_folder_exact_uuid_reads_fail_closed_on_dirty_rows(
        self,
        client: AsyncClient,
        guest_session: str,
        db_session: AsyncSession,
    ):
        project = await _guest_project(client, guest_session)
        headers = {"X-Session-Id": guest_session}
        obj = await _add_ready_pipe(client, project["id"], headers, name="Exact candidates")
        variant = await _initialize(client, project["id"], headers)
        assigned = await _patch_assignments(
            client,
            project["id"],
            variant["id"],
            headers,
            system_type="self_regulating",
            items=[{"object_id": obj["id"], "expected_version": 1}],
        )
        assert assigned.status_code == 200, assigned.text

        candidates: list[dict] = []
        for mark in ("30ТТВ2-СР", "45ТТВ2-СР"):
            created = await client.post(
                "/api/v1/calc/electrical/candidates",
                headers=headers,
                json={
                    "project_id": project["id"],
                    "object_id": obj["id"],
                    "variant_number": 1,
                    "electrical_variant_id": variant["id"],
                    "cable_type": "self_regulating_tt",
                    "cable_source": "builtin",
                    "mode": "manual",
                    "cable_mark": mark,
                },
            )
            assert created.status_code == 200, created.text
            candidate = created.json()["candidate"]
            assert candidate["electrical_variant_id"] == variant["id"]
            candidates.append(candidate)

        folder_response = await client.post(
            "/api/v1/calc/electrical/candidate-folders",
            headers=headers,
            json={
                "project_id": project["id"],
                "object_id": obj["id"],
                "variant_number": 1,
                "electrical_variant_id": variant["id"],
                "name": "Exact folder",
            },
        )
        assert folder_response.status_code == 200, folder_response.text
        folder = folder_response.json()
        assert folder["electrical_variant_id"] == variant["id"]

        exact_candidates = await client.get(
            "/api/v1/calc/electrical/candidates",
            headers=headers,
            params={
                "project_id": project["id"],
                "object_id": obj["id"],
                "variant_number": 1,
                "electrical_variant_id": variant["id"],
            },
        )
        assert exact_candidates.status_code == 200, exact_candidates.text
        assert {item["id"] for item in exact_candidates.json()} == {
            item["id"] for item in candidates
        }
        exact_folders = await client.get(
            "/api/v1/calc/electrical/candidate-folders",
            headers=headers,
            params={
                "project_id": project["id"],
                "object_id": obj["id"],
                "variant_number": 1,
                "electrical_variant_id": variant["id"],
            },
        )
        assert exact_folders.status_code == 200, exact_folders.text
        assert [item["id"] for item in exact_folders.json()] == [folder["id"]]

        await db_session.execute(
            text(
                "ALTER TABLE electrical_candidates DISABLE TRIGGER "
                "trg_0027_sync_electrical_variant_id"
            )
        )
        try:
            await db_session.execute(
                update(ElectricalCandidate)
                .where(ElectricalCandidate.id == UUID(candidates[1]["id"]))
                .values(electrical_variant_id=None, is_applied=True)
            )
        finally:
            await db_session.execute(
                text(
                    "ALTER TABLE electrical_candidates ENABLE TRIGGER "
                    "trg_0027_sync_electrical_variant_id"
                )
            )
        await db_session.execute(
            text(
                "ALTER TABLE electrical_candidate_folders DISABLE TRIGGER "
                "trg_0027_sync_electrical_variant_id"
            )
        )
        try:
            await db_session.execute(
                update(ElectricalCandidateFolder)
                .where(ElectricalCandidateFolder.id == UUID(folder["id"]))
                .values(electrical_variant_id=None)
            )
        finally:
            await db_session.execute(
                text(
                    "ALTER TABLE electrical_candidate_folders ENABLE TRIGGER "
                    "trg_0027_sync_electrical_variant_id"
                )
            )
        await db_session.commit()

        dirty_candidate_list = await client.get(
            "/api/v1/calc/electrical/candidates",
            headers=headers,
            params={
                "project_id": project["id"],
                "object_id": obj["id"],
                "variant_number": 1,
                "electrical_variant_id": variant["id"],
            },
        )
        assert dirty_candidate_list.status_code == 409
        assert dirty_candidate_list.json()["detail"]["code"] == (
            "ELECTRICAL_ASSIGNMENT_DOWNSTREAM_SCOPE_CONFLICT"
        )
        assert dirty_candidate_list.json()["detail"]["details"]["candidate_ids"] == [
            candidates[1]["id"]
        ]
        dirty_folder_list = await client.get(
            "/api/v1/calc/electrical/candidate-folders",
            headers=headers,
            params={
                "project_id": project["id"],
                "object_id": obj["id"],
                "variant_number": 1,
                "electrical_variant_id": variant["id"],
            },
        )
        assert dirty_folder_list.status_code == 409
        assert dirty_folder_list.json()["detail"]["details"]["folder_ids"] == [folder["id"]]

        dirty_dedupe = await client.post(
            "/api/v1/calc/electrical/candidates",
            headers=headers,
            json={
                "project_id": project["id"],
                "object_id": obj["id"],
                "variant_number": 1,
                "electrical_variant_id": variant["id"],
                "cable_type": "self_regulating_tt",
                "cable_source": "builtin",
                "mode": "manual",
                "cable_mark": "45ТТВ2-СР",
            },
        )
        assert dirty_dedupe.status_code == 409
        assert dirty_dedupe.json()["detail"]["code"] == (
            "ELECTRICAL_ASSIGNMENT_DOWNSTREAM_SCOPE_CONFLICT"
        )

        apply_exact = await client.post(
            f"/api/v1/calc/electrical/candidates/{candidates[0]['id']}/apply",
            headers=headers,
        )
        assert apply_exact.status_code == 409
        assert apply_exact.json()["detail"]["code"] == (
            "ELECTRICAL_ASSIGNMENT_DOWNSTREAM_SCOPE_CONFLICT"
        )
        persisted = list(
            (
                await db_session.execute(
                    select(ElectricalCandidate)
                    .where(ElectricalCandidate.id.in_([UUID(item["id"]) for item in candidates]))
                    .order_by(ElectricalCandidate.cable_mark)
                )
            ).scalars()
        )
        by_mark = {item.cable_mark: item for item in persisted}
        assert by_mark["30ТТВ2-СР"].is_applied is False
        assert by_mark["30ТТВ2-СР"].electrical_variant_id == UUID(variant["id"])
        assert by_mark["45ТТВ2-СР"].is_applied is True
        assert by_mark["45ТТВ2-СР"].electrical_variant_id is None

    async def test_post_project_lock_loaders_refresh_prelock_object_identity(
        self,
        client: AsyncClient,
        guest_session: str,
        test_engine,
    ):
        project = await _guest_project(client, guest_session)
        headers = {"X-Session-Id": guest_session}
        obj = await _add_ready_pipe(client, project["id"], headers, name="Fresh identity")
        variant = await _initialize(client, project["id"], headers)
        assigned = await _patch_assignments(
            client,
            project["id"],
            variant["id"],
            headers,
            system_type="self_regulating",
            items=[{"object_id": obj["id"], "expected_version": 1}],
        )
        assert assigned.status_code == 200, assigned.text
        current_settings = await client.get(
            f"/api/v1/projects/{project['id']}/electrical-settings",
            headers=headers,
        )
        settings_response = await client.patch(
            f"/api/v1/projects/{project['id']}/electrical-settings",
            json={
                "expected_version": current_settings.json()["version"],
                "max_section_start_current_a": "13.065",
            },
            headers=headers,
        )
        assert settings_response.status_code == 200, settings_response.text
        project_id = UUID(project["id"])
        object_id = UUID(obj["id"])
        variant_id = UUID(variant["id"])
        factory = async_sessionmaker(test_engine, expire_on_commit=False)

        async def exercise(loader: str, process_temperature: float) -> None:
            async with factory() as stale_db, factory() as updater_db:
                prelock = await stale_db.get(ProjectObject, object_id)
                assert prelock is not None
                assert prelock.params["process_temperature"] != process_temperature

                await updater_db.execute(
                    select(Project).where(Project.id == project_id).with_for_update()
                )
                current = await updater_db.scalar(
                    select(ProjectObject).where(ProjectObject.id == object_id).with_for_update()
                )
                assert current is not None
                current.params = {
                    **(current.params or {}),
                    "process_temperature": process_temperature,
                }
                await updater_db.flush()

                waiting_for_project = asyncio.create_task(
                    stale_db.execute(
                        select(Project).where(Project.id == project_id).with_for_update()
                    )
                )
                await asyncio.sleep(0.05)
                assert waiting_for_project.done() is False
                await updater_db.commit()
                await asyncio.wait_for(waiting_for_project, timeout=3)

                service = CalculationContainer(stale_db)
                if loader == "candidate":
                    refreshed = await service.electrical_candidates._load_candidate_object(
                        project_id,
                        object_id,
                    )
                    observed = refreshed.params["process_temperature"]
                elif loader == "selectable":
                    refreshed = await service.electrical_single._load_selectable_object(object_id)
                    observed = refreshed.params["process_temperature"]
                else:
                    request = ElectricalRequest(
                        object_id=object_id,
                        cable_type="self_regulating_tt",
                        electrical_variant_id=variant_id,
                        data={
                            "required_power_per_meter": 20,
                            "cable_mark": "30ТТВ2-СР",
                            "number_of_threads": 3,
                            "supply_voltage": 230,
                            "ambient_temperature": -30,
                            "selection_policy": "technical_minimum",
                            "pipe_length": 50,
                            "safety_factor": 1.1,
                        },
                    )
                    await service.electrical_single.calculate(
                        request,
                        commit=False,
                        electrical_variant_id=variant_id,
                    )
                    observed = request.data["process_temperature"]
                assert observed == process_temperature
                await stale_db.rollback()

        await exercise("candidate", 81.0)
        await exercise("selectable", 82.0)
        await exercise("calculation", 83.0)

    async def test_cross_er_folder_item_blocks_unassign_before_delete(
        self,
        client: AsyncClient,
        guest_session: str,
        db_session: AsyncSession,
    ):
        project = await _guest_project(client, guest_session)
        project_id = UUID(project["id"])
        headers = {"X-Session-Id": guest_session}
        obj = await _add_ready_pipe(client, project["id"], headers, name="Cross folder")
        object_id = UUID(obj["id"])
        first = await _initialize(client, project["id"], headers)
        second_response = await client.post(
            f"/api/v1/projects/{project['id']}/electrical-variants",
            headers=headers,
            json={"name": "ЭР2 cross-folder"},
        )
        assert second_response.status_code == 201, second_response.text
        second = second_response.json()
        for variant in (first, second):
            assigned = await _patch_assignments(
                client,
                project["id"],
                variant["id"],
                headers,
                system_type="self_regulating",
                items=[{"object_id": obj["id"], "expected_version": 1}],
            )
            assert assigned.status_code == 200, assigned.text

        candidate = ElectricalCandidate(
            project_id=project_id,
            object_id=object_id,
            variant_number=2,
            electrical_variant_id=UUID(second["id"]),
            cable_type="self_regulating",
            cable_source="builtin",
            cable_mark="TLT-cross",
            dedupe_key="cross-er-folder-item-candidate",
            mode="manual",
            status="applicable",
            params={},
            results={"selected_cable": "TLT-cross"},
        )
        folder = ElectricalCandidateFolder(
            project_id=project_id,
            object_id=object_id,
            variant_number=1,
            electrical_variant_id=UUID(first["id"]),
            name="Cross ER",
            sort_order=10,
            created_by_session_id=guest_session,
        )
        db_session.add_all([candidate, folder])
        await db_session.flush()
        item = ElectricalCandidateFolderItem(folder_id=folder.id, candidate_id=candidate.id)
        db_session.add(item)
        await db_session.commit()
        folder_id = folder.id
        candidate_id = candidate.id

        blocked = await client.post(
            f"/api/v1/projects/{project['id']}/electrical-variants/" f"{first['id']}/unassign",
            headers=headers,
            json={
                "confirm": True,
                "items": [{"object_id": obj["id"], "expected_version": 2}],
            },
        )
        assert blocked.status_code == 409
        assert blocked.json()["detail"]["code"] == (
            "ELECTRICAL_ASSIGNMENT_DOWNSTREAM_SCOPE_CONFLICT"
        )
        assert (
            blocked.json()["detail"]["details"]["conflicts"]["electrical_candidate_folder_items"]
            == 1
        )
        assert await db_session.get(ElectricalCandidateFolder, folder_id) is not None
        assert await db_session.get(ElectricalCandidate, candidate_id) is not None

    async def test_recalculate_all_scopes_to_matching_assignments(
        self,
        client: AsyncClient,
        guest_session: str,
        db_session: AsyncSession,
    ):
        project = await _guest_project(client, guest_session)
        headers = {"X-Session-Id": guest_session}
        assigned_obj = await _add_ready_pipe(client, project["id"], headers, name="Assigned")
        unassigned_obj = await _add_ready_pipe(
            client,
            project["id"],
            headers,
            name="Unassigned",
        )
        variant = await _initialize(client, project["id"], headers)
        assigned = await _patch_assignments(
            client,
            project["id"],
            variant["id"],
            headers,
            system_type="self_regulating",
            items=[{"object_id": assigned_obj["id"], "expected_version": 1}],
        )
        assert assigned.status_code == 200, assigned.text

        batch = await client.post(
            "/api/v1/calc/electrical/batch",
            headers=headers,
            params={
                "project_id": project["id"],
                "variant_number": 1,
                "cable_type": "self_regulating",
                "include_results": False,
            },
        )
        assert batch.status_code == 200, batch.text
        calculations = list(
            (
                await db_session.execute(
                    select(ElectricalCalculation).where(
                        ElectricalCalculation.electrical_variant_id == UUID(variant["id"])
                    )
                )
            ).scalars()
        )
        assert [item.object_id for item in calculations] == [UUID(assigned_obj["id"])]
        unassigned_row = await db_session.scalar(
            select(ElectricalVariantObject).where(
                ElectricalVariantObject.electrical_variant_id == UUID(variant["id"]),
                ElectricalVariantObject.object_id == UUID(unassigned_obj["id"]),
            )
        )
        assert unassigned_row is not None
        assert unassigned_row.system_type is None
        assert unassigned_row.version == 1

        explicit_incompatible = await client.post(
            "/api/v1/calc/electrical/batch",
            headers=headers,
            params=[
                ("project_id", project["id"]),
                ("variant_number", "1"),
                ("cable_type", "self_regulating"),
                ("object_ids", unassigned_obj["id"]),
            ],
        )
        assert explicit_incompatible.status_code == 409
        assert explicit_incompatible.json()["detail"]["code"] == ("ELECTRICAL_ASSIGNMENT_REQUIRED")


class TestElectricalAssignmentCalculationSync:
    async def test_calc_is_er_exact_then_object_change_stales_both_ers(
        self,
        client: AsyncClient,
        guest_session: str,
        db_session: AsyncSession,
    ):
        project = await _guest_project(client, guest_session)
        project_id = UUID(project["id"])
        headers = {"X-Session-Id": guest_session}
        obj_payload = await _add_ready_pipe(client, project["id"], headers, name="Two ER")
        object_id = UUID(obj_payload["id"])
        first = await _initialize(client, project["id"], headers)
        second_response = await client.post(
            f"/api/v1/projects/{project['id']}/electrical-variants",
            headers=headers,
            json={"name": "ЭР2 stale isolation"},
        )
        assert second_response.status_code == 201, second_response.text
        second = second_response.json()
        for variant in (first, second):
            assigned = await _patch_assignments(
                client,
                project["id"],
                variant["id"],
                headers,
                system_type="self_regulating",
                items=[{"object_id": obj_payload["id"], "expected_version": 1}],
            )
            assert assigned.status_code == 200, assigned.text
        db_session.add_all(
            [
                Specification(
                    project_id=project_id,
                    electrical_variant_id=UUID(first["id"]),
                    items=[{"name": "first", "quantity": 1}],
                    is_stale=False,
                ),
                Specification(
                    project_id=project_id,
                    electrical_variant_id=UUID(second["id"]),
                    items=[{"name": "second", "quantity": 1}],
                    is_stale=False,
                ),
            ]
        )
        await db_session.commit()
        obj = await db_session.get(ProjectObject, object_id, populate_existing=True)
        assert obj is not None
        await CalculationContainer(db_session).electrical_failures.upsert(
            obj,
            "CalculationError: first only",
            1,
            "self_regulating",
            electrical_variant_id=UUID(first["id"]),
        )
        await db_session.commit()

        assignment_rows = list(
            (
                await db_session.execute(
                    select(ElectricalVariantObject).where(
                        ElectricalVariantObject.object_id == object_id,
                        ElectricalVariantObject.electrical_variant_id.in_(
                            [UUID(first["id"]), UUID(second["id"])]
                        ),
                    )
                )
            ).scalars()
        )
        assignments = {row.electrical_variant_id: row for row in assignment_rows}
        assert assignments[UUID(first["id"])].assignment_state == "error"
        assert assignments[UUID(first["id"])].version == 2
        assert assignments[UUID(second["id"])].assignment_state == "stale"
        assert assignments[UUID(second["id"])].version == 2
        specs = list(
            (
                await db_session.execute(
                    select(Specification).where(Specification.project_id == project_id)
                )
            ).scalars()
        )
        specs_by_variant = {row.electrical_variant_id: row for row in specs}
        assert specs_by_variant[UUID(first["id"])].is_stale is True
        assert specs_by_variant[UUID(second["id"])].is_stale is False

        updated_params = {**READY_PIPE_PARAMS, "name": "Two ER changed", "pipe_length": 55.0}
        updated = await client.put(
            f"/api/v1/projects/{project['id']}/objects/{obj_payload['id']}",
            headers=headers,
            json={"version": obj_payload["version"], "params": updated_params},
        )
        assert updated.status_code == 200, updated.text
        refreshed_assignments = list(
            (
                await db_session.execute(
                    select(ElectricalVariantObject).where(
                        ElectricalVariantObject.object_id == object_id
                    )
                )
            ).scalars()
        )
        assert {row.assignment_state for row in refreshed_assignments} == {"stale"}
        assert {row.electrical_variant_id: row.version for row in refreshed_assignments} == {
            UUID(first["id"]): 3,
            UUID(second["id"]): 3,
        }
        refreshed_specs = list(
            (
                await db_session.execute(
                    select(Specification).where(Specification.project_id == project_id)
                )
            ).scalars()
        )
        assert all(row.is_stale for row in refreshed_specs)

    async def test_failed_upsert_keeps_exact_uuid_and_transitions_only_target_assignment(
        self,
        client: AsyncClient,
        guest_session: str,
        db_session: AsyncSession,
    ):
        project = await _guest_project(client, guest_session)
        headers = {"X-Session-Id": guest_session}
        obj_payload = await _add_ready_pipe(client, project["id"], headers, name="Failed")
        variant = await _initialize(client, project["id"], headers)
        assigned = await _patch_assignments(
            client,
            project["id"],
            variant["id"],
            headers,
            system_type="self_regulating",
            items=[{"object_id": obj_payload["id"], "expected_version": 1}],
        )
        assert assigned.status_code == 200, assigned.text
        obj = await db_session.get(ProjectObject, UUID(obj_payload["id"]), populate_existing=True)
        assert obj is not None

        calc = await CalculationContainer(db_session).electrical_failures.upsert(
            obj,
            "CalculationError: test failure",
            1,
            "self_regulating",
            request_data={"required_power_per_meter": 20.0},
            electrical_variant_id=UUID(variant["id"]),
        )
        await db_session.commit()
        assert calc.electrical_variant_id == UUID(variant["id"])
        assignment = await db_session.scalar(
            select(ElectricalVariantObject).where(
                ElectricalVariantObject.electrical_variant_id == UUID(variant["id"]),
                ElectricalVariantObject.object_id == UUID(obj_payload["id"]),
            )
        )
        assert assignment is not None
        assert assignment.system_type == "self_regulating"
        assert assignment.assignment_state == "error"
        assert assignment.requested_cable_type == "self_regulating"
        assert assignment.version == 2

        with pytest.raises(ElectricalAssignmentServiceError) as mismatch:
            await CalculationContainer(db_session).electrical_repository.bulk_upsert(
                [
                    {
                        "project_id": UUID(project["id"]),
                        "object_id": UUID(obj_payload["id"]),
                        "variant_number": 1,
                        "electrical_variant_id": UUID(variant["id"]),
                        "cable_type": "three_core",
                        "cable_mark": "R-3",
                        "params": {},
                        "results": {"selected_cable": "R-3"},
                    }
                ]
            )
        assert mismatch.value.code == "ELECTRICAL_ASSIGNMENT_SYSTEM_MISMATCH"
        await db_session.rollback()
        persisted_calc = await db_session.scalar(
            select(ElectricalCalculation).where(
                ElectricalCalculation.electrical_variant_id == UUID(variant["id"]),
                ElectricalCalculation.object_id == UUID(obj_payload["id"]),
            )
        )
        assert persisted_calc is not None
        assert persisted_calc.cable_type == "self_regulating"
