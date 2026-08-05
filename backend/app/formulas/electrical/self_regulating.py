"""Электротехнический расчёт саморегулирующихся кабелей серий ТТН/ТТВ/ТТХ.

РЕШЕНИЕ 2026-08-03 (DEC-07): legacy-расчёт по условным маркам «ТЛТ» удалён."""

import math
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from typing import Any

from app.electrical_domain import ElectricalFormulaError
from app.formulas.electrical.cable_geometry import compute_tank_cable_length
from app.formulas.electrical.decimal_math import SIX_PLACES, decimal_value, round_result, round_up
from app.formulas.electrical.sections import section_catalog_payload_snapshot
from app.reference_data.loader import (
    list_electrical_tt_bom_entries,
    list_tt_cables,
)
from app.schemas.calculation import (
    SelfRegulatingTTParams,
    SelfRegulatingTTResult,
)

MAX_SELF_REG_AUTO_THREADS = 3


# ---------------------------------------------------------------------------
# Расчёт кабелей серии ТТН / ТТВ / ТТХ
# ---------------------------------------------------------------------------

_TT_SERIES = frozenset({"ТТН", "ТТВ", "ТТХ"})


@dataclass(frozen=True, slots=True)
class TTCatalogCandidate:
    power_row: Mapping[str, Any]
    bom_row: Mapping[str, Any]
    base_model: str
    full_mark: str
    series: str
    passport_power: Decimal
    min_ambient_temperature: Decimal
    max_product_temperature: Decimal


def _tt_row_series(row: Mapping[str, Any]) -> str:
    series = str(row.get("series") or "").strip().upper()
    if series in _TT_SERIES:
        return series
    model = "".join(str(row.get("model") or "").split()).upper()
    for candidate in _TT_SERIES:
        if candidate in model:
            return candidate
    raise ElectricalFormulaError(
        "ELECTRICAL_CATALOG_ROW_INVALID",
        "Строка power-каталога не содержит допустимую серию",
        details={"model": row.get("model")},
    )


def _tt_row_nominal_power(row: Mapping[str, Any]) -> Decimal:
    value = row.get("nominal_power")
    if value is None:
        raise ElectricalFormulaError(
            "ELECTRICAL_CATALOG_ROW_INVALID",
            "Строка power-каталога не содержит паспортную мощность",
            details={"model": row.get("model"), "missing_fields": ["nominal_power"]},
        )
    try:
        power = decimal_value(value)
    except (InvalidOperation, TypeError, ValueError) as exc:
        raise ElectricalFormulaError(
            "ELECTRICAL_CATALOG_ROW_INVALID",
            "Паспортная мощность строки power-каталога некорректна",
            details={"model": row.get("model"), "invalid_fields": ["nominal_power"]},
        ) from exc
    if not power.is_finite() or power <= 0:
        raise ElectricalFormulaError(
            "ELECTRICAL_CATALOG_ROW_INVALID",
            "Паспортная мощность строки power-каталога должна быть положительной",
            details={"model": row.get("model"), "invalid_fields": ["nominal_power"]},
        )
    return power


def _tt_row_max_product_temperature(row: Mapping[str, Any]) -> Decimal:
    value = row.get("max_product_temp")
    if value is None:
        raise ElectricalFormulaError(
            "ELECTRICAL_CATALOG_ROW_INVALID",
            "Строка power-каталога не содержит T_max",
            details={"model": row.get("model"), "missing_fields": ["max_product_temp"]},
        )
    try:
        maximum = decimal_value(value)
    except (InvalidOperation, TypeError, ValueError) as exc:
        raise ElectricalFormulaError(
            "ELECTRICAL_CATALOG_ROW_INVALID",
            "T_max строки power-каталога некорректна",
            details={"model": row.get("model"), "invalid_fields": ["max_product_temp"]},
        ) from exc
    if not maximum.is_finite():
        raise ElectricalFormulaError(
            "ELECTRICAL_CATALOG_ROW_INVALID",
            "T_max строки power-каталога должна быть конечным числом",
            details={"model": row.get("model"), "invalid_fields": ["max_product_temp"]},
        )
    return maximum


def _section_row_model(row: Mapping[str, Any]) -> str:
    return "".join(str(row.get("base_model") or row.get("mark") or "").split()).upper()


def _section_row_temperature(row: Mapping[str, Any]) -> Decimal | None:
    raw = row.get("cold_start_temperature_c", row.get("cold_start_temp_c"))
    if raw is None:
        return None
    try:
        temperature = decimal_value(raw)
    except (InvalidOperation, TypeError, ValueError):
        return None
    return temperature if temperature.is_finite() else None


def _tt_model_min_temperature(
    model: str,
    section_catalog_rows: Sequence[Mapping[str, Any]],
) -> Decimal:
    normalized_model = "".join(model.split()).upper()
    temperatures = [
        temperature
        for row in section_catalog_rows
        if _section_row_model(row) == normalized_model
        and (temperature := _section_row_temperature(row)) is not None
    ]
    if not temperatures:
        raise ElectricalFormulaError(
            "ELECTRICAL_CATALOG_ROW_INVALID",
            "Для модели отсутствует T_min из каталога секционирования",
            details={"model": model, "missing_fields": ["min_temperature"]},
        )
    return min(temperatures)


def _validated_tt_catalog_rows(
    catalog_rows: Sequence[Mapping[str, Any]],
    section_catalog_rows: Sequence[Mapping[str, Any]],
) -> list[tuple[Mapping[str, Any], Decimal, Decimal, Decimal, str]]:
    validated: list[tuple[Mapping[str, Any], Decimal, Decimal, Decimal, str]] = []
    for row in catalog_rows:
        model = "".join(str(row.get("model") or "").split()).upper()
        if not model:
            raise ElectricalFormulaError(
                "ELECTRICAL_CATALOG_ROW_INVALID",
                "Строка power-каталога не содержит модель",
                details={"model": row.get("model"), "missing_fields": ["model"]},
            )
        series = _tt_row_series(row)
        nominal_power = _tt_row_nominal_power(row)
        max_product_temperature = _tt_row_max_product_temperature(row)
        min_ambient_temperature = _tt_model_min_temperature(model, section_catalog_rows)
        validated.append(
            (
                row,
                nominal_power,
                min_ambient_temperature,
                max_product_temperature,
                series,
            )
        )
    return validated


def build_tt_catalog_candidates(
    power_catalog_rows: Sequence[Mapping[str, Any]],
    section_catalog_rows: Sequence[Mapping[str, Any]],
    bom_catalog_rows: Sequence[Mapping[str, Any]],
) -> list[TTCatalogCandidate]:
    """Join exact technical marks without synthesizing an undocumented suffix."""
    validated = _validated_tt_catalog_rows(power_catalog_rows, section_catalog_rows)
    candidates: list[TTCatalogCandidate] = []
    seen_marks: set[str] = set()
    for power_row, passport_power, t_min, t_max, series in validated:
        base_model = "".join(str(power_row.get("model") or "").split()).upper()
        matching_bom_rows = [
            row
            for row in bom_catalog_rows
            if "".join(str(row.get("full_mark") or "").split()).upper().startswith(f"{base_model}-")
        ]
        if not matching_bom_rows:
            raise ElectricalFormulaError(
                "ELECTRICAL_CATALOG_ROW_INVALID",
                "Для базовой модели отсутствует exact full_mark в BOM-каталоге",
                details={"model": base_model, "missing_fields": ["full_mark"]},
            )
        for bom_row in matching_bom_rows:
            full_mark = "".join(str(bom_row.get("full_mark") or "").split()).upper()
            nomenclature_code = str(bom_row.get("nomenclature_code") or "").strip()
            missing_fields = []
            if not full_mark:
                missing_fields.append("full_mark")
            if not nomenclature_code:
                missing_fields.append("nomenclature_code")
            if missing_fields:
                raise ElectricalFormulaError(
                    "ELECTRICAL_CATALOG_ROW_INVALID",
                    "BOM-строка технической марки неполна",
                    details={"model": base_model, "missing_fields": missing_fields},
                )
            if full_mark in seen_marks:
                raise ElectricalFormulaError(
                    "ELECTRICAL_CATALOG_ROW_INVALID",
                    "BOM-каталог содержит дублирующуюся техническую марку",
                    details={"model": base_model, "duplicate_full_mark": full_mark},
                )
            seen_marks.add(full_mark)
            candidates.append(
                TTCatalogCandidate(
                    power_row=power_row,
                    bom_row=bom_row,
                    base_model=base_model,
                    full_mark=full_mark,
                    series=series,
                    passport_power=passport_power,
                    min_ambient_temperature=t_min,
                    max_product_temperature=t_max,
                )
            )
    return candidates


def compute_winding_factor(*, outer_diameter_mm: float, winding_pitch_mm: float | None) -> Decimal:
    """Return Kнав from canonical millimetre inputs and enforce the diameter table."""
    diameter_mm = decimal_value(outer_diameter_mm)
    if diameter_mm <= 0:
        raise ElectricalFormulaError(
            "ELECTRICAL_WINDING_PITCH_INVALID", "Наружный диаметр должен быть положительным"
        )
    if winding_pitch_mm is None:
        return Decimal(1)
    pitch_mm = decimal_value(winding_pitch_mm)
    if pitch_mm <= diameter_mm:
        raise ElectricalFormulaError(
            "ELECTRICAL_WINDING_PITCH_INVALID",
            "Шаг навива должен быть больше наружного диаметра трубы",
            details={"outer_diameter_mm": outer_diameter_mm, "winding_pitch_mm": winding_pitch_mm},
        )
    factor = decimal_value(math.sqrt(1.0 + (math.pi * float(diameter_mm / pitch_mm)) ** 2))
    maximum = max_winding_factor(outer_diameter_mm)
    if factor > maximum:
        raise ElectricalFormulaError(
            "ELECTRICAL_WINDING_FACTOR_LIMIT_EXCEEDED",
            "Коэффициент навива превышает допустимый предел для диаметра трубы",
            details={"winding_factor": float(factor), "maximum": float(maximum)},
        )
    return round_result(factor, SIX_PLACES)


def max_winding_factor(outer_diameter_mm: float) -> Decimal:
    """Return the exact normative Kнав boundary for an outer diameter in mm."""
    diameter_mm = decimal_value(outer_diameter_mm)
    if diameter_mm < Decimal("57"):
        return Decimal("1.0")
    if diameter_mm == Decimal("57"):
        return Decimal("1.1")
    if diameter_mm <= Decimal("75"):
        return Decimal("1.2")
    if diameter_mm <= Decimal("89"):
        return Decimal("1.3")
    if diameter_mm <= Decimal("108"):
        return Decimal("1.4")
    return Decimal("1.5")


def calc_self_regulating_tt(
    params: SelfRegulatingTTParams,
    *,
    catalog_rows: Sequence[Mapping[str, Any]] | None = None,
    section_catalog_rows: Sequence[Mapping[str, Any]] | None = None,
    bom_catalog_rows: Sequence[Mapping[str, Any]] | None = None,
) -> SelfRegulatingTTResult:
    """Select one Case 1 cable candidate from passport catalog values.

    Candidate coverage is ``P_cable * K_nav * N >= q * K``. ``P_cable`` is
    ``nominal_power`` and T_min is sourced from the model's §6.14 section rows.
    """
    selection_policy = getattr(params, "selection_policy", "technical_minimum")
    if selection_policy != "technical_minimum":
        raise ElectricalFormulaError(
            "ELECTRICAL_SELECTION_POLICY_UNSUPPORTED",
            "В MVP поддерживается только политика technical_minimum",
            details={"selection_policy": selection_policy},
        )
    if params.number_of_threads is not None and params.number_of_threads not in {1, 2, 3}:
        raise ElectricalFormulaError(
            "ELECTRICAL_THREAD_COUNT_INVALID", "Число ниток должно быть от 1 до 3"
        )

    q_required = decimal_value(params.required_power_per_meter) * decimal_value(
        params.safety_factor
    )
    is_tank = params.tank_shape is not None
    if is_tank or params.winding_pitch in (None, 0):
        winding_factor = Decimal(1)
    else:
        if params.outer_diameter_mm is None:
            raise ElectricalFormulaError(
                "ELECTRICAL_WINDING_PITCH_INVALID",
                "Для системного расчёта Kнав требуется наружный диаметр трубы",
            )
        winding_factor = compute_winding_factor(
            outer_diameter_mm=params.outer_diameter_mm,
            winding_pitch_mm=params.winding_pitch,
        )
    power_catalog = (
        [dict(row) for row in catalog_rows if isinstance(row, Mapping)]
        if catalog_rows is not None
        else list_tt_cables()
    )
    raw_section_rows = (
        [dict(row) for row in section_catalog_rows if isinstance(row, Mapping)]
        if section_catalog_rows is not None
        else section_catalog_payload_snapshot().get("rows")
    )
    resolved_section_rows = (
        [dict(row) for row in raw_section_rows if isinstance(row, Mapping)]
        if isinstance(raw_section_rows, list)
        else []
    )
    if not power_catalog:
        raise ElectricalFormulaError(
            "ELECTRICAL_CATALOG_ROW_INVALID",
            "Power-каталог не содержит строк",
            details={"model": None, "missing_fields": ["catalog_rows"]},
        )
    raw_bom_rows = (
        [dict(row) for row in bom_catalog_rows if isinstance(row, Mapping)]
        if bom_catalog_rows is not None
        else list_electrical_tt_bom_entries()
    )
    catalog = build_tt_catalog_candidates(
        power_catalog,
        resolved_section_rows,
        raw_bom_rows,
    )

    if params.cable_mark is not None:
        normalized_model = "".join(params.cable_mark.split()).upper()
        if normalized_model.startswith("ТЛТ-"):
            raise ElectricalFormulaError(
                "ELECTRICAL_LEGACY_CABLE_MARK_UNSUPPORTED",
                "Условные legacy-марки ТЛТ не поддерживаются в новом расчёте",
                details={"requested_model": normalized_model},
            )
        selected_rows = [item for item in catalog if item.full_mark == normalized_model]
        if not selected_rows:
            raise ElectricalFormulaError(
                "ELECTRICAL_CABLE_NOT_FOUND",
                f"Кабель «{params.cable_mark}» не найден в справочнике",
            )
    else:
        selected_rows = catalog

    product_temperature = decimal_value(params.process_temperature)
    ambient_temperature = decimal_value(params.ambient_temperature)
    temperature_eligible = [
        item
        for item in selected_rows
        if ambient_temperature >= item.min_ambient_temperature
        and product_temperature <= item.max_product_temperature
    ]
    if not temperature_eligible:
        raise ElectricalFormulaError(
            "ELECTRICAL_CABLE_TEMPERATURE_LIMIT_EXCEEDED",
            "Ни одна допустимая марка не проходит T_env/T_min и T_product/T_max",
            details={
                "product_temperature_c": float(product_temperature),
                "ambient_temperature_c": float(ambient_temperature),
                "manual_cable_model": params.cable_mark,
            },
        )

    if params.number_of_threads is not None:
        requested_threads = [params.number_of_threads]
    elif params.cable_mark is not None:
        requested_threads = [1]
    else:
        requested_threads = [1, 2, 3]
    candidates: list[tuple[int, TTCatalogCandidate]] = []
    for threads in requested_threads:
        for catalog_candidate in temperature_eligible:
            if catalog_candidate.passport_power * winding_factor * threads >= q_required:
                candidates.append((threads, catalog_candidate))
    if not candidates:
        raise ElectricalFormulaError(
            "ELECTRICAL_CABLE_POWER_INSUFFICIENT",
            "Ни одна допустимая марка не обеспечивает требуемую мощность",
            details={
                "required_power_per_meter_w": float(q_required),
                "maximum_threads": requested_threads[-1],
                "manual_cable_model": params.cable_mark,
            },
        )
    num_circuits, selected = min(
        candidates,
        key=lambda item: (
            item[0],
            item[1].passport_power,
            item[1].passport_power * item[0],
            item[1].full_mark,
        ),
    )
    passport_power = selected.passport_power
    cable = selected.power_row
    series = selected.series
    cable_mark = selected.full_mark

    if is_tank:
        base_length = compute_tank_cable_length(
            shape=params.tank_shape,
            diameter=params.tank_diameter,
            length=params.tank_length,
            width=params.tank_width,
            heating_height=params.heating_height,
            laying_step=params.laying_step,
        )
    else:
        base_length = params.pipe_length
    cable_length = decimal_value(base_length) * winding_factor * num_circuits
    order_cable_length = round_up(cable_length * Decimal("1.10"))
    total_power = passport_power * cable_length
    installed_power_per_meter = passport_power * winding_factor * num_circuits
    applied_voltage = decimal_value(params.supply_voltage)

    temp_group = "high" if series in {"ТТВ", "ТТХ"} else "low"
    return SelfRegulatingTTResult(
        selected_cable=cable["model"],
        cable_mark=cable_mark,
        series=series,
        cable_model=cable["model"],
        temperature_group=temp_group,
        cable_length=float(round_result(cable_length)),
        installed_cable_length=float(round_result(cable_length)),
        order_cable_length=float(order_cable_length),
        num_circuits=num_circuits,
        power_per_meter=float(round_result(passport_power)),
        installed_power_per_meter=float(round_result(installed_power_per_meter)),
        total_power=float(round_result(total_power)),
        current=float(round_result(total_power / applied_voltage)),
        voltage=float(applied_voltage),
        winding_pitch=round(params.winding_pitch or 0.0, 3),
        winding_coefficient=float(round_result(winding_factor, SIX_PLACES)),
    )
