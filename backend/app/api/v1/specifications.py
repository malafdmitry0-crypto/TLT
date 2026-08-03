"""Endpoints спецификации."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import CurrentPrincipal, require_any, require_employee
from app.schemas.specification import (
    SpecificationGenerateResponse,
    SpecificationGenerationRequestV2,
    SpecificationGenerationResponseV2,
    SpecificationItem,
    SpecificationResponse,
    SpecificationSettingsResponse,
    SpecificationSettingsUpdateRequest,
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
from app.services.specification_generation_v2_service import (
    SpecificationGenerationV2Service,
    SpecificationProjectSettingsService,
)
from app.services.specification_preflight_service import SpecificationPreflightServiceError
from app.services.specification_service import SpecificationService

router = APIRouter()


@router.get(
    "/{project_id}/settings",
    response_model=SpecificationSettingsResponse,
    summary="Project specification defaults (PDL-ER-07)",
)
async def get_specification_settings(
    project_id: UUID,
    principal: CurrentPrincipal = Depends(require_any()),
    db: AsyncSession = Depends(get_db),
):
    try:
        await ProjectService(db).get_project_basic(project_id, principal)
    except ProjectNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ProjectAccessError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc

    return await SpecificationProjectSettingsService(db).get(project_id)


@router.put(
    "/{project_id}/settings",
    response_model=SpecificationSettingsResponse,
    summary="Save project specification defaults without regenerating (PDL-ER-07)",
)
async def update_specification_settings(
    project_id: UUID,
    data: SpecificationSettingsUpdateRequest,
    principal: CurrentPrincipal = Depends(require_any()),
    db: AsyncSession = Depends(get_db),
):
    try:
        await ProjectService(db).get_project_for_write(project_id, principal)
    except ProjectNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ProjectAccessError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc

    response = await SpecificationProjectSettingsService(db).update(project_id, data.settings)
    await AuditService(db).try_record(
        event_type="specification.settings_updated",
        category="specification",
        principal=principal,
        project_id=project_id,
        details={"settings_version": response.version},
        message="Обновлены project defaults спецификации",
    )
    return response


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
    response_model=SpecificationGenerationResponseV2,
    status_code=status.HTTP_201_CREATED,
    summary="Сформировать спецификации выбранных ЭР (V2)",
)
async def generate_specification(
    project_id: UUID,
    data: SpecificationGenerationRequestV2,
    principal: CurrentPrincipal = Depends(require_any()),
    db: AsyncSession = Depends(get_db),
):
    try:
        await ProjectService(db).get_project_for_write(project_id, principal)
    except ProjectNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ProjectAccessError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc

    try:
        response = await SpecificationGenerationV2Service(db).generate(project_id, principal, data)
    except SpecificationPreflightServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.as_detail()) from exc
    await AuditService(db).try_record(
        event_type="specification.generated",
        category="specification",
        principal=principal,
        project_id=project_id,
        details={
            "electrical_variant_ids": [str(item) for item in data.variant_ids],
            "generated_count": sum(result.status == "generated" for result in response.results),
        },
        message="Сформированы спецификации выбранных ЭР",
    )
    return response


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
