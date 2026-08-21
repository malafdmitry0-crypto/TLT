"""Integration-тесты на ветки авторизации в core/dependencies.py."""

import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio(loop_scope="session")


class TestAuthBranches:
    """Покрытие веток get_current_user / get_current_user_or_guest."""

    async def test_no_auth_no_session_returns_401(self, client: AsyncClient):
        resp = await client.get("/api/v1/projects")
        assert resp.status_code == 401

    async def test_invalid_jwt_returns_401(self, client: AsyncClient):
        resp = await client.get(
            "/api/v1/projects",
            headers={"Authorization": "Bearer this-is-not-a-jwt"},
        )
        assert resp.status_code == 401

    async def test_refresh_token_used_as_access_returns_401(self, client: AsyncClient):
        """Refresh-токен передан как Bearer access — должен отвергнуться."""
        from app.core.security import create_refresh_token

        refresh = create_refresh_token("00000000-0000-0000-0000-000000000001")
        resp = await client.get(
            "/api/v1/projects",
            headers={"Authorization": f"Bearer {refresh}"},
        )
        assert resp.status_code == 401

    async def test_jwt_with_unknown_user_returns_401(self, client: AsyncClient):
        from app.core.security import create_access_token

        token = create_access_token("00000000-0000-0000-0000-000000000099", role="employee")
        resp = await client.get(
            "/api/v1/projects",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 401

    async def test_unknown_session_id_returns_401(self, client: AsyncClient):
        resp = await client.get(
            "/api/v1/projects",
            headers={"X-Session-Id": "totally-unknown-session"},
        )
        assert resp.status_code == 401

    async def test_admin_token_can_access_admin_endpoints(
        self, client: AsyncClient, admin_token: str
    ):
        resp = await client.get(
            "/api/v1/admin/users",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 200

    async def test_employee_token_blocked_from_admin_endpoints(
        self, client: AsyncClient, employee_token: str
    ):
        resp = await client.put(
            "/api/v1/admin/coefficients/x",
            json={"value": 1.0},
            headers={"Authorization": f"Bearer {employee_token}"},
        )
        assert resp.status_code == 403


class TestRefreshFlow:
    async def test_refresh_returns_new_token_pair(self, client: AsyncClient, employee_token: str):
        login = await client.post(
            "/api/v1/auth/login",
            json={"email": "employee@test.com", "password": "emp12345"},
        )
        assert login.status_code == 200
        refresh = login.json()["refresh_token"]
        resp = await client.post(
            "/api/v1/auth/refresh",
            json={"refresh_token": refresh},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["access_token"] and body["refresh_token"]

    async def test_refresh_with_access_token_rejected(
        self, client: AsyncClient, employee_token: str
    ):
        resp = await client.post(
            "/api/v1/auth/refresh",
            json={"refresh_token": employee_token},  # это access, не refresh
        )
        assert resp.status_code == 401

    async def test_refresh_with_garbage_rejected(self, client: AsyncClient):
        resp = await client.post(
            "/api/v1/auth/refresh",
            json={"refresh_token": "garbage"},
        )
        assert resp.status_code == 401
