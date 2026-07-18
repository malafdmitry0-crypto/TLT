"""Lifecycle endpoints for project-scoped named electrical variants (ER)."""

from typing import NoReturn
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import CurrentPrincipal, require_any
from app.schemas.electrical_variant import (
    ElectricalReadinessResponse,
    ElectricalVariantCopyRequest,
    ElectricalVariantCreateRequest,
    ElectricalVariantDeleteResponse,
    ElectricalVariantInitializeResponse,
    ElectricalVariantRenameRequest,
    ElectricalVariantResponse,
)
from app.services.electrical_variant_service import (
    ElectricalVariantService,
    ElectricalVariantServiceError,
)
from app.services.project_service import ProjectAccessError, ProjectNotFoundError

router = APIRouter()
_require_any = require_any()  # type: ignore[no-untyped-call]


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


@router.post(
    "/{project_id}/electrical-variants",
    response_model=ElectricalVariantResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Создать пустой ЭР",
)
async def create_electrical_variant(
    project_id: UUID,
    data: ElectricalVariantCreateRequest | None = None,
    principal: CurrentPrincipal = Depends(_require_any),
    db: AsyncSession = Depends(get_db),
) -> ElectricalVariantResponse:
    try:
        return await ElectricalVariantService(db).create_empty(
            project_id,
            principal,
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
