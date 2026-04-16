"""Электротехнический расчёт саморегулирующегося кабеля ТЛТ.

Placeholder-реализация: подбор кабеля с мощностью ≥ требуемой с учётом
safety_factor, расчёт длины, тока, напряжения. Финальные формулы будут
предоставлены отдельно.
"""

from typing import Any

from app.reference_data.loader import get_tlt_cable_by_mark, list_tlt_cables
from app.schemas.calculation import SelfRegulatingParams, SelfRegulatingResult

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

    if params.cable_mark is None:
        # Автоподбор: минимально-мощный кабель, удовлетворяющий ВСЕМ трём условиям
        #   1) power_per_meter ≥ required_effective
        #   2) min_temperature ≤ ambient_temperature (монтаж при холоде)
        #   3) max_temperature ≥ process_temperature (не перегреется)
        candidates = [
            c
            for c in catalog
            if c.get("power_per_meter") is not None
            and c["power_per_meter"] >= required_effective
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
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
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

    if cable["power_per_meter"] < required_effective:
        raise ValueError(
            f"Кабель {cable['model']} ({cable['power_per_meter']} Вт/м) "
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
    cable_length = params.pipe_length * CABLE_LENGTH_FACTOR
    total_power = cable["power_per_meter"] * cable_length
    current = total_power / params.supply_voltage

    return SelfRegulatingResult(
        selected_cable=cable["model"],
        cable_length=round(cable_length, 3),
        total_power=round(total_power, 3),
        current=round(current, 3),
        voltage=params.supply_voltage,
    )
