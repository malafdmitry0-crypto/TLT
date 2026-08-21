"""Endpoints расчётов."""

from typing import NoReturn
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, status
from pydantic import ValidationError
from sqlalchemy import select as sa_select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import CurrentPrincipal, require_any
from app.core.rate_limit import batch_limiter, enforce_principal_rate_limit
from app.electrical_domain import ElectricalFormulaError
from app.models.electrical_calculation import ElectricalCalculation
from app.schemas.calculation import (
    BatchCalcResponse,
    BatchElectricalResponse,
    CableOptionOut,
    CopyElectricalVariantRequest,
    CopyElectricalVariantResponse,
    ElectricalCableSelectionVariantsRequest,
    ElectricalCalcSummary,
    ElectricalCandidateApplyResponse,
    ElectricalCandidateCreateRequest,
    ElectricalCandidateFolderCreateRequest,
    ElectricalCandidateFolderItemRequest,
    ElectricalCandidateFolderResponse,
    ElectricalCandidateFolderUpdateRequest,
    ElectricalCandidateResponse,
    ElectricalCandidateUpdateRequest,
    ElectricalCandidateUpsertResponse,
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
from app.schemas.electrical_catalog import ElectricalCatalogMetadataResponse
from app.schemas.electrical_history import ElectricalCalculationHistoryResponse
from app.services.audit_service import AuditService
from app.services.calculation_service import (
    CalculationError,
    CalculationService,
    ElectricalCalcConcurrencyError,
    ElectricalCandidateApplyError,
    ElectricalVariantCopyError,
)
from app.services.electrical_catalog_service import ElectricalCatalogService
from app.services.electrical_history_service import (
    ElectricalCalculationHistoryNotFoundError,
    ElectricalHistoryService,
)
from app.services.electrical_input_resolver import (
    RETIRED_TT_INPUT_FIELDS,
    ElectricalInputResolutionError,
)
from app.services.electrical_query_service import (
    ElectricalQueryService,
    ElectricalQueryValidationError,
)
from app.services.electrical_variant_service import (
    ElectricalVariantService,
    ElectricalVariantServiceError,
)
from app.services.project_service import ProjectAccessError, ProjectNotFoundError, ProjectService

router = APIRouter()


@router.get(
    "/electrical/catalog-metadata",
    response_model=ElectricalCatalogMetadataResponse,
    summary="Активные версии электрических каталогов",
)
async def electrical_catalog_metadata(
    _: CurrentPrincipal = Depends(require_any()),
    db: AsyncSession = Depends(get_db),
) -> ElectricalCatalogMetadataResponse:
    """Return DB-active versions or explicit dev/test static fallbacks."""
    return await ElectricalCatalogService(db).metadata()


def _raise_project_error(exc: Exception) -> NoReturn:
    if isinstance(exc, ProjectNotFoundError):
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    if isinstance(exc, ProjectAccessError):
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    raise exc


def _reject_retired_tt_query_inputs(request: Request, cable_type: str) -> None:
    """Reject known removed TT inputs that FastAPI would otherwise ignore."""
    if cable_type != "self_regulating_tt":
        return
    fields = sorted(RETIRED_TT_INPUT_FIELDS.intersection(request.query_params.keys()))
    if fields:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "ELECTRICAL_INPUT_RETIRED",
                "message": "Запрос содержит входы, удалённые из Case 1 TT-контракта",
                "issues": [],
                "details": {"fields": fields},
            },
        )


@router.get(
    "/electrical/history/{calculation_id}",
    response_model=ElectricalCalculationHistoryResponse,
    summary="Неизменяемая история результата электрорасчёта",
)
async def electrical_calculation_history(
    calculation_id: UUID,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    principal: CurrentPrincipal = Depends(require_any()),
    db: AsyncSession = Depends(get_db),
) -> ElectricalCalculationHistoryResponse:
    try:
        return await ElectricalHistoryService(db).list_revisions(
            calculation_id,
            principal,
            page=page,
            page_size=page_size,
        )
    except ElectricalCalculationHistoryNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except (ProjectNotFoundError, ProjectAccessError) as exc:
        _raise_project_error(exc)


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
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)
        ) from exc
    except CalculationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    await AuditService(db).try_record(
        event_type="calculation.heat_loss.previewed",
        category="calculation",
        principal=principal,
        project_id=request.project_id,
        details={"object_type": request.object_type},
        message="Выполнен разовый расчёт теплопотерь",
    )
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
    await AuditService(db).try_record(
        event_type="calculation.heat_loss.batch_completed",
        category="calculation",
        principal=principal,
        project_id=project_id,
        result="success" if failed == 0 else "failure",
        severity="info" if failed == 0 else "warning",
        details={"updated": updated, "failed": failed, "errors": errors},
        message="Выполнен пакетный пересчёт теплопотерь",
    )
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
    idempotency_key: str | None = Header(
        None,
        alias="Idempotency-Key",
        description="Optional double-click guard (E8); same key replays via upsert semantics",
        max_length=256,
    ),
):
    service = CalculationService(db)
    try:
        obj = await ProjectService(db).get_object_for_write(request.object_id, principal)
        variant = await ElectricalVariantService(db).prepare_legacy_variant_for_write(
            obj.project_id,
            principal,
            request.variant_number,
            expected_electrical_variant_id=request.electrical_variant_id,
        )
        if idempotency_key:
            # Stash for audit / future short-TTL store; upsert already prevents dual rows.
            request.data = {
                **(request.data or {}),
                "_idempotency_key": idempotency_key.strip(),
            }
        calc = await service.calc_electrical(
            request,
            electrical_variant_id=variant.id,
        )
    except ElectricalVariantServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.as_detail()) from exc
    except ElectricalCalcConcurrencyError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.as_detail()) from exc
    except (ProjectNotFoundError, ProjectAccessError) as exc:
        _raise_project_error(exc)
    except (ElectricalFormulaError, ElectricalInputResolutionError) as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.as_detail()) from exc
    except (ValueError, ValidationError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except CalculationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    response = ElectricalResponse(
        object_id=calc.object_id,
        cable_type=calc.cable_type,
        result=calc.results or {},
    )
    await AuditService(db).try_record(
        event_type="calculation.electrical.completed",
        category="calculation",
        principal=principal,
        project_id=obj.project_id,
        object_id=request.object_id,
        details={
            "cable_type": calc.cable_type,
            "cable_mark": calc.cable_mark,
            "variant_number": calc.variant_number,
            "electrical_variant_id": str(variant.id),
            "result_category": (calc.results or {}).get("category"),
            "error_code": (calc.results or {}).get("error_code"),
        },
        message="Выполнен электротехнический расчёт",
    )
    return response


@router.get(
    "/electrical",
    response_model=list[ElectricalCalcSummary],
    summary="Список электрорасчётов по проекту (legacy, paginated)",
    deprecated=True,
)
async def list_electrical(
    project_id: UUID,
    variant_number: int | None = None,
    cable_source: str = "builtin",
    page: int = Query(1, ge=1),
    page_size: int = Query(200, ge=1, le=200),
    principal: CurrentPrincipal = Depends(require_any()),
    db: AsyncSession = Depends(get_db),
):
    if cable_source in ("extended", "all") and principal.role not in ("employee", "admin"):
        raise HTTPException(
            status_code=403, detail="Расширенный каталог доступен только сотрудникам"
        )
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
    return await CalculationService(db).electrical_calc_summaries(list(calcs), cable_source)


@router.get(
    "/electrical/page",
    response_model=ElectricalPageResponse,
    response_model_exclude_none=True,
    summary="Постраничные данные страницы электрорасчёта",
)
async def electrical_page(
    project_id: UUID,
    variant_number: int = 1,
    cable_source: str = "builtin",
    page: int = 1,
    page_size: int = 50,
    principal: CurrentPrincipal = Depends(require_any()),
    db: AsyncSession = Depends(get_db),
):
    if cable_source in ("extended", "all") and principal.role not in ("employee", "admin"):
        raise HTTPException(
            status_code=403, detail="Расширенный каталог доступен только сотрудникам"
        )
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
    calc_summaries = await CalculationService(db).electrical_calc_summaries(
        calculations,
        cable_source,
    )
    return ElectricalPageResponse(
        items=objects,
        calculations=calc_summaries,
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
    variant_number: int | None = 1,
    electrical_variant_id: UUID | None = None,
    principal: CurrentPrincipal = Depends(require_any()),
    db: AsyncSession = Depends(get_db),
):
    try:
        if electrical_variant_id is not None:
            variant = await ElectricalVariantService(db).require_variant_for_read(
                project_id,
                principal,
                electrical_variant_id,
            )
            variant_number = variant.legacy_variant_number
        return await ElectricalQueryService(db).capabilities(
            project_id,
            variant_number,
            principal,
            electrical_variant_id=electrical_variant_id,
        )
    except ElectricalVariantServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.as_detail()) from exc
    except ElectricalQueryValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        ) from exc
    except ProjectNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ProjectAccessError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc


@router.post(
    "/electrical/query",
    response_model=ElectricalQueryResponse,
    summary="Постраничный backend-query таблицы электрорасчёта",
)
async def query_electrical(
    data: ElectricalQueryRequest,
    principal: CurrentPrincipal = Depends(require_any()),
    db: AsyncSession = Depends(get_db),
):
    if data.cable_source in ("extended", "all") and principal.role not in ("employee", "admin"):
        raise HTTPException(
            status_code=403, detail="Расширенный каталог доступен только сотрудникам"
        )
    try:
        if data.electrical_variant_id is not None:
            variant = await ElectricalVariantService(db).require_variant_for_read(
                data.project_id,
                principal,
                data.electrical_variant_id,
            )
            data = data.model_copy(update={"variant_number": variant.legacy_variant_number})
        return await ElectricalQueryService(db).query(data, principal)
    except ElectricalVariantServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.as_detail()) from exc
    except ElectricalQueryValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        ) from exc
    except ProjectNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ProjectAccessError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc


@router.post(
    "/electrical/variants/copy",
    response_model=CopyElectricalVariantResponse,
    summary="Создать CO-вариант электрорасчёта на основании другого CO",
)
async def copy_electrical_variant(
    data: CopyElectricalVariantRequest,
    principal: CurrentPrincipal = Depends(require_any()),
    db: AsyncSession = Depends(get_db),
):
    if data.regenerate_specification:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "ELECTRICAL_VARIANT_SPECIFICATION_COPY_FORBIDDEN",
                "message": (
                    "Спецификация не копируется и не регенерируется вместе с ЭР. "
                    "Сформируйте её отдельно после проверки расчётов."
                ),
            },
        )
    try:
        variants = await ElectricalVariantService(db).prepare_legacy_variants_for_write(
            data.project_id,
            principal,
            [data.source_variant_number, data.target_variant_number],
        )
        result = await CalculationService(db).copy_electrical_variant(
            data.project_id,
            source_variant_number=data.source_variant_number,
            target_variant_number=data.target_variant_number,
            source_electrical_variant_id=variants[data.source_variant_number].id,
            target_electrical_variant_id=variants[data.target_variant_number].id,
            overwrite=data.overwrite,
            regenerate_specification=data.regenerate_specification,
        )
    except ElectricalVariantServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.as_detail()) from exc
    except (ProjectNotFoundError, ProjectAccessError) as exc:
        _raise_project_error(exc)
    except ElectricalVariantCopyError as exc:
        raise HTTPException(
            status_code=exc.status_code,
            detail={
                "code": exc.code,
                "message": exc.message,
                **exc.details,
            },
        ) from exc

    await AuditService(db).try_record(
        event_type="calculation.electrical.variant_copied",
        category="calculation",
        principal=principal,
        project_id=data.project_id,
        details={
            "source_variant_number": result.source_variant_number,
            "target_variant_number": result.target_variant_number,
            "source_electrical_variant_id": str(variants[result.source_variant_number].id),
            "target_electrical_variant_id": str(variants[result.target_variant_number].id),
            "copied_count": result.copied_count,
            "project_objects_count": result.project_objects_count,
            "not_copied_uncalculated_count": result.not_copied_uncalculated_count,
            "deleted_target_count": result.deleted_target_count,
            "overwrite": data.overwrite,
            "regenerate_specification": data.regenerate_specification,
            "validated_count": result.validated_count,
            "validation_failed_count": result.validation_failed_count,
            "preserved_without_validation_count": result.preserved_without_validation_count,
        },
        message="CO-вариант электрорасчёта создан на основании другого CO",
    )
    return CopyElectricalVariantResponse(
        project_id=result.project_id,
        source_variant_number=result.source_variant_number,
        target_variant_number=result.target_variant_number,
        copied_count=result.copied_count,
        project_objects_count=result.project_objects_count,
        not_copied_uncalculated_count=result.not_copied_uncalculated_count,
        deleted_target_count=result.deleted_target_count,
        overwrite_applied=result.overwrite_applied,
        specification_regenerated=result.specification_regenerated,
        validated_count=result.validated_count,
        validation_failed_count=result.validation_failed_count,
        preserved_without_validation_count=result.preserved_without_validation_count,
    )


@router.get(
    "/electrical/candidates",
    response_model=list[ElectricalCandidateResponse],
    summary="Список кандидатов подбора кабеля для объекта и CO-варианта",
)
async def list_electrical_candidates(
    project_id: UUID,
    object_id: UUID | None = None,
    variant_number: int | None = Query(default=None, ge=1, le=5),
    electrical_variant_id: UUID | None = None,
    principal: CurrentPrincipal = Depends(require_any()),
    db: AsyncSession = Depends(get_db),
):
    try:
        await ProjectService(db).get_project_basic(project_id, principal)
        if electrical_variant_id is not None:
            if variant_number is None:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    detail="variant_number is required with electrical_variant_id",
                )
            await ElectricalVariantService(db).validate_legacy_variant_for_read(
                project_id,
                principal,
                variant_number,
                electrical_variant_id,
            )
        return await CalculationService(db).list_electrical_candidates(
            project_id,
            object_id=object_id,
            variant_number=variant_number,
            electrical_variant_id=electrical_variant_id,
        )
    except ElectricalVariantServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.as_detail()) from exc
    except (ProjectNotFoundError, ProjectAccessError) as exc:
        _raise_project_error(exc)


@router.post(
    "/electrical/candidates",
    response_model=ElectricalCandidateUpsertResponse,
    summary="Создать или обновить кандидат подбора кабеля без применения в расчёт",
)
async def create_electrical_candidate(
    data: ElectricalCandidateCreateRequest,
    principal: CurrentPrincipal = Depends(require_any()),
    db: AsyncSession = Depends(get_db),
):
    if data.cable_source in ("extended", "all") and principal.role not in ("employee", "admin"):
        raise HTTPException(
            status_code=403, detail="Расширенный каталог доступен только сотрудникам"
        )
    service = CalculationService(db)
    try:
        obj = await ProjectService(db).get_object_for_write(data.object_id, principal)
        if obj.project_id != data.project_id:
            raise HTTPException(status_code=404, detail="Объект не найден в проекте")
        variant = await ElectricalVariantService(db).prepare_legacy_variant_for_write(
            data.project_id,
            principal,
            data.variant_number,
            expected_electrical_variant_id=data.electrical_variant_id,
        )
        candidate, action = await service.create_electrical_candidate(
            project_id=data.project_id,
            object_id=data.object_id,
            variant_number=data.variant_number,
            electrical_variant_id=variant.id,
            cable_type=data.cable_type,
            cable_source=data.cable_source,
            mode=data.mode,
            cable_mark=data.cable_mark,
            electrical_params=data.electrical_params,
        )
    except ElectricalVariantServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.as_detail()) from exc
    except (ProjectNotFoundError, ProjectAccessError) as exc:
        _raise_project_error(exc)
    except (ElectricalFormulaError, ElectricalInputResolutionError) as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.as_detail()) from exc
    except (ValueError, ValidationError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except CalculationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    await AuditService(db).try_record(
        event_type=(
            "calculation.electrical.candidate_created"
            if action == "created"
            else "calculation.electrical.candidate_updated"
        ),
        category="calculation",
        principal=principal,
        project_id=data.project_id,
        object_id=data.object_id,
        result="success" if candidate.status == "applicable" else "failure",
        severity="info" if candidate.status == "applicable" else "warning",
        details={
            "candidate_id": str(candidate.id),
            "action": action,
            "dedupe_key": candidate.dedupe_key,
            "variant_number": candidate.variant_number,
            "electrical_variant_id": str(variant.id),
            "cable_type": candidate.cable_type,
            "cable_mark": candidate.cable_mark,
            "mode": candidate.mode,
            "status": candidate.status,
            "reason_code": candidate.reason_code,
        },
        message=(
            "Создан кандидат подбора кабеля"
            if action == "created"
            else "Обновлён кандидат подбора кабеля"
        ),
    )
    return ElectricalCandidateUpsertResponse(candidate=candidate, action=action)


@router.patch(
    "/electrical/candidates/{candidate_id}",
    response_model=ElectricalCandidateResponse,
    summary="Изменить инженерские пометки кандидата подбора",
)
async def update_electrical_candidate(
    candidate_id: UUID,
    data: ElectricalCandidateUpdateRequest,
    principal: CurrentPrincipal = Depends(require_any()),
    db: AsyncSession = Depends(get_db),
):
    service = CalculationService(db)
    try:
        candidate = await service.get_electrical_candidate(candidate_id)
        await ProjectService(db).get_project_for_write(candidate.project_id, principal)
        return await service.update_electrical_candidate(
            candidate_id,
            **data.model_dump(exclude_unset=True),
        )
    except (ProjectNotFoundError, ProjectAccessError) as exc:
        _raise_project_error(exc)
    except CalculationError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get(
    "/electrical/candidate-folders",
    response_model=list[ElectricalCandidateFolderResponse],
    summary="Пользовательские папки кандидатов подбора для объекта и CO-варианта",
)
async def list_electrical_candidate_folders(
    project_id: UUID,
    object_id: UUID,
    variant_number: int = Query(default=1, ge=1, le=5),
    electrical_variant_id: UUID | None = None,
    principal: CurrentPrincipal = Depends(require_any()),
    db: AsyncSession = Depends(get_db),
):
    try:
        await ProjectService(db).get_project_basic(project_id, principal)
        if electrical_variant_id is not None:
            await ElectricalVariantService(db).validate_legacy_variant_for_read(
                project_id,
                principal,
                variant_number,
                electrical_variant_id,
            )
        return await CalculationService(db).list_electrical_candidate_folders(
            project_id,
            object_id=object_id,
            variant_number=variant_number,
            electrical_variant_id=electrical_variant_id,
        )
    except ElectricalVariantServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.as_detail()) from exc
    except (ProjectNotFoundError, ProjectAccessError) as exc:
        _raise_project_error(exc)


@router.post(
    "/electrical/candidate-folders",
    response_model=ElectricalCandidateFolderResponse,
    summary="Создать пользовательскую папку кандидатов подбора",
)
async def create_electrical_candidate_folder(
    data: ElectricalCandidateFolderCreateRequest,
    principal: CurrentPrincipal = Depends(require_any()),
    db: AsyncSession = Depends(get_db),
):
    try:
        obj = await ProjectService(db).get_object_for_write(data.object_id, principal)
        if obj.project_id != data.project_id:
            raise HTTPException(status_code=404, detail="Объект не найден в проекте")
        variant = await ElectricalVariantService(db).prepare_legacy_variant_for_write(
            data.project_id,
            principal,
            data.variant_number,
            expected_electrical_variant_id=data.electrical_variant_id,
        )
        return await CalculationService(db).create_electrical_candidate_folder(
            project_id=data.project_id,
            object_id=data.object_id,
            variant_number=data.variant_number,
            electrical_variant_id=variant.id,
            name=data.name,
            color=data.color,
            created_by_user_id=principal.user_id,
            created_by_session_id=principal.session_id,
        )
    except ElectricalVariantServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.as_detail()) from exc
    except (ProjectNotFoundError, ProjectAccessError) as exc:
        _raise_project_error(exc)
    except CalculationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.patch(
    "/electrical/candidate-folders/{folder_id}",
    response_model=ElectricalCandidateFolderResponse,
    summary="Изменить пользовательскую папку кандидатов подбора",
)
async def update_electrical_candidate_folder(
    folder_id: UUID,
    data: ElectricalCandidateFolderUpdateRequest,
    principal: CurrentPrincipal = Depends(require_any()),
    db: AsyncSession = Depends(get_db),
):
    service = CalculationService(db)
    try:
        folder = await service.get_electrical_candidate_folder(folder_id)
        await ProjectService(db).get_project_for_write(folder.project_id, principal)
        return await service.update_electrical_candidate_folder(
            folder_id,
            **data.model_dump(exclude_unset=True),
        )
    except (ProjectNotFoundError, ProjectAccessError) as exc:
        _raise_project_error(exc)
    except CalculationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.delete(
    "/electrical/candidate-folders/{folder_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Удалить пользовательскую папку кандидатов подбора",
)
async def delete_electrical_candidate_folder(
    folder_id: UUID,
    principal: CurrentPrincipal = Depends(require_any()),
    db: AsyncSession = Depends(get_db),
):
    service = CalculationService(db)
    try:
        folder = await service.get_electrical_candidate_folder(folder_id)
        await ProjectService(db).get_project_for_write(folder.project_id, principal)
        await service.delete_electrical_candidate_folder(folder_id)
    except (ProjectNotFoundError, ProjectAccessError) as exc:
        _raise_project_error(exc)
    except CalculationError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post(
    "/electrical/candidate-folders/{folder_id}/items",
    response_model=ElectricalCandidateFolderResponse,
    summary="Добавить кандидат в пользовательскую папку",
)
async def add_electrical_candidate_folder_item(
    folder_id: UUID,
    data: ElectricalCandidateFolderItemRequest,
    principal: CurrentPrincipal = Depends(require_any()),
    db: AsyncSession = Depends(get_db),
):
    service = CalculationService(db)
    try:
        folder = await service.get_electrical_candidate_folder(folder_id)
        await ProjectService(db).get_project_for_write(folder.project_id, principal)
        return await service.add_electrical_candidate_to_folder(
            folder_id=folder_id,
            candidate_id=data.candidate_id,
        )
    except ElectricalVariantServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.as_detail()) from exc
    except (ProjectNotFoundError, ProjectAccessError) as exc:
        _raise_project_error(exc)
    except CalculationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.delete(
    "/electrical/candidate-folders/{folder_id}/items/{candidate_id}",
    response_model=ElectricalCandidateFolderResponse,
    summary="Убрать кандидат из пользовательской папки",
)
async def remove_electrical_candidate_folder_item(
    folder_id: UUID,
    candidate_id: UUID,
    principal: CurrentPrincipal = Depends(require_any()),
    db: AsyncSession = Depends(get_db),
):
    service = CalculationService(db)
    try:
        folder = await service.get_electrical_candidate_folder(folder_id)
        await ProjectService(db).get_project_for_write(folder.project_id, principal)
        return await service.remove_electrical_candidate_from_folder(
            folder_id=folder_id,
            candidate_id=candidate_id,
        )
    except (ProjectNotFoundError, ProjectAccessError) as exc:
        _raise_project_error(exc)
    except CalculationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post(
    "/electrical/candidates/{candidate_id}/apply",
    response_model=ElectricalCandidateApplyResponse,
    summary="Применить кандидат подбора в основной электрорасчёт",
)
async def apply_electrical_candidate(
    candidate_id: UUID,
    principal: CurrentPrincipal = Depends(require_any()),
    db: AsyncSession = Depends(get_db),
):
    service = CalculationService(db)
    try:
        candidate = await service.get_electrical_candidate(candidate_id)
        await ProjectService(db).get_project_for_write(candidate.project_id, principal)
        applied_candidate, calc = await service.apply_electrical_candidate(
            candidate_id,
            project_id=candidate.project_id,
        )
    except (ProjectNotFoundError, ProjectAccessError) as exc:
        _raise_project_error(exc)
    except ElectricalVariantServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.as_detail()) from exc
    except ElectricalCandidateApplyError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.as_detail()) from exc
    except CalculationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    summary = (await service.electrical_calc_summaries([calc], applied_candidate.cable_source))[0]
    await AuditService(db).try_record(
        event_type="calculation.electrical.candidate_applied",
        category="calculation",
        principal=principal,
        project_id=applied_candidate.project_id,
        object_id=applied_candidate.object_id,
        details={
            "candidate_id": str(applied_candidate.id),
            "variant_number": applied_candidate.variant_number,
            "cable_type": applied_candidate.cable_type,
            "cable_mark": applied_candidate.cable_mark,
        },
        message="Кандидат подбора применён в электрорасчёт",
    )
    return ElectricalCandidateApplyResponse(candidate=applied_candidate, calculation=summary)


@router.delete(
    "/electrical/candidates/{candidate_id}/apply",
    response_model=ElectricalCandidateResponse,
    summary="Снять применённый кандидат подбора с основного электрорасчёта",
)
async def unapply_electrical_candidate(
    candidate_id: UUID,
    principal: CurrentPrincipal = Depends(require_any()),
    db: AsyncSession = Depends(get_db),
):
    service = CalculationService(db)
    try:
        candidate = await service.get_electrical_candidate(candidate_id)
        await ProjectService(db).get_project_for_write(candidate.project_id, principal)
        unapplied_candidate = await service.unapply_electrical_candidate(candidate_id)
    except (ProjectNotFoundError, ProjectAccessError) as exc:
        _raise_project_error(exc)
    except ElectricalVariantServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.as_detail()) from exc
    except CalculationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    await AuditService(db).try_record(
        event_type="calculation.electrical.candidate_unapplied",
        category="calculation",
        principal=principal,
        project_id=unapplied_candidate.project_id,
        object_id=unapplied_candidate.object_id,
        details={
            "candidate_id": str(unapplied_candidate.id),
            "variant_number": unapplied_candidate.variant_number,
            "cable_type": unapplied_candidate.cable_type,
            "cable_mark": unapplied_candidate.cable_mark,
        },
        message="Кандидат подбора снят с электрорасчёта",
    )
    return unapplied_candidate


@router.post(
    "/electrical/select-cable",
    response_model=ElectricalCalcSummary,
    summary="Ручной выбор кабеля для объекта (с пересчётом)",
)
async def select_cable(
    object_id: UUID,
    cable_mark: str,
    request: Request,
    cable_source: str = "builtin",
    variant_number: int = 1,
    electrical_variant_id: UUID | None = None,
    cable_type: str = "self_regulating_tt",
    connection_type: str | None = None,
    winding_pitch: float | None = None,
    number_of_threads: int | None = None,
    heating_height: float | None = None,
    laying_step: float | None = None,
    supply_voltage: float | None = Query(None, gt=0),
    selection_policy: SelectionPolicy = "technical_minimum",
    principal: CurrentPrincipal = Depends(require_any()),
    db: AsyncSession = Depends(get_db),
):
    """Перезапускает электрорасчёт с указанной маркой кабеля.

    Параметры объекта (мощность, температуры, длина) берутся из текущих
    результатов теплопотерь. Если кабель не подходит — 422 с текстом причины.
    На успех — upsert `ElectricalCalculation` и возврат новой записи.
    """
    _reject_retired_tt_query_inputs(request, cable_type)
    if cable_source in ("extended", "all") and principal.role not in ("employee", "admin"):
        raise HTTPException(
            status_code=403, detail="Расширенный каталог доступен только сотрудникам"
        )
    service = CalculationService(db)
    try:
        obj = await ProjectService(db).get_object_for_write(object_id, principal)
        variant = await ElectricalVariantService(db).prepare_legacy_variant_for_write(
            obj.project_id,
            principal,
            variant_number,
            expected_electrical_variant_id=electrical_variant_id,
        )
        electrical_params = {
            key: value
            for key, value in {
                "winding_pitch": winding_pitch,
                "number_of_threads": number_of_threads,
                "heating_height": heating_height,
                "laying_step": laying_step,
                "supply_voltage": supply_voltage,
            }.items()
            if value is not None
        }
        electrical_params["selection_policy"] = selection_policy
        if cable_type != "self_regulating_tt" and connection_type is not None:
            electrical_params["connection_type"] = connection_type
        calc = await service.select_cable_manual(
            object_id,
            cable_mark,
            cable_source,
            variant_number,
            cable_type,
            electrical_params,
            electrical_variant_id=variant.id,
        )
    except ElectricalVariantServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.as_detail()) from exc
    except (ProjectNotFoundError, ProjectAccessError) as exc:
        _raise_project_error(exc)
    except (ElectricalFormulaError, ElectricalInputResolutionError) as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.as_detail()) from exc
    except (ValueError, ValidationError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except CalculationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    summary = (await service.electrical_calc_summaries([calc], cable_source))[0]
    await AuditService(db).try_record(
        event_type="calculation.electrical.cable_selected_manual",
        category="calculation",
        principal=principal,
        project_id=obj.project_id,
        object_id=object_id,
        details={
            "cable_mark": cable_mark,
            "cable_source": cable_source,
            "cable_type": calc.cable_type,
            "variant_number": variant_number,
            "electrical_variant_id": str(variant.id),
            "result_category": (calc.results or {}).get("category"),
            "error_code": (calc.results or {}).get("error_code"),
        },
        message="Выполнен ручной выбор кабеля",
    )
    return summary


@router.post(
    "/electrical/select-cable/variants",
    response_model=list[ElectricalCalcSummary],
    summary="Атомарный выбор кабеля для объекта в нескольких СО",
)
async def select_cable_variants(
    data: ElectricalCableSelectionVariantsRequest,
    principal: CurrentPrincipal = Depends(require_any()),
    db: AsyncSession = Depends(get_db),
):
    """Одной транзакцией применяет выбор марки или «Авто» к нескольким СО.

    Если хотя бы один вариант не проходит расчёт, ни один из отмеченных СО не
    сохраняется.
    """
    if data.cable_source in ("extended", "all") and principal.role not in ("employee", "admin"):
        raise HTTPException(
            status_code=403, detail="Расширенный каталог доступен только сотрудникам"
        )
    service = CalculationService(db)
    try:
        obj = await ProjectService(db).get_object_for_write(data.object_id, principal)
        variants = await ElectricalVariantService(db).prepare_legacy_variants_for_write(
            obj.project_id,
            principal,
            data.variant_numbers,
            expected_electrical_variant_ids=data.electrical_variant_ids or None,
        )
        calcs = await service.select_cable_for_variants(
            data.object_id,
            data.cable_mark,
            data.cable_source,
            data.variant_numbers,
            data.cable_type,
            data.electrical_params(),
            electrical_variant_ids={number: variants[number].id for number in data.variant_numbers},
        )
    except ElectricalVariantServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.as_detail()) from exc
    except (ProjectNotFoundError, ProjectAccessError) as exc:
        _raise_project_error(exc)
    except (ElectricalFormulaError, ElectricalInputResolutionError) as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.as_detail()) from exc
    except (ValueError, ValidationError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except CalculationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    summaries = await service.electrical_calc_summaries(calcs, data.cable_source)
    await AuditService(db).try_record(
        event_type="calculation.electrical.cable_selected_variants",
        category="calculation",
        principal=principal,
        project_id=obj.project_id,
        object_id=data.object_id,
        details={
            "cable_mark": data.cable_mark,
            "cable_source": data.cable_source,
            "cable_type": data.cable_type,
            "variant_numbers": data.variant_numbers,
            "electrical_variant_ids": {
                str(number): str(variants[number].id) for number in data.variant_numbers
            },
            "atomic": True,
            "result_categories": [(calc.results or {}).get("category") for calc in calcs],
            "error_codes": [(calc.results or {}).get("error_code") for calc in calcs],
        },
        message="Выполнен атомарный выбор кабеля для нескольких СО",
    )
    return summaries


@router.post(
    "/electrical/batch",
    response_model=BatchElectricalResponse,
    summary="Пакетный автоподбор для назначенных объектов выбранного ЭР и системы",
)
async def batch_calc_electrical(
    project_id: UUID,
    request: Request,
    cable_source: str = "builtin",
    variant_number: int = 1,
    electrical_variant_id: UUID | None = Query(
        None,
        description="UUID ЭР (primary scope, E8); when set, preferred over variant_number",
    ),
    cable_type: str = "self_regulating_tt",
    force_cable_type: bool = False,
    connection_type: str | None = None,
    winding_pitch: float | None = None,
    number_of_threads: int | None = None,
    heating_height: float | None = None,
    laying_step: float | None = None,
    supply_voltage: float | None = Query(None, gt=0),
    selection_policy: SelectionPolicy = "technical_minimum",
    skip_manual: bool = True,
    include_results: bool = True,
    include_errors: bool = True,
    object_ids: list[UUID] | None = Query(default=None),
    object_ids_brackets: list[UUID] | None = Query(default=None, alias="object_ids[]"),
    principal: CurrentPrincipal = Depends(require_any()),
    db: AsyncSession = Depends(get_db),
    idempotency_key: str | None = Header(
        None,
        alias="Idempotency-Key",
        max_length=256,
    ),
):
    """Подбирает кабель только в exact UUID scope выбранного ЭР.

    Без `object_ids` обрабатывает объекты, явно назначенные в совместимую
    электрическую систему этого ЭР. Явный список валидируется атомарно.
    """
    _ = idempotency_key  # Accepted for double-click clients; upsert is the persistence guard.
    await enforce_principal_rate_limit(
        batch_limiter,
        principal,
        request,
        detail="Превышен лимит пакетных расчётов для пользователя и IP. Повторите через час.",
    )
    _reject_retired_tt_query_inputs(request, cable_type)
    if cable_source in ("extended", "all") and principal.role not in ("employee", "admin"):
        raise HTTPException(
            status_code=403, detail="Расширенный каталог доступен только сотрудникам"
        )
    selected_object_ids = object_ids or object_ids_brackets
    service = CalculationService(db)
    try:
        variant = await ElectricalVariantService(db).prepare_legacy_variant_for_write(
            project_id,
            principal,
            variant_number,
            expected_electrical_variant_id=electrical_variant_id,
        )
        electrical_params = {
            key: value
            for key, value in {
                "winding_pitch": winding_pitch,
                "number_of_threads": number_of_threads,
                "heating_height": heating_height,
                "laying_step": laying_step,
                "supply_voltage": supply_voltage,
            }.items()
            if value is not None
        }
        electrical_params["selection_policy"] = selection_policy
        if cable_type != "self_regulating_tt" and connection_type is not None:
            electrical_params["connection_type"] = connection_type
        calculated, skipped, heat_loss_failed, errors, calcs = await service.batch_calc_electrical(
            project_id,
            cable_source,
            variant_number,
            cable_type,
            electrical_params,
            skip_manual=skip_manual,
            return_calcs=include_results,
            object_ids=selected_object_ids,
            force_cable_type=force_cable_type,
            electrical_variant_id=variant.id,
        )
    except ElectricalVariantServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.as_detail()) from exc
    except (ProjectNotFoundError, ProjectAccessError) as exc:
        _raise_project_error(exc)
    except CalculationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    response = BatchElectricalResponse(
        calculated=calculated,
        skipped=skipped,
        scope="selected" if selected_object_ids else "all",
        heat_loss_failed=heat_loss_failed,
        errors=errors if include_errors else [],
        results=await service.electrical_calc_summaries(calcs, cable_source)
        if include_results
        else [],
    )
    await AuditService(db).try_record(
        event_type="calculation.electrical.batch_completed",
        category="calculation",
        principal=principal,
        project_id=project_id,
        result="success" if not errors else "failure",
        severity="info" if not errors else "warning",
        details={
            "calculated": calculated,
            "skipped": skipped,
            "heat_loss_failed": heat_loss_failed,
            "errors": errors,
            "scope": "selected" if selected_object_ids else "all",
            "skip_manual": skip_manual,
            "force_cable_type": force_cable_type,
            "electrical_variant_id": str(variant.id),
        },
        message="Выполнен пакетный автоподбор кабеля",
    )
    return response


@router.get(
    "/cable-options/{object_id}",
    response_model=list[CableOptionOut],
    summary="Список доступных кабелей ТТ для объекта (manual options)",
)
async def cable_options(
    object_id: UUID,
    electrical_variant_id: UUID | None = Query(
        None,
        description="ЭР (UUID), чьи object-assignment overrides задают входы Case 1",
    ),
    principal: CurrentPrincipal = Depends(require_any()),
    db: AsyncSession = Depends(get_db),
):
    try:
        await ProjectService(db).get_object_for_read(object_id, principal)
        return await CalculationService(db).get_cable_options(
            object_id,
            electrical_variant_id=electrical_variant_id,
        )
    except (ProjectNotFoundError, ProjectAccessError) as exc:
        _raise_project_error(exc)
    except (ElectricalFormulaError, ElectricalInputResolutionError) as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.as_detail()) from exc
    except CalculationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
