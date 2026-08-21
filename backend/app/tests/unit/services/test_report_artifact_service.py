"""Unit-тесты файлового хранилища артефактов отчёта."""

from uuid import uuid4

import pytest

from app.core.config import settings
from app.services.report_artifact_service import (
    report_artifact_name,
    report_artifact_path,
    write_report_artifact,
)


def test_report_artifact_name_uses_task_id_and_format():
    task_id = uuid4()

    assert report_artifact_name(task_id, "xlsx") == f"{task_id}.xlsx"


def test_write_report_artifact_writes_inside_configured_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "REPORT_ARTIFACT_DIR", str(tmp_path))
    task_id = uuid4()

    result = write_report_artifact(task_id, "pdf", b"pdf-bytes")

    assert result == {
        "artifact_name": f"{task_id}.pdf",
        "size_bytes": len(b"pdf-bytes"),
    }
    assert (tmp_path / f"{task_id}.pdf").read_bytes() == b"pdf-bytes"


def test_report_artifact_path_rejects_path_traversal(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "REPORT_ARTIFACT_DIR", str(tmp_path))

    with pytest.raises(ValueError, match="Некорректное имя артефакта"):
        report_artifact_path("../report.pdf")
