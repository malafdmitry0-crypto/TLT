"""Integration-тесты отчётов."""

import html as html_lib
import re
from uuid import UUID, uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.audit_event import AuditEvent
from app.models.background_task import BackgroundTask
from app.models.user import User
from app.services.report_artifact_service import write_report_artifact
from app.tests.heat_fixtures import canonical_pipe_params, canonical_tank_params

pytestmark = pytest.mark.asyncio(loop_scope="session")


class FakeTaskQueue:
    async def enqueue(self, task_id, task_type: str) -> str:
        return f"stream:{task_id}:{task_type}"


def _report_row_cells(report_html: str, object_name: str) -> list[str]:
    row_html = next(
        (
            row
            for row in re.findall(r"<tr>.*?</tr>", report_html, flags=re.DOTALL)
            if re.search(rf"<td>{re.escape(object_name)}</td>", row)
        ),
        None,
    )
    assert row_html is not None, f"Report row not found: {object_name}"
    cells = re.findall(r"<td[^>]*>(.*?)</td>", row_html, flags=re.DOTALL)
    return [
        " ".join(html_lib.unescape(re.sub(r"<[^>]+>", " ", cell)).split())
        for cell in cells
    ]


async def _project_with_object(client: AsyncClient, session_id: str) -> str:
    p = (
        await client.get(
            "/api/v1/projects",
            headers={"X-Session-Id": session_id},
        )
    ).json()[0]
    await client.post(
        f"/api/v1/projects/{p['id']}/objects",
        json={
            "object_type": "pipe",
            "params": canonical_pipe_params(
                ambient_temperature=-20.0,
                pipe_length=10.0,
            ),
        },
        headers={"X-Session-Id": session_id},
    )
    return p["id"]


async def _employee_project_with_object(client: AsyncClient, token: str) -> str:
    headers = {"Authorization": f"Bearer {token}"}
    p = (
        await client.post(
            "/api/v1/projects",
            json={"name": "Report project"},
            headers=headers,
        )
    ).json()
    await client.post(
        f"/api/v1/projects/{p['id']}/objects",
        json={
            "object_type": "pipe",
            "params": canonical_pipe_params(
                ambient_temperature=-20.0,
                pipe_length=10.0,
            ),
        },
        headers=headers,
    )
    return p["id"]


async def _initialize_and_create_second_variant(
    client: AsyncClient,
    project_id: str,
    token: str,
) -> dict:
    headers = {"Authorization": f"Bearer {token}"}
    initialized = await client.post(
        f"/api/v1/projects/{project_id}/electrical-variants/initialize",
        headers=headers,
    )
    assert initialized.status_code == 200, initialized.text

    created = await client.post(
        f"/api/v1/projects/{project_id}/electrical-variants",
        json={"name": "ЭР2"},
        headers=headers,
    )
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["project_id"] == project_id
    return body


class TestReports:
    async def test_report_job_requires_electrical_variant_uuid(
        self,
        client: AsyncClient,
        employee_token: str,
    ):
        pid = await _employee_project_with_object(client, employee_token)
        response = await client.post(
            f"/api/v1/reports/{pid}/export/xlsx/jobs",
            params={"variant_number": 2},
            headers={"Authorization": f"Bearer {employee_token}"},
        )

        assert response.status_code == 422, response.text
        assert "electrical_variant_id" in response.text

    async def test_report_job_does_not_create_variants_for_removed_numeric_selector(
        self,
        client: AsyncClient,
        employee_token: str,
    ):
        pid = await _employee_project_with_object(client, employee_token)
        headers = {"Authorization": f"Bearer {employee_token}"}

        response = await client.post(
            f"/api/v1/reports/{pid}/export/xlsx/jobs",
            params={"variant_number": 4},
            headers=headers,
        )

        assert response.status_code == 422, response.text
        variants = await client.get(
            f"/api/v1/projects/{pid}/electrical-variants",
            headers=headers,
        )
        assert variants.status_code == 200, variants.text
        assert variants.json() == []

    async def test_preview_multi_er_independent_chapters(
        self, client: AsyncClient, employee_token: str
    ):
        """PDL-ER-39: multi-ЭР preview lists independent chapters without mixing."""
        headers = {"Authorization": f"Bearer {employee_token}"}
        project = (
            await client.post("/api/v1/projects", json={"name": "Multi Report"}, headers=headers)
        ).json()
        pid = project["id"]
        await client.post(
            f"/api/v1/projects/{pid}/objects",
            json={
                "object_type": "pipe",
                "params": canonical_pipe_params(
                    ambient_temperature=-30,
                    max_ambient_temperature=25,
                    pipe_length=50,
                ),
            },
            headers=headers,
        )
        init = await client.post(
            f"/api/v1/projects/{pid}/electrical-variants/initialize",
            headers=headers,
        )
        assert init.status_code in (200, 201), init.text
        er1 = init.json()["variant"]
        created = await client.post(
            f"/api/v1/projects/{pid}/electrical-variants",
            json={"name": "ЭР2-report"},
            headers={**headers, "Idempotency-Key": "report-multi-er-2"},
        )
        assert created.status_code in (200, 201), created.text
        er2 = created.json()
        if "variant" in er2:
            er2 = er2["variant"]
        resp = await client.get(
            f"/api/v1/reports/{pid}/preview",
            params=[
                ("electrical_variant_ids", er1["id"]),
                ("electrical_variant_ids", er2["id"]),
                ("sections", "summary"),
                ("sections", "pipes"),
            ],
            headers=headers,
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body.get("chapters") is not None
        assert len(body["chapters"]) == 2
        names = {c.get("electrical_variant_name") for c in body["chapters"]}
        assert er1["name"] in names
        assert er2["name"] in names
        assert "Глава:" in body["html"] or er1["name"] in body["html"]
        assert body["html"].count("Tокр. min, °C") == 2
        assert body["html"].count("Tокр. max, °C") == 2
        assert body["html"].count(
            "Tокр. max — справочное значение; в текущем расчёте не используется."
        ) == 2

    async def test_preview_distinguishes_ambient_bounds_by_object_context(
        self,
        client: AsyncClient,
        employee_token: str,
    ):
        headers = {"Authorization": f"Bearer {employee_token}"}
        project = (
            await client.post(
                "/api/v1/projects",
                json={"name": "Ambient bounds report"},
                headers=headers,
            )
        ).json()
        pid = project["id"]
        fixtures = [
            (
                "pipe",
                canonical_pipe_params(
                    name="Pipe filled maximum",
                    ambient_temperature=-30,
                    max_ambient_temperature=25,
                ),
            ),
            (
                "pipe",
                canonical_pipe_params(
                    name="Pipe empty maximum",
                    ambient_temperature=-20,
                ),
            ),
            (
                "pipe",
                canonical_pipe_params(
                    name="Pipe zero maximum",
                    ambient_temperature=-10,
                    max_ambient_temperature=0,
                ),
            ),
            (
                "pipe",
                canonical_pipe_params(
                    name="Pipe underground stale air",
                    placement="underground",
                    insulation_temperature_basis="channel",
                    ambient_temperature=-60,
                    max_ambient_temperature=35,
                    pipe_centerline_depth=0.4,
                    ground_temperature=0,
                    ground_type="sand_1600_w238",
                    ground_conductivity=2.02,
                ),
            ),
            (
                "tank",
                canonical_tank_params(
                    name="Tank underground bounds",
                    placement="underground",
                    insulation_temperature_basis="channel",
                    ambient_temperature=-15,
                    max_ambient_temperature=30,
                    ground_temperature=5,
                    tank_buried_height=1,
                    ground_type="dry_sand",
                    ground_conductivity=0.8,
                ),
            ),
        ]
        for object_type, params in fixtures:
            created = await client.post(
                f"/api/v1/projects/{pid}/objects",
                json={"object_type": object_type, "params": params},
                headers=headers,
            )
            assert created.status_code == 201, created.text

        preview = await client.get(
            f"/api/v1/reports/{pid}/preview",
            params=[
                ("variant_number", "1"),
                ("sections", "pipes"),
                ("sections", "tanks"),
            ],
            headers=headers,
        )
        assert preview.status_code == 200, preview.text
        report_html = preview.json()["html"]
        assert report_html.count("Tокр. min, °C") == 2
        assert report_html.count("Tокр. max, °C") == 2
        assert report_html.count(
            "Tокр. max — справочное значение; в текущем расчёте не используется."
        ) == 2

        filled_pipe = _report_row_cells(report_html, "Pipe filled maximum")
        empty_pipe = _report_row_cells(report_html, "Pipe empty maximum")
        zero_pipe = _report_row_cells(report_html, "Pipe zero maximum")
        underground_pipe = _report_row_cells(report_html, "Pipe underground stale air")
        underground_tank = _report_row_cells(report_html, "Tank underground bounds")
        assert filled_pipe[6:9] == ["-30.0", "25.0", "80.0"]
        assert empty_pipe[6:9] == ["-20.0", "—", "80.0"]
        assert zero_pipe[6:9] == ["-10.0", "0.0", "80.0"]
        assert underground_pipe[6:9] == ["—", "—", "80.0"]
        assert underground_tank[6:9] == ["-15.0", "30.0", "70.0"]
        for row in (filled_pipe, empty_pipe, zero_pipe, underground_pipe):
            assert row[9] != "—"
            assert row[10] != "—"
        assert underground_tank[12] != "—"
        assert underground_tank[13] != "—"

    async def test_preview_returns_html(self, client: AsyncClient, guest_session: str):
        pid = await _project_with_object(client, guest_session)
        resp = await client.get(
            f"/api/v1/reports/{pid}/preview",
            params={"variant_number": 1},
            headers={"X-Session-Id": guest_session},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert "<html" in body["html"]
        assert "data" not in body
        assert body["sections"] == [
            "summary",
            "pipes",
            "tanks",
            "electrical",
            "specification",
        ]
        assert body["variant_number"] == 1

    async def test_preview_requires_explicit_variant_number(
        self, client: AsyncClient, guest_session: str
    ):
        pid = await _project_with_object(client, guest_session)
        resp = await client.get(
            f"/api/v1/reports/{pid}/preview",
            headers={"X-Session-Id": guest_session},
        )
        assert resp.status_code == 422

    async def test_preview_excludes_stale_specification_quantities(
        self, client: AsyncClient, employee_token: str, db_session
    ):
        """PDL-ER-37: stale specification items must not appear in report output."""
        from datetime import UTC, datetime
        from uuid import UUID

        from sqlalchemy import select

        from app.models.specification import Specification

        headers = {"Authorization": f"Bearer {employee_token}"}
        project = (
            await client.post(
                "/api/v1/projects", json={"name": "Stale Spec Report"}, headers=headers
            )
        ).json()
        pid = project["id"]
        init = await client.post(
            f"/api/v1/projects/{pid}/electrical-variants/initialize",
            headers=headers,
        )
        # initialize may fail without objects — add pipe first
        await client.post(
            f"/api/v1/projects/{pid}/objects",
            json={
                "object_type": "pipe",
                "params": canonical_pipe_params(
                    ambient_temperature=-30,
                    pipe_length=50,
                ),
            },
            headers=headers,
        )
        init = await client.post(
            f"/api/v1/projects/{pid}/electrical-variants/initialize",
            headers=headers,
        )
        assert init.status_code in (200, 201), init.text
        er = init.json()["variant"]
        save = await client.put(
            f"/api/v1/specifications/{pid}/variants/{er['id']}/items",
            json={
                "items": [
                    {
                        "category": "Кабель",
                        "name": "Греющий кабель SECRET-MARK",
                        "article": "ART-1",
                        "unit": "м",
                        "quantity": 123.45,
                        "source": "manual",
                    }
                ]
            },
            headers=headers,
        )
        assert save.status_code == 200, save.text

        result = await db_session.execute(
            select(Specification).where(Specification.project_id == UUID(pid))
        )
        spec = result.scalars().first()
        assert spec is not None
        assert any("SECRET-MARK" in str(item) for item in (spec.items or []))
        spec.is_stale = True
        spec.stale_reason = "object_updated"
        spec.stale_at = datetime.now(UTC)
        await db_session.commit()

        preview = await client.get(
            f"/api/v1/reports/{pid}/preview",
            params=[
                ("electrical_variant_id", er["id"]),
                ("sections", "specification"),
            ],
            headers=headers,
        )
        assert preview.status_code == 200, preview.text
        html = preview.json()["html"]
        assert "устарела" in html.lower() or "PDL-ER-37" in html
        assert "SECRET-MARK" not in html
        assert "123.45" not in html

    async def test_preview_by_electrical_variant_id_alone(
        self, client: AsyncClient, guest_session: str
    ):
        """Phase 5: UUID is sufficient; legacy variant_number is optional."""
        headers = {"X-Session-Id": guest_session}
        pid = await _project_with_object(client, guest_session)
        init = await client.post(
            f"/api/v1/projects/{pid}/electrical-variants/initialize",
            headers=headers,
        )
        assert init.status_code in (200, 201), init.text
        er = init.json()["variant"]
        resp = await client.get(
            f"/api/v1/reports/{pid}/preview",
            params={"electrical_variant_id": er["id"]},
            headers=headers,
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["electrical_variant_id"] == er["id"]
        assert body["electrical_variant_name"] == er["name"]
        assert "<html" in body["html"]

    async def test_guest_cannot_export(self, client: AsyncClient, guest_session: str):
        pid = await _project_with_object(client, guest_session)
        resp = await client.get(
            f"/api/v1/reports/{pid}/export/xlsx",
            params={"variant_number": 1},
            headers={"X-Session-Id": guest_session},
        )
        assert resp.status_code == 403

    async def test_employee_export_xlsx(self, client: AsyncClient, employee_token: str):
        pid = await _employee_project_with_object(client, employee_token)
        resp = await client.get(
            f"/api/v1/reports/{pid}/export/xlsx",
            params={"variant_number": 1},
            headers={"Authorization": f"Bearer {employee_token}"},
        )
        assert resp.status_code == 200
        assert resp.headers["content-type"].startswith(
            "application/vnd.openxmlformats-officedocument.spreadsheetml"
        )

    async def test_employee_can_enqueue_report_export_job(
        self,
        client: AsyncClient,
        employee_token: str,
        db_session: AsyncSession,
    ):
        pid = await _employee_project_with_object(client, employee_token)
        variant = await _initialize_and_create_second_variant(client, pid, employee_token)
        resp = await client.post(
            f"/api/v1/reports/{pid}/export/xlsx/jobs",
            params={"electrical_variant_id": variant["id"]},
            headers={"Authorization": f"Bearer {employee_token}"},
        )
        assert resp.status_code == 202
        task = resp.json()
        assert task["type"] == "report_export"
        assert task["project_id"] == pid
        assert task["electrical_variant_id"] == variant["id"]
        assert task["links"]["result"].endswith(f"/reports/jobs/{task['id']}/download")

        audit = await db_session.scalar(
            select(AuditEvent).where(
                AuditEvent.event_type == "task.report_export.queued",
                AuditEvent.task_id == UUID(task["id"]),
            )
        )
        assert audit is not None
        assert audit.details["electrical_variant_id"] == variant["id"]
        assert "variant_number" not in audit.details

        status_resp = await client.get(
            f"/api/v1/reports/jobs/{task['id']}",
            headers={"Authorization": f"Bearer {employee_token}"},
        )
        assert status_resp.status_code == 200
        assert status_resp.json()["id"] == task["id"]

    async def test_project_scoped_report_key_rejects_different_er_or_payload(
        self,
        client: AsyncClient,
        employee_token: str,
        db_session: AsyncSession,
        monkeypatch: pytest.MonkeyPatch,
    ):
        monkeypatch.setattr("app.services.tasks.creation.TaskQueue", FakeTaskQueue)
        pid = await _employee_project_with_object(client, employee_token)
        second_variant = await _initialize_and_create_second_variant(
            client,
            pid,
            employee_token,
        )
        headers = {
            "Authorization": f"Bearer {employee_token}",
            "Idempotency-Key": "report-one-key-one-operation",
        }
        variants = await client.get(
            f"/api/v1/projects/{pid}/electrical-variants",
            headers=headers,
        )
        assert variants.status_code == 200, variants.text
        first_variant = variants.json()[0]
        url = f"/api/v1/reports/{pid}/export/xlsx/jobs"
        first_params = [
            ("electrical_variant_id", first_variant["id"]),
            ("sections", "summary"),
        ]

        first = await client.post(url, params=first_params, headers=headers)
        retry = await client.post(url, params=first_params, headers=headers)
        different_er = await client.post(
            url,
            params=[
                ("electrical_variant_id", second_variant["id"]),
                ("sections", "summary"),
            ],
            headers=headers,
        )
        different_payload = await client.post(
            url,
            params=[
                ("electrical_variant_id", first_variant["id"]),
                ("sections", "pipes"),
            ],
            headers=headers,
        )

        assert first.status_code == 202, first.text
        assert retry.status_code == 202, retry.text
        assert retry.json()["id"] == first.json()["id"]
        for conflict in (different_er, different_payload):
            assert conflict.status_code == 409, conflict.text
            assert conflict.json()["detail"] == {
                "code": "TASK_IDEMPOTENCY_KEY_REUSED",
                "message": "Idempotency-Key уже использован для другой операции",
            }

        persisted = await db_session.get(BackgroundTask, UUID(first.json()["id"]))
        assert persisted is not None
        persisted.status = "succeeded"
        await db_session.commit()
        terminal_retry = await client.post(url, params=first_params, headers=headers)

        assert terminal_retry.status_code == 202, terminal_retry.text
        assert terminal_retry.json()["id"] == first.json()["id"]
        assert terminal_retry.json()["status"] == "succeeded"
        terminal_replay_audit = await db_session.scalar(
            select(AuditEvent).where(
                AuditEvent.event_type == "task.report_export.idempotency_replayed",
                AuditEvent.task_id == UUID(first.json()["id"]),
                AuditEvent.result == "success",
            )
        )
        assert terminal_replay_audit is not None
        assert terminal_replay_audit.message == (
            "Идемпотентный повтор вернул существующую задачу экспорта отчёта"
        )
        assert terminal_replay_audit.details["idempotency_replay"] is True
        assert terminal_replay_audit.details["task_status"] == "succeeded"

    async def test_employee_can_download_finished_report_job(
        self,
        client: AsyncClient,
        employee_token: str,
        employee_user: User,
        db_session: AsyncSession,
        tmp_path,
        monkeypatch,
    ):
        monkeypatch.setattr(settings, "REPORT_ARTIFACT_DIR", str(tmp_path))
        pid = await _employee_project_with_object(client, employee_token)
        initialized = await client.post(
            f"/api/v1/projects/{pid}/electrical-variants/initialize",
            headers={"Authorization": f"Bearer {employee_token}"},
        )
        assert initialized.status_code == 200, initialized.text
        variant_id = UUID(initialized.json()["variant"]["id"])
        task_id = uuid4()
        artifact = write_report_artifact(task_id, "xlsx", b"report-bytes")
        task = BackgroundTask(
            id=task_id,
            type="report_export",
            status="succeeded",
            project_id=UUID(pid),
            electrical_variant_id=variant_id,
            user_id=employee_user.id,
            request_payload={
                "project_id": pid,
                "format": "xlsx",
                "electrical_variant_id": str(variant_id),
                "sections": None,
            },
            result_payload={
                "project_id": pid,
                "format": "xlsx",
                "electrical_variant_id": str(variant_id),
                "filename": "report.xlsx",
                "media_type": ("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
                "download_url": f"/api/v1/reports/jobs/{task_id}/download",
                **artifact,
            },
            progress_current=3,
            progress_total=3,
            progress_phase="done",
        )
        db_session.add(task)
        await db_session.commit()

        resp = await client.get(
            f"/api/v1/reports/jobs/{task_id}/download",
            headers={"Authorization": f"Bearer {employee_token}"},
        )

        assert resp.status_code == 200
        assert resp.content == b"report-bytes"
        assert resp.headers["content-type"].startswith(
            "application/vnd.openxmlformats-officedocument.spreadsheetml"
        )

    async def test_report_job_download_returns_409_until_ready(
        self,
        client: AsyncClient,
        employee_token: str,
        employee_user: User,
        db_session: AsyncSession,
    ):
        pid = await _employee_project_with_object(client, employee_token)
        initialized = await client.post(
            f"/api/v1/projects/{pid}/electrical-variants/initialize",
            headers={"Authorization": f"Bearer {employee_token}"},
        )
        assert initialized.status_code == 200, initialized.text
        variant_id = UUID(initialized.json()["variant"]["id"])
        task_id = uuid4()
        task = BackgroundTask(
            id=task_id,
            type="report_export",
            status="running",
            project_id=UUID(pid),
            electrical_variant_id=variant_id,
            user_id=employee_user.id,
            request_payload={
                "project_id": pid,
                "electrical_variant_id": str(variant_id),
                "format": "xlsx",
                "sections": None,
            },
            progress_current=1,
            progress_total=3,
            progress_phase="render",
        )
        db_session.add(task)
        await db_session.commit()

        resp = await client.get(
            f"/api/v1/reports/jobs/{task_id}/download",
            headers={"Authorization": f"Bearer {employee_token}"},
        )

        assert resp.status_code == 409
        assert resp.json()["detail"] == "Отчёт ещё не готов"

    async def test_preview_without_electrical_returns_partial_report(
        self, client: AsyncClient, guest_session: str
    ):
        """Отчёт доступен после Шага 1 (только теплопотери), не падает без электрорасчёта и спецификации."""
        pid = await _project_with_object(client, guest_session)
        resp = await client.get(
            f"/api/v1/reports/{pid}/preview",
            params={"variant_number": 1},
            headers={"X-Session-Id": guest_session},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert "<html" in body["html"]
        assert "data" not in body
        assert "Трубопроводы" in body["html"]
