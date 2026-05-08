"""Integration-тесты backend query таблицы объектов."""

from uuid import UUID

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.project_object import ProjectObject

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def _project(client: AsyncClient, session_id: str) -> str:
    resp = await client.get("/api/v1/projects", headers={"X-Session-Id": session_id})
    assert resp.status_code == 200, resp.text
    return resp.json()[0]["id"]


async def _seed_objects(db_session: AsyncSession, project_id: str) -> None:
    pid = UUID(project_id)
    db_session.add_all(
        [
            ProjectObject(
                project_id=pid,
                object_type="pipe",
                sort_order=0,
                params={
                    "name": "Труба Север",
                    "outer_diameter": 0.06,
                    "pipe_length": 10,
                    "insulation_material": "mineral_wool",
                    "process_temperature": 65,
                    "ambient_temperature": -25,
                },
            ),
            ProjectObject(
                project_id=pid,
                object_type="pipe",
                sort_order=1,
                params={
                    "name": "Труба Юг",
                    "outer_diameter": 0.219,
                    "pipe_length": 25,
                    "insulation_material": "foam_glass",
                    "process_temperature": 95,
                    "ambient_temperature": -20,
                },
            ),
            ProjectObject(
                project_id=pid,
                object_type="tank",
                sort_order=2,
                params={
                    "name": "Резервуар Юг",
                    "shape": "cylindrical",
                    "diameter": 2.0,
                    "height": 3.0,
                    "insulation_material": "mineral_wool",
                    "process_temperature": 70,
                    "ambient_temperature": -25,
                },
            ),
        ]
    )
    await db_session.commit()


class TestObjectQuery:
    async def test_capabilities_include_disabled_and_enabled_fields(
        self, client: AsyncClient, guest_session: str
    ):
        pid = await _project(client, guest_session)
        resp = await client.get(
            f"/api/v1/projects/{pid}/objects/query-capabilities",
            params={"object_type": "pipe"},
            headers={"X-Session-Id": guest_session},
        )

        assert resp.status_code == 200, resp.text
        fields = {field["key"]: field for field in resp.json()["fields"]}
        assert fields["pipe_outer_diameter"]["filter"]["ops"] == ["range"]
        assert fields["pipe_outer_diameter"]["sort"]["enabled"] is True
        assert fields["index"]["filter"]["enabled"] is False
        assert fields["index"]["filter"]["reason"] == "display_only"
        assert fields["type"]["sort"]["enabled"] is False
        assert fields["insulation_material"]["options"]["items"]

    async def test_query_filters_sorts_and_paginates_on_backend(
        self, client: AsyncClient, guest_session: str, db_session: AsyncSession
    ):
        pid = await _project(client, guest_session)
        await _seed_objects(db_session, pid)

        resp = await client.post(
            f"/api/v1/projects/{pid}/objects/query",
            json={
                "object_type": "pipe",
                "page": 1,
                "page_size": 1,
                "filters": [
                    {
                        "key": "pipe_outer_diameter",
                        "op": "range",
                        "min": 100,
                    }
                ],
                "sort": {"key": "process_temperature", "dir": "desc"},
            },
            headers={"X-Session-Id": guest_session},
        )

        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["counts"] == {
            "total": 3,
            "by_type": {"pipe": 2, "tank": 1},
            "filtered": 1,
        }
        assert body["page_info"]["page_size"] == 1
        assert body["items"][0]["params"]["name"] == "Труба Юг"

    async def test_query_search_is_scoped_to_object_type(
        self, client: AsyncClient, guest_session: str, db_session: AsyncSession
    ):
        pid = await _project(client, guest_session)
        await _seed_objects(db_session, pid)

        resp = await client.post(
            f"/api/v1/projects/{pid}/objects/query",
            json={
                "object_type": "pipe",
                "search": {"text": "юг"},
            },
            headers={"X-Session-Id": guest_session},
        )

        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["counts"]["filtered"] == 1
        assert [item["params"]["name"] for item in body["items"]] == ["Труба Юг"]

    async def test_query_rejects_unknown_filter_key(
        self, client: AsyncClient, guest_session: str
    ):
        pid = await _project(client, guest_session)
        resp = await client.post(
            f"/api/v1/projects/{pid}/objects/query",
            json={
                "object_type": "pipe",
                "filters": [{"key": "params.anything", "op": "contains", "value": "x"}],
            },
            headers={"X-Session-Id": guest_session},
        )

        assert resp.status_code == 422
