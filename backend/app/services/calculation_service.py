"""Сервис расчётов: теплопотери + электротехнический расчёт."""

import asyncio
import copy
import math
import re
import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from inspect import isawaitable
from time import monotonic
from typing import Any, cast
from uuid import UUID

from pydantic import ValidationError
from sqlalchemy import Float, and_, delete, func, or_, select, update
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
from app.electrical_result_status import FAILED_ELECTRICAL_CATEGORIES
from app.formulas.electrical.cable_geometry import compute_tank_cable_length
from app.formulas.electrical.resistive import (
    calc_resistive_single_core,
    calc_resistive_three_core,
    default_resistive_max_linear_power_w_m,
)
from app.formulas.electrical.self_regulating import calc_self_regulating
from app.formulas.heat_loss.pipe import calc_pipe_heat_loss
from app.formulas.heat_loss.tank import calc_tank_heat_loss
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
from app.models.specification import Specification
from app.reference_data.loader import (
    get_climate_entry,
    list_resistive_cables,
    list_tlt_cables,
    list_tt_cables,
)
from app.result import Err, Ok, Result
from app.schemas.calculation import (
    RESISTIVE_DEFAULT_MIN_ADJUSTED_VOLTAGE,
    RESISTIVE_DEFAULT_VOLTAGE_STEP,
    ElectricalCalcSummary,
    ElectricalRequest,
    PipeHeatLossParams,
    ResistiveSingleCoreParams,
    ResistiveThreeCoreParams,
    SelfRegulatingParams,
    StoredPipeHeatParams,
    StoredTankHeatParams,
    TankHeatLossParams,
)
from app.schemas.json_shapes import (
    HeatLossResultDict,
    PipeHeatLossResultDict,
    TankHeatLossResultDict,
)
from app.schemas.project import ProjectObjectsPageInfo
from app.services.cable_snapshot import (
    build_cable_snapshot,
    compare_cable_snapshot,
    lookup_cable_row,
    lookup_cable_row_for_snapshot,
)
from app.services.electrical_assignment_service import (
    ElectricalAssignmentService,
    ElectricalAssignmentServiceError,
)
from app.services.electrical_candidate_dedupe import build_dedupe_key, build_identity_payload
from app.services.electrical_error_guidance import build_electrical_error_payload
from app.services.electrical_input_resolver import (
    ElectricalInputResolutionError,
    configured_electrical_input_resolver,
    normalize_electrical_override_payload,
    require_production_eligible_inputs,
)
from app.services.electrical_tt_pipeline import (
    calculate_electrical_tt,
    electrical_tt_catalog_eligibility,
)
from app.services.heat_contract import (
    COMMON_HEAT_PARAM_KEYS,
    PIPE_FORBIDDEN_HEAT_PARAM_KEYS,
    PIPE_HEAT_PARAM_KEYS,
    TANK_FORBIDDEN_HEAT_PARAM_KEYS,
    TANK_HEAT_PARAM_KEYS,
)
from app.services.project_object_params import (
    ProjectObjectParamsError,
    prepare_project_object_params,
)

# Источник каталога кабелей. Значения заданы для совместимости с текущим API;
# внутри функций валидируется через проверку, не enum (чтобы случайная строка
# попадала в default, а не падала).
CableSource = str  # "builtin" | "commercial" | "extended" | "all"

STALE_ELECTRICAL_ERROR_CODE = "STALE_HEAT_LOSS"
STALE_ELECTRICAL_MESSAGE = "Теплопотери объекта изменились. Пересчитайте электрорасчёт."
RESISTIVE_DEFAULT_MAX_TEMPERATURE = 130.0
RESISTIVE_DEFAULT_MIN_TEMPERATURE = -60.0
COPY_SELECTION_METADATA_KEYS = (
    "selection_policy",
    "applied_selection_policy",
    "selection_reason",
    "candidate_count",
    "warnings",
)


class CalculationError(Exception):
    pass


class BatchCancelledError(CalculationError):
    pass


class ElectricalVariantCopyError(CalculationError):
    def __init__(
        self,
        *,
        code: str,
        message: str,
        status_code: int = 422,
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details = details or {}


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


def _missing_fields_from_message(message: str) -> list[str]:
    prefix = "Не заполнены обязательные поля объекта:"
    if prefix not in message:
        return []
    return [field.strip() for field in message.split(prefix, 1)[1].split(",") if field.strip()]


def _first_validation_field(exc: ValidationError) -> str | None:
    errors = exc.errors()
    if not errors:
        return None
    loc = errors[0].get("loc")
    if isinstance(loc, tuple) and loc:
        return ".".join(str(part) for part in loc)
    if isinstance(loc, list) and loc:
        return ".".join(str(part) for part in loc)
    return None


def _sphere_critical_radius_context(message: str) -> dict[str, float] | None:
    """Parse the stable exact-sphere rejection emitted by the formula layer."""

    if "sphere_below_critical_insulation_radius" not in message:
        return None
    names = (
        "router",
        "rcritical",
        "conductivity_outermost",
        "alpha_vnesh_applied",
    )
    context: dict[str, float] = {}
    for name in names:
        match = re.search(rf"\b{name}=([-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?)", message)
        if match is None:
            return None
        context[name] = float(match.group(1))
    return context


def build_heat_loss_error_payload(
    exc: Exception,
    *,
    object_type: str,
) -> dict[str, Any]:
    """Structured `project_objects.validation_errors`."""

    message = _clean_exception_message(exc)
    lower_message = message.lower()
    category = "validation"
    error_code = "invalid_object_params"
    field: str | None = None
    hint: str | None = "Проверьте параметры объекта и повторите расчёт."
    extra: dict[str, Any] = {}

    sphere_context = _sphere_critical_radius_context(message)
    if sphere_context is not None:
        return {
            "error_code": "sphere_below_critical_insulation_radius",
            "category": category,
            "message": message,
            "field": "insulation_layers",
            "hint": (
                "Увеличьте толщину внешнего слоя изоляции до критического радиуса " "или выше."
            ),
            "error_context": sphere_context,
        }
    if "process_temperature_not_above_ambient" in message:
        error_code = "process_temperature_not_above_ambient"
        field = "process_temperature"
        hint = "Температура продукта должна быть выше температуры воздуха."
    elif "process_temperature_not_above_ground" in message:
        error_code = "process_temperature_not_above_ground"
        field = "process_temperature"
        hint = "Температура продукта должна быть выше температуры грунта."
    if isinstance(exc, ProjectObjectParamsError):
        missing_fields = _missing_fields_from_message(message)
        if "неподдерживаемый тип объекта" in lower_message:
            category = "unsupported"
            error_code = "unsupported_object_type"
            field = "object_type"
            hint = "Для теплорасчёта поддерживаются только трубопроводы и резервуары."
        elif "режим tm" in lower_message or "режим температуры изоляции" in lower_message:
            field = "insulation_temperature_basis"
            hint = "Выберите режим tm, соответствующий размещению объекта."
        elif missing_fields:
            error_code = "missing_required_fields"
            field = missing_fields[0] if len(missing_fields) == 1 else None
            extra["missing_fields"] = missing_fields
            hint = "Заполните обязательные поля объекта."
    elif isinstance(exc, ValidationError):
        if "process_temperature_not_above_ambient" not in message and (
            "process_temperature_not_above_ground" not in message
        ):
            error_code = "schema_validation_error"
        if error_code == "schema_validation_error":
            field = _first_validation_field(exc)
        if error_code == "schema_validation_error":
            hint = "Проверьте формат и диапазоны значений."
    elif "неподдерживаемый тип объекта" in lower_message or "неизвестная форма" in lower_message:
        category = "unsupported"
        error_code = (
            "unsupported_object_type" if "тип объекта" in lower_message else "unsupported_shape"
        )
        field = "object_type" if "тип объекта" in lower_message else "shape"
        hint = "Выберите поддерживаемый тип или форму объекта."
    elif any(
        marker in lower_message
        for marker in (
            "требует",
            "требуются",
            "требуется",
            "долж",
            "диапазон",
            "положитель",
            "выше",
            "ниже",
            "превыш",
            "не может",
        )
    ):
        error_code = "invalid_object_params"
    else:
        category = "formula"
        error_code = "heat_loss_formula_error"
        hint = "Расчётная формула завершилась ошибкой; проверьте исходные данные."

    return {
        "error_code": error_code,
        "category": category,
        "message": message,
        "field": field,
        "hint": hint,
        **extra,
    }


@dataclass(frozen=True)
class BatchProgress:
    current: int
    total: int
    phase: str
    calculated: int = 0
    skipped: int = 0
    heat_loss_failed: int = 0
    object_id: UUID | None = None


@dataclass(frozen=True)
class ElectricalVariantCopyResult:
    project_id: UUID
    source_variant_number: int
    target_variant_number: int
    copied_count: int
    project_objects_count: int
    not_copied_uncalculated_count: int
    deleted_target_count: int
    overwrite_applied: bool
    specification_regenerated: bool
    validated_count: int
    validation_failed_count: int
    preserved_without_validation_count: int


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
                results=calc.results,
            )
            for calc in calculations
        ]

    async def cable_snapshot_statuses(
        self,
        calculations: list[ElectricalCalculation],
        catalog_source: CableSource = "builtin",
    ) -> dict[UUID, dict[str, Any]]:
        statuses: dict[UUID, dict[str, Any]] = {}
        catalog_cache: dict[tuple[str, str], list[dict[str, Any]]] = {}
        source = (
            catalog_source
            if catalog_source in ("builtin", "commercial", "extended", "all")
            else "builtin"
        )
        for calc in calculations:
            snapshot = calc.cable_snapshot
            if not isinstance(snapshot, dict):
                statuses[calc.id] = compare_cable_snapshot(None, None)
                continue
            cache_key = (calc.cable_type, source)
            if cache_key not in catalog_cache:
                catalog_cache[cache_key] = await self._load_catalog_for_snapshot_status(
                    calc.cable_type,
                    source,
                )
            mark = calc.cable_mark or snapshot.get("cable_mark")
            current_row = lookup_cable_row_for_snapshot(
                catalog_cache[cache_key],
                mark,
                calc.cable_type,
                snapshot,
            )
            statuses[calc.id] = compare_cable_snapshot(snapshot, current_row)
        return statuses

    async def _load_catalog_for_snapshot_status(
        self,
        cable_type: str,
        source: CableSource,
    ) -> list[dict[str, Any]]:
        if cable_type == "self_regulating":
            return await self.load_cable_catalog(source)
        if cable_type == "self_regulating_tt":
            return [{**c, "source": "builtin", "cable_type": cable_type} for c in list_tt_cables()]
        if cable_type in ("single_core", "three_core"):
            return await self.load_resistive_cable_catalog(cable_type, source)
        return []

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
        order_cable_length = func.coalesce(
            sa_cast(ElectricalCalculation.results["order_cable_length"].astext, Float),
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
        total_power = sa_cast(ElectricalCalculation.results["total_power"].astext, Float)
        current = sa_cast(ElectricalCalculation.results["current"].astext, Float)
        summary_result = await self.db.execute(
            select(
                func.count(ElectricalCalculation.id),
                func.count(ElectricalCalculation.id).filter(successful_calc),
                func.count(ElectricalCalculation.id).filter(failed_calc),
                func.count(ElectricalCalculation.id).filter(manual_cable_mark),
                func.coalesce(func.sum(order_cable_length).filter(successful_calc), 0.0),
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
            manual_cable_mark_count,
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
            "manual_cable_mark_count": int(manual_cable_mark_count or 0),
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

        builtin    — встроенная линейка ТЛТ для self_regulating
        commercial — встроенная линейка ТЛТ + commercial projection из БД
        extended   — только `cables_extended` (self_regulating)
        all        — объединение builtin + extended
        """
        if source not in ("builtin", "commercial", "extended", "all"):
            source = "builtin"
        builtin = [{**c, "source": "builtin"} for c in list_tlt_cables()]
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

    @staticmethod
    def _builtin_resistive_catalog(cable_type: str) -> list[dict[str, Any]]:
        key = "single_core" if cable_type == "single_core" else "three_core"
        return [
            {
                **c,
                "source": "builtin",
                "cable_type": cable_type,
                "conductor_cross_section": c.get(
                    "conductor_cross_section",
                    c.get("conductor_section_mm2"),
                ),
                "max_temperature": c.get(
                    "max_temperature",
                    RESISTIVE_DEFAULT_MAX_TEMPERATURE,
                ),
                "min_temperature": c.get(
                    "min_temperature",
                    RESISTIVE_DEFAULT_MIN_TEMPERATURE,
                ),
            }
            for c in list_resistive_cables().get(key, [])
        ]

    @classmethod
    def _merge_commercial_resistive_entry(
        cls,
        base: dict[str, Any],
        commercial: CableExtended | None,
    ) -> dict[str, Any]:
        entry = {
            **base,
            "source": "commercial",
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
        technical_keys = {
            "power_per_meter",
            "max_temperature",
            "min_temperature",
            "voltage",
            "resistance_ohm_km",
            "conductor_cross_section",
            "conductor_section_mm2",
            "diameter_mm",
            "nominal_size_mm",
        }
        for key, value in overlay.items():
            if key in {"model", "brand"}:
                continue
            if key in technical_keys:
                if entry.get(key) is None and value is not None:
                    entry[key] = value
                continue
            entry[key] = value
        return entry

    async def load_resistive_cable_catalog(
        self,
        cable_type: str,
        source: CableSource = "builtin",
    ) -> list[dict[str, Any]]:
        if source not in ("builtin", "commercial", "extended", "all"):
            source = "builtin"
        builtin = self._builtin_resistive_catalog(cable_type)
        builtin_by_model = {str(c["model"]): c for c in builtin}
        if source == "builtin":
            return builtin
        result = await self.db.execute(
            select(CableExtended).where(
                CableExtended.is_active.is_(True),
                CableExtended.cable_type == cable_type,
            )
        )
        rows = list(result.scalars().all())
        if source == "commercial":
            by_model = {c.model: c for c in rows}
            merged = [
                self._merge_commercial_resistive_entry(c, by_model.get(c["model"])) for c in builtin
            ]
            builtin_models = {c["model"] for c in builtin}
            merged.extend(
                self._extended_cable_catalog_entry(c, source="commercial")
                for c in rows
                if c.model not in builtin_models
            )
            return merged
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
    ) -> HeatLossResultDict:
        if apply_climate_policy:
            data = self._apply_climate_policy(object_type, data)
        if object_type == "pipe":
            forbidden = sorted(PIPE_FORBIDDEN_HEAT_PARAM_KEYS.intersection(data))
            if forbidden:
                raise ValueError("Forbidden pipe heat params: " + ", ".join(forbidden))
            stored = StoredPipeHeatParams(
                **{
                    key: value
                    for key, value in data.items()
                    if key in COMMON_HEAT_PARAM_KEYS | PIPE_HEAT_PARAM_KEYS
                }
            )
            params = PipeHeatLossParams(
                **self._heat_loss_formula_input(PipeHeatLossParams, stored.model_dump())
            )
            pipe_result = calc_pipe_heat_loss(params, coefficients=coefficients)
            result = pipe_result.model_dump()
            return cast(PipeHeatLossResultDict, result)
        elif object_type == "tank":
            forbidden = sorted(TANK_FORBIDDEN_HEAT_PARAM_KEYS.intersection(data))
            if forbidden:
                raise ValueError("Forbidden tank heat params: " + ", ".join(forbidden))
            stored_tank = StoredTankHeatParams(
                **{
                    key: value
                    for key, value in data.items()
                    if key in COMMON_HEAT_PARAM_KEYS | TANK_HEAT_PARAM_KEYS
                }
            )
            params_t = TankHeatLossParams(
                **self._heat_loss_formula_input(TankHeatLossParams, stored_tank.model_dump())
            )
            tank_result = calc_tank_heat_loss(params_t, coefficients=coefficients)
            result = tank_result.model_dump()
            return cast(TankHeatLossResultDict, result)
        else:
            raise CalculationError(f"Неподдерживаемый тип объекта: {object_type}")

    @staticmethod
    def _heat_loss_formula_input(
        schema: type[PipeHeatLossParams] | type[TankHeatLossParams],
        data: dict[str, Any],
    ) -> dict[str, Any]:
        """Project full object params to the strict formula schema contract."""

        return {key: value for key, value in data.items() if key in schema.model_fields}

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
        try:
            obj.params = prepare_project_object_params(obj.object_type, obj.params)
            obj.params = self._apply_climate_policy(obj.object_type, obj.params)
            resolved_coefficients = (
                coefficients if coefficients is not None else await self.get_coefficients()
            )
            result = self._calc_heat_loss_with_coefficients(
                obj.object_type,
                obj.params,
                resolved_coefficients,
                apply_climate_policy=False,
            )
            obj.results = cast(dict[str, Any], result)
            obj.is_valid = True
            obj.validation_errors = None
            return Ok(obj)
        except Exception as exc:
            message = _clean_exception_message(exc)
            obj.results = None
            obj.is_valid = False
            obj.validation_errors = build_heat_loss_error_payload(
                exc,
                object_type=obj.object_type,
            )
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
        return get_climate_entry(
            climate_key=str(data["climate_key"]) if data.get("climate_key") else None,
            city=str(data["climate_city"]) if data.get("climate_city") else None,
            region=str(data["climate_region"]) if data.get("climate_region") else None,
        )

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
        explicit_safety_factor = safety_factor is not None and safety_factor_source not in (
            "default",
            "climate_policy",
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
        manual_ambient_temperature = (
            normalized.get("ambient_temperature_source") == "manual"
            and cls._num(normalized.get("ambient_temperature")) is not None
        )
        uses_air_temperature = not (
            object_type == "pipe" and normalized.get("placement") == "underground"
        )
        if climate_temperature is not None and uses_air_temperature:
            if not manual_ambient_temperature:
                normalized["ambient_temperature"] = climate_temperature
                normalized["ambient_temperature_source"] = "climate"
            normalized["climate_temperature_basis"] = basis
        else:
            normalized.pop("climate_temperature_basis", None)
            if not uses_air_temperature:
                normalized.pop("ambient_temperature", None)
                normalized.pop("ambient_temperature_source", None)
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
        if processed_object_ids:
            await self.mark_project_specifications_stale(
                project_id,
                "heat_loss_batch_recalculate",
                object_ids=processed_object_ids if object_ids is not None else None,
                operation="batch_recalculate",
            )
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

        resolved_variant_id = electrical_variant_id or request.electrical_variant_id
        self._hydrate_electrical_request_from_object(request, obj)
        await self._prepare_self_regulating_tt_request(
            request,
            obj,
            electrical_variant_id=resolved_variant_id,
        )
        cable_mark, result_dict = self._calculate_electrical_result(request)
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

    def _tt_object_heat_inputs(
        self,
        obj: ProjectObject,
        explicit_payload: dict[str, Any],
    ) -> dict[str, Any]:
        """Map authoritative object/Heat data without engineering defaults."""
        params = obj.params if isinstance(obj.params, dict) else {}
        results = obj.results if isinstance(obj.results, dict) else {}
        values: dict[str, Any] = {}

        self._tt_optional_object_value(
            values, "product_temperature_c", params, "process_temperature"
        )
        self._tt_optional_object_value(values, "steam_temperature_c", params, "vapor_temperature")
        self._tt_optional_object_value(
            values, "maintain_temperature_c", params, "maintain_temperature"
        )
        cold_start = params.get("min_switch_temperature")
        if cold_start is None:
            cold_start = params.get("ambient_temperature")
        if cold_start is not None:
            values["cold_start_temperature_c"] = cold_start
        self._tt_optional_object_value(values, "aggressive_product", params, "aggressive_product")
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
            base_length = self._tank_base_cable_length(obj, explicit_payload)
            total_heat_loss_base = self._num(results.get("total_heat_loss_base"))
            if base_length is not None:
                values["base_length_m"] = base_length
                if total_heat_loss_base is not None and base_length > 0:
                    values["heat_loss_per_meter_w"] = total_heat_loss_base / base_length
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
        normalized = normalize_electrical_override_payload(explicit_payload)
        project_settings = await self._tt_project_settings(obj.project_id)
        assignment = await self._tt_assignment(
            obj.project_id,
            electrical_variant_id,
            obj.id,
        )
        project_values = (
            {"max_section_start_current_a": (project_settings.max_section_start_current_a)}
            if project_settings is not None
            else {}
        )
        assignment_values = (
            {
                "max_section_start_current_a": assignment.max_section_start_current_a,
            }
            if assignment is not None
            else {}
        )
        object_heat = self._tt_object_heat_inputs(obj, explicit_payload)
        resolved = configured_electrical_input_resolver().resolve(
            explicit=normalized.overrides,
            assignment=assignment_values,
            project_settings=project_values,
            object_heat=object_heat,
            legacy_aliases=normalized.legacy_aliases,
            boundary_warnings=normalized.warnings,
        )
        if app_settings.is_production:
            require_production_eligible_inputs(resolved)
        current_limit_source = resolved.sources.get("max_section_start_current_a")
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
            },
            "object_version": obj.version,
            "heat_result_version": obj.version,
            "project_settings_version": (
                project_settings.version
                if project_settings is not None and current_limit_source == "project_setting"
                else None
            ),
            "assignment_version": assignment.version if assignment is not None else None,
        }
        result_dict = calculate_electrical_tt(resolved, provenance=provenance)
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
        preserved = {
            key: value
            for key, value in request.data.items()
            if key in {"cable_source", "cable_type_source", "cable_mark_source"}
        }
        request.data = {
            **preserved,
            "required_power_per_meter": float(values.heat_loss_per_meter_w),
            "pipe_length": float(values.base_length_m),
            "process_temperature": float(values.product_temperature_c),
            "maintain_temperature": float(values.maintain_temperature_c),
            "supply_voltage": 230,
            "max_start_current_per_section": float(values.max_section_start_current_a),
            "vapor_temperature": (
                float(values.steam_temperature_c)
                if values.steam_temperature_c is not None
                else None
            ),
            "aggressive_product": values.aggressive_product,
            "winding_coefficient": result_dict["winding_coefficient"],
            "winding_pitch": (
                float(values.winding_pitch_mm) if values.winding_pitch_mm is not None else None
            ),
            "number_of_threads": values.thread_count,
            "requested_number_of_threads": values.thread_count,
            "number_of_threads_source": (
                THREAD_SOURCE_MANUAL if values.thread_count is not None else THREAD_SOURCE_AUTO
            ),
            "cable_mark": values.manual_cable_model,
            "selection_policy": values.selection_policy,
            "safety_factor": float(values.safety_factor),
            "cold_start_temperature_c": float(values.cold_start_temperature_c),
            "ambient_temperature": float(values.cold_start_temperature_c),
            "max_section_start_current_a": float(values.max_section_start_current_a),
            "outer_diameter_mm": (
                float(values.outer_diameter_mm) if values.outer_diameter_mm is not None else None
            ),
            "_tt_pipeline_result": result_dict,
        }

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
        if cable_type == "self_regulating":
            params_sr = SelfRegulatingParams(**request.data)
            result_obj = calc_self_regulating(params_sr)
            cable_mark = result_obj.selected_cable
            result_dict = result_obj.model_dump()
            request.data["supply_voltage"] = result_dict["voltage"]
        elif cable_type == "self_regulating_tt":
            prepared_result = request.data.pop("_tt_pipeline_result", None)
            if not isinstance(prepared_result, dict):
                raise CalculationError(
                    "TT calculation must be prepared by the canonical input pipeline"
                )
            result_dict = prepared_result
            cable_mark = str(result_dict["cable_mark"])
            return cable_mark, result_dict
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
        self._apply_section_plan(request, result_dict, cable_mark)
        return cable_mark, result_dict

    def _apply_section_plan(
        self,
        request: ElectricalRequest,
        result_dict: dict[str, Any],
        cable_mark: str | None,
    ) -> None:
        """Attach section metrics from the registered TT cable passport table."""
        if request.cable_type != "self_regulating_tt":
            return
        if not cable_mark or not isinstance(result_dict, dict):
            return
        try:
            from app.formulas.electrical.sections import (
                compute_section_plan,
                section_catalog_registered,
                section_plan_to_result_fields,
            )
        except Exception:
            return
        if not section_catalog_registered():
            return
        data = request.data if isinstance(request.data, dict) else {}
        cold = data.get("ambient_temperature")
        if cold is None:
            cold = data.get("min_switch_temperature")
        try:
            cold_f = float(cold) if cold is not None else -20.0
        except (TypeError, ValueError):
            cold_f = -20.0
        try:
            voltage = float(result_dict.get("voltage") or data.get("supply_voltage") or 220)
        except (TypeError, ValueError):
            voltage = 220.0
        try:
            start_current_limit = data.get("max_start_current_per_section")
            start_current_limit_f = (
                float(start_current_limit) if start_current_limit is not None else None
            )
        except (TypeError, ValueError):
            start_current_limit_f = None
        plan = compute_section_plan(
            mark=str(
                result_dict.get("cable_model") or result_dict.get("selected_cable") or cable_mark
            ),
            installed_cable_length_m=float(
                result_dict.get("installed_cable_length") or result_dict.get("cable_length") or 0
            ),
            power_per_meter_w=float(result_dict.get("power_per_meter") or 0),
            working_current_total_a=float(result_dict.get("current") or 0),
            voltage_v=voltage,
            cold_start_temp_c=cold_f,
            max_start_current_per_section_a=start_current_limit_f,
        )
        if plan is None:
            return
        result_dict.update(section_plan_to_result_fields(plan))

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
        )
        cable_mark_source = self._resolve_cable_mark_source(request_data)
        return build_cable_snapshot(
            cable_type=cable_type,
            cable_mark=cable_mark,
            cable_row=cable_row,
            requested_catalog_source=str(request_data.get("cable_source") or "builtin"),
            cable_mark_source=cable_mark_source,
            result_dict=result_dict,
        )

    @staticmethod
    def _snapshot_cable_row(
        cable_type: str,
        cable_mark: str | None,
        request_data: dict[str, Any],
    ) -> dict[str, Any] | None:
        if not cable_mark:
            return None
        if cable_type == "self_regulating_tt":
            catalog = [
                {**c, "source": "builtin", "cable_type": cable_type} for c in list_tt_cables()
            ]
            return lookup_cable_row(catalog, cable_mark, cable_type)
        catalog_value = request_data.get("cable_catalog")
        catalog = catalog_value if isinstance(catalog_value, list) else None
        if catalog is None and cable_type == "self_regulating":
            catalog = [{**c, "source": "builtin"} for c in list_tlt_cables()]
        return lookup_cable_row(catalog, cable_mark, cable_type)

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
    def _copied_variant_source_cable_mark(calc: ElectricalCalculation) -> str | None:
        results = calc.results if isinstance(calc.results, dict) else {}
        snapshot = calc.cable_snapshot if isinstance(calc.cable_snapshot, dict) else {}
        for value in (
            calc.cable_mark,
            results.get("cable_mark"),
            results.get("selected_cable"),
            snapshot.get("cable_mark"),
        ):
            if isinstance(value, str) and value.strip():
                return value.strip()
        return None

    @staticmethod
    def _copied_variant_cable_source(calc: ElectricalCalculation) -> CableSource:
        params = calc.params if isinstance(calc.params, dict) else {}
        snapshot = calc.cable_snapshot if isinstance(calc.cable_snapshot, dict) else {}
        value = params.get("cable_source") or snapshot.get("requested_catalog_source")
        if isinstance(value, str) and value in {"builtin", "commercial", "extended", "all"}:
            return value
        return "builtin"

    @staticmethod
    def _copy_validation_metadata(
        *,
        status: str,
        source_variant_number: int,
        target_variant_number: int,
        source_cable_mark: str | None,
    ) -> dict[str, Any]:
        return {
            "status": status,
            "mode": "exact_cable_check",
            "source_variant_number": source_variant_number,
            "target_variant_number": target_variant_number,
            "source_cable_mark": source_cable_mark,
            "autoselection_used": False,
        }

    @staticmethod
    def _preserve_copy_selection_metadata(
        source_calc: ElectricalCalculation,
        target_results: dict[str, Any],
    ) -> None:
        source_results = source_calc.results if isinstance(source_calc.results, dict) else {}
        for key in COPY_SELECTION_METADATA_KEYS:
            if key in source_results:
                target_results[key] = copy.deepcopy(source_results[key])

    def _copy_validation_overrides_from_source(
        self,
        calc: ElectricalCalculation,
    ) -> dict[str, Any]:
        overrides = copy.deepcopy(calc.params or {})
        results = calc.results if isinstance(calc.results, dict) else {}

        for key in (
            "supply_voltage",
            "connection_type",
            "winding_pitch",
            "winding_coefficient",
            "selection_policy",
            "selection_mode",
            "add_length",
            "heating_height",
            "laying_step",
            "maintain_temperature",
            "vapor_temperature",
            "aggressive_product",
        ):
            if overrides.get(key) is None and results.get(key) is not None:
                overrides[key] = results.get(key)

        if overrides.get("number_of_threads") is None and results.get("num_circuits") is not None:
            overrides["number_of_threads"] = results.get("num_circuits")
            overrides["number_of_threads_source"] = THREAD_SOURCE_PREVIOUS_RESULT

        if overrides.get("supply_voltage") is None and results.get("voltage") is not None:
            overrides["supply_voltage"] = results.get("voltage")

        return self._base_overrides_with_sources(overrides)

    async def _copy_validation_request_data(
        self,
        *,
        obj: ProjectObject,
        calc: ElectricalCalculation,
        cable_mark: str,
        tlt_catalogs: dict[CableSource, list[dict[str, Any]]],
        resistive_catalogs: dict[tuple[str, CableSource], list[dict[str, Any]]],
        coefficients: dict[str, float],
    ) -> dict[str, Any]:
        cable_source = self._copied_variant_cable_source(calc)
        if cable_source not in tlt_catalogs:
            tlt_catalogs[cable_source] = await self.load_cable_catalog(cable_source)

        resistive_catalog = None
        if calc.cable_type in ("single_core", "three_core"):
            catalog_key = (calc.cable_type, cable_source)
            if catalog_key not in resistive_catalogs:
                resistive_catalogs[catalog_key] = await self.load_resistive_cable_catalog(
                    calc.cable_type,
                    cable_source,
                )
            resistive_catalog = resistive_catalogs[catalog_key]

        data = self._build_electrical_data(
            obj=obj,
            cable_type=calc.cable_type,
            cable_mark=cable_mark,
            tlt_catalog=tlt_catalogs[cable_source],
            resistive_catalog=resistive_catalog,
            overrides=self._copy_validation_overrides_from_source(calc),
            coefficients=coefficients,
        )
        data["cable_source"] = cable_source
        data["cable_type_source"] = self._normalize_cable_type_source(calc.cable_type_source)
        data["cable_mark_source"] = self._normalize_cable_mark_source(calc.cable_mark_source)
        return data

    def _copied_variant_preserved_row(
        self,
        *,
        calc: ElectricalCalculation,
        target_variant_number: int,
        source_variant_number: int,
    ) -> dict[str, Any]:
        results = copy.deepcopy(calc.results or {})
        results["copy_validation"] = self._copy_validation_metadata(
            status="preserved_without_selected_cable",
            source_variant_number=source_variant_number,
            target_variant_number=target_variant_number,
            source_cable_mark=None,
        )
        return {
            "id": uuid.uuid4(),
            "project_id": calc.project_id,
            "object_id": calc.object_id,
            "variant_number": target_variant_number,
            "cable_type": calc.cable_type,
            "cable_type_source": calc.cable_type_source,
            "cable_mark": calc.cable_mark,
            "cable_mark_source": calc.cable_mark_source,
            "cable_snapshot": copy.deepcopy(calc.cable_snapshot),
            "params": copy.deepcopy(calc.params or {}),
            "results": results,
        }

    def _copied_variant_validation_failure_row(
        self,
        *,
        obj: ProjectObject,
        calc: ElectricalCalculation,
        target_variant_number: int,
        source_variant_number: int,
        cable_mark: str,
        error: Exception,
        request_data: dict[str, Any] | None,
    ) -> dict[str, Any]:
        error_request_data = dict(obj.params or {})
        if request_data:
            error_request_data.update(request_data)
        payload: dict[str, Any] = dict(
            build_electrical_error_payload(
                error,
                object_type=obj.object_type,
                object_name=(obj.params or {}).get("name"),
                cable_type=calc.cable_type,
                request_data=error_request_data,
            )
        )
        payload["copy_validation"] = self._copy_validation_metadata(
            status="failed",
            source_variant_number=source_variant_number,
            target_variant_number=target_variant_number,
            source_cable_mark=cable_mark,
        )
        params = copy.deepcopy(calc.params or {})
        if request_data:
            params.update(self._compact_electrical_params(request_data))
        params["cable_mark"] = cable_mark
        params["cable_type_source"] = self._normalize_cable_type_source(calc.cable_type_source)
        params["cable_mark_source"] = self._normalize_cable_mark_source(calc.cable_mark_source)
        return {
            "id": uuid.uuid4(),
            "project_id": calc.project_id,
            "object_id": calc.object_id,
            "variant_number": target_variant_number,
            "cable_type": calc.cable_type,
            "cable_type_source": calc.cable_type_source,
            "cable_mark": cable_mark,
            "cable_mark_source": calc.cable_mark_source,
            "cable_snapshot": copy.deepcopy(calc.cable_snapshot),
            "params": params,
            "results": payload,
        }

    async def copy_electrical_variant(
        self,
        project_id: UUID,
        *,
        source_variant_number: int,
        target_variant_number: int,
        source_electrical_variant_id: UUID,
        target_electrical_variant_id: UUID,
        overwrite: bool = False,
        regenerate_specification: bool = False,
    ) -> ElectricalVariantCopyResult:
        """Копирует расчёты/назначения между ЭР, оставляя спецификацию несформированной."""
        if regenerate_specification:
            raise ElectricalVariantCopyError(
                code="ELECTRICAL_VARIANT_SPECIFICATION_COPY_FORBIDDEN",
                message=(
                    "Спецификация не копируется и не регенерируется вместе с ЭР. "
                    "Сформируйте её отдельно после проверки расчётов."
                ),
                status_code=409,
            )
        if source_variant_number == target_variant_number:
            raise ElectricalVariantCopyError(
                code="same_variant",
                message="Source and target variants must differ.",
            )

        # The calculation rows are the source-of-truth snapshot for the copy.
        # Take the common project lifecycle lock before reading them so a
        # concurrent calculation cannot commit while this transaction waits
        # later on object/assignment locks and leave us copying stale rows.
        await self.db.execute(
            select(Project)
            .where(Project.id == project_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        source_result = await self.db.execute(
            select(ElectricalCalculation, ProjectObject)
            .join(ProjectObject, ProjectObject.id == ElectricalCalculation.object_id)
            .where(
                ElectricalCalculation.project_id == project_id,
                ElectricalCalculation.variant_number == source_variant_number,
                ElectricalCalculation.electrical_variant_id == source_electrical_variant_id,
            )
            .order_by(ProjectObject.sort_order, ProjectObject.id)
        )
        source_entries = list(source_result.all())
        if not source_entries:
            raise ElectricalVariantCopyError(
                code="source_empty",
                message=f"В СО{source_variant_number} нет расчётов для копирования.",
            )

        await self._stage_copied_assignment_intent(
            project_id,
            source_electrical_variant_id=source_electrical_variant_id,
            target_electrical_variant_id=target_electrical_variant_id,
            source_entries=source_entries,
        )

        project_objects_count = int(
            await self.db.scalar(
                select(func.count(ProjectObject.id)).where(ProjectObject.project_id == project_id)
            )
            or 0
        )
        target_count = int(
            await self.db.scalar(
                select(func.count(ElectricalCalculation.id)).where(
                    ElectricalCalculation.project_id == project_id,
                    ElectricalCalculation.variant_number == target_variant_number,
                    ElectricalCalculation.electrical_variant_id == target_electrical_variant_id,
                )
            )
            or 0
        )
        if target_count > 0 and not overwrite:
            raise ElectricalVariantCopyError(
                code="target_not_empty",
                message=f"СО{target_variant_number} уже содержит расчёты. Подтвердите замену.",
                status_code=409,
                details={
                    "target_variant_number": target_variant_number,
                    "target_count": target_count,
                },
            )

        try:
            if overwrite and target_count > 0:
                await self.db.execute(
                    delete(ElectricalCalculation).where(
                        ElectricalCalculation.project_id == project_id,
                        ElectricalCalculation.variant_number == target_variant_number,
                        ElectricalCalculation.electrical_variant_id == target_electrical_variant_id,
                    )
                )

            coefficients = await self.get_coefficients()
            tlt_catalogs: dict[CableSource, list[dict[str, Any]]] = {}
            resistive_catalogs: dict[tuple[str, CableSource], list[dict[str, Any]]] = {}
            rows: list[dict[str, Any]] = []
            validated_count = 0
            validation_failed_count = 0
            preserved_without_validation_count = 0

            for calc, obj in source_entries:
                copied_cable_mark = self._copied_variant_source_cable_mark(calc)
                if copied_cable_mark is None:
                    rows.append(
                        self._copied_variant_preserved_row(
                            calc=calc,
                            target_variant_number=target_variant_number,
                            source_variant_number=source_variant_number,
                        )
                    )
                    rows[-1]["electrical_variant_id"] = target_electrical_variant_id
                    preserved_without_validation_count += 1
                    continue

                request_data: dict[str, Any] | None = None
                try:
                    request_data = await self._copy_validation_request_data(
                        obj=obj,
                        calc=calc,
                        cable_mark=copied_cable_mark,
                        tlt_catalogs=tlt_catalogs,
                        resistive_catalogs=resistive_catalogs,
                        coefficients=coefficients,
                    )
                    request = ElectricalRequest(
                        object_id=obj.id,
                        cable_type=cast(Any, calc.cable_type),
                        variant_number=target_variant_number,
                        data=request_data,
                    )
                    await self._prepare_self_regulating_tt_request(
                        request,
                        obj,
                        electrical_variant_id=target_electrical_variant_id,
                    )
                    validated_cable_mark, result_dict = self._calculate_electrical_result(request)
                    if validated_cable_mark != copied_cable_mark:
                        raise CalculationError(
                            "Проверка скопированного выбора вернула другую марку кабеля: "
                            f"{validated_cable_mark or '—'} вместо {copied_cable_mark}. "
                            "Автоподбор при создании на основании запрещён."
                        )
                    self._preserve_copy_selection_metadata(calc, result_dict)
                    result_dict["copy_validation"] = self._copy_validation_metadata(
                        status="validated",
                        source_variant_number=source_variant_number,
                        target_variant_number=target_variant_number,
                        source_cable_mark=copied_cable_mark,
                    )
                    cable_snapshot = self._build_cable_snapshot_for_result(
                        request=request,
                        cable_mark=validated_cable_mark,
                        result_dict=result_dict,
                    )
                    rows.append(
                        {
                            "id": uuid.uuid4(),
                            "project_id": calc.project_id,
                            "object_id": calc.object_id,
                            "variant_number": target_variant_number,
                            "electrical_variant_id": target_electrical_variant_id,
                            "cable_type": calc.cable_type,
                            "cable_type_source": calc.cable_type_source,
                            "cable_mark": validated_cable_mark,
                            "cable_mark_source": calc.cable_mark_source,
                            "cable_snapshot": cable_snapshot,
                            "params": self._compact_electrical_params(request.data),
                            "results": result_dict,
                        }
                    )
                    validated_count += 1
                except Exception as exc:
                    rows.append(
                        self._copied_variant_validation_failure_row(
                            obj=obj,
                            calc=calc,
                            target_variant_number=target_variant_number,
                            source_variant_number=source_variant_number,
                            cable_mark=copied_cable_mark,
                            error=exc,
                            request_data=request_data,
                        )
                    )
                    rows[-1]["electrical_variant_id"] = target_electrical_variant_id
                    validation_failed_count += 1

            await self._bulk_upsert_electrical_calculations(rows, return_calcs=False)
            await self.db.execute(
                delete(Specification).where(
                    Specification.project_id == project_id,
                    Specification.variant_number == target_variant_number,
                    Specification.electrical_variant_id == target_electrical_variant_id,
                )
            )

            await self.db.commit()
        except Exception:
            await self.db.rollback()
            raise

        return ElectricalVariantCopyResult(
            project_id=project_id,
            source_variant_number=source_variant_number,
            target_variant_number=target_variant_number,
            copied_count=len(source_entries),
            project_objects_count=project_objects_count,
            not_copied_uncalculated_count=max(0, project_objects_count - len(source_entries)),
            deleted_target_count=target_count if overwrite else 0,
            overwrite_applied=overwrite,
            specification_regenerated=False,
            validated_count=validated_count,
            validation_failed_count=validation_failed_count,
            preserved_without_validation_count=preserved_without_validation_count,
        )

    async def _stage_copied_assignment_intent(
        self,
        project_id: UUID,
        *,
        source_electrical_variant_id: UUID,
        target_electrical_variant_id: UUID,
        source_entries: list[tuple[ElectricalCalculation, ProjectObject]],
    ) -> None:
        """Stage target assignments after the caller has locked the project."""
        object_ids = sorted({obj.id for _calc, obj in source_entries}, key=str)
        await self.db.execute(
            select(ProjectObject)
            .where(
                ProjectObject.project_id == project_id,
                ProjectObject.id.in_(object_ids),
            )
            .order_by(ProjectObject.id)
            .with_for_update()
        )
        result = await self.db.execute(
            select(ElectricalVariantObject)
            .where(
                ElectricalVariantObject.project_id == project_id,
                ElectricalVariantObject.electrical_variant_id.in_(
                    [source_electrical_variant_id, target_electrical_variant_id]
                ),
                ElectricalVariantObject.object_id.in_(object_ids),
            )
            .order_by(
                ElectricalVariantObject.electrical_variant_id,
                ElectricalVariantObject.object_id,
            )
            .with_for_update()
        )
        assignments = {
            (assignment.electrical_variant_id, assignment.object_id): assignment
            for assignment in result.scalars().all()
        }
        missing = [
            {"electrical_variant_id": str(variant_id), "object_id": str(object_id)}
            for variant_id in (
                source_electrical_variant_id,
                target_electrical_variant_id,
            )
            for object_id in object_ids
            if (variant_id, object_id) not in assignments
        ]
        if missing:
            raise ElectricalAssignmentServiceError(
                "ELECTRICAL_ASSIGNMENT_REQUIRED",
                "Для копирования отсутствует assignment исходного или целевого ЭР",
                status_code=409,
                details={"assignments": missing},
            )

        object_versions = {obj.id: obj.version for _calc, obj in source_entries}
        for calculation, obj in source_entries:
            source = assignments[(source_electrical_variant_id, obj.id)]
            target = assignments[(target_electrical_variant_id, obj.id)]
            requested_system = ElectricalAssignmentService.normalize_system_type(
                calculation.cable_type
            )
            if (
                requested_system not in {"self_regulating", "resistive"}
                or source.system_type != requested_system
            ):
                raise ElectricalAssignmentServiceError(
                    "ELECTRICAL_ASSIGNMENT_SYSTEM_MISMATCH",
                    "Исходный расчёт не соответствует assignment исходного ЭР",
                    status_code=409,
                    details={
                        "object_id": str(obj.id),
                        "assigned_system_type": source.system_type,
                        "requested_cable_type": calculation.cable_type,
                    },
                )
            if target.system_type not in (None, source.system_type):
                raise ElectricalAssignmentServiceError(
                    "ELECTRICAL_ASSIGNMENT_REASSIGN_REQUIRES_UNASSIGN",
                    "Перед копированием очистите несовместимое назначение целевого ЭР",
                    status_code=409,
                    details={"object_ids": [str(obj.id)]},
                )
            if target.system_type == source.system_type:
                continue
            target.system_type = source.system_type
            target.assignment_state = "stale"
            target.requested_cable_type = None
            target.object_version_snapshot = object_versions[obj.id]
            target.diagnostics = {
                "error_code": "ELECTRICAL_CALCULATION_REQUIRED",
                "category": "stale",
                "reason": "electrical_variant_copy",
                "message": "Назначение скопировано; выполняется проверка расчёта",
            }
            target.version += 1

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
        cable_type: str,
        overrides: dict[str, Any],
        params: dict[str, Any],
        coefficients: dict[str, float] | None,
        supply_voltage: float,
    ) -> dict[str, Any]:
        """DB-backed VSDX policy values with deterministic fallbacks."""
        max_linear_aliases = (
            ("resistive_single_core_max_linear_power_w_m",)
            if cable_type == "single_core"
            else ("resistive_three_core_max_linear_power_w_m",)
        )
        max_linear_power = self._pick_numeric_policy(
            key="max_linear_power_w_m",
            fallback=default_resistive_max_linear_power_w_m(cable_type),
            overrides=overrides,
            params=params,
            coefficients=coefficients,
            aliases=max_linear_aliases,
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
                fallback=RESISTIVE_DEFAULT_MIN_ADJUSTED_VOLTAGE,
                overrides=overrides,
                params=params,
                coefficients=coefficients,
                aliases=("resistive_min_adjusted_voltage_v", "resistive_min_voltage_v"),
            ),
            "voltage_step": self._pick_numeric_policy(
                key="voltage_step",
                fallback=RESISTIVE_DEFAULT_VOLTAGE_STEP,
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
    def _bool_policy_value(value: Any) -> bool:
        if isinstance(value, bool):
            return value
        if isinstance(value, int | float):
            return float(value) >= 1.0
        if isinstance(value, str):
            return value.strip().lower() in {"1", "true", "yes", "approved", "on"}
        return False

    def _balanced_ranking_payload(
        self,
        *,
        overrides: dict[str, Any],
        params: dict[str, Any],
        coefficients: dict[str, float] | None,
    ) -> dict[str, Any]:
        explicit_weights = overrides.get("balanced_weights") or params.get("balanced_weights")
        if isinstance(explicit_weights, dict) and explicit_weights:
            weights = {
                key: float(value)
                for key, value in explicit_weights.items()
                if key in {"cost", "delivery", "stock", "supplier"} and value is not None
            }
            version = str(
                overrides.get("balanced_weights_version")
                or params.get("balanced_weights_version")
                or "request_weights"
            )
        else:
            weights = {
                "cost": self._pick_numeric_policy(
                    key="commercial_balanced_weight_cost",
                    fallback=0.45,
                    overrides=overrides,
                    params=params,
                    coefficients=coefficients,
                )
                or 0.45,
                "delivery": self._pick_numeric_policy(
                    key="commercial_balanced_weight_delivery",
                    fallback=0.25,
                    overrides=overrides,
                    params=params,
                    coefficients=coefficients,
                )
                or 0.25,
                "stock": self._pick_numeric_policy(
                    key="commercial_balanced_weight_stock",
                    fallback=0.2,
                    overrides=overrides,
                    params=params,
                    coefficients=coefficients,
                )
                or 0.2,
                "supplier": self._pick_numeric_policy(
                    key="commercial_balanced_weight_supplier",
                    fallback=0.1,
                    overrides=overrides,
                    params=params,
                    coefficients=coefficients,
                )
                or 0.1,
            }
            version = (
                "db_coefficients"
                if coefficients
                and any(key.startswith("commercial_balanced_weight_") for key in coefficients)
                else "default_unapproved"
            )

        approved_raw = (
            overrides.get("balanced_weights_approved")
            if overrides.get("balanced_weights_approved") is not None
            else params.get("balanced_weights_approved")
        )
        if approved_raw is None and coefficients is not None:
            approved_raw = coefficients.get("commercial_balanced_weights_approved")
        return {
            "balanced_weights": weights,
            "balanced_weights_approved": self._bool_policy_value(approved_raw),
            "balanced_weights_version": version,
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

        `total_heat_loss_design` у резервуара уже содержит K, а электрическая
        формула применит K повторно. Значит на вход ей нужно отдать `Q / K`,
        включая часть `Q_доп`; иначе дополнительная теплопотеря будет
        ошибочно умножена на K второй раз.
        """
        total = self._positive_heat_loss(results.get("total_heat_loss_design"))
        k = float(results.get("safety_factor_applied") or fallback_safety_factor or 1.1)
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
            return self._positive_heat_loss(results.get("heat_loss_per_meter_base"))

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
        catalog_override: list[dict[str, Any]] | None = None,
    ) -> list[dict[str, Any]] | None:
        if cable_mark is None:
            return None
        if catalog_override is None:
            catalog = list_resistive_cables()
            key = "single_core" if cable_type == "single_core" else "three_core"
            rows = list(catalog.get(key, []))
        else:
            rows = catalog_override
        match = [c for c in rows if c.get("model") == cable_mark]
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
        resistive_catalog: list[dict[str, Any]] | None = None,
        overrides: dict[str, Any],
        coefficients: dict[str, float] | None = None,
    ) -> dict[str, Any]:
        """Единый маппинг теплопотери/объект → payload электрической формулы."""
        if not obj.is_valid or not obj.results or obj.results.get("stale"):
            raise CalculationError("Теплопотери объекта не рассчитаны — невозможно выбрать кабель")

        params = obj.params or {}
        results = obj.results or {}
        if cable_type == "self_regulating_tt":
            explicit_tt = dict(overrides)
            if cable_mark is not None:
                explicit_tt["cable_mark"] = cable_mark
            return {
                "cable_mark": cable_mark,
                "_tt_explicit_overrides": explicit_tt,
            }
        supply_voltage = self._num(
            overrides.get("supply_voltage") or params.get("supply_voltage"),
            220.0,
        )
        safety_factor = self._num(overrides.get("safety_factor"))
        if safety_factor is None:
            safety_factor = self._num(params.get("safety_factor"), 1.1)
        pipe_length = self._base_cable_length(obj, overrides, params, results)
        winding_pitch = self._winding_pitch_mm(overrides, params)
        override_maintain_temperature = self._num(overrides.get("maintain_temperature"))
        object_maintain_temperature = self._num(params.get("maintain_temperature"))
        maintain_temperature = (
            override_maintain_temperature
            if override_maintain_temperature is not None
            else object_maintain_temperature
        )

        if cable_type == "self_regulating":
            required_power_per_meter = self._required_power_per_meter(
                obj, cable_type, overrides, safety_factor or 1.1
            )
            process_temperature = self._required_process_temperature(None, params)
            thread_payload = self._number_of_threads_payload(
                overrides,
                params,
                1 if cable_mark is not None else None,
            )
            return {
                "required_power_per_meter": required_power_per_meter,
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
                **self._balanced_ranking_payload(
                    overrides=overrides,
                    params=params,
                    coefficients=coefficients,
                ),
                **thread_payload,
            }

        if cable_type in ("single_core", "three_core"):
            required_heat_loss = self._positive_heat_loss(results.get("total_heat_loss_design"))
            process_temperature = self._required_process_temperature(None, params)
            thread_payload = self._number_of_threads_payload(overrides, params, 1)
            data = {
                "required_heat_loss": required_heat_loss,
                "pipe_length": pipe_length,
                "add_length": self._num(overrides.get("add_length"), 0.0),
                "process_temperature": process_temperature,
                "supply_voltage": supply_voltage,
                "maintain_temperature": maintain_temperature,
                "connection_type": overrides.get("connection_type")
                or params.get("connection_type")
                or "line_1ph",
                "winding_coefficient": self._winding_coefficient(obj, overrides, params, 1.0),
                "winding_pitch": winding_pitch,
                **thread_payload,
                "selection_policy": overrides.get("selection_policy") or "technical_minimum",
                **self._balanced_ranking_payload(
                    overrides=overrides,
                    params=params,
                    coefficients=coefficients,
                ),
                "cable_catalog": (
                    self._resistive_manual_catalog(cable_type, cable_mark, resistive_catalog)
                    if cable_mark is not None
                    else resistive_catalog
                ),
            }
            data.update(
                self._resistive_policy_payload(
                    cable_type=cable_type,
                    overrides=overrides,
                    params=params,
                    coefficients=coefficients,
                    supply_voltage=supply_voltage,
                )
            )
            data.update(self._tank_geometry_payload(obj, overrides))
            return data

        return {}

    def _candidate_identity_fallback_data(
        self,
        *,
        obj: ProjectObject,
        cable_type: str,
        cable_mark: str | None,
        cable_source: CableSource,
        tlt_catalog: list[dict[str, Any]],
        resistive_catalog: list[dict[str, Any]] | None,
        overrides: dict[str, Any],
    ) -> dict[str, Any]:
        params = obj.params or {}
        data: dict[str, Any] = dict(overrides)
        data["cable_mark"] = cable_mark
        data["cable_source"] = cable_source
        data["supply_voltage"] = self._num(
            overrides.get("supply_voltage") or params.get("supply_voltage"),
            220.0,
        )
        data["winding_pitch"] = self._winding_pitch_mm(overrides, params)
        if cable_type == "self_regulating":
            data["cable_catalog"] = tlt_catalog
            data["winding_coefficient"] = self._winding_coefficient(obj, overrides, params, 1.0)
            data.update(
                self._number_of_threads_payload(
                    overrides,
                    params,
                    1 if cable_mark is not None else None,
                )
            )
        elif cable_type == "self_regulating_tt":
            data["winding_coefficient"] = self._winding_coefficient(obj, overrides, params, 1.1)
            data.update(self._number_of_threads_payload(overrides, params, None))
        elif cable_type in ("single_core", "three_core"):
            data["winding_coefficient"] = self._winding_coefficient(obj, overrides, params, 1.0)
            data["cable_catalog"] = (
                self._resistive_manual_catalog(cable_type, cable_mark, resistive_catalog)
                if cable_mark is not None
                else resistive_catalog
            )
            data.update(self._number_of_threads_payload(overrides, params, 1))
        return data

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
            merged[key] = value
        return merged

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
        if variant_number < 1 or variant_number > 5:
            raise CalculationError("variant_number должен быть от 1 до 5")
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
        cable_type: str = "self_regulating",
        cable_source: CableSource = "builtin",
        mode: str = "auto",
        cable_mark: str | None = None,
        electrical_params: dict[str, Any] | None = None,
    ) -> tuple[ElectricalCandidate, str]:
        """Считает и upsert-ит кандидат кабеля, не применяя его в ElectricalCalculation."""
        if variant_number < 1 or variant_number > 5:
            raise CalculationError("variant_number должен быть от 1 до 5")
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
            resistive_catalog = (
                await self.load_resistive_cable_catalog(cable_type, cable_source)
                if cable_type in ("single_core", "three_core")
                else None
            )
            request_data = self._candidate_identity_fallback_data(
                obj=obj,
                cable_type=cable_type,
                cable_mark=cable_mark,
                cable_source=cable_source,
                tlt_catalog=catalog,
                resistive_catalog=resistive_catalog,
                overrides=overrides,
            )
            coefficients = await self.get_coefficients()
            request_data = self._build_electrical_data(
                obj=obj,
                cable_type=cable_type,
                cable_mark=cable_mark,
                tlt_catalog=catalog,
                resistive_catalog=resistive_catalog,
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
            calc = await self.select_cable_manual(
                candidate.object_id,
                candidate.cable_mark,
                candidate.cable_source,
                candidate.variant_number,
                candidate.cable_type,
                candidate.params,
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
        resistive_catalog = (
            await self.load_resistive_cable_catalog(cable_type, cable_source)
            if cable_type in ("single_core", "three_core")
            else None
        )
        coefficients = await self.get_coefficients()
        data = self._build_electrical_data(
            obj=obj,
            cable_type=cable_type,
            cable_mark=cable_mark,
            tlt_catalog=catalog,
            resistive_catalog=resistive_catalog,
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

    @staticmethod
    def _normalize_selection_variant_numbers(variant_numbers: list[int]) -> list[int]:
        normalized = list(dict.fromkeys(int(value) for value in variant_numbers))
        if not normalized:
            raise CalculationError("Нужно выбрать хотя бы одно СО")
        invalid = [value for value in normalized if value < 1 or value > 4]
        if invalid:
            raise CalculationError("variant_numbers должны быть от 1 до 4")
        return normalized

    async def select_cable_for_variants(
        self,
        object_id: UUID,
        cable_mark: str | None,
        cable_source: CableSource = "builtin",
        variant_numbers: list[int] | None = None,
        cable_type: str = "self_regulating",
        electrical_params: dict[str, Any] | None = None,
        electrical_variant_ids: dict[int, UUID] | None = None,
    ) -> list[ElectricalCalculation]:
        """Атомарно применяет ручной выбор или автоподбор к нескольким СО."""
        obj = await self._load_selectable_object(object_id)
        variants = self._normalize_selection_variant_numbers(variant_numbers or [1])
        normalized_mark = cable_mark.strip() if isinstance(cable_mark, str) else None
        if normalized_mark == "":
            normalized_mark = None
        calcs: list[ElectricalCalculation] = []
        try:
            for variant_number in variants:
                calcs.append(
                    await self._select_cable_for_object(
                        obj,
                        cable_mark=normalized_mark,
                        cable_source=cable_source,
                        variant_number=variant_number,
                        cable_type=cable_type,
                        electrical_params=electrical_params,
                        commit=False,
                        electrical_variant_id=(electrical_variant_ids or {}).get(variant_number),
                    )
                )
            await self.db.commit()
        except Exception:
            await self.db.rollback()
            raise
        for calc in calcs:
            await self.db.refresh(calc)
        return calcs

    async def select_cable_manual(
        self,
        object_id: UUID,
        cable_mark: str,
        cable_source: CableSource = "builtin",
        variant_number: int = 1,
        cable_type: str = "self_regulating",
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
        cable_type: str = "self_regulating",
        electrical_params: dict[str, Any] | None = None,
        skip_manual: bool = True,
        return_calcs: bool = True,
        progress_callback: ProgressCallback | None = None,
        should_cancel: CancelChecker | None = None,
        object_ids: list[UUID] | None = None,
        object_overrides: list[dict[str, Any]] | None = None,
        force_cable_type: bool = False,
        electrical_variant_id: UUID | None = None,
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
        resistive_catalogs: dict[str, list[dict[str, Any]]] = {}
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
                    overrides = self._merge_electrical_overrides(
                        base_overrides,
                        self._layout_overrides_from_existing(existing_calc),
                    )
                    if (
                        object_cable_type in ("single_core", "three_core")
                        or overrides.get("selection_policy") == "balanced"
                    ) and electrical_coefficients is None:
                        electrical_coefficients = await self.get_coefficients()
                    resistive_catalog = None
                    if object_cable_type in ("single_core", "three_core"):
                        if object_cable_type not in resistive_catalogs:
                            resistive_catalogs[
                                object_cable_type
                            ] = await self.load_resistive_cable_catalog(
                                object_cable_type,
                                cable_source,
                            )
                        resistive_catalog = resistive_catalogs[object_cable_type]
                    request_data = self._build_electrical_data(
                        obj=obj,
                        cable_type=object_cable_type,
                        cable_mark=None,
                        tlt_catalog=catalog,
                        resistive_catalog=resistive_catalog,
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
        cable_type: str = "self_regulating",
    ) -> None:
        """Сохраняет или обновляет запись ElectricalCalculation с ошибкой."""
        await self._upsert_failed_electrical(
            obj,
            error_message,
            variant_number,
            cable_type,
        )
        await self.db.commit()

    async def get_cable_options(self, object_id: UUID) -> list[dict[str, Any]]:
        from app.reference_data.loader import list_tlt_cables

        return list_tlt_cables()
