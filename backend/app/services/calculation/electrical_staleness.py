"""Invalidation of electrical artifacts after heat inputs change."""

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.electrical_calculation import ElectricalCalculation
from app.models.electrical_candidate import ElectricalCandidate
from app.services.electrical_assignment_service import ElectricalAssignmentService

STALE_ELECTRICAL_ERROR_CODE = "STALE_HEAT_LOSS"
STALE_ELECTRICAL_MESSAGE = "Теплопотери объекта изменились. Пересчитайте электрорасчёт."
ELECTRICAL_CANDIDATE_STATUS_STALE = "stale"


class ElectricalStalenessService:
    """Mark persisted electrical projections stale without committing."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def mark_for_objects(
        self,
        project_id: UUID,
        object_ids: list[UUID] | set[UUID] | tuple[UUID, ...],
        *,
        reason: str = "heat_loss_changed",
    ) -> int:
        unique_ids = list(dict.fromkeys(object_ids))
        if not unique_ids:
            return 0

        result = await self.db.execute(
            select(ElectricalCalculation).where(
                ElectricalCalculation.project_id == project_id,
                ElectricalCalculation.object_id.in_(unique_ids),
            )
        )
        stale_count = 0
        for calculation in result.scalars().all():
            previous = dict(calculation.results or {})
            if previous.get("category") == "stale":
                continue
            calculation.results = {
                **previous,
                "stale": True,
                "stale_reason": reason,
                "error_code": STALE_ELECTRICAL_ERROR_CODE,
                "category": "stale",
                "message": STALE_ELECTRICAL_MESSAGE,
                "hint": "Нажмите «Пересчитать выбранные» или «Пересчитать все» вручную.",
            }
            stale_count += 1

        candidate_result = await self.db.execute(
            select(ElectricalCandidate).where(
                ElectricalCandidate.project_id == project_id,
                ElectricalCandidate.object_id.in_(unique_ids),
                ElectricalCandidate.status != ELECTRICAL_CANDIDATE_STATUS_STALE,
            )
        )
        for candidate in candidate_result.scalars().all():
            candidate.status = ELECTRICAL_CANDIDATE_STATUS_STALE
            candidate.is_applied = False
            candidate.reason_code = STALE_ELECTRICAL_ERROR_CODE
            candidate.reason_message = STALE_ELECTRICAL_MESSAGE
            candidate.risk_flags = [
                *list(candidate.risk_flags or []),
                {"code": STALE_ELECTRICAL_ERROR_CODE, "message": STALE_ELECTRICAL_MESSAGE},
            ]
            stale_count += 1

        stale_count += await ElectricalAssignmentService(
            self.db
        ).mark_assignments_stale_for_objects(
            project_id,
            unique_ids,
            reason=reason,
        )
        if stale_count:
            await self.db.flush()
        return stale_count
