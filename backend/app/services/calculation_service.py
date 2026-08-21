"""Deprecated compatibility facade over cohesive calculation use cases."""

from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.electrical_calculation import ElectricalCalculation
from app.models.electrical_candidate import ElectricalCandidate
from app.models.electrical_candidate_folder import ElectricalCandidateFolder
from app.models.electrical_variant import ElectricalVariantObject
from app.models.project_object import ProjectObject
from app.result import Result
from app.schemas.calculation import (
    ElectricalCableSelectionRequest,
    ElectricalCalcSummary,
    ElectricalRequest,
)
from app.schemas.json_shapes import HeatLossResultDict
from app.schemas.project import ProjectObjectsPageInfo
from app.services.calculation.batch_execution import BatchCancelChecker as BatchCancelChecker
from app.services.calculation.container import CalculationContainer
from app.services.calculation.contracts import (
    BatchProgress as BatchProgress,
)
from app.services.calculation.contracts import (
    CancelChecker,
    ProgressCallback,
)
from app.services.calculation.errors import (
    BatchCancelledError as BatchCancelledError,
)
from app.services.calculation.errors import (
    ElectricalCalcConcurrencyError as ElectricalCalcConcurrencyError,
)
from app.services.calculation.errors import (
    ElectricalCandidateApplyError as ElectricalCandidateApplyError,
)
from app.services.calculation_errors import CalculationError as CalculationError
from app.services.project_object_params import StoredHeatParams

CableSource = str


class CalculationService:
    """Compatibility only; new code must use CalculationContainer."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        services = CalculationContainer(db)
        self._services = services
        self._coefficient_provider = services.coefficients
        self._heat_calculation = services.heat
        self._electrical_staleness = services.electrical_staleness
        self._heat_batch = services.heat_batch
        self._tt_context = services.tt_context
        self._electrical_inputs = services.electrical_inputs
        self._electrical_repository = services.electrical_repository
        self._electrical_failures = services.electrical_failures
        self._tt_preparation = services.tt_preparation
        self._electrical_snapshots = services.electrical_snapshots
        self._electrical_summary = services.electrical_summary
        self._electrical_single = services.electrical_single
        self._candidate_scope = services.candidate_scope
        self._electrical_candidates = services.electrical_candidates
        self._candidate_apply = services.candidate_apply
        self._candidate_folders = services.candidate_folders
        self._electrical_batch = services.electrical_batch
        self._cable_options = services.cable_options
        # Preserve monkeypatch-based compatibility without coupling production
        # components back to this facade.
        self._heat_calculation._load_coefficients = lambda: self.get_coefficients()
        self._heat_batch._load_coefficients = lambda: self.get_coefficients()
        self._heat_batch._try_recalculate = lambda obj, **kwargs: self.try_recalculate(
            obj, **kwargs
        )
        self._heat_batch._mark_electrical_stale = (
            lambda project_id, object_ids, **kwargs: self.mark_electrical_calculations_stale(
                project_id,
                object_ids,
                **kwargs,
            )
        )

    async def electrical_calc_summaries(
        self,
        calculations: list[ElectricalCalculation],
        catalog_source: CableSource = "builtin",
    ) -> list[ElectricalCalcSummary]:
        return await self._electrical_summary.electrical_calc_summaries(
            calculations,
            catalog_source,
        )

    async def cable_snapshot_statuses(
        self,
        calculations: list[ElectricalCalculation],
        catalog_source: CableSource = "builtin",
    ) -> dict[UUID, dict[str, Any]]:
        return await self._electrical_snapshots.statuses(calculations, catalog_source)

    async def electrical_project_page(
        self,
        project_id: UUID,
        *,
        variant_number: int | None = 1,
        electrical_variant_id: UUID | None = None,
        page: int = 1,
        page_size: int = 50,
    ) -> tuple[
        list[ProjectObject], list[ElectricalCalculation], dict[str, Any], ProjectObjectsPageInfo
    ]:
        return await self._electrical_summary.electrical_project_page(
            project_id,
            variant_number=variant_number,
            electrical_variant_id=electrical_variant_id,
            page=page,
            page_size=page_size,
        )

    async def get_coefficients(self) -> dict[str, float]:
        return await self._coefficient_provider.get()

    async def calc_heat_loss(
        self,
        object_type: str,
        data: dict[str, Any],
    ) -> HeatLossResultDict:
        return await self._heat_calculation.calculate(object_type, data)

    def _calc_heat_loss_with_coefficients(
        self,
        object_type: str,
        data: dict[str, Any],
        coefficients: dict[str, float],
        *,
        apply_climate_policy: bool = True,
        validated_params: StoredHeatParams | None = None,
    ) -> HeatLossResultDict:
        return self._heat_calculation.calculate_with_coefficients(
            object_type,
            data,
            coefficients,
            apply_climate_policy=apply_climate_policy,
            validated_params=validated_params,
        )

    async def recalculate_object(self, obj: ProjectObject) -> ProjectObject:
        return await self._heat_calculation.recalculate(obj)

    async def mark_electrical_calculations_stale(
        self,
        project_id: UUID,
        object_ids: list[UUID] | set[UUID] | tuple[UUID, ...],
        *,
        reason: str = "heat_loss_changed",
    ) -> int:
        return await self._electrical_staleness.mark_for_objects(
            project_id,
            object_ids,
            reason=reason,
        )

    async def mark_project_specifications_stale(
        self,
        project_id: UUID,
        reason: str,
        *,
        object_ids: list[UUID] | set[UUID] | tuple[UUID, ...] | None = None,
        operation: str | None = None,
    ) -> int:
        from app.services.specification_service import SpecificationService

        return await SpecificationService(self.db).mark_project_specifications_stale(
            project_id,
            reason,
            object_ids=object_ids,
            operation=operation,
        )

    async def try_recalculate(
        self,
        obj: ProjectObject,
        *,
        coefficients: dict[str, float] | None = None,
    ) -> Result[ProjectObject, str]:
        return await self._heat_calculation.try_recalculate(obj, coefficients=coefficients)

    async def batch_recalculate(
        self,
        project_id: UUID,
        progress_callback: ProgressCallback | None = None,
        should_cancel: CancelChecker | None = None,
        object_ids: list[UUID] | None = None,
        *,
        commit: bool = True,
    ) -> tuple[int, int, list[dict[str, Any]]]:
        return await self._heat_batch.recalculate(
            project_id,
            progress_callback,
            should_cancel,
            object_ids,
            commit=commit,
        )

    async def calc_electrical(
        self,
        request: ElectricalRequest,
        *,
        commit: bool = True,
        electrical_variant_id: UUID | None = None,
    ) -> ElectricalCalculation:
        return await self._electrical_single.calculate(
            request,
            commit=commit,
            electrical_variant_id=electrical_variant_id,
        )

    async def list_electrical_candidates(
        self,
        project_id: UUID,
        *,
        object_id: UUID | None = None,
        variant_number: int | None = None,
        electrical_variant_id: UUID | None = None,
    ) -> list[ElectricalCandidate]:
        return await self._candidate_scope.list(
            project_id,
            object_id=object_id,
            variant_number=variant_number,
            electrical_variant_id=electrical_variant_id,
        )

    async def list_electrical_candidate_folders(
        self,
        project_id: UUID,
        *,
        object_id: UUID,
        variant_number: int,
        electrical_variant_id: UUID | None = None,
    ) -> list[dict[str, Any]]:
        return await self._candidate_folders.list_electrical_candidate_folders(
            project_id,
            object_id=object_id,
            variant_number=variant_number,
            electrical_variant_id=electrical_variant_id,
        )

    async def create_electrical_candidate_folder(
        self,
        *,
        project_id: UUID,
        object_id: UUID,
        variant_number: int,
        electrical_variant_id: UUID | None = None,
        name: str,
        color: str | None,
        created_by_user_id: UUID | None,
        created_by_session_id: str | None,
    ) -> dict[str, Any]:
        return await self._candidate_folders.create_electrical_candidate_folder(
            project_id=project_id,
            object_id=object_id,
            variant_number=variant_number,
            electrical_variant_id=electrical_variant_id,
            name=name,
            color=color,
            created_by_user_id=created_by_user_id,
            created_by_session_id=created_by_session_id,
        )

    async def get_electrical_candidate_folder(
        self,
        folder_id: UUID,
    ) -> ElectricalCandidateFolder:
        return await self._candidate_folders.get_electrical_candidate_folder(folder_id)

    async def update_electrical_candidate_folder(
        self,
        folder_id: UUID,
        **updates: Any,
    ) -> dict[str, Any]:
        return await self._candidate_folders.update_electrical_candidate_folder(
            folder_id,
            **updates,
        )

    async def delete_electrical_candidate_folder(self, folder_id: UUID) -> None:
        await self._candidate_folders.delete_electrical_candidate_folder(folder_id)

    async def add_electrical_candidate_to_folder(
        self,
        *,
        folder_id: UUID,
        candidate_id: UUID,
    ) -> dict[str, Any]:
        return await self._candidate_folders.add_electrical_candidate_to_folder(
            folder_id=folder_id,
            candidate_id=candidate_id,
        )

    async def remove_electrical_candidate_from_folder(
        self,
        *,
        folder_id: UUID,
        candidate_id: UUID,
    ) -> dict[str, Any]:
        return await self._candidate_folders.remove_electrical_candidate_from_folder(
            folder_id=folder_id,
            candidate_id=candidate_id,
        )

    async def create_electrical_candidate(
        self,
        *,
        project_id: UUID,
        object_id: UUID,
        variant_number: int = 1,
        electrical_variant_id: UUID | None = None,
        cable_type: str = "self_regulating_tt",
        cable_source: CableSource = "builtin",
        mode: str = "auto",
        cable_mark: str | None = None,
        electrical_params: dict[str, Any] | None = None,
    ) -> tuple[ElectricalCandidate, str]:
        return await self._electrical_candidates.create_electrical_candidate(
            project_id=project_id,
            object_id=object_id,
            variant_number=variant_number,
            electrical_variant_id=electrical_variant_id,
            cable_type=cable_type,
            cable_source=cable_source,
            mode=mode,
            cable_mark=cable_mark,
            electrical_params=electrical_params,
        )

    async def update_electrical_candidate(
        self,
        candidate_id: UUID,
        *,
        priority: int | None = None,
        is_recommended: bool | None = None,
        is_pinned: bool | None = None,
        status: str | None = None,
        engineer_comment: str | None = None,
    ) -> ElectricalCandidate:
        return await self._electrical_candidates.update_electrical_candidate(
            candidate_id,
            priority=priority,
            is_recommended=is_recommended,
            is_pinned=is_pinned,
            status=status,
            engineer_comment=engineer_comment,
        )

    async def get_electrical_candidate(self, candidate_id: UUID) -> ElectricalCandidate:
        return await self._electrical_candidates.get_electrical_candidate(candidate_id)

    async def apply_electrical_candidate(
        self,
        candidate_id: UUID,
        *,
        project_id: UUID,
    ) -> tuple[ElectricalCandidate, ElectricalCalculation]:
        return await self._candidate_apply.apply_electrical_candidate(
            candidate_id,
            project_id=project_id,
        )

    async def unapply_electrical_candidate(
        self,
        candidate_id: UUID,
    ) -> ElectricalCandidate:
        return await self._candidate_apply.unapply_electrical_candidate(candidate_id)

    async def select_cable_for_assignment(
        self,
        *,
        project_id: UUID,
        electrical_variant_id: UUID,
        object_id: UUID,
        data: ElectricalCableSelectionRequest,
    ) -> tuple[ElectricalCalculation, ElectricalVariantObject, ProjectObject]:
        return await self._electrical_single.select_cable_for_assignment(
            project_id=project_id,
            electrical_variant_id=electrical_variant_id,
            object_id=object_id,
            data=data,
        )

    async def select_cable_manual(
        self,
        object_id: UUID,
        cable_mark: str,
        cable_source: CableSource = "builtin",
        variant_number: int = 1,
        cable_type: str = "self_regulating_tt",
        electrical_params: dict[str, Any] | None = None,
        *,
        commit: bool = True,
        electrical_variant_id: UUID | None = None,
    ) -> ElectricalCalculation:
        return await self._electrical_single.select_cable_manual(
            object_id,
            cable_mark,
            cable_source,
            variant_number,
            cable_type,
            electrical_params,
            commit=commit,
            electrical_variant_id=electrical_variant_id,
        )

    async def batch_calc_electrical(
        self,
        project_id: UUID,
        cable_source: CableSource = "builtin",
        variant_number: int = 1,
        cable_type: str = "self_regulating_tt",
        electrical_params: dict[str, Any] | None = None,
        skip_manual: bool = True,
        return_calcs: bool = True,
        progress_callback: ProgressCallback | None = None,
        should_cancel: CancelChecker | None = None,
        object_ids: list[UUID] | None = None,
        object_overrides: list[dict[str, Any]] | None = None,
        force_cable_type: bool = False,
        electrical_variant_id: UUID | None = None,
        *,
        commit: bool = True,
    ) -> tuple[int, int, int, list[dict[str, Any]], list[ElectricalCalculation]]:
        return await self._electrical_batch.calculate(
            project_id,
            cable_source,
            variant_number,
            cable_type,
            electrical_params,
            skip_manual,
            return_calcs,
            progress_callback,
            should_cancel,
            object_ids,
            object_overrides,
            force_cable_type,
            electrical_variant_id,
            commit=commit,
        )

    async def get_cable_options(
        self,
        object_id: UUID,
        *,
        electrical_variant_id: UUID | None = None,
    ) -> list[dict[str, Any]]:
        return await self._cable_options.get(
            object_id,
            electrical_variant_id=electrical_variant_id,
        )
