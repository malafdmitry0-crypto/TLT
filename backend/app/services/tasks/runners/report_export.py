"""Report export task runner."""

from typing import cast
from uuid import UUID

from app.core.config import settings
from app.models.background_task import BackgroundTask
from app.schemas.report import ReportFormat
from app.services.calculation.contracts import BatchProgress
from app.services.calculation.errors import BatchCancelledError
from app.services.report_artifact_service import delete_report_artifact, write_report_artifact
from app.services.report_service import ReportService
from app.services.tasks.runners.heat_loss import HeatLossTaskRunner

REPORT_MEDIA_TYPES = {
    "pdf": "application/pdf",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}


class ReportExportRunner(HeatLossTaskRunner):
    async def _run_report_export(
        self,
        task_id: UUID,
        *,
        attempt: int,
        worker_id: str,
    ) -> None:
        task = await self.db.get(BackgroundTask, task_id)
        if task is None:
            return
        payload = dict(task.request_payload or {})
        try:
            project_id = UUID(str(payload["project_id"]))
            fmt = cast(ReportFormat, payload["format"])
            sections = payload.get("sections")
            await self._update_progress(
                task_id,
                BatchProgress(current=1, total=3, phase="load"),
                attempt=attempt,
                worker_id=worker_id,
            )
            if await self._should_cancel(task_id, attempt=attempt, worker_id=worker_id):
                await self._mark_cancelled(task_id, attempt=attempt, worker_id=worker_id)
                return
            async with self.session_factory() as report_db:
                variant_id = await self._current_task_variant_id(task, payload, db=report_db)
                data = await ReportService(report_db).export_trusted_for_electrical_variant(
                    project_id,
                    fmt,
                    variant_id,
                    sections,
                )
            await self._update_progress(
                task_id,
                BatchProgress(current=2, total=3, phase="write"),
                attempt=attempt,
                worker_id=worker_id,
            )
            if await self._should_cancel(task_id, attempt=attempt, worker_id=worker_id):
                await self._mark_cancelled(task_id, attempt=attempt, worker_id=worker_id)
                return
            artifact = write_report_artifact(task_id, fmt, data, attempt=attempt)
        except BatchCancelledError:
            await self._mark_cancelled(task_id, attempt=attempt, worker_id=worker_id)
            return
        except Exception as exc:
            await self._mark_failed(
                task_id,
                f"{type(exc).__name__}: {exc}",
                attempt=attempt,
                worker_id=worker_id,
            )
            return

        result_payload = {
            "project_id": str(project_id),
            "format": fmt,
            "electrical_variant_id": str(variant_id),
            "filename": f"report.{fmt}",
            "media_type": REPORT_MEDIA_TYPES[fmt],
            "download_url": f"{settings.API_V1_PREFIX}/reports/jobs/{task_id}/download",
            **artifact,
        }
        published = await self._mark_succeeded(
            task_id,
            result_payload,
            attempt=attempt,
            worker_id=worker_id,
        )
        if not published:
            delete_report_artifact(str(artifact["artifact_name"]))
