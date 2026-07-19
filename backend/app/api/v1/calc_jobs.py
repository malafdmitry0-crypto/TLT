"""Endpoints for asynchronous calculation tasks."""

from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import CurrentPrincipal, require_any
from app.core.rate_limit import enforce_principal_rate_limit, job_enqueue_limiter
from app.schemas.calculation import (
    BatchCalcResponse,
    BatchElectricalResponse,
    CalculationTaskResponse,
    ElectricalBatchJobRequest,
    HeatLossBatchJobRequest,
)
from app.schemas.report import ReportExportTaskResult
from app.services.audit_service import AuditService
from app.services.electrical_variant_service import ElectricalVariantServiceError
from app.services.project_service import ProjectAccessError, ProjectNotFoundError
from app.services.task_service import (
    TaskAccessError,
    TaskIdempotencyConflictError,
    TaskLimitError,
    TaskNotFoundError,
    TaskService,
)

router = APIRouter()


def _raise_task_error(exc: Exception) -> None:
    if isinstance(exc, ElectricalVariantServiceError):
        raise HTTPException(status_code=exc.status_code, detail=exc.as_detail()) from exc
    if isinstance(exc, TaskIdempotencyConflictError):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=exc.as_detail(),
        ) from exc
    if isinstance(exc, TaskNotFoundError | ProjectNotFoundError):
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    if isinstance(exc, TaskAccessError | ProjectAccessError):
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


@router.post(
    "/heat-loss/batch/jobs",
    response_model=CalculationTaskResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Поставить пакетный пересчёт теплопотерь в очередь",
)
async def enqueue_heat_loss_batch_job(
    request: HeatLossBatchJobRequest,
    http_request: Request,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    principal: CurrentPrincipal = Depends(require_any()),
    db: AsyncSession = Depends(get_db),
):
    await enforce_principal_rate_limit(
        job_enqueue_limiter,
        principal,
        http_request,
        detail="Превышен лимит постановки задач в очередь для пользователя и IP.",
    )
    try:
        task = await TaskService(db).create_heat_loss_batch_task(
            request,
            principal,
            idempotency_key=idempotency_key,
        )
    except Exception as exc:
        _raise_task_error(exc)
    idempotency_replay = TaskService.is_idempotency_replay(task)
    await AuditService(db).try_record(
        event_type=(
            "task.heat_loss_batch.idempotency_replayed"
            if idempotency_replay
            else "task.heat_loss_batch.queued"
        ),
        category="task",
        principal=principal,
        project_id=request.project_id,
        task_id=task.id,
        result=TaskService.audit_result_for_task(task),
        details={
            "idempotency_key_present": bool(idempotency_key),
            "idempotency_replay": idempotency_replay,
            "task_status": task.status,
            "payload": task.request_payload,
        },
        message=(
            "Идемпотентный повтор вернул существующую задачу пересчёта теплопотерь"
            if idempotency_replay
            else "Поставлен в очередь пакетный пересчёт теплопотерь"
        ),
    )
    return TaskService.to_response(task)


@router.post(
    "/electrical/batch/jobs",
    response_model=CalculationTaskResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Поставить пакетный электрорасчёт в очередь",
)
async def enqueue_electrical_batch_job(
    request: ElectricalBatchJobRequest,
    http_request: Request,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    principal: CurrentPrincipal = Depends(require_any()),
    db: AsyncSession = Depends(get_db),
):
    await enforce_principal_rate_limit(
        job_enqueue_limiter,
        principal,
        http_request,
        detail="Превышен лимит постановки задач в очередь для пользователя и IP.",
    )
    try:
        task = await TaskService(db).create_electrical_batch_task(
            request,
            principal,
            idempotency_key=idempotency_key,
        )
    except Exception as exc:
        _raise_task_error(exc)
    idempotency_replay = TaskService.is_idempotency_replay(task)
    await AuditService(db).try_record(
        event_type=(
            "task.electrical_batch.idempotency_replayed"
            if idempotency_replay
            else "task.electrical_batch.queued"
        ),
        category="task",
        principal=principal,
        project_id=request.project_id,
        task_id=task.id,
        result=TaskService.audit_result_for_task(task),
        details={
            "electrical_variant_id": (
                str(task.electrical_variant_id) if task.electrical_variant_id is not None else None
            ),
            "idempotency_key_present": bool(idempotency_key),
            "idempotency_replay": idempotency_replay,
            "task_status": task.status,
            "payload": task.request_payload,
        },
        message=(
            "Идемпотентный повтор вернул существующую задачу электрорасчёта"
            if idempotency_replay
            else "Поставлен в очередь пакетный электрорасчёт"
        ),
    )
    return TaskService.to_response(task)


@router.get(
    "/jobs/{task_id}",
    response_model=CalculationTaskResponse,
    summary="Статус фоновой задачи расчёта",
)
async def get_calc_task(
    task_id: UUID,
    principal: CurrentPrincipal = Depends(require_any()),
    db: AsyncSession = Depends(get_db),
):
    try:
        task = await TaskService(db).get_task_for_principal(task_id, principal)
    except Exception as exc:
        _raise_task_error(exc)
    return TaskService.to_response(task)


@router.get(
    "/jobs/{task_id}/result",
    response_model=BatchElectricalResponse | BatchCalcResponse | ReportExportTaskResult,
    summary="Результат завершённой фоновой задачи",
)
async def get_calc_task_result(
    task_id: UUID,
    principal: CurrentPrincipal = Depends(require_any()),
    db: AsyncSession = Depends(get_db),
):
    try:
        task = await TaskService(db).get_task_for_principal(task_id, principal)
    except Exception as exc:
        _raise_task_error(exc)
    if task.status != "succeeded" or task.result_payload is None:
        raise HTTPException(status_code=409, detail="Задача ещё не завершена успешно")
    return TaskService.to_response(task).result


@router.post(
    "/jobs/{task_id}/cancel",
    response_model=CalculationTaskResponse,
    summary="Отменить фоновую задачу расчёта",
)
async def cancel_calc_task(
    task_id: UUID,
    principal: CurrentPrincipal = Depends(require_any()),
    db: AsyncSession = Depends(get_db),
):
    try:
        task = await TaskService(db).cancel_task(task_id, principal)
    except Exception as exc:
        _raise_task_error(exc)
    await AuditService(db).try_record(
        event_type="task.cancel_requested",
        category="task",
        principal=principal,
        project_id=task.project_id,
        task_id=task.id,
        result="cancelled",
        severity="warning",
        details={"task_type": task.type, "status": task.status},
        message="Запрошена отмена фоновой задачи расчёта",
    )
    return TaskService.to_response(task)
