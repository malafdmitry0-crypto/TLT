"""Схемы отчётов."""

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

from app.electrical_variant_limits import MAX_ELECTRICAL_VARIANTS


class ReportChapterMeta(BaseModel):
    electrical_variant_id: UUID | None = None
    electrical_variant_name: str | None = None
    variant_number: int | None = Field(default=None, ge=1, le=MAX_ELECTRICAL_VARIANTS)


class ReportPreviewResponse(BaseModel):
    project_id: str
    html: str
    sections: list[str]
    # Legacy slot may be null for dynamic ЭР without expand mapping (Phase 5).
    variant_number: int | None = Field(default=None, ge=1, le=MAX_ELECTRICAL_VARIANTS)
    electrical_variant_id: UUID | None = None
    electrical_variant_name: str | None = None
    chapters: list[ReportChapterMeta] | None = None


ReportFormat = Literal["pdf", "docx", "xlsx"]


class ReportExportJobRequest(BaseModel):
    project_id: UUID
    format: ReportFormat
    sections: list[str] | None = Field(default=None)
    electrical_variant_id: UUID


class ReportExportTaskResult(BaseModel):
    project_id: UUID
    format: ReportFormat
    electrical_variant_id: UUID
    filename: str
    media_type: str
    size_bytes: int
    download_url: str
