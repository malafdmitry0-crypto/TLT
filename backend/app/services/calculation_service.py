"""Сервис расчётов: теплопотери + электротехнический расчёт."""

import asyncio
import math
import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from inspect import isawaitable
from time import monotonic
from typing import Any, cast
from uuid import UUID

from sqlalchemy import Float, and_, func, or_, select
from sqlalchemy import cast as sa_cast
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import load_only

from app.core.database import use_fast_commit_for_current_transaction
from app.formulas.electrical.cable_geometry import compute_tank_cable_length
from app.formulas.electrical.resistive import calc_resistive_single_core, calc_resistive_three_core
from app.formulas.electrical.self_regulating import calc_self_regulating, calc_self_regulating_tt
from app.formulas.heat_loss.pipe import calc_pipe_heat_loss
from app.formulas.heat_loss.tank import calc_tank_heat_loss
from app.models.cable import CableExtended
from app.models.coefficient import CorrectionCoefficient
from app.models.electrical_calculation import ElectricalCalculation
from app.models.project_object import ProjectObject
from app.reference_data.loader import get_climate_by_city, list_resistive_cables, list_tlt_cables
from app.result import Err, Ok, Result
from app.schemas.calculation import (
    ElectricalRequest,
    PipeHeatLossParams,
    ResistiveSingleCoreParams,
    ResistiveThreeCoreParams,
    SelfRegulatingParams,
    SelfRegulatingTTParams,
    TankHeatLossParams,
)
from app.schemas.json_shapes import (
    HeatLossResultDict,
    PipeHeatLossResultDict,
    TankHeatLossResultDict,
)
from app.schemas.project import ProjectObjectsPageInfo
from app.services.electrical_error_guidance import build_electrical_error_payload
from app.services.project_object_params import prepare_project_object_params

# Источник каталога кабелей. Значения заданы для совместимости с текущим API;
# внутри функций валидируется через проверку, не enum (чтобы случайная строка
# попадала в default, а не падала).
CableSource = str  # "builtin" | "commercial" | "extended" | "all"


class CalculationError(Exception):
    pass


class BatchCancelledError(CalculationError):
    pass


@dataclass(frozen=True)
class BatchProgress:
    current: int
    total: int
    phase: str
    calculated: int = 0
    skipped: int = 0
    heat_loss_failed: int = 0
    object_id: UUID | None = None


ProgressCallback = Callable[[BatchProgress], Awaitable[None] | None]
CancelChecker = Callable[[], Awaitable[bool] | bool]

POSTGRES_BIND_PARAMETER_LIMIT = 32_767
ELECTRICAL_BULK_UPSERT_TARGET_CHUNK_SIZE = 2_000
BATCH_HEAT_RECALCULATE_CHUNK_SIZE = 2_000
BATCH_HEAT_RECALCULATE_YIELD_EVERY_OBJECTS = 25
BATCH_ELECTRICAL_CHUNK_SIZE = 2_000
BATCH_CANCEL_CHECK_MIN_OBJECTS = 500
BATCH_CANCEL_CHECK_MIN_INTERVAL_SECONDS = 0.5
CABLE_TYPE_SOURCE_AUTO = "auto"
CABLE_TYPE_SOURCE_MANUAL = "manual"
CABLE_TYPE_SOURCE_BULK = "bulk"
VALID_CABLE_TYPE_SOURCES = {
    CABLE_TYPE_SOURCE_AUTO,
    CABLE_TYPE_SOURCE_MANUAL,
    CABLE_TYPE_SOURCE_BULK,
}
CABLE_MARK_SOURCE_AUTO = "auto"
CABLE_MARK_SOURCE_MANUAL = "manual"
VALID_CABLE_MARK_SOURCES = {
    CABLE_MARK_SOURCE_AUTO,
    CABLE_MARK_SOURCE_MANUAL,
}
THREAD_SOURCE_MANUAL = "manual"
THREAD_SOURCE_AUTO = "auto"
THREAD_SOURCE_DEFAULT = "default"
THREAD_SOURCE_PREVIOUS_RESULT = "previous_result"
VALID_THREAD_SOURCES = {
    THREAD_SOURCE_MANUAL,
    THREAD_SOURCE_AUTO,
    THREAD_SOURCE_DEFAULT,
    THREAD_SOURCE_PREVIOUS_RESULT,
}


async def _maybe_await(value: Awaitable[Any] | Any) -> Any:
    if isawaitable(value):
        return await value
    return value


def _chunked_rows(
    rows: list[dict[str, Any]],
    chunk_size: int,
) -> list[list[dict[str, Any]]]:
    return [rows[index : index + chunk_size] for index in range(0, len(rows), chunk_size)]


class BatchCancelChecker:
    def __init__(
        self,
        should_cancel: CancelChecker | None,
        *,
        min_objects: int = BATCH_CANCEL_CHECK_MIN_OBJECTS,
        min_interval_seconds: float = BATCH_CANCEL_CHECK_MIN_INTERVAL_SECONDS,
        now_func: Callable[[], float] = monotonic,
        cancel_message: str = "Пакетный электрорасчёт отменён",
    ) -> None:
        self._should_cancel = should_cancel
        self._min_objects = min_objects
        self._min_interval_seconds = min_interval_seconds
        self._now = now_func
        self._cancel_message = cancel_message
        self._last_checked_processed: int | None = None
        self._last_checked_at: float | None = None

    async def check(self, processed: int, *, force: bool = False) -> None:
        if self._should_cancel is None:
            return
        now = self._now()
        if not force and self._last_checked_processed is not None:
            processed_delta = processed - self._last_checked_processed
            last_checked_at = self._last_checked_at if self._last_checked_at is not None else now
            elapsed = now - last_checked_at
            if processed_delta < self._min_objects and elapsed < self._min_interval_seconds:
                return
        self._last_checked_processed = processed
        self._last_checked_at = now
        if bool(await _maybe_await(self._should_cancel())):
            raise BatchCancelledError(self._cancel_message)


class CalculationService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def electrical_project_page(
        self,
        project_id: UUID,
        *,
        variant_number: int = 1,
        page: int = 1,
        page_size: int = 50,
    ) -> tuple[
        list[ProjectObject], list[ElectricalCalculation], dict[str, Any], ProjectObjectsPageInfo
    ]:
        page = max(page, 1)
        page_size = min(max(page_size, 1), 200)

        object_counts_result = await self.db.execute(
            select(ProjectObject.is_valid, func.count())
            .where(ProjectObject.project_id == project_id)
            .group_by(ProjectObject.is_valid)
        )
        object_counts = {
            bool(is_valid): int(count) for is_valid, count in object_counts_result.all()
        }
        valid_objects = object_counts.get(True, 0)
        total_objects = sum(object_counts.values())
        offset = (page - 1) * page_size

        objects_result = await self.db.execute(
            select(ProjectObject)
            .where(ProjectObject.project_id == project_id)
            .order_by(ProjectObject.sort_order, ProjectObject.id)
            .offset(offset)
            .limit(page_size)
        )
        objects = list(objects_result.scalars().all())
        object_ids = [obj.id for obj in objects]

        if object_ids:
            calculations_result = await self.db.execute(
                select(ElectricalCalculation).where(
                    ElectricalCalculation.project_id == project_id,
                    ElectricalCalculation.variant_number == variant_number,
                    ElectricalCalculation.object_id.in_(object_ids),
                )
            )
            calculations = list(calculations_result.scalars().all())
        else:
            calculations = []

        error_text = ElectricalCalculation.results["error"].astext
        selected_cable_text = ElectricalCalculation.results["selected_cable"].astext
        successful_calc = and_(
            ElectricalCalculation.results.is_not(None),
            error_text.is_(None),
            or_(
                ElectricalCalculation.cable_mark.is_not(None),
                selected_cable_text.is_not(None),
            ),
        )
        failed_calc = error_text.is_not(None)
        cable_length = sa_cast(ElectricalCalculation.results["cable_length"].astext, Float)
        total_power = sa_cast(ElectricalCalculation.results["total_power"].astext, Float)
        current = sa_cast(ElectricalCalculation.results["current"].astext, Float)
        summary_result = await self.db.execute(
            select(
                func.count(ElectricalCalculation.id),
                func.count(ElectricalCalculation.id).filter(successful_calc),
                func.count(ElectricalCalculation.id).filter(failed_calc),
                func.coalesce(func.sum(cable_length).filter(successful_calc), 0.0),
                func.coalesce(func.sum(total_power).filter(successful_calc), 0.0),
                func.coalesce(func.sum(current).filter(successful_calc), 0.0),
            ).where(
                ElectricalCalculation.project_id == project_id,
                ElectricalCalculation.variant_number == variant_number,
            )
        )
        (
            electrical_total,
            calculated_count,
            failed_count,
            total_cable_length,
            summary_total_power,
            total_current,
        ) = summary_result.one()

        total_pages = math.ceil(total_objects / page_size) if total_objects else 0
        summary = {
            "total_objects": total_objects,
            "valid_objects": valid_objects,
            "invalid_objects": total_objects - valid_objects,
            "electrical_calculations_total": int(electrical_total or 0),
            "calculated_count": int(calculated_count or 0),
            "failed_count": int(failed_count or 0),
            "total_cable_length": float(total_cable_length or 0.0),
            "total_power": float(summary_total_power or 0.0),
            "total_current": float(total_current or 0.0),
        }
        page_info = ProjectObjectsPageInfo(
            page=page,
            page_size=page_size,
            offset=offset,
            total_pages=total_pages,
            has_next_page=page * page_size < total_objects,
            has_previous_page=page > 1,
        )
        return objects, calculations, summary, page_info

    async def get_coefficients(self) -> dict[str, float]:
        # Кэш в Redis: коэффициенты меняются редко (через админ-CRUD),
        # а читаются на КАЖДОМ recalculate. Инвалидация — `cache.invalidate("coefficients")`
        # в `admin_service.update_coefficient`.
        from app.core.cache import cache

        cached = await cache.aget("coefficients")
        if cached is not None:
            return cached
        result = await self.db.execute(select(CorrectionCoefficient))
        coeffs = {row.key: row.value for row in result.scalars().all()}
        await cache.aset("coefficients", coeffs, ttl=3600)
        return coeffs

    @staticmethod
    def _extended_cable_catalog_entry(
        c: CableExtended, *, source: str = "extended"
    ) -> dict[str, Any]:
        return {
            "source": source,
            "cable_type": c.cable_type,
            "brand": c.brand,
            "model": c.model,
            "power_per_meter": c.power_per_meter,
            "max_temperature": c.max_temperature,
            "min_temperature": c.min_temperature,
            "resistance_per_meter": c.resistance_per_meter,
            "supplier_name": getattr(c, "supplier_name", None),
            "article": getattr(c, "article", None),
            "currency": getattr(c, "currency", None),
            "price_per_meter": c.price_per_meter,
            "stock_quantity_m": c.stock_quantity_m,
            "stock_status": getattr(c, "stock_status", None),
            "lead_time_days": c.lead_time_days,
            "supplier_priority": c.supplier_priority,
            "is_preferred": c.is_preferred,
            "order_multiple_m": c.order_multiple_m,
            "min_order_quantity_m": getattr(c, "min_order_quantity_m", None),
            "is_discontinued": bool(getattr(c, "is_discontinued", False)),
            "replacement_group": getattr(c, "replacement_group", None),
            "price_updated_at": (
                c.price_updated_at.isoformat() if getattr(c, "price_updated_at", None) else None
            ),
            "stock_updated_at": (
                c.stock_updated_at.isoformat() if getattr(c, "stock_updated_at", None) else None
            ),
            "commercial_data_source": getattr(c, "commercial_data_source", None),
        }

    @classmethod
    def _merge_commercial_cable_entry(
        cls,
        base: dict[str, Any],
        commercial: CableExtended | None,
    ) -> dict[str, Any]:
        entry = {
            **base,
            "source": "commercial",
            "cable_type": "self_regulating",
            "currency": "RUB",
            "price_per_meter": None,
            "stock_quantity_m": None,
            "stock_status": "unknown",
            "lead_time_days": None,
            "supplier_priority": None,
            "is_preferred": False,
            "order_multiple_m": None,
            "min_order_quantity_m": None,
            "is_discontinued": False,
            "commercial_data_source": None,
        }
        if commercial is None:
            return entry
        overlay = cls._extended_cable_catalog_entry(commercial, source="commercial")
        for key, value in overlay.items():
            if key in {"model", "power_per_meter", "max_temperature", "min_temperature"}:
                continue
            entry[key] = value
        return entry

    async def load_cable_catalog(self, source: CableSource = "builtin") -> list[dict[str, Any]]:
        """Возвращает каталог кабелей по запрошенному источнику.

        builtin    — встроенная линейка ТЛТ для self_regulating
        commercial — встроенная линейка ТЛТ + commercial projection из БД
        extended   — только `cables_extended` (self_regulating)
        all        — объединение builtin + extended
        """
        if source not in ("builtin", "commercial", "extended", "all"):
            source = "builtin"
        builtin = [{**c, "source": "builtin"} for c in list_tlt_cables()]
        if source == "builtin":
            return builtin
        result = await self.db.execute(
            select(CableExtended).where(
                CableExtended.is_active.is_(True),
                CableExtended.cable_type == "self_regulating",
            )
        )
        rows = list(result.scalars().all())
        if source == "commercial":
            by_model = {c.model: c for c in rows}
            return [
                self._merge_commercial_cable_entry(c, by_model.get(c["model"])) for c in builtin
            ]
        extended = [self._extended_cable_catalog_entry(c) for c in rows]
        if source == "extended":
            return extended
        return builtin + extended

    async def calc_heat_loss(self, object_type: str, data: dict[str, Any]) -> HeatLossResultDict:
        """Возвращает результат теплорасчёта в формате, совпадающем с JSONB.

        Для pipe → `PipeHeatLossResultDict`, для tank → `TankHeatLossResultDict`.
        Этот же dict кладётся в `ProjectObject.results`.
        """
        coefficients = await self.get_coefficients()
        return self._calc_heat_loss_with_coefficients(object_type, data, coefficients)

    def _calc_heat_loss_with_coefficients(
        self,
        object_type: str,
        data: dict[str, Any],
        coefficients: dict[str, float],
    ) -> HeatLossResultDict:
        data = self._apply_climate_policy(object_type, data)
        if object_type == "pipe":
            params = PipeHeatLossParams(**data)
            pipe_result = calc_pipe_heat_loss(params, coefficients=coefficients)
            return cast(PipeHeatLossResultDict, pipe_result.model_dump())
        elif object_type == "tank":
            params_t = TankHeatLossParams(**data)
            tank_result = calc_tank_heat_loss(params_t, coefficients=coefficients)
            return cast(TankHeatLossResultDict, tank_result.model_dump())
        else:
            raise CalculationError(f"Неподдерживаемый тип объекта: {object_type}")

    async def recalculate_object(self, obj: ProjectObject) -> ProjectObject:
        """Автопересчёт объекта при изменении параметров (мутирует obj).

        Для получения явного Ok/Err без мутации-сайд-эффекта используйте
        `try_recalculate(obj)` — он возвращает `Result[ProjectObject, str]`,
        что позволяет mypy проверить обработку ошибок.

        Args:
            obj: объект проекта; поля `results`, `is_valid`, `validation_errors`
                обновляются на месте.

        Returns:
            Тот же `obj` (удобство для цепочки вызовов / SQLAlchemy-коммита).

        Side effects:
            При ошибке устанавливает `obj.is_valid=False` и пишет причину в
            `obj.validation_errors={"error": "..."}`.
        """
        await self.try_recalculate(obj)
        # Независимо от Ok/Err, try_recalculate мутирует obj на месте
        # (обновляет results/is_valid/validation_errors). Возвращаем тот же obj.
        return obj

    async def try_recalculate(
        self,
        obj: ProjectObject,
        *,
        coefficients: dict[str, float] | None = None,
    ) -> Result[ProjectObject, str]:
        """Пересчёт объекта с явным Result-типом.

        Args:
            obj: объект проекта (мутируется как в `recalculate_object`).

        Returns:
            `Ok(obj)` если теплорасчёт прошёл успешно,
            `Err(message)` если формула/Pydantic кинули исключение.

        Example:
            >>> r = await service.try_recalculate(obj)
            >>> if r.is_err:
            ...     log.warning("Объект не пересчитан: %s", r.error)
            >>> # obj.is_valid / obj.validation_errors всё равно обновлены
        """
        try:
            obj.params = prepare_project_object_params(obj.object_type, obj.params)
            obj.params = self._apply_climate_policy(obj.object_type, obj.params)
            result = (
                self._calc_heat_loss_with_coefficients(obj.object_type, obj.params, coefficients)
                if coefficients is not None
                else await self.calc_heat_loss(obj.object_type, obj.params)
            )
            obj.results = cast(dict[str, Any], result)
            obj.is_valid = True
            obj.validation_errors = None
            return Ok(obj)
        except Exception as exc:
            message = str(exc)
            obj.results = None
            obj.is_valid = False
            obj.validation_errors = {"error": message}
            return Err(message)

    @staticmethod
    def _climate_temperature(entry: dict[str, Any] | None, key: str) -> float | None:
        if entry is None:
            return None
        value = entry.get(key)
        if value is None:
            return None
        return float(value)

    @staticmethod
    def _climate_entry(data: dict[str, Any]) -> dict[str, Any] | None:
        city = data.get("climate_city")
        if city:
            return get_climate_by_city(str(city))
        return None

    @classmethod
    def _apply_climate_policy(cls, object_type: str, data: dict[str, Any]) -> dict[str, Any]:
        """Применяет VSDX climate policy к K и расчетной температуре.

        Если город не задан или справочник не содержит нужной температуры,
        ambient_temperature остается пользовательским. safety_factor заполняется
        по типу объекта и диаметру трубы только если он не задан явно.
        """
        normalized = dict(data)
        climate = cls._climate_entry(normalized)
        safety_factor = cls._num(normalized.get("safety_factor"))
        safety_factor_source = normalized.get("safety_factor_source")
        safety_factor_is_default_value = safety_factor_source is None and safety_factor == 1.1
        explicit_safety_factor = (
            safety_factor is not None
            and safety_factor_source not in ("default", "climate_policy")
            and not safety_factor_is_default_value
        )
        safety_factor_from_policy = False

        if object_type == "pipe":
            diameter = cls._num(normalized.get("outer_diameter"))
            if diameter is None or diameter <= 0:
                normalized.pop("climate_temperature_basis", None)
                return normalized
            diameter_mm = diameter * 1000.0
            if diameter_mm >= 100.0:
                if not explicit_safety_factor:
                    normalized["safety_factor"] = 1.1
                    safety_factor_from_policy = True
                basis = "t_0_92"
                rule = "pipe_diameter_ge_100"
            else:
                if not explicit_safety_factor:
                    normalized["safety_factor"] = 1.12
                    safety_factor_from_policy = True
                basis = "t_abs_min"
                rule = "pipe_diameter_lt_100"
        elif object_type == "tank":
            if not explicit_safety_factor:
                normalized["safety_factor"] = 1.1
                safety_factor_from_policy = True
            basis = "t_0_92"
            rule = "non_pipe_cold_fiveday_0_92"
        else:
            return normalized

        climate_temperature = cls._climate_temperature(climate, basis)
        if climate_temperature is not None:
            normalized["ambient_temperature"] = climate_temperature
            normalized["ambient_temperature_source"] = "climate"
            normalized["climate_temperature_basis"] = basis
        else:
            normalized.pop("climate_temperature_basis", None)
        normalized["climate_policy_rule"] = rule
        if safety_factor_from_policy:
            normalized["safety_factor_source"] = "climate_policy"
        elif explicit_safety_factor and safety_factor_source is None:
            normalized["safety_factor_source"] = "manual"
        return normalized

    async def _heat_batch_count(
        self,
        project_id: UUID,
        object_ids: list[UUID] | None = None,
    ) -> int:
        filters = [ProjectObject.project_id == project_id]
        if object_ids is not None:
            if not object_ids:
                return 0
            filters.append(ProjectObject.id.in_(object_ids))
        result = await self.db.execute(select(func.count(ProjectObject.id)).where(*filters))
        return int(result.scalar() or 0)

    async def _load_project_object_chunk(
        self,
        project_id: UUID,
        *,
        limit: int,
        after_sort_order: int | None = None,
        after_id: UUID | None = None,
        object_ids: list[UUID] | None = None,
    ) -> list[ProjectObject]:
        filters = [ProjectObject.project_id == project_id]
        if object_ids is not None:
            if not object_ids:
                return []
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
                    ProjectObject.validation_errors,
                )
            )
            .where(*filters)
            .order_by(ProjectObject.sort_order, ProjectObject.id)
            .limit(limit)
        )
        return list(result.scalars().all())

    async def batch_recalculate(
        self,
        project_id: UUID,
        progress_callback: ProgressCallback | None = None,
        should_cancel: CancelChecker | None = None,
        object_ids: list[UUID] | None = None,
    ) -> tuple[int, int, list[dict[str, Any]]]:
        async def emit_progress(progress: BatchProgress) -> None:
            if progress_callback is not None:
                await _maybe_await(progress_callback(progress))

        cancel_checker = BatchCancelChecker(
            should_cancel,
            cancel_message="Пакетный пересчёт теплопотерь отменён",
        )
        total_count = await self._heat_batch_count(project_id, object_ids)
        updated = 0
        failed = 0
        errors: list[dict[str, Any]] = []

        await emit_progress(BatchProgress(current=0, total=total_count, phase="prepare"))
        await cancel_checker.check(0, force=True)

        coefficients = await self.get_coefficients() if total_count > 0 else {}
        processed = 0
        last_sort_order: int | None = None
        last_id: UUID | None = None

        while processed < total_count:
            objects = await self._load_project_object_chunk(
                project_id,
                limit=BATCH_HEAT_RECALCULATE_CHUNK_SIZE,
                after_sort_order=last_sort_order,
                after_id=last_id,
                object_ids=object_ids,
            )
            if not objects:
                break
            last_sort_order = getattr(objects[-1], "sort_order", None)
            last_id = objects[-1].id

            for obj in objects:
                await cancel_checker.check(processed)
                await self.try_recalculate(obj, coefficients=coefficients)
                if obj.is_valid:
                    updated += 1
                else:
                    failed += 1
                    errors.append({"object_id": str(obj.id), "error": obj.validation_errors})
                processed += 1
                await emit_progress(
                    BatchProgress(
                        current=processed,
                        total=total_count,
                        phase="calculate",
                        calculated=updated,
                        skipped=failed,
                        heat_loss_failed=failed,
                        object_id=obj.id,
                    )
                )
                if processed % BATCH_HEAT_RECALCULATE_YIELD_EVERY_OBJECTS == 0:
                    await asyncio.sleep(0)

            await cancel_checker.check(processed, force=True)
            await self.db.flush()
            await asyncio.sleep(0)

        await cancel_checker.check(processed, force=True)
        await emit_progress(
            BatchProgress(
                current=processed,
                total=total_count,
                phase="commit",
                calculated=updated,
                skipped=failed,
                heat_loss_failed=failed,
            )
        )
        await use_fast_commit_for_current_transaction(self.db)
        await self.db.commit()
        await emit_progress(
            BatchProgress(
                current=processed,
                total=total_count,
                phase="done",
                calculated=updated,
                skipped=failed,
                heat_loss_failed=failed,
            )
        )
        return updated, failed, errors

    async def calc_electrical(self, request: ElectricalRequest) -> ElectricalCalculation:
        cable_mark, result_dict = self._calculate_electrical_result(request)

        # Получаем объект, чтобы узнать project_id
        obj_result = await self.db.execute(
            select(ProjectObject).where(ProjectObject.id == request.object_id)
        )
        obj = obj_result.scalar_one_or_none()
        if obj is None:
            raise CalculationError("Объект не найден")

        # Upsert по (object_id, variant_number) — чтобы повторный пересчёт
        # обновлял существующую строку и «затирал» предыдущую ошибку.
        existing = await self.db.execute(
            select(ElectricalCalculation).where(
                ElectricalCalculation.object_id == obj.id,
                ElectricalCalculation.variant_number == request.variant_number,
            )
        )
        calc = self._upsert_electrical_calculation(
            obj=obj,
            request=request,
            cable_mark=cable_mark,
            result_dict=result_dict,
            existing_calc=existing.scalars().first(),
        )
        await self.db.commit()
        await self.db.refresh(calc)
        return calc

    def _calculate_electrical_result(
        self, request: ElectricalRequest
    ) -> tuple[str | None, dict[str, Any]]:
        cable_type = request.cable_type
        if cable_type == "self_regulating":
            params_sr = SelfRegulatingParams(**request.data)
            result_obj = calc_self_regulating(params_sr)
            cable_mark = result_obj.selected_cable
            result_dict = result_obj.model_dump()
        elif cable_type == "self_regulating_tt":
            params_tt = SelfRegulatingTTParams(**request.data)
            result_tt = calc_self_regulating_tt(params_tt)
            cable_mark = result_tt.cable_mark
            result_dict = result_tt.model_dump()
        elif cable_type == "single_core":
            params_sc = ResistiveSingleCoreParams(**request.data)
            result_sc = calc_resistive_single_core(params_sc)
            cable_mark = result_sc.selected_cable
            result_dict = result_sc.model_dump()
        elif cable_type == "three_core":
            params_tc = ResistiveThreeCoreParams(**request.data)
            result_tc = calc_resistive_three_core(params_tc)
            cable_mark = result_tc.selected_cable
            result_dict = result_tc.model_dump()
        else:
            raise CalculationError(
                f"Для типа кабеля «{cable_type}» расчётная формула не реализована"
            )

        self._apply_thread_result_metadata(request.data, result_dict)
        return cable_mark, result_dict

    def _upsert_electrical_calculation(
        self,
        *,
        obj: ProjectObject,
        request: ElectricalRequest,
        cable_mark: str | None,
        result_dict: dict[str, Any],
        existing_calc: ElectricalCalculation | None,
    ) -> ElectricalCalculation:
        calc = existing_calc
        cable_type_source = self._normalize_cable_type_source(request.data.get("cable_type_source"))
        cable_mark_source = self._resolve_cable_mark_source(request.data)
        if calc is None:
            calc = ElectricalCalculation(
                project_id=obj.project_id,
                object_id=obj.id,
                variant_number=request.variant_number,
                cable_type=request.cable_type,
                cable_type_source=cable_type_source,
                cable_mark=cable_mark,
                cable_mark_source=cable_mark_source,
                params=self._compact_electrical_params(request.data),
                results=result_dict,
            )
            self.db.add(calc)
        else:
            calc.cable_type = request.cable_type
            calc.cable_type_source = cable_type_source
            calc.cable_mark = cable_mark
            calc.cable_mark_source = cable_mark_source
            calc.params = self._compact_electrical_params(request.data)
            calc.results = result_dict
        return calc

    async def _bulk_upsert_electrical_calculations(
        self,
        rows: list[dict[str, Any]],
        *,
        return_calcs: bool = True,
    ) -> list[ElectricalCalculation]:
        if not rows:
            return []

        for row in rows:
            row["cable_type_source"] = self._normalize_cable_type_source(
                row.get("cable_type_source")
            )
            row["cable_mark_source"] = self._normalize_cable_mark_source(
                row.get("cable_mark_source")
            )
        chunk_size = self._electrical_bulk_upsert_chunk_size(rows[0])
        calcs: list[ElectricalCalculation] = []
        for chunk in _chunked_rows(rows, chunk_size):
            calcs.extend(
                await self._bulk_upsert_electrical_calculation_chunk(
                    chunk,
                    return_calcs=return_calcs,
                )
            )
        return calcs

    @staticmethod
    def _electrical_bulk_upsert_chunk_size(row: dict[str, Any]) -> int:
        params_per_row = max(len(row), 1)
        max_rows_by_bind_limit = max(1, POSTGRES_BIND_PARAMETER_LIMIT // params_per_row)
        return min(ELECTRICAL_BULK_UPSERT_TARGET_CHUNK_SIZE, max_rows_by_bind_limit)

    @staticmethod
    def _normalize_cable_type_source(value: Any) -> str:
        if isinstance(value, str) and value in VALID_CABLE_TYPE_SOURCES:
            return value
        return CABLE_TYPE_SOURCE_AUTO

    @staticmethod
    def _existing_cable_type_source(calc: ElectricalCalculation | None) -> str:
        if calc is None:
            return CABLE_TYPE_SOURCE_AUTO
        calc_dict = getattr(calc, "__dict__", {})
        source = calc_dict.get("cable_type_source")
        if source in VALID_CABLE_TYPE_SOURCES:
            return str(source)
        params = calc_dict.get("params")
        if isinstance(params, dict):
            return CalculationService._normalize_cable_type_source(params.get("cable_type_source"))
        return CABLE_TYPE_SOURCE_AUTO

    @staticmethod
    def _normalize_cable_mark_source(value: Any) -> str:
        if isinstance(value, str) and value in VALID_CABLE_MARK_SOURCES:
            return value
        return CABLE_MARK_SOURCE_AUTO

    @staticmethod
    def _normalize_thread_source(value: Any) -> str | None:
        if isinstance(value, str) and value in VALID_THREAD_SOURCES:
            return value
        return None

    @staticmethod
    def _resolve_cable_mark_source(data: dict[str, Any]) -> str:
        source = data.get("cable_mark_source")
        if source in VALID_CABLE_MARK_SOURCES:
            return str(source)
        return CABLE_MARK_SOURCE_MANUAL if data.get("cable_mark") else CABLE_MARK_SOURCE_AUTO

    @staticmethod
    def _compact_electrical_params(data: dict[str, Any]) -> dict[str, Any]:
        return {key: value for key, value in data.items() if key != "cable_catalog"}

    @classmethod
    def _apply_thread_result_metadata(
        cls,
        request_data: dict[str, Any],
        result_dict: dict[str, Any],
    ) -> None:
        applied = result_dict.get("num_circuits")
        if applied is None:
            return
        source = (
            cls._normalize_thread_source(request_data.get("number_of_threads_source"))
            or cls._normalize_thread_source(result_dict.get("number_of_threads_source"))
            or THREAD_SOURCE_MANUAL
        )
        requested = request_data.get("requested_number_of_threads")
        result_dict["requested_number_of_threads"] = requested
        result_dict["applied_number_of_threads"] = applied
        result_dict["number_of_threads_source"] = source

    async def _bulk_upsert_electrical_calculation_chunk(
        self,
        rows: list[dict[str, Any]],
        *,
        return_calcs: bool,
    ) -> list[ElectricalCalculation]:
        insert_stmt = pg_insert(ElectricalCalculation).values(rows)
        upsert_stmt = insert_stmt.on_conflict_do_update(
            index_elements=["object_id", "variant_number"],
            set_={
                "project_id": insert_stmt.excluded.project_id,
                "cable_type": insert_stmt.excluded.cable_type,
                "cable_type_source": insert_stmt.excluded.cable_type_source,
                "cable_mark": insert_stmt.excluded.cable_mark,
                "cable_mark_source": insert_stmt.excluded.cable_mark_source,
                "params": insert_stmt.excluded.params,
                "results": insert_stmt.excluded.results,
                "updated_at": func.now(),
            },
        )
        if not return_calcs:
            await self.db.execute(upsert_stmt)
            return []

        upsert_stmt = upsert_stmt.returning(ElectricalCalculation)
        orm_stmt = (
            select(ElectricalCalculation)
            .from_statement(upsert_stmt)
            .execution_options(populate_existing=True)
        )
        result = await self.db.execute(orm_stmt)
        returned_by_object_id = {calc.object_id: calc for calc in result.scalars().all()}
        return [returned_by_object_id[row["object_id"]] for row in rows]

    @staticmethod
    def _num(value: Any, default: float | None = None) -> float | None:
        if value is None or value == "":
            return default
        return float(value)

    @staticmethod
    def _positive(value: Any, message: str) -> float:
        parsed = CalculationService._num(value)
        if parsed is None or parsed <= 0:
            raise CalculationError(message)
        return parsed

    @staticmethod
    def _required_num(value: Any, message: str) -> float:
        parsed = CalculationService._num(value)
        if parsed is None:
            raise CalculationError(message)
        return parsed

    @staticmethod
    def _pick_numeric_policy(
        *,
        key: str,
        fallback: float | None,
        overrides: dict[str, Any],
        params: dict[str, Any],
        coefficients: dict[str, float] | None,
        aliases: tuple[str, ...] = (),
    ) -> float | None:
        for source in (overrides, params, coefficients or {}):
            for candidate_key in (key, *aliases):
                if source.get(candidate_key) is not None:
                    return CalculationService._num(source.get(candidate_key), fallback)
        return fallback

    @staticmethod
    def _resistive_selection_mode(overrides: dict[str, Any], params: dict[str, Any]) -> str:
        raw = (
            overrides.get("selection_mode")
            or params.get("selection_mode")
            or params.get("resistive_selection_mode")
            or "auto"
        )
        return "manual" if raw == "manual" else "auto"

    def _resistive_policy_payload(
        self,
        *,
        overrides: dict[str, Any],
        params: dict[str, Any],
        coefficients: dict[str, float] | None,
        supply_voltage: float,
    ) -> dict[str, Any]:
        """DB-backed VSDX policy values with deterministic fallbacks."""
        max_linear_power = self._pick_numeric_policy(
            key="max_linear_power_w_m",
            fallback=None,
            overrides=overrides,
            params=params,
            coefficients=coefficients,
            aliases=("resistive_max_linear_power_w_m",),
        )
        max_parallel = self._pick_numeric_policy(
            key="max_parallel_schemes",
            fallback=20.0,
            overrides=overrides,
            params=params,
            coefficients=coefficients,
            aliases=("resistive_max_parallel_schemes",),
        )
        return {
            "selection_mode": self._resistive_selection_mode(overrides, params),
            "start_voltage": self._pick_numeric_policy(
                key="start_voltage",
                fallback=supply_voltage,
                overrides=overrides,
                params=params,
                coefficients=coefficients,
                aliases=("resistive_start_voltage_v", "resistive_default_voltage_v"),
            ),
            "high_voltage": self._pick_numeric_policy(
                key="high_voltage",
                fallback=380.0,
                overrides=overrides,
                params=params,
                coefficients=coefficients,
                aliases=("resistive_high_voltage_v",),
            ),
            "min_adjusted_voltage": self._pick_numeric_policy(
                key="min_adjusted_voltage",
                fallback=1.0,
                overrides=overrides,
                params=params,
                coefficients=coefficients,
                aliases=("resistive_min_adjusted_voltage_v", "resistive_min_voltage_v"),
            ),
            "voltage_step": self._pick_numeric_policy(
                key="voltage_step",
                fallback=1.0,
                overrides=overrides,
                params=params,
                coefficients=coefficients,
                aliases=("resistive_voltage_step_v",),
            ),
            "max_current_a": self._pick_numeric_policy(
                key="max_current_a",
                fallback=65.0,
                overrides=overrides,
                params=params,
                coefficients=coefficients,
                aliases=("resistive_max_current_a",),
            ),
            "max_linear_power_w_m": max_linear_power,
            "max_parallel_schemes": int(max_parallel or 20),
            "max_conductor_temperature": self._pick_numeric_policy(
                key="max_conductor_temperature",
                fallback=None,
                overrides=overrides,
                params=params,
                coefficients=coefficients,
                aliases=("resistive_max_conductor_temperature",),
            ),
        }

    @staticmethod
    def _positive_heat_loss(value: Any) -> float:
        parsed = CalculationService._num(value)
        if parsed is None:
            raise CalculationError(
                "Теплопотери не рассчитаны или равны нулю — электрорасчёт невозможен"
            )
        if parsed <= 0:
            raise CalculationError("Теплопотери равны нулю — кабель не требуется")
        return parsed

    def _tank_geometry_payload(
        self,
        obj: ProjectObject,
        overrides: dict[str, Any],
    ) -> dict[str, Any]:
        """Параметры укладки кабеля на резервуар из формы/объекта.

        Для расчёта длины нужны `heating_height` и `laying_step`. Если высота
        обогрева не задана явно, используем высоту резервуара как инженерный
        дефолт для полного обогрева стенки.
        """
        if obj.object_type != "tank":
            return {}
        params = obj.params or {}
        shape = params.get("shape")
        if shape not in ("cylindrical", "rectangular"):
            return {}

        pitch_mm = self._num(overrides.get("winding_pitch"))
        laying_step = self._num(overrides.get("laying_step") or params.get("laying_step"))
        if laying_step is None and pitch_mm is not None and pitch_mm > 0:
            laying_step = pitch_mm / 1000.0
        heating_height = self._num(
            overrides.get("heating_height") or params.get("heating_height") or params.get("height")
        )
        if laying_step is None or heating_height is None:
            return {}

        payload: dict[str, Any] = {
            "tank_shape": shape,
            "heating_height": heating_height,
            "laying_step": laying_step,
        }
        if shape == "cylindrical":
            payload["tank_diameter"] = self._positive(
                params.get("diameter"), "Для резервуара требуется diameter > 0"
            )
        else:
            payload["tank_length"] = self._positive(
                params.get("length"), "Для прямоугольного резервуара требуется length > 0"
            )
            payload["tank_width"] = self._positive(
                params.get("width"), "Для прямоугольного резервуара требуется width > 0"
            )
        return payload

    def _number_of_threads(
        self,
        overrides: dict[str, Any],
        params: dict[str, Any],
        default: int | None = 1,
    ) -> int | None:
        raw = overrides.get("number_of_threads")
        if raw is None:
            raw = params.get("number_of_threads")
        if raw is None:
            return default
        value = int(raw)
        if value < 1 or value > 100:
            raise ValueError("Количество ниток должно быть в диапазоне 1…100")
        return value

    def _number_of_threads_payload(
        self,
        overrides: dict[str, Any],
        params: dict[str, Any],
        default: int | None,
    ) -> dict[str, Any]:
        raw = overrides.get("number_of_threads")
        source = self._normalize_thread_source(overrides.get("number_of_threads_source"))
        if raw is not None:
            value = self._number_of_threads({"number_of_threads": raw}, {}, None)
            source = source or THREAD_SOURCE_MANUAL
        else:
            raw = params.get("number_of_threads")
            if raw is not None:
                value = self._number_of_threads({}, {"number_of_threads": raw}, None)
                source = THREAD_SOURCE_MANUAL
            elif default is not None:
                value = default
                source = THREAD_SOURCE_DEFAULT
            else:
                value = None
                source = THREAD_SOURCE_AUTO
        return {
            "number_of_threads": value,
            "requested_number_of_threads": value if source == THREAD_SOURCE_MANUAL else None,
            "number_of_threads_source": source,
        }

    @staticmethod
    def _base_overrides_with_sources(overrides: dict[str, Any]) -> dict[str, Any]:
        normalized = dict(overrides)
        if (
            normalized.get("number_of_threads") is not None
            and normalized.get("number_of_threads_source") is None
        ):
            normalized["number_of_threads_source"] = THREAD_SOURCE_MANUAL
        return normalized

    @staticmethod
    def _max_winding_coefficient_for_diameter(diameter_m: float) -> float:
        diameter_mm = diameter_m * 1000.0
        if diameter_mm < 57.0:
            return 1.0
        if diameter_mm == 57.0:
            return 1.1
        if diameter_mm <= 75.0:
            return 1.2
        if diameter_mm <= 89.0:
            return 1.3
        if diameter_mm <= 108.0:
            return 1.4
        return 1.5

    def _validate_winding_coefficient_limit(
        self,
        obj: ProjectObject,
        params: dict[str, Any],
        coefficient: float,
    ) -> float:
        if obj.object_type != "pipe":
            return coefficient
        diameter = self._num(params.get("outer_diameter"))
        if diameter is None or diameter <= 0:
            if coefficient <= 1.1 + 1e-9:
                return coefficient
            raise CalculationError(
                "Для проверки максимального навива требуется наружный диаметр трубы"
            )
        max_coefficient = self._max_winding_coefficient_for_diameter(diameter)
        if coefficient > max_coefficient + 1e-9:
            raise ValueError(
                f"Коэффициент навива {coefficient:.3f} превышает максимум "
                f"{max_coefficient:.1f} для D={diameter * 1000.0:.0f} мм"
            )
        return coefficient

    def _winding_pitch_mm(
        self,
        overrides: dict[str, Any],
        params: dict[str, Any],
    ) -> float | None:
        raw = overrides.get("winding_pitch")
        if raw is None:
            raw = overrides.get("winding_pitch_mm")
        if raw is None:
            raw = params.get("winding_pitch")
        return self._num(raw)

    def _winding_coefficient(
        self,
        obj: ProjectObject,
        overrides: dict[str, Any],
        params: dict[str, Any],
        default: float,
    ) -> float:
        pitch_mm = self._winding_pitch_mm(overrides, params)
        if pitch_mm is not None:
            if pitch_mm == 0:
                return 1.0
            if obj.object_type == "pipe":
                diameter = self._positive(
                    params.get("outer_diameter"),
                    "Для навива требуется наружный диаметр трубы",
                )
                pitch_m = pitch_mm / 1000.0
                if pitch_m <= diameter:
                    raise ValueError("Шаг навива должен быть больше наружного диаметра трубы")
                coefficient = math.sqrt(1.0 + (math.pi * diameter / pitch_m) ** 2)
                return self._validate_winding_coefficient_limit(obj, params, coefficient)

        raw_coefficient = overrides.get("winding_coefficient") or params.get("winding_coefficient")
        if raw_coefficient is None:
            if obj.object_type == "pipe":
                diameter = self._num(params.get("outer_diameter"))
                if diameter is not None and diameter > 0:
                    return min(default, self._max_winding_coefficient_for_diameter(diameter))
            return default
        coefficient = self._num(raw_coefficient, default)
        return self._validate_winding_coefficient_limit(obj, params, coefficient or default)

    def _tank_base_cable_length(
        self,
        obj: ProjectObject,
        overrides: dict[str, Any],
    ) -> float | None:
        payload = self._tank_geometry_payload(obj, overrides)
        if not payload:
            return None
        return compute_tank_cable_length(
            shape=str(payload["tank_shape"]),
            diameter=cast(float | None, payload.get("tank_diameter")),
            length=cast(float | None, payload.get("tank_length")),
            width=cast(float | None, payload.get("tank_width")),
            heating_height=float(payload["heating_height"]),
            laying_step=float(payload["laying_step"]),
        )

    def _base_cable_length(
        self,
        obj: ProjectObject,
        overrides: dict[str, Any],
        params: dict[str, Any],
        results: dict[str, Any],
    ) -> float:
        """Базовая длина обогрева до монтажного запаса кабеля.

        Для труб электрический расчёт должен идти по `effective_length`, потому
        что теплорасчёт уже включает локальные элементы в эту длину. Для
        резервуаров используем длину укладки по поверхности, если задана
        геометрия укладки.
        """
        if obj.object_type == "tank":
            tank_length = self._tank_base_cable_length(obj, overrides)
            if tank_length is not None and tank_length > 0:
                return tank_length
        return (
            self._num(
                results.get("effective_length")
                or params.get("pipe_length")
                or params.get("height"),
                1.0,
            )
            or 1.0
        )

    def _tank_heat_loss_without_double_safety(
        self,
        results: dict[str, Any],
        fallback_safety_factor: float,
    ) -> float:
        """Возвращает Q для передачи в формулы, которые сами добавляют K.

        `total_heat_loss` у резервуара уже содержит K, а электрическая
        формула применит K повторно. Значит на вход ей нужно отдать `Q / K`,
        включая часть `Q_доп`; иначе дополнительная теплопотеря будет
        ошибочно умножена на K второй раз.
        """
        total = self._positive_heat_loss(results.get("total_heat_loss"))
        k = float(results.get("safety_factor") or fallback_safety_factor or 1.1)
        return total / k

    def _required_power_per_meter(
        self,
        obj: ProjectObject,
        cable_type: str,
        overrides: dict[str, Any],
        safety_factor: float,
    ) -> float:
        results = obj.results or {}
        if obj.object_type == "pipe":
            return self._positive_heat_loss(results.get("heat_loss_per_meter"))

        # Для кабеля на резервуаре считаем требуемые Вт/м кабеля по
        # полной площади и реальной длине укладки, чтобы не сравнивать Вт/м²
        # напрямую с паспортными Вт/м кабеля.
        base_length = self._tank_base_cable_length(obj, overrides)
        if base_length is None or base_length <= 0:
            raise CalculationError(
                "Для электрорасчёта резервуара требуется геометрия укладки кабеля: "
                "цилиндр/параллелепипед, высота обогрева и шаг укладки"
            )
        heat_loss = self._tank_heat_loss_without_double_safety(obj.results or {}, safety_factor)
        return heat_loss / base_length

    def _resistive_manual_catalog(
        self,
        cable_type: str,
        cable_mark: str | None,
    ) -> list[dict[str, Any]] | None:
        if cable_mark is None:
            return None
        catalog = list_resistive_cables()
        key = "single_core" if cable_type == "single_core" else "three_core"
        match = [c for c in catalog.get(key, []) if c.get("model") == cable_mark]
        if not match:
            raise ValueError(f"Кабель «{cable_mark}» не найден в справочнике")
        return match

    def _build_electrical_data(
        self,
        *,
        obj: ProjectObject,
        cable_type: str,
        cable_mark: str | None,
        tlt_catalog: list[dict[str, Any]],
        overrides: dict[str, Any],
        coefficients: dict[str, float] | None = None,
    ) -> dict[str, Any]:
        """Единый маппинг теплопотери/объект → payload электрической формулы."""
        if not obj.is_valid or not obj.results:
            raise CalculationError("Теплопотери объекта не рассчитаны — невозможно выбрать кабель")

        params = obj.params or {}
        results = obj.results or {}
        process_temperature = self._num(params.get("process_temperature"))
        supply_voltage = self._num(
            overrides.get("supply_voltage") or params.get("supply_voltage"),
            220.0,
        )
        safety_factor = self._num(
            params.get("safety_factor") or overrides.get("safety_factor"),
            1.1,
        )
        pipe_length = self._base_cable_length(obj, overrides, params, results)
        winding_pitch = self._winding_pitch_mm(overrides, params)
        override_vapor_temperature = self._num(overrides.get("vapor_temperature"))
        object_vapor_temperature = self._num(params.get("vapor_temperature"))
        vapor_temperature = (
            override_vapor_temperature
            if override_vapor_temperature is not None
            else object_vapor_temperature
        )
        override_maintain_temperature = self._num(overrides.get("maintain_temperature"))
        object_maintain_temperature = self._num(params.get("maintain_temperature"))
        maintain_temperature = (
            override_maintain_temperature
            if override_maintain_temperature is not None
            else object_maintain_temperature
        )

        if cable_type == "self_regulating":
            thread_payload = self._number_of_threads_payload(
                overrides,
                params,
                1 if cable_mark is not None else None,
            )
            return {
                "required_power_per_meter": self._required_power_per_meter(
                    obj, cable_type, overrides, safety_factor or 1.1
                ),
                "cable_mark": cable_mark,
                "supply_voltage": supply_voltage,
                "ambient_temperature": float(params.get("ambient_temperature", -20.0)),
                "process_temperature": process_temperature,
                "pipe_length": pipe_length,
                "safety_factor": safety_factor,
                "cable_catalog": tlt_catalog,
                "winding_coefficient": self._winding_coefficient(obj, overrides, params, 1.0),
                "winding_pitch": winding_pitch,
                "selection_policy": overrides.get("selection_policy") or "technical_minimum",
                **thread_payload,
            }

        if cable_type == "self_regulating_tt":
            thread_payload = self._number_of_threads_payload(overrides, params, None)
            data = {
                "required_power_per_meter": self._required_power_per_meter(
                    obj, cable_type, overrides, safety_factor or 1.1
                ),
                "pipe_length": pipe_length,
                "process_temperature": self._required_num(
                    process_temperature,
                    "Для ТТН/ТТВ/ТТХ требуется температура продукта",
                ),
                "maintain_temperature": maintain_temperature,
                "supply_voltage": supply_voltage,
                "safety_factor": safety_factor,
                "cable_mark": cable_mark,
                "vapor_temperature": vapor_temperature,
                "aggressive_product": bool(overrides.get("aggressive_product", False)),
                "winding_coefficient": self._winding_coefficient(obj, overrides, params, 1.1),
                "winding_pitch": winding_pitch,
                **thread_payload,
            }
            data.update(self._tank_geometry_payload(obj, overrides))
            return data

        if cable_type in ("single_core", "three_core"):
            thread_payload = self._number_of_threads_payload(overrides, params, 1)
            data = {
                "required_heat_loss": self._positive_heat_loss(results.get("total_heat_loss")),
                "pipe_length": pipe_length,
                "add_length": self._num(overrides.get("add_length"), 0.0),
                "process_temperature": self._required_num(
                    process_temperature,
                    "Для резистивного кабеля требуется температура продукта",
                ),
                "supply_voltage": supply_voltage,
                "maintain_temperature": maintain_temperature,
                "connection_type": overrides.get("connection_type")
                or params.get("connection_type")
                or "line_1ph",
                "winding_coefficient": self._winding_coefficient(obj, overrides, params, 1.0),
                "winding_pitch": winding_pitch,
                **thread_payload,
                "cable_catalog": self._resistive_manual_catalog(cable_type, cable_mark),
            }
            data.update(
                self._resistive_policy_payload(
                    overrides=overrides,
                    params=params,
                    coefficients=coefficients,
                    supply_voltage=supply_voltage,
                )
            )
            data.update(self._tank_geometry_payload(obj, overrides))
            return data

        return {}

    def _layout_overrides_from_existing(self, calc: ElectricalCalculation | None) -> dict[str, Any]:
        if calc is None or not calc.results:
            return {}
        results = calc.results
        overrides: dict[str, Any] = {}
        is_auto_resistive = (
            getattr(calc, "cable_type", None) in ("single_core", "three_core")
            and results.get("selection_mode") == "auto"
        )
        calc_params = getattr(calc, "params", None)
        params_source = (
            (calc_params or {}).get("number_of_threads_source")
            if isinstance(calc_params, dict)
            else None
        )
        thread_source = self._normalize_thread_source(
            results.get("number_of_threads_source") or params_source
        )
        if results.get("winding_pitch") is not None:
            overrides["winding_pitch"] = results.get("winding_pitch")
        should_reuse_threads = thread_source not in (THREAD_SOURCE_AUTO, THREAD_SOURCE_DEFAULT)
        if (
            results.get("num_circuits") is not None
            and not is_auto_resistive
            and should_reuse_threads
        ):
            overrides["number_of_threads"] = results.get("num_circuits")
            overrides["number_of_threads_source"] = THREAD_SOURCE_PREVIOUS_RESULT
        if results.get("winding_coefficient") is not None and "winding_pitch" not in overrides:
            overrides["winding_coefficient"] = results.get("winding_coefficient")
        return overrides

    @staticmethod
    def _merge_electrical_overrides(
        base: dict[str, Any],
        saved_layout: dict[str, Any],
    ) -> dict[str, Any]:
        merged = dict(saved_layout)
        for key, value in base.items():
            if value is not None:
                merged[key] = value
        return merged

    async def select_cable_manual(
        self,
        object_id: UUID,
        cable_mark: str,
        cable_source: CableSource = "builtin",
        variant_number: int = 1,
        cable_type: str = "self_regulating",
        electrical_params: dict[str, Any] | None = None,
    ) -> ElectricalCalculation:
        """Ручной выбор кабеля: берёт параметры из объекта, пересчитывает, upsert."""
        obj_result = await self.db.execute(
            select(ProjectObject).where(ProjectObject.id == object_id)
        )
        obj = obj_result.scalar_one_or_none()
        if obj is None:
            raise CalculationError("Объект не найден")
        if not obj.is_valid or not obj.results:
            raise CalculationError("Теплопотери объекта не рассчитаны — невозможно выбрать кабель")

        catalog = await self.load_cable_catalog(cable_source)
        coefficients = (
            await self.get_coefficients() if cable_type in ("single_core", "three_core") else None
        )
        data = self._build_electrical_data(
            obj=obj,
            cable_type=cable_type,
            cable_mark=cable_mark,
            tlt_catalog=catalog,
            overrides=self._base_overrides_with_sources(electrical_params or {}),
            coefficients=coefficients,
        )
        data["cable_mark_source"] = CABLE_MARK_SOURCE_MANUAL
        request = ElectricalRequest(
            object_id=object_id,
            cable_type=cast(Any, cable_type),
            variant_number=variant_number,
            data=data,
        )
        return await self.calc_electrical(request)

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
    ) -> dict[UUID, ElectricalCalculation]:
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
                    ElectricalCalculation.params,
                    ElectricalCalculation.results,
                )
            )
            .where(
                ElectricalCalculation.project_id == project_id,
                ElectricalCalculation.variant_number == variant_number,
                ElectricalCalculation.object_id.in_(object_ids),
            )
        )
        return {
            calc.object_id: calc
            for calc in result.scalars().all()
            if getattr(calc, "object_id", None) is not None
        }

    async def batch_calc_electrical(
        self,
        project_id: UUID,
        cable_source: CableSource = "builtin",
        variant_number: int = 1,
        cable_type: str = "self_regulating",
        electrical_params: dict[str, Any] | None = None,
        skip_manual: bool = False,
        return_calcs: bool = True,
        progress_callback: ProgressCallback | None = None,
        should_cancel: CancelChecker | None = None,
        object_ids: list[UUID] | None = None,
        object_overrides: list[dict[str, Any]] | None = None,
        force_cable_type: bool = False,
    ) -> tuple[int, int, int, list[dict[str, Any]], list[ElectricalCalculation]]:
        """Автоподбор кабеля для всех валидных объектов проекта (cable_mark=None)."""

        async def emit_progress(progress: BatchProgress) -> None:
            if progress_callback is not None:
                await _maybe_await(progress_callback(progress))

        cancel_checker = BatchCancelChecker(should_cancel)

        object_ids = await self._validate_project_object_ids(project_id, object_ids)
        object_overrides_by_id = await self._validate_electrical_object_overrides(
            project_id,
            object_overrides,
            object_ids=object_ids,
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
        catalog = await self.load_cable_catalog(cable_source)
        base_overrides = self._base_overrides_with_sources(electrical_params or {})
        resistive_coefficients: dict[str, float] | None = None
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
            )
            successful_rows: list[dict[str, Any]] = []

            for obj in objects:
                await cancel_checker.check(processed)
                request_data: dict[str, Any] | None = None
                object_cable_type = cable_type
                cable_type_source = CABLE_TYPE_SOURCE_AUTO
                try:
                    existing_calc = existing_by_object_id.get(obj.id)
                    existing_cable_type_source = self._existing_cable_type_source(existing_calc)
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
                        and isinstance(existing_calc.params, dict)
                        and existing_calc.params.get("cable_mark") is not None
                    ):
                        skipped += 1
                        continue
                    overrides = self._merge_electrical_overrides(
                        base_overrides,
                        self._layout_overrides_from_existing(existing_calc),
                    )
                    if (
                        object_cable_type in ("single_core", "three_core")
                        and resistive_coefficients is None
                    ):
                        resistive_coefficients = await self.get_coefficients()
                    request_data = self._build_electrical_data(
                        obj=obj,
                        cable_type=object_cable_type,
                        cable_mark=None,
                        tlt_catalog=catalog,
                        overrides=overrides,
                        coefficients=resistive_coefficients,
                    )
                    request_data["cable_type_source"] = cable_type_source
                    request_data["cable_mark_source"] = CABLE_MARK_SOURCE_AUTO
                    request = ElectricalRequest(
                        object_id=obj.id,
                        cable_type=cast(Any, object_cable_type),
                        variant_number=variant_number,
                        data=request_data,
                    )
                    cable_mark, result_dict = self._calculate_electrical_result(request)
                    successful_rows.append(
                        {
                            "id": existing_calc.id if existing_calc is not None else uuid.uuid4(),
                            "project_id": obj.project_id,
                            "object_id": obj.id,
                            "variant_number": request.variant_number,
                            "cable_type": request.cable_type,
                            "cable_type_source": cable_type_source,
                            "cable_mark": cable_mark,
                            "cable_mark_source": CABLE_MARK_SOURCE_AUTO,
                            "params": request.data,
                            "results": result_dict,
                        }
                    )
                    calculated += 1
                except BatchCancelledError:
                    raise
                except Exception as exc:
                    skipped += 1
                    err_msg = f"{type(exc).__name__}: {exc}"
                    error_request_data = dict(obj.params or {})
                    if request_data:
                        error_request_data.update(request_data)
                    errors.append(
                        {
                            "object_id": str(obj.id),
                            **build_electrical_error_payload(
                                err_msg,
                                object_type=obj.object_type,
                                object_name=(obj.params or {}).get("name"),
                                cable_type=object_cable_type,
                                request_data=error_request_data,
                            ),
                        }
                    )
                    self._upsert_failed_electrical(
                        obj,
                        err_msg,
                        variant_number,
                        object_cable_type,
                        existing_calc=existing_by_object_id.get(obj.id),
                        cable_type_source=cable_type_source,
                        request_data=error_request_data,
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
                await self._bulk_upsert_electrical_calculations(
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
        await use_fast_commit_for_current_transaction(self.db)
        await self.db.commit()
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

    def _upsert_failed_electrical(
        self,
        obj: ProjectObject,
        error_message: str,
        variant_number: int,
        cable_type: str,
        *,
        existing_calc: ElectricalCalculation | None,
        cable_type_source: str | None = None,
        cable_mark_source: str | None = None,
        request_data: dict[str, Any] | None = None,
    ) -> ElectricalCalculation:
        normalized_source = self._normalize_cable_type_source(cable_type_source)
        normalized_mark_source = self._normalize_cable_mark_source(cable_mark_source)
        params = {
            "cable_type_source": normalized_source,
            "cable_mark_source": normalized_mark_source,
        }
        error_request_data = dict(obj.params or {})
        if request_data:
            error_request_data.update(request_data)
            params.update(self._compact_electrical_params(request_data))
        params["cable_type_source"] = normalized_source
        params["cable_mark_source"] = normalized_mark_source
        payload = build_electrical_error_payload(
            error_message,
            object_type=obj.object_type,
            object_name=(obj.params or {}).get("name"),
            cable_type=cable_type,
            request_data=error_request_data,
        )
        row = existing_calc
        if row is None:
            row = ElectricalCalculation(
                project_id=obj.project_id,
                object_id=obj.id,
                variant_number=variant_number,
                cable_type=cable_type,
                cable_type_source=normalized_source,
                cable_mark=None,
                cable_mark_source=normalized_mark_source,
                params=params,
                results=payload,
            )
            self.db.add(row)
        else:
            row.cable_type = cable_type
            row.cable_type_source = normalized_source
            row.cable_mark = None
            row.cable_mark_source = normalized_mark_source
            row.params = params
            row.results = payload
        return row

    async def _save_failed_electrical(
        self,
        obj: ProjectObject,
        error_message: str,
        variant_number: int = 1,
        cable_type: str = "self_regulating",
    ) -> None:
        """Сохраняет или обновляет запись ElectricalCalculation с ошибкой."""
        existing = await self.db.execute(
            select(ElectricalCalculation).where(
                ElectricalCalculation.object_id == obj.id,
                ElectricalCalculation.variant_number == variant_number,
            )
        )
        self._upsert_failed_electrical(
            obj,
            error_message,
            variant_number,
            cable_type,
            existing_calc=existing.scalars().first(),
        )
        await self.db.commit()

    async def get_cable_options(self, object_id: UUID) -> list[dict[str, Any]]:
        from app.reference_data.loader import list_tlt_cables

        return list_tlt_cables()
