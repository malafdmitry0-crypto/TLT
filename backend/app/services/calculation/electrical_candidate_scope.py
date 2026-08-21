"""Exact electrical-variant scoping for candidate reads."""

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.electrical_candidate import ElectricalCandidate


class ElectricalCandidateScopeService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def list(
        self,
        project_id: UUID,
        *,
        object_id: UUID | None = None,
        electrical_variant_id: UUID,
    ) -> list[ElectricalCandidate]:
        filters = [ElectricalCandidate.project_id == project_id]
        if object_id is not None:
            filters.append(ElectricalCandidate.object_id == object_id)
        filters.append(ElectricalCandidate.electrical_variant_id == electrical_variant_id)
        result = await self.db.execute(
            select(ElectricalCandidate)
            .where(*filters)
            .order_by(
                ElectricalCandidate.object_id,
                ElectricalCandidate.is_applied.desc(),
                ElectricalCandidate.is_recommended.desc(),
                ElectricalCandidate.priority.desc(),
                ElectricalCandidate.created_at.desc(),
            )
        )
        return list(result.scalars().all())
