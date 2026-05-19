"""Integration-тесты справочников."""

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.cable import CableExtended
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

    async def test_resistive_cables_public(self, client: AsyncClient, guest_session: str):
        resp = await client.get(
            "/api/v1/references/resistive-cables",
            headers={"X-Session-Id": guest_session},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["single_core"]) >= 30
        assert len(data["three_core"]) >= 18
        r3 = next(c for c in data["three_core"] if c["model"] == "ТТ Р3 х 1,5-1,0")
        assert r3["technical_data_complete"] is False
        assert "resistance_ohm_km" in r3["technical_data_missing"]

    async def test_resistive_commercial_cables_include_technical_status(
        self, client: AsyncClient, guest_session: str, db_session: AsyncSession
    ):
        db_session.add(
            CableExtended(
                cable_type="three_core",
                brand="ТТ Р3",
                model="ТТ Р3 х 1,5-1,0",
                resistance_per_meter=0.011666666666666665,
                price_per_meter=140.0,
                stock_status="in_stock",
                commercial_data_source="test",
                params={"conductor_section_mm2": 1.5},
                is_active=True,
            )
        )
        await db_session.commit()

        resp = await client.get(
            "/api/v1/references/resistive-cables",
            params={"source": "commercial"},
            headers={"X-Session-Id": guest_session},
        )
        assert resp.status_code == 200
        data = resp.json()
        r3 = next(c for c in data["three_core"] if c["model"] == "ТТ Р3 х 1,5-1,0")
        assert r3["source"] == "commercial"
        assert r3["technical_data_complete"] is True
        assert r3["technical_data_missing"] == []
        assert r3["resistance_ohm_km"] > 0

    async def test_internal_references_public(self, client: AsyncClient, guest_session: str):
        resp = await client.get(
            "/api/v1/references/internal",
            headers={"X-Session-Id": guest_session},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert {"climate", "insulation", "pipe_materials", "soil_conductivity"}.issubset(data)

    async def test_cables_tlt_public(self, client: AsyncClient, guest_session: str):
        resp = await client.get(
            "/api/v1/references/cables",
            headers={"X-Session-Id": guest_session},
        )
        assert resp.status_code == 200
        assert any(c["model"] == "ТЛТ-25" for c in resp.json())

    async def test_commercial_cables_public(self, client: AsyncClient, guest_session: str):
        resp = await client.get(
            "/api/v1/references/cables",
            params={"source": "commercial"},
            headers={"X-Session-Id": guest_session},
        )
        assert resp.status_code == 200
        row = next(c for c in resp.json() if c["model"] == "ТЛТ-25")
        assert row["source"] == "commercial"
        assert "price_per_meter" in row

        direct = await client.get(
            "/api/v1/references/cables/commercial",
            headers={"X-Session-Id": guest_session},
        )
        assert direct.status_code == 200

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

    async def test_cables_endpoint_filters_extended_catalog_by_requested_type(
        self, client: AsyncClient, employee_token: str, db_session: AsyncSession
    ):
        db_session.add_all(
            [
                CableExtended(
                    cable_type="self_regulating",
                    brand="EXT-SR",
                    model="EXT-SR-TEST",
                    power_per_meter=42.0,
                    min_temperature=-60.0,
                    max_temperature=120.0,
                    is_active=True,
                ),
                CableExtended(
                    cable_type="single_core",
                    brand="EXT-R1",
                    model="EXT-R1-TEST",
                    resistance_per_meter=0.02,
                    min_temperature=-60.0,
                    max_temperature=130.0,
                    params={"conductor_section_mm2": 1.5},
                    is_active=True,
                ),
            ]
        )
        await db_session.commit()

        resp = await client.get(
            "/api/v1/references/cables",
            params={"source": "extended", "cable_type": "self_regulating"},
            headers={"Authorization": f"Bearer {employee_token}"},
        )

        assert resp.status_code == 200
        rows = resp.json()
        assert any(row["model"] == "EXT-SR-TEST" for row in rows)
        assert all(row.get("cable_type") == "self_regulating" for row in rows)
        assert all(row["model"] != "EXT-R1-TEST" for row in rows)

        single_core_resp = await client.get(
            "/api/v1/references/cables",
            params={"source": "extended", "cable_type": "single_core"},
            headers={"Authorization": f"Bearer {employee_token}"},
        )

        assert single_core_resp.status_code == 200
        single_core_rows = single_core_resp.json()
        assert any(row["model"] == "EXT-R1-TEST" for row in single_core_rows)
        assert all(row.get("cable_type") == "single_core" for row in single_core_rows)
        assert all(row["model"] != "EXT-SR-TEST" for row in single_core_rows)
