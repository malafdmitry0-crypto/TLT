"""Integration-тесты объектов проекта с автопересчётом."""

import pytest
from httpx import AsyncClient

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
    async def test_add_object_triggers_calculation(self, client: AsyncClient, guest_session: str):
        pid = await _project(client, guest_session)
        resp = await client.post(
            f"/api/v1/projects/{pid}/objects",
            json={
                "object_type": "pipe",
                "sort_order": 0,
                "params": {
                    "outer_diameter": 0.1,
                    "insulation_thickness": 0.05,
                    "insulation_material": MINERAL_WOOL,
                    "insulation_temperature_basis": "outdoor_winter",
                    "ambient_temperature": -20,
                    "process_temperature": 80,
                    "pipe_length": 10,
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
        assert body["params"]["supply_voltage"] == 220
        assert body["params"]["safety_factor"] == pytest.approx(1.1)
        assert body["params"]["valve_count"] == 2
        assert body["params"]["flange_count"] == 2
        assert body["params"]["support_count"] == 2
        assert body["params"]["num_local_elements"] == 6
        assert body["params"]["insulation_layers"] == [
            {"thickness": 0.05, "material": MINERAL_WOOL}
        ]
        assert body["results"]["safety_factor"] == pytest.approx(1.1)
        assert body["results"]["heat_loss_per_meter"] > 0

    async def test_pipe_local_element_named_counts_are_used(
        self, client: AsyncClient, guest_session: str
    ):
        pid = await _project(client, guest_session)
        resp = await client.post(
            f"/api/v1/projects/{pid}/objects",
            json={
                "object_type": "pipe",
                "params": {
                    "outer_diameter": 0.1,
                    "insulation_thickness": 0.05,
                    "insulation_material": MINERAL_WOOL,
                    "insulation_temperature_basis": "outdoor_winter",
                    "ambient_temperature": -20,
                    "process_temperature": 80,
                    "pipe_length": 10,
                    "valve_count": 1,
                    "flange_count": 2,
                    "support_count": 3,
                    "local_element_equiv_length": 1.1,
                },
            },
            headers={"X-Session-Id": guest_session},
        )
        assert resp.status_code == 201, resp.text
        body = resp.json()
        assert body["is_valid"] is True
        assert body["params"]["valve_count"] == 1
        assert body["params"]["flange_count"] == 2
        assert body["params"]["support_count"] == 3
        assert body["params"]["num_local_elements"] == 6
        assert body["results"]["local_elements_count"] == 6
        assert body["results"]["local_element_equiv_length"] == pytest.approx(1.1)

    async def test_blank_required_pipe_fields_mark_object_invalid(
        self, client: AsyncClient, guest_session: str
    ):
        pid = await _project(client, guest_session)
        resp = await client.post(
            f"/api/v1/projects/{pid}/objects",
            json={
                "object_type": "pipe",
                "params": {
                    "outer_diameter": 0.1,
                    "wall_thickness": None,
                    "pipe_material": None,
                    "insulation_thickness": 0.05,
                    "insulation_material": MINERAL_WOOL,
                    "insulation_temperature_basis": "outdoor_winter",
                    "ambient_temperature": -20,
                    "process_temperature": 80,
                    "pipe_length": 10,
                },
            },
            headers={"X-Session-Id": guest_session},
        )
        assert resp.status_code == 201, resp.text
        body = resp.json()
        assert body["is_valid"] is False
        assert body["results"] is None
        assert body["validation_errors"]["error_code"] == "missing_required_fields"
        assert body["validation_errors"]["category"] == "validation"
        assert "error" not in body["validation_errors"]
        assert "Толщина стенки" in body["validation_errors"]["message"]
        assert "Материал трубы или λ трубы" in body["validation_errors"]["message"]

    @pytest.mark.parametrize(
        ("shape", "geometry"),
        [
            ("cylindrical", {"diameter": 3.0, "height": 12.0}),
            ("rectangular", {"length": 5.0, "width": 3.0, "height": 4.0}),
            ("spherical", {"diameter": 3.0}),
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
                    **geometry,
                    "insulation_thickness": 0.08,
                    "insulation_material": MINERAL_WOOL,
                    "insulation_temperature_basis": "outdoor_winter",
                    "ambient_temperature": -20,
                    "process_temperature": 80,
                },
            },
            headers={"X-Session-Id": guest_session},
        )
        assert resp.status_code == 201, resp.text
        body = resp.json()
        assert body["is_valid"] is True
        assert body["results"]["heat_loss_per_m2"] > 0
        assert body["results"]["surface_area"] > 0

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
                    "diameter": 12.0,
                    "height": 20.0,
                    "insulation_thickness": 0.1,
                    "insulation_material": MINERAL_WOOL,
                    "insulation_temperature_basis": "outdoor_winter",
                    "ambient_temperature": -20,
                    "process_temperature": 80,
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
                        "insulation_thickness": 0.05,
                        "insulation_material": MINERAL_WOOL,
                        "insulation_temperature_basis": "outdoor_winter",
                        "ambient_temperature": -20,
                        "process_temperature": 80,
                        "pipe_length": 10,
                    },
                },
                headers={"X-Session-Id": guest_session},
            )
        ).json()
        # Уменьшаем толщину изоляции → теплопотери должны вырасти
        old_q = created["results"]["heat_loss_per_meter"]
        resp = await client.put(
            f"/api/v1/projects/{pid}/objects/{created['id']}",
            json={
                "version": created["version"],
                "params": {
                    **created["params"],
                    "insulation_thickness": 0.02,
                },
            },
            headers={"X-Session-Id": guest_session},
        )
        assert resp.status_code == 200
        assert resp.json()["version"] == created["version"] + 1
        new_q = resp.json()["results"]["heat_loss_per_meter"]
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
                    "insulation_thickness": 0.05,
                    "insulation_material": MINERAL_WOOL,
                    "insulation_temperature_basis": "outdoor_winter",
                    "ambient_temperature": -20,
                    "process_temperature": 80,
                    "pipe_length": 10,
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
                "params": {"insulation_thickness": 0.04},
            },
            headers=headers,
        )
        assert first_update.status_code == 200, first_update.text
        assert first_update.json()["version"] == created["version"] + 1

        stale_update = await client.put(
            f"/api/v1/projects/{pid}/objects/{created['id']}",
            json={
                "version": created["version"],
                "params": {"insulation_thickness": 0.03},
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
                        "insulation_thickness": 0.05,
                        "insulation_material": MINERAL_WOOL,
                        "insulation_temperature_basis": "outdoor_winter",
                        "ambient_temperature": -20,
                        "process_temperature": 80,
                        "pipe_length": 10,
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
                    "insulation_thickness": 0.05,
                    "insulation_material": "unknown_material",
                    "insulation_temperature_basis": "outdoor_winter",
                    "ambient_temperature": -20,
                    "process_temperature": 80,
                    "pipe_length": 10,
                },
            },
            headers={"X-Session-Id": guest_session},
        )
        assert resp.status_code == 201
        body = resp.json()
        assert body["is_valid"] is False
        assert body["validation_errors"] is not None

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
                    "insulation_thickness": 0.04,
                    "insulation_material": MINERAL_WOOL,
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
                    "insulation_layer_count": "3",
                    "ambient_temperature": -25,
                    "process_temperature": 80,
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
                },
            },
            headers={"X-Session-Id": guest_session},
        )

        assert resp.status_code == 201, resp.text
        body = resp.json()
        assert body["is_valid"] is True
        assert body["params"]["climate_city"] == "Москва"
        assert body["params"]["insulation_layer_count"] == "3"
        assert len(body["params"]["insulation_layers"]) == 3

        results = body["results"]
        assert results["heat_loss_per_meter"] > 0
        assert results["total_heat_loss"] > 0
        assert results["wall_resistance"] > 0
        assert results["insulation_resistance"] > 0
        assert results["external_resistance"] > 0
        assert results["alpha_vnesh"] == 14.0
        assert results["wind_speed"] == 4.2
        assert results["safety_factor"] == 1.2
        assert results["local_elements_count"] == 3
        assert results["local_element_equiv_length"] == 1.1

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
                    "pipe_length": 35,
                    "insulation_thickness": 0.04,
                    "insulation_material": MINERAL_WOOL,
                    "insulation_temperature_basis": "outdoor_winter",
                    "ambient_temperature": -10,
                    "process_temperature": 80,
                    "climate_city": "Славгород",
                    "climate_region": "Могилёвская область",
                    "climate_temperature_basis": "t_0_92",
                    "ambient_temperature_source": "climate",
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
        assert body["results"]["safety_factor"] == pytest.approx(1.12)

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
                    "diameter": 2.0,
                    "height": 4.0,
                    "insulation_thickness": 0.08,
                    "insulation_material": MINERAL_WOOL,
                    "insulation_temperature_basis": "outdoor_winter",
                    "ambient_temperature": -25,
                    "process_temperature": 70,
                    "placement": "underground",
                    "burial_depth": 1.5,
                    "ground_type": "dry_sand",
                    "ground_conductivity": 0.8,
                    "wind_speed": 4.2,
                    "alpha_vnesh": 12.0,
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
        assert results["total_heat_loss"] > 0
        assert results["air_surface_area"] > 0
        assert results["ground_surface_area"] > 0
        assert results["heat_loss_air_per_m2"] > 0
        assert results["heat_loss_ground_per_m2"] > 0
        assert results["ground_resistance"] > 0
        assert results["ground_conductivity"] == 0.8
        assert results["alpha_vnesh"] == 12.0
        assert results["safety_factor"] == 1.15
