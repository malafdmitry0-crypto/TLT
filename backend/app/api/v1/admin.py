"""Endpoints администрирования."""

from typing import Any, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from pydantic import ValidationError as PydanticValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import CurrentPrincipal, require_admin
from app.formulas.electrical.self_regulating import calc_self_regulating
from app.formulas.heat_loss.pipe import calc_pipe_heat_loss
from app.formulas.heat_loss.tank import calc_tank_heat_loss
from app.schemas.calculation import PipeHeatLossParams, SelfRegulatingParams, TankHeatLossParams
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


class FormulaCheckRequest(BaseModel):
    formula_type: Literal["pipe", "tank", "electrical"]
    params: dict[str, Any]

router = APIRouter()


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
    _: CurrentPrincipal = Depends(require_admin()),
    db: AsyncSession = Depends(get_db),
):
    try:
        return await AdminService(db).create_user(data)
    except AdminError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.put("/users/{user_id}", response_model=UserResponse, summary="Обновить пользователя")
async def update_user(
    user_id: UUID,
    data: UserUpdate,
    _: CurrentPrincipal = Depends(require_admin()),
    db: AsyncSession = Depends(get_db),
):
    try:
        return await AdminService(db).update_user(user_id, data)
    except AdminError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.delete(
    "/users/{user_id}",
    response_model=UserResponse,
    summary="Деактивировать пользователя",
)
async def deactivate_user(
    user_id: UUID,
    _: CurrentPrincipal = Depends(require_admin()),
    db: AsyncSession = Depends(get_db),
):
    try:
        return await AdminService(db).deactivate_user(user_id)
    except AdminError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


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
    return await AdminService(db).upsert_coefficient(key, data, principal.user_id)


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
    _: CurrentPrincipal = Depends(require_admin()),
    db: AsyncSession = Depends(get_db),
):
    return await AdminService(db).create_cable(data)


@router.put(
    "/cables/{cable_id}",
    response_model=CableExtendedResponse,
    summary="Обновить кабель",
)
async def update_cable(
    cable_id: UUID,
    data: CableExtendedUpdate,
    _: CurrentPrincipal = Depends(require_admin()),
    db: AsyncSession = Depends(get_db),
):
    try:
        return await AdminService(db).update_cable(cable_id, data)
    except AdminError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.delete(
    "/cables/{cable_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Удалить кабель",
)
async def delete_cable(
    cable_id: UUID,
    _: CurrentPrincipal = Depends(require_admin()),
    db: AsyncSession = Depends(get_db),
) -> None:
    try:
        await AdminService(db).delete_cable(cable_id)
    except AdminError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


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
    _: CurrentPrincipal = Depends(require_admin()),
    db: AsyncSession = Depends(get_db),
):
    return await AdminService(db).create_accessory(data)


@router.put(
    "/accessories/{acc_id}",
    response_model=AccessoryExtendedResponse,
    summary="Обновить аксессуар",
)
async def update_accessory(
    acc_id: UUID,
    data: AccessoryExtendedUpdate,
    _: CurrentPrincipal = Depends(require_admin()),
    db: AsyncSession = Depends(get_db),
):
    try:
        return await AdminService(db).update_accessory(acc_id, data)
    except AdminError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.delete(
    "/accessories/{acc_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Удалить аксессуар",
)
async def delete_accessory(
    acc_id: UUID,
    _: CurrentPrincipal = Depends(require_admin()),
    db: AsyncSession = Depends(get_db),
) -> None:
    try:
        await AdminService(db).delete_accessory(acc_id)
    except AdminError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


# ---- Formula check ----


@router.post("/formula-check", summary="Пробный расчёт по формуле (проверка)")
async def formula_check(
    data: FormulaCheckRequest,
    _: CurrentPrincipal = Depends(require_admin()),
) -> dict[str, Any]:
    """Выполняет расчёт по выбранной формуле с переданными параметрами.
    Возвращает результат в виде словаря. При невалидных параметрах — 422.
    """
    try:
        if data.formula_type == "pipe":
            params = PipeHeatLossParams(**data.params)
            return calc_pipe_heat_loss(params).model_dump()
        if data.formula_type == "tank":
            params = TankHeatLossParams(**data.params)
            return calc_tank_heat_loss(params).model_dump()
        # electrical
        params = SelfRegulatingParams(**data.params)
        return calc_self_regulating(params).model_dump()
    except PydanticValidationError as exc:
        # exc.errors() содержит ctx["error"] = ValueError — не сериализуется напрямую
        msgs = "; ".join(e.get("msg", "") for e in exc.errors())
        raise HTTPException(status_code=422, detail=msgs) from exc
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
