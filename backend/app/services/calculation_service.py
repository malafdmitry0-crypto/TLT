"""Сервис расчётов: теплопотери + электротехнический расчёт."""

import asyncio
import copy
import math
import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from inspect import isawaitable
from time import monotonic
from typing import Any, cast
from uuid import UUID

from sqlalchemy import Float, and_, case, delete, func, or_, select, update
from sqlalchemy import cast as sa_cast
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import load_only

from app.core.config import settings as app_settings
from app.core.database import use_fast_commit_for_current_transaction
from app.electrical_domain import ElectricalFormulaError
from app.electrical_input_validation import (
    PROCESS_TEMPERATURE_REQUIRED_CABLE_TYPES,
    ProcessTemperatureInputError,
    ensure_process_temperature,
    required_process_temperature,
)
from app.electrical_result_status import (
    FAILED_ELECTRICAL_CATEGORIES,
    electrical_result_with_lifecycle,
)
from app.electrical_variant_limits import MAX_ELECTRICAL_VARIANTS
from app.formulas.electrical.cable_geometry import compute_tank_cable_length
from app.formulas.electrical.tt_cable_options import (
    build_tt_cable_options,
    extract_tt_catalog_rows,
)
from app.formulas.electrical.tt_contract import (
    ELECTRICAL_TT_FORMULA_FINGERPRINT,
    ELECTRICAL_TT_FORMULA_VERSION,
)
from app.models.cable import CableExtended
from app.models.coefficient import CorrectionCoefficient
from app.models.electrical_calculation import ElectricalCalculation
from app.models.electrical_candidate import ElectricalCandidate
from app.models.electrical_candidate_folder import (
    ElectricalCandidateFolder,
    ElectricalCandidateFolderItem,
)
from app.models.electrical_variant import ElectricalVariant, ElectricalVariantObject
from app.models.project import Project
from app.models.project_electrical_settings import ProjectElectricalSettings
from app.models.project_object import ProjectObject
from app.result import Err, Ok, Result
from app.schemas.calculation import (
    ElectricalCableSelectionRequest,
    ElectricalCalcSummary,
    ElectricalRequest,
)
from app.schemas.json_shapes import HeatLossResultDict
from app.schemas.project import ProjectObjectsPageInfo
from app.services import heat_loss_application
from app.services.cable_snapshot import (
    build_cable_snapshot,
    compare_cable_snapshot,
    lookup_cable_row,
    lookup_cable_row_for_snapshot,
)
from app.services.calculation_errors import CalculationError as CalculationError
from app.services.electrical_assignment_service import (
    ElectricalAssignmentService,
    ElectricalAssignmentServiceError,
)
from app.services.electrical_candidate_dedupe import build_dedupe_key, build_identity_payload
from app.services.electrical_catalog_service import (
    ElectricalCatalogService,
    ElectricalCatalogServiceError,
)
from app.services.electrical_error_guidance import build_electrical_error_payload
from app.services.electrical_input_resolver import (
    ElectricalInputResolutionError,
    configured_electrical_input_resolver,
    normalize_electrical_override_payload,
    require_production_eligible_inputs,
)
from app.services.electrical_result_lifecycle import current_tt_result_sql_predicate
from app.services.electrical_tt_pipeline import (
    PipeElectricalLayout,
    TankElectricalLayout,
    calculate_electrical_tt,
    electrical_tt_catalog_eligibility,
)
from app.services.project_object_params import StoredHeatParams

# Источник каталога кабелей. Значения заданы для совместимости с текущим API;
# внутри функций валидируется через проверку, не enum (чтобы случайная строка
# попадала в default, а не падала).
CableSource = str  # "builtin" | "commercial" | "extended" | "all"

# РЕШЕНИЕ 2026-08-03 (DEC-07, BE-16 ТЗ): legacy-линейка ТЛТ выпилена без
# совместимости; эти типы отклоняются доменной ошибкой на всех входах.
LEGACY_CABLE_TYPES = frozenset({"self_regulating", "single_core", "three_core"})

STALE_ELECTRICAL_ERROR_CODE = "STALE_HEAT_LOSS"
STALE_ELECTRICAL_MESSAGE = "Теплопотери объекта изменились. Пересчитайте электрорасчёт."
TT_ASSIGNMENT_CANONICAL_FIELDS = frozenset(
    {
        "winding_pitch_mm",
        "thread_count",
        "manual_cable_model",
    }
)


class BatchCancelledError(CalculationError):
    pass


class ElectricalCalcConcurrencyError(CalculationError):
    """409-class conflicts for assignment version / idempotency (E8 / B6)."""

    def __init__(
        self,
        *,
        code: str,
        message: str,
        status_code: int = 409,
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details = details or {}

    def as_detail(self) -> dict[str, Any]:
        return {
            "code": self.code,
            "message": self.message,
            "issues": [],
            "details": self.details,
        }


class ElectricalCandidateApplyError(CalculationError):
    """Expected candidate-apply failure with a stable API contract."""

    def __init__(
        self,
        *,
        code: str,
        message: str,
        status_code: int,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code

    def as_detail(self) -> dict[str, str]:
        return {"code": self.code, "message": self.message}


def _clean_exception_message(exc: Exception) -> str:
    message = str(exc).strip()
    return message or type(exc).__name__


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
ELECTRICAL_CANDIDATE_STATUS_APPLICABLE = "applicable"
ELECTRICAL_CANDIDATE_STATUS_ERROR = "error"
ELECTRICAL_CANDIDATE_STATUS_NOT_APPLICABLE = "not_applicable"
ELECTRICAL_CANDIDATE_STATUS_EXCLUDED = "excluded"
ELECTRICAL_CANDIDATE_STATUS_STALE = "stale"
ELECTRICAL_CANDIDATE_NO_GENERATOR_CODE = "no_candidate_generator"


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
        self._tt_project_settings_cache: dict[UUID, ProjectElectricalSettings | None] = {}
        self._tt_assignment_cache: dict[
            tuple[UUID, UUID, UUID], ElectricalVariantObject | None
        ] = {}
        self._tt_calculation_catalogs_cache: dict[str, dict[str, Any]] | None = None
        self._tt_calculation_catalogs_error: ElectricalFormulaError | None = None
        self._tt_error_catalog_snapshots_cache: dict[str, dict[str, Any]] | None = None

    async def electrical_calc_summaries(
        self,
        calculations: list[ElectricalCalculation],
        catalog_source: CableSource = "builtin",
    ) -> list[ElectricalCalcSummary]:
        statuses = await self.cable_snapshot_statuses(calculations, catalog_source)
        return [
            ElectricalCalcSummary(
                id=calc.id,
                object_id=calc.object_id,
                cable_type=calc.cable_type,
                cable_type_source=calc.cable_type_source,
                cable_mark=calc.cable_mark,
                cable_mark_source=calc.cable_mark_source,
                cable_snapshot=calc.cable_snapshot,
                cable_snapshot_status=statuses.get(calc.id),
                variant_number=calc.variant_number,
                params=calc.params,
                results=electrical_result_with_lifecycle(
                    calc.cable_mark,
                    (
                        {**calc.results, "cable_type": calc.cable_type}
                        if calc.cable_type == "self_regulating_tt"
                        and isinstance(calc.results, dict)
                        else calc.results
                    ),
                ),
            )
            for calc in calculations
        ]

    async def cable_snapshot_statuses(
        self,
        calculations: list[ElectricalCalculation],
        catalog_source: CableSource = "builtin",
    ) -> dict[UUID, dict[str, Any]]:
        statuses: dict[UUID, dict[str, Any]] = {}
        _ = catalog_source  # TT authority is resolved from DB, then bundled fallback.
        catalogs = await self._tt_calculation_catalogs()
        power_catalog = catalogs.get("power")
        for calc in calculations:
            snapshot = calc.cable_snapshot
            if not isinstance(snapshot, dict):
                statuses[calc.id] = compare_cable_snapshot(None, None)
                continue
            mark = calc.cable_mark or snapshot.get("cable_mark")
            current_row = (
                self._snapshot_row_from_power_catalog(power_catalog, mark, snapshot=snapshot)
                if calc.cable_type == "self_regulating_tt"
                else None
            )
            statuses[calc.id] = compare_cable_snapshot(snapshot, current_row)
        return statuses

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

        calculation_scope = [ElectricalCalculation.project_id == project_id]
        if electrical_variant_id is not None:
            calculation_scope.append(
                ElectricalCalculation.electrical_variant_id == electrical_variant_id
            )
        elif variant_number is not None:
            calculation_scope.append(ElectricalCalculation.variant_number == variant_number)
        else:
            raise CalculationError("Нужно указать electrical_variant_id или variant_number")

        if object_ids:
            calculations_result = await self.db.execute(
                select(ElectricalCalculation).where(
                    *calculation_scope,
                    ElectricalCalculation.object_id.in_(object_ids),
                )
            )
            calculations = list(calculations_result.scalars().all())
        else:
            calculations = []

        error_code_text = ElectricalCalculation.results["error_code"].astext
        category_text = ElectricalCalculation.results["category"].astext
        stale_text = ElectricalCalculation.results["stale"].astext
        selected_cable_text = ElectricalCalculation.results["selected_cable"].astext
        successful_calc = and_(
            ElectricalCalculation.results.is_not(None),
            error_code_text.is_(None),
            category_text.is_(None),
            func.coalesce(stale_text, "") != "true",
            or_(
                ElectricalCalculation.cable_mark.is_not(None),
                selected_cable_text.is_not(None),
            ),
            current_tt_result_sql_predicate(),
        )
        failed_calc = and_(
            or_(
                error_code_text.is_not(None),
                category_text.in_(tuple(FAILED_ELECTRICAL_CATEGORIES)),
            ),
            func.coalesce(category_text, "") != "unsupported",
            func.coalesce(category_text, "") != "stale",
            func.coalesce(stale_text, "") != "true",
        )
        installed_cable_length = func.coalesce(
            sa_cast(
                ElectricalCalculation.results["layout"]["actual_installed_length_m"].astext,
                Float,
            ),
            sa_cast(ElectricalCalculation.results["section_plan"]["l_fact_m"].astext, Float),
            sa_cast(ElectricalCalculation.results["installed_cable_length"].astext, Float),
            0.0,
        )
        manual_cable_mark = or_(
            ElectricalCalculation.cable_mark_source == CABLE_MARK_SOURCE_MANUAL,
            ElectricalCalculation.params["cable_mark_source"].astext == CABLE_MARK_SOURCE_MANUAL,
            and_(
                ElectricalCalculation.params["cable_mark"].astext.is_not(None),
                ElectricalCalculation.params["cable_mark"].astext != "",
            ),
        )
        total_power = func.coalesce(
            sa_cast(
                ElectricalCalculation.results["electrical"]["total_power_w"].astext,
                Float,
            ),
            sa_cast(ElectricalCalculation.results["total_power"].astext, Float),
            0.0,
        )
        working_current = func.coalesce(
            sa_cast(
                ElectricalCalculation.results["electrical"]["working_current_a"].astext,
                Float,
            ),
            sa_cast(ElectricalCalculation.results["working_current"].astext, Float),
            sa_cast(ElectricalCalculation.results["current"].astext, Float),
            0.0,
        )
        start_current = func.coalesce(
            sa_cast(
                ElectricalCalculation.results["electrical"]["start_current_a"].astext,
                Float,
            ),
            sa_cast(ElectricalCalculation.results["start_current"].astext, Float),
            sa_cast(ElectricalCalculation.results["section_start_current_a"].astext, Float),
            0.0,
        )
        section_count = func.coalesce(
            sa_cast(ElectricalCalculation.results["section_plan"]["count"].astext, Float),
            sa_cast(ElectricalCalculation.results["section_count"].astext, Float),
            sa_cast(ElectricalCalculation.results["num_sections"].astext, Float),
            0.0,
        )
        legacy_system_type = case(
            (
                ElectricalCalculation.cable_type.in_(("self_regulating", "self_regulating_tt")),
                "self_regulating",
            ),
            (
                ElectricalCalculation.cable_type.in_(("single_core", "three_core", "resistive")),
                "resistive",
            ),
            (ElectricalCalculation.cable_type == "skin", "skin"),
            else_=None,
        )
        assignment_join = and_(
            ElectricalVariantObject.project_id == ElectricalCalculation.project_id,
            ElectricalVariantObject.object_id == ElectricalCalculation.object_id,
            ElectricalVariantObject.electrical_variant_id
            == ElectricalCalculation.electrical_variant_id,
        )
        summary_from = ElectricalCalculation.__table__.outerjoin(
            ElectricalVariantObject,
            assignment_join,
        )
        if electrical_variant_id is not None:
            system_type = ElectricalVariantObject.system_type
            ready_successful_calc = and_(
                successful_calc,
                ElectricalVariantObject.assignment_state == "ready",
            )
        else:
            # Pre-UUID compatibility rows have no assignment identity. Bound
            # rows must still obey their authoritative assignment state/type.
            system_type = func.coalesce(
                ElectricalVariantObject.system_type,
                legacy_system_type,
            )
            ready_successful_calc = and_(
                successful_calc,
                or_(
                    ElectricalVariantObject.id.is_(None),
                    ElectricalVariantObject.assignment_state == "ready",
                ),
            )

        def system_totals(system: str) -> list[Any]:
            contributing = and_(ready_successful_calc, system_type == system)
            return [
                func.count(ElectricalCalculation.id).filter(contributing),
                func.coalesce(func.sum(installed_cable_length).filter(contributing), 0.0),
                func.coalesce(func.sum(section_count).filter(contributing), 0.0),
                func.coalesce(func.sum(total_power).filter(contributing), 0.0),
                func.coalesce(func.sum(working_current).filter(contributing), 0.0),
                func.coalesce(func.sum(start_current).filter(contributing), 0.0),
            ]

        summary_result = await self.db.execute(
            select(
                func.count(ElectricalCalculation.id),
                func.count(ElectricalCalculation.id).filter(ready_successful_calc),
                func.count(ElectricalCalculation.id).filter(failed_calc),
                func.count(ElectricalCalculation.id).filter(manual_cable_mark),
                func.coalesce(func.sum(installed_cable_length).filter(ready_successful_calc), 0.0),
                func.coalesce(func.sum(total_power).filter(ready_successful_calc), 0.0),
                func.coalesce(func.sum(working_current).filter(ready_successful_calc), 0.0),
                func.coalesce(func.sum(section_count).filter(ready_successful_calc), 0.0),
                func.coalesce(func.sum(start_current).filter(ready_successful_calc), 0.0),
                *system_totals("self_regulating"),
                *system_totals("resistive"),
                *system_totals("skin"),
            )
            .select_from(summary_from)
            .where(*calculation_scope)
        )
        summary_values = summary_result.one()
        (
            electrical_total,
            calculated_count,
            failed_count,
            manual_cable_mark_count,
            total_cable_length,
            summary_total_power,
            total_current,
            total_sections,
            total_start_current,
            *system_values,
        ) = summary_values

        system_keys = ("self_regulating", "resistive", "skin")
        system_summaries = {}
        for index, system in enumerate(system_keys):
            count, length, sections, power, current_value, start = system_values[
                index * 6 : (index + 1) * 6
            ]
            system_summaries[system] = {
                "object_count": int(count or 0),
                "cable_length_m": float(length or 0.0),
                "section_count": int(sections or 0),
                "power_w": float(power or 0.0),
                "working_current_a": float(current_value or 0.0),
                "start_current_a": float(start or 0.0),
            }
        system_summaries["total"] = {
            "object_count": int(calculated_count or 0),
            "cable_length_m": float(total_cable_length or 0.0),
            "section_count": int(total_sections or 0),
            "power_w": float(summary_total_power or 0.0),
            "working_current_a": float(total_current or 0.0),
            "start_current_a": float(total_start_current or 0.0),
        }

        total_pages = math.ceil(total_objects / page_size) if total_objects else 0
        summary = {
            "total_objects": total_objects,
            "valid_objects": valid_objects,
            "invalid_objects": total_objects - valid_objects,
            "electrical_calculations_total": int(electrical_total or 0),
            "calculated_count": int(calculated_count or 0),
            "failed_count": int(failed_count or 0),
            "manual_cable_mark_count": int(manual_cable_mark_count or 0),
            "total_cable_length": float(total_cable_length or 0.0),
            "total_power": float(summary_total_power or 0.0),
            "total_current": float(total_current or 0.0),
            "total_sections": int(total_sections or 0),
            "total_start_current_a": float(total_start_current or 0.0),
            "system_summaries": system_summaries,
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
        coeffs = {
            row.key: row.value
            for row in result.scalars().all()
            if row.key not in {"wind_factor", "location_indoor", "location_outdoor"}
        }
        await cache.aset("coefficients", coeffs, ttl=3600)
        return coeffs

    @staticmethod
    def _extended_cable_catalog_entry(
        c: CableExtended,
        *,
        source: str = "extended",
        technical_defaults: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        raw_params = getattr(c, "params", None)
        params = raw_params if isinstance(raw_params, dict) else {}
        resistance_ohm_km = params.get("resistance_ohm_km")
        if resistance_ohm_km is None and c.resistance_per_meter is not None:
            resistance_ohm_km = float(c.resistance_per_meter) * 1000.0
        defaults = technical_defaults or {}
        if resistance_ohm_km is None:
            resistance_ohm_km = defaults.get("resistance_ohm_km")
        power_per_meter = c.power_per_meter
        if power_per_meter is None:
            power_per_meter = defaults.get("power_per_meter")
        voltage = params.get("voltage")
        if voltage is None:
            voltage = defaults.get("voltage")
        max_temperature = c.max_temperature
        if max_temperature is None:
            max_temperature = defaults.get("max_temperature")
        min_temperature = c.min_temperature
        if min_temperature is None:
            min_temperature = defaults.get("min_temperature")
        conductor_section = (
            params.get("conductor_section_mm2")
            or params.get("conductor_cross_section")
            or params.get("cross_section")
            or defaults.get("conductor_section_mm2")
            or defaults.get("conductor_cross_section")
            or defaults.get("cross_section")
        )
        diameter_mm = params.get("diameter_mm")
        if diameter_mm is None:
            diameter_mm = defaults.get("diameter_mm")
        nominal_size_mm = params.get("nominal_size_mm")
        if nominal_size_mm is None:
            nominal_size_mm = defaults.get("nominal_size_mm")
        return {
            "source": source,
            "cable_type": c.cable_type,
            "brand": c.brand or defaults.get("brand"),
            "model": c.model,
            "power_per_meter": power_per_meter,
            "max_temperature": max_temperature,
            "min_temperature": min_temperature,
            "voltage": voltage,
            "resistance_per_meter": c.resistance_per_meter,
            "resistance_ohm_km": resistance_ohm_km,
            "conductor_cross_section": conductor_section,
            "conductor_section_mm2": conductor_section,
            "diameter_mm": diameter_mm,
            "nominal_size_mm": nominal_size_mm,
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
            "params": params,
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
        overlay = cls._extended_cable_catalog_entry(
            commercial,
            source="commercial",
            technical_defaults=base,
        )
        for key, value in overlay.items():
            if key in {
                "model",
                "power_per_meter",
                "max_temperature",
                "min_temperature",
                "voltage",
            }:
                continue
            entry[key] = value
        return entry

    async def load_cable_catalog(self, source: CableSource = "builtin") -> list[dict[str, Any]]:
        """Возвращает каталог кабелей по запрошенному источнику.

        РЕШЕНИЕ 2026-08-03 (DEC-07): встроенная линейка ТЛТ отключена — builtin
        всегда пуст. ТЕХДОЛГ №8: удалить это plumbing (tlt_catalog) целиком.
        """
        if source not in ("builtin", "commercial", "extended", "all"):
            source = "builtin"
        builtin: list[dict[str, Any]] = []
        builtin_by_model = {str(c["model"]): c for c in builtin}
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
        extended = [
            self._extended_cable_catalog_entry(
                c,
                technical_defaults=builtin_by_model.get(c.model),
            )
            for c in rows
        ]
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
        *,
        apply_climate_policy: bool = True,
        validated_params: StoredHeatParams | None = None,
    ) -> HeatLossResultDict:
        return heat_loss_application.calc_heat_loss(
            object_type,
            data,
            coefficients=coefficients,
            apply_climate=apply_climate_policy,
            stored=validated_params,
        )

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
            `obj.validation_errors` со structured fields (`error_code`,
            `category`, `message`, `field`, `hint`).
        """
        await self.try_recalculate(obj)
        # Независимо от Ok/Err, try_recalculate мутирует obj на месте
        # (обновляет results/is_valid/validation_errors). Возвращаем тот же obj.
        return obj

    async def mark_electrical_calculations_stale(
        self,
        project_id: UUID,
        object_ids: list[UUID] | set[UUID] | tuple[UUID, ...],
        *,
        reason: str = "heat_loss_changed",
    ) -> int:
        """Помечает существующие электрорасчёты как требующие ручного пересчёта.

        Записи остаются в БД вместе с выбранной маркой и прежними result-полями,
        но structured status перестаёт считать их успешными. Новый пересчёт
        полностью перезапишет `results` через обычный upsert.
        """
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
        for calc in result.scalars().all():
            previous = dict(calc.results or {})
            if previous.get("category") == "stale":
                continue
            calc.results = {
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
        if coefficients is None:
            outcome = await heat_loss_application.evaluate_project_object_heat(
                obj.object_type,
                obj.params,
                load_coefficients=self.get_coefficients,
            )
        else:
            outcome = await heat_loss_application.evaluate_project_object_heat(
                obj.object_type,
                obj.params,
                coefficients=coefficients,
            )
        if outcome.params_to_persist is not None:
            obj.params = outcome.params_to_persist
        obj.results = outcome.results
        obj.is_valid = outcome.is_valid
        obj.validation_errors = outcome.validation_errors
        if outcome.is_valid:
            return Ok(obj)
        if outcome.error_message is None:  # pragma: no cover - outcome invariant
            raise RuntimeError("Невалидный теплорасчёт не содержит описание ошибки")
        return Err(outcome.error_message)

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
                    ProjectObject.version,
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
        *,
        commit: bool = True,
    ) -> tuple[int, int, list[dict[str, Any]]]:
        async def emit_progress(progress: BatchProgress) -> None:
            if progress_callback is not None:
                await _maybe_await(progress_callback(progress))

        cancel_checker = BatchCancelChecker(
            should_cancel,
            cancel_message="Пакетный пересчёт теплопотерь отменён",
        )
        await self.db.execute(
            select(Project)
            .where(Project.id == project_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        total_count = await self._heat_batch_count(project_id, object_ids)
        updated = 0
        failed = 0
        errors: list[dict[str, Any]] = []

        await emit_progress(BatchProgress(current=0, total=total_count, phase="prepare"))
        await cancel_checker.check(0, force=True)

        coefficients = await self.get_coefficients() if total_count > 0 else {}
        processed = 0
        processed_object_ids: list[UUID] = []
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
            chunk_object_ids = [obj.id for obj in objects]
            processed_object_ids.extend(chunk_object_ids)
            await self.mark_electrical_calculations_stale(
                project_id,
                chunk_object_ids,
                reason="heat_loss_batch_recalculate",
            )
            await self.db.flush()
            await asyncio.sleep(0)

        await cancel_checker.check(processed, force=True)
        # Specs of affected ERs are already marked inside each
        # mark_electrical_calculations_stale → mark_assignments_stale_for_objects.
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
        if commit:
            await use_fast_commit_for_current_transaction(self.db)
            await self.db.commit()
        else:
            await self.db.flush()
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

    async def calc_electrical(
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
        await self._assert_expected_assignment_version(
            obj,
            electrical_variant_id=resolved_variant_id,
            expected_assignment_version=request.expected_assignment_version,
        )
        try:
            self._hydrate_electrical_request_from_object(request, obj)
            await self._prepare_self_regulating_tt_request(
                request,
                obj,
                electrical_variant_id=resolved_variant_id,
            )
            cable_mark, result_dict = self._calculate_electrical_result(request)
        except (ElectricalFormulaError, ElectricalInputResolutionError) as exc:
            if request.cable_type == "self_regulating_tt":
                await self._upsert_failed_electrical(
                    obj,
                    exc,
                    request.variant_number,
                    request.cable_type,
                    cable_type_source=request.data.get("cable_type_source"),
                    cable_mark_source=request.data.get("cable_mark_source"),
                    request_data=request.data,
                    electrical_variant_id=resolved_variant_id,
                )
                if commit:
                    await self.db.commit()
            raise
        cable_snapshot = self._build_cable_snapshot_for_result(
            request=request,
            cable_mark=cable_mark,
            result_dict=result_dict,
        )

        calc = await self._upsert_electrical_calculation(
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

    @staticmethod
    def _tt_optional_object_value(
        target: dict[str, Any],
        canonical_key: str,
        source: dict[str, Any],
        *source_keys: str,
    ) -> None:
        for key in source_keys:
            if key in source:
                target[canonical_key] = source.get(key)
                return

    @classmethod
    def _tt_ambient_temperature(cls, obj: ProjectObject) -> float | None:
        params = obj.params if isinstance(obj.params, dict) else {}
        ambient = cls._num(params.get("ambient_temperature"))
        ground = cls._num(params.get("ground_temperature"))
        if params.get("placement") != "underground":
            return ambient if ambient is not None else ground
        if obj.object_type == "tank":
            available = [value for value in (ambient, ground) if value is not None]
            return min(available) if available else None
        return ground if ground is not None else ambient

    def _tt_object_heat_inputs(
        self,
        obj: ProjectObject,
        explicit_payload: dict[str, Any],
        assignment_overrides: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Map authoritative object/Heat data without engineering defaults."""
        params = obj.params if isinstance(obj.params, dict) else {}
        results = obj.results if isinstance(obj.results, dict) else {}
        values: dict[str, Any] = {}

        self._tt_optional_object_value(
            values, "product_temperature_c", params, "process_temperature"
        )
        ambient = self._tt_ambient_temperature(obj)
        if ambient is not None:
            values["ambient_temperature_c"] = ambient
        cold_start = params.get("min_switch_temperature")
        if cold_start is not None:
            values["cold_start_temperature_c"] = cold_start
        if obj.object_type != "tank":
            self._tt_optional_object_value(
                values, "winding_pitch_mm", params, "winding_pitch", "winding_pitch_mm"
            )
        self._tt_optional_object_value(values, "thread_count", params, "number_of_threads")
        self._tt_optional_object_value(values, "selection_policy", params, "selection_policy")

        safety_factor = results.get("safety_factor_applied")
        if safety_factor is None:
            safety_factor = params.get("safety_factor")
        if safety_factor is not None:
            values["safety_factor"] = safety_factor

        if obj.object_type == "tank":
            tank_layout = self._tt_tank_layout(
                obj,
                explicit_payload,
                assignment_overrides or {},
            )
            base_length = tank_layout["base_length_m"]
            values["base_length_m"] = base_length
            values["_tank_layout"] = tank_layout
            if safety_factor is not None and self._num(safety_factor) not in (None, 0):
                heat_loss_without_repeat = self._tank_heat_loss_without_double_safety(
                    results,
                    float(safety_factor),
                )
                values["heat_loss_per_meter_w"] = heat_loss_without_repeat / base_length
        else:
            base_length = self._num(results.get("effective_length"))
            if base_length is None:
                base_length = self._num(params.get("pipe_length"))
            if base_length is not None:
                values["base_length_m"] = base_length
            heat_loss = self._num(results.get("heat_loss_per_meter_base"))
            if heat_loss is not None:
                values["heat_loss_per_meter_w"] = heat_loss
            outer_diameter_m = self._num(params.get("outer_diameter"))
            if outer_diameter_m is not None:
                values["outer_diameter_mm"] = outer_diameter_m * 1000.0
        return values

    def _tt_tank_layout(
        self,
        obj: ProjectObject,
        explicit_payload: dict[str, Any],
        assignment_overrides: dict[str, Any],
    ) -> dict[str, Any]:
        """Resolve TT tank geometry without pipe aliases or hidden defaults."""
        params = obj.params if isinstance(obj.params, dict) else {}
        shape = params.get("shape")
        if shape is None:
            raise ElectricalInputResolutionError(
                "ELECTRICAL_INPUT_REQUIRED",
                "Required electrical input is missing: tank_shape",
                details={"field": "tank_shape"},
            )
        if shape not in {"cylindrical", "rectangular"}:
            raise ElectricalInputResolutionError(
                "ELECTRICAL_TANK_SHAPE_UNSUPPORTED",
                "TT cable layout is not defined for this tank shape",
                details={"shape": shape},
            )

        layout_values: dict[str, float] = {}
        layout_sources: dict[str, str] = {}
        assignment_keys = {
            "heating_height": "tank_heating_height_m",
            "laying_step": "tank_laying_step_m",
        }
        for field, assignment_key in assignment_keys.items():
            if explicit_payload.get(field) is not None:
                raw_value = explicit_payload[field]
                source = "explicit_request"
            elif assignment_overrides.get(assignment_key) is not None:
                raw_value = assignment_overrides[assignment_key]
                source = "assignment_override"
            else:
                raw_value = params.get(field)
                source = "object_heat"
            value = self._num(raw_value)
            if value is None:
                raise ElectricalInputResolutionError(
                    "ELECTRICAL_INPUT_REQUIRED",
                    f"Required electrical input is missing: {field}",
                    details={"field": field},
                )
            layout_values[field] = value
            layout_sources[field] = source

        unique_sources = set(layout_sources.values())
        if unique_sources == {"explicit_request"}:
            base_length_source = "explicit_request_layout"
        elif unique_sources == {"assignment_override"}:
            base_length_source = "assignment_layout"
        elif unique_sources == {"object_heat"}:
            base_length_source = "object_layout"
        else:
            base_length_source = "mixed_layout"

        geometry: dict[str, float | str] = {
            "tank_shape": shape,
            **layout_values,
        }
        if shape == "cylindrical":
            diameter = self._num(params.get("diameter"))
            geometry["tank_diameter"] = diameter if diameter is not None else 0.0
        else:
            length = self._num(params.get("length"))
            width = self._num(params.get("width"))
            geometry["tank_length"] = length if length is not None else 0.0
            geometry["tank_width"] = width if width is not None else 0.0

        try:
            base_length = compute_tank_cable_length(
                shape=shape,
                diameter=cast(float | None, geometry.get("tank_diameter")),
                length=cast(float | None, geometry.get("tank_length")),
                width=cast(float | None, geometry.get("tank_width")),
                heating_height=layout_values["heating_height"],
                laying_step=layout_values["laying_step"],
            )
        except ValueError as exc:
            raise ElectricalInputResolutionError(
                "ELECTRICAL_INPUT_INVALID",
                "Tank cable layout inputs are invalid",
                details={"shape": shape, "reason": str(exc)},
            ) from exc
        return {
            **geometry,
            "base_length_m": base_length,
            "base_length_source": base_length_source,
            "input_sources": layout_sources,
        }

    async def _tt_project_settings(
        self,
        project_id: UUID,
    ) -> ProjectElectricalSettings | None:
        if project_id not in self._tt_project_settings_cache:
            self._tt_project_settings_cache[project_id] = await self.db.get(
                ProjectElectricalSettings,
                project_id,
            )
        return self._tt_project_settings_cache[project_id]

    async def _tt_calculation_catalogs(self) -> dict[str, dict[str, Any]]:
        """Resolve one immutable catalog set per service/batch execution."""
        if self._tt_calculation_catalogs_cache is not None:
            return self._tt_calculation_catalogs_cache
        if self._tt_calculation_catalogs_error is not None:
            raise self._tt_calculation_catalogs_error
        try:
            catalogs = await ElectricalCatalogService(self.db).active_calculation_catalogs()
        except ElectricalCatalogServiceError as exc:
            error = ElectricalFormulaError(
                exc.code,
                exc.message,
                details=exc.details,
                status_code=exc.status_code,
            )
            self._tt_calculation_catalogs_error = error
            raise error from exc
        self._tt_calculation_catalogs_cache = catalogs
        return catalogs

    async def _tt_error_provenance(self) -> dict[str, Any]:
        """Build BE-14 provenance even when the TT calculation itself failed."""
        if self._tt_error_catalog_snapshots_cache is not None:
            snapshots = copy.deepcopy(self._tt_error_catalog_snapshots_cache)
            return self._tt_error_provenance_payload(snapshots)
        try:
            catalogs = await self._tt_calculation_catalogs()
            snapshots = {
                kind: {key: value for key, value in catalogs[kind].items() if key != "payload"}
                for kind in ("power", "section", "bom")
            }
        except ElectricalFormulaError:
            metadata = await ElectricalCatalogService(self.db).metadata()
            available = {
                catalog.kind: catalog.model_dump(mode="json") for catalog in metadata.catalogs
            }
            snapshots = {
                kind: available.get(kind)
                or {
                    "id": None,
                    "kind": kind,
                    "version": None,
                    "status": "missing",
                    "source": None,
                    "source_checksum": None,
                    "payload_checksum": None,
                    "schema_version": None,
                    "production_approved": False,
                    "authority": "unavailable",
                }
                for kind in ("power", "section", "bom")
            }
        self._tt_error_catalog_snapshots_cache = copy.deepcopy(snapshots)
        return self._tt_error_provenance_payload(snapshots)

    @staticmethod
    def _tt_error_provenance_payload(
        snapshots: dict[str, dict[str, Any]],
    ) -> dict[str, Any]:
        return {
            "catalogs": snapshots,
            "production_eligible": False,
            "provenance": {
                "formula_version": ELECTRICAL_TT_FORMULA_VERSION,
                "formula_fingerprint": ELECTRICAL_TT_FORMULA_FINGERPRINT,
                "catalogs": snapshots,
                "production_eligible": False,
            },
        }

    async def _prefetch_tt_assignments(
        self,
        project_id: UUID,
        electrical_variant_id: UUID | None,
        object_ids: list[UUID],
    ) -> None:
        if electrical_variant_id is None or not object_ids:
            return
        missing = [
            object_id
            for object_id in object_ids
            if (project_id, electrical_variant_id, object_id) not in self._tt_assignment_cache
        ]
        if not missing:
            return
        rows = await self.db.scalars(
            select(ElectricalVariantObject).where(
                ElectricalVariantObject.project_id == project_id,
                ElectricalVariantObject.electrical_variant_id == electrical_variant_id,
                ElectricalVariantObject.object_id.in_(missing),
            )
        )
        by_object_id = {row.object_id: row for row in rows.all()}
        for object_id in missing:
            self._tt_assignment_cache[(project_id, electrical_variant_id, object_id)] = (
                by_object_id.get(object_id)
            )

    async def _tt_assignment(
        self,
        project_id: UUID,
        electrical_variant_id: UUID | None,
        object_id: UUID,
    ) -> ElectricalVariantObject | None:
        if electrical_variant_id is None:
            return None
        key = (project_id, electrical_variant_id, object_id)
        if key not in self._tt_assignment_cache:
            await self._prefetch_tt_assignments(
                project_id,
                electrical_variant_id,
                [object_id],
            )
        return self._tt_assignment_cache.get(key)

    async def _assert_expected_assignment_version(
        self,
        obj: ProjectObject,
        *,
        electrical_variant_id: UUID | None,
        expected_assignment_version: int | None,
    ) -> None:
        """Optimistic concurrency for assigned ER objects (E8 / B6).

        When the object has an assignment under the target ER and the client
        sent ``expected_assignment_version``, versions must match. When an
        assignment exists and the client omitted the version, we still accept
        the write for legacy clients but do not silently ignore a mismatch.
        """
        if electrical_variant_id is None:
            return
        assignment = await self._tt_assignment(
            obj.project_id,
            electrical_variant_id,
            obj.id,
        )
        if assignment is None:
            return
        if expected_assignment_version is None:
            return
        if int(assignment.version) != int(expected_assignment_version):
            raise ElectricalCalcConcurrencyError(
                code="ELECTRICAL_ASSIGNMENT_VERSION_CONFLICT",
                message="Assignment был изменён другим запросом; обновите данные",
                status_code=409,
                details={
                    "conflicts": [
                        {
                            "object_id": str(obj.id),
                            "expected_version": expected_assignment_version,
                            "current_version": assignment.version,
                        }
                    ]
                },
            )

    async def _prepare_self_regulating_tt_request(
        self,
        request: ElectricalRequest,
        obj: ProjectObject,
        *,
        electrical_variant_id: UUID | None,
    ) -> None:
        """Resolve canonical TT inputs once and run the shared pure pipeline."""
        if request.cable_type != "self_regulating_tt":
            return
        if not obj.is_valid or not obj.results or obj.results.get("stale"):
            raise ElectricalInputResolutionError(
                "ELECTRICAL_HEAT_LOSS_REQUIRED",
                "Для электрорасчёта требуются актуальные теплопотери объекта",
                details={"object_id": str(obj.id)},
            )
        raw_marker = request.data.pop("_tt_explicit_overrides", None)
        explicit_payload = dict(raw_marker) if isinstance(raw_marker, dict) else dict(request.data)
        if obj.object_type == "tank":
            # A tank has its own layout in metres. Never reinterpret a pipe
            # winding pitch as tank laying_step or as canonical pipe winding.
            object_params = obj.params if isinstance(obj.params, dict) else {}
            unsupported_layout_fields = sorted(
                field
                for field in ("winding_pitch", "winding_pitch_mm", "outer_diameter_mm")
                if explicit_payload.get(field) is not None or object_params.get(field) is not None
            )
            if unsupported_layout_fields:
                raise ElectricalInputResolutionError(
                    "ELECTRICAL_TANK_LAYOUT_INPUT_UNSUPPORTED",
                    "Tank layout does not accept pipe winding inputs",
                    details={"fields": unsupported_layout_fields},
                )
            explicit_payload.pop("winding_pitch", None)
            explicit_payload.pop("winding_pitch_mm", None)
            explicit_payload.pop("outer_diameter_mm", None)
        normalized = normalize_electrical_override_payload(explicit_payload)
        project_settings = await self._tt_project_settings(obj.project_id)
        assignment = await self._tt_assignment(
            obj.project_id,
            electrical_variant_id,
            obj.id,
        )
        assignment_overrides = (
            dict(getattr(assignment, "electrical_overrides", {}) or {})
            if assignment is not None
            else {}
        )
        if obj.object_type == "tank":
            unsupported_assignment_fields = sorted(
                field
                for field in ("winding_pitch", "winding_pitch_mm", "outer_diameter_mm")
                if assignment_overrides.get(field) is not None
            )
            if unsupported_assignment_fields:
                raise ElectricalInputResolutionError(
                    "ELECTRICAL_TANK_LAYOUT_INPUT_UNSUPPORTED",
                    "Tank layout does not accept pipe winding inputs",
                    details={"fields": unsupported_assignment_fields},
                )
        project_values = (
            {
                "nominal_voltage_v": project_settings.nominal_voltage_v,
                "max_section_start_current_a": project_settings.max_section_start_current_a,
            }
            if project_settings is not None
            else {}
        )
        assignment_values = {
            field: assignment_overrides[field]
            for field in TT_ASSIGNMENT_CANONICAL_FIELDS
            if field in assignment_overrides
        }
        if assignment_overrides.get("supply_voltage_v") is not None:
            assignment_values["nominal_voltage_v"] = assignment_overrides["supply_voltage_v"]
        if obj.object_type == "tank":
            assignment_values.pop("winding_pitch_mm", None)
        object_heat = self._tt_object_heat_inputs(
            obj,
            explicit_payload,
            assignment_overrides,
        )
        resolved = configured_electrical_input_resolver().resolve(
            explicit=normalized.overrides,
            assignment=assignment_values,
            project_settings=project_values,
            object_heat=object_heat,
            legacy_aliases=normalized.legacy_aliases,
            boundary_warnings=normalized.warnings,
        )
        tank_layout = object_heat.get("_tank_layout")
        if isinstance(tank_layout, dict):
            base_length_source = tank_layout.get("base_length_source")
            if isinstance(base_length_source, str):
                resolved.sources["base_length_m"] = base_length_source
        if app_settings.is_production:
            require_production_eligible_inputs(resolved)
        current_limit_source = resolved.sources.get("max_section_start_current_a")
        assignment_applied_fields = sorted(
            field for field, source in resolved.sources.items() if source == "assignment_override"
        )
        if isinstance(tank_layout, dict):
            tank_sources = tank_layout.get("input_sources")
            if isinstance(tank_sources, dict):
                assignment_applied_fields.extend(
                    ("tank_heating_height_m" if key == "heating_height" else "tank_laying_step_m")
                    for key, source in tank_sources.items()
                    if source == "assignment_override"
                )
        assignment_applied_fields = sorted(set(assignment_applied_fields))
        effective_assignment_overrides = dict(assignment_overrides)
        effective_assignment_version = assignment.version if assignment is not None else None
        if (
            assignment is not None
            and resolved.sources.get("nominal_voltage_v") == "explicit_request"
        ):
            explicit_voltage = str(resolved.values.nominal_voltage_v)
            if self._num(effective_assignment_overrides.get("supply_voltage_v")) != float(
                resolved.values.nominal_voltage_v
            ):
                effective_assignment_overrides["supply_voltage_v"] = explicit_voltage
                effective_assignment_version = assignment.version + 1
        assignment_snapshot = (
            {
                "id": (str(assignment.id) if getattr(assignment, "id", None) is not None else None),
                "version": effective_assignment_version,
                "source": "electrical_variant_object",
                "electrical_overrides": effective_assignment_overrides,
                "applied_fields": assignment_applied_fields,
            }
            if assignment is not None
            else None
        )
        provenance = {
            "object_snapshot": {
                "id": str(obj.id),
                "project_id": str(obj.project_id),
                "object_type": str(getattr(obj.object_type, "value", obj.object_type)),
                "version": obj.version,
            },
            "heat_snapshot": {
                "version": obj.version,
                "base_length_m": object_heat.get("base_length_m"),
                "heat_loss_per_meter_w": object_heat.get("heat_loss_per_meter_w"),
                "safety_factor": object_heat.get("safety_factor"),
                "tank_layout": object_heat.get("_tank_layout"),
            },
            "object_version": obj.version,
            "heat_result_version": obj.version,
            "project_settings_version": (
                project_settings.version
                if project_settings is not None
                and (
                    current_limit_source == "project_setting"
                    or resolved.sources.get("nominal_voltage_v") == "project_setting"
                )
                else None
            ),
            "assignment_version": effective_assignment_version,
            "assignment_snapshot": assignment_snapshot,
        }
        calculation_catalogs = await self._tt_calculation_catalogs()
        if isinstance(tank_layout, dict):
            layout_contract: PipeElectricalLayout | TankElectricalLayout = TankElectricalLayout(
                shape=str(tank_layout["tank_shape"]),
                heating_height_m=float(tank_layout["heating_height"]),
                laying_step_m=float(tank_layout["laying_step"]),
                base_length_m=float(tank_layout["base_length_m"]),
                base_length_source=str(tank_layout["base_length_source"]),
                input_sources=cast(dict[str, str], tank_layout["input_sources"]),
            )
        else:
            layout_contract = PipeElectricalLayout()
        result_dict = calculate_electrical_tt(
            resolved,
            layout=layout_contract,
            provenance=provenance,
            calculation_catalogs=calculation_catalogs,
        )
        catalogs = result_dict.get("catalogs", {})
        catalogs_eligible, invalid_catalogs = electrical_tt_catalog_eligibility(catalogs)
        if app_settings.is_production and not catalogs_eligible:
            primary = invalid_catalogs[0]
            raise ElectricalFormulaError(
                "ELECTRICAL_CATALOG_SOURCE_UNREGISTERED",
                "Для production-расчёта требуются утверждённые каталоги",
                details={
                    "catalog_kind": primary["kind"],
                    "status": primary["status"],
                    "version": primary["version"],
                    "invalid_catalogs": invalid_catalogs,
                },
            )
        values = resolved.values
        applied_current_limit = float(result_dict["section_plan"]["max_start_current_a"])
        preserved = {
            key: value
            for key, value in request.data.items()
            if key in {"cable_source", "cable_type_source", "cable_mark_source"}
        }
        request_data = {
            **preserved,
            "required_power_per_meter": float(values.heat_loss_per_meter_w),
            "pipe_length": float(values.base_length_m),
            "process_temperature": float(values.product_temperature_c),
            "ambient_temperature": float(values.ambient_temperature_c),
            "supply_voltage": float(values.nominal_voltage_v),
            "max_start_current_per_section": applied_current_limit,
            "winding_coefficient": result_dict["winding_coefficient"],
            "number_of_threads": values.thread_count,
            "requested_number_of_threads": values.thread_count,
            "number_of_threads_source": (
                THREAD_SOURCE_MANUAL if values.thread_count is not None else THREAD_SOURCE_AUTO
            ),
            "cable_mark": values.manual_cable_model,
            "selection_policy": values.selection_policy,
            "safety_factor": float(values.safety_factor),
            "cold_start_temperature_c": float(values.cold_start_temperature_c),
            "max_section_start_current_a": applied_current_limit,
            "_tt_pipeline_result": result_dict,
        }
        if isinstance(layout_contract, PipeElectricalLayout):
            request_data["winding_pitch"] = (
                float(values.winding_pitch_mm) if values.winding_pitch_mm is not None else None
            )
            request_data["outer_diameter_mm"] = (
                float(values.outer_diameter_mm) if values.outer_diameter_mm is not None else None
            )
        request.data = request_data

    def _hydrate_electrical_request_from_object(
        self,
        request: ElectricalRequest,
        obj: ProjectObject,
    ) -> None:
        if request.cable_type == "self_regulating_tt":
            return
        if request.cable_type not in PROCESS_TEMPERATURE_REQUIRED_CABLE_TYPES:
            return
        obj_params = obj.params if isinstance(obj.params, dict) else {}
        try:
            ensure_process_temperature(request.data, obj_params)
        except ProcessTemperatureInputError as exc:
            raise CalculationError(str(exc)) from exc

    def _calculate_electrical_result(
        self, request: ElectricalRequest
    ) -> tuple[str | None, dict[str, Any]]:
        cable_type = request.cable_type
        if cable_type in LEGACY_CABLE_TYPES:
            # РЕШЕНИЕ 2026-08-03: legacy-линейка ТЛТ выпилена без совместимости
            # (DEC-07, BE-16 ТЗ). Guard остаётся для внутренних вызовов —
            # API-схемы эти типы уже не пропускают.
            raise ElectricalFormulaError(
                "ELECTRICAL_LEGACY_CABLE_TYPE_UNSUPPORTED",
                "Legacy-линейка ТЛТ удалена. Расчёт доступен только для "
                "саморегулирующегося кабеля серий ТТН/ТТВ/ТТХ (self_regulating_tt).",
                details={"cable_type": cable_type},
            )
        if cable_type == "self_regulating_tt":
            prepared_result = request.data.pop("_tt_pipeline_result", None)
            if not isinstance(prepared_result, dict):
                raise CalculationError(
                    "TT calculation must be prepared by the canonical input pipeline"
                )
            result_dict = prepared_result
            cable_mark = str(result_dict["cable_mark"])
            return cable_mark, result_dict
        raise CalculationError(f"Для типа кабеля «{cable_type}» расчётная формула не реализована")

    def _build_cable_snapshot_for_result(
        self,
        *,
        request: ElectricalRequest,
        cable_mark: str | None,
        result_dict: dict[str, Any] | None,
    ) -> dict[str, Any] | None:
        return self._build_cable_snapshot_from_data(
            cable_type=request.cable_type,
            cable_mark=cable_mark,
            request_data=request.data,
            result_dict=result_dict,
        )

    def _build_cable_snapshot_from_data(
        self,
        *,
        cable_type: str,
        cable_mark: str | None,
        request_data: dict[str, Any],
        result_dict: dict[str, Any] | None,
    ) -> dict[str, Any] | None:
        cable_row = self._snapshot_cable_row(
            cable_type,
            cable_mark,
            request_data,
            result_dict,
        )
        if cable_type == "self_regulating_tt" and cable_row is None:
            return None
        cable_mark_source = self._resolve_cable_mark_source(request_data)
        return build_cable_snapshot(
            cable_type=cable_type,
            cable_mark=cable_mark,
            cable_row=cable_row,
            requested_catalog_source=str(request_data.get("cable_source") or "builtin"),
            cable_mark_source=cable_mark_source,
            result_dict=result_dict,
        )

    def _snapshot_cable_row(
        self,
        cable_type: str,
        cable_mark: str | None,
        request_data: dict[str, Any],
        result_dict: dict[str, Any] | None,
    ) -> dict[str, Any] | None:
        if not cable_mark:
            return None
        if cable_type == "self_regulating_tt":
            catalogs = result_dict.get("catalogs") if isinstance(result_dict, dict) else None
            power_catalog = catalogs.get("power") if isinstance(catalogs, dict) else None
            if isinstance(power_catalog, dict):
                exact_row = power_catalog.get("row")
                if isinstance(exact_row, dict):
                    return self._snapshot_row_with_catalog_identity(exact_row, power_catalog)
            return self._snapshot_row_from_power_catalog(
                self._tt_calculation_catalogs_cache,
                cable_mark,
            )
        catalog_value = request_data.get("cable_catalog")
        catalog = catalog_value if isinstance(catalog_value, list) else None
        return lookup_cable_row(catalog, cable_mark, cable_type)

    @staticmethod
    def _snapshot_catalog_identity(catalog: dict[str, Any]) -> dict[str, Any]:
        return {
            key: catalog.get(key)
            for key in (
                "id",
                "kind",
                "version",
                "authority",
                "source",
                "source_checksum",
                "payload_checksum",
                "schema_version",
                "production_approved",
            )
        }

    @classmethod
    def _snapshot_row_with_catalog_identity(
        cls,
        row: dict[str, Any],
        catalog: dict[str, Any],
    ) -> dict[str, Any]:
        return {
            **row,
            "_catalog_identity": cls._snapshot_catalog_identity(catalog),
        }

    @classmethod
    def _snapshot_row_from_power_catalog(
        cls,
        catalog: dict[str, Any] | None,
        cable_mark: str | None,
        *,
        snapshot: dict[str, Any] | None = None,
    ) -> dict[str, Any] | None:
        power_catalog = (
            catalog
            if isinstance(catalog, dict) and isinstance(catalog.get("payload"), dict)
            else catalog.get("power")
            if isinstance(catalog, dict)
            else None
        )
        if not isinstance(power_catalog, dict):
            return None
        payload = power_catalog.get("payload")
        rows_value = payload.get("rows") if isinstance(payload, dict) else None
        if rows_value is None and isinstance(payload, dict):
            rows_value = payload.get("cables")
        rows = (
            [dict(row) for row in rows_value if isinstance(row, dict)]
            if isinstance(rows_value, list)
            else []
        )
        row = lookup_cable_row_for_snapshot(
            rows,
            cable_mark,
            "self_regulating_tt",
            snapshot,
        )
        return (
            cls._snapshot_row_with_catalog_identity(row, power_catalog) if row is not None else None
        )

    async def _upsert_electrical_calculation(
        self,
        *,
        obj: ProjectObject,
        request: ElectricalRequest,
        cable_mark: str | None,
        result_dict: dict[str, Any],
        cable_snapshot: dict[str, Any] | None,
        electrical_variant_id: UUID | None = None,
    ) -> ElectricalCalculation:
        cable_type_source = self._normalize_cable_type_source(request.data.get("cable_type_source"))
        cable_mark_source = self._resolve_cable_mark_source(request.data)
        rows = await self._bulk_upsert_electrical_calculations(
            [
                {
                    "project_id": obj.project_id,
                    "object_id": obj.id,
                    "variant_number": request.variant_number,
                    "electrical_variant_id": electrical_variant_id,
                    "cable_type": request.cable_type,
                    "cable_type_source": cable_type_source,
                    "cable_mark": cable_mark,
                    "cable_mark_source": cable_mark_source,
                    "cable_snapshot": cable_snapshot,
                    "params": self._compact_electrical_params(request.data),
                    "results": result_dict,
                }
            ],
            return_calcs=True,
        )
        return rows[0]

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
            row.setdefault("cable_snapshot", None)
        assignment_service = ElectricalAssignmentService(self.db)
        await assignment_service.validate_calculation_rows(rows)
        chunk_size = self._electrical_bulk_upsert_chunk_size(rows[0])
        calcs: list[ElectricalCalculation] = []
        for chunk in _chunked_rows(rows, chunk_size):
            calcs.extend(
                await self._bulk_upsert_electrical_calculation_chunk(
                    chunk,
                    return_calcs=return_calcs,
                )
            )
        await assignment_service.sync_from_calculation_rows(rows)
        return calcs

    @staticmethod
    def _electrical_bulk_upsert_chunk_size(row: dict[str, Any]) -> int:
        params_per_row = max(len(row), 1)
        max_rows_by_bind_limit = max(1, POSTGRES_BIND_PARAMETER_LIMIT // params_per_row)
        return min(ELECTRICAL_BULK_UPSERT_TARGET_CHUNK_SIZE, max_rows_by_bind_limit)

    @staticmethod
    def _normalize_cable_type_source(value: Any) -> str:
        if isinstance(value, str):
            normalized = value.strip().lower()
            if normalized in VALID_CABLE_TYPE_SOURCES:
                return normalized
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
    def _is_manual_cable_selection(calc: ElectricalCalculation) -> bool:
        source = getattr(calc, "cable_mark_source", None)
        normalized_source = CalculationService._normalize_cable_mark_source(source)
        if normalized_source == CABLE_MARK_SOURCE_MANUAL:
            return True
        source_is_known_auto = (
            isinstance(source, str) and source.strip().lower() == CABLE_MARK_SOURCE_AUTO
        )
        params = getattr(calc, "params", None)
        if isinstance(params, dict):
            params_source = params.get("cable_mark_source")
            params_normalized_source = CalculationService._normalize_cable_mark_source(
                params_source
            )
            if params_normalized_source == CABLE_MARK_SOURCE_MANUAL:
                return True
            if (
                isinstance(params_source, str)
                and params_source.strip().lower() == CABLE_MARK_SOURCE_AUTO
            ):
                source_is_known_auto = True
            cable_mark = params.get("cable_mark")
            if isinstance(cable_mark, str) and cable_mark.strip() != "":
                return True
        cable_mark = getattr(calc, "cable_mark", None)
        return isinstance(cable_mark, str) and cable_mark.strip() != "" and not source_is_known_auto

    @staticmethod
    def _normalize_cable_mark_source(value: Any) -> str:
        if isinstance(value, str):
            normalized = value.strip().lower()
            if normalized in VALID_CABLE_MARK_SOURCES:
                return normalized
        return CABLE_MARK_SOURCE_AUTO

    @staticmethod
    def _normalize_thread_source(value: Any) -> str | None:
        if isinstance(value, str) and value in VALID_THREAD_SOURCES:
            return value
        return None

    @staticmethod
    def _resolve_cable_mark_source(data: dict[str, Any]) -> str:
        source = data.get("cable_mark_source")
        if isinstance(source, str):
            normalized = source.strip().lower()
            if normalized in VALID_CABLE_MARK_SOURCES:
                return normalized
        return CABLE_MARK_SOURCE_MANUAL if data.get("cable_mark") else CABLE_MARK_SOURCE_AUTO

    @staticmethod
    def _compact_electrical_params(data: dict[str, Any]) -> dict[str, Any]:
        return {key: value for key, value in data.items() if key != "cable_catalog"}

    async def _bulk_upsert_electrical_calculation_chunk(
        self,
        rows: list[dict[str, Any]],
        *,
        return_calcs: bool,
    ) -> list[ElectricalCalculation]:
        insert_stmt = pg_insert(ElectricalCalculation).values(rows)
        update_values: dict[str, Any] = {
            "project_id": insert_stmt.excluded.project_id,
            "cable_type": insert_stmt.excluded.cable_type,
            "cable_type_source": insert_stmt.excluded.cable_type_source,
            "cable_mark": insert_stmt.excluded.cable_mark,
            "cable_mark_source": insert_stmt.excluded.cable_mark_source,
            "cable_snapshot": insert_stmt.excluded.cable_snapshot,
            "params": insert_stmt.excluded.params,
            "results": insert_stmt.excluded.results,
            "updated_at": func.now(),
        }
        if all(row.get("electrical_variant_id") is not None for row in rows):
            update_values["electrical_variant_id"] = insert_stmt.excluded.electrical_variant_id
        upsert_stmt = insert_stmt.on_conflict_do_update(
            index_elements=["object_id", "variant_number"],
            set_=update_values,
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
    def _required_process_temperature(
        data: dict[str, Any] | None,
        fallback: dict[str, Any] | None = None,
    ) -> float:
        try:
            return required_process_temperature(data, fallback)
        except ProcessTemperatureInputError as exc:
            raise CalculationError(str(exc)) from exc

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
    def _bool_policy_value(value: Any) -> bool:
        if isinstance(value, bool):
            return value
        if isinstance(value, int | float):
            return float(value) >= 1.0
        if isinstance(value, str):
            return value.strip().lower() in {"1", "true", "yes", "approved", "on"}
        return False

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

        `total_heat_loss_design` у резервуара уже содержит K, а электрическая
        формула применит K повторно. Значит на вход ей нужно отдать `Q / K`,
        включая часть `Q_доп`; иначе дополнительная теплопотеря будет
        ошибочно умножена на K второй раз.
        """
        total = self._positive_heat_loss(results.get("total_heat_loss_design"))
        k = float(results.get("safety_factor_applied") or fallback_safety_factor or 1.1)
        return total / k

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
        if not obj.is_valid or not obj.results or obj.results.get("stale"):
            raise CalculationError("Теплопотери объекта не рассчитаны — невозможно выбрать кабель")

        if cable_type == "self_regulating_tt":
            explicit_tt = dict(overrides)
            # The batch path is authoritative about auto/manual selection.
            # Preserve an explicit null so the strict resolver sees
            # ``manual_cable_model=None`` instead of treating the field as a
            # missing frontend input and falling through to mock/error.
            explicit_tt["cable_mark"] = cable_mark
            return {
                "cable_mark": cable_mark,
                "_tt_explicit_overrides": explicit_tt,
            }
        # РЕШЕНИЕ 2026-08-03: legacy-линейка ТЛТ/resistive выпилена (DEC-07);
        # payload собирается только для канонического TT-пути выше.
        return {}

    def _candidate_identity_fallback_data(
        self,
        *,
        obj: ProjectObject,
        cable_type: str,
        cable_mark: str | None,
        cable_source: CableSource,
        tlt_catalog: list[dict[str, Any]],
        overrides: dict[str, Any],
    ) -> dict[str, Any]:
        params = obj.params or {}
        data: dict[str, Any] = dict(overrides)
        data["cable_mark"] = cable_mark
        data["cable_source"] = cable_source
        data["winding_pitch"] = self._winding_pitch_mm(overrides, params)
        if cable_type == "self_regulating_tt":
            data.pop("winding_coefficient", None)
            if obj.object_type == "tank":
                data.pop("winding_pitch", None)
                data.pop("winding_pitch_mm", None)
            data.update(self._number_of_threads_payload(overrides, params, None))
        else:
            data["supply_voltage"] = self._num(
                overrides.get("supply_voltage") or params.get("supply_voltage"),
                220.0,
            )
        return data

    async def _require_clean_candidate_scope(
        self,
        project_id: UUID,
        *,
        variant_number: int,
        electrical_variant_id: UUID,
        object_id: UUID | None,
        include_candidates: bool = True,
        include_folders: bool = True,
    ) -> None:
        """Reject legacy NULL/mismatched rows instead of mixing exact ER reads."""
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

    async def list_electrical_candidates(
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
            await self._require_clean_candidate_scope(
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

    @staticmethod
    def _normalize_candidate_folder_name(name: str) -> str:
        normalized = " ".join(name.strip().split())
        if not normalized:
            raise CalculationError("Название папки не должно быть пустым")
        if normalized.lower() in {"все", "избранное"}:
            raise CalculationError("Это системная папка, задайте другое название")
        if len(normalized) > 64:
            raise CalculationError("Название папки должно быть не длиннее 64 символов")
        return normalized

    async def _candidate_folder_payload(
        self,
        folder: ElectricalCandidateFolder,
    ) -> dict[str, Any]:
        item_result = await self.db.execute(
            select(ElectricalCandidateFolderItem.candidate_id).where(
                ElectricalCandidateFolderItem.folder_id == folder.id
            )
        )
        return {
            "id": folder.id,
            "project_id": folder.project_id,
            "object_id": folder.object_id,
            "variant_number": folder.variant_number,
            "electrical_variant_id": folder.electrical_variant_id,
            "name": folder.name,
            "color": folder.color,
            "sort_order": folder.sort_order,
            "candidate_ids": list(item_result.scalars().all()),
            "created_at": folder.created_at,
            "updated_at": folder.updated_at,
        }

    async def list_electrical_candidate_folders(
        self,
        project_id: UUID,
        *,
        object_id: UUID,
        variant_number: int,
        electrical_variant_id: UUID | None = None,
    ) -> list[dict[str, Any]]:
        if electrical_variant_id is not None:
            await self._require_clean_candidate_scope(
                project_id,
                variant_number=variant_number,
                electrical_variant_id=electrical_variant_id,
                object_id=object_id,
                include_candidates=False,
            )
        filters = [
            ElectricalCandidateFolder.project_id == project_id,
            ElectricalCandidateFolder.object_id == object_id,
            ElectricalCandidateFolder.variant_number == variant_number,
        ]
        if electrical_variant_id is not None:
            filters.append(ElectricalCandidateFolder.electrical_variant_id == electrical_variant_id)
        result = await self.db.execute(
            select(ElectricalCandidateFolder)
            .where(*filters)
            .order_by(
                ElectricalCandidateFolder.sort_order,
                ElectricalCandidateFolder.created_at,
            )
        )
        folders = list(result.scalars().all())
        item_result = (
            await self.db.execute(
                select(
                    ElectricalCandidateFolderItem.folder_id,
                    ElectricalCandidateFolderItem.candidate_id,
                ).where(
                    ElectricalCandidateFolderItem.folder_id.in_([folder.id for folder in folders])
                )
            )
            if folders
            else None
        )
        folder_items: dict[UUID, list[UUID]] = {folder.id: [] for folder in folders}
        if item_result is not None:
            for folder_id, candidate_id in item_result.all():
                folder_items.setdefault(folder_id, []).append(candidate_id)
        return [
            {
                "id": folder.id,
                "project_id": folder.project_id,
                "object_id": folder.object_id,
                "variant_number": folder.variant_number,
                "electrical_variant_id": folder.electrical_variant_id,
                "name": folder.name,
                "color": folder.color,
                "sort_order": folder.sort_order,
                "candidate_ids": folder_items.get(folder.id, []),
                "created_at": folder.created_at,
                "updated_at": folder.updated_at,
            }
            for folder in folders
        ]

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
        if variant_number < 1 or variant_number > MAX_ELECTRICAL_VARIANTS:
            raise CalculationError(f"variant_number должен быть от 1 до {MAX_ELECTRICAL_VARIANTS}")
        if electrical_variant_id is None:
            raise ElectricalAssignmentServiceError(
                "ELECTRICAL_ASSIGNMENT_REQUIRED",
                "Для папки кандидатов требуется точный UUID ЭР",
                status_code=409,
            )
        await ElectricalAssignmentService(self.db).require_supported_assignment(
            project_id,
            electrical_variant_id,
            object_id,
        )
        await self._require_clean_candidate_scope(
            project_id,
            variant_number=variant_number,
            electrical_variant_id=electrical_variant_id,
            object_id=object_id,
        )
        await self._load_candidate_object(project_id, object_id)
        max_sort_result = await self.db.execute(
            select(func.max(ElectricalCandidateFolder.sort_order)).where(
                ElectricalCandidateFolder.project_id == project_id,
                ElectricalCandidateFolder.object_id == object_id,
                ElectricalCandidateFolder.variant_number == variant_number,
                ElectricalCandidateFolder.electrical_variant_id == electrical_variant_id,
            )
        )
        next_sort = int(max_sort_result.scalar() or 0) + 10
        folder = ElectricalCandidateFolder(
            project_id=project_id,
            object_id=object_id,
            variant_number=variant_number,
            electrical_variant_id=electrical_variant_id,
            name=self._normalize_candidate_folder_name(name),
            color=color,
            sort_order=next_sort,
            created_by_user_id=created_by_user_id,
            created_by_session_id=created_by_session_id,
        )
        self.db.add(folder)
        try:
            await self.db.commit()
        except IntegrityError as exc:
            await self.db.rollback()
            raise CalculationError("Папка с таким названием уже существует") from exc
        await self.db.refresh(folder)
        return await self._candidate_folder_payload(folder)

    async def get_electrical_candidate_folder(
        self,
        folder_id: UUID,
    ) -> ElectricalCandidateFolder:
        result = await self.db.execute(
            select(ElectricalCandidateFolder).where(ElectricalCandidateFolder.id == folder_id)
        )
        folder = result.scalar_one_or_none()
        if folder is None:
            raise CalculationError("Папка вариантов не найдена")
        return folder

    async def update_electrical_candidate_folder(
        self,
        folder_id: UUID,
        **updates: Any,
    ) -> dict[str, Any]:
        folder = await self.get_electrical_candidate_folder(folder_id)
        if "name" in updates and updates["name"] is not None:
            folder.name = self._normalize_candidate_folder_name(str(updates["name"]))
        if "color" in updates:
            folder.color = updates["color"]
        if "sort_order" in updates and updates["sort_order"] is not None:
            folder.sort_order = int(updates["sort_order"])
        try:
            await self.db.commit()
        except IntegrityError as exc:
            await self.db.rollback()
            raise CalculationError("Папка с таким названием уже существует") from exc
        await self.db.refresh(folder)
        return await self._candidate_folder_payload(folder)

    async def delete_electrical_candidate_folder(self, folder_id: UUID) -> None:
        folder = await self.get_electrical_candidate_folder(folder_id)
        await self.db.delete(folder)
        await self.db.commit()

    async def add_electrical_candidate_to_folder(
        self,
        *,
        folder_id: UUID,
        candidate_id: UUID,
    ) -> dict[str, Any]:
        # First read discovers the owning project; the second read below is an
        # intentional post-lock TOCTOU recheck before validating the candidate.
        folder = await self.get_electrical_candidate_folder(folder_id)
        await self._lock_project_for_candidate_apply(folder.project_id)
        folder = await self.get_electrical_candidate_folder(folder_id)
        candidate = await self.get_electrical_candidate(candidate_id)
        if (
            candidate.project_id != folder.project_id
            or candidate.object_id != folder.object_id
            or candidate.variant_number != folder.variant_number
            or candidate.electrical_variant_id is None
            or folder.electrical_variant_id is None
            or candidate.electrical_variant_id != folder.electrical_variant_id
        ):
            raise ElectricalAssignmentServiceError(
                "ELECTRICAL_ASSIGNMENT_DOWNSTREAM_SCOPE_CONFLICT",
                "Кандидат и папка относятся к разным объектам или ЭР",
                status_code=409,
                details={
                    "folder_id": str(folder_id),
                    "candidate_id": str(candidate_id),
                },
            )
        await ElectricalAssignmentService(self.db).require_supported_assignment(
            folder.project_id,
            folder.electrical_variant_id,
            folder.object_id,
            requested_cable_type=candidate.cable_type,
            lock_project=False,
        )
        stmt = (
            pg_insert(ElectricalCandidateFolderItem)
            .values(folder_id=folder_id, candidate_id=candidate_id)
            .on_conflict_do_nothing(
                index_elements=[
                    ElectricalCandidateFolderItem.folder_id,
                    ElectricalCandidateFolderItem.candidate_id,
                ]
            )
        )
        await self.db.execute(stmt)
        await self.db.commit()
        await self.db.refresh(folder)
        return await self._candidate_folder_payload(folder)

    async def remove_electrical_candidate_from_folder(
        self,
        *,
        folder_id: UUID,
        candidate_id: UUID,
    ) -> dict[str, Any]:
        folder = await self.get_electrical_candidate_folder(folder_id)
        await self.db.execute(
            delete(ElectricalCandidateFolderItem).where(
                ElectricalCandidateFolderItem.folder_id == folder_id,
                ElectricalCandidateFolderItem.candidate_id == candidate_id,
            )
        )
        await self.db.commit()
        await self.db.refresh(folder)
        return await self._candidate_folder_payload(folder)

    async def _load_candidate_object(self, project_id: UUID, object_id: UUID) -> ProjectObject:
        result = await self.db.execute(
            select(ProjectObject)
            .where(
                ProjectObject.project_id == project_id,
                ProjectObject.id == object_id,
            )
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        obj = result.scalar_one_or_none()
        if obj is None:
            raise CalculationError("Объект не найден в проекте")
        return obj

    @staticmethod
    def _candidate_warnings(result_dict: dict[str, Any] | None) -> list[Any]:
        if not isinstance(result_dict, dict):
            return []
        warnings = result_dict.get("warnings")
        return list(warnings) if isinstance(warnings, list) else []

    @staticmethod
    def _candidate_risk_flags(result_dict: dict[str, Any] | None) -> list[Any]:
        if not isinstance(result_dict, dict):
            return []
        flags: list[Any] = []
        commercial = result_dict.get("commercial")
        if isinstance(commercial, dict) and commercial.get("is_discontinued"):
            flags.append({"code": "discontinued", "message": "Кабель снят с поставки"})
        if result_dict.get("applied_selection_policy") == "technical_minimum_fallback":
            flags.append(
                {
                    "code": "ranking_fallback",
                    "message": "Коммерческое ранжирование заменено техническим fallback",
                }
            )
        return flags

    def _candidate_not_applicable(
        self,
        *,
        project_id: UUID,
        object_id: UUID,
        object_type: str,
        variant_number: int,
        electrical_variant_id: UUID | None,
        cable_type: str,
        cable_source: CableSource,
        mode: str,
        cable_mark: str | None,
    ) -> ElectricalCandidate:
        fingerprint_payload = build_identity_payload(
            object_type=object_type,
            cable_type=cable_type,
            cable_source=cable_source,
            cable_mark=cable_mark,
            results=None,
            params={},
            cable_snapshot=None,
            reason_code=ELECTRICAL_CANDIDATE_NO_GENERATOR_CODE,
            status=ELECTRICAL_CANDIDATE_STATUS_NOT_APPLICABLE,
        )
        dedupe_key = build_dedupe_key(
            object_type=object_type,
            cable_type=cable_type,
            cable_source=cable_source,
            cable_mark=cable_mark,
            results=None,
            params={},
            cable_snapshot=None,
            reason_code=ELECTRICAL_CANDIDATE_NO_GENERATOR_CODE,
            status=ELECTRICAL_CANDIDATE_STATUS_NOT_APPLICABLE,
        )
        return ElectricalCandidate(
            project_id=project_id,
            object_id=object_id,
            variant_number=variant_number,
            electrical_variant_id=electrical_variant_id,
            cable_type=cable_type,
            cable_source=cable_source,
            cable_mark=cable_mark,
            dedupe_key=dedupe_key,
            mode=mode,
            status=ELECTRICAL_CANDIDATE_STATUS_NOT_APPLICABLE,
            priority=0,
            is_recommended=False,
            is_pinned=False,
            is_applied=False,
            reason_code=ELECTRICAL_CANDIDATE_NO_GENERATOR_CODE,
            reason_message=(
                f"Для типа кабеля «{cable_type}» нет расчётной формулы кандидата. "
                "Авторасчёт не создаёт фиктивные рекомендации."
            ),
            params={},
            results=None,
            cable_snapshot=None,
            warnings=[],
            risk_flags=[{"code": ELECTRICAL_CANDIDATE_NO_GENERATOR_CODE}],
            candidate_meta={
                "autoselection_used": mode == "auto",
                "candidate_count": 0,
                "fingerprint_payload": fingerprint_payload,
                "last_mode": mode,
                "last_calculated_at": datetime.now(UTC).isoformat(),
            },
        )

    async def _find_electrical_candidate_by_dedupe(
        self,
        *,
        object_id: UUID,
        variant_number: int,
        electrical_variant_id: UUID,
        dedupe_key: str,
    ) -> ElectricalCandidate | None:
        result = await self.db.execute(
            select(ElectricalCandidate)
            .where(
                ElectricalCandidate.object_id == object_id,
                ElectricalCandidate.variant_number == variant_number,
                ElectricalCandidate.dedupe_key == dedupe_key,
            )
            .with_for_update()
        )
        rows = list(result.scalars().all())
        conflicts = [row for row in rows if row.electrical_variant_id != electrical_variant_id]
        if conflicts:
            raise ElectricalAssignmentServiceError(
                "ELECTRICAL_ASSIGNMENT_DOWNSTREAM_SCOPE_CONFLICT",
                "Кандидат с тем же ключом относится к другому или неопределённому ЭР",
                status_code=409,
                details={
                    "electrical_variant_id": str(electrical_variant_id),
                    "candidate_ids": [str(row.id) for row in conflicts],
                },
            )
        return rows[0] if rows else None

    @staticmethod
    def _apply_candidate_upsert(
        existing: ElectricalCandidate,
        *,
        params: dict[str, Any],
        results: dict[str, Any] | None,
        cable_snapshot: dict[str, Any] | None,
        warnings: list[Any],
        risk_flags: list[Any],
        reason_code: str | None,
        reason_message: str | None,
        cable_mark: str | None,
        mode: str,
        new_status: str,
        candidate_meta: dict[str, Any],
        upsert_action: str = "updated",
    ) -> None:
        existing.params = params
        existing.results = results
        existing.cable_snapshot = cable_snapshot
        existing.warnings = warnings
        existing.risk_flags = risk_flags
        existing.reason_code = reason_code
        existing.reason_message = reason_message
        existing.cable_mark = cable_mark
        existing.mode = mode
        merged_meta = dict(existing.candidate_meta or {})
        merged_meta.update(candidate_meta)
        merged_meta["last_mode"] = mode
        merged_meta["last_upsert_action"] = upsert_action
        existing.candidate_meta = merged_meta

        if existing.status != ELECTRICAL_CANDIDATE_STATUS_EXCLUDED:
            if new_status == ELECTRICAL_CANDIDATE_STATUS_APPLICABLE:
                existing.status = ELECTRICAL_CANDIDATE_STATUS_APPLICABLE
            else:
                existing.status = new_status

        if existing.is_applied and new_status != ELECTRICAL_CANDIDATE_STATUS_APPLICABLE:
            existing.is_applied = False

    async def _persist_electrical_candidate(
        self,
        candidate: ElectricalCandidate,
    ) -> tuple[ElectricalCandidate, str]:
        if candidate.electrical_variant_id is None:
            raise ElectricalAssignmentServiceError(
                "ELECTRICAL_ASSIGNMENT_REQUIRED",
                "Для кандидата требуется точный UUID ЭР",
                status_code=409,
            )
        existing = await self._find_electrical_candidate_by_dedupe(
            object_id=candidate.object_id,
            variant_number=candidate.variant_number,
            electrical_variant_id=candidate.electrical_variant_id,
            dedupe_key=candidate.dedupe_key,
        )
        if existing is not None:
            self._apply_candidate_upsert(
                existing,
                params=candidate.params,
                results=candidate.results,
                cable_snapshot=candidate.cable_snapshot,
                warnings=candidate.warnings,
                risk_flags=candidate.risk_flags,
                reason_code=candidate.reason_code,
                reason_message=candidate.reason_message,
                cable_mark=candidate.cable_mark,
                mode=candidate.mode,
                new_status=candidate.status,
                candidate_meta=candidate.candidate_meta,
                upsert_action="updated",
            )
            await self.db.commit()
            await self.db.refresh(existing)
            return existing, "updated"

        self.db.add(candidate)
        try:
            candidate.candidate_meta = {
                **(candidate.candidate_meta or {}),
                "last_upsert_action": "created",
            }
            await self.db.commit()
            await self.db.refresh(candidate)
            return candidate, "created"
        except IntegrityError:
            await self.db.rollback()
            existing = await self._find_electrical_candidate_by_dedupe(
                object_id=candidate.object_id,
                variant_number=candidate.variant_number,
                electrical_variant_id=candidate.electrical_variant_id,
                dedupe_key=candidate.dedupe_key,
            )
            if existing is None:
                raise
            self._apply_candidate_upsert(
                existing,
                params=candidate.params,
                results=candidate.results,
                cable_snapshot=candidate.cable_snapshot,
                warnings=candidate.warnings,
                risk_flags=candidate.risk_flags,
                reason_code=candidate.reason_code,
                reason_message=candidate.reason_message,
                cable_mark=candidate.cable_mark,
                mode=candidate.mode,
                new_status=candidate.status,
                candidate_meta=candidate.candidate_meta,
                upsert_action="updated",
            )
            await self.db.commit()
            await self.db.refresh(existing)
            return existing, "updated"

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
        """Считает и upsert-ит кандидат кабеля, не применяя его в ElectricalCalculation."""
        if variant_number < 1 or variant_number > MAX_ELECTRICAL_VARIANTS:
            raise CalculationError(f"variant_number должен быть от 1 до {MAX_ELECTRICAL_VARIANTS}")
        if mode not in {"auto", "manual"}:
            raise CalculationError("mode должен быть auto или manual")
        if mode == "manual" and not cable_mark:
            raise CalculationError("Для ручного кандидата укажите cable_mark")
        if mode == "auto" and cable_mark:
            raise CalculationError("Авторасчёт кандидата запускается без cable_mark")
        if electrical_variant_id is None:
            raise ElectricalAssignmentServiceError(
                "ELECTRICAL_ASSIGNMENT_REQUIRED",
                "Для кандидата требуется точный UUID ЭР",
                status_code=409,
            )
        await ElectricalAssignmentService(self.db).require_supported_assignment(
            project_id,
            electrical_variant_id,
            object_id,
            requested_cable_type=cable_type,
        )
        await self._require_clean_candidate_scope(
            project_id,
            variant_number=variant_number,
            electrical_variant_id=electrical_variant_id,
            object_id=object_id,
            include_folders=False,
        )

        obj = await self._load_candidate_object(project_id, object_id)
        object_type = str(getattr(obj.object_type, "value", obj.object_type))
        if cable_type in {"mineral", "skin"}:
            candidate = self._candidate_not_applicable(
                project_id=project_id,
                object_id=object_id,
                object_type=object_type,
                variant_number=variant_number,
                electrical_variant_id=electrical_variant_id,
                cable_type=cable_type,
                cable_source=cable_source,
                mode=mode,
                cable_mark=cable_mark,
            )
            return await self._persist_electrical_candidate(candidate)

        overrides = self._base_overrides_with_sources(electrical_params or {})
        request_data: dict[str, Any] = dict(overrides)
        request: ElectricalRequest | None = None
        selected_mark: str | None = cable_mark
        result_dict: dict[str, Any] | None = None
        cable_snapshot: dict[str, Any] | None = None
        status = ELECTRICAL_CANDIDATE_STATUS_APPLICABLE
        reason_code: str | None = None
        reason_message: str | None = None
        try:
            catalog = await self.load_cable_catalog(cable_source)
            request_data = self._candidate_identity_fallback_data(
                obj=obj,
                cable_type=cable_type,
                cable_mark=cable_mark,
                cable_source=cable_source,
                tlt_catalog=catalog,
                overrides=overrides,
            )
            coefficients = await self.get_coefficients()
            request_data = self._build_electrical_data(
                obj=obj,
                cable_type=cable_type,
                cable_mark=cable_mark,
                tlt_catalog=catalog,
                overrides=overrides,
                coefficients=coefficients,
            )
            request_data["cable_source"] = cable_source
            request_data["cable_type_source"] = CABLE_TYPE_SOURCE_MANUAL
            request_data["cable_mark_source"] = (
                CABLE_MARK_SOURCE_MANUAL if cable_mark else CABLE_MARK_SOURCE_AUTO
            )
            request = ElectricalRequest(
                object_id=object_id,
                cable_type=cast(Any, cable_type),
                variant_number=variant_number,
                data=request_data,
            )
            self._hydrate_electrical_request_from_object(request, obj)
            await self._prepare_self_regulating_tt_request(
                request,
                obj,
                electrical_variant_id=electrical_variant_id,
            )
            selected_mark, result_dict = self._calculate_electrical_result(request)
            cable_snapshot = self._build_cable_snapshot_for_result(
                request=request,
                cable_mark=selected_mark,
                result_dict=result_dict,
            )
        except Exception as exc:
            if request is not None and selected_mark:
                cable_snapshot = self._build_cable_snapshot_for_result(
                    request=request,
                    cable_mark=selected_mark,
                    result_dict=None,
                )
            elif selected_mark:
                cable_snapshot = self._build_cable_snapshot_from_data(
                    cable_type=cable_type,
                    cable_mark=selected_mark,
                    request_data=request_data,
                    result_dict=None,
                )
            status = ELECTRICAL_CANDIDATE_STATUS_ERROR
            reason_code = "candidate_calculation_failed"
            reason_message = _clean_exception_message(exc)

        compact_params = self._compact_electrical_params(request_data)
        fingerprint_payload = build_identity_payload(
            object_type=object_type,
            cable_type=cable_type,
            cable_source=cable_source,
            cable_mark=selected_mark,
            results=result_dict,
            params=compact_params,
            cable_snapshot=cable_snapshot,
            reason_code=reason_code,
            status=status,
        )
        dedupe_key = build_dedupe_key(
            object_type=object_type,
            cable_type=cable_type,
            cable_source=cable_source,
            cable_mark=selected_mark,
            results=result_dict,
            params=compact_params,
            cable_snapshot=cable_snapshot,
            reason_code=reason_code,
            status=status,
        )
        candidate = ElectricalCandidate(
            project_id=project_id,
            object_id=object_id,
            variant_number=variant_number,
            electrical_variant_id=electrical_variant_id,
            cable_type=cable_type,
            cable_source=cable_source,
            cable_mark=selected_mark,
            dedupe_key=dedupe_key,
            mode=mode,
            status=status,
            priority=0,
            is_recommended=mode == "auto" and status == ELECTRICAL_CANDIDATE_STATUS_APPLICABLE,
            is_pinned=False,
            is_applied=False,
            reason_code=reason_code,
            reason_message=reason_message,
            params=compact_params,
            results=result_dict,
            cable_snapshot=cable_snapshot,
            warnings=self._candidate_warnings(result_dict),
            risk_flags=self._candidate_risk_flags(result_dict),
            candidate_meta={
                "autoselection_used": mode == "auto",
                "candidate_count": result_dict.get("candidate_count") if result_dict else 0,
                "fingerprint_payload": fingerprint_payload,
                "last_mode": mode,
                "last_calculated_at": datetime.now(UTC).isoformat(),
            },
        )
        return await self._persist_electrical_candidate(candidate)

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
        candidate = await self.get_electrical_candidate(candidate_id)
        if priority is not None:
            candidate.priority = priority
        if is_recommended is not None:
            candidate.is_recommended = is_recommended
        if is_pinned is not None:
            candidate.is_pinned = is_pinned
        if status is not None:
            candidate.status = status
            if status == ELECTRICAL_CANDIDATE_STATUS_EXCLUDED:
                candidate.is_applied = False
        if engineer_comment is not None:
            candidate.engineer_comment = engineer_comment
        await self.db.commit()
        await self.db.refresh(candidate)
        return candidate

    async def get_electrical_candidate(self, candidate_id: UUID) -> ElectricalCandidate:
        result = await self.db.execute(
            select(ElectricalCandidate).where(ElectricalCandidate.id == candidate_id)
        )
        candidate = result.scalar_one_or_none()
        if candidate is None:
            raise ElectricalCandidateApplyError(
                code="ELECTRICAL_CANDIDATE_NOT_FOUND",
                message="Кандидат подбора не найден",
                status_code=404,
            )
        return candidate

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
                ElectricalVariant.legacy_variant_number == candidate.variant_number,
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
            await self._require_clean_candidate_scope(
                candidate.project_id,
                variant_number=candidate.variant_number,
                electrical_variant_id=variant.id,
                object_id=candidate.object_id,
                include_folders=False,
            )
            if candidate.status != ELECTRICAL_CANDIDATE_STATUS_APPLICABLE:
                raise CalculationError("Можно применить только применимый кандидат")
            if not candidate.cable_mark:
                raise CalculationError("У кандидата нет выбранной марки кабеля")

            # Legacy rows may still have a NULL UUID during the expand phase.
            # Bind only to the mapping that already exists under the project lock;
            # candidate apply must never recreate a lifecycle-deleted ER.
            candidate.electrical_variant_id = variant.id
            # Кандидат хранит явные ТТ-входы вложенными в _tt_explicit_overrides;
            # select_cable_manual ждёт их плоскими — иначе строгий резолвер
            # теряет сохранённые значения и applicable-кандидат не применяется.
            apply_params = dict(candidate.params or {})
            stored_overrides = apply_params.pop("_tt_explicit_overrides", None)
            if isinstance(stored_overrides, dict):
                apply_params.update(stored_overrides)
            calc = await self.select_cable_manual(
                candidate.object_id,
                candidate.cable_mark,
                candidate.cable_source,
                candidate.variant_number,
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
                    ElectricalCandidate.variant_number == candidate.variant_number,
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
        candidate = await self.get_electrical_candidate(candidate_id)
        if not candidate.is_applied:
            return candidate
        try:
            await self._lock_project_for_candidate_apply(candidate.project_id)
            candidate = await self._candidate_for_apply(candidate_id, candidate.project_id)
            variant = await self._existing_variant_for_candidate(candidate)
            await self._require_clean_candidate_scope(
                candidate.project_id,
                variant_number=candidate.variant_number,
                electrical_variant_id=variant.id,
                object_id=candidate.object_id,
                include_folders=False,
            )
            candidate.electrical_variant_id = variant.id
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

    async def _select_cable_for_object(
        self,
        obj: ProjectObject,
        *,
        cable_mark: str | None,
        cable_source: CableSource,
        variant_number: int,
        cable_type: str,
        electrical_params: dict[str, Any] | None,
        commit: bool,
        electrical_variant_id: UUID | None = None,
    ) -> ElectricalCalculation:
        """Выбор/автоподбор кабеля для одной пары объект+СО."""
        catalog = await self.load_cable_catalog(cable_source)
        coefficients = await self.get_coefficients()
        data = self._build_electrical_data(
            obj=obj,
            cable_type=cable_type,
            cable_mark=cable_mark,
            tlt_catalog=catalog,
            overrides=self._base_overrides_with_sources(electrical_params or {}),
            coefficients=coefficients,
        )
        data["cable_source"] = cable_source
        data["cable_mark_source"] = (
            CABLE_MARK_SOURCE_MANUAL if cable_mark else CABLE_MARK_SOURCE_AUTO
        )
        request = ElectricalRequest(
            object_id=obj.id,
            cable_type=cast(Any, cable_type),
            variant_number=variant_number,
            data=data,
        )
        return await self.calc_electrical(
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
            if variant.legacy_variant_number is None:
                raise ElectricalAssignmentServiceError(
                    "ELECTRICAL_VARIANT_LEGACY_SLOT_REQUIRED",
                    "Текущий расчётный сервис требует compatibility-номер ЭР",
                    status_code=409,
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
                        "conflicts": [{
                            "object_id": str(object_id),
                            "expected_version": data.expected_assignment_version,
                            "current_version": assignment.version,
                        }]
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

            self._tt_assignment_cache[(project_id, electrical_variant_id, object_id)] = assignment
            calc = await self._select_cable_for_object(
                obj,
                cable_mark=data.cable_mark if data.mode == "manual" else None,
                cable_source=data.cable_source,
                variant_number=variant.legacy_variant_number,
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
        variant_number: int = 1,
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
        if not object_ids:
            return {}
        filters = [
            ElectricalCalculation.project_id == project_id,
            ElectricalCalculation.variant_number == variant_number,
            ElectricalCalculation.object_id.in_(object_ids),
        ]
        if electrical_variant_id is not None:
            filters.append(ElectricalCalculation.electrical_variant_id == electrical_variant_id)
        result = await self.db.execute(
            select(ElectricalCalculation)
            .options(
                load_only(
                    ElectricalCalculation.id,
                    ElectricalCalculation.object_id,
                    ElectricalCalculation.cable_type,
                    ElectricalCalculation.cable_type_source,
                    ElectricalCalculation.cable_mark,
                    ElectricalCalculation.cable_mark_source,
                    ElectricalCalculation.params,
                    ElectricalCalculation.results,
                )
            )
            .where(*filters)
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
                await _maybe_await(progress_callback(progress))

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
        catalog = await self.load_cable_catalog(cable_source)
        base_overrides = self._base_overrides_with_sources(electrical_params or {})
        electrical_coefficients: dict[str, float] | None = None
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
            await self._prefetch_tt_assignments(
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
                        and self._is_manual_cable_selection(existing_calc)
                    ):
                        skipped += 1
                        continue
                    overrides = dict(base_overrides)
                    if (
                        overrides.get("selection_policy") == "balanced"
                        and electrical_coefficients is None
                    ):
                        electrical_coefficients = await self.get_coefficients()
                    request_data = self._build_electrical_data(
                        obj=obj,
                        cable_type=object_cable_type,
                        cable_mark=None,
                        tlt_catalog=catalog,
                        overrides=overrides,
                        coefficients=electrical_coefficients,
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
                    await self._prepare_self_regulating_tt_request(
                        request,
                        obj,
                        electrical_variant_id=electrical_variant_id,
                    )
                    cable_mark, result_dict = self._calculate_electrical_result(request)
                    cable_snapshot = self._build_cable_snapshot_for_result(
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
                    await self._upsert_failed_electrical(
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

    async def _upsert_failed_electrical(
        self,
        obj: ProjectObject,
        error_message: str | Exception,
        variant_number: int,
        cable_type: str,
        *,
        cable_type_source: str | None = None,
        cable_mark_source: str | None = None,
        request_data: dict[str, Any] | None = None,
        electrical_variant_id: UUID | None = None,
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
        if cable_type == "self_regulating_tt":
            payload = {**payload, **await self._tt_error_provenance()}
        rows = await self._bulk_upsert_electrical_calculations(
            [
                {
                    "project_id": obj.project_id,
                    "object_id": obj.id,
                    "variant_number": variant_number,
                    "electrical_variant_id": electrical_variant_id,
                    "cable_type": cable_type,
                    "cable_type_source": normalized_source,
                    "cable_mark": None,
                    "cable_mark_source": normalized_mark_source,
                    "cable_snapshot": None,
                    "params": params,
                    "results": payload,
                }
            ],
            return_calcs=True,
        )
        return rows[0]

    async def _save_failed_electrical(
        self,
        obj: ProjectObject,
        error_message: str,
        variant_number: int = 1,
        cable_type: str = "self_regulating_tt",
    ) -> None:
        """Сохраняет или обновляет запись ElectricalCalculation с ошибкой."""
        await self._upsert_failed_electrical(
            obj,
            error_message,
            variant_number,
            cable_type,
        )
        await self.db.commit()

    def _tt_cable_option_temperatures(
        self,
        obj: ProjectObject,
        assignment_overrides: dict[str, Any] | None = None,
    ) -> tuple[float, float]:
        """Resolve option inputs from the object and the exact ER assignment."""
        object_heat = self._tt_object_heat_inputs(obj, {}, assignment_overrides or {})

        product = self._num(object_heat.get("product_temperature_c"))
        if product is None:
            raise ElectricalInputResolutionError(
                "ELECTRICAL_INPUT_REQUIRED",
                "Для списка моделей требуется температура продукта (T1)",
                details={"field": "product_temperature_c", "object_id": str(obj.id)},
            )

        ambient = self._num(object_heat.get("ambient_temperature_c"))
        if ambient is None:
            raise ElectricalInputResolutionError(
                "ELECTRICAL_INPUT_REQUIRED",
                "Для списка моделей требуется температура окружающей среды",
                details={"field": "ambient_temperature_c", "object_id": str(obj.id)},
            )

        return product, ambient

    async def get_cable_options(
        self,
        object_id: UUID,
        *,
        electrical_variant_id: UUID | None = None,
    ) -> list[dict[str, Any]]:
        """TT power-catalog options for manual mark selection (B1 / E5).

        Requires current heat results on the object. Uses the same Case 1
        passport-power and per-mark temperature eligibility as the calculation
        pipeline. Assignment state is isolated to the exact ER UUID.
        """
        obj_result = await self.db.execute(
            select(ProjectObject).where(ProjectObject.id == object_id)
        )
        obj = obj_result.scalar_one_or_none()
        if obj is None:
            raise CalculationError("Объект не найден")
        if not obj.is_valid or not obj.results or obj.results.get("stale"):
            raise ElectricalInputResolutionError(
                "ELECTRICAL_HEAT_LOSS_REQUIRED",
                "Для списка моделей требуются актуальные теплопотери объекта",
                details={"object_id": str(obj.id)},
            )

        assignment = await self._tt_assignment(
            obj.project_id,
            electrical_variant_id,
            obj.id,
        )
        assignment_overrides = (
            dict(getattr(assignment, "electrical_overrides", {}) or {})
            if assignment is not None
            else {}
        )

        product_c, ambient_c = self._tt_cable_option_temperatures(
            obj,
            assignment_overrides,
        )

        catalogs = await self._tt_calculation_catalogs()
        power_catalog = catalogs.get("power") or {}
        rows, meta = extract_tt_catalog_rows(power_catalog, "power")
        section_rows, _section_meta = extract_tt_catalog_rows(
            catalogs.get("section") or {}, "section"
        )
        bom_rows, _bom_meta = extract_tt_catalog_rows(catalogs.get("bom") or {}, "bom")
        if not rows or not section_rows or not bom_rows:
            raise ElectricalFormulaError(
                "ELECTRICAL_CATALOG_SOURCE_UNREGISTERED",
                "Активный набор каталогов не содержит данных для выбора кабеля",
                details={
                    "missing_catalog_kinds": [
                        kind
                        for kind, values in (
                            ("power", rows),
                            ("section", section_rows),
                            ("bom", bom_rows),
                        )
                        if not values
                    ]
                },
                status_code=503,
            )

        options = build_tt_cable_options(
            rows,
            product_temperature_c=product_c,
            ambient_temperature_c=ambient_c,
            section_catalog_rows=section_rows,
            bom_catalog_rows=bom_rows,
            catalog_meta=meta,
            strict_provisional=bool(app_settings.is_production),
        )
        for option in options:
            option["object_product_temperature_c"] = product_c
            option["object_ambient_temperature_c"] = ambient_c
        return options
