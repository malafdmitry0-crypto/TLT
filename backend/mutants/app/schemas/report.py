"""Схемы отчётов."""

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


class ReportPreviewResponse(BaseModel):
    project_id: str
    html: str
    sections: list[str]
    variant_number: int = Field(ge=1, le=4)


ReportFormat = Literal["pdf", "docx", "xlsx"]


class ReportExportJobRequest(BaseModel):
    project_id: UUID
    format: ReportFormat
    sections: list[str] | None = Field(default=None)
    variant_number: int = Field(ge=1, le=4)


class ReportExportTaskResult(BaseModel):
    project_id: UUID
    format: ReportFormat
    variant_number: int = Field(ge=1, le=4)
    filename: str
    media_type: str
    size_bytes: int
    download_url: str
