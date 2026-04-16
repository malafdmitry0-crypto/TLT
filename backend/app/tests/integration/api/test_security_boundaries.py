"""КРИТИЧЕСКИЕ тесты безопасности: data leak, permission boundaries.

Цена ошибки: один пользователь видит/удаляет данные другого = data breach.
Это самый дорогой класс багов — отдельный набор тестов на ВСЕ роли × ВСЕ методы.
"""

import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio(loop_scope="session")


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
    """Сотрудник видит чужие проекты (по матрице), но НЕ может их менять."""

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
