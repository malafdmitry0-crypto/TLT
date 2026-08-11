"""PostgreSQL proof for legacy numeric writes during the UUID expand window."""

from uuid import UUID

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.electrical_calculation import ElectricalCalculation
from app.models.electrical_candidate import ElectricalCandidate
from app.models.electrical_candidate_folder import ElectricalCandidateFolder
from app.models.electrical_variant import ElectricalVariant, ElectricalVariantObject
from app.models.specification import Specification
from app.tests.heat_fixtures import canonical_pipe_params

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def _create_project(client: AsyncClient, token: str, name: str) -> dict:
    response = await client.post(
        "/api/v1/projects",
        json={"name": name},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 201, response.text
    return response.json()


async def _create_ready_pipe(
    client: AsyncClient,
    token: str,
    project_id: str,
) -> dict:
    response = await client.post(
        f"/api/v1/projects/{project_id}/objects",
        json={
            "object_type": "pipe",
            "params": canonical_pipe_params(),
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code in (200, 201), response.text
    return response.json()


async def _prepare_assigned_legacy_variants(
    client: AsyncClient,
    project_id: str,
    object_id: str,
    headers: dict[str, str],
) -> None:
    initialized = await client.post(
        f"/api/v1/projects/{project_id}/electrical-variants/initialize",
        headers=headers,
    )
    assert initialized.status_code == 200, initialized.text
    variants = [initialized.json()["variant"]]
    for variant_number in range(2, 5):
        created = await client.post(
            f"/api/v1/projects/{project_id}/electrical-variants",
            json={"name": f"ЭР{variant_number} UUID bridge"},
            headers=headers,
        )
        assert created.status_code == 201, created.text
        variants.append(created.json())

    for variant in variants:
        assignments = await client.get(
            f"/api/v1/projects/{project_id}/electrical-variants/" f"{variant['id']}/assignments",
            headers=headers,
        )
        assert assignments.status_code == 200, assignments.text
        assignment = next(
            item for item in assignments.json()["items"] if item["object_id"] == object_id
        )
        assigned = await client.patch(
            f"/api/v1/projects/{project_id}/electrical-variants/" f"{variant['id']}/assignments",
            json={
                "system_type": "self_regulating",
                "items": [
                    {
                        "object_id": object_id,
                        "expected_version": assignment["version"],
                    }
                ],
            },
            headers=headers,
        )
        assert assigned.status_code == 200, assigned.text


class TestLegacyElectricalVariantWrites:
    async def test_all_normal_numeric_writes_persist_project_scoped_uuid(
        self,
        client: AsyncClient,
        employee_token: str,
        db_session: AsyncSession,
    ) -> None:
        headers = {"Authorization": f"Bearer {employee_token}"}
        project = await _create_project(client, employee_token, "Legacy UUID write bridge")
        obj = await _create_ready_pipe(client, employee_token, project["id"])
        await _prepare_assigned_legacy_variants(
            client,
            project["id"],
            obj["id"],
            headers,
        )
        settings_response = await client.patch(
            f"/api/v1/projects/{project['id']}/electrical-settings",
            json={"expected_version": 1, "max_section_start_current_a": 13.065},
            headers=headers,
        )
        assert settings_response.status_code == 200, settings_response.text

        direct_calc = await client.post(
            "/api/v1/calc/electrical",
            json={
                "object_id": obj["id"],
                "variant_number": 1,
                "cable_type": "self_regulating_tt",
                "data": {
                    "required_power_per_meter": 20,
                    "cable_mark": "30ТТВ2-СР",
                    "number_of_threads": 3,
                    "supply_voltage": 230,
                    "process_temperature": 80.0,
                    "ambient_temperature": -30.0,
                    "selection_policy": "technical_minimum",
                    "pipe_length": 50,
                    "safety_factor": 1.1,
                },
            },
            headers=headers,
        )
        assert direct_calc.status_code == 200, direct_calc.text

        candidate_response = await client.post(
            "/api/v1/calc/electrical/candidates",
            json={
                "project_id": project["id"],
                "object_id": obj["id"],
                "variant_number": 2,
                "cable_type": "self_regulating_tt",
                "cable_source": "builtin",
                "mode": "auto",
            },
            headers=headers,
        )
        assert candidate_response.status_code == 200, candidate_response.text
        candidate_id = candidate_response.json()["candidate"]["id"]

        folder_response = await client.post(
            "/api/v1/calc/electrical/candidate-folders",
            json={
                "project_id": project["id"],
                "object_id": obj["id"],
                "variant_number": 3,
                "name": "UUID bridge",
            },
            headers=headers,
        )
        assert folder_response.status_code == 200, folder_response.text
        folder_id = folder_response.json()["id"]

        # Iдоп секции select-cable наследует из настроек, сохранённых выше.
        manual_calc = await client.post(
            "/api/v1/calc/electrical/select-cable",
            params={
                "object_id": obj["id"],
                "variant_number": 4,
                "cable_mark": "60ТТВ2-СР",
            },
            headers=headers,
        )
        assert manual_calc.status_code == 200, manual_calc.text

        # Спецификация UUID-only (DEC-07): числовой мост снят, позиции пишутся
        # по UUID ЭР, который владеет legacy-слотом 2.
        variants_listing = await client.get(
            f"/api/v1/projects/{project['id']}/electrical-variants",
            headers=headers,
        )
        assert variants_listing.status_code == 200, variants_listing.text
        slot_two = next(
            item for item in variants_listing.json() if item["legacy_variant_number"] == 2
        )
        saved_spec = await client.put(
            f"/api/v1/specifications/{project['id']}/variants/{slot_two['id']}/items",
            json={
                "items": [
                    {
                        "category": "manual",
                        "name": "Ручная позиция",
                        "unit": "шт",
                        "quantity": 1,
                        "source": "manual",
                    }
                ]
            },
            headers=headers,
        )
        assert saved_spec.status_code == 200, saved_spec.text

        project_id = UUID(project["id"])
        object_id = UUID(obj["id"])
        variants = list(
            (
                await db_session.execute(
                    select(ElectricalVariant)
                    .where(ElectricalVariant.project_id == project_id)
                    .order_by(ElectricalVariant.legacy_variant_number)
                )
            )
            .scalars()
            .all()
        )
        assert [item.legacy_variant_number for item in variants] == [1, 2, 3, 4]
        variants_by_slot = {item.legacy_variant_number: item.id for item in variants}

        calculations = list(
            (
                await db_session.execute(
                    select(ElectricalCalculation).where(
                        ElectricalCalculation.project_id == project_id
                    )
                )
            )
            .scalars()
            .all()
        )
        assert {item.variant_number: item.electrical_variant_id for item in calculations} == {
            1: variants_by_slot[1],
            4: variants_by_slot[4],
        }

        candidate = await db_session.get(ElectricalCandidate, UUID(candidate_id))
        folder = await db_session.get(ElectricalCandidateFolder, UUID(folder_id))
        assert candidate is not None
        assert folder is not None
        assert candidate.electrical_variant_id == variants_by_slot[2]
        assert folder.electrical_variant_id == variants_by_slot[3]

        specifications = list(
            (
                await db_session.execute(
                    select(Specification).where(Specification.project_id == project_id)
                )
            )
            .scalars()
            .all()
        )
        assert {item.electrical_variant_id for item in specifications} == {variants_by_slot[2]}

        assignments = list(
            (
                await db_session.execute(
                    select(ElectricalVariantObject).where(
                        ElectricalVariantObject.object_id == object_id
                    )
                )
            )
            .scalars()
            .all()
        )
        assert {item.electrical_variant_id for item in assignments} == set(
            variants_by_slot.values()
        )

        for model in (
            ElectricalCalculation,
            ElectricalCandidate,
            ElectricalCandidateFolder,
            Specification,
        ):
            null_count = await db_session.scalar(
                select(func.count())
                .select_from(model)
                .where(
                    model.project_id == project_id,
                    model.electrical_variant_id.is_(None),
                )
            )
            assert null_count == 0, model.__tablename__

    @pytest.mark.parametrize(
        ("endpoint", "payload"),
        [
            (
                "/api/v1/calc/electrical/candidates",
                {
                    "variant_number": 1,
                    "cable_type": "self_regulating_tt",
                    "cable_source": "builtin",
                    "mode": "auto",
                },
            ),
            (
                "/api/v1/calc/electrical/candidate-folders",
                {"variant_number": 1, "name": "Wrong project"},
            ),
        ],
    )
    async def test_cross_project_object_is_rejected_before_variant_creation(
        self,
        endpoint: str,
        payload: dict,
        client: AsyncClient,
        employee_token: str,
        db_session: AsyncSession,
    ) -> None:
        headers = {"Authorization": f"Bearer {employee_token}"}
        object_project = await _create_project(client, employee_token, "Object project")
        obj = await _create_ready_pipe(client, employee_token, object_project["id"])
        claimed_project = await _create_project(client, employee_token, "Claimed project")

        response = await client.post(
            endpoint,
            json={
                **payload,
                "project_id": claimed_project["id"],
                "object_id": obj["id"],
            },
            headers=headers,
        )

        assert response.status_code == 404, response.text
        variant_count = await db_session.scalar(select(func.count(ElectricalVariant.id)))
        assert variant_count == 0
