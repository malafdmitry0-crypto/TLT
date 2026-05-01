"""Integration-тесты расчётов."""

import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio(loop_scope="session")

CABLE_LENGTH_FACTOR = 1.1  # BR-CABLE-02


async def _create_project(client: AsyncClient, session_id: str) -> dict:
    resp = await client.get(
        "/api/v1/projects",
        headers={"X-Session-Id": session_id},
    )
    return resp.json()[0]


async def _create_pipe_object(client: AsyncClient, project_id: str, session_id: str) -> dict:
    resp = await client.post(
        f"/api/v1/projects/{project_id}/objects",
        json={
            "object_type": "pipe",
            "params": {
                "outer_diameter": 0.108,
                "insulation_thickness": 0.05,
                "insulation_material": "mineral_wool",
                "ambient_temperature": -30,
                "process_temperature": 150,
                "pipe_length": 50,
            },
        },
        headers={"X-Session-Id": session_id},
    )
    assert resp.status_code in (200, 201), resp.text
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
                    "insulation_material": "mineral_wool",
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
        assert "cable_length" in result
        assert "total_power" in result
        assert "current" in result
        assert "voltage" in result

    async def test_cable_length_includes_10_percent_factor(
        self, client: AsyncClient, guest_session: str
    ):
        """BR-CABLE-02: длина кабеля = длина трубы × 1.1."""
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
        assert result["cable_length"] == pytest.approx(pipe_length * CABLE_LENGTH_FACTOR, rel=1e-3)

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
        assert "cable_length" in calc["results"]

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
        assert "нет расчётной формулы" in resp.json()["detail"]

    async def test_nonexistent_object_returns_400(self, client: AsyncClient, guest_session: str):
        """Несуществующий object_id → 400 с читаемым сообщением."""
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
        assert resp.status_code == 400
        assert "не найден" in resp.json()["detail"].lower()


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
                        "insulation_material": "mineral_wool",
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
        # Ручной выбор — берём более мощный кабель ТЛТ-50 (T_max=110, подойдёт для 80°C)
        resp = await client.post(
            "/api/v1/calc/electrical/select-cable",
            params={"object_id": oid, "cable_mark": "ТЛТ-50"},
            headers={"X-Session-Id": guest_session},
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["cable_mark"] == "ТЛТ-50"
        assert body["results"]["selected_cable"] == "ТЛТ-50"
        # В листе тоже одна запись (upsert не плодит дубликаты)
        listing = (
            await client.get(
                "/api/v1/calc/electrical",
                params={"project_id": _pid},
                headers={"X-Session-Id": guest_session},
            )
        ).json()
        assert len(listing) == 1
        assert listing[0]["cable_mark"] == "ТЛТ-50"

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
                        "insulation_material": "mineral_wool",
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
        assert before[0]["results"].get("error")

        # Чиним объект: снижаем процесс-температуру до 80 через update
        await client.put(
            f"/api/v1/projects/{_pid}/objects/{oid}",
            json={
                "params": {
                    "outer_diameter": 0.108,
                    "insulation_thickness": 0.05,
                    "insulation_material": "mineral_wool",
                    "ambient_temperature": -20,
                    "process_temperature": 80,
                    "pipe_length": 50,
                }
            },
            headers={"X-Session-Id": guest_session},
        )
        # Выбираем кабель вручную
        resp = await client.post(
            "/api/v1/calc/electrical/select-cable",
            params={"object_id": oid, "cable_mark": "ТЛТ-50"},
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
        assert not after[0]["results"].get("error")
        assert after[0]["cable_mark"] == "ТЛТ-50"


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
                    "insulation_material": "mineral_wool",
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

        # Эмулируем фейл для СО2: ручной выбор заведомо слабого кабеля под variant=2
        # Это создаст failed-запись (cable_mark=None, results.error) для варианта 2.
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
