"""Схемы отчётов."""

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, model_validator


class ReportChapterMeta(BaseModel):
    electrical_variant_id: UUID | None = None
    electrical_variant_name: str | None = None
    variant_number: int | None = Field(default=None, ge=1, le=5)


class ReportPreviewResponse(BaseModel):
    project_id: str
    html: str
    sections: list[str]
    # Legacy slot may be null for dynamic ЭР without expand mapping (Phase 5).
    variant_number: int | None = Field(default=None, ge=1, le=5)
    electrical_variant_id: UUID | None = None
    electrical_variant_name: str | None = None
    chapters: list[ReportChapterMeta] | None = None


ReportFormat = Literal["pdf", "docx", "xlsx"]


class ReportExportJobRequest(BaseModel):
    project_id: UUID
    format: ReportFormat
    sections: list[str] | None = Field(default=None)
    electrical_variant_id: UUID | None = None
    variant_number: int | None = Field(default=None, ge=1, le=5, deprecated=True)

    @model_validator(mode="after")
    def require_electrical_variant_selector(self) -> "ReportExportJobRequest":
        values = self.model_dump()
        if values["electrical_variant_id"] is None and values["variant_number"] is None:
            raise ValueError("electrical_variant_id or deprecated variant_number is required")
        if values["electrical_variant_id"] is not None and values["variant_number"] is not None:
            raise ValueError("ELECTRICAL_VARIANT_SELECTOR_CONFLICT")
        return self


class ReportExportTaskResult(BaseModel):
    project_id: UUID
    format: ReportFormat
    electrical_variant_id: UUID | None = None
    variant_number: int = Field(ge=1, le=5)
    filename: str
    media_type: str
    size_bytes: int
    download_url: str
