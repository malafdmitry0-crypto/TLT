"""Сервис генерации отчётов."""

import asyncio
from typing import Any, ClassVar
from uuid import UUID

from sqlalchemy import false, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import CurrentPrincipal
from app.electrical_result_status import (
    electrical_result_status,
    electrical_result_with_lifecycle,
    is_successful_electrical_result,
)
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


def specification_report_projection(
    spec: Specification | None,
    *,
    electrical_variant_id: UUID | None = None,
) -> dict[str, Any]:
    """Canonical report projection for one ER specification (SPEC-FINAL-01).

    ``state`` is the only branch selector for templates and procurement totals:
    ``absent`` | ``current`` | ``stale``. Phantom snapshot keys
    (``is_partial``, ``excluded_groups``, blocked status) are never exposed.
    """
    er_id: str | None = None
    if spec is not None and getattr(spec, "electrical_variant_id", None) is not None:
        er_id = str(spec.electrical_variant_id)
    elif electrical_variant_id is not None:
        er_id = str(electrical_variant_id)

    if spec is None:
        return {
            "state": "absent",
            "electrical_variant_id": er_id,
            "items": [],
        }

    raw_items = list(spec.items or [])
    if bool(getattr(spec, "is_stale", False)):
        stale_at = getattr(spec, "stale_at", None)
        return {
            "state": "stale",
            "electrical_variant_id": er_id,
            "items": [],
            "stale_reason": getattr(spec, "stale_reason", None),
            "stale_at": stale_at.isoformat() if stale_at is not None else None,
            "stale_details": getattr(spec, "stale_details", None),
            "retained_item_count": len(raw_items),
        }

    # Outcome-only rows (selection_required/blocked without BOM) are not a current
    # report specification — keep report states in {absent, current, stale}.
    generation_status = getattr(spec, "generation_status", None)
    if not raw_items and generation_status not in (None, "generated"):
        return {
            "state": "absent",
            "electrical_variant_id": er_id,
            "items": [],
        }

    return {
        "state": "current",
        "electrical_variant_id": er_id,
        "items": raw_items,
    }


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
    ) -> dict[str, Any]:
        enabled_sections = self._normalize_sections(sections)

        if principal is not None:
            project = await ProjectService(self.db).get_project_basic(project_id, principal)
        else:
            result = await self.db.execute(select(Project).where(Project.id == project_id))
            loaded_project = result.scalar_one_or_none()
            if loaded_project is None:
                raise ReportError("Проект не найден")
            project = loaded_project

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

        specification_context = specification_report_projection(
            None,
            electrical_variant_id=electrical_variant_id,
        )
        if "specification" in enabled_sections:
            spec_stmt = select(Specification).where(Specification.project_id == project_id)
            if electrical_variant_id is not None:
                spec_stmt = spec_stmt.where(
                    Specification.electrical_variant_id == electrical_variant_id
                )
            else:
                # Specification data plane is UUID-only. A numeric report selector
                # may still scope legacy electrical sections, never a BOM.
                spec_stmt = spec_stmt.where(false())
            spec_result = await self.db.execute(spec_stmt)
            spec = spec_result.scalars().first()
            # Blocked generate attempts never create a specification row, so
            # absence stays absent and a prior stale row stays stale.
            specification_context = specification_report_projection(
                spec,
                electrical_variant_id=electrical_variant_id,
            )

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
                elec_stmt = elec_stmt.where(ElectricalCalculation.variant_number == variant_number)
            else:
                elec_stmt = elec_stmt.where(false())
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
    ) -> dict[str, Any]:
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
    def _electrical_payload(cls, calc: ElectricalCalculation) -> dict[str, Any]:
        raw_results = calc.results or {}
        results = raw_results if isinstance(raw_results, dict) else {}
        cable_type = getattr(calc, "cable_type", None)
        if cable_type == "self_regulating_tt":
            results = {**results, "cable_type": cable_type}
        visible_results = electrical_result_with_lifecycle(calc.cable_mark, results) or {}
        return {
            "cable_mark": calc.cable_mark,
            "cable_snapshot": getattr(calc, "cable_snapshot", None),
            "results": visible_results,
            "status": cls._electrical_status(calc.cable_mark, visible_results),
        }

    @classmethod
    def _build_electrical_context(
        cls, objects: list[dict[str, Any]]
    ) -> dict[str, Any]:
        valid: list[dict[str, Any]] = []
        failed: list[dict[str, Any]] = []
        unsupported: list[dict[str, Any]] = []
        stale: list[dict[str, Any]] = []

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
    def _electrical_status(cls, cable_mark: str | None, results: dict[str, Any]) -> str:
        return electrical_result_status(cable_mark, results)

    @staticmethod
    def _is_successful_electrical_calculation(
        cable_mark: str | None,
        results: dict[str, Any] | None,
    ) -> bool:
        return is_successful_electrical_result(cable_mark, results)

    @classmethod
    def _sum_electrical_result(cls, objects: list[dict[str, Any]], key: str) -> float:
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
        if not isinstance(value, str):
            return 0.0
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
    ) -> dict[str, Any]:
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
        chapters: list[dict[str, Any]],
        sections: list[str] | None = None,
        *,
        principal: CurrentPrincipal,
    ) -> dict[str, Any]:
        """PDL-ER-39: one report with independent chapter per ER UUID; no cross-sums."""
        built: list[dict[str, Any]] = []
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
            "electrical": {
                "valid": [],
                "failed": [],
                "unsupported": [],
                "stale": [],
                "summary": {},
            },
            "specification": specification_report_projection(None),
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

    async def export_trusted_for_electrical_variant(
        self,
        project_id: UUID,
        fmt: str,
        electrical_variant_id: UUID,
        sections: list[str] | None = None,
    ) -> bytes:
        """Export a worker report through the canonical UUID-only task boundary."""
        return await self._export(
            project_id,
            fmt,
            sections,
            principal=None,
            variant_number=None,
            electrical_variant_id=electrical_variant_id,
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
