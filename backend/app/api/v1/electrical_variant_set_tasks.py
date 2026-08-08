"""Explicit ordered electrical ER-set task API."""

from typing import NoReturn
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import CurrentPrincipal, require_any
from app.core.worker_dependency import require_worker_ready
from app.schemas.electrical_variant_set_task import (
    ElectricalVariantSetTaskResponse,
    ElectricalVariantSetTaskRetryRequest,
    ElectricalVariantSetTaskStartRequest,
)
from app.services.electrical_variant_set_task_service import (
    TASK_ELECTRICAL_VARIANT_SET,
    ElectricalVariantSetTaskConflictError,
    ElectricalVariantSetTaskNotFoundError,
    ElectricalVariantSetTaskService,
)
from app.services.project_service import ProjectAccessError, ProjectNotFoundError
from app.services.task_service import TaskAccessError, TaskNotFoundError, TaskService

router = APIRouter()


def _raise_task_error(exc: Exception) -> NoReturn:
    if isinstance(exc, ElectricalVariantSetTaskConflictError):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=exc.as_detail()) from exc
    if isinstance(exc, ElectricalVariantSetTaskNotFoundError | TaskNotFoundError | ProjectNotFoundError):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    if isinstance(exc, TaskAccessError | ProjectAccessError):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    raise exc


@router.post(
    "/projects/{project_id}/electrical-variant-set-tasks",
    response_model=ElectricalVariantSetTaskResponse,
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[Depends(require_worker_ready)],
)
async def create_electrical_variant_set_task(
    project_id: UUID,
    data: ElectricalVariantSetTaskStartRequest,
    idempotency_key: str = Header(alias="Idempotency-Key", min_length=1, max_length=128),
    principal: CurrentPrincipal = Depends(require_any()),
    db: AsyncSession = Depends(get_db),
) -> ElectricalVariantSetTaskResponse:
    try:
        task = await ElectricalVariantSetTaskService(db).create(
            project_id, data, principal, idempotency_key=idempotency_key
        )
    except Exception as exc:
        _raise_task_error(exc)
    return ElectricalVariantSetTaskService.to_response(task)


@router.get(
    "/projects/{project_id}/electrical-variant-set-tasks/active",
    response_model=ElectricalVariantSetTaskResponse | None,
)
async def get_active_project_calculation_task(
    project_id: UUID,
    principal: CurrentPrincipal = Depends(require_any()),
    db: AsyncSession = Depends(get_db),
) -> ElectricalVariantSetTaskResponse | None:
    try:
        task = await ElectricalVariantSetTaskService(db).active_for_project(project_id, principal)
    except Exception as exc:
        _raise_task_error(exc)
    if task is None or task.type != TASK_ELECTRICAL_VARIANT_SET:
        return None
    return ElectricalVariantSetTaskService.to_response(task)


@router.get(
    "/electrical-variant-set-tasks/{task_id}",
    response_model=ElectricalVariantSetTaskResponse,
)
async def get_electrical_variant_set_task(
    task_id: UUID,
    principal: CurrentPrincipal = Depends(require_any()),
    db: AsyncSession = Depends(get_db),
) -> ElectricalVariantSetTaskResponse:
    try:
        task = await ElectricalVariantSetTaskService(db).get(task_id, principal)
    except Exception as exc:
        _raise_task_error(exc)
    return ElectricalVariantSetTaskService.to_response(task)


@router.post(
    "/electrical-variant-set-tasks/{task_id}/retry",
    response_model=ElectricalVariantSetTaskResponse,
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[Depends(require_worker_ready)],
)
async def retry_electrical_variant_set_task(
    task_id: UUID,
    data: ElectricalVariantSetTaskRetryRequest,
    _idempotency_key: str = Header(alias="Idempotency-Key", min_length=1, max_length=128),
    principal: CurrentPrincipal = Depends(require_any()),
    db: AsyncSession = Depends(get_db),
) -> ElectricalVariantSetTaskResponse:
    try:
        task = await ElectricalVariantSetTaskService(db).retry(task_id, data, principal)
    except Exception as exc:
        _raise_task_error(exc)
    return ElectricalVariantSetTaskService.to_response(task)


@router.post(
    "/electrical-variant-set-tasks/{task_id}/cancel",
    response_model=ElectricalVariantSetTaskResponse,
)
async def cancel_electrical_variant_set_task(
    task_id: UUID,
    principal: CurrentPrincipal = Depends(require_any()),
    db: AsyncSession = Depends(get_db),
) -> ElectricalVariantSetTaskResponse:
    try:
        task_service = TaskService(db)
        task = await task_service.get_task_for_principal(task_id, principal)
        if task.type != TASK_ELECTRICAL_VARIANT_SET:
            raise ElectricalVariantSetTaskNotFoundError("Задача пересчёта ЭР не найдена")
        task = await task_service.cancel_task(task_id, principal)
    except Exception as exc:
        _raise_task_error(exc)
    return ElectricalVariantSetTaskService.to_response(task)
