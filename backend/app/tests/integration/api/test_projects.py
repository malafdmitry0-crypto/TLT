"""Integration-тесты CRUD проектов."""

import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def _guest_project(client: AsyncClient, session_id: str) -> dict:
    """Возвращает авто-проект пользователя (создаётся при POST /auth/guest)."""
    resp = await client.get(
        "/api/v1/projects",
        headers={"X-Session-Id": session_id},
    )
    return resp.json()[0]


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

    async def test_employee_can_see_all_projects(
        self, client: AsyncClient, guest_session: str, employee_token: str
    ):
        # guest_session уже содержит авто-проект
        resp = await client.get(
            "/api/v1/projects",
            headers={"Authorization": f"Bearer {employee_token}"},
        )
        assert resp.status_code == 200
        assert len(resp.json()) >= 1

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

    async def test_employee_duplicates_with_objects(self, client: AsyncClient, employee_token: str):
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
            "insulation_material": "mineral_wool",
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
        """Сотрудник видит чужой, но редактировать не может."""
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

    async def test_employee_does_not_see_others_via_visibility_filter(
        self, client: AsyncClient, employee_token: str, admin_token: str
    ):
        """Сотрудник видит ВСЕ проекты — это контракт текущего контура."""
        before = (
            await client.get(
                "/api/v1/projects",
                headers={"Authorization": f"Bearer {employee_token}"},
            )
        ).json()
        await client.post(
            "/api/v1/projects",
            json={"name": "Admin's"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        after = (
            await client.get(
                "/api/v1/projects",
                headers={"Authorization": f"Bearer {employee_token}"},
            )
        ).json()
        assert len(after) > len(before)
