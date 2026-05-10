"""Integration-тесты отчётов."""

import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def _project_with_object(client: AsyncClient, session_id: str) -> str:
    p = (
        await client.get(
            "/api/v1/projects",
            headers={"X-Session-Id": session_id},
        )
    ).json()[0]
    await client.post(
        f"/api/v1/projects/{p['id']}/objects",
        json={
            "object_type": "pipe",
            "params": {
                "outer_diameter": 0.1,
                "insulation_thickness": 0.05,
                "insulation_material": "mineral_wool",
                "ambient_temperature": -20,
                "process_temperature": 80,
                "pipe_length": 10,
            },
        },
        headers={"X-Session-Id": session_id},
    )
    return p["id"]


class TestReports:
    async def test_preview_returns_html(self, client: AsyncClient, guest_session: str):
        pid = await _project_with_object(client, guest_session)
        resp = await client.get(
            f"/api/v1/reports/{pid}/preview",
            headers={"X-Session-Id": guest_session},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert "<html" in body["html"]
        assert "data" not in body
        assert body["sections"] == [
            "summary",
            "pipes",
            "tanks",
            "electrical",
            "specification",
        ]

    async def test_guest_cannot_export(self, client: AsyncClient, guest_session: str):
        pid = await _project_with_object(client, guest_session)
        resp = await client.get(
            f"/api/v1/reports/{pid}/export/xlsx",
            headers={"X-Session-Id": guest_session},
        )
        assert resp.status_code == 403

    async def test_employee_export_xlsx(
        self, client: AsyncClient, guest_session: str, employee_token: str
    ):
        pid = await _project_with_object(client, guest_session)
        resp = await client.get(
            f"/api/v1/reports/{pid}/export/xlsx",
            headers={"Authorization": f"Bearer {employee_token}"},
        )
        assert resp.status_code == 200
        assert resp.headers["content-type"].startswith(
            "application/vnd.openxmlformats-officedocument.spreadsheetml"
        )

    async def test_preview_without_electrical_returns_partial_report(
        self, client: AsyncClient, guest_session: str
    ):
        """Отчёт доступен после Шага 1 (только теплопотери), не падает без электрорасчёта и спецификации."""
        pid = await _project_with_object(client, guest_session)
        resp = await client.get(
            f"/api/v1/reports/{pid}/preview",
            headers={"X-Session-Id": guest_session},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert "<html" in body["html"]
        assert "data" not in body
        assert "Трубопроводы" in body["html"]
