"""Integration-тесты пользовательских UI-настроек."""

import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio(loop_scope="session")


class TestUserPreferencesApi:
    async def test_missing_preference_returns_null_value(
        self,
        client: AsyncClient,
        employee_token: str,
    ):
        resp = await client.get(
            "/api/v1/preferences/heatcalc.tableColumns.v1",
            headers={"Authorization": f"Bearer {employee_token}"},
        )

        assert resp.status_code == 200
        data = resp.json()
        assert data["key"] == "heatcalc.tableColumns.v1"
        assert data["value"] is None
        assert data["user_id"] is not None

    async def test_employee_can_upsert_preference(
        self,
        client: AsyncClient,
        employee_token: str,
    ):
        headers = {"Authorization": f"Bearer {employee_token}"}
        payload = {
            "value": {
                "version": 1,
                "table": {
                    "pipe": ["name", "pipe_dn"],
                    "tank": ["name", "tank_dimensions"],
                },
            }
        }

        first = await client.put(
            "/api/v1/preferences/heatcalc.tableColumns.v1",
            json=payload,
            headers=headers,
        )
        assert first.status_code == 200, first.text
        assert first.json()["value"]["table"]["pipe"] == ["name", "pipe_dn"]

        update = await client.put(
            "/api/v1/preferences/heatcalc.tableColumns.v1",
            json={
                "value": {
                    "version": 1,
                    "table": {
                        "pipe": ["name"],
                        "tank": ["name"],
                    },
                }
            },
            headers=headers,
        )
        assert update.status_code == 200, update.text

        read_back = await client.get(
            "/api/v1/preferences/heatcalc.tableColumns.v1",
            headers=headers,
        )
        assert read_back.status_code == 200
        assert read_back.json()["value"]["table"]["pipe"] == ["name"]

    async def test_guest_cannot_use_registered_preferences(
        self,
        client: AsyncClient,
        guest_session: str,
    ):
        resp = await client.get(
            "/api/v1/preferences/heatcalc.tableColumns.v1",
            headers={"X-Session-Id": guest_session},
        )

        assert resp.status_code == 403

    async def test_preferences_are_isolated_between_users(
        self,
        client: AsyncClient,
        employee_token: str,
        admin_token: str,
    ):
        await client.put(
            "/api/v1/preferences/heatcalc.tableColumns.v1",
            json={"value": {"version": 1, "table": {"pipe": ["name"], "tank": ["name"]}}},
            headers={"Authorization": f"Bearer {employee_token}"},
        )

        resp = await client.get(
            "/api/v1/preferences/heatcalc.tableColumns.v1",
            headers={"Authorization": f"Bearer {admin_token}"},
        )

        assert resp.status_code == 200
        assert resp.json()["value"] is None
