"""Authorized read access to immutable electrical calculation revisions."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import CurrentPrincipal
from app.models.electrical_calculation import ElectricalCalculation
from app.models.electrical_calculation_revision import ElectricalCalculationRevision
from app.schemas.electrical_history import ElectricalCalculationHistoryResponse
from app.services.project_service import ProjectService


class ElectricalCalculationHistoryNotFoundError(Exception):
    """Neither a current projection nor an audit revision exists for the id."""


class ElectricalHistoryService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def list_revisions(
        self,
        calculation_id: UUID,
        principal: CurrentPrincipal,
        *,
        page: int = 1,
        page_size: int = 50,
    ) -> ElectricalCalculationHistoryResponse:
        page = max(page, 1)
        page_size = min(max(page_size, 1), 200)
        project_id = await self.db.scalar(
            select(ElectricalCalculationRevision.project_id)
            .where(ElectricalCalculationRevision.electrical_calculation_id == calculation_id)
            .order_by(ElectricalCalculationRevision.revision_number.desc())
            .limit(1)
        )
        if project_id is None:
            project_id = await self.db.scalar(
                select(ElectricalCalculation.project_id).where(
                    ElectricalCalculation.id == calculation_id
                )
            )
        if project_id is None:
            raise ElectricalCalculationHistoryNotFoundError(
                "История электрического расчёта не найдена"
            )

        await ProjectService(self.db).get_project_basic(project_id, principal)
        total = int(
            await self.db.scalar(
                select(func.count())
                .select_from(ElectricalCalculationRevision)
                .where(ElectricalCalculationRevision.electrical_calculation_id == calculation_id)
            )
            or 0
        )
        revisions = await self.db.scalars(
            select(ElectricalCalculationRevision)
            .where(ElectricalCalculationRevision.electrical_calculation_id == calculation_id)
            .order_by(
                ElectricalCalculationRevision.revision_number.desc(),
                ElectricalCalculationRevision.id.desc(),
            )
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        return ElectricalCalculationHistoryResponse(
            calculation_id=calculation_id,
            project_id=project_id,
            total=total,
            page=page,
            page_size=page_size,
            items=list(revisions.all()),
        )
