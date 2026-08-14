"""Endpoints проектов."""

from urllib.parse import quote
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import (
    CurrentPrincipal,
    require_any,
    require_employee,
)
from app.core.uploads import read_upload_with_limit
from app.schemas.project import (
    ProjectCreate,
    ProjectResponse,
    ProjectUpdate,
)
from app.services.audit_service import AuditService
from app.services.calculation_service import CalculationService
from app.services.electrical_variant_service import (
    ElectricalVariantService,
    ElectricalVariantServiceError,
)
from app.services.project_io_service import (
    ProjectImportError,
    ProjectImportNameConflictError,
    export_project,
    export_projects_bulk,
    import_project,
    import_projects_bulk,
)
from app.services.project_service import (
    ProjectAccessError,
    ProjectLimitError,
    ProjectNotFoundError,
    ProjectService,
)


def _attachment_disposition(filename: str) -> str:
    """Content-Disposition с корректной кодировкой Unicode-имён (RFC 5987)."""
    ascii_fallback = filename.encode("ascii", errors="replace").decode("ascii")
    return f'attachment; filename="{ascii_fallback}"; ' f"filename*=UTF-8''{quote(filename)}"


router = APIRouter()


@router.get(
    "",
    response_model=list[ProjectResponse],
    summary="Список проектов текущего принципала",
)
async def list_projects(
    principal: CurrentPrincipal = Depends(require_any()),
    db: AsyncSession = Depends(get_db),
):
    service = ProjectService(db)
    return await service.list_projects(principal)


@router.post(
    "",
    response_model=ProjectResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Создать проект",
)
async def create_project(
    data: ProjectCreate,
    principal: CurrentPrincipal = Depends(require_any()),
    db: AsyncSession = Depends(get_db),
):
    service = ProjectService(db)
    try:
        project = await service.create_project(data, principal)
    except ProjectLimitError as exc:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=str(exc)) from exc
    await AuditService(db).try_record(
        event_type="project.created",
        category="project",
        principal=principal,
        project_id=project.id,
        details={"name": project.name, "task_number": project.task_number},
        message="Создан проект",
    )
    return project


@router.get(
    "/export-csv-bulk",
    summary="Пакетный экспорт проектов в CSV (сотрудник)",
    response_class=Response,
)
async def export_projects_csv_bulk_top(
    ids: str = Query(..., description="UUID проектов через запятую"),
    principal: CurrentPrincipal = Depends(require_employee()),
    db: AsyncSession = Depends(get_db),
):
    try:
        parsed = [UUID(x.strip()) for x in ids.split(",") if x.strip()]
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="Некорректный UUID в списке ids") from exc
    if not parsed:
        raise HTTPException(status_code=422, detail="Пустой список ids")
    try:
        filename, payload = await export_projects_bulk(db, parsed, principal)
    except ProjectNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ProjectAccessError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    await AuditService(db).try_record(
        event_type="project.export_bulk.csv",
        category="project",
        principal=principal,
        details={"project_ids": [str(item) for item in parsed], "filename": filename},
        message="Выгружен пакет проектов CSV",
    )
    return Response(
        content=payload,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": _attachment_disposition(filename)},
    )


@router.post(
    "/import-csv",
    response_model=ProjectResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Импорт одного проекта из CSV (все роли; для пользователя — замещает авто-проект)",
)
async def import_project_csv_top(
    file: UploadFile = File(...),
    principal: CurrentPrincipal = Depends(require_any()),
    db: AsyncSession = Depends(get_db),
):
    raw = await read_upload_with_limit(file)
    try:
        project = await import_project(db, raw, principal)
    except ProjectImportNameConflictError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    except ProjectImportError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except ProjectAccessError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    await AuditService(db).try_record(
        event_type="project.imported.csv",
        category="project",
        principal=principal,
        project_id=project.id,
        details={"filename": file.filename, "size_bytes": len(raw)},
        message="Импортирован проект из CSV",
    )
    return project


@router.post(
    "/import-csv-bulk",
    summary="Пакетный импорт проектов из CSV (сотрудник)",
)
async def import_projects_csv_bulk_top(
    file: UploadFile = File(...),
    principal: CurrentPrincipal = Depends(require_employee()),
    db: AsyncSession = Depends(get_db),
):
    raw = await read_upload_with_limit(file)
    try:
        result = await import_projects_bulk(db, raw, principal)
    except ProjectImportError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except ProjectAccessError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    await AuditService(db).try_record(
        event_type="project.import_bulk.csv",
        category="project",
        principal=principal,
        details={"filename": file.filename, "size_bytes": len(raw), "result": result},
        message="Импортирован пакет проектов CSV",
    )
    return result


@router.get(
    "/{project_id}",
    response_model=ProjectResponse,
    summary="Получить проект по id",
)
async def get_project(
    project_id: UUID,
    principal: CurrentPrincipal = Depends(require_any()),
    db: AsyncSession = Depends(get_db),
):
    service = ProjectService(db)
    try:
        return await service.get_project_summary(project_id, principal)
    except ProjectNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ProjectAccessError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc


@router.put(
    "/{project_id}",
    response_model=ProjectResponse,
    summary="Обновить проект",
)
async def update_project(
    project_id: UUID,
    data: ProjectUpdate,
    principal: CurrentPrincipal = Depends(require_any()),
    db: AsyncSession = Depends(get_db),
):
    service = ProjectService(db)
    try:
        project = await service.update_project(project_id, data, principal)
    except ProjectNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ProjectAccessError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    await AuditService(db).try_record(
        event_type="project.updated",
        category="project",
        principal=principal,
        project_id=project.id,
        details={"changed_fields": sorted(data.model_fields_set)},
        after_state={
            "name": project.name,
            "description": project.description,
            "task_number": project.task_number,
            "status": project.status,
        },
        message="Обновлён проект",
    )
    return project


@router.post(
    "/{project_id}/duplicate",
    response_model=ProjectResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Дублировать проект (только зарегистрированный пользователь)",
)
async def duplicate_project(
    project_id: UUID,
    principal: CurrentPrincipal = Depends(require_employee()),
    db: AsyncSession = Depends(get_db),
):
    service = ProjectService(db)
    try:
        new_project = await service.duplicate_project(project_id, principal)
    except ProjectNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ProjectAccessError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except ProjectLimitError as exc:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=str(exc)) from exc

    duplicated_project_id = new_project.id
    calc_service = CalculationService(db)
    await calc_service.batch_recalculate(duplicated_project_id)
    variant_service = ElectricalVariantService(db)
    electrical_readiness = await variant_service.get_readiness(duplicated_project_id, principal)
    electrical_variant = None
    if electrical_readiness.ready:
        try:
            electrical_variant = await variant_service.prepare_legacy_variant_for_write(
                duplicated_project_id,
                principal,
                1,
            )
        except ElectricalVariantServiceError as exc:
            raise HTTPException(status_code=exc.status_code, detail=exc.as_detail()) from exc
    await AuditService(db).try_record(
        event_type="project.duplicated",
        category="project",
        principal=principal,
        project_id=duplicated_project_id,
        details={
            "source_project_id": str(project_id),
            "electrical_status": (
                "initialized_unassigned" if electrical_variant is not None else "skipped_not_ready"
            ),
            "electrical_variant_id": (
                str(electrical_variant.id) if electrical_variant is not None else None
            ),
            "legacy_variant_number": 1 if electrical_variant is not None else None,
            "electrical_readiness_issue_codes": sorted(
                {issue.code for issue in electrical_readiness.issues}
            ),
        },
        message="Проект скопирован с теплорасчётом и неназначенным ЭР1",
    )
    return await service.get_project_summary(duplicated_project_id, principal)


@router.get(
    "/{project_id}/export-csv",
    summary="Экспорт проекта в CSV (все роли)",
    response_class=Response,
)
async def export_project_csv(
    project_id: UUID,
    principal: CurrentPrincipal = Depends(require_any()),
    db: AsyncSession = Depends(get_db),
):
    try:
        filename, payload = await export_project(db, project_id, principal)
    except ProjectNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ProjectAccessError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    await AuditService(db).try_record(
        event_type="project.exported.csv",
        category="project",
        principal=principal,
        project_id=project_id,
        details={"filename": filename, "size_bytes": len(payload)},
        message="Выгружен проект CSV",
    )
    return Response(
        content=payload,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": _attachment_disposition(filename)},
    )


@router.delete(
    "/{project_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Удалить проект",
)
async def delete_project(
    project_id: UUID,
    principal: CurrentPrincipal = Depends(require_any()),
    db: AsyncSession = Depends(get_db),
) -> None:
    service = ProjectService(db)
    try:
        await service.delete_project(project_id, principal)
    except ProjectNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ProjectAccessError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    await AuditService(db).try_record(
        event_type="project.deleted",
        category="project",
        principal=principal,
        project_id=project_id,
        severity="warning",
        message="Удалён проект",
    )
