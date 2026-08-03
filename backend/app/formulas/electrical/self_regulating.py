"""Электротехнический расчёт саморегулирующихся кабелей ТЛТ и ТТН/ТТВ/ТТХ."""

import math
from collections.abc import Mapping, Sequence
from decimal import Decimal, InvalidOperation
from typing import Any

from app.electrical_domain import ElectricalFormulaError
from app.formulas.electrical.cable_geometry import compute_tank_cable_length
from app.formulas.electrical.commercial import (
    BalancedRankingConfig,
    CommercialCandidate,
    commercial_snapshot,
    normal_policy,
    select_commercial_candidate,
)
from app.formulas.electrical.common import cable_order_length
from app.formulas.electrical.decimal_math import SIX_PLACES, decimal_value, round_result, round_up
from app.reference_data.loader import (
    get_tlt_cable_by_mark,
    get_tt_cable_by_model,
    list_tlt_cables,
    list_tt_cables,
)
from app.schemas.calculation import (
    SelfRegulatingParams,
    SelfRegulatingResult,
    SelfRegulatingTTParams,
    SelfRegulatingTTResult,
)

CableRow = dict[str, Any]
MAX_SELF_REG_AUTO_THREADS = 3


def _lookup_by_mark(catalog: list[CableRow], mark: str) -> CableRow | None:
    for c in catalog:
        if c.get("model") == mark:
            return dict(c)
    # на случай если catalog — встроенный, делегируем в loader для альтернативных имён
    return get_tlt_cable_by_mark(mark)


def _candidate_length(params: SelfRegulatingParams, threads: int) -> float:
    return params.pipe_length * params.winding_coefficient * threads


def _technical_key(item: tuple[int, CableRow]) -> tuple[float, float, float, str]:
    threads, cable = item
    power = float(cable["power_per_meter"])
    return (threads, power, power * threads, str(cable.get("model", "")))


def _commercial_snapshot(
    params: SelfRegulatingParams,
    threads: int,
    cable: CableRow,
) -> dict[str, Any] | None:
    return commercial_snapshot(
        _candidate_length(params, threads),
        cable,
        circuit_count=threads,
        balanced_config=_balanced_config(params),
    )


def _catalog_voltage(cable: CableRow) -> float | None:
    voltage = cable.get("voltage")
    if voltage is None:
        return None
    try:
        parsed = float(voltage)
    except (TypeError, ValueError):
        return None
    return parsed if parsed > 0 else None


def _balanced_config(params: SelfRegulatingParams) -> BalancedRankingConfig | None:
    if not params.balanced_weights:
        return None
    return BalancedRankingConfig(
        weights=params.balanced_weights,
        approved=params.balanced_weights_approved,
        version=params.balanced_weights_version or "default_unapproved",
    )


def _select_auto_candidate(
    candidates: list[tuple[int, CableRow]],
    params: SelfRegulatingParams,
) -> tuple[int, CableRow, dict[str, Any]]:
    wrapped = [
        CommercialCandidate(
            item=item, cable=item[1], installed_length=_candidate_length(params, item[0])
        )
        for item in candidates
    ]
    selected, metadata = select_commercial_candidate(
        wrapped,
        selection_policy=params.selection_policy,
        technical_key=lambda item: _technical_key(item.item),
        circuit_count=lambda item: item.item[0],
        balanced_config=_balanced_config(params),
    )
    threads, cable = selected.item
    return threads, cable, metadata


def calc_self_regulating(params: SelfRegulatingParams) -> SelfRegulatingResult:
    """Автоподбор или проверка саморегулирующегося греющего кабеля ТЛТ.

    Контракт safety_factor:
        Применяется здесь **ровно один раз**. Вызывающий код должен передавать
        `required_power_per_meter = q_linear` (без Kзап из теплорасчёта), а не
        q_total / L. Иначе Kзап накрутится дважды. Этот
        контракт залочен тестами `test_no_double_safety.py` и
        `TestNoDoubleSafetyFactor`.

    Алгоритм:
        1. required_effective = required_power_per_meter × safety_factor
        2. Если cable_mark=None — автоподбор: минимально-мощный кабель линейки ТЛТ,
           удовлетворяющий ТРЁМ условиям (P ≥ required_effective,
           min_temperature ≤ T_ambient, max_temperature ≥ T_process).
        3. Если cable_mark задан — проверяется, что кабель подходит по всем
           критериям; иначе ValueError с указанием конкретного нарушения.
        4. cable_length = pipe_length × коэффициент укладки
        5. order_cable_length = cable_length × 1.1 (запас 10% на муфты/петли, BR-CABLE-02)
        6. total_power = P_cable × cable_length
        7. current = total_power / U_catalog (для ТЛТ напряжение задано паспортом кабеля)

    Args:
        params: требуемая мощность, температуры, марка (или None для автоподбора),
            safety_factor, supply_voltage, опциональный cable_catalog. Для ТЛТ
            supply_voltage является fallback для кастомных каталогов без поля voltage;
            штатный каталог ТЛТ задаёт напряжение в строке кабеля.

    Returns:
        SelfRegulatingResult: марка кабеля, длина, полная мощность, ток, напряжение.

    Raises:
        ValueError: ни один кабель не подходит (с описанием какое условие нарушено);
            явно заданный кабель не проходит проверки; некорректные входы.

    See Also:
        docs/context/formulas-summary.md — краткий обзор
        test_self_regulating.py — unit-покрытие
    """
    if params.required_power_per_meter <= 0:
        raise ValueError("Требуемая мощность должна быть положительной")
    if params.pipe_length <= 0:
        raise ValueError("Длина трубы должна быть положительной")

    catalog: list[CableRow] = (
        params.cable_catalog if params.cable_catalog is not None else list_tlt_cables()
    )

    required_effective = params.required_power_per_meter * params.safety_factor
    process_temp = getattr(params, "process_temperature", None)
    requested_threads = params.number_of_threads

    if params.cable_mark is None:
        # Автоподбор: минимально-мощный кабель, удовлетворяющий ВСЕМ трём условиям
        #   1) power_per_meter × k_навива × ниток ≥ required_effective
        #   2) min_temperature ≤ ambient_temperature (монтаж при холоде)
        #   3) max_temperature ≥ process_temperature (не перегреется)
        temperature_candidates = [
            c
            for c in catalog
            if c.get("power_per_meter") is not None
            and c.get("min_temperature") is not None
            and c["min_temperature"] <= params.ambient_temperature
            and (
                process_temp is None
                or (c.get("max_temperature") is not None and c["max_temperature"] >= process_temp)
            )
        ]
        if not temperature_candidates:
            by_power = [c for c in catalog if c.get("power_per_meter") is not None]
            by_min_t = [
                c
                for c in by_power
                if c.get("min_temperature") is not None
                and c["min_temperature"] <= params.ambient_temperature
            ]
            if not by_min_t:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м, "
                    f"работающий при T среды = {params.ambient_temperature}°C"
                )
            raise ValueError(
                f"Не найден кабель, выдерживающий T продукта = {process_temp}°C "
                f"при требуемой мощности ≥ {required_effective:.2f} Вт/м"
            )

        if requested_threads is None:
            candidates = [
                (threads, c)
                for threads in range(1, MAX_SELF_REG_AUTO_THREADS + 1)
                for c in temperature_candidates
                if c["power_per_meter"] * params.winding_coefficient * threads >= required_effective
            ]
        else:
            candidates = [
                (requested_threads, c)
                for c in temperature_candidates
                if c["power_per_meter"] * params.winding_coefficient * requested_threads
                >= required_effective
            ]
        if not candidates:
            raise ValueError(
                f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                "с учётом навива и количества ниток "
                f"(максимум линейки — 100 Вт/м на одну нитку, "
                f"максимум ниток — {MAX_SELF_REG_AUTO_THREADS})"
            )
        applied_threads, cable, selection_metadata = _select_auto_candidate(candidates, params)
        thread_source = "auto" if requested_threads is None else "manual"
    else:
        looked_up = _lookup_by_mark(catalog, params.cable_mark)
        if looked_up is None:
            raise ValueError(f"Кабель «{params.cable_mark}» не найден в справочнике")
        cable = looked_up
        applied_threads = requested_threads or 1
        thread_source = "default" if requested_threads is None else "manual"
        selection_metadata = {
            "selection_policy": normal_policy(params.selection_policy),
            "applied_selection_policy": "manual_selection",
            "selection_reason": "Кабель выбран вручную; commercial ranking не применялся",
            "candidate_count": 1,
            "commercial": _commercial_snapshot(params, applied_threads, cable),
            "warnings": [],
        }

    layout_factor = params.winding_coefficient * applied_threads
    installed_power_per_meter = cable["power_per_meter"] * layout_factor
    if installed_power_per_meter < required_effective:
        raise ValueError(
            f"Кабель {cable['model']} ({cable['power_per_meter']} Вт/м × "
            f"{params.winding_coefficient:.3f} × {applied_threads}) "
            f"не обеспечивает требуемую мощность {required_effective:.1f} Вт/м"
        )
    if params.ambient_temperature < cable["min_temperature"]:
        raise ValueError(
            f"Температура среды {params.ambient_temperature}°C ниже минимальной "
            f"для кабеля {cable['model']} ({cable['min_temperature']}°C)"
        )
    if process_temp is not None and process_temp > cable["max_temperature"]:
        raise ValueError(
            f"Температура продукта {process_temp}°C превышает максимально "
            f"допустимую для кабеля {cable['model']} ({cable['max_temperature']}°C)"
        )

    cable_length = params.pipe_length * layout_factor
    order_cable_length = cable_order_length(cable_length)
    total_power = cable["power_per_meter"] * cable_length
    applied_voltage = _catalog_voltage(cable) or params.supply_voltage
    current = total_power / applied_voltage

    return SelfRegulatingResult(
        selected_cable=cable["model"],
        cable_model=cable["model"],
        temperature_group="low",
        series=str(cable.get("brand") or "ТЛТ"),
        cable_length=round(cable_length, 3),
        installed_cable_length=round(cable_length, 3),
        order_cable_length=round(order_cable_length, 3),
        power_per_meter=round(cable["power_per_meter"], 3),
        installed_power_per_meter=round(installed_power_per_meter, 3),
        total_power=round(total_power, 3),
        current=round(current, 3),
        voltage=applied_voltage,
        winding_pitch=round(params.winding_pitch or 0.0, 3),
        winding_coefficient=round(params.winding_coefficient, 6),
        num_circuits=applied_threads,
        requested_number_of_threads=requested_threads,
        applied_number_of_threads=applied_threads,
        number_of_threads_source=thread_source,
        selection_policy=selection_metadata["selection_policy"],
        applied_selection_policy=selection_metadata["applied_selection_policy"],
        selection_reason=selection_metadata["selection_reason"],
        candidate_count=selection_metadata["candidate_count"],
        commercial=selection_metadata["commercial"],
        warnings=selection_metadata["warnings"],
    )


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
    if params.supply_voltage != 230:
        raise ElectricalFormulaError(
            "ELECTRICAL_NOMINAL_VOLTAGE_UNSUPPORTED",
            "Новый электрический расчёт поддерживает только напряжение 230 В",
            details={"nominal_voltage_v": params.supply_voltage},
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
    applied_voltage = Decimal(230)

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
