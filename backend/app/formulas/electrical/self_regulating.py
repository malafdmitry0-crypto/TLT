"""Электротехнический расчёт саморегулирующихся кабелей серий ТТН/ТТВ/ТТХ.

РЕШЕНИЕ 2026-08-03 (DEC-07): legacy-расчёт по условным маркам «ТЛТ» удалён."""

import math
from collections.abc import Mapping, Sequence
from decimal import Decimal, InvalidOperation
from typing import Any

from app.electrical_domain import ElectricalFormulaError
from app.formulas.electrical.cable_geometry import compute_tank_cable_length
from app.formulas.electrical.decimal_math import SIX_PLACES, decimal_value, round_result, round_up
from app.formulas.electrical.tt_contract import SYSTEM_VOLTAGE_V
from app.reference_data.loader import (
    get_tt_cable_by_model,
    list_tt_cables,
)
from app.schemas.calculation import (
    SelfRegulatingTTParams,
    SelfRegulatingTTResult,
)

CableRow = dict[str, Any]
MAX_SELF_REG_AUTO_THREADS = 3


















# ---------------------------------------------------------------------------
# Расчёт кабелей серии ТТН / ТТВ / ТТХ
# ---------------------------------------------------------------------------

_SERIES_LIMITS: dict[str, dict[str, float]] = {
    "ТТН": {"max_product_temp": 65.0, "max_vapor_temp": 85.0},
    "ТТВ": {"max_product_temp": 120.0, "max_vapor_temp": 210.0},
    "ТТХ": {"max_product_temp": 150.0, "max_vapor_temp": 250.0},
}


def _tt_row_series(row: Mapping[str, Any]) -> str:
    series = str(row.get("series") or "").strip().upper()
    if series in _SERIES_LIMITS:
        return series
    model = "".join(str(row.get("model") or "").split()).upper()
    for candidate in _SERIES_LIMITS:
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
        model = "".join(str(row.get("model") or "").split()).upper()
        value = model.split("ТТ", 1)[0]
    try:
        return decimal_value(value)
    except (InvalidOperation, TypeError, ValueError) as exc:
        raise ElectricalFormulaError(
            "ELECTRICAL_CATALOG_ROW_INVALID",
            "Строка power-каталога не содержит номинальную мощность модели",
            details={"model": row.get("model")},
        ) from exc


def _select_tt_series(process_temp: float, vapor_temp: float | None) -> str:
    """Выбирает минимальную подходящую серию ТТН→ТТВ→ТТХ."""
    for series, limits in _SERIES_LIMITS.items():
        if process_temp >= limits["max_product_temp"]:
            continue
        if vapor_temp is not None and vapor_temp >= limits["max_vapor_temp"]:
            continue
        return series
    raise ElectricalFormulaError(
        "ELECTRICAL_CABLE_TEMPERATURE_LIMIT_EXCEEDED",
        "Температура продукта или пропарки превышает предел серии ТТХ",
        details={"product_temperature_c": process_temp, "steam_temperature_c": vapor_temp},
    )


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
) -> SelfRegulatingTTResult:
    """Подбор саморегулирующегося кабеля ТТН/ТТВ/ТТХ.

    Формула мощности: q_б(T3) = q1 × T3 + q2  [Вт/м]
    Марка: <мощность>ТТН/ТТВ/ТТХ2-СТ (агрессивная среда → СР).
    Суффикс по первоисточнику (Расчет_спецификации_трубы_самрег29_05_26.xlsx):
    -СТ = среда не агрессивная, -СР = агрессивная.
    Количество ниток: N = задано пользователем или
    ceil(q_required / (q_б × k_навива))

    Алгоритм серии: выбираем минимально подходящую по T1/T2 серию. Если
    одной нитки недостаточно, берём максимальный номинал этой серии и считаем
    N = ceil(q_required / (q_б × k_навива)) без эскалации серии только из-за
    мощности.
    """
    selection_policy = getattr(params, "selection_policy", "technical_minimum")
    if selection_policy != "technical_minimum":
        raise ElectricalFormulaError(
            "ELECTRICAL_SELECTION_POLICY_UNSUPPORTED",
            "В MVP поддерживается только политика technical_minimum",
            details={"selection_policy": selection_policy},
        )
    if params.maintain_temperature is None:
        raise ElectricalFormulaError(
            "ELECTRICAL_CABLE_POWER_CURVE_INVALID", "Температура поддержания T3 обязательна"
        )
    if params.number_of_threads is not None and params.number_of_threads not in {1, 2, 3}:
        raise ElectricalFormulaError(
            "ELECTRICAL_THREAD_COUNT_INVALID", "Число ниток должно быть от 1 до 3"
        )

    series = _select_tt_series(params.process_temperature, params.vapor_temperature)
    suffix = "СР" if series != "ТТН" or params.aggressive_product else "СТ"
    q_required = decimal_value(params.required_power_per_meter) * decimal_value(
        params.safety_factor
    )
    # Canonical absence of pitch means straight laying. A non-unit legacy coefficient is ignored.
    winding_factor = (
        Decimal(1)
        if params.winding_pitch is None or params.winding_pitch == 0
        else decimal_value(params.winding_coefficient)
    )
    t3 = decimal_value(params.maintain_temperature)

    def cable_power(cable_row: CableRow) -> Decimal:
        try:
            power = decimal_value(cable_row["q1"]) * t3 + decimal_value(cable_row["q2"])
        except (InvalidOperation, KeyError, TypeError, ValueError) as exc:
            raise ElectricalFormulaError(
                "ELECTRICAL_CABLE_POWER_CURVE_INVALID",
                "Строка power-каталога не содержит числовые коэффициенты q1/q2",
                details={"model": cable_row.get("model")},
            ) from exc
        if not power.is_finite():
            raise ElectricalFormulaError(
                "ELECTRICAL_CABLE_POWER_CURVE_INVALID",
                "Мощность кабеля при T3 должна быть конечным числом",
                details={"model": cable_row.get("model")},
            )
        return power

    supplied_catalog = (
        [dict(row) for row in catalog_rows if isinstance(row, Mapping)]
        if catalog_rows is not None
        else None
    )

    if params.cable_mark is not None:
        normalized_model = "".join(params.cable_mark.split()).upper()
        if normalized_model.startswith("ТЛТ-"):
            raise ElectricalFormulaError(
                "ELECTRICAL_LEGACY_CABLE_MARK_UNSUPPORTED",
                "Условные legacy-марки ТЛТ не поддерживаются в новом расчёте",
                details={"requested_model": normalized_model},
            )
        if normalized_model.endswith(("-СТ", "-СР", "-НР")):
            raise ElectricalFormulaError(
                "ELECTRICAL_CABLE_CONSTRUCTION_UNSUPPORTED",
                "Ручной выбор принимает базовую модель без суффикса исполнения",
            )
        cable = (
            next(
                (
                    row
                    for row in supplied_catalog
                    if "".join(str(row.get("model") or "").split()).upper() == normalized_model
                ),
                None,
            )
            if supplied_catalog is not None
            else get_tt_cable_by_model(normalized_model)
        )
        if cable is None:
            raise ElectricalFormulaError(
                "ELECTRICAL_CABLE_NOT_FOUND",
                f"Кабель «{params.cable_mark}» не найден в справочнике",
            )
        if _tt_row_series(cable) != series:
            raise ElectricalFormulaError(
                "ELECTRICAL_CABLE_SERIES_MISMATCH",
                "Ручная модель не принадлежит вычисленной температурной серии",
                details={"requested_model": normalized_model, "required_series": series},
            )
        candidate_rows = [cable]
    else:
        catalog = supplied_catalog if supplied_catalog is not None else list_tt_cables()
        candidate_rows = [row for row in catalog if _tt_row_series(row) == series]

    positive_rows = [(power, row) for row in candidate_rows if (power := cable_power(row)) > 0]
    if not positive_rows:
        raise ElectricalFormulaError(
            "ELECTRICAL_CABLE_POWER_CURVE_INVALID",
            "В выбранной серии нет модели с положительной мощностью при T3",
        )

    requested_threads = (
        [params.number_of_threads] if params.number_of_threads is not None else [1, 2, 3]
    )
    candidates: list[tuple[int, Decimal, CableRow]] = []
    for threads in requested_threads:
        for q_b_candidate, cable_candidate in positive_rows:
            if q_b_candidate * winding_factor * threads >= q_required:
                candidates.append((threads, q_b_candidate, cable_candidate))
    if not candidates:
        raise ElectricalFormulaError(
            "ELECTRICAL_CABLE_POWER_INSUFFICIENT",
            "Ни один кабель вычисленной серии не обеспечивает требуемую мощность",
            details={"required_power_per_meter_w": float(q_required), "maximum_threads": 3},
        )
    num_circuits, q_b, cable = min(
        candidates,
        key=lambda item: (
            item[0],
            item[1] * item[0],
            _tt_row_nominal_power(item[2]),
            str(item[2]["model"]),
        ),
    )
    cable_mark = f"{cable['model']}-{suffix}"

    if params.tank_shape and params.heating_height and params.laying_step:
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
    total_power = q_b * cable_length
    installed_power_per_meter = q_b * winding_factor * num_circuits
    applied_voltage = Decimal(SYSTEM_VOLTAGE_V)

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
        power_per_meter=float(round_result(q_b)),
        installed_power_per_meter=float(round_result(installed_power_per_meter)),
        total_power=float(round_result(total_power)),
        current=float(round_result(total_power / applied_voltage)),
        voltage=float(applied_voltage),
        winding_pitch=round(params.winding_pitch or 0.0, 3),
        winding_coefficient=float(round_result(winding_factor, SIX_PLACES)),
    )
