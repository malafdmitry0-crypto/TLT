"""Integration-тесты групповых операций с объектами (кейс §5.7 / §5.8).

- POST /projects/{id}/objects/duplicate-batch — «Добавление объектов на
  основании выбранных»: полная копия params, собственный id, повторный
  теплорасчёт, исходные объекты без изменений.
- POST /projects/{id}/objects/group-update — «Групповая корректировка»:
  один общий параметр, всё-или-ничего, перечень проблемных объектов.
"""

from datetime import datetime
from unittest.mock import AsyncMock
from uuid import UUID

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.audit_event import AuditEvent
from app.services.audit_service import AuditService
from app.services.calculation.electrical_staleness import ElectricalStalenessService
from app.tests.heat_fixtures import canonical_pipe_params, canonical_tank_params

pytestmark = pytest.mark.asyncio(loop_scope="session")


def _headers(session_id: str) -> dict:
    return {"X-Session-Id": session_id}


async def _guest_project(client: AsyncClient, guest_session: str) -> dict:
    resp = await client.get("/api/v1/projects", headers=_headers(guest_session))
    assert resp.status_code == 200
    return resp.json()[0]


async def _add_object(
    client: AsyncClient,
    project_id: str,
    headers: dict,
    *,
    object_type: str = "pipe",
    sort_order: int = 0,
    **param_overrides,
) -> dict:
    params = (
        canonical_pipe_params(**param_overrides)
        if object_type == "pipe"
        else canonical_tank_params(**param_overrides)
    )
    resp = await client.post(
        f"/api/v1/projects/{project_id}/objects",
        json={"object_type": object_type, "sort_order": sort_order, "params": params},
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _object_snapshots(
    client: AsyncClient,
    project_id: str,
    headers: dict,
    object_ids: list[str],
) -> dict[str, dict]:
    response = await client.get(
        f"/api/v1/projects/{project_id}/objects",
        headers=headers,
    )
    assert response.status_code == 200, response.text
    selected = {item["id"]: item for item in response.json() if item["id"] in object_ids}
    assert set(selected) == set(object_ids)
    return {
        object_id: {
            "params": selected[object_id]["params"],
            "version": selected[object_id]["version"],
            "results": selected[object_id]["results"],
            "is_valid": selected[object_id]["is_valid"],
            "validation_errors": selected[object_id]["validation_errors"],
            "updated_at": selected[object_id]["updated_at"],
        }
        for object_id in object_ids
    }


async def _group_update_audit_count(
    db_session: AsyncSession,
    project_id: str,
) -> int:
    return int(
        await db_session.scalar(
            select(func.count(AuditEvent.id)).where(
                AuditEvent.event_type == "object.group_updated",
                AuditEvent.project_id == UUID(project_id),
            )
        )
        or 0
    )


class TestDuplicateBatch:
    async def test_creates_full_copies_and_recalculates(
        self, client: AsyncClient, guest_session: str
    ):
        headers = _headers(guest_session)
        project = await _guest_project(client, guest_session)
        first = await _add_object(client, project["id"], headers, name="Труба А", sort_order=0)
        second = await _add_object(
            client, project["id"], headers, name="Труба Б", sort_order=1, pipe_length=75.0
        )

        resp = await client.post(
            f"/api/v1/projects/{project['id']}/objects/duplicate-batch",
            json={"object_ids": [first["id"], second["id"]]},
            headers=headers,
        )
        assert resp.status_code == 201, resp.text
        payload = resp.json()
        assert payload["count"] == 2
        copies = payload["objects"]
        assert len(copies) == 2

        # Копия: собственный id, все параметры перенесены, теплопотери рассчитаны.
        assert {c["id"] for c in copies}.isdisjoint({first["id"], second["id"]})
        assert copies[0]["params"] == first["params"]
        assert copies[1]["params"] == second["params"]
        assert all(c["is_valid"] for c in copies)
        assert all(c["results"] for c in copies)
        # Копии добавляются в конец таблицы.
        assert [c["sort_order"] for c in copies] == [2, 3]

        # Исходные объекты не изменились, всего объектов стало 4.
        listing = await client.get(f"/api/v1/projects/{project['id']}/objects", headers=headers)
        objects = listing.json()
        assert len(objects) == 4
        by_id = {o["id"]: o for o in objects}
        assert by_id[first["id"]]["params"] == first["params"]
        assert by_id[first["id"]]["version"] == first["version"]

    async def test_unknown_object_returns_404(self, client: AsyncClient, guest_session: str):
        headers = _headers(guest_session)
        project = await _guest_project(client, guest_session)
        resp = await client.post(
            f"/api/v1/projects/{project['id']}/objects/duplicate-batch",
            json={"object_ids": ["00000000-0000-0000-0000-000000000000"]},
            headers=headers,
        )
        assert resp.status_code == 404

    async def test_limit_respected(
        self, client: AsyncClient, guest_session: str, monkeypatch: pytest.MonkeyPatch
    ):
        headers = _headers(guest_session)
        project = await _guest_project(client, guest_session)
        first = await _add_object(client, project["id"], headers, name="Труба лимит")
        monkeypatch.setattr(settings, "GUEST_MAX_OBJECTS_PER_PROJECT", 1)
        resp = await client.post(
            f"/api/v1/projects/{project['id']}/objects/duplicate-batch",
            json={"object_ids": [first["id"]]},
            headers=headers,
        )
        assert resp.status_code == 429

    async def test_foreign_guest_gets_403(self, client: AsyncClient, guest_session: str):
        headers = _headers(guest_session)
        project = await _guest_project(client, guest_session)
        obj = await _add_object(client, project["id"], headers, name="Чужая труба")

        other_session = (await client.post("/api/v1/auth/guest")).json()["session_id"]
        resp = await client.post(
            f"/api/v1/projects/{project['id']}/objects/duplicate-batch",
            json={"object_ids": [obj["id"]]},
            headers=_headers(other_session),
        )
        assert resp.status_code == 403


class TestGroupUpdate:
    async def test_updates_single_param_for_all_selected(
        self, client: AsyncClient, guest_session: str
    ):
        headers = _headers(guest_session)
        project = await _guest_project(client, guest_session)
        first = await _add_object(client, project["id"], headers, name="ГК Труба 1")
        second = await _add_object(
            client, project["id"], headers, name="ГК Труба 2", sort_order=1, pipe_length=75.0
        )

        resp = await client.post(
            f"/api/v1/projects/{project['id']}/objects/group-update",
            json={
                "object_ids": [first["id"], second["id"]],
                "param": "process_temperature",
                "value": 60.0,
            },
            headers=headers,
        )
        assert resp.status_code == 200, resp.text
        payload = resp.json()
        assert payload["count"] == 2
        updated = {o["id"]: o for o in payload["objects"]}

        for source in (first, second):
            obj = updated[source["id"]]
            assert obj["params"]["process_temperature"] == 60.0
            assert obj["version"] == source["version"] + 1
            assert obj["is_valid"] is True
            assert obj["results"]
        # Остальные параметры не изменяются (кейс §5.8).
        assert updated[first["id"]]["params"]["name"] == "ГК Труба 1"
        assert updated[second["id"]]["params"]["pipe_length"] == 75.0

    async def test_safety_factor_update_becomes_manual_and_is_not_reverted(
        self, client: AsyncClient, guest_session: str
    ):
        headers = _headers(guest_session)
        project = await _guest_project(client, guest_session)
        first = await _add_object(
            client,
            project["id"],
            headers,
            name="Кзап Труба 1",
            safety_factor=1.1,
            safety_factor_source="climate_policy",
        )
        second = await _add_object(
            client,
            project["id"],
            headers,
            name="Кзап Труба 2",
            sort_order=1,
            safety_factor=1.1,
            safety_factor_source="climate_policy",
        )

        resp = await client.post(
            f"/api/v1/projects/{project['id']}/objects/group-update",
            json={
                "object_ids": [first["id"], second["id"]],
                "param": "safety_factor",
                "value": 1.15,
            },
            headers=headers,
        )

        assert resp.status_code == 200, resp.text
        payload = resp.json()
        assert payload["count"] == 2
        for obj in payload["objects"]:
            assert obj["params"]["safety_factor"] == pytest.approx(1.15)
            assert obj["params"]["safety_factor_source"] == "manual"
            assert obj["results"]["safety_factor_applied"] == pytest.approx(1.15)

    async def test_out_of_range_value_is_rejected_without_mutating_any_object(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        guest_session: str,
        monkeypatch: pytest.MonkeyPatch,
    ):
        headers = _headers(guest_session)
        project = await _guest_project(client, guest_session)
        first = await _add_object(client, project["id"], headers, name="Валидная")
        second = await _add_object(
            client, project["id"], headers, name="Тоже валидная", sort_order=1
        )
        object_ids = [first["id"], second["id"]]
        before = await _object_snapshots(client, project["id"], headers, object_ids)
        project_updated_at_before = (await _guest_project(client, guest_session))["updated_at"]
        audit_count_before = await _group_update_audit_count(db_session, project["id"])
        stale_spy = AsyncMock()
        audit_spy = AsyncMock()
        monkeypatch.setattr(ElectricalStalenessService, "mark_for_objects", stale_spy)
        monkeypatch.setattr(AuditService, "stage", audit_spy)

        resp = await client.post(
            f"/api/v1/projects/{project['id']}/objects/group-update",
            json={
                "object_ids": object_ids,
                "param": "ambient_temperature",
                "value": 999,
            },
            headers=headers,
        )
        assert resp.status_code == 422, resp.text
        detail = resp.json()["detail"]
        assert {item["object_id"] for item in detail["objects"]} == set(object_ids)
        assert all(item["error"] for item in detail["objects"])

        after = await _object_snapshots(client, project["id"], headers, object_ids)
        assert after == before
        assert (await _guest_project(client, guest_session))["updated_at"] == (
            project_updated_at_before
        )
        assert await _group_update_audit_count(db_session, project["id"]) == audit_count_before
        stale_spy.assert_not_awaited()
        audit_spy.assert_not_awaited()

    async def test_relation_invalid_for_one_object_rolls_back_compatible_object(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        guest_session: str,
    ):
        headers = _headers(guest_session)
        project = await _guest_project(client, guest_session)
        compatible = await _add_object(
            client,
            project["id"],
            headers,
            name="Большой диаметр",
        )
        incompatible = await _add_object(
            client,
            project["id"],
            headers,
            name="Малый диаметр",
            sort_order=1,
            outer_diameter=0.02,
            wall_thickness=0.004,
        )
        object_ids = [compatible["id"], incompatible["id"]]
        before = await _object_snapshots(client, project["id"], headers, object_ids)
        audit_count_before = await _group_update_audit_count(db_session, project["id"])

        resp = await client.post(
            f"/api/v1/projects/{project['id']}/objects/group-update",
            json={
                "object_ids": object_ids,
                "param": "wall_thickness",
                "value": 0.01,
            },
            headers=headers,
        )
        assert resp.status_code == 422, resp.text
        detail = resp.json()["detail"]
        assert {item["object_id"] for item in detail["objects"]} == {incompatible["id"]}
        assert detail["objects"][0]["name"] == "Малый диаметр"

        after = await _object_snapshots(client, project["id"], headers, object_ids)
        assert after == before
        assert await _group_update_audit_count(db_session, project["id"]) == audit_count_before

    async def test_wrong_type_param_lists_problem_objects(
        self, client: AsyncClient, guest_session: str
    ):
        """Танковый параметр нельзя применить к трубе — перечень проблемных."""
        headers = _headers(guest_session)
        project = await _guest_project(client, guest_session)
        pipe = await _add_object(client, project["id"], headers, name="Труба")
        tank = await _add_object(
            client, project["id"], headers, object_type="tank", sort_order=1, name="Ёмкость"
        )

        resp = await client.post(
            f"/api/v1/projects/{project['id']}/objects/group-update",
            json={
                "object_ids": [pipe["id"], tank["id"]],
                "param": "diameter",
                "value": 2.5,
            },
            headers=headers,
        )
        assert resp.status_code == 422, resp.text
        detail = resp.json()["detail"]
        problem_ids = {item["object_id"] for item in detail["objects"]}
        # Проблемной является труба (diameter — параметр ёмкости).
        assert pipe["id"] in problem_ids
        assert tank["id"] not in problem_ids

    async def test_group_update_bumps_project_updated_at(
        self, client: AsyncClient, guest_session: str
    ):
        headers = _headers(guest_session)
        project = await _guest_project(client, guest_session)
        obj = await _add_object(client, project["id"], headers, name="Дата")
        before = datetime.fromisoformat((await _guest_project(client, guest_session))["updated_at"])

        resp = await client.post(
            f"/api/v1/projects/{project['id']}/objects/group-update",
            json={"object_ids": [obj["id"]], "param": "process_temperature", "value": 70.0},
            headers=headers,
        )
        assert resp.status_code == 200, resp.text
        after = datetime.fromisoformat((await _guest_project(client, guest_session))["updated_at"])
        assert after > before
