"""Integration-тесты отчётов."""

from uuid import UUID, uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.background_task import BackgroundTask
from app.models.user import User
from app.services.report_artifact_service import write_report_artifact

pytestmark = pytest.mark.asyncio(loop_scope="session")


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
            "params": {
                "outer_diameter": 0.1,
                "insulation_thickness": 0.05,
                "insulation_material": "mineral_wool",
                "ambient_temperature": -20,
                "process_temperature": 80,
                "pipe_length": 10,
            },
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
            "params": {
                "outer_diameter": 0.1,
                "insulation_thickness": 0.05,
                "insulation_material": "mineral_wool",
                "ambient_temperature": -20,
                "process_temperature": 80,
                "pipe_length": 10,
            },
        },
        headers=headers,
    )
    return p["id"]


class TestReports:
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
        self, client: AsyncClient, employee_token: str
    ):
        pid = await _employee_project_with_object(client, employee_token)
        resp = await client.post(
            f"/api/v1/reports/{pid}/export/xlsx/jobs",
            params={"variant_number": 2},
            headers={"Authorization": f"Bearer {employee_token}"},
        )
        assert resp.status_code == 202
        task = resp.json()
        assert task["type"] == "report_export"
        assert task["project_id"] == pid
        assert task["links"]["result"].endswith(f"/reports/jobs/{task['id']}/download")

        status_resp = await client.get(
            f"/api/v1/reports/jobs/{task['id']}",
            headers={"Authorization": f"Bearer {employee_token}"},
        )
        assert status_resp.status_code == 200
        assert status_resp.json()["id"] == task["id"]

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
        task_id = uuid4()
        artifact = write_report_artifact(task_id, "xlsx", b"report-bytes")
        task = BackgroundTask(
            id=task_id,
            type="report_export",
            status="succeeded",
            project_id=UUID(pid),
            user_id=employee_user.id,
            request_payload={
                "project_id": pid,
                "format": "xlsx",
                "variant_number": 1,
                "sections": None,
            },
            result_payload={
                "project_id": pid,
                "format": "xlsx",
                "variant_number": 1,
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
        task_id = uuid4()
        task = BackgroundTask(
            id=task_id,
            type="report_export",
            status="running",
            project_id=UUID(pid),
            user_id=employee_user.id,
            request_payload={"project_id": pid, "format": "xlsx", "sections": None},
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
