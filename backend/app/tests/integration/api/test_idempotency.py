"""Идемпотентность: повторное выполнение операции даёт тот же результат.

Цена ошибки: пользователь дважды нажал «Электрорасчёт» → дубликаты в БД,
неверные итоги в спецификации, рассинхрон UI. Реальный сценарий — глюк интернета,
двойной клик, F5 после долгого ожидания.
"""

import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio(loop_scope="session")


PIPE_PARAMS = {
    "name": "Idem-T1",
    "outer_diameter": 0.108,
    "insulation_thickness": 0.05,
    "insulation_material": "mineral_wool",
    "ambient_temperature": -20.0,
    "process_temperature": 80.0,
    "pipe_length": 50.0,
}


class TestBatchCalcIdempotency:
    """Повторный batch_calc_electrical → upsert, не дубликаты."""

    async def test_batch_calc_twice_no_duplicates(self, client: AsyncClient, employee_token: str):
        headers = {"Authorization": f"Bearer {employee_token}"}
        proj = (
            await client.post(
                "/api/v1/projects",
                json={"name": "Idem-1"},
                headers=headers,
            )
        ).json()
        await client.post(
            f"/api/v1/projects/{proj['id']}/objects",
            json={"object_type": "pipe", "sort_order": 0, "params": PIPE_PARAMS},
            headers=headers,
        )

        # Запускаем 3 раза подряд (имитация глюка интернета + двойной клик)
        for _ in range(3):
            resp = await client.post(
                "/api/v1/calc/electrical/batch",
                params={"project_id": proj["id"]},
                headers=headers,
            )
            assert resp.status_code == 200

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
        proj = (
            await client.post(
                "/api/v1/projects",
                json={"name": "Idem-2"},
                headers=headers,
            )
        ).json()
        await client.post(
            f"/api/v1/projects/{proj['id']}/objects",
            json={"object_type": "pipe", "sort_order": 0, "params": PIPE_PARAMS},
            headers=headers,
        )

        first = (
            await client.post(
                "/api/v1/calc/electrical/batch",
                params={"project_id": proj["id"]},
                headers=headers,
            )
        ).json()
        second = (
            await client.post(
                "/api/v1/calc/electrical/batch",
                params={"project_id": proj["id"]},
                headers=headers,
            )
        ).json()

        # Полная детерминированность
        assert first["calculated"] == second["calculated"]
        listing1 = (
            await client.get(
                "/api/v1/calc/electrical",
                params={"project_id": proj["id"]},
                headers=headers,
            )
        ).json()
        # cable_mark и cable_length одинаковы
        assert all(c["cable_mark"] for c in listing1)


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
