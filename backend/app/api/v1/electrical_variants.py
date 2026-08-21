"""Lifecycle endpoints for project-scoped named electrical variants (ER)."""

from typing import NoReturn
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import CurrentPrincipal, require_any
from app.electrical_domain import ElectricalFormulaError
from app.schemas.calculation import (
    ElectricalCableSelectionRequest,
    ElectricalCableSelectionResponse,
)
from app.schemas.electrical_assignment import (
    ElectricalAssignmentOverridesPatch,
    ElectricalAssignmentResponse,
    ElectricalAssignmentsListResponse,
    ElectricalAssignmentsMutationResponse,
    ElectricalAssignmentsPatchRequest,
    ElectricalAssignmentsUnassignRequest,
    ElectricalAssignmentView,
)
from app.schemas.electrical_variant import (
    ElectricalAssignmentState,
    ElectricalReadinessResponse,
    ElectricalVariantCopyRequest,
    ElectricalVariantCreateRequest,
    ElectricalVariantDeleteResponse,
    ElectricalVariantInitializeResponse,
    ElectricalVariantRenameRequest,
    ElectricalVariantResponse,
)
from app.services.audit_service import AuditService
from app.services.calculation.container import CalculationContainer
from app.services.calculation.errors import ElectricalCalcConcurrencyError
from app.services.calculation_errors import CalculationError
from app.services.electrical_assignment_service import ElectricalAssignmentService
from app.services.electrical_input_resolver import ElectricalInputResolutionError
from app.services.electrical_variant_service import (
    ElectricalVariantService,
    ElectricalVariantServiceError,
)
from app.services.project_service import ProjectAccessError, ProjectNotFoundError, ProjectService

router = APIRouter()
_require_any = require_any()


def _raise_service_error(exc: Exception) -> NoReturn:
    if isinstance(exc, ElectricalVariantServiceError):
        raise HTTPException(status_code=exc.status_code, detail=exc.as_detail()) from exc
    if isinstance(exc, ProjectNotFoundError):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "PROJECT_NOT_FOUND", "message": str(exc)},
        ) from exc
    if isinstance(exc, ProjectAccessError):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "PROJECT_ACCESS_DENIED", "message": str(exc)},
        ) from exc
    raise exc


@router.get(
    "/{project_id}/electrical-readiness",
    response_model=ElectricalReadinessResponse,
    summary="Проверить готовность проекта к созданию первого ЭР",
)
async def get_electrical_readiness(
    project_id: UUID,
    principal: CurrentPrincipal = Depends(_require_any),
    db: AsyncSession = Depends(get_db),
) -> ElectricalReadinessResponse:
    try:
        return await ElectricalVariantService(db).get_readiness(project_id, principal)
    except (ElectricalVariantServiceError, ProjectNotFoundError, ProjectAccessError) as exc:
        _raise_service_error(exc)


@router.post(
    "/{project_id}/electrical-variants/initialize",
    response_model=ElectricalVariantInitializeResponse,
    summary="Readiness-gated создание первого active ЭР1",
)
async def initialize_electrical_variants(
    project_id: UUID,
    principal: CurrentPrincipal = Depends(_require_any),
    db: AsyncSession = Depends(get_db),
) -> ElectricalVariantInitializeResponse:
    try:
        return await ElectricalVariantService(db).initialize(project_id, principal)
    except (ElectricalVariantServiceError, ProjectNotFoundError, ProjectAccessError) as exc:
        _raise_service_error(exc)


@router.get(
    "/{project_id}/electrical-variants",
    response_model=list[ElectricalVariantResponse],
    summary="Список ЭР проекта",
)
async def list_electrical_variants(
    project_id: UUID,
    principal: CurrentPrincipal = Depends(_require_any),
    db: AsyncSession = Depends(get_db),
) -> list[ElectricalVariantResponse]:
    try:
        return await ElectricalVariantService(db).list_variants(project_id, principal)
    except (ElectricalVariantServiceError, ProjectNotFoundError, ProjectAccessError) as exc:
        _raise_service_error(exc)


@router.get(
    "/{project_id}/electrical-variants/{variant_id}/assignments",
    response_model=ElectricalAssignmentsListResponse,
    summary="Назначения объектов внутри выбранного ЭР",
)
async def list_electrical_assignments(
    project_id: UUID,
    variant_id: UUID,
    view: ElectricalAssignmentView = Query(default="all"),
    assignment_state: ElectricalAssignmentState | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    principal: CurrentPrincipal = Depends(_require_any),
    db: AsyncSession = Depends(get_db),
) -> ElectricalAssignmentsListResponse:
    try:
        return await ElectricalAssignmentService(db).list_assignments(
            project_id,
            variant_id,
            principal,
            view=view,
            assignment_state=assignment_state,
            page=page,
            page_size=page_size,
        )
    except (ElectricalVariantServiceError, ProjectNotFoundError, ProjectAccessError) as exc:
        _raise_service_error(exc)


@router.patch(
    "/{project_id}/electrical-variants/{variant_id}/assignments",
    response_model=ElectricalAssignmentsMutationResponse,
    summary="Атомарно назначить объекты в систему выбранного ЭР",
)
async def assign_electrical_objects(
    project_id: UUID,
    variant_id: UUID,
    data: ElectricalAssignmentsPatchRequest,
    principal: CurrentPrincipal = Depends(_require_any),
    db: AsyncSession = Depends(get_db),
) -> ElectricalAssignmentsMutationResponse:
    try:
        return await ElectricalAssignmentService(db).assign(
            project_id,
            variant_id,
            principal,
            system_type=data.system_type,
            items=data.items,
        )
    except (ElectricalVariantServiceError, ProjectNotFoundError, ProjectAccessError) as exc:
        _raise_service_error(exc)


@router.patch(
    "/{project_id}/electrical-variants/{variant_id}/assignments/{object_id}/electrical-overrides",
    response_model=ElectricalAssignmentResponse,
    summary="Изменить входы TT для объекта внутри точного ЭР",
)
async def patch_assignment_electrical_overrides(
    project_id: UUID,
    variant_id: UUID,
    object_id: UUID,
    data: ElectricalAssignmentOverridesPatch,
    principal: CurrentPrincipal = Depends(_require_any),
    db: AsyncSession = Depends(get_db),
) -> ElectricalAssignmentResponse:
    try:
        return await ElectricalAssignmentService(db).patch_electrical_overrides(
            project_id,
            variant_id,
            object_id,
            data,
            principal,
        )
    except (ElectricalVariantServiceError, ProjectNotFoundError, ProjectAccessError) as exc:
        _raise_service_error(exc)


@router.post(
    "/{project_id}/electrical-variants/{variant_id}/objects/{object_id}/cable-selection",
    response_model=ElectricalCableSelectionResponse,
    summary="Атомарно выбрать кабель для объекта текущего ЭР",
)
async def select_assignment_cable(
    project_id: UUID,
    variant_id: UUID,
    object_id: UUID,
    data: ElectricalCableSelectionRequest,
    principal: CurrentPrincipal = Depends(_require_any),
    db: AsyncSession = Depends(get_db),
) -> ElectricalCableSelectionResponse:
    if data.cable_source in ("extended", "all") and principal.role not in (
        "employee",
        "admin",
    ):
        raise HTTPException(
            status_code=403,
            detail="Расширенный каталог доступен только сотрудникам",
        )
    try:
        await ProjectService(db).get_project_for_write(project_id, principal)
        services = CalculationContainer(db)
        calc, assignment, obj = await services.electrical_single.select_cable_for_assignment(
            project_id=project_id,
            electrical_variant_id=variant_id,
            object_id=object_id,
            data=data,
        )
        calculation = (
            await services.electrical_summary.electrical_calc_summaries([calc], data.cable_source)
        )[0]
        assignment_response = ElectricalAssignmentService.response_for(assignment, obj)
        await AuditService(db).try_record(
            event_type="calculation.electrical.cable_selected",
            category="calculation",
            principal=principal,
            project_id=project_id,
            object_id=object_id,
            details={
                "electrical_variant_id": str(variant_id),
                "mode": data.mode,
                "cable_mark": data.cable_mark,
                "cable_source": data.cable_source,
                "assignment_version": assignment.version,
            },
            message="Выбор кабеля текущего ЭР сохранён атомарно",
        )
        return ElectricalCableSelectionResponse(
            assignment=assignment_response,
            calculation=calculation,
        )
    except (ElectricalVariantServiceError, ElectricalCalcConcurrencyError) as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.as_detail()) from exc
    except (ProjectNotFoundError, ProjectAccessError) as exc:
        _raise_service_error(exc)
    except (ElectricalFormulaError, ElectricalInputResolutionError) as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.as_detail()) from exc
    except CalculationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post(
    "/{project_id}/electrical-variants/{variant_id}/unassign",
    response_model=ElectricalAssignmentsMutationResponse,
    summary="С подтверждением вернуть объекты в нераспределённые",
)
async def unassign_electrical_objects(
    project_id: UUID,
    variant_id: UUID,
    data: ElectricalAssignmentsUnassignRequest,
    principal: CurrentPrincipal = Depends(_require_any),
    db: AsyncSession = Depends(get_db),
) -> ElectricalAssignmentsMutationResponse:
    try:
        return await ElectricalAssignmentService(db).unassign(
            project_id,
            variant_id,
            principal,
            confirm=data.confirm,
            items=data.items,
        )
    except (ElectricalVariantServiceError, ProjectNotFoundError, ProjectAccessError) as exc:
        _raise_service_error(exc)


@router.post(
    "/{project_id}/electrical-variants",
    response_model=ElectricalVariantResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Создать пустой ЭР",
)
async def create_electrical_variant(
    project_id: UUID,
    data: ElectricalVariantCreateRequest | None = None,
    idempotency_key: str | None = Header(
        default=None,
        alias="Idempotency-Key",
        min_length=1,
        max_length=256,
    ),
    principal: CurrentPrincipal = Depends(_require_any),
    db: AsyncSession = Depends(get_db),
) -> ElectricalVariantResponse:
    try:
        return await ElectricalVariantService(db).create_empty(
            project_id,
            principal,
            idempotency_key=idempotency_key,
            name=data.name if data is not None else None,
        )
    except (ElectricalVariantServiceError, ProjectNotFoundError, ProjectAccessError) as exc:
        _raise_service_error(exc)


@router.post(
    "/{project_id}/electrical-variants/{variant_id}/copy",
    response_model=ElectricalVariantResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Глубоко скопировать ЭР без спецификации",
)
async def copy_electrical_variant(
    project_id: UUID,
    variant_id: UUID,
    data: ElectricalVariantCopyRequest | None = None,
    idempotency_key: str = Header(
        ...,
        alias="Idempotency-Key",
        min_length=1,
        max_length=256,
    ),
    principal: CurrentPrincipal = Depends(_require_any),
    db: AsyncSession = Depends(get_db),
) -> ElectricalVariantResponse:
    try:
        return await ElectricalVariantService(db).copy_variant(
            project_id,
            variant_id,
            principal,
            idempotency_key=idempotency_key,
            name=data.name if data is not None else None,
        )
    except (ElectricalVariantServiceError, ProjectNotFoundError, ProjectAccessError) as exc:
        _raise_service_error(exc)


@router.patch(
    "/{project_id}/electrical-variants/{variant_id}",
    response_model=ElectricalVariantResponse,
    summary="Переименовать ЭР",
)
async def rename_electrical_variant(
    project_id: UUID,
    variant_id: UUID,
    data: ElectricalVariantRenameRequest,
    principal: CurrentPrincipal = Depends(_require_any),
    db: AsyncSession = Depends(get_db),
) -> ElectricalVariantResponse:
    try:
        return await ElectricalVariantService(db).rename_variant(
            project_id,
            variant_id,
            data.name,
            principal,
        )
    except (ElectricalVariantServiceError, ProjectNotFoundError, ProjectAccessError) as exc:
        _raise_service_error(exc)


@router.post(
    "/{project_id}/electrical-variants/{variant_id}/activate",
    response_model=ElectricalVariantResponse,
    summary="Сделать ЭР активным",
)
async def activate_electrical_variant(
    project_id: UUID,
    variant_id: UUID,
    principal: CurrentPrincipal = Depends(_require_any),
    db: AsyncSession = Depends(get_db),
) -> ElectricalVariantResponse:
    try:
        return await ElectricalVariantService(db).activate_variant(
            project_id,
            variant_id,
            principal,
        )
    except (ElectricalVariantServiceError, ProjectNotFoundError, ProjectAccessError) as exc:
        _raise_service_error(exc)


@router.delete(
    "/{project_id}/electrical-variants/{variant_id}",
    response_model=ElectricalVariantDeleteResponse,
    summary="Удалить ЭР с детерминированным active fallback",
)
async def delete_electrical_variant(
    project_id: UUID,
    variant_id: UUID,
    principal: CurrentPrincipal = Depends(_require_any),
    db: AsyncSession = Depends(get_db),
) -> ElectricalVariantDeleteResponse:
    try:
        return await ElectricalVariantService(db).delete_variant(
            project_id,
            variant_id,
            principal,
        )
    except (ElectricalVariantServiceError, ProjectNotFoundError, ProjectAccessError) as exc:
        _raise_service_error(exc)
