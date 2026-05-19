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
from app.schemas.project import (
    ObjectQueryCapabilitiesResponse,
    ProjectObjectCreate,
    ProjectObjectResponse,
    ProjectObjectsQueryRequest,
    ProjectObjectsQueryResponse,
    ProjectObjectsSummaryResponse,
    ProjectObjectUpdate,
    ReorderRequest,
)
from app.services.audit_service import AuditService
from app.services.calculation_service import CalculationService
from app.services.excel_import_service import build_objects_xlsx
from app.services.object_query_service import ObjectQueryService, ObjectQueryValidationError
from app.services.project_service import (
    ProjectAccessError,
    ProjectConflictError,
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
):
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
    principal: CurrentPrincipal = Depends(require_any()),
    db: AsyncSession = Depends(get_db),
):
    try:
        return await ProjectService(db).objects_summary(project_id, principal)
    except ProjectNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ProjectAccessError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc


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
):
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
):
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
):
    try:
        project_service = ProjectService(db)
        obj = await project_service.add_object(project_id, data, principal)
        calc_service = CalculationService(db)
        await calc_service.recalculate_object(obj)
        await SpecificationService(db).mark_project_specifications_stale(
            project_id,
            "object_created",
            object_ids=[obj.id],
            operation="create",
        )
        await db.commit()
        await db.refresh(obj)
        await AuditService(db).try_record(
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
        return obj
    except ProjectLimitError as exc:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=str(exc)) from exc
    except ProjectNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ProjectAccessError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc


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
):
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


@router.get(
    "/{project_id}/objects/import-template",
    summary="Скачать шаблон для импорта (xlsx или csv)",
)
async def import_template(
    project_id: UUID,
    format: str = "xlsx",
    principal: CurrentPrincipal = Depends(require_any()),
    db: AsyncSession = Depends(get_db),
):
    from app.services.excel_import_service import build_template_csv, build_template_xlsx

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
)
async def import_excel(
    project_id: UUID,
    request: Request,
    file: UploadFile,
    mode: str = Form("merge"),
    principal: CurrentPrincipal = Depends(require_any()),
    db: AsyncSession = Depends(get_db),
):
    from app.schemas.calculation import HeatLossBatchJobRequest
    from app.services.excel_import_service import (
        ExcelImportError,
        import_objects_from_csv,
        import_objects_from_excel,
    )
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
        if created_object_ids:
            await SpecificationService(db).mark_project_specifications_stale(
                project_id,
                "objects_imported",
                object_ids=created_object_ids,
                operation=f"import_{mode}",
                commit=True,
            )
            task = await TaskService(db).create_heat_loss_batch_task(
                HeatLossBatchJobRequest(
                    project_id=project_id,
                    include_errors=True,
                    object_ids=created_object_ids,
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
):
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
):
    try:
        project_service = ProjectService(db)
        params_changed = "params" in data.model_fields_set
        obj = await project_service.update_object(project_id, object_id, data, principal)
        calc_service = CalculationService(db)
        await calc_service.recalculate_object(obj)
        if params_changed:
            await calc_service.mark_electrical_calculations_stale(
                project_id,
                [object_id],
                reason="object_params_updated",
            )
            await SpecificationService(db).mark_project_specifications_stale(
                project_id,
                "object_params_updated",
                object_ids=[object_id],
                operation="update",
            )
        await db.commit()
        await db.refresh(obj)
        await AuditService(db).try_record(
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
        return obj
    except ProjectNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ProjectAccessError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except ProjectConflictError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc


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
        await ProjectService(db).delete_object(project_id, object_id, principal)
        await SpecificationService(db).mark_project_specifications_stale(
            project_id,
            "object_deleted",
            object_ids=[object_id],
            operation="delete",
        )
        await db.commit()
    except ProjectNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ProjectAccessError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    await AuditService(db).try_record(
        event_type="object.deleted",
        category="object",
        principal=principal,
        project_id=project_id,
        object_id=object_id,
        severity="warning",
        message="Удалён объект проекта",
    )
