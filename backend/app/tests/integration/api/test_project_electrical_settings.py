from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_event import AuditEvent
from app.models.project_electrical_settings import ProjectElectricalSettings

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def _guest_project(client: AsyncClient, session_id: str) -> dict:
    response = await client.get("/api/v1/projects", headers={"X-Session-Id": session_id})
    assert response.status_code == 200
    return response.json()[0]


async def test_get_returns_backend_voltage_and_nullable_current(
    client: AsyncClient,
    guest_session: str,
    db_session: AsyncSession,
):
    project = await _guest_project(client, guest_session)

    response = await client.get(
        f"/api/v1/projects/{project['id']}/electrical-settings",
        headers={"X-Session-Id": guest_session},
    )

    assert response.status_code == 200, response.text
    assert response.json()["nominal_voltage_v"] == 230
    assert response.json()["max_section_start_current_a"] is None
    assert response.json()["version"] == 1
    assert await db_session.get(ProjectElectricalSettings, project["id"]) is not None


async def test_patch_updates_current_with_optimistic_version_and_audit(
    client: AsyncClient,
    guest_session: str,
    db_session: AsyncSession,
):
    project = await _guest_project(client, guest_session)

    response = await client.patch(
        f"/api/v1/projects/{project['id']}/electrical-settings",
        json={"expected_version": 1, "max_section_start_current_a": "13.065"},
        headers={"X-Session-Id": guest_session},
    )

    assert response.status_code == 200, response.text
    assert Decimal(response.json()["max_section_start_current_a"]) == Decimal("13.065")
    assert response.json()["version"] == 2
    assert response.json()["updated_by"] == guest_session
    audit = await db_session.scalar(
        select(AuditEvent).where(AuditEvent.event_type == "project.electrical_settings.updated")
    )
    assert audit is not None

    conflict = await client.patch(
        f"/api/v1/projects/{project['id']}/electrical-settings",
        json={"expected_version": 1, "max_section_start_current_a": "14"},
        headers={"X-Session-Id": guest_session},
    )
    assert conflict.status_code == 409
    assert conflict.json()["detail"]["code"] == "ELECTRICAL_SETTINGS_VERSION_CONFLICT"
    assert conflict.json()["detail"]["details"]["current_version"] == 2


async def test_patch_can_clear_current_but_cannot_change_voltage(
    client: AsyncClient,
    guest_session: str,
):
    project = await _guest_project(client, guest_session)
    created = await client.patch(
        f"/api/v1/projects/{project['id']}/electrical-settings",
        json={"expected_version": 1, "max_section_start_current_a": "10"},
        headers={"X-Session-Id": guest_session},
    )
    assert created.status_code == 200

    cleared = await client.patch(
        f"/api/v1/projects/{project['id']}/electrical-settings",
        json={"expected_version": 2, "max_section_start_current_a": None},
        headers={"X-Session-Id": guest_session},
    )
    assert cleared.status_code == 200
    assert cleared.json()["max_section_start_current_a"] is None
    assert cleared.json()["nominal_voltage_v"] == 230

    rejected = await client.patch(
        f"/api/v1/projects/{project['id']}/electrical-settings",
        json={
            "expected_version": 3,
            "max_section_start_current_a": "10",
            "nominal_voltage_v": 220,
        },
        headers={"X-Session-Id": guest_session},
    )
    assert rejected.status_code == 422


async def test_guest_cannot_read_or_patch_another_guest_project(
    client: AsyncClient,
    guest_session: str,
):
    project = await _guest_project(client, guest_session)
    other_session = (await client.post("/api/v1/auth/guest")).json()["session_id"]

    get_response = await client.get(
        f"/api/v1/projects/{project['id']}/electrical-settings",
        headers={"X-Session-Id": other_session},
    )
    patch_response = await client.patch(
        f"/api/v1/projects/{project['id']}/electrical-settings",
        json={"expected_version": 1, "max_section_start_current_a": "10"},
        headers={"X-Session-Id": other_session},
    )

    assert get_response.status_code == 403
    assert patch_response.status_code == 403
