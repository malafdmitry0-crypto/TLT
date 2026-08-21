"""Integration-тесты проектных настроек отображения (кейс §5.9 / §5.11).

Гость хранит настройки на своём (единственном) проекте, optimistic-версия
защищает от параллельных записей, файл проекта переносит настройки и версию.
"""

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.project import Project

pytestmark = pytest.mark.asyncio(loop_scope="session")

HEATCALC_SETTINGS = {
    "heatcalc": {
        "tableColumns": {"pipe": {"visible": ["name", "length"], "order": ["name", "length"]}},
        "tableView": {"fontSize": "compact"},
    }
}


async def _guest_project(client: AsyncClient, session_id: str) -> dict:
    response = await client.get("/api/v1/projects", headers={"X-Session-Id": session_id})
    assert response.status_code == 200
    return response.json()[0]


async def test_get_defaults_to_version_zero_and_empty_settings(
    client: AsyncClient,
    guest_session: str,
):
    project = await _guest_project(client, guest_session)

    response = await client.get(
        f"/api/v1/projects/{project['id']}/display-settings",
        headers={"X-Session-Id": guest_session},
    )

    assert response.status_code == 200, response.text
    assert response.json() == {
        "project_id": project["id"],
        "version": 0,
        "settings": {},
    }


async def test_guest_put_bumps_version_and_touches_project(
    client: AsyncClient,
    guest_session: str,
    db_session: AsyncSession,
):
    project = await _guest_project(client, guest_session)
    before = await db_session.get(Project, project["id"])
    updated_at_before = before.updated_at

    response = await client.put(
        f"/api/v1/projects/{project['id']}/display-settings",
        json={"expected_version": 0, "settings": HEATCALC_SETTINGS},
        headers={"X-Session-Id": guest_session},
    )

    assert response.status_code == 200, response.text
    assert response.json()["version"] == 1
    assert response.json()["settings"] == HEATCALC_SETTINGS

    read_back = await client.get(
        f"/api/v1/projects/{project['id']}/display-settings",
        headers={"X-Session-Id": guest_session},
    )
    assert read_back.json()["version"] == 1
    assert read_back.json()["settings"] == HEATCALC_SETTINGS

    await db_session.refresh(before)
    assert before.updated_at >= updated_at_before


async def test_idempotent_put_does_not_bump_version(
    client: AsyncClient,
    guest_session: str,
):
    project = await _guest_project(client, guest_session)
    first = await client.put(
        f"/api/v1/projects/{project['id']}/display-settings",
        json={"expected_version": 0, "settings": HEATCALC_SETTINGS},
        headers={"X-Session-Id": guest_session},
    )
    assert first.status_code == 200
    assert first.json()["version"] == 1

    repeat = await client.put(
        f"/api/v1/projects/{project['id']}/display-settings",
        json={"expected_version": 1, "settings": HEATCALC_SETTINGS},
        headers={"X-Session-Id": guest_session},
    )
    assert repeat.status_code == 200, repeat.text
    assert repeat.json()["version"] == 1


async def test_reset_to_default_writes_canonical_empty_payload_and_bumps_version(
    client: AsyncClient,
    guest_session: str,
):
    project = await _guest_project(client, guest_session)
    seeded = await client.put(
        f"/api/v1/projects/{project['id']}/display-settings",
        json={"expected_version": 0, "settings": HEATCALC_SETTINGS},
        headers={"X-Session-Id": guest_session},
    )
    assert seeded.status_code == 200

    # Кейс §5.9 «По умолчанию»: сброс — запись пустой области, версия растёт,
    # факт сброса переносится в файле.
    reset = await client.put(
        f"/api/v1/projects/{project['id']}/display-settings",
        json={"expected_version": 1, "settings": {"heatcalc": {}}},
        headers={"X-Session-Id": guest_session},
    )
    assert reset.status_code == 200, reset.text
    assert reset.json()["version"] == 2
    assert reset.json()["settings"] == {"heatcalc": {}}


async def test_stale_expected_version_conflicts_409(
    client: AsyncClient,
    guest_session: str,
):
    project = await _guest_project(client, guest_session)
    first = await client.put(
        f"/api/v1/projects/{project['id']}/display-settings",
        json={"expected_version": 0, "settings": HEATCALC_SETTINGS},
        headers={"X-Session-Id": guest_session},
    )
    assert first.status_code == 200

    conflict = await client.put(
        f"/api/v1/projects/{project['id']}/display-settings",
        json={"expected_version": 0, "settings": {"heatcalc": {}}},
        headers={"X-Session-Id": guest_session},
    )
    assert conflict.status_code == 409, conflict.text
    detail = conflict.json()["detail"]
    assert detail["code"] == "PROJECT_DISPLAY_SETTINGS_VERSION_CONFLICT"
    assert detail["details"] == {"expected_version": 0, "current_version": 1}


async def test_foreign_guest_gets_403_on_read_and_write(
    client: AsyncClient,
    guest_session: str,
):
    project = await _guest_project(client, guest_session)
    other_session = (await client.post("/api/v1/auth/guest")).json()["session_id"]

    get_response = await client.get(
        f"/api/v1/projects/{project['id']}/display-settings",
        headers={"X-Session-Id": other_session},
    )
    put_response = await client.put(
        f"/api/v1/projects/{project['id']}/display-settings",
        json={"expected_version": 0, "settings": HEATCALC_SETTINGS},
        headers={"X-Session-Id": other_session},
    )

    assert get_response.status_code == 403
    assert put_response.status_code == 403


async def test_unknown_workspace_key_rejected_422(
    client: AsyncClient,
    guest_session: str,
):
    project = await _guest_project(client, guest_session)

    response = await client.put(
        f"/api/v1/projects/{project['id']}/display-settings",
        json={"expected_version": 0, "settings": {"reports": {"x": 1}}},
        headers={"X-Session-Id": guest_session},
    )

    assert response.status_code == 422


async def test_oversized_payload_rejected_422_with_code(
    client: AsyncClient,
    guest_session: str,
):
    project = await _guest_project(client, guest_session)

    response = await client.put(
        f"/api/v1/projects/{project['id']}/display-settings",
        json={
            "expected_version": 0,
            "settings": {"heatcalc": {"blob": "x" * (32 * 1024)}},
        },
        headers={"X-Session-Id": guest_session},
    )

    assert response.status_code == 422, response.text
    assert response.json()["detail"]["code"] == "PROJECT_DISPLAY_SETTINGS_TOO_LARGE"


async def test_export_import_round_trip_restores_settings_and_version(
    client: AsyncClient,
    guest_session: str,
):
    """Кейс §5.11: файл с машины A показывает те же настройки на машине B."""
    project = await _guest_project(client, guest_session)
    seeded = await client.put(
        f"/api/v1/projects/{project['id']}/display-settings",
        json={"expected_version": 0, "settings": HEATCALC_SETTINGS},
        headers={"X-Session-Id": guest_session},
    )
    assert seeded.status_code == 200
    bumped = await client.put(
        f"/api/v1/projects/{project['id']}/display-settings",
        json={
            "expected_version": 1,
            "settings": {"heatcalc": {"tableView": {"fontSize": "large"}}},
        },
        headers={"X-Session-Id": guest_session},
    )
    assert bumped.status_code == 200
    assert bumped.json()["version"] == 2

    export = await client.get(
        f"/api/v1/projects/{project['id']}/export-csv",
        headers={"X-Session-Id": guest_session},
    )
    assert export.status_code == 200, export.text

    # «Другая машина» — новая гостевая сессия без localStorage и без проекта A.
    other_session = (await client.post("/api/v1/auth/guest")).json()["session_id"]
    imported = await client.post(
        "/api/v1/projects/import-csv",
        files={"file": ("project.csv", export.content, "text/csv")},
        headers={"X-Session-Id": other_session},
    )
    assert imported.status_code == 201, imported.text

    restored = await client.get(
        f"/api/v1/projects/{imported.json()['id']}/display-settings",
        headers={"X-Session-Id": other_session},
    )
    assert restored.status_code == 200, restored.text
    assert restored.json()["version"] == 2
    assert restored.json()["settings"] == {"heatcalc": {"tableView": {"fontSize": "large"}}}


async def test_import_of_v3_file_without_display_settings_stays_valid(
    client: AsyncClient,
    guest_session: str,
):
    """Файл v3 без опциональных колонок display_settings валиден: version=0."""
    project = await _guest_project(client, guest_session)
    export = await client.get(
        f"/api/v1/projects/{project['id']}/export-csv",
        headers={"X-Session-Id": guest_session},
    )
    assert export.status_code == 200
    text = export.content.decode("utf-8-sig")
    stripped = "\n".join(
        line for line in text.splitlines() if not line.startswith("display_settings")
    )

    imported = await client.post(
        "/api/v1/projects/import-csv",
        files={"file": ("project.csv", stripped.encode("utf-8"), "text/csv")},
        headers={"X-Session-Id": guest_session},
    )
    assert imported.status_code == 201, imported.text

    restored = await client.get(
        f"/api/v1/projects/{imported.json()['id']}/display-settings",
        headers={"X-Session-Id": guest_session},
    )
    assert restored.json() == {
        "project_id": imported.json()["id"],
        "version": 0,
        "settings": {},
    }


async def test_duplicate_project_copies_display_settings(
    client: AsyncClient,
    employee_token: str,
):
    """Кейс §5.12: настройки проекта — часть проектных данных, копия их сохраняет."""
    headers = {"Authorization": f"Bearer {employee_token}"}
    src = (
        await client.post(
            "/api/v1/projects",
            json={"name": "Исходный", "task_number": "DS-1"},
            headers=headers,
        )
    ).json()
    seeded = await client.put(
        f"/api/v1/projects/{src['id']}/display-settings",
        json={"expected_version": 0, "settings": HEATCALC_SETTINGS},
        headers=headers,
    )
    assert seeded.status_code == 200, seeded.text

    duplicated = await client.post(
        f"/api/v1/projects/{src['id']}/duplicate",
        headers=headers,
    )
    assert duplicated.status_code == 201, duplicated.text

    copy_settings = await client.get(
        f"/api/v1/projects/{duplicated.json()['id']}/display-settings",
        headers=headers,
    )
    assert copy_settings.status_code == 200, copy_settings.text
    assert copy_settings.json()["version"] == 1
    assert copy_settings.json()["settings"] == HEATCALC_SETTINGS
