"""Схемы отчётов."""

from typing import Literal

from pydantic import BaseModel


class ReportPreviewResponse(BaseModel):
    project_id: str
    html: str
    sections: list[str]


ReportFormat = Literal["pdf", "docx", "xlsx"]
