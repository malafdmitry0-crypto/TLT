"""Flush-only persistence operations for electrical calculation projections."""

from typing import Any
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import load_only

from app.models.electrical_calculation import ElectricalCalculation
from app.models.project_object import ProjectObject
from app.schemas.calculation import ElectricalRequest
from app.services.calculation.batch_execution import chunked_rows
from app.services.calculation.electrical_sources import (
    compact_electrical_params,
    normalize_cable_mark_source,
    normalize_cable_type_source,
    resolve_cable_mark_source,
)
from app.services.electrical_assignment_service import ElectricalAssignmentService

POSTGRES_BIND_PARAMETER_LIMIT = 32_767
ELECTRICAL_BULK_UPSERT_TARGET_CHUNK_SIZE = 2_000


class ElectricalCalculationRepository:
    """Persist projections and flush related assignment state; never commit."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def upsert_one(
        self,
        *,
        obj: ProjectObject,
        request: ElectricalRequest,
        cable_mark: str | None,
        result_dict: dict[str, Any],
        cable_snapshot: dict[str, Any] | None,
        electrical_variant_id: UUID | None = None,
    ) -> ElectricalCalculation:
        rows = await self.bulk_upsert(
            [
                {
                    "project_id": obj.project_id,
                    "object_id": obj.id,
                    "variant_number": None,
                    "electrical_variant_id": electrical_variant_id,
                    "cable_type": request.cable_type,
                    "cable_type_source": normalize_cable_type_source(
                        request.data.get("cable_type_source")
                    ),
                    "cable_mark": cable_mark,
                    "cable_mark_source": resolve_cable_mark_source(request.data),
                    "cable_snapshot": cable_snapshot,
                    "params": compact_electrical_params(request.data),
                    "results": result_dict,
                }
            ],
            return_calcs=True,
        )
        return rows[0]

    async def bulk_upsert(
        self,
        rows: list[dict[str, Any]],
        *,
        return_calcs: bool = True,
    ) -> list[ElectricalCalculation]:
        if not rows:
            return []
        for row in rows:
            row["cable_type_source"] = normalize_cable_type_source(row.get("cable_type_source"))
            row["cable_mark_source"] = normalize_cable_mark_source(row.get("cable_mark_source"))
            row.setdefault("cable_snapshot", None)
        assignment_service = ElectricalAssignmentService(self.db)
        await assignment_service.validate_calculation_rows(rows)
        chunk_size = self.chunk_size(rows[0])
        calculations: list[ElectricalCalculation] = []
        for chunk in chunked_rows(rows, chunk_size):
            calculations.extend(await self._upsert_chunk(chunk, return_calcs=return_calcs))
        await assignment_service.sync_from_calculation_rows(rows)
        return calculations

    async def load_existing_by_object_id(
        self,
        project_id: UUID,
        *,
        variant_number: int | None,
        object_ids: list[UUID],
        electrical_variant_id: UUID | None = None,
    ) -> dict[UUID, ElectricalCalculation]:
        if not object_ids:
            return {}
        filters = [
            ElectricalCalculation.project_id == project_id,
            ElectricalCalculation.object_id.in_(object_ids),
        ]
        if electrical_variant_id is None:
            raise ValueError("electrical_variant_id is required")
        filters.append(ElectricalCalculation.electrical_variant_id == electrical_variant_id)
        result = await self.db.execute(
            select(ElectricalCalculation)
            .options(
                load_only(
                    ElectricalCalculation.id,
                    ElectricalCalculation.object_id,
                    ElectricalCalculation.cable_type,
                    ElectricalCalculation.cable_type_source,
                    ElectricalCalculation.cable_mark,
                    ElectricalCalculation.cable_mark_source,
                    ElectricalCalculation.params,
                    ElectricalCalculation.results,
                )
            )
            .where(*filters)
        )
        return {
            calculation.object_id: calculation
            for calculation in result.scalars().all()
            if getattr(calculation, "object_id", None) is not None
        }

    async def load_existing_for_variant(
        self,
        project_id: UUID,
        electrical_variant_id: UUID,
        object_ids: list[UUID],
    ) -> dict[UUID, ElectricalCalculation]:
        """Load the UUID-scoped projection without exposing its storage slot."""
        if not object_ids:
            return {}
        result = await self.db.execute(
            select(ElectricalCalculation)
            .options(
                load_only(
                    ElectricalCalculation.id,
                    ElectricalCalculation.object_id,
                    ElectricalCalculation.cable_type,
                    ElectricalCalculation.cable_type_source,
                    ElectricalCalculation.cable_mark,
                    ElectricalCalculation.cable_mark_source,
                    ElectricalCalculation.params,
                    ElectricalCalculation.results,
                )
            )
            .where(
                ElectricalCalculation.project_id == project_id,
                ElectricalCalculation.electrical_variant_id == electrical_variant_id,
                ElectricalCalculation.object_id.in_(object_ids),
            )
        )
        return {calculation.object_id: calculation for calculation in result.scalars().all()}

    @staticmethod
    def chunk_size(row: dict[str, Any]) -> int:
        params_per_row = max(len(row), 1)
        max_rows_by_bind_limit = max(
            1,
            POSTGRES_BIND_PARAMETER_LIMIT // params_per_row,
        )
        return min(ELECTRICAL_BULK_UPSERT_TARGET_CHUNK_SIZE, max_rows_by_bind_limit)

    async def _upsert_chunk(
        self,
        rows: list[dict[str, Any]],
        *,
        return_calcs: bool,
    ) -> list[ElectricalCalculation]:
        insert_stmt = pg_insert(ElectricalCalculation).values(rows)
        update_values: dict[str, Any] = {
            "project_id": insert_stmt.excluded.project_id,
            "cable_type": insert_stmt.excluded.cable_type,
            "cable_type_source": insert_stmt.excluded.cable_type_source,
            "cable_mark": insert_stmt.excluded.cable_mark,
            "cable_mark_source": insert_stmt.excluded.cable_mark_source,
            "cable_snapshot": insert_stmt.excluded.cable_snapshot,
            "params": insert_stmt.excluded.params,
            "results": insert_stmt.excluded.results,
            "updated_at": func.now(),
        }
        if all(row.get("electrical_variant_id") is not None for row in rows):
            update_values["electrical_variant_id"] = insert_stmt.excluded.electrical_variant_id
        upsert_stmt = insert_stmt.on_conflict_do_update(
            index_elements=["object_id", "electrical_variant_id"],
            index_where=ElectricalCalculation.electrical_variant_id.is_not(None),
            set_=update_values,
        )
        if not return_calcs:
            await self.db.execute(upsert_stmt)
            return []

        returning_stmt = upsert_stmt.returning(ElectricalCalculation)
        orm_stmt = (
            select(ElectricalCalculation)
            .from_statement(returning_stmt)
            .execution_options(populate_existing=True)
        )
        result = await self.db.execute(orm_stmt)
        returned_by_object_id = {
            calculation.object_id: calculation for calculation in result.scalars().all()
        }
        return [returned_by_object_id[row["object_id"]] for row in rows]
