"""Endpoints администрирования."""

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from pydantic import ValidationError as PydanticValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.dependencies import CurrentPrincipal, require_admin
from app.electrical_input_validation import (
    PROCESS_TEMPERATURE_REQUIRED_FORMULA_TYPES,
    ProcessTemperatureInputError,
    ensure_process_temperature,
)
from app.formulas.electrical.cable_geometry import compute_tank_cable_length
from app.formulas.electrical.resistive import calc_resistive_single_core, calc_resistive_three_core
from app.formulas.electrical.self_regulating import calc_self_regulating, calc_self_regulating_tt
from app.formulas.heat_loss.pipe import calc_pipe_heat_loss
from app.formulas.heat_loss.tank import calc_tank_heat_loss
from app.models.background_task import BackgroundTask
from app.schemas.calculation import (
    CalculationTaskResponse,
    PipeHeatLossParams,
    ResistiveSingleCoreParams,
    ResistiveThreeCoreParams,
    SelfRegulatingParams,
    SelfRegulatingTTParams,
    TankHeatLossParams,
)
from app.schemas.coefficient import CoefficientResponse, CoefficientUpdate
from app.schemas.reference import (
    AccessoryExtendedCreate,
    AccessoryExtendedResponse,
    AccessoryExtendedUpdate,
    CableExtendedCreate,
    CableExtendedResponse,
    CableExtendedUpdate,
)
from app.schemas.user import UserCreate, UserResponse, UserUpdate
from app.services.admin_service import AdminError, AdminService
from app.services.audit_service import AuditService
from app.services.task_queue import TaskQueue, TaskQueueError
from app.services.task_service import TaskLimitError, TaskNotFoundError, TaskService


class FormulaCheckRequest(BaseModel):
    formula_type: Literal[
        "pipe",
        "tank",
        "electrical",
        "electrical_tt",
        "resistive_single",
        "resistive_three",
        "tank_cable_geometry",
    ]
    params: dict[str, Any]


class TankCableGeometryCheckParams(BaseModel):
    shape: Literal["cylindrical", "rectangular"]
    diameter: float | None = None
    length: float | None = None
    width: float | None = None
    heating_height: float
    laying_step: float


class DeadLetterEntryResponse(BaseModel):
    stream_id: str
    task_id: UUID | None = None
    task_type: str | None = None
    reason: str | None = None
    original_stream_id: str | None = None
    fields: dict[str, str]
    task_status: str | None = None
    task_error_message: str | None = None
    task_created_at: datetime | None = None
    task_finished_at: datetime | None = None


class DeadLetterListResponse(BaseModel):
    stream: str
    count: int
    items: list[DeadLetterEntryResponse]


class DeadLetterReplayResponse(BaseModel):
    entry: DeadLetterEntryResponse
    task: CalculationTaskResponse
    removed_from_dead_letter: bool


class DeadLetterDeleteResponse(BaseModel):
    deleted: bool


router = APIRouter()


def _parse_task_id(value: str | None) -> UUID | None:
    if not value:
        return None
    try:
        return UUID(str(value))
    except ValueError:
        return None


async def _dead_letter_entry_response(
    db: AsyncSession,
    stream_id: str,
    fields: dict[str, str],
) -> DeadLetterEntryResponse:
    task_id = _parse_task_id(fields.get("task_id"))
    task: BackgroundTask | None = await db.get(BackgroundTask, task_id) if task_id else None
    return DeadLetterEntryResponse(
        stream_id=stream_id,
        task_id=task_id,
        task_type=fields.get("type"),
        reason=fields.get("dead_letter_reason"),
        original_stream_id=fields.get("original_stream_id"),
        fields=fields,
        task_status=task.status if task else None,
        task_error_message=task.error_message if task else None,
        task_created_at=task.created_at if task else None,
        task_finished_at=task.finished_at if task else None,
    )


def _raise_dead_letter_error(exc: Exception) -> None:
    if isinstance(exc, TaskQueueError):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    if isinstance(exc, TaskNotFoundError):
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    if isinstance(exc, TaskLimitError):
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    if isinstance(exc, ValueError):
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    raise exc


# ---- Users ----


@router.get("/users", response_model=list[UserResponse], summary="Список сотрудников")
async def list_users(
    _: CurrentPrincipal = Depends(require_admin()),
    db: AsyncSession = Depends(get_db),
):
    return await AdminService(db).list_users()


@router.post(
    "/users",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Создать сотрудника",
)
async def create_user(
    data: UserCreate,
    principal: CurrentPrincipal = Depends(require_admin()),
    db: AsyncSession = Depends(get_db),
):
    try:
        user = await AdminService(db).create_user(data)
    except AdminError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    await AuditService(db).try_record(
        event_type="admin.user.created",
        category="security",
        principal=principal,
        details={"user_id": str(user.id), "role": user.role, "is_active": user.is_active},
        message="Администратор создал пользователя",
    )
    return user


@router.put("/users/{user_id}", response_model=UserResponse, summary="Обновить пользователя")
async def update_user(
    user_id: UUID,
    data: UserUpdate,
    principal: CurrentPrincipal = Depends(require_admin()),
    db: AsyncSession = Depends(get_db),
):
    try:
        user = await AdminService(db).update_user(user_id, data)
    except AdminError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    await AuditService(db).try_record(
        event_type="admin.user.updated",
        category="security",
        principal=principal,
        details={
            "user_id": str(user_id),
            "changed_fields": sorted(data.model_fields_set),
            "role": user.role,
            "is_active": user.is_active,
        },
        message="Администратор обновил пользователя",
    )
    return user


@router.delete(
    "/users/{user_id}",
    response_model=UserResponse,
    summary="Деактивировать пользователя",
)
async def deactivate_user(
    user_id: UUID,
    principal: CurrentPrincipal = Depends(require_admin()),
    db: AsyncSession = Depends(get_db),
):
    try:
        user = await AdminService(db).deactivate_user(user_id)
    except AdminError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    await AuditService(db).try_record(
        event_type="admin.user.deactivated",
        category="security",
        principal=principal,
        severity="warning",
        details={"user_id": str(user_id), "role": user.role},
        message="Администратор деактивировал пользователя",
    )
    return user


# ---- Coefficients ----


@router.get(
    "/coefficients",
    response_model=list[CoefficientResponse],
    summary="Корректирующие коэффициенты",
)
async def list_coefficients(
    _: CurrentPrincipal = Depends(require_admin()),
    db: AsyncSession = Depends(get_db),
):
    return await AdminService(db).list_coefficients()


@router.put(
    "/coefficients/{key}",
    response_model=CoefficientResponse,
    summary="Обновить коэффициент",
)
async def update_coefficient(
    key: str,
    data: CoefficientUpdate,
    principal: CurrentPrincipal = Depends(require_admin()),
    db: AsyncSession = Depends(get_db),
):
    coefficient = await AdminService(db).upsert_coefficient(key, data, principal.user_id)
    await AuditService(db).try_record(
        event_type="admin.coefficient.updated",
        category="calculation",
        principal=principal,
        details={"key": key, "value": coefficient.value},
        after_state={"key": coefficient.key, "value": coefficient.value},
        message="Администратор обновил коэффициент расчёта",
    )
    return coefficient


# ---- Cables ----


@router.get(
    "/cables",
    response_model=list[CableExtendedResponse],
    summary="Расширенные кабели",
)
async def list_cables(
    _: CurrentPrincipal = Depends(require_admin()),
    db: AsyncSession = Depends(get_db),
):
    return await AdminService(db).list_cables()


@router.post(
    "/cables",
    response_model=CableExtendedResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Добавить кабель",
)
async def create_cable(
    data: CableExtendedCreate,
    principal: CurrentPrincipal = Depends(require_admin()),
    db: AsyncSession = Depends(get_db),
):
    cable = await AdminService(db).create_cable(data)
    await AuditService(db).try_record(
        event_type="admin.cable.created",
        category="calculation",
        principal=principal,
        details={"cable_id": str(cable.id), "cable_type": cable.cable_type, "model": cable.model},
        message="Администратор добавил кабель во внешнюю БД",
    )
    return cable


@router.put(
    "/cables/{cable_id}",
    response_model=CableExtendedResponse,
    summary="Обновить кабель",
)
async def update_cable(
    cable_id: UUID,
    data: CableExtendedUpdate,
    principal: CurrentPrincipal = Depends(require_admin()),
    db: AsyncSession = Depends(get_db),
):
    try:
        cable = await AdminService(db).update_cable(cable_id, data)
    except AdminError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    await AuditService(db).try_record(
        event_type="admin.cable.updated",
        category="calculation",
        principal=principal,
        details={
            "cable_id": str(cable_id),
            "changed_fields": sorted(data.model_fields_set),
            "cable_type": cable.cable_type,
            "model": cable.model,
        },
        message="Администратор обновил кабель во внешней БД",
    )
    return cable


@router.delete(
    "/cables/{cable_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Удалить кабель",
)
async def delete_cable(
    cable_id: UUID,
    principal: CurrentPrincipal = Depends(require_admin()),
    db: AsyncSession = Depends(get_db),
) -> None:
    try:
        await AdminService(db).delete_cable(cable_id)
    except AdminError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    await AuditService(db).try_record(
        event_type="admin.cable.deleted",
        category="calculation",
        principal=principal,
        severity="warning",
        details={"cable_id": str(cable_id)},
        message="Администратор удалил кабель из внешней БД",
    )


# ---- Accessories ----


@router.get(
    "/accessories",
    response_model=list[AccessoryExtendedResponse],
    summary="Расширенные аксессуары",
)
async def list_accessories(
    _: CurrentPrincipal = Depends(require_admin()),
    db: AsyncSession = Depends(get_db),
):
    return await AdminService(db).list_accessories()


@router.post(
    "/accessories",
    response_model=AccessoryExtendedResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Добавить аксессуар",
)
async def create_accessory(
    data: AccessoryExtendedCreate,
    principal: CurrentPrincipal = Depends(require_admin()),
    db: AsyncSession = Depends(get_db),
):
    accessory = await AdminService(db).create_accessory(data)
    await AuditService(db).try_record(
        event_type="admin.accessory.created",
        category="specification",
        principal=principal,
        details={
            "accessory_id": str(accessory.id),
            "category": accessory.category,
            "name": accessory.name,
        },
        message="Администратор добавил аксессуар во внешнюю БД",
    )
    return accessory


@router.put(
    "/accessories/{acc_id}",
    response_model=AccessoryExtendedResponse,
    summary="Обновить аксессуар",
)
async def update_accessory(
    acc_id: UUID,
    data: AccessoryExtendedUpdate,
    principal: CurrentPrincipal = Depends(require_admin()),
    db: AsyncSession = Depends(get_db),
):
    try:
        accessory = await AdminService(db).update_accessory(acc_id, data)
    except AdminError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    await AuditService(db).try_record(
        event_type="admin.accessory.updated",
        category="specification",
        principal=principal,
        details={
            "accessory_id": str(acc_id),
            "changed_fields": sorted(data.model_fields_set),
            "category": accessory.category,
            "name": accessory.name,
        },
        message="Администратор обновил аксессуар во внешней БД",
    )
    return accessory


@router.delete(
    "/accessories/{acc_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Удалить аксессуар",
)
async def delete_accessory(
    acc_id: UUID,
    principal: CurrentPrincipal = Depends(require_admin()),
    db: AsyncSession = Depends(get_db),
) -> None:
    try:
        await AdminService(db).delete_accessory(acc_id)
    except AdminError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    await AuditService(db).try_record(
        event_type="admin.accessory.deleted",
        category="specification",
        principal=principal,
        severity="warning",
        details={"accessory_id": str(acc_id)},
        message="Администратор удалил аксессуар из внешней БД",
    )


# ---- Dead-letter queue ----


@router.get(
    "/dead-letter",
    response_model=DeadLetterListResponse,
    summary="Просмотр dead-letter очереди фоновых задач",
)
async def list_dead_letter_entries(
    limit: int = Query(100, ge=1, le=500),
    _: CurrentPrincipal = Depends(require_admin()),
    db: AsyncSession = Depends(get_db),
) -> DeadLetterListResponse:
    queue: TaskQueue | None = None
    try:
        queue = TaskQueue()
        entries = await queue.list_dead_letters(count=limit)
        total = await queue.dead_letter_count()
        return DeadLetterListResponse(
            stream=settings.WORKER_DEAD_LETTER_STREAM,
            count=total,
            items=[
                await _dead_letter_entry_response(db, stream_id, fields)
                for stream_id, fields in entries
            ],
        )
    except Exception as exc:
        _raise_dead_letter_error(exc)
    finally:
        if queue is not None:
            await queue.close()


@router.get(
    "/dead-letter/{stream_id}",
    response_model=DeadLetterEntryResponse,
    summary="Просмотр dead-letter записи фоновой задачи",
)
async def get_dead_letter_entry(
    stream_id: str,
    _: CurrentPrincipal = Depends(require_admin()),
    db: AsyncSession = Depends(get_db),
) -> DeadLetterEntryResponse:
    queue: TaskQueue | None = None
    try:
        queue = TaskQueue()
        entry = await queue.get_dead_letter(stream_id)
        if entry is None:
            raise TaskNotFoundError("Dead-letter запись не найдена")
        return await _dead_letter_entry_response(db, entry[0], entry[1])
    except Exception as exc:
        _raise_dead_letter_error(exc)
    finally:
        if queue is not None:
            await queue.close()


@router.post(
    "/dead-letter/{stream_id}/replay",
    response_model=DeadLetterReplayResponse,
    summary="Вернуть dead-letter задачу в очередь",
)
async def replay_dead_letter_entry(
    stream_id: str,
    principal: CurrentPrincipal = Depends(require_admin()),
    db: AsyncSession = Depends(get_db),
) -> DeadLetterReplayResponse:
    queue: TaskQueue | None = None
    try:
        queue = TaskQueue()
        entry = await queue.get_dead_letter(stream_id)
        if entry is None:
            raise TaskNotFoundError("Dead-letter запись не найдена")
        entry_response = await _dead_letter_entry_response(db, entry[0], entry[1])
        task, removed = await TaskService(db).replay_dead_letter(stream_id, queue=queue)
        response = DeadLetterReplayResponse(
            entry=entry_response,
            task=TaskService.to_response(task),
            removed_from_dead_letter=removed,
        )
        await AuditService(db).try_record(
            event_type="admin.dead_letter.replayed",
            category="task",
            principal=principal,
            project_id=task.project_id,
            task_id=task.id,
            result="queued",
            details={"stream_id": stream_id, "task_type": task.type, "removed": removed},
            message="Администратор вернул dead-letter задачу в очередь",
        )
        return response
    except Exception as exc:
        _raise_dead_letter_error(exc)
    finally:
        if queue is not None:
            await queue.close()


@router.delete(
    "/dead-letter/{stream_id}",
    response_model=DeadLetterDeleteResponse,
    summary="Удалить dead-letter запись фоновой задачи",
)
async def delete_dead_letter_entry(
    stream_id: str,
    principal: CurrentPrincipal = Depends(require_admin()),
    db: AsyncSession = Depends(get_db),
) -> DeadLetterDeleteResponse:
    queue: TaskQueue | None = None
    try:
        queue = TaskQueue()
        deleted = await queue.delete_dead_letter(stream_id) > 0
        if not deleted:
            raise TaskNotFoundError("Dead-letter запись не найдена")
        await AuditService(db).try_record(
            event_type="admin.dead_letter.deleted",
            category="task",
            principal=principal,
            severity="warning",
            details={"stream_id": stream_id},
            message="Администратор удалил dead-letter запись",
        )
        return DeadLetterDeleteResponse(deleted=True)
    except Exception as exc:
        _raise_dead_letter_error(exc)
    finally:
        if queue is not None:
            await queue.close()


# ---- Formula check ----


@router.post("/formula-check", summary="Пробный расчёт по формуле (проверка)")
async def formula_check(
    data: FormulaCheckRequest,
    principal: CurrentPrincipal = Depends(require_admin()),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Выполняет расчёт по выбранной формуле с переданными параметрами.
    Возвращает результат в виде словаря. При невалидных параметрах — 422.
    """
    try:
        params_data = dict(data.params)
        if data.formula_type in PROCESS_TEMPERATURE_REQUIRED_FORMULA_TYPES:
            ensure_process_temperature(params_data)
        if data.formula_type == "pipe":
            params = PipeHeatLossParams(**params_data)
            result = calc_pipe_heat_loss(params).model_dump()
        elif data.formula_type == "tank":
            params = TankHeatLossParams(**params_data)
            result = calc_tank_heat_loss(params).model_dump()
        elif data.formula_type == "electrical":
            params = SelfRegulatingParams(**params_data)
            result = calc_self_regulating(params).model_dump()
        elif data.formula_type == "electrical_tt":
            params = SelfRegulatingTTParams(**params_data)
            result = calc_self_regulating_tt(params).model_dump()
        elif data.formula_type == "resistive_single":
            params = ResistiveSingleCoreParams(**params_data)
            result = calc_resistive_single_core(params).model_dump()
        elif data.formula_type == "resistive_three":
            params = ResistiveThreeCoreParams(**params_data)
            result = calc_resistive_three_core(params).model_dump()
        elif data.formula_type == "tank_cable_geometry":
            params = TankCableGeometryCheckParams(**params_data)
            cable_length = compute_tank_cable_length(**params.model_dump())
            result = {"cable_length": round(cable_length, 3)}
        else:
            raise HTTPException(status_code=422, detail="Неподдерживаемый тип формулы")
        await AuditService(db).try_record(
            event_type="admin.formula_check.completed",
            category="calculation",
            principal=principal,
            details={"formula_type": data.formula_type, "params": data.params},
            message="Администратор выполнил пробный расчёт формулы",
        )
        return result
    except PydanticValidationError as exc:
        # exc.errors() содержит ctx["error"] = ValueError — не сериализуется напрямую
        msgs = "; ".join(e.get("msg", "") for e in exc.errors())
        raise HTTPException(status_code=422, detail=msgs) from exc
    except ProcessTemperatureInputError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
