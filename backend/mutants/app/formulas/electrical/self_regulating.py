"""Электротехнический расчёт саморегулирующегося кабеля ТЛТ.

Placeholder-реализация: подбор кабеля с мощностью ≥ требуемой с учётом
safety_factor, расчёт длины, тока, напряжения. Финальные формулы будут
предоставлены отдельно.
"""

from typing import Any

from app.reference_data.loader import get_tlt_cable_by_mark, list_tlt_cables
from app.schemas.calculation import SelfRegulatingParams, SelfRegulatingResult

CableRow = dict[str, Any]
from typing import Annotated
from typing import Callable
from typing import ClassVar

MutantDict = Annotated[dict[str, Callable], "Mutant"] # type: ignore


def _mutmut_trampoline(orig, mutants, call_args, call_kwargs, self_arg = None): # type: ignore
    """Forward call to original or mutated function, depending on the environment"""
    import os # type: ignore
    mutant_under_test = os.environ['MUTANT_UNDER_TEST'] # type: ignore
    if mutant_under_test == 'fail': # type: ignore
        from mutmut.__main__ import MutmutProgrammaticFailException # type: ignore
        raise MutmutProgrammaticFailException('Failed programmatically')       # type: ignore
    elif mutant_under_test == 'stats': # type: ignore
        from mutmut.__main__ import record_trampoline_hit # type: ignore
        record_trampoline_hit(orig.__module__ + '.' + orig.__name__) # type: ignore
        # (for class methods, orig is bound and thus does not need the explicit self argument)
        result = orig(*call_args, **call_kwargs) # type: ignore
        return result # type: ignore
    prefix = orig.__module__ + '.' + orig.__name__ + '__mutmut_' # type: ignore
    if not mutant_under_test.startswith(prefix): # type: ignore
        result = orig(*call_args, **call_kwargs) # type: ignore
        return result # type: ignore
    mutant_name = mutant_under_test.rpartition('.')[-1] # type: ignore
    if self_arg is not None: # type: ignore
        # call to a class method where self is not bound
        result = mutants[mutant_name](self_arg, *call_args, **call_kwargs) # type: ignore
    else:
        result = mutants[mutant_name](*call_args, **call_kwargs) # type: ignore
    return result # type: ignore


def _lookup_by_mark(catalog: list[CableRow], mark: str) -> CableRow | None:
    args = [catalog, mark]# type: ignore
    kwargs = {}# type: ignore
    return _mutmut_trampoline(x__lookup_by_mark__mutmut_orig, x__lookup_by_mark__mutmut_mutants, args, kwargs, None)


def x__lookup_by_mark__mutmut_orig(catalog: list[CableRow], mark: str) -> CableRow | None:
    for c in catalog:
        if c.get("model") == mark:
            return dict(c)
    # на случай если catalog — встроенный, делегируем в loader для альтернативных имён
    return get_tlt_cable_by_mark(mark)


def x__lookup_by_mark__mutmut_1(catalog: list[CableRow], mark: str) -> CableRow | None:
    for c in catalog:
        if c.get(None) == mark:
            return dict(c)
    # на случай если catalog — встроенный, делегируем в loader для альтернативных имён
    return get_tlt_cable_by_mark(mark)


def x__lookup_by_mark__mutmut_2(catalog: list[CableRow], mark: str) -> CableRow | None:
    for c in catalog:
        if c.get("XXmodelXX") == mark:
            return dict(c)
    # на случай если catalog — встроенный, делегируем в loader для альтернативных имён
    return get_tlt_cable_by_mark(mark)


def x__lookup_by_mark__mutmut_3(catalog: list[CableRow], mark: str) -> CableRow | None:
    for c in catalog:
        if c.get("MODEL") == mark:
            return dict(c)
    # на случай если catalog — встроенный, делегируем в loader для альтернативных имён
    return get_tlt_cable_by_mark(mark)


def x__lookup_by_mark__mutmut_4(catalog: list[CableRow], mark: str) -> CableRow | None:
    for c in catalog:
        if c.get("model") != mark:
            return dict(c)
    # на случай если catalog — встроенный, делегируем в loader для альтернативных имён
    return get_tlt_cable_by_mark(mark)


def x__lookup_by_mark__mutmut_5(catalog: list[CableRow], mark: str) -> CableRow | None:
    for c in catalog:
        if c.get("model") == mark:
            return dict(None)
    # на случай если catalog — встроенный, делегируем в loader для альтернативных имён
    return get_tlt_cable_by_mark(mark)


def x__lookup_by_mark__mutmut_6(catalog: list[CableRow], mark: str) -> CableRow | None:
    for c in catalog:
        if c.get("model") == mark:
            return dict(c)
    # на случай если catalog — встроенный, делегируем в loader для альтернативных имён
    return get_tlt_cable_by_mark(None)

x__lookup_by_mark__mutmut_mutants : ClassVar[MutantDict] = { # type: ignore
'x__lookup_by_mark__mutmut_1': x__lookup_by_mark__mutmut_1, 
    'x__lookup_by_mark__mutmut_2': x__lookup_by_mark__mutmut_2, 
    'x__lookup_by_mark__mutmut_3': x__lookup_by_mark__mutmut_3, 
    'x__lookup_by_mark__mutmut_4': x__lookup_by_mark__mutmut_4, 
    'x__lookup_by_mark__mutmut_5': x__lookup_by_mark__mutmut_5, 
    'x__lookup_by_mark__mutmut_6': x__lookup_by_mark__mutmut_6
}
x__lookup_by_mark__mutmut_orig.__name__ = 'x__lookup_by_mark'


def calc_self_regulating(params: SelfRegulatingParams) -> SelfRegulatingResult:
    args = [params]# type: ignore
    kwargs = {}# type: ignore
    return _mutmut_trampoline(x_calc_self_regulating__mutmut_orig, x_calc_self_regulating__mutmut_mutants, args, kwargs, None)


def x_calc_self_regulating__mutmut_orig(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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


def x_calc_self_regulating__mutmut_1(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
    if params.required_power_per_meter < 0:
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
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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


def x_calc_self_regulating__mutmut_2(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
    if params.required_power_per_meter <= 1:
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
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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


def x_calc_self_regulating__mutmut_3(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
        raise ValueError(None)
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
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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


def x_calc_self_regulating__mutmut_4(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
        raise ValueError("XXТребуемая мощность должна быть положительнойXX")
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
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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


def x_calc_self_regulating__mutmut_5(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
        raise ValueError("требуемая мощность должна быть положительной")
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
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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


def x_calc_self_regulating__mutmut_6(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
        raise ValueError("ТРЕБУЕМАЯ МОЩНОСТЬ ДОЛЖНА БЫТЬ ПОЛОЖИТЕЛЬНОЙ")
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
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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


def x_calc_self_regulating__mutmut_7(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
    if params.pipe_length < 0:
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
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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


def x_calc_self_regulating__mutmut_8(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
    if params.pipe_length <= 1:
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
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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


def x_calc_self_regulating__mutmut_9(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
        raise ValueError(None)

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
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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


def x_calc_self_regulating__mutmut_10(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
        raise ValueError("XXДлина трубы должна быть положительнойXX")

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
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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


def x_calc_self_regulating__mutmut_11(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
        raise ValueError("длина трубы должна быть положительной")

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
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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


def x_calc_self_regulating__mutmut_12(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
        raise ValueError("ДЛИНА ТРУБЫ ДОЛЖНА БЫТЬ ПОЛОЖИТЕЛЬНОЙ")

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
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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


def x_calc_self_regulating__mutmut_13(params: SelfRegulatingParams) -> SelfRegulatingResult:
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

    catalog: list[CableRow] = None

    required_effective = params.required_power_per_meter * params.safety_factor
    process_temp = getattr(params, "process_temperature", None)

    if params.cable_mark is None:
        # Автоподбор: минимально-мощный кабель, удовлетворяющий ВСЕМ трём условиям
        #   1) power_per_meter ≥ required_effective
        #   2) min_temperature ≤ ambient_temperature (монтаж при холоде)
        #   3) max_temperature ≥ process_temperature (не перегреется)
        candidates = [
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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


def x_calc_self_regulating__mutmut_14(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
        params.cable_catalog if params.cable_catalog is None else list_tlt_cables()
    )

    required_effective = params.required_power_per_meter * params.safety_factor
    process_temp = getattr(params, "process_temperature", None)

    if params.cable_mark is None:
        # Автоподбор: минимально-мощный кабель, удовлетворяющий ВСЕМ трём условиям
        #   1) power_per_meter ≥ required_effective
        #   2) min_temperature ≤ ambient_temperature (монтаж при холоде)
        #   3) max_temperature ≥ process_temperature (не перегреется)
        candidates = [
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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


def x_calc_self_regulating__mutmut_15(params: SelfRegulatingParams) -> SelfRegulatingResult:
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

    required_effective = None
    process_temp = getattr(params, "process_temperature", None)

    if params.cable_mark is None:
        # Автоподбор: минимально-мощный кабель, удовлетворяющий ВСЕМ трём условиям
        #   1) power_per_meter ≥ required_effective
        #   2) min_temperature ≤ ambient_temperature (монтаж при холоде)
        #   3) max_temperature ≥ process_temperature (не перегреется)
        candidates = [
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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


def x_calc_self_regulating__mutmut_16(params: SelfRegulatingParams) -> SelfRegulatingResult:
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

    required_effective = params.required_power_per_meter / params.safety_factor
    process_temp = getattr(params, "process_temperature", None)

    if params.cable_mark is None:
        # Автоподбор: минимально-мощный кабель, удовлетворяющий ВСЕМ трём условиям
        #   1) power_per_meter ≥ required_effective
        #   2) min_temperature ≤ ambient_temperature (монтаж при холоде)
        #   3) max_temperature ≥ process_temperature (не перегреется)
        candidates = [
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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


def x_calc_self_regulating__mutmut_17(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
    process_temp = None

    if params.cable_mark is None:
        # Автоподбор: минимально-мощный кабель, удовлетворяющий ВСЕМ трём условиям
        #   1) power_per_meter ≥ required_effective
        #   2) min_temperature ≤ ambient_temperature (монтаж при холоде)
        #   3) max_temperature ≥ process_temperature (не перегреется)
        candidates = [
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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


def x_calc_self_regulating__mutmut_18(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
    process_temp = getattr(None, "process_temperature", None)

    if params.cable_mark is None:
        # Автоподбор: минимально-мощный кабель, удовлетворяющий ВСЕМ трём условиям
        #   1) power_per_meter ≥ required_effective
        #   2) min_temperature ≤ ambient_temperature (монтаж при холоде)
        #   3) max_temperature ≥ process_temperature (не перегреется)
        candidates = [
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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


def x_calc_self_regulating__mutmut_19(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
    process_temp = getattr(params, None, None)

    if params.cable_mark is None:
        # Автоподбор: минимально-мощный кабель, удовлетворяющий ВСЕМ трём условиям
        #   1) power_per_meter ≥ required_effective
        #   2) min_temperature ≤ ambient_temperature (монтаж при холоде)
        #   3) max_temperature ≥ process_temperature (не перегреется)
        candidates = [
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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


def x_calc_self_regulating__mutmut_20(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
    process_temp = getattr("process_temperature", None)

    if params.cable_mark is None:
        # Автоподбор: минимально-мощный кабель, удовлетворяющий ВСЕМ трём условиям
        #   1) power_per_meter ≥ required_effective
        #   2) min_temperature ≤ ambient_temperature (монтаж при холоде)
        #   3) max_temperature ≥ process_temperature (не перегреется)
        candidates = [
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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


def x_calc_self_regulating__mutmut_21(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
    process_temp = getattr(params, None)

    if params.cable_mark is None:
        # Автоподбор: минимально-мощный кабель, удовлетворяющий ВСЕМ трём условиям
        #   1) power_per_meter ≥ required_effective
        #   2) min_temperature ≤ ambient_temperature (монтаж при холоде)
        #   3) max_temperature ≥ process_temperature (не перегреется)
        candidates = [
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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


def x_calc_self_regulating__mutmut_22(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
    process_temp = getattr(params, "process_temperature", )

    if params.cable_mark is None:
        # Автоподбор: минимально-мощный кабель, удовлетворяющий ВСЕМ трём условиям
        #   1) power_per_meter ≥ required_effective
        #   2) min_temperature ≤ ambient_temperature (монтаж при холоде)
        #   3) max_temperature ≥ process_temperature (не перегреется)
        candidates = [
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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


def x_calc_self_regulating__mutmut_23(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
    process_temp = getattr(params, "XXprocess_temperatureXX", None)

    if params.cable_mark is None:
        # Автоподбор: минимально-мощный кабель, удовлетворяющий ВСЕМ трём условиям
        #   1) power_per_meter ≥ required_effective
        #   2) min_temperature ≤ ambient_temperature (монтаж при холоде)
        #   3) max_temperature ≥ process_temperature (не перегреется)
        candidates = [
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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


def x_calc_self_regulating__mutmut_24(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
    process_temp = getattr(params, "PROCESS_TEMPERATURE", None)

    if params.cable_mark is None:
        # Автоподбор: минимально-мощный кабель, удовлетворяющий ВСЕМ трём условиям
        #   1) power_per_meter ≥ required_effective
        #   2) min_temperature ≤ ambient_temperature (монтаж при холоде)
        #   3) max_temperature ≥ process_temperature (не перегреется)
        candidates = [
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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


def x_calc_self_regulating__mutmut_25(params: SelfRegulatingParams) -> SelfRegulatingResult:
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

    if params.cable_mark is not None:
        # Автоподбор: минимально-мощный кабель, удовлетворяющий ВСЕМ трём условиям
        #   1) power_per_meter ≥ required_effective
        #   2) min_temperature ≤ ambient_temperature (монтаж при холоде)
        #   3) max_temperature ≥ process_temperature (не перегреется)
        candidates = [
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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


def x_calc_self_regulating__mutmut_26(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
        candidates = None
        if not candidates:
            by_power = [
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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


def x_calc_self_regulating__mutmut_27(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
            if c.get("power_per_meter") is not None
            and c["power_per_meter"] >= required_effective
            and c.get("min_temperature") is not None
            and c["min_temperature"] <= params.ambient_temperature or (
                process_temp is None
                or (c.get("max_temperature") is not None and c["max_temperature"] >= process_temp)
            )
        ]
        if not candidates:
            by_power = [
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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


def x_calc_self_regulating__mutmut_28(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
            if c.get("power_per_meter") is not None
            and c["power_per_meter"] >= required_effective
            and c.get("min_temperature") is not None or c["min_temperature"] <= params.ambient_temperature
            and (
                process_temp is None
                or (c.get("max_temperature") is not None and c["max_temperature"] >= process_temp)
            )
        ]
        if not candidates:
            by_power = [
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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


def x_calc_self_regulating__mutmut_29(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
            if c.get("power_per_meter") is not None
            and c["power_per_meter"] >= required_effective or c.get("min_temperature") is not None
            and c["min_temperature"] <= params.ambient_temperature
            and (
                process_temp is None
                or (c.get("max_temperature") is not None and c["max_temperature"] >= process_temp)
            )
        ]
        if not candidates:
            by_power = [
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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


def x_calc_self_regulating__mutmut_30(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
            if c.get("power_per_meter") is not None or c["power_per_meter"] >= required_effective
            and c.get("min_temperature") is not None
            and c["min_temperature"] <= params.ambient_temperature
            and (
                process_temp is None
                or (c.get("max_temperature") is not None and c["max_temperature"] >= process_temp)
            )
        ]
        if not candidates:
            by_power = [
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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


def x_calc_self_regulating__mutmut_31(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
            if c.get(None) is not None
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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


def x_calc_self_regulating__mutmut_32(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
            if c.get("XXpower_per_meterXX") is not None
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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


def x_calc_self_regulating__mutmut_33(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
            if c.get("POWER_PER_METER") is not None
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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


def x_calc_self_regulating__mutmut_34(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
            if c.get("power_per_meter") is None
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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


def x_calc_self_regulating__mutmut_35(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
            if c.get("power_per_meter") is not None
            and c["XXpower_per_meterXX"] >= required_effective
            and c.get("min_temperature") is not None
            and c["min_temperature"] <= params.ambient_temperature
            and (
                process_temp is None
                or (c.get("max_temperature") is not None and c["max_temperature"] >= process_temp)
            )
        ]
        if not candidates:
            by_power = [
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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


def x_calc_self_regulating__mutmut_36(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
            if c.get("power_per_meter") is not None
            and c["POWER_PER_METER"] >= required_effective
            and c.get("min_temperature") is not None
            and c["min_temperature"] <= params.ambient_temperature
            and (
                process_temp is None
                or (c.get("max_temperature") is not None and c["max_temperature"] >= process_temp)
            )
        ]
        if not candidates:
            by_power = [
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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


def x_calc_self_regulating__mutmut_37(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
            if c.get("power_per_meter") is not None
            and c["power_per_meter"] > required_effective
            and c.get("min_temperature") is not None
            and c["min_temperature"] <= params.ambient_temperature
            and (
                process_temp is None
                or (c.get("max_temperature") is not None and c["max_temperature"] >= process_temp)
            )
        ]
        if not candidates:
            by_power = [
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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


def x_calc_self_regulating__mutmut_38(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
            if c.get("power_per_meter") is not None
            and c["power_per_meter"] >= required_effective
            and c.get(None) is not None
            and c["min_temperature"] <= params.ambient_temperature
            and (
                process_temp is None
                or (c.get("max_temperature") is not None and c["max_temperature"] >= process_temp)
            )
        ]
        if not candidates:
            by_power = [
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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


def x_calc_self_regulating__mutmut_39(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
            if c.get("power_per_meter") is not None
            and c["power_per_meter"] >= required_effective
            and c.get("XXmin_temperatureXX") is not None
            and c["min_temperature"] <= params.ambient_temperature
            and (
                process_temp is None
                or (c.get("max_temperature") is not None and c["max_temperature"] >= process_temp)
            )
        ]
        if not candidates:
            by_power = [
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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


def x_calc_self_regulating__mutmut_40(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
            if c.get("power_per_meter") is not None
            and c["power_per_meter"] >= required_effective
            and c.get("MIN_TEMPERATURE") is not None
            and c["min_temperature"] <= params.ambient_temperature
            and (
                process_temp is None
                or (c.get("max_temperature") is not None and c["max_temperature"] >= process_temp)
            )
        ]
        if not candidates:
            by_power = [
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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


def x_calc_self_regulating__mutmut_41(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
            if c.get("power_per_meter") is not None
            and c["power_per_meter"] >= required_effective
            and c.get("min_temperature") is None
            and c["min_temperature"] <= params.ambient_temperature
            and (
                process_temp is None
                or (c.get("max_temperature") is not None and c["max_temperature"] >= process_temp)
            )
        ]
        if not candidates:
            by_power = [
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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


def x_calc_self_regulating__mutmut_42(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
            if c.get("power_per_meter") is not None
            and c["power_per_meter"] >= required_effective
            and c.get("min_temperature") is not None
            and c["XXmin_temperatureXX"] <= params.ambient_temperature
            and (
                process_temp is None
                or (c.get("max_temperature") is not None and c["max_temperature"] >= process_temp)
            )
        ]
        if not candidates:
            by_power = [
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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


def x_calc_self_regulating__mutmut_43(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
            if c.get("power_per_meter") is not None
            and c["power_per_meter"] >= required_effective
            and c.get("min_temperature") is not None
            and c["MIN_TEMPERATURE"] <= params.ambient_temperature
            and (
                process_temp is None
                or (c.get("max_temperature") is not None and c["max_temperature"] >= process_temp)
            )
        ]
        if not candidates:
            by_power = [
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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


def x_calc_self_regulating__mutmut_44(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
            if c.get("power_per_meter") is not None
            and c["power_per_meter"] >= required_effective
            and c.get("min_temperature") is not None
            and c["min_temperature"] < params.ambient_temperature
            and (
                process_temp is None
                or (c.get("max_temperature") is not None and c["max_temperature"] >= process_temp)
            )
        ]
        if not candidates:
            by_power = [
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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


def x_calc_self_regulating__mutmut_45(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
            if c.get("power_per_meter") is not None
            and c["power_per_meter"] >= required_effective
            and c.get("min_temperature") is not None
            and c["min_temperature"] <= params.ambient_temperature
            and (
                process_temp is None and (c.get("max_temperature") is not None and c["max_temperature"] >= process_temp)
            )
        ]
        if not candidates:
            by_power = [
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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


def x_calc_self_regulating__mutmut_46(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
            if c.get("power_per_meter") is not None
            and c["power_per_meter"] >= required_effective
            and c.get("min_temperature") is not None
            and c["min_temperature"] <= params.ambient_temperature
            and (
                process_temp is not None
                or (c.get("max_temperature") is not None and c["max_temperature"] >= process_temp)
            )
        ]
        if not candidates:
            by_power = [
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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


def x_calc_self_regulating__mutmut_47(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
            if c.get("power_per_meter") is not None
            and c["power_per_meter"] >= required_effective
            and c.get("min_temperature") is not None
            and c["min_temperature"] <= params.ambient_temperature
            and (
                process_temp is None
                or (c.get("max_temperature") is not None or c["max_temperature"] >= process_temp)
            )
        ]
        if not candidates:
            by_power = [
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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


def x_calc_self_regulating__mutmut_48(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
            if c.get("power_per_meter") is not None
            and c["power_per_meter"] >= required_effective
            and c.get("min_temperature") is not None
            and c["min_temperature"] <= params.ambient_temperature
            and (
                process_temp is None
                or (c.get(None) is not None and c["max_temperature"] >= process_temp)
            )
        ]
        if not candidates:
            by_power = [
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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


def x_calc_self_regulating__mutmut_49(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
            if c.get("power_per_meter") is not None
            and c["power_per_meter"] >= required_effective
            and c.get("min_temperature") is not None
            and c["min_temperature"] <= params.ambient_temperature
            and (
                process_temp is None
                or (c.get("XXmax_temperatureXX") is not None and c["max_temperature"] >= process_temp)
            )
        ]
        if not candidates:
            by_power = [
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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


def x_calc_self_regulating__mutmut_50(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
            if c.get("power_per_meter") is not None
            and c["power_per_meter"] >= required_effective
            and c.get("min_temperature") is not None
            and c["min_temperature"] <= params.ambient_temperature
            and (
                process_temp is None
                or (c.get("MAX_TEMPERATURE") is not None and c["max_temperature"] >= process_temp)
            )
        ]
        if not candidates:
            by_power = [
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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


def x_calc_self_regulating__mutmut_51(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
            if c.get("power_per_meter") is not None
            and c["power_per_meter"] >= required_effective
            and c.get("min_temperature") is not None
            and c["min_temperature"] <= params.ambient_temperature
            and (
                process_temp is None
                or (c.get("max_temperature") is None and c["max_temperature"] >= process_temp)
            )
        ]
        if not candidates:
            by_power = [
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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


def x_calc_self_regulating__mutmut_52(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
            if c.get("power_per_meter") is not None
            and c["power_per_meter"] >= required_effective
            and c.get("min_temperature") is not None
            and c["min_temperature"] <= params.ambient_temperature
            and (
                process_temp is None
                or (c.get("max_temperature") is not None and c["XXmax_temperatureXX"] >= process_temp)
            )
        ]
        if not candidates:
            by_power = [
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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


def x_calc_self_regulating__mutmut_53(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
            if c.get("power_per_meter") is not None
            and c["power_per_meter"] >= required_effective
            and c.get("min_temperature") is not None
            and c["min_temperature"] <= params.ambient_temperature
            and (
                process_temp is None
                or (c.get("max_temperature") is not None and c["MAX_TEMPERATURE"] >= process_temp)
            )
        ]
        if not candidates:
            by_power = [
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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


def x_calc_self_regulating__mutmut_54(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
            if c.get("power_per_meter") is not None
            and c["power_per_meter"] >= required_effective
            and c.get("min_temperature") is not None
            and c["min_temperature"] <= params.ambient_temperature
            and (
                process_temp is None
                or (c.get("max_temperature") is not None and c["max_temperature"] > process_temp)
            )
        ]
        if not candidates:
            by_power = [
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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


def x_calc_self_regulating__mutmut_55(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
            if c.get("power_per_meter") is not None
            and c["power_per_meter"] >= required_effective
            and c.get("min_temperature") is not None
            and c["min_temperature"] <= params.ambient_temperature
            and (
                process_temp is None
                or (c.get("max_temperature") is not None and c["max_temperature"] >= process_temp)
            )
        ]
        if candidates:
            by_power = [
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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


def x_calc_self_regulating__mutmut_56(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
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
            by_power = None
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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


def x_calc_self_regulating__mutmut_57(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None or c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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


def x_calc_self_regulating__mutmut_58(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
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
                c for c in catalog
                if c.get(None) is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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


def x_calc_self_regulating__mutmut_59(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
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
                c for c in catalog
                if c.get("XXpower_per_meterXX") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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


def x_calc_self_regulating__mutmut_60(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
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
                c for c in catalog
                if c.get("POWER_PER_METER") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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


def x_calc_self_regulating__mutmut_61(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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


def x_calc_self_regulating__mutmut_62(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["XXpower_per_meterXX"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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


def x_calc_self_regulating__mutmut_63(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["POWER_PER_METER"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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


def x_calc_self_regulating__mutmut_64(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] > required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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


def x_calc_self_regulating__mutmut_65(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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


def x_calc_self_regulating__mutmut_66(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    None
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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


def x_calc_self_regulating__mutmut_67(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = None
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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


def x_calc_self_regulating__mutmut_68(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
                if c.get("min_temperature") is not None or c["min_temperature"] <= params.ambient_temperature
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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


def x_calc_self_regulating__mutmut_69(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
                if c.get(None) is not None
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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


def x_calc_self_regulating__mutmut_70(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
                if c.get("XXmin_temperatureXX") is not None
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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


def x_calc_self_regulating__mutmut_71(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
                if c.get("MIN_TEMPERATURE") is not None
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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


def x_calc_self_regulating__mutmut_72(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
                if c.get("min_temperature") is None
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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


def x_calc_self_regulating__mutmut_73(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
                if c.get("min_temperature") is not None
                and c["XXmin_temperatureXX"] <= params.ambient_temperature
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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


def x_calc_self_regulating__mutmut_74(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
                if c.get("min_temperature") is not None
                and c["MIN_TEMPERATURE"] <= params.ambient_temperature
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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


def x_calc_self_regulating__mutmut_75(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
                if c.get("min_temperature") is not None
                and c["min_temperature"] < params.ambient_temperature
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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


def x_calc_self_regulating__mutmut_76(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
                if c.get("min_temperature") is not None
                and c["min_temperature"] <= params.ambient_temperature
            ]
            if by_min_t:
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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


def x_calc_self_regulating__mutmut_77(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
                if c.get("min_temperature") is not None
                and c["min_temperature"] <= params.ambient_temperature
            ]
            if not by_min_t:
                raise ValueError(
                    None
                )
            raise ValueError(
                f"Не найден кабель, выдерживающий T продукта = {process_temp}°C "
                f"при требуемой мощности ≥ {required_effective:.2f} Вт/м"
            )
        cable = min(candidates, key=lambda c: c["power_per_meter"])
    else:
        looked_up = _lookup_by_mark(catalog, params.cable_mark)
        if looked_up is None:
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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


def x_calc_self_regulating__mutmut_78(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
                if c.get("min_temperature") is not None
                and c["min_temperature"] <= params.ambient_temperature
            ]
            if not by_min_t:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м, "
                    f"работающий при T среды = {params.ambient_temperature}°C"
                )
            raise ValueError(
                None
            )
        cable = min(candidates, key=lambda c: c["power_per_meter"])
    else:
        looked_up = _lookup_by_mark(catalog, params.cable_mark)
        if looked_up is None:
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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


def x_calc_self_regulating__mutmut_79(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
        cable = None
    else:
        looked_up = _lookup_by_mark(catalog, params.cable_mark)
        if looked_up is None:
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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


def x_calc_self_regulating__mutmut_80(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
        cable = min(None, key=lambda c: c["power_per_meter"])
    else:
        looked_up = _lookup_by_mark(catalog, params.cable_mark)
        if looked_up is None:
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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


def x_calc_self_regulating__mutmut_81(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
        cable = min(candidates, key=None)
    else:
        looked_up = _lookup_by_mark(catalog, params.cable_mark)
        if looked_up is None:
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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


def x_calc_self_regulating__mutmut_82(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
        cable = min(key=lambda c: c["power_per_meter"])
    else:
        looked_up = _lookup_by_mark(catalog, params.cable_mark)
        if looked_up is None:
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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


def x_calc_self_regulating__mutmut_83(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
        cable = min(candidates, )
    else:
        looked_up = _lookup_by_mark(catalog, params.cable_mark)
        if looked_up is None:
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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


def x_calc_self_regulating__mutmut_84(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
        cable = min(candidates, key=lambda c: None)
    else:
        looked_up = _lookup_by_mark(catalog, params.cable_mark)
        if looked_up is None:
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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


def x_calc_self_regulating__mutmut_85(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
        cable = min(candidates, key=lambda c: c["XXpower_per_meterXX"])
    else:
        looked_up = _lookup_by_mark(catalog, params.cable_mark)
        if looked_up is None:
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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


def x_calc_self_regulating__mutmut_86(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
        cable = min(candidates, key=lambda c: c["POWER_PER_METER"])
    else:
        looked_up = _lookup_by_mark(catalog, params.cable_mark)
        if looked_up is None:
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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


def x_calc_self_regulating__mutmut_87(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
        looked_up = None
        if looked_up is None:
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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


def x_calc_self_regulating__mutmut_88(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
        looked_up = _lookup_by_mark(None, params.cable_mark)
        if looked_up is None:
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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


def x_calc_self_regulating__mutmut_89(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
        looked_up = _lookup_by_mark(catalog, None)
        if looked_up is None:
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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


def x_calc_self_regulating__mutmut_90(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
        looked_up = _lookup_by_mark(params.cable_mark)
        if looked_up is None:
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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


def x_calc_self_regulating__mutmut_91(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
        looked_up = _lookup_by_mark(catalog, )
        if looked_up is None:
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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


def x_calc_self_regulating__mutmut_92(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
        if looked_up is not None:
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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


def x_calc_self_regulating__mutmut_93(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                None
            )
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


def x_calc_self_regulating__mutmut_94(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
        cable = None

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


def x_calc_self_regulating__mutmut_95(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
        cable = looked_up

    if cable["XXpower_per_meterXX"] < required_effective:
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


def x_calc_self_regulating__mutmut_96(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
        cable = looked_up

    if cable["POWER_PER_METER"] < required_effective:
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


def x_calc_self_regulating__mutmut_97(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
        cable = looked_up

    if cable["power_per_meter"] <= required_effective:
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


def x_calc_self_regulating__mutmut_98(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
        cable = looked_up

    if cable["power_per_meter"] < required_effective:
        raise ValueError(
            None
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


def x_calc_self_regulating__mutmut_99(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
        cable = looked_up

    if cable["power_per_meter"] < required_effective:
        raise ValueError(
            f"Кабель {cable['XXmodelXX']} ({cable['power_per_meter']} Вт/м) "
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


def x_calc_self_regulating__mutmut_100(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
        cable = looked_up

    if cable["power_per_meter"] < required_effective:
        raise ValueError(
            f"Кабель {cable['MODEL']} ({cable['power_per_meter']} Вт/м) "
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


def x_calc_self_regulating__mutmut_101(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
        cable = looked_up

    if cable["power_per_meter"] < required_effective:
        raise ValueError(
            f"Кабель {cable['model']} ({cable['XXpower_per_meterXX']} Вт/м) "
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


def x_calc_self_regulating__mutmut_102(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
        cable = looked_up

    if cable["power_per_meter"] < required_effective:
        raise ValueError(
            f"Кабель {cable['model']} ({cable['POWER_PER_METER']} Вт/м) "
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


def x_calc_self_regulating__mutmut_103(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
        cable = looked_up

    if cable["power_per_meter"] < required_effective:
        raise ValueError(
            f"Кабель {cable['model']} ({cable['power_per_meter']} Вт/м) "
            f"не обеспечивает требуемую мощность {required_effective:.1f} Вт/м"
        )
    if params.ambient_temperature <= cable["min_temperature"]:
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


def x_calc_self_regulating__mutmut_104(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
        cable = looked_up

    if cable["power_per_meter"] < required_effective:
        raise ValueError(
            f"Кабель {cable['model']} ({cable['power_per_meter']} Вт/м) "
            f"не обеспечивает требуемую мощность {required_effective:.1f} Вт/м"
        )
    if params.ambient_temperature < cable["XXmin_temperatureXX"]:
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


def x_calc_self_regulating__mutmut_105(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
        cable = looked_up

    if cable["power_per_meter"] < required_effective:
        raise ValueError(
            f"Кабель {cable['model']} ({cable['power_per_meter']} Вт/м) "
            f"не обеспечивает требуемую мощность {required_effective:.1f} Вт/м"
        )
    if params.ambient_temperature < cable["MIN_TEMPERATURE"]:
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


def x_calc_self_regulating__mutmut_106(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
        cable = looked_up

    if cable["power_per_meter"] < required_effective:
        raise ValueError(
            f"Кабель {cable['model']} ({cable['power_per_meter']} Вт/м) "
            f"не обеспечивает требуемую мощность {required_effective:.1f} Вт/м"
        )
    if params.ambient_temperature < cable["min_temperature"]:
        raise ValueError(
            None
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


def x_calc_self_regulating__mutmut_107(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
        cable = looked_up

    if cable["power_per_meter"] < required_effective:
        raise ValueError(
            f"Кабель {cable['model']} ({cable['power_per_meter']} Вт/м) "
            f"не обеспечивает требуемую мощность {required_effective:.1f} Вт/м"
        )
    if params.ambient_temperature < cable["min_temperature"]:
        raise ValueError(
            f"Температура среды {params.ambient_temperature}°C ниже минимальной "
            f"для кабеля {cable['XXmodelXX']} ({cable['min_temperature']}°C)"
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


def x_calc_self_regulating__mutmut_108(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
        cable = looked_up

    if cable["power_per_meter"] < required_effective:
        raise ValueError(
            f"Кабель {cable['model']} ({cable['power_per_meter']} Вт/м) "
            f"не обеспечивает требуемую мощность {required_effective:.1f} Вт/м"
        )
    if params.ambient_temperature < cable["min_temperature"]:
        raise ValueError(
            f"Температура среды {params.ambient_temperature}°C ниже минимальной "
            f"для кабеля {cable['MODEL']} ({cable['min_temperature']}°C)"
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


def x_calc_self_regulating__mutmut_109(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
        cable = looked_up

    if cable["power_per_meter"] < required_effective:
        raise ValueError(
            f"Кабель {cable['model']} ({cable['power_per_meter']} Вт/м) "
            f"не обеспечивает требуемую мощность {required_effective:.1f} Вт/м"
        )
    if params.ambient_temperature < cable["min_temperature"]:
        raise ValueError(
            f"Температура среды {params.ambient_temperature}°C ниже минимальной "
            f"для кабеля {cable['model']} ({cable['XXmin_temperatureXX']}°C)"
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


def x_calc_self_regulating__mutmut_110(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
        cable = looked_up

    if cable["power_per_meter"] < required_effective:
        raise ValueError(
            f"Кабель {cable['model']} ({cable['power_per_meter']} Вт/м) "
            f"не обеспечивает требуемую мощность {required_effective:.1f} Вт/м"
        )
    if params.ambient_temperature < cable["min_temperature"]:
        raise ValueError(
            f"Температура среды {params.ambient_temperature}°C ниже минимальной "
            f"для кабеля {cable['model']} ({cable['MIN_TEMPERATURE']}°C)"
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


def x_calc_self_regulating__mutmut_111(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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
    if process_temp is not None or process_temp > cable["max_temperature"]:
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


def x_calc_self_regulating__mutmut_112(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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
    if process_temp is None and process_temp > cable["max_temperature"]:
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


def x_calc_self_regulating__mutmut_113(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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
    if process_temp is not None and process_temp >= cable["max_temperature"]:
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


def x_calc_self_regulating__mutmut_114(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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
    if process_temp is not None and process_temp > cable["XXmax_temperatureXX"]:
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


def x_calc_self_regulating__mutmut_115(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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
    if process_temp is not None and process_temp > cable["MAX_TEMPERATURE"]:
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


def x_calc_self_regulating__mutmut_116(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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
            None
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


def x_calc_self_regulating__mutmut_117(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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
            f"допустимую для кабеля {cable['XXmodelXX']} ({cable['max_temperature']}°C)"
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


def x_calc_self_regulating__mutmut_118(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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
            f"допустимую для кабеля {cable['MODEL']} ({cable['max_temperature']}°C)"
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


def x_calc_self_regulating__mutmut_119(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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
            f"допустимую для кабеля {cable['model']} ({cable['XXmax_temperatureXX']}°C)"
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


def x_calc_self_regulating__mutmut_120(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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
            f"допустимую для кабеля {cable['model']} ({cable['MAX_TEMPERATURE']}°C)"
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


def x_calc_self_regulating__mutmut_121(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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
    CABLE_LENGTH_FACTOR = None
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


def x_calc_self_regulating__mutmut_122(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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
    CABLE_LENGTH_FACTOR = 2.1
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


def x_calc_self_regulating__mutmut_123(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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
    cable_length = None
    total_power = cable["power_per_meter"] * cable_length
    current = total_power / params.supply_voltage

    return SelfRegulatingResult(
        selected_cable=cable["model"],
        cable_length=round(cable_length, 3),
        total_power=round(total_power, 3),
        current=round(current, 3),
        voltage=params.supply_voltage,
    )


def x_calc_self_regulating__mutmut_124(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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
    cable_length = params.pipe_length / CABLE_LENGTH_FACTOR
    total_power = cable["power_per_meter"] * cable_length
    current = total_power / params.supply_voltage

    return SelfRegulatingResult(
        selected_cable=cable["model"],
        cable_length=round(cable_length, 3),
        total_power=round(total_power, 3),
        current=round(current, 3),
        voltage=params.supply_voltage,
    )


def x_calc_self_regulating__mutmut_125(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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
    total_power = None
    current = total_power / params.supply_voltage

    return SelfRegulatingResult(
        selected_cable=cable["model"],
        cable_length=round(cable_length, 3),
        total_power=round(total_power, 3),
        current=round(current, 3),
        voltage=params.supply_voltage,
    )


def x_calc_self_regulating__mutmut_126(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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
    total_power = cable["power_per_meter"] / cable_length
    current = total_power / params.supply_voltage

    return SelfRegulatingResult(
        selected_cable=cable["model"],
        cable_length=round(cable_length, 3),
        total_power=round(total_power, 3),
        current=round(current, 3),
        voltage=params.supply_voltage,
    )


def x_calc_self_regulating__mutmut_127(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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
    total_power = cable["XXpower_per_meterXX"] * cable_length
    current = total_power / params.supply_voltage

    return SelfRegulatingResult(
        selected_cable=cable["model"],
        cable_length=round(cable_length, 3),
        total_power=round(total_power, 3),
        current=round(current, 3),
        voltage=params.supply_voltage,
    )


def x_calc_self_regulating__mutmut_128(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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
    total_power = cable["POWER_PER_METER"] * cable_length
    current = total_power / params.supply_voltage

    return SelfRegulatingResult(
        selected_cable=cable["model"],
        cable_length=round(cable_length, 3),
        total_power=round(total_power, 3),
        current=round(current, 3),
        voltage=params.supply_voltage,
    )


def x_calc_self_regulating__mutmut_129(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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
    current = None

    return SelfRegulatingResult(
        selected_cable=cable["model"],
        cable_length=round(cable_length, 3),
        total_power=round(total_power, 3),
        current=round(current, 3),
        voltage=params.supply_voltage,
    )


def x_calc_self_regulating__mutmut_130(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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
    current = total_power * params.supply_voltage

    return SelfRegulatingResult(
        selected_cable=cable["model"],
        cable_length=round(cable_length, 3),
        total_power=round(total_power, 3),
        current=round(current, 3),
        voltage=params.supply_voltage,
    )


def x_calc_self_regulating__mutmut_131(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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
        selected_cable=None,
        cable_length=round(cable_length, 3),
        total_power=round(total_power, 3),
        current=round(current, 3),
        voltage=params.supply_voltage,
    )


def x_calc_self_regulating__mutmut_132(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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
        cable_length=None,
        total_power=round(total_power, 3),
        current=round(current, 3),
        voltage=params.supply_voltage,
    )


def x_calc_self_regulating__mutmut_133(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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
        total_power=None,
        current=round(current, 3),
        voltage=params.supply_voltage,
    )


def x_calc_self_regulating__mutmut_134(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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
        current=None,
        voltage=params.supply_voltage,
    )


def x_calc_self_regulating__mutmut_135(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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
        voltage=None,
    )


def x_calc_self_regulating__mutmut_136(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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
        cable_length=round(cable_length, 3),
        total_power=round(total_power, 3),
        current=round(current, 3),
        voltage=params.supply_voltage,
    )


def x_calc_self_regulating__mutmut_137(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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
        total_power=round(total_power, 3),
        current=round(current, 3),
        voltage=params.supply_voltage,
    )


def x_calc_self_regulating__mutmut_138(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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
        current=round(current, 3),
        voltage=params.supply_voltage,
    )


def x_calc_self_regulating__mutmut_139(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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
        voltage=params.supply_voltage,
    )


def x_calc_self_regulating__mutmut_140(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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
        )


def x_calc_self_regulating__mutmut_141(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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
        selected_cable=cable["XXmodelXX"],
        cable_length=round(cable_length, 3),
        total_power=round(total_power, 3),
        current=round(current, 3),
        voltage=params.supply_voltage,
    )


def x_calc_self_regulating__mutmut_142(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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
        selected_cable=cable["MODEL"],
        cable_length=round(cable_length, 3),
        total_power=round(total_power, 3),
        current=round(current, 3),
        voltage=params.supply_voltage,
    )


def x_calc_self_regulating__mutmut_143(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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
        cable_length=round(None, 3),
        total_power=round(total_power, 3),
        current=round(current, 3),
        voltage=params.supply_voltage,
    )


def x_calc_self_regulating__mutmut_144(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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
        cable_length=round(cable_length, None),
        total_power=round(total_power, 3),
        current=round(current, 3),
        voltage=params.supply_voltage,
    )


def x_calc_self_regulating__mutmut_145(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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
        cable_length=round(3),
        total_power=round(total_power, 3),
        current=round(current, 3),
        voltage=params.supply_voltage,
    )


def x_calc_self_regulating__mutmut_146(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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
        cable_length=round(cable_length, ),
        total_power=round(total_power, 3),
        current=round(current, 3),
        voltage=params.supply_voltage,
    )


def x_calc_self_regulating__mutmut_147(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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
        cable_length=round(cable_length, 4),
        total_power=round(total_power, 3),
        current=round(current, 3),
        voltage=params.supply_voltage,
    )


def x_calc_self_regulating__mutmut_148(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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
        total_power=round(None, 3),
        current=round(current, 3),
        voltage=params.supply_voltage,
    )


def x_calc_self_regulating__mutmut_149(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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
        total_power=round(total_power, None),
        current=round(current, 3),
        voltage=params.supply_voltage,
    )


def x_calc_self_regulating__mutmut_150(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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
        total_power=round(3),
        current=round(current, 3),
        voltage=params.supply_voltage,
    )


def x_calc_self_regulating__mutmut_151(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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
        total_power=round(total_power, ),
        current=round(current, 3),
        voltage=params.supply_voltage,
    )


def x_calc_self_regulating__mutmut_152(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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
        total_power=round(total_power, 4),
        current=round(current, 3),
        voltage=params.supply_voltage,
    )


def x_calc_self_regulating__mutmut_153(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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
        current=round(None, 3),
        voltage=params.supply_voltage,
    )


def x_calc_self_regulating__mutmut_154(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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
        current=round(current, None),
        voltage=params.supply_voltage,
    )


def x_calc_self_regulating__mutmut_155(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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
        current=round(3),
        voltage=params.supply_voltage,
    )


def x_calc_self_regulating__mutmut_156(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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
        current=round(current, ),
        voltage=params.supply_voltage,
    )


def x_calc_self_regulating__mutmut_157(params: SelfRegulatingParams) -> SelfRegulatingResult:
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
            c for c in catalog
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
                c for c in catalog
                if c.get("power_per_meter") is not None
                and c["power_per_meter"] >= required_effective
            ]
            if not by_power:
                raise ValueError(
                    f"Не найден кабель с мощностью ≥ {required_effective:.2f} Вт/м "
                    f"(максимум линейки — 100 Вт/м)"
                )
            by_min_t = [
                c for c in by_power
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
            raise ValueError(
                f"Кабель «{params.cable_mark}» не найден в справочнике"
            )
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
        current=round(current, 4),
        voltage=params.supply_voltage,
    )

x_calc_self_regulating__mutmut_mutants : ClassVar[MutantDict] = { # type: ignore
'x_calc_self_regulating__mutmut_1': x_calc_self_regulating__mutmut_1, 
    'x_calc_self_regulating__mutmut_2': x_calc_self_regulating__mutmut_2, 
    'x_calc_self_regulating__mutmut_3': x_calc_self_regulating__mutmut_3, 
    'x_calc_self_regulating__mutmut_4': x_calc_self_regulating__mutmut_4, 
    'x_calc_self_regulating__mutmut_5': x_calc_self_regulating__mutmut_5, 
    'x_calc_self_regulating__mutmut_6': x_calc_self_regulating__mutmut_6, 
    'x_calc_self_regulating__mutmut_7': x_calc_self_regulating__mutmut_7, 
    'x_calc_self_regulating__mutmut_8': x_calc_self_regulating__mutmut_8, 
    'x_calc_self_regulating__mutmut_9': x_calc_self_regulating__mutmut_9, 
    'x_calc_self_regulating__mutmut_10': x_calc_self_regulating__mutmut_10, 
    'x_calc_self_regulating__mutmut_11': x_calc_self_regulating__mutmut_11, 
    'x_calc_self_regulating__mutmut_12': x_calc_self_regulating__mutmut_12, 
    'x_calc_self_regulating__mutmut_13': x_calc_self_regulating__mutmut_13, 
    'x_calc_self_regulating__mutmut_14': x_calc_self_regulating__mutmut_14, 
    'x_calc_self_regulating__mutmut_15': x_calc_self_regulating__mutmut_15, 
    'x_calc_self_regulating__mutmut_16': x_calc_self_regulating__mutmut_16, 
    'x_calc_self_regulating__mutmut_17': x_calc_self_regulating__mutmut_17, 
    'x_calc_self_regulating__mutmut_18': x_calc_self_regulating__mutmut_18, 
    'x_calc_self_regulating__mutmut_19': x_calc_self_regulating__mutmut_19, 
    'x_calc_self_regulating__mutmut_20': x_calc_self_regulating__mutmut_20, 
    'x_calc_self_regulating__mutmut_21': x_calc_self_regulating__mutmut_21, 
    'x_calc_self_regulating__mutmut_22': x_calc_self_regulating__mutmut_22, 
    'x_calc_self_regulating__mutmut_23': x_calc_self_regulating__mutmut_23, 
    'x_calc_self_regulating__mutmut_24': x_calc_self_regulating__mutmut_24, 
    'x_calc_self_regulating__mutmut_25': x_calc_self_regulating__mutmut_25, 
    'x_calc_self_regulating__mutmut_26': x_calc_self_regulating__mutmut_26, 
    'x_calc_self_regulating__mutmut_27': x_calc_self_regulating__mutmut_27, 
    'x_calc_self_regulating__mutmut_28': x_calc_self_regulating__mutmut_28, 
    'x_calc_self_regulating__mutmut_29': x_calc_self_regulating__mutmut_29, 
    'x_calc_self_regulating__mutmut_30': x_calc_self_regulating__mutmut_30, 
    'x_calc_self_regulating__mutmut_31': x_calc_self_regulating__mutmut_31, 
    'x_calc_self_regulating__mutmut_32': x_calc_self_regulating__mutmut_32, 
    'x_calc_self_regulating__mutmut_33': x_calc_self_regulating__mutmut_33, 
    'x_calc_self_regulating__mutmut_34': x_calc_self_regulating__mutmut_34, 
    'x_calc_self_regulating__mutmut_35': x_calc_self_regulating__mutmut_35, 
    'x_calc_self_regulating__mutmut_36': x_calc_self_regulating__mutmut_36, 
    'x_calc_self_regulating__mutmut_37': x_calc_self_regulating__mutmut_37, 
    'x_calc_self_regulating__mutmut_38': x_calc_self_regulating__mutmut_38, 
    'x_calc_self_regulating__mutmut_39': x_calc_self_regulating__mutmut_39, 
    'x_calc_self_regulating__mutmut_40': x_calc_self_regulating__mutmut_40, 
    'x_calc_self_regulating__mutmut_41': x_calc_self_regulating__mutmut_41, 
    'x_calc_self_regulating__mutmut_42': x_calc_self_regulating__mutmut_42, 
    'x_calc_self_regulating__mutmut_43': x_calc_self_regulating__mutmut_43, 
    'x_calc_self_regulating__mutmut_44': x_calc_self_regulating__mutmut_44, 
    'x_calc_self_regulating__mutmut_45': x_calc_self_regulating__mutmut_45, 
    'x_calc_self_regulating__mutmut_46': x_calc_self_regulating__mutmut_46, 
    'x_calc_self_regulating__mutmut_47': x_calc_self_regulating__mutmut_47, 
    'x_calc_self_regulating__mutmut_48': x_calc_self_regulating__mutmut_48, 
    'x_calc_self_regulating__mutmut_49': x_calc_self_regulating__mutmut_49, 
    'x_calc_self_regulating__mutmut_50': x_calc_self_regulating__mutmut_50, 
    'x_calc_self_regulating__mutmut_51': x_calc_self_regulating__mutmut_51, 
    'x_calc_self_regulating__mutmut_52': x_calc_self_regulating__mutmut_52, 
    'x_calc_self_regulating__mutmut_53': x_calc_self_regulating__mutmut_53, 
    'x_calc_self_regulating__mutmut_54': x_calc_self_regulating__mutmut_54, 
    'x_calc_self_regulating__mutmut_55': x_calc_self_regulating__mutmut_55, 
    'x_calc_self_regulating__mutmut_56': x_calc_self_regulating__mutmut_56, 
    'x_calc_self_regulating__mutmut_57': x_calc_self_regulating__mutmut_57, 
    'x_calc_self_regulating__mutmut_58': x_calc_self_regulating__mutmut_58, 
    'x_calc_self_regulating__mutmut_59': x_calc_self_regulating__mutmut_59, 
    'x_calc_self_regulating__mutmut_60': x_calc_self_regulating__mutmut_60, 
    'x_calc_self_regulating__mutmut_61': x_calc_self_regulating__mutmut_61, 
    'x_calc_self_regulating__mutmut_62': x_calc_self_regulating__mutmut_62, 
    'x_calc_self_regulating__mutmut_63': x_calc_self_regulating__mutmut_63, 
    'x_calc_self_regulating__mutmut_64': x_calc_self_regulating__mutmut_64, 
    'x_calc_self_regulating__mutmut_65': x_calc_self_regulating__mutmut_65, 
    'x_calc_self_regulating__mutmut_66': x_calc_self_regulating__mutmut_66, 
    'x_calc_self_regulating__mutmut_67': x_calc_self_regulating__mutmut_67, 
    'x_calc_self_regulating__mutmut_68': x_calc_self_regulating__mutmut_68, 
    'x_calc_self_regulating__mutmut_69': x_calc_self_regulating__mutmut_69, 
    'x_calc_self_regulating__mutmut_70': x_calc_self_regulating__mutmut_70, 
    'x_calc_self_regulating__mutmut_71': x_calc_self_regulating__mutmut_71, 
    'x_calc_self_regulating__mutmut_72': x_calc_self_regulating__mutmut_72, 
    'x_calc_self_regulating__mutmut_73': x_calc_self_regulating__mutmut_73, 
    'x_calc_self_regulating__mutmut_74': x_calc_self_regulating__mutmut_74, 
    'x_calc_self_regulating__mutmut_75': x_calc_self_regulating__mutmut_75, 
    'x_calc_self_regulating__mutmut_76': x_calc_self_regulating__mutmut_76, 
    'x_calc_self_regulating__mutmut_77': x_calc_self_regulating__mutmut_77, 
    'x_calc_self_regulating__mutmut_78': x_calc_self_regulating__mutmut_78, 
    'x_calc_self_regulating__mutmut_79': x_calc_self_regulating__mutmut_79, 
    'x_calc_self_regulating__mutmut_80': x_calc_self_regulating__mutmut_80, 
    'x_calc_self_regulating__mutmut_81': x_calc_self_regulating__mutmut_81, 
    'x_calc_self_regulating__mutmut_82': x_calc_self_regulating__mutmut_82, 
    'x_calc_self_regulating__mutmut_83': x_calc_self_regulating__mutmut_83, 
    'x_calc_self_regulating__mutmut_84': x_calc_self_regulating__mutmut_84, 
    'x_calc_self_regulating__mutmut_85': x_calc_self_regulating__mutmut_85, 
    'x_calc_self_regulating__mutmut_86': x_calc_self_regulating__mutmut_86, 
    'x_calc_self_regulating__mutmut_87': x_calc_self_regulating__mutmut_87, 
    'x_calc_self_regulating__mutmut_88': x_calc_self_regulating__mutmut_88, 
    'x_calc_self_regulating__mutmut_89': x_calc_self_regulating__mutmut_89, 
    'x_calc_self_regulating__mutmut_90': x_calc_self_regulating__mutmut_90, 
    'x_calc_self_regulating__mutmut_91': x_calc_self_regulating__mutmut_91, 
    'x_calc_self_regulating__mutmut_92': x_calc_self_regulating__mutmut_92, 
    'x_calc_self_regulating__mutmut_93': x_calc_self_regulating__mutmut_93, 
    'x_calc_self_regulating__mutmut_94': x_calc_self_regulating__mutmut_94, 
    'x_calc_self_regulating__mutmut_95': x_calc_self_regulating__mutmut_95, 
    'x_calc_self_regulating__mutmut_96': x_calc_self_regulating__mutmut_96, 
    'x_calc_self_regulating__mutmut_97': x_calc_self_regulating__mutmut_97, 
    'x_calc_self_regulating__mutmut_98': x_calc_self_regulating__mutmut_98, 
    'x_calc_self_regulating__mutmut_99': x_calc_self_regulating__mutmut_99, 
    'x_calc_self_regulating__mutmut_100': x_calc_self_regulating__mutmut_100, 
    'x_calc_self_regulating__mutmut_101': x_calc_self_regulating__mutmut_101, 
    'x_calc_self_regulating__mutmut_102': x_calc_self_regulating__mutmut_102, 
    'x_calc_self_regulating__mutmut_103': x_calc_self_regulating__mutmut_103, 
    'x_calc_self_regulating__mutmut_104': x_calc_self_regulating__mutmut_104, 
    'x_calc_self_regulating__mutmut_105': x_calc_self_regulating__mutmut_105, 
    'x_calc_self_regulating__mutmut_106': x_calc_self_regulating__mutmut_106, 
    'x_calc_self_regulating__mutmut_107': x_calc_self_regulating__mutmut_107, 
    'x_calc_self_regulating__mutmut_108': x_calc_self_regulating__mutmut_108, 
    'x_calc_self_regulating__mutmut_109': x_calc_self_regulating__mutmut_109, 
    'x_calc_self_regulating__mutmut_110': x_calc_self_regulating__mutmut_110, 
    'x_calc_self_regulating__mutmut_111': x_calc_self_regulating__mutmut_111, 
    'x_calc_self_regulating__mutmut_112': x_calc_self_regulating__mutmut_112, 
    'x_calc_self_regulating__mutmut_113': x_calc_self_regulating__mutmut_113, 
    'x_calc_self_regulating__mutmut_114': x_calc_self_regulating__mutmut_114, 
    'x_calc_self_regulating__mutmut_115': x_calc_self_regulating__mutmut_115, 
    'x_calc_self_regulating__mutmut_116': x_calc_self_regulating__mutmut_116, 
    'x_calc_self_regulating__mutmut_117': x_calc_self_regulating__mutmut_117, 
    'x_calc_self_regulating__mutmut_118': x_calc_self_regulating__mutmut_118, 
    'x_calc_self_regulating__mutmut_119': x_calc_self_regulating__mutmut_119, 
    'x_calc_self_regulating__mutmut_120': x_calc_self_regulating__mutmut_120, 
    'x_calc_self_regulating__mutmut_121': x_calc_self_regulating__mutmut_121, 
    'x_calc_self_regulating__mutmut_122': x_calc_self_regulating__mutmut_122, 
    'x_calc_self_regulating__mutmut_123': x_calc_self_regulating__mutmut_123, 
    'x_calc_self_regulating__mutmut_124': x_calc_self_regulating__mutmut_124, 
    'x_calc_self_regulating__mutmut_125': x_calc_self_regulating__mutmut_125, 
    'x_calc_self_regulating__mutmut_126': x_calc_self_regulating__mutmut_126, 
    'x_calc_self_regulating__mutmut_127': x_calc_self_regulating__mutmut_127, 
    'x_calc_self_regulating__mutmut_128': x_calc_self_regulating__mutmut_128, 
    'x_calc_self_regulating__mutmut_129': x_calc_self_regulating__mutmut_129, 
    'x_calc_self_regulating__mutmut_130': x_calc_self_regulating__mutmut_130, 
    'x_calc_self_regulating__mutmut_131': x_calc_self_regulating__mutmut_131, 
    'x_calc_self_regulating__mutmut_132': x_calc_self_regulating__mutmut_132, 
    'x_calc_self_regulating__mutmut_133': x_calc_self_regulating__mutmut_133, 
    'x_calc_self_regulating__mutmut_134': x_calc_self_regulating__mutmut_134, 
    'x_calc_self_regulating__mutmut_135': x_calc_self_regulating__mutmut_135, 
    'x_calc_self_regulating__mutmut_136': x_calc_self_regulating__mutmut_136, 
    'x_calc_self_regulating__mutmut_137': x_calc_self_regulating__mutmut_137, 
    'x_calc_self_regulating__mutmut_138': x_calc_self_regulating__mutmut_138, 
    'x_calc_self_regulating__mutmut_139': x_calc_self_regulating__mutmut_139, 
    'x_calc_self_regulating__mutmut_140': x_calc_self_regulating__mutmut_140, 
    'x_calc_self_regulating__mutmut_141': x_calc_self_regulating__mutmut_141, 
    'x_calc_self_regulating__mutmut_142': x_calc_self_regulating__mutmut_142, 
    'x_calc_self_regulating__mutmut_143': x_calc_self_regulating__mutmut_143, 
    'x_calc_self_regulating__mutmut_144': x_calc_self_regulating__mutmut_144, 
    'x_calc_self_regulating__mutmut_145': x_calc_self_regulating__mutmut_145, 
    'x_calc_self_regulating__mutmut_146': x_calc_self_regulating__mutmut_146, 
    'x_calc_self_regulating__mutmut_147': x_calc_self_regulating__mutmut_147, 
    'x_calc_self_regulating__mutmut_148': x_calc_self_regulating__mutmut_148, 
    'x_calc_self_regulating__mutmut_149': x_calc_self_regulating__mutmut_149, 
    'x_calc_self_regulating__mutmut_150': x_calc_self_regulating__mutmut_150, 
    'x_calc_self_regulating__mutmut_151': x_calc_self_regulating__mutmut_151, 
    'x_calc_self_regulating__mutmut_152': x_calc_self_regulating__mutmut_152, 
    'x_calc_self_regulating__mutmut_153': x_calc_self_regulating__mutmut_153, 
    'x_calc_self_regulating__mutmut_154': x_calc_self_regulating__mutmut_154, 
    'x_calc_self_regulating__mutmut_155': x_calc_self_regulating__mutmut_155, 
    'x_calc_self_regulating__mutmut_156': x_calc_self_regulating__mutmut_156, 
    'x_calc_self_regulating__mutmut_157': x_calc_self_regulating__mutmut_157
}
x_calc_self_regulating__mutmut_orig.__name__ = 'x_calc_self_regulating'
