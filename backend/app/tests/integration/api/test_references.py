"""Integration-тесты справочников."""

import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio(loop_scope="session")


class TestReferences:
    async def test_climate_public(self, client: AsyncClient, guest_session: str):
        resp = await client.get(
            "/api/v1/references/climate",
            headers={"X-Session-Id": guest_session},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert any(r["city"] == "Москва" for r in data)
        moscow = next(r for r in data if r["city"] == "Москва")
        assert "t_0_98" in moscow
        assert "t_0_92" in moscow
        assert "wind_max_jan" in moscow

    async def test_insulation_public(self, client: AsyncClient, guest_session: str):
        resp = await client.get(
            "/api/v1/references/insulation",
            headers={"X-Session-Id": guest_session},
        )
        assert resp.status_code == 200
        assert any(m["material"] == "mineral_wool" for m in resp.json())

    async def test_cables_tlt_public(self, client: AsyncClient, guest_session: str):
        resp = await client.get(
            "/api/v1/references/cables",
            headers={"X-Session-Id": guest_session},
        )
        assert resp.status_code == 200
        assert any(c["model"] == "ТЛТ-25" for c in resp.json())

    async def test_extended_cables_requires_employee(
        self, client: AsyncClient, guest_session: str, employee_token: str
    ):
        r1 = await client.get(
            "/api/v1/references/cables/extended",
            headers={"X-Session-Id": guest_session},
        )
        assert r1.status_code == 403

        r2 = await client.get(
            "/api/v1/references/cables/extended",
            headers={"Authorization": f"Bearer {employee_token}"},
        )
        assert r2.status_code == 200
