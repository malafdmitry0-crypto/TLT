"""Endpoints отчётов."""

import io
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import (
    CurrentPrincipal,
    require_any,
    require_employee,
)
from app.schemas.report import ReportPreviewResponse
from app.services.report_service import ReportError, ReportService

router = APIRouter()

MEDIA_TYPES = {
    "pdf": "application/pdf",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}


@router.get(
    "/{project_id}/preview",
    response_model=ReportPreviewResponse,
    summary="HTML-предпросмотр отчёта",
)
async def preview(
    project_id: UUID,
    sections: list[str] | None = Query(default=None),
    principal: CurrentPrincipal = Depends(require_any()),
    db: AsyncSession = Depends(get_db),
):
    service = ReportService(db)
    try:
        result = await service.preview(project_id, sections)
    except ReportError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return ReportPreviewResponse(**result)


@router.get(
    "/{project_id}/export/{format}",
    summary="Экспорт отчёта в PDF / DOCX / XLSX (только сотрудник)",
)
async def export(
    project_id: UUID,
    format: str,
    sections: list[str] | None = Query(default=None),
    principal: CurrentPrincipal = Depends(require_employee()),
    db: AsyncSession = Depends(get_db),
):
    if format not in MEDIA_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Неподдерживаемый формат: {format}",
        )
    service = ReportService(db)
    try:
        data = await service.export(project_id, format, sections)
    except ReportError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return StreamingResponse(
        io.BytesIO(data),
        media_type=MEDIA_TYPES[format],
        headers={"Content-Disposition": f"attachment; filename=report.{format}"},
    )
