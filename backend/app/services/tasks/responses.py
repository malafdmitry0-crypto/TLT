"""Background task API response mapping."""

from uuid import UUID

from app.core.config import settings
from app.models.background_task import BackgroundTask
from app.schemas.calculation import (
    CalculationTaskLinks,
    CalculationTaskProgress,
    CalculationTaskResponse,
    TaskBatchElectricalResponse,
    TaskElectricalCalcSummary,
)
from app.schemas.heat_loss import BatchCalcResponse
from app.schemas.report import ReportExportTaskResult
from app.services.tasks.contracts import (
    TASK_ELECTRICAL_BATCH,
    TASK_HEAT_LOSS_BATCH,
    TASK_REPORT_EXPORT,
    TERMINAL_STATUSES,
)


def task_to_response(task: BackgroundTask) -> CalculationTaskResponse:
    total = task.progress_total
    percent = None
    if total and total > 0:
        percent = min(100.0, round((task.progress_current / total) * 100, 1))
    elif task.status in TERMINAL_STATUSES:
        percent = 100.0

    result: BatchCalcResponse | TaskBatchElectricalResponse | ReportExportTaskResult | None = None
    if task.result_payload is not None:
        if task.type == TASK_HEAT_LOSS_BATCH:
            result = BatchCalcResponse(
                updated=int(task.result_payload.get("updated", 0)),
                failed=int(task.result_payload.get("failed", 0)),
                errors=list(task.result_payload.get("errors") or []),
            )
        elif task.type == TASK_ELECTRICAL_BATCH:
            result = TaskBatchElectricalResponse(
                calculated=int(task.result_payload.get("calculated", 0)),
                skipped=int(task.result_payload.get("skipped", 0)),
                scope=task.result_payload.get("scope", "all"),
                heat_loss_failed=int(task.result_payload.get("heat_loss_failed", 0)),
                errors=list(task.result_payload.get("errors") or []),
                results=[
                    TaskElectricalCalcSummary(**item)
                    for item in list(task.result_payload.get("results") or [])
                ],
            )
        elif task.type == TASK_REPORT_EXPORT:
            result = ReportExportTaskResult(
                project_id=UUID(str(task.result_payload["project_id"])),
                format=task.result_payload["format"],
                electrical_variant_id=UUID(str(task.result_payload["electrical_variant_id"])),
                filename=task.result_payload["filename"],
                media_type=task.result_payload["media_type"],
                size_bytes=int(task.result_payload.get("size_bytes", 0)),
                download_url=task.result_payload["download_url"],
            )
    if task.type == TASK_REPORT_EXPORT:
        base = f"{settings.API_V1_PREFIX}/reports/jobs/{task.id}"
        result_url = f"{base}/download"
    else:
        base = f"{settings.API_V1_PREFIX}/calc/jobs/{task.id}"
        result_url = f"{base}/result"
    return CalculationTaskResponse(
        id=task.id,
        type=task.type,
        status=task.status,
        project_id=task.project_id,
        electrical_variant_id=task.electrical_variant_id,
        progress=CalculationTaskProgress(
            current=task.progress_current,
            total=total,
            phase=task.progress_phase,
            percent=percent,
        ),
        result=result,
        error_message=task.error_message,
        cancel_requested=bool(task.cancel_requested),
        created_at=task.created_at,
        started_at=task.started_at,
        finished_at=task.finished_at,
        links=CalculationTaskLinks(status=base, result=result_url, cancel=f"{base}/cancel"),
    )
