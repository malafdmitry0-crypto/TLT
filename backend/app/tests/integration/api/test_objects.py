"""Integration-тесты объектов проекта с автопересчётом."""

import math
from uuid import UUID

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.project_object import ProjectObject
from app.services.heat_contract import DEPRECATED_HEAT_RESULT_KEYS

pytestmark = pytest.mark.asyncio(loop_scope="session")

MINERAL_WOOL = "mineral_wool_boards_120"
FOAM_GLASS_ALTERNATIVE = "expanded_perlite_sand_225"


async def _project(client: AsyncClient, session_id: str) -> str:
    # У пользовательской сессии ровно один авто-проект — берём его.
    resp = await client.get(
        "/api/v1/projects",
        headers={"X-Session-Id": session_id},
    )
    return resp.json()[0]["id"]


class TestObjectsLifecycle:
    @pytest.mark.parametrize(
        "legacy_key",
        [
            "explosion_zone_type",
            "power_indication_on_boxes",
            "end_of_section_indication",
            "top_of_box_indication",
            "min_length_for_k2i",
            "hot_reserve_coefficient",
        ],
    )
    async def test_create_rejects_legacy_object_specification_settings_with_typed_error(
        self,
        client: AsyncClient,
        guest_session: str,
        legacy_key: str,
    ):
        pid = await _project(client, guest_session)
        response = await client.post(
            f"/api/v1/projects/{pid}/objects",
            json={
                "object_type": "pipe",
                "params": {legacy_key: False},
            },
            headers={"X-Session-Id": guest_session},
        )

        assert response.status_code == 422
        assert response.json()["detail"] == {
            "code": "OBJECT_SPECIFICATION_SETTINGS_SCOPE_VIOLATION",
            "message": "Параметры спецификации запрещены в данных объекта",
            "fields": [legacy_key],
        }

    async def test_update_rejects_legacy_object_specification_settings_with_typed_error(
        self,
        client: AsyncClient,
        guest_session: str,
    ):
        pid = await _project(client, guest_session)
        headers = {"X-Session-Id": guest_session}
        created_response = await client.post(
            f"/api/v1/projects/{pid}/objects",
            json={
                "object_type": "pipe",
                "params": {
                    "outer_diameter": 0.108,
                    "wall_thickness": 0.004,
                    "pipe_material": "carbon_steel",
                    "insulation_layers": [
                        {"thickness": 0.05, "material": MINERAL_WOOL}
                    ],
                    "insulation_temperature_basis": "outdoor_winter",
                    "ambient_temperature": -20,
                    "process_temperature": 80,
                    "min_switch_temperature": -20,
                    "pipe_length": 50,
                    "placement": "outdoor",
                    "wind_speed": 0,
                },
            },
            headers=headers,
        )
        assert created_response.status_code == 201, created_response.text
        created = created_response.json()

        response = await client.put(
            f"/api/v1/projects/{pid}/objects/{created['id']}",
            json={
                "version": created["version"],
                "params": {"hot_reserve_coefficient": 1.1},
            },
            headers=headers,
        )

        assert response.status_code == 422
        assert response.json()["detail"] == {
            "code": "OBJECT_SPECIFICATION_SETTINGS_SCOPE_VIOLATION",
            "message": "Параметры спецификации запрещены в данных объекта",
            "fields": ["hot_reserve_coefficient"],
        }

    async def test_pipe_canonical_results_are_returned_persisted_and_reloaded(
        self,
        client: AsyncClient,
        guest_session: str,
        db_session: AsyncSession,
    ):
        pid = await _project(client, guest_session)
        headers = {"X-Session-Id": guest_session}
        created_response = await client.post(
            f"/api/v1/projects/{pid}/objects",
            json={
                "object_type": "pipe",
                "params": {
                    "outer_diameter": 0.108,
                    "wall_thickness": 0.004,
                    "pipe_material": "carbon_steel",
                    "insulation_layers": [{"thickness": 0.05, "material": MINERAL_WOOL}],
                    "insulation_temperature_basis": "outdoor_winter",
                    "ambient_temperature": -20,
                    "process_temperature": 80,
                    "min_switch_temperature": -20,
                    "pipe_length": 50,
                    "placement": "outdoor",
                    "wind_speed": 0,
                },
            },
            headers=headers,
        )
        assert created_response.status_code == 201, created_response.text
        created = created_response.json()
        results = created["results"]
        assert results["formula_model"] == "pipe_heat_loss"
        assert results["formula_model_version"] == "2"
        assert results["safety_factor_applied"] == pytest.approx(1.1)
        assert results["total_heat_loss_design"] == pytest.approx(
            results["total_heat_loss_base"] * results["safety_factor_applied"],
            rel=1e-3,
        )
        assert (
            results["insulation_layers_applied"][0]["conductivity_source"]
            == "reference_data"
        )
        assert results["insulation_layers_applied"][0][
            "conductivity_temperature_applied"
        ] == pytest.approx(40.0)
        assert DEPRECATED_HEAT_RESULT_KEYS.isdisjoint(results)

        stored = (
            await db_session.execute(
                select(ProjectObject).where(ProjectObject.id == UUID(created["id"]))
            )
        ).scalar_one()
        assert stored.results == results

        reloaded_response = await client.get(
            f"/api/v1/projects/{pid}/objects",
            headers=headers,
        )
        assert reloaded_response.status_code == 200, reloaded_response.text
        reloaded = next(item for item in reloaded_response.json() if item["id"] == created["id"])
        assert reloaded["results"] == results

        recalculated_response = await client.put(
            f"/api/v1/projects/{pid}/objects/{created['id']}",
            json={"version": created["version"], "params": created["params"]},
            headers=headers,
        )
        assert recalculated_response.status_code == 200, recalculated_response.text
        assert recalculated_response.json()["results"] == results

    async def test_pipe_recalculation_keeps_only_canonical_result_keys(
        self,
        client: AsyncClient,
        guest_session: str,
    ):
        pid = await _project(client, guest_session)
        headers = {"X-Session-Id": guest_session}
        created_response = await client.post(
            f"/api/v1/projects/{pid}/objects",
            json={
                "object_type": "pipe",
                "params": {
                    "outer_diameter": 0.1,
                    "wall_thickness": 0.004,
                    "pipe_material": "carbon_steel",
                    "insulation_layers": [{"thickness": 0.05, "material": MINERAL_WOOL}],
                    "insulation_temperature_basis": "outdoor_winter",
                    "ambient_temperature": -20,
                    "process_temperature": 80,
                    "min_switch_temperature": -20,
                    "pipe_length": 10,
                    "placement": "outdoor",
                    "wind_speed": 0,
                },
            },
            headers=headers,
        )
        assert created_response.status_code == 201, created_response.text
        created = created_response.json()
        winter_temperature = created["results"]["insulation_layers_applied"][0][
            "conductivity_temperature_applied"
        ]
        recalculated_response = await client.put(
            f"/api/v1/projects/{pid}/objects/{created['id']}",
            json={
                "version": created["version"],
                "params": {
                    **created["params"],
                    "insulation_temperature_basis": "outdoor_summer",
                },
            },
            headers=headers,
        )
        assert recalculated_response.status_code == 200, recalculated_response.text
        results = recalculated_response.json()["results"]
        assert results["formula_model"] == "pipe_heat_loss"
        assert winter_temperature == pytest.approx(40.0)
        assert results["insulation_layers_applied"][0][
            "conductivity_temperature_applied"
        ] == pytest.approx(60.0)
        assert DEPRECATED_HEAT_RESULT_KEYS.isdisjoint(results)

    async def test_tank_canonical_results_include_base_design_and_model_metadata(
        self,
        client: AsyncClient,
        guest_session: str,
    ):
        pid = await _project(client, guest_session)
        response = await client.post(
            f"/api/v1/projects/{pid}/objects",
            json={
                "object_type": "tank",
                "params": {
                    "shape": "cylindrical",
                    "heating_height": 2.0,
                    "laying_step": 0.2,
                    "diameter": 2,
                    "height": 3,
                    "insulation_layers": [{"thickness": 0.05, "material": MINERAL_WOOL}],
                    "insulation_temperature_basis": "outdoor_winter",
                    "ambient_temperature": -20,
                    "process_temperature": 80,
                    "min_switch_temperature": -20,
                    "placement": "outdoor",
                    "wind_speed": 0,
                },
            },
            headers={"X-Session-Id": guest_session},
        )
        assert response.status_code == 201, response.text
        results = response.json()["results"]
        assert results["formula_model"] == "tank_heat_loss"
        assert results["formula_model_version"] == "3"
        assert results["safety_factor_applied"] == pytest.approx(1.1)
        assert results["total_heat_loss_design"] == pytest.approx(
            results["total_heat_loss_base"] * results["safety_factor_applied"],
            rel=1e-3,
        )
        assert DEPRECATED_HEAT_RESULT_KEYS.isdisjoint(results)

    async def test_new_pipe_result_has_no_deprecated_keys(
        self,
        client: AsyncClient,
        guest_session: str,
    ):
        pid = await _project(client, guest_session)
        headers = {"X-Session-Id": guest_session}
        created_response = await client.post(
            f"/api/v1/projects/{pid}/objects",
            json={
                "object_type": "pipe",
                "params": {
                    "outer_diameter": 0.1,
                    "wall_thickness": 0.004,
                    "pipe_material": "carbon_steel",
                    "insulation_layers": [{"thickness": 0.05, "material": MINERAL_WOOL}],
                    "insulation_temperature_basis": "outdoor_winter",
                    "ambient_temperature": -20,
                    "process_temperature": 80,
                    "min_switch_temperature": -20,
                    "pipe_length": 10,
                    "placement": "outdoor",
                    "wind_speed": 0,
                },
            },
            headers=headers,
        )
        assert created_response.status_code == 201, created_response.text
        created = created_response.json()
        reloaded_response = await client.get(
            f"/api/v1/projects/{pid}/objects",
            headers=headers,
        )
        assert reloaded_response.status_code == 200, reloaded_response.text
        reloaded = next(item for item in reloaded_response.json() if item["id"] == created["id"])
        assert DEPRECATED_HEAT_RESULT_KEYS.isdisjoint(reloaded["results"])
        assert reloaded["results"] == created["results"]

    async def test_new_pipe_results_omit_surface_temperature_after_recalculate_and_reload(
        self,
        client: AsyncClient,
        guest_session: str,
        db_session: AsyncSession,
    ):
        pid = await _project(client, guest_session)
        headers = {"X-Session-Id": guest_session}
        created_response = await client.post(
            f"/api/v1/projects/{pid}/objects",
            json={
                "object_type": "pipe",
                "params": {
                    "outer_diameter": 0.1,
                    "wall_thickness": 0.004,
                    "pipe_material": "carbon_steel",
                    "insulation_layers": [{"thickness": 0.05, "material": MINERAL_WOOL}],
                    "insulation_temperature_basis": "outdoor_winter",
                    "ambient_temperature": -20,
                    "process_temperature": 80,
                    "min_switch_temperature": -20,
                    "pipe_length": 10,
                    "placement": "outdoor",
                    "wind_speed": 0,
                },
            },
            headers=headers,
        )
        assert created_response.status_code == 201, created_response.text
        created = created_response.json()
        assert "surface_temperature" not in created["results"]

        object_id = UUID(created["id"])
        stored = (
            await db_session.execute(select(ProjectObject).where(ProjectObject.id == object_id))
        ).scalar_one()
        assert "surface_temperature" not in (stored.results or {})

        recalculated_response = await client.put(
            f"/api/v1/projects/{pid}/objects/{created['id']}",
            json={
                "version": created["version"],
                "params": {
                    **created["params"],
                    "insulation_layers": [{"thickness": 0.04, "material": MINERAL_WOOL}],
                },
            },
            headers=headers,
        )
        assert recalculated_response.status_code == 200, recalculated_response.text
        recalculated = recalculated_response.json()
        assert "surface_temperature" not in recalculated["results"]

        await db_session.refresh(stored)
        assert "surface_temperature" not in (stored.results or {})
        reloaded_response = await client.get(
            f"/api/v1/projects/{pid}/objects",
            headers=headers,
        )
        assert reloaded_response.status_code == 200, reloaded_response.text
        reloaded = next(item for item in reloaded_response.json() if item["id"] == created["id"])
        assert "surface_temperature" not in reloaded["results"]

    async def test_legacy_pipe_result_with_surface_temperature_loads(
        self,
        client: AsyncClient,
        guest_session: str,
        db_session: AsyncSession,
    ):
        pid = await _project(client, guest_session)
        headers = {"X-Session-Id": guest_session}
        created_response = await client.post(
            f"/api/v1/projects/{pid}/objects",
            json={
                "object_type": "pipe",
                "params": {
                    "outer_diameter": 0.1,
                    "wall_thickness": 0.004,
                    "pipe_material": "carbon_steel",
                    "insulation_layers": [{"thickness": 0.05, "material": MINERAL_WOOL}],
                    "insulation_temperature_basis": "outdoor_winter",
                    "ambient_temperature": -20,
                    "process_temperature": 80,
                    "min_switch_temperature": -20,
                    "pipe_length": 10,
                    "placement": "outdoor",
                    "wind_speed": 0,
                },
            },
            headers=headers,
        )
        assert created_response.status_code == 201, created_response.text
        created = created_response.json()
        stored = (
            await db_session.execute(
                select(ProjectObject).where(ProjectObject.id == UUID(created["id"]))
            )
        ).scalar_one()
        stored.results = {**(stored.results or {}), "surface_temperature": None}
        await db_session.commit()

        reloaded_response = await client.get(
            f"/api/v1/projects/{pid}/objects",
            headers=headers,
        )
        assert reloaded_response.status_code == 200, reloaded_response.text
        reloaded = next(item for item in reloaded_response.json() if item["id"] == created["id"])
        assert reloaded["results"]["surface_temperature"] is None

    async def test_add_object_triggers_calculation(self, client: AsyncClient, guest_session: str):
        pid = await _project(client, guest_session)
        resp = await client.post(
            f"/api/v1/projects/{pid}/objects",
            json={
                "object_type": "pipe",
                "sort_order": 0,
                "params": {
                    "outer_diameter": 0.1,
                    "wall_thickness": 0.004,
                    "pipe_material": "carbon_steel",
                    "insulation_layers": [{"thickness": 0.05, "material": MINERAL_WOOL}],
                    "insulation_temperature_basis": "outdoor_winter",
                    "ambient_temperature": -20,
                    "process_temperature": 80,
                    "min_switch_temperature": -20,
                    "pipe_length": 10,
                    "placement": "outdoor",
                    "wind_speed": 0,
                },
            },
            headers={"X-Session-Id": guest_session},
        )
        assert resp.status_code == 201, resp.text
        body = resp.json()
        assert body["is_valid"] is True
        assert body["params"]["wall_thickness"] == pytest.approx(0.004)
        assert body["params"]["pipe_material"] == "carbon_steel"
        assert body["params"]["placement"] == "outdoor"
        assert "aggressive_product" not in body["params"]
        assert body["params"]["min_switch_temperature"] == -20
        assert "supply_voltage" not in body["params"]
        assert body["params"]["safety_factor"] == pytest.approx(1.1)
        assert body["params"]["num_local_elements"] == 0
        assert body["params"]["insulation_layers"] == [
            {"thickness": 0.05, "material": MINERAL_WOOL}
        ]
        assert body["results"]["safety_factor_applied"] == pytest.approx(1.1)
        assert body["results"]["heat_loss_per_meter_base"] > 0

    async def test_pipe_canonical_local_element_count_is_used(
        self, client: AsyncClient, guest_session: str
    ):
        pid = await _project(client, guest_session)
        resp = await client.post(
            f"/api/v1/projects/{pid}/objects",
            json={
                "object_type": "pipe",
                "params": {
                    "outer_diameter": 0.1,
                    "wall_thickness": 0.004,
                    "pipe_material": "carbon_steel",
                    "insulation_layers": [{"thickness": 0.05, "material": MINERAL_WOOL}],
                    "insulation_temperature_basis": "outdoor_winter",
                    "ambient_temperature": -20,
                    "process_temperature": 80,
                    "min_switch_temperature": -20,
                    "pipe_length": 10,
                    "num_local_elements": 6,
                    "local_element_equiv_length": 1.1,
                    "placement": "outdoor",
                    "wind_speed": 0,
                },
            },
            headers={"X-Session-Id": guest_session},
        )
        assert resp.status_code == 201, resp.text
        body = resp.json()
        assert body["is_valid"] is True
        assert body["params"]["num_local_elements"] == 6
        assert body["results"]["local_elements_count_applied"] == 6
        assert body["results"]["local_element_equiv_length_applied"] == pytest.approx(1.1)

    async def test_blank_required_pipe_fields_mark_object_invalid(
        self, client: AsyncClient, guest_session: str
    ):
        pid = await _project(client, guest_session)
        headers = {"X-Session-Id": guest_session}
        resp = await client.post(
            f"/api/v1/projects/{pid}/objects",
            json={
                "object_type": "pipe",
                "params": {
                    "outer_diameter": 0.1,
                    "wall_thickness": None,
                    "pipe_material": None,
                    "insulation_layers": [{"thickness": 0.05, "material": MINERAL_WOOL}],
                    "insulation_temperature_basis": "outdoor_winter",
                    "ambient_temperature": -20,
                    "process_temperature": 80,
                    "min_switch_temperature": -20,
                    "pipe_length": 10,
                    "placement": "outdoor",
                    "wind_speed": 0,
                },
            },
            headers=headers,
        )
        assert resp.status_code == 201, resp.text
        body = resp.json()
        assert body["is_valid"] is False
        assert body["results"] is None
        assert body["validation_errors"]["fields"] == {
            "wall_thickness": "Проверьте параметры объекта"
        }
        assert "validation error" not in resp.text
        assert "Input should be" not in resp.text
        objects = await client.get(
            f"/api/v1/projects/{pid}/objects",
            headers=headers,
        )
        assert objects.status_code == 200, objects.text
        assert len(objects.json()) == 1
        assert objects.json()[0]["id"] == body["id"]

    async def test_missing_pipe_fields_return_stable_error_envelope(
        self, client: AsyncClient, guest_session: str
    ):
        pid = await _project(client, guest_session)
        resp = await client.post(
            f"/api/v1/projects/{pid}/objects",
            json={"object_type": "pipe", "params": {}},
            headers={"X-Session-Id": guest_session},
        )

        assert resp.status_code == 201, resp.text
        body = resp.json()
        assert body["is_valid"] is False
        assert body["results"] is None
        assert body["validation_errors"]["missing_fields"] == [
                "outer_diameter",
                "wall_thickness",
                "insulation_layers",
                "process_temperature",
                "pipe_length",
                "placement",
                "min_switch_temperature",
        ]

    async def test_invalid_update_keeps_object_data_and_version(
        self, client: AsyncClient, guest_session: str
    ):
        pid = await _project(client, guest_session)
        headers = {"X-Session-Id": guest_session}
        created_response = await client.post(
            f"/api/v1/projects/{pid}/objects",
            json={
                "object_type": "pipe",
                "params": {
                    "outer_diameter": 0.1,
                    "wall_thickness": 0.004,
                    "pipe_material": "carbon_steel",
                    "insulation_layers": [
                        {"thickness": 0.05, "material": MINERAL_WOOL}
                    ],
                    "insulation_temperature_basis": "outdoor_winter",
                    "ambient_temperature": -20,
                    "process_temperature": 80,
                    "min_switch_temperature": -20,
                    "pipe_length": 10,
                    "placement": "outdoor",
                    "wind_speed": 0,
                },
            },
            headers=headers,
        )
        assert created_response.status_code == 201, created_response.text
        created = created_response.json()

        updated_response = await client.put(
            f"/api/v1/projects/{pid}/objects/{created['id']}",
            json={
                "version": created["version"],
                "params": {**created["params"], "wall_thickness": None},
            },
            headers=headers,
        )

        assert updated_response.status_code == 200, updated_response.text
        updated = updated_response.json()
        assert updated["is_valid"] is False
        assert updated["results"] is None
        assert updated["validation_errors"]["fields"] == {
            "wall_thickness": "Проверьте параметры объекта"
        }
        objects_response = await client.get(
            f"/api/v1/projects/{pid}/objects",
            headers=headers,
        )
        assert objects_response.status_code == 200, objects_response.text
        reloaded = next(
            item for item in objects_response.json() if item["id"] == created["id"]
        )
        assert reloaded["version"] == created["version"] + 1
        assert reloaded["params"]["wall_thickness"] is None

    async def test_non_indoor_pipe_with_indoor_tm_is_invalid(
        self, client: AsyncClient, guest_session: str
    ):
        pid = await _project(client, guest_session)
        resp = await client.post(
            f"/api/v1/projects/{pid}/objects",
            json={
                "object_type": "pipe",
                "params": {
                    "outer_diameter": 0.013,
                    "wall_thickness": 0.0011,
                    "pipe_material": "stainless_304",
                    "pipe_length": 6,
                    "insulation_layers": [{"thickness": 0.02, "material": MINERAL_WOOL}],
                    "insulation_temperature_basis": "indoor",
                    "process_temperature": 1,
                    "min_switch_temperature": -20,
                    "placement": "underground",
                    "pipe_centerline_depth": 0.4,
                    "ground_temperature": 0,
                    "ground_type": "sand_1600_w238",
                    "ground_conductivity": 2.02,
                },
            },
            headers={"X-Session-Id": guest_session},
        )

        assert resp.status_code == 201, resp.text
        body = resp.json()
        assert body["is_valid"] is False
        assert body["results"] is None
        assert body["validation_errors"]["field"] == "insulation_temperature_basis"

    async def test_outdoor_pipe_with_attic_tm_is_invalid(
        self, client: AsyncClient, guest_session: str
    ):
        pid = await _project(client, guest_session)
        resp = await client.post(
            f"/api/v1/projects/{pid}/objects",
            json={
                "object_type": "pipe",
                "params": {
                    "outer_diameter": 0.108,
                    "wall_thickness": 0.004,
                    "pipe_material": "carbon_steel",
                    "pipe_length": 50,
                    "insulation_layers": [{"thickness": 0.05, "material": MINERAL_WOOL}],
                    "insulation_temperature_basis": "attic",
                    "ambient_temperature": -30,
                    "process_temperature": 80,
                    "min_switch_temperature": -20,
                    "placement": "outdoor",
                },
            },
            headers={"X-Session-Id": guest_session},
        )

        assert resp.status_code == 201, resp.text
        body = resp.json()
        assert body["is_valid"] is False
        assert body["results"] is None
        assert body["validation_errors"]["field"] == "insulation_temperature_basis"

    @pytest.mark.parametrize(
        ("shape", "geometry"),
        [
            ("cylindrical", {"diameter": 3.0, "height": 12.0}),
            ("rectangular", {"length": 5.0, "width": 3.0, "height": 4.0}),
        ],
    )
    async def test_add_tank_shapes_trigger_calculation(
        self,
        client: AsyncClient,
        guest_session: str,
        shape: str,
        geometry: dict[str, float],
    ):
        pid = await _project(client, guest_session)
        resp = await client.post(
            f"/api/v1/projects/{pid}/objects",
            json={
                "object_type": "tank",
                "sort_order": 0,
                "params": {
                    "name": f"Резервуар {shape}",
                    "shape": shape,
                    "heating_height": 2.0,
                    "laying_step": 0.2,
                    **geometry,
                    "insulation_layers": [{"thickness": 0.08, "material": MINERAL_WOOL}],
                    "insulation_temperature_basis": "outdoor_winter",
                    "ambient_temperature": -20,
                    "process_temperature": 80,
                    "min_switch_temperature": -20,
                    "placement": "outdoor",
                    "wind_speed": 0,
                },
            },
            headers={"X-Session-Id": guest_session},
        )
        assert resp.status_code == 201, resp.text
        body = resp.json()
        assert body["is_valid"] is True
        assert body["results"]["heat_loss_per_m2_bare_base"] > 0
        assert body["results"]["surface_area_bare"] > 0

    async def test_create_and_update_reject_legacy_spherical_tank_shape(
        self,
        client: AsyncClient,
        guest_session: str,
    ):
        pid = await _project(client, guest_session)
        headers = {"X-Session-Id": guest_session}
        rejected_create = await client.post(
            f"/api/v1/projects/{pid}/objects",
            json={
                "object_type": "tank",
                "params": {
                    "shape": "spherical",
                    "heating_height": 2.0,
                    "laying_step": 0.2,
                    "diameter": 3.0,
                    "insulation_layers": [{"thickness": 0.08, "material": MINERAL_WOOL}],
                    "insulation_temperature_basis": "outdoor_winter",
                    "ambient_temperature": -20,
                    "process_temperature": 80,
                    "min_switch_temperature": -20,
                    "placement": "outdoor",
                    "wind_speed": 0,
                },
            },
            headers=headers,
        )
        assert rejected_create.status_code == 422, rejected_create.text
        assert rejected_create.json()["detail"] == {
            "code": "TANK_SHAPE_UNSUPPORTED",
            "message": (
                "Форма резервуара 'spherical' больше не поддерживается. "
                "Допустимые формы: cylindrical, rectangular."
            ),
            "fields": ["shape"],
        }

        created_response = await client.post(
            f"/api/v1/projects/{pid}/objects",
            json={
                "object_type": "tank",
                "params": {
                    "shape": "cylindrical",
                    "heating_height": 2.0,
                    "laying_step": 0.2,
                    "diameter": 3.0,
                    "height": 5.0,
                    "insulation_layers": [{"thickness": 0.08, "material": MINERAL_WOOL}],
                    "insulation_temperature_basis": "outdoor_winter",
                    "ambient_temperature": -20,
                    "process_temperature": 80,
                    "min_switch_temperature": -20,
                    "placement": "outdoor",
                    "wind_speed": 0,
                },
            },
            headers=headers,
        )
        assert created_response.status_code == 201, created_response.text
        created = created_response.json()

        rejected_update = await client.put(
            f"/api/v1/projects/{pid}/objects/{created['id']}",
            json={
                "version": created["version"],
                "params": {
                    **created["params"],
                    "shape": "spherical",
                    "heating_height": 2.0,
                    "laying_step": 0.2,
                    "height": None,
                },
            },
            headers=headers,
        )
        assert rejected_update.status_code == 422, rejected_update.text
        assert rejected_update.json()["detail"] == rejected_create.json()["detail"]

    async def test_add_large_tank_with_tank_dimensions_is_valid(
        self, client: AsyncClient, guest_session: str
    ):
        pid = await _project(client, guest_session)
        resp = await client.post(
            f"/api/v1/projects/{pid}/objects",
            json={
                "object_type": "tank",
                "params": {
                    "shape": "cylindrical",
                    "heating_height": 2.0,
                    "laying_step": 0.2,
                    "diameter": 12.0,
                    "height": 20.0,
                    "insulation_layers": [{"thickness": 0.1, "material": MINERAL_WOOL}],
                    "insulation_temperature_basis": "outdoor_winter",
                    "ambient_temperature": -20,
                    "process_temperature": 80,
                    "min_switch_temperature": -20,
                    "placement": "outdoor",
                    "wind_speed": 0,
                },
            },
            headers={"X-Session-Id": guest_session},
        )
        assert resp.status_code == 201, resp.text
        assert resp.json()["is_valid"] is True

    async def test_update_object_recalculates(self, client: AsyncClient, guest_session: str):
        pid = await _project(client, guest_session)
        created = (
            await client.post(
                f"/api/v1/projects/{pid}/objects",
                json={
                    "object_type": "pipe",
                    "params": {
                    "outer_diameter": 0.1,
                    "wall_thickness": 0.004,
                    "pipe_material": "carbon_steel",
                    "insulation_layers": [{"thickness": 0.05, "material": MINERAL_WOOL}],
                        "insulation_temperature_basis": "outdoor_winter",
                        "ambient_temperature": -20,
                        "process_temperature": 80,
                        "min_switch_temperature": -20,
                    "pipe_length": 10,
                    "placement": "outdoor",
                    "wind_speed": 0,
                },
                },
                headers={"X-Session-Id": guest_session},
            )
        ).json()
        # Уменьшаем толщину изоляции → теплопотери должны вырасти
        old_q = created["results"]["heat_loss_per_meter_base"]
        resp = await client.put(
            f"/api/v1/projects/{pid}/objects/{created['id']}",
            json={
                "version": created["version"],
                "params": {
                    **created["params"],
                    "insulation_layers": [{"thickness": 0.02, "material": MINERAL_WOOL}],
                },
            },
            headers={"X-Session-Id": guest_session},
        )
        assert resp.status_code == 200
        assert resp.json()["version"] == created["version"] + 1
        new_q = resp.json()["results"]["heat_loss_per_meter_base"]
        assert new_q > old_q

    async def test_update_object_stale_version_returns_conflict(
        self, client: AsyncClient, guest_session: str
    ):
        pid = await _project(client, guest_session)
        headers = {"X-Session-Id": guest_session}
        created_resp = await client.post(
            f"/api/v1/projects/{pid}/objects",
            json={
                "object_type": "pipe",
                "params": {
                    "outer_diameter": 0.1,
                    "wall_thickness": 0.004,
                    "pipe_material": "carbon_steel",
                    "insulation_layers": [{"thickness": 0.05, "material": MINERAL_WOOL}],
                    "insulation_temperature_basis": "outdoor_winter",
                    "ambient_temperature": -20,
                    "process_temperature": 80,
                    "min_switch_temperature": -20,
                    "pipe_length": 10,
                    "placement": "outdoor",
                    "wind_speed": 0,
                },
            },
            headers=headers,
        )
        assert created_resp.status_code == 201, created_resp.text
        created = created_resp.json()

        first_update = await client.put(
            f"/api/v1/projects/{pid}/objects/{created['id']}",
            json={
                "version": created["version"],
                "params": {
                    **created["params"],
                    "insulation_layers": [{"thickness": 0.04, "material": MINERAL_WOOL}]
                },
            },
            headers=headers,
        )
        assert first_update.status_code == 200, first_update.text
        assert first_update.json()["version"] == created["version"] + 1

        stale_update = await client.put(
            f"/api/v1/projects/{pid}/objects/{created['id']}",
            json={
                "version": created["version"],
                "params": {
                    **created["params"],
                    "insulation_layers": [{"thickness": 0.03, "material": MINERAL_WOOL}]
                },
            },
            headers=headers,
        )
        assert stale_update.status_code == 409
        assert stale_update.json()["detail"] == (
            "Объект был изменён в другой вкладке, перезагрузите."
        )

    async def test_reorder_rejects_partial_object_list(
        self, client: AsyncClient, guest_session: str
    ):
        pid = await _project(client, guest_session)
        headers = {"X-Session-Id": guest_session}
        object_ids: list[str] = []
        for idx in range(3):
            resp = await client.post(
                f"/api/v1/projects/{pid}/objects",
                json={
                    "object_type": "pipe",
                    "sort_order": idx,
                    "params": {
                        "name": f"Pipe-{idx}",
                    "outer_diameter": 0.1 + idx * 0.01,
                    "wall_thickness": 0.004,
                    "pipe_material": "carbon_steel",
                    "insulation_layers": [{"thickness": 0.05, "material": MINERAL_WOOL}],
                        "insulation_temperature_basis": "outdoor_winter",
                        "ambient_temperature": -20,
                        "process_temperature": 80,
                        "min_switch_temperature": -20,
                    "pipe_length": 10,
                    "placement": "outdoor",
                    "wind_speed": 0,
                },
                },
                headers=headers,
            )
            assert resp.status_code == 201, resp.text
            object_ids.append(resp.json()["id"])

        resp = await client.put(
            f"/api/v1/projects/{pid}/objects/reorder",
            json={"order": [object_ids[1], object_ids[0]]},
            headers=headers,
        )
        assert resp.status_code == 400
        assert "все объекты проекта" in resp.json()["detail"]

    async def test_invalid_object_marked_invalid(self, client: AsyncClient, guest_session: str):
        pid = await _project(client, guest_session)
        resp = await client.post(
            f"/api/v1/projects/{pid}/objects",
            json={
                "object_type": "pipe",
                "params": {
                    "outer_diameter": 0.1,
                    "wall_thickness": 0.004,
                    "pipe_material": "carbon_steel",
                    "insulation_layers": [{"thickness": 0.05, "material": "unknown_material"}],
                    "insulation_temperature_basis": "outdoor_winter",
                    "ambient_temperature": -20,
                    "process_temperature": 80,
                    "min_switch_temperature": -20,
                    "pipe_length": 10,
                    "placement": "outdoor",
                    "wind_speed": 0,
                },
            },
            headers={"X-Session-Id": guest_session},
        )
        assert resp.status_code == 201
        body = resp.json()
        assert body["is_valid"] is False
        assert body["results"] is None
        assert body["validation_errors"]["fields"] == {
            "insulation_layers.0.material": "Неизвестный материал изоляции: unknown_material"
        }
        assert body["validation_errors"]["field"] == "insulation_layers.0.material"
        assert body["validation_errors"]["message"] == (
            "Неизвестный материал изоляции: unknown_material"
        )

    async def test_pipe_preserves_climate_layers_and_returns_assumptions(
        self, client: AsyncClient, guest_session: str
    ):
        pid = await _project(client, guest_session)
        resp = await client.post(
            f"/api/v1/projects/{pid}/objects",
            json={
                "object_type": "pipe",
                "params": {
                    "name": "Pipe with climate",
                    "outer_diameter": 0.108,
                    "wall_thickness": 0.004,
                    "pipe_material": "carbon_steel",
                    "pipe_length": 35,
                    "insulation_temperature_basis": "outdoor_winter",
                    "insulation_layers": [
                        {"thickness": 0.04, "material": MINERAL_WOOL},
                        {"thickness": 0.02, "material": FOAM_GLASS_ALTERNATIVE},
                        {
                            "thickness": 0.01,
                            "material": "other",
                            "conductivity": 0.061,
                            "temperature_range": [-60, 180],
                        },
                    ],
                    "ambient_temperature": -25,
                    "process_temperature": 80,
                    "min_switch_temperature": -20,
                    "wind_speed": 4.2,
                    "alpha_vnesh": 14.0,
                    "safety_factor": 1.2,
                    "num_local_elements": 3,
                    "local_element_equiv_length": 1.1,
                    "climate_city": "Москва",
                    "climate_region": "Москва",
                    "climate_temperature_basis": "t_0_92",
                    "ambient_temperature_source": "climate",
                    "wind_speed_source": "climate",
                    "placement": "outdoor",
                },
            },
            headers={"X-Session-Id": guest_session},
        )

        assert resp.status_code == 201, resp.text
        body = resp.json()
        assert body["is_valid"] is True
        assert body["params"]["climate_city"] == "Москва"
        assert "alpha_vnesh" not in body["params"]
        assert len(body["params"]["insulation_layers"]) == 3

        results = body["results"]
        assert results["heat_loss_per_meter_base"] > 0
        assert results["total_heat_loss_design"] > 0
        assert results["wall_resistance"] > 0
        assert results["insulation_resistance"] > 0
        assert results["external_resistance"] > 0
        assert results["alpha_vnesh_applied"] == pytest.approx(
            round(11.6 + 7 * math.sqrt(4.2), 3)
        )
        assert results["wind_speed_applied"] == pytest.approx(4.2)
        assert results["safety_factor_applied"] == 1.2
        assert results["local_elements_count_applied"] == 3
        assert results["local_element_equiv_length_applied"] == 1.1

    async def test_backend_overrides_frontend_climate_basis_on_object_recalculate(
        self, client: AsyncClient, guest_session: str
    ):
        pid = await _project(client, guest_session)
        resp = await client.post(
            f"/api/v1/projects/{pid}/objects",
            json={
                "object_type": "pipe",
                "params": {
                    "name": "Pipe with stale frontend climate basis",
                    "outer_diameter": 0.099,
                    "wall_thickness": 0.004,
                    "pipe_material": "carbon_steel",
                    "pipe_length": 35,
                    "insulation_layers": [{"thickness": 0.04, "material": MINERAL_WOOL}],
                    "insulation_temperature_basis": "outdoor_winter",
                    "ambient_temperature": -10,
                    "process_temperature": 80,
                    "min_switch_temperature": -20,
                    "climate_city": "Славгород",
                    "climate_region": "Могилёвская область",
                    "climate_temperature_basis": "t_0_92",
                    "ambient_temperature_source": "climate",
                    "placement": "outdoor",
                    "wind_speed": 0,
                },
            },
            headers={"X-Session-Id": guest_session},
        )

        assert resp.status_code == 201, resp.text
        body = resp.json()
        assert body["is_valid"] is True
        assert body["params"]["climate_temperature_basis"] == "t_abs_min"
        assert body["params"]["ambient_temperature"] == pytest.approx(-48.0)
        assert body["params"]["ambient_temperature_source"] == "climate"
        assert body["params"]["safety_factor"] == pytest.approx(1.12)
        assert body["results"]["safety_factor_applied"] == pytest.approx(1.12)

    async def test_underground_tank_returns_air_ground_split(
        self, client: AsyncClient, guest_session: str
    ):
        pid = await _project(client, guest_session)
        resp = await client.post(
            f"/api/v1/projects/{pid}/objects",
            json={
                "object_type": "tank",
                "params": {
                    "name": "Buried tank",
                    "shape": "cylindrical",
                    "heating_height": 2.0,
                    "laying_step": 0.2,
                    "diameter": 2.0,
                    "height": 4.0,
                    "insulation_layers": [{"thickness": 0.08, "material": MINERAL_WOOL}],
                    "insulation_temperature_basis": "channel",
                    "ambient_temperature": -25,
                    "ground_temperature": 5,
                    "process_temperature": 70,
                    "min_switch_temperature": -20,
                    "placement": "underground",
                    "tank_buried_height": 1.5,
                    "ground_type": "dry_sand",
                    "ground_conductivity": 0.8,
                    "wind_speed": 4.2,
                    "safety_factor": 1.15,
                },
            },
            headers={"X-Session-Id": guest_session},
        )

        assert resp.status_code == 201, resp.text
        body = resp.json()
        assert body["is_valid"] is True
        assert body["params"]["placement"] == "underground"
        assert body["params"]["ground_conductivity"] == 0.8

        results = body["results"]
        assert results["total_heat_loss_design"] > 0
        assert results["air_surface_area"] > 0
        assert results["ground_surface_area"] > 0
        assert results["heat_loss_air_base"] > 0
        assert results["heat_loss_ground_base"] > 0
        assert results["ground_resistance_areal_bare"] > 0
        assert results["ground_conductivity_applied"] == 0.8
        assert results["alpha_vnesh_applied"] == pytest.approx(11.6 + 7 * math.sqrt(4.2))
        assert results["wind_speed_applied"] == pytest.approx(4.2)
        assert results["safety_factor_applied"] == 1.15

    async def test_tank_heat_update_replaces_hidden_heat_fields_and_preserves_volume(
        self, client: AsyncClient, guest_session: str
    ):
        pid = await _project(client, guest_session)
        headers = {"X-Session-Id": guest_session}
        created_response = await client.post(
            f"/api/v1/projects/{pid}/objects",
            json={
                "object_type": "tank",
                "params": {
                    "name": "Canonical tank",
                    "volume": 24.5,
                    "shape": "rectangular",
                    "heating_height": 2.0,
                    "laying_step": 0.2,
                    "length": 4.0,
                    "width": 2.0,
                    "height": 3.0,
                    "insulation_layers": [
                        {"thickness": 0.08, "material": MINERAL_WOOL}
                    ],
                    "insulation_temperature_basis": "channel",
                    "ambient_temperature": -20,
                    "ground_temperature": 5,
                    "process_temperature": 80,
                    "min_switch_temperature": -20,
                    "placement": "underground",
                    "tank_buried_height": 1.0,
                    "ground_type": "dry_sand",
                    "ground_conductivity": 0.8,
                    "wind_speed": 0.0,
                    "safety_factor": 1.15,
                    "q_additional": 100,
                },
            },
            headers=headers,
        )
        assert created_response.status_code == 201, created_response.text
        created = created_response.json()

        updated_response = await client.put(
            f"/api/v1/projects/{pid}/objects/{created['id']}",
            json={
                "version": created["version"],
                "params": {
                    "name": "Canonical tank",
                    "shape": "cylindrical",
                    "heating_height": 2.0,
                    "laying_step": 0.2,
                    "diameter": 2.0,
                    "height": 3.0,
                    "insulation_layers": [
                        {"thickness": 0.06, "material": MINERAL_WOOL}
                    ],
                    "insulation_temperature_basis": "outdoor_winter",
                    "ambient_temperature": -15,
                    "process_temperature": 75,
                    "min_switch_temperature": -20,
                    "placement": "outdoor",
                    "wind_speed": 0,
                    "safety_factor": 1.1,
                    "q_additional": 0,
                },
            },
            headers=headers,
        )

        assert updated_response.status_code == 200, updated_response.text
        body = updated_response.json()
        params = body["params"]
        assert params["q_additional"] == 0
        assert params["volume"] == pytest.approx(24.5)
        assert params["shape"] == "cylindrical"
        for removed in (
            "length",
            "width",
            "tank_buried_height",
            "ground_temperature",
            "ground_type",
            "ground_conductivity",
        ):
            assert removed not in params
        assert body["results"]["q_additional_applied"] == 0
        assert body["results"]["total_heat_loss_design"] == pytest.approx(
            body["results"]["total_heat_loss_base"] * 1.1
        )
