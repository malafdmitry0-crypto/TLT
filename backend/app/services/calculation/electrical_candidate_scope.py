"""Exact electrical-variant scoping for candidate reads."""

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.electrical_candidate import ElectricalCandidate
from app.models.electrical_candidate_folder import ElectricalCandidateFolder
from app.services.electrical_assignment_service import ElectricalAssignmentServiceError


class ElectricalCandidateScopeService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def require_clean(
        self,
        project_id: UUID,
        *,
        variant_number: int,
        electrical_variant_id: UUID,
        object_id: UUID | None,
        include_candidates: bool = True,
        include_folders: bool = True,
    ) -> None:
        candidate_ids: list[UUID] = []
        folder_ids: list[UUID] = []
        if include_candidates:
            candidate_filters = [
                ElectricalCandidate.project_id == project_id,
                ElectricalCandidate.variant_number == variant_number,
                ElectricalCandidate.electrical_variant_id.is_distinct_from(electrical_variant_id),
            ]
            if object_id is not None:
                candidate_filters.append(ElectricalCandidate.object_id == object_id)
            candidate_ids = list(
                (
                    await self.db.execute(select(ElectricalCandidate.id).where(*candidate_filters))
                ).scalars()
            )
        if include_folders:
            folder_filters = [
                ElectricalCandidateFolder.project_id == project_id,
                ElectricalCandidateFolder.variant_number == variant_number,
                ElectricalCandidateFolder.electrical_variant_id.is_distinct_from(
                    electrical_variant_id
                ),
            ]
            if object_id is not None:
                folder_filters.append(ElectricalCandidateFolder.object_id == object_id)
            folder_ids = list(
                (
                    await self.db.execute(
                        select(ElectricalCandidateFolder.id).where(*folder_filters)
                    )
                ).scalars()
            )
        if candidate_ids or folder_ids:
            raise ElectricalAssignmentServiceError(
                "ELECTRICAL_ASSIGNMENT_DOWNSTREAM_SCOPE_CONFLICT",
                "Обнаружены кандидаты или папки без точной привязки к выбранному ЭР",
                status_code=409,
                details={
                    "electrical_variant_id": str(electrical_variant_id),
                    "candidate_ids": [str(item) for item in candidate_ids],
                    "folder_ids": [str(item) for item in folder_ids],
                },
            )

    async def list(
        self,
        project_id: UUID,
        *,
        object_id: UUID | None = None,
        variant_number: int | None = None,
        electrical_variant_id: UUID | None = None,
    ) -> list[ElectricalCandidate]:
        filters = [ElectricalCandidate.project_id == project_id]
        if object_id is not None:
            filters.append(ElectricalCandidate.object_id == object_id)
        if variant_number is not None:
            filters.append(ElectricalCandidate.variant_number == variant_number)
        if electrical_variant_id is not None:
            if variant_number is None:
                raise ElectricalAssignmentServiceError(
                    "ELECTRICAL_VARIANT_SELECTOR_REQUIRED",
                    "variant_number обязателен вместе с UUID ЭР",
                    status_code=422,
                )
            await self.require_clean(
                project_id,
                variant_number=variant_number,
                electrical_variant_id=electrical_variant_id,
                object_id=object_id,
                include_folders=False,
            )
            filters.append(ElectricalCandidate.electrical_variant_id == electrical_variant_id)
        result = await self.db.execute(
            select(ElectricalCandidate)
            .where(*filters)
            .order_by(
                ElectricalCandidate.object_id,
                ElectricalCandidate.variant_number,
                ElectricalCandidate.is_applied.desc(),
                ElectricalCandidate.is_recommended.desc(),
                ElectricalCandidate.priority.desc(),
                ElectricalCandidate.created_at.desc(),
            )
        )
        return list(result.scalars().all())
