"""Integration-тесты backend query таблицы объектов."""

from uuid import UUID

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.electrical_calculation import ElectricalCalculation
from app.models.project_object import ProjectObject

pytestmark = pytest.mark.asyncio(loop_scope="session")

MINERAL_WOOL = "mineral_wool_boards_120"
PERLITE = "expanded_perlite_sand_225"


async def _project(client: AsyncClient, session_id: str) -> str:
    resp = await client.get("/api/v1/projects", headers={"X-Session-Id": session_id})
    assert resp.status_code == 200, resp.text
    return resp.json()[0]["id"]


async def _seed_objects(db_session: AsyncSession, project_id: str) -> list[ProjectObject]:
    pid = UUID(project_id)
    objects = [
        ProjectObject(
            project_id=pid,
            object_type="pipe",
            sort_order=0,
            is_valid=True,
            results={
                "heat_loss_per_meter": 40.0,
                "total_heat_loss": 440.0,
            },
            params={
                "name": "Труба Север",
                "outer_diameter": 0.06,
                "pipe_length": 10,
                "insulation_material": MINERAL_WOOL,
                "insulation_temperature_basis": "outdoor_winter",
                "process_temperature": 65,
                "ambient_temperature": -25,
                "climate_region": "ЯНАО",
                "climate_city": "Салехард",
                "climate_key": "ЯНАО|||Салехард",
                "climate_temperature_basis": "t_abs_min",
            },
        ),
        ProjectObject(
            project_id=pid,
            object_type="pipe",
            sort_order=1,
            is_valid=False,
            results={
                "heat_loss_per_meter": 65.0,
                "total_heat_loss": 1787.5,
            },
            params={
                "name": "Труба Юг",
                "outer_diameter": 0.219,
                "pipe_length": 25,
                "insulation_material": PERLITE,
                "insulation_temperature_basis": "outdoor_winter",
                "process_temperature": 95,
                "ambient_temperature": -20,
                "climate_region": "ХМАО",
                "climate_city": "Сургут",
                "climate_key": "ХМАО|||Сургут",
                "climate_temperature_basis": "t_0_92",
            },
        ),
        ProjectObject(
            project_id=pid,
            object_type="tank",
            sort_order=2,
            is_valid=True,
            results={
                "heat_loss_per_m2": 35.0,
                "total_heat_loss": 2500.0,
            },
            params={
                "name": "Резервуар Юг",
                "shape": "cylindrical",
                "diameter": 2.0,
                "height": 3.0,
                "insulation_material": MINERAL_WOOL,
                "insulation_temperature_basis": "outdoor_winter",
                "process_temperature": 70,
                "ambient_temperature": -25,
            },
        ),
    ]
    db_session.add_all(objects)
    await db_session.commit()
    return objects


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
        assert fields["heat_loss_per_meter"]["filter"]["ops"] == ["range"]
        assert fields["heat_loss_per_meter"]["sort"]["enabled"] is True
        assert fields["total_heat_loss"]["filter"]["ops"] == ["range"]
        assert fields["climate_temperature_basis"]["data_type"] == "enum"
        assert fields["climate_temperature_basis"]["filter"]["ops"] == ["in"]
        assert fields["climate_temperature_basis"]["sort"]["type"] == "label"
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

    async def test_query_default_page_supports_keyset_cursor(
        self, client: AsyncClient, guest_session: str, db_session: AsyncSession
    ):
        pid = await _project(client, guest_session)
        await _seed_objects(db_session, pid)

        first = await client.post(
            f"/api/v1/projects/{pid}/objects/query",
            json={"object_type": "pipe", "page": 1, "page_size": 1},
            headers={"X-Session-Id": guest_session},
        )
        assert first.status_code == 200, first.text
        first_body = first.json()
        assert [item["params"]["name"] for item in first_body["items"]] == ["Труба Север"]
        cursor = first_body["page_info"]["next_cursor"]
        assert cursor["key"] == "sort_order"
        assert cursor["sort_order"] == 0

        second = await client.post(
            f"/api/v1/projects/{pid}/objects/query",
            json={
                "object_type": "pipe",
                "page": 2,
                "page_size": 1,
                "after_sort_order": cursor["sort_order"],
                "after_id": cursor["id"],
                "after_key": cursor["key"],
                "after_value": cursor["value"],
                "after_value_is_null": cursor["value_is_null"],
            },
            headers={"X-Session-Id": guest_session},
        )
        assert second.status_code == 200, second.text
        second_body = second.json()
        assert [item["params"]["name"] for item in second_body["items"]] == ["Труба Юг"]
        assert second_body["page_info"].get("next_cursor") is None

    async def test_query_sorted_page_supports_keyset_cursor(
        self, client: AsyncClient, guest_session: str, db_session: AsyncSession
    ):
        pid = await _project(client, guest_session)
        await _seed_objects(db_session, pid)

        first = await client.post(
            f"/api/v1/projects/{pid}/objects/query",
            json={
                "object_type": "pipe",
                "page": 1,
                "page_size": 1,
                "sort": {"key": "process_temperature", "dir": "desc"},
            },
            headers={"X-Session-Id": guest_session},
        )
        assert first.status_code == 200, first.text
        first_body = first.json()
        assert [item["params"]["name"] for item in first_body["items"]] == ["Труба Юг"]
        cursor = first_body["page_info"]["next_cursor"]
        assert cursor["key"] == "process_temperature"
        assert cursor["value"] == 95

        second = await client.post(
            f"/api/v1/projects/{pid}/objects/query",
            json={
                "object_type": "pipe",
                "page": 2,
                "page_size": 1,
                "sort": {"key": "process_temperature", "dir": "desc"},
                "after_sort_order": cursor["sort_order"],
                "after_id": cursor["id"],
                "after_key": cursor["key"],
                "after_value": cursor["value"],
                "after_value_is_null": cursor["value_is_null"],
            },
            headers={"X-Session-Id": guest_session},
        )
        assert second.status_code == 200, second.text
        second_body = second.json()
        assert [item["params"]["name"] for item in second_body["items"]] == ["Труба Север"]

    async def test_query_filters_and_sorts_result_heat_loss_fields(
        self, client: AsyncClient, guest_session: str, db_session: AsyncSession
    ):
        pid = await _project(client, guest_session)
        await _seed_objects(db_session, pid)

        resp = await client.post(
            f"/api/v1/projects/{pid}/objects/query",
            json={
                "object_type": "pipe",
                "filters": [
                    {
                        "key": "heat_loss_per_meter",
                        "op": "range",
                        "min": 50,
                    }
                ],
                "sort": {"key": "total_heat_loss", "dir": "desc"},
            },
            headers={"X-Session-Id": guest_session},
        )

        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["counts"]["filtered"] == 1
        assert body["items"][0]["params"]["name"] == "Труба Юг"

    async def test_query_filters_climate_basis_as_enum(
        self, client: AsyncClient, guest_session: str, db_session: AsyncSession
    ):
        pid = await _project(client, guest_session)
        await _seed_objects(db_session, pid)

        resp = await client.post(
            f"/api/v1/projects/{pid}/objects/query",
            json={
                "object_type": "pipe",
                "filters": [
                    {
                        "key": "climate_temperature_basis",
                        "op": "in",
                        "values": ["t_0_92"],
                    }
                ],
                "sort": {"key": "climate_temperature_basis", "dir": "asc"},
            },
            headers={"X-Session-Id": guest_session},
        )

        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["counts"]["filtered"] == 1
        assert body["items"][0]["params"]["climate_key"] == "ХМАО|||Сургут"

    async def test_query_default_page_uses_fast_paginated_response(
        self, client: AsyncClient, guest_session: str, db_session: AsyncSession
    ):
        pid = await _project(client, guest_session)
        await _seed_objects(db_session, pid)

        resp = await client.post(
            f"/api/v1/projects/{pid}/objects/query",
            json={"object_type": "pipe"},
            headers={"X-Session-Id": guest_session},
        )

        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["counts"] == {
            "total": 3,
            "by_type": {"pipe": 2, "tank": 1},
            "filtered": 2,
        }
        assert body["page_info"] == {
            "page": 1,
            "page_size": 50,
            "offset": 0,
            "total_pages": 1,
            "has_next_page": False,
            "has_previous_page": False,
        }
        assert [item["params"]["name"] for item in body["items"]] == [
            "Труба Север",
            "Труба Юг",
        ]

    async def test_objects_summary_counts_objects_and_electrical_results(
        self, client: AsyncClient, guest_session: str, db_session: AsyncSession
    ):
        pid = await _project(client, guest_session)
        objects = await _seed_objects(db_session, pid)
        project_uuid = UUID(pid)
        db_session.add_all(
            [
                ElectricalCalculation(
                    project_id=project_uuid,
                    object_id=objects[0].id,
                    cable_type="self-regulating",
                    cable_mark=None,
                    results={"selected_cable": {"mark": "HTM"}},
                ),
                ElectricalCalculation(
                    project_id=project_uuid,
                    object_id=objects[2].id,
                    cable_type="self-regulating",
                    cable_mark="HTM",
                    results={"total_power": 1200},
                ),
                ElectricalCalculation(
                    project_id=project_uuid,
                    object_id=objects[1].id,
                    cable_type="self-regulating",
                    cable_mark="HTM",
                    results={
                        "error_code": "POWER_TOO_HIGH",
                        "category": "formula",
                        "message": "invalid heat loss",
                    },
                ),
            ]
        )
        await db_session.commit()

        resp = await client.get(
            f"/api/v1/projects/{pid}/objects/summary",
            headers={"X-Session-Id": guest_session},
        )

        assert resp.status_code == 200, resp.text
        assert resp.json() == {
            "total": 3,
            "valid": 2,
            "invalid": 1,
            "by_type": {"pipe": 2, "tank": 1},
            "valid_by_type": {"pipe": 1, "tank": 1},
            "electrical_calculations_total": 3,
            "successful_electrical_calculations": 2,
            "failed_electrical_calculations": 1,
            "objects_with_successful_electrical_calculation": 2,
        }

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

    async def test_default_search_matches_jsonb_params_text(
        self, client: AsyncClient, guest_session: str, db_session: AsyncSession
    ):
        pid = await _project(client, guest_session)
        await _seed_objects(db_session, pid)

        resp = await client.post(
            f"/api/v1/projects/{pid}/objects/query",
            json={
                "object_type": "pipe",
                "search": {"text": "95"},
            },
            headers={"X-Session-Id": guest_session},
        )

        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["counts"]["filtered"] == 1
        assert [item["params"]["name"] for item in body["items"]] == ["Труба Юг"]

    async def test_query_rejects_unknown_filter_key(self, client: AsyncClient, guest_session: str):
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
