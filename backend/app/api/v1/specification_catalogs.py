"""Admin HTTP for versioned specification catalogs (SPEC-CANON-02)."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import CurrentPrincipal, require_admin
from app.schemas.specification_catalog import (
    SpecificationCatalogActivationResponse,
    SpecificationCatalogDetailResponse,
    SpecificationCatalogImportRequest,
    SpecificationCatalogItemSummary,
    SpecificationCatalogVersionResponse,
)
from app.services.audit_service import AuditService
from app.services.specification_catalog import (
    SpecificationCatalogService,
    SpecificationCatalogServiceError,
)

router = APIRouter()


def _raise_catalog_error(exc: SpecificationCatalogServiceError) -> None:
    raise HTTPException(status_code=exc.status_code, detail=exc.as_detail()) from exc


def _version_response(version: Any) -> SpecificationCatalogVersionResponse:
    return SpecificationCatalogVersionResponse.model_validate(version)


@router.get(
    "/specification-catalogs",
    response_model=list[SpecificationCatalogVersionResponse],
    summary="Список версий specification catalog",
)
async def list_specification_catalogs(
    catalog_key: str | None = Query(default=None, min_length=1, max_length=64),
    status_filter: str | None = Query(
        default=None,
        alias="status",
        pattern="^(draft|active|retired)$",
    ),
    _: CurrentPrincipal = Depends(require_admin()),
    db: AsyncSession = Depends(get_db),
) -> list[SpecificationCatalogVersionResponse]:
    versions = await SpecificationCatalogService(db).list_versions(
        catalog_key=catalog_key,
        status=status_filter,
    )
    return [_version_response(item) for item in versions]


@router.post(
    "/specification-catalogs/import",
    response_model=SpecificationCatalogVersionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Импортировать draft-версию specification catalog",
)
async def import_specification_catalog(
    document: SpecificationCatalogImportRequest,
    principal: CurrentPrincipal = Depends(require_admin()),
    db: AsyncSession = Depends(get_db),
) -> SpecificationCatalogVersionResponse:
    """Create an immutable draft and return validation issues without activating."""
    try:
        version = await SpecificationCatalogService(db).import_draft(
            document,
            principal=principal,
        )
    except SpecificationCatalogServiceError as exc:
        _raise_catalog_error(exc)
    # Serialize before audit commit: expire_on_commit would otherwise detach attrs.
    response = _version_response(version)
    await AuditService(db).try_record(
        event_type="admin.specification_catalog.imported",
        category="specification",
        principal=principal,
        details={
            "catalog_version_id": str(response.id),
            "catalog_key": response.catalog_key,
            "version": response.version,
            "authority": response.authority.value,
            "is_complete": response.is_complete,
            "item_count": response.item_count,
        },
        message="Администратор импортировал draft specification catalog",
    )
    return response


@router.get(
    "/specification-catalogs/{catalog_version_id}",
    response_model=SpecificationCatalogDetailResponse,
    summary="Детали версии specification catalog",
)
async def get_specification_catalog(
    catalog_version_id: UUID,
    _: CurrentPrincipal = Depends(require_admin()),
    db: AsyncSession = Depends(get_db),
) -> SpecificationCatalogDetailResponse:
    try:
        resolved = await SpecificationCatalogService(db).get_version(catalog_version_id)
    except SpecificationCatalogServiceError as exc:
        _raise_catalog_error(exc)
    base = _version_response(resolved.version)
    return SpecificationCatalogDetailResponse(
        **base.model_dump(),
        items=[SpecificationCatalogItemSummary.model_validate(item) for item in resolved.items],
    )


@router.post(
    "/specification-catalogs/{catalog_version_id}/activate",
    response_model=SpecificationCatalogActivationResponse,
    summary="Активировать specification catalog (fail-closed)",
)
async def activate_specification_catalog(
    catalog_version_id: UUID,
    principal: CurrentPrincipal = Depends(require_admin()),
    db: AsyncSession = Depends(get_db),
) -> SpecificationCatalogActivationResponse:
    try:
        result = await SpecificationCatalogService(db).activate(
            catalog_version_id,
            principal=principal,
        )
    except SpecificationCatalogServiceError as exc:
        _raise_catalog_error(exc)
    response = SpecificationCatalogActivationResponse(
        catalog=_version_response(result.catalog),
        stale_specification_count=result.stale_specification_count,
    )
    await AuditService(db).try_record(
        event_type="admin.specification_catalog.activated",
        category="specification",
        principal=principal,
        details={
            "catalog_version_id": str(response.catalog.id),
            "catalog_key": response.catalog.catalog_key,
            "version": response.catalog.version,
            "stale_specification_count": response.stale_specification_count,
        },
        message="Администратор активировал specification catalog",
    )
    return response
