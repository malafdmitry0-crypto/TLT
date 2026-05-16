"""Схемы отчётов."""

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


class ReportPreviewResponse(BaseModel):
    project_id: str
    html: str
    sections: list[str]


ReportFormat = Literal["pdf", "docx", "xlsx"]


class ReportExportJobRequest(BaseModel):
    project_id: UUID
    format: ReportFormat
    sections: list[str] | None = Field(default=None)


class ReportExportTaskResult(BaseModel):
    project_id: UUID
    format: ReportFormat
    filename: str
    media_type: str
    size_bytes: int
    download_url: str
