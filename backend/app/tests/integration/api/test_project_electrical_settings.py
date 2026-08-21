import uuid
from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_event import AuditEvent
from app.models.electrical_calculation import ElectricalCalculation
from app.models.electrical_variant import ElectricalVariant, ElectricalVariantObject
from app.models.project import Project
from app.models.project_electrical_settings import ProjectElectricalSettings
from app.models.project_object import ProjectObject
from app.models.specification import Specification
from app.models.user import User
from app.services.electrical_assignment_service import ElectricalAssignmentService

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


async def test_current_limit_change_stales_all_dependent_ers_and_identical_patch_is_noop(
    client: AsyncClient,
    db_session: AsyncSession,
    employee_user: User,
    employee_token: str,
):
    project = Project(
        id=uuid.uuid4(),
        name="Electrical settings fan-out",
        user_id=employee_user.id,
    )
    variants = [
        ElectricalVariant(
            id=uuid.uuid4(),
            project_id=project.id,
            name=f"ЭР {index}",
            name_normalized=f"эр {index}",
            sort_order=index,
            is_active=index == 1,
        )
        for index in (1, 2)
    ]
    obj = ProjectObject(
        id=uuid.uuid4(),
        project_id=project.id,
        object_type="pipe",
        sort_order=0,
        version=3,
        params={},
        results={"heat_loss": 100},
        is_valid=True,
    )
    db_session.add(project)
    await db_session.flush()
    db_session.add(
        ProjectElectricalSettings(
            project_id=project.id,
            max_section_start_current_a=Decimal("13.065"),
            version=1,
        )
    )
    db_session.add_all(variants)
    await db_session.flush()
    db_session.add(obj)
    await db_session.flush()
    assignments = list(
        (
            await db_session.execute(
                select(ElectricalVariantObject)
                .where(ElectricalVariantObject.project_id == project.id)
                .order_by(ElectricalVariantObject.electrical_variant_id)
            )
        )
        .scalars()
        .all()
    )
    assert len(assignments) == 2
    for assignment in assignments:
        assignment.system_type = "self_regulating"
        assignment.assignment_state = "ready"
        assignment.version = 2
        assignment.object_version_snapshot = obj.version
        assignment.diagnostics = {}
        db_session.add(
            ElectricalCalculation(
                project_id=project.id,
                object_id=obj.id,
                electrical_variant_id=assignment.electrical_variant_id,
                cable_type="self_regulating_tt",
                cable_mark="30ТТВ2-СР",
                params={},
                results={"category": "success", "preserved": True},
            )
        )
        db_session.add(
            Specification(
                project_id=project.id,
                electrical_variant_id=assignment.electrical_variant_id,
                items=[
                    {
                        "category": "common_material",
                        "name": "Ручная позиция",
                        "unit": "шт.",
                        "quantity": "1",
                        "source": "manual",
                    }
                ],
                is_stale=False,
            )
        )
    await db_session.commit()

    headers = {"Authorization": f"Bearer {employee_token}"}
    changed = await client.patch(
        f"/api/v1/projects/{project.id}/electrical-settings",
        json={"expected_version": 1, "max_section_start_current_a": "4"},
        headers=headers,
    )
    assert changed.status_code == 200, changed.text
    assert changed.json()["version"] == 2

    for assignment in assignments:
        await db_session.refresh(assignment)
        assert assignment.assignment_state == "stale"
        assert assignment.version == 3
        assert assignment.diagnostics["reason"] == "project_section_current_limit_changed"
    specifications = list(
        (
            await db_session.execute(
                select(Specification)
                .where(Specification.project_id == project.id)
                .order_by(Specification.electrical_variant_id)
            )
        )
        .scalars()
        .all()
    )
    assert len(specifications) == 2
    assert all(specification.is_stale for specification in specifications)
    assert all(specification.items[0]["source"] == "manual" for specification in specifications)
    stale_timestamps = [specification.stale_at for specification in specifications]

    repeated = await client.patch(
        f"/api/v1/projects/{project.id}/electrical-settings",
        json={"expected_version": 2, "max_section_start_current_a": "4.000"},
        headers=headers,
    )
    assert repeated.status_code == 200, repeated.text
    assert repeated.json()["version"] == 2
    for assignment in assignments:
        await db_session.refresh(assignment)
        assert assignment.version == 3
    for index, specification in enumerate(specifications):
        await db_session.refresh(specification)
        assert specification.stale_at == stale_timestamps[index]

    audits = list(
        (
            await db_session.execute(
                select(AuditEvent).where(
                    AuditEvent.project_id == project.id,
                    AuditEvent.event_type == "project.electrical_settings.updated",
                )
            )
        )
        .scalars()
        .all()
    )
    assert len(audits) == 1

    assignment_by_variant = {
        assignment.electrical_variant_id: assignment for assignment in assignments
    }
    await ElectricalAssignmentService(db_session).sync_from_calculation_rows(
        [
            {
                "project_id": project.id,
                "object_id": obj.id,
                "electrical_variant_id": variants[0].id,
                "cable_type": "self_regulating_tt",
                "cable_mark": "30ТТВ2-СР",
                "results": {"selected_cable": "30ТТВ2-СР"},
            }
        ]
    )
    await db_session.flush()
    await db_session.refresh(assignment_by_variant[variants[0].id])
    await db_session.refresh(assignment_by_variant[variants[1].id])
    assert assignment_by_variant[variants[0].id].assignment_state == "ready"
    assert assignment_by_variant[variants[1].id].assignment_state == "stale"
    assert (
        assignment_by_variant[variants[1].id].diagnostics["reason"]
        == "project_section_current_limit_changed"
    )
