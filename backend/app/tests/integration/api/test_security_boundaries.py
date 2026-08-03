"""КРИТИЧЕСКИЕ тесты безопасности: data leak, permission boundaries.

Цена ошибки: один пользователь видит/удаляет данные другого = data breach.
Это самый дорогой класс багов — отдельный набор тестов на ВСЕ роли × ВСЕ методы.
"""

import pytest
from httpx import AsyncClient

from app.tests.heat_fixtures import canonical_pipe_params

pytestmark = pytest.mark.asyncio(loop_scope="session")


class FakeTaskQueue:
    async def enqueue(self, task_id, task_type: str) -> str:
        return f"security-test:{task_id}:{task_type}"


async def _guest_project_with_object(client: AsyncClient) -> tuple[str, dict, dict]:
    sid = (await client.post("/api/v1/auth/guest")).json()["session_id"]
    project = (await client.get("/api/v1/projects", headers={"X-Session-Id": sid})).json()[0]
    obj_resp = await client.post(
        f"/api/v1/projects/{project['id']}/objects",
        json={
            "object_type": "pipe",
            "sort_order": 0,
            "params": canonical_pipe_params(
                ambient_temperature=-20.0,
                pipe_length=10.0,
            ),
        },
        headers={"X-Session-Id": sid},
    )
    assert obj_resp.status_code in (200, 201), obj_resp.text
    return sid, project, obj_resp.json()


class TestGuestIsolation:
    """Пользователь A никак не должен видеть/изменять данные пользователя B."""

    async def test_guest_b_cannot_get_guest_a_project(self, client: AsyncClient):
        # Гость A создаётся с авто-проектом
        sid_a = (await client.post("/api/v1/auth/guest")).json()["session_id"]
        proj_a = (await client.get("/api/v1/projects", headers={"X-Session-Id": sid_a})).json()[0]

        # Гость B пытается прочитать проект A
        sid_b = (await client.post("/api/v1/auth/guest")).json()["session_id"]
        resp = await client.get(
            f"/api/v1/projects/{proj_a['id']}",
            headers={"X-Session-Id": sid_b},
        )
        assert resp.status_code in (
            403,
            404,
        ), f"DATA LEAK: гость B получил проект гостя A ({resp.status_code})"

    async def test_guest_b_cannot_update_guest_a_project(self, client: AsyncClient):
        sid_a = (await client.post("/api/v1/auth/guest")).json()["session_id"]
        proj_a = (await client.get("/api/v1/projects", headers={"X-Session-Id": sid_a})).json()[0]
        sid_b = (await client.post("/api/v1/auth/guest")).json()["session_id"]

        resp = await client.put(
            f"/api/v1/projects/{proj_a['id']}",
            json={"name": "HACKED"},
            headers={"X-Session-Id": sid_b},
        )
        assert resp.status_code in (403, 404)

    async def test_guest_b_cannot_delete_guest_a_project(self, client: AsyncClient):
        sid_a = (await client.post("/api/v1/auth/guest")).json()["session_id"]
        proj_a = (await client.get("/api/v1/projects", headers={"X-Session-Id": sid_a})).json()[0]
        sid_b = (await client.post("/api/v1/auth/guest")).json()["session_id"]

        resp = await client.delete(
            f"/api/v1/projects/{proj_a['id']}",
            headers={"X-Session-Id": sid_b},
        )
        assert resp.status_code in (403, 404)

    async def test_guest_b_cannot_add_object_to_guest_a_project(self, client: AsyncClient):
        sid_a = (await client.post("/api/v1/auth/guest")).json()["session_id"]
        proj_a = (await client.get("/api/v1/projects", headers={"X-Session-Id": sid_a})).json()[0]
        sid_b = (await client.post("/api/v1/auth/guest")).json()["session_id"]

        resp = await client.post(
            f"/api/v1/projects/{proj_a['id']}/objects",
            json={"object_type": "pipe", "sort_order": 0, "params": {"x": 1}},
            headers={"X-Session-Id": sid_b},
        )
        assert resp.status_code in (403, 404)

    async def test_guest_b_does_not_see_guest_a_in_list(self, client: AsyncClient):
        sid_a = (await client.post("/api/v1/auth/guest")).json()["session_id"]
        sid_b = (await client.post("/api/v1/auth/guest")).json()["session_id"]
        list_b = (await client.get("/api/v1/projects", headers={"X-Session-Id": sid_b})).json()
        # У B только его собственный авто-проект
        assert all(p["session_id"] == sid_b for p in list_b)
        assert all(p["session_id"] != sid_a for p in list_b)

    async def test_guest_a_cannot_export_guest_b_project_csv(self, client: AsyncClient):
        sid_a = (await client.post("/api/v1/auth/guest")).json()["session_id"]
        proj_a = (await client.get("/api/v1/projects", headers={"X-Session-Id": sid_a})).json()[0]
        sid_b = (await client.post("/api/v1/auth/guest")).json()["session_id"]

        resp = await client.get(
            f"/api/v1/projects/{proj_a['id']}/export-csv",
            headers={"X-Session-Id": sid_b},
        )
        assert resp.status_code in (403, 404)

    async def test_guest_b_cannot_preview_guest_a_report(self, client: AsyncClient):
        _, project, _ = await _guest_project_with_object(client)
        sid_b = (await client.post("/api/v1/auth/guest")).json()["session_id"]

        resp = await client.get(
            f"/api/v1/reports/{project['id']}/preview",
            headers={"X-Session-Id": sid_b},
        )
        assert resp.status_code in (403, 404)

    async def test_guest_b_cannot_recalculate_guest_a_heat_loss(self, client: AsyncClient):
        _, project, _ = await _guest_project_with_object(client)
        sid_b = (await client.post("/api/v1/auth/guest")).json()["session_id"]

        resp = await client.post(
            f"/api/v1/calc/heat-loss/batch?project_id={project['id']}",
            headers={"X-Session-Id": sid_b},
        )
        assert resp.status_code in (403, 404)

    async def test_guest_b_cannot_list_guest_a_electrical_calcs(self, client: AsyncClient):
        _, project, _ = await _guest_project_with_object(client)
        sid_b = (await client.post("/api/v1/auth/guest")).json()["session_id"]

        resp = await client.get(
            f"/api/v1/calc/electrical?project_id={project['id']}",
            headers={"X-Session-Id": sid_b},
        )
        assert resp.status_code in (403, 404)

    async def test_guest_b_cannot_calc_guest_a_object_electrical(self, client: AsyncClient):
        _, _, obj = await _guest_project_with_object(client)
        sid_b = (await client.post("/api/v1/auth/guest")).json()["session_id"]

        resp = await client.post(
            "/api/v1/calc/electrical",
            json={"object_id": obj["id"], "cable_type": "self_regulating", "data": {}},
            headers={"X-Session-Id": sid_b},
        )
        assert resp.status_code in (403, 404)

    async def test_guest_b_cannot_select_cable_for_guest_a_object(self, client: AsyncClient):
        _, _, obj = await _guest_project_with_object(client)
        sid_b = (await client.post("/api/v1/auth/guest")).json()["session_id"]

        resp = await client.post(
            "/api/v1/calc/electrical/select-cable",
            params={
                "object_id": obj["id"],
                "cable_mark": "ТЛТ-25",
                "cable_type": "self_regulating",
            },
            headers={"X-Session-Id": sid_b},
        )
        assert resp.status_code in (403, 404)

    async def test_guest_b_cannot_batch_calc_guest_a_electrical(self, client: AsyncClient):
        _, project, _ = await _guest_project_with_object(client)
        sid_b = (await client.post("/api/v1/auth/guest")).json()["session_id"]

        resp = await client.post(
            f"/api/v1/calc/electrical/batch?project_id={project['id']}",
            headers={"X-Session-Id": sid_b},
        )
        assert resp.status_code in (403, 404)

    async def test_guest_b_cannot_get_guest_a_cable_options(self, client: AsyncClient):
        _, _, obj = await _guest_project_with_object(client)
        sid_b = (await client.post("/api/v1/auth/guest")).json()["session_id"]

        resp = await client.get(
            f"/api/v1/calc/cable-options/{obj['id']}",
            headers={"X-Session-Id": sid_b},
        )
        assert resp.status_code in (403, 404)

    async def test_guest_cannot_enqueue_or_cancel_task_for_foreign_session_project(
        self,
        client: AsyncClient,
        monkeypatch: pytest.MonkeyPatch,
    ):
        monkeypatch.setattr("app.services.task_service.TaskQueue", FakeTaskQueue)
        sid_a = (await client.post("/api/v1/auth/guest")).json()["session_id"]
        project_a = (await client.get("/api/v1/projects", headers={"X-Session-Id": sid_a})).json()[
            0
        ]
        sid_b = (await client.post("/api/v1/auth/guest")).json()["session_id"]

        foreign_enqueue = await client.post(
            "/api/v1/calc/heat-loss/batch/jobs",
            json={"project_id": project_a["id"]},
            headers={"X-Session-Id": sid_b},
        )
        assert foreign_enqueue.status_code == 403

        owner_enqueue = await client.post(
            "/api/v1/calc/heat-loss/batch/jobs",
            json={"project_id": project_a["id"]},
            headers={"X-Session-Id": sid_a},
        )
        assert owner_enqueue.status_code == 202, owner_enqueue.text
        task_id = owner_enqueue.json()["id"]

        foreign_cancel = await client.post(
            f"/api/v1/calc/jobs/{task_id}/cancel",
            headers={"X-Session-Id": sid_b},
        )
        assert foreign_cancel.status_code == 403

        owner_cancel = await client.post(
            f"/api/v1/calc/jobs/{task_id}/cancel",
            headers={"X-Session-Id": sid_a},
        )
        assert owner_cancel.status_code == 200, owner_cancel.text


class TestGuestCannotAccessEmployeeFeatures:
    """Гость не должен дёргать сотруднические endpoints даже зная URL."""

    async def test_guest_cannot_duplicate_project(self, client: AsyncClient, employee_token: str):
        # Сотрудник создаёт проект
        emp = await client.post(
            "/api/v1/projects",
            json={"name": "Emp project"},
            headers={"Authorization": f"Bearer {employee_token}"},
        )
        proj = emp.json()
        sid_g = (await client.post("/api/v1/auth/guest")).json()["session_id"]
        # Гость пытается дублировать
        resp = await client.post(
            f"/api/v1/projects/{proj['id']}/duplicate",
            headers={"X-Session-Id": sid_g},
        )
        assert resp.status_code == 403

    async def test_guest_cannot_export_objects_excel(self, client: AsyncClient):
        sid_g = (await client.post("/api/v1/auth/guest")).json()["session_id"]
        proj = (await client.get("/api/v1/projects", headers={"X-Session-Id": sid_g})).json()[0]
        # GET export-excel — для сотрудника
        resp = await client.get(
            f"/api/v1/projects/{proj['id']}/objects/export-excel",
            headers={"X-Session-Id": sid_g},
        )
        assert resp.status_code == 403

    async def test_guest_cannot_export_csv_bulk(self, client: AsyncClient):
        sid_g = (await client.post("/api/v1/auth/guest")).json()["session_id"]
        proj = (await client.get("/api/v1/projects", headers={"X-Session-Id": sid_g})).json()[0]
        resp = await client.get(
            f"/api/v1/projects/export-csv-bulk?ids={proj['id']}",
            headers={"X-Session-Id": sid_g},
        )
        assert resp.status_code == 403

    async def test_guest_cannot_save_specification_items(self, client: AsyncClient):
        sid_g = (await client.post("/api/v1/auth/guest")).json()["session_id"]
        proj = (await client.get("/api/v1/projects", headers={"X-Session-Id": sid_g})).json()[0]
        resp = await client.put(
            f"/api/v1/specifications/{proj['id']}/items",
            json={"items": []},
            headers={"X-Session-Id": sid_g},
        )
        assert resp.status_code == 403

    async def test_guest_cannot_export_report_pdf(self, client: AsyncClient):
        sid_g = (await client.post("/api/v1/auth/guest")).json()["session_id"]
        proj = (await client.get("/api/v1/projects", headers={"X-Session-Id": sid_g})).json()[0]
        resp = await client.get(
            f"/api/v1/reports/{proj['id']}/export/pdf",
            headers={"X-Session-Id": sid_g},
        )
        assert resp.status_code == 403


class TestEmployeeCannotEditOthersProjects:
    """Сотрудник может читать user-owned проекты, но не должен менять чужие."""

    async def test_employee_cannot_edit_admin_project(
        self, client: AsyncClient, employee_token: str, admin_token: str
    ):
        admin_proj = (
            await client.post(
                "/api/v1/projects",
                json={"name": "Админский"},
                headers={"Authorization": f"Bearer {admin_token}"},
            )
        ).json()
        resp = await client.put(
            f"/api/v1/projects/{admin_proj['id']}",
            json={"name": "Hijacked"},
            headers={"Authorization": f"Bearer {employee_token}"},
        )
        assert resp.status_code == 403

    async def test_employee_cannot_delete_admin_project(
        self, client: AsyncClient, employee_token: str, admin_token: str
    ):
        admin_proj = (
            await client.post(
                "/api/v1/projects",
                json={"name": "Защищённый"},
                headers={"Authorization": f"Bearer {admin_token}"},
            )
        ).json()
        resp = await client.delete(
            f"/api/v1/projects/{admin_proj['id']}",
            headers={"Authorization": f"Bearer {employee_token}"},
        )
        assert resp.status_code == 403

    async def test_employee_cannot_add_object_to_admin_project(
        self, client: AsyncClient, employee_token: str, admin_token: str
    ):
        admin_proj = (
            await client.post(
                "/api/v1/projects",
                json={"name": "Read-only для других"},
                headers={"Authorization": f"Bearer {admin_token}"},
            )
        ).json()
        resp = await client.post(
            f"/api/v1/projects/{admin_proj['id']}/objects",
            json={"object_type": "pipe", "sort_order": 0, "params": {}},
            headers={"Authorization": f"Bearer {employee_token}"},
        )
        assert resp.status_code == 403

    async def test_employee_can_read_but_cannot_mutate_admin_project_specification(
        self,
        client: AsyncClient,
        employee_token: str,
        admin_token: str,
    ):
        admin_headers = {"Authorization": f"Bearer {admin_token}"}
        employee_headers = {"Authorization": f"Bearer {employee_token}"}
        project = (
            await client.post(
                "/api/v1/projects",
                json={"name": "Чужая спецификация"},
                headers=admin_headers,
            )
        ).json()

        read_resp = await client.get(
            f"/api/v1/specifications/{project['id']}",
            headers=employee_headers,
        )
        assert read_resp.status_code == 200

        generate_resp = await client.post(
            f"/api/v1/specifications/{project['id']}/generate",
            json={"variant_ids": ["00000000-0000-0000-0000-000000000001"]},
            headers=employee_headers,
        )
        save_resp = await client.put(
            f"/api/v1/specifications/{project['id']}/items",
            json={"items": []},
            headers=employee_headers,
        )

        assert generate_resp.status_code == 403
        assert save_resp.status_code == 403

        read_after = await client.get(
            f"/api/v1/specifications/{project['id']}",
            headers=employee_headers,
        )
        assert read_after.status_code == 200
        assert read_after.json() is None

    async def test_employee_cannot_enqueue_admin_project_tasks(
        self,
        client: AsyncClient,
        employee_token: str,
        admin_token: str,
        monkeypatch: pytest.MonkeyPatch,
    ):
        monkeypatch.setattr("app.services.task_service.TaskQueue", FakeTaskQueue)
        admin_headers = {"Authorization": f"Bearer {admin_token}"}
        employee_headers = {"Authorization": f"Bearer {employee_token}"}
        project = (
            await client.post(
                "/api/v1/projects",
                json={"name": "Чужие фоновые задачи"},
                headers=admin_headers,
            )
        ).json()

        heat_resp = await client.post(
            "/api/v1/calc/heat-loss/batch/jobs",
            json={"project_id": project["id"]},
            headers=employee_headers,
        )
        electrical_resp = await client.post(
            "/api/v1/calc/electrical/batch/jobs",
            json={"project_id": project["id"]},
            headers=employee_headers,
        )
        report_resp = await client.post(
            f"/api/v1/reports/{project['id']}/export/pdf/jobs",
            params={"variant_number": 1},
            headers=employee_headers,
        )

        assert heat_resp.status_code == 403
        assert electrical_resp.status_code == 403
        assert report_resp.status_code == 403

    async def test_employee_can_read_but_cannot_cancel_admin_project_task(
        self,
        client: AsyncClient,
        employee_token: str,
        admin_token: str,
        monkeypatch: pytest.MonkeyPatch,
    ):
        monkeypatch.setattr("app.services.task_service.TaskQueue", FakeTaskQueue)
        admin_headers = {"Authorization": f"Bearer {admin_token}"}
        employee_headers = {"Authorization": f"Bearer {employee_token}"}
        project = (
            await client.post(
                "/api/v1/projects",
                json={"name": "Чужая отмена задачи"},
                headers=admin_headers,
            )
        ).json()

        owner_enqueue = await client.post(
            "/api/v1/calc/heat-loss/batch/jobs",
            json={"project_id": project["id"]},
            headers=admin_headers,
        )
        assert owner_enqueue.status_code == 202, owner_enqueue.text
        task_id = owner_enqueue.json()["id"]

        read_resp = await client.get(
            f"/api/v1/calc/jobs/{task_id}",
            headers=employee_headers,
        )
        assert read_resp.status_code == 200

        cancel_resp = await client.post(
            f"/api/v1/calc/jobs/{task_id}/cancel",
            headers=employee_headers,
        )
        assert cancel_resp.status_code == 403

        owner_status = await client.get(
            f"/api/v1/calc/jobs/{task_id}",
            headers=admin_headers,
        )
        assert owner_status.status_code == 200
        assert owner_status.json()["status"] == "enqueued"
        assert owner_status.json()["cancel_requested"] is False

    async def test_admin_keeps_write_access_to_employee_project_tasks(
        self,
        client: AsyncClient,
        employee_token: str,
        admin_token: str,
        monkeypatch: pytest.MonkeyPatch,
    ):
        monkeypatch.setattr("app.services.task_service.TaskQueue", FakeTaskQueue)
        employee_headers = {"Authorization": f"Bearer {employee_token}"}
        admin_headers = {"Authorization": f"Bearer {admin_token}"}
        project = (
            await client.post(
                "/api/v1/projects",
                json={"name": "Проект под сопровождением"},
                headers=employee_headers,
            )
        ).json()

        enqueue_resp = await client.post(
            "/api/v1/calc/heat-loss/batch/jobs",
            json={"project_id": project["id"]},
            headers=admin_headers,
        )
        assert enqueue_resp.status_code == 202, enqueue_resp.text

        cancel_resp = await client.post(
            f"/api/v1/calc/jobs/{enqueue_resp.json()['id']}/cancel",
            headers=admin_headers,
        )
        assert cancel_resp.status_code == 200, cancel_resp.text
        assert cancel_resp.json()["status"] == "cancelled"


class TestEmployeeNotAdmin:
    """Сотрудник не должен попасть в админку, даже зная URL."""

    @pytest.mark.parametrize(
        "path,method",
        [
            ("/api/v1/admin/users", "GET"),
            ("/api/v1/admin/coefficients", "GET"),
            ("/api/v1/admin/cables", "GET"),
            ("/api/v1/admin/accessories", "GET"),
        ],
    )
    async def test_employee_blocked_from_admin_endpoint(
        self, client: AsyncClient, employee_token: str, path: str, method: str
    ):
        resp = await client.request(
            method,
            path,
            headers={"Authorization": f"Bearer {employee_token}"},
        )
        assert (
            resp.status_code == 403
        ), f"PERM LEAK: сотрудник получил доступ к {path} ({resp.status_code})"

    async def test_employee_cannot_create_user(self, client: AsyncClient, employee_token: str):
        resp = await client.post(
            "/api/v1/admin/users",
            json={"email": "evil@x", "password": "qwerty12", "role": "admin"},
            headers={"Authorization": f"Bearer {employee_token}"},
        )
        assert resp.status_code == 403

    async def test_employee_cannot_update_coefficient(
        self, client: AsyncClient, employee_token: str
    ):
        resp = await client.put(
            "/api/v1/admin/coefficients/safety_factor",
            json={"value": 0.1},  # опасное значение
            headers={"Authorization": f"Bearer {employee_token}"},
        )
        assert resp.status_code == 403


class TestUnauthenticatedBlocked:
    """Без токена/сессии — никаких операций. Анонимы видят только / и /login."""

    @pytest.mark.parametrize(
        "path,method",
        [
            ("/api/v1/projects", "GET"),
            ("/api/v1/projects", "POST"),
            ("/api/v1/admin/users", "GET"),
            ("/api/v1/references/insulation", "GET"),
            (
                "/api/v1/calc/electrical/batch?project_id=00000000-0000-0000-0000-000000000000",
                "POST",
            ),
        ],
    )
    async def test_no_auth_returns_401(self, client: AsyncClient, path: str, method: str):
        resp = await client.request(method, path)
        assert (
            resp.status_code == 401
        ), f"AUTH LEAK: {method} {path} вернул {resp.status_code} без авторизации"


class TestExpiredTokenRejected:
    """Истёкший access-token не должен пропускать запросы."""

    async def test_expired_token_returns_401(self, client: AsyncClient):
        from datetime import UTC, datetime, timedelta

        import jwt

        from app.core.config import settings

        # Создаём токен с истёкшим exp
        expired = jwt.encode(
            {
                "sub": "00000000-0000-0000-0000-000000000001",
                "role": "admin",
                "type": "access",
                "exp": datetime.now(UTC) - timedelta(hours=1),
            },
            settings.SECRET_KEY,
            algorithm=settings.ALGORITHM,
        )
        resp = await client.get(
            "/api/v1/projects",
            headers={"Authorization": f"Bearer {expired}"},
        )
        assert resp.status_code == 401
