"""Integration-тесты экспорта/импорта проектов в CSV."""

import uuid

import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio(loop_scope="session")


PIPE_PARAMS = {
    "name": "Труба 1",
    "outer_diameter": 0.108,
    "insulation_thickness": 0.05,
    "insulation_material": "mineral_wool",
    "ambient_temperature": -20.0,
    "process_temperature": 80.0,
    "pipe_length": 50.0,
}


async def _add_pipe(client: AsyncClient, project_id: str, headers: dict):
    await client.post(
        f"/api/v1/projects/{project_id}/objects",
        json={"object_type": "pipe", "sort_order": 0, "params": PIPE_PARAMS},
        headers=headers,
    )


class TestSingleExportImport:
    async def test_guest_exports_csv(self, client: AsyncClient, guest_session: str):
        pid = (
            await client.get("/api/v1/projects", headers={"X-Session-Id": guest_session})
        ).json()[0]["id"]
        await _add_pipe(client, pid, {"X-Session-Id": guest_session})

        resp = await client.get(
            f"/api/v1/projects/{pid}/export-csv",
            headers={"X-Session-Id": guest_session},
        )
        assert resp.status_code == 200, resp.text
        assert "text/csv" in resp.headers["content-type"]
        text = resp.content.decode("utf-8-sig")
        assert "[SECTION];metadata" in text
        assert "[SECTION];objects" in text
        assert "Труба 1" in text

    async def test_guest_import_replaces_auto_project(
        self, client: AsyncClient, guest_session: str
    ):
        """Пользователь: импорт замещает авто-проект (GUEST_MAX_PROJECTS=1)."""
        # Экспортируем авто-проект с объектом (на запас, чтобы CSV точно был валидный)
        pid = (
            await client.get("/api/v1/projects", headers={"X-Session-Id": guest_session})
        ).json()[0]["id"]
        await _add_pipe(client, pid, {"X-Session-Id": guest_session})
        csv_bytes = (
            await client.get(
                f"/api/v1/projects/{pid}/export-csv",
                headers={"X-Session-Id": guest_session},
            )
        ).content

        # Меняем имя в CSV — чтобы убедиться что новый проект создаётся из него
        text = csv_bytes.decode("utf-8-sig").replace("name;", "name_placeholder;", 1)
        modified = text.replace("name_placeholder;Мой проект", "name;Импортированный")
        modified_bytes = ("\ufeff" + modified).encode("utf-8")

        resp = await client.post(
            "/api/v1/projects/import-csv",
            files={"file": ("p.csv", modified_bytes, "text/csv")},
            headers={"X-Session-Id": guest_session},
        )
        assert resp.status_code == 201, resp.text
        body = resp.json()
        assert body["session_id"] == guest_session

        # Авто-проект должен быть замещён — у пользователя снова ровно 1 проект
        listing = (
            await client.get("/api/v1/projects", headers={"X-Session-Id": guest_session})
        ).json()
        assert len(listing) == 1
        assert listing[0]["id"] == body["id"]

    async def test_import_rejects_bad_csv(self, client: AsyncClient, guest_session: str):
        resp = await client.post(
            "/api/v1/projects/import-csv",
            files={"file": ("bad.csv", b"not a real export\n", "text/csv")},
            headers={"X-Session-Id": guest_session},
        )
        assert resp.status_code == 422

    async def test_roundtrip_export_import_with_json_commas(
        self, client: AsyncClient, guest_session: str
    ):
        """Regression: JSON-ячейки содержат запятые → csv.Sniffer ранее путал `,` и `;`.
        Теперь разделитель определяется по маркеру `[SECTION]<delim>...`.
        """
        pid = (
            await client.get("/api/v1/projects", headers={"X-Session-Id": guest_session})
        ).json()[0]["id"]
        await _add_pipe(client, pid, {"X-Session-Id": guest_session})

        exp = await client.get(
            f"/api/v1/projects/{pid}/export-csv",
            headers={"X-Session-Id": guest_session},
        )
        assert exp.status_code == 200
        text = exp.content.decode("utf-8-sig")
        # Убеждаемся что JSON с запятыми действительно в файле
        assert "," in text

        # Новый гость — импортирует тот же файл
        other = (await client.post("/api/v1/auth/guest")).json()["session_id"]
        resp = await client.post(
            "/api/v1/projects/import-csv",
            files={"file": ("exp.csv", exp.content, "text/csv")},
            headers={"X-Session-Id": other},
        )
        assert resp.status_code == 201, resp.text
        # Объект восстановлен
        objs = (
            await client.get(
                f"/api/v1/projects/{resp.json()['id']}/objects",
                headers={"X-Session-Id": other},
            )
        ).json()
        assert len(objs) == 1
        assert objs[0]["object_type"] == "pipe"
        assert objs[0]["params"]["outer_diameter"] == 0.108


class TestBulkExportImport:
    async def test_guest_cannot_bulk_export(self, client: AsyncClient, guest_session: str):
        pid = (
            await client.get("/api/v1/projects", headers={"X-Session-Id": guest_session})
        ).json()[0]["id"]
        resp = await client.get(
            f"/api/v1/projects/export-csv-bulk?ids={pid}",
            headers={"X-Session-Id": guest_session},
        )
        assert resp.status_code == 403

    async def test_guest_cannot_bulk_import(self, client: AsyncClient, guest_session: str):
        resp = await client.post(
            "/api/v1/projects/import-csv-bulk",
            files={"file": ("x.csv", b"[SECTION];projects\n", "text/csv")},
            headers={"X-Session-Id": guest_session},
        )
        assert resp.status_code == 403

    async def test_employee_bulk_export_then_import(self, client: AsyncClient, employee_token: str):
        headers = {"Authorization": f"Bearer {employee_token}"}
        p1 = (
            await client.post(
                "/api/v1/projects",
                json={"name": "Проект А", "task_number": "T-A"},
                headers=headers,
            )
        ).json()
        p2 = (
            await client.post(
                "/api/v1/projects",
                json={"name": "Проект Б", "task_number": "T-B"},
                headers=headers,
            )
        ).json()
        await _add_pipe(client, p1["id"], headers)
        await _add_pipe(client, p2["id"], headers)

        exp = await client.get(
            f"/api/v1/projects/export-csv-bulk?ids={p1['id']},{p2['id']}",
            headers=headers,
        )
        assert exp.status_code == 200, exp.text
        text = exp.content.decode("utf-8-sig")
        assert "[SECTION];projects" in text
        assert "Проект А" in text and "Проект Б" in text

        # Импорт того же файла → конфликт по task_number → суффикс
        resp = await client.post(
            "/api/v1/projects/import-csv-bulk",
            files={"file": ("bulk.csv", exp.content, "text/csv")},
            headers=headers,
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["imported"] == 2

        listing = (await client.get("/api/v1/projects", headers=headers)).json()
        names = {p["name"] for p in listing}
        assert "Проект А (импорт)" in names
        assert "Проект Б (импорт)" in names

    async def test_employee_bulk_import_empty_section(
        self, client: AsyncClient, employee_token: str
    ):
        headers = {"Authorization": f"Bearer {employee_token}"}
        resp = await client.post(
            "/api/v1/projects/import-csv-bulk",
            files={"file": ("empty.csv", b"[SECTION];objects\n", "text/csv")},
            headers=headers,
        )
        assert resp.status_code == 422

    async def test_cross_format_single_in_accepts_bulk_export(
        self, client: AsyncClient, employee_token: str
    ):
        """Одиночный импорт принимает пакетный файл — берёт первый проект."""
        headers = {"Authorization": f"Bearer {employee_token}"}
        src = (
            await client.post(
                "/api/v1/projects",
                json={"name": "Cross-A", "task_number": "XA-1"},
                headers=headers,
            )
        ).json()
        await _add_pipe(client, src["id"], headers)

        bulk = await client.get(
            f"/api/v1/projects/export-csv-bulk?ids={src['id']}",
            headers=headers,
        )
        assert bulk.status_code == 200

        resp = await client.post(
            "/api/v1/projects/import-csv",
            files={"file": ("bulk.csv", bulk.content, "text/csv")},
            headers=headers,
        )
        assert resp.status_code == 201, resp.text
        body = resp.json()
        # Имя и task_number получили суффикс из-за конфликта с исходным
        assert "Cross-A" in body["name"]

    async def test_cross_format_bulk_in_accepts_single_export(
        self, client: AsyncClient, employee_token: str
    ):
        """Пакетный импорт принимает одиночный файл — обрабатывает как один проект."""
        headers = {"Authorization": f"Bearer {employee_token}"}
        src = (
            await client.post(
                "/api/v1/projects",
                json={"name": "Cross-B", "task_number": "XB-1"},
                headers=headers,
            )
        ).json()
        await _add_pipe(client, src["id"], headers)

        single = await client.get(
            f"/api/v1/projects/{src['id']}/export-csv",
            headers=headers,
        )
        assert single.status_code == 200

        resp = await client.post(
            "/api/v1/projects/import-csv-bulk",
            files={"file": ("single.csv", single.content, "text/csv")},
            headers=headers,
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["imported"] == 1

    async def test_csv_roundtrip_preserves_params_fully(
        self, client: AsyncClient, employee_token: str
    ):
        """CSV round-trip сохраняет params объектов 1:1, включая `name`."""
        headers = {"Authorization": f"Bearer {employee_token}"}
        src = (
            await client.post(
                "/api/v1/projects",
                json={"name": "CSV-params", "task_number": "CP-1"},
                headers=headers,
            )
        ).json()
        src_params = {
            "name": "Tag-X-7",
            "outer_diameter": 0.159,
            "insulation_thickness": 0.07,
            "insulation_material": "foam_glass",
            "ambient_temperature": -25.0,
            "process_temperature": 95.0,
            "pipe_length": 42.3,
        }
        created = await client.post(
            f"/api/v1/projects/{src['id']}/objects",
            json={"object_type": "pipe", "sort_order": 0, "params": src_params},
            headers=headers,
        )
        assert created.status_code == 201, created.text
        stored_params = created.json()["params"]
        assert stored_params["name"] == src_params["name"]
        exp = await client.get(
            f"/api/v1/projects/{src['id']}/export-csv",
            headers=headers,
        )
        resp = await client.post(
            "/api/v1/projects/import-csv",
            files={"file": ("p.csv", exp.content, "text/csv")},
            headers=headers,
        )
        assert resp.status_code == 201
        restored = (
            await client.get(
                f"/api/v1/projects/{resp.json()['id']}/objects",
                headers=headers,
            )
        ).json()
        assert restored[0]["params"] == stored_params

    async def test_bulk_export_with_multiple_projects(
        self, client: AsyncClient, employee_token: str
    ):
        """Пакетный экспорт N проектов → один CSV → bulk-импорт создаёт N проектов."""
        headers = {"Authorization": f"Bearer {employee_token}"}
        ids = []
        for i in range(3):
            p = (
                await client.post(
                    "/api/v1/projects",
                    json={"name": f"Multi-{i}", "task_number": f"MM-{i}"},
                    headers=headers,
                )
            ).json()
            await _add_pipe(client, p["id"], headers)
            ids.append(p["id"])

        exp = await client.get(
            f"/api/v1/projects/export-csv-bulk?ids={','.join(ids)}",
            headers=headers,
        )
        assert exp.status_code == 200

        resp = await client.post(
            "/api/v1/projects/import-csv-bulk",
            files={"file": ("m.csv", exp.content, "text/csv")},
            headers=headers,
        )
        body = resp.json()
        assert body["imported"] == 3
        assert body["errors"] == []

    async def test_import_rejects_empty_file(self, client: AsyncClient, guest_session: str):
        resp = await client.post(
            "/api/v1/projects/import-csv",
            files={"file": ("empty.csv", b"", "text/csv")},
            headers={"X-Session-Id": guest_session},
        )
        assert resp.status_code == 422

    async def test_export_includes_electrical_and_specifications(
        self, client: AsyncClient, employee_token: str
    ):
        """После batch_calc_electrical и generate spec — экспорт включает их секции."""
        headers = {"Authorization": f"Bearer {employee_token}"}
        p = (
            await client.post(
                "/api/v1/projects",
                json={"name": "Full"},
                headers=headers,
            )
        ).json()
        await _add_pipe(client, p["id"], headers)
        # Запускаем электрорасчёт
        await client.post(
            "/api/v1/calc/electrical/batch",
            params={"project_id": p["id"]},
            headers=headers,
        )
        # Генерируем спецификацию
        await client.post(
            f"/api/v1/specifications/{p['id']}/generate",
            headers=headers,
        )
        # Экспорт
        exp = await client.get(
            f"/api/v1/projects/{p['id']}/export-csv",
            headers=headers,
        )
        text = exp.content.decode("utf-8-sig")
        assert "[SECTION];metadata" in text
        assert "[SECTION];objects" in text
        assert "[SECTION];electrical" in text
        assert "[SECTION];specifications" in text

    async def test_bulk_export_empty_ids_400(self, client: AsyncClient, employee_token: str):
        resp = await client.get(
            "/api/v1/projects/export-csv-bulk?ids=",
            headers={"Authorization": f"Bearer {employee_token}"},
        )
        assert resp.status_code == 422

    async def test_bulk_export_invalid_uuid_422(self, client: AsyncClient, employee_token: str):
        resp = await client.get(
            "/api/v1/projects/export-csv-bulk?ids=not-a-uuid",
            headers={"Authorization": f"Bearer {employee_token}"},
        )
        assert resp.status_code == 422

    async def test_bulk_import_with_empty_project_key_skipped(
        self, client: AsyncClient, employee_token: str
    ):
        """Строки секции projects с пустым project_key/name пропускаются с ошибкой."""
        headers = {"Authorization": f"Bearer {employee_token}"}
        # CSV вручную: 2 проекта, второй с пустым ключом
        csv = (
            b"[SECTION];projects\n"
            b"project_key;name;task_number;description;status\n"
            b"p1;Valid;T-V;;draft\n"
            b";Invalid;T-X;;draft\n"
            b"\n"
            b"[SECTION];objects\n"
            b"project_key;type;name;sort_order;params;results;is_valid;validation_errors\n"
        )

        resp = await client.post(
            "/api/v1/projects/import-csv-bulk",
            files={"file": ("x.csv", csv, "text/csv")},
            headers=headers,
        )
        body = resp.json()
        assert body["imported"] == 1
        assert len(body["errors"]) == 1
        assert "project_key" in body["errors"][0]["error"] or "name" in body["errors"][0]["error"]

    async def test_bulk_import_rolls_back_failed_project_and_continues(
        self, client: AsyncClient, employee_token: str
    ):
        headers = {"Authorization": f"Bearer {employee_token}"}
        suffix = uuid.uuid4().hex[:8]
        bad_task = f"BULK-BAD-{suffix}"
        ok_task = f"BULK-OK-{suffix}"
        ok_params = (
            "{"
            '""name"": ""Valid pipe"",'
            '""outer_diameter"": 0.108,'
            '""insulation_thickness"": 0.05,'
            '""insulation_material"": ""mineral_wool"",'
            '""ambient_temperature"": -20,'
            '""process_temperature"": 80,'
            '""pipe_length"": 50'
            "}"
        )
        csv = (
            "[SECTION];projects\n"
            "project_key;name;task_number;description;status\n"
            f"bad;Broken;{bad_task};;draft\n"
            f"ok;Valid;{ok_task};;draft\n"
            "\n"
            "[SECTION];objects\n"
            "project_key;object_key;type;name;sort_order;params;results;is_valid;validation_errors\n"
            "bad;o1;pipe;Broken pipe;0;{bad;;; \n"
            f'ok;o2;pipe;Valid pipe;0;"{ok_params}";;true;\n'
        ).encode()

        resp = await client.post(
            "/api/v1/projects/import-csv-bulk",
            files={"file": ("bulk.csv", csv, "text/csv")},
            headers=headers,
        )

        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["imported"] == 1
        assert len(body["errors"]) == 1
        assert body["errors"][0]["project_key"] == "bad"

        projects = (
            await client.get(
                "/api/v1/projects",
                headers=headers,
            )
        ).json()
        by_task = {project.get("task_number"): project for project in projects}
        assert bad_task not in by_task
        assert ok_task in by_task

    async def test_export_unknown_project_404(self, client: AsyncClient, employee_token: str):
        resp = await client.get(
            "/api/v1/projects/00000000-0000-0000-0000-000000000000/export-csv",
            headers={"Authorization": f"Bearer {employee_token}"},
        )
        assert resp.status_code == 404

    async def test_bulk_import_repeat_without_MultipleResultsFound(
        self, client: AsyncClient, employee_token: str
    ):
        """Regression: повторный bulk-импорт одного файла не падает с MultipleResultsFound.
        Раньше scalar_one_or_none() падал если у сотрудника уже 2+ проектов с таким task_number.
        """
        headers = {"Authorization": f"Bearer {employee_token}"}
        src = (
            await client.post(
                "/api/v1/projects",
                json={"name": "Repeat", "task_number": "REP-1"},
                headers=headers,
            )
        ).json()
        bulk = await client.get(
            f"/api/v1/projects/export-csv-bulk?ids={src['id']}",
            headers=headers,
        )
        for _ in range(3):
            resp = await client.post(
                "/api/v1/projects/import-csv-bulk",
                files={"file": ("b.csv", bulk.content, "text/csv")},
                headers=headers,
            )
            assert resp.status_code == 200, resp.text
