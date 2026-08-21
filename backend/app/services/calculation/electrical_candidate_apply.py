"""Apply and unapply electrical candidates atomically."""

from uuid import UUID

from sqlalchemy import and_, delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.electrical_calculation import ElectricalCalculation
from app.models.electrical_candidate import ElectricalCandidate
from app.models.electrical_variant import ElectricalVariant, ElectricalVariantObject
from app.models.project import Project
from app.services.calculation.electrical_candidate_scope import ElectricalCandidateScopeService
from app.services.calculation.electrical_candidates import ElectricalCandidateService
from app.services.calculation.electrical_single import ElectricalSingleCalculationService
from app.services.calculation.errors import ElectricalCandidateApplyError
from app.services.calculation_errors import CalculationError
from app.services.electrical_assignment_service import ElectricalAssignmentService

ELECTRICAL_CANDIDATE_STATUS_APPLICABLE = "applicable"
ELECTRICAL_CANDIDATE_STATUS_STALE = "stale"


class ElectricalCandidateApplyService:
    def __init__(
        self,
        db: AsyncSession,
        *,
        scope: ElectricalCandidateScopeService,
        candidates: ElectricalCandidateService,
        single: ElectricalSingleCalculationService,
    ) -> None:
        self.db = db
        self.scope = scope
        self.candidates = candidates
        self.single = single

    async def _lock_project_for_candidate_apply(self, project_id: UUID) -> None:
        """Serialize candidate apply with the ER lifecycle mutation lock."""
        result = await self.db.execute(
            select(Project)
            .where(Project.id == project_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        if result.scalar_one_or_none() is None:
            raise ElectricalCandidateApplyError(
                code="ELECTRICAL_CANDIDATE_NOT_FOUND",
                message="Кандидат подбора не найден",
                status_code=404,
            )

    async def _candidate_for_apply(
        self,
        candidate_id: UUID,
        project_id: UUID,
    ) -> ElectricalCandidate:
        result = await self.db.execute(
            select(ElectricalCandidate)
            .where(
                ElectricalCandidate.id == candidate_id,
                ElectricalCandidate.project_id == project_id,
            )
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        candidate = result.scalar_one_or_none()
        if candidate is None:
            raise ElectricalCandidateApplyError(
                code="ELECTRICAL_CANDIDATE_NOT_FOUND",
                message="Кандидат подбора не найден",
                status_code=404,
            )
        return candidate

    async def _existing_variant_for_candidate(
        self,
        candidate: ElectricalCandidate,
    ) -> ElectricalVariant:
        result = await self.db.execute(
            select(ElectricalVariant)
            .join(
                ElectricalVariantObject,
                and_(
                    ElectricalVariantObject.electrical_variant_id == ElectricalVariant.id,
                    ElectricalVariantObject.project_id == ElectricalVariant.project_id,
                ),
            )
            .where(
                ElectricalVariant.project_id == candidate.project_id,
                ElectricalVariant.id == candidate.electrical_variant_id,
                ElectricalVariantObject.object_id == candidate.object_id,
            )
        )
        variant = result.scalar_one_or_none()
        if variant is None or candidate.electrical_variant_id != variant.id:
            raise ElectricalCandidateApplyError(
                code="ELECTRICAL_CANDIDATE_VARIANT_UNAVAILABLE",
                message="ЭР кандидата удалён или больше не связан с объектом",
                status_code=409,
            )
        return variant

    async def apply_electrical_candidate(
        self,
        candidate_id: UUID,
        *,
        project_id: UUID,
    ) -> tuple[ElectricalCandidate, ElectricalCalculation]:
        try:
            await self._lock_project_for_candidate_apply(project_id)
            candidate = await self._candidate_for_apply(candidate_id, project_id)
            variant = await self._existing_variant_for_candidate(candidate)
            await ElectricalAssignmentService(self.db).require_supported_assignment(
                candidate.project_id,
                variant.id,
                candidate.object_id,
                requested_cable_type=candidate.cable_type,
                lock_project=False,
            )
            if candidate.status != ELECTRICAL_CANDIDATE_STATUS_APPLICABLE:
                raise CalculationError("Можно применить только применимый кандидат")
            if not candidate.cable_mark:
                raise CalculationError("У кандидата нет выбранной марки кабеля")

            # Кандидат хранит явные ТТ-входы вложенными в _tt_explicit_overrides;
            # select_cable_manual ждёт их плоскими — иначе строгий резолвер
            # теряет сохранённые значения и applicable-кандидат не применяется.
            apply_params = dict(candidate.params or {})
            stored_overrides = apply_params.pop("_tt_explicit_overrides", None)
            if isinstance(stored_overrides, dict):
                apply_params.update(stored_overrides)
            calc = await self.single.select_cable_manual(
                candidate.object_id,
                candidate.cable_mark,
                candidate.cable_source,
                None,
                candidate.cable_type,
                apply_params,
                commit=False,
                electrical_variant_id=variant.id,
            )
            await self.db.execute(
                update(ElectricalCandidate)
                .where(
                    ElectricalCandidate.project_id == candidate.project_id,
                    ElectricalCandidate.object_id == candidate.object_id,
                    ElectricalCandidate.electrical_variant_id == variant.id,
                )
                .values(is_applied=False)
            )
            candidate.is_applied = True
            candidate.status = ELECTRICAL_CANDIDATE_STATUS_APPLICABLE
            # Materialize server-managed fields while the project lock still
            # prevents a lifecycle delete from cascading these rows.
            await self.db.flush()
            await self.db.refresh(candidate)
            await self.db.refresh(calc)
            await self.db.commit()
        except Exception:
            await self.db.rollback()
            raise
        return candidate, calc

    async def unapply_electrical_candidate(self, candidate_id: UUID) -> ElectricalCandidate:
        candidate = await self.candidates.get_electrical_candidate(candidate_id)
        if not candidate.is_applied:
            return candidate
        try:
            await self._lock_project_for_candidate_apply(candidate.project_id)
            candidate = await self._candidate_for_apply(candidate_id, candidate.project_id)
            variant = await self._existing_variant_for_candidate(candidate)
            candidate.is_applied = False
            await self.db.execute(
                delete(ElectricalCalculation).where(
                    ElectricalCalculation.project_id == candidate.project_id,
                    ElectricalCalculation.object_id == candidate.object_id,
                    ElectricalCalculation.electrical_variant_id == variant.id,
                )
            )
            await ElectricalAssignmentService(self.db).mark_assignments_stale(
                candidate.project_id,
                variant.id,
                [candidate.object_id],
                reason="electrical_candidate_unapplied",
                operation="candidate_unapply",
            )
            await self.db.commit()
            await self.db.refresh(candidate)
            return candidate
        except Exception:
            await self.db.rollback()
            raise
