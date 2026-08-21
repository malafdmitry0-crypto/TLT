"""Integration-тесты справочников."""

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.insulation_material import InsulationMaterial

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
        data = resp.json()
        assert any(m["material"] == "mineral_wool" for m in data)
        assert any(m["material"] == "mineral_wool_cylinders_100" for m in data)

    async def test_insulation_public_uses_db_projection_when_seeded(
        self, client: AsyncClient, guest_session: str, db_session: AsyncSession
    ):
        db_session.add(
            InsulationMaterial(
                material="test_db_insulation_100",
                name="Тестовая изоляция из БД",
                conductivity=0.04,
                density_kg_m3=100,
                temperature_range=[-60, 400],
                conductivity_20_plus=[0.04, 0.0002],
                conductivity_19_minus=[0.039, 0.03],
                selectable=True,
                deprecated=False,
                requires_material_reselection=False,
                source="test",
                data_source="test",
                params={"custom_flag": "db"},
                is_active=True,
            )
        )
        await db_session.commit()

        resp = await client.get(
            "/api/v1/references/insulation",
            headers={"X-Session-Id": guest_session},
        )

        assert resp.status_code == 200
        data = resp.json()
        assert data == [
            {
                "material": "test_db_insulation_100",
                "name": "Тестовая изоляция из БД",
                "conductivity": 0.04,
                "density_kg_m3": 100,
                "temperature_range": [-60, 400],
                "conductivity_20_plus": [0.04, 0.0002],
                "conductivity_19_minus": [0.039, 0.03],
                "selectable": True,
                "deprecated": False,
                "requires_material_reselection": False,
                "source": "test",
                "custom_flag": "db",
            }
        ]

    async def test_pipe_materials_public(self, client: AsyncClient, guest_session: str):
        resp = await client.get(
            "/api/v1/references/pipe-materials",
            headers={"X-Session-Id": guest_session},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert any(m["material"] == "carbon_steel" for m in data)
        assert all("a" in m and "b" in m for m in data)

    async def test_soil_conductivity_public(self, client: AsyncClient, guest_session: str):
        resp = await client.get(
            "/api/v1/references/soil-conductivity",
            headers={"X-Session-Id": guest_session},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert any(s["soil"] == "Песок" for s in data)

    async def test_internal_references_public(self, client: AsyncClient, guest_session: str):
        resp = await client.get(
            "/api/v1/references/internal",
            headers={"X-Session-Id": guest_session},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert {"climate", "insulation", "pipe_materials", "soil_conductivity"}.issubset(data)
