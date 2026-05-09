"""Integration-тесты пользовательских UI-настроек."""

from typing import Any, cast

import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio(loop_scope="session")


def heatcalc_table_columns_value(
    pipe_visible: list[str] | None = None,
    tank_visible: list[str] | None = None,
) -> dict[str, object]:
    return {
        "version": 3,
        "types": {
            "pipe": {
                "visibleOrder": pipe_visible or ["name", "pipe_dn"],
                "columns": {
                    "name": {"widthPct": 24},
                    "pipe_dn": {"widthPct": 5.8},
                },
            },
            "tank": {
                "visibleOrder": tank_visible or ["name", "tank_dimensions"],
                "columns": {
                    "name": {"widthPct": 24},
                    "tank_dimensions": {"widthPct": 19},
                },
            },
        },
    }


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
        payload = {"value": heatcalc_table_columns_value()}

        first = await client.put(
            "/api/v1/preferences/heatcalc.tableColumns.v1",
            json=payload,
            headers=headers,
        )
        assert first.status_code == 200, first.text
        assert first.json()["value"]["types"]["pipe"]["visibleOrder"] == ["name", "pipe_dn"]

        update = await client.put(
            "/api/v1/preferences/heatcalc.tableColumns.v1",
            json={"value": heatcalc_table_columns_value(["name"], ["name"])},
            headers=headers,
        )
        assert update.status_code == 200, update.text

        read_back = await client.get(
            "/api/v1/preferences/heatcalc.tableColumns.v1",
            headers=headers,
        )
        assert read_back.status_code == 200
        assert read_back.json()["value"]["types"]["pipe"]["visibleOrder"] == ["name"]

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
            json={"value": heatcalc_table_columns_value(["name"], ["name"])},
            headers={"Authorization": f"Bearer {employee_token}"},
        )

        resp = await client.get(
            "/api/v1/preferences/heatcalc.tableColumns.v1",
            headers={"Authorization": f"Bearer {admin_token}"},
        )

        assert resp.status_code == 200
        assert resp.json()["value"] is None

    async def test_heatcalc_table_columns_rejects_metadata_payload(
        self,
        client: AsyncClient,
        employee_token: str,
    ):
        value = heatcalc_table_columns_value()
        typed_value = cast(dict[str, Any], value)
        typed_value["types"]["pipe"]["columns"]["name"]["label"] = "Плохое поле"

        resp = await client.put(
            "/api/v1/preferences/heatcalc.tableColumns.v1",
            json={"value": value},
            headers={"Authorization": f"Bearer {employee_token}"},
        )

        assert resp.status_code == 422

    async def test_heatcalc_table_columns_rejects_unknown_column_key(
        self,
        client: AsyncClient,
        employee_token: str,
    ):
        value = heatcalc_table_columns_value(["name", "unknown_key"], ["name"])

        resp = await client.put(
            "/api/v1/preferences/heatcalc.tableColumns.v1",
            json={"value": value},
            headers={"Authorization": f"Bearer {employee_token}"},
        )

        assert resp.status_code == 422
