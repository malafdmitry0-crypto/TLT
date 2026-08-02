"""Performance-тесты на NFR-PERF из SRS.

NFR-PERF-01: расчёт одного объекта ≤ 500 мс
NFR-PERF-02: пакетный пересчёт 50 объектов ≤ 5 с

Если эти лимиты регрессят — заказчик заметит торможение в проде.
"""

import time

import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio(loop_scope="session")

MINERAL_WOOL = "mineral_wool_boards_120"


PIPE_PARAMS = {
    "name": "Перф-труба",
    "outer_diameter": 0.108,
    "insulation_thickness": 0.05,
    "insulation_material": MINERAL_WOOL,
    "insulation_temperature_basis": "outdoor_winter",
    "ambient_temperature": -20.0,
    "process_temperature": 80.0,
    "pipe_length": 50.0,
}


class TestSingleObjectLatency:
    """NFR-PERF-01: одиночный POST + автопересчёт ≤ 500 мс."""

    async def test_add_pipe_under_500ms(self, client: AsyncClient, employee_token: str):
        headers = {"Authorization": f"Bearer {employee_token}"}
        proj = (
            await client.post(
                "/api/v1/projects",
                json={"name": "Perf-1"},
                headers=headers,
            )
        ).json()

        # Мерим только полезный POST + recalc, не setup
        start = time.perf_counter()
        resp = await client.post(
            f"/api/v1/projects/{proj['id']}/objects",
            json={"object_type": "pipe", "sort_order": 0, "params": PIPE_PARAMS},
            headers=headers,
        )
        elapsed_ms = (time.perf_counter() - start) * 1000

        assert resp.status_code == 201
        # Берём 1000мс как порог в тестовом окружении (чуть мягче чем NFR — БД тестовая медленнее)
        # Реальный production должен быть ≤ 500мс по NFR-PERF-01.
        assert elapsed_ms < 1000, (
            f"NFR-PERF-01 регрессия: одиночный POST занял {elapsed_ms:.0f} мс "
            f"(норматив 500 мс, тестовый порог 1000 мс)"
        )

    async def test_update_pipe_under_500ms(self, client: AsyncClient, employee_token: str):
        headers = {"Authorization": f"Bearer {employee_token}"}
        proj = (
            await client.post(
                "/api/v1/projects",
                json={"name": "Perf-2"},
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

        start = time.perf_counter()
        resp = await client.put(
            f"/api/v1/projects/{proj['id']}/objects/{obj['id']}",
            json={
                "version": obj["version"],
                "params": {**PIPE_PARAMS, "pipe_length": 100.0},
            },
            headers=headers,
        )
        elapsed_ms = (time.perf_counter() - start) * 1000
        assert resp.status_code == 200
        assert elapsed_ms < 1000


class TestBatchRecalcLatency:
    """NFR-PERF-02: пересчёт проекта с 50 объектами ≤ 5 с."""

    async def test_50_objects_batch_under_5s(self, client: AsyncClient, employee_token: str):
        """Создаём проект на 50 труб, мерим время batch_calc_electrical."""
        headers = {"Authorization": f"Bearer {employee_token}"}
        proj = (
            await client.post(
                "/api/v1/projects",
                json={"name": "Perf-50"},
                headers=headers,
            )
        ).json()
        # Заливаем 50 труб (это setup, не мерим)
        for i in range(50):
            await client.post(
                f"/api/v1/projects/{proj['id']}/objects",
                json={
                    "object_type": "pipe",
                    "sort_order": i,
                    "params": {**PIPE_PARAMS, "name": f"Труба-{i}"},
                },
                headers=headers,
            )

        # Меряем batch_calc_electrical
        start = time.perf_counter()
        resp = await client.post(
            "/api/v1/calc/electrical/batch",
            params={"project_id": proj["id"]},
            headers=headers,
        )
        elapsed_s = time.perf_counter() - start

        assert resp.status_code == 200
        body = resp.json()
        assert body["calculated"] == 50
        # NFR норматив 5 с, тестовый порог 10 с (БД тестовая медленнее)
        assert elapsed_s < 10.0, (
            f"NFR-PERF-02 регрессия: batch для 50 объектов занял {elapsed_s:.1f} с "
            f"(норматив 5 с, тестовый порог 10 с)"
        )


class TestExportPerformance:
    """Экспорт CSV/Excel — не должен затыкаться на больших проектах."""

    async def test_export_csv_50_objects_under_3s(self, client: AsyncClient, employee_token: str):
        headers = {"Authorization": f"Bearer {employee_token}"}
        proj = (
            await client.post(
                "/api/v1/projects",
                json={"name": "Exp-50"},
                headers=headers,
            )
        ).json()
        for i in range(50):
            await client.post(
                f"/api/v1/projects/{proj['id']}/objects",
                json={
                    "object_type": "pipe",
                    "sort_order": i,
                    "params": {**PIPE_PARAMS, "name": f"T-{i}"},
                },
                headers=headers,
            )

        start = time.perf_counter()
        resp = await client.get(
            f"/api/v1/projects/{proj['id']}/export-csv",
            headers=headers,
        )
        elapsed_s = time.perf_counter() - start
        assert resp.status_code == 200
        assert elapsed_s < 3.0, f"Экспорт CSV (50 объектов) {elapsed_s:.1f}с — медленно"

    async def test_export_excel_50_objects_under_3s(self, client: AsyncClient, employee_token: str):
        headers = {"Authorization": f"Bearer {employee_token}"}
        proj = (
            await client.post(
                "/api/v1/projects",
                json={"name": "ExpXL-50"},
                headers=headers,
            )
        ).json()
        for i in range(50):
            await client.post(
                f"/api/v1/projects/{proj['id']}/objects",
                json={
                    "object_type": "pipe",
                    "sort_order": i,
                    "params": {**PIPE_PARAMS, "name": f"T-{i}"},
                },
                headers=headers,
            )

        start = time.perf_counter()
        resp = await client.get(
            f"/api/v1/projects/{proj['id']}/objects/export-excel",
            headers=headers,
        )
        elapsed_s = time.perf_counter() - start
        assert resp.status_code == 200
        assert elapsed_s < 3.0


class TestStressLargeProjects:
    """Запас прочности: ≥100 объектов (на NFR-02 ограничено 50).

    Цель — поймать N+1 query, утечки памяти, экспоненциальный рост сложности.
    """

    async def test_100_objects_batch_under_15s(
        self, client: AsyncClient, employee_token: str, monkeypatch
    ):
        from app.services.project_service import settings

        monkeypatch.setattr(settings, "GUEST_MAX_OBJECTS_PER_PROJECT", 250)

        headers = {"Authorization": f"Bearer {employee_token}"}
        proj = (
            await client.post(
                "/api/v1/projects",
                json={"name": "Stress-100"},
                headers=headers,
            )
        ).json()
        for i in range(100):
            await client.post(
                f"/api/v1/projects/{proj['id']}/objects",
                json={
                    "object_type": "pipe",
                    "sort_order": i,
                    "params": {**PIPE_PARAMS, "name": f"S-{i}"},
                },
                headers=headers,
            )

        start = time.perf_counter()
        resp = await client.post(
            "/api/v1/calc/electrical/batch",
            params={"project_id": proj["id"]},
            headers=headers,
        )
        elapsed_s = time.perf_counter() - start

        assert resp.status_code == 200
        assert resp.json()["calculated"] == 100
        # 100 объектов: NFR-02 для 50 = 5с, лимит 15с ловит экспоненциальный рост
        assert elapsed_s < 15.0, f"Stress 100: {elapsed_s:.1f}с — нелинейный рост?"

    async def test_list_objects_for_large_project_under_2s(
        self, client: AsyncClient, employee_token: str, monkeypatch
    ):
        """GET /objects не должен тормозить на 100+ объектах."""
        from app.services.project_service import settings

        monkeypatch.setattr(settings, "GUEST_MAX_OBJECTS_PER_PROJECT", 250)

        headers = {"Authorization": f"Bearer {employee_token}"}
        proj = (
            await client.post(
                "/api/v1/projects",
                json={"name": "List-100"},
                headers=headers,
            )
        ).json()
        for i in range(100):
            await client.post(
                f"/api/v1/projects/{proj['id']}/objects",
                json={
                    "object_type": "pipe",
                    "sort_order": i,
                    "params": {**PIPE_PARAMS, "name": f"L-{i}"},
                },
                headers=headers,
            )

        start = time.perf_counter()
        resp = await client.get(
            f"/api/v1/projects/{proj['id']}/objects",
            headers=headers,
        )
        elapsed_s = time.perf_counter() - start
        assert resp.status_code == 200
        assert len(resp.json()) == 100
        assert elapsed_s < 2.0, f"GET 100 objects: {elapsed_s:.1f}с"


class TestStress1000Objects:
    """Экстремальная нагрузка: 1000 объектов в одном проекте.

    Цель — поймать нелинейную сложность (N+1 query, O(N²) алгоритмы,
    утечки памяти, таймауты SQLAlchemy session). В проде такие проекты
    маловероятны, но крах при их появлении = инцидент.

    Setup делаем bulk-insert через ORM (HTTP POST × 1000 занял бы минуты).
    Меряем только read/batch-операции через HTTP.
    """

    _PIPE_PARAMS = {
        "name": "S",
        "outer_diameter": 0.108,
        "insulation_thickness": 0.05,
        "insulation_material": MINERAL_WOOL,
        "insulation_temperature_basis": "outdoor_winter",
        "ambient_temperature": -20.0,
        "process_temperature": 80.0,
        "pipe_length": 50.0,
    }

    async def _seed_project_with_n_objects(self, db_session, employee_user, n: int):
        """Создаёт проект + n труб прямым insert'ом (без HTTP и без пересчёта)."""
        from app.models.project import Project
        from app.models.project_object import ProjectObject

        proj = Project(
            name=f"Stress-{n}",
            user_id=employee_user.id,
            session_id=None,
        )
        db_session.add(proj)
        await db_session.commit()
        await db_session.refresh(proj)

        # Считаем heat-loss один раз через формулу и переиспользуем — все
        # объекты идентичны, так что результат один. is_valid=True, чтобы
        # batch_calc_electrical не отфильтровал их.
        from app.formulas.heat_loss.pipe import calc_pipe_heat_loss
        from app.schemas.calculation import PipeHeatLossParams

        pipe_params_api = {k: v for k, v in self._PIPE_PARAMS.items() if k != "name"}
        heat_result = calc_pipe_heat_loss(
            PipeHeatLossParams(**pipe_params_api),
            coefficients={"safety_factor": 1.0},
        )
        shared_results = {
            "heat_loss_per_meter_base": heat_result.heat_loss_per_meter_base,
            "total_heat_loss_design": heat_result.total_heat_loss_design,
            "thermal_resistance": heat_result.thermal_resistance,
        }
        objs = [
            ProjectObject(
                project_id=proj.id,
                object_type="pipe",
                sort_order=i,
                params={**self._PIPE_PARAMS, "name": f"S-{i}"},
                results=dict(shared_results),
                is_valid=True,
            )
            for i in range(n)
        ]
        db_session.add_all(objs)
        await db_session.commit()
        return proj

    async def test_list_1000_objects_under_5s(
        self,
        client: AsyncClient,
        employee_token: str,
        employee_user,
        db_session,
        monkeypatch,
    ):
        """GET /objects для 1000 объектов — детектор N+1 query."""
        from app.services.project_service import settings

        monkeypatch.setattr(settings, "GUEST_MAX_OBJECTS_PER_PROJECT", 2000)

        proj = await self._seed_project_with_n_objects(db_session, employee_user, 1000)

        headers = {"Authorization": f"Bearer {employee_token}"}
        start = time.perf_counter()
        resp = await client.get(f"/api/v1/projects/{proj.id}/objects", headers=headers)
        elapsed_s = time.perf_counter() - start

        assert resp.status_code == 200
        body = resp.json()
        assert len(body) == 1000
        # Лимит 5с: если N+1 query, было бы >30с даже в тесте
        assert elapsed_s < 5.0, (
            f"STRESS-1000 GET /objects: {elapsed_s:.1f}с "
            f"— подозрение на N+1 query или неоптимальный ORM-eager"
        )

    async def test_batch_calc_1000_objects_under_90s(
        self,
        client: AsyncClient,
        employee_token: str,
        employee_user,
        db_session,
        monkeypatch,
    ):
        """Batch electrical для 1000 — пропорционально ≤90с (NFR-PERF-02×18).

        NFR-PERF-02 для 50 объектов — 5с. Линейно 1000 → 100с. Даём 90с
        запаса; если дольше — нелинейная сложность. Если быстрее — отлично.
        """
        from app.services.project_service import settings

        monkeypatch.setattr(settings, "GUEST_MAX_OBJECTS_PER_PROJECT", 2000)

        proj = await self._seed_project_with_n_objects(db_session, employee_user, 1000)

        headers = {"Authorization": f"Bearer {employee_token}"}
        start = time.perf_counter()
        resp = await client.post(
            "/api/v1/calc/electrical/batch",
            params={"project_id": str(proj.id)},
            headers=headers,
            timeout=120,
        )
        elapsed_s = time.perf_counter() - start

        assert resp.status_code == 200
        body = resp.json()
        # calculated+skipped == 1000 (каждый объект должен быть обработан)
        total = body.get("calculated", 0) + body.get("skipped", 0)
        assert total == 1000, f"обработано {total} из 1000 объектов"
        # Для идентичных объектов ожидаем, что все успешно подобрались
        assert (
            body["calculated"] == 1000
        ), f"только {body['calculated']}/1000 успешных подборов кабеля"
        assert elapsed_s < 90.0, (
            f"STRESS-1000 batch_calc: {elapsed_s:.1f}с "
            f"(лимит 90с = NFR×18; подозрение на нелинейный рост)"
        )

    async def test_export_csv_1000_objects_under_15s(
        self,
        client: AsyncClient,
        employee_token: str,
        employee_user,
        db_session,
        monkeypatch,
    ):
        """Экспорт одного проекта с 1000 объектов — должен уложиться в 15с."""
        from app.services.project_service import settings

        monkeypatch.setattr(settings, "GUEST_MAX_OBJECTS_PER_PROJECT", 2000)

        proj = await self._seed_project_with_n_objects(db_session, employee_user, 1000)

        headers = {"Authorization": f"Bearer {employee_token}"}
        start = time.perf_counter()
        resp = await client.get(
            f"/api/v1/projects/{proj.id}/export-csv",
            headers=headers,
            timeout=60,
        )
        elapsed_s = time.perf_counter() - start

        assert resp.status_code == 200
        assert elapsed_s < 15.0, f"STRESS-1000 export-csv: {elapsed_s:.1f}с"
        # Проверяем что CSV реально содержит все 1000 объектов
        body = resp.content.decode("utf-8-sig")
        # Каждый объект даёт как минимум одну строку в секции [SECTION];objects
        assert (
            body.count("pipe;") >= 1000
            or body.count(",pipe,") >= 1000
            or body.count(";pipe;") >= 1000
        ), "Не все объекты попали в экспорт"


class TestImportPerformance:
    """Импорт 100 объектов из samples — не должен затягиваться."""

    async def test_import_100_csv_under_15s(self, client: AsyncClient, employee_token: str):
        import pathlib

        sample = pathlib.Path("/app/../docs/samples/sample_import.csv")
        # В контейнере sample_import.csv может лежать иначе — пробуем оба пути
        if not sample.exists():
            sample = pathlib.Path("docs/samples/sample_import.csv")
        if not sample.exists():
            pytest.skip("sample_import.csv недоступен в test-окружении")

        headers = {"Authorization": f"Bearer {employee_token}"}
        proj = (
            await client.post(
                "/api/v1/projects",
                json={"name": "Imp-100"},
                headers=headers,
            )
        ).json()

        start = time.perf_counter()
        resp = await client.post(
            f"/api/v1/projects/{proj['id']}/objects/import-excel",
            files={"file": ("sample.csv", sample.read_bytes(), "text/csv")},
            headers=headers,
        )
        elapsed_s = time.perf_counter() - start
        assert resp.status_code == 200
        body = resp.json()
        assert body["created"] == 100
        # 100 объектов с автопересчётом — лимит 15с (вкл. setup проекта)
        assert elapsed_s < 15.0, f"Импорт 100 объектов {elapsed_s:.1f}с"
