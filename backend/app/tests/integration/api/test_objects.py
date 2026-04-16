"""Integration-тесты объектов проекта с автопересчётом."""

import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def _project(client: AsyncClient, session_id: str) -> str:
    # У пользовательской сессии ровно один авто-проект — берём его.
    resp = await client.get(
        "/api/v1/projects",
        headers={"X-Session-Id": session_id},
    )
    return resp.json()[0]["id"]


class TestObjectsLifecycle:
    async def test_add_object_triggers_calculation(self, client: AsyncClient, guest_session: str):
        pid = await _project(client, guest_session)
        resp = await client.post(
            f"/api/v1/projects/{pid}/objects",
            json={
                "object_type": "pipe",
                "sort_order": 0,
                "params": {
                    "outer_diameter": 0.1,
                    "insulation_thickness": 0.05,
                    "insulation_material": "mineral_wool",
                    "ambient_temperature": -20,
                    "process_temperature": 80,
                    "pipe_length": 10,
                },
            },
            headers={"X-Session-Id": guest_session},
        )
        assert resp.status_code == 201, resp.text
        body = resp.json()
        assert body["is_valid"] is True
        assert body["results"]["heat_loss_per_meter"] > 0

    async def test_update_object_recalculates(self, client: AsyncClient, guest_session: str):
        pid = await _project(client, guest_session)
        created = (
            await client.post(
                f"/api/v1/projects/{pid}/objects",
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
                headers={"X-Session-Id": guest_session},
            )
        ).json()
        # Уменьшаем толщину изоляции → теплопотери должны вырасти
        old_q = created["results"]["heat_loss_per_meter"]
        resp = await client.put(
            f"/api/v1/projects/{pid}/objects/{created['id']}",
            json={
                "params": {
                    **created["params"],
                    "insulation_thickness": 0.02,
                }
            },
            headers={"X-Session-Id": guest_session},
        )
        assert resp.status_code == 200
        new_q = resp.json()["results"]["heat_loss_per_meter"]
        assert new_q > old_q

    async def test_invalid_object_marked_invalid(self, client: AsyncClient, guest_session: str):
        pid = await _project(client, guest_session)
        resp = await client.post(
            f"/api/v1/projects/{pid}/objects",
            json={
                "object_type": "pipe",
                "params": {
                    "outer_diameter": 0.1,
                    "insulation_thickness": 0.05,
                    "insulation_material": "unknown_material",
                    "ambient_temperature": -20,
                    "process_temperature": 80,
                    "pipe_length": 10,
                },
            },
            headers={"X-Session-Id": guest_session},
        )
        assert resp.status_code == 201
        body = resp.json()
        assert body["is_valid"] is False
        assert body["validation_errors"] is not None
