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
from app.services.electrical_variant_service import (
    ElectricalVariantService,
    ElectricalVariantServiceError,
)
from app.services.project_service import ProjectAccessError, ProjectNotFoundError, ProjectService
from app.services.report_artifact_service import report_artifact_path
from app.services.report_service import ReportError, ReportService
from app.services.task_service import (
    TaskAccessError,
    TaskIdempotencyConflictError,
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
    if isinstance(exc, ElectricalVariantServiceError):
        raise HTTPException(status_code=exc.status_code, detail=exc.as_detail()) from exc
    if isinstance(exc, TaskIdempotencyConflictError):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=exc.as_detail(),
        ) from exc
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
    electrical_variant_id: UUID | None = Query(default=None),
    electrical_variant_ids: list[UUID] | None = Query(default=None),
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
        requested_ids = list(dict.fromkeys(electrical_variant_ids or []))
        if electrical_variant_id is not None and electrical_variant_id not in requested_ids:
            requested_ids = [electrical_variant_id, *requested_ids]
        if not requested_ids and variant_number is None:
            await ProjectService(db).get_project_basic(project_id, principal)
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="electrical_variant_id(s) or variant_number is required",
            )
        if len(requested_ids) > 5:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Можно выбрать не более 5 ЭР для отчёта",
            )

        # PDL-ER-39: multi-ЭР → independent chapters, no cross-sums.
        if len(requested_ids) > 1:
            variant_svc = ElectricalVariantService(db)
            chapters: list[dict] = []
            for er_id in requested_ids:
                variant = await variant_svc.require_variant_for_read(
                    project_id, principal, er_id
                )
                chapters.append(
                    {
                        "electrical_variant_id": variant.id,
                        "electrical_variant_name": variant.name,
                        "variant_number": variant.legacy_variant_number,
                    }
                )
            result = await service.preview_multi(
                project_id,
                chapters,
                sections,
                principal=principal,
            )
        else:
            variant = None
            if requested_ids and variant_number is not None:
                variant = await ElectricalVariantService(db).validate_legacy_variant_for_read(
                    project_id,
                    principal,
                    variant_number,
                    requested_ids[0],
                )
            elif requested_ids:
                variant = await ElectricalVariantService(db).require_variant_for_read(
                    project_id,
                    principal,
                    requested_ids[0],
                )
                if variant.legacy_variant_number is not None:
                    variant_number = variant.legacy_variant_number
            result = await service.preview(
                project_id,
                sections,
                principal=principal,
                variant_number=variant_number,
                electrical_variant_id=(
                    variant.id if variant is not None else None
                ),
                electrical_variant_name=(variant.name if variant is not None else None),
            )
    except ElectricalVariantServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.as_detail()) from exc
    except (ProjectNotFoundError, ProjectAccessError) as exc:
        _raise_project_error(exc)
    except ReportError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    await AuditService(db).try_record(
        event_type="report.previewed",
        category="report",
        principal=principal,
        project_id=project_id,
        details={
            "sections": sections,
            "variant_number": variant_number,
            "electrical_variant_id": (
                str(result.get("electrical_variant_id"))
                if result.get("electrical_variant_id") is not None
                else None
            ),
        },
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
    electrical_variant_id: UUID | None = Query(default=None),
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
        variant = None
        if electrical_variant_id is not None:
            variant = await ElectricalVariantService(db).validate_legacy_variant_for_read(
                project_id,
                principal,
                variant_number,
                electrical_variant_id,
            )
        data = await service.export(
            project_id,
            format,
            sections,
            principal=principal,
            variant_number=variant_number,
            electrical_variant_id=(
                variant.id if variant is not None else electrical_variant_id
            ),
            electrical_variant_name=(variant.name if variant is not None else None),
        )
    except ElectricalVariantServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.as_detail()) from exc
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
    electrical_variant_id: UUID | None = Query(default=None),
    variant_number: int | None = Query(default=None, ge=1, le=4, deprecated=True),
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
    if electrical_variant_id is None and variant_number is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="electrical_variant_id or deprecated variant_number is required",
        )
    if electrical_variant_id is not None and variant_number is not None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={
                "code": "ELECTRICAL_VARIANT_SELECTOR_CONFLICT",
                "message": "Передайте только electrical_variant_id или variant_number",
            },
        )
    job_request = ReportExportJobRequest(
        project_id=project_id,
        format=format,
        sections=sections,
        electrical_variant_id=electrical_variant_id,
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
    idempotency_replay = TaskService.is_idempotency_replay(task)
    await AuditService(db).try_record(
        event_type=(
            "task.report_export.idempotency_replayed"
            if idempotency_replay
            else "task.report_export.queued"
        ),
        category="task",
        principal=principal,
        project_id=project_id,
        task_id=task.id,
        result=TaskService.audit_result_for_task(task),
        details={
            "format": format,
            "sections": sections,
            "electrical_variant_id": (
                str(task.electrical_variant_id) if task.electrical_variant_id is not None else None
            ),
            "idempotency_key_present": bool(idempotency_key),
            "idempotency_replay": idempotency_replay,
            "task_status": task.status,
        },
        message=(
            "Идемпотентный повтор вернул существующую задачу экспорта отчёта"
            if idempotency_replay
            else "Поставлен в очередь экспорт отчёта"
        ),
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
