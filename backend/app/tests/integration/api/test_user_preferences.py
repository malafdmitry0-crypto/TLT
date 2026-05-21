"""Integration-тесты пользовательских UI-настроек."""

from typing import Any, cast

import pytest
from httpx import AsyncClient

from app.generated.heatcalc_field_contract import HEATCALC_TABLE_COLUMNS_VERSION

pytestmark = pytest.mark.asyncio(loop_scope="session")

HEATCALC_TABLE_COLUMNS_PREF_KEY = f"heatcalc.tableColumns.v{HEATCALC_TABLE_COLUMNS_VERSION}"
ELECTRICAL_TABLE_COLUMNS_VERSION = 5
ELECTRICAL_TABLE_COLUMNS_PREF_KEY = f"electrical.tableColumns.v{ELECTRICAL_TABLE_COLUMNS_VERSION}"
ELECTRICAL_TABLE_VIEW_PREF_KEY = "electrical.tableView.v4"
ELECTRICAL_CANDIDATE_TABLE_COLUMNS_PREF_KEY = "electrical.candidateTableColumns.v1"


def heatcalc_table_columns_value(
    pipe_visible: list[str] | None = None,
    tank_visible: list[str] | None = None,
) -> dict[str, object]:
    return {
        "version": HEATCALC_TABLE_COLUMNS_VERSION,
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
            "all": {
                "visibleOrder": ["index", "type", "name"],
                "columns": {
                    "index": {"widthPct": 4.2},
                    "type": {"widthPct": 7},
                    "name": {"widthPct": 24},
                },
            },
        },
    }


def heatcalc_table_view_value(
    font_size: str = "standard", form_placement: str = "top", side_form_width_pct: float = 34
) -> dict[str, object]:
    return {
        "version": 1,
        "fontSize": font_size,
        "inlineEditingEnabled": False,
        "formPlacement": form_placement,
        "sideFormWidthPct": side_form_width_pct,
    }


def heatcalc_field_inputs_value(step: float = 2.5) -> dict[str, object]:
    return {
        "version": 1,
        "fields": {
            "pipe": {
                "outer_diameter_mm": {"step": step},
            },
        },
    }


def electrical_table_columns_value(
    visible: list[str] | None = None,
) -> dict[str, object]:
    return {
        "version": ELECTRICAL_TABLE_COLUMNS_VERSION,
        "visibleOrder": visible or ["index", "object_name", "cable_mark", "current"],
        "columns": {
            "index": {"widthPct": 4},
            "object_name": {"widthPct": 22},
            "cable_mark": {"widthPct": 18},
            "current": {"widthPct": 8},
        },
    }


def electrical_table_view_value(
    font_size: str = "standard",
    table_label_format: str = "short",
    settings_label_format: str = "full",
) -> dict[str, object]:
    return {
        "version": 4,
        "fontSize": font_size,
        "tableLabelFormat": table_label_format,
        "settingsLabelFormat": settings_label_format,
        "calculationCableSource": "builtin",
    }


def electrical_candidate_table_columns_value(
    visible: list[str] | None = None,
) -> dict[str, object]:
    return {
        "version": 1,
        "visibleOrder": visible or ["marked", "actions", "mode", "cable_mark", "current"],
        "columns": {
            "marked": {"widthPct": 6.8},
            "actions": {"widthPct": 9.6},
            "mode": {"widthPct": 8.6},
            "cable_mark": {"widthPct": 19},
            "current": {"widthPct": 10},
        },
    }


class TestUserPreferencesApi:
    async def test_missing_preference_returns_null_value(
        self,
        client: AsyncClient,
        employee_token: str,
    ):
        resp = await client.get(
            f"/api/v1/preferences/{HEATCALC_TABLE_COLUMNS_PREF_KEY}",
            headers={"Authorization": f"Bearer {employee_token}"},
        )

        assert resp.status_code == 200
        data = resp.json()
        assert data["key"] == HEATCALC_TABLE_COLUMNS_PREF_KEY
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
            f"/api/v1/preferences/{HEATCALC_TABLE_COLUMNS_PREF_KEY}",
            json=payload,
            headers=headers,
        )
        assert first.status_code == 200, first.text
        assert first.json()["value"]["types"]["pipe"]["visibleOrder"] == ["name", "pipe_dn"]

        update = await client.put(
            f"/api/v1/preferences/{HEATCALC_TABLE_COLUMNS_PREF_KEY}",
            json={"value": heatcalc_table_columns_value(["name"], ["name"])},
            headers=headers,
        )
        assert update.status_code == 200, update.text

        read_back = await client.get(
            f"/api/v1/preferences/{HEATCALC_TABLE_COLUMNS_PREF_KEY}",
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
            f"/api/v1/preferences/{HEATCALC_TABLE_COLUMNS_PREF_KEY}",
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
            f"/api/v1/preferences/{HEATCALC_TABLE_COLUMNS_PREF_KEY}",
            json={"value": heatcalc_table_columns_value(["name"], ["name"])},
            headers={"Authorization": f"Bearer {employee_token}"},
        )

        resp = await client.get(
            f"/api/v1/preferences/{HEATCALC_TABLE_COLUMNS_PREF_KEY}",
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
            f"/api/v1/preferences/{HEATCALC_TABLE_COLUMNS_PREF_KEY}",
            json={"value": value},
            headers={"Authorization": f"Bearer {employee_token}"},
        )

        assert resp.status_code == 422

    async def test_employee_can_upsert_electrical_table_columns_preference(
        self,
        client: AsyncClient,
        employee_token: str,
    ):
        headers = {"Authorization": f"Bearer {employee_token}"}

        resp = await client.put(
            f"/api/v1/preferences/{ELECTRICAL_TABLE_COLUMNS_PREF_KEY}",
            json={"value": electrical_table_columns_value()},
            headers=headers,
        )

        assert resp.status_code == 200, resp.text
        assert resp.json()["value"]["visibleOrder"] == [
            "index",
            "object_name",
            "cable_mark",
            "current",
        ]

        read_back = await client.get(
            f"/api/v1/preferences/{ELECTRICAL_TABLE_COLUMNS_PREF_KEY}",
            headers=headers,
        )
        assert read_back.status_code == 200
        assert read_back.json()["value"]["columns"]["current"] == {"widthPct": 8}

    async def test_electrical_table_columns_rejects_unknown_key(
        self,
        client: AsyncClient,
        employee_token: str,
    ):
        value = electrical_table_columns_value(["index", "not_a_column"])

        resp = await client.put(
            f"/api/v1/preferences/{ELECTRICAL_TABLE_COLUMNS_PREF_KEY}",
            json={"value": value},
            headers={"Authorization": f"Bearer {employee_token}"},
        )

        assert resp.status_code == 422

    async def test_electrical_table_columns_rejects_hidden_required_cable_mark(
        self,
        client: AsyncClient,
        employee_token: str,
    ):
        value = electrical_table_columns_value(["index", "object_name", "current"])

        resp = await client.put(
            f"/api/v1/preferences/{ELECTRICAL_TABLE_COLUMNS_PREF_KEY}",
            json={"value": value},
            headers={"Authorization": f"Bearer {employee_token}"},
        )

        assert resp.status_code == 422
        assert "cable_mark" in resp.text

    async def test_employee_can_upsert_electrical_table_view_preference(
        self,
        client: AsyncClient,
        employee_token: str,
    ):
        headers = {"Authorization": f"Bearer {employee_token}"}

        resp = await client.put(
            f"/api/v1/preferences/{ELECTRICAL_TABLE_VIEW_PREF_KEY}",
            json={"value": electrical_table_view_value("compact", "full", "compact")},
            headers=headers,
        )

        assert resp.status_code == 200, resp.text
        assert resp.json()["value"] == electrical_table_view_value("compact", "full", "compact")

        read_back = await client.get(
            f"/api/v1/preferences/{ELECTRICAL_TABLE_VIEW_PREF_KEY}",
            headers=headers,
        )
        assert read_back.status_code == 200
        assert read_back.json()["value"] == electrical_table_view_value(
            "compact",
            "full",
            "compact",
        )

    async def test_electrical_table_view_rejects_unknown_label_format(
        self,
        client: AsyncClient,
        employee_token: str,
    ):
        resp = await client.put(
            f"/api/v1/preferences/{ELECTRICAL_TABLE_VIEW_PREF_KEY}",
            json={"value": electrical_table_view_value(table_label_format="verbose")},
            headers={"Authorization": f"Bearer {employee_token}"},
        )

        assert resp.status_code == 422

    async def test_electrical_table_view_rejects_unknown_cable_source(
        self,
        client: AsyncClient,
        employee_token: str,
    ):
        value = electrical_table_view_value()
        value["calculationCableSource"] = "commercial"

        resp = await client.put(
            f"/api/v1/preferences/{ELECTRICAL_TABLE_VIEW_PREF_KEY}",
            json={"value": value},
            headers={"Authorization": f"Bearer {employee_token}"},
        )

        assert resp.status_code == 422

    async def test_employee_can_upsert_electrical_candidate_table_columns_preference(
        self,
        client: AsyncClient,
        employee_token: str,
    ):
        headers = {"Authorization": f"Bearer {employee_token}"}

        resp = await client.put(
            f"/api/v1/preferences/{ELECTRICAL_CANDIDATE_TABLE_COLUMNS_PREF_KEY}",
            json={"value": electrical_candidate_table_columns_value()},
            headers=headers,
        )

        assert resp.status_code == 200, resp.text
        assert resp.json()["value"]["visibleOrder"] == [
            "marked",
            "actions",
            "mode",
            "cable_mark",
            "current",
        ]

        read_back = await client.get(
            f"/api/v1/preferences/{ELECTRICAL_CANDIDATE_TABLE_COLUMNS_PREF_KEY}",
            headers=headers,
        )
        assert read_back.status_code == 200
        assert read_back.json()["value"]["columns"]["current"] == {"widthPct": 10}

    async def test_electrical_candidate_table_columns_rejects_unknown_key(
        self,
        client: AsyncClient,
        employee_token: str,
    ):
        value = electrical_candidate_table_columns_value(["actions", "cable_mark", "bad"])

        resp = await client.put(
            f"/api/v1/preferences/{ELECTRICAL_CANDIDATE_TABLE_COLUMNS_PREF_KEY}",
            json={"value": value},
            headers={"Authorization": f"Bearer {employee_token}"},
        )

        assert resp.status_code == 422

    async def test_electrical_candidate_table_columns_rejects_hidden_required_action(
        self,
        client: AsyncClient,
        employee_token: str,
    ):
        value = electrical_candidate_table_columns_value(["marked", "cable_mark"])

        resp = await client.put(
            f"/api/v1/preferences/{ELECTRICAL_CANDIDATE_TABLE_COLUMNS_PREF_KEY}",
            json={"value": value},
            headers={"Authorization": f"Bearer {employee_token}"},
        )

        assert resp.status_code == 422
        assert "actions" in resp.text

    async def test_electrical_candidate_table_columns_rejects_invalid_width(
        self,
        client: AsyncClient,
        employee_token: str,
    ):
        value = electrical_candidate_table_columns_value()
        value["columns"]["current"] = {"widthPct": 80}

        resp = await client.put(
            f"/api/v1/preferences/{ELECTRICAL_CANDIDATE_TABLE_COLUMNS_PREF_KEY}",
            json={"value": value},
            headers={"Authorization": f"Bearer {employee_token}"},
        )

        assert resp.status_code == 422

    async def test_old_electrical_preference_keys_are_rejected(
        self,
        client: AsyncClient,
        employee_token: str,
    ):
        headers = {"Authorization": f"Bearer {employee_token}"}

        old_view = await client.put(
            "/api/v1/preferences/electrical.tableView.v1",
            json={"value": electrical_table_view_value()},
            headers=headers,
        )
        old_columns = await client.get(
            "/api/v1/preferences/electrical.tableColumns.v4",
            headers=headers,
        )
        old_view_v2 = await client.get(
            "/api/v1/preferences/electrical.tableView.v2",
            headers=headers,
        )
        old_view_v3 = await client.get(
            "/api/v1/preferences/electrical.tableView.v3",
            headers=headers,
        )
        old_candidates = await client.get(
            "/api/v1/preferences/electrical.candidateTableColumns.v0",
            headers=headers,
        )

        assert old_view.status_code == 422
        assert old_columns.status_code == 422
        assert old_view_v2.status_code == 422
        assert old_view_v3.status_code == 422
        assert old_candidates.status_code == 422

    async def test_employee_can_upsert_heatcalc_table_view_preference(
        self,
        client: AsyncClient,
        employee_token: str,
    ):
        headers = {"Authorization": f"Bearer {employee_token}"}

        resp = await client.put(
            "/api/v1/preferences/heatcalc.tableView.v1",
            json={"value": heatcalc_table_view_value("comfortable")},
            headers=headers,
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["value"] == heatcalc_table_view_value("comfortable")

        read_back = await client.get(
            "/api/v1/preferences/heatcalc.tableView.v1",
            headers=headers,
        )
        assert read_back.status_code == 200
        assert read_back.json()["value"] == heatcalc_table_view_value("comfortable")

    async def test_heatcalc_table_view_rejects_unknown_font_size(
        self,
        client: AsyncClient,
        employee_token: str,
    ):
        resp = await client.put(
            "/api/v1/preferences/heatcalc.tableView.v1",
            json={"value": heatcalc_table_view_value("huge")},
            headers={"Authorization": f"Bearer {employee_token}"},
        )

        assert resp.status_code == 422

    async def test_heatcalc_table_view_rejects_css_payload(
        self,
        client: AsyncClient,
        employee_token: str,
    ):
        value = heatcalc_table_view_value()
        value["fontSizePx"] = 16

        resp = await client.put(
            "/api/v1/preferences/heatcalc.tableView.v1",
            json={"value": value},
            headers={"Authorization": f"Bearer {employee_token}"},
        )

        assert resp.status_code == 422

    async def test_heatcalc_table_view_rejects_invalid_side_form_width(
        self,
        client: AsyncClient,
        employee_token: str,
    ):
        resp = await client.put(
            "/api/v1/preferences/heatcalc.tableView.v1",
            json={"value": heatcalc_table_view_value(side_form_width_pct=80)},
            headers={"Authorization": f"Bearer {employee_token}"},
        )

        assert resp.status_code == 422

    async def test_employee_can_upsert_heatcalc_field_input_preference(
        self,
        client: AsyncClient,
        employee_token: str,
    ):
        headers = {"Authorization": f"Bearer {employee_token}"}

        resp = await client.put(
            "/api/v1/preferences/heatcalc.fieldInputs.v1",
            json={"value": heatcalc_field_inputs_value(10)},
            headers=headers,
        )

        assert resp.status_code == 200, resp.text
        assert resp.json()["value"]["fields"]["pipe"]["outer_diameter_mm"] == {"step": 10}

    async def test_heatcalc_field_input_rejects_unknown_field_key(
        self,
        client: AsyncClient,
        employee_token: str,
    ):
        value = heatcalc_field_inputs_value()
        value["fields"]["pipe"]["name"] = {"step": 1}

        resp = await client.put(
            "/api/v1/preferences/heatcalc.fieldInputs.v1",
            json={"value": value},
            headers={"Authorization": f"Bearer {employee_token}"},
        )

        assert resp.status_code == 422

    async def test_heatcalc_field_input_rejects_invalid_step(
        self,
        client: AsyncClient,
        employee_token: str,
    ):
        resp = await client.put(
            "/api/v1/preferences/heatcalc.fieldInputs.v1",
            json={"value": heatcalc_field_inputs_value(0)},
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
            f"/api/v1/preferences/{HEATCALC_TABLE_COLUMNS_PREF_KEY}",
            json={"value": value},
            headers={"Authorization": f"Bearer {employee_token}"},
        )

        assert resp.status_code == 422
