"""Application composition root for calculation use cases."""

from sqlalchemy.ext.asyncio import AsyncSession

from app.services.calculation.coefficient_provider import CorrectionCoefficientProvider
from app.services.calculation.electrical_batch import ElectricalBatchCalculationService
from app.services.calculation.electrical_candidate_apply import ElectricalCandidateApplyService
from app.services.calculation.electrical_candidate_folders import (
    ElectricalCandidateFolderService,
)
from app.services.calculation.electrical_candidate_scope import ElectricalCandidateScopeService
from app.services.calculation.electrical_candidates import ElectricalCandidateService
from app.services.calculation.electrical_failures import ElectricalFailureService
from app.services.calculation.electrical_options import ElectricalCableOptionsService
from app.services.calculation.electrical_repository import ElectricalCalculationRepository
from app.services.calculation.electrical_single import ElectricalSingleCalculationService
from app.services.calculation.electrical_snapshots import ElectricalSnapshotService
from app.services.calculation.electrical_staleness import ElectricalStalenessService
from app.services.calculation.electrical_summary import ElectricalSummaryQuery
from app.services.calculation.electrical_tt_context import ElectricalTTContext
from app.services.calculation.electrical_tt_inputs import ElectricalInputMapper
from app.services.calculation.electrical_tt_preparation import (
    ElectricalTTPreparationService,
)
from app.services.calculation.heat_batch import HeatBatchCalculationService
from app.services.calculation.heat_calculation import HeatCalculationService


class CalculationContainer:
    """Wire cohesive services once for a request, task or batch transaction."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.coefficients = CorrectionCoefficientProvider(db)
        self.heat = HeatCalculationService(self.coefficients.get)
        self.electrical_staleness = ElectricalStalenessService(db)
        self.heat_batch = HeatBatchCalculationService(
            db,
            load_coefficients=self.coefficients.get,
            try_recalculate=self.heat.try_recalculate,
            mark_electrical_stale=self.electrical_staleness.mark_for_objects,
        )

        self.tt_context = ElectricalTTContext(db)
        self.electrical_inputs = ElectricalInputMapper()
        self.electrical_repository = ElectricalCalculationRepository(db)
        self.electrical_failures = ElectricalFailureService(
            db,
            self.electrical_repository,
            self.tt_context,
        )
        self.tt_preparation = ElectricalTTPreparationService(
            self.tt_context,
            self.electrical_inputs,
        )
        self.electrical_snapshots = ElectricalSnapshotService(
            self.tt_context._tt_calculation_catalogs,
            lambda: self.tt_context._tt_calculation_catalogs_cache,
        )
        self.electrical_summary = ElectricalSummaryQuery(db, self.electrical_snapshots)
        self.electrical_single = ElectricalSingleCalculationService(
            db,
            context=self.tt_context,
            inputs=self.electrical_inputs,
            preparation=self.tt_preparation,
            snapshots=self.electrical_snapshots,
            repository=self.electrical_repository,
            failures=self.electrical_failures,
        )
        self.electrical_batch = ElectricalBatchCalculationService(
            db,
            context=self.tt_context,
            inputs=self.electrical_inputs,
            preparation=self.tt_preparation,
            snapshots=self.electrical_snapshots,
            repository=self.electrical_repository,
            failures=self.electrical_failures,
        )
        self.candidate_scope = ElectricalCandidateScopeService(db)
        self.electrical_candidates = ElectricalCandidateService(
            db,
            scope=self.candidate_scope,
            inputs=self.electrical_inputs,
            preparation=self.tt_preparation,
            snapshots=self.electrical_snapshots,
        )
        self.candidate_apply = ElectricalCandidateApplyService(
            db,
            scope=self.candidate_scope,
            candidates=self.electrical_candidates,
            single=self.electrical_single,
        )
        self.candidate_folders = ElectricalCandidateFolderService(
            db,
            scope=self.candidate_scope,
            load_object=self.electrical_candidates._load_candidate_object,
            get_candidate=self.electrical_candidates.get_electrical_candidate,
            lock_project=self.candidate_apply._lock_project_for_candidate_apply,
        )
        self.cable_options = ElectricalCableOptionsService(
            db,
            self.tt_context,
            self.electrical_inputs,
        )
