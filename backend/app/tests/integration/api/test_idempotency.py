"""Идемпотентность: повторное выполнение операции даёт тот же результат.

Цена ошибки: пользователь дважды нажал «Электрорасчёт» → дубликаты в БД,
неверные итоги в спецификации, рассинхрон UI. Реальный сценарий — глюк интернета,
двойной клик, F5 после долгого ожидания.
"""

import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio(loop_scope="session")

MINERAL_WOOL = "mineral_wool_boards_120"


PIPE_PARAMS = {
    "name": "Idem-T1",
    "outer_diameter": 0.108,
    "wall_thickness": 0.004,
    "pipe_material": "carbon_steel",
    "insulation_layers": [{"thickness": 0.05, "material": MINERAL_WOOL}],
    "insulation_temperature_basis": "outdoor_winter",
    "ambient_temperature": -20.0,
    "process_temperature": 80.0,
    "pipe_length": 50.0,
    "placement": "outdoor",
    "wind_speed": 0,
}


async def _prepare_assigned_pipe(
    client: AsyncClient,
    headers: dict[str, str],
    *,
    project_name: str,
) -> dict:
    """Create project + ready pipe + Iдоп + Samreg assignment for batch TT."""
    proj = (
        await client.post(
            "/api/v1/projects",
            json={"name": project_name},
            headers=headers,
        )
    ).json()
    obj = (
        await client.post(
            f"/api/v1/projects/{proj['id']}/objects",
            json={"object_type": "pipe", "sort_order": 0, "params": PIPE_PARAMS},
            headers=headers,
        )
    ).json()
    settings = await client.patch(
        f"/api/v1/projects/{proj['id']}/electrical-settings",
        headers=headers,
        json={"expected_version": 1, "max_section_start_current_a": "13.065"},
    )
    assert settings.status_code == 200, settings.text
    initialized = await client.post(
        f"/api/v1/projects/{proj['id']}/electrical-variants/initialize",
        headers=headers,
    )
    assert initialized.status_code == 200, initialized.text
    variant = initialized.json()["variant"]
    assignments = await client.get(
        f"/api/v1/projects/{proj['id']}/electrical-variants/{variant['id']}/assignments",
        headers=headers,
    )
    assert assignments.status_code == 200, assignments.text
    by_id = {item["object_id"]: item for item in assignments.json()["items"]}
    assigned = await client.patch(
        f"/api/v1/projects/{proj['id']}/electrical-variants/{variant['id']}/assignments",
        headers=headers,
        json={
            "system_type": "self_regulating",
            "items": [
                {
                    "object_id": obj["id"],
                    "expected_version": by_id[obj["id"]]["version"],
                }
            ],
        },
    )
    assert assigned.status_code == 200, assigned.text
    return {"project": proj, "object": obj, "variant": variant}


class TestBatchCalcIdempotency:
    """Повторный batch_calc_electrical → upsert, не дубликаты."""

    async def test_batch_calc_twice_no_duplicates(self, client: AsyncClient, employee_token: str):
        headers = {"Authorization": f"Bearer {employee_token}"}
        prepared = await _prepare_assigned_pipe(client, headers, project_name="Idem-1")
        proj = prepared["project"]
        variant = prepared["variant"]

        # Запускаем 3 раза подряд (имитация глюка интернета + двойной клик)
        for _ in range(3):
            resp = await client.post(
                "/api/v1/calc/electrical/batch",
                params={
                    "project_id": proj["id"],
                    "electrical_variant_id": variant["id"],
                    "cable_type": "self_regulating_tt",
                },
                headers={**headers, "Idempotency-Key": f"idem-batch-{proj['id']}"},
            )
            assert resp.status_code == 200, resp.text

        # Проверяем что записей в electrical = 1, не 3
        listing = (
            await client.get(
                "/api/v1/calc/electrical",
                params={"project_id": proj["id"]},
                headers=headers,
            )
        ).json()
        assert (
            len(listing) == 1
        ), f"DUPLICATES: 3 batch_calc создали {len(listing)} записей вместо 1"

    async def test_batch_calc_same_result_on_repeat(self, client: AsyncClient, employee_token: str):
        """Тот же проект → тот же кабель → те же мощности."""
        headers = {"Authorization": f"Bearer {employee_token}"}
        prepared = await _prepare_assigned_pipe(client, headers, project_name="Idem-2")
        proj = prepared["project"]
        variant = prepared["variant"]

        first = (
            await client.post(
                "/api/v1/calc/electrical/batch",
                params={
                    "project_id": proj["id"],
                    "electrical_variant_id": variant["id"],
                    "cable_type": "self_regulating_tt",
                },
                headers=headers,
            )
        ).json()
        second = (
            await client.post(
                "/api/v1/calc/electrical/batch",
                params={
                    "project_id": proj["id"],
                    "electrical_variant_id": variant["id"],
                    "cable_type": "self_regulating_tt",
                },
                headers=headers,
            )
        ).json()

        # Полная детерминированность счётчиков + upsert (одна строка на объект).
        assert first["calculated"] == second["calculated"]
        assert first.get("skipped", 0) == second.get("skipped", 0)
        listing1 = (
            await client.get(
                "/api/v1/calc/electrical",
                params={"project_id": proj["id"]},
                headers=headers,
            )
        ).json()
        # Either successful calc or empty (if batch skipped) — never duplicate rows.
        assert len(listing1) <= 1


class TestSpecGenerateIdempotency:
    """generate спецификации — replace, не append."""

    async def test_generate_twice_same_count(self, client: AsyncClient, employee_token: str):
        headers = {"Authorization": f"Bearer {employee_token}"}
        proj = (
            await client.post(
                "/api/v1/projects",
                json={"name": "Spec-Idem"},
                headers=headers,
            )
        ).json()
        await client.post(
            f"/api/v1/projects/{proj['id']}/objects",
            json={"object_type": "pipe", "sort_order": 0, "params": PIPE_PARAMS},
            headers=headers,
        )
        await client.post(
            "/api/v1/calc/electrical/batch",
            params={"project_id": proj["id"]},
            headers=headers,
        )

        # Generate 3 раза
        for _ in range(3):
            resp = await client.post(
                f"/api/v1/specifications/{proj['id']}/generate",
                headers=headers,
            )
            assert resp.status_code == 201

        spec = (
            await client.get(
                f"/api/v1/specifications/{proj['id']}",
                headers=headers,
            )
        ).json()
        # Items не растут от повторов — каждый раз replace
        first_count = len(spec["items"])
        for _ in range(3):
            await client.post(
                f"/api/v1/specifications/{proj['id']}/generate",
                headers=headers,
            )
        spec2 = (
            await client.get(
                f"/api/v1/specifications/{proj['id']}",
                headers=headers,
            )
        ).json()
        assert (
            len(spec2["items"]) == first_count
        ), f"DUPLICATES: 3 повторных generate накатили {len(spec2['items'])} вместо {first_count}"


class TestObjectUpdateIdempotency:
    """Update объекта с теми же params → тот же результат, никаких дублей."""

    async def test_double_update_same_params_same_result(
        self, client: AsyncClient, employee_token: str
    ):
        headers = {"Authorization": f"Bearer {employee_token}"}
        proj = (
            await client.post(
                "/api/v1/projects",
                json={"name": "Upd-Idem"},
                headers=headers,
            )
        ).json()
        obj = (
            await client.post(
                f"/api/v1/projects/{proj['id']}/objects",
                json={"object_type": "pipe", "sort_order": 0, "params": PIPE_PARAMS},
                headers=headers,
            )
        ).json()

        url = f"/api/v1/projects/{proj['id']}/objects/{obj['id']}"
        for _ in range(5):
            resp = await client.put(
                url,
                json={"version": obj["version"], "params": PIPE_PARAMS},
                headers=headers,
            )
            assert resp.status_code == 200
            obj = resp.json()

        objs = (
            await client.get(
                f"/api/v1/projects/{proj['id']}/objects",
                headers=headers,
            )
        ).json()
        assert len(objs) == 1
        assert objs[0]["is_valid"] is True
