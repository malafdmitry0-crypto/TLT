"""Endpoints for asynchronous calculation tasks."""

from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import CurrentPrincipal, require_any
from app.schemas.calculation import (
    BatchCalcResponse,
    BatchElectricalResponse,
    CalculationTaskResponse,
    ElectricalBatchJobRequest,
    HeatLossBatchJobRequest,
)
from app.services.project_service import ProjectAccessError, ProjectNotFoundError
from app.services.task_service import TaskAccessError, TaskNotFoundError, TaskService

router = APIRouter()


def _raise_task_error(exc: Exception) -> None:
    if isinstance(exc, TaskNotFoundError | ProjectNotFoundError):
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    if isinstance(exc, TaskAccessError | ProjectAccessError):
        raise HTTPException(status_code=403, detail=str(exc)) from exc
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
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    principal: CurrentPrincipal = Depends(require_any()),
    db: AsyncSession = Depends(get_db),
):
    try:
        task = await TaskService(db).create_heat_loss_batch_task(
            request,
            principal,
            idempotency_key=idempotency_key,
        )
    except Exception as exc:
        _raise_task_error(exc)
    return TaskService.to_response(task)


@router.post(
    "/electrical/batch/jobs",
    response_model=CalculationTaskResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Поставить пакетный электрорасчёт в очередь",
)
async def enqueue_electrical_batch_job(
    request: ElectricalBatchJobRequest,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    principal: CurrentPrincipal = Depends(require_any()),
    db: AsyncSession = Depends(get_db),
):
    try:
        task = await TaskService(db).create_electrical_batch_task(
            request,
            principal,
            idempotency_key=idempotency_key,
        )
    except Exception as exc:
        _raise_task_error(exc)
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
    response_model=BatchElectricalResponse | BatchCalcResponse,
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
    return TaskService.to_response(task)
