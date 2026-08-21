"""Architecture ratchets for the background-task service boundary."""

from pathlib import Path

from app.schemas.calculation import ElectricalBatchJobRequest
from app.schemas.report import ReportExportJobRequest, ReportExportTaskResult

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
