"""Сервис генерации отчётов."""

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.electrical_calculation import ElectricalCalculation
from app.models.project import Project
from app.models.specification import Specification
from app.reports.excel_generator import generate_xlsx
from app.reports.pdf_generator import generate_pdf, render_html
from app.reports.word_generator import generate_docx


class ReportError(Exception):
    pass


class ReportService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def _load_context(self, project_id: UUID) -> dict:
        result = await self.db.execute(
            select(Project).where(Project.id == project_id).options(selectinload(Project.objects))
        )
        project = result.scalar_one_or_none()
        if project is None:
            raise ReportError("Проект не найден")

        spec_result = await self.db.execute(
            select(Specification).where(Specification.project_id == project_id)
        )
        spec = spec_result.scalars().first()

        elec_result = await self.db.execute(
            select(ElectricalCalculation).where(ElectricalCalculation.project_id == project_id)
        )
        elec_rows = list(elec_result.scalars().all())
        # Keep the latest variant per object
        latest_by_object: dict[str, ElectricalCalculation] = {}
        for e in elec_rows:
            key = str(e.object_id)
            prev = latest_by_object.get(key)
            if prev is None or e.variant_number > prev.variant_number:
                latest_by_object[key] = e

        return {
            "project": {
                "id": str(project.id),
                "name": project.name,
                "description": project.description or "",
                "status": project.status,
            },
            "objects": [
                {
                    "id": str(o.id),
                    "object_type": o.object_type,
                    "params": o.params,
                    "results": o.results,
                    "is_valid": o.is_valid,
                    "electrical": (
                        {
                            "cable_mark": latest_by_object[str(o.id)].cable_mark,
                            "results": latest_by_object[str(o.id)].results or {},
                        }
                        if str(o.id) in latest_by_object
                        else None
                    ),
                }
                for o in project.objects
            ],
            "specification": {
                "items": spec.items if spec else [],
            },
        }

    AVAILABLE_SECTIONS = ("summary", "pipes", "tanks", "electrical", "specification")

    def _normalize_sections(self, sections: list[str] | None) -> list[str]:
        if not sections:
            return list(self.AVAILABLE_SECTIONS)
        return [s for s in sections if s in self.AVAILABLE_SECTIONS]

    async def preview(self, project_id: UUID, sections: list[str] | None = None) -> dict:
        ctx = await self._load_context(project_id)
        ctx["sections"] = self._normalize_sections(sections)
        html = render_html(ctx)
        return {
            "project_id": str(project_id),
            "html": html,
            "sections": ctx["sections"],
            "data": ctx,
        }

    async def export(self, project_id: UUID, fmt: str, sections: list[str] | None = None) -> bytes:
        ctx = await self._load_context(project_id)
        ctx["sections"] = self._normalize_sections(sections)
        if fmt == "pdf":
            return generate_pdf(ctx)
        if fmt == "docx":
            return generate_docx(ctx)
        if fmt == "xlsx":
            return generate_xlsx(ctx)
        raise ReportError(f"Неизвестный формат: {fmt}")
