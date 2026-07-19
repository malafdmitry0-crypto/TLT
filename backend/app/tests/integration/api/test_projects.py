"""Integration-тесты CRUD проектов."""

from uuid import UUID, uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_event import AuditEvent
from app.models.electrical_calculation import ElectricalCalculation
from app.models.electrical_variant import ElectricalVariant, ElectricalVariantObject
from app.models.project_object import ProjectObject

pytestmark = pytest.mark.asyncio(loop_scope="session")

MINERAL_WOOL = "mineral_wool_boards_120"


async def _guest_project(client: AsyncClient, session_id: str) -> dict:
    """Возвращает авто-проект пользователя (создаётся при POST /auth/guest)."""
    resp = await client.get(
        "/api/v1/projects",
        headers={"X-Session-Id": session_id},
    )
    return resp.json()[0]


async def _create_employee_token(client: AsyncClient, admin_token: str) -> str:
    email = f"employee-{uuid4().hex}@test.com"
    password = "emp12345"
    resp = await client.post(
        "/api/v1/admin/users",
        json={"email": email, "password": password, "role": "employee"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 201, resp.text
    login = await client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
    )
    assert login.status_code == 200, login.text
    return login.json()["access_token"]


class TestProjectsCRUD:
    async def test_guest_has_auto_project(self, client: AsyncClient, guest_session: str):
        resp = await client.get(
            "/api/v1/projects",
            headers={"X-Session-Id": guest_session},
        )
        assert resp.status_code == 200
        projects = resp.json()
        assert len(projects) == 1
        assert projects[0]["session_id"] == guest_session

    async def test_guest_cannot_create_extra_project(self, client: AsyncClient, guest_session: str):
        resp = await client.post(
            "/api/v1/projects",
            json={"name": "Второй"},
            headers={"X-Session-Id": guest_session},
        )
        assert resp.status_code == 429

    async def test_list_projects_guest_isolation(self, client: AsyncClient, guest_session: str):
        # Создаём второго пользователя — у него свой авто-проект
        (await client.post("/api/v1/auth/guest")).json()["session_id"]
        # guest1 видит только свой
        resp = await client.get(
            "/api/v1/projects",
            headers={"X-Session-Id": guest_session},
        )
        assert resp.status_code == 200
        projects = resp.json()
        assert all(p["session_id"] == guest_session for p in projects)
        assert len(projects) == 1

    async def test_employee_sees_staff_projects_but_not_guest_projects(
        self, client: AsyncClient, guest_session: str, employee_token: str, admin_token: str
    ):
        guest_project = await _guest_project(client, guest_session)
        coworker_token = await _create_employee_token(client, admin_token)
        own_project = (
            await client.post(
                "/api/v1/projects",
                json={"name": "Свой проект"},
                headers={"Authorization": f"Bearer {employee_token}"},
            )
        ).json()
        coworker_project = (
            await client.post(
                "/api/v1/projects",
                json={"name": "Проект коллеги"},
                headers={"Authorization": f"Bearer {coworker_token}"},
            )
        ).json()
        resp = await client.get(
            "/api/v1/projects",
            headers={"Authorization": f"Bearer {employee_token}"},
        )
        assert resp.status_code == 200
        ids = {p["id"] for p in resp.json()}
        assert own_project["id"] in ids
        assert coworker_project["id"] in ids
        assert guest_project["id"] not in ids

    async def test_employee_can_open_coworker_project_by_id(
        self, client: AsyncClient, employee_token: str, admin_token: str
    ):
        coworker_token = await _create_employee_token(client, admin_token)
        coworker_project = (
            await client.post(
                "/api/v1/projects",
                json={"name": "Проект коллеги"},
                headers={"Authorization": f"Bearer {coworker_token}"},
            )
        ).json()

        resp = await client.get(
            f"/api/v1/projects/{coworker_project['id']}",
            headers={"Authorization": f"Bearer {employee_token}"},
        )

        assert resp.status_code == 200
        assert resp.json()["id"] == coworker_project["id"]

    async def test_employee_cannot_open_guest_project_by_id(
        self, client: AsyncClient, guest_session: str, employee_token: str
    ):
        """BR-AUTH-04: гостевые проекты подрядчиков не раскрываются сотруднику по прямому URL."""
        guest_project = await _guest_project(client, guest_session)

        resp = await client.get(
            f"/api/v1/projects/{guest_project['id']}",
            headers={"Authorization": f"Bearer {employee_token}"},
        )

        assert resp.status_code == 403

    async def test_employee_cannot_export_guest_project_by_id(
        self, client: AsyncClient, guest_session: str, employee_token: str
    ):
        """Экспорт CSV не должен становиться обходом приватности гостевого проекта."""
        guest_project = await _guest_project(client, guest_session)

        resp = await client.get(
            f"/api/v1/projects/{guest_project['id']}/export-csv",
            headers={"Authorization": f"Bearer {employee_token}"},
        )

        assert resp.status_code == 403

    async def test_update_project(self, client: AsyncClient, guest_session: str):
        created = await _guest_project(client, guest_session)
        resp = await client.put(
            f"/api/v1/projects/{created['id']}",
            json={"name": "B", "status": "completed"},
            headers={"X-Session-Id": guest_session},
        )
        assert resp.status_code == 200
        assert resp.json()["name"] == "B"
        assert resp.json()["status"] == "completed"

    async def test_delete_project(self, client: AsyncClient, guest_session: str):
        created = await _guest_project(client, guest_session)
        resp = await client.delete(
            f"/api/v1/projects/{created['id']}",
            headers={"X-Session-Id": guest_session},
        )
        assert resp.status_code == 204

    async def test_unauthenticated_rejected(self, client: AsyncClient):
        resp = await client.get("/api/v1/projects")
        assert resp.status_code == 401


class TestProjectDuplicate:
    async def test_guest_cannot_duplicate(self, client: AsyncClient, guest_session: str):
        created = await _guest_project(client, guest_session)
        resp = await client.post(
            f"/api/v1/projects/{created['id']}/duplicate",
            headers={"X-Session-Id": guest_session},
        )
        assert resp.status_code == 403

    async def test_employee_duplicates_with_objects(
        self,
        client: AsyncClient,
        employee_token: str,
        db_session: AsyncSession,
    ):
        headers = {"Authorization": f"Bearer {employee_token}"}
        src = (
            await client.post(
                "/api/v1/projects",
                json={"name": "Исходный", "task_number": "T-1"},
                headers=headers,
            )
        ).json()
        pipe_params = {
            "name": "Труба 1",
            "outer_diameter": 0.108,
            "insulation_thickness": 0.05,
            "insulation_material": MINERAL_WOOL,
            "insulation_temperature_basis": "outdoor_winter",
            "ambient_temperature": -20.0,
            "process_temperature": 80.0,
            "pipe_length": 50.0,
        }
        await client.post(
            f"/api/v1/projects/{src['id']}/objects",
            json={"object_type": "pipe", "sort_order": 0, "params": pipe_params},
            headers=headers,
        )

        resp = await client.post(
            f"/api/v1/projects/{src['id']}/duplicate",
            headers=headers,
        )
        assert resp.status_code == 201, resp.text
        dup = resp.json()
        assert dup["id"] != src["id"]
        assert dup["name"] == "Исходный (копия)"
        assert dup["task_number"] == "T-1"
        assert dup["status"] == "draft"

        objs = (
            await client.get(
                f"/api/v1/projects/{dup['id']}/objects",
                headers=headers,
            )
        ).json()
        assert len(objs) == 1
        assert objs[0]["object_type"] == "pipe"
        assert objs[0]["params"]["outer_diameter"] == 0.108
        # Теплорасчёт выполняется автоматически при дублировании
        assert objs[0]["is_valid"] is True
        assert objs[0]["results"] is not None

        duplicate_project_id = UUID(dup["id"])
        duplicate_object_id = UUID(objs[0]["id"])
        variants = list(
            (
                await db_session.execute(
                    select(ElectricalVariant).where(
                        ElectricalVariant.project_id == duplicate_project_id
                    )
                )
            )
            .scalars()
            .all()
        )
        assert len(variants) == 1
        variant = variants[0]
        assert variant.name == "ЭР1"
        assert variant.legacy_variant_number == 1
        assert variant.is_active is True

        calculations = list(
            (
                await db_session.execute(
                    select(ElectricalCalculation).where(
                        ElectricalCalculation.project_id == duplicate_project_id
                    )
                )
            )
            .scalars()
            .all()
        )
        assert calculations == []

        assignments = list(
            (
                await db_session.execute(
                    select(ElectricalVariantObject).where(
                        ElectricalVariantObject.project_id == duplicate_project_id
                    )
                )
            )
            .scalars()
            .all()
        )
        assert len(assignments) == 1
        assert assignments[0].object_id == duplicate_object_id
        assert assignments[0].electrical_variant_id == variant.id
        assert assignments[0].system_type is None
        assert assignments[0].assignment_state == "unassigned"
        assert assignments[0].version == 1

        null_uuid_count = await db_session.scalar(
            select(func.count())
            .select_from(ElectricalCalculation)
            .where(
                ElectricalCalculation.project_id == duplicate_project_id,
                ElectricalCalculation.electrical_variant_id.is_(None),
            )
        )
        assert null_uuid_count == 0

        calculation_scope_mismatches = await db_session.scalar(
            select(func.count())
            .select_from(ElectricalCalculation)
            .join(
                ElectricalVariant,
                ElectricalVariant.id == ElectricalCalculation.electrical_variant_id,
            )
            .join(ProjectObject, ProjectObject.id == ElectricalCalculation.object_id)
            .where(
                ElectricalCalculation.project_id == duplicate_project_id,
                (
                    (ElectricalVariant.project_id != ElectricalCalculation.project_id)
                    | (ProjectObject.project_id != ElectricalCalculation.project_id)
                ),
            )
        )
        assignment_scope_mismatches = await db_session.scalar(
            select(func.count())
            .select_from(ElectricalVariantObject)
            .join(
                ElectricalVariant,
                ElectricalVariant.id == ElectricalVariantObject.electrical_variant_id,
            )
            .join(ProjectObject, ProjectObject.id == ElectricalVariantObject.object_id)
            .where(
                ElectricalVariantObject.project_id == duplicate_project_id,
                (
                    (ElectricalVariant.project_id != ElectricalVariantObject.project_id)
                    | (ProjectObject.project_id != ElectricalVariantObject.project_id)
                ),
            )
        )
        assert calculation_scope_mismatches == 0
        assert assignment_scope_mismatches == 0

        duplicate_audit = await db_session.scalar(
            select(AuditEvent).where(
                AuditEvent.event_type == "project.duplicated",
                AuditEvent.project_id == duplicate_project_id,
            )
        )
        assert duplicate_audit is not None
        assert duplicate_audit.details["electrical_status"] == "initialized_unassigned"
        assert duplicate_audit.details["electrical_variant_id"] == str(variant.id)
        assert duplicate_audit.details["legacy_variant_number"] == 1
        assert duplicate_audit.details["electrical_readiness_issue_codes"] == []

    async def test_employee_duplicate_not_ready_remains_heat_only_project(
        self,
        client: AsyncClient,
        employee_token: str,
        db_session: AsyncSession,
    ):
        headers = {"Authorization": f"Bearer {employee_token}"}
        source = (
            await client.post(
                "/api/v1/projects",
                json={"name": "Неготовый исходный проект"},
                headers=headers,
            )
        ).json()
        invalid_object = await client.post(
            f"/api/v1/projects/{source['id']}/objects",
            json={
                "object_type": "pipe",
                "params": {
                    "outer_diameter": 0.1,
                    "wall_thickness": None,
                    "pipe_material": None,
                    "insulation_thickness": 0.05,
                    "insulation_material": MINERAL_WOOL,
                    "insulation_temperature_basis": "outdoor_winter",
                    "ambient_temperature": -20,
                    "process_temperature": 80,
                    "pipe_length": 10,
                },
            },
            headers=headers,
        )
        assert invalid_object.status_code == 201, invalid_object.text
        assert invalid_object.json()["is_valid"] is False

        response = await client.post(
            f"/api/v1/projects/{source['id']}/duplicate",
            headers=headers,
        )

        assert response.status_code == 201, response.text
        duplicate_project_id = UUID(response.json()["id"])
        duplicated_objects = (
            await client.get(
                f"/api/v1/projects/{duplicate_project_id}/objects",
                headers=headers,
            )
        ).json()
        assert len(duplicated_objects) == 1
        assert duplicated_objects[0]["is_valid"] is False
        assert duplicated_objects[0]["results"] is None

        variant_count = await db_session.scalar(
            select(func.count(ElectricalVariant.id)).where(
                ElectricalVariant.project_id == duplicate_project_id
            )
        )
        assignment_count = await db_session.scalar(
            select(func.count(ElectricalVariantObject.id)).where(
                ElectricalVariantObject.project_id == duplicate_project_id
            )
        )
        calculation_count = await db_session.scalar(
            select(func.count(ElectricalCalculation.id)).where(
                ElectricalCalculation.project_id == duplicate_project_id
            )
        )
        assert variant_count == 0
        assert assignment_count == 0
        assert calculation_count == 0

        duplicate_audit = await db_session.scalar(
            select(AuditEvent).where(
                AuditEvent.event_type == "project.duplicated",
                AuditEvent.project_id == duplicate_project_id,
            )
        )
        assert duplicate_audit is not None
        assert duplicate_audit.details["electrical_status"] == "skipped_not_ready"
        assert duplicate_audit.details["electrical_variant_id"] is None
        assert duplicate_audit.details["legacy_variant_number"] is None
        assert duplicate_audit.details["electrical_readiness_issue_codes"] == [
            "ELECTRICAL_OBJECT_NOT_READY"
        ]

    async def test_duplicate_nonexistent_returns_404(
        self, client: AsyncClient, employee_token: str
    ):
        resp = await client.post(
            "/api/v1/projects/00000000-0000-0000-0000-000000000000/duplicate",
            headers={"Authorization": f"Bearer {employee_token}"},
        )
        assert resp.status_code == 404


class TestProjectAccessAndEdges:
    """Покрытие крайних случаев доступа: чужие проекты, 403/404, лимиты."""

    async def test_get_project_404_for_unknown(self, client: AsyncClient, employee_token: str):
        resp = await client.get(
            "/api/v1/projects/00000000-0000-0000-0000-000000000000",
            headers={"Authorization": f"Bearer {employee_token}"},
        )
        assert resp.status_code == 404

    async def test_employee_cannot_edit_other_employee_project(
        self, client: AsyncClient, employee_token: str, admin_token: str
    ):
        """Сотрудник не видит и не редактирует чужой проект."""
        # Создаём проект под админом
        owner = (
            await client.post(
                "/api/v1/projects",
                json={"name": "Чужой"},
                headers={"Authorization": f"Bearer {admin_token}"},
            )
        ).json()
        # Сотрудник пытается обновить — 403
        resp = await client.put(
            f"/api/v1/projects/{owner['id']}",
            json={"name": "Hacked"},
            headers={"Authorization": f"Bearer {employee_token}"},
        )
        assert resp.status_code == 403

    async def test_employee_cannot_delete_other_employee_project(
        self, client: AsyncClient, employee_token: str, admin_token: str
    ):
        owner = (
            await client.post(
                "/api/v1/projects",
                json={"name": "Не-удалю"},
                headers={"Authorization": f"Bearer {admin_token}"},
            )
        ).json()
        resp = await client.delete(
            f"/api/v1/projects/{owner['id']}",
            headers={"Authorization": f"Bearer {employee_token}"},
        )
        assert resp.status_code == 403

    async def test_delete_nonexistent_project_404(self, client: AsyncClient, employee_token: str):
        resp = await client.delete(
            "/api/v1/projects/00000000-0000-0000-0000-000000000000",
            headers={"Authorization": f"Bearer {employee_token}"},
        )
        assert resp.status_code == 404

    async def test_update_nonexistent_project_404(self, client: AsyncClient, employee_token: str):
        resp = await client.put(
            "/api/v1/projects/00000000-0000-0000-0000-000000000000",
            json={"name": "X"},
            headers={"Authorization": f"Bearer {employee_token}"},
        )
        assert resp.status_code == 404

    async def test_employee_sees_registered_projects_via_visibility_filter(
        self, client: AsyncClient, employee_token: str, admin_token: str
    ):
        """Сотрудник видит user-owned проекты, но guest-owned скрываются отдельными тестами."""
        before = (
            await client.get(
                "/api/v1/projects",
                headers={"Authorization": f"Bearer {employee_token}"},
            )
        ).json()
        foreign = (
            await client.post(
                "/api/v1/projects",
                json={"name": "Admin's"},
                headers={"Authorization": f"Bearer {admin_token}"},
            )
        ).json()
        after = (
            await client.get(
                "/api/v1/projects",
                headers={"Authorization": f"Bearer {employee_token}"},
            )
        ).json()
        assert len(after) == len(before) + 1
        assert foreign["id"] in {p["id"] for p in after}

    async def test_admin_sees_all_projects(
        self, client: AsyncClient, employee_token: str, admin_token: str
    ):
        own = (
            await client.post(
                "/api/v1/projects",
                json={"name": "Employee's"},
                headers={"Authorization": f"Bearer {employee_token}"},
            )
        ).json()
        admin_project = (
            await client.post(
                "/api/v1/projects",
                json={"name": "Admin's"},
                headers={"Authorization": f"Bearer {admin_token}"},
            )
        ).json()
        after = (
            await client.get(
                "/api/v1/projects",
                headers={"Authorization": f"Bearer {admin_token}"},
            )
        ).json()
        ids = {p["id"] for p in after}
        assert own["id"] in ids
        assert admin_project["id"] in ids
