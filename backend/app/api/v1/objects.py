"""Endpoints объектов проекта."""

import io
from uuid import UUID

from fastapi import APIRouter, Depends, Form, HTTPException, Request, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import (
    CurrentPrincipal,
    require_any,
    require_employee,
)
from app.core.rate_limit import enforce_principal_rate_limit, import_limiter, report_limiter
from app.core.uploads import read_upload_with_limit
from app.core.worker_dependency import require_worker_ready
from app.models.project_object import ProjectObject
from app.schemas.project import (
    ObjectQueryCapabilitiesResponse,
    ObjectsBatchResponse,
    ObjectsDuplicateRequest,
    ObjectsGroupUpdateRequest,
    ProjectObjectCreate,
    ProjectObjectResponse,
    ProjectObjectsQueryRequest,
    ProjectObjectsQueryResponse,
    ProjectObjectsSummaryResponse,
    ProjectObjectUpdate,
    ReorderRequest,
)
from app.services.audit_service import AuditService
from app.services.calculation.container import CalculationContainer
from app.services.object_query_service import ObjectQueryService, ObjectQueryValidationError
from app.services.object_spreadsheet.export import build_objects_xlsx
from app.services.object_spreadsheet.templates import build_template_csv, build_template_xlsx
from app.services.project_service import (
    ProjectAccessError,
    ProjectConflictError,
    ProjectElectricalVariantNotFoundError,
    ProjectGroupValidationError,
    ProjectLimitError,
    ProjectNotFoundError,
    ProjectService,
    ProjectValidationError,
)
from app.services.specification_service import SpecificationService

router = APIRouter()


# ---- Коллекционные маршруты (без object_id) ----


@router.get(
    "/{project_id}/objects",
    response_model=list[ProjectObjectResponse],
    summary="Список объектов проекта",
)
async def list_objects(
    project_id: UUID,
    principal: CurrentPrincipal = Depends(require_any()),
    db: AsyncSession = Depends(get_db),
) -> list[ProjectObject]:
    try:
        return await ProjectService(db).list_objects(project_id, principal)
    except ProjectNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ProjectAccessError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc


@router.get(
    "/{project_id}/objects/summary",
    response_model=ProjectObjectsSummaryResponse,
    summary="Сводные счётчики объектов и электрорасчётов проекта",
)
async def objects_summary(
    project_id: UUID,
    electrical_variant_id: UUID | None = None,
    principal: CurrentPrincipal = Depends(require_any()),
    db: AsyncSession = Depends(get_db),
) -> dict[str, object]:
    try:
        return await ProjectService(db).objects_summary(
            project_id,
            principal,
            electrical_variant_id=electrical_variant_id,
        )
    except ProjectNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ProjectAccessError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except ProjectElectricalVariantNotFoundError as exc:
        raise HTTPException(
            status_code=404,
            detail={
                "code": "ELECTRICAL_VARIANT_NOT_FOUND",
                "message": str(exc),
            },
        ) from exc


@router.get(
    "/{project_id}/objects/query-capabilities",
    response_model=ObjectQueryCapabilitiesResponse,
    summary="Возможности backend-фильтров и сортировок таблицы объектов",
)
async def object_query_capabilities(
    project_id: UUID,
    object_type: str,
    principal: CurrentPrincipal = Depends(require_any()),
    db: AsyncSession = Depends(get_db),
) -> ObjectQueryCapabilitiesResponse:
    try:
        return await ObjectQueryService(db).capabilities(project_id, object_type, principal)
    except ObjectQueryValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)
        ) from exc
    except ProjectNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ProjectAccessError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc


@router.post(
    "/{project_id}/objects/query",
    response_model=ProjectObjectsQueryResponse,
    response_model_exclude_none=True,
    summary="Постраничный backend-query объектов проекта",
)
async def query_objects(
    project_id: UUID,
    data: ProjectObjectsQueryRequest,
    principal: CurrentPrincipal = Depends(require_any()),
    db: AsyncSession = Depends(get_db),
) -> ProjectObjectsQueryResponse:
    try:
        return await ObjectQueryService(db).query(project_id, data, principal)
    except ObjectQueryValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)
        ) from exc
    except ProjectNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ProjectAccessError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc


@router.post(
    "/{project_id}/objects",
    response_model=ProjectObjectResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Добавить объект и выполнить первичный расчёт",
)
async def add_object(
    project_id: UUID,
    data: ProjectObjectCreate,
    principal: CurrentPrincipal = Depends(require_any()),
    db: AsyncSession = Depends(get_db),
) -> ProjectObject:
    try:
        project_service = ProjectService(db)
        obj = await project_service.add_object(project_id, data, principal)
        calculations = CalculationContainer(db)
        await calculations.heat.recalculate(obj)
        # New object is not yet assigned to any ER → no specification is affected.
        # Precise per-ER staling happens on assignment / heat / calculation mutations.
        # Аудит кладём в ту же транзакцию (stage до commit) — один round-trip
        # вместо двух. obj уже сфлашен сервисом, поэтому id/params/results доступны.
        await AuditService(db).stage(
            event_type="object.created",
            category="object",
            principal=principal,
            project_id=project_id,
            object_id=obj.id,
            details={"object_type": obj.object_type, "is_valid": obj.is_valid},
            after_state={
                "object_type": obj.object_type,
                "params": obj.params,
                "results": obj.results,
                "validation_errors": obj.validation_errors,
            },
            message="Создан объект проекта и выполнен первичный расчёт",
        )
        await db.commit()
        await db.refresh(obj)
        return obj
    except ProjectLimitError as exc:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=str(exc)) from exc
    except ProjectNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ProjectAccessError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except ProjectValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=exc.as_detail(),
        ) from exc


# ---- Специальные операции (должны быть ВЫШЕ маршрутов с {object_id}) ----


@router.put(
    "/{project_id}/objects/reorder",
    response_model=list[ProjectObjectResponse],
    summary="Изменить порядок объектов",
)
async def reorder_objects(
    project_id: UUID,
    data: ReorderRequest,
    principal: CurrentPrincipal = Depends(require_any()),
    db: AsyncSession = Depends(get_db),
) -> list[ProjectObject]:
    try:
        objects = await ProjectService(db).reorder_objects(project_id, data.order, principal)
    except ProjectValidationError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except ProjectNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ProjectAccessError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    await AuditService(db).try_record(
        event_type="object.reordered",
        category="object",
        principal=principal,
        project_id=project_id,
        details={"object_ids": [str(item) for item in data.order], "count": len(objects)},
        message="Изменён порядок объектов проекта",
    )
    return objects


@router.post(
    "/{project_id}/objects/duplicate-batch",
    response_model=ObjectsBatchResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Добавить объекты на основании выбранных (копии, кейс §5.7)",
)
async def duplicate_objects_batch(
    project_id: UUID,
    data: ObjectsDuplicateRequest,
    principal: CurrentPrincipal = Depends(require_any()),
    db: AsyncSession = Depends(get_db),
) -> dict[str, object]:
    """Создаёт копию каждого выбранного объекта и пересчитывает теплопотери.

    Каждой копии присваивается собственный идентификатор, все параметры
    переносятся, исходные объекты не изменяются (кейс §5.7).
    """
    try:
        service = ProjectService(db)
        copies = await service.duplicate_objects(project_id, data.object_ids, principal)
        calculations = CalculationContainer(db)
        for obj in copies:
            await calculations.heat.recalculate(obj)
        created_ids = [obj.id for obj in copies]
        # Duplicates are unassigned; independent ERs stay current until assign.
        await AuditService(db).stage(
            event_type="object.duplicated_batch",
            category="object",
            principal=principal,
            project_id=project_id,
            details={
                "source_object_ids": [str(item) for item in data.object_ids],
                "created_object_ids": [str(item) for item in created_ids],
                "count": len(copies),
            },
            message="Созданы копии выбранных объектов",
        )
        await db.commit()
        for obj in copies:
            await db.refresh(obj)
        return {"objects": copies, "count": len(copies)}
    except ProjectLimitError as exc:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=str(exc)) from exc
    except ProjectNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ProjectAccessError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc


@router.post(
    "/{project_id}/objects/group-update",
    response_model=ObjectsBatchResponse,
    summary="Групповая корректировка одного параметра выбранных объектов (кейс §5.8)",
)
async def group_update_objects(
    project_id: UUID,
    data: ObjectsGroupUpdateRequest,
    principal: CurrentPrincipal = Depends(require_any()),
    db: AsyncSession = Depends(get_db),
) -> dict[str, object]:
    """Меняет один общий параметр у выбранных объектов (всё-или-ничего).

    Если значение недопустимо хотя бы для одного объекта — данные не
    изменяются, ответ 422 содержит перечень проблемных объектов (кейс §5.8).
    Теплопотери изменённых объектов пересчитываются, зависимые электрорасчёты
    и спецификации помечаются как требующие пересчёта.
    """
    try:
        service = ProjectService(db)
        objects = await service.group_update_objects(
            project_id, data.object_ids, data.param, data.value, principal
        )
        calculations = CalculationContainer(db)
        for obj in objects:
            await calculations.heat.recalculate(obj)
        changed_ids = [obj.id for obj in objects]
        # Per-ER via assignments inside mark_electrical_calculations_stale.
        await calculations.electrical_staleness.mark_for_objects(
            project_id,
            changed_ids,
            reason="object_params_updated",
        )
        await AuditService(db).stage(
            event_type="object.group_updated",
            category="object",
            principal=principal,
            project_id=project_id,
            details={
                "object_ids": [str(item) for item in changed_ids],
                "param": data.param,
                "count": len(objects),
            },
            message="Выполнена групповая корректировка объектов",
        )
        await db.commit()
        for obj in objects:
            await db.refresh(obj)
        return {"objects": objects, "count": len(objects)}
    except ProjectGroupValidationError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={
                "message": "Значение нельзя применить ко всем выбранным объектам",
                "objects": exc.problems,
            },
        ) from exc
    except ProjectNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ProjectAccessError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc


@router.get(
    "/{project_id}/objects/import-template",
    summary="Скачать шаблон для импорта (xlsx или csv)",
)
async def import_template(
    project_id: UUID,
    format: str = "xlsx",
    principal: CurrentPrincipal = Depends(require_any()),
    db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    try:
        await ProjectService(db).get_project_basic(project_id, principal)
    except ProjectNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ProjectAccessError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc

    fmt = format.lower()
    if fmt == "csv":
        data = build_template_csv()
        return StreamingResponse(
            io.BytesIO(data),
            media_type="text/csv; charset=utf-8",
            headers={"Content-Disposition": "attachment; filename=import_template.csv"},
        )
    if fmt == "xlsx":
        data = build_template_xlsx()
        return StreamingResponse(
            io.BytesIO(data),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": "attachment; filename=import_template.xlsx"},
        )
    raise HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        detail=f"Неизвестный формат шаблона: {format} (допустимо: xlsx, csv)",
    )


@router.post(
    "/{project_id}/objects/import-excel",
    summary="Импорт объектов (трубопроводы, резервуары) из Excel или CSV",
    dependencies=[Depends(require_worker_ready)],
)
async def import_excel(
    project_id: UUID,
    request: Request,
    file: UploadFile,
    mode: str = Form("merge"),
    principal: CurrentPrincipal = Depends(require_any()),
    db: AsyncSession = Depends(get_db),
) -> dict[str, object]:
    from app.schemas.heat_loss import HeatLossBatchJobRequest
    from app.services.object_spreadsheet.importer import (
        import_objects_from_csv,
        import_objects_from_excel,
    )
    from app.services.object_spreadsheet.parsing import ExcelImportError
    from app.services.task_service import TaskLimitError, TaskService

    await enforce_principal_rate_limit(
        import_limiter,
        principal,
        request,
        detail="Превышен лимит импорта для пользователя и IP. Повторите через час.",
    )
    filename = (file.filename or "").lower()
    if not (filename.endswith(".xlsx") or filename.endswith(".csv")):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Ожидается файл формата .xlsx или .csv",
        )
    content = await read_upload_with_limit(file)
    try:
        if filename.endswith(".csv"):
            result = await import_objects_from_csv(db, project_id, principal, content, mode=mode)
        else:
            result = await import_objects_from_excel(db, project_id, principal, content, mode=mode)
        created_object_ids = result.pop("created_object_ids", [])
        calculation_object_ids: list[UUID] = created_object_ids
        result["valid"] = len(calculation_object_ids)
        if calculation_object_ids:
            # Imported objects are unassigned; no ER BOM is invalidated until assign.
            task = await TaskService(db).create_heat_loss_batch_task(
                HeatLossBatchJobRequest(
                    project_id=project_id,
                    include_errors=True,
                    object_ids=calculation_object_ids,
                ),
                principal,
            )
            result["heat_loss_task"] = TaskService.to_response(task).model_dump(mode="json")
        await AuditService(db).try_record(
            event_type="object.imported",
            category="object",
            principal=principal,
            project_id=project_id,
            details={
                "filename": file.filename,
                "mode": mode,
                "format": "csv" if filename.endswith(".csv") else "xlsx",
                "created_count": len(created_object_ids),
                "result": result,
            },
            message="Импортированы объекты проекта",
        )
        return result
    except ExcelImportError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)
        ) from exc
    except ProjectNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ProjectAccessError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except TaskLimitError as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=str(exc),
            headers={"Retry-After": "3600"},
        ) from exc


@router.get(
    "/{project_id}/objects/export-excel",
    summary="Экспорт объектов в Excel (только сотрудник)",
)
async def export_excel(
    project_id: UUID,
    request: Request,
    principal: CurrentPrincipal = Depends(require_employee()),
    db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    await enforce_principal_rate_limit(
        report_limiter,
        principal,
        request,
        detail="Превышен лимит экспорта для пользователя и IP. Повторите через час.",
    )
    try:
        project = await ProjectService(db).get_project(project_id, principal)
    except ProjectNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ProjectAccessError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc

    # Round-trip совместимый формат: листы «Трубопроводы» / «Резервуары»
    # с теми же колонками, что ожидает `POST /objects/import-excel`.
    data = build_objects_xlsx(project.objects)
    await AuditService(db).try_record(
        event_type="object.exported.xlsx",
        category="object",
        principal=principal,
        project_id=project_id,
        details={"object_count": len(project.objects), "size_bytes": len(data)},
        message="Выгружены объекты проекта XLSX",
    )
    return StreamingResponse(
        io.BytesIO(data),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=objects_{project_id}.xlsx"},
    )


# ---- Маршруты по конкретному object_id ----


@router.put(
    "/{project_id}/objects/{object_id}",
    response_model=ProjectObjectResponse,
    summary="Обновить объект (автопересчёт)",
)
async def update_object(
    project_id: UUID,
    object_id: UUID,
    data: ProjectObjectUpdate,
    principal: CurrentPrincipal = Depends(require_any()),
    db: AsyncSession = Depends(get_db),
) -> ProjectObject:
    try:
        project_service = ProjectService(db)
        params_changed = "params" in data.model_fields_set
        obj = await project_service.update_object(project_id, object_id, data, principal)
        calculations = CalculationContainer(db)
        await calculations.heat.recalculate(obj)
        if params_changed:
            # Marks electrical results + only specs of ERs that assign this object.
            await calculations.electrical_staleness.mark_for_objects(
                project_id,
                [object_id],
                reason="object_params_updated",
            )
        # Аудит в той же транзакции (stage до commit) — один round-trip.
        await AuditService(db).stage(
            event_type="object.updated",
            category="object",
            principal=principal,
            project_id=project_id,
            object_id=object_id,
            details={
                "changed_fields": sorted(data.model_fields_set),
                "params_changed": params_changed,
                "version": obj.version,
                "is_valid": obj.is_valid,
            },
            after_state={
                "object_type": obj.object_type,
                "params": obj.params,
                "results": obj.results,
                "validation_errors": obj.validation_errors,
            },
            message="Обновлён объект проекта и выполнен автопересчёт",
        )
        await db.commit()
        await db.refresh(obj)
        return obj
    except ProjectNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ProjectAccessError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except ProjectConflictError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    except ProjectValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=exc.as_detail(),
        ) from exc


@router.delete(
    "/{project_id}/objects/{object_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Удалить объект",
)
async def delete_object(
    project_id: UUID,
    object_id: UUID,
    principal: CurrentPrincipal = Depends(require_any()),
    db: AsyncSession = Depends(get_db),
) -> None:
    try:
        # Capture ER scope before CASCADE removes assignments with the object.
        await SpecificationService(db).mark_specifications_stale_for_objects(
            project_id,
            [object_id],
            "object_deleted",
            operation="delete",
        )
        await ProjectService(db).delete_object(project_id, object_id, principal)
        # Аудит в той же транзакции (stage до commit) — один round-trip.
        await AuditService(db).stage(
            event_type="object.deleted",
            category="object",
            principal=principal,
            project_id=project_id,
            object_id=object_id,
            severity="warning",
            message="Удалён объект проекта",
        )
        await db.commit()
    except ProjectNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ProjectAccessError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
