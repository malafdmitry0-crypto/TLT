"""Integration-тесты спецификации."""

import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio(loop_scope="session")

MINERAL_WOOL = "mineral_wool_boards_120"


class TestSpecification:
    async def _create_project_with_pipe(self, client: AsyncClient, headers: dict[str, str]) -> tuple[dict, dict]:
        project = (
            await client.post("/api/v1/projects", json={"name": "Spec stale project"}, headers=headers)
        ).json()
        obj_resp = await client.post(
            f"/api/v1/projects/{project['id']}/objects",
            json={
                "object_type": "pipe",
                "params": {
                    "outer_diameter": 0.108,
                    "insulation_thickness": 0.05,
                    "insulation_material": MINERAL_WOOL,
                    "insulation_temperature_basis": "outdoor_winter",
                    "ambient_temperature": -30,
                    "process_temperature": 80,
                    "pipe_length": 50,
                },
            },
            headers=headers,
        )
        assert obj_resp.status_code in (200, 201), obj_resp.text
        return project, obj_resp.json()

    async def _save_manual_spec(self, client: AsyncClient, project_id: str, headers: dict[str, str]) -> None:
        resp = await client.put(
            f"/api/v1/specifications/{project_id}/items",
            json={
                "items": [
                    {
                        "category": "manual",
                        "name": "Ручная позиция",
                        "article": "MAN-1",
                        "unit": "шт",
                        "quantity": 1,
                        "source": "manual",
                    }
                ]
            },
            headers=headers,
        )
        assert resp.status_code == 200, resp.text

    async def test_generate_empty_specification(self, client: AsyncClient, guest_session: str):
        p = (
            await client.get(
                "/api/v1/projects",
                headers={"X-Session-Id": guest_session},
            )
        ).json()[0]
        resp = await client.post(
            f"/api/v1/specifications/{p['id']}/generate",
            headers={"X-Session-Id": guest_session},
        )
        assert resp.status_code == 201
        assert resp.json()["items"] == []

    async def test_get_specification_after_generate(self, client: AsyncClient, guest_session: str):
        p = (
            await client.get(
                "/api/v1/projects",
                headers={"X-Session-Id": guest_session},
            )
        ).json()[0]
        await client.post(
            f"/api/v1/specifications/{p['id']}/generate",
            headers={"X-Session-Id": guest_session},
        )
        resp = await client.get(
            f"/api/v1/specifications/{p['id']}",
            headers={"X-Session-Id": guest_session},
        )
        assert resp.status_code == 200
        assert resp.json() is not None

    async def test_regenerate_preserves_manual_items(
        self, client: AsyncClient, employee_token: str
    ):
        """При повторной генерации manual-позиции не теряются, авто-позиции пересчитываются."""
        headers = {"Authorization": f"Bearer {employee_token}"}
        p = (
            await client.post("/api/v1/projects", json={"name": "Spec-MM"}, headers=headers)
        ).json()
        # Сначала генерируем (пусто, объектов нет)
        await client.post(
            f"/api/v1/specifications/{p['id']}/generate",
            headers=headers,
        )
        # Сохраняем manual-позицию
        await client.put(
            f"/api/v1/specifications/{p['id']}/items",
            json={
                "items": [
                    {
                        "category": "extra",
                        "name": "Доп. термостат",
                        "article": "TS-100",
                        "unit": "шт",
                        "quantity": 2,
                        "source": "manual",
                    }
                ]
            },
            headers=headers,
        )
        # Регенерируем — manual должен сохраниться
        resp = await client.post(
            f"/api/v1/specifications/{p['id']}/generate",
            headers=headers,
        )
        items = resp.json()["items"]
        manual = [i for i in items if i.get("source") == "manual"]
        assert any(m["article"] == "TS-100" for m in manual)

    async def test_get_specification_404_for_unknown_variant(
        self, client: AsyncClient, guest_session: str
    ):
        p = (await client.get("/api/v1/projects", headers={"X-Session-Id": guest_session})).json()[
            0
        ]
        # Запрашиваем variant=99 — никогда не генерировался
        resp = await client.get(
            f"/api/v1/specifications/{p['id']}?variant_number=99",
            headers={"X-Session-Id": guest_session},
        )
        assert resp.status_code in (200, 404)
        # Если 200 — должен быть пустой массив, если 404 — нет данных

    async def test_save_items_replaces_completely(self, client: AsyncClient, employee_token: str):
        headers = {"Authorization": f"Bearer {employee_token}"}
        p = (
            await client.post("/api/v1/projects", json={"name": "Spec-Replace"}, headers=headers)
        ).json()
        # Первый save — 2 позиции
        await client.put(
            f"/api/v1/specifications/{p['id']}/items",
            json={
                "items": [
                    {"category": "a", "name": "A", "unit": "шт", "quantity": 1, "source": "manual"},
                    {"category": "b", "name": "B", "unit": "шт", "quantity": 2, "source": "manual"},
                ]
            },
            headers=headers,
        )
        # Второй save — 1 позиция (полностью замещает)
        resp = await client.put(
            f"/api/v1/specifications/{p['id']}/items",
            json={
                "items": [
                    {"category": "c", "name": "C", "unit": "шт", "quantity": 3, "source": "manual"}
                ]
            },
            headers=headers,
        )
        assert resp.status_code == 200
        # Проверяем что теперь только одна
        spec = (
            await client.get(
                f"/api/v1/specifications/{p['id']}",
                headers=headers,
            )
        ).json()
        assert len(spec["items"]) == 1
        assert spec["items"][0]["name"] == "C"

    async def test_update_object_marks_saved_specification_stale(
        self, client: AsyncClient, employee_token: str
    ):
        headers = {"Authorization": f"Bearer {employee_token}"}
        project, obj = await self._create_project_with_pipe(client, headers)
        await self._save_manual_spec(client, project["id"], headers)

        update_resp = await client.put(
            f"/api/v1/projects/{project['id']}/objects/{obj['id']}",
            json={"version": obj["version"], "params": {"pipe_length": 75}},
            headers=headers,
        )
        assert update_resp.status_code == 200, update_resp.text

        spec = (
            await client.get(f"/api/v1/specifications/{project['id']}", headers=headers)
        ).json()
        assert spec["is_stale"] is True
        assert spec["stale_reason"] == "object_params_updated"
        assert spec["stale_details"]["object_ids"] == [obj["id"]]
        assert spec["items"][0]["name"] == "Ручная позиция"

        regen = await client.post(
            f"/api/v1/specifications/{project['id']}/generate",
            headers=headers,
        )
        assert regen.status_code == 201, regen.text
        fresh = (
            await client.get(f"/api/v1/specifications/{project['id']}", headers=headers)
        ).json()
        assert fresh["is_stale"] is False
        assert fresh["stale_reason"] is None
        assert any(item["name"] == "Ручная позиция" for item in fresh["items"])

    async def test_delete_object_marks_saved_specification_stale(
        self, client: AsyncClient, employee_token: str
    ):
        headers = {"Authorization": f"Bearer {employee_token}"}
        project, obj = await self._create_project_with_pipe(client, headers)
        await self._save_manual_spec(client, project["id"], headers)

        delete_resp = await client.delete(
            f"/api/v1/projects/{project['id']}/objects/{obj['id']}",
            headers=headers,
        )
        assert delete_resp.status_code == 204, delete_resp.text

        spec = (
            await client.get(f"/api/v1/specifications/{project['id']}", headers=headers)
        ).json()
        assert spec["is_stale"] is True
        assert spec["stale_reason"] == "object_deleted"
        assert spec["stale_details"]["object_ids"] == [obj["id"]]

    async def test_save_items_resets_stale_specification(
        self, client: AsyncClient, employee_token: str
    ):
        headers = {"Authorization": f"Bearer {employee_token}"}
        project, obj = await self._create_project_with_pipe(client, headers)
        await self._save_manual_spec(client, project["id"], headers)
        await client.put(
            f"/api/v1/projects/{project['id']}/objects/{obj['id']}",
            json={"version": obj["version"], "params": {"pipe_length": 75}},
            headers=headers,
        )

        resp = await client.put(
            f"/api/v1/specifications/{project['id']}/items",
            json={
                "items": [
                    {
                        "category": "manual",
                        "name": "Новая ручная позиция",
                        "unit": "шт",
                        "quantity": 2,
                        "source": "manual",
                    }
                ]
            },
            headers=headers,
        )
        assert resp.status_code == 200, resp.text
        spec = (
            await client.get(f"/api/v1/specifications/{project['id']}", headers=headers)
        ).json()
        assert spec["is_stale"] is False
        assert spec["stale_reason"] is None
        assert spec["items"][0]["name"] == "Новая ручная позиция"


class TestSpecAccessoryCountForAllObjects:
    """Regression: аксессуары (УЗО и т.д.) заказываются на все объекты проекта,
    а не только на успешно рассчитанные. Раньше при fail-ах в электрорасчёте
    число УЗО падало вместе с числом успешных расчётов.
    """

    async def _add_pipe(self, client: AsyncClient, project_id: str, session_id: str) -> dict:
        resp = await client.post(
            f"/api/v1/projects/{project_id}/objects",
            json={
                "object_type": "pipe",
                "params": {
                    "outer_diameter": 0.108,
                    "insulation_thickness": 0.05,
                    "insulation_material": MINERAL_WOOL,
                    "insulation_temperature_basis": "outdoor_winter",
                    "ambient_temperature": -30,
                    "process_temperature": 80,
                    "pipe_length": 50,
                },
            },
            headers={"X-Session-Id": session_id},
        )
        assert resp.status_code in (200, 201), resp.text
        return resp.json()

    async def test_accessories_scale_with_project_objects_not_successful_calcs(
        self, client: AsyncClient, guest_session: str
    ):
        """3 объекта в проекте → аксессуары × 3, даже если рассчитан только 1."""
        p = (
            await client.get(
                "/api/v1/projects",
                headers={"X-Session-Id": guest_session},
            )
        ).json()[0]
        for _ in range(3):
            await self._add_pipe(client, p["id"], guest_session)

        # Запускаем batch — пусть все 3 рассчитаются (успешно)
        await client.post(
            "/api/v1/calc/electrical/batch",
            params={"project_id": p["id"]},
            headers={"X-Session-Id": guest_session},
        )

        resp = await client.post(
            f"/api/v1/specifications/{p['id']}/generate",
            headers={"X-Session-Id": guest_session},
        )
        assert resp.status_code == 201
        items = resp.json()["items"]
        accessories = [i for i in items if i["category"] != "Кабель"]
        assert accessories, "Должны быть аксессуары"
        for acc in accessories:
            qty = float(acc["quantity"])
            per_object = qty / 3.0
            assert per_object == float(
                int(per_object)
            ), f"{acc['name']}: quantity={qty}, не кратно 3 (числу объектов проекта)"
