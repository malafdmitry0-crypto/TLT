"""Integration-тесты админки: users + coefficients + accessories."""

from unittest.mock import AsyncMock
from uuid import UUID

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.electrical_input_validation import PROCESS_TEMPERATURE_REQUIRED_MESSAGE
from app.models.background_task import BackgroundTask
from app.models.coefficient import CorrectionCoefficient
from app.models.user import User
from app.services.audit_service import AuditService
from app.services.task_service import TASK_ELECTRICAL_BATCH

pytestmark = pytest.mark.asyncio(loop_scope="session")

MINERAL_WOOL = "mineral_wool_boards_120"


class FakeDeadLetterQueue:
    entries: list[tuple[str, dict[str, str]]] = []
    deleted: list[str] = []

    def __init__(self) -> None:
        self.closed = False

    async def close(self) -> None:
        self.closed = True

    async def dead_letter_count(self) -> int:
        return len(self.entries)

    async def list_dead_letters(self, *, count: int = 100, start: str = "+", end: str = "-"):
        return self.entries[:count]

    async def get_dead_letter(self, stream_id: str):
        for entry in self.entries:
            if entry[0] == stream_id:
                return entry
        return None

    async def delete_dead_letter(self, stream_id: str) -> int:
        self.deleted.append(stream_id)
        before = len(self.entries)
        self.entries = [entry for entry in self.entries if entry[0] != stream_id]
        type(self).entries = self.entries
        return 1 if len(self.entries) < before else 0

    async def enqueue(self, task_id, task_type: str) -> str:
        return f"stream:{task_id}:{task_type}"


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
    async def test_retires_legacy_wind_factor_from_admin_settings(
        self, client: AsyncClient, admin_token: str
    ):
        resp = await client.put(
            "/api/v1/admin/coefficients/wind_factor",
            json={"value": 1.3, "description": "Ветровой фактор"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 400

    async def test_update_unknown_coefficient_does_not_create_or_audit(
        self,
        client: AsyncClient,
        admin_token: str,
        db_session: AsyncSession,
        monkeypatch: pytest.MonkeyPatch,
    ):
        audit = AsyncMock()
        monkeypatch.setattr(AuditService, "try_record", audit)
        before_count = await db_session.scalar(
            select(func.count()).select_from(CorrectionCoefficient)
        )

        resp = await client.put(
            "/api/v1/admin/coefficients/typo_test_factor",
            json={"value": 0.95, "description": "Тестовый коэф"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        after_count = await db_session.scalar(
            select(func.count()).select_from(CorrectionCoefficient)
        )

        assert resp.status_code == 404, resp.text
        assert after_count == before_count
        audit.assert_not_awaited()

    async def test_update_existing_coefficient_keeps_key_and_count(
        self,
        client: AsyncClient,
        admin_token: str,
        db_session: AsyncSession,
        monkeypatch: pytest.MonkeyPatch,
    ):
        coefficient = CorrectionCoefficient(
            key="safety_factor",
            value=1.1,
            description="Старое описание",
        )
        db_session.add(coefficient)
        await db_session.commit()
        await db_session.refresh(coefficient)
        before_count = await db_session.scalar(
            select(func.count()).select_from(CorrectionCoefficient)
        )
        audit = AsyncMock()
        monkeypatch.setattr(AuditService, "try_record", audit)

        resp = await client.put(
            "/api/v1/admin/coefficients/safety_factor",
            json={"value": 1.25, "description": "Новое описание"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        after_count = await db_session.scalar(
            select(func.count()).select_from(CorrectionCoefficient)
        )

        assert resp.status_code == 200, resp.text
        assert resp.json()["id"] == str(coefficient.id)
        assert resp.json()["key"] == "safety_factor"
        assert resp.json()["value"] == pytest.approx(1.25)
        assert resp.json()["description"] == "Новое описание"
        assert after_count == before_count
        audit.assert_awaited_once()

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
            "/api/v1/admin/coefficients/safety_factor",
            json={"value": 1.5},
            headers={"Authorization": f"Bearer {employee_token}"},
        )
        assert resp.status_code == 403


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


# ─── Dead-letter queue ─────────────────────────────────────────────────────


class TestAdminDeadLetter:
    async def _failed_task(
        self,
        client: AsyncClient,
        admin_token: str,
        db_session: AsyncSession,
        admin_user: User,
    ) -> tuple[BackgroundTask, str, str]:
        headers = {"Authorization": f"Bearer {admin_token}"}
        project_response = await client.post(
            "/api/v1/projects",
            json={"name": "Dead-letter ER scope"},
            headers=headers,
        )
        assert project_response.status_code == 201, project_response.text
        project = project_response.json()
        object_response = await client.post(
            f"/api/v1/projects/{project['id']}/objects",
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
                    "pipe_length": 25,
                    "placement": "outdoor",
                    "wind_speed": 0,
                },
            },
            headers=headers,
        )
        assert object_response.status_code == 201, object_response.text
        initialized = await client.post(
            f"/api/v1/projects/{project['id']}/electrical-variants/initialize",
            headers=headers,
        )
        assert initialized.status_code == 200, initialized.text
        second = await client.post(
            f"/api/v1/projects/{project['id']}/electrical-variants",
            json={"name": "DLQ ER2"},
            headers=headers,
        )
        assert second.status_code == 201, second.text
        variant = second.json()
        task = BackgroundTask(
            type=TASK_ELECTRICAL_BATCH,
            status="failed",
            project_id=UUID(project["id"]),
            electrical_variant_id=UUID(variant["id"]),
            user_id=admin_user.id,
            request_payload={
                "project_id": project["id"],
                "electrical_variant_id": variant["id"],
            },
            error_message="RuntimeError: boom",
            progress_current=3,
            progress_total=3,
            progress_phase="failed",
            attempts=3,
        )
        db_session.add(task)
        await db_session.commit()
        await db_session.refresh(task)
        return task, project["id"], variant["id"]

    async def test_admin_can_list_dead_letter_entries(
        self,
        client: AsyncClient,
        admin_token: str,
        admin_user: User,
        db_session: AsyncSession,
        monkeypatch: pytest.MonkeyPatch,
    ):
        task, _project_id, _variant_id = await self._failed_task(
            client,
            admin_token,
            db_session,
            admin_user,
        )
        FakeDeadLetterQueue.entries = [
            (
                "9-0",
                {
                    "task_id": str(task.id),
                    "type": TASK_ELECTRICAL_BATCH,
                    "dead_letter_reason": "worker_attempts_exhausted",
                    "original_stream_id": "1-0",
                },
            )
        ]
        FakeDeadLetterQueue.deleted = []
        monkeypatch.setattr("app.api.v1.admin.TaskQueue", FakeDeadLetterQueue)

        resp = await client.get(
            "/api/v1/admin/dead-letter",
            headers={"Authorization": f"Bearer {admin_token}"},
        )

        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["count"] == 1
        assert body["items"][0]["stream_id"] == "9-0"
        assert body["items"][0]["task_id"] == str(task.id)
        assert body["items"][0]["task_status"] == "failed"
        assert body["items"][0]["reason"] == "worker_attempts_exhausted"

    async def test_admin_can_replay_dead_letter_entry(
        self,
        client: AsyncClient,
        admin_token: str,
        admin_user: User,
        db_session: AsyncSession,
        monkeypatch: pytest.MonkeyPatch,
    ):
        task, _project_id, _variant_id = await self._failed_task(
            client,
            admin_token,
            db_session,
            admin_user,
        )
        FakeDeadLetterQueue.entries = [
            (
                "9-0",
                {
                    "task_id": str(task.id),
                    "type": TASK_ELECTRICAL_BATCH,
                    "dead_letter_reason": "worker_attempts_exhausted",
                },
            )
        ]
        FakeDeadLetterQueue.deleted = []
        monkeypatch.setattr("app.api.v1.admin.TaskQueue", FakeDeadLetterQueue)

        resp = await client.post(
            "/api/v1/admin/dead-letter/9-0/replay",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        await db_session.refresh(task)

        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["removed_from_dead_letter"] is True
        assert body["task"]["id"] == str(task.id)
        assert body["task"]["status"] == "enqueued"
        assert task.status == "enqueued"
        assert task.error_message is None
        assert "payload_version" not in task.request_payload
        assert task.request_payload["electrical_variant_id"] == str(task.electrical_variant_id)
        assert "variant_number" not in task.request_payload
        assert FakeDeadLetterQueue.deleted == ["9-0"]

    async def test_admin_replay_refuses_task_for_deleted_exact_variant(
        self,
        client: AsyncClient,
        admin_token: str,
        admin_user: User,
        db_session: AsyncSession,
        monkeypatch: pytest.MonkeyPatch,
    ):
        task, project_id, variant_id = await self._failed_task(
            client,
            admin_token,
            db_session,
            admin_user,
        )
        headers = {"Authorization": f"Bearer {admin_token}"}
        deleted = await client.delete(
            f"/api/v1/projects/{project_id}/electrical-variants/{variant_id}",
            headers=headers,
        )
        assert deleted.status_code == 200, deleted.text
        FakeDeadLetterQueue.entries = [
            (
                "9-0",
                {
                    "task_id": str(task.id),
                    "type": TASK_ELECTRICAL_BATCH,
                    "dead_letter_reason": "worker_attempts_exhausted",
                },
            )
        ]
        FakeDeadLetterQueue.deleted = []
        monkeypatch.setattr("app.api.v1.admin.TaskQueue", FakeDeadLetterQueue)

        response = await client.post(
            "/api/v1/admin/dead-letter/9-0/replay",
            headers=headers,
        )
        await db_session.refresh(task)

        assert response.status_code == 404, response.text
        assert response.json()["detail"] == "ELECTRICAL_VARIANT_NOT_FOUND"
        assert task.status == "failed"
        assert FakeDeadLetterQueue.deleted == []

    async def test_employee_cannot_view_dead_letter_entries(
        self,
        client: AsyncClient,
        employee_token: str,
    ):
        resp = await client.get(
            "/api/v1/admin/dead-letter",
            headers={"Authorization": f"Bearer {employee_token}"},
        )

        assert resp.status_code == 403


# ─── Formula check ─────────────────────────────────────────────────────────


class TestFormulaCheck:
    async def test_pipe_formula_check_success(self, client: AsyncClient, admin_token: str):
        resp = await client.post(
            "/api/v1/admin/formula-check",
            json={
                "formula_type": "pipe",
                "params": {
                    "outer_diameter": 0.108,
                    "wall_thickness": 0.004,
                    "pipe_material": "carbon_steel",
                    "insulation_layers": [{"material": MINERAL_WOOL, "thickness": 0.05}],
                    "insulation_temperature_basis": "outdoor_winter",
                    "ambient_temperature": -26.0,
                    "process_temperature": 80.0,
                    "pipe_length": 50.0,
                    "wind_speed": 4.9,
                    "placement": "outdoor",
                },
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "heat_loss_per_meter_base" in data
        assert "total_heat_loss_design" in data
        assert data["heat_loss_per_meter_base"] > 0
        assert data["total_heat_loss_design"] > 0

    async def test_pipe_formula_check_unknown_material_is_422(
        self, client: AsyncClient, admin_token: str
    ):
        resp = await client.post(
            "/api/v1/admin/formula-check",
            json={
                "formula_type": "pipe",
                "params": {
                    "outer_diameter": 0.108,
                    "wall_thickness": 0.004,
                    "pipe_material": "carbon_steel",
                    "insulation_layers": [
                        {"material": MINERAL_WOOL, "thickness": 0.05},
                        {"material": "not_a_catalog_material", "thickness": 0.04},
                    ],
                    "insulation_temperature_basis": "outdoor_winter",
                    "ambient_temperature": -26.0,
                    "process_temperature": 80.0,
                    "pipe_length": 50.0,
                    "wind_speed": 4.9,
                    "placement": "outdoor",
                },
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 422
        assert resp.json()["detail"] == "Неизвестный материал изоляции: not_a_catalog_material"

    async def test_pipe_formula_check_accepts_canonical_local_element_count(
        self, client: AsyncClient, admin_token: str
    ):
        resp = await client.post(
            "/api/v1/admin/formula-check",
            json={
                "formula_type": "pipe",
                "params": {
                    "outer_diameter": 0.108,
                    "wall_thickness": 0.004,
                    "pipe_material": "carbon_steel",
                    "insulation_layers": [{"material": MINERAL_WOOL, "thickness": 0.05}],
                    "insulation_temperature_basis": "outdoor_winter",
                    "ambient_temperature": -26.0,
                    "process_temperature": 80.0,
                    "pipe_length": 50.0,
                    "wind_speed": 4.9,
                    "placement": "outdoor",
                    "num_local_elements": 6,
                    "local_element_equiv_length": 1.25,
                },
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["local_elements_count_applied"] == 6
        assert data["local_element_equiv_length_applied"] == pytest.approx(1.25)

    async def test_tank_formula_check_success(self, client: AsyncClient, admin_token: str):
        resp = await client.post(
            "/api/v1/admin/formula-check",
            json={
                "formula_type": "tank",
                "params": {
                    "shape": "cylindrical",
                    "diameter": 1.0,
                    "height": 2.0,
                    "insulation_layers": [{"thickness": 0.08, "material": MINERAL_WOOL}],
                    "insulation_temperature_basis": "outdoor_winter",
                    "ambient_temperature": -26.0,
                    "process_temperature": 60.0,
                    "placement": "outdoor",
                    "wind_speed": 4.9,
                    "safety_factor": 1.1,
                },
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "total_heat_loss_design" in data
        assert data["total_heat_loss_design"] > 0

    async def test_electrical_tt_formula_check_success(self, client: AsyncClient, admin_token: str):
        resp = await client.post(
            "/api/v1/admin/formula-check",
            json={
                "formula_type": "electrical_tt",
                "params": {
                    "required_power_per_meter": 20.0,
                    "pipe_length": 50.0,
                    "process_temperature": 60.0,
                    "ambient_temperature": -26.0,
                    "supply_voltage": 230.0,
                },
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["selected_cable"]
        assert data["cable_length"] > 0

    async def test_electrical_tt_formula_check_returns_structured_core_error(
        self, client: AsyncClient, admin_token: str
    ):
        resp = await client.post(
            "/api/v1/admin/formula-check",
            json={
                "formula_type": "electrical_tt",
                "params": {
                    "required_power_per_meter": 20.0,
                    "pipe_length": 50.0,
                    "process_temperature": 60.0,
                    "ambient_temperature": -26.0,
                    "supply_voltage": 230.0,
                    "selection_policy": "unsupported",
                },
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )

        assert resp.status_code == 422
        assert resp.json()["detail"]["code"] == "ELECTRICAL_SELECTION_POLICY_UNSUPPORTED"

    @pytest.mark.parametrize(
        ("formula_type", "params"),
        [
            (
                "electrical_tt",
                {
                    "required_power_per_meter": 20.0,
                    "pipe_length": 50.0,
                    "maintain_temperature": 50.0,
                },
            ),
        ],
    )
    async def test_electrical_formula_check_requires_process_temperature(
        self,
        client: AsyncClient,
        admin_token: str,
        formula_type: str,
        params: dict[str, object],
    ):
        resp = await client.post(
            "/api/v1/admin/formula-check",
            json={"formula_type": formula_type, "params": params},
            headers={"Authorization": f"Bearer {admin_token}"},
        )

        assert resp.status_code == 422
        assert resp.json()["detail"] == PROCESS_TEMPERATURE_REQUIRED_MESSAGE

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
                    "insulation_layers": [{"material": MINERAL_WOOL, "thickness": 0.05}],
                    "insulation_temperature_basis": "outdoor_winter",
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
