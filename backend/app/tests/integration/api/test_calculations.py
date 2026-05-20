"""Integration-тесты расчётов."""

from uuid import UUID

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.electrical_calculation import ElectricalCalculation
from app.models.electrical_candidate import ElectricalCandidate
from app.models.project_object import ProjectObject

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


async def _create_pipe_object(
    client: AsyncClient,
    project_id: str,
    session_id: str,
    params_override: dict | None = None,
) -> dict:
    params = {
        "outer_diameter": 0.108,
        "insulation_thickness": 0.05,
        "insulation_material": MINERAL_WOOL,
        "insulation_temperature_basis": "outdoor_winter",
        "ambient_temperature": -30,
        "process_temperature": 80,
        "pipe_length": 50,
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


async def _calc_pipe_electrical(
    client: AsyncClient,
    object_id: str,
    session_id: str,
    *,
    variant_number: int = 1,
    cable_mark: str = "ТЛТ-25",
) -> dict:
    resp = await client.post(
        "/api/v1/calc/electrical",
        json={
            "object_id": object_id,
            "cable_type": "self_regulating",
            "variant_number": variant_number,
            "data": {
                "required_power_per_meter": 20,
                "cable_mark": cable_mark,
                "supply_voltage": 220,
                "ambient_temperature": -30,
                "pipe_length": 50,
                "safety_factor": 1.1,
            },
        },
        headers={"X-Session-Id": session_id},
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
                    "insulation_thickness": 0.05,
                    "insulation_material": MINERAL_WOOL,
                    "insulation_temperature_basis": "outdoor_winter",
                    "ambient_temperature": -30,
                    "process_temperature": 150,
                    "pipe_length": 100,
                },
            },
            headers={"X-Session-Id": guest_session},
        )
        assert resp.status_code == 200, resp.text
        result = resp.json()["result"]
        assert result["heat_loss_per_meter"] > 0
        assert result["total_heat_loss"] > 0
        assert result["thermal_resistance"] > 0

    async def test_heat_loss_accepts_named_local_element_counts(
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
                    "insulation_thickness": 0.05,
                    "insulation_material": MINERAL_WOOL,
                    "insulation_temperature_basis": "outdoor_winter",
                    "ambient_temperature": -30,
                    "process_temperature": 150,
                    "pipe_length": 100,
                    "valve_count": 1,
                    "flange_count": 2,
                    "support_count": 3,
                    "local_element_equiv_length": 1.25,
                },
            },
            headers={"X-Session-Id": guest_session},
        )
        assert resp.status_code == 200, resp.text
        result = resp.json()["result"]
        assert result["local_elements_count"] == 6
        assert result["local_element_equiv_length"] == pytest.approx(1.25)
        assert result["total_heat_loss"] > 0

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
                    "insulation_thickness": 0.05,
                    "insulation_material": POLYURETHANE,
                    "insulation_temperature_basis": "outdoor_winter",
                    "ambient_temperature": -20,
                    "process_temperature": 450,
                    "pipe_length": 100,
                },
            },
            headers={"X-Session-Id": guest_session},
        )

        assert resp.status_code == 422
        assert "вне диапазона" in resp.text


class TestElectricalCalculation:
    async def test_electrical_calc_returns_all_fields(
        self, client: AsyncClient, guest_session: str
    ):
        project = await _create_project(client, guest_session)
        obj = await _create_pipe_object(client, project["id"], guest_session)

        resp = await client.post(
            "/api/v1/calc/electrical",
            json={
                "object_id": obj["id"],
                "cable_type": "self_regulating",
                "data": {
                    "required_power_per_meter": 20,
                    "cable_mark": "ТЛТ-25",
                    "supply_voltage": 220,
                    "ambient_temperature": -30,
                    "pipe_length": 50,
                    "safety_factor": 1.1,
                },
            },
            headers={"X-Session-Id": guest_session},
        )
        assert resp.status_code == 200, resp.text
        result = resp.json()["result"]
        assert result["selected_cable"] == "ТЛТ-25"
        assert "installed_cable_length" in result
        assert "order_cable_length" in result
        assert "total_power" in result
        assert "current" in result
        assert "voltage" in result

        list_resp = await client.get(
            "/api/v1/calc/electrical",
            params={"project_id": project["id"]},
            headers={"X-Session-Id": guest_session},
        )
        assert list_resp.status_code == 200, list_resp.text
        assert list_resp.json()[0]["params"]["process_temperature"] == 80

    async def test_tlt_uses_catalog_voltage_for_current(
        self, client: AsyncClient, guest_session: str
    ):
        """Для ТЛТ паспортное напряжение кабеля важнее общего supply_voltage CO."""
        project = await _create_project(client, guest_session)
        obj = await _create_pipe_object(client, project["id"], guest_session)

        resp = await client.post(
            "/api/v1/calc/electrical",
            json={
                "object_id": obj["id"],
                "cable_type": "self_regulating",
                "data": {
                    "required_power_per_meter": 20,
                    "cable_mark": "ТЛТ-25",
                    "supply_voltage": 380,
                    "ambient_temperature": -30,
                    "pipe_length": 50,
                    "safety_factor": 1.1,
                },
            },
            headers={"X-Session-Id": guest_session},
        )

        assert resp.status_code == 200, resp.text
        result = resp.json()["result"]
        assert result["voltage"] == 220
        assert result["current"] == pytest.approx(result["total_power"] / 220, rel=1e-4)

        list_resp = await client.get(
            "/api/v1/calc/electrical",
            params={"project_id": project["id"]},
            headers={"X-Session-Id": guest_session},
        )
        assert list_resp.status_code == 200, list_resp.text
        calc = list_resp.json()[0]
        assert calc["params"]["supply_voltage"] == 220
        assert calc["results"]["voltage"] == 220

    async def test_order_cable_length_includes_10_percent_factor(
        self, client: AsyncClient, guest_session: str
    ):
        """BR-CABLE-02: заказная длина = расчётная длина × 1.1."""
        project = await _create_project(client, guest_session)
        obj = await _create_pipe_object(client, project["id"], guest_session)

        pipe_length = 50
        resp = await client.post(
            "/api/v1/calc/electrical",
            json={
                "object_id": obj["id"],
                "cable_type": "self_regulating",
                "data": {
                    "required_power_per_meter": 20,
                    "cable_mark": "ТЛТ-25",
                    "supply_voltage": 220,
                    "ambient_temperature": -30,
                    "pipe_length": pipe_length,
                    "safety_factor": 1.1,
                },
            },
            headers={"X-Session-Id": guest_session},
        )
        assert resp.status_code == 200, resp.text
        result = resp.json()["result"]
        assert result["installed_cable_length"] == pytest.approx(pipe_length, rel=1e-3)
        assert result["order_cable_length"] == pytest.approx(
            pipe_length * CABLE_LENGTH_FACTOR,
            rel=1e-3,
        )

    async def test_list_electrical_calcs_for_project(self, client: AsyncClient, guest_session: str):
        """GET /calc/electrical возвращает список расчётов с результатами."""
        project = await _create_project(client, guest_session)
        obj = await _create_pipe_object(client, project["id"], guest_session)

        # Создаём расчёт
        await client.post(
            "/api/v1/calc/electrical",
            json={
                "object_id": obj["id"],
                "cable_type": "self_regulating",
                "data": {
                    "required_power_per_meter": 20,
                    "cable_mark": "ТЛТ-25",
                    "supply_voltage": 220,
                    "ambient_temperature": -30,
                    "pipe_length": 50,
                    "safety_factor": 1.1,
                },
            },
            headers={"X-Session-Id": guest_session},
        )

        # Получаем список
        resp = await client.get(
            "/api/v1/calc/electrical",
            params={"project_id": project["id"]},
            headers={"X-Session-Id": guest_session},
        )
        assert resp.status_code == 200, resp.text
        calcs = resp.json()
        assert len(calcs) == 1
        calc = calcs[0]
        assert calc["object_id"] == obj["id"]
        assert calc["cable_mark"] == "ТЛТ-25"
        assert calc["results"] is not None
        assert "selected_cable" in calc["results"]
        assert "installed_cable_length" in calc["results"]

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

    async def test_electrical_candidate_auto_does_not_apply_until_explicit_choice(
        self, client: AsyncClient, guest_session: str, db_session: AsyncSession
    ):
        project = await _create_project(client, guest_session)
        obj = await _create_pipe_object(client, project["id"], guest_session)

        resp = await client.post(
            "/api/v1/calc/electrical/candidates",
            json={
                "project_id": project["id"],
                "object_id": obj["id"],
                "variant_number": 2,
                "cable_type": "self_regulating",
                "cable_source": "builtin",
                "mode": "auto",
                "electrical_params": {"selection_policy": "technical_minimum"},
            },
            headers={"X-Session-Id": guest_session},
        )
        assert resp.status_code == 200, resp.text
        candidate = resp.json()
        assert candidate["status"] == "applicable"
        assert candidate["mode"] == "auto"
        assert candidate["cable_mark"]
        assert candidate["is_applied"] is False

        calc_count = (
            await db_session.execute(
                select(func.count(ElectricalCalculation.id)).where(
                    ElectricalCalculation.object_id == UUID(obj["id"]),
                    ElectricalCalculation.variant_number == 2,
                )
            )
        ).scalar_one()
        assert calc_count == 0

        apply_resp = await client.post(
            f"/api/v1/calc/electrical/candidates/{candidate['id']}/apply",
            headers={"X-Session-Id": guest_session},
        )
        assert apply_resp.status_code == 200, apply_resp.text
        payload = apply_resp.json()
        assert payload["candidate"]["is_applied"] is True
        assert payload["calculation"]["cable_mark"] == candidate["cable_mark"]

        applied_count = (
            await db_session.execute(
                select(func.count(ElectricalCandidate.id)).where(
                    ElectricalCandidate.object_id == UUID(obj["id"]),
                    ElectricalCandidate.variant_number == 2,
                    ElectricalCandidate.is_applied.is_(True),
                )
            )
        ).scalar_one()
        assert applied_count == 1

    async def test_electrical_candidate_unsupported_type_is_diagnostic_not_fake_recommendation(
        self, client: AsyncClient, guest_session: str
    ):
        project = await _create_project(client, guest_session)
        obj = await _create_pipe_object(client, project["id"], guest_session)

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

        assert resp.status_code == 200, resp.text
        candidate = resp.json()
        assert candidate["status"] == "not_applicable"
        assert candidate["reason_code"] == "no_candidate_generator"
        assert candidate["cable_mark"] is None
        assert candidate["is_recommended"] is False

    async def test_electrical_candidate_manual_uses_engineer_mark_before_apply(
        self, client: AsyncClient, guest_session: str, db_session: AsyncSession
    ):
        project = await _create_project(client, guest_session)
        obj = await _create_pipe_object(client, project["id"], guest_session)

        resp = await client.post(
            "/api/v1/calc/electrical/candidates",
            json={
                "project_id": project["id"],
                "object_id": obj["id"],
                "variant_number": 3,
                "cable_type": "self_regulating",
                "cable_source": "builtin",
                "mode": "manual",
                "cable_mark": "ТЛТ-75",
            },
            headers={"X-Session-Id": guest_session},
        )

        assert resp.status_code == 200, resp.text
        candidate = resp.json()
        assert candidate["status"] == "applicable"
        assert candidate["mode"] == "manual"
        assert candidate["cable_mark"] == "ТЛТ-75"
        assert candidate["is_applied"] is False

        calc_count = (
            await db_session.execute(
                select(func.count(ElectricalCalculation.id)).where(
                    ElectricalCalculation.object_id == UUID(obj["id"]),
                    ElectricalCalculation.variant_number == 3,
                )
            )
        ).scalar_one()
        assert calc_count == 0

        apply_resp = await client.post(
            f"/api/v1/calc/electrical/candidates/{candidate['id']}/apply",
            headers={"X-Session-Id": guest_session},
        )
        assert apply_resp.status_code == 200, apply_resp.text
        payload = apply_resp.json()
        assert payload["candidate"]["is_applied"] is True
        assert payload["calculation"]["cable_mark"] == "ТЛТ-75"

    async def test_list_electrical_legacy_endpoint_is_paginated(
        self, client: AsyncClient, guest_session: str
    ):
        """Legacy GET /calc/electrical не должен отдавать неограниченный список."""
        project = await _create_project(client, guest_session)
        obj = await _create_pipe_object(client, project["id"], guest_session)

        for variant_number in range(1, 5):
            resp = await client.post(
                "/api/v1/calc/electrical",
                json={
                    "object_id": obj["id"],
                    "cable_type": "self_regulating",
                    "variant_number": variant_number,
                    "data": {
                        "required_power_per_meter": 20,
                        "cable_mark": "ТЛТ-25",
                        "supply_voltage": 220,
                        "ambient_temperature": -30,
                        "pipe_length": 50,
                        "safety_factor": 1.1,
                    },
                },
                headers={"X-Session-Id": guest_session},
            )
            assert resp.status_code == 200, resp.text

        resp = await client.get(
            "/api/v1/calc/electrical",
            params={"project_id": project["id"], "page": 2, "page_size": 2},
            headers={"X-Session-Id": guest_session},
        )
        assert resp.status_code == 200, resp.text
        calcs = resp.json()
        assert len(calcs) == 2
        assert [calc["variant_number"] for calc in calcs] == [3, 4]

    async def test_copy_electrical_variant_validates_exact_copied_choice_without_autopick(
        self, client: AsyncClient, guest_session: str
    ):
        project = await _create_project(client, guest_session)
        source_obj = await _create_pipe_object(client, project["id"], guest_session)
        await _create_pipe_object(client, project["id"], guest_session, {"name": "No source calc"})
        await _calc_pipe_electrical(
            client,
            source_obj["id"],
            guest_session,
            variant_number=1,
            cable_mark="ТЛТ-100",
        )

        resp = await client.post(
            "/api/v1/calc/electrical/variants/copy",
            json={
                "project_id": project["id"],
                "source_variant_number": 1,
                "target_variant_number": 2,
            },
            headers={"X-Session-Id": guest_session},
        )

        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["copied_count"] == 1
        assert body["project_objects_count"] == 2
        assert body["not_copied_uncalculated_count"] == 1
        assert body["deleted_target_count"] == 0
        assert body["overwrite_applied"] is False
        assert body["specification_regenerated"] is True
        assert body["validated_count"] == 1
        assert body["validation_failed_count"] == 0
        assert body["preserved_without_validation_count"] == 0

        target = await client.get(
            "/api/v1/calc/electrical",
            params={"project_id": project["id"], "variant_number": 2},
            headers={"X-Session-Id": guest_session},
        )
        assert target.status_code == 200, target.text
        target_calcs = target.json()
        assert len(target_calcs) == 1
        assert target_calcs[0]["object_id"] == source_obj["id"]
        assert target_calcs[0]["variant_number"] == 2
        assert target_calcs[0]["cable_mark"] == "ТЛТ-100"
        target_results = target_calcs[0]["results"]
        assert target_results["selected_cable"] == "ТЛТ-100"
        assert target_results["copy_validation"] == {
            "status": "validated",
            "mode": "exact_cable_check",
            "source_variant_number": 1,
            "target_variant_number": 2,
            "source_cable_mark": "ТЛТ-100",
            "autoselection_used": False,
        }
        assert "category" not in target_results
        assert "error_code" not in target_results
        assert target_results["total_power"] > 0
        assert target_results["current"] > 0
        assert target_results["order_cable_length"] > 0

        source = await client.get(
            "/api/v1/calc/electrical",
            params={"project_id": project["id"], "variant_number": 1},
            headers={"X-Session-Id": guest_session},
        )
        assert source.status_code == 200, source.text
        assert len(source.json()) == 1
        assert source.json()[0]["cable_mark"] == "ТЛТ-100"

        spec = await client.get(
            f"/api/v1/specifications/{project['id']}",
            params={"variant": 2},
            headers={"X-Session-Id": guest_session},
        )
        assert spec.status_code == 200, spec.text
        cable_items = [item for item in spec.json()["items"] if item["category"] == "Кабель"]
        assert len(cable_items) == 1
        assert cable_items[0]["params"]["cable_mark"] == "ТЛТ-100"

    async def test_copy_electrical_variant_keeps_non_optimal_valid_manual_choice(
        self, client: AsyncClient, guest_session: str
    ):
        project = await _create_project(client, guest_session)
        source_obj = await _create_pipe_object(
            client,
            project["id"],
            guest_session,
            {
                "outer_diameter": 0.014,
                "insulation_thickness": 0.08,
                "process_temperature": 60,
                "pipe_length": 20,
            },
        )
        await _calc_pipe_electrical(
            client,
            source_obj["id"],
            guest_session,
            variant_number=1,
            cable_mark="ТЛТ-100",
        )

        resp = await client.post(
            "/api/v1/calc/electrical/variants/copy",
            json={
                "project_id": project["id"],
                "source_variant_number": 1,
                "target_variant_number": 2,
            },
            headers={"X-Session-Id": guest_session},
        )
        assert resp.status_code == 200, resp.text

        target = await client.get(
            "/api/v1/calc/electrical",
            params={"project_id": project["id"], "variant_number": 2},
            headers={"X-Session-Id": guest_session},
        )
        assert target.status_code == 200, target.text
        target_calc = target.json()[0]
        assert target_calc["cable_mark"] == "ТЛТ-100"
        assert target_calc["results"]["selected_cable"] == "ТЛТ-100"
        assert target_calc["results"]["applied_selection_policy"] == "manual_selection"
        assert target_calc["results"]["copy_validation"]["autoselection_used"] is False

    async def test_copy_electrical_variant_preserves_source_selection_criterion(
        self, client: AsyncClient, guest_session: str
    ):
        project = await _create_project(client, guest_session)
        source_obj = await _create_pipe_object(client, project["id"], guest_session)

        batch = await client.post(
            "/api/v1/calc/electrical/batch",
            params={"project_id": project["id"], "variant_number": 1},
            headers={"X-Session-Id": guest_session},
        )
        assert batch.status_code == 200, batch.text

        source = await client.get(
            "/api/v1/calc/electrical",
            params={"project_id": project["id"], "variant_number": 1},
            headers={"X-Session-Id": guest_session},
        )
        assert source.status_code == 200, source.text
        source_calc = source.json()[0]
        assert source_calc["object_id"] == source_obj["id"]
        assert source_calc["cable_mark_source"] == "auto"
        assert source_calc["results"]["applied_selection_policy"] == "technical_minimum"
        assert source_calc["results"]["selection_reason"]

        copy_resp = await client.post(
            "/api/v1/calc/electrical/variants/copy",
            json={
                "project_id": project["id"],
                "source_variant_number": 1,
                "target_variant_number": 2,
            },
            headers={"X-Session-Id": guest_session},
        )
        assert copy_resp.status_code == 200, copy_resp.text

        target = await client.get(
            "/api/v1/calc/electrical",
            params={"project_id": project["id"], "variant_number": 2},
            headers={"X-Session-Id": guest_session},
        )
        assert target.status_code == 200, target.text
        target_calc = target.json()[0]
        assert target_calc["cable_mark"] == source_calc["cable_mark"]
        assert target_calc["cable_mark_source"] == "auto"
        assert target_calc["results"]["selected_cable"] == source_calc["results"]["selected_cable"]
        assert target_calc["results"]["applied_selection_policy"] == "technical_minimum"
        assert target_calc["results"]["selection_reason"] == source_calc["results"]["selection_reason"]
        assert target_calc["results"]["copy_validation"]["autoselection_used"] is False

    async def test_copy_electrical_variant_conflict_and_overwrite_replaces_target(
        self, client: AsyncClient, guest_session: str
    ):
        project = await _create_project(client, guest_session)
        source_obj = await _create_pipe_object(client, project["id"], guest_session)
        target_tail_obj = await _create_pipe_object(
            client,
            project["id"],
            guest_session,
            {"name": "Target tail"},
        )
        await _calc_pipe_electrical(
            client,
            source_obj["id"],
            guest_session,
            variant_number=1,
            cable_mark="ТЛТ-100",
        )
        await _calc_pipe_electrical(
            client,
            source_obj["id"],
            guest_session,
            variant_number=2,
            cable_mark="ТЛТ-40",
        )
        await _calc_pipe_electrical(
            client,
            target_tail_obj["id"],
            guest_session,
            variant_number=2,
            cable_mark="ТЛТ-40",
        )

        conflict = await client.post(
            "/api/v1/calc/electrical/variants/copy",
            json={
                "project_id": project["id"],
                "source_variant_number": 1,
                "target_variant_number": 2,
            },
            headers={"X-Session-Id": guest_session},
        )
        assert conflict.status_code == 409
        assert conflict.json()["detail"]["code"] == "target_not_empty"
        assert conflict.json()["detail"]["target_count"] == 2

        overwrite = await client.post(
            "/api/v1/calc/electrical/variants/copy",
            json={
                "project_id": project["id"],
                "source_variant_number": 1,
                "target_variant_number": 2,
                "overwrite": True,
            },
            headers={"X-Session-Id": guest_session},
        )
        assert overwrite.status_code == 200, overwrite.text
        assert overwrite.json()["copied_count"] == 1
        assert overwrite.json()["deleted_target_count"] == 2
        assert overwrite.json()["overwrite_applied"] is True

        target = await client.get(
            "/api/v1/calc/electrical",
            params={"project_id": project["id"], "variant_number": 2},
            headers={"X-Session-Id": guest_session},
        )
        assert target.status_code == 200, target.text
        target_calcs = target.json()
        assert len(target_calcs) == 1
        assert target_calcs[0]["object_id"] == source_obj["id"]
        assert target_calcs[0]["cable_mark"] == "ТЛТ-100"
        target_results = target_calcs[0]["results"]
        assert target_results["selected_cable"] == "ТЛТ-100"
        assert target_results["copy_validation"]["status"] == "validated"
        assert "category" not in target_results
        assert "error_code" not in target_results

    async def test_copy_electrical_variant_from_stale_source_rechecks_exact_cable(
        self, client: AsyncClient, guest_session: str, db_session: AsyncSession
    ):
        project = await _create_project(client, guest_session)
        source_obj = await _create_pipe_object(client, project["id"], guest_session)
        await _calc_pipe_electrical(
            client,
            source_obj["id"],
            guest_session,
            variant_number=1,
            cable_mark="ТЛТ-100",
        )
        result = await db_session.execute(
            select(ElectricalCalculation).where(
                ElectricalCalculation.object_id == source_obj["id"],
                ElectricalCalculation.variant_number == 1,
            )
        )
        source_calc = result.scalar_one()
        source_calc.results = {
            "category": "stale",
            "error_code": "STALE_HEAT_LOSS",
            "stale": True,
            "selected_cable": "ТЛТ-OLD",
            "total_power": 1234,
            "current": 56,
            "order_cable_length": 789,
        }
        await db_session.commit()

        copy_resp = await client.post(
            "/api/v1/calc/electrical/variants/copy",
            json={
                "project_id": project["id"],
                "source_variant_number": 1,
                "target_variant_number": 2,
            },
            headers={"X-Session-Id": guest_session},
        )
        assert copy_resp.status_code == 200, copy_resp.text

        target = await client.get(
            "/api/v1/calc/electrical",
            params={"project_id": project["id"], "variant_number": 2},
            headers={"X-Session-Id": guest_session},
        )
        target_results = target.json()[0]["results"]
        assert target_results["selected_cable"] == "ТЛТ-100"
        assert target_results["copy_validation"]["status"] == "validated"
        assert target_results["copy_validation"]["autoselection_used"] is False
        assert "stale_reason" not in target_results
        assert "category" not in target_results
        assert "error_code" not in target_results

    async def test_copy_electrical_variant_invalid_copied_choice_saves_error_without_autopick(
        self, client: AsyncClient, guest_session: str, db_session: AsyncSession
    ):
        project = await _create_project(client, guest_session)
        source_obj = await _create_pipe_object(client, project["id"], guest_session)
        await _calc_pipe_electrical(
            client,
            source_obj["id"],
            guest_session,
            variant_number=1,
            cable_mark="ТЛТ-25",
        )
        obj_result = await db_session.execute(
            select(ProjectObject).where(ProjectObject.id == source_obj["id"])
        )
        obj = obj_result.scalar_one()
        obj.results = {
            **(obj.results or {}),
            "heat_loss_per_meter": 300.0,
            "total_heat_loss": 15000.0,
            "effective_length": 50.0,
        }
        await db_session.commit()

        copy_resp = await client.post(
            "/api/v1/calc/electrical/variants/copy",
            json={
                "project_id": project["id"],
                "source_variant_number": 1,
                "target_variant_number": 2,
            },
            headers={"X-Session-Id": guest_session},
        )
        assert copy_resp.status_code == 200, copy_resp.text
        body = copy_resp.json()
        assert body["validated_count"] == 0
        assert body["validation_failed_count"] == 1

        target = await client.get(
            "/api/v1/calc/electrical",
            params={"project_id": project["id"], "variant_number": 2},
            headers={"X-Session-Id": guest_session},
        )
        target_calc = target.json()[0]
        assert target_calc["cable_mark"] == "ТЛТ-25"
        assert target_calc["results"]["category"] == "formula"
        assert target_calc["results"]["error_code"] == "POWER_TOO_HIGH"
        assert target_calc["results"]["copy_validation"]["status"] == "failed"
        assert target_calc["results"]["copy_validation"]["autoselection_used"] is False
        assert target_calc["results"].get("selected_cable") is None

    async def test_copy_electrical_variant_empty_source_returns_422(
        self, client: AsyncClient, guest_session: str
    ):
        project = await _create_project(client, guest_session)
        await _create_pipe_object(client, project["id"], guest_session)

        resp = await client.post(
            "/api/v1/calc/electrical/variants/copy",
            json={
                "project_id": project["id"],
                "source_variant_number": 1,
                "target_variant_number": 2,
            },
            headers={"X-Session-Id": guest_session},
        )

        assert resp.status_code == 422
        assert resp.json()["detail"]["code"] == "source_empty"

    async def test_copy_electrical_variant_same_source_and_target_returns_422(
        self, client: AsyncClient, guest_session: str
    ):
        project = await _create_project(client, guest_session)
        obj = await _create_pipe_object(client, project["id"], guest_session)
        await _calc_pipe_electrical(client, obj["id"], guest_session, variant_number=1)

        resp = await client.post(
            "/api/v1/calc/electrical/variants/copy",
            json={
                "project_id": project["id"],
                "source_variant_number": 1,
                "target_variant_number": 1,
            },
            headers={"X-Session-Id": guest_session},
        )

        assert resp.status_code == 422
        assert resp.json()["detail"]["code"] == "same_variant"

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

    async def test_self_regulating_tt_calc(self, client: AsyncClient, guest_session: str):
        """self_regulating_tt: возвращает cable_mark с суффиксом -СР/-СТ."""
        project = await _create_project(client, guest_session)
        obj = await _create_pipe_object(client, project["id"], guest_session)

        resp = await client.post(
            "/api/v1/calc/electrical",
            json={
                "object_id": obj["id"],
                "cable_type": "self_regulating_tt",
                "data": {
                    "required_power_per_meter": 18.0,
                    "pipe_length": 50.0,
                    "process_temperature": 50.0,
                    "maintain_temperature": 50.0,
                    "safety_factor": 1.1,
                    "aggressive_product": False,
                },
            },
            headers={"X-Session-Id": guest_session},
        )
        assert resp.status_code == 200, resp.text
        result = resp.json()["result"]
        assert "cable_mark" in result
        assert result["cable_mark"].endswith("-СР")
        assert result["series"] in ("ТТН", "ТТВ", "ТТХ")
        assert result["power_per_meter"] > 0

    async def test_single_core_resistive_calc(self, client: AsyncClient, guest_session: str):
        """single_core: возвращает selected_cable и conductor_cross_section."""
        project = await _create_project(client, guest_session)
        obj = await _create_pipe_object(client, project["id"], guest_session)

        resp = await client.post(
            "/api/v1/calc/electrical",
            json={
                "object_id": obj["id"],
                "cable_type": "single_core",
                "data": {
                    "required_heat_loss": 5000.0,
                    "pipe_length": 100.0,
                    "process_temperature": 60.0,
                    "supply_voltage": 220.0,
                    "connection_type": "line_1ph",
                },
            },
            headers={"X-Session-Id": guest_session},
        )
        assert resp.status_code == 200, resp.text
        result = resp.json()["result"]
        assert "conductor_cross_section" in result
        assert result["conductor_cross_section"] > 0
        assert result["total_power"] > 0

    async def test_nonexistent_object_returns_404(self, client: AsyncClient, guest_session: str):
        """Несуществующий object_id → 404 с читаемым сообщением."""
        import uuid

        resp = await client.post(
            "/api/v1/calc/electrical",
            json={
                "object_id": str(uuid.uuid4()),
                "cable_type": "self_regulating",
                "data": {
                    "required_power_per_meter": 20,
                    "cable_mark": "ТЛТ-25",
                    "supply_voltage": 220,
                    "ambient_temperature": -30,
                    "pipe_length": 50,
                    "safety_factor": 1.1,
                },
            },
            headers={"X-Session-Id": guest_session},
        )
        assert resp.status_code == 404
        assert "не найден" in resp.json()["detail"].lower()

    async def test_tlt_tank_batch_uses_laying_geometry(
        self, client: AsyncClient, guest_session: str
    ):
        """ТЛТ на резервуаре сравнивает Вт/м кабеля с Q/длину укладки, не с Вт/м²."""
        project = await _create_project(client, guest_session)
        obj_resp = await client.post(
            f"/api/v1/projects/{project['id']}/objects",
            json={
                "object_type": "tank",
                "params": {
                    "shape": "cylindrical",
                    "diameter": 2.0,
                    "height": 3.0,
                    "insulation_thickness": 0.08,
                    "insulation_material": MINERAL_WOOL,
                    "insulation_temperature_basis": "outdoor_winter",
                    "ambient_temperature": -20,
                    "process_temperature": 80,
                    "safety_factor": 1.1,
                },
            },
            headers={"X-Session-Id": guest_session},
        )
        assert obj_resp.status_code in (200, 201), obj_resp.text
        tank = obj_resp.json()

        resp = await client.post(
            "/api/v1/calc/electrical/batch",
            params={"project_id": project["id"], "laying_step": 0.1},
            headers={"X-Session-Id": guest_session},
        )

        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["calculated"] == 1
        result = body["results"][0]["results"]
        assert result["installed_cable_length"] > tank["params"]["height"] * 1.1
        assert result["total_power"] >= tank["results"]["total_heat_loss"]

    async def test_batch_can_skip_result_payload(self, client: AsyncClient, guest_session: str):
        project = await _create_project(client, guest_session)
        await _create_pipe_object(client, project["id"], guest_session)

        resp = await client.post(
            "/api/v1/calc/electrical/batch",
            params={"project_id": project["id"], "include_results": False},
            headers={"X-Session-Id": guest_session},
        )

        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["calculated"] == 1
        assert body["results"] == []

        listing = (
            await client.get(
                "/api/v1/calc/electrical",
                params={"project_id": project["id"]},
                headers={"X-Session-Id": guest_session},
            )
        ).json()
        assert len(listing) == 1

    async def test_electrical_page_returns_paginated_objects_and_project_summary(
        self, client: AsyncClient, guest_session: str
    ):
        project = await _create_project(client, guest_session)
        first = await _create_pipe_object(client, project["id"], guest_session)
        second = await _create_pipe_object(client, project["id"], guest_session)

        batch = await client.post(
            "/api/v1/calc/electrical/batch",
            params={"project_id": project["id"], "include_results": False},
            headers={"X-Session-Id": guest_session},
        )
        assert batch.status_code == 200, batch.text

        resp = await client.get(
            "/api/v1/calc/electrical/page",
            params={"project_id": project["id"], "page": 1, "page_size": 1},
            headers={"X-Session-Id": guest_session},
        )

        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert len(body["items"]) == 1
        page_object_id = body["items"][0]["id"]
        assert page_object_id in {first["id"], second["id"]}
        assert [calc["object_id"] for calc in body["calculations"]] == [page_object_id]
        assert body["summary"]["total_objects"] == 2
        assert body["summary"]["valid_objects"] == 2
        assert body["summary"]["calculated_count"] == 2
        assert body["page_info"] == {
            "page": 1,
            "page_size": 1,
            "offset": 0,
            "total_pages": 2,
            "has_next_page": True,
            "has_previous_page": False,
        }

    async def test_electrical_page_message_only_result_stays_successful(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        guest_session: str,
    ):
        project = await _create_project(client, guest_session)
        obj = await _create_pipe_object(client, project["id"], guest_session)
        await _calc_pipe_electrical(client, obj["id"], guest_session)

        calc = (
            await db_session.execute(
                select(ElectricalCalculation).where(ElectricalCalculation.object_id == obj["id"])
            )
        ).scalar_one()
        calc.results = {
            **calc.results,
            "message": "Служебное пояснение успешного подбора",
        }
        await db_session.commit()

        resp = await client.get(
            "/api/v1/calc/electrical/page",
            params={"project_id": project["id"], "page": 1, "page_size": 10},
            headers={"X-Session-Id": guest_session},
        )

        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["summary"]["calculated_count"] == 1
        assert body["summary"]["failed_count"] == 0
        assert body["summary"]["total_power"] == pytest.approx(calc.results["total_power"])

        query_resp = await client.post(
            "/api/v1/calc/electrical/query",
            json={
                "project_id": project["id"],
                "filters": [{"key": "electrical_status", "op": "in", "values": ["calculated"]}],
            },
            headers={"X-Session-Id": guest_session},
        )
        assert query_resp.status_code == 200, query_resp.text
        assert query_resp.json()["counts"]["filtered"] == 1

        error_query_resp = await client.post(
            "/api/v1/calc/electrical/query",
            json={
                "project_id": project["id"],
                "filters": [{"key": "electrical_status", "op": "in", "values": ["error"]}],
            },
            headers={"X-Session-Id": guest_session},
        )
        assert error_query_resp.status_code == 200, error_query_resp.text
        assert error_query_resp.json()["counts"]["filtered"] == 0

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
        assert fields["electrical_status"]["options"]["items"]

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

    async def test_electrical_query_sorts_by_total_power(
        self, client: AsyncClient, guest_session: str
    ):
        project = await _create_project(client, guest_session)
        await _create_pipe_object(
            client,
            project["id"],
            guest_session,
            {"name": "Короткая", "pipe_length": 10},
        )
        await _create_pipe_object(
            client,
            project["id"],
            guest_session,
            {"name": "Длинная", "pipe_length": 200},
        )
        batch = await client.post(
            "/api/v1/calc/electrical/batch",
            params={"project_id": project["id"]},
            headers={"X-Session-Id": guest_session},
        )
        assert batch.status_code == 200, batch.text

        resp = await client.post(
            "/api/v1/calc/electrical/query",
            json={
                "project_id": project["id"],
                "variant_number": 1,
                "sort": {"key": "total_power", "dir": "desc"},
                "page_size": 10,
            },
            headers={"X-Session-Id": guest_session},
        )

        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["counts"]["filtered"] == 2
        assert body["items"][0]["params"]["name"] == "Длинная"
        assert len(body["calculations"]) == 2

    async def test_batch_can_skip_error_payload(self, client: AsyncClient, guest_session: str):
        project = await _create_project(client, guest_session)
        await _create_pipe_object(client, project["id"], guest_session)

        resp = await client.post(
            "/api/v1/calc/electrical/batch",
            params={
                "project_id": project["id"],
                "cable_type": "mineral",
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
        assert listing[0]["results"]["error_code"] == "UNKNOWN"
        assert listing[0]["results"]["category"] == "formula"
        assert "расчётная формула не реализована" in listing[0]["results"]["message"]
        assert "error" not in listing[0]["results"]


class TestManualCableSelection:
    """POST /calc/electrical/select-cable — ручной выбор кабеля."""

    async def _create_pipe_project(
        self, client: AsyncClient, guest_session: str, process_temp: float = 80
    ) -> tuple[str, str]:
        """Использует авто-проект пользователя + добавляет трубу, возвращает (project_id, object_id)."""
        pid = (
            await client.get(
                "/api/v1/projects",
                headers={"X-Session-Id": guest_session},
            )
        ).json()[0]["id"]
        obj = (
            await client.post(
                f"/api/v1/projects/{pid}/objects",
                json={
                    "object_type": "pipe",
                    "params": {
                        "outer_diameter": 0.108,
                        "insulation_thickness": 0.05,
                        "insulation_material": MINERAL_WOOL,
                        "insulation_temperature_basis": "outdoor_winter",
                        "ambient_temperature": -20,
                        "process_temperature": process_temp,
                        "pipe_length": 50,
                    },
                },
                headers={"X-Session-Id": guest_session},
            )
        ).json()
        return pid, obj["id"]

    async def test_manual_select_ok_upserts_elec_row(self, client: AsyncClient, guest_session: str):
        _pid, oid = await self._create_pipe_project(client, guest_session)
        # Запускаем batch — появится автоподбор
        resp = await client.post(
            "/api/v1/calc/electrical/batch",
            params={"project_id": _pid},
            headers={"X-Session-Id": guest_session},
        )
        assert resp.status_code == 200
        # Ручной выбор — берём более мощный кабель ТЛТ-60 (T_max=120, подойдёт для 80°C)
        resp = await client.post(
            "/api/v1/calc/electrical/select-cable",
            params={"object_id": oid, "cable_mark": "ТЛТ-60"},
            headers={"X-Session-Id": guest_session},
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["cable_mark"] == "ТЛТ-60"
        assert body["cable_mark_source"] == "manual"
        assert body["results"]["selected_cable"] == "ТЛТ-60"
        # В листе тоже одна запись (upsert не плодит дубликаты)
        listing = (
            await client.get(
                "/api/v1/calc/electrical",
                params={"project_id": _pid},
                headers={"X-Session-Id": guest_session},
            )
        ).json()
        assert len(listing) == 1
        assert listing[0]["cable_mark"] == "ТЛТ-60"
        assert listing[0]["cable_mark_source"] == "manual"

    async def test_manual_select_variants_ok_upserts_selected_variants(
        self, client: AsyncClient, guest_session: str
    ):
        pid, oid = await self._create_pipe_project(client, guest_session)

        resp = await client.post(
            "/api/v1/calc/electrical/select-cable/variants",
            json={
                "object_id": oid,
                "cable_mark": "ТЛТ-60",
                "variant_numbers": [2, 4],
            },
            headers={"X-Session-Id": guest_session},
        )

        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert [item["variant_number"] for item in body] == [2, 4]
        assert all(item["cable_mark"] == "ТЛТ-60" for item in body)
        assert all(item["cable_mark_source"] == "manual" for item in body)

        listing = (
            await client.get(
                "/api/v1/calc/electrical",
                params={"project_id": pid},
                headers={"X-Session-Id": guest_session},
            )
        ).json()
        assert sorted(item["variant_number"] for item in listing) == [2, 4]

    async def test_manual_select_cable_too_weak(self, client: AsyncClient, guest_session: str):
        """Слишком слабый кабель → 422 с текстом «не обеспечивает»."""
        _pid, oid = await self._create_pipe_project(client, guest_session)
        # ТЛТ-10 точно слабее, чем требуется для трубы DN100 @ 80°C
        resp = await client.post(
            "/api/v1/calc/electrical/select-cable",
            params={"object_id": oid, "cable_mark": "ТЛТ-10"},
            headers={"X-Session-Id": guest_session},
        )
        assert resp.status_code == 422
        detail = resp.json()["detail"].lower()
        assert "не обеспечивает" in detail

    async def test_manual_select_cable_t_max_exceeded(
        self, client: AsyncClient, guest_session: str
    ):
        """Температура продукта выше T_max кабеля → 422."""
        # Труба с толстой изоляцией — q маленький (мощность не проблема);
        # process=120, выбираем ТЛТ-50 (T_max=110) — должна упасть именно на T_max.
        pid = (
            await client.get(
                "/api/v1/projects",
                headers={"X-Session-Id": guest_session},
            )
        ).json()[0]["id"]
        obj = (
            await client.post(
                f"/api/v1/projects/{pid}/objects",
                json={
                    "object_type": "pipe",
                    "params": {
                        "outer_diameter": 0.057,
                        "insulation_thickness": 0.08,
                        "insulation_material": MINERAL_WOOL,
                        "insulation_temperature_basis": "outdoor_winter",
                        "ambient_temperature": 20,
                        "process_temperature": 120,
                        "pipe_length": 50,
                    },
                },
                headers={"X-Session-Id": guest_session},
            )
        ).json()
        resp = await client.post(
            "/api/v1/calc/electrical/select-cable",
            params={"object_id": obj["id"], "cable_mark": "ТЛТ-50"},
            headers={"X-Session-Id": guest_session},
        )
        assert resp.status_code == 422
        assert "превышает" in resp.json()["detail"].lower()

    async def test_manual_select_unknown_mark(self, client: AsyncClient, guest_session: str):
        """Несуществующая марка → 422 «не найден»."""
        _pid, oid = await self._create_pipe_project(client, guest_session)
        resp = await client.post(
            "/api/v1/calc/electrical/select-cable",
            params={"object_id": oid, "cable_mark": "NEXANS-XYZ"},
            headers={"X-Session-Id": guest_session},
        )
        assert resp.status_code == 422
        assert "не найден" in resp.json()["detail"].lower()

    async def test_manual_select_overrides_previous_error(
        self, client: AsyncClient, guest_session: str
    ):
        """Если предыдущий batch сохранил ошибку, ручной успех её затирает."""
        # Процесс 170°C — даже ТЛТ-100 (T_max=150) не подойдёт → batch сохранит ошибку
        _pid, oid = await self._create_pipe_project(client, guest_session, process_temp=170)
        await client.post(
            "/api/v1/calc/electrical/batch",
            params={"project_id": _pid},
            headers={"X-Session-Id": guest_session},
        )
        # Проверяем что запись с ошибкой существует
        before = (
            await client.get(
                "/api/v1/calc/electrical",
                params={"project_id": _pid},
                headers={"X-Session-Id": guest_session},
            )
        ).json()
        assert len(before) == 1
        assert before[0]["results"].get("error_code")
        assert "error" not in before[0]["results"]

        # Чиним объект: снижаем процесс-температуру до 80 через update
        objects = (
            await client.get(
                f"/api/v1/projects/{_pid}/objects",
                headers={"X-Session-Id": guest_session},
            )
        ).json()
        current_object = next(item for item in objects if item["id"] == oid)
        await client.put(
            f"/api/v1/projects/{_pid}/objects/{oid}",
            json={
                "version": current_object["version"],
                "params": {
                    "outer_diameter": 0.108,
                    "insulation_thickness": 0.05,
                    "insulation_material": MINERAL_WOOL,
                    "insulation_temperature_basis": "outdoor_winter",
                    "ambient_temperature": -20,
                    "process_temperature": 80,
                    "pipe_length": 50,
                },
            },
            headers={"X-Session-Id": guest_session},
        )
        # Выбираем кабель вручную
        resp = await client.post(
            "/api/v1/calc/electrical/select-cable",
            params={"object_id": oid, "cable_mark": "ТЛТ-60"},
            headers={"X-Session-Id": guest_session},
        )
        assert resp.status_code == 200
        # Проверяем что ошибки больше нет
        after = (
            await client.get(
                "/api/v1/calc/electrical",
                params={"project_id": _pid},
                headers={"X-Session-Id": guest_session},
            )
        ).json()
        assert len(after) == 1
        assert not after[0]["results"].get("error_code")
        assert not after[0]["results"].get("category")
        assert after[0]["cable_mark"] == "ТЛТ-60"

    async def test_batch_default_preserves_manual_cable(
        self, client: AsyncClient, guest_session: str
    ):
        """По умолчанию batch не затирает ручной выбор повторным автоподбором."""
        pid, oid = await self._create_pipe_project(client, guest_session)

        manual = await client.post(
            "/api/v1/calc/electrical/select-cable",
            params={"object_id": oid, "cable_mark": "ТЛТ-60"},
            headers={"X-Session-Id": guest_session},
        )
        assert manual.status_code == 200, manual.text

        resp = await client.post(
            "/api/v1/calc/electrical/batch",
            params={"project_id": pid},
            headers={"X-Session-Id": guest_session},
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["calculated"] == 0
        assert body["skipped"] == 1

        listing = (
            await client.get(
                "/api/v1/calc/electrical",
                params={"project_id": pid},
                headers={"X-Session-Id": guest_session},
            )
        ).json()
        assert len(listing) == 1
        assert listing[0]["cable_mark"] == "ТЛТ-60"
        assert listing[0]["cable_mark_source"] == "manual"

    async def test_batch_skip_manual_true_preserves_manual_cable(
        self, client: AsyncClient, guest_session: str
    ):
        """skip_manual=true не затирает ручной выбор повторным автоподбором."""
        pid, oid = await self._create_pipe_project(client, guest_session)

        manual = await client.post(
            "/api/v1/calc/electrical/select-cable",
            params={"object_id": oid, "cable_mark": "ТЛТ-60"},
            headers={"X-Session-Id": guest_session},
        )
        assert manual.status_code == 200, manual.text

        resp = await client.post(
            "/api/v1/calc/electrical/batch",
            params={"project_id": pid, "skip_manual": True},
            headers={"X-Session-Id": guest_session},
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["calculated"] == 0
        assert body["skipped"] == 1

        listing = (
            await client.get(
                "/api/v1/calc/electrical",
                params={"project_id": pid},
                headers={"X-Session-Id": guest_session},
            )
        ).json()
        assert len(listing) == 1
        assert listing[0]["cable_mark"] == "ТЛТ-60"
        assert listing[0]["cable_mark_source"] == "manual"

    async def test_batch_skip_manual_false_overwrites_manual_cable(
        self, client: AsyncClient, guest_session: str
    ):
        """Явное skip_manual=false разрешает пользователю перезаписать ручной выбор."""
        pid, oid = await self._create_pipe_project(client, guest_session)

        manual = await client.post(
            "/api/v1/calc/electrical/select-cable",
            params={"object_id": oid, "cable_mark": "ТЛТ-100"},
            headers={"X-Session-Id": guest_session},
        )
        assert manual.status_code == 200, manual.text

        resp = await client.post(
            "/api/v1/calc/electrical/batch",
            params={"project_id": pid, "skip_manual": False},
            headers={"X-Session-Id": guest_session},
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["calculated"] == 1
        assert body["skipped"] == 0

        listing = (
            await client.get(
                "/api/v1/calc/electrical",
                params={"project_id": pid},
                headers={"X-Session-Id": guest_session},
            )
        ).json()
        assert len(listing) == 1
        assert listing[0]["cable_mark"] != "ТЛТ-100"
        assert listing[0]["cable_mark_source"] == "auto"


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
        insulation_thickness: float,
        process_temperature: float,
        ambient_temperature: float = -30,
    ) -> dict:
        resp = await client.post(
            f"/api/v1/projects/{project_id}/objects",
            json={
                "object_type": "pipe",
                "params": {
                    "outer_diameter": 0.108,
                    "insulation_thickness": insulation_thickness,
                    "insulation_material": MINERAL_WOOL,
                    "insulation_temperature_basis": "outdoor_winter",
                    "ambient_temperature": ambient_temperature,
                    "process_temperature": process_temperature,
                    "pipe_length": 50,
                },
            },
            headers={"X-Session-Id": session_id},
        )
        assert resp.status_code in (200, 201), resp.text
        return resp.json()

    async def test_selected_cable_matches_single_K_application(
        self, client: AsyncClient, guest_session: str
    ):
        """Сценарий пограничного подбора.

        Каталог ТЛТ: 10, 15, 20, 25, 30, 40, 50, 60, 75, 100 Вт/м.
        Берём q_linear ≈ 22 Вт/м (δ=50мм изоляции, T_проц=80°C, T_амб=-30°C).
          single K=1.1: required_effective = 22 × 1.1 = 24.2 → ТЛТ-25 (25 Вт/м)
          double K=1.21: required_effective = 22 × 1.21 = 26.6 → ТЛТ-30 (30 Вт/м)

        Ожидаем ТЛТ-25. Если получим ТЛТ-30 или выше — двойная накрутка.
        """
        project = await _create_project(client, guest_session)
        obj = await self._create_pipe(
            client,
            project["id"],
            guest_session,
            insulation_thickness=0.05,
            process_temperature=80,
        )

        q_linear = obj["results"]["heat_loss_per_meter"]
        required_effective_single = q_linear * 1.1
        required_effective_double = q_linear * 1.21  # = 1.1**2

        # Автоподбор кабеля на все объекты проекта
        resp = await client.post(
            "/api/v1/calc/electrical/batch",
            params={"project_id": project["id"]},
            headers={"X-Session-Id": guest_session},
        )
        assert resp.status_code == 200, resp.text
        results = resp.json()["results"]
        assert len(results) == 1
        selected = results[0]["cable_mark"]

        # Вычисляем минимальный кабель по обоим вариантам и сверяем с фактом.
        catalog = [10, 15, 20, 25, 30, 40, 50, 60, 75, 100]
        expected_single = next(p for p in catalog if p >= required_effective_single)
        expected_double = next(p for p in catalog if p >= required_effective_double)

        actual_power = int(selected.replace("ТЛТ-", ""))

        assert actual_power == expected_single, (
            f"Выбран кабель {selected} ({actual_power} Вт/м) при q_linear={q_linear:.2f}. "
            f"Single-K: ожидалось {expected_single} Вт/м. "
            f"Double-K дало бы {expected_double} Вт/м. "
            f"Если факт = double — это регрессия по safety_factor."
        )

    async def test_total_heat_loss_equals_q_linear_times_L_times_K(
        self, client: AsyncClient, guest_session: str
    ):
        """Контракт API: total_heat_loss = heat_loss_per_meter × L × K.

        Эта формула — отправная точка, от которой зависит, где «живёт» К.
        Если контракт сломается (например K будет зашит в q_linear),
        ломается весь электрорасчёт.
        """
        project = await _create_project(client, guest_session)
        obj = await self._create_pipe(
            client,
            project["id"],
            guest_session,
            insulation_thickness=0.05,
            process_temperature=80,
        )
        results = obj["results"]
        q = results["heat_loss_per_meter"]
        total = results["total_heat_loss"]
        l_eff = results["effective_length"]  # 50 без локальных элементов

        # К по умолчанию = 1.1 (safety_factor)
        expected_total = q * l_eff * 1.1
        assert total == pytest.approx(expected_total, rel=1e-3), (
            f"total_heat_loss={total} != q × L × K = {q} × {l_eff} × 1.1 = {expected_total}. "
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
        await _create_pipe_object(client, project["id"], guest_session)

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

        # С фильтром variant_number=2 — только СО2
        only_v2 = (
            await client.get(
                "/api/v1/calc/electrical",
                params={"project_id": project["id"], "variant_number": 2},
                headers={"X-Session-Id": guest_session},
            )
        ).json()
        assert len(only_v2) == 1
        assert only_v2[0]["variant_number"] == 2

    async def test_failed_calc_saved_under_correct_variant(
        self, client: AsyncClient, guest_session: str
    ):
        """Fail при расчёте СО2 не затирает успешный расчёт СО1 того же объекта."""
        project = await _create_project(client, guest_session)
        await _create_pipe_object(client, project["id"], guest_session)

        # СО1 — нормальный автоподбор (должен успешно выбрать кабель)
        r1 = await client.post(
            "/api/v1/calc/electrical/batch",
            params={"project_id": project["id"], "variant_number": 1},
            headers={"X-Session-Id": guest_session},
        )
        assert r1.status_code == 200
        body1 = r1.json()
        assert body1["calculated"] == 1, f"СО1 должен пройти: {body1}"

        v1_calc = (
            await client.get(
                "/api/v1/calc/electrical",
                params={"project_id": project["id"], "variant_number": 1},
                headers={"X-Session-Id": guest_session},
            )
        ).json()
        assert len(v1_calc) == 1
        assert v1_calc[0]["cable_mark"] is not None
        v1_cable = v1_calc[0]["cable_mark"]

        # Эмулируем фейл для СО2: ручной выбор заведомо слабого кабеля под variant=2.
        # Это создаст failed-запись (cable_mark=None, structured results) для варианта 2.
        obj_id = v1_calc[0]["object_id"]
        r_fail = await client.post(
            "/api/v1/calc/electrical/select-cable",
            params={
                "object_id": obj_id,
                "cable_mark": "ТЛТ-10",
                "variant_number": 2,
            },
            headers={"X-Session-Id": guest_session},
        )
        # 422 — неподходящий кабель, но может не писать fail-запись. Проверяем
        # ключевое: запись СО1 не изменилась.
        assert r_fail.status_code == 422

        v1_after = (
            await client.get(
                "/api/v1/calc/electrical",
                params={"project_id": project["id"], "variant_number": 1},
                headers={"X-Session-Id": guest_session},
            )
        ).json()
        assert len(v1_after) == 1
        assert (
            v1_after[0]["cable_mark"] == v1_cable
        ), "Успешный расчёт СО1 был затёрт при ошибке в СО2"
