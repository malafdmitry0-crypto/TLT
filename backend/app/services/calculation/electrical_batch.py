"""Chunked electrical calculation use case."""

import uuid
from typing import Any, cast
from uuid import UUID

from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import load_only

from app.core.database import use_fast_commit_for_current_transaction
from app.models.electrical_calculation import ElectricalCalculation
from app.models.electrical_variant import ElectricalVariant
from app.models.project_object import ProjectObject
from app.schemas.calculation import ElectricalRequest
from app.services.calculation.batch_execution import BatchCancelChecker, maybe_await
from app.services.calculation.contracts import BatchProgress, CancelChecker, ProgressCallback
from app.services.calculation.electrical_failures import ElectricalFailureService
from app.services.calculation.electrical_repository import ElectricalCalculationRepository
from app.services.calculation.electrical_snapshots import ElectricalSnapshotService
from app.services.calculation.electrical_sources import (
    CABLE_MARK_SOURCE_AUTO,
    CABLE_TYPE_SOURCE_AUTO,
    CABLE_TYPE_SOURCE_BULK,
    CABLE_TYPE_SOURCE_MANUAL,
    is_manual_cable_selection,
)
from app.services.calculation.electrical_sources import (
    existing_cable_type_source as resolve_existing_cable_type_source,
)
from app.services.calculation.electrical_tt_context import ElectricalTTContext
from app.services.calculation.electrical_tt_inputs import ElectricalInputMapper
from app.services.calculation.electrical_tt_preparation import ElectricalTTPreparationService
from app.services.calculation.errors import BatchCancelledError
from app.services.calculation_errors import CalculationError
from app.services.electrical_assignment_service import ElectricalAssignmentService
from app.services.electrical_error_guidance import build_electrical_error_payload

CableSource = str
BATCH_ELECTRICAL_CHUNK_SIZE = 2_000


class ElectricalBatchCalculationService:
    """Own chunking, progress, cancellation and transaction for a batch."""

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

    async def _electrical_batch_counts(
        self,
        project_id: UUID,
        *,
        object_ids: list[UUID] | None = None,
    ) -> tuple[int, int]:
        filters = [ProjectObject.project_id == project_id]
        if object_ids is not None:
            filters.append(ProjectObject.id.in_(object_ids))
        row = (
            await self.db.execute(
                select(
                    func.count(ProjectObject.id),
                    func.count(ProjectObject.id).filter(
                        ProjectObject.is_valid == True,  # noqa: E712
                    ),
                ).where(*filters)
            )
        ).one()
        return int(row[0] or 0), int(row[1] or 0)

    async def _validate_project_object_ids(
        self,
        project_id: UUID,
        object_ids: list[UUID] | None,
    ) -> list[UUID] | None:
        if object_ids is None:
            return None
        normalized = list(dict.fromkeys(object_ids))
        if not normalized:
            raise CalculationError("Список выбранных объектов не должен быть пустым")
        result = await self.db.execute(
            select(ProjectObject.id).where(
                ProjectObject.project_id == project_id,
                ProjectObject.id.in_(normalized),
            )
        )
        found_ids = set(result.scalars().all())
        if len(found_ids) != len(normalized):
            raise CalculationError("Все выбранные объекты должны принадлежать проекту")
        return normalized

    async def _validate_electrical_object_overrides(
        self,
        project_id: UUID,
        object_overrides: list[dict[str, Any]] | None,
        *,
        object_ids: list[UUID] | None,
    ) -> dict[UUID, dict[str, Any]]:
        if not object_overrides:
            return {}

        normalized: dict[UUID, dict[str, Any]] = {}
        for item in object_overrides:
            object_id = item.get("object_id")
            if object_id is None:
                raise CalculationError("В переопределении не указан object_id")
            parsed_id = object_id if isinstance(object_id, UUID) else UUID(str(object_id))
            normalized[parsed_id] = {
                key: value
                for key, value in item.items()
                if key != "object_id" and value is not None
            }

        override_ids = list(normalized)
        if object_ids is not None and not set(override_ids).issubset(set(object_ids)):
            raise CalculationError("Переопределения должны относиться только к выбранным объектам")

        result = await self.db.execute(
            select(ProjectObject.id).where(
                ProjectObject.project_id == project_id,
                ProjectObject.id.in_(override_ids),
            )
        )
        found_ids = set(result.scalars().all())
        if len(found_ids) != len(override_ids):
            raise CalculationError("Все переопределения должны принадлежать объектам проекта")
        return normalized

    async def _load_valid_project_object_chunk(
        self,
        project_id: UUID,
        *,
        limit: int,
        after_sort_order: int | None,
        after_id: UUID | None,
        object_ids: list[UUID] | None = None,
    ) -> list[ProjectObject]:
        filters = [
            ProjectObject.project_id == project_id,
            ProjectObject.is_valid == True,  # noqa: E712
        ]
        if object_ids is not None:
            filters.append(ProjectObject.id.in_(object_ids))
        if after_sort_order is not None and after_id is not None:
            filters.append(
                or_(
                    ProjectObject.sort_order > after_sort_order,
                    and_(
                        ProjectObject.sort_order == after_sort_order,
                        ProjectObject.id > after_id,
                    ),
                )
            )
        result = await self.db.execute(
            select(ProjectObject)
            .options(
                load_only(
                    ProjectObject.id,
                    ProjectObject.project_id,
                    ProjectObject.object_type,
                    ProjectObject.sort_order,
                    ProjectObject.params,
                    ProjectObject.results,
                    ProjectObject.is_valid,
                    ProjectObject.version,
                )
            )
            .where(*filters)
            .order_by(ProjectObject.sort_order, ProjectObject.id)
            .limit(limit)
        )
        return list(result.scalars().all())

    async def _load_existing_electrical_by_object_id(
        self,
        project_id: UUID,
        *,
        variant_number: int,
        object_ids: list[UUID],
        electrical_variant_id: UUID | None = None,
    ) -> dict[UUID, ElectricalCalculation]:
        return await self.repository.load_existing_by_object_id(
            project_id,
            variant_number=variant_number,
            object_ids=object_ids,
            electrical_variant_id=electrical_variant_id,
        )

    async def calculate(
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
        """Автоподбор кабеля для всех валидных объектов проекта (cable_mark=None)."""

        async def emit_progress(progress: BatchProgress) -> None:
            if progress_callback is not None:
                await maybe_await(progress_callback(progress))

        cancel_checker = BatchCancelChecker(should_cancel)

        assignment_service = ElectricalAssignmentService(self.db)
        if electrical_variant_id is not None and object_ids is None:
            object_ids = await assignment_service.assignment_object_ids_for_system(
                project_id,
                electrical_variant_id,
                cable_type,
            )
            if not object_ids:
                await emit_progress(BatchProgress(current=0, total=0, phase="done"))
                return 0, 0, 0, [], []
        object_ids = await self._validate_project_object_ids(project_id, object_ids)
        object_overrides_by_id = await self._validate_electrical_object_overrides(
            project_id,
            object_overrides,
            object_ids=object_ids,
        )
        if electrical_variant_id is not None and object_ids is not None:
            existing_scope = await self._load_existing_electrical_by_object_id(
                project_id,
                variant_number=variant_number,
                object_ids=object_ids,
                electrical_variant_id=electrical_variant_id,
            )
            requested_cable_types: dict[UUID, str] = {}
            for object_id in object_ids:
                override_type = object_overrides_by_id.get(object_id, {}).get("cable_type")
                existing = existing_scope.get(object_id)
                requested_cable_types[object_id] = str(
                    cable_type
                    if force_cable_type
                    else override_type
                    or (existing.cable_type if existing is not None else cable_type)
                )
            await assignment_service.validate_supported_assignment_objects(
                project_id,
                electrical_variant_id,
                requested_cable_types,
                lock_project=True,
            )
        # Считаем общее количество объектов в области пересчёта — чтобы сообщить фронту,
        # сколько объектов исключено из-за ошибок теплопотерь.
        total_count, total_valid = await self._electrical_batch_counts(
            project_id,
            object_ids=object_ids,
        )
        heat_loss_failed = total_count - total_valid
        calculated = 0
        skipped = 0
        errors: list[dict[str, Any]] = []
        calcs: list[ElectricalCalculation] = []
        base_overrides = self.inputs._base_overrides_with_sources(electrical_params or {})
        processed = 0
        last_sort_order: int | None = None
        last_id: UUID | None = None

        await emit_progress(
            BatchProgress(
                current=0,
                total=total_valid,
                phase="prepare",
                heat_loss_failed=heat_loss_failed,
            )
        )
        await cancel_checker.check(processed, force=True)

        while processed < total_valid:
            objects = await self._load_valid_project_object_chunk(
                project_id,
                limit=BATCH_ELECTRICAL_CHUNK_SIZE,
                after_sort_order=last_sort_order,
                after_id=last_id,
                object_ids=object_ids,
            )
            if not objects:
                break
            last_sort_order = objects[-1].sort_order
            last_id = objects[-1].id
            existing_by_object_id = await self._load_existing_electrical_by_object_id(
                project_id,
                variant_number=variant_number,
                object_ids=[obj.id for obj in objects],
                electrical_variant_id=electrical_variant_id,
            )
            await self.context._prefetch_tt_assignments(
                project_id,
                electrical_variant_id,
                [obj.id for obj in objects],
            )
            successful_rows: list[dict[str, Any]] = []

            for obj in objects:
                await cancel_checker.check(processed)
                request_data: dict[str, Any] | None = None
                object_cable_type = cable_type
                cable_type_source = CABLE_TYPE_SOURCE_AUTO
                try:
                    existing_calc = existing_by_object_id.get(obj.id)
                    existing_cable_type_source = resolve_existing_cable_type_source(existing_calc)
                    object_override = object_overrides_by_id.get(obj.id, {})
                    if force_cable_type:
                        object_cable_type = cable_type
                        cable_type_source = CABLE_TYPE_SOURCE_BULK
                    elif object_override.get("cable_type"):
                        object_cable_type = object_override["cable_type"]
                        cable_type_source = CABLE_TYPE_SOURCE_MANUAL
                    else:
                        object_cable_type = (
                            existing_calc.cable_type if existing_calc is not None else cable_type
                        )
                        cable_type_source = existing_cable_type_source
                    if (
                        skip_manual
                        and existing_calc is not None
                        and is_manual_cable_selection(existing_calc)
                    ):
                        skipped += 1
                        continue
                    overrides = dict(base_overrides)
                    request_data = self.inputs._build_electrical_data(
                        obj=obj,
                        cable_type=object_cable_type,
                        cable_mark=None,
                        overrides=overrides,
                    )
                    request_data["cable_source"] = cable_source
                    request_data["cable_type_source"] = cable_type_source
                    request_data["cable_mark_source"] = CABLE_MARK_SOURCE_AUTO
                    request = ElectricalRequest(
                        object_id=obj.id,
                        cable_type=cast(Any, object_cable_type),
                        variant_number=variant_number,
                        data=request_data,
                    )
                    prepared_tt_calculation = (
                        await self.preparation._prepare_self_regulating_tt_request(
                            request,
                            obj,
                            electrical_variant_id=electrical_variant_id,
                        )
                    )
                    cable_mark, result_dict = self.inputs._calculate_electrical_result(
                        request,
                        prepared_tt_calculation,
                    )
                    cable_snapshot = self.snapshots.build_for_result(
                        request=request,
                        cable_mark=cable_mark,
                        result_dict=result_dict,
                    )
                    successful_rows.append(
                        {
                            "id": existing_calc.id if existing_calc is not None else uuid.uuid4(),
                            "project_id": obj.project_id,
                            "object_id": obj.id,
                            "variant_number": request.variant_number,
                            "electrical_variant_id": electrical_variant_id,
                            "cable_type": request.cable_type,
                            "cable_type_source": cable_type_source,
                            "cable_mark": cable_mark,
                            "cable_mark_source": CABLE_MARK_SOURCE_AUTO,
                            "cable_snapshot": cable_snapshot,
                            "params": request.data,
                            "results": result_dict,
                        }
                    )
                    calculated += 1
                except BatchCancelledError:
                    raise
                except Exception as exc:
                    skipped += 1
                    error_request_data = dict(obj.params or {})
                    if request_data:
                        error_request_data.update(request_data)
                    errors.append(
                        {
                            "object_id": str(obj.id),
                            **build_electrical_error_payload(
                                exc,
                                object_type=obj.object_type,
                                object_name=(obj.params or {}).get("name"),
                                cable_type=object_cable_type,
                                request_data=error_request_data,
                            ),
                        }
                    )
                    await self.failures.upsert(
                        obj,
                        exc,
                        variant_number,
                        object_cable_type,
                        cable_type_source=cable_type_source,
                        request_data=error_request_data,
                        electrical_variant_id=electrical_variant_id,
                    )
                finally:
                    processed += 1
                    await emit_progress(
                        BatchProgress(
                            current=processed,
                            total=total_valid,
                            phase="calculate",
                            calculated=calculated,
                            skipped=skipped,
                            heat_loss_failed=heat_loss_failed,
                            object_id=obj.id,
                        )
                    )

            await cancel_checker.check(processed, force=True)
            calcs.extend(
                await self.repository.bulk_upsert(
                    successful_rows,
                    return_calcs=return_calcs,
                )
            )
            await self.db.flush()

        await cancel_checker.check(processed, force=True)
        await emit_progress(
            BatchProgress(
                current=processed,
                total=total_valid,
                phase="commit",
                calculated=calculated,
                skipped=skipped,
                heat_loss_failed=heat_loss_failed,
            )
        )
        if commit:
            await use_fast_commit_for_current_transaction(self.db)
            await self.db.commit()
        else:
            await self.db.flush()
        await emit_progress(
            BatchProgress(
                current=total_valid,
                total=total_valid,
                phase="done",
                calculated=calculated,
                skipped=skipped,
                heat_loss_failed=heat_loss_failed,
            )
        )

        return calculated, skipped, heat_loss_failed, errors, calcs

    async def calculate_for_variant(
        self,
        project_id: UUID,
        electrical_variant_id: UUID,
        cable_source: CableSource = "builtin",
        cable_type: str = "self_regulating_tt",
        electrical_params: dict[str, Any] | None = None,
        skip_manual: bool = True,
        return_calcs: bool = True,
        progress_callback: ProgressCallback | None = None,
        should_cancel: CancelChecker | None = None,
        object_ids: list[UUID] | None = None,
        object_overrides: list[dict[str, Any]] | None = None,
        force_cable_type: bool = False,
    ) -> tuple[int, int, int, list[dict[str, Any]], list[ElectricalCalculation]]:
        """Run a batch through the UUID-only application boundary."""
        variant = await self.db.scalar(
            select(ElectricalVariant).where(
                ElectricalVariant.id == electrical_variant_id,
                ElectricalVariant.project_id == project_id,
            )
        )
        if variant is None or variant.legacy_variant_number is None:
            raise CalculationError("ELECTRICAL_VARIANT_NOT_FOUND")
        return await self.calculate(
            project_id,
            cable_source,
            variant.legacy_variant_number,
            cable_type,
            electrical_params,
            skip_manual=skip_manual,
            return_calcs=return_calcs,
            progress_callback=progress_callback,
            should_cancel=should_cancel,
            object_ids=object_ids,
            object_overrides=object_overrides,
            force_cable_type=force_cable_type,
            electrical_variant_id=electrical_variant_id,
        )
