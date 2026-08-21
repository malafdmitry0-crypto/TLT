"""Схемы отчётов."""

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class ReportChapterMeta(BaseModel):
    electrical_variant_id: UUID
    electrical_variant_name: str


class ReportPreviewResponse(BaseModel):
    project_id: str
    html: str
    sections: list[str]
    electrical_variant_id: UUID | None = None
    electrical_variant_name: str | None = None
    chapters: list[ReportChapterMeta] | None = None


ReportFormat = Literal["pdf", "docx", "xlsx"]


class ReportExportJobRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

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
