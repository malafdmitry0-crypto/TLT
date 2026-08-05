"""Exact UUID persistence and invalidation for per-object TT overrides."""

from uuid import UUID

import pytest
from httpx import AsyncClient
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_event import AuditEvent
from app.models.electrical_calculation import ElectricalCalculation
from app.models.electrical_candidate import ElectricalCandidate
from app.models.electrical_variant import ElectricalVariantObject

pytestmark = pytest.mark.asyncio(loop_scope="session")

_READY_PIPE_PARAMS = {
    "name": "TT override pipe",
    "outer_diameter": 0.108,
    "wall_thickness": 0.004,
    "pipe_material": "carbon_steel",
    "insulation_layers": [{"thickness": 0.05, "material": "mineral_wool_boards_120"}],
    "insulation_temperature_basis": "outdoor_winter",
    "ambient_temperature": -30.0,
    "process_temperature": 80.0,
    "maintain_temperature": 10.0,
    "aggressive_product": False,
    "steam_tracing": False,
    "pipe_length": 50.0,
    "placement": "outdoor",
    "wind_speed": 0.0,
}


async def _project(client: AsyncClient, session_id: str) -> dict:
    response = await client.get("/api/v1/projects", headers={"X-Session-Id": session_id})
    assert response.status_code == 200, response.text
    return response.json()[0]


async def _object(
    client: AsyncClient,
    project_id: str,
    headers: dict[str, str],
    name: str,
) -> dict:
    response = await client.post(
        f"/api/v1/projects/{project_id}/objects",
        headers=headers,
        json={
            "object_type": "pipe",
            "params": {**_READY_PIPE_PARAMS, "name": name},
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


async def _assignment_items(
    client: AsyncClient,
    project_id: str,
    variant_id: str,
    headers: dict[str, str],
) -> dict[str, dict]:
    response = await client.get(
        f"/api/v1/projects/{project_id}/electrical-variants/{variant_id}/assignments",
        headers=headers,
    )
    assert response.status_code == 200, response.text
    return {item["object_id"]: item for item in response.json()["items"]}


async def _assign_self_regulating(
    client: AsyncClient,
    project_id: str,
    variant_id: str,
    headers: dict[str, str],
    items: dict[str, dict],
) -> dict[str, dict]:
    response = await client.patch(
        f"/api/v1/projects/{project_id}/electrical-variants/{variant_id}/assignments",
        headers=headers,
        json={
            "system_type": "self_regulating",
            "items": [
                {"object_id": object_id, "expected_version": item["version"]}
                for object_id, item in items.items()
            ],
        },
    )
    assert response.status_code == 200, response.text
    return {item["object_id"]: item for item in response.json()["assignments"]}


async def test_override_patch_is_exact_sparse_optimistic_and_marks_dependents_stale(
    client: AsyncClient,
    guest_session: str,
    db_session: AsyncSession,
) -> None:
    project = await _project(client, guest_session)
    project_id = project["id"]
    headers = {
        "X-Session-Id": guest_session,
        "X-Request-Id": "assignment-electrical-overrides",
    }
    target = await _object(client, project_id, headers, "Override target")
    neighbor = await _object(client, project_id, headers, "Override neighbor")

    initialized = await client.post(
        f"/api/v1/projects/{project_id}/electrical-variants/initialize",
        headers=headers,
    )
    assert initialized.status_code == 200, initialized.text
    first = initialized.json()["variant"]
    created = await client.post(
        f"/api/v1/projects/{project_id}/electrical-variants",
        headers=headers,
        json={"name": "ЭР2 override isolation"},
    )
    assert created.status_code == 201, created.text
    second = created.json()

    first_items = await _assignment_items(client, project_id, first["id"], headers)
    second_items = await _assignment_items(client, project_id, second["id"], headers)
    first_assigned = await _assign_self_regulating(
        client,
        project_id,
        first["id"],
        headers,
        first_items,
    )
    second_assigned = await _assign_self_regulating(
        client,
        project_id,
        second["id"],
        headers,
        {target["id"]: second_items[target["id"]]},
    )

    await db_session.execute(
        update(ElectricalVariantObject)
        .where(
            ElectricalVariantObject.electrical_variant_id == UUID(first["id"]),
            ElectricalVariantObject.object_id == UUID(target["id"]),
        )
        .values(assignment_state="ready", diagnostics={})
    )
    calculation = ElectricalCalculation(
        project_id=UUID(project_id),
        object_id=UUID(target["id"]),
        variant_number=first["legacy_variant_number"],
        electrical_variant_id=UUID(first["id"]),
        cable_type="self_regulating_tt",
        cable_type_source="manual",
        cable_mark="30ТТН2-СТ",
        cable_mark_source="auto",
        params={},
        results={"selected_cable": "30ТТН2-СТ"},
    )
    candidate = ElectricalCandidate(
        project_id=UUID(project_id),
        object_id=UUID(target["id"]),
        variant_number=first["legacy_variant_number"],
        electrical_variant_id=UUID(first["id"]),
        cable_type="self_regulating_tt",
        cable_source="builtin",
        cable_mark="30ТТН2-СТ",
        dedupe_key="assignment-electrical-overrides",
        mode="manual",
        status="applicable",
        is_applied=True,
        params={},
    )
    db_session.add_all([calculation, candidate])
    await db_session.commit()

    url = (
        f"/api/v1/projects/{project_id}/electrical-variants/{first['id']}"
        f"/assignments/{target['id']}/electrical-overrides"
    )
    patched = await client.patch(
        url,
        headers=headers,
        json={
            "expected_version": first_assigned[target["id"]]["version"],
            "steam_temperature_c": None,
            "maintain_temperature_c": "10.5",
            "aggressive_product": True,
            "winding_pitch_mm": None,
            "thread_count": None,
            "manual_cable_model": None,
            "tank_heating_height_m": "2.5",
            "tank_laying_step_m": "0.1",
        },
    )
    assert patched.status_code == 200, patched.text
    body = patched.json()
    assert body["version"] == first_assigned[target["id"]]["version"] + 1
    assert body["assignment_state"] == "stale"
    assert body["electrical_overrides"] == {
        "steam_temperature_c": None,
        "maintain_temperature_c": "10.5",
        "aggressive_product": True,
        "winding_pitch_mm": None,
        "thread_count": None,
        "manual_cable_model": None,
        "tank_heating_height_m": "2.5",
        "tank_laying_step_m": "0.1",
    }

    current_first = await _assignment_items(client, project_id, first["id"], headers)
    current_second = await _assignment_items(client, project_id, second["id"], headers)
    assert current_first[neighbor["id"]]["electrical_overrides"] == {}
    assert current_first[neighbor["id"]]["version"] == first_assigned[neighbor["id"]]["version"]
    assert current_second[target["id"]]["electrical_overrides"] == {}
    assert current_second[target["id"]]["version"] == second_assigned[target["id"]]["version"]

    refreshed_calculation = await db_session.scalar(
        select(ElectricalCalculation)
        .where(ElectricalCalculation.id == calculation.id)
        .execution_options(populate_existing=True)
    )
    refreshed_candidate = await db_session.scalar(
        select(ElectricalCandidate)
        .where(ElectricalCandidate.id == candidate.id)
        .execution_options(populate_existing=True)
    )
    assert refreshed_calculation is not None
    assert refreshed_calculation.results["stale_reason"] == "electrical_overrides_changed"
    assert refreshed_candidate is not None
    assert refreshed_candidate.status == "stale"
    assert refreshed_candidate.is_applied is False
    audit = await db_session.scalar(
        select(AuditEvent).where(
            AuditEvent.event_type == "project.electrical_assignment.electrical_overrides_updated",
            AuditEvent.object_id == UUID(target["id"]),
        )
    )
    assert audit is not None
    assert audit.details["electrical_variant_id"] == first["id"]
    assert audit.after_state["assignment_version"] == body["version"]

    conflict = await client.patch(
        url,
        headers=headers,
        json={
            "expected_version": first_assigned[target["id"]]["version"],
            "maintain_temperature_c": 11,
        },
    )
    assert conflict.status_code == 409
    assert conflict.json()["detail"]["code"] == "ELECTRICAL_ASSIGNMENT_VERSION_CONFLICT"

    cleared = await client.patch(
        url,
        headers=headers,
        json={
            "expected_version": body["version"],
            "maintain_temperature_c": None,
            "aggressive_product": None,
            "tank_heating_height_m": None,
            "tank_laying_step_m": None,
        },
    )
    assert cleared.status_code == 200, cleared.text
    assert cleared.json()["electrical_overrides"] == {
        "steam_temperature_c": None,
        "winding_pitch_mm": None,
        "thread_count": None,
        "manual_cable_model": None,
    }

    copied = await client.post(
        f"/api/v1/projects/{project_id}/electrical-variants/{first['id']}/copy",
        headers={**headers, "Idempotency-Key": "copy-assignment-electrical-overrides"},
        json={"name": "ЭР3 override copy"},
    )
    assert copied.status_code == 201, copied.text
    copied_items = await _assignment_items(client, project_id, copied.json()["id"], headers)
    assert (
        copied_items[target["id"]]["electrical_overrides"] == cleared.json()["electrical_overrides"]
    )
