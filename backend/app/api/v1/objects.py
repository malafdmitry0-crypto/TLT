"""Endpoints объектов проекта."""

import io
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import (
    CurrentPrincipal,
    require_any,
    require_employee,
)
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
from app.services.calculation_service import CalculationService
from app.services.excel_import_service import build_objects_xlsx
from app.services.object_query_service import ObjectQueryService, ObjectQueryValidationError
from app.services.project_service import (
    ProjectAccessError,
    ProjectLimitError,
    ProjectNotFoundError,
    ProjectService,
)

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
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc
    except ProjectNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ProjectAccessError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc


@router.post(
    "/{project_id}/objects/query",
    response_model=ProjectObjectsQueryResponse,
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
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
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
        await db.commit()
        await db.refresh(obj)
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
        return await ProjectService(db).reorder_objects(project_id, data.order, principal)
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
):
    from app.services.excel_import_service import build_template_csv, build_template_xlsx

    try:
        await ProjectService(db).get_project(project_id, principal)
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
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail=f"Неизвестный формат шаблона: {format} (допустимо: xlsx, csv)",
    )


@router.post(
    "/{project_id}/objects/import-excel",
    summary="Импорт объектов (трубопроводы, резервуары) из Excel или CSV",
)
async def import_excel(
    project_id: UUID,
    file: UploadFile,
    principal: CurrentPrincipal = Depends(require_any()),
    db: AsyncSession = Depends(get_db),
):
    from app.services.excel_import_service import (
        ExcelImportError,
        import_objects_from_csv,
        import_objects_from_excel,
    )

    filename = (file.filename or "").lower()
    if not (filename.endswith(".xlsx") or filename.endswith(".csv")):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Ожидается файл формата .xlsx или .csv",
        )
    content = await file.read()
    try:
        if filename.endswith(".csv"):
            return await import_objects_from_csv(db, project_id, principal, content)
        return await import_objects_from_excel(db, project_id, principal, content)
    except ExcelImportError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc
    except ProjectNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ProjectAccessError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc


@router.get(
    "/{project_id}/objects/export-excel",
    summary="Экспорт объектов в Excel (только сотрудник)",
)
async def export_excel(
    project_id: UUID,
    principal: CurrentPrincipal = Depends(require_employee()),
    db: AsyncSession = Depends(get_db),
):
    try:
        project = await ProjectService(db).get_project(project_id, principal)
    except ProjectNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    # Round-trip совместимый формат: листы «Трубопроводы» / «Резервуары»
    # с теми же колонками, что ожидает `POST /objects/import-excel`.
    data = build_objects_xlsx(project.objects)
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
        obj = await project_service.update_object(project_id, object_id, data, principal)
        calc_service = CalculationService(db)
        await calc_service.recalculate_object(obj)
        await db.commit()
        await db.refresh(obj)
        return obj
    except ProjectNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ProjectAccessError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc


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
    except ProjectNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ProjectAccessError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
