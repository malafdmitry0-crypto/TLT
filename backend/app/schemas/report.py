"""Схемы отчётов."""

from typing import Any, Literal

from pydantic import BaseModel


class ReportPreviewResponse(BaseModel):
    project_id: str
    html: str
    sections: list[str]
    data: dict[str, Any]


ReportFormat = Literal["pdf", "docx", "xlsx"]
