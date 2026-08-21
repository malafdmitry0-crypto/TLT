"""Endpoints отчётов."""

import io
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, status
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import (
    CurrentPrincipal,
    require_any,
    require_employee,
)
from app.core.rate_limit import enforce_principal_rate_limit, job_enqueue_limiter, report_limiter
from app.schemas.calculation import CalculationTaskResponse
from app.schemas.report import ReportExportJobRequest, ReportPreviewResponse
from app.services.audit_service import AuditService
from app.services.project_service import ProjectAccessError, ProjectNotFoundError, ProjectService
from app.services.report_artifact_service import report_artifact_path
from app.services.report_service import ReportError, ReportService
from app.services.task_service import (
    TaskAccessError,
    TaskLimitError,
    TaskNotFoundError,
    TaskService,
)

router = APIRouter()

MEDIA_TYPES = {
    "pdf": "application/pdf",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}


def _raise_task_error(exc: Exception) -> None:
    if isinstance(exc, TaskNotFoundError):
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    if isinstance(exc, TaskAccessError):
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    if isinstance(exc, TaskLimitError):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=str(exc),
            headers={"Retry-After": "3600"},
        ) from exc
    if isinstance(exc, ValueError):
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    raise exc


def _raise_project_error(exc: Exception) -> None:
    if isinstance(exc, ProjectNotFoundError):
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    if isinstance(exc, ProjectAccessError):
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    raise exc


@router.get(
    "/{project_id}/preview",
    response_model=ReportPreviewResponse,
    summary="HTML-предпросмотр отчёта",
)
async def preview(
    project_id: UUID,
    request: Request,
    sections: list[str] | None = Query(default=None),
    variant_number: int | None = Query(default=None, ge=1, le=4),
    principal: CurrentPrincipal = Depends(require_any()),
    db: AsyncSession = Depends(get_db),
):
    await enforce_principal_rate_limit(
        report_limiter,
        principal,
        request,
        detail="Превышен лимит операций с отчётами для пользователя и IP. Повторите через час.",
    )
    service = ReportService(db)
    try:
        if variant_number is None:
            await ProjectService(db).get_project_basic(project_id, principal)
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="variant_number is required",
            )
        result = await service.preview(
            project_id,
            sections,
            principal=principal,
            variant_number=variant_number,
        )
    except (ProjectNotFoundError, ProjectAccessError) as exc:
        _raise_project_error(exc)
    except ReportError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    await AuditService(db).try_record(
        event_type="report.previewed",
        category="report",
        principal=principal,
        project_id=project_id,
        details={"sections": sections, "variant_number": variant_number},
        message="Сформирован HTML-предпросмотр отчёта",
    )
    return ReportPreviewResponse(**result)


@router.get(
    "/{project_id}/export/{format}",
    summary="Экспорт отчёта в PDF / DOCX / XLSX (только сотрудник)",
)
async def export(
    project_id: UUID,
    format: str,
    request: Request,
    sections: list[str] | None = Query(default=None),
    variant_number: int = Query(..., ge=1, le=4),
    principal: CurrentPrincipal = Depends(require_employee()),
    db: AsyncSession = Depends(get_db),
):
    await enforce_principal_rate_limit(
        report_limiter,
        principal,
        request,
        detail="Превышен лимит операций с отчётами для пользователя и IP. Повторите через час.",
    )
    if format not in MEDIA_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Неподдерживаемый формат: {format}",
        )
    service = ReportService(db)
    try:
        data = await service.export(
            project_id,
            format,
            sections,
            principal=principal,
            variant_number=variant_number,
        )
    except (ProjectNotFoundError, ProjectAccessError) as exc:
        _raise_project_error(exc)
    except ReportError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    await AuditService(db).try_record(
        event_type="report.exported",
        category="report",
        principal=principal,
        project_id=project_id,
        details={
            "format": format,
            "sections": sections,
            "variant_number": variant_number,
            "size_bytes": len(data),
        },
        message="Сформирован отчёт",
    )
    return StreamingResponse(
        io.BytesIO(data),
        media_type=MEDIA_TYPES[format],
        headers={"Content-Disposition": f"attachment; filename=report.{format}"},
    )


@router.post(
    "/{project_id}/export/{format}/jobs",
    response_model=CalculationTaskResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Поставить экспорт отчёта в очередь worker'а",
)
async def enqueue_export_job(
    project_id: UUID,
    format: str,
    request: Request,
    sections: list[str] | None = Query(default=None),
    variant_number: int = Query(..., ge=1, le=4),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    principal: CurrentPrincipal = Depends(require_employee()),
    db: AsyncSession = Depends(get_db),
):
    await enforce_principal_rate_limit(
        job_enqueue_limiter,
        principal,
        request,
        detail="Превышен лимит постановки задач в очередь для пользователя и IP.",
    )
    if format not in MEDIA_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Неподдерживаемый формат: {format}",
        )
    job_request = ReportExportJobRequest(
        project_id=project_id,
        format=format,
        sections=sections,
        variant_number=variant_number,
    )
    try:
        task = await TaskService(db).create_report_export_task(
            job_request,
            principal,
            idempotency_key=idempotency_key,
        )
    except Exception as exc:
        _raise_task_error(exc)
    await AuditService(db).try_record(
        event_type="task.report_export.queued",
        category="task",
        principal=principal,
        project_id=project_id,
        task_id=task.id,
        result="queued",
        details={
            "format": format,
            "sections": sections,
            "variant_number": variant_number,
            "idempotency_key_present": bool(idempotency_key),
        },
        message="Поставлен в очередь экспорт отчёта",
    )
    return TaskService.to_response(task)


@router.get(
    "/jobs/{task_id}",
    response_model=CalculationTaskResponse,
    summary="Статус фоновой задачи экспорта отчёта",
)
async def get_report_task(
    task_id: UUID,
    principal: CurrentPrincipal = Depends(require_employee()),
    db: AsyncSession = Depends(get_db),
):
    try:
        task = await TaskService(db).get_task_for_principal(task_id, principal)
    except Exception as exc:
        _raise_task_error(exc)
    return TaskService.to_response(task)


@router.post(
    "/jobs/{task_id}/cancel",
    response_model=CalculationTaskResponse,
    summary="Отменить фоновую задачу экспорта отчёта",
)
async def cancel_report_task(
    task_id: UUID,
    principal: CurrentPrincipal = Depends(require_employee()),
    db: AsyncSession = Depends(get_db),
):
    try:
        task = await TaskService(db).cancel_task(task_id, principal)
    except Exception as exc:
        _raise_task_error(exc)
    await AuditService(db).try_record(
        event_type="task.report_export.cancel_requested",
        category="task",
        principal=principal,
        project_id=task.project_id,
        task_id=task.id,
        result="cancelled",
        severity="warning",
        details={"task_type": task.type, "status": task.status},
        message="Запрошена отмена фоновой задачи отчёта",
    )
    return TaskService.to_response(task)


@router.get(
    "/jobs/{task_id}/download",
    summary="Скачать готовый артефакт отчёта",
)
async def download_report_task_result(
    task_id: UUID,
    principal: CurrentPrincipal = Depends(require_employee()),
    db: AsyncSession = Depends(get_db),
):
    try:
        task = await TaskService(db).get_task_for_principal(task_id, principal)
    except Exception as exc:
        _raise_task_error(exc)
    if task.status != "succeeded" or task.result_payload is None:
        raise HTTPException(status_code=409, detail="Отчёт ещё не готов")
    artifact_name = task.result_payload.get("artifact_name")
    if not artifact_name:
        raise HTTPException(status_code=410, detail="Артефакт отчёта не найден")
    path = report_artifact_path(str(artifact_name))
    if not path.exists():
        raise HTTPException(status_code=410, detail="Артефакт отчёта удалён или недоступен")
    fmt = task.result_payload.get("format")
    media_type = task.result_payload.get("media_type") or MEDIA_TYPES.get(
        fmt, "application/octet-stream"
    )
    filename = task.result_payload.get("filename") or f"report.{fmt}"
    await AuditService(db).try_record(
        event_type="report.artifact.downloaded",
        category="report",
        principal=principal,
        project_id=task.project_id,
        task_id=task.id,
        details={"format": fmt, "filename": filename},
        message="Скачан готовый артефакт отчёта",
    )
    return FileResponse(path, media_type=media_type, filename=filename)
