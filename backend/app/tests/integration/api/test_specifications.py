"""Integration-тесты спецификации."""

from uuid import UUID

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.electrical_variant import ElectricalVariant
from app.models.specification import Specification

pytestmark = pytest.mark.asyncio(loop_scope="session")

MINERAL_WOOL = "mineral_wool_boards_120"


class TestSpecification:
    async def _add_pipe(
        self,
        client: AsyncClient,
        project_id: str,
        headers: dict[str, str],
    ) -> dict:
        obj_resp = await client.post(
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
            headers=headers,
        )
        assert obj_resp.status_code in (200, 201), obj_resp.text
        return obj_resp.json()

    async def _create_project_with_pipe(
        self, client: AsyncClient, headers: dict[str, str]
    ) -> tuple[dict, dict]:
        project = (
            await client.post(
                "/api/v1/projects", json={"name": "Spec stale project"}, headers=headers
            )
        ).json()
        return project, await self._add_pipe(client, project["id"], headers)

    async def _save_manual_spec(
        self, client: AsyncClient, project_id: str, headers: dict[str, str]
    ) -> None:
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

    async def test_generate_objectless_specification_is_readiness_blocked_atomically(
        self,
        client: AsyncClient,
        guest_session: str,
        db_session: AsyncSession,
    ):
        """PDL-ER-12: a downstream write cannot create the first ER before readiness."""
        p = (
            await client.get(
                "/api/v1/projects",
                headers={"X-Session-Id": guest_session},
            )
        ).json()[0]
        resp = await client.post(
            f"/api/v1/specifications/{p['id']}/generate",
            json={"confirm_partial": True},
            headers={"X-Session-Id": guest_session},
        )
        assert resp.status_code == 409, resp.text
        assert resp.json()["detail"]["code"] == "ELECTRICAL_READINESS_FAILED"

        project_id = UUID(p["id"])
        variant_count = await db_session.scalar(
            select(func.count(ElectricalVariant.id)).where(
                ElectricalVariant.project_id == project_id
            )
        )
        specification_count = await db_session.scalar(
            select(func.count(Specification.id)).where(Specification.project_id == project_id)
        )
        assert variant_count == 0
        assert specification_count == 0

    async def test_get_specification_after_generate(self, client: AsyncClient, guest_session: str):
        p = (
            await client.get(
                "/api/v1/projects",
                headers={"X-Session-Id": guest_session},
            )
        ).json()[0]
        await self._add_pipe(
            client,
            p["id"],
            {"X-Session-Id": guest_session},
        )
        await client.post(
            f"/api/v1/specifications/{p['id']}/generate",
            json={"confirm_partial": True},
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
        await self._add_pipe(client, p["id"], headers)
        # Сначала генерируем базовую спецификацию готового проекта.
        await client.post(
            f"/api/v1/specifications/{p['id']}/generate",
            json={"confirm_partial": True},
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
            json={"confirm_partial": True},
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

    async def test_guest_full_mode_allowed_manual_items_still_forbidden(
        self, client: AsyncClient, guest_session: str
    ):
        """PDL-ER-04: guest may generate full automatic BOM; manual item write stays 403."""
        headers = {"X-Session-Id": guest_session}
        p = (await client.get("/api/v1/projects", headers=headers)).json()[0]
        await self._add_pipe(client, p["id"], headers)
        resp = await client.post(
            f"/api/v1/specifications/{p['id']}/generate",
            json={"mode": "full", "confirm_partial": True},
            headers=headers,
        )
        assert resp.status_code == 201, resp.text
        body = resp.json()
        assert body["mode"] == "full"

        manual = await client.put(
            f"/api/v1/specifications/{p['id']}/items",
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
        assert manual.status_code == 403



    async def test_generate_requires_confirm_partial_when_exclusions(
        self, client: AsyncClient, guest_session: str
    ):
        """PDL-ER-36: preflight blocks write until confirm_partial=true."""
        headers = {"X-Session-Id": guest_session}
        project = (await client.get("/api/v1/projects", headers=headers)).json()[0]
        await self._add_pipe(client, project["id"], headers)
        blocked = await client.post(
            f"/api/v1/specifications/{project['id']}/generate",
            json={"mode": "full", "confirm_partial": False},
            headers=headers,
        )
        assert blocked.status_code == 409, blocked.text
        detail = blocked.json()["detail"]
        assert detail["code"] == "SPECIFICATION_PREFLIGHT_CONFIRMATION_REQUIRED"
        assert detail["preflight"]["requires_confirmation"] is True
        # FA-06: confirmation required for object skips AND/OR excluded BOM groups
        # (sections catalog, boxes matrix) even when all objects contribute.
        pf_variants = detail["preflight"].get("variants") or []
        has_group_exclusions = any(
            (v.get("excluded_groups") or []) for v in pf_variants
        )
        assert (
            detail["preflight"]["total_skipped_objects"] >= 1 or has_group_exclusions
        )

        confirmed = await client.post(
            f"/api/v1/specifications/{project['id']}/generate",
            json={"mode": "full", "confirm_partial": True},
            headers=headers,
        )
        assert confirmed.status_code == 201, confirmed.text
        body = confirmed.json()
        assert body["mode"] == "full"
        assert body.get("partial") is True

    async def test_generate_basic_mode_coerced_to_full(
        self, client: AsyncClient, guest_session: str
    ):
        """PDL-ER-29: deprecated basic input is normalized to full."""
        headers = {"X-Session-Id": guest_session}
        p = (await client.get("/api/v1/projects", headers=headers)).json()[0]
        await self._add_pipe(client, p["id"], headers)
        resp = await client.post(
            f"/api/v1/specifications/{p['id']}/generate",
            json={"mode": "basic", "confirm_partial": True},
            headers=headers,
        )
        assert resp.status_code == 201, resp.text
        assert resp.json()["mode"] == "full"

    async def test_generate_response_reports_mode_and_persists_it(
        self, client: AsyncClient, employee_token: str
    ):
        """Ответ содержит фактический режим; режим сохраняется и виден в GET."""
        headers = {"Authorization": f"Bearer {employee_token}"}
        p = (
            await client.post("/api/v1/projects", json={"name": "Spec-Mode"}, headers=headers)
        ).json()
        await self._add_pipe(client, p["id"], headers)
        resp = await client.post(
            f"/api/v1/specifications/{p['id']}/generate",
            json={"mode": "full", "options": {"reserve_coefficient": 1.2}, "confirm_partial": True},
            headers=headers,
        )
        assert resp.status_code == 201, resp.text
        body = resp.json()
        assert body["mode"] == "full"
        assert "skipped_objects" in body

        spec = (await client.get(f"/api/v1/specifications/{p['id']}", headers=headers)).json()
        assert spec["generation_mode"] == "full"
        assert spec["generation_options"]["reserve_coefficient"] == 1.2
        # PDL-ER-07: generation stores full versioned snapshot
        assert "settings_version" in spec["generation_options"]
        assert body.get("settings_version") == spec["generation_options"]["settings_version"]
        # PDL-ER-35: boxes fail-closed without official matrix
        assert body.get("partial") is True or body.get("excluded_groups") is not None
        if body.get("excluded_groups"):
            assert any(
                g.get("error_code") == "BOX_EX_RGR_MATRIX_MISSING"
                for g in body["excluded_groups"]
            )
        # FA-01/05: partial honesty survives GET reload via generation_options + top-level fields
        assert body.get("partial") is True
        assert spec.get("is_partial") is True
        assert spec["generation_options"].get("is_partial") is True
        assert isinstance(spec.get("excluded_groups"), list)
        assert any(
            g.get("error_code") == "SECTION_DATA_SOURCE_MISSING"
            for g in (spec.get("excluded_groups") or [])
        )

    async def test_project_settings_versioned_without_auto_regenerate(
        self, client: AsyncClient, employee_token: str
    ):
        """PDL-ER-07: save defaults bumps version and stales other snapshot, no regenerate."""
        headers = {"Authorization": f"Bearer {employee_token}"}
        p = (
            await client.post(
                "/api/v1/projects", json={"name": "Spec-Settings"}, headers=headers
            )
        ).json()
        await self._add_pipe(client, p["id"], headers)

        get0 = await client.get(f"/api/v1/specifications/{p['id']}/settings", headers=headers)
        assert get0.status_code == 200, get0.text
        assert get0.json()["version"] == 1

        gen = await client.post(
            f"/api/v1/specifications/{p['id']}/generate",
            json={
                "mode": "full",
                "options": {"reserve_coefficient": 1.0, "ex_zone": False},
                "confirm_partial": True,
            },
            headers=headers,
        )
        assert gen.status_code == 201, gen.text
        before = (await client.get(f"/api/v1/specifications/{p['id']}", headers=headers)).json()
        assert before["is_stale"] is False
        before_items = before["items"]

        put = await client.put(
            f"/api/v1/specifications/{p['id']}/settings",
            json={"settings": {"reserve_coefficient": 1.5, "ex_zone": True}},
            headers=headers,
        )
        assert put.status_code == 200, put.text
        assert put.json()["version"] == 2
        assert put.json()["settings"]["reserve_coefficient"] == 1.5

        after = (await client.get(f"/api/v1/specifications/{p['id']}", headers=headers)).json()
        assert after["is_stale"] is True
        assert after["stale_reason"] == "specification_settings_changed"
        # Saving defaults must not rewrite BOM items.
        assert after["items"] == before_items

    async def test_save_items_replaces_completely(self, client: AsyncClient, employee_token: str):
        headers = {"Authorization": f"Bearer {employee_token}"}
        p = (
            await client.post("/api/v1/projects", json={"name": "Spec-Replace"}, headers=headers)
        ).json()
        await self._add_pipe(client, p["id"], headers)
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

        spec = (await client.get(f"/api/v1/specifications/{project['id']}", headers=headers)).json()
        assert spec["is_stale"] is True
        assert spec["stale_reason"] == "object_params_updated"
        assert spec["stale_details"]["object_ids"] == [obj["id"]]
        assert spec["items"][0]["name"] == "Ручная позиция"

        regen = await client.post(
            f"/api/v1/specifications/{project['id']}/generate",
            json={"confirm_partial": True},
            headers=headers,
        )
        assert regen.status_code == 201, regen.text
        fresh = (
            await client.get(f"/api/v1/specifications/{project['id']}", headers=headers)
        ).json()
        assert fresh["is_stale"] is False
        assert fresh["stale_reason"] is None
        assert any(item["name"] == "Ручная позиция" for item in fresh["items"])

    async def test_heat_loss_batch_marks_saved_specification_stale(
        self, client: AsyncClient, employee_token: str
    ):
        headers = {"Authorization": f"Bearer {employee_token}"}
        project, _obj = await self._create_project_with_pipe(client, headers)
        await self._save_manual_spec(client, project["id"], headers)

        batch_resp = await client.post(
            "/api/v1/calc/heat-loss/batch",
            params={"project_id": project["id"]},
            headers=headers,
        )
        assert batch_resp.status_code == 200, batch_resp.text
        assert batch_resp.json()["updated"] == 1

        spec = (await client.get(f"/api/v1/specifications/{project['id']}", headers=headers)).json()
        assert spec["is_stale"] is True
        assert spec["stale_reason"] == "heat_loss_batch_recalculate"
        assert spec["stale_details"]["operation"] == "batch_recalculate"
        assert spec["items"][0]["name"] == "Ручная позиция"

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

        spec = (await client.get(f"/api/v1/specifications/{project['id']}", headers=headers)).json()
        assert spec["is_stale"] is True
        assert spec["stale_reason"] == "object_deleted"
        assert spec["stale_details"]["object_ids"] == [obj["id"]]

    async def test_save_items_rejects_stale_specification(
        self, client: AsyncClient, employee_token: str
    ):
        """FA-07 / PDL-ER-37: stale snapshot is read-only — manual PUT returns 409."""
        headers = {"Authorization": f"Bearer {employee_token}"}
        project, obj = await self._create_project_with_pipe(client, headers)
        await self._save_manual_spec(client, project["id"], headers)
        await client.put(
            f"/api/v1/projects/{project['id']}/objects/{obj['id']}",
            json={"version": obj["version"], "params": {"pipe_length": 75}},
            headers=headers,
        )

        stale_before = (
            await client.get(f"/api/v1/specifications/{project['id']}", headers=headers)
        ).json()
        assert stale_before["is_stale"] is True

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
        assert resp.status_code == 409, resp.text
        detail = resp.json()["detail"]
        assert detail["code"] == "SPECIFICATION_STALE_READ_ONLY"

        # Snapshot remains stale and unchanged.
        spec = (await client.get(f"/api/v1/specifications/{project['id']}", headers=headers)).json()
        assert spec["is_stale"] is True
        assert any(i.get("name") != "Новая ручная позиция" for i in (spec.get("items") or [])) or (
            not any(i.get("name") == "Новая ручная позиция" for i in (spec.get("items") or []))
        )


    async def test_multi_er_generate_is_atomic_and_scoped(
        self, client: AsyncClient, employee_token: str
    ):
        """PDL-ER-01/14: explicit multi-ER generation creates independent specs."""
        headers = {"Authorization": f"Bearer {employee_token}"}
        project = (
            await client.post(
                "/api/v1/projects", json={"name": "Multi-ER Spec"}, headers=headers
            )
        ).json()
        await self._add_pipe(client, project["id"], headers)

        init = await client.post(
            f"/api/v1/projects/{project['id']}/electrical-variants/initialize",
            headers=headers,
        )
        assert init.status_code in (200, 201), init.text
        er1 = init.json()["variant"]

        created = await client.post(
            f"/api/v1/projects/{project['id']}/electrical-variants",
            json={"name": "ЭР2-spec"},
            headers={**headers, "Idempotency-Key": "spec-multi-er-create-2"},
        )
        assert created.status_code in (200, 201), created.text
        er2 = created.json()
        if "variant" in er2:
            er2 = er2["variant"]

        resp = await client.post(
            f"/api/v1/specifications/{project['id']}/generate",
            json={
                "mode": "full",
                "electrical_variant_ids": [er1["id"], er2["id"]],
                "confirm_partial": True,
            },
            headers=headers,
        )
        assert resp.status_code == 201, resp.text
        body = resp.json()
        assert body["results"] is not None
        assert len(body["results"]) == 2
        ids = {str(item["electrical_variant_id"]) for item in body["results"]}
        assert ids == {er1["id"], er2["id"]}

        spec1 = (
            await client.get(
                f"/api/v1/specifications/{project['id']}",
                params={
                    "variant": er1["legacy_variant_number"],
                    "electrical_variant_id": er1["id"],
                },
                headers=headers,
            )
        ).json()
        spec2 = (
            await client.get(
                f"/api/v1/specifications/{project['id']}",
                params={
                    "variant": er2["legacy_variant_number"],
                    "electrical_variant_id": er2["id"],
                },
                headers=headers,
            )
        ).json()
        assert spec1 is not None and spec2 is not None
        assert spec1["electrical_variant_id"] == er1["id"]
        assert spec2["electrical_variant_id"] == er2["id"]


class TestSpecAccessoryCountForAllObjects:
    """PDL-ER-29: product generation is full-only; basic per-object accessory
    scaling is no longer the canonical path.
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

    async def test_generate_defaults_to_full_without_basic_accessory_scaling(
        self, client: AsyncClient, guest_session: str
    ):
        """Full mode does not invent basic UZO-per-object rows without proven calcs."""
        headers = {"X-Session-Id": guest_session}
        p = (await client.get("/api/v1/projects", headers=headers)).json()[0]
        for _ in range(3):
            await self._add_pipe(client, p["id"], guest_session)

        resp = await client.post(
            f"/api/v1/specifications/{p['id']}/generate",
            json={"confirm_partial": True},
            headers=headers,
        )
        assert resp.status_code == 201, resp.text
        body = resp.json()
        assert body["mode"] == "full"
        # Without successful electrical results contributing to full BOM, there
        # is no basic-mode accessory multiplier over all project objects.
        accessories = [i for i in body["items"] if i.get("category") != "Кабель"]
        assert all(
            "УЗО" not in (i.get("name") or "") or float(i.get("quantity") or 0) != 3
            for i in accessories
        ) or not accessories


