"""Single electrical calculation and cable-selection use cases."""

from typing import Any, cast
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.electrical_domain import ElectricalFormulaError
from app.models.electrical_calculation import ElectricalCalculation
from app.models.electrical_variant import ElectricalVariant, ElectricalVariantObject
from app.models.project import Project
from app.models.project_object import ProjectObject
from app.schemas.calculation import ElectricalCableSelectionRequest, ElectricalRequest
from app.services.calculation.electrical_failures import ElectricalFailureService
from app.services.calculation.electrical_repository import ElectricalCalculationRepository
from app.services.calculation.electrical_snapshots import ElectricalSnapshotService
from app.services.calculation.electrical_sources import (
    CABLE_MARK_SOURCE_AUTO,
    CABLE_MARK_SOURCE_MANUAL,
)
from app.services.calculation.electrical_tt_context import ElectricalTTContext
from app.services.calculation.electrical_tt_inputs import ElectricalInputMapper
from app.services.calculation.electrical_tt_preparation import ElectricalTTPreparationService
from app.services.calculation.errors import ElectricalCalcConcurrencyError
from app.services.calculation_errors import CalculationError
from app.services.electrical_assignment_service import (
    ElectricalAssignmentService,
    ElectricalAssignmentServiceError,
)
from app.services.electrical_input_resolver import ElectricalInputResolutionError

CableSource = str


class ElectricalSingleCalculationService:
    """Own locking and transaction boundaries for one electrical calculation."""

    def __init__(
        self,
        db: AsyncSession,
        *,
        context: ElectricalTTContext,
        inputs: ElectricalInputMapper,
        preparation: ElectricalTTPreparationService,
        snapshots: ElectricalSnapshotService,
        repository: ElectricalCalculationRepository,
        failures: ElectricalFailureService,
    ) -> None:
        self.db = db
        self.context = context
        self.inputs = inputs
        self.preparation = preparation
        self.snapshots = snapshots
        self.repository = repository
        self.failures = failures

    async def calculate(
        self,
        request: ElectricalRequest,
        *,
        commit: bool = True,
        electrical_variant_id: UUID | None = None,
    ) -> ElectricalCalculation:
        # Resolve the project first, then keep the shared project -> object lock
        # order used by ER/settings mutations.
        object_scope = await self.db.execute(
            select(ProjectObject.id, ProjectObject.project_id).where(
                ProjectObject.id == request.object_id
            )
        )
        scope_row = object_scope.one_or_none()
        if scope_row is None:
            raise CalculationError("Объект не найден")
        await self.db.execute(
            select(Project)
            .where(Project.id == scope_row.project_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        obj_result = await self.db.execute(
            select(ProjectObject)
            .where(ProjectObject.id == request.object_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        obj = obj_result.scalar_one_or_none()
        if obj is None:
            raise CalculationError("Объект не найден")
        if not obj.is_valid:
            raise CalculationError(
                "Теплопотери объекта не рассчитаны — электротехнический расчёт недоступен"
            )

        resolved_variant_id = electrical_variant_id or request.electrical_variant_id
        await self.context._assert_expected_assignment_version(
            obj,
            electrical_variant_id=resolved_variant_id,
            expected_assignment_version=request.expected_assignment_version,
        )
        try:
            self.inputs._hydrate_electrical_request_from_object(request, obj)
            prepared_tt_calculation = await self.preparation._prepare_self_regulating_tt_request(
                request,
                obj,
                electrical_variant_id=resolved_variant_id,
            )
            cable_mark, result_dict = self.inputs._calculate_electrical_result(
                request,
                prepared_tt_calculation,
            )
        except (ElectricalFormulaError, ElectricalInputResolutionError) as exc:
            if request.cable_type == "self_regulating_tt":
                await self.failures.upsert(
                    obj,
                    exc,
                    None,
                    request.cable_type,
                    cable_type_source=request.data.get("cable_type_source"),
                    cable_mark_source=request.data.get("cable_mark_source"),
                    request_data=request.data,
                    electrical_variant_id=resolved_variant_id,
                )
                if commit:
                    await self.db.commit()
            raise
        cable_snapshot = self.snapshots.build_for_result(
            request=request,
            cable_mark=cable_mark,
            result_dict=result_dict,
        )

        calc = await self.repository.upsert_one(
            obj=obj,
            request=request,
            cable_mark=cable_mark,
            result_dict=result_dict,
            cable_snapshot=cable_snapshot,
            electrical_variant_id=resolved_variant_id,
        )
        if not commit:
            return calc
        await self.db.commit()
        await self.db.refresh(calc)
        return calc

    async def _select_cable_for_object(
        self,
        obj: ProjectObject,
        *,
        cable_mark: str | None,
        cable_source: CableSource,
        variant_number: int | None,
        cable_type: str,
        electrical_params: dict[str, Any] | None,
        commit: bool,
        electrical_variant_id: UUID | None = None,
    ) -> ElectricalCalculation:
        """Выбор/автоподбор кабеля для одной пары объект+СО."""
        data = self.inputs._build_electrical_data(
            obj=obj,
            cable_type=cable_type,
            cable_mark=cable_mark,
            overrides=self.inputs._base_overrides_with_sources(electrical_params or {}),
        )
        data["cable_source"] = cable_source
        data["cable_mark_source"] = (
            CABLE_MARK_SOURCE_MANUAL if cable_mark else CABLE_MARK_SOURCE_AUTO
        )
        if electrical_variant_id is None:
            raise CalculationError("electrical_variant_id is required")
        request = ElectricalRequest(
            object_id=obj.id,
            cable_type=cast(Any, cable_type),
            electrical_variant_id=electrical_variant_id,
            data=data,
        )
        return await self.calculate(
            request,
            commit=commit,
            electrical_variant_id=electrical_variant_id,
        )

    async def select_cable_for_assignment(
        self,
        *,
        project_id: UUID,
        electrical_variant_id: UUID,
        object_id: UUID,
        data: ElectricalCableSelectionRequest,
    ) -> tuple[ElectricalCalculation, ElectricalVariantObject, ProjectObject]:
        """Atomically persist one ER assignment intent and its calculation."""
        try:
            project = (
                await self.db.execute(
                    select(Project)
                    .where(Project.id == project_id)
                    .with_for_update()
                    .execution_options(populate_existing=True)
                )
            ).scalar_one_or_none()
            if project is None:
                raise CalculationError("Проект не найден")
            variant = (
                await self.db.execute(
                    select(ElectricalVariant)
                    .where(
                        ElectricalVariant.project_id == project_id,
                        ElectricalVariant.id == electrical_variant_id,
                    )
                    .with_for_update()
                    .execution_options(populate_existing=True)
                )
            ).scalar_one_or_none()
            if variant is None:
                raise ElectricalAssignmentServiceError(
                    "ELECTRICAL_VARIANT_NOT_FOUND",
                    "ЭР не найден в указанном проекте",
                    status_code=404,
                    details={"electrical_variant_id": str(electrical_variant_id)},
                )
            obj = (
                await self.db.execute(
                    select(ProjectObject)
                    .where(
                        ProjectObject.project_id == project_id,
                        ProjectObject.id == object_id,
                    )
                    .with_for_update()
                    .execution_options(populate_existing=True)
                )
            ).scalar_one_or_none()
            if obj is None:
                raise CalculationError("Объект не найден")
            assignment = (
                await self.db.execute(
                    select(ElectricalVariantObject)
                    .where(
                        ElectricalVariantObject.project_id == project_id,
                        ElectricalVariantObject.electrical_variant_id == electrical_variant_id,
                        ElectricalVariantObject.object_id == object_id,
                    )
                    .with_for_update()
                    .execution_options(populate_existing=True)
                )
            ).scalar_one_or_none()
            if assignment is None:
                raise ElectricalAssignmentServiceError(
                    "ELECTRICAL_ASSIGNMENT_REQUIRED",
                    "Для выбранного объекта отсутствует assignment текущего ЭР",
                    status_code=409,
                    details={"object_id": str(object_id)},
                )
            if assignment.version != data.expected_assignment_version:
                raise ElectricalCalcConcurrencyError(
                    code="ELECTRICAL_ASSIGNMENT_VERSION_CONFLICT",
                    message="Assignment был изменён другим запросом; обновите данные",
                    details={
                        "conflicts": [
                            {
                                "object_id": str(object_id),
                                "expected_version": data.expected_assignment_version,
                                "current_version": assignment.version,
                            }
                        ]
                    },
                )
            if assignment.system_type != "self_regulating":
                raise ElectricalAssignmentServiceError(
                    "ELECTRICAL_ASSIGNMENT_SYSTEM_MISMATCH",
                    "Выбор TT-кабеля доступен только для объекта в системе Самрег",
                    status_code=409,
                    details={"object_id": str(object_id)},
                )
            await ElectricalAssignmentService(self.db).require_no_active_calculation_job(
                project_id,
                electrical_variant_id,
                object_id,
            )

            before = dict(assignment.electrical_overrides or {})
            after = dict(before)
            after["manual_cable_model"] = data.cable_mark if data.mode == "manual" else None
            if "thread_count" in data.model_fields_set or data.mode == "auto":
                after["thread_count"] = data.thread_count
            if "winding_pitch_mm" in data.model_fields_set:
                if data.winding_pitch_mm is None:
                    after.pop("winding_pitch_mm", None)
                else:
                    after["winding_pitch_mm"] = data.winding_pitch_mm
            if after != before:
                assignment.electrical_overrides = after
                assignment.version += 1

            self.context._tt_assignment_cache[(project_id, electrical_variant_id, object_id)] = (
                assignment
            )
            calc = await self._select_cable_for_object(
                obj,
                cable_mark=data.cable_mark if data.mode == "manual" else None,
                cable_source=data.cable_source,
                variant_number=None,
                cable_type="self_regulating_tt",
                electrical_params={"selection_policy": data.selection_policy},
                commit=False,
                electrical_variant_id=electrical_variant_id,
            )
            await self.db.commit()
            await self.db.refresh(assignment)
            await self.db.refresh(calc)
            return calc, assignment, obj
        except Exception:
            await self.db.rollback()
            raise

    async def _load_selectable_object(self, object_id: UUID) -> ProjectObject:
        obj_result = await self.db.execute(
            select(ProjectObject)
            .where(ProjectObject.id == object_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        obj = obj_result.scalar_one_or_none()
        if obj is None:
            raise CalculationError("Объект не найден")
        if not obj.is_valid or not obj.results:
            raise CalculationError("Теплопотери объекта не рассчитаны — невозможно выбрать кабель")
        return obj

    async def select_cable_manual(
        self,
        object_id: UUID,
        cable_mark: str,
        cable_source: CableSource = "builtin",
        variant_number: int | None = None,
        cable_type: str = "self_regulating_tt",
        electrical_params: dict[str, Any] | None = None,
        *,
        commit: bool = True,
        electrical_variant_id: UUID | None = None,
    ) -> ElectricalCalculation:
        """Ручной выбор кабеля: берёт параметры из объекта, пересчитывает, upsert."""
        obj = await self._load_selectable_object(object_id)
        return await self._select_cable_for_object(
            obj,
            cable_mark=cable_mark,
            cable_source=cable_source,
            variant_number=variant_number,
            cable_type=cable_type,
            electrical_params=electrical_params,
            commit=commit,
            electrical_variant_id=electrical_variant_id,
        )
