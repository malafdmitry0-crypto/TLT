"""Электротехнический расчёт саморегулирующихся кабелей ТЛТ и ТТН/ТТВ/ТТХ."""

import math
from typing import Any

from app.formulas.electrical.cable_geometry import compute_tank_cable_length
from app.reference_data.loader import get_tlt_cable_by_mark, list_tlt_cables, list_tt_cables
from app.schemas.calculation import (
    SelfRegulatingParams,
    SelfRegulatingResult,
    SelfRegulatingTTParams,
    SelfRegulatingTTResult,
)

CableRow = dict[str, Any]


def _lookup_by_mark(catalog: list[CableRow], mark: str) -> CableRow | None:
    for c in catalog:
        if c.get("model") == mark:
            return dict(c)
    # на случай если catalog — встроенный, делегируем в loader для альтернативных имён
    return get_tlt_cable_by_mark(mark)


def calc_self_regulating(params: SelfRegulatingParams) -> SelfRegulatingResult:
    """Автоподбор или проверка саморегулирующегося греющего кабеля ТЛТ.

    Контракт safety_factor:
        Применяется здесь **ровно один раз**. Вызывающий код должен передавать
        `required_power_per_meter = q_linear` (heat_loss_per_meter БЕЗ K из
        теплорасчёта), а не q_total / L. Иначе К накрутится дважды. Этот
        контракт залочен тестами `test_no_double_safety.py` и
        `TestNoDoubleSafetyFactor`.

    Алгоритм:
        1. required_effective = required_power_per_meter × safety_factor
        2. Если cable_mark=None — автоподбор: минимально-мощный кабель линейки ТЛТ,
           удовлетворяющий ТРЁМ условиям (P ≥ required_effective,
           min_temperature ≤ T_ambient, max_temperature ≥ T_process).
        3. Если cable_mark задан — проверяется, что кабель подходит по всем
           критериям; иначе ValueError с указанием конкретного нарушения.
        4. cable_length = pipe_length × 1.1 (запас 10% на муфты/петли, BR-CABLE-02)
        5. total_power = P_cable × cable_length
        6. current = total_power / supply_voltage (P = U·I; cos φ ≈ 1 для резистивной нагрузки)

    Args:
        params: требуемая мощность, температуры, марка (или None для автоподбора),
            safety_factor, supply_voltage, опциональный cable_catalog.

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
    layout_factor = params.winding_coefficient * params.number_of_threads

    if params.cable_mark is None:
        # Автоподбор: минимально-мощный кабель, удовлетворяющий ВСЕМ трём условиям
        #   1) power_per_meter × k_навива × ниток ≥ required_effective
        #   2) min_temperature ≤ ambient_temperature (монтаж при холоде)
        #   3) max_temperature ≥ process_temperature (не перегреется)
        candidates = [
            c
            for c in catalog
            if c.get("power_per_meter") is not None
            and c["power_per_meter"] * layout_factor >= required_effective
            and c.get("min_temperature") is not None
            and c["min_temperature"] <= params.ambient_temperature
            and (
                process_temp is None
                or (c.get("max_temperature") is not None and c["max_temperature"] >= process_temp)
            )
        ]
        if not candidates:
            by_power = [
                c
                for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] * layout_factor >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    "с учётом навива и количества ниток "
                    "(максимум линейки — 100 Вт/м на одну нитку)"
                )
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
        cable = min(candidates, key=lambda c: c["power_per_meter"])
    else:
        looked_up = _lookup_by_mark(catalog, params.cable_mark)
        if looked_up is None:
            raise ValueError(f"Кабель «{params.cable_mark}» не найден в справочнике")
        cable = looked_up

    installed_power_per_meter = cable["power_per_meter"] * layout_factor
    if installed_power_per_meter < required_effective:
        raise ValueError(
            f"Кабель {cable['model']} ({cable['power_per_meter']} Вт/м × "
            f"{params.winding_coefficient:.3f} × {params.number_of_threads}) "
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

    # BR-CABLE-02: запас 10% на монтажные петли, крепёж, соединительные муфты
    CABLE_LENGTH_FACTOR = 1.1
    cable_length = params.pipe_length * CABLE_LENGTH_FACTOR * layout_factor
    total_power = cable["power_per_meter"] * cable_length
    current = total_power / params.supply_voltage

    return SelfRegulatingResult(
        selected_cable=cable["model"],
        cable_length=round(cable_length, 3),
        total_power=round(total_power, 3),
        current=round(current, 3),
        voltage=params.supply_voltage,
        winding_pitch=round(params.winding_pitch or 0.0, 3),
        winding_coefficient=round(params.winding_coefficient, 6),
        num_circuits=params.number_of_threads,
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
    Марка: <мощность>ТТН/ТТВ/ТТХ2-СР (агрессивная среда → СТ)
    Количество ниток: N = задано пользователем или ceil(q_required / q_б)

    Алгоритм серии: выбираем минимально подходящую по T1/T2 серию. Если
    одной нитки недостаточно, берём максимальный номинал этой серии и считаем
    N = ceil(q_required / q_б) без эскалации серии только из-за мощности.
    """
    catalog = list_tt_cables()
    suffix = "СТ" if params.aggressive_product else "СР"
    q_required = params.required_power_per_meter * params.safety_factor
    selected_threads: int | None = None
    t3 = (
        params.maintain_temperature
        if params.maintain_temperature is not None
        else params.process_temperature
    )

    if params.cable_mark is not None:
        if params.cable_mark.endswith("-СТ"):
            suffix = "СТ"
        elif params.cable_mark.endswith("-СР"):
            suffix = "СР"
        base_model = (
            params.cable_mark.split("-")[0] if "-" in params.cable_mark else params.cable_mark
        )
        match = next((c for c in catalog if c["model"] == base_model), None)
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
                (c["nominal_power"], q_b * params.number_of_threads, q_b, c)
                for q_b, c in power_rows
                if q_b * params.number_of_threads >= q_required
            ]
            if not candidates:
                raise ValueError(
                    f"Ни один кабель серии {series} при {params.number_of_threads} нитк. "
                    f"не обеспечивает {q_required:.2f} Вт/м при T3={t3}°C"
                )
            _, _, _, cable = min(candidates, key=lambda item: (item[0], item[1]))
            selected_threads = params.number_of_threads
        else:
            q_b_max, cable = max(power_rows, key=lambda item: item[1]["nominal_power"])
            selected_threads = math.ceil(q_required / q_b_max)

    q_b = cable["q1"] * t3 + cable["q2"]
    if q_b <= 0:
        raise ValueError(
            f"Кабель {cable['model']} при T3={t3}°C "
            f"имеет нулевую или отрицательную мощность ({q_b:.2f} Вт/м)"
        )

    if params.number_of_threads is not None:
        num_circuits = params.number_of_threads
        if q_b * num_circuits < q_required:
            raise ValueError(
                f"Кабель {cable['model']} при {num_circuits} нитк. обеспечивает "
                f"{q_b * num_circuits:.2f} Вт/м, требуется {q_required:.2f} Вт/м"
            )
    elif selected_threads is not None:
        num_circuits = selected_threads
    else:
        num_circuits = math.ceil(q_required / q_b) if q_b < q_required else 1
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
    total_power = q_b * cable_length

    return SelfRegulatingTTResult(
        selected_cable=cable["model"],
        cable_mark=cable_mark,
        series=series,
        cable_length=round(cable_length, 3),
        num_circuits=num_circuits,
        power_per_meter=round(q_b, 3),
        total_power=round(total_power, 3),
        current=round(total_power / params.supply_voltage, 3),
        voltage=params.supply_voltage,
        winding_pitch=round(params.winding_pitch or 0.0, 3),
        winding_coefficient=round(params.winding_coefficient, 6),
    )
