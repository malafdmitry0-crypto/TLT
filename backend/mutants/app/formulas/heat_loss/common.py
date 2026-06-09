"""Общие утилиты расчёта теплопотерь.

ВНИМАНИЕ: Финальные формулы будут предоставлены отдельно (см. CLAUDE.md).
Текущая реализация — физически корректная приближённая математика
(теплопроводность по закону Фурье), пригодная для сквозной интеграции
и тестирования структуры расчёта. Заменяется точечно в соответствующих
модулях без изменения сигнатур.
"""

from typing import Any

DEFAULT_COEFFICIENTS: dict[str, float] = {
    "wind_factor": 1.0,
    "safety_factor": 1.1,
    "location_indoor": 0.9,
    "location_outdoor": 1.0,
}
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


def apply_coefficients(
    base_value: float,
    coefficients: dict[str, float] | None,
    keys: list[str],
) -> float:
    args = [base_value, coefficients, keys]# type: ignore
    kwargs = {}# type: ignore
    return _mutmut_trampoline(x_apply_coefficients__mutmut_orig, x_apply_coefficients__mutmut_mutants, args, kwargs, None)


def x_apply_coefficients__mutmut_orig(
    base_value: float,
    coefficients: dict[str, float] | None,
    keys: list[str],
) -> float:
    """Применяет заданные коэффициенты мультипликативно."""
    if not coefficients:
        return base_value
    value = base_value
    for key in keys:
        if key in coefficients:
            value *= coefficients[key]
    return value


def x_apply_coefficients__mutmut_1(
    base_value: float,
    coefficients: dict[str, float] | None,
    keys: list[str],
) -> float:
    """Применяет заданные коэффициенты мультипликативно."""
    if coefficients:
        return base_value
    value = base_value
    for key in keys:
        if key in coefficients:
            value *= coefficients[key]
    return value


def x_apply_coefficients__mutmut_2(
    base_value: float,
    coefficients: dict[str, float] | None,
    keys: list[str],
) -> float:
    """Применяет заданные коэффициенты мультипликативно."""
    if not coefficients:
        return base_value
    value = None
    for key in keys:
        if key in coefficients:
            value *= coefficients[key]
    return value


def x_apply_coefficients__mutmut_3(
    base_value: float,
    coefficients: dict[str, float] | None,
    keys: list[str],
) -> float:
    """Применяет заданные коэффициенты мультипликативно."""
    if not coefficients:
        return base_value
    value = base_value
    for key in keys:
        if key not in coefficients:
            value *= coefficients[key]
    return value


def x_apply_coefficients__mutmut_4(
    base_value: float,
    coefficients: dict[str, float] | None,
    keys: list[str],
) -> float:
    """Применяет заданные коэффициенты мультипликативно."""
    if not coefficients:
        return base_value
    value = base_value
    for key in keys:
        if key in coefficients:
            value = coefficients[key]
    return value


def x_apply_coefficients__mutmut_5(
    base_value: float,
    coefficients: dict[str, float] | None,
    keys: list[str],
) -> float:
    """Применяет заданные коэффициенты мультипликативно."""
    if not coefficients:
        return base_value
    value = base_value
    for key in keys:
        if key in coefficients:
            value /= coefficients[key]
    return value

x_apply_coefficients__mutmut_mutants : ClassVar[MutantDict] = { # type: ignore
'x_apply_coefficients__mutmut_1': x_apply_coefficients__mutmut_1, 
    'x_apply_coefficients__mutmut_2': x_apply_coefficients__mutmut_2, 
    'x_apply_coefficients__mutmut_3': x_apply_coefficients__mutmut_3, 
    'x_apply_coefficients__mutmut_4': x_apply_coefficients__mutmut_4, 
    'x_apply_coefficients__mutmut_5': x_apply_coefficients__mutmut_5
}
x_apply_coefficients__mutmut_orig.__name__ = 'x_apply_coefficients'


def validate_positive(name: str, value: float) -> None:
    args = [name, value]# type: ignore
    kwargs = {}# type: ignore
    return _mutmut_trampoline(x_validate_positive__mutmut_orig, x_validate_positive__mutmut_mutants, args, kwargs, None)


def x_validate_positive__mutmut_orig(name: str, value: float) -> None:
    if value <= 0:
        raise ValueError(f"{name} должно быть положительным (получено {value})")


def x_validate_positive__mutmut_1(name: str, value: float) -> None:
    if value < 0:
        raise ValueError(f"{name} должно быть положительным (получено {value})")


def x_validate_positive__mutmut_2(name: str, value: float) -> None:
    if value <= 1:
        raise ValueError(f"{name} должно быть положительным (получено {value})")


def x_validate_positive__mutmut_3(name: str, value: float) -> None:
    if value <= 0:
        raise ValueError(None)

x_validate_positive__mutmut_mutants : ClassVar[MutantDict] = { # type: ignore
'x_validate_positive__mutmut_1': x_validate_positive__mutmut_1, 
    'x_validate_positive__mutmut_2': x_validate_positive__mutmut_2, 
    'x_validate_positive__mutmut_3': x_validate_positive__mutmut_3
}
x_validate_positive__mutmut_orig.__name__ = 'x_validate_positive'


def validate_temperature_range(ambient: float, process: float) -> None:
    args = [ambient, process]# type: ignore
    kwargs = {}# type: ignore
    return _mutmut_trampoline(x_validate_temperature_range__mutmut_orig, x_validate_temperature_range__mutmut_mutants, args, kwargs, None)


def x_validate_temperature_range__mutmut_orig(ambient: float, process: float) -> None:
    if process <= ambient:
        raise ValueError("Температура продукта должна быть выше температуры окружающей среды")


def x_validate_temperature_range__mutmut_1(ambient: float, process: float) -> None:
    if process < ambient:
        raise ValueError("Температура продукта должна быть выше температуры окружающей среды")


def x_validate_temperature_range__mutmut_2(ambient: float, process: float) -> None:
    if process <= ambient:
        raise ValueError(None)


def x_validate_temperature_range__mutmut_3(ambient: float, process: float) -> None:
    if process <= ambient:
        raise ValueError("XXТемпература продукта должна быть выше температуры окружающей средыXX")


def x_validate_temperature_range__mutmut_4(ambient: float, process: float) -> None:
    if process <= ambient:
        raise ValueError("температура продукта должна быть выше температуры окружающей среды")


def x_validate_temperature_range__mutmut_5(ambient: float, process: float) -> None:
    if process <= ambient:
        raise ValueError("ТЕМПЕРАТУРА ПРОДУКТА ДОЛЖНА БЫТЬ ВЫШЕ ТЕМПЕРАТУРЫ ОКРУЖАЮЩЕЙ СРЕДЫ")

x_validate_temperature_range__mutmut_mutants : ClassVar[MutantDict] = { # type: ignore
'x_validate_temperature_range__mutmut_1': x_validate_temperature_range__mutmut_1, 
    'x_validate_temperature_range__mutmut_2': x_validate_temperature_range__mutmut_2, 
    'x_validate_temperature_range__mutmut_3': x_validate_temperature_range__mutmut_3, 
    'x_validate_temperature_range__mutmut_4': x_validate_temperature_range__mutmut_4, 
    'x_validate_temperature_range__mutmut_5': x_validate_temperature_range__mutmut_5
}
x_validate_temperature_range__mutmut_orig.__name__ = 'x_validate_temperature_range'


def location_key(location: str) -> str:
    return f"location_{location}"


def merge_coefficients(
    *sources: dict[str, float] | None,
) -> dict[str, float]:
    args = [*sources]# type: ignore
    kwargs = {}# type: ignore
    return _mutmut_trampoline(x_merge_coefficients__mutmut_orig, x_merge_coefficients__mutmut_mutants, args, kwargs, None)


def x_merge_coefficients__mutmut_orig(
    *sources: dict[str, float] | None,
) -> dict[str, float]:
    merged: dict[str, float] = dict(DEFAULT_COEFFICIENTS)
    for src in sources:
        if src:
            merged.update(src)
    return merged


def x_merge_coefficients__mutmut_1(
    *sources: dict[str, float] | None,
) -> dict[str, float]:
    merged: dict[str, float] = None
    for src in sources:
        if src:
            merged.update(src)
    return merged


def x_merge_coefficients__mutmut_2(
    *sources: dict[str, float] | None,
) -> dict[str, float]:
    merged: dict[str, float] = dict(None)
    for src in sources:
        if src:
            merged.update(src)
    return merged


def x_merge_coefficients__mutmut_3(
    *sources: dict[str, float] | None,
) -> dict[str, float]:
    merged: dict[str, float] = dict(DEFAULT_COEFFICIENTS)
    for src in sources:
        if src:
            merged.update(None)
    return merged

x_merge_coefficients__mutmut_mutants : ClassVar[MutantDict] = { # type: ignore
'x_merge_coefficients__mutmut_1': x_merge_coefficients__mutmut_1, 
    'x_merge_coefficients__mutmut_2': x_merge_coefficients__mutmut_2, 
    'x_merge_coefficients__mutmut_3': x_merge_coefficients__mutmut_3
}
x_merge_coefficients__mutmut_orig.__name__ = 'x_merge_coefficients'


def safe_dict_get(d: dict[str, Any], key: str, default: float | None = None) -> Any:
    args = [d, key, default]# type: ignore
    kwargs = {}# type: ignore
    return _mutmut_trampoline(x_safe_dict_get__mutmut_orig, x_safe_dict_get__mutmut_mutants, args, kwargs, None)


def x_safe_dict_get__mutmut_orig(d: dict[str, Any], key: str, default: float | None = None) -> Any:
    return d.get(key, default)


def x_safe_dict_get__mutmut_1(d: dict[str, Any], key: str, default: float | None = None) -> Any:
    return d.get(None, default)


def x_safe_dict_get__mutmut_2(d: dict[str, Any], key: str, default: float | None = None) -> Any:
    return d.get(key, None)


def x_safe_dict_get__mutmut_3(d: dict[str, Any], key: str, default: float | None = None) -> Any:
    return d.get(default)


def x_safe_dict_get__mutmut_4(d: dict[str, Any], key: str, default: float | None = None) -> Any:
    return d.get(key, )

x_safe_dict_get__mutmut_mutants : ClassVar[MutantDict] = { # type: ignore
'x_safe_dict_get__mutmut_1': x_safe_dict_get__mutmut_1, 
    'x_safe_dict_get__mutmut_2': x_safe_dict_get__mutmut_2, 
    'x_safe_dict_get__mutmut_3': x_safe_dict_get__mutmut_3, 
    'x_safe_dict_get__mutmut_4': x_safe_dict_get__mutmut_4
}
x_safe_dict_get__mutmut_orig.__name__ = 'x_safe_dict_get'
