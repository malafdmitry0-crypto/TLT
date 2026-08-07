"""Focused contract tests for dynamic named electrical variants (ER)."""

import asyncio
from collections.abc import AsyncIterator, Iterator
from contextlib import asynccontextmanager, contextmanager
from uuid import UUID, uuid4

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import event, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from app.core.database import get_db
from app.core.dependencies import CurrentPrincipal
from app.main import app
from app.models.audit_event import AuditEvent
from app.models.background_task import BackgroundTask
from app.models.electrical_calculation import ElectricalCalculation
from app.models.electrical_candidate import ElectricalCandidate
from app.models.electrical_candidate_folder import (
    ElectricalCandidateFolder,
    ElectricalCandidateFolderItem,
)
from app.models.electrical_variant import ElectricalVariant, ElectricalVariantObject
from app.models.project import Project
from app.models.project_object import ProjectObject
from app.models.specification import Specification
from app.models.user import User
from app.services.calculation_service import CalculationService
from app.services.electrical_variant_service import ElectricalVariantService
from app.services.excel_import_service import _commit_object_batch

pytestmark = pytest.mark.asyncio(loop_scope="session")

MINERAL_WOOL = "mineral_wool_boards_120"
READY_PIPE_PARAMS = {
    "name": "Трубопровод 1",
    "outer_diameter": 0.108,
    "wall_thickness": 0.004,
    "pipe_material": "carbon_steel",
    "insulation_layers": [{"thickness": 0.05, "material": MINERAL_WOOL}],
    "insulation_temperature_basis": "outdoor_winter",
    "ambient_temperature": -30.0,
    "process_temperature": 80.0,
    "pipe_length": 50.0,
    "placement": "outdoor",
    "wind_speed": 0.0,
}


class _FakeTaskQueue:
    async def enqueue(self, task_id, task_type: str) -> str:
        return f"stream:{task_id}:{task_type}"


async def _guest_project(client: AsyncClient, session_id: str) -> dict:
    response = await client.get(
        "/api/v1/projects",
        headers={"X-Session-Id": session_id},
    )
    assert response.status_code == 200, response.text
    return response.json()[0]


async def _add_ready_pipe(
    client: AsyncClient,
    project_id: str,
    headers: dict[str, str],
) -> dict:
    response = await client.post(
        f"/api/v1/projects/{project_id}/objects",
        json={"object_type": "pipe", "params": READY_PIPE_PARAMS},
        headers=headers,
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["is_valid"] is True
    assert body["results"]["total_heat_loss_design"] > 0
    return body


async def _initialize(
    client: AsyncClient,
    project_id: str,
    headers: dict[str, str],
) -> dict:
    response = await client.post(
        f"/api/v1/projects/{project_id}/electrical-variants/initialize",
        headers=headers,
    )
    assert response.status_code == 200, response.text
    return response.json()


async def _assign_variant_object(
    client: AsyncClient,
    project_id: str,
    variant_id: str,
    object_id: str,
    headers: dict[str, str],
    *,
    system_type: str = "self_regulating",
) -> None:
    assignments = await client.get(
        f"/api/v1/projects/{project_id}/electrical-variants/{variant_id}/assignments",
        headers=headers,
    )
    assert assignments.status_code == 200, assignments.text
    assignment = next(
        item for item in assignments.json()["items"] if item["object_id"] == object_id
    )
    response = await client.patch(
        f"/api/v1/projects/{project_id}/electrical-variants/{variant_id}/assignments",
        json={
            "system_type": system_type,
            "items": [
                {
                    "object_id": object_id,
                    "expected_version": assignment["version"],
                }
            ],
        },
        headers=headers,
    )
    assert response.status_code == 200, response.text


async def _prepare_and_assign_legacy_variant(
    client: AsyncClient,
    project_id: str,
    object_id: str,
    variant_number: int,
    headers: dict[str, str],
) -> dict:
    prepared = await client.post(
        "/api/v1/calc/electrical/batch",
        params={"project_id": project_id, "variant_number": variant_number},
        headers=headers,
    )
    assert prepared.status_code == 200, prepared.text
    variants = await client.get(
        f"/api/v1/projects/{project_id}/electrical-variants",
        headers=headers,
    )
    assert variants.status_code == 200, variants.text
    variant = next(
        item for item in variants.json() if item["legacy_variant_number"] == variant_number
    )
    await _assign_variant_object(
        client,
        project_id,
        variant["id"],
        object_id,
        headers,
    )
    return variant


CANDIDATE_ELECTRICAL_PARAMS = {
    "supply_voltage": 230,
    "maintain_temperature": 50.0,
    # null — валидное значение (пар/навивка отсутствуют), но ключ обязан присутствовать.
    "vapor_temperature": None,
    "aggressive_product": False,
    "winding_pitch": None,
    "number_of_threads": None,
    "selection_policy": "technical_minimum",
    "safety_factor": 1.1,
}


async def _set_project_section_current_limit(
    client: AsyncClient,
    project_id: str,
    headers: dict[str, str],
) -> None:
    response = await client.patch(
        f"/api/v1/projects/{project_id}/electrical-settings",
        json={"expected_version": 1, "max_section_start_current_a": "13.065"},
        headers=headers,
    )
    assert response.status_code == 200, response.text


async def _create_slot_two_candidate(
    client: AsyncClient,
    project_id: str,
    object_id: str,
    headers: dict[str, str],
) -> dict:
    await _prepare_and_assign_legacy_variant(
        client,
        project_id,
        object_id,
        2,
        headers,
    )
    response = await client.post(
        "/api/v1/calc/electrical/candidates",
        json={
            "project_id": project_id,
            "object_id": object_id,
            "variant_number": 2,
            "cable_type": "self_regulating_tt",
            "cable_source": "builtin",
            "mode": "manual",
            "cable_mark": "30ТТВ2-СР",
            "electrical_params": CANDIDATE_ELECTRICAL_PARAMS,
        },
        headers=headers,
    )
    assert response.status_code == 200, response.text
    return response.json()["candidate"]


async def _create_employee_token(client: AsyncClient, admin_token: str) -> str:
    email = f"variant-owner-{uuid4().hex}@test.com"
    password = "emp12345"
    response = await client.post(
        "/api/v1/admin/users",
        json={"email": email, "password": password, "role": "employee"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert response.status_code == 201, response.text
    login = await client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
    )
    assert login.status_code == 200, login.text
    return login.json()["access_token"]


@contextmanager
def _count_sql(async_engine: AsyncEngine) -> Iterator[list[str]]:
    statements: list[str] = []

    def before_cursor_execute(
        _conn,
        _cursor,
        statement: str,
        _parameters,
        _context,
        _executemany,
    ) -> None:
        if statement.lstrip().upper().startswith(("SELECT", "INSERT", "UPDATE", "DELETE")):
            statements.append(statement)

    event.listen(async_engine.sync_engine, "before_cursor_execute", before_cursor_execute)
    try:
        yield statements
    finally:
        event.remove(async_engine.sync_engine, "before_cursor_execute", before_cursor_execute)


async def _seed_ready_project_objects(
    db_session: AsyncSession,
    employee_user: User,
    *,
    object_count: int,
) -> Project:
    project = Project(
        name=f"ER scale {object_count}",
        user_id=employee_user.id,
    )
    db_session.add(project)
    await db_session.flush()
    db_session.add_all(
        ProjectObject(
            project_id=project.id,
            object_type="pipe",
            sort_order=index,
            is_valid=True,
            params={**READY_PIPE_PARAMS, "name": f"Трубопровод {index + 1}"},
            results={
                "heat_loss_per_meter_base": 20.0,
                "total_heat_loss_design": 1000.0,
                "effective_length": 50.0,
            },
        )
        for index in range(object_count)
    )
    await db_session.commit()
    return project


async def _create_four_variants(
    service: ElectricalVariantService,
    project: Project,
    principal: CurrentPrincipal,
) -> None:
    await service.initialize(project.id, principal)
    for number in range(2, 5):
        await service.create_empty(project.id, principal, name=f"ЭР{number}")


@asynccontextmanager
async def _client_with_request_scoped_sessions(
    test_engine: AsyncEngine,
) -> AsyncIterator[AsyncClient]:
    """Use one independent DB session per concurrent HTTP request."""
    session_factory = async_sessionmaker(test_engine, expire_on_commit=False)

    async def override_get_db():
        async with session_factory() as session:
            try:
                yield session
            finally:
                await session.rollback()

    original_override = app.dependency_overrides.get(get_db)
    app.dependency_overrides[get_db] = override_get_db
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
        ) as concurrent_client:
            yield concurrent_client
    finally:
        if original_override is None:
            app.dependency_overrides.pop(get_db, None)
        else:
            app.dependency_overrides[get_db] = original_override


class TestElectricalReadinessAndInitialization:
    async def test_zero_objects_blocks_initialization_without_partial_rows(
        self,
        client: AsyncClient,
        guest_session: str,
        db_session: AsyncSession,
    ):
        project = await _guest_project(client, guest_session)
        headers = {"X-Session-Id": guest_session}

        readiness = await client.get(
            f"/api/v1/projects/{project['id']}/electrical-readiness",
            headers=headers,
        )
        assert readiness.status_code == 200
        assert readiness.json() == {
            "project_id": project["id"],
            "ready": False,
            "total_objects": 0,
            "ready_objects": 0,
            "issues": [
                {
                    "code": "ELECTRICAL_PROJECT_HAS_NO_OBJECTS",
                    "message": "Добавьте хотя бы один трубопровод или ёмкость",
                    "object_id": None,
                    "details": {},
                }
            ],
        }
        variants_before = await client.get(
            f"/api/v1/projects/{project['id']}/electrical-variants",
            headers=headers,
        )
        assert variants_before.status_code == 200
        assert variants_before.json() == []
        premature_create = await client.post(
            f"/api/v1/projects/{project['id']}/electrical-variants",
            json={"name": "До инициализации"},
            headers=headers,
        )
        assert premature_create.status_code == 409
        assert premature_create.json()["detail"]["code"] == "ELECTRICAL_VARIANTS_NOT_INITIALIZED"

        initialize = await client.post(
            f"/api/v1/projects/{project['id']}/electrical-variants/initialize",
            headers=headers,
        )
        assert initialize.status_code == 409
        assert initialize.json()["detail"]["code"] == "ELECTRICAL_READINESS_FAILED"
        count = await db_session.scalar(
            select(func.count())
            .select_from(ElectricalVariant)
            .where(ElectricalVariant.project_id == UUID(project["id"]))
        )
        assert count == 0

    async def test_empty_heat_result_is_not_meaningful_readiness(
        self,
        client: AsyncClient,
        guest_session: str,
        db_session: AsyncSession,
    ):
        project = await _guest_project(client, guest_session)
        headers = {"X-Session-Id": guest_session}
        obj = await _add_ready_pipe(client, project["id"], headers)
        persisted = await db_session.get(ProjectObject, UUID(obj["id"]))
        assert persisted is not None
        persisted.results = {}
        persisted.is_valid = True
        await db_session.commit()

        response = await client.get(
            f"/api/v1/projects/{project['id']}/electrical-readiness",
            headers=headers,
        )
        assert response.status_code == 200
        body = response.json()
        assert body["ready"] is False
        assert body["ready_objects"] == 0
        assert body["issues"][0]["code"] == "ELECTRICAL_OBJECT_NOT_READY"
        assert body["issues"][0]["details"]["total_heat_loss_design"] is None

    async def test_initialize_is_idempotent_and_creates_unassigned_assignment(
        self,
        client: AsyncClient,
        guest_session: str,
        db_session: AsyncSession,
    ):
        project = await _guest_project(client, guest_session)
        headers = {"X-Session-Id": guest_session}
        obj = await _add_ready_pipe(client, project["id"], headers)

        first = await _initialize(client, project["id"], headers)
        second = await _initialize(client, project["id"], headers)

        assert first["created"] is True
        assert first["assignments_created"] == 1
        assert first["variant"]["name"] == "ЭР1"
        assert first["variant"]["is_active"] is True
        assert second["created"] is False
        assert second["assignments_created"] == 0
        assert second["variant"]["id"] == first["variant"]["id"]

        variants = (
            (
                await db_session.execute(
                    select(ElectricalVariant).where(
                        ElectricalVariant.project_id == UUID(project["id"])
                    )
                )
            )
            .scalars()
            .all()
        )
        assignments = (
            (
                await db_session.execute(
                    select(ElectricalVariantObject).where(
                        ElectricalVariantObject.electrical_variant_id
                        == UUID(first["variant"]["id"])
                    )
                )
            )
            .scalars()
            .all()
        )
        assert len(variants) == 1
        assert len(assignments) == 1
        assert assignments[0].object_id == UUID(obj["id"])
        assert assignments[0].assignment_state == "unassigned"
        assert assignments[0].system_type is None
        audit_events = (
            (
                await db_session.execute(
                    select(AuditEvent).where(
                        AuditEvent.project_id == UUID(project["id"]),
                        AuditEvent.event_type == "electrical_variant.initialized",
                    )
                )
            )
            .scalars()
            .all()
        )
        assert len(audit_events) == 1
        assert audit_events[0].details["electrical_variant_id"] == first["variant"]["id"]


class TestElectricalVariantLifecycle:
    async def test_object_summary_is_exact_variant_scoped_and_rejects_foreign_uuid(
        self,
        client: AsyncClient,
        guest_session: str,
        db_session: AsyncSession,
    ):
        project = await _guest_project(client, guest_session)
        headers = {"X-Session-Id": guest_session}
        obj = await _add_ready_pipe(client, project["id"], headers)
        first = (await _initialize(client, project["id"], headers))["variant"]
        second_response = await client.post(
            f"/api/v1/projects/{project['id']}/electrical-variants",
            json={"name": "ЭР2"},
            headers=headers,
        )
        assert second_response.status_code == 201, second_response.text
        second = second_response.json()
        db_session.add_all(
            [
                ElectricalCalculation(
                    project_id=UUID(project["id"]),
                    object_id=UUID(obj["id"]),
                    variant_number=1,
                    electrical_variant_id=UUID(first["id"]),
                    cable_type="self_regulating",
                    cable_mark="HTM",
                    results={"selected_cable": {"mark": "HTM"}},
                ),
                ElectricalCalculation(
                    project_id=UUID(project["id"]),
                    object_id=UUID(obj["id"]),
                    variant_number=2,
                    electrical_variant_id=UUID(second["id"]),
                    cable_type="self_regulating",
                    cable_mark="HTM",
                    results={
                        "error_code": "POWER_TOO_HIGH",
                        "category": "formula",
                    },
                ),
            ]
        )
        foreign_project = Project(name="Другой проект", session_id=guest_session)
        db_session.add(foreign_project)
        await db_session.flush()
        foreign_variant = ElectricalVariant(
            project_id=foreign_project.id,
            name="Чужой ЭР",
            name_normalized="чужой эр",
            sort_order=0,
            is_active=True,
            legacy_variant_number=1,
        )
        db_session.add(foreign_variant)
        await db_session.commit()

        first_summary = await client.get(
            f"/api/v1/projects/{project['id']}/objects/summary",
            params={"electrical_variant_id": first["id"]},
            headers=headers,
        )
        second_summary = await client.get(
            f"/api/v1/projects/{project['id']}/objects/summary",
            params={"electrical_variant_id": second["id"]},
            headers=headers,
        )
        foreign = await client.get(
            f"/api/v1/projects/{project['id']}/objects/summary",
            params={"electrical_variant_id": str(foreign_variant.id)},
            headers=headers,
        )

        assert first_summary.status_code == 200, first_summary.text
        assert first_summary.json()["successful_electrical_calculations"] == 1
        assert first_summary.json()["failed_electrical_calculations"] == 0
        assert second_summary.status_code == 200, second_summary.text
        assert second_summary.json()["successful_electrical_calculations"] == 0
        assert second_summary.json()["failed_electrical_calculations"] == 1
        assert foreign.status_code == 404, foreign.text
        assert foreign.json()["detail"]["code"] == "ELECTRICAL_VARIANT_NOT_FOUND"

    async def test_create_idempotency_returns_same_variant_and_rejects_key_reuse(
        self,
        client: AsyncClient,
        guest_session: str,
    ):
        project = await _guest_project(client, guest_session)
        headers = {"X-Session-Id": guest_session}
        await _add_ready_pipe(client, project["id"], headers)
        await _initialize(client, project["id"], headers)
        url = f"/api/v1/projects/{project['id']}/electrical-variants"
        create_headers = {**headers, "Idempotency-Key": "same-empty-create-click"}

        first = await client.post(
            url,
            json={"name": "Повторяемый пустой ЭР"},
            headers=create_headers,
        )
        retry = await client.post(
            url,
            json={"name": "Повторяемый пустой ЭР"},
            headers=create_headers,
        )
        mismatch = await client.post(
            url,
            json={"name": "Другой пустой ЭР"},
            headers=create_headers,
        )

        assert first.status_code == 201, first.text
        assert retry.status_code == 201, retry.text
        assert retry.json()["id"] == first.json()["id"]
        assert mismatch.status_code == 409, mismatch.text
        assert mismatch.json()["detail"]["code"] == ("ELECTRICAL_VARIANT_IDEMPOTENCY_KEY_REUSED")
        listing = await client.get(url, headers=headers)
        assert len(listing.json()) == 2

    async def test_unicode_casefold_name_conflict_and_limit_have_stable_codes(
        self,
        client: AsyncClient,
        guest_session: str,
        db_session: AsyncSession,
    ):
        project = await _guest_project(client, guest_session)
        headers = {"X-Session-Id": guest_session}
        await _add_ready_pipe(client, project["id"], headers)
        await _initialize(client, project["id"], headers)

        created = await client.post(
            f"/api/v1/projects/{project['id']}/electrical-variants",
            json={"name": "  Straße  "},
            headers=headers,
        )
        assert created.status_code == 201, created.text
        assert created.json()["name"] == "Straße"

        conflict = await client.patch(
            f"/api/v1/projects/{project['id']}/electrical-variants/{created.json()['id']}",
            json={"name": "STRASSE"},
            headers=headers,
        )
        # Renaming a variant to its own casefold-equivalent display name is allowed.
        assert conflict.status_code == 200, conflict.text

        other = await client.post(
            f"/api/v1/projects/{project['id']}/electrical-variants",
            json={"name": "Другой"},
            headers=headers,
        )
        assert other.status_code == 201, other.text
        conflict = await client.patch(
            f"/api/v1/projects/{project['id']}/electrical-variants/{other.json()['id']}",
            json={"name": "  straße  "},
            headers=headers,
        )
        assert conflict.status_code == 409
        assert conflict.json()["detail"]["code"] == "ELECTRICAL_VARIANT_NAME_CONFLICT"

        # Independent DB invariant: lower() would allow Straße/STRASSE, while
        # the persisted Python-casefold key must reject the same collision.
        db_session.add(
            ElectricalVariant(
                project_id=UUID(project["id"]),
                name="straße",
                name_normalized="straße".casefold(),
                sort_order=99,
                is_active=False,
            )
        )
        with pytest.raises(IntegrityError):
            await db_session.flush()
        await db_session.rollback()

        blank = await client.post(
            f"/api/v1/projects/{project['id']}/electrical-variants",
            json={"name": "   "},
            headers=headers,
        )
        assert blank.status_code == 422
        assert blank.json()["detail"]["code"] == "ELECTRICAL_VARIANT_NAME_EMPTY"

        fourth = await client.post(
            f"/api/v1/projects/{project['id']}/electrical-variants",
            json={"name": "Четвёртый"},
            headers=headers,
        )
        assert fourth.status_code == 201, fourth.text
        fifth = await client.post(
            f"/api/v1/projects/{project['id']}/electrical-variants",
            json={"name": "Пятый"},
            headers=headers,
        )
        assert fifth.status_code == 409
        assert fifth.json()["detail"]["code"] == "ELECTRICAL_VARIANT_LIMIT_REACHED"

    async def test_active_delete_chooses_next_then_previous_and_forbids_last(
        self,
        client: AsyncClient,
        guest_session: str,
    ):
        project = await _guest_project(client, guest_session)
        headers = {"X-Session-Id": guest_session}
        await _add_ready_pipe(client, project["id"], headers)
        first = (await _initialize(client, project["id"], headers))["variant"]
        second = (
            await client.post(
                f"/api/v1/projects/{project['id']}/electrical-variants",
                json={"name": "ЭР2"},
                headers=headers,
            )
        ).json()
        third = (
            await client.post(
                f"/api/v1/projects/{project['id']}/electrical-variants",
                json={"name": "ЭР3"},
                headers=headers,
            )
        ).json()

        activate = await client.post(
            f"/api/v1/projects/{project['id']}/electrical-variants/{second['id']}/activate",
            headers=headers,
        )
        assert activate.status_code == 200, activate.text
        delete_middle = await client.delete(
            f"/api/v1/projects/{project['id']}/electrical-variants/{second['id']}",
            headers=headers,
        )
        assert delete_middle.status_code == 200, delete_middle.text
        assert delete_middle.json()["active_variant_id"] == third["id"]

        delete_last = await client.delete(
            f"/api/v1/projects/{project['id']}/electrical-variants/{third['id']}",
            headers=headers,
        )
        assert delete_last.status_code == 200, delete_last.text
        assert delete_last.json()["active_variant_id"] == first["id"]

        forbidden = await client.delete(
            f"/api/v1/projects/{project['id']}/electrical-variants/{first['id']}",
            headers=headers,
        )
        assert forbidden.status_code == 409
        assert forbidden.json()["detail"]["code"] == "ELECTRICAL_VARIANT_LAST_DELETE_FORBIDDEN"

    async def test_employee_read_guard_but_owner_only_mutations(
        self,
        client: AsyncClient,
        employee_token: str,
        admin_token: str,
    ):
        owner_token = await _create_employee_token(client, admin_token)
        owner_headers = {"Authorization": f"Bearer {owner_token}"}
        reader_headers = {"Authorization": f"Bearer {employee_token}"}
        project_response = await client.post(
            "/api/v1/projects",
            json={"name": "Проект владельца ЭР"},
            headers=owner_headers,
        )
        assert project_response.status_code == 201, project_response.text
        project = project_response.json()
        await _add_ready_pipe(client, project["id"], owner_headers)
        initialized = await _initialize(client, project["id"], owner_headers)

        readable = await client.get(
            f"/api/v1/projects/{project['id']}/electrical-variants",
            headers=reader_headers,
        )
        assert readable.status_code == 200
        assert readable.json()[0]["id"] == initialized["variant"]["id"]

        forbidden = await client.post(
            f"/api/v1/projects/{project['id']}/electrical-variants",
            json={"name": "Чужой ЭР"},
            headers=reader_headers,
        )
        assert forbidden.status_code == 403
        assert forbidden.json()["detail"]["code"] == "PROJECT_ACCESS_DENIED"

        second_project_response = await client.post(
            "/api/v1/projects",
            json={"name": "Другой проект того же владельца"},
            headers=owner_headers,
        )
        assert second_project_response.status_code == 201, second_project_response.text
        wrong_scope = await client.patch(
            f"/api/v1/projects/{second_project_response.json()['id']}"
            f"/electrical-variants/{initialized['variant']['id']}",
            json={"name": "Межпроектная подмена"},
            headers=owner_headers,
        )
        assert wrong_scope.status_code == 404
        assert wrong_scope.json()["detail"]["code"] == "ELECTRICAL_VARIANT_NOT_FOUND"


class TestElectricalVariantConcurrency:
    async def test_uuid_only_variant_has_safe_empty_query_and_capabilities(
        self,
        client: AsyncClient,
        guest_session: str,
        db_session: AsyncSession,
    ):
        project = await _guest_project(client, guest_session)
        headers = {"X-Session-Id": guest_session}
        obj = await _add_ready_pipe(client, project["id"], headers)
        variant = ElectricalVariant(
            project_id=UUID(project["id"]),
            name="UUID-only read",
            name_normalized="uuid-only read",
            sort_order=0,
            is_active=True,
            legacy_variant_number=None,
        )
        db_session.add(variant)
        await db_session.flush()
        db_session.add(
            ElectricalVariantObject(
                project_id=UUID(project["id"]),
                electrical_variant_id=variant.id,
                object_id=UUID(obj["id"]),
                system_type="self_regulating",
                assignment_state="ready",
                version=1,
                object_version_snapshot=obj["version"],
            )
        )
        await db_session.commit()

        capabilities = await client.get(
            "/api/v1/calc/electrical/query-capabilities",
            params={
                "project_id": project["id"],
                "variant_number": 1,
                "electrical_variant_id": str(variant.id),
            },
            headers=headers,
        )
        assert capabilities.status_code == 200, capabilities.text

        query = await client.post(
            "/api/v1/calc/electrical/query",
            json={
                "project_id": project["id"],
                "variant_number": 1,
                "electrical_variant_id": str(variant.id),
            },
            headers=headers,
        )
        assert query.status_code == 200, query.text
        body = query.json()
        assert body["calculations"] == []
        assert body["summary"]["calculated_count"] == 0
        assert body["query"] == {
            "variant_number": None,
            "electrical_variant_id": str(variant.id),
            "sort": None,
        }

    async def test_stale_uuid_precondition_blocks_reused_legacy_slot_without_write(
        self,
        client: AsyncClient,
        guest_session: str,
        db_session: AsyncSession,
    ):
        project = await _guest_project(client, guest_session)
        headers = {"X-Session-Id": guest_session}
        obj = await _add_ready_pipe(client, project["id"], headers)
        first_variant = (await _initialize(client, project["id"], headers))["variant"]
        stale_variant_response = await client.post(
            f"/api/v1/projects/{project['id']}/electrical-variants",
            json={"name": "Удаляемый ЭР"},
            headers=headers,
        )
        assert stale_variant_response.status_code == 201, stale_variant_response.text
        stale_variant = stale_variant_response.json()
        assert stale_variant["legacy_variant_number"] == 2

        deleted = await client.delete(
            f"/api/v1/projects/{project['id']}/electrical-variants/{stale_variant['id']}",
            headers=headers,
        )
        assert deleted.status_code == 200, deleted.text
        replacement_response = await client.post(
            f"/api/v1/projects/{project['id']}/electrical-variants",
            json={"name": "Новый владелец слота"},
            headers=headers,
        )
        assert replacement_response.status_code == 201, replacement_response.text
        replacement = replacement_response.json()
        assert replacement["legacy_variant_number"] == 2
        assert replacement["id"] != stale_variant["id"]

        stale_read = await client.get(
            "/api/v1/calc/electrical/query-capabilities",
            params={
                "project_id": project["id"],
                "variant_number": 2,
                "electrical_variant_id": stale_variant["id"],
            },
            headers=headers,
        )
        stale_specification_read = await client.get(
            f"/api/v1/specifications/{project['id']}/variants/{stale_variant['id']}",
            headers=headers,
        )
        stale_report_read = await client.get(
            f"/api/v1/reports/{project['id']}/preview",
            params={
                "variant_number": 2,
                "electrical_variant_id": stale_variant["id"],
            },
            headers=headers,
        )
        stale_write = await client.post(
            "/api/v1/calc/electrical/candidates",
            json={
                "project_id": project["id"],
                "object_id": obj["id"],
                "variant_number": 2,
                "electrical_variant_id": stale_variant["id"],
                "cable_type": "self_regulating_tt",
                "cable_source": "builtin",
                "mode": "manual",
                "cable_mark": "ТЛТ-75",
            },
            headers=headers,
        )
        stale_multi_write = await client.post(
            "/api/v1/calc/electrical/select-cable/variants",
            json={
                "object_id": obj["id"],
                "cable_mark": None,
                "cable_source": "builtin",
                "variant_numbers": [1, 2],
                "electrical_variant_ids": {
                    "1": first_variant["id"],
                    "2": stale_variant["id"],
                },
                "cable_type": "self_regulating_tt",
            },
            headers=headers,
        )

        assert stale_read.status_code == 404, stale_read.text
        assert stale_read.json()["detail"]["code"] == "ELECTRICAL_VARIANT_NOT_FOUND"
        assert stale_specification_read.status_code == 404, stale_specification_read.text
        assert stale_specification_read.json()["detail"]["code"] == (
            "ELECTRICAL_VARIANT_NOT_FOUND"
        )
        for response in (
            stale_report_read,
            stale_write,
            stale_multi_write,
        ):
            assert response.status_code == 409, response.text
            assert response.json()["detail"]["code"] == ("ELECTRICAL_VARIANT_SCOPE_MISMATCH")
        candidates_for_replacement = await db_session.scalar(
            select(func.count(ElectricalCandidate.id)).where(
                ElectricalCandidate.electrical_variant_id == UUID(replacement["id"])
            )
        )
        assert candidates_for_replacement == 0
        calculation_count = await db_session.scalar(
            select(func.count(ElectricalCalculation.id)).where(
                ElectricalCalculation.project_id == UUID(project["id"])
            )
        )
        assert calculation_count == 0

        current_read = await client.get(
            "/api/v1/calc/electrical/query-capabilities",
            params={
                "project_id": project["id"],
                "variant_number": 2,
                "electrical_variant_id": replacement["id"],
            },
            headers=headers,
        )
        assert current_read.status_code == 200, current_read.text

    async def test_legacy_row_is_bound_before_write_and_cascades_on_slot_reuse(
        self,
        client: AsyncClient,
        guest_session: str,
        db_session: AsyncSession,
    ):
        project = await _guest_project(client, guest_session)
        headers = {"X-Session-Id": guest_session}
        obj = await _add_ready_pipe(client, project["id"], headers)
        project_id = UUID(project["id"])
        object_id = UUID(obj["id"])
        legacy_row = ElectricalCalculation(
            project_id=project_id,
            object_id=object_id,
            variant_number=4,
            electrical_variant_id=None,
            cable_type="self_regulating",
            params={"source": "pre-mapping-legacy-row"},
            results={"category": "legacy"},
        )
        db_session.add(legacy_row)
        await db_session.commit()
        legacy_row_id = legacy_row.id

        calculated = await client.post(
            "/api/v1/calc/electrical/batch",
            params={"project_id": project["id"], "variant_number": 4},
            headers=headers,
        )
        assert calculated.status_code == 200, calculated.text

        variant_four = await db_session.scalar(
            select(ElectricalVariant).where(
                ElectricalVariant.project_id == project_id,
                ElectricalVariant.legacy_variant_number == 4,
            )
        )
        assert variant_four is not None
        await db_session.refresh(legacy_row)
        assert legacy_row.electrical_variant_id == variant_four.id

        deleted = await client.delete(
            f"/api/v1/projects/{project['id']}/electrical-variants/{variant_four.id}",
            headers=headers,
        )
        assert deleted.status_code == 200, deleted.text
        deleted_row_count = await db_session.scalar(
            select(func.count())
            .select_from(ElectricalCalculation)
            .where(ElectricalCalculation.id == legacy_row_id)
        )
        assert deleted_row_count == 0

        recreated_by_slot: dict[int, dict] = {}
        for expected_slot in (2, 3, 4):
            created = await client.post(
                f"/api/v1/projects/{project['id']}/electrical-variants",
                json={"name": f"Новый ЭР {expected_slot}"},
                headers=headers,
            )
            assert created.status_code == 201, created.text
            recreated_by_slot[expected_slot] = created.json()
            assert created.json()["legacy_variant_number"] == expected_slot

        await _assign_variant_object(
            client,
            project["id"],
            recreated_by_slot[4]["id"],
            obj["id"],
            headers,
        )

        recalculated = await client.post(
            "/api/v1/calc/electrical/batch",
            params={"project_id": project["id"], "variant_number": 4},
            headers=headers,
        )
        assert recalculated.status_code == 200, recalculated.text
        replacement_rows = (
            (
                await db_session.execute(
                    select(ElectricalCalculation).where(
                        ElectricalCalculation.project_id == project_id,
                        ElectricalCalculation.variant_number == 4,
                    )
                )
            )
            .scalars()
            .all()
        )
        assert len(replacement_rows) == 1
        assert replacement_rows[0].id != legacy_row_id
        assert replacement_rows[0].electrical_variant_id == UUID(recreated_by_slot[4]["id"])

    async def test_concurrent_assigned_legacy_four_enqueue_is_idempotent(
        self,
        client: AsyncClient,
        guest_session: str,
        db_session: AsyncSession,
        test_engine: AsyncEngine,
        monkeypatch: pytest.MonkeyPatch,
    ):
        monkeypatch.setattr("app.services.task_service.TaskQueue", _FakeTaskQueue)
        project = await _guest_project(client, guest_session)
        headers = {
            "X-Session-Id": guest_session,
            "Idempotency-Key": "concurrent-legacy-four",
        }
        obj = await _add_ready_pipe(client, project["id"], headers)
        await _prepare_and_assign_legacy_variant(
            client,
            project["id"],
            obj["id"],
            4,
            headers,
        )

        async with _client_with_request_scoped_sessions(test_engine) as concurrent_client:
            responses = await asyncio.gather(
                concurrent_client.post(
                    "/api/v1/calc/electrical/batch/jobs",
                    json={"project_id": project["id"], "variant_number": 4},
                    headers=headers,
                ),
                concurrent_client.post(
                    "/api/v1/calc/electrical/batch/jobs",
                    json={"project_id": project["id"], "variant_number": 4},
                    headers=headers,
                ),
            )

        assert [response.status_code for response in responses] == [202, 202]
        assert len({response.json()["id"] for response in responses}) == 1
        variants = (
            (
                await db_session.execute(
                    select(ElectricalVariant)
                    .where(ElectricalVariant.project_id == UUID(project["id"]))
                    .order_by(ElectricalVariant.sort_order)
                )
            )
            .scalars()
            .all()
        )
        assert [variant.legacy_variant_number for variant in variants] == [1, 4]

    async def test_concurrent_enqueue_and_delete_never_orphans_task(
        self,
        client: AsyncClient,
        guest_session: str,
        db_session: AsyncSession,
        test_engine: AsyncEngine,
        monkeypatch: pytest.MonkeyPatch,
    ):
        monkeypatch.setattr("app.services.task_service.TaskQueue", _FakeTaskQueue)
        project = await _guest_project(client, guest_session)
        headers = {"X-Session-Id": guest_session}
        obj = await _add_ready_pipe(client, project["id"], headers)
        await _initialize(client, project["id"], headers)
        target_response = await client.post(
            f"/api/v1/projects/{project['id']}/electrical-variants",
            json={"name": "Гонка enqueue/delete"},
            headers=headers,
        )
        assert target_response.status_code == 201, target_response.text
        target = target_response.json()
        await _assign_variant_object(
            client,
            project["id"],
            target["id"],
            obj["id"],
            headers,
        )

        async with _client_with_request_scoped_sessions(test_engine) as concurrent_client:
            enqueue_response, delete_response = await asyncio.gather(
                concurrent_client.post(
                    "/api/v1/calc/electrical/batch/jobs",
                    json={
                        "project_id": project["id"],
                        "electrical_variant_id": target["id"],
                    },
                    headers=headers,
                ),
                concurrent_client.delete(
                    f"/api/v1/projects/{project['id']}/electrical-variants/{target['id']}",
                    headers=headers,
                ),
            )

        outcomes = (enqueue_response.status_code, delete_response.status_code)
        assert outcomes in ((202, 409), (404, 200)), (
            enqueue_response.text,
            delete_response.text,
        )
        active_tasks = (
            (
                await db_session.execute(
                    select(BackgroundTask).where(
                        BackgroundTask.project_id == UUID(project["id"]),
                        BackgroundTask.status.in_(("queued", "enqueued", "running")),
                    )
                )
            )
            .scalars()
            .all()
        )
        for task in active_tasks:
            assert task.electrical_variant_id is not None
            assert await db_session.get(ElectricalVariant, task.electrical_variant_id) is not None

    async def test_candidate_apply_waits_for_delete_then_returns_stable_not_found(
        self,
        client: AsyncClient,
        guest_session: str,
        db_session: AsyncSession,
        test_engine: AsyncEngine,
        monkeypatch: pytest.MonkeyPatch,
    ):
        project = await _guest_project(client, guest_session)
        project_id = UUID(project["id"])
        headers = {"X-Session-Id": guest_session}
        obj = await _add_ready_pipe(client, project["id"], headers)
        candidate = await _create_slot_two_candidate(
            client,
            project["id"],
            obj["id"],
            headers,
        )
        candidate_row = await db_session.get(ElectricalCandidate, UUID(candidate["id"]))
        assert candidate_row is not None
        target_variant_id = candidate_row.electrical_variant_id
        assert target_variant_id is not None

        delete_has_project_lock = asyncio.Event()
        allow_delete = asyncio.Event()
        apply_read_candidate = asyncio.Event()
        original_delete = ElectricalVariantService._delete_variant
        original_get_candidate = CalculationService.get_electrical_candidate

        async def delayed_delete(service, locked_project_id, variant_id, principal):
            await service._guard_and_lock_project(locked_project_id, principal)
            delete_has_project_lock.set()
            await allow_delete.wait()
            return await original_delete(service, locked_project_id, variant_id, principal)

        async def observed_get_candidate(service, candidate_id):
            result = await original_get_candidate(service, candidate_id)
            apply_read_candidate.set()
            return result

        monkeypatch.setattr(ElectricalVariantService, "_delete_variant", delayed_delete)
        monkeypatch.setattr(
            CalculationService,
            "get_electrical_candidate",
            observed_get_candidate,
        )

        async with _client_with_request_scoped_sessions(test_engine) as concurrent_client:
            delete_task = asyncio.create_task(
                concurrent_client.delete(
                    f"/api/v1/projects/{project['id']}/electrical-variants/{target_variant_id}",
                    headers=headers,
                )
            )
            await asyncio.wait_for(delete_has_project_lock.wait(), timeout=3)
            apply_task = asyncio.create_task(
                concurrent_client.post(
                    f"/api/v1/calc/electrical/candidates/{candidate['id']}/apply",
                    headers=headers,
                )
            )
            await asyncio.wait_for(apply_read_candidate.wait(), timeout=3)
            await asyncio.sleep(0.1)
            apply_waited_for_delete = not apply_task.done()
            allow_delete.set()
            delete_response, apply_response = await asyncio.wait_for(
                asyncio.gather(delete_task, apply_task),
                timeout=10,
            )

        assert apply_waited_for_delete
        assert delete_response.status_code == 200, delete_response.text
        assert apply_response.status_code == 404, apply_response.text
        assert apply_response.json()["detail"]["code"] == "ELECTRICAL_CANDIDATE_NOT_FOUND"
        assert (
            await db_session.scalar(
                select(func.count(ElectricalVariant.id)).where(
                    ElectricalVariant.project_id == project_id,
                    ElectricalVariant.legacy_variant_number == 2,
                )
            )
            == 0
        )
        assert (
            await db_session.scalar(
                select(func.count(ElectricalCalculation.id)).where(
                    ElectricalCalculation.project_id == project_id,
                    ElectricalCalculation.variant_number == 2,
                )
            )
            == 0
        )

    async def test_candidate_apply_serializes_delete_until_apply_commit(
        self,
        client: AsyncClient,
        guest_session: str,
        db_session: AsyncSession,
        test_engine: AsyncEngine,
        monkeypatch: pytest.MonkeyPatch,
    ):
        project = await _guest_project(client, guest_session)
        project_id = UUID(project["id"])
        headers = {"X-Session-Id": guest_session}
        obj = await _add_ready_pipe(client, project["id"], headers)
        await _prepare_and_assign_legacy_variant(
            client,
            project["id"],
            obj["id"],
            1,
            headers,
        )
        await _set_project_section_current_limit(client, project["id"], headers)
        baseline_response = await client.post(
            "/api/v1/calc/electrical/candidates",
            json={
                "project_id": project["id"],
                "object_id": obj["id"],
                "variant_number": 1,
                "cable_type": "self_regulating_tt",
                "cable_source": "builtin",
                "mode": "manual",
                "cable_mark": "30ТТВ2-СР",
                "electrical_params": CANDIDATE_ELECTRICAL_PARAMS,
            },
            headers=headers,
        )
        assert baseline_response.status_code == 200, baseline_response.text
        baseline_candidate = baseline_response.json()["candidate"]
        assert baseline_candidate["status"] == "applicable", baseline_response.text
        baseline_apply = await client.post(
            f"/api/v1/calc/electrical/candidates/{baseline_candidate['id']}/apply",
            headers=headers,
        )
        assert baseline_apply.status_code == 200, baseline_apply.text
        candidate = await _create_slot_two_candidate(
            client,
            project["id"],
            obj["id"],
            headers,
        )
        candidate_row = await db_session.get(ElectricalCandidate, UUID(candidate["id"]))
        assert candidate_row is not None
        target_variant_id = candidate_row.electrical_variant_id
        assert target_variant_id is not None

        apply_reached_selection = asyncio.Event()
        allow_apply = asyncio.Event()
        original_select = CalculationService.select_cable_manual

        async def delayed_select(service, *args, **kwargs):
            apply_reached_selection.set()
            await allow_apply.wait()
            return await original_select(service, *args, **kwargs)

        monkeypatch.setattr(CalculationService, "select_cable_manual", delayed_select)

        async with _client_with_request_scoped_sessions(test_engine) as concurrent_client:
            apply_task = asyncio.create_task(
                concurrent_client.post(
                    f"/api/v1/calc/electrical/candidates/{candidate['id']}/apply",
                    headers=headers,
                )
            )
            await asyncio.wait_for(apply_reached_selection.wait(), timeout=3)
            delete_task = asyncio.create_task(
                concurrent_client.delete(
                    f"/api/v1/projects/{project['id']}/electrical-variants/{target_variant_id}",
                    headers=headers,
                )
            )
            await asyncio.sleep(0.1)
            delete_waited_for_apply = not delete_task.done()
            allow_apply.set()
            apply_response, delete_response = await asyncio.wait_for(
                asyncio.gather(apply_task, delete_task),
                timeout=10,
            )

        assert delete_waited_for_apply
        assert apply_response.status_code == 200, apply_response.text
        assert delete_response.status_code == 200, delete_response.text
        db_session.expire_all()
        assert await db_session.get(ElectricalVariant, target_variant_id) is None
        assert await db_session.get(ElectricalCandidate, UUID(candidate["id"])) is None
        calculations = list(
            (
                await db_session.execute(
                    select(ElectricalCalculation).where(
                        ElectricalCalculation.project_id == project_id
                    )
                )
            )
            .scalars()
            .all()
        )
        assert calculations
        assert all(calc.electrical_variant_id is not None for calc in calculations)
        for calc in calculations:
            assert await db_session.get(ElectricalVariant, calc.electrical_variant_id) is not None
            assignment_count = await db_session.scalar(
                select(func.count(ElectricalVariantObject.id)).where(
                    ElectricalVariantObject.electrical_variant_id == calc.electrical_variant_id,
                    ElectricalVariantObject.object_id == calc.object_id,
                )
            )
            assert assignment_count == 1

    async def test_concurrent_object_api_and_variant_create_keep_complete_assignment_graph(
        self,
        client: AsyncClient,
        guest_session: str,
        db_session: AsyncSession,
        test_engine: AsyncEngine,
        monkeypatch: pytest.MonkeyPatch,
    ):
        project = await _guest_project(client, guest_session)
        project_id = UUID(project["id"])
        headers = {"X-Session-Id": guest_session}
        await _add_ready_pipe(client, project["id"], headers)
        await _initialize(client, project["id"], headers)

        object_flushed = asyncio.Event()
        allow_object_commit = asyncio.Event()
        original_recalculate = CalculationService.recalculate_object

        async def delayed_recalculate(service, obj):
            object_flushed.set()
            await allow_object_commit.wait()
            return await original_recalculate(service, obj)

        monkeypatch.setattr(
            CalculationService,
            "recalculate_object",
            delayed_recalculate,
        )

        async with _client_with_request_scoped_sessions(test_engine) as concurrent_client:
            object_request = asyncio.create_task(
                concurrent_client.post(
                    f"/api/v1/projects/{project['id']}/objects",
                    json={"object_type": "pipe", "params": READY_PIPE_PARAMS},
                    headers=headers,
                )
            )
            await asyncio.wait_for(object_flushed.wait(), timeout=3)
            variant_request = asyncio.create_task(
                concurrent_client.post(
                    f"/api/v1/projects/{project['id']}/electrical-variants",
                    json={"name": "ЭР2 concurrent"},
                    headers=headers,
                )
            )
            await asyncio.sleep(0.1)
            assert not variant_request.done()
            allow_object_commit.set()
            object_response, variant_response = await asyncio.wait_for(
                asyncio.gather(object_request, variant_request),
                timeout=10,
            )

        assert object_response.status_code == 201, object_response.text
        assert variant_response.status_code == 201, variant_response.text
        object_ids = set(
            (
                await db_session.execute(
                    select(ProjectObject.id).where(ProjectObject.project_id == project_id)
                )
            )
            .scalars()
            .all()
        )
        variant_ids = set(
            (
                await db_session.execute(
                    select(ElectricalVariant.id).where(ElectricalVariant.project_id == project_id)
                )
            )
            .scalars()
            .all()
        )
        assignment_pairs = set(
            (
                await db_session.execute(
                    select(
                        ElectricalVariantObject.electrical_variant_id,
                        ElectricalVariantObject.object_id,
                    ).where(ElectricalVariantObject.project_id == project_id)
                )
            ).all()
        )
        assert len(object_ids) == len(variant_ids) == 2
        assert assignment_pairs == {
            (variant_id, object_id) for variant_id in variant_ids for object_id in object_ids
        }

    async def test_excel_batch_waits_for_variant_lifecycle_and_keeps_graph_complete(
        self,
        client: AsyncClient,
        guest_session: str,
        db_session: AsyncSession,
        test_engine: AsyncEngine,
    ):
        project = await _guest_project(client, guest_session)
        project_id = UUID(project["id"])
        headers = {"X-Session-Id": guest_session}
        await _add_ready_pipe(client, project["id"], headers)
        await _initialize(client, project["id"], headers)

        session_factory = async_sessionmaker(test_engine, expire_on_commit=False)
        principal = CurrentPrincipal(role="guest", session_id=guest_session)
        async with session_factory() as lifecycle_session, session_factory() as import_session:
            await lifecycle_session.execute(
                select(Project).where(Project.id == project_id).with_for_update()
            )
            imported_object = ProjectObject(
                project_id=project_id,
                object_type="pipe",
                sort_order=1,
                params={**READY_PIPE_PARAMS, "name": "Excel concurrent"},
            )
            batch_task = asyncio.create_task(
                _commit_object_batch(
                    import_session,
                    [(imported_object, {"_row": 2})],
                    "Трубопроводы",
                )
            )
            await asyncio.sleep(0.1)
            assert not batch_task.done()

            created_variant = await ElectricalVariantService(lifecycle_session).create_empty(
                project_id,
                principal,
                name="ЭР2 during Excel",
            )
            batch_created, object_ids, errors = await asyncio.wait_for(
                batch_task,
                timeout=10,
            )

        assert created_variant.name == "ЭР2 during Excel"
        assert batch_created == 1
        assert object_ids == [imported_object.id]
        assert errors == []
        all_object_ids = set(
            (
                await db_session.execute(
                    select(ProjectObject.id).where(ProjectObject.project_id == project_id)
                )
            )
            .scalars()
            .all()
        )
        variant_ids = set(
            (
                await db_session.execute(
                    select(ElectricalVariant.id).where(ElectricalVariant.project_id == project_id)
                )
            )
            .scalars()
            .all()
        )
        assignment_pairs = set(
            (
                await db_session.execute(
                    select(
                        ElectricalVariantObject.electrical_variant_id,
                        ElectricalVariantObject.object_id,
                    ).where(ElectricalVariantObject.project_id == project_id)
                )
            ).all()
        )
        assert len(all_object_ids) == len(variant_ids) == 2
        assert assignment_pairs == {
            (variant_id, object_id) for variant_id in variant_ids for object_id in all_object_ids
        }

    async def test_concurrent_initialize_creates_exactly_one_variant(
        self,
        client: AsyncClient,
        guest_session: str,
        db_session: AsyncSession,
        test_engine: AsyncEngine,
    ):
        project = await _guest_project(client, guest_session)
        headers = {"X-Session-Id": guest_session}
        await _add_ready_pipe(client, project["id"], headers)
        url = f"/api/v1/projects/{project['id']}/electrical-variants/initialize"

        async with _client_with_request_scoped_sessions(test_engine) as concurrent_client:
            responses = await asyncio.gather(
                concurrent_client.post(url, headers=headers),
                concurrent_client.post(url, headers=headers),
            )

        assert [response.status_code for response in responses] == [200, 200]
        bodies = [response.json() for response in responses]
        assert sorted(body["created"] for body in bodies) == [False, True]
        assert len({body["variant"]["id"] for body in bodies}) == 1
        variant_count = await db_session.scalar(
            select(func.count())
            .select_from(ElectricalVariant)
            .where(ElectricalVariant.project_id == UUID(project["id"]))
        )
        assignment_count = await db_session.scalar(
            select(func.count())
            .select_from(ElectricalVariantObject)
            .where(ElectricalVariantObject.project_id == UUID(project["id"]))
        )
        assert variant_count == 1
        assert assignment_count == 1

    async def test_concurrent_create_at_limit_allows_exactly_one_fourth_variant(
        self,
        client: AsyncClient,
        guest_session: str,
        db_session: AsyncSession,
        test_engine: AsyncEngine,
    ):
        project = await _guest_project(client, guest_session)
        headers = {"X-Session-Id": guest_session}
        await _add_ready_pipe(client, project["id"], headers)
        await _initialize(client, project["id"], headers)
        for name in ("ЭР2", "ЭР3"):
            response = await client.post(
                f"/api/v1/projects/{project['id']}/electrical-variants",
                json={"name": name},
                headers=headers,
            )
            assert response.status_code == 201, response.text
        url = f"/api/v1/projects/{project['id']}/electrical-variants"

        async with _client_with_request_scoped_sessions(test_engine) as concurrent_client:
            responses = await asyncio.gather(
                concurrent_client.post(url, json={"name": "Четвёртый A"}, headers=headers),
                concurrent_client.post(url, json={"name": "Четвёртый B"}, headers=headers),
            )

        assert sorted(response.status_code for response in responses) == [201, 409]
        conflict = next(response for response in responses if response.status_code == 409)
        assert conflict.json()["detail"]["code"] == "ELECTRICAL_VARIANT_LIMIT_REACHED"
        variant_count = await db_session.scalar(
            select(func.count())
            .select_from(ElectricalVariant)
            .where(ElectricalVariant.project_id == UUID(project["id"]))
        )
        assert variant_count == 4


class TestElectricalVariantScale:
    async def test_four_variants_for_500_objects_have_constant_statement_count(
        self,
        db_session: AsyncSession,
        employee_user: User,
        test_engine: AsyncEngine,
    ):
        small_project = await _seed_ready_project_objects(
            db_session,
            employee_user,
            object_count=1,
        )
        large_project = await _seed_ready_project_objects(
            db_session,
            employee_user,
            object_count=500,
        )
        principal = CurrentPrincipal(
            role="employee",
            user_id=employee_user.id,
            email=employee_user.email,
        )
        service = ElectricalVariantService(db_session)

        with _count_sql(test_engine) as small_statements:
            await _create_four_variants(service, small_project, principal)
        with _count_sql(test_engine) as large_statements:
            await _create_four_variants(service, large_project, principal)

        variant_count = await db_session.scalar(
            select(func.count())
            .select_from(ElectricalVariant)
            .where(ElectricalVariant.project_id == large_project.id)
        )
        assignment_count = await db_session.scalar(
            select(func.count())
            .select_from(ElectricalVariantObject)
            .where(ElectricalVariantObject.project_id == large_project.id)
        )

        assert variant_count == 4
        assert assignment_count == 2000
        # One-object and 500-object projects must execute the same fixed lifecycle
        # graph. The ceiling leaves room for the documented four mutations while
        # still failing decisively if assignment creation regresses to N+1.
        assert len(large_statements) == len(small_statements), "\n\n".join(large_statements)
        assert len(large_statements) <= 80, "\n\n".join(large_statements)


class TestElectricalVariantCopy:
    async def test_copy_deep_copies_available_graph_but_not_specification(
        self,
        client: AsyncClient,
        guest_session: str,
        db_session: AsyncSession,
    ):
        project = await _guest_project(client, guest_session)
        headers = {"X-Session-Id": guest_session}
        obj = await _add_ready_pipe(client, project["id"], headers)
        source = (await _initialize(client, project["id"], headers))["variant"]
        source_id = UUID(source["id"])
        project_id = UUID(project["id"])
        object_id = UUID(obj["id"])

        assignment = await db_session.scalar(
            select(ElectricalVariantObject).where(
                ElectricalVariantObject.electrical_variant_id == source_id
            )
        )
        assert assignment is not None
        assignment.system_type = "resistive"
        assignment.assignment_state = "ready"
        assignment.requested_cable_type = "single_core"
        assignment.diagnostics = {"source": "legacy-resistive"}
        calculation = ElectricalCalculation(
            project_id=project_id,
            object_id=object_id,
            variant_number=1,
            electrical_variant_id=source_id,
            cable_type="single_core",
            cable_type_source="manual",
            cable_mark="R-1",
            cable_mark_source="manual",
            params={"required_heat_loss": 123.0},
            results={"category": "resistive", "total_power": 150.0},
        )
        candidate = ElectricalCandidate(
            project_id=project_id,
            object_id=object_id,
            variant_number=1,
            electrical_variant_id=source_id,
            cable_type="single_core",
            cable_mark="R-1",
            dedupe_key="single_core:R-1",
            is_applied=True,
            params={"voltage": 220},
            results={"total_power": 150.0},
        )
        folder = ElectricalCandidateFolder(
            project_id=project_id,
            object_id=object_id,
            variant_number=1,
            electrical_variant_id=source_id,
            name="Выбранные",
            color="blue",
            created_by_session_id=guest_session,
        )
        specification = Specification(
            project_id=project_id,
            electrical_variant_id=source_id,
            items=[{"name": "Не копировать", "quantity": 1}],
        )
        db_session.add_all([calculation, candidate, folder, specification])
        await db_session.flush()
        db_session.add(
            ElectricalCandidateFolderItem(folder_id=folder.id, candidate_id=candidate.id)
        )
        await db_session.commit()

        response = await client.post(
            f"/api/v1/projects/{project['id']}/electrical-variants/{source['id']}/copy",
            json={"name": "Резистивная копия"},
            headers={**headers, "Idempotency-Key": "deep-copy-once"},
        )
        assert response.status_code == 201, response.text
        target = response.json()
        target_id = UUID(target["id"])
        assert target["copied_from_id"] == source["id"]
        assert target["legacy_variant_number"] == 2
        assert target["specification_state"] == "not_generated"

        copied_assignment = await db_session.scalar(
            select(ElectricalVariantObject).where(
                ElectricalVariantObject.electrical_variant_id == target_id
            )
        )
        copied_calculation = await db_session.scalar(
            select(ElectricalCalculation).where(
                ElectricalCalculation.electrical_variant_id == target_id
            )
        )
        copied_candidate = await db_session.scalar(
            select(ElectricalCandidate).where(
                ElectricalCandidate.electrical_variant_id == target_id
            )
        )
        copied_folder = await db_session.scalar(
            select(ElectricalCandidateFolder).where(
                ElectricalCandidateFolder.electrical_variant_id == target_id
            )
        )
        copied_specification_count = await db_session.scalar(
            select(func.count())
            .select_from(Specification)
            .where(Specification.electrical_variant_id == target_id)
        )
        assert copied_assignment is not None
        assert copied_assignment.id != assignment.id
        assert copied_assignment.system_type == "resistive"
        assert copied_assignment.requested_cable_type == "single_core"
        assert copied_assignment.diagnostics == {"source": "legacy-resistive"}
        assert copied_calculation is not None
        assert copied_calculation.id != calculation.id
        assert copied_calculation.variant_number == 2
        assert copied_calculation.params == calculation.params
        assert copied_candidate is not None
        assert copied_candidate.id != candidate.id
        assert copied_folder is not None
        assert copied_folder.id != folder.id
        copied_link = await db_session.scalar(
            select(ElectricalCandidateFolderItem).where(
                ElectricalCandidateFolderItem.folder_id == copied_folder.id,
                ElectricalCandidateFolderItem.candidate_id == copied_candidate.id,
            )
        )
        assert copied_link is not None
        assert copied_specification_count == 0

        calculation.params = {"required_heat_loss": 999.0}
        assignment.diagnostics = {"source": "changed-after-copy"}
        await db_session.commit()
        await db_session.refresh(copied_calculation)
        await db_session.refresh(copied_assignment)
        assert copied_calculation.params == {"required_heat_loss": 123.0}
        assert copied_assignment.diagnostics == {"source": "legacy-resistive"}

        delete_source = await client.delete(
            f"/api/v1/projects/{project['id']}/electrical-variants/{source['id']}",
            headers=headers,
        )
        assert delete_source.status_code == 200, delete_source.text
        assert delete_source.json()["active_variant_id"] == target["id"]
        copied_variant = await db_session.get(ElectricalVariant, target_id)
        assert copied_variant is not None
        await db_session.refresh(copied_variant)
        assert copied_variant.copied_from_id is None

    async def test_fourth_graph_copy_uses_legacy_slot_four(
        self,
        client: AsyncClient,
        guest_session: str,
        db_session: AsyncSession,
    ):
        """The fourth ER receives slot 4 and can copy the complete graph."""
        project = await _guest_project(client, guest_session)
        headers = {"X-Session-Id": guest_session}
        obj = await _add_ready_pipe(client, project["id"], headers)
        source = (await _initialize(client, project["id"], headers))["variant"]
        db_session.add(
            ElectricalCalculation(
                project_id=UUID(project["id"]),
                object_id=UUID(obj["id"]),
                variant_number=1,
                electrical_variant_id=UUID(source["id"]),
                cable_type="self_regulating",
                params={"required_heat_loss": 100.0},
                results={"total_power": 120.0},
            )
        )
        await db_session.commit()
        for name in ("ЭР2", "ЭР3"):
            created = await client.post(
                f"/api/v1/projects/{project['id']}/electrical-variants",
                json={"name": name},
                headers=headers,
            )
            assert created.status_code == 201, created.text

        response = await client.post(
            f"/api/v1/projects/{project['id']}/electrical-variants/{source['id']}/copy",
            json={"name": "ЭР4"},
            headers={**headers, "Idempotency-Key": "fourth-copy"},
        )
        assert response.status_code == 201, response.text
        body = response.json()
        assert body["legacy_variant_number"] == 4
        count = await db_session.scalar(
            select(func.count())
            .select_from(ElectricalVariant)
            .where(ElectricalVariant.project_id == UUID(project["id"]))
        )
        assert count == 4
        copied_calcs = await db_session.scalar(
            select(func.count())
            .select_from(ElectricalCalculation)
            .where(
                ElectricalCalculation.project_id == UUID(project["id"]),
                ElectricalCalculation.electrical_variant_id == UUID(body["id"]),
            )
        )
        assert copied_calcs == 1

    async def test_copy_idempotency_returns_same_target_and_rejects_key_reuse(
        self,
        client: AsyncClient,
        guest_session: str,
    ):
        project = await _guest_project(client, guest_session)
        headers = {"X-Session-Id": guest_session}
        await _add_ready_pipe(client, project["id"], headers)
        source = (await _initialize(client, project["id"], headers))["variant"]
        url = f"/api/v1/projects/{project['id']}/electrical-variants/" f"{source['id']}/copy"
        copy_headers = {**headers, "Idempotency-Key": "same-copy-click"}

        first = await client.post(
            url,
            json={"name": "Повторяемая копия"},
            headers=copy_headers,
        )
        retry = await client.post(
            url,
            json={"name": "Повторяемая копия"},
            headers=copy_headers,
        )
        mismatch = await client.post(
            url,
            json={"name": "Другая копия"},
            headers=copy_headers,
        )

        assert first.status_code == 201, first.text
        assert retry.status_code == 201, retry.text
        assert retry.json()["id"] == first.json()["id"]
        assert mismatch.status_code == 409, mismatch.text
        assert mismatch.json()["detail"]["code"] == "ELECTRICAL_VARIANT_IDEMPOTENCY_KEY_REUSED"
        listing = await client.get(
            f"/api/v1/projects/{project['id']}/electrical-variants",
            headers=headers,
        )
        assert len(listing.json()) == 2

    async def test_copy_requires_idempotency_key(
        self,
        client: AsyncClient,
        guest_session: str,
    ):
        project = await _guest_project(client, guest_session)
        headers = {"X-Session-Id": guest_session}
        await _add_ready_pipe(client, project["id"], headers)
        source = (await _initialize(client, project["id"], headers))["variant"]

        response = await client.post(
            f"/api/v1/projects/{project['id']}/electrical-variants/{source['id']}/copy",
            headers=headers,
        )

        assert response.status_code == 422, response.text

    async def test_active_background_task_blocks_delete(
        self,
        client: AsyncClient,
        guest_session: str,
        db_session: AsyncSession,
    ):
        project = await _guest_project(client, guest_session)
        headers = {"X-Session-Id": guest_session}
        await _add_ready_pipe(client, project["id"], headers)
        await _initialize(client, project["id"], headers)
        target_response = await client.post(
            f"/api/v1/projects/{project['id']}/electrical-variants",
            json={"name": "Удаляемый"},
            headers=headers,
        )
        assert target_response.status_code == 201, target_response.text
        target = target_response.json()
        task_values = {
            "type": "electrical_variant_test",
            "status": "queued",
            "project_id": UUID(project["id"]),
            "session_id": guest_session,
            "request_payload": {"electrical_variant_id": target["id"]},
        }
        if hasattr(BackgroundTask, "electrical_variant_id"):
            task_values["electrical_variant_id"] = UUID(target["id"])
        db_session.add(BackgroundTask(**task_values))
        await db_session.commit()

        response = await client.delete(
            f"/api/v1/projects/{project['id']}/electrical-variants/{target['id']}",
            headers=headers,
        )
        assert response.status_code == 409
        assert response.json()["detail"]["code"] == "ELECTRICAL_VARIANT_HAS_ACTIVE_TASKS"
