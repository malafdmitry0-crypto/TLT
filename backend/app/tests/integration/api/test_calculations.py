"""Integration-тесты расчётов."""

from uuid import UUID

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.electrical_calculation import ElectricalCalculation
from app.models.electrical_candidate import ElectricalCandidate
from app.models.electrical_variant import ElectricalVariantObject

pytestmark = pytest.mark.asyncio(loop_scope="session")

CABLE_LENGTH_FACTOR = 1.1  # BR-CABLE-02
MINERAL_WOOL = "mineral_wool_boards_120"
POLYURETHANE = "polyurethane_products_40"


async def _create_project(client: AsyncClient, session_id: str) -> dict:
    resp = await client.get(
        "/api/v1/projects",
        headers={"X-Session-Id": session_id},
    )
    return resp.json()[0]


async def _create_project_with_token(client: AsyncClient, token: str) -> dict:
    resp = await client.post(
        "/api/v1/projects",
        json={"name": "Admin calculation project"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _set_project_current_limit(
    client: AsyncClient,
    project_id: str,
    session_id: str,
) -> None:
    response = await client.patch(
        f"/api/v1/projects/{project_id}/electrical-settings",
        json={"expected_version": 1, "max_section_start_current_a": "13.065"},
        headers={"X-Session-Id": session_id},
    )
    assert response.status_code == 200, response.text


async def _create_pipe_object(
    client: AsyncClient,
    project_id: str,
    session_id: str,
    params_override: dict | None = None,
) -> dict:
    params = {
        "outer_diameter": 0.108,
        "wall_thickness": 0.004,
        "pipe_material": "carbon_steel",
        "insulation_layers": [{"thickness": 0.05, "material": MINERAL_WOOL}],
        "insulation_temperature_basis": "outdoor_winter",
        "ambient_temperature": -30,
        "process_temperature": 80,
        "min_switch_temperature": -20,
        "pipe_length": 50,
        "placement": "outdoor",
        "wind_speed": 0,
    }
    params.update(params_override or {})
    resp = await client.post(
        f"/api/v1/projects/{project_id}/objects",
        json={
            "object_type": "pipe",
            "params": params,
        },
        headers={"X-Session-Id": session_id},
    )
    assert resp.status_code in (200, 201), resp.text
    return resp.json()


async def _create_pipe_object_with_token(
    client: AsyncClient,
    project_id: str,
    token: str,
    params_override: dict | None = None,
) -> dict:
    params = {
        "outer_diameter": 0.108,
        "wall_thickness": 0.004,
        "pipe_material": "carbon_steel",
        "insulation_layers": [{"thickness": 0.05, "material": MINERAL_WOOL}],
        "insulation_temperature_basis": "outdoor_winter",
        "ambient_temperature": -30,
        "process_temperature": 80,
        "min_switch_temperature": -20,
        "pipe_length": 50,
        "placement": "outdoor",
        "wind_speed": 0,
    }
    params.update(params_override or {})
    resp = await client.post(
        f"/api/v1/projects/{project_id}/objects",
        json={
            "object_type": "pipe",
            "params": params,
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code in (200, 201), resp.text
    return resp.json()


def _candidate_upsert_payload(resp) -> tuple[dict, str]:
    data = resp.json()
    assert "candidate" in data, data
    assert data["action"] in {"created", "updated"}
    return data["candidate"], data["action"]


async def _assign_electrical_object_with_headers(
    client: AsyncClient,
    project_id: str,
    object_id: str,
    headers: dict[str, str],
    *,
    variant_number: int = 1,
    system_type: str = "self_regulating",
) -> dict:
    variants_response = await client.get(
        f"/api/v1/projects/{project_id}/electrical-variants",
        headers=headers,
    )
    assert variants_response.status_code == 200, variants_response.text
    variants = variants_response.json()
    if not variants:
        initialized = await client.post(
            f"/api/v1/projects/{project_id}/electrical-variants/initialize",
            headers=headers,
        )
        assert initialized.status_code == 200, initialized.text
        variants = [initialized.json()["variant"]]
    while not any(item["legacy_variant_number"] == variant_number for item in variants):
        created = await client.post(
            f"/api/v1/projects/{project_id}/electrical-variants",
            headers=headers,
            json={"name": f"ЭР{len(variants) + 1} test"},
        )
        assert created.status_code == 201, created.text
        variants.append(created.json())
    variant = next(item for item in variants if item["legacy_variant_number"] == variant_number)
    assignments = await client.get(
        f"/api/v1/projects/{project_id}/electrical-variants/" f"{variant['id']}/assignments",
        headers=headers,
    )
    assert assignments.status_code == 200, assignments.text
    assignment = next(
        item for item in assignments.json()["items"] if item["object_id"] == object_id
    )
    if assignment["system_type"] is None:
        assigned = await client.patch(
            f"/api/v1/projects/{project_id}/electrical-variants/" f"{variant['id']}/assignments",
            headers=headers,
            json={
                "system_type": system_type,
                "items": [
                    {
                        "object_id": object_id,
                        "expected_version": assignment["version"],
                    }
                ],
            },
        )
        assert assigned.status_code == 200, assigned.text
    return variant


async def _assign_electrical_object(
    client: AsyncClient,
    project_id: str,
    object_id: str,
    session_id: str,
    *,
    variant_number: int = 1,
    system_type: str = "self_regulating",
) -> dict:
    return await _assign_electrical_object_with_headers(
        client,
        project_id,
        object_id,
        {"X-Session-Id": session_id},
        variant_number=variant_number,
        system_type=system_type,
    )


async def _calc_pipe_electrical(
    client: AsyncClient,
    object_id: str,
    session_id: str,
    *,
    variant_number: int = 1,
    cable_mark: str = "ТЛТ-25",
) -> dict:
    project = await _create_project(client, session_id)
    headers = {"X-Session-Id": session_id}
    variant = await _assign_electrical_object(
        client,
        project["id"],
        object_id,
        session_id,
        variant_number=variant_number,
    )
    resp = await client.post(
        "/api/v1/calc/electrical",
        json={
            "object_id": object_id,
            "cable_type": "self_regulating_tt",
            "variant_number": variant_number,
            "electrical_variant_id": variant["id"],
            "data": {
                "required_power_per_meter": 20,
                "cable_mark": cable_mark,
                "supply_voltage": 220,
                "ambient_temperature": -30,
                "pipe_length": 50,
                "safety_factor": 1.1,
            },
        },
        headers=headers,
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


class TestHeatLossCalculation:
    async def test_calculate_pipe_returns_result(self, client: AsyncClient, guest_session: str):
        project = await _create_project(client, guest_session)
        resp = await client.post(
            "/api/v1/calc/heat-loss",
            json={
                "project_id": project["id"],
                "object_type": "pipe",
                "data": {
                    "outer_diameter": 0.108,
                    "wall_thickness": 0.004,
                    "pipe_material": "carbon_steel",
                    "insulation_layers": [{"thickness": 0.05, "material": MINERAL_WOOL}],
                    "insulation_temperature_basis": "outdoor_winter",
                    "ambient_temperature": -30,
                    "process_temperature": 150,
                    "pipe_length": 100,
                    "placement": "outdoor",
                    "wind_speed": 0,
                },
            },
            headers={"X-Session-Id": guest_session},
        )
        assert resp.status_code == 200, resp.text
        result = resp.json()["result"]
        assert result["heat_loss_per_meter_base"] > 0
        assert result["total_heat_loss_design"] > 0
        assert result["thermal_resistance"] > 0

    async def test_heat_loss_accepts_canonical_local_element_count(
        self, client: AsyncClient, guest_session: str
    ):
        project = await _create_project(client, guest_session)
        resp = await client.post(
            "/api/v1/calc/heat-loss",
            json={
                "project_id": project["id"],
                "object_type": "pipe",
                "data": {
                    "outer_diameter": 0.108,
                    "wall_thickness": 0.004,
                    "pipe_material": "carbon_steel",
                    "insulation_layers": [{"thickness": 0.05, "material": MINERAL_WOOL}],
                    "insulation_temperature_basis": "outdoor_winter",
                    "ambient_temperature": -30,
                    "process_temperature": 150,
                    "pipe_length": 100,
                    "placement": "outdoor",
                    "wind_speed": 0,
                    "num_local_elements": 6,
                    "local_element_equiv_length": 1.25,
                },
            },
            headers={"X-Session-Id": guest_session},
        )
        assert resp.status_code == 200, resp.text
        result = resp.json()["result"]
        assert result["local_elements_count_applied"] == 6
        assert result["local_element_equiv_length_applied"] == pytest.approx(1.25)
        assert result["total_heat_loss_design"] > 0

    async def test_invalid_params_returns_422(self, client: AsyncClient, guest_session: str):
        project = await _create_project(client, guest_session)
        resp = await client.post(
            "/api/v1/calc/heat-loss",
            json={
                "project_id": project["id"],
                "object_type": "pipe",
                "data": {"outer_diameter": -1},
            },
            headers={"X-Session-Id": guest_session},
        )
        assert resp.status_code == 422

    async def test_non_indoor_pipe_with_indoor_tm_returns_422(
        self, client: AsyncClient, guest_session: str
    ):
        project = await _create_project(client, guest_session)
        resp = await client.post(
            "/api/v1/calc/heat-loss",
            json={
                "project_id": project["id"],
                "object_type": "pipe",
                "data": {
                    "outer_diameter": 0.108,
                    "wall_thickness": 0.004,
                    "pipe_material": "carbon_steel",
                    "insulation_layers": [{"thickness": 0.05, "material": MINERAL_WOOL}],
                    "insulation_temperature_basis": "indoor",
                    "ambient_temperature": -30,
                    "process_temperature": 150,
                    "pipe_length": 100,
                    "placement": "outdoor",
                    "wind_speed": 0,
                },
            },
            headers={"X-Session-Id": guest_session},
        )

        assert resp.status_code == 422
        assert "Режим tm" in resp.text

    async def test_outdoor_pipe_with_attic_tm_returns_422(
        self, client: AsyncClient, guest_session: str
    ):
        project = await _create_project(client, guest_session)
        resp = await client.post(
            "/api/v1/calc/heat-loss",
            json={
                "project_id": project["id"],
                "object_type": "pipe",
                "data": {
                    "outer_diameter": 0.108,
                    "wall_thickness": 0.004,
                    "pipe_material": "carbon_steel",
                    "insulation_layers": [{"thickness": 0.05, "material": MINERAL_WOOL}],
                    "insulation_temperature_basis": "attic",
                    "ambient_temperature": -30,
                    "process_temperature": 150,
                    "pipe_length": 100,
                    "placement": "outdoor",
                    "wind_speed": 0,
                },
            },
            headers={"X-Session-Id": guest_session},
        )

        assert resp.status_code == 422
        assert "Режим tm" in resp.text

    async def test_underground_pipe_with_channel_tm_returns_result(
        self, client: AsyncClient, guest_session: str
    ):
        project = await _create_project(client, guest_session)
        resp = await client.post(
            "/api/v1/calc/heat-loss",
            json={
                "project_id": project["id"],
                "object_type": "pipe",
                "data": {
                    "outer_diameter": 0.108,
                    "wall_thickness": 0.004,
                    "pipe_material": "carbon_steel",
                    "insulation_layers": [{"thickness": 0.05, "material": MINERAL_WOOL}],
                    "insulation_temperature_basis": "channel",
                    "process_temperature": 150,
                    "pipe_length": 100,
                    "placement": "underground",
                    "pipe_centerline_depth": 1.2,
                    "ground_temperature": -30,
                    "ground_conductivity": 1.5,
                },
            },
            headers={"X-Session-Id": guest_session},
        )

        assert resp.status_code == 200, resp.text
        assert resp.json()["result"]["total_heat_loss_design"] > 0

    async def test_insulation_material_temperature_range_returns_422(
        self, client: AsyncClient, guest_session: str
    ):
        project = await _create_project(client, guest_session)
        resp = await client.post(
            "/api/v1/calc/heat-loss",
            json={
                "project_id": project["id"],
                "object_type": "pipe",
                "data": {
                    "outer_diameter": 0.108,
                    "wall_thickness": 0.004,
                    "pipe_material": "carbon_steel",
                    "insulation_layers": [{"thickness": 0.05, "material": POLYURETHANE}],
                    "insulation_temperature_basis": "outdoor_winter",
                    "ambient_temperature": -20,
                    "process_temperature": 450,
                    "pipe_length": 100,
                    "placement": "outdoor",
                    "wind_speed": 0,
                },
            },
            headers={"X-Session-Id": guest_session},
        )

        assert resp.status_code == 422
        assert "вне диапазона" in resp.text


class TestElectricalCalculation:
    async def test_list_electrical_empty_project(self, client: AsyncClient, guest_session: str):
        """Пустой проект возвращает пустой список расчётов."""
        project = await _create_project(client, guest_session)
        resp = await client.get(
            "/api/v1/calc/electrical",
            params={"project_id": project["id"]},
            headers={"X-Session-Id": guest_session},
        )
        assert resp.status_code == 200, resp.text
        assert resp.json() == []

    async def test_electrical_candidate_unsupported_type_is_rejected(
        self, client: AsyncClient, guest_session: str
    ):
        project = await _create_project(client, guest_session)
        obj = await _create_pipe_object(client, project["id"], guest_session)
        await _assign_electrical_object(client, project["id"], obj["id"], guest_session)

        resp = await client.post(
            "/api/v1/calc/electrical/candidates",
            json={
                "project_id": project["id"],
                "object_id": obj["id"],
                "variant_number": 1,
                "cable_type": "mineral",
                "cable_source": "builtin",
                "mode": "auto",
            },
            headers={"X-Session-Id": guest_session},
        )

        assert resp.status_code == 409, resp.text
        assert resp.json()["detail"]["code"] == "ELECTRICAL_SYSTEM_UNSUPPORTED"


class TestElectricalCandidateDedupe:
    async def _count_candidates(
        self,
        db_session: AsyncSession,
        object_id: str,
        variant_number: int,
    ) -> int:
        return (
            await db_session.execute(
                select(func.count(ElectricalCandidate.id)).where(
                    ElectricalCandidate.object_id == UUID(object_id),
                    ElectricalCandidate.variant_number == variant_number,
                )
            )
        ).scalar_one()

    async def _post_candidate(self, client, session_id, project_id, object_id, payload: dict):
        requested_type = payload.get("cable_type")
        if requested_type in {"self_regulating", "self_regulating_tt", "single_core"}:
            await _assign_electrical_object(
                client,
                project_id,
                object_id,
                session_id,
                system_type=("resistive" if requested_type == "single_core" else "self_regulating"),
            )
        resp = await client.post(
            "/api/v1/calc/electrical/candidates",
            json={
                "project_id": project_id,
                "object_id": object_id,
                "variant_number": 1,
                **payload,
            },
            headers={"X-Session-Id": session_id},
        )
        assert resp.status_code == 200, resp.text
        return _candidate_upsert_payload(resp)

    async def _create_candidate_folder(self, client, session_id, project_id, object_id, name: str):
        resp = await client.post(
            "/api/v1/calc/electrical/candidate-folders",
            json={
                "project_id": project_id,
                "object_id": object_id,
                "variant_number": 1,
                "name": name,
            },
            headers={"X-Session-Id": session_id},
        )
        assert resp.status_code == 200, resp.text
        return resp.json()

    async def test_mineral_candidate_is_rejected_without_rows(
        self, client: AsyncClient, guest_session: str, db_session: AsyncSession
    ):
        project = await _create_project(client, guest_session)
        obj = await _create_pipe_object(client, project["id"], guest_session)
        await _assign_electrical_object(client, project["id"], obj["id"], guest_session)
        for _ in range(2):
            response = await client.post(
                "/api/v1/calc/electrical/candidates",
                json={
                    "project_id": project["id"],
                    "object_id": obj["id"],
                    "variant_number": 1,
                    "cable_type": "mineral",
                    "cable_source": "builtin",
                    "mode": "auto",
                },
                headers={"X-Session-Id": guest_session},
            )
            assert response.status_code == 409, response.text
            assert response.json()["detail"]["code"] == "ELECTRICAL_SYSTEM_UNSUPPORTED"
        assert await self._count_candidates(db_session, obj["id"], 1) == 0


class TestElectricalCalculationContinued:
    async def test_legacy_sync_batch_prepares_only_er1_and_requested_er4(
        self,
        client: AsyncClient,
        guest_session: str,
    ):
        project = await _create_project(client, guest_session)
        await _create_pipe_object(client, project["id"], guest_session)

        response = await client.post(
            "/api/v1/calc/electrical/batch",
            params={"project_id": project["id"], "variant_number": 4},
            headers={"X-Session-Id": guest_session},
        )

        assert response.status_code == 200, response.text
        variants = await client.get(
            f"/api/v1/projects/{project['id']}/electrical-variants",
            headers={"X-Session-Id": guest_session},
        )
        assert variants.status_code == 200, variants.text
        assert [item["legacy_variant_number"] for item in variants.json()] == [1, 4]

    async def test_retired_cross_er_calculation_routes_are_not_registered(
        self, client: AsyncClient, guest_session: str
    ):
        project = await _create_project(client, guest_session)
        headers = {"X-Session-Id": guest_session, "Idempotency-Key": "retired-route"}

        variant_set = await client.post(
            f"/api/v1/projects/{project['id']}/electrical-variant-set-tasks",
            json={"electrical_variant_ids": []},
            headers=headers,
        )
        numeric_copy = await client.post(
            "/api/v1/calc/electrical/variants/copy",
            json={
                "project_id": project["id"],
                "source_variant_number": 1,
                "target_variant_number": 2,
            },
            headers=headers,
        )

        assert variant_set.status_code == 404
        assert numeric_copy.status_code == 404

    async def test_unsupported_cable_type_returns_400(
        self, client: AsyncClient, guest_session: str
    ):
        """Типы без поставленных формул/каталогов → 400."""
        project = await _create_project(client, guest_session)
        obj = await _create_pipe_object(client, project["id"], guest_session)

        resp = await client.post(
            "/api/v1/calc/electrical",
            json={
                "object_id": obj["id"],
                "cable_type": "mineral",
                "data": {},
            },
            headers={"X-Session-Id": guest_session},
        )
        assert resp.status_code == 400
        assert "расчётная формула не реализована" in resp.json()["detail"]

    async def test_self_regulating_tt_calc(
        self,
        client: AsyncClient,
        guest_session: str,
        electrical_frontend_mock_mode: None,
    ):
        """self_regulating_tt: возвращает cable_mark с суффиксом -СР/-СТ."""
        project = await _create_project(client, guest_session)
        await _set_project_current_limit(client, project["id"], guest_session)
        obj = await _create_pipe_object(client, project["id"], guest_session)
        await _assign_electrical_object(client, project["id"], obj["id"], guest_session)

        resp = await client.post(
            "/api/v1/calc/electrical",
            json={
                "object_id": obj["id"],
                "cable_type": "self_regulating_tt",
                "data": {
                    "required_power_per_meter": 18.0,
                    "pipe_length": 50.0,
                    "process_temperature": 50.0,
                    "safety_factor": 1.1,
                },
            },
            headers={"X-Session-Id": guest_session},
        )
        assert resp.status_code == 200, resp.text
        result = resp.json()["result"]
        assert "cable_mark" in result
        assert result["cable_mark"].endswith(("-СР", "-СТ"))
        assert result["series"] in ("ТТН", "ТТВ", "ТТХ")
        assert result["power_per_meter"] > 0
        assert result["voltage"] == 230
        assert result["section_count"] > 0
        assert result["cable_length"] == result["section_l_fact_m"]
        assert result["mocked_fields"]
        assert result["production_eligible"] is False

    async def test_electrical_query_capabilities_include_result_fields(
        self, client: AsyncClient, guest_session: str
    ):
        project = await _create_project(client, guest_session)
        await _create_pipe_object(client, project["id"], guest_session)

        resp = await client.get(
            "/api/v1/calc/electrical/query-capabilities",
            params={"project_id": project["id"], "variant_number": 1},
            headers={"X-Session-Id": guest_session},
        )

        assert resp.status_code == 200, resp.text
        fields = {field["key"]: field for field in resp.json()["fields"]}
        assert fields["current"]["filter"]["ops"] == ["range"]
        assert fields["total_power"]["sort"]["enabled"] is True
        assert fields["power_per_meter"]["filter"]["ops"] == ["range"]
        assert fields["power_per_meter"]["unit"] == "Вт/м"
        assert fields["installed_power_per_meter"]["sort"]["enabled"] is True
        assert fields["electrical_status"]["options"]["items"]
        for key in (
            "required_installed_length_m",
            "installed_cable_length",
            "section_l_max_m",
            "section_l_tok_m",
            "section_l_ogr_m",
            "section_l_excess_m",
            "order_cable_length",
        ):
            assert fields[key]["filter"]["ops"] == ["range"]
            assert fields[key]["sort"]["enabled"] is True
            assert fields[key]["unit"] == "м"
        assert fields["provenance"]["filter"]["enabled"] is False
        assert fields["provenance"]["sort"]["enabled"] is False

    async def test_electrical_query_filters_and_sorts_nested_engineering_lengths(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        guest_session: str,
    ):
        project = await _create_project(client, guest_session)
        short = await _create_pipe_object(
            client, project["id"], guest_session, {"name": "Short engineering length"}
        )
        long = await _create_pipe_object(
            client, project["id"], guest_session, {"name": "Long engineering length"}
        )
        for obj in (short, long):
            await _assign_electrical_object(client, project["id"], obj["id"], guest_session)
        batch = await client.post(
            "/api/v1/calc/electrical/batch",
            params={"project_id": project["id"]},
            headers={"X-Session-Id": guest_session},
        )
        assert batch.status_code == 200, batch.text

        calculations = list(
            (
                await db_session.execute(
                    select(ElectricalCalculation).where(
                        ElectricalCalculation.project_id == UUID(project["id"])
                    )
                )
            )
            .scalars()
            .all()
        )
        required_by_object = {short["id"]: 12.5, long["id"]: 42.5}
        for calculation in calculations:
            results = dict(calculation.results or {})
            results["layout"] = {
                **(results.get("layout") if isinstance(results.get("layout"), dict) else {}),
                "required_installed_length_m": required_by_object[str(calculation.object_id)],
            }
            calculation.results = results
        await db_session.commit()

        response = await client.post(
            "/api/v1/calc/electrical/query",
            json={
                "project_id": project["id"],
                "filters": [
                    {
                        "key": "required_installed_length_m",
                        "op": "range",
                        "min": 20,
                    }
                ],
                "sort": {"key": "required_installed_length_m", "dir": "desc"},
            },
            headers={"X-Session-Id": guest_session},
        )

        assert response.status_code == 200, response.text
        body = response.json()
        assert body["counts"]["filtered"] == 1
        assert body["items"][0]["id"] == long["id"]

    async def test_electrical_query_does_not_create_calculation_rows(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        guest_session: str,
    ):
        project = await _create_project(client, guest_session)
        await _create_pipe_object(client, project["id"], guest_session)

        before_count = (
            await db_session.execute(
                select(func.count(ElectricalCalculation.id)).where(
                    ElectricalCalculation.project_id == UUID(project["id"])
                )
            )
        ).scalar_one()

        resp = await client.post(
            "/api/v1/calc/electrical/query",
            json={"project_id": project["id"], "page": 1, "page_size": 50},
            headers={"X-Session-Id": guest_session},
        )

        assert resp.status_code == 200, resp.text
        assert resp.json()["calculations"] == []
        after_count = (
            await db_session.execute(
                select(func.count(ElectricalCalculation.id)).where(
                    ElectricalCalculation.project_id == UUID(project["id"])
                )
            )
        ).scalar_one()
        assert before_count == 0
        assert after_count == before_count

    async def test_electrical_query_projects_exact_uuid_assignments_for_current_page(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        guest_session: str,
    ):
        project = await _create_project(client, guest_session)
        objects = [
            await _create_pipe_object(
                client,
                project["id"],
                guest_session,
                {"name": name},
            )
            for name in ("Assignment A", "Assignment B", "Assignment C")
        ]
        initialized = await client.post(
            f"/api/v1/projects/{project['id']}/electrical-variants/initialize",
            headers={"X-Session-Id": guest_session},
        )
        assert initialized.status_code == 200, initialized.text
        first_variant = initialized.json()["variant"]
        second_variant_response = await client.post(
            f"/api/v1/projects/{project['id']}/electrical-variants",
            json={"name": "Assignment isolation"},
            headers={"X-Session-Id": guest_session},
        )
        assert second_variant_response.status_code == 201, second_variant_response.text
        second_variant = second_variant_response.json()

        assignments = list(
            (
                await db_session.execute(
                    select(ElectricalVariantObject).where(
                        ElectricalVariantObject.project_id == UUID(project["id"]),
                        ElectricalVariantObject.electrical_variant_id.in_(
                            [UUID(first_variant["id"]), UUID(second_variant["id"])]
                        ),
                    )
                )
            )
            .scalars()
            .all()
        )
        by_scope = {
            (str(assignment.electrical_variant_id), str(assignment.object_id)): assignment
            for assignment in assignments
        }
        first_updates = (
            ("self_regulating", "ready", 4),
            (None, "unassigned", 5),
            ("resistive", "stale", 6),
        )
        for obj, (system_type, assignment_state, version) in zip(
            objects,
            first_updates,
            strict=True,
        ):
            assignment = by_scope[(first_variant["id"], obj["id"])]
            assignment.system_type = system_type
            assignment.assignment_state = assignment_state
            assignment.version = version
        for obj in objects:
            assignment = by_scope[(second_variant["id"], obj["id"])]
            assignment.system_type = "self_regulating"
            assignment.assignment_state = "error"
            assignment.version = 9
        db_session.add_all(
            [
                ElectricalCalculation(
                    project_id=UUID(project["id"]),
                    object_id=UUID(objects[0]["id"]),
                    variant_number=first_variant["legacy_variant_number"],
                    electrical_variant_id=UUID(first_variant["id"]),
                    cable_type="self_regulating_tt",
                    cable_mark="UUID-FIRST",
                    params={},
                    results={
                        "selected_cable": "UUID-FIRST",
                        "installed_cable_length": 10,
                        "provenance": {"formula_version": "uuid-first"},
                    },
                ),
                ElectricalCalculation(
                    project_id=UUID(project["id"]),
                    object_id=UUID(objects[0]["id"]),
                    variant_number=second_variant["legacy_variant_number"],
                    electrical_variant_id=UUID(second_variant["id"]),
                    cable_type="self_regulating_tt",
                    cable_mark="UUID-SECOND",
                    params={},
                    results={
                        "selected_cable": "UUID-SECOND",
                        "installed_cable_length": 20,
                        "provenance": {"formula_version": "uuid-second"},
                    },
                ),
            ]
        )
        await db_session.commit()

        first_page = await client.post(
            "/api/v1/calc/electrical/query",
            json={
                "project_id": project["id"],
                "electrical_variant_id": first_variant["id"],
                "page": 1,
                "page_size": 2,
            },
            headers={"X-Session-Id": guest_session},
        )
        assert first_page.status_code == 200, first_page.text
        first_body = first_page.json()
        assert [item["object_id"] for item in first_body["assignments"]] == [
            item["id"] for item in first_body["items"]
        ]

        second_page = await client.post(
            "/api/v1/calc/electrical/query",
            json={
                "project_id": project["id"],
                "electrical_variant_id": first_variant["id"],
                "page": 2,
                "page_size": 2,
            },
            headers={"X-Session-Id": guest_session},
        )
        assert second_page.status_code == 200, second_page.text
        second_body = second_page.json()
        assert [item["object_id"] for item in second_body["assignments"]] == [
            item["id"] for item in second_body["items"]
        ]
        expected_first_scope = {
            objects[0]["id"]: {
                "object_id": objects[0]["id"],
                "system_type": "self_regulating",
                "assignment_state": "ready",
                "electrical_overrides": {},
                "version": 4,
            },
            objects[1]["id"]: {
                "object_id": objects[1]["id"],
                "system_type": None,
                "assignment_state": "unassigned",
                "electrical_overrides": {},
                "version": 5,
            },
            objects[2]["id"]: {
                "object_id": objects[2]["id"],
                "system_type": "resistive",
                "assignment_state": "stale",
                "electrical_overrides": {},
                "version": 6,
            },
        }
        all_first_assignments = first_body["assignments"] + second_body["assignments"]
        assert {
            item["object_id"]: {**item, "system_type": item["system_type"]}
            for item in all_first_assignments
        } == expected_first_scope

        isolated = await client.post(
            "/api/v1/calc/electrical/query",
            json={
                "project_id": project["id"],
                "electrical_variant_id": second_variant["id"],
                "page": 1,
                "page_size": 3,
            },
            headers={"X-Session-Id": guest_session},
        )
        assert isolated.status_code == 200, isolated.text
        isolated_body = isolated.json()
        assert {item["version"] for item in isolated_body["assignments"]} == {9}
        assert {item["assignment_state"] for item in isolated_body["assignments"]} == {"error"}
        assert isolated_body["query"] == {
            "electrical_variant_id": second_variant["id"],
            "sort": None,
        }
        assert [item["cable_mark"] for item in isolated_body["calculations"]] == ["UUID-SECOND"]

        sql_keyset = await client.post(
            "/api/v1/calc/electrical/query",
            json={
                "project_id": project["id"],
                "electrical_variant_id": second_variant["id"],
                "filters": [{"key": "cable_mark", "op": "in", "values": ["UUID-SECOND"]}],
            },
            headers={"X-Session-Id": guest_session},
        )
        assert sql_keyset.status_code == 200, sql_keyset.text
        assert [item["cable_mark"] for item in sql_keyset.json()["calculations"]] == ["UUID-SECOND"]

        sql_offset = await client.post(
            "/api/v1/calc/electrical/query",
            json={
                "project_id": project["id"],
                "electrical_variant_id": second_variant["id"],
                "sort": {"key": "object_name", "dir": "asc"},
                "page": 2,
                "page_size": 1,
            },
            headers={"X-Session-Id": guest_session},
        )
        assert sql_offset.status_code == 200, sql_offset.text
        assert sql_offset.json()["query"]["electrical_variant_id"] == second_variant["id"]
        assert sql_offset.json()["summary"]["total_cable_length"] == 0

        capabilities = await client.get(
            "/api/v1/calc/electrical/query-capabilities",
            params={
                "project_id": project["id"],
                "electrical_variant_id": second_variant["id"],
            },
            headers={"X-Session-Id": guest_session},
        )
        assert capabilities.status_code == 200, capabilities.text
        cable_mark_field = next(
            field for field in capabilities.json()["fields"] if field["key"] == "cable_mark"
        )
        assert [item["value"] for item in cable_mark_field["options"]["items"]] == ["UUID-SECOND"]

        python_fallback = await client.post(
            "/api/v1/calc/electrical/query",
            json={
                "project_id": project["id"],
                "electrical_variant_id": second_variant["id"],
                "search": {"text": "uuid-second", "columns": ["provenance"]},
            },
            headers={"X-Session-Id": guest_session},
        )
        assert python_fallback.status_code == 200, python_fallback.text
        assert python_fallback.json()["counts"]["filtered"] == 1
        assert [item["cable_mark"] for item in python_fallback.json()["calculations"]] == [
            "UUID-SECOND"
        ]

    async def test_heat_loss_batch_does_not_create_electrical_calculation_rows(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        guest_session: str,
    ):
        project = await _create_project(client, guest_session)
        await _create_pipe_object(client, project["id"], guest_session)

        resp = await client.post(
            "/api/v1/calc/heat-loss/batch",
            params={"project_id": project["id"]},
            headers={"X-Session-Id": guest_session},
        )

        assert resp.status_code == 200, resp.text
        count = (
            await db_session.execute(
                select(func.count(ElectricalCalculation.id)).where(
                    ElectricalCalculation.project_id == UUID(project["id"])
                )
            )
        ).scalar_one()
        assert count == 0

    async def test_electrical_query_default_page_supports_keyset_cursor(
        self, client: AsyncClient, guest_session: str
    ):
        project = await _create_project(client, guest_session)
        await _create_pipe_object(client, project["id"], guest_session, {"name": "First"})
        await _create_pipe_object(client, project["id"], guest_session, {"name": "Second"})

        first_page = await client.post(
            "/api/v1/calc/electrical/query",
            json={"project_id": project["id"], "page": 1, "page_size": 1},
            headers={"X-Session-Id": guest_session},
        )
        assert first_page.status_code == 200, first_page.text
        first_body = first_page.json()
        cursor = first_body["page_info"]["next_cursor"]

        second_page = await client.post(
            "/api/v1/calc/electrical/query",
            json={
                "project_id": project["id"],
                "page": 2,
                "page_size": 1,
                "after_sort_order": cursor["sort_order"],
                "after_id": cursor["id"],
            },
            headers={"X-Session-Id": guest_session},
        )

        assert second_page.status_code == 200, second_page.text
        second_body = second_page.json()
        assert second_body["page_info"]["offset"] == 1
        assert second_body["page_info"]["has_previous_page"] is True
        assert second_body["items"][0]["id"] != first_body["items"][0]["id"]

    async def test_electrical_query_sorted_page_supports_keyset_cursor(
        self, client: AsyncClient, guest_session: str
    ):
        project = await _create_project(client, guest_session)
        await _create_pipe_object(client, project["id"], guest_session, {"name": "Beta"})
        await _create_pipe_object(client, project["id"], guest_session, {"name": "Alpha"})

        first_page = await client.post(
            "/api/v1/calc/electrical/query",
            json={
                "project_id": project["id"],
                "page": 1,
                "page_size": 1,
                "sort": {"key": "object_name", "dir": "asc"},
            },
            headers={"X-Session-Id": guest_session},
        )
        assert first_page.status_code == 200, first_page.text
        first_body = first_page.json()
        cursor = first_body["page_info"]["next_cursor"]
        assert first_body["items"][0]["params"]["name"] == "Alpha"
        assert cursor["key"] == "object_name"
        assert cursor["value"] == "alpha"

        second_page = await client.post(
            "/api/v1/calc/electrical/query",
            json={
                "project_id": project["id"],
                "page": 2,
                "page_size": 1,
                "sort": {"key": "object_name", "dir": "asc"},
                "after_sort_order": cursor["sort_order"],
                "after_id": cursor["id"],
                "after_key": cursor["key"],
                "after_value": cursor["value"],
                "after_value_is_null": cursor["value_is_null"],
            },
            headers={"X-Session-Id": guest_session},
        )

        assert second_page.status_code == 200, second_page.text
        second_body = second_page.json()
        assert second_body["items"][0]["params"]["name"] == "Beta"
        assert second_body["page_info"]["has_previous_page"] is True

    async def test_electrical_query_filters_not_calculated_status(
        self, client: AsyncClient, guest_session: str
    ):
        project = await _create_project(client, guest_session)
        await _create_pipe_object(client, project["id"], guest_session)

        resp = await client.post(
            "/api/v1/calc/electrical/query",
            json={
                "project_id": project["id"],
                "variant_number": 1,
                "filters": [
                    {
                        "key": "electrical_status",
                        "op": "in",
                        "values": ["not_calculated"],
                    }
                ],
            },
            headers={"X-Session-Id": guest_session},
        )

        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["counts"]["filtered"] == 1
        assert body["items"][0]["id"]

    async def test_batch_can_skip_error_payload(self, client: AsyncClient, guest_session: str):
        project = await _create_project(client, guest_session)
        obj = await _create_pipe_object(
            client,
            project["id"],
            guest_session,
            {"process_temperature": 170},
        )
        await _assign_electrical_object(client, project["id"], obj["id"], guest_session)

        resp = await client.post(
            "/api/v1/calc/electrical/batch",
            params={
                "project_id": project["id"],
                "include_errors": False,
            },
            headers={"X-Session-Id": guest_session},
        )

        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["calculated"] == 0
        assert body["skipped"] == 1
        assert body["errors"] == []

        listing = (
            await client.get(
                "/api/v1/calc/electrical",
                params={"project_id": project["id"]},
                headers={"X-Session-Id": guest_session},
            )
        ).json()
        assert len(listing) == 1
        assert listing[0]["results"]["error_code"]
        assert listing[0]["results"]["category"] == "validation"
        assert listing[0]["results"]["message"]
        assert "error" not in listing[0]["results"]


class TestNoDoubleSafetyFactor:
    """Regression: safety_factor применяется ровно один раз в пайплайне.

    Проверка end-to-end: теплорасчёт → автоподбор кабеля. Если К (1.1)
    накручивается дважды, выбирается кабель на ступеньку мощнее, чем нужно.
    """

    async def _create_pipe(
        self,
        client: AsyncClient,
        project_id: str,
        session_id: str,
        insulation_layer_thickness: float,
        process_temperature: float,
        ambient_temperature: float = -30,
    ) -> dict:
        resp = await client.post(
            f"/api/v1/projects/{project_id}/objects",
            json={
                "object_type": "pipe",
                "params": {
                    "outer_diameter": 0.108,
                    "wall_thickness": 0.004,
                    "pipe_material": "carbon_steel",
                    "insulation_layers": [
                        {"thickness": insulation_layer_thickness, "material": MINERAL_WOOL}
                    ],
                    "insulation_temperature_basis": "outdoor_winter",
                    "ambient_temperature": ambient_temperature,
                    "process_temperature": process_temperature,
                    "min_switch_temperature": ambient_temperature,
                    "pipe_length": 50,
                    "placement": "outdoor",
                    "wind_speed": 0,
                },
            },
            headers={"X-Session-Id": session_id},
        )
        assert resp.status_code in (200, 201), resp.text
        return resp.json()

    async def test_total_heat_loss_design_equals_q_linear_times_L_times_K(
        self, client: AsyncClient, guest_session: str
    ):
        """Контракт API: total_heat_loss_design = heat_loss_per_meter_base × L × K.

        Эта формула — отправная точка, от которой зависит, где «живёт» К.
        Если контракт сломается (например K будет зашит в q_linear),
        ломается весь электрорасчёт.
        """
        project = await _create_project(client, guest_session)
        obj = await self._create_pipe(
            client,
            project["id"],
            guest_session,
            insulation_layer_thickness=0.05,
            process_temperature=80,
        )
        results = obj["results"]
        q = results["heat_loss_per_meter_base"]
        total = results["total_heat_loss_design"]
        l_eff = results["effective_length"]  # 50 без локальных элементов

        # К по умолчанию = 1.1 (safety_factor)
        expected_total = q * l_eff * 1.1
        assert total == pytest.approx(expected_total, rel=1e-3), (
            f"total_heat_loss_design={total} != q × L × K = {q} × {l_eff} × 1.1 = {expected_total}. "
            f"Либо K зашит в q_linear (double-K риск), либо L_eff изменилось."
        )


class TestVariantIsolation:
    """Regression: фейлы электрорасчёта варианта N не должны затирать
    успешные расчёты варианта M (M != N). И список расчётов должен
    корректно фильтроваться по variant_number.

    Реальный баг из прод: при прогоне СО2 для 100 объектов 7 падают с
    ошибкой подбора кабеля. Из-за пропущенного variant_number в вызове
    _save_failed_electrical фейл писался в variant=1 — затирая успешный
    расчёт СО1 по тем же 7 объектам.
    """

    async def test_list_filters_by_variant_number(self, client: AsyncClient, guest_session: str):
        """GET /calc/electrical?variant_number=N возвращает только расчёты этого варианта."""
        project = await _create_project(client, guest_session)
        obj = await _create_pipe_object(client, project["id"], guest_session)
        for variant_number in (1, 2):
            await _assign_electrical_object(
                client,
                project["id"],
                obj["id"],
                guest_session,
                variant_number=variant_number,
            )

        # СО1 — автоподбор
        r1 = await client.post(
            "/api/v1/calc/electrical/batch",
            params={"project_id": project["id"], "variant_number": 1},
            headers={"X-Session-Id": guest_session},
        )
        assert r1.status_code == 200
        # СО2 — автоподбор на тот же объект
        r2 = await client.post(
            "/api/v1/calc/electrical/batch",
            params={"project_id": project["id"], "variant_number": 2},
            headers={"X-Session-Id": guest_session},
        )
        assert r2.status_code == 200

        # Без фильтра — обе записи
        all_calcs = (
            await client.get(
                "/api/v1/calc/electrical",
                params={"project_id": project["id"]},
                headers={"X-Session-Id": guest_session},
            )
        ).json()
        assert len(all_calcs) == 2

        # Каждый фильтр возвращает собственную запись; номер варианта больше
        # не дублируется в UUID-only response DTO.
        only_v1 = (
            await client.get(
                "/api/v1/calc/electrical",
                params={"project_id": project["id"], "variant_number": 1},
                headers={"X-Session-Id": guest_session},
            )
        ).json()
        only_v2 = (
            await client.get(
                "/api/v1/calc/electrical",
                params={"project_id": project["id"], "variant_number": 2},
                headers={"X-Session-Id": guest_session},
            )
        ).json()
        assert len(only_v1) == 1
        assert len(only_v2) == 1
        assert only_v1[0]["id"] != only_v2[0]["id"]
        assert {only_v1[0]["id"], only_v2[0]["id"]} == {
            calculation["id"] for calculation in all_calcs
        }
