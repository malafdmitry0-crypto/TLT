"""Endpoints спецификации."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import CurrentPrincipal, require_any, require_employee
from app.schemas.specification import (
    SpecificationCatalogSelectionEntry,
    SpecificationCatalogSelectionsPutRequest,
    SpecificationCatalogSelectionsResponse,
    SpecificationDiagnosticCode,
    SpecificationErrorDetail,
    SpecificationErrorEnvelope,
    SpecificationGenerationRequest,
    SpecificationGenerationResponse,
    SpecificationItem,
    SpecificationManualItemsResponse,
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
from app.services.specification_generation_service import (
    SpecificationGenerationService,
    SpecificationProjectSettingsService,
)
from app.services.specification_preflight_service import SpecificationPreflightServiceError
from app.services.specification_selection_service import SpecificationSelectionService
from app.services.specification_service import SpecificationService

router = APIRouter()


def _generation_http_status(generated: SpecificationGenerationResponse) -> int:
    if any(result.status == "generated" for result in generated.results):
        return status.HTTP_201_CREATED
    if any(result.status == "blocked" for result in generated.results):
        return status.HTTP_422_UNPROCESSABLE_CONTENT
    return status.HTTP_409_CONFLICT


def _specification_http_error(
    *,
    status_code: int,
    code: SpecificationDiagnosticCode,
    message: str,
) -> HTTPException:
    return HTTPException(
        status_code=status_code,
        detail=SpecificationErrorDetail(
            code=code,
            message=message,
        ).model_dump(mode="json"),
    )


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
        raise _specification_http_error(
            status_code=status.HTTP_404_NOT_FOUND,
            code=SpecificationDiagnosticCode.PROJECT_NOT_FOUND,
            message=str(exc),
        ) from exc
    except ProjectAccessError as exc:
        raise _specification_http_error(
            status_code=status.HTTP_403_FORBIDDEN,
            code=SpecificationDiagnosticCode.PROJECT_ACCESS_DENIED,
            message=str(exc),
        ) from exc

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
        raise _specification_http_error(
            status_code=status.HTTP_404_NOT_FOUND,
            code=SpecificationDiagnosticCode.PROJECT_NOT_FOUND,
            message=str(exc),
        ) from exc
    except ProjectAccessError as exc:
        raise _specification_http_error(
            status_code=status.HTTP_403_FORBIDDEN,
            code=SpecificationDiagnosticCode.PROJECT_ACCESS_DENIED,
            message=str(exc),
        ) from exc

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
    "/{project_id}/variants/{electrical_variant_id}",
    response_model=SpecificationResponse | None,
    summary="Получить спецификацию ЭР по UUID (канонический data plane)",
)
async def get_specification_for_variant(
    project_id: UUID,
    electrical_variant_id: UUID,
    principal: CurrentPrincipal = Depends(require_any()),
    db: AsyncSession = Depends(get_db),
):
    try:
        await ProjectService(db).get_project_basic(project_id, principal)
        await ElectricalVariantService(db).require_variant_for_read(
            project_id, principal, electrical_variant_id
        )
    except ElectricalVariantServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.as_detail()) from exc
    except ProjectNotFoundError as exc:
        raise _specification_http_error(
            status_code=status.HTTP_404_NOT_FOUND,
            code=SpecificationDiagnosticCode.PROJECT_NOT_FOUND,
            message=str(exc),
        ) from exc
    except ProjectAccessError as exc:
        raise _specification_http_error(
            status_code=status.HTTP_403_FORBIDDEN,
            code=SpecificationDiagnosticCode.PROJECT_ACCESS_DENIED,
            message=str(exc),
        ) from exc

    return await SpecificationService(db).get_specification(
        project_id,
        electrical_variant_id=electrical_variant_id,
    )


@router.get(
    "/{project_id}/variants/{electrical_variant_id}/catalog-selections",
    response_model=SpecificationCatalogSelectionsResponse,
    summary="Persisted multi-candidate catalog selections for one ER",
)
async def get_catalog_selections_for_variant(
    project_id: UUID,
    electrical_variant_id: UUID,
    principal: CurrentPrincipal = Depends(require_any()),
    db: AsyncSession = Depends(get_db),
):
    try:
        await ProjectService(db).get_project_basic(project_id, principal)
        await ElectricalVariantService(db).require_variant_for_read(
            project_id, principal, electrical_variant_id
        )
    except ElectricalVariantServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.as_detail()) from exc
    except ProjectNotFoundError as exc:
        raise _specification_http_error(
            status_code=status.HTTP_404_NOT_FOUND,
            code=SpecificationDiagnosticCode.PROJECT_NOT_FOUND,
            message=str(exc),
        ) from exc
    except ProjectAccessError as exc:
        raise _specification_http_error(
            status_code=status.HTTP_403_FORBIDDEN,
            code=SpecificationDiagnosticCode.PROJECT_ACCESS_DENIED,
            message=str(exc),
        ) from exc

    collection = await SpecificationSelectionService(db).get_collection(
        project_id, electrical_variant_id
    )
    return SpecificationCatalogSelectionsResponse(
        project_id=collection.project_id,
        electrical_variant_id=collection.electrical_variant_id,
        collection_version=collection.collection_version,
        selections=[
            SpecificationCatalogSelectionEntry(
                candidate_group_key=row.candidate_group_key,
                catalog_version_id=row.catalog_version_id,
                catalog_item_id=row.catalog_item_id,
                candidate_set_fingerprint=row.candidate_set_fingerprint,
            )
            for row in collection.selections
        ],
    )


@router.put(
    "/{project_id}/variants/{electrical_variant_id}/catalog-selections",
    response_model=SpecificationCatalogSelectionsResponse,
    summary="Replace persisted multi-candidate catalog selections for one ER",
)
async def put_catalog_selections_for_variant(
    project_id: UUID,
    electrical_variant_id: UUID,
    data: SpecificationCatalogSelectionsPutRequest,
    principal: CurrentPrincipal = Depends(require_any()),
    db: AsyncSession = Depends(get_db),
):
    try:
        await ProjectService(db).get_project_for_write(project_id, principal)
        await ElectricalVariantService(db).require_variant_for_read(
            project_id, principal, electrical_variant_id
        )
    except ElectricalVariantServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.as_detail()) from exc
    except ProjectNotFoundError as exc:
        raise _specification_http_error(
            status_code=status.HTTP_404_NOT_FOUND,
            code=SpecificationDiagnosticCode.PROJECT_NOT_FOUND,
            message=str(exc),
        ) from exc
    except ProjectAccessError as exc:
        raise _specification_http_error(
            status_code=status.HTTP_403_FORBIDDEN,
            code=SpecificationDiagnosticCode.PROJECT_ACCESS_DENIED,
            message=str(exc),
        ) from exc

    try:
        collection = await SpecificationSelectionService(db).replace_collection(
            project_id=project_id,
            electrical_variant_id=electrical_variant_id,
            expected_version=data.expected_version,
            selections=[item.model_dump(mode="json") for item in data.selections],
            commit=True,
        )
    except ElectricalVariantServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.as_detail()) from exc

    await AuditService(db).try_record(
        event_type="specification.catalog_selections_replaced",
        category="specification",
        principal=principal,
        project_id=project_id,
        details={
            "electrical_variant_id": str(electrical_variant_id),
            "selection_count": len(collection.selections),
            "collection_version": collection.collection_version,
        },
        message="Обновлены catalog selections спецификации",
    )
    return SpecificationCatalogSelectionsResponse(
        project_id=collection.project_id,
        electrical_variant_id=collection.electrical_variant_id,
        collection_version=collection.collection_version,
        selections=[
            SpecificationCatalogSelectionEntry(
                candidate_group_key=row.candidate_group_key,
                catalog_version_id=row.catalog_version_id,
                catalog_item_id=row.catalog_item_id,
                candidate_set_fingerprint=row.candidate_set_fingerprint,
            )
            for row in collection.selections
        ],
    )


@router.put(
    "/{project_id}/variants/{electrical_variant_id}/items",
    response_model=SpecificationManualItemsResponse,
    summary="Сохранить позиции спецификации ЭР (employee/admin, UUID path)",
)
async def save_specification_items_for_variant(
    project_id: UUID,
    electrical_variant_id: UUID,
    data: SpecificationUpdateRequest,
    principal: CurrentPrincipal = Depends(require_employee()),
    db: AsyncSession = Depends(get_db),
):
    try:
        await ProjectService(db).get_project_for_write(project_id, principal)
        electrical_variant = await ElectricalVariantService(db).require_variant_for_read(
            project_id, principal, electrical_variant_id
        )
    except ProjectNotFoundError as exc:
        raise _specification_http_error(
            status_code=status.HTTP_404_NOT_FOUND,
            code=SpecificationDiagnosticCode.PROJECT_NOT_FOUND,
            message=str(exc),
        ) from exc
    except ProjectAccessError as exc:
        raise _specification_http_error(
            status_code=status.HTTP_403_FORBIDDEN,
            code=SpecificationDiagnosticCode.PROJECT_ACCESS_DENIED,
            message=str(exc),
        ) from exc
    except ElectricalVariantServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.as_detail()) from exc

    try:
        items: list[SpecificationItem] = await SpecificationService(db).save_items(
            project_id,
            electrical_variant.id,
            data.items,
        )
    except ElectricalVariantServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.as_detail()) from exc

    await AuditService(db).try_record(
        event_type="specification.items_saved",
        category="specification",
        principal=principal,
        project_id=project_id,
        details={
            "electrical_variant_id": str(electrical_variant.id),
            "item_count": len(items),
        },
        message="Сохранены позиции спецификации",
    )
    return SpecificationManualItemsResponse(
        project_id=project_id,
        items=items,
        electrical_variant_id=electrical_variant.id,
    )


@router.post(
    "/{project_id}/generate",
    response_model=SpecificationGenerationResponse,
    status_code=status.HTTP_201_CREATED,
    responses={
        status.HTTP_403_FORBIDDEN: {"model": SpecificationErrorEnvelope},
        status.HTTP_404_NOT_FOUND: {"model": SpecificationErrorEnvelope},
        status.HTTP_409_CONFLICT: {"model": SpecificationGenerationResponse},
        status.HTTP_422_UNPROCESSABLE_CONTENT: {
            "model": SpecificationGenerationResponse | SpecificationErrorEnvelope
        },
        status.HTTP_503_SERVICE_UNAVAILABLE: {"model": SpecificationErrorEnvelope},
    },
    summary="Сформировать спецификации выбранных ЭР (канонический UUID BOM)",
)
async def generate_specification(
    project_id: UUID,
    data: SpecificationGenerationRequest,
    response: Response,
    principal: CurrentPrincipal = Depends(require_any()),
    db: AsyncSession = Depends(get_db),
):
    """Canonical generate: SpecificationGenerationService only (no legacy full_builder)."""
    try:
        await ProjectService(db).get_project_for_write(project_id, principal)
    except ProjectNotFoundError as exc:
        raise _specification_http_error(
            status_code=status.HTTP_404_NOT_FOUND,
            code=SpecificationDiagnosticCode.PROJECT_NOT_FOUND,
            message=str(exc),
        ) from exc
    except ProjectAccessError as exc:
        raise _specification_http_error(
            status_code=status.HTTP_403_FORBIDDEN,
            code=SpecificationDiagnosticCode.PROJECT_ACCESS_DENIED,
            message=str(exc),
        ) from exc

    try:
        generated = await SpecificationGenerationService(db).generate(project_id, principal, data)
    except SpecificationPreflightServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.as_detail()) from exc
    generated_count = sum(result.status == "generated" for result in generated.results)
    response.status_code = _generation_http_status(generated)
    await AuditService(db).try_record(
        event_type=(
            "specification.generated"
            if generated_count
            else "specification.generation_not_completed"
        ),
        category="specification",
        principal=principal,
        project_id=project_id,
        details={
            "electrical_variant_ids": [str(item) for item in data.variant_ids],
            "generated_count": generated_count,
            "statuses": [result.status.value for result in generated.results],
        },
        message=(
            "Сформированы спецификации выбранных ЭР"
            if generated_count
            else "Формирование спецификаций не завершено"
        ),
    )
    return generated
