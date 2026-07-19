"""Endpoints спецификации."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
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
from app.services.electrical_variant_service import (
    ElectricalVariantService,
    ElectricalVariantServiceError,
)
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
    electrical_variant_id: UUID | None = Query(default=None),
    principal: CurrentPrincipal = Depends(require_any()),
    db: AsyncSession = Depends(get_db),
):
    try:
        await ProjectService(db).get_project_basic(project_id, principal)
        if electrical_variant_id is not None:
            await ElectricalVariantService(db).validate_legacy_variant_for_read(
                project_id,
                principal,
                variant,
                electrical_variant_id,
            )
    except ElectricalVariantServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.as_detail()) from exc
    except ProjectNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ProjectAccessError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc

    spec = await SpecificationService(db).get_specification(
        project_id,
        variant,
        electrical_variant_id=electrical_variant_id,
    )
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
    electrical_variant_id: UUID | None = Query(default=None),
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
    # PDL-ER-04: полный автоматический BOM доступен гостю; manual items — только
    # сотруднику/админу (см. PUT /items + frontend canManuallyEdit).

    try:
        # PDL-ER-01: explicit multi-ER list wins over single legacy slot params.
        requested_ids = list(dict.fromkeys(req.electrical_variant_ids or []))
        # Single-query compatibility: UUID param alone still works.
        if (
            electrical_variant_id is not None
            and electrical_variant_id not in requested_ids
            and not requested_ids
        ):
            requested_ids = [electrical_variant_id]

        if requested_ids:
            if len(requested_ids) > 5:
                raise HTTPException(
                    status_code=422,
                    detail={
                        "error_code": "ELECTRICAL_VARIANT_LIMIT_REACHED",
                        "message": "Можно выбрать не более 5 ЭР для генерации",
                    },
                )
            results = await SpecificationService(db).generate_for_electrical_variants(
                project_id,
                principal,
                requested_ids,
                mode=req.mode,
                options=req.options,
            )
            primary = results[0]
            await AuditService(db).try_record(
                event_type="specification.generated",
                category="specification",
                principal=principal,
                project_id=project_id,
                details={
                    "electrical_variant_ids": [str(item.electrical_variant_id) for item in results],
                    "item_count": len(primary.items),
                    "mode": primary.mode,
                    "skipped_objects": primary.skipped_objects,
                    "generated_count": len(results),
                },
                message="Сгенерирована спецификация (multi-ЭР)",
            )
            return SpecificationGenerateResponse(
                project_id=project_id,
                items=primary.items,
                mode=primary.mode,
                skipped_objects=primary.skipped_objects,
                electrical_variant_id=primary.electrical_variant_id,
                results=[
                    {
                        "electrical_variant_id": item.electrical_variant_id,
                        "items": item.items,
                        "mode": item.mode,
                        "skipped_objects": item.skipped_objects,
                    }
                    for item in results
                ],
            )

        electrical_variant = await ElectricalVariantService(db).prepare_legacy_variant_for_write(
            project_id,
            principal,
            variant,
            expected_electrical_variant_id=electrical_variant_id,
        )
        result = await SpecificationService(db).generate(
            project_id,
            variant,
            mode=req.mode,
            options=req.options,
            electrical_variant_id=electrical_variant.id,
        )
    except ElectricalVariantServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.as_detail()) from exc
    await AuditService(db).try_record(
        event_type="specification.generated",
        category="specification",
        principal=principal,
        project_id=project_id,
        details={
            "variant": variant,
            "electrical_variant_id": str(electrical_variant.id),
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
        electrical_variant_id=electrical_variant.id,
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
    electrical_variant_id: UUID | None = Query(default=None),
    principal: CurrentPrincipal = Depends(require_employee()),
    db: AsyncSession = Depends(get_db),
):
    try:
        await ProjectService(db).get_project_for_write(project_id, principal)
    except ProjectNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ProjectAccessError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc

    try:
        electrical_variant = await ElectricalVariantService(db).prepare_legacy_variant_for_write(
            project_id,
            principal,
            variant,
            expected_electrical_variant_id=electrical_variant_id,
        )
        items: list[SpecificationItem] = await SpecificationService(db).save_items(
            project_id,
            data.items,
            variant,
            electrical_variant_id=electrical_variant.id,
        )
    except ElectricalVariantServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.as_detail()) from exc
    await AuditService(db).try_record(
        event_type="specification.items_saved",
        category="specification",
        principal=principal,
        project_id=project_id,
        details={
            "variant": variant,
            "electrical_variant_id": str(electrical_variant.id),
            "item_count": len(items),
        },
        message="Сохранены позиции спецификации",
    )
    return SpecificationGenerateResponse(project_id=project_id, items=items)
