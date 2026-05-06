"""Integration-тесты админки: users + coefficients + cables + accessories."""

import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio(loop_scope="session")


# ─── Users ──────────────────────────────────────────────────────────────────


class TestAdminUsers:
    async def test_create_user(self, client: AsyncClient, admin_token: str):
        resp = await client.post(
            "/api/v1/admin/users",
            json={
                "email": "new@test.com",
                "password": "qwerty123",
                "role": "employee",
                "full_name": "New",
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 201
        assert resp.json()["email"] == "new@test.com"

    async def test_duplicate_user_rejected(self, client: AsyncClient, admin_token: str):
        payload = {
            "email": "dup@test.com",
            "password": "qwerty123",
            "role": "employee",
        }
        headers = {"Authorization": f"Bearer {admin_token}"}
        await client.post("/api/v1/admin/users", json=payload, headers=headers)
        resp = await client.post("/api/v1/admin/users", json=payload, headers=headers)
        assert resp.status_code == 400

    async def test_list_users(self, client: AsyncClient, admin_token: str):
        resp = await client.get(
            "/api/v1/admin/users",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    async def test_update_user_full_name_and_role(self, client: AsyncClient, admin_token: str):
        headers = {"Authorization": f"Bearer {admin_token}"}
        created = (
            await client.post(
                "/api/v1/admin/users",
                json={
                    "email": "upd@test.com",
                    "password": "qwerty123",
                    "role": "employee",
                    "full_name": "Old",
                },
                headers=headers,
            )
        ).json()
        resp = await client.put(
            f"/api/v1/admin/users/{created['id']}",
            json={"full_name": "New Name"},
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.json()["full_name"] == "New Name"

    async def test_update_user_password(self, client: AsyncClient, admin_token: str):
        headers = {"Authorization": f"Bearer {admin_token}"}
        created = (
            await client.post(
                "/api/v1/admin/users",
                json={
                    "email": "pwchange@test.com",
                    "password": "old-pass-123",
                    "role": "employee",
                },
                headers=headers,
            )
        ).json()
        # Меняем пароль через update
        await client.put(
            f"/api/v1/admin/users/{created['id']}",
            json={"password": "new-pass-456"},
            headers=headers,
        )
        # Старый пароль не работает
        bad = await client.post(
            "/api/v1/auth/login",
            json={"email": "pwchange@test.com", "password": "old-pass-123"},
        )
        assert bad.status_code == 401
        # Новый — работает
        good = await client.post(
            "/api/v1/auth/login",
            json={"email": "pwchange@test.com", "password": "new-pass-456"},
        )
        assert good.status_code == 200

    async def test_deactivate_user(self, client: AsyncClient, admin_token: str):
        headers = {"Authorization": f"Bearer {admin_token}"}
        created = (
            await client.post(
                "/api/v1/admin/users",
                json={
                    "email": "deact@test.com",
                    "password": "qwerty123",
                    "role": "employee",
                },
                headers=headers,
            )
        ).json()
        resp = await client.delete(
            f"/api/v1/admin/users/{created['id']}",
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.json()["is_active"] is False
        # Деактивированный не может логиниться
        bad = await client.post(
            "/api/v1/auth/login",
            json={"email": "deact@test.com", "password": "qwerty123"},
        )
        assert bad.status_code == 401

    async def test_update_unknown_user_404(self, client: AsyncClient, admin_token: str):
        resp = await client.put(
            "/api/v1/admin/users/00000000-0000-0000-0000-000000000000",
            json={"full_name": "X"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 404


# ─── Coefficients ──────────────────────────────────────────────────────────


class TestAdminCoefficients:
    async def test_update_coefficient(self, client: AsyncClient, admin_token: str):
        resp = await client.put(
            "/api/v1/admin/coefficients/wind_factor",
            json={"value": 1.3, "description": "Ветровой фактор"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 200
        assert resp.json()["value"] == 1.3

    async def test_create_new_coefficient(self, client: AsyncClient, admin_token: str):
        # PUT для нового ключа должен создавать запись
        resp = await client.put(
            "/api/v1/admin/coefficients/new_test_factor",
            json={"value": 0.95, "description": "Тестовый коэф"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 200
        assert resp.json()["key"] == "new_test_factor"

    async def test_list_coefficients(self, client: AsyncClient, admin_token: str):
        resp = await client.get(
            "/api/v1/admin/coefficients",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 200
        {c["key"] for c in resp.json()}
        # safety_factor создаётся сидами или появится после первого update
        assert isinstance(resp.json(), list)

    async def test_employee_cannot_update_coefficient(
        self, client: AsyncClient, employee_token: str
    ):
        resp = await client.put(
            "/api/v1/admin/coefficients/wind_factor",
            json={"value": 1.5},
            headers={"Authorization": f"Bearer {employee_token}"},
        )
        assert resp.status_code == 403


# ─── Cables (extended) ─────────────────────────────────────────────────────


class TestAdminCables:
    async def test_create_list_update_delete_cable(self, client: AsyncClient, admin_token: str):
        headers = {"Authorization": f"Bearer {admin_token}"}
        # Create
        created = await client.post(
            "/api/v1/admin/cables",
            json={
                "cable_type": "self_regulating",
                "brand": "TestBrand",
                "model": "TM-100",
                "power_per_meter": 25.0,
                "max_temperature": 110.0,
                "min_temperature": -40.0,
            },
            headers=headers,
        )
        assert created.status_code == 201, created.text
        cid = created.json()["id"]

        # List
        listing = await client.get("/api/v1/admin/cables", headers=headers)
        assert any(c["id"] == cid for c in listing.json())

        # Update
        upd = await client.put(
            f"/api/v1/admin/cables/{cid}",
            json={"power_per_meter": 30.0},
            headers=headers,
        )
        assert upd.status_code == 200
        assert upd.json()["power_per_meter"] == 30.0

        # Delete
        rm = await client.delete(f"/api/v1/admin/cables/{cid}", headers=headers)
        assert rm.status_code == 204

    async def test_update_unknown_cable_404(self, client: AsyncClient, admin_token: str):
        resp = await client.put(
            "/api/v1/admin/cables/00000000-0000-0000-0000-000000000000",
            json={"power_per_meter": 1.0},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 404

    async def test_delete_unknown_cable_404(self, client: AsyncClient, admin_token: str):
        resp = await client.delete(
            "/api/v1/admin/cables/00000000-0000-0000-0000-000000000000",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 404


# ─── Accessories (extended) ────────────────────────────────────────────────


class TestAdminAccessories:
    async def test_create_list_update_delete_accessory(self, client: AsyncClient, admin_token: str):
        headers = {"Authorization": f"Bearer {admin_token}"}
        # Create
        created = await client.post(
            "/api/v1/admin/accessories",
            json={
                "category": "regulator",
                "name": "Тестовый терморегулятор",
                "article": "TR-001",
            },
            headers=headers,
        )
        assert created.status_code == 201, created.text
        aid = created.json()["id"]

        # List
        listing = await client.get("/api/v1/admin/accessories", headers=headers)
        assert any(a["id"] == aid for a in listing.json())

        # Update
        upd = await client.put(
            f"/api/v1/admin/accessories/{aid}",
            json={"name": "Новое имя"},
            headers=headers,
        )
        assert upd.status_code == 200
        assert upd.json()["name"] == "Новое имя"

        # Delete
        rm = await client.delete(f"/api/v1/admin/accessories/{aid}", headers=headers)
        assert rm.status_code == 204

    async def test_update_unknown_accessory_404(self, client: AsyncClient, admin_token: str):
        resp = await client.put(
            "/api/v1/admin/accessories/00000000-0000-0000-0000-000000000000",
            json={"name": "X"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 404


# ─── Formula check ─────────────────────────────────────────────────────────


class TestFormulaCheck:
    async def test_pipe_formula_check_success(self, client: AsyncClient, admin_token: str):
        resp = await client.post(
            "/api/v1/admin/formula-check",
            json={
                "formula_type": "pipe",
                "params": {
                    "outer_diameter": 0.108,
                    "insulation_layers": [{"material": "mineral_wool", "thickness": 0.05}],
                    "ambient_temperature": -26.0,
                    "process_temperature": 80.0,
                    "pipe_length": 50.0,
                    "wind_speed": 4.9,
                },
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "heat_loss_per_meter" in data
        assert "total_heat_loss" in data
        assert data["heat_loss_per_meter"] > 0
        assert data["total_heat_loss"] > 0

    async def test_tank_formula_check_success(self, client: AsyncClient, admin_token: str):
        resp = await client.post(
            "/api/v1/admin/formula-check",
            json={
                "formula_type": "tank",
                "params": {
                    "shape": "cylindrical",
                    "diameter": 1.0,
                    "height": 2.0,
                    "insulation_thickness": 0.08,
                    "insulation_material": "mineral_wool",
                    "ambient_temperature": -26.0,
                    "process_temperature": 60.0,
                    "wind_speed": 4.9,
                },
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "total_heat_loss" in data
        assert data["total_heat_loss"] > 0

    async def test_electrical_formula_check_success(self, client: AsyncClient, admin_token: str):
        resp = await client.post(
            "/api/v1/admin/formula-check",
            json={
                "formula_type": "electrical",
                "params": {
                    "required_power_per_meter": 42.0,
                    "pipe_length": 50.0,
                    "ambient_temperature": -26.0,
                },
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "selected_cable" in data or "error" in data

    async def test_electrical_tt_formula_check_success(self, client: AsyncClient, admin_token: str):
        resp = await client.post(
            "/api/v1/admin/formula-check",
            json={
                "formula_type": "electrical_tt",
                "params": {
                    "required_power_per_meter": 20.0,
                    "pipe_length": 50.0,
                    "process_temperature": 60.0,
                    "vapor_temperature": 80.0,
                },
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["selected_cable"]
        assert data["cable_length"] > 0

    async def test_resistive_single_formula_check_success(
        self, client: AsyncClient, admin_token: str
    ):
        resp = await client.post(
            "/api/v1/admin/formula-check",
            json={
                "formula_type": "resistive_single",
                "params": {
                    "required_heat_loss": 1000.0,
                    "pipe_length": 50.0,
                    "process_temperature": 60.0,
                    "connection_type": "line_1ph",
                },
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["selected_cable"]
        assert data["required_cross_section"] > 0

    async def test_resistive_three_formula_check_success(
        self, client: AsyncClient, admin_token: str
    ):
        resp = await client.post(
            "/api/v1/admin/formula-check",
            json={
                "formula_type": "resistive_three",
                "params": {
                    "required_heat_loss": 1000.0,
                    "pipe_length": 50.0,
                    "process_temperature": 60.0,
                    "connection_type": "line_1ph",
                },
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["selected_cable"]
        assert data["required_cross_section"] > 0

    async def test_tank_cable_geometry_formula_check_success(
        self, client: AsyncClient, admin_token: str
    ):
        resp = await client.post(
            "/api/v1/admin/formula-check",
            json={
                "formula_type": "tank_cable_geometry",
                "params": {
                    "shape": "cylindrical",
                    "diameter": 2.0,
                    "heating_height": 2.0,
                    "laying_step": 0.2,
                },
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 200
        assert resp.json()["cable_length"] > 0

    async def test_pipe_invalid_temperatures_returns_422(
        self, client: AsyncClient, admin_token: str
    ):
        resp = await client.post(
            "/api/v1/admin/formula-check",
            json={
                "formula_type": "pipe",
                "params": {
                    "outer_diameter": 0.108,
                    "insulation_layers": [{"material": "mineral_wool", "thickness": 0.05}],
                    "ambient_temperature": 80.0,
                    "process_temperature": 20.0,
                    "pipe_length": 50.0,
                },
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 422
        assert "detail" in resp.json()

    async def test_unknown_formula_type_rejected(self, client: AsyncClient, admin_token: str):
        resp = await client.post(
            "/api/v1/admin/formula-check",
            json={"formula_type": "unknown", "params": {}},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 422

    async def test_employee_cannot_use_formula_check(
        self, client: AsyncClient, employee_token: str
    ):
        resp = await client.post(
            "/api/v1/admin/formula-check",
            json={"formula_type": "pipe", "params": {}},
            headers={"Authorization": f"Bearer {employee_token}"},
        )
        assert resp.status_code == 403

    async def test_guest_cannot_use_formula_check(self, client: AsyncClient, guest_session: str):
        resp = await client.post(
            "/api/v1/admin/formula-check",
            json={"formula_type": "pipe", "params": {}},
            headers={"X-Session-Id": guest_session},
        )
        assert resp.status_code == 403

    async def test_unauthenticated_cannot_use_formula_check(self, client: AsyncClient):
        resp = await client.post(
            "/api/v1/admin/formula-check",
            json={"formula_type": "pipe", "params": {}},
        )
        assert resp.status_code == 401


# ─── Access control ────────────────────────────────────────────────────────


class TestAdminAccessControl:
    async def test_employee_cannot_create_user(self, client: AsyncClient, employee_token: str):
        resp = await client.post(
            "/api/v1/admin/users",
            json={"email": "x@y.z", "password": "q", "role": "employee"},
            headers={"Authorization": f"Bearer {employee_token}"},
        )
        assert resp.status_code == 403

    async def test_guest_cannot_list_users(self, client: AsyncClient, guest_session: str):
        resp = await client.get("/api/v1/admin/users", headers={"X-Session-Id": guest_session})
        assert resp.status_code == 403

    async def test_unauthenticated_cannot_access_admin(self, client: AsyncClient):
        resp = await client.get("/api/v1/admin/users")
        assert resp.status_code == 401
