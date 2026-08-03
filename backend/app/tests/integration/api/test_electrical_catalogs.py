"""API lifecycle tests for versioned electrical catalogs."""

import json
from uuid import UUID, uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models.electrical_calculation import ElectricalCalculation
from app.models.electrical_calculation_revision import ElectricalCalculationRevision
from app.models.electrical_variant import ElectricalVariantObject
from app.models.specification import Specification
from app.reference_data.loader import list_electrical_tt_bom_entries, list_tt_cables
from app.services.electrical_catalog_service import ElectricalCatalogService

pytestmark = pytest.mark.asyncio(loop_scope="session")

READY_PIPE_PARAMS = {
    "name": "Catalog lifecycle pipe",
    "outer_diameter": 0.108,
    "wall_thickness": 0.004,
    "pipe_material": "carbon_steel",
    "insulation_layers": [{"thickness": 0.05, "material": "mineral_wool_boards_120"}],
    "insulation_temperature_basis": "outdoor_winter",
    "ambient_temperature": -30.0,
    "process_temperature": 80.0,
    "pipe_length": 50.0,
    "placement": "outdoor",
    "wind_speed": 0.0,
}


async def _import_bom(
    client: AsyncClient,
    admin_token: str,
    *,
    version: str,
):
    return await client.post(
        "/api/v1/admin/electrical-catalogs/import",
        headers={"Authorization": f"Bearer {admin_token}"},
        data={
            "kind": "bom",
            "version": version,
            "source": "approved-specialized-bom.xlsx",
            "source_checksum": "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            "schema_version": "1",
        },
        files={
            "file": (
                "bom.json",
                json.dumps(
                    {"entries": list_electrical_tt_bom_entries()},
                    ensure_ascii=False,
                ).encode(),
                "application/json",
            )
        },
    )


async def test_catalog_metadata_is_available_to_authenticated_principals(
    client: AsyncClient,
    guest_session: str,
):
    response = await client.get(
        "/api/v1/calc/electrical/catalog-metadata",
        headers={"X-Session-Id": guest_session},
    )

    assert response.status_code == 200, response.text
    catalogs = response.json()["catalogs"]
    assert {item["kind"] for item in catalogs} == {"power", "section", "bom"}
    assert response.json()["production_ready"] is False
    assert set(response.json()["missing_active_kinds"]) == {"power", "section", "bom"}
    power = next(item for item in catalogs if item["kind"] == "power")
    assert power["production_approved"] is False


async def test_calculation_catalog_set_holds_shared_activation_lock(
    db_session: AsyncSession,
):
    await ElectricalCatalogService(db_session).active_calculation_catalogs()
    other_session = async_sessionmaker(db_session.bind, expire_on_commit=False)

    async with other_session() as activation_session:
        acquired_while_calculating = await activation_session.scalar(
            select(func.pg_try_advisory_xact_lock(3401))
        )
        assert acquired_while_calculating is False

        await db_session.rollback()
        acquired_after_calculation = await activation_session.scalar(
            select(func.pg_try_advisory_xact_lock(3401))
        )
        assert acquired_after_calculation is True
        await activation_session.rollback()


async def test_catalog_import_is_admin_only_and_provisional_power_cannot_activate(
    client: AsyncClient,
    guest_session: str,
    admin_token: str,
):
    payload = {"rows": [{**row, "voltage": 230} for row in list_tt_cables()]}
    form = {
        "kind": "power",
        "version": f"provisional-{uuid4()}",
        "source": "unapproved provisional table",
        "source_checksum": "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        "schema_version": "1",
        "production_approved": "true",
    }
    files = {"file": ("power.json", json.dumps(payload).encode(), "application/json")}
    forbidden = await client.post(
        "/api/v1/admin/electrical-catalogs/import",
        headers={"X-Session-Id": guest_session},
        data=form,
        files=files,
    )
    assert forbidden.status_code == 403

    imported = await client.post(
        "/api/v1/admin/electrical-catalogs/import",
        headers={"Authorization": f"Bearer {admin_token}"},
        data=form,
        files=files,
    )
    assert imported.status_code == 201, imported.text
    assert imported.json()["status"] == "draft"

    activated = await client.post(
        f"/api/v1/admin/electrical-catalogs/{imported.json()['id']}/activate",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert activated.status_code == 422
    assert activated.json()["detail"]["code"] == "ELECTRICAL_CATALOG_SOURCE_UNREGISTERED"


async def test_activation_atomically_retires_previous_version(
    client: AsyncClient,
    admin_token: str,
):
    headers = {"Authorization": f"Bearer {admin_token}"}
    first = await _import_bom(client, admin_token, version=f"bom-first-{uuid4()}")
    second = await _import_bom(client, admin_token, version=f"bom-second-{uuid4()}")
    assert first.status_code == 201 and second.status_code == 201

    first_activation = await client.post(
        f"/api/v1/admin/electrical-catalogs/{first.json()['id']}/activate",
        headers=headers,
    )
    second_activation = await client.post(
        f"/api/v1/admin/electrical-catalogs/{second.json()['id']}/activate",
        headers=headers,
    )

    assert first_activation.status_code == 200, first_activation.text
    assert second_activation.status_code == 200, second_activation.text
    metadata = await client.get(
        "/api/v1/calc/electrical/catalog-metadata",
        headers=headers,
    )
    active_bom = next(item for item in metadata.json()["catalogs"] if item["kind"] == "bom")
    assert active_bom["id"] == second.json()["id"]
    assert active_bom["authority"] == "database"
    assert active_bom["imported_by"] is None
    assert active_bom["activated_by"] is None


async def test_activation_stales_calculation_assignment_and_exact_variant_specification(
    client: AsyncClient,
    employee_token: str,
    admin_token: str,
    db_session: AsyncSession,
):
    employee_headers = {"Authorization": f"Bearer {employee_token}"}
    project = (
        await client.post(
            "/api/v1/projects",
            json={"name": f"Catalog stale {uuid4()}"},
            headers=employee_headers,
        )
    ).json()
    obj_response = await client.post(
        f"/api/v1/projects/{project['id']}/objects",
        json={"object_type": "pipe", "params": READY_PIPE_PARAMS},
        headers=employee_headers,
    )
    assert obj_response.status_code == 201, obj_response.text
    obj = obj_response.json()
    initialized = await client.post(
        f"/api/v1/projects/{project['id']}/electrical-variants/initialize",
        headers=employee_headers,
    )
    assert initialized.status_code == 200, initialized.text
    variant = initialized.json()["variant"]
    assigned = await client.patch(
        f"/api/v1/projects/{project['id']}/electrical-variants/{variant['id']}/assignments",
        headers=employee_headers,
        json={
            "system_type": "self_regulating",
            "items": [{"object_id": obj["id"], "expected_version": 1}],
        },
    )
    assert assigned.status_code == 200, assigned.text
    assignment_version = assigned.json()["assignments"][0]["version"]

    calc = ElectricalCalculation(
        project_id=UUID(project["id"]),
        object_id=UUID(obj["id"]),
        variant_number=variant["legacy_variant_number"],
        electrical_variant_id=UUID(variant["id"]),
        cable_type="self_regulating_tt",
        cable_type_source="auto",
        cable_mark="30ТТВ2-СР",
        cable_mark_source="auto",
        params={},
        results={"status": "ready", "catalogs": {}},
    )
    spec = Specification(
        project_id=UUID(project["id"]),
        electrical_variant_id=UUID(variant["id"]),
        items=[{"name": "old", "quantity": 1}],
        is_stale=False,
    )
    db_session.add_all([calc, spec])
    await db_session.commit()
    calculation_id = calc.id
    specification_id = spec.id

    imported = await _import_bom(
        client,
        admin_token,
        version=f"approved-bom-{uuid4()}",
    )
    assert imported.status_code == 201, imported.text
    activated = await client.post(
        f"/api/v1/admin/electrical-catalogs/{imported.json()['id']}/activate",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert activated.status_code == 200, activated.text
    assert activated.json()["stale_calculations"] >= 1
    assert activated.json()["stale_assignments"] >= 1
    assert activated.json()["stale_specifications"] >= 1

    db_session.expire_all()
    refreshed_calc = await db_session.get(ElectricalCalculation, calculation_id)
    refreshed_assignment = await db_session.get(
        ElectricalVariantObject,
        UUID(assigned.json()["assignments"][0]["id"]),
    )
    refreshed_spec = await db_session.get(Specification, specification_id)
    assert refreshed_calc is not None and refreshed_calc.results["category"] == "stale"
    assert refreshed_assignment is not None
    assert refreshed_assignment.assignment_state == "stale"
    assert refreshed_assignment.version == assignment_version + 1
    assert refreshed_spec is not None and refreshed_spec.is_stale is True


async def test_legacy_tt_snapshot_is_readable_but_excluded_from_ready_summary(
    client: AsyncClient,
    employee_token: str,
    db_session: AsyncSession,
):
    headers = {"Authorization": f"Bearer {employee_token}"}
    project_response = await client.post(
        "/api/v1/projects",
        json={"name": f"Legacy TT {uuid4()}"},
        headers=headers,
    )
    assert project_response.status_code == 201, project_response.text
    project = project_response.json()
    object_response = await client.post(
        f"/api/v1/projects/{project['id']}/objects",
        json={"object_type": "pipe", "params": READY_PIPE_PARAMS},
        headers=headers,
    )
    assert object_response.status_code == 201, object_response.text
    obj = object_response.json()
    initialized = await client.post(
        f"/api/v1/projects/{project['id']}/electrical-variants/initialize",
        headers=headers,
    )
    assert initialized.status_code == 200, initialized.text
    variant = initialized.json()["variant"]
    assigned = await client.patch(
        f"/api/v1/projects/{project['id']}/electrical-variants/{variant['id']}/assignments",
        headers=headers,
        json={
            "system_type": "self_regulating",
            "items": [{"object_id": obj["id"], "expected_version": 1}],
        },
    )
    assert assigned.status_code == 200, assigned.text

    legacy = ElectricalCalculation(
        project_id=UUID(project["id"]),
        object_id=UUID(obj["id"]),
        variant_number=variant["legacy_variant_number"],
        electrical_variant_id=UUID(variant["id"]),
        cable_type="self_regulating_tt",
        cable_type_source="auto",
        cable_mark="30ТТВ2-СР",
        cable_mark_source="auto",
        params={},
        results={
            "status": "ready",
            "selected_cable": "30ТТВ2",
            "cable_mark": "30ТТВ2-СР",
            "voltage": 220,
            "order_cable_length": 100,
            "total_power": 3000,
            "current": 13.64,
        },
    )
    db_session.add(legacy)
    await db_session.commit()
    db_session.add(
        ElectricalCalculationRevision(
            electrical_calculation_id=legacy.id,
            revision_number=999,
            supersedes_result_id=None,
            project_id=legacy.project_id,
            object_id=legacy.object_id,
            variant_number=legacy.variant_number,
            electrical_variant_id=legacy.electrical_variant_id,
            cable_type=legacy.cable_type,
            cable_type_source=legacy.cable_type_source,
            cable_mark=legacy.cable_mark,
            cable_mark_source=legacy.cable_mark_source,
            cable_snapshot=legacy.cable_snapshot,
            params=legacy.params,
            results=legacy.results,
            status="stale",
            source_created_at=legacy.created_at,
            source_updated_at=legacy.updated_at,
        )
    )
    await db_session.commit()

    page = await client.get(
        "/api/v1/calc/electrical/page",
        headers=headers,
        params={
            "project_id": project["id"],
            "variant_number": variant["legacy_variant_number"],
        },
    )

    assert page.status_code == 200, page.text
    body = page.json()
    visible = body["calculations"][0]["results"]
    assert visible["stale"] is True
    assert visible["stale_reason"] == "legacy_or_missing_nominal_voltage"
    assert body["summary"]["calculated_count"] == 0
    assert body["summary"]["total_cable_length"] == 0
    assert body["summary"]["total_power"] == 0
    assert body["summary"]["total_current"] == 0

    history = await client.get(
        f"/api/v1/calc/electrical/history/{legacy.id}",
        headers=headers,
    )
    assert history.status_code == 200, history.text
    history_body = history.json()
    assert history_body["calculation_id"] == str(legacy.id)
    assert history_body["total"] >= 1
    assert history_body["items"][0]["revision_number"] == 999
    assert history_body["items"][0]["status"] == "stale"
