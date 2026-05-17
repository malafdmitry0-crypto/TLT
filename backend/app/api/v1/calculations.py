"""Endpoints расчётов."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import ValidationError
from sqlalchemy import select as sa_select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import CurrentPrincipal, require_any
from app.core.rate_limit import batch_limiter, enforce_principal_rate_limit
from app.models.electrical_calculation import ElectricalCalculation
from app.schemas.calculation import (
    BatchCalcResponse,
    BatchElectricalResponse,
    ElectricalCalcSummary,
    ElectricalPageResponse,
    ElectricalPageSummary,
    ElectricalQueryCapabilitiesResponse,
    ElectricalQueryRequest,
    ElectricalQueryResponse,
    ElectricalRequest,
    ElectricalResponse,
    HeatLossRequest,
    HeatLossResponse,
    SelectionPolicy,
)
from app.services.calculation_service import CalculationError, CalculationService
from app.services.electrical_query_service import (
    ElectricalQueryService,
    ElectricalQueryValidationError,
)
from app.services.project_service import ProjectAccessError, ProjectNotFoundError, ProjectService

router = APIRouter()


def _raise_project_error(exc: Exception) -> None:
    if isinstance(exc, ProjectNotFoundError):
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    if isinstance(exc, ProjectAccessError):
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    raise exc


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
        await ProjectService(db).get_project_basic(request.project_id, principal)
        result = await service.calc_heat_loss(request.object_type, request.data)
    except (ProjectNotFoundError, ProjectAccessError) as exc:
        _raise_project_error(exc)
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
    request: Request,
    principal: CurrentPrincipal = Depends(require_any()),
    db: AsyncSession = Depends(get_db),
):
    await enforce_principal_rate_limit(
        batch_limiter,
        principal,
        request,
        detail="Превышен лимит пакетных расчётов для пользователя и IP. Повторите через час.",
    )
    service = CalculationService(db)
    try:
        await ProjectService(db).get_project_for_write(project_id, principal)
    except (ProjectNotFoundError, ProjectAccessError) as exc:
        _raise_project_error(exc)
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
        await ProjectService(db).get_object_for_write(request.object_id, principal)
        calc = await service.calc_electrical(request)
    except (ProjectNotFoundError, ProjectAccessError) as exc:
        _raise_project_error(exc)
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
    summary="Список электрорасчётов по проекту (legacy, paginated)",
    deprecated=True,
)
async def list_electrical(
    project_id: UUID,
    variant_number: int | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(200, ge=1, le=200),
    principal: CurrentPrincipal = Depends(require_any()),
    db: AsyncSession = Depends(get_db),
):
    try:
        await ProjectService(db).get_project_basic(project_id, principal)
    except (ProjectNotFoundError, ProjectAccessError) as exc:
        _raise_project_error(exc)

    stmt = sa_select(ElectricalCalculation).where(ElectricalCalculation.project_id == project_id)
    if variant_number is not None:
        stmt = stmt.where(ElectricalCalculation.variant_number == variant_number)
    stmt = (
        stmt.order_by(
            ElectricalCalculation.variant_number,
            ElectricalCalculation.object_id,
            ElectricalCalculation.id,
        )
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    result = await db.execute(stmt)
    calcs = result.scalars().all()
    return [
        ElectricalCalcSummary(
            id=c.id,
            object_id=c.object_id,
            cable_type=c.cable_type,
            cable_type_source=c.cable_type_source,
            cable_mark=c.cable_mark,
            cable_mark_source=c.cable_mark_source,
            variant_number=c.variant_number,
            params=c.params,
            results=c.results,
        )
        for c in calcs
    ]


@router.get(
    "/electrical/page",
    response_model=ElectricalPageResponse,
    response_model_exclude_none=True,
    summary="Постраничные данные страницы электрорасчёта",
)
async def electrical_page(
    project_id: UUID,
    variant_number: int = 1,
    page: int = 1,
    page_size: int = 50,
    principal: CurrentPrincipal = Depends(require_any()),
    db: AsyncSession = Depends(get_db),
):
    try:
        await ProjectService(db).get_project_basic(project_id, principal)
    except ProjectNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ProjectAccessError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc

    objects, calculations, summary, page_info = await CalculationService(
        db
    ).electrical_project_page(
        project_id,
        variant_number=variant_number,
        page=page,
        page_size=page_size,
    )
    return ElectricalPageResponse(
        items=objects,
        calculations=[
            ElectricalCalcSummary(
                id=c.id,
                object_id=c.object_id,
                cable_type=c.cable_type,
                cable_type_source=c.cable_type_source,
                cable_mark=c.cable_mark,
                cable_mark_source=c.cable_mark_source,
                variant_number=c.variant_number,
                params=c.params,
                results=c.results,
            )
            for c in calculations
        ],
        summary=ElectricalPageSummary(**summary),
        page_info=page_info,
    )


@router.get(
    "/electrical/query-capabilities",
    response_model=ElectricalQueryCapabilitiesResponse,
    summary="Возможности backend-фильтров и сортировок таблицы электрорасчёта",
)
async def electrical_query_capabilities(
    project_id: UUID,
    variant_number: int = 1,
    principal: CurrentPrincipal = Depends(require_any()),
    db: AsyncSession = Depends(get_db),
):
    try:
        return await ElectricalQueryService(db).capabilities(
            project_id,
            variant_number,
            principal,
        )
    except ElectricalQueryValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
    except ProjectNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ProjectAccessError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc


@router.post(
    "/electrical/query",
    response_model=ElectricalQueryResponse,
    response_model_exclude_none=True,
    summary="Постраничный backend-query таблицы электрорасчёта",
)
async def query_electrical(
    data: ElectricalQueryRequest,
    principal: CurrentPrincipal = Depends(require_any()),
    db: AsyncSession = Depends(get_db),
):
    try:
        return await ElectricalQueryService(db).query(data, principal)
    except ElectricalQueryValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
    except ProjectNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ProjectAccessError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc


@router.post(
    "/electrical/select-cable",
    response_model=ElectricalCalcSummary,
    summary="Ручной выбор кабеля для объекта (с пересчётом)",
)
async def select_cable(
    object_id: UUID,
    cable_mark: str,
    cable_source: str = "builtin",
    variant_number: int = 1,
    cable_type: str = "self_regulating",
    supply_voltage: float | None = None,
    connection_type: str | None = None,
    winding_coefficient: float | None = None,
    winding_pitch: float | None = None,
    number_of_threads: int | None = None,
    heating_height: float | None = None,
    laying_step: float | None = None,
    maintain_temperature: float | None = None,
    vapor_temperature: float | None = None,
    aggressive_product: bool = False,
    selection_policy: SelectionPolicy = "technical_minimum",
    principal: CurrentPrincipal = Depends(require_any()),
    db: AsyncSession = Depends(get_db),
):
    """Перезапускает электрорасчёт с указанной маркой кабеля.

    Параметры объекта (мощность, температуры, длина) берутся из текущих
    результатов теплопотерь. Если кабель не подходит — 422 с текстом причины.
    На успех — upsert `ElectricalCalculation` и возврат новой записи.
    """
    if cable_source in ("extended", "all") and principal.role not in ("employee", "admin"):
        raise HTTPException(
            status_code=403, detail="Расширенный каталог доступен только сотрудникам"
        )
    service = CalculationService(db)
    try:
        await ProjectService(db).get_object_for_write(object_id, principal)
        calc = await service.select_cable_manual(
            object_id,
            cable_mark,
            cable_source,
            variant_number,
            cable_type,
            {
                "supply_voltage": supply_voltage,
                "connection_type": connection_type,
                "winding_coefficient": winding_coefficient,
                "winding_pitch": winding_pitch,
                "number_of_threads": number_of_threads,
                "heating_height": heating_height,
                "laying_step": laying_step,
                "maintain_temperature": maintain_temperature,
                "vapor_temperature": vapor_temperature,
                "aggressive_product": aggressive_product,
                "selection_policy": selection_policy,
            },
        )
    except (ProjectNotFoundError, ProjectAccessError) as exc:
        _raise_project_error(exc)
    except (ValueError, ValidationError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except CalculationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return ElectricalCalcSummary(
        id=calc.id,
        object_id=calc.object_id,
        cable_type=calc.cable_type,
        cable_type_source=calc.cable_type_source,
        cable_mark=calc.cable_mark,
        cable_mark_source=calc.cable_mark_source,
        variant_number=calc.variant_number,
        params=calc.params,
        results=calc.results,
    )


@router.post(
    "/electrical/batch",
    response_model=BatchElectricalResponse,
    summary="Пакетный автоподбор кабеля для всех объектов проекта",
)
async def batch_calc_electrical(
    project_id: UUID,
    request: Request,
    cable_source: str = "builtin",
    variant_number: int = 1,
    cable_type: str = "self_regulating",
    force_cable_type: bool = False,
    supply_voltage: float | None = None,
    connection_type: str | None = None,
    winding_coefficient: float | None = None,
    winding_pitch: float | None = None,
    number_of_threads: int | None = None,
    heating_height: float | None = None,
    laying_step: float | None = None,
    maintain_temperature: float | None = None,
    vapor_temperature: float | None = None,
    aggressive_product: bool = False,
    selection_policy: SelectionPolicy = "technical_minimum",
    skip_manual: bool = False,
    include_results: bool = True,
    include_errors: bool = True,
    object_ids: list[UUID] | None = Query(default=None),
    object_ids_brackets: list[UUID] | None = Query(default=None, alias="object_ids[]"),
    principal: CurrentPrincipal = Depends(require_any()),
    db: AsyncSession = Depends(get_db),
):
    """Автоматически подбирает кабель для каждого валидного объекта проекта.
    Использует результаты теплопотерь и выбранный `cable_type`.
    """
    await enforce_principal_rate_limit(
        batch_limiter,
        principal,
        request,
        detail="Превышен лимит пакетных расчётов для пользователя и IP. Повторите через час.",
    )
    if cable_source in ("extended", "all") and principal.role not in ("employee", "admin"):
        raise HTTPException(
            status_code=403, detail="Расширенный каталог доступен только сотрудникам"
        )
    selected_object_ids = object_ids or object_ids_brackets
    service = CalculationService(db)
    try:
        await ProjectService(db).get_project_for_write(project_id, principal)
        calculated, skipped, heat_loss_failed, errors, calcs = await service.batch_calc_electrical(
            project_id,
            cable_source,
            variant_number,
            cable_type,
            {
                "supply_voltage": supply_voltage,
                "connection_type": connection_type,
                "winding_coefficient": winding_coefficient,
                "winding_pitch": winding_pitch,
                "number_of_threads": number_of_threads,
                "heating_height": heating_height,
                "laying_step": laying_step,
                "maintain_temperature": maintain_temperature,
                "vapor_temperature": vapor_temperature,
                "aggressive_product": aggressive_product,
                "selection_policy": selection_policy,
            },
            skip_manual=skip_manual,
            return_calcs=include_results,
            object_ids=selected_object_ids,
            force_cable_type=force_cable_type,
        )
    except (ProjectNotFoundError, ProjectAccessError) as exc:
        _raise_project_error(exc)
    except CalculationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return BatchElectricalResponse(
        calculated=calculated,
        skipped=skipped,
        scope="selected" if selected_object_ids else "all",
        heat_loss_failed=heat_loss_failed,
        errors=errors if include_errors else [],
        results=[
            ElectricalCalcSummary(
                id=c.id,
                object_id=c.object_id,
                cable_type=c.cable_type,
                cable_type_source=c.cable_type_source,
                cable_mark=c.cable_mark,
                cable_mark_source=c.cable_mark_source,
                variant_number=c.variant_number,
                params=c.params,
                results=c.results,
            )
            for c in calcs
        ]
        if include_results
        else [],
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
    try:
        await ProjectService(db).get_object_for_read(object_id, principal)
    except (ProjectNotFoundError, ProjectAccessError) as exc:
        _raise_project_error(exc)
    return await CalculationService(db).get_cable_options(object_id)
