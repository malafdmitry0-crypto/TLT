"""Integration-тесты групповых операций с объектами (кейс §5.7 / §5.8).

- POST /projects/{id}/objects/duplicate-batch — «Добавление объектов на
  основании выбранных»: полная копия params, собственный id, повторный
  теплорасчёт, исходные объекты без изменений.
- POST /projects/{id}/objects/group-update — «Групповая корректировка»:
  один общий параметр, всё-или-ничего, перечень проблемных объектов.
"""

from datetime import datetime

import pytest
from httpx import AsyncClient

from app.core.config import settings
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
        listing = await client.get(
            f"/api/v1/projects/{project['id']}/objects", headers=headers
        )
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

    async def test_invalid_value_is_persisted_with_structured_validation_state(
        self, client: AsyncClient, guest_session: str
    ):
        headers = _headers(guest_session)
        project = await _guest_project(client, guest_session)
        first = await _add_object(client, project["id"], headers, name="Валидная")
        second = await _add_object(
            client, project["id"], headers, name="Тоже валидная", sort_order=1
        )

        resp = await client.post(
            f"/api/v1/projects/{project['id']}/objects/group-update",
            json={
                "object_ids": [first["id"], second["id"]],
                "param": "pipe_length",
                "value": -5,
            },
            headers=headers,
        )
        assert resp.status_code == 200, resp.text
        by_id = {item["id"]: item for item in resp.json()["objects"]}
        for source in (first, second):
            updated = by_id[source["id"]]
            assert updated["params"]["pipe_length"] == -5
            assert updated["version"] == source["version"] + 1
            assert updated["is_valid"] is False
            assert updated["validation_errors"]["error_code"] == "invalid_object_params"
            assert updated["validation_errors"]["field"] == "pipe_length"

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
        before = datetime.fromisoformat(
            (await _guest_project(client, guest_session))["updated_at"]
        )

        resp = await client.post(
            f"/api/v1/projects/{project['id']}/objects/group-update",
            json={"object_ids": [obj["id"]], "param": "process_temperature", "value": 70.0},
            headers=headers,
        )
        assert resp.status_code == 200, resp.text
        after = datetime.fromisoformat(
            (await _guest_project(client, guest_session))["updated_at"]
        )
        assert after > before
