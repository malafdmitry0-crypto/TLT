"""Architecture ratchets for the background-task service boundary."""

from pathlib import Path
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.models.background_task import BackgroundTask
from app.schemas.calculation import ElectricalBatchJobRequest
from app.schemas.report import ReportExportJobRequest, ReportExportTaskResult
from app.services.tasks.payloads import electrical_payload, report_export_payload

SERVICES_DIR = Path(__file__).resolve().parents[4] / "services"
TASK_FACADE = SERVICES_DIR / "task_service.py"
TASK_PACKAGE = SERVICES_DIR / "tasks"


def _python_lines(path: Path) -> int:
    return len(path.read_text(encoding="utf-8").splitlines())


def test_task_service_is_a_thin_public_facade() -> None:
    assert _python_lines(TASK_FACADE) <= 100


def test_task_modules_stay_reviewable() -> None:
    oversized = {
        path.name: _python_lines(path)
        for path in TASK_PACKAGE.rglob("*.py")
        if _python_lines(path) > 500
    }
    assert oversized == {}


def test_current_task_code_has_no_version_or_numeric_selector_compatibility() -> None:
    forbidden = ("payload_version", "legacy_variant_number", "variant_number")
    sources = [TASK_FACADE, *TASK_PACKAGE.rglob("*.py")]
    violations = {
        str(path.relative_to(SERVICES_DIR)): token
        for path in sources
        for token in forbidden
        if token in path.read_text(encoding="utf-8")
    }
    assert violations == {}


def test_task_schemas_are_uuid_only() -> None:
    assert "electrical_variant_id" in ElectricalBatchJobRequest.model_fields
    assert "variant_number" not in ElectricalBatchJobRequest.model_fields
    assert "electrical_variant_id" in ReportExportJobRequest.model_fields
    assert "variant_number" not in ReportExportJobRequest.model_fields
    assert "electrical_variant_id" in ReportExportTaskResult.model_fields
    assert "variant_number" not in ReportExportTaskResult.model_fields


def test_report_job_rejects_removed_numeric_selector_even_with_uuid() -> None:
    with pytest.raises(ValidationError, match="Extra inputs are not permitted"):
        ReportExportJobRequest.model_validate(
            {
                "project_id": uuid4(),
                "electrical_variant_id": uuid4(),
                "format": "xlsx",
                "variant_number": 1,
            }
        )


def test_persisted_electrical_task_payloads_are_uuid_only() -> None:
    project_id = uuid4()
    variant_id = uuid4()
    electrical_request = ElectricalBatchJobRequest(
        project_id=project_id,
        electrical_variant_id=variant_id,
    )
    report_request = ReportExportJobRequest(
        project_id=project_id,
        electrical_variant_id=variant_id,
        format="xlsx",
    )

    for payload in (
        electrical_payload(electrical_request, object_ids=None, object_overrides=None),
        report_export_payload(report_request),
    ):
        assert payload["electrical_variant_id"] == str(variant_id)
        assert "variant_number" not in payload


def test_database_constraint_rejects_non_uuid_electrical_task_payloads() -> None:
    constraint = next(
        item
        for item in BackgroundTask.__table__.constraints
        if item.name == "ck_background_tasks_electrical_variant_trace"
    )
    sql = str(constraint.sqltext)

    assert "electrical_variant_id IS NOT NULL" in sql
    assert "request_payload ->> 'electrical_variant_id' IS NOT NULL" in sql
    assert "NOT request_payload ? 'variant_number'" in sql
