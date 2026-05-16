"""Сервис генерации отчётов."""

import asyncio
from typing import ClassVar
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import CurrentPrincipal
from app.models.electrical_calculation import ElectricalCalculation
from app.models.project import Project
from app.models.project_object import ProjectObject
from app.models.specification import Specification
from app.reports.excel_generator import generate_xlsx
from app.reports.pdf_generator import generate_pdf, render_html
from app.reports.word_generator import generate_docx
from app.services.project_service import ProjectService


class ReportError(Exception):
    pass


class ReportService:
    AVAILABLE_SECTIONS: ClassVar[tuple[str, ...]] = (
        "summary",
        "pipes",
        "tanks",
        "electrical",
        "specification",
    )
    OBJECT_SECTION_TYPES: ClassVar[dict[str, str]] = {"pipes": "pipe", "tanks": "tank"}

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def _load_context(
        self,
        project_id: UUID,
        sections: list[str] | None = None,
        *,
        principal: CurrentPrincipal | None,
    ) -> dict:
        enabled_sections = self._normalize_sections(sections)

        if principal is not None:
            project = await ProjectService(self.db).get_project_basic(project_id, principal)
        else:
            result = await self.db.execute(select(Project).where(Project.id == project_id))
            project = result.scalar_one_or_none()
            if project is None:
                raise ReportError("Проект не найден")

        needs_objects = bool(
            {"summary", "pipes", "tanks", "electrical"}.intersection(enabled_sections)
        )
        needs_all_objects = bool({"summary", "electrical"}.intersection(enabled_sections))
        object_types = {
            self.OBJECT_SECTION_TYPES[section]
            for section in enabled_sections
            if section in self.OBJECT_SECTION_TYPES
        }
        objects: list[ProjectObject] = []
        if needs_objects:
            objects_stmt = select(ProjectObject).where(ProjectObject.project_id == project_id)
            if not needs_all_objects and object_types:
                objects_stmt = objects_stmt.where(ProjectObject.object_type.in_(object_types))
            objects_stmt = objects_stmt.order_by(ProjectObject.sort_order, ProjectObject.id)
            objects_result = await self.db.execute(objects_stmt)
            objects = list(objects_result.scalars().all())

        spec_items = []
        if "specification" in enabled_sections:
            spec_result = await self.db.execute(
                select(Specification).where(Specification.project_id == project_id)
            )
            spec = spec_result.scalars().first()
            spec_items = spec.items if spec else []

        latest_by_object: dict[str, ElectricalCalculation] = {}
        if {"summary", "electrical"}.intersection(enabled_sections):
            elec_result = await self.db.execute(
                select(ElectricalCalculation).where(ElectricalCalculation.project_id == project_id)
            )
            elec_rows = list(elec_result.scalars().all())
            # Keep the latest variant per object.
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
                for o in objects
            ],
            "specification": {
                "items": spec_items,
            },
            "sections": enabled_sections,
        }

    def _normalize_sections(self, sections: list[str] | None) -> list[str]:
        if not sections:
            return list(self.AVAILABLE_SECTIONS)
        return [s for s in sections if s in self.AVAILABLE_SECTIONS]

    async def preview(
        self,
        project_id: UUID,
        sections: list[str] | None = None,
        *,
        principal: CurrentPrincipal,
    ) -> dict:
        ctx = await self._load_context(project_id, sections, principal=principal)
        html = render_html(ctx)
        return {
            "project_id": str(project_id),
            "html": html,
            "sections": ctx["sections"],
        }

    async def export(
        self,
        project_id: UUID,
        fmt: str,
        sections: list[str] | None = None,
        *,
        principal: CurrentPrincipal,
    ) -> bytes:
        return await self._export(project_id, fmt, sections, principal=principal)

    async def export_trusted(
        self, project_id: UUID, fmt: str, sections: list[str] | None = None
    ) -> bytes:
        return await self._export(project_id, fmt, sections, principal=None)

    async def _export(
        self,
        project_id: UUID,
        fmt: str,
        sections: list[str] | None = None,
        *,
        principal: CurrentPrincipal | None,
    ) -> bytes:
        if fmt not in {"pdf", "docx", "xlsx"}:
            raise ReportError(f"Неизвестный формат: {fmt}")

        ctx = await self._load_context(project_id, sections, principal=principal)
        if fmt == "pdf":
            return await asyncio.to_thread(generate_pdf, ctx)
        if fmt == "docx":
            return await asyncio.to_thread(generate_docx, ctx)
        return await asyncio.to_thread(generate_xlsx, ctx)
