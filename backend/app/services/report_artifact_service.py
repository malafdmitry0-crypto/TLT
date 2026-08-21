"""Filesystem storage for generated report artifacts."""

from __future__ import annotations

from pathlib import Path
from uuid import UUID

from app.core.config import settings
from app.schemas.report import ReportFormat


def report_artifact_name(task_id: UUID, fmt: ReportFormat) -> str:
    return f"{task_id}.{fmt}"


def report_artifact_path(artifact_name: str) -> Path:
    base = Path(settings.REPORT_ARTIFACT_DIR).resolve()
    path = (base / artifact_name).resolve()
    if path.parent != base:
        raise ValueError("Некорректное имя артефакта отчёта")
    return path


def write_report_artifact(task_id: UUID, fmt: ReportFormat, data: bytes) -> dict:
    artifact_name = report_artifact_name(task_id, fmt)
    path = report_artifact_path(artifact_name)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = path.with_suffix(path.suffix + ".tmp")
    tmp_path.write_bytes(data)
    tmp_path.replace(path)
    return {
        "artifact_name": artifact_name,
        "size_bytes": len(data),
    }
