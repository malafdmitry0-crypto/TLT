"""Electrical list projection and aggregate summary queries."""

import math
from typing import Any
from uuid import UUID

from sqlalchemy import Float, and_, func, or_, select
from sqlalchemy import cast as sa_cast
from sqlalchemy.ext.asyncio import AsyncSession

from app.electrical_result_status import (
    FAILED_ELECTRICAL_CATEGORIES,
    electrical_result_with_lifecycle,
)
from app.models.electrical_calculation import ElectricalCalculation
from app.models.electrical_variant import ElectricalVariantObject
from app.models.project_object import ProjectObject
from app.schemas.calculation import ElectricalCalcSummary
from app.schemas.project import ProjectObjectsPageInfo
from app.services.calculation.electrical_snapshots import ElectricalSnapshotService
from app.services.calculation.electrical_sources import CABLE_MARK_SOURCE_MANUAL
from app.services.electrical_result_lifecycle import current_tt_result_sql_predicate


class ElectricalSummaryQuery:
    """Read model for electrical pages; contains no calculation orchestration."""

    def __init__(self, db: AsyncSession, snapshots: ElectricalSnapshotService) -> None:
        self.db = db
        self.snapshots = snapshots

    async def electrical_calc_summaries(
        self,
        calculations: list[ElectricalCalculation],
        catalog_source: str = "builtin",
    ) -> list[ElectricalCalcSummary]:
        statuses = await self.snapshots.statuses(calculations, catalog_source)
        return [
            ElectricalCalcSummary(
                id=calc.id,
                object_id=calc.object_id,
                cable_type=calc.cable_type,
                cable_type_source=calc.cable_type_source,
                cable_mark=calc.cable_mark,
                cable_mark_source=calc.cable_mark_source,
                cable_snapshot=calc.cable_snapshot,
                cable_snapshot_status=statuses.get(calc.id),
                electrical_variant_id=calc.electrical_variant_id,
                params=calc.params,
                results=electrical_result_with_lifecycle(
                    calc.cable_mark,
                    (
                        {**calc.results, "cable_type": calc.cable_type}
                        if calc.cable_type == "self_regulating_tt"
                        and isinstance(calc.results, dict)
                        else calc.results
                    ),
                ),
            )
            for calc in calculations
        ]

    async def electrical_project_page(
        self,
        project_id: UUID,
        *,
        electrical_variant_id: UUID,
        page: int = 1,
        page_size: int = 50,
    ) -> tuple[
        list[ProjectObject], list[ElectricalCalculation], dict[str, Any], ProjectObjectsPageInfo
    ]:
        page = max(page, 1)
        page_size = min(max(page_size, 1), 200)

        object_counts_result = await self.db.execute(
            select(ProjectObject.is_valid, func.count())
            .where(ProjectObject.project_id == project_id)
            .group_by(ProjectObject.is_valid)
        )
        object_counts = {
            bool(is_valid): int(count) for is_valid, count in object_counts_result.all()
        }
        valid_objects = object_counts.get(True, 0)
        total_objects = sum(object_counts.values())
        offset = (page - 1) * page_size

        objects_result = await self.db.execute(
            select(ProjectObject)
            .where(ProjectObject.project_id == project_id)
            .order_by(ProjectObject.sort_order, ProjectObject.id)
            .offset(offset)
            .limit(page_size)
        )
        objects = list(objects_result.scalars().all())
        object_ids = [obj.id for obj in objects]

        calculation_scope = [ElectricalCalculation.project_id == project_id]
        calculation_scope.append(ElectricalCalculation.electrical_variant_id == electrical_variant_id)

        if object_ids:
            calculations_result = await self.db.execute(
                select(ElectricalCalculation).where(
                    *calculation_scope,
                    ElectricalCalculation.object_id.in_(object_ids),
                )
            )
            calculations = list(calculations_result.scalars().all())
        else:
            calculations = []

        error_code_text = ElectricalCalculation.results["error_code"].astext
        category_text = ElectricalCalculation.results["category"].astext
        stale_text = ElectricalCalculation.results["stale"].astext
        selected_cable_text = ElectricalCalculation.results["selected_cable"].astext
        successful_calc = and_(
            ElectricalCalculation.results.is_not(None),
            error_code_text.is_(None),
            category_text.is_(None),
            func.coalesce(stale_text, "") != "true",
            or_(
                ElectricalCalculation.cable_mark.is_not(None),
                selected_cable_text.is_not(None),
            ),
            current_tt_result_sql_predicate(),
        )
        failed_calc = and_(
            or_(
                error_code_text.is_not(None),
                category_text.in_(tuple(FAILED_ELECTRICAL_CATEGORIES)),
            ),
            func.coalesce(category_text, "") != "unsupported",
            func.coalesce(category_text, "") != "stale",
            func.coalesce(stale_text, "") != "true",
        )
        installed_cable_length = func.coalesce(
            sa_cast(
                ElectricalCalculation.results["layout"]["actual_installed_length_m"].astext,
                Float,
            ),
            sa_cast(ElectricalCalculation.results["section_plan"]["l_fact_m"].astext, Float),
            sa_cast(ElectricalCalculation.results["installed_cable_length"].astext, Float),
            0.0,
        )
        manual_cable_mark = or_(
            ElectricalCalculation.cable_mark_source == CABLE_MARK_SOURCE_MANUAL,
            ElectricalCalculation.params["cable_mark_source"].astext == CABLE_MARK_SOURCE_MANUAL,
            and_(
                ElectricalCalculation.params["cable_mark"].astext.is_not(None),
                ElectricalCalculation.params["cable_mark"].astext != "",
            ),
        )
        total_power = func.coalesce(
            sa_cast(
                ElectricalCalculation.results["electrical"]["total_power_w"].astext,
                Float,
            ),
            sa_cast(ElectricalCalculation.results["total_power"].astext, Float),
            0.0,
        )
        working_current = func.coalesce(
            sa_cast(
                ElectricalCalculation.results["electrical"]["working_current_a"].astext,
                Float,
            ),
            sa_cast(ElectricalCalculation.results["working_current"].astext, Float),
            sa_cast(ElectricalCalculation.results["current"].astext, Float),
            0.0,
        )
        start_current = func.coalesce(
            sa_cast(
                ElectricalCalculation.results["electrical"]["start_current_a"].astext,
                Float,
            ),
            sa_cast(ElectricalCalculation.results["start_current"].astext, Float),
            sa_cast(ElectricalCalculation.results["section_start_current_a"].astext, Float),
            0.0,
        )
        section_count = func.coalesce(
            sa_cast(ElectricalCalculation.results["section_plan"]["count"].astext, Float),
            sa_cast(ElectricalCalculation.results["section_count"].astext, Float),
            sa_cast(ElectricalCalculation.results["num_sections"].astext, Float),
            0.0,
        )
        assignment_join = and_(
            ElectricalVariantObject.project_id == ElectricalCalculation.project_id,
            ElectricalVariantObject.object_id == ElectricalCalculation.object_id,
            ElectricalVariantObject.electrical_variant_id
            == ElectricalCalculation.electrical_variant_id,
        )
        summary_from = ElectricalCalculation.__table__.outerjoin(
            ElectricalVariantObject,
            assignment_join,
        )
        system_type: Any = ElectricalVariantObject.system_type
        ready_successful_calc = and_(
            successful_calc,
            ElectricalVariantObject.assignment_state == "ready",
        )

        def system_totals(system: str) -> list[Any]:
            contributing = and_(ready_successful_calc, system_type == system)
            return [
                func.count(ElectricalCalculation.id).filter(contributing),
                func.coalesce(func.sum(installed_cable_length).filter(contributing), 0.0),
                func.coalesce(func.sum(section_count).filter(contributing), 0.0),
                func.coalesce(func.sum(total_power).filter(contributing), 0.0),
                func.coalesce(func.sum(working_current).filter(contributing), 0.0),
                func.coalesce(func.sum(start_current).filter(contributing), 0.0),
            ]

        summary_result = await self.db.execute(
            select(
                func.count(ElectricalCalculation.id),
                func.count(ElectricalCalculation.id).filter(ready_successful_calc),
                func.count(ElectricalCalculation.id).filter(failed_calc),
                func.count(ElectricalCalculation.id).filter(manual_cable_mark),
                func.coalesce(func.sum(installed_cable_length).filter(ready_successful_calc), 0.0),
                func.coalesce(func.sum(total_power).filter(ready_successful_calc), 0.0),
                func.coalesce(func.sum(working_current).filter(ready_successful_calc), 0.0),
                func.coalesce(func.sum(section_count).filter(ready_successful_calc), 0.0),
                func.coalesce(func.sum(start_current).filter(ready_successful_calc), 0.0),
                *system_totals("self_regulating"),
                *system_totals("resistive"),
                *system_totals("skin"),
            )
            .select_from(summary_from)
            .where(*calculation_scope)
        )
        summary_values = summary_result.one()
        (
            electrical_total,
            calculated_count,
            failed_count,
            manual_cable_mark_count,
            total_cable_length,
            summary_total_power,
            total_current,
            total_sections,
            total_start_current,
            *system_values,
        ) = summary_values

        system_keys = ("self_regulating", "resistive", "skin")
        system_summaries = {}
        for index, system in enumerate(system_keys):
            count, length, sections, power, current_value, start = system_values[
                index * 6 : (index + 1) * 6
            ]
            system_summaries[system] = {
                "object_count": int(count or 0),
                "cable_length_m": float(length or 0.0),
                "section_count": int(sections or 0),
                "power_w": float(power or 0.0),
                "working_current_a": float(current_value or 0.0),
                "start_current_a": float(start or 0.0),
            }
        system_summaries["total"] = {
            "object_count": int(calculated_count or 0),
            "cable_length_m": float(total_cable_length or 0.0),
            "section_count": int(total_sections or 0),
            "power_w": float(summary_total_power or 0.0),
            "working_current_a": float(total_current or 0.0),
            "start_current_a": float(total_start_current or 0.0),
        }

        total_pages = math.ceil(total_objects / page_size) if total_objects else 0
        summary = {
            "total_objects": total_objects,
            "valid_objects": valid_objects,
            "invalid_objects": total_objects - valid_objects,
            "electrical_calculations_total": int(electrical_total or 0),
            "calculated_count": int(calculated_count or 0),
            "failed_count": int(failed_count or 0),
            "manual_cable_mark_count": int(manual_cable_mark_count or 0),
            "total_cable_length": float(total_cable_length or 0.0),
            "total_power": float(summary_total_power or 0.0),
            "total_current": float(total_current or 0.0),
            "total_sections": int(total_sections or 0),
            "total_start_current_a": float(total_start_current or 0.0),
            "system_summaries": system_summaries,
        }
        page_info = ProjectObjectsPageInfo(
            page=page,
            page_size=page_size,
            offset=offset,
            total_pages=total_pages,
            has_next_page=page * page_size < total_objects,
            has_previous_page=page > 1,
        )
        return objects, calculations, summary, page_info
