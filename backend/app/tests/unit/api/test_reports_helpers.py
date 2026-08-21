"""Unit-тесты helpers API отчётов."""

import inspect
import uuid
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from starlette.requests import Request

from app.api.v1 import reports as reports_api
from app.api.v1.reports import _raise_project_error, _raise_task_error
from app.core.dependencies import CurrentPrincipal
from app.schemas.report import ReportChapterMeta, ReportPreviewResponse
from app.services.project_service import ProjectAccessError, ProjectNotFoundError
from app.services.report_service import ReportError, ReportService
from app.services.task_service import TaskAccessError, TaskLimitError, TaskNotFoundError


def _request() -> Request:
    return Request(
        {
            "type": "http",
            "method": "GET",
            "path": "/api/v1/reports/test",
            "headers": [],
            "client": ("127.0.0.1", 12345),
        }
    )


def _allow_variant(monkeypatch: pytest.MonkeyPatch, variant_id: uuid.UUID) -> None:
    class FakeElectricalVariantService:
        def __init__(self, db) -> None:
            self.db = db

        async def require_variant_for_read(self, project_id, principal, requested_id):
            assert requested_id == variant_id
            return SimpleNamespace(id=variant_id, name="ЭР UUID")

    monkeypatch.setattr(reports_api, "ElectricalVariantService", FakeElectricalVariantService)


def test_report_runtime_contract_has_no_numeric_variant_surface() -> None:
    assert "variant_number" not in ReportPreviewResponse.model_fields
    assert "variant_number" not in ReportChapterMeta.model_fields
    assert "variant_number" not in inspect.signature(reports_api.preview).parameters
    assert "variant_number" not in inspect.signature(reports_api.export).parameters
    assert "variant_number" not in inspect.getsource(ReportService)


@pytest.mark.parametrize(
    ("exc", "status_code"),
    [
        (TaskNotFoundError("missing"), 404),
        (TaskAccessError("denied"), 403),
        (ValueError("bad request"), 400),
    ],
)
def test_raise_task_error_maps_known_errors(exc: Exception, status_code: int):
    with pytest.raises(HTTPException) as err:
        _raise_task_error(exc)

    assert err.value.status_code == status_code
    assert err.value.detail == str(exc)


def test_raise_task_error_reraises_unknown_errors():
    exc = RuntimeError("boom")

    with pytest.raises(RuntimeError, match="boom"):
        _raise_task_error(exc)


def test_raise_task_error_maps_task_limit_to_retryable_429():
    exc = TaskLimitError("too many tasks")

    with pytest.raises(HTTPException) as err:
        _raise_task_error(exc)

    assert err.value.status_code == 429
    assert err.value.detail == "too many tasks"
    assert err.value.headers == {"Retry-After": "3600"}


@pytest.mark.parametrize(
    ("exc", "status_code"),
    [
        (ProjectNotFoundError("missing project"), 404),
        (ProjectAccessError("denied project"), 403),
    ],
)
def test_raise_project_error_maps_known_errors(exc: Exception, status_code: int):
    with pytest.raises(HTTPException) as err:
        _raise_project_error(exc)

    assert err.value.status_code == status_code
    assert err.value.detail == str(exc)


def test_raise_project_error_reraises_unknown_errors():
    exc = RuntimeError("boom")

    with pytest.raises(RuntimeError, match="boom"):
        _raise_project_error(exc)


async def test_preview_maps_project_errors(monkeypatch: pytest.MonkeyPatch):
    variant_id = uuid.uuid4()
    _allow_variant(monkeypatch, variant_id)

    class FakeReportService:
        def __init__(self, db) -> None:
            self.db = db

        async def preview(
            self,
            project_id,
            sections,
            *,
            principal,
            electrical_variant_id=variant_id,
            electrical_variant_name=None,
        ):
            raise ProjectNotFoundError("missing project")

    monkeypatch.setattr(reports_api, "ReportService", FakeReportService)

    with pytest.raises(HTTPException) as err:
        await reports_api.preview(
            uuid.uuid4(),
            _request(),
            sections=None,
            electrical_variant_id=variant_id,
            electrical_variant_ids=None,
            principal=CurrentPrincipal(role="guest", session_id="sid"),
            db=object(),
        )

    assert err.value.status_code == 404
    assert err.value.detail == "missing project"


async def test_preview_maps_report_errors(monkeypatch: pytest.MonkeyPatch):
    variant_id = uuid.uuid4()
    _allow_variant(monkeypatch, variant_id)

    class FakeReportService:
        def __init__(self, db) -> None:
            self.db = db

        async def preview(
            self,
            project_id,
            sections,
            *,
            principal,
            electrical_variant_id=variant_id,
            electrical_variant_name=None,
        ):
            raise ReportError("bad report")

    monkeypatch.setattr(reports_api, "ReportService", FakeReportService)

    with pytest.raises(HTTPException) as err:
        await reports_api.preview(
            uuid.uuid4(),
            _request(),
            sections=None,
            electrical_variant_id=variant_id,
            electrical_variant_ids=None,
            principal=CurrentPrincipal(role="guest", session_id="sid"),
            db=object(),
        )

    assert err.value.status_code == 404
    assert err.value.detail == "bad report"


async def test_preview_records_audit_on_success(monkeypatch: pytest.MonkeyPatch):
    project_id = uuid.uuid4()
    variant_id = uuid.uuid4()
    _allow_variant(monkeypatch, variant_id)
    recorded: dict = {}

    async def noop_rate_limit(*args, **kwargs):
        return None

    class FakeReportService:
        def __init__(self, db) -> None:
            self.db = db

        async def preview(
            self,
            project_id,
            sections,
            *,
            principal,
            electrical_variant_id=None,
            electrical_variant_name=None,
        ):
            return {
                "project_id": str(project_id),
                "html": "<html></html>",
                "sections": sections or ["summary"],
                "electrical_variant_id": str(electrical_variant_id),
                "electrical_variant_name": electrical_variant_name,
            }

    class FakeAuditService:
        def __init__(self, db) -> None:
            self.db = db

        async def try_record(self, **kwargs):
            recorded.update(kwargs)

    monkeypatch.setattr(reports_api, "enforce_principal_rate_limit", noop_rate_limit)
    monkeypatch.setattr(reports_api, "ReportService", FakeReportService)
    monkeypatch.setattr(reports_api, "AuditService", FakeAuditService)

    response = await reports_api.preview(
        project_id,
        _request(),
        sections=["summary"],
        electrical_variant_id=variant_id,
        electrical_variant_ids=None,
        principal=CurrentPrincipal(role="guest", session_id="sid"),
        db=object(),
    )

    assert response.project_id == str(project_id)
    assert response.sections == ["summary"]
    assert response.electrical_variant_id == variant_id
    assert response.electrical_variant_name == "ЭР UUID"
    assert recorded["event_type"] == "report.previewed"
    assert recorded["details"] == {
        "sections": ["summary"],
        "electrical_variant_id": str(variant_id),
    }


async def test_preview_requires_variant_after_project_access(monkeypatch: pytest.MonkeyPatch):
    checked_projects: list[uuid.UUID] = []
    project_id = uuid.uuid4()

    async def noop_rate_limit(*args, **kwargs):
        return None

    class FakeProjectService:
        def __init__(self, db) -> None:
            self.db = db

        async def get_project_basic(self, project_id, principal):
            checked_projects.append(project_id)

    monkeypatch.setattr(reports_api, "enforce_principal_rate_limit", noop_rate_limit)
    monkeypatch.setattr(reports_api, "ProjectService", FakeProjectService)

    with pytest.raises(HTTPException) as err:
        await reports_api.preview(
            project_id,
            _request(),
            sections=None,
            electrical_variant_id=None,
            electrical_variant_ids=None,
            principal=CurrentPrincipal(role="guest", session_id="sid"),
            db=object(),
        )

    assert err.value.status_code == 422
    assert checked_projects == [project_id]


async def test_export_rejects_unsupported_format_before_service_creation():
    with pytest.raises(HTTPException) as err:
        await reports_api.export(
            uuid.uuid4(),
            "txt",
            _request(),
            sections=None,
            electrical_variant_id=uuid.uuid4(),
            principal=CurrentPrincipal(role="employee", user_id=uuid.uuid4()),
            db=object(),
        )

    assert err.value.status_code == 400
    assert err.value.detail == "Неподдерживаемый формат: txt"


async def test_download_report_task_rejects_unfinished_task(monkeypatch: pytest.MonkeyPatch):
    class FakeTaskService:
        def __init__(self, db) -> None:
            self.db = db

        async def get_task_for_principal(self, task_id, principal):
            return SimpleNamespace(status="running", result_payload=None)

    monkeypatch.setattr(reports_api, "TaskService", FakeTaskService)

    with pytest.raises(HTTPException) as err:
        await reports_api.download_report_task_result(
            uuid.uuid4(),
            principal=CurrentPrincipal(role="employee", user_id=uuid.uuid4()),
            db=object(),
        )

    assert err.value.status_code == 409
    assert err.value.detail == "Отчёт ещё не готов"


async def test_download_report_task_rejects_missing_artifact_payload(
    monkeypatch: pytest.MonkeyPatch,
):
    class FakeTaskService:
        def __init__(self, db) -> None:
            self.db = db

        async def get_task_for_principal(self, task_id, principal):
            return SimpleNamespace(status="succeeded", result_payload={})

    monkeypatch.setattr(reports_api, "TaskService", FakeTaskService)

    with pytest.raises(HTTPException) as err:
        await reports_api.download_report_task_result(
            uuid.uuid4(),
            principal=CurrentPrincipal(role="employee", user_id=uuid.uuid4()),
            db=object(),
        )

    assert err.value.status_code == 410
    assert err.value.detail == "Артефакт отчёта не найден"
