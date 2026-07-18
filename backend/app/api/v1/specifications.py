"""Endpoints спецификации."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import CurrentPrincipal, require_any, require_employee
from app.schemas.specification import (
    SpecificationGenerateRequest,
    SpecificationGenerateResponse,
    SpecificationItem,
    SpecificationResponse,
    SpecificationUpdateRequest,
)
from app.services.audit_service import AuditService
from app.services.project_service import (
    ProjectAccessError,
    ProjectNotFoundError,
    ProjectService,
)
from app.services.specification_service import SpecificationService

router = APIRouter()


@router.get(
    "/{project_id}",
    response_model=SpecificationResponse | None,
    summary="Получить актуальную спецификацию проекта",
)
async def get_specification(
    project_id: UUID,
    variant: int = 1,
    principal: CurrentPrincipal = Depends(require_any()),
    db: AsyncSession = Depends(get_db),
):
    try:
        await ProjectService(db).get_project_basic(project_id, principal)
    except ProjectNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ProjectAccessError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc

    spec = await SpecificationService(db).get_specification(project_id, variant)
    return spec


@router.post(
    "/{project_id}/generate",
    response_model=SpecificationGenerateResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Сгенерировать спецификацию",
)
async def generate_specification(
    project_id: UUID,
    variant: int = 1,
    data: SpecificationGenerateRequest | None = None,
    principal: CurrentPrincipal = Depends(require_any()),
    db: AsyncSession = Depends(get_db),
):
    try:
        await ProjectService(db).get_project_for_write(project_id, principal)
    except ProjectNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ProjectAccessError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc

    req = data or SpecificationGenerateRequest()
    # Полная спецификация (условный BOM ТНП) — функция полной версии (Сотрудник).
    # Явный 403 вместо тихого даунгрейда: клиент должен знать, что режим недоступен.
    if req.mode == "full" and getattr(principal, "role", None) == "guest":
        raise HTTPException(
            status_code=403,
            detail="Полная спецификация доступна только сотруднику",
        )

    result = await SpecificationService(db).generate(
        project_id, variant, mode=req.mode, options=req.options
    )
    await AuditService(db).try_record(
        event_type="specification.generated",
        category="specification",
        principal=principal,
        project_id=project_id,
        details={
            "variant": variant,
            "item_count": len(result.items),
            "mode": result.mode,
            "skipped_objects": result.skipped_objects,
        },
        message="Сгенерирована спецификация",
    )
    return SpecificationGenerateResponse(
        project_id=project_id,
        items=result.items,
        mode=result.mode,
        skipped_objects=result.skipped_objects,
    )


@router.put(
    "/{project_id}/items",
    response_model=SpecificationGenerateResponse,
    summary="Сохранить произвольный набор позиций спецификации (только сотрудник)",
)
async def save_specification_items(
    project_id: UUID,
    data: SpecificationUpdateRequest,
    variant: int = 1,
    principal: CurrentPrincipal = Depends(require_employee()),
    db: AsyncSession = Depends(get_db),
):
    try:
        await ProjectService(db).get_project_for_write(project_id, principal)
    except ProjectNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ProjectAccessError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc

    items: list[SpecificationItem] = await SpecificationService(db).save_items(
        project_id, data.items, variant
    )
    await AuditService(db).try_record(
        event_type="specification.items_saved",
        category="specification",
        principal=principal,
        project_id=project_id,
        details={"variant": variant, "item_count": len(items)},
        message="Сохранены позиции спецификации",
    )
    return SpecificationGenerateResponse(project_id=project_id, items=items)
