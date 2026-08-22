"""Canonical UUID-only specification API regressions.

The broader generation/settings contract lives in
``test_specification_canonical_api.py``.  This module keeps the persistence,
permission and stale-state scenarios that were previously hidden among the
retired numeric/legacy API tests.
"""

from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.electrical_variant import ElectricalVariant, ElectricalVariantObject
from app.models.project import Project
from app.models.specification import Specification
from app.models.user import User

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def _seed_project_with_variants(
    db_session: AsyncSession,
    *,
    name: str,
    user_id: uuid.UUID | None = None,
    session_id: str | None = None,
    count: int = 1,
) -> tuple[Project, list[ElectricalVariant]]:
    project = Project(name=name, user_id=user_id, session_id=session_id)
    db_session.add(project)
    await db_session.flush()
    variants = [
        ElectricalVariant(
            project_id=project.id,
            name=f"ER {index + 1}",
            name_normalized=f"er {index + 1}",
            sort_order=index,
            is_active=index == 0,
        )
        for index in range(count)
    ]
    db_session.add_all(variants)
    await db_session.commit()
    return project, variants


def _manual_item(name: str, quantity: str = "1") -> dict[str, object]:
    return {
        "category": "extra",
        "name": name,
        "article": None,
        "unit": "шт.",
        "quantity": quantity,
        "params": {},
        "source": "manual",
    }


def _auto_item(name: str) -> dict[str, object]:
    return {
        "category": "cable",
        "name": name,
        "article": "AUTO-1",
        "unit": "м",
        "quantity": "12.5",
        "params": {"catalog_item_id": str(uuid.uuid4())},
        "source": "auto",
    }


async def test_legacy_numeric_routes_and_payload_are_absent(
    client: AsyncClient,
    db_session: AsyncSession,
    employee_user: User,
    employee_token: str,
) -> None:
    project, variants = await _seed_project_with_variants(
        db_session,
        name="No legacy specification API",
        user_id=employee_user.id,
    )
    headers = {"Authorization": f"Bearer {employee_token}"}

    legacy_get = await client.get(
        f"/api/v1/specifications/{project.id}",
        params={"variant_number": 1},
        headers=headers,
    )
    legacy_put = await client.put(
        f"/api/v1/specifications/{project.id}/items",
        json={"items": [_manual_item("Legacy row")]},
        headers=headers,
    )
    legacy_generate = await client.post(
        f"/api/v1/specifications/{project.id}/generate",
        json={
            "electrical_variant_ids": [str(variants[0].id)],
            "confirm_partial": True,
            "mode": "full",
        },
        headers=headers,
    )

    assert legacy_get.status_code == 404
    assert legacy_put.status_code == 404
    assert legacy_generate.status_code == 422
    assert legacy_generate.json()["detail"]["code"] == "SPEC_VARIANT_IDS_REQUIRED"


async def test_manual_replace_preserves_auto_rows_and_replaces_only_manual_rows(
    client: AsyncClient,
    db_session: AsyncSession,
    employee_user: User,
    employee_token: str,
) -> None:
    project, variants = await _seed_project_with_variants(
        db_session,
        name="Manual UUID replacement",
        user_id=employee_user.id,
    )
    variant = variants[0]
    auto = _auto_item("Generated cable")
    db_session.add(
        Specification(
            project_id=project.id,
            electrical_variant_id=variant.id,
            items=[auto, _manual_item("Old manual")],
            snapshot={"schema": "test-snapshot", "schema_version": 1},
        )
    )
    await db_session.commit()
    headers = {"Authorization": f"Bearer {employee_token}"}
    url = f"/api/v1/specifications/{project.id}/variants/{variant.id}/items"

    response = await client.put(
        url,
        json={"items": [_manual_item("New manual", "2.50")]},
        headers=headers,
    )

    assert response.status_code == 200, response.text
    assert [(item["source"], item["name"]) for item in response.json()["items"]] == [
        ("auto", "Generated cable"),
        ("manual", "New manual"),
    ]
    assert response.json()["items"][1]["quantity"] == "2.5"

    loaded = await client.get(
        f"/api/v1/specifications/{project.id}/variants/{variant.id}",
        headers=headers,
    )
    assert loaded.status_code == 200, loaded.text
    assert [item["name"] for item in loaded.json()["items"]] == [
        "Generated cable",
        "New manual",
    ]
    assert loaded.json()["snapshot"] == {"schema": "test-snapshot", "schema_version": 1}


async def test_manual_put_rejects_backend_owned_source(
    client: AsyncClient,
    db_session: AsyncSession,
    employee_user: User,
    employee_token: str,
) -> None:
    project, variants = await _seed_project_with_variants(
        db_session,
        name="Manual source boundary",
        user_id=employee_user.id,
    )
    response = await client.put(
        f"/api/v1/specifications/{project.id}/variants/{variants[0].id}/items",
        json={"items": [_auto_item("Forged auto row")]},
        headers={"Authorization": f"Bearer {employee_token}"},
    )

    assert response.status_code == 422, response.text
    assert response.json()["error_code"] == "VALIDATION_ERROR"
    assert "manual PUT accepts only source=manual items" in response.json()["fields"]["body.items"]


async def test_stale_specification_remains_readable_but_manual_put_is_blocked(
    client: AsyncClient,
    db_session: AsyncSession,
    employee_user: User,
    employee_token: str,
) -> None:
    project, variants = await _seed_project_with_variants(
        db_session,
        name="Stale UUID specification",
        user_id=employee_user.id,
    )
    variant = variants[0]
    db_session.add(
        Specification(
            project_id=project.id,
            electrical_variant_id=variant.id,
            items=[_manual_item("Historical row")],
            is_stale=True,
            stale_reason="object_params_updated",
            stale_details={"object_ids": [str(uuid.uuid4())]},
        )
    )
    await db_session.commit()
    headers = {"Authorization": f"Bearer {employee_token}"}

    readable = await client.get(
        f"/api/v1/specifications/{project.id}/variants/{variant.id}",
        headers=headers,
    )
    blocked = await client.put(
        f"/api/v1/specifications/{project.id}/variants/{variant.id}/items",
        json={"items": [_manual_item("Must not be saved")]},
        headers=headers,
    )

    assert readable.status_code == 200, readable.text
    assert readable.json()["is_stale"] is True
    assert readable.json()["items"][0]["name"] == "Historical row"
    assert blocked.status_code == 409, blocked.text
    assert blocked.json()["detail"]["code"] == "SPECIFICATION_STALE_READ_ONLY"


async def test_object_change_stales_only_the_assigned_er_specification(
    client: AsyncClient,
    db_session: AsyncSession,
    employee_user: User,
    employee_token: str,
) -> None:
    project, variants = await _seed_project_with_variants(
        db_session,
        name="Per-ER object stale",
        user_id=employee_user.id,
        count=2,
    )
    headers = {"Authorization": f"Bearer {employee_token}"}
    created = await client.post(
        f"/api/v1/projects/{project.id}/objects",
        json={
            "object_type": "pipe",
            "params": {
                "outer_diameter": 0.108,
                "wall_thickness": 0.004,
                "pipe_material": "carbon_steel",
                "insulation_layers": [{"thickness": 0.05, "material": "mineral_wool_boards_120"}],
                "insulation_temperature_basis": "outdoor_winter",
                "ambient_temperature": -30,
                "process_temperature": 80,
                "pipe_length": 50,
                "placement": "outdoor",
                "wind_speed": 0.0,
            },
        },
        headers=headers,
    )
    assert created.status_code in (200, 201), created.text
    object_data = created.json()

    assignments = (
        (
            await db_session.execute(
                select(ElectricalVariantObject).where(
                    ElectricalVariantObject.project_id == project.id,
                    ElectricalVariantObject.object_id == uuid.UUID(object_data["id"]),
                )
            )
        )
        .scalars()
        .all()
    )
    assert len(assignments) == 2
    assigned = next(item for item in assignments if item.electrical_variant_id == variants[0].id)
    assigned.system_type = "self_regulating"
    assigned.assignment_state = "ready"
    db_session.add_all(
        [
            Specification(
                project_id=project.id,
                electrical_variant_id=variant.id,
                items=[_manual_item(f"History {index}")],
            )
            for index, variant in enumerate(variants)
        ]
    )
    await db_session.commit()

    updated = await client.put(
        f"/api/v1/projects/{project.id}/objects/{object_data['id']}",
        json={
            "version": object_data["version"],
            "params": {**object_data["params"], "pipe_length": 75},
        },
        headers=headers,
    )
    assert updated.status_code == 200, updated.text

    rows = {
        item.electrical_variant_id: item
        for item in (
            (
                await db_session.execute(
                    select(Specification).where(Specification.project_id == project.id)
                )
            )
            .scalars()
            .all()
        )
    }
    assert rows[variants[0].id].is_stale is True
    assert rows[variants[0].id].stale_reason == "object_params_updated"
    assert rows[variants[1].id].is_stale is False


async def test_guest_can_read_own_uuid_spec_but_cannot_write_manual_rows(
    client: AsyncClient,
    db_session: AsyncSession,
    guest_session: str,
) -> None:
    project, variants = await _seed_project_with_variants(
        db_session,
        name="Guest specification permissions",
        session_id=guest_session,
    )
    variant = variants[0]
    db_session.add(
        Specification(
            project_id=project.id,
            electrical_variant_id=variant.id,
            items=[_manual_item("Guest-readable history")],
        )
    )
    await db_session.commit()
    headers = {"X-Session-Id": guest_session}

    readable = await client.get(
        f"/api/v1/specifications/{project.id}/variants/{variant.id}",
        headers=headers,
    )
    forbidden = await client.put(
        f"/api/v1/specifications/{project.id}/variants/{variant.id}/items",
        json={"items": [_manual_item("Guest write")]},
        headers=headers,
    )

    assert readable.status_code == 200, readable.text
    assert readable.json()["items"][0]["name"] == "Guest-readable history"
    assert forbidden.status_code in (401, 403), forbidden.text
