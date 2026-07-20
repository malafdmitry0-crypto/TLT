"""Электротехнический расчёт саморегулирующихся кабелей ТЛТ и ТТН/ТТВ/ТТХ."""

import math
from typing import Any

from app.formulas.electrical.cable_geometry import compute_tank_cable_length
from app.formulas.electrical.commercial import (
    BalancedRankingConfig,
    CommercialCandidate,
    commercial_snapshot,
    normal_policy,
    select_commercial_candidate,
)
from app.formulas.electrical.common import cable_order_length
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


def _select_tt_series(process_temp: float, vapor_temp: float | None) -> str:
    """Выбирает минимальную подходящую серию ТТН→ТТВ→ТТХ."""
    for series, limits in _SERIES_LIMITS.items():
        if process_temp > limits["max_product_temp"]:
            continue
        if vapor_temp is not None and vapor_temp > limits["max_vapor_temp"]:
            continue
        return series
    raise ValueError(
        f"Температура продукта {process_temp}°C или пропарки {vapor_temp}°C "
        "превышает предел ТТХ (150°C / 250°C). Требуется другой тип кабеля."
    )


def calc_self_regulating_tt(params: SelfRegulatingTTParams) -> SelfRegulatingTTResult:
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
    suffix = "СР" if params.aggressive_product else "СТ"
    q_required = params.required_power_per_meter * params.safety_factor
    selected_threads: int | None = None
    t3 = (
        params.maintain_temperature
        if params.maintain_temperature is not None
        else params.process_temperature
    )

    def installed_linear_power(q_b: float, threads: int) -> float:
        return q_b * params.winding_coefficient * threads

    if params.cable_mark is not None:
        if params.cable_mark.endswith("-СТ"):
            suffix = "СТ"
        elif params.cable_mark.endswith("-СР"):
            suffix = "СР"
        base_model = (
            params.cable_mark.split("-")[0] if "-" in params.cable_mark else params.cable_mark
        )
        match = get_tt_cable_by_model(base_model)
        if match is None:
            raise ValueError(f"Кабель «{params.cable_mark}» не найден в справочнике")
        cable = match
        series = cable["series"]
        if params.process_temperature > float(cable["max_product_temp"]):
            raise ValueError(
                f"Температура продукта {params.process_temperature}°C превышает предел "
                f"серии {series} ({cable['max_product_temp']}°C)"
            )
        if params.vapor_temperature is not None and params.vapor_temperature > float(
            cable["max_vapor_temp"]
        ):
            raise ValueError(
                f"Температура пропарки {params.vapor_temperature}°C превышает предел "
                f"серии {series} ({cable['max_vapor_temp']}°C)"
            )
    else:
        catalog = list_tt_cables()
        series = _select_tt_series(params.process_temperature, params.vapor_temperature)
        s_cables = sorted(
            [c for c in catalog if c["series"] == series],
            key=lambda c: c["nominal_power"],
        )
        power_rows = [(c["q1"] * t3 + c["q2"], c) for c in s_cables if c["q1"] * t3 + c["q2"] > 0]
        if not power_rows:
            raise ValueError(
                f"Ни один кабель серии {series} не имеет положительной мощности "
                f"при T3={t3}°C. Требуется другой тип кабеля."
            )

        if params.number_of_threads is not None:
            candidates = [
                (
                    c["nominal_power"],
                    installed_linear_power(q_b, params.number_of_threads),
                    q_b,
                    c,
                )
                for q_b, c in power_rows
                if installed_linear_power(q_b, params.number_of_threads) >= q_required
            ]
            if not candidates:
                raise ValueError(
                    f"Ни один кабель серии {series} при {params.number_of_threads} нитк. "
                    f"не обеспечивает {q_required:.2f} Вт/м при T3={t3}°C "
                    f"и k_навива={params.winding_coefficient:.3f}"
                )
            _, _, _, cable = min(candidates, key=lambda item: (item[0], item[1]))
            selected_threads = params.number_of_threads
        else:
            single_thread_match = next(
                (
                    (q_b, c)
                    for q_b, c in power_rows
                    if installed_linear_power(q_b, 1) >= q_required
                ),
                None,
            )
            if single_thread_match is not None:
                _, cable = single_thread_match
                selected_threads = 1
            else:
                q_b_max, cable = max(power_rows, key=lambda item: item[1]["nominal_power"])
                selected_threads = math.ceil(q_required / installed_linear_power(q_b_max, 1))

    q_b = cable["q1"] * t3 + cable["q2"]
    if q_b <= 0:
        raise ValueError(
            f"Кабель {cable['model']} при T3={t3}°C "
            f"имеет нулевую или отрицательную мощность ({q_b:.2f} Вт/м)"
        )

    if params.number_of_threads is not None:
        num_circuits = params.number_of_threads
        effective_power_per_meter = installed_linear_power(q_b, num_circuits)
        if effective_power_per_meter < q_required:
            raise ValueError(
                f"Кабель {cable['model']} при {num_circuits} нитк. обеспечивает "
                f"{effective_power_per_meter:.2f} Вт/м с учётом k_навива="
                f"{params.winding_coefficient:.3f}, требуется {q_required:.2f} Вт/м"
            )
    elif selected_threads is not None:
        num_circuits = selected_threads
    else:
        single_thread_power = installed_linear_power(q_b, 1)
        num_circuits = (
            math.ceil(q_required / single_thread_power)
            if single_thread_power < q_required
            else 1
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
    cable_length = base_length * params.winding_coefficient * num_circuits
    order_cable_length = cable_order_length(cable_length)
    total_power = q_b * cable_length
    installed_power_per_meter = installed_linear_power(q_b, num_circuits)
    applied_voltage = _catalog_voltage(cable) or params.supply_voltage

    temp_group = "high" if series in {"ТТВ", "ТТХ"} else "low"
    return SelfRegulatingTTResult(
        selected_cable=cable["model"],
        cable_mark=cable_mark,
        series=series,
        cable_model=cable["model"],
        temperature_group=temp_group,
        cable_length=round(cable_length, 3),
        installed_cable_length=round(cable_length, 3),
        order_cable_length=round(order_cable_length, 3),
        num_circuits=num_circuits,
        power_per_meter=round(q_b, 3),
        installed_power_per_meter=round(installed_power_per_meter, 3),
        total_power=round(total_power, 3),
        current=round(total_power / applied_voltage, 3),
        voltage=applied_voltage,
        winding_pitch=round(params.winding_pitch or 0.0, 3),
        winding_coefficient=round(params.winding_coefficient, 6),
    )
