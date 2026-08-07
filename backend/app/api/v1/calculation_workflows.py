"""Project-wide durable calculation workflow API."""

from typing import NoReturn
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import CurrentPrincipal, require_any
from app.core.worker_dependency import require_worker_ready
from app.schemas.calculation_workflow import (
    CalculationWorkflowResponse,
    CalculationWorkflowResumeRequest,
    CalculationWorkflowRetryRequest,
    CalculationWorkflowStartRequest,
)
from app.services.calculation_workflow_service import (
    CalculationWorkflowConflictError,
    CalculationWorkflowNotFoundError,
    CalculationWorkflowService,
)
from app.services.project_calculation_guard import CALCULATION_TASK_TYPES
from app.services.project_service import ProjectAccessError, ProjectNotFoundError
from app.services.task_service import TaskAccessError, TaskNotFoundError, TaskService

router = APIRouter()


def _raise_workflow_error(exc: Exception) -> NoReturn:
    if isinstance(exc, CalculationWorkflowConflictError):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=exc.as_detail()) from exc
    if isinstance(exc, CalculationWorkflowNotFoundError | TaskNotFoundError | ProjectNotFoundError):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    if isinstance(exc, TaskAccessError | ProjectAccessError):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    raise exc


@router.post(
    "/projects/{project_id}/calculation-workflows",
    response_model=CalculationWorkflowResponse,
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[Depends(require_worker_ready)],
)
async def create_calculation_workflow(
    project_id: UUID,
    data: CalculationWorkflowStartRequest,
    idempotency_key: str = Header(alias="Idempotency-Key", min_length=1, max_length=128),
    principal: CurrentPrincipal = Depends(require_any()),
    db: AsyncSession = Depends(get_db),
) -> CalculationWorkflowResponse:
    try:
        task = await CalculationWorkflowService(db).create(
            project_id,
            data,
            principal,
            idempotency_key=idempotency_key,
        )
    except Exception as exc:
        _raise_workflow_error(exc)
    return CalculationWorkflowService.to_response(task)


@router.get(
    "/projects/{project_id}/calculation-workflows/active",
    response_model=CalculationWorkflowResponse | None,
)
async def get_active_calculation_workflow(
    project_id: UUID,
    principal: CurrentPrincipal = Depends(require_any()),
    db: AsyncSession = Depends(get_db),
) -> CalculationWorkflowResponse | None:
    try:
        task = await CalculationWorkflowService(db).active_for_project(project_id, principal)
    except Exception as exc:
        _raise_workflow_error(exc)
    return CalculationWorkflowService.to_response(task) if task is not None else None


@router.get(
    "/calculation-workflows/{task_id}",
    response_model=CalculationWorkflowResponse,
)
async def get_calculation_workflow(
    task_id: UUID,
    principal: CurrentPrincipal = Depends(require_any()),
    db: AsyncSession = Depends(get_db),
) -> CalculationWorkflowResponse:
    try:
        task = await CalculationWorkflowService(db).get(task_id, principal)
    except Exception as exc:
        _raise_workflow_error(exc)
    return CalculationWorkflowService.to_response(task)


@router.post(
    "/calculation-workflows/{task_id}/resume",
    response_model=CalculationWorkflowResponse,
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[Depends(require_worker_ready)],
)
async def resume_calculation_workflow(
    task_id: UUID,
    data: CalculationWorkflowResumeRequest,
    idempotency_key: str = Header(alias="Idempotency-Key", min_length=1, max_length=128),
    principal: CurrentPrincipal = Depends(require_any()),
    db: AsyncSession = Depends(get_db),
) -> CalculationWorkflowResponse:
    try:
        task = await CalculationWorkflowService(db).resume(
            task_id,
            data,
            principal,
            idempotency_key=idempotency_key,
        )
    except Exception as exc:
        _raise_workflow_error(exc)
    return CalculationWorkflowService.to_response(task)


@router.post(
    "/calculation-workflows/{task_id}/retry",
    response_model=CalculationWorkflowResponse,
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[Depends(require_worker_ready)],
)
async def retry_calculation_workflow(
    task_id: UUID,
    data: CalculationWorkflowRetryRequest,
    _idempotency_key: str = Header(alias="Idempotency-Key", min_length=1, max_length=128),
    principal: CurrentPrincipal = Depends(require_any()),
    db: AsyncSession = Depends(get_db),
) -> CalculationWorkflowResponse:
    try:
        task = await CalculationWorkflowService(db).retry(task_id, data, principal)
    except Exception as exc:
        _raise_workflow_error(exc)
    return CalculationWorkflowService.to_response(task)


@router.post(
    "/calculation-workflows/{task_id}/cancel",
    response_model=CalculationWorkflowResponse,
)
async def cancel_calculation_workflow(
    task_id: UUID,
    principal: CurrentPrincipal = Depends(require_any()),
    db: AsyncSession = Depends(get_db),
) -> CalculationWorkflowResponse:
    try:
        task_service = TaskService(db)
        task = await task_service.get_task_for_principal(task_id, principal)
        if task.type not in CALCULATION_TASK_TYPES:
            raise CalculationWorkflowNotFoundError("Расчётная операция не найдена")
        task = await task_service.cancel_task(task_id, principal)
    except Exception as exc:
        _raise_workflow_error(exc)
    return CalculationWorkflowService.to_response(task)
