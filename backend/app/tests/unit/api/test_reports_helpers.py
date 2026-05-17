"""Unit-тесты helpers API отчётов."""

import uuid
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.api.v1 import reports as reports_api
from app.api.v1.reports import _raise_project_error, _raise_task_error
from app.services.project_service import ProjectAccessError, ProjectNotFoundError
from app.services.report_service import ReportError
from app.services.task_service import TaskAccessError, TaskNotFoundError


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
    class FakeReportService:
        def __init__(self, db) -> None:
            self.db = db

        async def preview(self, project_id, sections, *, principal, variant_number=1):
            raise ProjectNotFoundError("missing project")

    monkeypatch.setattr(reports_api, "ReportService", FakeReportService)

    with pytest.raises(HTTPException) as err:
        await reports_api.preview(
            uuid.uuid4(),
            sections=None,
            principal=SimpleNamespace(role="guest"),
            db=object(),
        )

    assert err.value.status_code == 404
    assert err.value.detail == "missing project"


async def test_preview_maps_report_errors(monkeypatch: pytest.MonkeyPatch):
    class FakeReportService:
        def __init__(self, db) -> None:
            self.db = db

        async def preview(self, project_id, sections, *, principal, variant_number=1):
            raise ReportError("bad report")

    monkeypatch.setattr(reports_api, "ReportService", FakeReportService)

    with pytest.raises(HTTPException) as err:
        await reports_api.preview(
            uuid.uuid4(),
            sections=None,
            principal=SimpleNamespace(role="guest"),
            db=object(),
        )

    assert err.value.status_code == 404
    assert err.value.detail == "bad report"


async def test_export_rejects_unsupported_format_before_service_creation():
    with pytest.raises(HTTPException) as err:
        await reports_api.export(
            uuid.uuid4(),
            "txt",
            sections=None,
            principal=SimpleNamespace(role="employee"),
            db=object(),
        )

    assert err.value.status_code == 400
    assert err.value.detail == "Неподдерживаемый формат: txt"
