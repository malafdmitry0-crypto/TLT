"""Endpoints расчётов."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import ValidationError
from sqlalchemy import select as sa_select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import CurrentPrincipal, require_any
from app.models.electrical_calculation import ElectricalCalculation
from app.schemas.calculation import (
    BatchCalcResponse,
    BatchElectricalResponse,
    ElectricalCalcSummary,
    ElectricalRequest,
    ElectricalResponse,
    HeatLossRequest,
    HeatLossResponse,
)
from app.services.calculation_service import CalculationError, CalculationService

router = APIRouter()


@router.post(
    "/heat-loss",
    response_model=HeatLossResponse,
    summary="Расчёт теплопотерь одного объекта",
)
async def calc_heat_loss(
    request: HeatLossRequest,
    principal: CurrentPrincipal = Depends(require_any()),
    db: AsyncSession = Depends(get_db),
):
    service = CalculationService(db)
    try:
        result = await service.calc_heat_loss(request.object_type, request.data)
    except (ValueError, ValidationError) as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc
    except CalculationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return HeatLossResponse(object_type=request.object_type, result=result)


@router.post(
    "/heat-loss/batch",
    response_model=BatchCalcResponse,
    summary="Пересчёт всех объектов проекта",
)
async def batch_recalculate(
    project_id: UUID,
    principal: CurrentPrincipal = Depends(require_any()),
    db: AsyncSession = Depends(get_db),
):
    service = CalculationService(db)
    updated, failed, errors = await service.batch_recalculate(project_id)
    return BatchCalcResponse(updated=updated, failed=failed, errors=errors)


@router.post(
    "/electrical",
    response_model=ElectricalResponse,
    summary="Электротехнический расчёт",
)
async def calc_electrical(
    request: ElectricalRequest,
    principal: CurrentPrincipal = Depends(require_any()),
    db: AsyncSession = Depends(get_db),
):
    service = CalculationService(db)
    try:
        calc = await service.calc_electrical(request)
    except (ValueError, ValidationError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except CalculationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return ElectricalResponse(
        object_id=calc.object_id,
        cable_type=calc.cable_type,
        result=calc.results or {},
    )


@router.get(
    "/electrical",
    response_model=list[ElectricalCalcSummary],
    summary="Список электрорасчётов по проекту",
)
async def list_electrical(
    project_id: UUID,
    variant_number: int | None = None,
    principal: CurrentPrincipal = Depends(require_any()),
    db: AsyncSession = Depends(get_db),
):
    stmt = sa_select(ElectricalCalculation).where(ElectricalCalculation.project_id == project_id)
    if variant_number is not None:
        stmt = stmt.where(ElectricalCalculation.variant_number == variant_number)
    result = await db.execute(stmt)
    calcs = result.scalars().all()
    return [
        ElectricalCalcSummary(
            id=c.id,
            object_id=c.object_id,
            cable_type=c.cable_type,
            cable_mark=c.cable_mark,
            variant_number=c.variant_number,
            results=c.results,
        )
        for c in calcs
    ]


@router.post(
    "/electrical/select-cable",
    response_model=ElectricalCalcSummary,
    summary="Ручной выбор кабеля ТЛТ для объекта (с пересчётом)",
)
async def select_cable(
    object_id: UUID,
    cable_mark: str,
    cable_source: str = "builtin",
    variant_number: int = 1,
    principal: CurrentPrincipal = Depends(require_any()),
    db: AsyncSession = Depends(get_db),
):
    """Перезапускает электрорасчёт с указанной маркой кабеля.

    Параметры объекта (мощность, температуры, длина) берутся из текущих
    результатов теплопотерь. Если кабель не подходит — 422 с текстом причины.
    На успех — upsert `ElectricalCalculation` и возврат новой записи.
    """
    if cable_source != "builtin" and principal.role not in ("employee", "admin"):
        raise HTTPException(
            status_code=403, detail="Расширенный каталог доступен только сотрудникам"
        )
    service = CalculationService(db)
    try:
        calc = await service.select_cable_manual(
            object_id, cable_mark, cable_source, variant_number
        )
    except (ValueError, ValidationError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except CalculationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return ElectricalCalcSummary(
        id=calc.id,
        object_id=calc.object_id,
        cable_type=calc.cable_type,
        cable_mark=calc.cable_mark,
        variant_number=calc.variant_number,
        results=calc.results,
    )


@router.post(
    "/electrical/batch",
    response_model=BatchElectricalResponse,
    summary="Пакетный автоподбор кабеля для всех объектов проекта",
)
async def batch_calc_electrical(
    project_id: UUID,
    cable_source: str = "builtin",
    variant_number: int = 1,
    principal: CurrentPrincipal = Depends(require_any()),
    db: AsyncSession = Depends(get_db),
):
    """Автоматически подбирает кабель ТЛТ для каждого валидного объекта проекта.
    Использует результаты теплопотерь как required_power_per_meter (cable_mark = null → auto-select).
    """
    if cable_source != "builtin" and principal.role not in ("employee", "admin"):
        raise HTTPException(
            status_code=403, detail="Расширенный каталог доступен только сотрудникам"
        )
    service = CalculationService(db)
    calculated, skipped, errors, calcs = await service.batch_calc_electrical(
        project_id, cable_source, variant_number
    )
    return BatchElectricalResponse(
        calculated=calculated,
        skipped=skipped,
        errors=errors,
        results=[
            ElectricalCalcSummary(
                id=c.id,
                object_id=c.object_id,
                cable_type=c.cable_type,
                cable_mark=c.cable_mark,
                variant_number=c.variant_number,
                results=c.results,
            )
            for c in calcs
        ],
    )


@router.get(
    "/cable-options/{object_id}",
    summary="Список доступных кабелей для объекта",
)
async def cable_options(
    object_id: UUID,
    principal: CurrentPrincipal = Depends(require_any()),
    db: AsyncSession = Depends(get_db),
):
    return await CalculationService(db).get_cable_options(object_id)
