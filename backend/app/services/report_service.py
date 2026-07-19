"""Сервис генерации отчётов."""

import asyncio
from typing import ClassVar
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import CurrentPrincipal
from app.electrical_result_status import electrical_result_status, is_successful_electrical_result
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
        variant_number: int | None = 1,
        electrical_variant_id: UUID | None = None,
        electrical_variant_name: str | None = None,
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
        specification_context = {
            "items": spec_items,
            "is_stale": False,
            "stale_reason": None,
            "stale_at": None,
            "stale_details": None,
        }
        if "specification" in enabled_sections:
            spec_stmt = select(Specification).where(Specification.project_id == project_id)
            if electrical_variant_id is not None:
                spec_stmt = spec_stmt.where(
                    Specification.electrical_variant_id == electrical_variant_id
                )
            elif variant_number is not None:
                spec_stmt = spec_stmt.where(Specification.variant_number == variant_number)
            else:
                spec_stmt = spec_stmt.where(False)  # no selector → empty
            spec_result = await self.db.execute(spec_stmt)
            spec = spec_result.scalars().first()
            if spec:
                is_stale = bool(getattr(spec, "is_stale", False))
                # PDL-ER-37: stale snapshot is viewable only outside report/export
                # quantities. Preview/print/export must not ship procurement rows.
                raw_items = list(spec.items or [])
                specification_context = {
                    "items": [] if is_stale else raw_items,
                    "is_stale": is_stale,
                    "stale_reason": getattr(spec, "stale_reason", None),
                    "stale_at": (
                        stale_at.isoformat()
                        if (stale_at := getattr(spec, "stale_at", None))
                        else None
                    ),
                    "stale_details": getattr(spec, "stale_details", None),
                    "excluded_from_output": is_stale,
                    "retained_item_count": len(raw_items) if is_stale else 0,
                }

        latest_by_object: dict[str, ElectricalCalculation] = {}
        if {"summary", "electrical"}.intersection(enabled_sections):
            elec_stmt = select(ElectricalCalculation).where(
                ElectricalCalculation.project_id == project_id
            )
            if electrical_variant_id is not None:
                elec_stmt = elec_stmt.where(
                    ElectricalCalculation.electrical_variant_id == electrical_variant_id
                )
            elif variant_number is not None:
                elec_stmt = elec_stmt.where(
                    ElectricalCalculation.variant_number == variant_number
                )
            else:
                elec_stmt = elec_stmt.where(False)
            elec_result = await self.db.execute(elec_stmt)
            elec_rows = list(elec_result.scalars().all())
            for e in elec_rows:
                latest_by_object[str(e.object_id)] = e

        object_payloads = [self._object_payload(o, latest_by_object) for o in objects]
        electrical_context = self._build_electrical_context(object_payloads)

        return {
            "project": {
                "id": str(project.id),
                "name": project.name,
                "description": project.description or "",
                "status": project.status,
            },
            "objects": object_payloads,
            "electrical": electrical_context,
            "specification": specification_context,
            "sections": enabled_sections,
            "variant_number": variant_number,
            "electrical_variant_id": (
                str(electrical_variant_id) if electrical_variant_id is not None else None
            ),
            "electrical_variant_name": electrical_variant_name,
        }

    def _normalize_sections(self, sections: list[str] | None) -> list[str]:
        if not sections:
            return list(self.AVAILABLE_SECTIONS)
        return [s for s in sections if s in self.AVAILABLE_SECTIONS]

    @classmethod
    def _object_payload(
        cls,
        obj: ProjectObject,
        latest_by_object: dict[str, ElectricalCalculation],
    ) -> dict:
        calc = latest_by_object.get(str(obj.id))
        return {
            "id": str(obj.id),
            "object_type": obj.object_type,
            "params": obj.params or {},
            "results": obj.results or {},
            "is_valid": obj.is_valid,
            "electrical": cls._electrical_payload(calc) if calc is not None else None,
        }

    @classmethod
    def _electrical_payload(cls, calc: ElectricalCalculation) -> dict:
        raw_results = calc.results or {}
        results = raw_results if isinstance(raw_results, dict) else {}
        return {
            "cable_mark": calc.cable_mark,
            "cable_snapshot": getattr(calc, "cable_snapshot", None),
            "results": results,
            "status": cls._electrical_status(calc.cable_mark, results),
        }

    @classmethod
    def _build_electrical_context(cls, objects: list[dict]) -> dict:
        valid: list[dict] = []
        failed: list[dict] = []
        unsupported: list[dict] = []
        stale: list[dict] = []

        for obj in objects:
            electrical = obj.get("electrical")
            if not isinstance(electrical, dict):
                continue
            status = electrical.get("status")
            if status == "success":
                valid.append(obj)
            elif status == "unsupported":
                unsupported.append(obj)
            elif status == "stale":
                stale.append(obj)
            else:
                failed.append(obj)

        return {
            "valid": valid,
            "failed": failed,
            "unsupported": unsupported,
            "stale": stale,
            "summary": {
                "total": len(valid) + len(failed) + len(unsupported) + len(stale),
                "successful": len(valid),
                "failed": len(failed),
                "unsupported": len(unsupported),
                "stale": len(stale),
                "total_power": cls._sum_electrical_result(valid, "total_power"),
                "total_cable": cls._sum_electrical_result(valid, "order_cable_length"),
                "total_current": cls._sum_electrical_result(valid, "current"),
            },
        }

    @classmethod
    def _electrical_status(cls, cable_mark: str | None, results: dict) -> str:
        return electrical_result_status(cable_mark, results)

    @staticmethod
    def _is_successful_electrical_calculation(
        cable_mark: str | None,
        results: dict | None,
    ) -> bool:
        return is_successful_electrical_result(cable_mark, results)

    @classmethod
    def _sum_electrical_result(cls, objects: list[dict], key: str) -> float:
        total = 0.0
        for obj in objects:
            electrical = obj.get("electrical")
            if not isinstance(electrical, dict):
                continue
            results = electrical.get("results")
            if not isinstance(results, dict):
                continue
            total += cls._result_number(results.get(key))
        return total

    @staticmethod
    def _result_number(value: object) -> float:
        if isinstance(value, bool) or value is None:
            return 0.0
        if isinstance(value, int | float):
            return float(value)
        try:
            return float(value)
        except (TypeError, ValueError):
            return 0.0

    async def preview(
        self,
        project_id: UUID,
        sections: list[str] | None = None,
        *,
        principal: CurrentPrincipal,
        variant_number: int | None = 1,
        electrical_variant_id: UUID | None = None,
        electrical_variant_name: str | None = None,
    ) -> dict:
        ctx = await self._load_context(
            project_id,
            sections,
            principal=principal,
            variant_number=variant_number,
            electrical_variant_id=electrical_variant_id,
            electrical_variant_name=electrical_variant_name,
        )
        html = render_html(ctx)
        return {
            "project_id": str(project_id),
            "html": html,
            "sections": ctx["sections"],
            "variant_number": variant_number,
            "electrical_variant_id": ctx.get("electrical_variant_id"),
            "electrical_variant_name": electrical_variant_name,
        }

    async def preview_multi(
        self,
        project_id: UUID,
        chapters: list[dict],
        sections: list[str] | None = None,
        *,
        principal: CurrentPrincipal,
    ) -> dict:
        """PDL-ER-39: one report with independent chapter per ER UUID; no cross-sums."""
        built: list[dict] = []
        for chapter in chapters:
            ctx = await self._load_context(
                project_id,
                sections,
                principal=principal,
                variant_number=chapter.get("variant_number"),
                electrical_variant_id=chapter.get("electrical_variant_id"),
                electrical_variant_name=chapter.get("electrical_variant_name"),
            )
            built.append(
                {
                    "electrical_variant_id": chapter.get("electrical_variant_id"),
                    "electrical_variant_name": chapter.get("electrical_variant_name"),
                    "variant_number": chapter.get("variant_number"),
                    "objects": ctx["objects"],
                    "electrical": ctx["electrical"],
                    "specification": ctx["specification"],
                }
            )
        # Shared project meta from first context
        first = await self._load_context(
            project_id,
            ["summary"],
            principal=principal,
            variant_number=chapters[0].get("variant_number") if chapters else None,
            electrical_variant_id=chapters[0].get("electrical_variant_id") if chapters else None,
        )
        multi_ctx = {
            "project": first["project"],
            "sections": self._normalize_sections(sections),
            "chapters": built,
            "multi_er": True,
            # Keep single-ER keys empty so template does not mix totals.
            "objects": [],
            "electrical": {"valid": [], "failed": [], "unsupported": [], "stale": [], "summary": {}},
            "specification": {"items": [], "is_stale": False},
            "variant_number": None,
            "electrical_variant_id": None,
            "electrical_variant_name": None,
        }
        html = render_html(multi_ctx)
        return {
            "project_id": str(project_id),
            "html": html,
            "sections": multi_ctx["sections"],
            "variant_number": None,
            "electrical_variant_id": None,
            "electrical_variant_name": None,
            "chapters": [
                {
                    "electrical_variant_id": c.get("electrical_variant_id"),
                    "electrical_variant_name": c.get("electrical_variant_name"),
                    "variant_number": c.get("variant_number"),
                }
                for c in built
            ],
        }

    async def export(
        self,
        project_id: UUID,
        fmt: str,
        sections: list[str] | None = None,
        *,
        principal: CurrentPrincipal,
        variant_number: int | None = 1,
        electrical_variant_id: UUID | None = None,
        electrical_variant_name: str | None = None,
    ) -> bytes:
        return await self._export(
            project_id,
            fmt,
            sections,
            principal=principal,
            variant_number=variant_number,
            electrical_variant_id=electrical_variant_id,
            electrical_variant_name=electrical_variant_name,
        )

    async def export_trusted(
        self,
        project_id: UUID,
        fmt: str,
        sections: list[str] | None = None,
        *,
        variant_number: int | None = 1,
        electrical_variant_id: UUID | None = None,
        electrical_variant_name: str | None = None,
    ) -> bytes:
        return await self._export(
            project_id,
            fmt,
            sections,
            principal=None,
            variant_number=variant_number,
            electrical_variant_id=electrical_variant_id,
            electrical_variant_name=electrical_variant_name,
        )

    async def _export(
        self,
        project_id: UUID,
        fmt: str,
        sections: list[str] | None = None,
        *,
        principal: CurrentPrincipal | None,
        variant_number: int | None = 1,
        electrical_variant_id: UUID | None = None,
        electrical_variant_name: str | None = None,
    ) -> bytes:
        if fmt not in {"pdf", "docx", "xlsx"}:
            raise ReportError(f"Неизвестный формат: {fmt}")

        ctx = await self._load_context(
            project_id,
            sections,
            principal=principal,
            variant_number=variant_number,
            electrical_variant_id=electrical_variant_id,
            electrical_variant_name=electrical_variant_name,
        )
        if fmt == "pdf":
            return await asyncio.to_thread(generate_pdf, ctx)
        if fmt == "docx":
            return await asyncio.to_thread(generate_docx, ctx)
        return await asyncio.to_thread(generate_xlsx, ctx)
