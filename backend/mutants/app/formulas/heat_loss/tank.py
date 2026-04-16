"""Расчёт теплопотерь ёмкости.

Формула (плоская стенка, источник: ТНП):
  q = ΔT / (δ_р/λ_р + δ_из/λ_из + R_внеш)   [Вт/м²]
  Q = q × S × K                                 [Вт]

R_внеш (воздух):   R = 1 / α_внеш,    α = 11,6 + 7·v  [Вт/(м²·К)]
R_внеш (помещение): R = 1 / 9.0

Подземное расположение (упрощение — только надземная часть):
не реализовано в MVP.
"""

import math
from typing import Any

from app.formulas.heat_loss.common import (
    merge_coefficients,
    validate_positive,
    validate_temperature_range,
)
from app.reference_data.loader import get_insulation_conductivity
from app.schemas.calculation import TankHeatLossParams, TankHeatLossResult
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


def _surface_area(params: TankHeatLossParams) -> float:
    args = [params]# type: ignore
    kwargs = {}# type: ignore
    return _mutmut_trampoline(x__surface_area__mutmut_orig, x__surface_area__mutmut_mutants, args, kwargs, None)


def x__surface_area__mutmut_orig(params: TankHeatLossParams) -> float:
    """Площадь внешней поверхности ёмкости, м².

    Цилиндр:       S = π·d·H + 2·π·(d/2)²   (боковая + 2 крышки)
    Параллелепипед: S = 2·(L·W + L·H + W·H)
    Сфера:         S = π·d²
    """
    if params.shape == "cylindrical":
        if params.diameter is None or params.height is None:
            raise ValueError("Для цилиндра требуются diameter и height")
        d, h = params.diameter, params.height
        return math.pi * d * h + 2 * math.pi * (d / 2) ** 2
    if params.shape == "rectangular":
        if not all([params.length, params.width, params.height]):
            raise ValueError("Для параллелепипеда требуются length, width, height")
        assert params.length and params.width and params.height
        l, w, h = params.length, params.width, params.height
        return 2 * (l * w + l * h + w * h)
    if params.shape == "spherical":
        if params.diameter is None:
            raise ValueError("Для сферы требуется diameter")
        return 4 * math.pi * (params.diameter / 2) ** 2
    raise ValueError(f"Неизвестная форма ёмкости: {params.shape}")


def x__surface_area__mutmut_1(params: TankHeatLossParams) -> float:
    """Площадь внешней поверхности ёмкости, м².

    Цилиндр:       S = π·d·H + 2·π·(d/2)²   (боковая + 2 крышки)
    Параллелепипед: S = 2·(L·W + L·H + W·H)
    Сфера:         S = π·d²
    """
    if params.shape != "cylindrical":
        if params.diameter is None or params.height is None:
            raise ValueError("Для цилиндра требуются diameter и height")
        d, h = params.diameter, params.height
        return math.pi * d * h + 2 * math.pi * (d / 2) ** 2
    if params.shape == "rectangular":
        if not all([params.length, params.width, params.height]):
            raise ValueError("Для параллелепипеда требуются length, width, height")
        assert params.length and params.width and params.height
        l, w, h = params.length, params.width, params.height
        return 2 * (l * w + l * h + w * h)
    if params.shape == "spherical":
        if params.diameter is None:
            raise ValueError("Для сферы требуется diameter")
        return 4 * math.pi * (params.diameter / 2) ** 2
    raise ValueError(f"Неизвестная форма ёмкости: {params.shape}")


def x__surface_area__mutmut_2(params: TankHeatLossParams) -> float:
    """Площадь внешней поверхности ёмкости, м².

    Цилиндр:       S = π·d·H + 2·π·(d/2)²   (боковая + 2 крышки)
    Параллелепипед: S = 2·(L·W + L·H + W·H)
    Сфера:         S = π·d²
    """
    if params.shape == "XXcylindricalXX":
        if params.diameter is None or params.height is None:
            raise ValueError("Для цилиндра требуются diameter и height")
        d, h = params.diameter, params.height
        return math.pi * d * h + 2 * math.pi * (d / 2) ** 2
    if params.shape == "rectangular":
        if not all([params.length, params.width, params.height]):
            raise ValueError("Для параллелепипеда требуются length, width, height")
        assert params.length and params.width and params.height
        l, w, h = params.length, params.width, params.height
        return 2 * (l * w + l * h + w * h)
    if params.shape == "spherical":
        if params.diameter is None:
            raise ValueError("Для сферы требуется diameter")
        return 4 * math.pi * (params.diameter / 2) ** 2
    raise ValueError(f"Неизвестная форма ёмкости: {params.shape}")


def x__surface_area__mutmut_3(params: TankHeatLossParams) -> float:
    """Площадь внешней поверхности ёмкости, м².

    Цилиндр:       S = π·d·H + 2·π·(d/2)²   (боковая + 2 крышки)
    Параллелепипед: S = 2·(L·W + L·H + W·H)
    Сфера:         S = π·d²
    """
    if params.shape == "CYLINDRICAL":
        if params.diameter is None or params.height is None:
            raise ValueError("Для цилиндра требуются diameter и height")
        d, h = params.diameter, params.height
        return math.pi * d * h + 2 * math.pi * (d / 2) ** 2
    if params.shape == "rectangular":
        if not all([params.length, params.width, params.height]):
            raise ValueError("Для параллелепипеда требуются length, width, height")
        assert params.length and params.width and params.height
        l, w, h = params.length, params.width, params.height
        return 2 * (l * w + l * h + w * h)
    if params.shape == "spherical":
        if params.diameter is None:
            raise ValueError("Для сферы требуется diameter")
        return 4 * math.pi * (params.diameter / 2) ** 2
    raise ValueError(f"Неизвестная форма ёмкости: {params.shape}")


def x__surface_area__mutmut_4(params: TankHeatLossParams) -> float:
    """Площадь внешней поверхности ёмкости, м².

    Цилиндр:       S = π·d·H + 2·π·(d/2)²   (боковая + 2 крышки)
    Параллелепипед: S = 2·(L·W + L·H + W·H)
    Сфера:         S = π·d²
    """
    if params.shape == "cylindrical":
        if params.diameter is None and params.height is None:
            raise ValueError("Для цилиндра требуются diameter и height")
        d, h = params.diameter, params.height
        return math.pi * d * h + 2 * math.pi * (d / 2) ** 2
    if params.shape == "rectangular":
        if not all([params.length, params.width, params.height]):
            raise ValueError("Для параллелепипеда требуются length, width, height")
        assert params.length and params.width and params.height
        l, w, h = params.length, params.width, params.height
        return 2 * (l * w + l * h + w * h)
    if params.shape == "spherical":
        if params.diameter is None:
            raise ValueError("Для сферы требуется diameter")
        return 4 * math.pi * (params.diameter / 2) ** 2
    raise ValueError(f"Неизвестная форма ёмкости: {params.shape}")


def x__surface_area__mutmut_5(params: TankHeatLossParams) -> float:
    """Площадь внешней поверхности ёмкости, м².

    Цилиндр:       S = π·d·H + 2·π·(d/2)²   (боковая + 2 крышки)
    Параллелепипед: S = 2·(L·W + L·H + W·H)
    Сфера:         S = π·d²
    """
    if params.shape == "cylindrical":
        if params.diameter is not None or params.height is None:
            raise ValueError("Для цилиндра требуются diameter и height")
        d, h = params.diameter, params.height
        return math.pi * d * h + 2 * math.pi * (d / 2) ** 2
    if params.shape == "rectangular":
        if not all([params.length, params.width, params.height]):
            raise ValueError("Для параллелепипеда требуются length, width, height")
        assert params.length and params.width and params.height
        l, w, h = params.length, params.width, params.height
        return 2 * (l * w + l * h + w * h)
    if params.shape == "spherical":
        if params.diameter is None:
            raise ValueError("Для сферы требуется diameter")
        return 4 * math.pi * (params.diameter / 2) ** 2
    raise ValueError(f"Неизвестная форма ёмкости: {params.shape}")


def x__surface_area__mutmut_6(params: TankHeatLossParams) -> float:
    """Площадь внешней поверхности ёмкости, м².

    Цилиндр:       S = π·d·H + 2·π·(d/2)²   (боковая + 2 крышки)
    Параллелепипед: S = 2·(L·W + L·H + W·H)
    Сфера:         S = π·d²
    """
    if params.shape == "cylindrical":
        if params.diameter is None or params.height is not None:
            raise ValueError("Для цилиндра требуются diameter и height")
        d, h = params.diameter, params.height
        return math.pi * d * h + 2 * math.pi * (d / 2) ** 2
    if params.shape == "rectangular":
        if not all([params.length, params.width, params.height]):
            raise ValueError("Для параллелепипеда требуются length, width, height")
        assert params.length and params.width and params.height
        l, w, h = params.length, params.width, params.height
        return 2 * (l * w + l * h + w * h)
    if params.shape == "spherical":
        if params.diameter is None:
            raise ValueError("Для сферы требуется diameter")
        return 4 * math.pi * (params.diameter / 2) ** 2
    raise ValueError(f"Неизвестная форма ёмкости: {params.shape}")


def x__surface_area__mutmut_7(params: TankHeatLossParams) -> float:
    """Площадь внешней поверхности ёмкости, м².

    Цилиндр:       S = π·d·H + 2·π·(d/2)²   (боковая + 2 крышки)
    Параллелепипед: S = 2·(L·W + L·H + W·H)
    Сфера:         S = π·d²
    """
    if params.shape == "cylindrical":
        if params.diameter is None or params.height is None:
            raise ValueError(None)
        d, h = params.diameter, params.height
        return math.pi * d * h + 2 * math.pi * (d / 2) ** 2
    if params.shape == "rectangular":
        if not all([params.length, params.width, params.height]):
            raise ValueError("Для параллелепипеда требуются length, width, height")
        assert params.length and params.width and params.height
        l, w, h = params.length, params.width, params.height
        return 2 * (l * w + l * h + w * h)
    if params.shape == "spherical":
        if params.diameter is None:
            raise ValueError("Для сферы требуется diameter")
        return 4 * math.pi * (params.diameter / 2) ** 2
    raise ValueError(f"Неизвестная форма ёмкости: {params.shape}")


def x__surface_area__mutmut_8(params: TankHeatLossParams) -> float:
    """Площадь внешней поверхности ёмкости, м².

    Цилиндр:       S = π·d·H + 2·π·(d/2)²   (боковая + 2 крышки)
    Параллелепипед: S = 2·(L·W + L·H + W·H)
    Сфера:         S = π·d²
    """
    if params.shape == "cylindrical":
        if params.diameter is None or params.height is None:
            raise ValueError("XXДля цилиндра требуются diameter и heightXX")
        d, h = params.diameter, params.height
        return math.pi * d * h + 2 * math.pi * (d / 2) ** 2
    if params.shape == "rectangular":
        if not all([params.length, params.width, params.height]):
            raise ValueError("Для параллелепипеда требуются length, width, height")
        assert params.length and params.width and params.height
        l, w, h = params.length, params.width, params.height
        return 2 * (l * w + l * h + w * h)
    if params.shape == "spherical":
        if params.diameter is None:
            raise ValueError("Для сферы требуется diameter")
        return 4 * math.pi * (params.diameter / 2) ** 2
    raise ValueError(f"Неизвестная форма ёмкости: {params.shape}")


def x__surface_area__mutmut_9(params: TankHeatLossParams) -> float:
    """Площадь внешней поверхности ёмкости, м².

    Цилиндр:       S = π·d·H + 2·π·(d/2)²   (боковая + 2 крышки)
    Параллелепипед: S = 2·(L·W + L·H + W·H)
    Сфера:         S = π·d²
    """
    if params.shape == "cylindrical":
        if params.diameter is None or params.height is None:
            raise ValueError("для цилиндра требуются diameter и height")
        d, h = params.diameter, params.height
        return math.pi * d * h + 2 * math.pi * (d / 2) ** 2
    if params.shape == "rectangular":
        if not all([params.length, params.width, params.height]):
            raise ValueError("Для параллелепипеда требуются length, width, height")
        assert params.length and params.width and params.height
        l, w, h = params.length, params.width, params.height
        return 2 * (l * w + l * h + w * h)
    if params.shape == "spherical":
        if params.diameter is None:
            raise ValueError("Для сферы требуется diameter")
        return 4 * math.pi * (params.diameter / 2) ** 2
    raise ValueError(f"Неизвестная форма ёмкости: {params.shape}")


def x__surface_area__mutmut_10(params: TankHeatLossParams) -> float:
    """Площадь внешней поверхности ёмкости, м².

    Цилиндр:       S = π·d·H + 2·π·(d/2)²   (боковая + 2 крышки)
    Параллелепипед: S = 2·(L·W + L·H + W·H)
    Сфера:         S = π·d²
    """
    if params.shape == "cylindrical":
        if params.diameter is None or params.height is None:
            raise ValueError("ДЛЯ ЦИЛИНДРА ТРЕБУЮТСЯ DIAMETER И HEIGHT")
        d, h = params.diameter, params.height
        return math.pi * d * h + 2 * math.pi * (d / 2) ** 2
    if params.shape == "rectangular":
        if not all([params.length, params.width, params.height]):
            raise ValueError("Для параллелепипеда требуются length, width, height")
        assert params.length and params.width and params.height
        l, w, h = params.length, params.width, params.height
        return 2 * (l * w + l * h + w * h)
    if params.shape == "spherical":
        if params.diameter is None:
            raise ValueError("Для сферы требуется diameter")
        return 4 * math.pi * (params.diameter / 2) ** 2
    raise ValueError(f"Неизвестная форма ёмкости: {params.shape}")


def x__surface_area__mutmut_11(params: TankHeatLossParams) -> float:
    """Площадь внешней поверхности ёмкости, м².

    Цилиндр:       S = π·d·H + 2·π·(d/2)²   (боковая + 2 крышки)
    Параллелепипед: S = 2·(L·W + L·H + W·H)
    Сфера:         S = π·d²
    """
    if params.shape == "cylindrical":
        if params.diameter is None or params.height is None:
            raise ValueError("Для цилиндра требуются diameter и height")
        d, h = None
        return math.pi * d * h + 2 * math.pi * (d / 2) ** 2
    if params.shape == "rectangular":
        if not all([params.length, params.width, params.height]):
            raise ValueError("Для параллелепипеда требуются length, width, height")
        assert params.length and params.width and params.height
        l, w, h = params.length, params.width, params.height
        return 2 * (l * w + l * h + w * h)
    if params.shape == "spherical":
        if params.diameter is None:
            raise ValueError("Для сферы требуется diameter")
        return 4 * math.pi * (params.diameter / 2) ** 2
    raise ValueError(f"Неизвестная форма ёмкости: {params.shape}")


def x__surface_area__mutmut_12(params: TankHeatLossParams) -> float:
    """Площадь внешней поверхности ёмкости, м².

    Цилиндр:       S = π·d·H + 2·π·(d/2)²   (боковая + 2 крышки)
    Параллелепипед: S = 2·(L·W + L·H + W·H)
    Сфера:         S = π·d²
    """
    if params.shape == "cylindrical":
        if params.diameter is None or params.height is None:
            raise ValueError("Для цилиндра требуются diameter и height")
        d, h = params.diameter, params.height
        return math.pi * d * h - 2 * math.pi * (d / 2) ** 2
    if params.shape == "rectangular":
        if not all([params.length, params.width, params.height]):
            raise ValueError("Для параллелепипеда требуются length, width, height")
        assert params.length and params.width and params.height
        l, w, h = params.length, params.width, params.height
        return 2 * (l * w + l * h + w * h)
    if params.shape == "spherical":
        if params.diameter is None:
            raise ValueError("Для сферы требуется diameter")
        return 4 * math.pi * (params.diameter / 2) ** 2
    raise ValueError(f"Неизвестная форма ёмкости: {params.shape}")


def x__surface_area__mutmut_13(params: TankHeatLossParams) -> float:
    """Площадь внешней поверхности ёмкости, м².

    Цилиндр:       S = π·d·H + 2·π·(d/2)²   (боковая + 2 крышки)
    Параллелепипед: S = 2·(L·W + L·H + W·H)
    Сфера:         S = π·d²
    """
    if params.shape == "cylindrical":
        if params.diameter is None or params.height is None:
            raise ValueError("Для цилиндра требуются diameter и height")
        d, h = params.diameter, params.height
        return math.pi * d / h + 2 * math.pi * (d / 2) ** 2
    if params.shape == "rectangular":
        if not all([params.length, params.width, params.height]):
            raise ValueError("Для параллелепипеда требуются length, width, height")
        assert params.length and params.width and params.height
        l, w, h = params.length, params.width, params.height
        return 2 * (l * w + l * h + w * h)
    if params.shape == "spherical":
        if params.diameter is None:
            raise ValueError("Для сферы требуется diameter")
        return 4 * math.pi * (params.diameter / 2) ** 2
    raise ValueError(f"Неизвестная форма ёмкости: {params.shape}")


def x__surface_area__mutmut_14(params: TankHeatLossParams) -> float:
    """Площадь внешней поверхности ёмкости, м².

    Цилиндр:       S = π·d·H + 2·π·(d/2)²   (боковая + 2 крышки)
    Параллелепипед: S = 2·(L·W + L·H + W·H)
    Сфера:         S = π·d²
    """
    if params.shape == "cylindrical":
        if params.diameter is None or params.height is None:
            raise ValueError("Для цилиндра требуются diameter и height")
        d, h = params.diameter, params.height
        return math.pi / d * h + 2 * math.pi * (d / 2) ** 2
    if params.shape == "rectangular":
        if not all([params.length, params.width, params.height]):
            raise ValueError("Для параллелепипеда требуются length, width, height")
        assert params.length and params.width and params.height
        l, w, h = params.length, params.width, params.height
        return 2 * (l * w + l * h + w * h)
    if params.shape == "spherical":
        if params.diameter is None:
            raise ValueError("Для сферы требуется diameter")
        return 4 * math.pi * (params.diameter / 2) ** 2
    raise ValueError(f"Неизвестная форма ёмкости: {params.shape}")


def x__surface_area__mutmut_15(params: TankHeatLossParams) -> float:
    """Площадь внешней поверхности ёмкости, м².

    Цилиндр:       S = π·d·H + 2·π·(d/2)²   (боковая + 2 крышки)
    Параллелепипед: S = 2·(L·W + L·H + W·H)
    Сфера:         S = π·d²
    """
    if params.shape == "cylindrical":
        if params.diameter is None or params.height is None:
            raise ValueError("Для цилиндра требуются diameter и height")
        d, h = params.diameter, params.height
        return math.pi * d * h + 2 * math.pi / (d / 2) ** 2
    if params.shape == "rectangular":
        if not all([params.length, params.width, params.height]):
            raise ValueError("Для параллелепипеда требуются length, width, height")
        assert params.length and params.width and params.height
        l, w, h = params.length, params.width, params.height
        return 2 * (l * w + l * h + w * h)
    if params.shape == "spherical":
        if params.diameter is None:
            raise ValueError("Для сферы требуется diameter")
        return 4 * math.pi * (params.diameter / 2) ** 2
    raise ValueError(f"Неизвестная форма ёмкости: {params.shape}")


def x__surface_area__mutmut_16(params: TankHeatLossParams) -> float:
    """Площадь внешней поверхности ёмкости, м².

    Цилиндр:       S = π·d·H + 2·π·(d/2)²   (боковая + 2 крышки)
    Параллелепипед: S = 2·(L·W + L·H + W·H)
    Сфера:         S = π·d²
    """
    if params.shape == "cylindrical":
        if params.diameter is None or params.height is None:
            raise ValueError("Для цилиндра требуются diameter и height")
        d, h = params.diameter, params.height
        return math.pi * d * h + 2 / math.pi * (d / 2) ** 2
    if params.shape == "rectangular":
        if not all([params.length, params.width, params.height]):
            raise ValueError("Для параллелепипеда требуются length, width, height")
        assert params.length and params.width and params.height
        l, w, h = params.length, params.width, params.height
        return 2 * (l * w + l * h + w * h)
    if params.shape == "spherical":
        if params.diameter is None:
            raise ValueError("Для сферы требуется diameter")
        return 4 * math.pi * (params.diameter / 2) ** 2
    raise ValueError(f"Неизвестная форма ёмкости: {params.shape}")


def x__surface_area__mutmut_17(params: TankHeatLossParams) -> float:
    """Площадь внешней поверхности ёмкости, м².

    Цилиндр:       S = π·d·H + 2·π·(d/2)²   (боковая + 2 крышки)
    Параллелепипед: S = 2·(L·W + L·H + W·H)
    Сфера:         S = π·d²
    """
    if params.shape == "cylindrical":
        if params.diameter is None or params.height is None:
            raise ValueError("Для цилиндра требуются diameter и height")
        d, h = params.diameter, params.height
        return math.pi * d * h + 3 * math.pi * (d / 2) ** 2
    if params.shape == "rectangular":
        if not all([params.length, params.width, params.height]):
            raise ValueError("Для параллелепипеда требуются length, width, height")
        assert params.length and params.width and params.height
        l, w, h = params.length, params.width, params.height
        return 2 * (l * w + l * h + w * h)
    if params.shape == "spherical":
        if params.diameter is None:
            raise ValueError("Для сферы требуется diameter")
        return 4 * math.pi * (params.diameter / 2) ** 2
    raise ValueError(f"Неизвестная форма ёмкости: {params.shape}")


def x__surface_area__mutmut_18(params: TankHeatLossParams) -> float:
    """Площадь внешней поверхности ёмкости, м².

    Цилиндр:       S = π·d·H + 2·π·(d/2)²   (боковая + 2 крышки)
    Параллелепипед: S = 2·(L·W + L·H + W·H)
    Сфера:         S = π·d²
    """
    if params.shape == "cylindrical":
        if params.diameter is None or params.height is None:
            raise ValueError("Для цилиндра требуются diameter и height")
        d, h = params.diameter, params.height
        return math.pi * d * h + 2 * math.pi * (d / 2) * 2
    if params.shape == "rectangular":
        if not all([params.length, params.width, params.height]):
            raise ValueError("Для параллелепипеда требуются length, width, height")
        assert params.length and params.width and params.height
        l, w, h = params.length, params.width, params.height
        return 2 * (l * w + l * h + w * h)
    if params.shape == "spherical":
        if params.diameter is None:
            raise ValueError("Для сферы требуется diameter")
        return 4 * math.pi * (params.diameter / 2) ** 2
    raise ValueError(f"Неизвестная форма ёмкости: {params.shape}")


def x__surface_area__mutmut_19(params: TankHeatLossParams) -> float:
    """Площадь внешней поверхности ёмкости, м².

    Цилиндр:       S = π·d·H + 2·π·(d/2)²   (боковая + 2 крышки)
    Параллелепипед: S = 2·(L·W + L·H + W·H)
    Сфера:         S = π·d²
    """
    if params.shape == "cylindrical":
        if params.diameter is None or params.height is None:
            raise ValueError("Для цилиндра требуются diameter и height")
        d, h = params.diameter, params.height
        return math.pi * d * h + 2 * math.pi * (d * 2) ** 2
    if params.shape == "rectangular":
        if not all([params.length, params.width, params.height]):
            raise ValueError("Для параллелепипеда требуются length, width, height")
        assert params.length and params.width and params.height
        l, w, h = params.length, params.width, params.height
        return 2 * (l * w + l * h + w * h)
    if params.shape == "spherical":
        if params.diameter is None:
            raise ValueError("Для сферы требуется diameter")
        return 4 * math.pi * (params.diameter / 2) ** 2
    raise ValueError(f"Неизвестная форма ёмкости: {params.shape}")


def x__surface_area__mutmut_20(params: TankHeatLossParams) -> float:
    """Площадь внешней поверхности ёмкости, м².

    Цилиндр:       S = π·d·H + 2·π·(d/2)²   (боковая + 2 крышки)
    Параллелепипед: S = 2·(L·W + L·H + W·H)
    Сфера:         S = π·d²
    """
    if params.shape == "cylindrical":
        if params.diameter is None or params.height is None:
            raise ValueError("Для цилиндра требуются diameter и height")
        d, h = params.diameter, params.height
        return math.pi * d * h + 2 * math.pi * (d / 3) ** 2
    if params.shape == "rectangular":
        if not all([params.length, params.width, params.height]):
            raise ValueError("Для параллелепипеда требуются length, width, height")
        assert params.length and params.width and params.height
        l, w, h = params.length, params.width, params.height
        return 2 * (l * w + l * h + w * h)
    if params.shape == "spherical":
        if params.diameter is None:
            raise ValueError("Для сферы требуется diameter")
        return 4 * math.pi * (params.diameter / 2) ** 2
    raise ValueError(f"Неизвестная форма ёмкости: {params.shape}")


def x__surface_area__mutmut_21(params: TankHeatLossParams) -> float:
    """Площадь внешней поверхности ёмкости, м².

    Цилиндр:       S = π·d·H + 2·π·(d/2)²   (боковая + 2 крышки)
    Параллелепипед: S = 2·(L·W + L·H + W·H)
    Сфера:         S = π·d²
    """
    if params.shape == "cylindrical":
        if params.diameter is None or params.height is None:
            raise ValueError("Для цилиндра требуются diameter и height")
        d, h = params.diameter, params.height
        return math.pi * d * h + 2 * math.pi * (d / 2) ** 3
    if params.shape == "rectangular":
        if not all([params.length, params.width, params.height]):
            raise ValueError("Для параллелепипеда требуются length, width, height")
        assert params.length and params.width and params.height
        l, w, h = params.length, params.width, params.height
        return 2 * (l * w + l * h + w * h)
    if params.shape == "spherical":
        if params.diameter is None:
            raise ValueError("Для сферы требуется diameter")
        return 4 * math.pi * (params.diameter / 2) ** 2
    raise ValueError(f"Неизвестная форма ёмкости: {params.shape}")


def x__surface_area__mutmut_22(params: TankHeatLossParams) -> float:
    """Площадь внешней поверхности ёмкости, м².

    Цилиндр:       S = π·d·H + 2·π·(d/2)²   (боковая + 2 крышки)
    Параллелепипед: S = 2·(L·W + L·H + W·H)
    Сфера:         S = π·d²
    """
    if params.shape == "cylindrical":
        if params.diameter is None or params.height is None:
            raise ValueError("Для цилиндра требуются diameter и height")
        d, h = params.diameter, params.height
        return math.pi * d * h + 2 * math.pi * (d / 2) ** 2
    if params.shape != "rectangular":
        if not all([params.length, params.width, params.height]):
            raise ValueError("Для параллелепипеда требуются length, width, height")
        assert params.length and params.width and params.height
        l, w, h = params.length, params.width, params.height
        return 2 * (l * w + l * h + w * h)
    if params.shape == "spherical":
        if params.diameter is None:
            raise ValueError("Для сферы требуется diameter")
        return 4 * math.pi * (params.diameter / 2) ** 2
    raise ValueError(f"Неизвестная форма ёмкости: {params.shape}")


def x__surface_area__mutmut_23(params: TankHeatLossParams) -> float:
    """Площадь внешней поверхности ёмкости, м².

    Цилиндр:       S = π·d·H + 2·π·(d/2)²   (боковая + 2 крышки)
    Параллелепипед: S = 2·(L·W + L·H + W·H)
    Сфера:         S = π·d²
    """
    if params.shape == "cylindrical":
        if params.diameter is None or params.height is None:
            raise ValueError("Для цилиндра требуются diameter и height")
        d, h = params.diameter, params.height
        return math.pi * d * h + 2 * math.pi * (d / 2) ** 2
    if params.shape == "XXrectangularXX":
        if not all([params.length, params.width, params.height]):
            raise ValueError("Для параллелепипеда требуются length, width, height")
        assert params.length and params.width and params.height
        l, w, h = params.length, params.width, params.height
        return 2 * (l * w + l * h + w * h)
    if params.shape == "spherical":
        if params.diameter is None:
            raise ValueError("Для сферы требуется diameter")
        return 4 * math.pi * (params.diameter / 2) ** 2
    raise ValueError(f"Неизвестная форма ёмкости: {params.shape}")


def x__surface_area__mutmut_24(params: TankHeatLossParams) -> float:
    """Площадь внешней поверхности ёмкости, м².

    Цилиндр:       S = π·d·H + 2·π·(d/2)²   (боковая + 2 крышки)
    Параллелепипед: S = 2·(L·W + L·H + W·H)
    Сфера:         S = π·d²
    """
    if params.shape == "cylindrical":
        if params.diameter is None or params.height is None:
            raise ValueError("Для цилиндра требуются diameter и height")
        d, h = params.diameter, params.height
        return math.pi * d * h + 2 * math.pi * (d / 2) ** 2
    if params.shape == "RECTANGULAR":
        if not all([params.length, params.width, params.height]):
            raise ValueError("Для параллелепипеда требуются length, width, height")
        assert params.length and params.width and params.height
        l, w, h = params.length, params.width, params.height
        return 2 * (l * w + l * h + w * h)
    if params.shape == "spherical":
        if params.diameter is None:
            raise ValueError("Для сферы требуется diameter")
        return 4 * math.pi * (params.diameter / 2) ** 2
    raise ValueError(f"Неизвестная форма ёмкости: {params.shape}")


def x__surface_area__mutmut_25(params: TankHeatLossParams) -> float:
    """Площадь внешней поверхности ёмкости, м².

    Цилиндр:       S = π·d·H + 2·π·(d/2)²   (боковая + 2 крышки)
    Параллелепипед: S = 2·(L·W + L·H + W·H)
    Сфера:         S = π·d²
    """
    if params.shape == "cylindrical":
        if params.diameter is None or params.height is None:
            raise ValueError("Для цилиндра требуются diameter и height")
        d, h = params.diameter, params.height
        return math.pi * d * h + 2 * math.pi * (d / 2) ** 2
    if params.shape == "rectangular":
        if all([params.length, params.width, params.height]):
            raise ValueError("Для параллелепипеда требуются length, width, height")
        assert params.length and params.width and params.height
        l, w, h = params.length, params.width, params.height
        return 2 * (l * w + l * h + w * h)
    if params.shape == "spherical":
        if params.diameter is None:
            raise ValueError("Для сферы требуется diameter")
        return 4 * math.pi * (params.diameter / 2) ** 2
    raise ValueError(f"Неизвестная форма ёмкости: {params.shape}")


def x__surface_area__mutmut_26(params: TankHeatLossParams) -> float:
    """Площадь внешней поверхности ёмкости, м².

    Цилиндр:       S = π·d·H + 2·π·(d/2)²   (боковая + 2 крышки)
    Параллелепипед: S = 2·(L·W + L·H + W·H)
    Сфера:         S = π·d²
    """
    if params.shape == "cylindrical":
        if params.diameter is None or params.height is None:
            raise ValueError("Для цилиндра требуются diameter и height")
        d, h = params.diameter, params.height
        return math.pi * d * h + 2 * math.pi * (d / 2) ** 2
    if params.shape == "rectangular":
        if not all(None):
            raise ValueError("Для параллелепипеда требуются length, width, height")
        assert params.length and params.width and params.height
        l, w, h = params.length, params.width, params.height
        return 2 * (l * w + l * h + w * h)
    if params.shape == "spherical":
        if params.diameter is None:
            raise ValueError("Для сферы требуется diameter")
        return 4 * math.pi * (params.diameter / 2) ** 2
    raise ValueError(f"Неизвестная форма ёмкости: {params.shape}")


def x__surface_area__mutmut_27(params: TankHeatLossParams) -> float:
    """Площадь внешней поверхности ёмкости, м².

    Цилиндр:       S = π·d·H + 2·π·(d/2)²   (боковая + 2 крышки)
    Параллелепипед: S = 2·(L·W + L·H + W·H)
    Сфера:         S = π·d²
    """
    if params.shape == "cylindrical":
        if params.diameter is None or params.height is None:
            raise ValueError("Для цилиндра требуются diameter и height")
        d, h = params.diameter, params.height
        return math.pi * d * h + 2 * math.pi * (d / 2) ** 2
    if params.shape == "rectangular":
        if not all([params.length, params.width, params.height]):
            raise ValueError(None)
        assert params.length and params.width and params.height
        l, w, h = params.length, params.width, params.height
        return 2 * (l * w + l * h + w * h)
    if params.shape == "spherical":
        if params.diameter is None:
            raise ValueError("Для сферы требуется diameter")
        return 4 * math.pi * (params.diameter / 2) ** 2
    raise ValueError(f"Неизвестная форма ёмкости: {params.shape}")


def x__surface_area__mutmut_28(params: TankHeatLossParams) -> float:
    """Площадь внешней поверхности ёмкости, м².

    Цилиндр:       S = π·d·H + 2·π·(d/2)²   (боковая + 2 крышки)
    Параллелепипед: S = 2·(L·W + L·H + W·H)
    Сфера:         S = π·d²
    """
    if params.shape == "cylindrical":
        if params.diameter is None or params.height is None:
            raise ValueError("Для цилиндра требуются diameter и height")
        d, h = params.diameter, params.height
        return math.pi * d * h + 2 * math.pi * (d / 2) ** 2
    if params.shape == "rectangular":
        if not all([params.length, params.width, params.height]):
            raise ValueError("XXДля параллелепипеда требуются length, width, heightXX")
        assert params.length and params.width and params.height
        l, w, h = params.length, params.width, params.height
        return 2 * (l * w + l * h + w * h)
    if params.shape == "spherical":
        if params.diameter is None:
            raise ValueError("Для сферы требуется diameter")
        return 4 * math.pi * (params.diameter / 2) ** 2
    raise ValueError(f"Неизвестная форма ёмкости: {params.shape}")


def x__surface_area__mutmut_29(params: TankHeatLossParams) -> float:
    """Площадь внешней поверхности ёмкости, м².

    Цилиндр:       S = π·d·H + 2·π·(d/2)²   (боковая + 2 крышки)
    Параллелепипед: S = 2·(L·W + L·H + W·H)
    Сфера:         S = π·d²
    """
    if params.shape == "cylindrical":
        if params.diameter is None or params.height is None:
            raise ValueError("Для цилиндра требуются diameter и height")
        d, h = params.diameter, params.height
        return math.pi * d * h + 2 * math.pi * (d / 2) ** 2
    if params.shape == "rectangular":
        if not all([params.length, params.width, params.height]):
            raise ValueError("для параллелепипеда требуются length, width, height")
        assert params.length and params.width and params.height
        l, w, h = params.length, params.width, params.height
        return 2 * (l * w + l * h + w * h)
    if params.shape == "spherical":
        if params.diameter is None:
            raise ValueError("Для сферы требуется diameter")
        return 4 * math.pi * (params.diameter / 2) ** 2
    raise ValueError(f"Неизвестная форма ёмкости: {params.shape}")


def x__surface_area__mutmut_30(params: TankHeatLossParams) -> float:
    """Площадь внешней поверхности ёмкости, м².

    Цилиндр:       S = π·d·H + 2·π·(d/2)²   (боковая + 2 крышки)
    Параллелепипед: S = 2·(L·W + L·H + W·H)
    Сфера:         S = π·d²
    """
    if params.shape == "cylindrical":
        if params.diameter is None or params.height is None:
            raise ValueError("Для цилиндра требуются diameter и height")
        d, h = params.diameter, params.height
        return math.pi * d * h + 2 * math.pi * (d / 2) ** 2
    if params.shape == "rectangular":
        if not all([params.length, params.width, params.height]):
            raise ValueError("ДЛЯ ПАРАЛЛЕЛЕПИПЕДА ТРЕБУЮТСЯ LENGTH, WIDTH, HEIGHT")
        assert params.length and params.width and params.height
        l, w, h = params.length, params.width, params.height
        return 2 * (l * w + l * h + w * h)
    if params.shape == "spherical":
        if params.diameter is None:
            raise ValueError("Для сферы требуется diameter")
        return 4 * math.pi * (params.diameter / 2) ** 2
    raise ValueError(f"Неизвестная форма ёмкости: {params.shape}")


def x__surface_area__mutmut_31(params: TankHeatLossParams) -> float:
    """Площадь внешней поверхности ёмкости, м².

    Цилиндр:       S = π·d·H + 2·π·(d/2)²   (боковая + 2 крышки)
    Параллелепипед: S = 2·(L·W + L·H + W·H)
    Сфера:         S = π·d²
    """
    if params.shape == "cylindrical":
        if params.diameter is None or params.height is None:
            raise ValueError("Для цилиндра требуются diameter и height")
        d, h = params.diameter, params.height
        return math.pi * d * h + 2 * math.pi * (d / 2) ** 2
    if params.shape == "rectangular":
        if not all([params.length, params.width, params.height]):
            raise ValueError("Для параллелепипеда требуются length, width, height")
        assert params.length and params.width or params.height
        l, w, h = params.length, params.width, params.height
        return 2 * (l * w + l * h + w * h)
    if params.shape == "spherical":
        if params.diameter is None:
            raise ValueError("Для сферы требуется diameter")
        return 4 * math.pi * (params.diameter / 2) ** 2
    raise ValueError(f"Неизвестная форма ёмкости: {params.shape}")


def x__surface_area__mutmut_32(params: TankHeatLossParams) -> float:
    """Площадь внешней поверхности ёмкости, м².

    Цилиндр:       S = π·d·H + 2·π·(d/2)²   (боковая + 2 крышки)
    Параллелепипед: S = 2·(L·W + L·H + W·H)
    Сфера:         S = π·d²
    """
    if params.shape == "cylindrical":
        if params.diameter is None or params.height is None:
            raise ValueError("Для цилиндра требуются diameter и height")
        d, h = params.diameter, params.height
        return math.pi * d * h + 2 * math.pi * (d / 2) ** 2
    if params.shape == "rectangular":
        if not all([params.length, params.width, params.height]):
            raise ValueError("Для параллелепипеда требуются length, width, height")
        assert params.length or params.width and params.height
        l, w, h = params.length, params.width, params.height
        return 2 * (l * w + l * h + w * h)
    if params.shape == "spherical":
        if params.diameter is None:
            raise ValueError("Для сферы требуется diameter")
        return 4 * math.pi * (params.diameter / 2) ** 2
    raise ValueError(f"Неизвестная форма ёмкости: {params.shape}")


def x__surface_area__mutmut_33(params: TankHeatLossParams) -> float:
    """Площадь внешней поверхности ёмкости, м².

    Цилиндр:       S = π·d·H + 2·π·(d/2)²   (боковая + 2 крышки)
    Параллелепипед: S = 2·(L·W + L·H + W·H)
    Сфера:         S = π·d²
    """
    if params.shape == "cylindrical":
        if params.diameter is None or params.height is None:
            raise ValueError("Для цилиндра требуются diameter и height")
        d, h = params.diameter, params.height
        return math.pi * d * h + 2 * math.pi * (d / 2) ** 2
    if params.shape == "rectangular":
        if not all([params.length, params.width, params.height]):
            raise ValueError("Для параллелепипеда требуются length, width, height")
        assert params.length and params.width and params.height
        l, w, h = None
        return 2 * (l * w + l * h + w * h)
    if params.shape == "spherical":
        if params.diameter is None:
            raise ValueError("Для сферы требуется diameter")
        return 4 * math.pi * (params.diameter / 2) ** 2
    raise ValueError(f"Неизвестная форма ёмкости: {params.shape}")


def x__surface_area__mutmut_34(params: TankHeatLossParams) -> float:
    """Площадь внешней поверхности ёмкости, м².

    Цилиндр:       S = π·d·H + 2·π·(d/2)²   (боковая + 2 крышки)
    Параллелепипед: S = 2·(L·W + L·H + W·H)
    Сфера:         S = π·d²
    """
    if params.shape == "cylindrical":
        if params.diameter is None or params.height is None:
            raise ValueError("Для цилиндра требуются diameter и height")
        d, h = params.diameter, params.height
        return math.pi * d * h + 2 * math.pi * (d / 2) ** 2
    if params.shape == "rectangular":
        if not all([params.length, params.width, params.height]):
            raise ValueError("Для параллелепипеда требуются length, width, height")
        assert params.length and params.width and params.height
        l, w, h = params.length, params.width, params.height
        return 2 / (l * w + l * h + w * h)
    if params.shape == "spherical":
        if params.diameter is None:
            raise ValueError("Для сферы требуется diameter")
        return 4 * math.pi * (params.diameter / 2) ** 2
    raise ValueError(f"Неизвестная форма ёмкости: {params.shape}")


def x__surface_area__mutmut_35(params: TankHeatLossParams) -> float:
    """Площадь внешней поверхности ёмкости, м².

    Цилиндр:       S = π·d·H + 2·π·(d/2)²   (боковая + 2 крышки)
    Параллелепипед: S = 2·(L·W + L·H + W·H)
    Сфера:         S = π·d²
    """
    if params.shape == "cylindrical":
        if params.diameter is None or params.height is None:
            raise ValueError("Для цилиндра требуются diameter и height")
        d, h = params.diameter, params.height
        return math.pi * d * h + 2 * math.pi * (d / 2) ** 2
    if params.shape == "rectangular":
        if not all([params.length, params.width, params.height]):
            raise ValueError("Для параллелепипеда требуются length, width, height")
        assert params.length and params.width and params.height
        l, w, h = params.length, params.width, params.height
        return 3 * (l * w + l * h + w * h)
    if params.shape == "spherical":
        if params.diameter is None:
            raise ValueError("Для сферы требуется diameter")
        return 4 * math.pi * (params.diameter / 2) ** 2
    raise ValueError(f"Неизвестная форма ёмкости: {params.shape}")


def x__surface_area__mutmut_36(params: TankHeatLossParams) -> float:
    """Площадь внешней поверхности ёмкости, м².

    Цилиндр:       S = π·d·H + 2·π·(d/2)²   (боковая + 2 крышки)
    Параллелепипед: S = 2·(L·W + L·H + W·H)
    Сфера:         S = π·d²
    """
    if params.shape == "cylindrical":
        if params.diameter is None or params.height is None:
            raise ValueError("Для цилиндра требуются diameter и height")
        d, h = params.diameter, params.height
        return math.pi * d * h + 2 * math.pi * (d / 2) ** 2
    if params.shape == "rectangular":
        if not all([params.length, params.width, params.height]):
            raise ValueError("Для параллелепипеда требуются length, width, height")
        assert params.length and params.width and params.height
        l, w, h = params.length, params.width, params.height
        return 2 * (l * w + l * h - w * h)
    if params.shape == "spherical":
        if params.diameter is None:
            raise ValueError("Для сферы требуется diameter")
        return 4 * math.pi * (params.diameter / 2) ** 2
    raise ValueError(f"Неизвестная форма ёмкости: {params.shape}")


def x__surface_area__mutmut_37(params: TankHeatLossParams) -> float:
    """Площадь внешней поверхности ёмкости, м².

    Цилиндр:       S = π·d·H + 2·π·(d/2)²   (боковая + 2 крышки)
    Параллелепипед: S = 2·(L·W + L·H + W·H)
    Сфера:         S = π·d²
    """
    if params.shape == "cylindrical":
        if params.diameter is None or params.height is None:
            raise ValueError("Для цилиндра требуются diameter и height")
        d, h = params.diameter, params.height
        return math.pi * d * h + 2 * math.pi * (d / 2) ** 2
    if params.shape == "rectangular":
        if not all([params.length, params.width, params.height]):
            raise ValueError("Для параллелепипеда требуются length, width, height")
        assert params.length and params.width and params.height
        l, w, h = params.length, params.width, params.height
        return 2 * (l * w - l * h + w * h)
    if params.shape == "spherical":
        if params.diameter is None:
            raise ValueError("Для сферы требуется diameter")
        return 4 * math.pi * (params.diameter / 2) ** 2
    raise ValueError(f"Неизвестная форма ёмкости: {params.shape}")


def x__surface_area__mutmut_38(params: TankHeatLossParams) -> float:
    """Площадь внешней поверхности ёмкости, м².

    Цилиндр:       S = π·d·H + 2·π·(d/2)²   (боковая + 2 крышки)
    Параллелепипед: S = 2·(L·W + L·H + W·H)
    Сфера:         S = π·d²
    """
    if params.shape == "cylindrical":
        if params.diameter is None or params.height is None:
            raise ValueError("Для цилиндра требуются diameter и height")
        d, h = params.diameter, params.height
        return math.pi * d * h + 2 * math.pi * (d / 2) ** 2
    if params.shape == "rectangular":
        if not all([params.length, params.width, params.height]):
            raise ValueError("Для параллелепипеда требуются length, width, height")
        assert params.length and params.width and params.height
        l, w, h = params.length, params.width, params.height
        return 2 * (l / w + l * h + w * h)
    if params.shape == "spherical":
        if params.diameter is None:
            raise ValueError("Для сферы требуется diameter")
        return 4 * math.pi * (params.diameter / 2) ** 2
    raise ValueError(f"Неизвестная форма ёмкости: {params.shape}")


def x__surface_area__mutmut_39(params: TankHeatLossParams) -> float:
    """Площадь внешней поверхности ёмкости, м².

    Цилиндр:       S = π·d·H + 2·π·(d/2)²   (боковая + 2 крышки)
    Параллелепипед: S = 2·(L·W + L·H + W·H)
    Сфера:         S = π·d²
    """
    if params.shape == "cylindrical":
        if params.diameter is None or params.height is None:
            raise ValueError("Для цилиндра требуются diameter и height")
        d, h = params.diameter, params.height
        return math.pi * d * h + 2 * math.pi * (d / 2) ** 2
    if params.shape == "rectangular":
        if not all([params.length, params.width, params.height]):
            raise ValueError("Для параллелепипеда требуются length, width, height")
        assert params.length and params.width and params.height
        l, w, h = params.length, params.width, params.height
        return 2 * (l * w + l / h + w * h)
    if params.shape == "spherical":
        if params.diameter is None:
            raise ValueError("Для сферы требуется diameter")
        return 4 * math.pi * (params.diameter / 2) ** 2
    raise ValueError(f"Неизвестная форма ёмкости: {params.shape}")


def x__surface_area__mutmut_40(params: TankHeatLossParams) -> float:
    """Площадь внешней поверхности ёмкости, м².

    Цилиндр:       S = π·d·H + 2·π·(d/2)²   (боковая + 2 крышки)
    Параллелепипед: S = 2·(L·W + L·H + W·H)
    Сфера:         S = π·d²
    """
    if params.shape == "cylindrical":
        if params.diameter is None or params.height is None:
            raise ValueError("Для цилиндра требуются diameter и height")
        d, h = params.diameter, params.height
        return math.pi * d * h + 2 * math.pi * (d / 2) ** 2
    if params.shape == "rectangular":
        if not all([params.length, params.width, params.height]):
            raise ValueError("Для параллелепипеда требуются length, width, height")
        assert params.length and params.width and params.height
        l, w, h = params.length, params.width, params.height
        return 2 * (l * w + l * h + w / h)
    if params.shape == "spherical":
        if params.diameter is None:
            raise ValueError("Для сферы требуется diameter")
        return 4 * math.pi * (params.diameter / 2) ** 2
    raise ValueError(f"Неизвестная форма ёмкости: {params.shape}")


def x__surface_area__mutmut_41(params: TankHeatLossParams) -> float:
    """Площадь внешней поверхности ёмкости, м².

    Цилиндр:       S = π·d·H + 2·π·(d/2)²   (боковая + 2 крышки)
    Параллелепипед: S = 2·(L·W + L·H + W·H)
    Сфера:         S = π·d²
    """
    if params.shape == "cylindrical":
        if params.diameter is None or params.height is None:
            raise ValueError("Для цилиндра требуются diameter и height")
        d, h = params.diameter, params.height
        return math.pi * d * h + 2 * math.pi * (d / 2) ** 2
    if params.shape == "rectangular":
        if not all([params.length, params.width, params.height]):
            raise ValueError("Для параллелепипеда требуются length, width, height")
        assert params.length and params.width and params.height
        l, w, h = params.length, params.width, params.height
        return 2 * (l * w + l * h + w * h)
    if params.shape != "spherical":
        if params.diameter is None:
            raise ValueError("Для сферы требуется diameter")
        return 4 * math.pi * (params.diameter / 2) ** 2
    raise ValueError(f"Неизвестная форма ёмкости: {params.shape}")


def x__surface_area__mutmut_42(params: TankHeatLossParams) -> float:
    """Площадь внешней поверхности ёмкости, м².

    Цилиндр:       S = π·d·H + 2·π·(d/2)²   (боковая + 2 крышки)
    Параллелепипед: S = 2·(L·W + L·H + W·H)
    Сфера:         S = π·d²
    """
    if params.shape == "cylindrical":
        if params.diameter is None or params.height is None:
            raise ValueError("Для цилиндра требуются diameter и height")
        d, h = params.diameter, params.height
        return math.pi * d * h + 2 * math.pi * (d / 2) ** 2
    if params.shape == "rectangular":
        if not all([params.length, params.width, params.height]):
            raise ValueError("Для параллелепипеда требуются length, width, height")
        assert params.length and params.width and params.height
        l, w, h = params.length, params.width, params.height
        return 2 * (l * w + l * h + w * h)
    if params.shape == "XXsphericalXX":
        if params.diameter is None:
            raise ValueError("Для сферы требуется diameter")
        return 4 * math.pi * (params.diameter / 2) ** 2
    raise ValueError(f"Неизвестная форма ёмкости: {params.shape}")


def x__surface_area__mutmut_43(params: TankHeatLossParams) -> float:
    """Площадь внешней поверхности ёмкости, м².

    Цилиндр:       S = π·d·H + 2·π·(d/2)²   (боковая + 2 крышки)
    Параллелепипед: S = 2·(L·W + L·H + W·H)
    Сфера:         S = π·d²
    """
    if params.shape == "cylindrical":
        if params.diameter is None or params.height is None:
            raise ValueError("Для цилиндра требуются diameter и height")
        d, h = params.diameter, params.height
        return math.pi * d * h + 2 * math.pi * (d / 2) ** 2
    if params.shape == "rectangular":
        if not all([params.length, params.width, params.height]):
            raise ValueError("Для параллелепипеда требуются length, width, height")
        assert params.length and params.width and params.height
        l, w, h = params.length, params.width, params.height
        return 2 * (l * w + l * h + w * h)
    if params.shape == "SPHERICAL":
        if params.diameter is None:
            raise ValueError("Для сферы требуется diameter")
        return 4 * math.pi * (params.diameter / 2) ** 2
    raise ValueError(f"Неизвестная форма ёмкости: {params.shape}")


def x__surface_area__mutmut_44(params: TankHeatLossParams) -> float:
    """Площадь внешней поверхности ёмкости, м².

    Цилиндр:       S = π·d·H + 2·π·(d/2)²   (боковая + 2 крышки)
    Параллелепипед: S = 2·(L·W + L·H + W·H)
    Сфера:         S = π·d²
    """
    if params.shape == "cylindrical":
        if params.diameter is None or params.height is None:
            raise ValueError("Для цилиндра требуются diameter и height")
        d, h = params.diameter, params.height
        return math.pi * d * h + 2 * math.pi * (d / 2) ** 2
    if params.shape == "rectangular":
        if not all([params.length, params.width, params.height]):
            raise ValueError("Для параллелепипеда требуются length, width, height")
        assert params.length and params.width and params.height
        l, w, h = params.length, params.width, params.height
        return 2 * (l * w + l * h + w * h)
    if params.shape == "spherical":
        if params.diameter is not None:
            raise ValueError("Для сферы требуется diameter")
        return 4 * math.pi * (params.diameter / 2) ** 2
    raise ValueError(f"Неизвестная форма ёмкости: {params.shape}")


def x__surface_area__mutmut_45(params: TankHeatLossParams) -> float:
    """Площадь внешней поверхности ёмкости, м².

    Цилиндр:       S = π·d·H + 2·π·(d/2)²   (боковая + 2 крышки)
    Параллелепипед: S = 2·(L·W + L·H + W·H)
    Сфера:         S = π·d²
    """
    if params.shape == "cylindrical":
        if params.diameter is None or params.height is None:
            raise ValueError("Для цилиндра требуются diameter и height")
        d, h = params.diameter, params.height
        return math.pi * d * h + 2 * math.pi * (d / 2) ** 2
    if params.shape == "rectangular":
        if not all([params.length, params.width, params.height]):
            raise ValueError("Для параллелепипеда требуются length, width, height")
        assert params.length and params.width and params.height
        l, w, h = params.length, params.width, params.height
        return 2 * (l * w + l * h + w * h)
    if params.shape == "spherical":
        if params.diameter is None:
            raise ValueError(None)
        return 4 * math.pi * (params.diameter / 2) ** 2
    raise ValueError(f"Неизвестная форма ёмкости: {params.shape}")


def x__surface_area__mutmut_46(params: TankHeatLossParams) -> float:
    """Площадь внешней поверхности ёмкости, м².

    Цилиндр:       S = π·d·H + 2·π·(d/2)²   (боковая + 2 крышки)
    Параллелепипед: S = 2·(L·W + L·H + W·H)
    Сфера:         S = π·d²
    """
    if params.shape == "cylindrical":
        if params.diameter is None or params.height is None:
            raise ValueError("Для цилиндра требуются diameter и height")
        d, h = params.diameter, params.height
        return math.pi * d * h + 2 * math.pi * (d / 2) ** 2
    if params.shape == "rectangular":
        if not all([params.length, params.width, params.height]):
            raise ValueError("Для параллелепипеда требуются length, width, height")
        assert params.length and params.width and params.height
        l, w, h = params.length, params.width, params.height
        return 2 * (l * w + l * h + w * h)
    if params.shape == "spherical":
        if params.diameter is None:
            raise ValueError("XXДля сферы требуется diameterXX")
        return 4 * math.pi * (params.diameter / 2) ** 2
    raise ValueError(f"Неизвестная форма ёмкости: {params.shape}")


def x__surface_area__mutmut_47(params: TankHeatLossParams) -> float:
    """Площадь внешней поверхности ёмкости, м².

    Цилиндр:       S = π·d·H + 2·π·(d/2)²   (боковая + 2 крышки)
    Параллелепипед: S = 2·(L·W + L·H + W·H)
    Сфера:         S = π·d²
    """
    if params.shape == "cylindrical":
        if params.diameter is None or params.height is None:
            raise ValueError("Для цилиндра требуются diameter и height")
        d, h = params.diameter, params.height
        return math.pi * d * h + 2 * math.pi * (d / 2) ** 2
    if params.shape == "rectangular":
        if not all([params.length, params.width, params.height]):
            raise ValueError("Для параллелепипеда требуются length, width, height")
        assert params.length and params.width and params.height
        l, w, h = params.length, params.width, params.height
        return 2 * (l * w + l * h + w * h)
    if params.shape == "spherical":
        if params.diameter is None:
            raise ValueError("для сферы требуется diameter")
        return 4 * math.pi * (params.diameter / 2) ** 2
    raise ValueError(f"Неизвестная форма ёмкости: {params.shape}")


def x__surface_area__mutmut_48(params: TankHeatLossParams) -> float:
    """Площадь внешней поверхности ёмкости, м².

    Цилиндр:       S = π·d·H + 2·π·(d/2)²   (боковая + 2 крышки)
    Параллелепипед: S = 2·(L·W + L·H + W·H)
    Сфера:         S = π·d²
    """
    if params.shape == "cylindrical":
        if params.diameter is None or params.height is None:
            raise ValueError("Для цилиндра требуются diameter и height")
        d, h = params.diameter, params.height
        return math.pi * d * h + 2 * math.pi * (d / 2) ** 2
    if params.shape == "rectangular":
        if not all([params.length, params.width, params.height]):
            raise ValueError("Для параллелепипеда требуются length, width, height")
        assert params.length and params.width and params.height
        l, w, h = params.length, params.width, params.height
        return 2 * (l * w + l * h + w * h)
    if params.shape == "spherical":
        if params.diameter is None:
            raise ValueError("ДЛЯ СФЕРЫ ТРЕБУЕТСЯ DIAMETER")
        return 4 * math.pi * (params.diameter / 2) ** 2
    raise ValueError(f"Неизвестная форма ёмкости: {params.shape}")


def x__surface_area__mutmut_49(params: TankHeatLossParams) -> float:
    """Площадь внешней поверхности ёмкости, м².

    Цилиндр:       S = π·d·H + 2·π·(d/2)²   (боковая + 2 крышки)
    Параллелепипед: S = 2·(L·W + L·H + W·H)
    Сфера:         S = π·d²
    """
    if params.shape == "cylindrical":
        if params.diameter is None or params.height is None:
            raise ValueError("Для цилиндра требуются diameter и height")
        d, h = params.diameter, params.height
        return math.pi * d * h + 2 * math.pi * (d / 2) ** 2
    if params.shape == "rectangular":
        if not all([params.length, params.width, params.height]):
            raise ValueError("Для параллелепипеда требуются length, width, height")
        assert params.length and params.width and params.height
        l, w, h = params.length, params.width, params.height
        return 2 * (l * w + l * h + w * h)
    if params.shape == "spherical":
        if params.diameter is None:
            raise ValueError("Для сферы требуется diameter")
        return 4 * math.pi / (params.diameter / 2) ** 2
    raise ValueError(f"Неизвестная форма ёмкости: {params.shape}")


def x__surface_area__mutmut_50(params: TankHeatLossParams) -> float:
    """Площадь внешней поверхности ёмкости, м².

    Цилиндр:       S = π·d·H + 2·π·(d/2)²   (боковая + 2 крышки)
    Параллелепипед: S = 2·(L·W + L·H + W·H)
    Сфера:         S = π·d²
    """
    if params.shape == "cylindrical":
        if params.diameter is None or params.height is None:
            raise ValueError("Для цилиндра требуются diameter и height")
        d, h = params.diameter, params.height
        return math.pi * d * h + 2 * math.pi * (d / 2) ** 2
    if params.shape == "rectangular":
        if not all([params.length, params.width, params.height]):
            raise ValueError("Для параллелепипеда требуются length, width, height")
        assert params.length and params.width and params.height
        l, w, h = params.length, params.width, params.height
        return 2 * (l * w + l * h + w * h)
    if params.shape == "spherical":
        if params.diameter is None:
            raise ValueError("Для сферы требуется diameter")
        return 4 / math.pi * (params.diameter / 2) ** 2
    raise ValueError(f"Неизвестная форма ёмкости: {params.shape}")


def x__surface_area__mutmut_51(params: TankHeatLossParams) -> float:
    """Площадь внешней поверхности ёмкости, м².

    Цилиндр:       S = π·d·H + 2·π·(d/2)²   (боковая + 2 крышки)
    Параллелепипед: S = 2·(L·W + L·H + W·H)
    Сфера:         S = π·d²
    """
    if params.shape == "cylindrical":
        if params.diameter is None or params.height is None:
            raise ValueError("Для цилиндра требуются diameter и height")
        d, h = params.diameter, params.height
        return math.pi * d * h + 2 * math.pi * (d / 2) ** 2
    if params.shape == "rectangular":
        if not all([params.length, params.width, params.height]):
            raise ValueError("Для параллелепипеда требуются length, width, height")
        assert params.length and params.width and params.height
        l, w, h = params.length, params.width, params.height
        return 2 * (l * w + l * h + w * h)
    if params.shape == "spherical":
        if params.diameter is None:
            raise ValueError("Для сферы требуется diameter")
        return 5 * math.pi * (params.diameter / 2) ** 2
    raise ValueError(f"Неизвестная форма ёмкости: {params.shape}")


def x__surface_area__mutmut_52(params: TankHeatLossParams) -> float:
    """Площадь внешней поверхности ёмкости, м².

    Цилиндр:       S = π·d·H + 2·π·(d/2)²   (боковая + 2 крышки)
    Параллелепипед: S = 2·(L·W + L·H + W·H)
    Сфера:         S = π·d²
    """
    if params.shape == "cylindrical":
        if params.diameter is None or params.height is None:
            raise ValueError("Для цилиндра требуются diameter и height")
        d, h = params.diameter, params.height
        return math.pi * d * h + 2 * math.pi * (d / 2) ** 2
    if params.shape == "rectangular":
        if not all([params.length, params.width, params.height]):
            raise ValueError("Для параллелепипеда требуются length, width, height")
        assert params.length and params.width and params.height
        l, w, h = params.length, params.width, params.height
        return 2 * (l * w + l * h + w * h)
    if params.shape == "spherical":
        if params.diameter is None:
            raise ValueError("Для сферы требуется diameter")
        return 4 * math.pi * (params.diameter / 2) * 2
    raise ValueError(f"Неизвестная форма ёмкости: {params.shape}")


def x__surface_area__mutmut_53(params: TankHeatLossParams) -> float:
    """Площадь внешней поверхности ёмкости, м².

    Цилиндр:       S = π·d·H + 2·π·(d/2)²   (боковая + 2 крышки)
    Параллелепипед: S = 2·(L·W + L·H + W·H)
    Сфера:         S = π·d²
    """
    if params.shape == "cylindrical":
        if params.diameter is None or params.height is None:
            raise ValueError("Для цилиндра требуются diameter и height")
        d, h = params.diameter, params.height
        return math.pi * d * h + 2 * math.pi * (d / 2) ** 2
    if params.shape == "rectangular":
        if not all([params.length, params.width, params.height]):
            raise ValueError("Для параллелепипеда требуются length, width, height")
        assert params.length and params.width and params.height
        l, w, h = params.length, params.width, params.height
        return 2 * (l * w + l * h + w * h)
    if params.shape == "spherical":
        if params.diameter is None:
            raise ValueError("Для сферы требуется diameter")
        return 4 * math.pi * (params.diameter * 2) ** 2
    raise ValueError(f"Неизвестная форма ёмкости: {params.shape}")


def x__surface_area__mutmut_54(params: TankHeatLossParams) -> float:
    """Площадь внешней поверхности ёмкости, м².

    Цилиндр:       S = π·d·H + 2·π·(d/2)²   (боковая + 2 крышки)
    Параллелепипед: S = 2·(L·W + L·H + W·H)
    Сфера:         S = π·d²
    """
    if params.shape == "cylindrical":
        if params.diameter is None or params.height is None:
            raise ValueError("Для цилиндра требуются diameter и height")
        d, h = params.diameter, params.height
        return math.pi * d * h + 2 * math.pi * (d / 2) ** 2
    if params.shape == "rectangular":
        if not all([params.length, params.width, params.height]):
            raise ValueError("Для параллелепипеда требуются length, width, height")
        assert params.length and params.width and params.height
        l, w, h = params.length, params.width, params.height
        return 2 * (l * w + l * h + w * h)
    if params.shape == "spherical":
        if params.diameter is None:
            raise ValueError("Для сферы требуется diameter")
        return 4 * math.pi * (params.diameter / 3) ** 2
    raise ValueError(f"Неизвестная форма ёмкости: {params.shape}")


def x__surface_area__mutmut_55(params: TankHeatLossParams) -> float:
    """Площадь внешней поверхности ёмкости, м².

    Цилиндр:       S = π·d·H + 2·π·(d/2)²   (боковая + 2 крышки)
    Параллелепипед: S = 2·(L·W + L·H + W·H)
    Сфера:         S = π·d²
    """
    if params.shape == "cylindrical":
        if params.diameter is None or params.height is None:
            raise ValueError("Для цилиндра требуются diameter и height")
        d, h = params.diameter, params.height
        return math.pi * d * h + 2 * math.pi * (d / 2) ** 2
    if params.shape == "rectangular":
        if not all([params.length, params.width, params.height]):
            raise ValueError("Для параллелепипеда требуются length, width, height")
        assert params.length and params.width and params.height
        l, w, h = params.length, params.width, params.height
        return 2 * (l * w + l * h + w * h)
    if params.shape == "spherical":
        if params.diameter is None:
            raise ValueError("Для сферы требуется diameter")
        return 4 * math.pi * (params.diameter / 2) ** 3
    raise ValueError(f"Неизвестная форма ёмкости: {params.shape}")


def x__surface_area__mutmut_56(params: TankHeatLossParams) -> float:
    """Площадь внешней поверхности ёмкости, м².

    Цилиндр:       S = π·d·H + 2·π·(d/2)²   (боковая + 2 крышки)
    Параллелепипед: S = 2·(L·W + L·H + W·H)
    Сфера:         S = π·d²
    """
    if params.shape == "cylindrical":
        if params.diameter is None or params.height is None:
            raise ValueError("Для цилиндра требуются diameter и height")
        d, h = params.diameter, params.height
        return math.pi * d * h + 2 * math.pi * (d / 2) ** 2
    if params.shape == "rectangular":
        if not all([params.length, params.width, params.height]):
            raise ValueError("Для параллелепипеда требуются length, width, height")
        assert params.length and params.width and params.height
        l, w, h = params.length, params.width, params.height
        return 2 * (l * w + l * h + w * h)
    if params.shape == "spherical":
        if params.diameter is None:
            raise ValueError("Для сферы требуется diameter")
        return 4 * math.pi * (params.diameter / 2) ** 2
    raise ValueError(None)

x__surface_area__mutmut_mutants : ClassVar[MutantDict] = { # type: ignore
'x__surface_area__mutmut_1': x__surface_area__mutmut_1, 
    'x__surface_area__mutmut_2': x__surface_area__mutmut_2, 
    'x__surface_area__mutmut_3': x__surface_area__mutmut_3, 
    'x__surface_area__mutmut_4': x__surface_area__mutmut_4, 
    'x__surface_area__mutmut_5': x__surface_area__mutmut_5, 
    'x__surface_area__mutmut_6': x__surface_area__mutmut_6, 
    'x__surface_area__mutmut_7': x__surface_area__mutmut_7, 
    'x__surface_area__mutmut_8': x__surface_area__mutmut_8, 
    'x__surface_area__mutmut_9': x__surface_area__mutmut_9, 
    'x__surface_area__mutmut_10': x__surface_area__mutmut_10, 
    'x__surface_area__mutmut_11': x__surface_area__mutmut_11, 
    'x__surface_area__mutmut_12': x__surface_area__mutmut_12, 
    'x__surface_area__mutmut_13': x__surface_area__mutmut_13, 
    'x__surface_area__mutmut_14': x__surface_area__mutmut_14, 
    'x__surface_area__mutmut_15': x__surface_area__mutmut_15, 
    'x__surface_area__mutmut_16': x__surface_area__mutmut_16, 
    'x__surface_area__mutmut_17': x__surface_area__mutmut_17, 
    'x__surface_area__mutmut_18': x__surface_area__mutmut_18, 
    'x__surface_area__mutmut_19': x__surface_area__mutmut_19, 
    'x__surface_area__mutmut_20': x__surface_area__mutmut_20, 
    'x__surface_area__mutmut_21': x__surface_area__mutmut_21, 
    'x__surface_area__mutmut_22': x__surface_area__mutmut_22, 
    'x__surface_area__mutmut_23': x__surface_area__mutmut_23, 
    'x__surface_area__mutmut_24': x__surface_area__mutmut_24, 
    'x__surface_area__mutmut_25': x__surface_area__mutmut_25, 
    'x__surface_area__mutmut_26': x__surface_area__mutmut_26, 
    'x__surface_area__mutmut_27': x__surface_area__mutmut_27, 
    'x__surface_area__mutmut_28': x__surface_area__mutmut_28, 
    'x__surface_area__mutmut_29': x__surface_area__mutmut_29, 
    'x__surface_area__mutmut_30': x__surface_area__mutmut_30, 
    'x__surface_area__mutmut_31': x__surface_area__mutmut_31, 
    'x__surface_area__mutmut_32': x__surface_area__mutmut_32, 
    'x__surface_area__mutmut_33': x__surface_area__mutmut_33, 
    'x__surface_area__mutmut_34': x__surface_area__mutmut_34, 
    'x__surface_area__mutmut_35': x__surface_area__mutmut_35, 
    'x__surface_area__mutmut_36': x__surface_area__mutmut_36, 
    'x__surface_area__mutmut_37': x__surface_area__mutmut_37, 
    'x__surface_area__mutmut_38': x__surface_area__mutmut_38, 
    'x__surface_area__mutmut_39': x__surface_area__mutmut_39, 
    'x__surface_area__mutmut_40': x__surface_area__mutmut_40, 
    'x__surface_area__mutmut_41': x__surface_area__mutmut_41, 
    'x__surface_area__mutmut_42': x__surface_area__mutmut_42, 
    'x__surface_area__mutmut_43': x__surface_area__mutmut_43, 
    'x__surface_area__mutmut_44': x__surface_area__mutmut_44, 
    'x__surface_area__mutmut_45': x__surface_area__mutmut_45, 
    'x__surface_area__mutmut_46': x__surface_area__mutmut_46, 
    'x__surface_area__mutmut_47': x__surface_area__mutmut_47, 
    'x__surface_area__mutmut_48': x__surface_area__mutmut_48, 
    'x__surface_area__mutmut_49': x__surface_area__mutmut_49, 
    'x__surface_area__mutmut_50': x__surface_area__mutmut_50, 
    'x__surface_area__mutmut_51': x__surface_area__mutmut_51, 
    'x__surface_area__mutmut_52': x__surface_area__mutmut_52, 
    'x__surface_area__mutmut_53': x__surface_area__mutmut_53, 
    'x__surface_area__mutmut_54': x__surface_area__mutmut_54, 
    'x__surface_area__mutmut_55': x__surface_area__mutmut_55, 
    'x__surface_area__mutmut_56': x__surface_area__mutmut_56
}
x__surface_area__mutmut_orig.__name__ = 'x__surface_area'


def _calc_alpha(params: TankHeatLossParams) -> float:
    args = [params]# type: ignore
    kwargs = {}# type: ignore
    return _mutmut_trampoline(x__calc_alpha__mutmut_orig, x__calc_alpha__mutmut_mutants, args, kwargs, None)


def x__calc_alpha__mutmut_orig(params: TankHeatLossParams) -> float:
    """Коэффициент наружной теплоотдачи α, Вт/(м²·К).

    α = 11,6 + 7·v  (формула ТНП)
    Помещение: α = 9.0
    Диапазон: [11.6, 52] Вт/(м²·К)
    """
    if params.location == "indoor":
        return 9.0
    v = params.wind_speed or 0.0
    alpha = 11.6 + 7.0 * v
    return min(max(alpha, 11.6), 52.0)


def x__calc_alpha__mutmut_1(params: TankHeatLossParams) -> float:
    """Коэффициент наружной теплоотдачи α, Вт/(м²·К).

    α = 11,6 + 7·v  (формула ТНП)
    Помещение: α = 9.0
    Диапазон: [11.6, 52] Вт/(м²·К)
    """
    if params.location != "indoor":
        return 9.0
    v = params.wind_speed or 0.0
    alpha = 11.6 + 7.0 * v
    return min(max(alpha, 11.6), 52.0)


def x__calc_alpha__mutmut_2(params: TankHeatLossParams) -> float:
    """Коэффициент наружной теплоотдачи α, Вт/(м²·К).

    α = 11,6 + 7·v  (формула ТНП)
    Помещение: α = 9.0
    Диапазон: [11.6, 52] Вт/(м²·К)
    """
    if params.location == "XXindoorXX":
        return 9.0
    v = params.wind_speed or 0.0
    alpha = 11.6 + 7.0 * v
    return min(max(alpha, 11.6), 52.0)


def x__calc_alpha__mutmut_3(params: TankHeatLossParams) -> float:
    """Коэффициент наружной теплоотдачи α, Вт/(м²·К).

    α = 11,6 + 7·v  (формула ТНП)
    Помещение: α = 9.0
    Диапазон: [11.6, 52] Вт/(м²·К)
    """
    if params.location == "INDOOR":
        return 9.0
    v = params.wind_speed or 0.0
    alpha = 11.6 + 7.0 * v
    return min(max(alpha, 11.6), 52.0)


def x__calc_alpha__mutmut_4(params: TankHeatLossParams) -> float:
    """Коэффициент наружной теплоотдачи α, Вт/(м²·К).

    α = 11,6 + 7·v  (формула ТНП)
    Помещение: α = 9.0
    Диапазон: [11.6, 52] Вт/(м²·К)
    """
    if params.location == "indoor":
        return 10.0
    v = params.wind_speed or 0.0
    alpha = 11.6 + 7.0 * v
    return min(max(alpha, 11.6), 52.0)


def x__calc_alpha__mutmut_5(params: TankHeatLossParams) -> float:
    """Коэффициент наружной теплоотдачи α, Вт/(м²·К).

    α = 11,6 + 7·v  (формула ТНП)
    Помещение: α = 9.0
    Диапазон: [11.6, 52] Вт/(м²·К)
    """
    if params.location == "indoor":
        return 9.0
    v = None
    alpha = 11.6 + 7.0 * v
    return min(max(alpha, 11.6), 52.0)


def x__calc_alpha__mutmut_6(params: TankHeatLossParams) -> float:
    """Коэффициент наружной теплоотдачи α, Вт/(м²·К).

    α = 11,6 + 7·v  (формула ТНП)
    Помещение: α = 9.0
    Диапазон: [11.6, 52] Вт/(м²·К)
    """
    if params.location == "indoor":
        return 9.0
    v = params.wind_speed and 0.0
    alpha = 11.6 + 7.0 * v
    return min(max(alpha, 11.6), 52.0)


def x__calc_alpha__mutmut_7(params: TankHeatLossParams) -> float:
    """Коэффициент наружной теплоотдачи α, Вт/(м²·К).

    α = 11,6 + 7·v  (формула ТНП)
    Помещение: α = 9.0
    Диапазон: [11.6, 52] Вт/(м²·К)
    """
    if params.location == "indoor":
        return 9.0
    v = params.wind_speed or 1.0
    alpha = 11.6 + 7.0 * v
    return min(max(alpha, 11.6), 52.0)


def x__calc_alpha__mutmut_8(params: TankHeatLossParams) -> float:
    """Коэффициент наружной теплоотдачи α, Вт/(м²·К).

    α = 11,6 + 7·v  (формула ТНП)
    Помещение: α = 9.0
    Диапазон: [11.6, 52] Вт/(м²·К)
    """
    if params.location == "indoor":
        return 9.0
    v = params.wind_speed or 0.0
    alpha = None
    return min(max(alpha, 11.6), 52.0)


def x__calc_alpha__mutmut_9(params: TankHeatLossParams) -> float:
    """Коэффициент наружной теплоотдачи α, Вт/(м²·К).

    α = 11,6 + 7·v  (формула ТНП)
    Помещение: α = 9.0
    Диапазон: [11.6, 52] Вт/(м²·К)
    """
    if params.location == "indoor":
        return 9.0
    v = params.wind_speed or 0.0
    alpha = 11.6 - 7.0 * v
    return min(max(alpha, 11.6), 52.0)


def x__calc_alpha__mutmut_10(params: TankHeatLossParams) -> float:
    """Коэффициент наружной теплоотдачи α, Вт/(м²·К).

    α = 11,6 + 7·v  (формула ТНП)
    Помещение: α = 9.0
    Диапазон: [11.6, 52] Вт/(м²·К)
    """
    if params.location == "indoor":
        return 9.0
    v = params.wind_speed or 0.0
    alpha = 12.6 + 7.0 * v
    return min(max(alpha, 11.6), 52.0)


def x__calc_alpha__mutmut_11(params: TankHeatLossParams) -> float:
    """Коэффициент наружной теплоотдачи α, Вт/(м²·К).

    α = 11,6 + 7·v  (формула ТНП)
    Помещение: α = 9.0
    Диапазон: [11.6, 52] Вт/(м²·К)
    """
    if params.location == "indoor":
        return 9.0
    v = params.wind_speed or 0.0
    alpha = 11.6 + 7.0 / v
    return min(max(alpha, 11.6), 52.0)


def x__calc_alpha__mutmut_12(params: TankHeatLossParams) -> float:
    """Коэффициент наружной теплоотдачи α, Вт/(м²·К).

    α = 11,6 + 7·v  (формула ТНП)
    Помещение: α = 9.0
    Диапазон: [11.6, 52] Вт/(м²·К)
    """
    if params.location == "indoor":
        return 9.0
    v = params.wind_speed or 0.0
    alpha = 11.6 + 8.0 * v
    return min(max(alpha, 11.6), 52.0)


def x__calc_alpha__mutmut_13(params: TankHeatLossParams) -> float:
    """Коэффициент наружной теплоотдачи α, Вт/(м²·К).

    α = 11,6 + 7·v  (формула ТНП)
    Помещение: α = 9.0
    Диапазон: [11.6, 52] Вт/(м²·К)
    """
    if params.location == "indoor":
        return 9.0
    v = params.wind_speed or 0.0
    alpha = 11.6 + 7.0 * v
    return min(None, 52.0)


def x__calc_alpha__mutmut_14(params: TankHeatLossParams) -> float:
    """Коэффициент наружной теплоотдачи α, Вт/(м²·К).

    α = 11,6 + 7·v  (формула ТНП)
    Помещение: α = 9.0
    Диапазон: [11.6, 52] Вт/(м²·К)
    """
    if params.location == "indoor":
        return 9.0
    v = params.wind_speed or 0.0
    alpha = 11.6 + 7.0 * v
    return min(max(alpha, 11.6), None)


def x__calc_alpha__mutmut_15(params: TankHeatLossParams) -> float:
    """Коэффициент наружной теплоотдачи α, Вт/(м²·К).

    α = 11,6 + 7·v  (формула ТНП)
    Помещение: α = 9.0
    Диапазон: [11.6, 52] Вт/(м²·К)
    """
    if params.location == "indoor":
        return 9.0
    v = params.wind_speed or 0.0
    alpha = 11.6 + 7.0 * v
    return min(52.0)


def x__calc_alpha__mutmut_16(params: TankHeatLossParams) -> float:
    """Коэффициент наружной теплоотдачи α, Вт/(м²·К).

    α = 11,6 + 7·v  (формула ТНП)
    Помещение: α = 9.0
    Диапазон: [11.6, 52] Вт/(м²·К)
    """
    if params.location == "indoor":
        return 9.0
    v = params.wind_speed or 0.0
    alpha = 11.6 + 7.0 * v
    return min(max(alpha, 11.6), )


def x__calc_alpha__mutmut_17(params: TankHeatLossParams) -> float:
    """Коэффициент наружной теплоотдачи α, Вт/(м²·К).

    α = 11,6 + 7·v  (формула ТНП)
    Помещение: α = 9.0
    Диапазон: [11.6, 52] Вт/(м²·К)
    """
    if params.location == "indoor":
        return 9.0
    v = params.wind_speed or 0.0
    alpha = 11.6 + 7.0 * v
    return min(max(None, 11.6), 52.0)


def x__calc_alpha__mutmut_18(params: TankHeatLossParams) -> float:
    """Коэффициент наружной теплоотдачи α, Вт/(м²·К).

    α = 11,6 + 7·v  (формула ТНП)
    Помещение: α = 9.0
    Диапазон: [11.6, 52] Вт/(м²·К)
    """
    if params.location == "indoor":
        return 9.0
    v = params.wind_speed or 0.0
    alpha = 11.6 + 7.0 * v
    return min(max(alpha, None), 52.0)


def x__calc_alpha__mutmut_19(params: TankHeatLossParams) -> float:
    """Коэффициент наружной теплоотдачи α, Вт/(м²·К).

    α = 11,6 + 7·v  (формула ТНП)
    Помещение: α = 9.0
    Диапазон: [11.6, 52] Вт/(м²·К)
    """
    if params.location == "indoor":
        return 9.0
    v = params.wind_speed or 0.0
    alpha = 11.6 + 7.0 * v
    return min(max(11.6), 52.0)


def x__calc_alpha__mutmut_20(params: TankHeatLossParams) -> float:
    """Коэффициент наружной теплоотдачи α, Вт/(м²·К).

    α = 11,6 + 7·v  (формула ТНП)
    Помещение: α = 9.0
    Диапазон: [11.6, 52] Вт/(м²·К)
    """
    if params.location == "indoor":
        return 9.0
    v = params.wind_speed or 0.0
    alpha = 11.6 + 7.0 * v
    return min(max(alpha, ), 52.0)


def x__calc_alpha__mutmut_21(params: TankHeatLossParams) -> float:
    """Коэффициент наружной теплоотдачи α, Вт/(м²·К).

    α = 11,6 + 7·v  (формула ТНП)
    Помещение: α = 9.0
    Диапазон: [11.6, 52] Вт/(м²·К)
    """
    if params.location == "indoor":
        return 9.0
    v = params.wind_speed or 0.0
    alpha = 11.6 + 7.0 * v
    return min(max(alpha, 12.6), 52.0)


def x__calc_alpha__mutmut_22(params: TankHeatLossParams) -> float:
    """Коэффициент наружной теплоотдачи α, Вт/(м²·К).

    α = 11,6 + 7·v  (формула ТНП)
    Помещение: α = 9.0
    Диапазон: [11.6, 52] Вт/(м²·К)
    """
    if params.location == "indoor":
        return 9.0
    v = params.wind_speed or 0.0
    alpha = 11.6 + 7.0 * v
    return min(max(alpha, 11.6), 53.0)

x__calc_alpha__mutmut_mutants : ClassVar[MutantDict] = { # type: ignore
'x__calc_alpha__mutmut_1': x__calc_alpha__mutmut_1, 
    'x__calc_alpha__mutmut_2': x__calc_alpha__mutmut_2, 
    'x__calc_alpha__mutmut_3': x__calc_alpha__mutmut_3, 
    'x__calc_alpha__mutmut_4': x__calc_alpha__mutmut_4, 
    'x__calc_alpha__mutmut_5': x__calc_alpha__mutmut_5, 
    'x__calc_alpha__mutmut_6': x__calc_alpha__mutmut_6, 
    'x__calc_alpha__mutmut_7': x__calc_alpha__mutmut_7, 
    'x__calc_alpha__mutmut_8': x__calc_alpha__mutmut_8, 
    'x__calc_alpha__mutmut_9': x__calc_alpha__mutmut_9, 
    'x__calc_alpha__mutmut_10': x__calc_alpha__mutmut_10, 
    'x__calc_alpha__mutmut_11': x__calc_alpha__mutmut_11, 
    'x__calc_alpha__mutmut_12': x__calc_alpha__mutmut_12, 
    'x__calc_alpha__mutmut_13': x__calc_alpha__mutmut_13, 
    'x__calc_alpha__mutmut_14': x__calc_alpha__mutmut_14, 
    'x__calc_alpha__mutmut_15': x__calc_alpha__mutmut_15, 
    'x__calc_alpha__mutmut_16': x__calc_alpha__mutmut_16, 
    'x__calc_alpha__mutmut_17': x__calc_alpha__mutmut_17, 
    'x__calc_alpha__mutmut_18': x__calc_alpha__mutmut_18, 
    'x__calc_alpha__mutmut_19': x__calc_alpha__mutmut_19, 
    'x__calc_alpha__mutmut_20': x__calc_alpha__mutmut_20, 
    'x__calc_alpha__mutmut_21': x__calc_alpha__mutmut_21, 
    'x__calc_alpha__mutmut_22': x__calc_alpha__mutmut_22
}
x__calc_alpha__mutmut_orig.__name__ = 'x__calc_alpha'


def calc_tank_heat_loss(
    params: TankHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> TankHeatLossResult:
    args = [params, coefficients]# type: ignore
    kwargs = {}# type: ignore
    return _mutmut_trampoline(x_calc_tank_heat_loss__mutmut_orig, x_calc_tank_heat_loss__mutmut_mutants, args, kwargs, None)


def x_calc_tank_heat_loss__mutmut_orig(
    params: TankHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> TankHeatLossResult:
    """Расчёт тепловых потерь ёмкости (модель плоской стенки).

    Упрощение: считаем все стенки плоскими (последовательное сопротивление),
    а площадь поверхности берём по геометрии (цилиндр / параллелепипед / шар).
    Для резервуаров d > 0.5 м кривизна практически не влияет на результат.

    Алгоритм:
        1. r_wall = δ_р / λ_р (если заданы толщина и λ стенки)
        2. r_ins  = δ_из / λ_из  (изоляция — плоская стенка)
        3. r_ext  = 1 / α_внеш   (α = 11.6 + 7·v на улице, 9.0 в помещении)
        4. r_total = r_wall + r_ins + r_ext
        5. q = ΔT / r_total (Вт/м², БЕЗ safety_factor)
        6. S — площадь по форме (cylinder/rectangle/sphere)
        7. Q = q · S · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры ёмкости. Требует указать геометрию,
            подходящую под `shape`: cylinder (d+h), rectangular (l+w+h), sphere (d).
        coefficients: аналогично `calc_pipe_heat_loss`.

    Returns:
        TankHeatLossResult: `heat_loss_per_m2` (q без K), `total_heat_loss` (Q с K),
        `surface_area` (S).

    Raises:
        ValueError: невалидная форма, отсутствие обязательной геометрии,
            невалидные температуры/толщины.

    See Also:
        formules.md, docs/context/formulas-summary.md
    """
    validate_positive("Толщина изоляции", params.insulation_thickness)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    t_mean = (params.ambient_temperature + params.process_temperature) / 2.0
    delta_t = params.process_temperature - params.ambient_temperature

    # --- 1. Сопротивление стенки резервуара ---
    r_wall = 0.0
    if params.wall_thickness is not None and params.wall_lambda is not None:
        validate_positive("Толщина стенки резервуара", params.wall_thickness)
        validate_positive("Теплопроводность стенки резервуара", params.wall_lambda)
        r_wall = params.wall_thickness / params.wall_lambda

    # --- 2. Сопротивление изоляции (плоская стенка) ---
    lambda_ins = get_insulation_conductivity(
        material=params.insulation_material,
        temperature=t_mean,
    )
    r_ins = params.insulation_thickness / lambda_ins

    # --- 3. Внешнее сопротивление ---
    alpha = _calc_alpha(params)
    r_ext = 1.0 / alpha

    # --- 4–5. Тепловой поток на м² ---
    r_total = r_wall + r_ins + r_ext
    q_per_m2 = delta_t / r_total

    # --- 6. Площадь ---
    area = _surface_area(params)

    # --- 7. Коэффициент запаса ---
    merged = merge_coefficients(coefficients)
    k = params.safety_factor or merged.get("safety_factor", 1.1)

    # --- 8. Итоговые теплопотери ---
    q_total = q_per_m2 * area * k

    return TankHeatLossResult(
        heat_loss_per_m2=round(q_per_m2, 3),
        total_heat_loss=round(q_total, 3),
        surface_area=round(area, 3),
    )


def x_calc_tank_heat_loss__mutmut_1(
    params: TankHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> TankHeatLossResult:
    """Расчёт тепловых потерь ёмкости (модель плоской стенки).

    Упрощение: считаем все стенки плоскими (последовательное сопротивление),
    а площадь поверхности берём по геометрии (цилиндр / параллелепипед / шар).
    Для резервуаров d > 0.5 м кривизна практически не влияет на результат.

    Алгоритм:
        1. r_wall = δ_р / λ_р (если заданы толщина и λ стенки)
        2. r_ins  = δ_из / λ_из  (изоляция — плоская стенка)
        3. r_ext  = 1 / α_внеш   (α = 11.6 + 7·v на улице, 9.0 в помещении)
        4. r_total = r_wall + r_ins + r_ext
        5. q = ΔT / r_total (Вт/м², БЕЗ safety_factor)
        6. S — площадь по форме (cylinder/rectangle/sphere)
        7. Q = q · S · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры ёмкости. Требует указать геометрию,
            подходящую под `shape`: cylinder (d+h), rectangular (l+w+h), sphere (d).
        coefficients: аналогично `calc_pipe_heat_loss`.

    Returns:
        TankHeatLossResult: `heat_loss_per_m2` (q без K), `total_heat_loss` (Q с K),
        `surface_area` (S).

    Raises:
        ValueError: невалидная форма, отсутствие обязательной геометрии,
            невалидные температуры/толщины.

    See Also:
        formules.md, docs/context/formulas-summary.md
    """
    validate_positive(None, params.insulation_thickness)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    t_mean = (params.ambient_temperature + params.process_temperature) / 2.0
    delta_t = params.process_temperature - params.ambient_temperature

    # --- 1. Сопротивление стенки резервуара ---
    r_wall = 0.0
    if params.wall_thickness is not None and params.wall_lambda is not None:
        validate_positive("Толщина стенки резервуара", params.wall_thickness)
        validate_positive("Теплопроводность стенки резервуара", params.wall_lambda)
        r_wall = params.wall_thickness / params.wall_lambda

    # --- 2. Сопротивление изоляции (плоская стенка) ---
    lambda_ins = get_insulation_conductivity(
        material=params.insulation_material,
        temperature=t_mean,
    )
    r_ins = params.insulation_thickness / lambda_ins

    # --- 3. Внешнее сопротивление ---
    alpha = _calc_alpha(params)
    r_ext = 1.0 / alpha

    # --- 4–5. Тепловой поток на м² ---
    r_total = r_wall + r_ins + r_ext
    q_per_m2 = delta_t / r_total

    # --- 6. Площадь ---
    area = _surface_area(params)

    # --- 7. Коэффициент запаса ---
    merged = merge_coefficients(coefficients)
    k = params.safety_factor or merged.get("safety_factor", 1.1)

    # --- 8. Итоговые теплопотери ---
    q_total = q_per_m2 * area * k

    return TankHeatLossResult(
        heat_loss_per_m2=round(q_per_m2, 3),
        total_heat_loss=round(q_total, 3),
        surface_area=round(area, 3),
    )


def x_calc_tank_heat_loss__mutmut_2(
    params: TankHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> TankHeatLossResult:
    """Расчёт тепловых потерь ёмкости (модель плоской стенки).

    Упрощение: считаем все стенки плоскими (последовательное сопротивление),
    а площадь поверхности берём по геометрии (цилиндр / параллелепипед / шар).
    Для резервуаров d > 0.5 м кривизна практически не влияет на результат.

    Алгоритм:
        1. r_wall = δ_р / λ_р (если заданы толщина и λ стенки)
        2. r_ins  = δ_из / λ_из  (изоляция — плоская стенка)
        3. r_ext  = 1 / α_внеш   (α = 11.6 + 7·v на улице, 9.0 в помещении)
        4. r_total = r_wall + r_ins + r_ext
        5. q = ΔT / r_total (Вт/м², БЕЗ safety_factor)
        6. S — площадь по форме (cylinder/rectangle/sphere)
        7. Q = q · S · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры ёмкости. Требует указать геометрию,
            подходящую под `shape`: cylinder (d+h), rectangular (l+w+h), sphere (d).
        coefficients: аналогично `calc_pipe_heat_loss`.

    Returns:
        TankHeatLossResult: `heat_loss_per_m2` (q без K), `total_heat_loss` (Q с K),
        `surface_area` (S).

    Raises:
        ValueError: невалидная форма, отсутствие обязательной геометрии,
            невалидные температуры/толщины.

    See Also:
        formules.md, docs/context/formulas-summary.md
    """
    validate_positive("Толщина изоляции", None)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    t_mean = (params.ambient_temperature + params.process_temperature) / 2.0
    delta_t = params.process_temperature - params.ambient_temperature

    # --- 1. Сопротивление стенки резервуара ---
    r_wall = 0.0
    if params.wall_thickness is not None and params.wall_lambda is not None:
        validate_positive("Толщина стенки резервуара", params.wall_thickness)
        validate_positive("Теплопроводность стенки резервуара", params.wall_lambda)
        r_wall = params.wall_thickness / params.wall_lambda

    # --- 2. Сопротивление изоляции (плоская стенка) ---
    lambda_ins = get_insulation_conductivity(
        material=params.insulation_material,
        temperature=t_mean,
    )
    r_ins = params.insulation_thickness / lambda_ins

    # --- 3. Внешнее сопротивление ---
    alpha = _calc_alpha(params)
    r_ext = 1.0 / alpha

    # --- 4–5. Тепловой поток на м² ---
    r_total = r_wall + r_ins + r_ext
    q_per_m2 = delta_t / r_total

    # --- 6. Площадь ---
    area = _surface_area(params)

    # --- 7. Коэффициент запаса ---
    merged = merge_coefficients(coefficients)
    k = params.safety_factor or merged.get("safety_factor", 1.1)

    # --- 8. Итоговые теплопотери ---
    q_total = q_per_m2 * area * k

    return TankHeatLossResult(
        heat_loss_per_m2=round(q_per_m2, 3),
        total_heat_loss=round(q_total, 3),
        surface_area=round(area, 3),
    )


def x_calc_tank_heat_loss__mutmut_3(
    params: TankHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> TankHeatLossResult:
    """Расчёт тепловых потерь ёмкости (модель плоской стенки).

    Упрощение: считаем все стенки плоскими (последовательное сопротивление),
    а площадь поверхности берём по геометрии (цилиндр / параллелепипед / шар).
    Для резервуаров d > 0.5 м кривизна практически не влияет на результат.

    Алгоритм:
        1. r_wall = δ_р / λ_р (если заданы толщина и λ стенки)
        2. r_ins  = δ_из / λ_из  (изоляция — плоская стенка)
        3. r_ext  = 1 / α_внеш   (α = 11.6 + 7·v на улице, 9.0 в помещении)
        4. r_total = r_wall + r_ins + r_ext
        5. q = ΔT / r_total (Вт/м², БЕЗ safety_factor)
        6. S — площадь по форме (cylinder/rectangle/sphere)
        7. Q = q · S · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры ёмкости. Требует указать геометрию,
            подходящую под `shape`: cylinder (d+h), rectangular (l+w+h), sphere (d).
        coefficients: аналогично `calc_pipe_heat_loss`.

    Returns:
        TankHeatLossResult: `heat_loss_per_m2` (q без K), `total_heat_loss` (Q с K),
        `surface_area` (S).

    Raises:
        ValueError: невалидная форма, отсутствие обязательной геометрии,
            невалидные температуры/толщины.

    See Also:
        formules.md, docs/context/formulas-summary.md
    """
    validate_positive(params.insulation_thickness)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    t_mean = (params.ambient_temperature + params.process_temperature) / 2.0
    delta_t = params.process_temperature - params.ambient_temperature

    # --- 1. Сопротивление стенки резервуара ---
    r_wall = 0.0
    if params.wall_thickness is not None and params.wall_lambda is not None:
        validate_positive("Толщина стенки резервуара", params.wall_thickness)
        validate_positive("Теплопроводность стенки резервуара", params.wall_lambda)
        r_wall = params.wall_thickness / params.wall_lambda

    # --- 2. Сопротивление изоляции (плоская стенка) ---
    lambda_ins = get_insulation_conductivity(
        material=params.insulation_material,
        temperature=t_mean,
    )
    r_ins = params.insulation_thickness / lambda_ins

    # --- 3. Внешнее сопротивление ---
    alpha = _calc_alpha(params)
    r_ext = 1.0 / alpha

    # --- 4–5. Тепловой поток на м² ---
    r_total = r_wall + r_ins + r_ext
    q_per_m2 = delta_t / r_total

    # --- 6. Площадь ---
    area = _surface_area(params)

    # --- 7. Коэффициент запаса ---
    merged = merge_coefficients(coefficients)
    k = params.safety_factor or merged.get("safety_factor", 1.1)

    # --- 8. Итоговые теплопотери ---
    q_total = q_per_m2 * area * k

    return TankHeatLossResult(
        heat_loss_per_m2=round(q_per_m2, 3),
        total_heat_loss=round(q_total, 3),
        surface_area=round(area, 3),
    )


def x_calc_tank_heat_loss__mutmut_4(
    params: TankHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> TankHeatLossResult:
    """Расчёт тепловых потерь ёмкости (модель плоской стенки).

    Упрощение: считаем все стенки плоскими (последовательное сопротивление),
    а площадь поверхности берём по геометрии (цилиндр / параллелепипед / шар).
    Для резервуаров d > 0.5 м кривизна практически не влияет на результат.

    Алгоритм:
        1. r_wall = δ_р / λ_р (если заданы толщина и λ стенки)
        2. r_ins  = δ_из / λ_из  (изоляция — плоская стенка)
        3. r_ext  = 1 / α_внеш   (α = 11.6 + 7·v на улице, 9.0 в помещении)
        4. r_total = r_wall + r_ins + r_ext
        5. q = ΔT / r_total (Вт/м², БЕЗ safety_factor)
        6. S — площадь по форме (cylinder/rectangle/sphere)
        7. Q = q · S · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры ёмкости. Требует указать геометрию,
            подходящую под `shape`: cylinder (d+h), rectangular (l+w+h), sphere (d).
        coefficients: аналогично `calc_pipe_heat_loss`.

    Returns:
        TankHeatLossResult: `heat_loss_per_m2` (q без K), `total_heat_loss` (Q с K),
        `surface_area` (S).

    Raises:
        ValueError: невалидная форма, отсутствие обязательной геометрии,
            невалидные температуры/толщины.

    See Also:
        formules.md, docs/context/formulas-summary.md
    """
    validate_positive("Толщина изоляции", )
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    t_mean = (params.ambient_temperature + params.process_temperature) / 2.0
    delta_t = params.process_temperature - params.ambient_temperature

    # --- 1. Сопротивление стенки резервуара ---
    r_wall = 0.0
    if params.wall_thickness is not None and params.wall_lambda is not None:
        validate_positive("Толщина стенки резервуара", params.wall_thickness)
        validate_positive("Теплопроводность стенки резервуара", params.wall_lambda)
        r_wall = params.wall_thickness / params.wall_lambda

    # --- 2. Сопротивление изоляции (плоская стенка) ---
    lambda_ins = get_insulation_conductivity(
        material=params.insulation_material,
        temperature=t_mean,
    )
    r_ins = params.insulation_thickness / lambda_ins

    # --- 3. Внешнее сопротивление ---
    alpha = _calc_alpha(params)
    r_ext = 1.0 / alpha

    # --- 4–5. Тепловой поток на м² ---
    r_total = r_wall + r_ins + r_ext
    q_per_m2 = delta_t / r_total

    # --- 6. Площадь ---
    area = _surface_area(params)

    # --- 7. Коэффициент запаса ---
    merged = merge_coefficients(coefficients)
    k = params.safety_factor or merged.get("safety_factor", 1.1)

    # --- 8. Итоговые теплопотери ---
    q_total = q_per_m2 * area * k

    return TankHeatLossResult(
        heat_loss_per_m2=round(q_per_m2, 3),
        total_heat_loss=round(q_total, 3),
        surface_area=round(area, 3),
    )


def x_calc_tank_heat_loss__mutmut_5(
    params: TankHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> TankHeatLossResult:
    """Расчёт тепловых потерь ёмкости (модель плоской стенки).

    Упрощение: считаем все стенки плоскими (последовательное сопротивление),
    а площадь поверхности берём по геометрии (цилиндр / параллелепипед / шар).
    Для резервуаров d > 0.5 м кривизна практически не влияет на результат.

    Алгоритм:
        1. r_wall = δ_р / λ_р (если заданы толщина и λ стенки)
        2. r_ins  = δ_из / λ_из  (изоляция — плоская стенка)
        3. r_ext  = 1 / α_внеш   (α = 11.6 + 7·v на улице, 9.0 в помещении)
        4. r_total = r_wall + r_ins + r_ext
        5. q = ΔT / r_total (Вт/м², БЕЗ safety_factor)
        6. S — площадь по форме (cylinder/rectangle/sphere)
        7. Q = q · S · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры ёмкости. Требует указать геометрию,
            подходящую под `shape`: cylinder (d+h), rectangular (l+w+h), sphere (d).
        coefficients: аналогично `calc_pipe_heat_loss`.

    Returns:
        TankHeatLossResult: `heat_loss_per_m2` (q без K), `total_heat_loss` (Q с K),
        `surface_area` (S).

    Raises:
        ValueError: невалидная форма, отсутствие обязательной геометрии,
            невалидные температуры/толщины.

    See Also:
        formules.md, docs/context/formulas-summary.md
    """
    validate_positive("XXТолщина изоляцииXX", params.insulation_thickness)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    t_mean = (params.ambient_temperature + params.process_temperature) / 2.0
    delta_t = params.process_temperature - params.ambient_temperature

    # --- 1. Сопротивление стенки резервуара ---
    r_wall = 0.0
    if params.wall_thickness is not None and params.wall_lambda is not None:
        validate_positive("Толщина стенки резервуара", params.wall_thickness)
        validate_positive("Теплопроводность стенки резервуара", params.wall_lambda)
        r_wall = params.wall_thickness / params.wall_lambda

    # --- 2. Сопротивление изоляции (плоская стенка) ---
    lambda_ins = get_insulation_conductivity(
        material=params.insulation_material,
        temperature=t_mean,
    )
    r_ins = params.insulation_thickness / lambda_ins

    # --- 3. Внешнее сопротивление ---
    alpha = _calc_alpha(params)
    r_ext = 1.0 / alpha

    # --- 4–5. Тепловой поток на м² ---
    r_total = r_wall + r_ins + r_ext
    q_per_m2 = delta_t / r_total

    # --- 6. Площадь ---
    area = _surface_area(params)

    # --- 7. Коэффициент запаса ---
    merged = merge_coefficients(coefficients)
    k = params.safety_factor or merged.get("safety_factor", 1.1)

    # --- 8. Итоговые теплопотери ---
    q_total = q_per_m2 * area * k

    return TankHeatLossResult(
        heat_loss_per_m2=round(q_per_m2, 3),
        total_heat_loss=round(q_total, 3),
        surface_area=round(area, 3),
    )


def x_calc_tank_heat_loss__mutmut_6(
    params: TankHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> TankHeatLossResult:
    """Расчёт тепловых потерь ёмкости (модель плоской стенки).

    Упрощение: считаем все стенки плоскими (последовательное сопротивление),
    а площадь поверхности берём по геометрии (цилиндр / параллелепипед / шар).
    Для резервуаров d > 0.5 м кривизна практически не влияет на результат.

    Алгоритм:
        1. r_wall = δ_р / λ_р (если заданы толщина и λ стенки)
        2. r_ins  = δ_из / λ_из  (изоляция — плоская стенка)
        3. r_ext  = 1 / α_внеш   (α = 11.6 + 7·v на улице, 9.0 в помещении)
        4. r_total = r_wall + r_ins + r_ext
        5. q = ΔT / r_total (Вт/м², БЕЗ safety_factor)
        6. S — площадь по форме (cylinder/rectangle/sphere)
        7. Q = q · S · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры ёмкости. Требует указать геометрию,
            подходящую под `shape`: cylinder (d+h), rectangular (l+w+h), sphere (d).
        coefficients: аналогично `calc_pipe_heat_loss`.

    Returns:
        TankHeatLossResult: `heat_loss_per_m2` (q без K), `total_heat_loss` (Q с K),
        `surface_area` (S).

    Raises:
        ValueError: невалидная форма, отсутствие обязательной геометрии,
            невалидные температуры/толщины.

    See Also:
        formules.md, docs/context/formulas-summary.md
    """
    validate_positive("толщина изоляции", params.insulation_thickness)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    t_mean = (params.ambient_temperature + params.process_temperature) / 2.0
    delta_t = params.process_temperature - params.ambient_temperature

    # --- 1. Сопротивление стенки резервуара ---
    r_wall = 0.0
    if params.wall_thickness is not None and params.wall_lambda is not None:
        validate_positive("Толщина стенки резервуара", params.wall_thickness)
        validate_positive("Теплопроводность стенки резервуара", params.wall_lambda)
        r_wall = params.wall_thickness / params.wall_lambda

    # --- 2. Сопротивление изоляции (плоская стенка) ---
    lambda_ins = get_insulation_conductivity(
        material=params.insulation_material,
        temperature=t_mean,
    )
    r_ins = params.insulation_thickness / lambda_ins

    # --- 3. Внешнее сопротивление ---
    alpha = _calc_alpha(params)
    r_ext = 1.0 / alpha

    # --- 4–5. Тепловой поток на м² ---
    r_total = r_wall + r_ins + r_ext
    q_per_m2 = delta_t / r_total

    # --- 6. Площадь ---
    area = _surface_area(params)

    # --- 7. Коэффициент запаса ---
    merged = merge_coefficients(coefficients)
    k = params.safety_factor or merged.get("safety_factor", 1.1)

    # --- 8. Итоговые теплопотери ---
    q_total = q_per_m2 * area * k

    return TankHeatLossResult(
        heat_loss_per_m2=round(q_per_m2, 3),
        total_heat_loss=round(q_total, 3),
        surface_area=round(area, 3),
    )


def x_calc_tank_heat_loss__mutmut_7(
    params: TankHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> TankHeatLossResult:
    """Расчёт тепловых потерь ёмкости (модель плоской стенки).

    Упрощение: считаем все стенки плоскими (последовательное сопротивление),
    а площадь поверхности берём по геометрии (цилиндр / параллелепипед / шар).
    Для резервуаров d > 0.5 м кривизна практически не влияет на результат.

    Алгоритм:
        1. r_wall = δ_р / λ_р (если заданы толщина и λ стенки)
        2. r_ins  = δ_из / λ_из  (изоляция — плоская стенка)
        3. r_ext  = 1 / α_внеш   (α = 11.6 + 7·v на улице, 9.0 в помещении)
        4. r_total = r_wall + r_ins + r_ext
        5. q = ΔT / r_total (Вт/м², БЕЗ safety_factor)
        6. S — площадь по форме (cylinder/rectangle/sphere)
        7. Q = q · S · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры ёмкости. Требует указать геометрию,
            подходящую под `shape`: cylinder (d+h), rectangular (l+w+h), sphere (d).
        coefficients: аналогично `calc_pipe_heat_loss`.

    Returns:
        TankHeatLossResult: `heat_loss_per_m2` (q без K), `total_heat_loss` (Q с K),
        `surface_area` (S).

    Raises:
        ValueError: невалидная форма, отсутствие обязательной геометрии,
            невалидные температуры/толщины.

    See Also:
        formules.md, docs/context/formulas-summary.md
    """
    validate_positive("ТОЛЩИНА ИЗОЛЯЦИИ", params.insulation_thickness)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    t_mean = (params.ambient_temperature + params.process_temperature) / 2.0
    delta_t = params.process_temperature - params.ambient_temperature

    # --- 1. Сопротивление стенки резервуара ---
    r_wall = 0.0
    if params.wall_thickness is not None and params.wall_lambda is not None:
        validate_positive("Толщина стенки резервуара", params.wall_thickness)
        validate_positive("Теплопроводность стенки резервуара", params.wall_lambda)
        r_wall = params.wall_thickness / params.wall_lambda

    # --- 2. Сопротивление изоляции (плоская стенка) ---
    lambda_ins = get_insulation_conductivity(
        material=params.insulation_material,
        temperature=t_mean,
    )
    r_ins = params.insulation_thickness / lambda_ins

    # --- 3. Внешнее сопротивление ---
    alpha = _calc_alpha(params)
    r_ext = 1.0 / alpha

    # --- 4–5. Тепловой поток на м² ---
    r_total = r_wall + r_ins + r_ext
    q_per_m2 = delta_t / r_total

    # --- 6. Площадь ---
    area = _surface_area(params)

    # --- 7. Коэффициент запаса ---
    merged = merge_coefficients(coefficients)
    k = params.safety_factor or merged.get("safety_factor", 1.1)

    # --- 8. Итоговые теплопотери ---
    q_total = q_per_m2 * area * k

    return TankHeatLossResult(
        heat_loss_per_m2=round(q_per_m2, 3),
        total_heat_loss=round(q_total, 3),
        surface_area=round(area, 3),
    )


def x_calc_tank_heat_loss__mutmut_8(
    params: TankHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> TankHeatLossResult:
    """Расчёт тепловых потерь ёмкости (модель плоской стенки).

    Упрощение: считаем все стенки плоскими (последовательное сопротивление),
    а площадь поверхности берём по геометрии (цилиндр / параллелепипед / шар).
    Для резервуаров d > 0.5 м кривизна практически не влияет на результат.

    Алгоритм:
        1. r_wall = δ_р / λ_р (если заданы толщина и λ стенки)
        2. r_ins  = δ_из / λ_из  (изоляция — плоская стенка)
        3. r_ext  = 1 / α_внеш   (α = 11.6 + 7·v на улице, 9.0 в помещении)
        4. r_total = r_wall + r_ins + r_ext
        5. q = ΔT / r_total (Вт/м², БЕЗ safety_factor)
        6. S — площадь по форме (cylinder/rectangle/sphere)
        7. Q = q · S · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры ёмкости. Требует указать геометрию,
            подходящую под `shape`: cylinder (d+h), rectangular (l+w+h), sphere (d).
        coefficients: аналогично `calc_pipe_heat_loss`.

    Returns:
        TankHeatLossResult: `heat_loss_per_m2` (q без K), `total_heat_loss` (Q с K),
        `surface_area` (S).

    Raises:
        ValueError: невалидная форма, отсутствие обязательной геометрии,
            невалидные температуры/толщины.

    See Also:
        formules.md, docs/context/formulas-summary.md
    """
    validate_positive("Толщина изоляции", params.insulation_thickness)
    validate_temperature_range(None, params.process_temperature)

    t_mean = (params.ambient_temperature + params.process_temperature) / 2.0
    delta_t = params.process_temperature - params.ambient_temperature

    # --- 1. Сопротивление стенки резервуара ---
    r_wall = 0.0
    if params.wall_thickness is not None and params.wall_lambda is not None:
        validate_positive("Толщина стенки резервуара", params.wall_thickness)
        validate_positive("Теплопроводность стенки резервуара", params.wall_lambda)
        r_wall = params.wall_thickness / params.wall_lambda

    # --- 2. Сопротивление изоляции (плоская стенка) ---
    lambda_ins = get_insulation_conductivity(
        material=params.insulation_material,
        temperature=t_mean,
    )
    r_ins = params.insulation_thickness / lambda_ins

    # --- 3. Внешнее сопротивление ---
    alpha = _calc_alpha(params)
    r_ext = 1.0 / alpha

    # --- 4–5. Тепловой поток на м² ---
    r_total = r_wall + r_ins + r_ext
    q_per_m2 = delta_t / r_total

    # --- 6. Площадь ---
    area = _surface_area(params)

    # --- 7. Коэффициент запаса ---
    merged = merge_coefficients(coefficients)
    k = params.safety_factor or merged.get("safety_factor", 1.1)

    # --- 8. Итоговые теплопотери ---
    q_total = q_per_m2 * area * k

    return TankHeatLossResult(
        heat_loss_per_m2=round(q_per_m2, 3),
        total_heat_loss=round(q_total, 3),
        surface_area=round(area, 3),
    )


def x_calc_tank_heat_loss__mutmut_9(
    params: TankHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> TankHeatLossResult:
    """Расчёт тепловых потерь ёмкости (модель плоской стенки).

    Упрощение: считаем все стенки плоскими (последовательное сопротивление),
    а площадь поверхности берём по геометрии (цилиндр / параллелепипед / шар).
    Для резервуаров d > 0.5 м кривизна практически не влияет на результат.

    Алгоритм:
        1. r_wall = δ_р / λ_р (если заданы толщина и λ стенки)
        2. r_ins  = δ_из / λ_из  (изоляция — плоская стенка)
        3. r_ext  = 1 / α_внеш   (α = 11.6 + 7·v на улице, 9.0 в помещении)
        4. r_total = r_wall + r_ins + r_ext
        5. q = ΔT / r_total (Вт/м², БЕЗ safety_factor)
        6. S — площадь по форме (cylinder/rectangle/sphere)
        7. Q = q · S · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры ёмкости. Требует указать геометрию,
            подходящую под `shape`: cylinder (d+h), rectangular (l+w+h), sphere (d).
        coefficients: аналогично `calc_pipe_heat_loss`.

    Returns:
        TankHeatLossResult: `heat_loss_per_m2` (q без K), `total_heat_loss` (Q с K),
        `surface_area` (S).

    Raises:
        ValueError: невалидная форма, отсутствие обязательной геометрии,
            невалидные температуры/толщины.

    See Also:
        formules.md, docs/context/formulas-summary.md
    """
    validate_positive("Толщина изоляции", params.insulation_thickness)
    validate_temperature_range(params.ambient_temperature, None)

    t_mean = (params.ambient_temperature + params.process_temperature) / 2.0
    delta_t = params.process_temperature - params.ambient_temperature

    # --- 1. Сопротивление стенки резервуара ---
    r_wall = 0.0
    if params.wall_thickness is not None and params.wall_lambda is not None:
        validate_positive("Толщина стенки резервуара", params.wall_thickness)
        validate_positive("Теплопроводность стенки резервуара", params.wall_lambda)
        r_wall = params.wall_thickness / params.wall_lambda

    # --- 2. Сопротивление изоляции (плоская стенка) ---
    lambda_ins = get_insulation_conductivity(
        material=params.insulation_material,
        temperature=t_mean,
    )
    r_ins = params.insulation_thickness / lambda_ins

    # --- 3. Внешнее сопротивление ---
    alpha = _calc_alpha(params)
    r_ext = 1.0 / alpha

    # --- 4–5. Тепловой поток на м² ---
    r_total = r_wall + r_ins + r_ext
    q_per_m2 = delta_t / r_total

    # --- 6. Площадь ---
    area = _surface_area(params)

    # --- 7. Коэффициент запаса ---
    merged = merge_coefficients(coefficients)
    k = params.safety_factor or merged.get("safety_factor", 1.1)

    # --- 8. Итоговые теплопотери ---
    q_total = q_per_m2 * area * k

    return TankHeatLossResult(
        heat_loss_per_m2=round(q_per_m2, 3),
        total_heat_loss=round(q_total, 3),
        surface_area=round(area, 3),
    )


def x_calc_tank_heat_loss__mutmut_10(
    params: TankHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> TankHeatLossResult:
    """Расчёт тепловых потерь ёмкости (модель плоской стенки).

    Упрощение: считаем все стенки плоскими (последовательное сопротивление),
    а площадь поверхности берём по геометрии (цилиндр / параллелепипед / шар).
    Для резервуаров d > 0.5 м кривизна практически не влияет на результат.

    Алгоритм:
        1. r_wall = δ_р / λ_р (если заданы толщина и λ стенки)
        2. r_ins  = δ_из / λ_из  (изоляция — плоская стенка)
        3. r_ext  = 1 / α_внеш   (α = 11.6 + 7·v на улице, 9.0 в помещении)
        4. r_total = r_wall + r_ins + r_ext
        5. q = ΔT / r_total (Вт/м², БЕЗ safety_factor)
        6. S — площадь по форме (cylinder/rectangle/sphere)
        7. Q = q · S · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры ёмкости. Требует указать геометрию,
            подходящую под `shape`: cylinder (d+h), rectangular (l+w+h), sphere (d).
        coefficients: аналогично `calc_pipe_heat_loss`.

    Returns:
        TankHeatLossResult: `heat_loss_per_m2` (q без K), `total_heat_loss` (Q с K),
        `surface_area` (S).

    Raises:
        ValueError: невалидная форма, отсутствие обязательной геометрии,
            невалидные температуры/толщины.

    See Also:
        formules.md, docs/context/formulas-summary.md
    """
    validate_positive("Толщина изоляции", params.insulation_thickness)
    validate_temperature_range(params.process_temperature)

    t_mean = (params.ambient_temperature + params.process_temperature) / 2.0
    delta_t = params.process_temperature - params.ambient_temperature

    # --- 1. Сопротивление стенки резервуара ---
    r_wall = 0.0
    if params.wall_thickness is not None and params.wall_lambda is not None:
        validate_positive("Толщина стенки резервуара", params.wall_thickness)
        validate_positive("Теплопроводность стенки резервуара", params.wall_lambda)
        r_wall = params.wall_thickness / params.wall_lambda

    # --- 2. Сопротивление изоляции (плоская стенка) ---
    lambda_ins = get_insulation_conductivity(
        material=params.insulation_material,
        temperature=t_mean,
    )
    r_ins = params.insulation_thickness / lambda_ins

    # --- 3. Внешнее сопротивление ---
    alpha = _calc_alpha(params)
    r_ext = 1.0 / alpha

    # --- 4–5. Тепловой поток на м² ---
    r_total = r_wall + r_ins + r_ext
    q_per_m2 = delta_t / r_total

    # --- 6. Площадь ---
    area = _surface_area(params)

    # --- 7. Коэффициент запаса ---
    merged = merge_coefficients(coefficients)
    k = params.safety_factor or merged.get("safety_factor", 1.1)

    # --- 8. Итоговые теплопотери ---
    q_total = q_per_m2 * area * k

    return TankHeatLossResult(
        heat_loss_per_m2=round(q_per_m2, 3),
        total_heat_loss=round(q_total, 3),
        surface_area=round(area, 3),
    )


def x_calc_tank_heat_loss__mutmut_11(
    params: TankHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> TankHeatLossResult:
    """Расчёт тепловых потерь ёмкости (модель плоской стенки).

    Упрощение: считаем все стенки плоскими (последовательное сопротивление),
    а площадь поверхности берём по геометрии (цилиндр / параллелепипед / шар).
    Для резервуаров d > 0.5 м кривизна практически не влияет на результат.

    Алгоритм:
        1. r_wall = δ_р / λ_р (если заданы толщина и λ стенки)
        2. r_ins  = δ_из / λ_из  (изоляция — плоская стенка)
        3. r_ext  = 1 / α_внеш   (α = 11.6 + 7·v на улице, 9.0 в помещении)
        4. r_total = r_wall + r_ins + r_ext
        5. q = ΔT / r_total (Вт/м², БЕЗ safety_factor)
        6. S — площадь по форме (cylinder/rectangle/sphere)
        7. Q = q · S · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры ёмкости. Требует указать геометрию,
            подходящую под `shape`: cylinder (d+h), rectangular (l+w+h), sphere (d).
        coefficients: аналогично `calc_pipe_heat_loss`.

    Returns:
        TankHeatLossResult: `heat_loss_per_m2` (q без K), `total_heat_loss` (Q с K),
        `surface_area` (S).

    Raises:
        ValueError: невалидная форма, отсутствие обязательной геометрии,
            невалидные температуры/толщины.

    See Also:
        formules.md, docs/context/formulas-summary.md
    """
    validate_positive("Толщина изоляции", params.insulation_thickness)
    validate_temperature_range(params.ambient_temperature, )

    t_mean = (params.ambient_temperature + params.process_temperature) / 2.0
    delta_t = params.process_temperature - params.ambient_temperature

    # --- 1. Сопротивление стенки резервуара ---
    r_wall = 0.0
    if params.wall_thickness is not None and params.wall_lambda is not None:
        validate_positive("Толщина стенки резервуара", params.wall_thickness)
        validate_positive("Теплопроводность стенки резервуара", params.wall_lambda)
        r_wall = params.wall_thickness / params.wall_lambda

    # --- 2. Сопротивление изоляции (плоская стенка) ---
    lambda_ins = get_insulation_conductivity(
        material=params.insulation_material,
        temperature=t_mean,
    )
    r_ins = params.insulation_thickness / lambda_ins

    # --- 3. Внешнее сопротивление ---
    alpha = _calc_alpha(params)
    r_ext = 1.0 / alpha

    # --- 4–5. Тепловой поток на м² ---
    r_total = r_wall + r_ins + r_ext
    q_per_m2 = delta_t / r_total

    # --- 6. Площадь ---
    area = _surface_area(params)

    # --- 7. Коэффициент запаса ---
    merged = merge_coefficients(coefficients)
    k = params.safety_factor or merged.get("safety_factor", 1.1)

    # --- 8. Итоговые теплопотери ---
    q_total = q_per_m2 * area * k

    return TankHeatLossResult(
        heat_loss_per_m2=round(q_per_m2, 3),
        total_heat_loss=round(q_total, 3),
        surface_area=round(area, 3),
    )


def x_calc_tank_heat_loss__mutmut_12(
    params: TankHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> TankHeatLossResult:
    """Расчёт тепловых потерь ёмкости (модель плоской стенки).

    Упрощение: считаем все стенки плоскими (последовательное сопротивление),
    а площадь поверхности берём по геометрии (цилиндр / параллелепипед / шар).
    Для резервуаров d > 0.5 м кривизна практически не влияет на результат.

    Алгоритм:
        1. r_wall = δ_р / λ_р (если заданы толщина и λ стенки)
        2. r_ins  = δ_из / λ_из  (изоляция — плоская стенка)
        3. r_ext  = 1 / α_внеш   (α = 11.6 + 7·v на улице, 9.0 в помещении)
        4. r_total = r_wall + r_ins + r_ext
        5. q = ΔT / r_total (Вт/м², БЕЗ safety_factor)
        6. S — площадь по форме (cylinder/rectangle/sphere)
        7. Q = q · S · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры ёмкости. Требует указать геометрию,
            подходящую под `shape`: cylinder (d+h), rectangular (l+w+h), sphere (d).
        coefficients: аналогично `calc_pipe_heat_loss`.

    Returns:
        TankHeatLossResult: `heat_loss_per_m2` (q без K), `total_heat_loss` (Q с K),
        `surface_area` (S).

    Raises:
        ValueError: невалидная форма, отсутствие обязательной геометрии,
            невалидные температуры/толщины.

    See Also:
        formules.md, docs/context/formulas-summary.md
    """
    validate_positive("Толщина изоляции", params.insulation_thickness)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    t_mean = None
    delta_t = params.process_temperature - params.ambient_temperature

    # --- 1. Сопротивление стенки резервуара ---
    r_wall = 0.0
    if params.wall_thickness is not None and params.wall_lambda is not None:
        validate_positive("Толщина стенки резервуара", params.wall_thickness)
        validate_positive("Теплопроводность стенки резервуара", params.wall_lambda)
        r_wall = params.wall_thickness / params.wall_lambda

    # --- 2. Сопротивление изоляции (плоская стенка) ---
    lambda_ins = get_insulation_conductivity(
        material=params.insulation_material,
        temperature=t_mean,
    )
    r_ins = params.insulation_thickness / lambda_ins

    # --- 3. Внешнее сопротивление ---
    alpha = _calc_alpha(params)
    r_ext = 1.0 / alpha

    # --- 4–5. Тепловой поток на м² ---
    r_total = r_wall + r_ins + r_ext
    q_per_m2 = delta_t / r_total

    # --- 6. Площадь ---
    area = _surface_area(params)

    # --- 7. Коэффициент запаса ---
    merged = merge_coefficients(coefficients)
    k = params.safety_factor or merged.get("safety_factor", 1.1)

    # --- 8. Итоговые теплопотери ---
    q_total = q_per_m2 * area * k

    return TankHeatLossResult(
        heat_loss_per_m2=round(q_per_m2, 3),
        total_heat_loss=round(q_total, 3),
        surface_area=round(area, 3),
    )


def x_calc_tank_heat_loss__mutmut_13(
    params: TankHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> TankHeatLossResult:
    """Расчёт тепловых потерь ёмкости (модель плоской стенки).

    Упрощение: считаем все стенки плоскими (последовательное сопротивление),
    а площадь поверхности берём по геометрии (цилиндр / параллелепипед / шар).
    Для резервуаров d > 0.5 м кривизна практически не влияет на результат.

    Алгоритм:
        1. r_wall = δ_р / λ_р (если заданы толщина и λ стенки)
        2. r_ins  = δ_из / λ_из  (изоляция — плоская стенка)
        3. r_ext  = 1 / α_внеш   (α = 11.6 + 7·v на улице, 9.0 в помещении)
        4. r_total = r_wall + r_ins + r_ext
        5. q = ΔT / r_total (Вт/м², БЕЗ safety_factor)
        6. S — площадь по форме (cylinder/rectangle/sphere)
        7. Q = q · S · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры ёмкости. Требует указать геометрию,
            подходящую под `shape`: cylinder (d+h), rectangular (l+w+h), sphere (d).
        coefficients: аналогично `calc_pipe_heat_loss`.

    Returns:
        TankHeatLossResult: `heat_loss_per_m2` (q без K), `total_heat_loss` (Q с K),
        `surface_area` (S).

    Raises:
        ValueError: невалидная форма, отсутствие обязательной геометрии,
            невалидные температуры/толщины.

    See Also:
        formules.md, docs/context/formulas-summary.md
    """
    validate_positive("Толщина изоляции", params.insulation_thickness)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    t_mean = (params.ambient_temperature + params.process_temperature) * 2.0
    delta_t = params.process_temperature - params.ambient_temperature

    # --- 1. Сопротивление стенки резервуара ---
    r_wall = 0.0
    if params.wall_thickness is not None and params.wall_lambda is not None:
        validate_positive("Толщина стенки резервуара", params.wall_thickness)
        validate_positive("Теплопроводность стенки резервуара", params.wall_lambda)
        r_wall = params.wall_thickness / params.wall_lambda

    # --- 2. Сопротивление изоляции (плоская стенка) ---
    lambda_ins = get_insulation_conductivity(
        material=params.insulation_material,
        temperature=t_mean,
    )
    r_ins = params.insulation_thickness / lambda_ins

    # --- 3. Внешнее сопротивление ---
    alpha = _calc_alpha(params)
    r_ext = 1.0 / alpha

    # --- 4–5. Тепловой поток на м² ---
    r_total = r_wall + r_ins + r_ext
    q_per_m2 = delta_t / r_total

    # --- 6. Площадь ---
    area = _surface_area(params)

    # --- 7. Коэффициент запаса ---
    merged = merge_coefficients(coefficients)
    k = params.safety_factor or merged.get("safety_factor", 1.1)

    # --- 8. Итоговые теплопотери ---
    q_total = q_per_m2 * area * k

    return TankHeatLossResult(
        heat_loss_per_m2=round(q_per_m2, 3),
        total_heat_loss=round(q_total, 3),
        surface_area=round(area, 3),
    )


def x_calc_tank_heat_loss__mutmut_14(
    params: TankHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> TankHeatLossResult:
    """Расчёт тепловых потерь ёмкости (модель плоской стенки).

    Упрощение: считаем все стенки плоскими (последовательное сопротивление),
    а площадь поверхности берём по геометрии (цилиндр / параллелепипед / шар).
    Для резервуаров d > 0.5 м кривизна практически не влияет на результат.

    Алгоритм:
        1. r_wall = δ_р / λ_р (если заданы толщина и λ стенки)
        2. r_ins  = δ_из / λ_из  (изоляция — плоская стенка)
        3. r_ext  = 1 / α_внеш   (α = 11.6 + 7·v на улице, 9.0 в помещении)
        4. r_total = r_wall + r_ins + r_ext
        5. q = ΔT / r_total (Вт/м², БЕЗ safety_factor)
        6. S — площадь по форме (cylinder/rectangle/sphere)
        7. Q = q · S · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры ёмкости. Требует указать геометрию,
            подходящую под `shape`: cylinder (d+h), rectangular (l+w+h), sphere (d).
        coefficients: аналогично `calc_pipe_heat_loss`.

    Returns:
        TankHeatLossResult: `heat_loss_per_m2` (q без K), `total_heat_loss` (Q с K),
        `surface_area` (S).

    Raises:
        ValueError: невалидная форма, отсутствие обязательной геометрии,
            невалидные температуры/толщины.

    See Also:
        formules.md, docs/context/formulas-summary.md
    """
    validate_positive("Толщина изоляции", params.insulation_thickness)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    t_mean = (params.ambient_temperature - params.process_temperature) / 2.0
    delta_t = params.process_temperature - params.ambient_temperature

    # --- 1. Сопротивление стенки резервуара ---
    r_wall = 0.0
    if params.wall_thickness is not None and params.wall_lambda is not None:
        validate_positive("Толщина стенки резервуара", params.wall_thickness)
        validate_positive("Теплопроводность стенки резервуара", params.wall_lambda)
        r_wall = params.wall_thickness / params.wall_lambda

    # --- 2. Сопротивление изоляции (плоская стенка) ---
    lambda_ins = get_insulation_conductivity(
        material=params.insulation_material,
        temperature=t_mean,
    )
    r_ins = params.insulation_thickness / lambda_ins

    # --- 3. Внешнее сопротивление ---
    alpha = _calc_alpha(params)
    r_ext = 1.0 / alpha

    # --- 4–5. Тепловой поток на м² ---
    r_total = r_wall + r_ins + r_ext
    q_per_m2 = delta_t / r_total

    # --- 6. Площадь ---
    area = _surface_area(params)

    # --- 7. Коэффициент запаса ---
    merged = merge_coefficients(coefficients)
    k = params.safety_factor or merged.get("safety_factor", 1.1)

    # --- 8. Итоговые теплопотери ---
    q_total = q_per_m2 * area * k

    return TankHeatLossResult(
        heat_loss_per_m2=round(q_per_m2, 3),
        total_heat_loss=round(q_total, 3),
        surface_area=round(area, 3),
    )


def x_calc_tank_heat_loss__mutmut_15(
    params: TankHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> TankHeatLossResult:
    """Расчёт тепловых потерь ёмкости (модель плоской стенки).

    Упрощение: считаем все стенки плоскими (последовательное сопротивление),
    а площадь поверхности берём по геометрии (цилиндр / параллелепипед / шар).
    Для резервуаров d > 0.5 м кривизна практически не влияет на результат.

    Алгоритм:
        1. r_wall = δ_р / λ_р (если заданы толщина и λ стенки)
        2. r_ins  = δ_из / λ_из  (изоляция — плоская стенка)
        3. r_ext  = 1 / α_внеш   (α = 11.6 + 7·v на улице, 9.0 в помещении)
        4. r_total = r_wall + r_ins + r_ext
        5. q = ΔT / r_total (Вт/м², БЕЗ safety_factor)
        6. S — площадь по форме (cylinder/rectangle/sphere)
        7. Q = q · S · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры ёмкости. Требует указать геометрию,
            подходящую под `shape`: cylinder (d+h), rectangular (l+w+h), sphere (d).
        coefficients: аналогично `calc_pipe_heat_loss`.

    Returns:
        TankHeatLossResult: `heat_loss_per_m2` (q без K), `total_heat_loss` (Q с K),
        `surface_area` (S).

    Raises:
        ValueError: невалидная форма, отсутствие обязательной геометрии,
            невалидные температуры/толщины.

    See Also:
        formules.md, docs/context/formulas-summary.md
    """
    validate_positive("Толщина изоляции", params.insulation_thickness)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    t_mean = (params.ambient_temperature + params.process_temperature) / 3.0
    delta_t = params.process_temperature - params.ambient_temperature

    # --- 1. Сопротивление стенки резервуара ---
    r_wall = 0.0
    if params.wall_thickness is not None and params.wall_lambda is not None:
        validate_positive("Толщина стенки резервуара", params.wall_thickness)
        validate_positive("Теплопроводность стенки резервуара", params.wall_lambda)
        r_wall = params.wall_thickness / params.wall_lambda

    # --- 2. Сопротивление изоляции (плоская стенка) ---
    lambda_ins = get_insulation_conductivity(
        material=params.insulation_material,
        temperature=t_mean,
    )
    r_ins = params.insulation_thickness / lambda_ins

    # --- 3. Внешнее сопротивление ---
    alpha = _calc_alpha(params)
    r_ext = 1.0 / alpha

    # --- 4–5. Тепловой поток на м² ---
    r_total = r_wall + r_ins + r_ext
    q_per_m2 = delta_t / r_total

    # --- 6. Площадь ---
    area = _surface_area(params)

    # --- 7. Коэффициент запаса ---
    merged = merge_coefficients(coefficients)
    k = params.safety_factor or merged.get("safety_factor", 1.1)

    # --- 8. Итоговые теплопотери ---
    q_total = q_per_m2 * area * k

    return TankHeatLossResult(
        heat_loss_per_m2=round(q_per_m2, 3),
        total_heat_loss=round(q_total, 3),
        surface_area=round(area, 3),
    )


def x_calc_tank_heat_loss__mutmut_16(
    params: TankHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> TankHeatLossResult:
    """Расчёт тепловых потерь ёмкости (модель плоской стенки).

    Упрощение: считаем все стенки плоскими (последовательное сопротивление),
    а площадь поверхности берём по геометрии (цилиндр / параллелепипед / шар).
    Для резервуаров d > 0.5 м кривизна практически не влияет на результат.

    Алгоритм:
        1. r_wall = δ_р / λ_р (если заданы толщина и λ стенки)
        2. r_ins  = δ_из / λ_из  (изоляция — плоская стенка)
        3. r_ext  = 1 / α_внеш   (α = 11.6 + 7·v на улице, 9.0 в помещении)
        4. r_total = r_wall + r_ins + r_ext
        5. q = ΔT / r_total (Вт/м², БЕЗ safety_factor)
        6. S — площадь по форме (cylinder/rectangle/sphere)
        7. Q = q · S · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры ёмкости. Требует указать геометрию,
            подходящую под `shape`: cylinder (d+h), rectangular (l+w+h), sphere (d).
        coefficients: аналогично `calc_pipe_heat_loss`.

    Returns:
        TankHeatLossResult: `heat_loss_per_m2` (q без K), `total_heat_loss` (Q с K),
        `surface_area` (S).

    Raises:
        ValueError: невалидная форма, отсутствие обязательной геометрии,
            невалидные температуры/толщины.

    See Also:
        formules.md, docs/context/formulas-summary.md
    """
    validate_positive("Толщина изоляции", params.insulation_thickness)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    t_mean = (params.ambient_temperature + params.process_temperature) / 2.0
    delta_t = None

    # --- 1. Сопротивление стенки резервуара ---
    r_wall = 0.0
    if params.wall_thickness is not None and params.wall_lambda is not None:
        validate_positive("Толщина стенки резервуара", params.wall_thickness)
        validate_positive("Теплопроводность стенки резервуара", params.wall_lambda)
        r_wall = params.wall_thickness / params.wall_lambda

    # --- 2. Сопротивление изоляции (плоская стенка) ---
    lambda_ins = get_insulation_conductivity(
        material=params.insulation_material,
        temperature=t_mean,
    )
    r_ins = params.insulation_thickness / lambda_ins

    # --- 3. Внешнее сопротивление ---
    alpha = _calc_alpha(params)
    r_ext = 1.0 / alpha

    # --- 4–5. Тепловой поток на м² ---
    r_total = r_wall + r_ins + r_ext
    q_per_m2 = delta_t / r_total

    # --- 6. Площадь ---
    area = _surface_area(params)

    # --- 7. Коэффициент запаса ---
    merged = merge_coefficients(coefficients)
    k = params.safety_factor or merged.get("safety_factor", 1.1)

    # --- 8. Итоговые теплопотери ---
    q_total = q_per_m2 * area * k

    return TankHeatLossResult(
        heat_loss_per_m2=round(q_per_m2, 3),
        total_heat_loss=round(q_total, 3),
        surface_area=round(area, 3),
    )


def x_calc_tank_heat_loss__mutmut_17(
    params: TankHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> TankHeatLossResult:
    """Расчёт тепловых потерь ёмкости (модель плоской стенки).

    Упрощение: считаем все стенки плоскими (последовательное сопротивление),
    а площадь поверхности берём по геометрии (цилиндр / параллелепипед / шар).
    Для резервуаров d > 0.5 м кривизна практически не влияет на результат.

    Алгоритм:
        1. r_wall = δ_р / λ_р (если заданы толщина и λ стенки)
        2. r_ins  = δ_из / λ_из  (изоляция — плоская стенка)
        3. r_ext  = 1 / α_внеш   (α = 11.6 + 7·v на улице, 9.0 в помещении)
        4. r_total = r_wall + r_ins + r_ext
        5. q = ΔT / r_total (Вт/м², БЕЗ safety_factor)
        6. S — площадь по форме (cylinder/rectangle/sphere)
        7. Q = q · S · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры ёмкости. Требует указать геометрию,
            подходящую под `shape`: cylinder (d+h), rectangular (l+w+h), sphere (d).
        coefficients: аналогично `calc_pipe_heat_loss`.

    Returns:
        TankHeatLossResult: `heat_loss_per_m2` (q без K), `total_heat_loss` (Q с K),
        `surface_area` (S).

    Raises:
        ValueError: невалидная форма, отсутствие обязательной геометрии,
            невалидные температуры/толщины.

    See Also:
        formules.md, docs/context/formulas-summary.md
    """
    validate_positive("Толщина изоляции", params.insulation_thickness)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    t_mean = (params.ambient_temperature + params.process_temperature) / 2.0
    delta_t = params.process_temperature + params.ambient_temperature

    # --- 1. Сопротивление стенки резервуара ---
    r_wall = 0.0
    if params.wall_thickness is not None and params.wall_lambda is not None:
        validate_positive("Толщина стенки резервуара", params.wall_thickness)
        validate_positive("Теплопроводность стенки резервуара", params.wall_lambda)
        r_wall = params.wall_thickness / params.wall_lambda

    # --- 2. Сопротивление изоляции (плоская стенка) ---
    lambda_ins = get_insulation_conductivity(
        material=params.insulation_material,
        temperature=t_mean,
    )
    r_ins = params.insulation_thickness / lambda_ins

    # --- 3. Внешнее сопротивление ---
    alpha = _calc_alpha(params)
    r_ext = 1.0 / alpha

    # --- 4–5. Тепловой поток на м² ---
    r_total = r_wall + r_ins + r_ext
    q_per_m2 = delta_t / r_total

    # --- 6. Площадь ---
    area = _surface_area(params)

    # --- 7. Коэффициент запаса ---
    merged = merge_coefficients(coefficients)
    k = params.safety_factor or merged.get("safety_factor", 1.1)

    # --- 8. Итоговые теплопотери ---
    q_total = q_per_m2 * area * k

    return TankHeatLossResult(
        heat_loss_per_m2=round(q_per_m2, 3),
        total_heat_loss=round(q_total, 3),
        surface_area=round(area, 3),
    )


def x_calc_tank_heat_loss__mutmut_18(
    params: TankHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> TankHeatLossResult:
    """Расчёт тепловых потерь ёмкости (модель плоской стенки).

    Упрощение: считаем все стенки плоскими (последовательное сопротивление),
    а площадь поверхности берём по геометрии (цилиндр / параллелепипед / шар).
    Для резервуаров d > 0.5 м кривизна практически не влияет на результат.

    Алгоритм:
        1. r_wall = δ_р / λ_р (если заданы толщина и λ стенки)
        2. r_ins  = δ_из / λ_из  (изоляция — плоская стенка)
        3. r_ext  = 1 / α_внеш   (α = 11.6 + 7·v на улице, 9.0 в помещении)
        4. r_total = r_wall + r_ins + r_ext
        5. q = ΔT / r_total (Вт/м², БЕЗ safety_factor)
        6. S — площадь по форме (cylinder/rectangle/sphere)
        7. Q = q · S · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры ёмкости. Требует указать геометрию,
            подходящую под `shape`: cylinder (d+h), rectangular (l+w+h), sphere (d).
        coefficients: аналогично `calc_pipe_heat_loss`.

    Returns:
        TankHeatLossResult: `heat_loss_per_m2` (q без K), `total_heat_loss` (Q с K),
        `surface_area` (S).

    Raises:
        ValueError: невалидная форма, отсутствие обязательной геометрии,
            невалидные температуры/толщины.

    See Also:
        formules.md, docs/context/formulas-summary.md
    """
    validate_positive("Толщина изоляции", params.insulation_thickness)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    t_mean = (params.ambient_temperature + params.process_temperature) / 2.0
    delta_t = params.process_temperature - params.ambient_temperature

    # --- 1. Сопротивление стенки резервуара ---
    r_wall = None
    if params.wall_thickness is not None and params.wall_lambda is not None:
        validate_positive("Толщина стенки резервуара", params.wall_thickness)
        validate_positive("Теплопроводность стенки резервуара", params.wall_lambda)
        r_wall = params.wall_thickness / params.wall_lambda

    # --- 2. Сопротивление изоляции (плоская стенка) ---
    lambda_ins = get_insulation_conductivity(
        material=params.insulation_material,
        temperature=t_mean,
    )
    r_ins = params.insulation_thickness / lambda_ins

    # --- 3. Внешнее сопротивление ---
    alpha = _calc_alpha(params)
    r_ext = 1.0 / alpha

    # --- 4–5. Тепловой поток на м² ---
    r_total = r_wall + r_ins + r_ext
    q_per_m2 = delta_t / r_total

    # --- 6. Площадь ---
    area = _surface_area(params)

    # --- 7. Коэффициент запаса ---
    merged = merge_coefficients(coefficients)
    k = params.safety_factor or merged.get("safety_factor", 1.1)

    # --- 8. Итоговые теплопотери ---
    q_total = q_per_m2 * area * k

    return TankHeatLossResult(
        heat_loss_per_m2=round(q_per_m2, 3),
        total_heat_loss=round(q_total, 3),
        surface_area=round(area, 3),
    )


def x_calc_tank_heat_loss__mutmut_19(
    params: TankHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> TankHeatLossResult:
    """Расчёт тепловых потерь ёмкости (модель плоской стенки).

    Упрощение: считаем все стенки плоскими (последовательное сопротивление),
    а площадь поверхности берём по геометрии (цилиндр / параллелепипед / шар).
    Для резервуаров d > 0.5 м кривизна практически не влияет на результат.

    Алгоритм:
        1. r_wall = δ_р / λ_р (если заданы толщина и λ стенки)
        2. r_ins  = δ_из / λ_из  (изоляция — плоская стенка)
        3. r_ext  = 1 / α_внеш   (α = 11.6 + 7·v на улице, 9.0 в помещении)
        4. r_total = r_wall + r_ins + r_ext
        5. q = ΔT / r_total (Вт/м², БЕЗ safety_factor)
        6. S — площадь по форме (cylinder/rectangle/sphere)
        7. Q = q · S · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры ёмкости. Требует указать геометрию,
            подходящую под `shape`: cylinder (d+h), rectangular (l+w+h), sphere (d).
        coefficients: аналогично `calc_pipe_heat_loss`.

    Returns:
        TankHeatLossResult: `heat_loss_per_m2` (q без K), `total_heat_loss` (Q с K),
        `surface_area` (S).

    Raises:
        ValueError: невалидная форма, отсутствие обязательной геометрии,
            невалидные температуры/толщины.

    See Also:
        formules.md, docs/context/formulas-summary.md
    """
    validate_positive("Толщина изоляции", params.insulation_thickness)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    t_mean = (params.ambient_temperature + params.process_temperature) / 2.0
    delta_t = params.process_temperature - params.ambient_temperature

    # --- 1. Сопротивление стенки резервуара ---
    r_wall = 1.0
    if params.wall_thickness is not None and params.wall_lambda is not None:
        validate_positive("Толщина стенки резервуара", params.wall_thickness)
        validate_positive("Теплопроводность стенки резервуара", params.wall_lambda)
        r_wall = params.wall_thickness / params.wall_lambda

    # --- 2. Сопротивление изоляции (плоская стенка) ---
    lambda_ins = get_insulation_conductivity(
        material=params.insulation_material,
        temperature=t_mean,
    )
    r_ins = params.insulation_thickness / lambda_ins

    # --- 3. Внешнее сопротивление ---
    alpha = _calc_alpha(params)
    r_ext = 1.0 / alpha

    # --- 4–5. Тепловой поток на м² ---
    r_total = r_wall + r_ins + r_ext
    q_per_m2 = delta_t / r_total

    # --- 6. Площадь ---
    area = _surface_area(params)

    # --- 7. Коэффициент запаса ---
    merged = merge_coefficients(coefficients)
    k = params.safety_factor or merged.get("safety_factor", 1.1)

    # --- 8. Итоговые теплопотери ---
    q_total = q_per_m2 * area * k

    return TankHeatLossResult(
        heat_loss_per_m2=round(q_per_m2, 3),
        total_heat_loss=round(q_total, 3),
        surface_area=round(area, 3),
    )


def x_calc_tank_heat_loss__mutmut_20(
    params: TankHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> TankHeatLossResult:
    """Расчёт тепловых потерь ёмкости (модель плоской стенки).

    Упрощение: считаем все стенки плоскими (последовательное сопротивление),
    а площадь поверхности берём по геометрии (цилиндр / параллелепипед / шар).
    Для резервуаров d > 0.5 м кривизна практически не влияет на результат.

    Алгоритм:
        1. r_wall = δ_р / λ_р (если заданы толщина и λ стенки)
        2. r_ins  = δ_из / λ_из  (изоляция — плоская стенка)
        3. r_ext  = 1 / α_внеш   (α = 11.6 + 7·v на улице, 9.0 в помещении)
        4. r_total = r_wall + r_ins + r_ext
        5. q = ΔT / r_total (Вт/м², БЕЗ safety_factor)
        6. S — площадь по форме (cylinder/rectangle/sphere)
        7. Q = q · S · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры ёмкости. Требует указать геометрию,
            подходящую под `shape`: cylinder (d+h), rectangular (l+w+h), sphere (d).
        coefficients: аналогично `calc_pipe_heat_loss`.

    Returns:
        TankHeatLossResult: `heat_loss_per_m2` (q без K), `total_heat_loss` (Q с K),
        `surface_area` (S).

    Raises:
        ValueError: невалидная форма, отсутствие обязательной геометрии,
            невалидные температуры/толщины.

    See Also:
        formules.md, docs/context/formulas-summary.md
    """
    validate_positive("Толщина изоляции", params.insulation_thickness)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    t_mean = (params.ambient_temperature + params.process_temperature) / 2.0
    delta_t = params.process_temperature - params.ambient_temperature

    # --- 1. Сопротивление стенки резервуара ---
    r_wall = 0.0
    if params.wall_thickness is not None or params.wall_lambda is not None:
        validate_positive("Толщина стенки резервуара", params.wall_thickness)
        validate_positive("Теплопроводность стенки резервуара", params.wall_lambda)
        r_wall = params.wall_thickness / params.wall_lambda

    # --- 2. Сопротивление изоляции (плоская стенка) ---
    lambda_ins = get_insulation_conductivity(
        material=params.insulation_material,
        temperature=t_mean,
    )
    r_ins = params.insulation_thickness / lambda_ins

    # --- 3. Внешнее сопротивление ---
    alpha = _calc_alpha(params)
    r_ext = 1.0 / alpha

    # --- 4–5. Тепловой поток на м² ---
    r_total = r_wall + r_ins + r_ext
    q_per_m2 = delta_t / r_total

    # --- 6. Площадь ---
    area = _surface_area(params)

    # --- 7. Коэффициент запаса ---
    merged = merge_coefficients(coefficients)
    k = params.safety_factor or merged.get("safety_factor", 1.1)

    # --- 8. Итоговые теплопотери ---
    q_total = q_per_m2 * area * k

    return TankHeatLossResult(
        heat_loss_per_m2=round(q_per_m2, 3),
        total_heat_loss=round(q_total, 3),
        surface_area=round(area, 3),
    )


def x_calc_tank_heat_loss__mutmut_21(
    params: TankHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> TankHeatLossResult:
    """Расчёт тепловых потерь ёмкости (модель плоской стенки).

    Упрощение: считаем все стенки плоскими (последовательное сопротивление),
    а площадь поверхности берём по геометрии (цилиндр / параллелепипед / шар).
    Для резервуаров d > 0.5 м кривизна практически не влияет на результат.

    Алгоритм:
        1. r_wall = δ_р / λ_р (если заданы толщина и λ стенки)
        2. r_ins  = δ_из / λ_из  (изоляция — плоская стенка)
        3. r_ext  = 1 / α_внеш   (α = 11.6 + 7·v на улице, 9.0 в помещении)
        4. r_total = r_wall + r_ins + r_ext
        5. q = ΔT / r_total (Вт/м², БЕЗ safety_factor)
        6. S — площадь по форме (cylinder/rectangle/sphere)
        7. Q = q · S · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры ёмкости. Требует указать геометрию,
            подходящую под `shape`: cylinder (d+h), rectangular (l+w+h), sphere (d).
        coefficients: аналогично `calc_pipe_heat_loss`.

    Returns:
        TankHeatLossResult: `heat_loss_per_m2` (q без K), `total_heat_loss` (Q с K),
        `surface_area` (S).

    Raises:
        ValueError: невалидная форма, отсутствие обязательной геометрии,
            невалидные температуры/толщины.

    See Also:
        formules.md, docs/context/formulas-summary.md
    """
    validate_positive("Толщина изоляции", params.insulation_thickness)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    t_mean = (params.ambient_temperature + params.process_temperature) / 2.0
    delta_t = params.process_temperature - params.ambient_temperature

    # --- 1. Сопротивление стенки резервуара ---
    r_wall = 0.0
    if params.wall_thickness is None and params.wall_lambda is not None:
        validate_positive("Толщина стенки резервуара", params.wall_thickness)
        validate_positive("Теплопроводность стенки резервуара", params.wall_lambda)
        r_wall = params.wall_thickness / params.wall_lambda

    # --- 2. Сопротивление изоляции (плоская стенка) ---
    lambda_ins = get_insulation_conductivity(
        material=params.insulation_material,
        temperature=t_mean,
    )
    r_ins = params.insulation_thickness / lambda_ins

    # --- 3. Внешнее сопротивление ---
    alpha = _calc_alpha(params)
    r_ext = 1.0 / alpha

    # --- 4–5. Тепловой поток на м² ---
    r_total = r_wall + r_ins + r_ext
    q_per_m2 = delta_t / r_total

    # --- 6. Площадь ---
    area = _surface_area(params)

    # --- 7. Коэффициент запаса ---
    merged = merge_coefficients(coefficients)
    k = params.safety_factor or merged.get("safety_factor", 1.1)

    # --- 8. Итоговые теплопотери ---
    q_total = q_per_m2 * area * k

    return TankHeatLossResult(
        heat_loss_per_m2=round(q_per_m2, 3),
        total_heat_loss=round(q_total, 3),
        surface_area=round(area, 3),
    )


def x_calc_tank_heat_loss__mutmut_22(
    params: TankHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> TankHeatLossResult:
    """Расчёт тепловых потерь ёмкости (модель плоской стенки).

    Упрощение: считаем все стенки плоскими (последовательное сопротивление),
    а площадь поверхности берём по геометрии (цилиндр / параллелепипед / шар).
    Для резервуаров d > 0.5 м кривизна практически не влияет на результат.

    Алгоритм:
        1. r_wall = δ_р / λ_р (если заданы толщина и λ стенки)
        2. r_ins  = δ_из / λ_из  (изоляция — плоская стенка)
        3. r_ext  = 1 / α_внеш   (α = 11.6 + 7·v на улице, 9.0 в помещении)
        4. r_total = r_wall + r_ins + r_ext
        5. q = ΔT / r_total (Вт/м², БЕЗ safety_factor)
        6. S — площадь по форме (cylinder/rectangle/sphere)
        7. Q = q · S · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры ёмкости. Требует указать геометрию,
            подходящую под `shape`: cylinder (d+h), rectangular (l+w+h), sphere (d).
        coefficients: аналогично `calc_pipe_heat_loss`.

    Returns:
        TankHeatLossResult: `heat_loss_per_m2` (q без K), `total_heat_loss` (Q с K),
        `surface_area` (S).

    Raises:
        ValueError: невалидная форма, отсутствие обязательной геометрии,
            невалидные температуры/толщины.

    See Also:
        formules.md, docs/context/formulas-summary.md
    """
    validate_positive("Толщина изоляции", params.insulation_thickness)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    t_mean = (params.ambient_temperature + params.process_temperature) / 2.0
    delta_t = params.process_temperature - params.ambient_temperature

    # --- 1. Сопротивление стенки резервуара ---
    r_wall = 0.0
    if params.wall_thickness is not None and params.wall_lambda is None:
        validate_positive("Толщина стенки резервуара", params.wall_thickness)
        validate_positive("Теплопроводность стенки резервуара", params.wall_lambda)
        r_wall = params.wall_thickness / params.wall_lambda

    # --- 2. Сопротивление изоляции (плоская стенка) ---
    lambda_ins = get_insulation_conductivity(
        material=params.insulation_material,
        temperature=t_mean,
    )
    r_ins = params.insulation_thickness / lambda_ins

    # --- 3. Внешнее сопротивление ---
    alpha = _calc_alpha(params)
    r_ext = 1.0 / alpha

    # --- 4–5. Тепловой поток на м² ---
    r_total = r_wall + r_ins + r_ext
    q_per_m2 = delta_t / r_total

    # --- 6. Площадь ---
    area = _surface_area(params)

    # --- 7. Коэффициент запаса ---
    merged = merge_coefficients(coefficients)
    k = params.safety_factor or merged.get("safety_factor", 1.1)

    # --- 8. Итоговые теплопотери ---
    q_total = q_per_m2 * area * k

    return TankHeatLossResult(
        heat_loss_per_m2=round(q_per_m2, 3),
        total_heat_loss=round(q_total, 3),
        surface_area=round(area, 3),
    )


def x_calc_tank_heat_loss__mutmut_23(
    params: TankHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> TankHeatLossResult:
    """Расчёт тепловых потерь ёмкости (модель плоской стенки).

    Упрощение: считаем все стенки плоскими (последовательное сопротивление),
    а площадь поверхности берём по геометрии (цилиндр / параллелепипед / шар).
    Для резервуаров d > 0.5 м кривизна практически не влияет на результат.

    Алгоритм:
        1. r_wall = δ_р / λ_р (если заданы толщина и λ стенки)
        2. r_ins  = δ_из / λ_из  (изоляция — плоская стенка)
        3. r_ext  = 1 / α_внеш   (α = 11.6 + 7·v на улице, 9.0 в помещении)
        4. r_total = r_wall + r_ins + r_ext
        5. q = ΔT / r_total (Вт/м², БЕЗ safety_factor)
        6. S — площадь по форме (cylinder/rectangle/sphere)
        7. Q = q · S · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры ёмкости. Требует указать геометрию,
            подходящую под `shape`: cylinder (d+h), rectangular (l+w+h), sphere (d).
        coefficients: аналогично `calc_pipe_heat_loss`.

    Returns:
        TankHeatLossResult: `heat_loss_per_m2` (q без K), `total_heat_loss` (Q с K),
        `surface_area` (S).

    Raises:
        ValueError: невалидная форма, отсутствие обязательной геометрии,
            невалидные температуры/толщины.

    See Also:
        formules.md, docs/context/formulas-summary.md
    """
    validate_positive("Толщина изоляции", params.insulation_thickness)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    t_mean = (params.ambient_temperature + params.process_temperature) / 2.0
    delta_t = params.process_temperature - params.ambient_temperature

    # --- 1. Сопротивление стенки резервуара ---
    r_wall = 0.0
    if params.wall_thickness is not None and params.wall_lambda is not None:
        validate_positive(None, params.wall_thickness)
        validate_positive("Теплопроводность стенки резервуара", params.wall_lambda)
        r_wall = params.wall_thickness / params.wall_lambda

    # --- 2. Сопротивление изоляции (плоская стенка) ---
    lambda_ins = get_insulation_conductivity(
        material=params.insulation_material,
        temperature=t_mean,
    )
    r_ins = params.insulation_thickness / lambda_ins

    # --- 3. Внешнее сопротивление ---
    alpha = _calc_alpha(params)
    r_ext = 1.0 / alpha

    # --- 4–5. Тепловой поток на м² ---
    r_total = r_wall + r_ins + r_ext
    q_per_m2 = delta_t / r_total

    # --- 6. Площадь ---
    area = _surface_area(params)

    # --- 7. Коэффициент запаса ---
    merged = merge_coefficients(coefficients)
    k = params.safety_factor or merged.get("safety_factor", 1.1)

    # --- 8. Итоговые теплопотери ---
    q_total = q_per_m2 * area * k

    return TankHeatLossResult(
        heat_loss_per_m2=round(q_per_m2, 3),
        total_heat_loss=round(q_total, 3),
        surface_area=round(area, 3),
    )


def x_calc_tank_heat_loss__mutmut_24(
    params: TankHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> TankHeatLossResult:
    """Расчёт тепловых потерь ёмкости (модель плоской стенки).

    Упрощение: считаем все стенки плоскими (последовательное сопротивление),
    а площадь поверхности берём по геометрии (цилиндр / параллелепипед / шар).
    Для резервуаров d > 0.5 м кривизна практически не влияет на результат.

    Алгоритм:
        1. r_wall = δ_р / λ_р (если заданы толщина и λ стенки)
        2. r_ins  = δ_из / λ_из  (изоляция — плоская стенка)
        3. r_ext  = 1 / α_внеш   (α = 11.6 + 7·v на улице, 9.0 в помещении)
        4. r_total = r_wall + r_ins + r_ext
        5. q = ΔT / r_total (Вт/м², БЕЗ safety_factor)
        6. S — площадь по форме (cylinder/rectangle/sphere)
        7. Q = q · S · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры ёмкости. Требует указать геометрию,
            подходящую под `shape`: cylinder (d+h), rectangular (l+w+h), sphere (d).
        coefficients: аналогично `calc_pipe_heat_loss`.

    Returns:
        TankHeatLossResult: `heat_loss_per_m2` (q без K), `total_heat_loss` (Q с K),
        `surface_area` (S).

    Raises:
        ValueError: невалидная форма, отсутствие обязательной геометрии,
            невалидные температуры/толщины.

    See Also:
        formules.md, docs/context/formulas-summary.md
    """
    validate_positive("Толщина изоляции", params.insulation_thickness)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    t_mean = (params.ambient_temperature + params.process_temperature) / 2.0
    delta_t = params.process_temperature - params.ambient_temperature

    # --- 1. Сопротивление стенки резервуара ---
    r_wall = 0.0
    if params.wall_thickness is not None and params.wall_lambda is not None:
        validate_positive("Толщина стенки резервуара", None)
        validate_positive("Теплопроводность стенки резервуара", params.wall_lambda)
        r_wall = params.wall_thickness / params.wall_lambda

    # --- 2. Сопротивление изоляции (плоская стенка) ---
    lambda_ins = get_insulation_conductivity(
        material=params.insulation_material,
        temperature=t_mean,
    )
    r_ins = params.insulation_thickness / lambda_ins

    # --- 3. Внешнее сопротивление ---
    alpha = _calc_alpha(params)
    r_ext = 1.0 / alpha

    # --- 4–5. Тепловой поток на м² ---
    r_total = r_wall + r_ins + r_ext
    q_per_m2 = delta_t / r_total

    # --- 6. Площадь ---
    area = _surface_area(params)

    # --- 7. Коэффициент запаса ---
    merged = merge_coefficients(coefficients)
    k = params.safety_factor or merged.get("safety_factor", 1.1)

    # --- 8. Итоговые теплопотери ---
    q_total = q_per_m2 * area * k

    return TankHeatLossResult(
        heat_loss_per_m2=round(q_per_m2, 3),
        total_heat_loss=round(q_total, 3),
        surface_area=round(area, 3),
    )


def x_calc_tank_heat_loss__mutmut_25(
    params: TankHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> TankHeatLossResult:
    """Расчёт тепловых потерь ёмкости (модель плоской стенки).

    Упрощение: считаем все стенки плоскими (последовательное сопротивление),
    а площадь поверхности берём по геометрии (цилиндр / параллелепипед / шар).
    Для резервуаров d > 0.5 м кривизна практически не влияет на результат.

    Алгоритм:
        1. r_wall = δ_р / λ_р (если заданы толщина и λ стенки)
        2. r_ins  = δ_из / λ_из  (изоляция — плоская стенка)
        3. r_ext  = 1 / α_внеш   (α = 11.6 + 7·v на улице, 9.0 в помещении)
        4. r_total = r_wall + r_ins + r_ext
        5. q = ΔT / r_total (Вт/м², БЕЗ safety_factor)
        6. S — площадь по форме (cylinder/rectangle/sphere)
        7. Q = q · S · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры ёмкости. Требует указать геометрию,
            подходящую под `shape`: cylinder (d+h), rectangular (l+w+h), sphere (d).
        coefficients: аналогично `calc_pipe_heat_loss`.

    Returns:
        TankHeatLossResult: `heat_loss_per_m2` (q без K), `total_heat_loss` (Q с K),
        `surface_area` (S).

    Raises:
        ValueError: невалидная форма, отсутствие обязательной геометрии,
            невалидные температуры/толщины.

    See Also:
        formules.md, docs/context/formulas-summary.md
    """
    validate_positive("Толщина изоляции", params.insulation_thickness)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    t_mean = (params.ambient_temperature + params.process_temperature) / 2.0
    delta_t = params.process_temperature - params.ambient_temperature

    # --- 1. Сопротивление стенки резервуара ---
    r_wall = 0.0
    if params.wall_thickness is not None and params.wall_lambda is not None:
        validate_positive(params.wall_thickness)
        validate_positive("Теплопроводность стенки резервуара", params.wall_lambda)
        r_wall = params.wall_thickness / params.wall_lambda

    # --- 2. Сопротивление изоляции (плоская стенка) ---
    lambda_ins = get_insulation_conductivity(
        material=params.insulation_material,
        temperature=t_mean,
    )
    r_ins = params.insulation_thickness / lambda_ins

    # --- 3. Внешнее сопротивление ---
    alpha = _calc_alpha(params)
    r_ext = 1.0 / alpha

    # --- 4–5. Тепловой поток на м² ---
    r_total = r_wall + r_ins + r_ext
    q_per_m2 = delta_t / r_total

    # --- 6. Площадь ---
    area = _surface_area(params)

    # --- 7. Коэффициент запаса ---
    merged = merge_coefficients(coefficients)
    k = params.safety_factor or merged.get("safety_factor", 1.1)

    # --- 8. Итоговые теплопотери ---
    q_total = q_per_m2 * area * k

    return TankHeatLossResult(
        heat_loss_per_m2=round(q_per_m2, 3),
        total_heat_loss=round(q_total, 3),
        surface_area=round(area, 3),
    )


def x_calc_tank_heat_loss__mutmut_26(
    params: TankHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> TankHeatLossResult:
    """Расчёт тепловых потерь ёмкости (модель плоской стенки).

    Упрощение: считаем все стенки плоскими (последовательное сопротивление),
    а площадь поверхности берём по геометрии (цилиндр / параллелепипед / шар).
    Для резервуаров d > 0.5 м кривизна практически не влияет на результат.

    Алгоритм:
        1. r_wall = δ_р / λ_р (если заданы толщина и λ стенки)
        2. r_ins  = δ_из / λ_из  (изоляция — плоская стенка)
        3. r_ext  = 1 / α_внеш   (α = 11.6 + 7·v на улице, 9.0 в помещении)
        4. r_total = r_wall + r_ins + r_ext
        5. q = ΔT / r_total (Вт/м², БЕЗ safety_factor)
        6. S — площадь по форме (cylinder/rectangle/sphere)
        7. Q = q · S · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры ёмкости. Требует указать геометрию,
            подходящую под `shape`: cylinder (d+h), rectangular (l+w+h), sphere (d).
        coefficients: аналогично `calc_pipe_heat_loss`.

    Returns:
        TankHeatLossResult: `heat_loss_per_m2` (q без K), `total_heat_loss` (Q с K),
        `surface_area` (S).

    Raises:
        ValueError: невалидная форма, отсутствие обязательной геометрии,
            невалидные температуры/толщины.

    See Also:
        formules.md, docs/context/formulas-summary.md
    """
    validate_positive("Толщина изоляции", params.insulation_thickness)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    t_mean = (params.ambient_temperature + params.process_temperature) / 2.0
    delta_t = params.process_temperature - params.ambient_temperature

    # --- 1. Сопротивление стенки резервуара ---
    r_wall = 0.0
    if params.wall_thickness is not None and params.wall_lambda is not None:
        validate_positive("Толщина стенки резервуара", )
        validate_positive("Теплопроводность стенки резервуара", params.wall_lambda)
        r_wall = params.wall_thickness / params.wall_lambda

    # --- 2. Сопротивление изоляции (плоская стенка) ---
    lambda_ins = get_insulation_conductivity(
        material=params.insulation_material,
        temperature=t_mean,
    )
    r_ins = params.insulation_thickness / lambda_ins

    # --- 3. Внешнее сопротивление ---
    alpha = _calc_alpha(params)
    r_ext = 1.0 / alpha

    # --- 4–5. Тепловой поток на м² ---
    r_total = r_wall + r_ins + r_ext
    q_per_m2 = delta_t / r_total

    # --- 6. Площадь ---
    area = _surface_area(params)

    # --- 7. Коэффициент запаса ---
    merged = merge_coefficients(coefficients)
    k = params.safety_factor or merged.get("safety_factor", 1.1)

    # --- 8. Итоговые теплопотери ---
    q_total = q_per_m2 * area * k

    return TankHeatLossResult(
        heat_loss_per_m2=round(q_per_m2, 3),
        total_heat_loss=round(q_total, 3),
        surface_area=round(area, 3),
    )


def x_calc_tank_heat_loss__mutmut_27(
    params: TankHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> TankHeatLossResult:
    """Расчёт тепловых потерь ёмкости (модель плоской стенки).

    Упрощение: считаем все стенки плоскими (последовательное сопротивление),
    а площадь поверхности берём по геометрии (цилиндр / параллелепипед / шар).
    Для резервуаров d > 0.5 м кривизна практически не влияет на результат.

    Алгоритм:
        1. r_wall = δ_р / λ_р (если заданы толщина и λ стенки)
        2. r_ins  = δ_из / λ_из  (изоляция — плоская стенка)
        3. r_ext  = 1 / α_внеш   (α = 11.6 + 7·v на улице, 9.0 в помещении)
        4. r_total = r_wall + r_ins + r_ext
        5. q = ΔT / r_total (Вт/м², БЕЗ safety_factor)
        6. S — площадь по форме (cylinder/rectangle/sphere)
        7. Q = q · S · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры ёмкости. Требует указать геометрию,
            подходящую под `shape`: cylinder (d+h), rectangular (l+w+h), sphere (d).
        coefficients: аналогично `calc_pipe_heat_loss`.

    Returns:
        TankHeatLossResult: `heat_loss_per_m2` (q без K), `total_heat_loss` (Q с K),
        `surface_area` (S).

    Raises:
        ValueError: невалидная форма, отсутствие обязательной геометрии,
            невалидные температуры/толщины.

    See Also:
        formules.md, docs/context/formulas-summary.md
    """
    validate_positive("Толщина изоляции", params.insulation_thickness)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    t_mean = (params.ambient_temperature + params.process_temperature) / 2.0
    delta_t = params.process_temperature - params.ambient_temperature

    # --- 1. Сопротивление стенки резервуара ---
    r_wall = 0.0
    if params.wall_thickness is not None and params.wall_lambda is not None:
        validate_positive("XXТолщина стенки резервуараXX", params.wall_thickness)
        validate_positive("Теплопроводность стенки резервуара", params.wall_lambda)
        r_wall = params.wall_thickness / params.wall_lambda

    # --- 2. Сопротивление изоляции (плоская стенка) ---
    lambda_ins = get_insulation_conductivity(
        material=params.insulation_material,
        temperature=t_mean,
    )
    r_ins = params.insulation_thickness / lambda_ins

    # --- 3. Внешнее сопротивление ---
    alpha = _calc_alpha(params)
    r_ext = 1.0 / alpha

    # --- 4–5. Тепловой поток на м² ---
    r_total = r_wall + r_ins + r_ext
    q_per_m2 = delta_t / r_total

    # --- 6. Площадь ---
    area = _surface_area(params)

    # --- 7. Коэффициент запаса ---
    merged = merge_coefficients(coefficients)
    k = params.safety_factor or merged.get("safety_factor", 1.1)

    # --- 8. Итоговые теплопотери ---
    q_total = q_per_m2 * area * k

    return TankHeatLossResult(
        heat_loss_per_m2=round(q_per_m2, 3),
        total_heat_loss=round(q_total, 3),
        surface_area=round(area, 3),
    )


def x_calc_tank_heat_loss__mutmut_28(
    params: TankHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> TankHeatLossResult:
    """Расчёт тепловых потерь ёмкости (модель плоской стенки).

    Упрощение: считаем все стенки плоскими (последовательное сопротивление),
    а площадь поверхности берём по геометрии (цилиндр / параллелепипед / шар).
    Для резервуаров d > 0.5 м кривизна практически не влияет на результат.

    Алгоритм:
        1. r_wall = δ_р / λ_р (если заданы толщина и λ стенки)
        2. r_ins  = δ_из / λ_из  (изоляция — плоская стенка)
        3. r_ext  = 1 / α_внеш   (α = 11.6 + 7·v на улице, 9.0 в помещении)
        4. r_total = r_wall + r_ins + r_ext
        5. q = ΔT / r_total (Вт/м², БЕЗ safety_factor)
        6. S — площадь по форме (cylinder/rectangle/sphere)
        7. Q = q · S · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры ёмкости. Требует указать геометрию,
            подходящую под `shape`: cylinder (d+h), rectangular (l+w+h), sphere (d).
        coefficients: аналогично `calc_pipe_heat_loss`.

    Returns:
        TankHeatLossResult: `heat_loss_per_m2` (q без K), `total_heat_loss` (Q с K),
        `surface_area` (S).

    Raises:
        ValueError: невалидная форма, отсутствие обязательной геометрии,
            невалидные температуры/толщины.

    See Also:
        formules.md, docs/context/formulas-summary.md
    """
    validate_positive("Толщина изоляции", params.insulation_thickness)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    t_mean = (params.ambient_temperature + params.process_temperature) / 2.0
    delta_t = params.process_temperature - params.ambient_temperature

    # --- 1. Сопротивление стенки резервуара ---
    r_wall = 0.0
    if params.wall_thickness is not None and params.wall_lambda is not None:
        validate_positive("толщина стенки резервуара", params.wall_thickness)
        validate_positive("Теплопроводность стенки резервуара", params.wall_lambda)
        r_wall = params.wall_thickness / params.wall_lambda

    # --- 2. Сопротивление изоляции (плоская стенка) ---
    lambda_ins = get_insulation_conductivity(
        material=params.insulation_material,
        temperature=t_mean,
    )
    r_ins = params.insulation_thickness / lambda_ins

    # --- 3. Внешнее сопротивление ---
    alpha = _calc_alpha(params)
    r_ext = 1.0 / alpha

    # --- 4–5. Тепловой поток на м² ---
    r_total = r_wall + r_ins + r_ext
    q_per_m2 = delta_t / r_total

    # --- 6. Площадь ---
    area = _surface_area(params)

    # --- 7. Коэффициент запаса ---
    merged = merge_coefficients(coefficients)
    k = params.safety_factor or merged.get("safety_factor", 1.1)

    # --- 8. Итоговые теплопотери ---
    q_total = q_per_m2 * area * k

    return TankHeatLossResult(
        heat_loss_per_m2=round(q_per_m2, 3),
        total_heat_loss=round(q_total, 3),
        surface_area=round(area, 3),
    )


def x_calc_tank_heat_loss__mutmut_29(
    params: TankHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> TankHeatLossResult:
    """Расчёт тепловых потерь ёмкости (модель плоской стенки).

    Упрощение: считаем все стенки плоскими (последовательное сопротивление),
    а площадь поверхности берём по геометрии (цилиндр / параллелепипед / шар).
    Для резервуаров d > 0.5 м кривизна практически не влияет на результат.

    Алгоритм:
        1. r_wall = δ_р / λ_р (если заданы толщина и λ стенки)
        2. r_ins  = δ_из / λ_из  (изоляция — плоская стенка)
        3. r_ext  = 1 / α_внеш   (α = 11.6 + 7·v на улице, 9.0 в помещении)
        4. r_total = r_wall + r_ins + r_ext
        5. q = ΔT / r_total (Вт/м², БЕЗ safety_factor)
        6. S — площадь по форме (cylinder/rectangle/sphere)
        7. Q = q · S · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры ёмкости. Требует указать геометрию,
            подходящую под `shape`: cylinder (d+h), rectangular (l+w+h), sphere (d).
        coefficients: аналогично `calc_pipe_heat_loss`.

    Returns:
        TankHeatLossResult: `heat_loss_per_m2` (q без K), `total_heat_loss` (Q с K),
        `surface_area` (S).

    Raises:
        ValueError: невалидная форма, отсутствие обязательной геометрии,
            невалидные температуры/толщины.

    See Also:
        formules.md, docs/context/formulas-summary.md
    """
    validate_positive("Толщина изоляции", params.insulation_thickness)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    t_mean = (params.ambient_temperature + params.process_temperature) / 2.0
    delta_t = params.process_temperature - params.ambient_temperature

    # --- 1. Сопротивление стенки резервуара ---
    r_wall = 0.0
    if params.wall_thickness is not None and params.wall_lambda is not None:
        validate_positive("ТОЛЩИНА СТЕНКИ РЕЗЕРВУАРА", params.wall_thickness)
        validate_positive("Теплопроводность стенки резервуара", params.wall_lambda)
        r_wall = params.wall_thickness / params.wall_lambda

    # --- 2. Сопротивление изоляции (плоская стенка) ---
    lambda_ins = get_insulation_conductivity(
        material=params.insulation_material,
        temperature=t_mean,
    )
    r_ins = params.insulation_thickness / lambda_ins

    # --- 3. Внешнее сопротивление ---
    alpha = _calc_alpha(params)
    r_ext = 1.0 / alpha

    # --- 4–5. Тепловой поток на м² ---
    r_total = r_wall + r_ins + r_ext
    q_per_m2 = delta_t / r_total

    # --- 6. Площадь ---
    area = _surface_area(params)

    # --- 7. Коэффициент запаса ---
    merged = merge_coefficients(coefficients)
    k = params.safety_factor or merged.get("safety_factor", 1.1)

    # --- 8. Итоговые теплопотери ---
    q_total = q_per_m2 * area * k

    return TankHeatLossResult(
        heat_loss_per_m2=round(q_per_m2, 3),
        total_heat_loss=round(q_total, 3),
        surface_area=round(area, 3),
    )


def x_calc_tank_heat_loss__mutmut_30(
    params: TankHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> TankHeatLossResult:
    """Расчёт тепловых потерь ёмкости (модель плоской стенки).

    Упрощение: считаем все стенки плоскими (последовательное сопротивление),
    а площадь поверхности берём по геометрии (цилиндр / параллелепипед / шар).
    Для резервуаров d > 0.5 м кривизна практически не влияет на результат.

    Алгоритм:
        1. r_wall = δ_р / λ_р (если заданы толщина и λ стенки)
        2. r_ins  = δ_из / λ_из  (изоляция — плоская стенка)
        3. r_ext  = 1 / α_внеш   (α = 11.6 + 7·v на улице, 9.0 в помещении)
        4. r_total = r_wall + r_ins + r_ext
        5. q = ΔT / r_total (Вт/м², БЕЗ safety_factor)
        6. S — площадь по форме (cylinder/rectangle/sphere)
        7. Q = q · S · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры ёмкости. Требует указать геометрию,
            подходящую под `shape`: cylinder (d+h), rectangular (l+w+h), sphere (d).
        coefficients: аналогично `calc_pipe_heat_loss`.

    Returns:
        TankHeatLossResult: `heat_loss_per_m2` (q без K), `total_heat_loss` (Q с K),
        `surface_area` (S).

    Raises:
        ValueError: невалидная форма, отсутствие обязательной геометрии,
            невалидные температуры/толщины.

    See Also:
        formules.md, docs/context/formulas-summary.md
    """
    validate_positive("Толщина изоляции", params.insulation_thickness)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    t_mean = (params.ambient_temperature + params.process_temperature) / 2.0
    delta_t = params.process_temperature - params.ambient_temperature

    # --- 1. Сопротивление стенки резервуара ---
    r_wall = 0.0
    if params.wall_thickness is not None and params.wall_lambda is not None:
        validate_positive("Толщина стенки резервуара", params.wall_thickness)
        validate_positive(None, params.wall_lambda)
        r_wall = params.wall_thickness / params.wall_lambda

    # --- 2. Сопротивление изоляции (плоская стенка) ---
    lambda_ins = get_insulation_conductivity(
        material=params.insulation_material,
        temperature=t_mean,
    )
    r_ins = params.insulation_thickness / lambda_ins

    # --- 3. Внешнее сопротивление ---
    alpha = _calc_alpha(params)
    r_ext = 1.0 / alpha

    # --- 4–5. Тепловой поток на м² ---
    r_total = r_wall + r_ins + r_ext
    q_per_m2 = delta_t / r_total

    # --- 6. Площадь ---
    area = _surface_area(params)

    # --- 7. Коэффициент запаса ---
    merged = merge_coefficients(coefficients)
    k = params.safety_factor or merged.get("safety_factor", 1.1)

    # --- 8. Итоговые теплопотери ---
    q_total = q_per_m2 * area * k

    return TankHeatLossResult(
        heat_loss_per_m2=round(q_per_m2, 3),
        total_heat_loss=round(q_total, 3),
        surface_area=round(area, 3),
    )


def x_calc_tank_heat_loss__mutmut_31(
    params: TankHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> TankHeatLossResult:
    """Расчёт тепловых потерь ёмкости (модель плоской стенки).

    Упрощение: считаем все стенки плоскими (последовательное сопротивление),
    а площадь поверхности берём по геометрии (цилиндр / параллелепипед / шар).
    Для резервуаров d > 0.5 м кривизна практически не влияет на результат.

    Алгоритм:
        1. r_wall = δ_р / λ_р (если заданы толщина и λ стенки)
        2. r_ins  = δ_из / λ_из  (изоляция — плоская стенка)
        3. r_ext  = 1 / α_внеш   (α = 11.6 + 7·v на улице, 9.0 в помещении)
        4. r_total = r_wall + r_ins + r_ext
        5. q = ΔT / r_total (Вт/м², БЕЗ safety_factor)
        6. S — площадь по форме (cylinder/rectangle/sphere)
        7. Q = q · S · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры ёмкости. Требует указать геометрию,
            подходящую под `shape`: cylinder (d+h), rectangular (l+w+h), sphere (d).
        coefficients: аналогично `calc_pipe_heat_loss`.

    Returns:
        TankHeatLossResult: `heat_loss_per_m2` (q без K), `total_heat_loss` (Q с K),
        `surface_area` (S).

    Raises:
        ValueError: невалидная форма, отсутствие обязательной геометрии,
            невалидные температуры/толщины.

    See Also:
        formules.md, docs/context/formulas-summary.md
    """
    validate_positive("Толщина изоляции", params.insulation_thickness)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    t_mean = (params.ambient_temperature + params.process_temperature) / 2.0
    delta_t = params.process_temperature - params.ambient_temperature

    # --- 1. Сопротивление стенки резервуара ---
    r_wall = 0.0
    if params.wall_thickness is not None and params.wall_lambda is not None:
        validate_positive("Толщина стенки резервуара", params.wall_thickness)
        validate_positive("Теплопроводность стенки резервуара", None)
        r_wall = params.wall_thickness / params.wall_lambda

    # --- 2. Сопротивление изоляции (плоская стенка) ---
    lambda_ins = get_insulation_conductivity(
        material=params.insulation_material,
        temperature=t_mean,
    )
    r_ins = params.insulation_thickness / lambda_ins

    # --- 3. Внешнее сопротивление ---
    alpha = _calc_alpha(params)
    r_ext = 1.0 / alpha

    # --- 4–5. Тепловой поток на м² ---
    r_total = r_wall + r_ins + r_ext
    q_per_m2 = delta_t / r_total

    # --- 6. Площадь ---
    area = _surface_area(params)

    # --- 7. Коэффициент запаса ---
    merged = merge_coefficients(coefficients)
    k = params.safety_factor or merged.get("safety_factor", 1.1)

    # --- 8. Итоговые теплопотери ---
    q_total = q_per_m2 * area * k

    return TankHeatLossResult(
        heat_loss_per_m2=round(q_per_m2, 3),
        total_heat_loss=round(q_total, 3),
        surface_area=round(area, 3),
    )


def x_calc_tank_heat_loss__mutmut_32(
    params: TankHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> TankHeatLossResult:
    """Расчёт тепловых потерь ёмкости (модель плоской стенки).

    Упрощение: считаем все стенки плоскими (последовательное сопротивление),
    а площадь поверхности берём по геометрии (цилиндр / параллелепипед / шар).
    Для резервуаров d > 0.5 м кривизна практически не влияет на результат.

    Алгоритм:
        1. r_wall = δ_р / λ_р (если заданы толщина и λ стенки)
        2. r_ins  = δ_из / λ_из  (изоляция — плоская стенка)
        3. r_ext  = 1 / α_внеш   (α = 11.6 + 7·v на улице, 9.0 в помещении)
        4. r_total = r_wall + r_ins + r_ext
        5. q = ΔT / r_total (Вт/м², БЕЗ safety_factor)
        6. S — площадь по форме (cylinder/rectangle/sphere)
        7. Q = q · S · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры ёмкости. Требует указать геометрию,
            подходящую под `shape`: cylinder (d+h), rectangular (l+w+h), sphere (d).
        coefficients: аналогично `calc_pipe_heat_loss`.

    Returns:
        TankHeatLossResult: `heat_loss_per_m2` (q без K), `total_heat_loss` (Q с K),
        `surface_area` (S).

    Raises:
        ValueError: невалидная форма, отсутствие обязательной геометрии,
            невалидные температуры/толщины.

    See Also:
        formules.md, docs/context/formulas-summary.md
    """
    validate_positive("Толщина изоляции", params.insulation_thickness)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    t_mean = (params.ambient_temperature + params.process_temperature) / 2.0
    delta_t = params.process_temperature - params.ambient_temperature

    # --- 1. Сопротивление стенки резервуара ---
    r_wall = 0.0
    if params.wall_thickness is not None and params.wall_lambda is not None:
        validate_positive("Толщина стенки резервуара", params.wall_thickness)
        validate_positive(params.wall_lambda)
        r_wall = params.wall_thickness / params.wall_lambda

    # --- 2. Сопротивление изоляции (плоская стенка) ---
    lambda_ins = get_insulation_conductivity(
        material=params.insulation_material,
        temperature=t_mean,
    )
    r_ins = params.insulation_thickness / lambda_ins

    # --- 3. Внешнее сопротивление ---
    alpha = _calc_alpha(params)
    r_ext = 1.0 / alpha

    # --- 4–5. Тепловой поток на м² ---
    r_total = r_wall + r_ins + r_ext
    q_per_m2 = delta_t / r_total

    # --- 6. Площадь ---
    area = _surface_area(params)

    # --- 7. Коэффициент запаса ---
    merged = merge_coefficients(coefficients)
    k = params.safety_factor or merged.get("safety_factor", 1.1)

    # --- 8. Итоговые теплопотери ---
    q_total = q_per_m2 * area * k

    return TankHeatLossResult(
        heat_loss_per_m2=round(q_per_m2, 3),
        total_heat_loss=round(q_total, 3),
        surface_area=round(area, 3),
    )


def x_calc_tank_heat_loss__mutmut_33(
    params: TankHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> TankHeatLossResult:
    """Расчёт тепловых потерь ёмкости (модель плоской стенки).

    Упрощение: считаем все стенки плоскими (последовательное сопротивление),
    а площадь поверхности берём по геометрии (цилиндр / параллелепипед / шар).
    Для резервуаров d > 0.5 м кривизна практически не влияет на результат.

    Алгоритм:
        1. r_wall = δ_р / λ_р (если заданы толщина и λ стенки)
        2. r_ins  = δ_из / λ_из  (изоляция — плоская стенка)
        3. r_ext  = 1 / α_внеш   (α = 11.6 + 7·v на улице, 9.0 в помещении)
        4. r_total = r_wall + r_ins + r_ext
        5. q = ΔT / r_total (Вт/м², БЕЗ safety_factor)
        6. S — площадь по форме (cylinder/rectangle/sphere)
        7. Q = q · S · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры ёмкости. Требует указать геометрию,
            подходящую под `shape`: cylinder (d+h), rectangular (l+w+h), sphere (d).
        coefficients: аналогично `calc_pipe_heat_loss`.

    Returns:
        TankHeatLossResult: `heat_loss_per_m2` (q без K), `total_heat_loss` (Q с K),
        `surface_area` (S).

    Raises:
        ValueError: невалидная форма, отсутствие обязательной геометрии,
            невалидные температуры/толщины.

    See Also:
        formules.md, docs/context/formulas-summary.md
    """
    validate_positive("Толщина изоляции", params.insulation_thickness)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    t_mean = (params.ambient_temperature + params.process_temperature) / 2.0
    delta_t = params.process_temperature - params.ambient_temperature

    # --- 1. Сопротивление стенки резервуара ---
    r_wall = 0.0
    if params.wall_thickness is not None and params.wall_lambda is not None:
        validate_positive("Толщина стенки резервуара", params.wall_thickness)
        validate_positive("Теплопроводность стенки резервуара", )
        r_wall = params.wall_thickness / params.wall_lambda

    # --- 2. Сопротивление изоляции (плоская стенка) ---
    lambda_ins = get_insulation_conductivity(
        material=params.insulation_material,
        temperature=t_mean,
    )
    r_ins = params.insulation_thickness / lambda_ins

    # --- 3. Внешнее сопротивление ---
    alpha = _calc_alpha(params)
    r_ext = 1.0 / alpha

    # --- 4–5. Тепловой поток на м² ---
    r_total = r_wall + r_ins + r_ext
    q_per_m2 = delta_t / r_total

    # --- 6. Площадь ---
    area = _surface_area(params)

    # --- 7. Коэффициент запаса ---
    merged = merge_coefficients(coefficients)
    k = params.safety_factor or merged.get("safety_factor", 1.1)

    # --- 8. Итоговые теплопотери ---
    q_total = q_per_m2 * area * k

    return TankHeatLossResult(
        heat_loss_per_m2=round(q_per_m2, 3),
        total_heat_loss=round(q_total, 3),
        surface_area=round(area, 3),
    )


def x_calc_tank_heat_loss__mutmut_34(
    params: TankHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> TankHeatLossResult:
    """Расчёт тепловых потерь ёмкости (модель плоской стенки).

    Упрощение: считаем все стенки плоскими (последовательное сопротивление),
    а площадь поверхности берём по геометрии (цилиндр / параллелепипед / шар).
    Для резервуаров d > 0.5 м кривизна практически не влияет на результат.

    Алгоритм:
        1. r_wall = δ_р / λ_р (если заданы толщина и λ стенки)
        2. r_ins  = δ_из / λ_из  (изоляция — плоская стенка)
        3. r_ext  = 1 / α_внеш   (α = 11.6 + 7·v на улице, 9.0 в помещении)
        4. r_total = r_wall + r_ins + r_ext
        5. q = ΔT / r_total (Вт/м², БЕЗ safety_factor)
        6. S — площадь по форме (cylinder/rectangle/sphere)
        7. Q = q · S · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры ёмкости. Требует указать геометрию,
            подходящую под `shape`: cylinder (d+h), rectangular (l+w+h), sphere (d).
        coefficients: аналогично `calc_pipe_heat_loss`.

    Returns:
        TankHeatLossResult: `heat_loss_per_m2` (q без K), `total_heat_loss` (Q с K),
        `surface_area` (S).

    Raises:
        ValueError: невалидная форма, отсутствие обязательной геометрии,
            невалидные температуры/толщины.

    See Also:
        formules.md, docs/context/formulas-summary.md
    """
    validate_positive("Толщина изоляции", params.insulation_thickness)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    t_mean = (params.ambient_temperature + params.process_temperature) / 2.0
    delta_t = params.process_temperature - params.ambient_temperature

    # --- 1. Сопротивление стенки резервуара ---
    r_wall = 0.0
    if params.wall_thickness is not None and params.wall_lambda is not None:
        validate_positive("Толщина стенки резервуара", params.wall_thickness)
        validate_positive("XXТеплопроводность стенки резервуараXX", params.wall_lambda)
        r_wall = params.wall_thickness / params.wall_lambda

    # --- 2. Сопротивление изоляции (плоская стенка) ---
    lambda_ins = get_insulation_conductivity(
        material=params.insulation_material,
        temperature=t_mean,
    )
    r_ins = params.insulation_thickness / lambda_ins

    # --- 3. Внешнее сопротивление ---
    alpha = _calc_alpha(params)
    r_ext = 1.0 / alpha

    # --- 4–5. Тепловой поток на м² ---
    r_total = r_wall + r_ins + r_ext
    q_per_m2 = delta_t / r_total

    # --- 6. Площадь ---
    area = _surface_area(params)

    # --- 7. Коэффициент запаса ---
    merged = merge_coefficients(coefficients)
    k = params.safety_factor or merged.get("safety_factor", 1.1)

    # --- 8. Итоговые теплопотери ---
    q_total = q_per_m2 * area * k

    return TankHeatLossResult(
        heat_loss_per_m2=round(q_per_m2, 3),
        total_heat_loss=round(q_total, 3),
        surface_area=round(area, 3),
    )


def x_calc_tank_heat_loss__mutmut_35(
    params: TankHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> TankHeatLossResult:
    """Расчёт тепловых потерь ёмкости (модель плоской стенки).

    Упрощение: считаем все стенки плоскими (последовательное сопротивление),
    а площадь поверхности берём по геометрии (цилиндр / параллелепипед / шар).
    Для резервуаров d > 0.5 м кривизна практически не влияет на результат.

    Алгоритм:
        1. r_wall = δ_р / λ_р (если заданы толщина и λ стенки)
        2. r_ins  = δ_из / λ_из  (изоляция — плоская стенка)
        3. r_ext  = 1 / α_внеш   (α = 11.6 + 7·v на улице, 9.0 в помещении)
        4. r_total = r_wall + r_ins + r_ext
        5. q = ΔT / r_total (Вт/м², БЕЗ safety_factor)
        6. S — площадь по форме (cylinder/rectangle/sphere)
        7. Q = q · S · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры ёмкости. Требует указать геометрию,
            подходящую под `shape`: cylinder (d+h), rectangular (l+w+h), sphere (d).
        coefficients: аналогично `calc_pipe_heat_loss`.

    Returns:
        TankHeatLossResult: `heat_loss_per_m2` (q без K), `total_heat_loss` (Q с K),
        `surface_area` (S).

    Raises:
        ValueError: невалидная форма, отсутствие обязательной геометрии,
            невалидные температуры/толщины.

    See Also:
        formules.md, docs/context/formulas-summary.md
    """
    validate_positive("Толщина изоляции", params.insulation_thickness)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    t_mean = (params.ambient_temperature + params.process_temperature) / 2.0
    delta_t = params.process_temperature - params.ambient_temperature

    # --- 1. Сопротивление стенки резервуара ---
    r_wall = 0.0
    if params.wall_thickness is not None and params.wall_lambda is not None:
        validate_positive("Толщина стенки резервуара", params.wall_thickness)
        validate_positive("теплопроводность стенки резервуара", params.wall_lambda)
        r_wall = params.wall_thickness / params.wall_lambda

    # --- 2. Сопротивление изоляции (плоская стенка) ---
    lambda_ins = get_insulation_conductivity(
        material=params.insulation_material,
        temperature=t_mean,
    )
    r_ins = params.insulation_thickness / lambda_ins

    # --- 3. Внешнее сопротивление ---
    alpha = _calc_alpha(params)
    r_ext = 1.0 / alpha

    # --- 4–5. Тепловой поток на м² ---
    r_total = r_wall + r_ins + r_ext
    q_per_m2 = delta_t / r_total

    # --- 6. Площадь ---
    area = _surface_area(params)

    # --- 7. Коэффициент запаса ---
    merged = merge_coefficients(coefficients)
    k = params.safety_factor or merged.get("safety_factor", 1.1)

    # --- 8. Итоговые теплопотери ---
    q_total = q_per_m2 * area * k

    return TankHeatLossResult(
        heat_loss_per_m2=round(q_per_m2, 3),
        total_heat_loss=round(q_total, 3),
        surface_area=round(area, 3),
    )


def x_calc_tank_heat_loss__mutmut_36(
    params: TankHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> TankHeatLossResult:
    """Расчёт тепловых потерь ёмкости (модель плоской стенки).

    Упрощение: считаем все стенки плоскими (последовательное сопротивление),
    а площадь поверхности берём по геометрии (цилиндр / параллелепипед / шар).
    Для резервуаров d > 0.5 м кривизна практически не влияет на результат.

    Алгоритм:
        1. r_wall = δ_р / λ_р (если заданы толщина и λ стенки)
        2. r_ins  = δ_из / λ_из  (изоляция — плоская стенка)
        3. r_ext  = 1 / α_внеш   (α = 11.6 + 7·v на улице, 9.0 в помещении)
        4. r_total = r_wall + r_ins + r_ext
        5. q = ΔT / r_total (Вт/м², БЕЗ safety_factor)
        6. S — площадь по форме (cylinder/rectangle/sphere)
        7. Q = q · S · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры ёмкости. Требует указать геометрию,
            подходящую под `shape`: cylinder (d+h), rectangular (l+w+h), sphere (d).
        coefficients: аналогично `calc_pipe_heat_loss`.

    Returns:
        TankHeatLossResult: `heat_loss_per_m2` (q без K), `total_heat_loss` (Q с K),
        `surface_area` (S).

    Raises:
        ValueError: невалидная форма, отсутствие обязательной геометрии,
            невалидные температуры/толщины.

    See Also:
        formules.md, docs/context/formulas-summary.md
    """
    validate_positive("Толщина изоляции", params.insulation_thickness)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    t_mean = (params.ambient_temperature + params.process_temperature) / 2.0
    delta_t = params.process_temperature - params.ambient_temperature

    # --- 1. Сопротивление стенки резервуара ---
    r_wall = 0.0
    if params.wall_thickness is not None and params.wall_lambda is not None:
        validate_positive("Толщина стенки резервуара", params.wall_thickness)
        validate_positive("ТЕПЛОПРОВОДНОСТЬ СТЕНКИ РЕЗЕРВУАРА", params.wall_lambda)
        r_wall = params.wall_thickness / params.wall_lambda

    # --- 2. Сопротивление изоляции (плоская стенка) ---
    lambda_ins = get_insulation_conductivity(
        material=params.insulation_material,
        temperature=t_mean,
    )
    r_ins = params.insulation_thickness / lambda_ins

    # --- 3. Внешнее сопротивление ---
    alpha = _calc_alpha(params)
    r_ext = 1.0 / alpha

    # --- 4–5. Тепловой поток на м² ---
    r_total = r_wall + r_ins + r_ext
    q_per_m2 = delta_t / r_total

    # --- 6. Площадь ---
    area = _surface_area(params)

    # --- 7. Коэффициент запаса ---
    merged = merge_coefficients(coefficients)
    k = params.safety_factor or merged.get("safety_factor", 1.1)

    # --- 8. Итоговые теплопотери ---
    q_total = q_per_m2 * area * k

    return TankHeatLossResult(
        heat_loss_per_m2=round(q_per_m2, 3),
        total_heat_loss=round(q_total, 3),
        surface_area=round(area, 3),
    )


def x_calc_tank_heat_loss__mutmut_37(
    params: TankHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> TankHeatLossResult:
    """Расчёт тепловых потерь ёмкости (модель плоской стенки).

    Упрощение: считаем все стенки плоскими (последовательное сопротивление),
    а площадь поверхности берём по геометрии (цилиндр / параллелепипед / шар).
    Для резервуаров d > 0.5 м кривизна практически не влияет на результат.

    Алгоритм:
        1. r_wall = δ_р / λ_р (если заданы толщина и λ стенки)
        2. r_ins  = δ_из / λ_из  (изоляция — плоская стенка)
        3. r_ext  = 1 / α_внеш   (α = 11.6 + 7·v на улице, 9.0 в помещении)
        4. r_total = r_wall + r_ins + r_ext
        5. q = ΔT / r_total (Вт/м², БЕЗ safety_factor)
        6. S — площадь по форме (cylinder/rectangle/sphere)
        7. Q = q · S · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры ёмкости. Требует указать геометрию,
            подходящую под `shape`: cylinder (d+h), rectangular (l+w+h), sphere (d).
        coefficients: аналогично `calc_pipe_heat_loss`.

    Returns:
        TankHeatLossResult: `heat_loss_per_m2` (q без K), `total_heat_loss` (Q с K),
        `surface_area` (S).

    Raises:
        ValueError: невалидная форма, отсутствие обязательной геометрии,
            невалидные температуры/толщины.

    See Also:
        formules.md, docs/context/formulas-summary.md
    """
    validate_positive("Толщина изоляции", params.insulation_thickness)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    t_mean = (params.ambient_temperature + params.process_temperature) / 2.0
    delta_t = params.process_temperature - params.ambient_temperature

    # --- 1. Сопротивление стенки резервуара ---
    r_wall = 0.0
    if params.wall_thickness is not None and params.wall_lambda is not None:
        validate_positive("Толщина стенки резервуара", params.wall_thickness)
        validate_positive("Теплопроводность стенки резервуара", params.wall_lambda)
        r_wall = None

    # --- 2. Сопротивление изоляции (плоская стенка) ---
    lambda_ins = get_insulation_conductivity(
        material=params.insulation_material,
        temperature=t_mean,
    )
    r_ins = params.insulation_thickness / lambda_ins

    # --- 3. Внешнее сопротивление ---
    alpha = _calc_alpha(params)
    r_ext = 1.0 / alpha

    # --- 4–5. Тепловой поток на м² ---
    r_total = r_wall + r_ins + r_ext
    q_per_m2 = delta_t / r_total

    # --- 6. Площадь ---
    area = _surface_area(params)

    # --- 7. Коэффициент запаса ---
    merged = merge_coefficients(coefficients)
    k = params.safety_factor or merged.get("safety_factor", 1.1)

    # --- 8. Итоговые теплопотери ---
    q_total = q_per_m2 * area * k

    return TankHeatLossResult(
        heat_loss_per_m2=round(q_per_m2, 3),
        total_heat_loss=round(q_total, 3),
        surface_area=round(area, 3),
    )


def x_calc_tank_heat_loss__mutmut_38(
    params: TankHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> TankHeatLossResult:
    """Расчёт тепловых потерь ёмкости (модель плоской стенки).

    Упрощение: считаем все стенки плоскими (последовательное сопротивление),
    а площадь поверхности берём по геометрии (цилиндр / параллелепипед / шар).
    Для резервуаров d > 0.5 м кривизна практически не влияет на результат.

    Алгоритм:
        1. r_wall = δ_р / λ_р (если заданы толщина и λ стенки)
        2. r_ins  = δ_из / λ_из  (изоляция — плоская стенка)
        3. r_ext  = 1 / α_внеш   (α = 11.6 + 7·v на улице, 9.0 в помещении)
        4. r_total = r_wall + r_ins + r_ext
        5. q = ΔT / r_total (Вт/м², БЕЗ safety_factor)
        6. S — площадь по форме (cylinder/rectangle/sphere)
        7. Q = q · S · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры ёмкости. Требует указать геометрию,
            подходящую под `shape`: cylinder (d+h), rectangular (l+w+h), sphere (d).
        coefficients: аналогично `calc_pipe_heat_loss`.

    Returns:
        TankHeatLossResult: `heat_loss_per_m2` (q без K), `total_heat_loss` (Q с K),
        `surface_area` (S).

    Raises:
        ValueError: невалидная форма, отсутствие обязательной геометрии,
            невалидные температуры/толщины.

    See Also:
        formules.md, docs/context/formulas-summary.md
    """
    validate_positive("Толщина изоляции", params.insulation_thickness)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    t_mean = (params.ambient_temperature + params.process_temperature) / 2.0
    delta_t = params.process_temperature - params.ambient_temperature

    # --- 1. Сопротивление стенки резервуара ---
    r_wall = 0.0
    if params.wall_thickness is not None and params.wall_lambda is not None:
        validate_positive("Толщина стенки резервуара", params.wall_thickness)
        validate_positive("Теплопроводность стенки резервуара", params.wall_lambda)
        r_wall = params.wall_thickness * params.wall_lambda

    # --- 2. Сопротивление изоляции (плоская стенка) ---
    lambda_ins = get_insulation_conductivity(
        material=params.insulation_material,
        temperature=t_mean,
    )
    r_ins = params.insulation_thickness / lambda_ins

    # --- 3. Внешнее сопротивление ---
    alpha = _calc_alpha(params)
    r_ext = 1.0 / alpha

    # --- 4–5. Тепловой поток на м² ---
    r_total = r_wall + r_ins + r_ext
    q_per_m2 = delta_t / r_total

    # --- 6. Площадь ---
    area = _surface_area(params)

    # --- 7. Коэффициент запаса ---
    merged = merge_coefficients(coefficients)
    k = params.safety_factor or merged.get("safety_factor", 1.1)

    # --- 8. Итоговые теплопотери ---
    q_total = q_per_m2 * area * k

    return TankHeatLossResult(
        heat_loss_per_m2=round(q_per_m2, 3),
        total_heat_loss=round(q_total, 3),
        surface_area=round(area, 3),
    )


def x_calc_tank_heat_loss__mutmut_39(
    params: TankHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> TankHeatLossResult:
    """Расчёт тепловых потерь ёмкости (модель плоской стенки).

    Упрощение: считаем все стенки плоскими (последовательное сопротивление),
    а площадь поверхности берём по геометрии (цилиндр / параллелепипед / шар).
    Для резервуаров d > 0.5 м кривизна практически не влияет на результат.

    Алгоритм:
        1. r_wall = δ_р / λ_р (если заданы толщина и λ стенки)
        2. r_ins  = δ_из / λ_из  (изоляция — плоская стенка)
        3. r_ext  = 1 / α_внеш   (α = 11.6 + 7·v на улице, 9.0 в помещении)
        4. r_total = r_wall + r_ins + r_ext
        5. q = ΔT / r_total (Вт/м², БЕЗ safety_factor)
        6. S — площадь по форме (cylinder/rectangle/sphere)
        7. Q = q · S · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры ёмкости. Требует указать геометрию,
            подходящую под `shape`: cylinder (d+h), rectangular (l+w+h), sphere (d).
        coefficients: аналогично `calc_pipe_heat_loss`.

    Returns:
        TankHeatLossResult: `heat_loss_per_m2` (q без K), `total_heat_loss` (Q с K),
        `surface_area` (S).

    Raises:
        ValueError: невалидная форма, отсутствие обязательной геометрии,
            невалидные температуры/толщины.

    See Also:
        formules.md, docs/context/formulas-summary.md
    """
    validate_positive("Толщина изоляции", params.insulation_thickness)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    t_mean = (params.ambient_temperature + params.process_temperature) / 2.0
    delta_t = params.process_temperature - params.ambient_temperature

    # --- 1. Сопротивление стенки резервуара ---
    r_wall = 0.0
    if params.wall_thickness is not None and params.wall_lambda is not None:
        validate_positive("Толщина стенки резервуара", params.wall_thickness)
        validate_positive("Теплопроводность стенки резервуара", params.wall_lambda)
        r_wall = params.wall_thickness / params.wall_lambda

    # --- 2. Сопротивление изоляции (плоская стенка) ---
    lambda_ins = None
    r_ins = params.insulation_thickness / lambda_ins

    # --- 3. Внешнее сопротивление ---
    alpha = _calc_alpha(params)
    r_ext = 1.0 / alpha

    # --- 4–5. Тепловой поток на м² ---
    r_total = r_wall + r_ins + r_ext
    q_per_m2 = delta_t / r_total

    # --- 6. Площадь ---
    area = _surface_area(params)

    # --- 7. Коэффициент запаса ---
    merged = merge_coefficients(coefficients)
    k = params.safety_factor or merged.get("safety_factor", 1.1)

    # --- 8. Итоговые теплопотери ---
    q_total = q_per_m2 * area * k

    return TankHeatLossResult(
        heat_loss_per_m2=round(q_per_m2, 3),
        total_heat_loss=round(q_total, 3),
        surface_area=round(area, 3),
    )


def x_calc_tank_heat_loss__mutmut_40(
    params: TankHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> TankHeatLossResult:
    """Расчёт тепловых потерь ёмкости (модель плоской стенки).

    Упрощение: считаем все стенки плоскими (последовательное сопротивление),
    а площадь поверхности берём по геометрии (цилиндр / параллелепипед / шар).
    Для резервуаров d > 0.5 м кривизна практически не влияет на результат.

    Алгоритм:
        1. r_wall = δ_р / λ_р (если заданы толщина и λ стенки)
        2. r_ins  = δ_из / λ_из  (изоляция — плоская стенка)
        3. r_ext  = 1 / α_внеш   (α = 11.6 + 7·v на улице, 9.0 в помещении)
        4. r_total = r_wall + r_ins + r_ext
        5. q = ΔT / r_total (Вт/м², БЕЗ safety_factor)
        6. S — площадь по форме (cylinder/rectangle/sphere)
        7. Q = q · S · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры ёмкости. Требует указать геометрию,
            подходящую под `shape`: cylinder (d+h), rectangular (l+w+h), sphere (d).
        coefficients: аналогично `calc_pipe_heat_loss`.

    Returns:
        TankHeatLossResult: `heat_loss_per_m2` (q без K), `total_heat_loss` (Q с K),
        `surface_area` (S).

    Raises:
        ValueError: невалидная форма, отсутствие обязательной геометрии,
            невалидные температуры/толщины.

    See Also:
        formules.md, docs/context/formulas-summary.md
    """
    validate_positive("Толщина изоляции", params.insulation_thickness)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    t_mean = (params.ambient_temperature + params.process_temperature) / 2.0
    delta_t = params.process_temperature - params.ambient_temperature

    # --- 1. Сопротивление стенки резервуара ---
    r_wall = 0.0
    if params.wall_thickness is not None and params.wall_lambda is not None:
        validate_positive("Толщина стенки резервуара", params.wall_thickness)
        validate_positive("Теплопроводность стенки резервуара", params.wall_lambda)
        r_wall = params.wall_thickness / params.wall_lambda

    # --- 2. Сопротивление изоляции (плоская стенка) ---
    lambda_ins = get_insulation_conductivity(
        material=None,
        temperature=t_mean,
    )
    r_ins = params.insulation_thickness / lambda_ins

    # --- 3. Внешнее сопротивление ---
    alpha = _calc_alpha(params)
    r_ext = 1.0 / alpha

    # --- 4–5. Тепловой поток на м² ---
    r_total = r_wall + r_ins + r_ext
    q_per_m2 = delta_t / r_total

    # --- 6. Площадь ---
    area = _surface_area(params)

    # --- 7. Коэффициент запаса ---
    merged = merge_coefficients(coefficients)
    k = params.safety_factor or merged.get("safety_factor", 1.1)

    # --- 8. Итоговые теплопотери ---
    q_total = q_per_m2 * area * k

    return TankHeatLossResult(
        heat_loss_per_m2=round(q_per_m2, 3),
        total_heat_loss=round(q_total, 3),
        surface_area=round(area, 3),
    )


def x_calc_tank_heat_loss__mutmut_41(
    params: TankHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> TankHeatLossResult:
    """Расчёт тепловых потерь ёмкости (модель плоской стенки).

    Упрощение: считаем все стенки плоскими (последовательное сопротивление),
    а площадь поверхности берём по геометрии (цилиндр / параллелепипед / шар).
    Для резервуаров d > 0.5 м кривизна практически не влияет на результат.

    Алгоритм:
        1. r_wall = δ_р / λ_р (если заданы толщина и λ стенки)
        2. r_ins  = δ_из / λ_из  (изоляция — плоская стенка)
        3. r_ext  = 1 / α_внеш   (α = 11.6 + 7·v на улице, 9.0 в помещении)
        4. r_total = r_wall + r_ins + r_ext
        5. q = ΔT / r_total (Вт/м², БЕЗ safety_factor)
        6. S — площадь по форме (cylinder/rectangle/sphere)
        7. Q = q · S · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры ёмкости. Требует указать геометрию,
            подходящую под `shape`: cylinder (d+h), rectangular (l+w+h), sphere (d).
        coefficients: аналогично `calc_pipe_heat_loss`.

    Returns:
        TankHeatLossResult: `heat_loss_per_m2` (q без K), `total_heat_loss` (Q с K),
        `surface_area` (S).

    Raises:
        ValueError: невалидная форма, отсутствие обязательной геометрии,
            невалидные температуры/толщины.

    See Also:
        formules.md, docs/context/formulas-summary.md
    """
    validate_positive("Толщина изоляции", params.insulation_thickness)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    t_mean = (params.ambient_temperature + params.process_temperature) / 2.0
    delta_t = params.process_temperature - params.ambient_temperature

    # --- 1. Сопротивление стенки резервуара ---
    r_wall = 0.0
    if params.wall_thickness is not None and params.wall_lambda is not None:
        validate_positive("Толщина стенки резервуара", params.wall_thickness)
        validate_positive("Теплопроводность стенки резервуара", params.wall_lambda)
        r_wall = params.wall_thickness / params.wall_lambda

    # --- 2. Сопротивление изоляции (плоская стенка) ---
    lambda_ins = get_insulation_conductivity(
        material=params.insulation_material,
        temperature=None,
    )
    r_ins = params.insulation_thickness / lambda_ins

    # --- 3. Внешнее сопротивление ---
    alpha = _calc_alpha(params)
    r_ext = 1.0 / alpha

    # --- 4–5. Тепловой поток на м² ---
    r_total = r_wall + r_ins + r_ext
    q_per_m2 = delta_t / r_total

    # --- 6. Площадь ---
    area = _surface_area(params)

    # --- 7. Коэффициент запаса ---
    merged = merge_coefficients(coefficients)
    k = params.safety_factor or merged.get("safety_factor", 1.1)

    # --- 8. Итоговые теплопотери ---
    q_total = q_per_m2 * area * k

    return TankHeatLossResult(
        heat_loss_per_m2=round(q_per_m2, 3),
        total_heat_loss=round(q_total, 3),
        surface_area=round(area, 3),
    )


def x_calc_tank_heat_loss__mutmut_42(
    params: TankHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> TankHeatLossResult:
    """Расчёт тепловых потерь ёмкости (модель плоской стенки).

    Упрощение: считаем все стенки плоскими (последовательное сопротивление),
    а площадь поверхности берём по геометрии (цилиндр / параллелепипед / шар).
    Для резервуаров d > 0.5 м кривизна практически не влияет на результат.

    Алгоритм:
        1. r_wall = δ_р / λ_р (если заданы толщина и λ стенки)
        2. r_ins  = δ_из / λ_из  (изоляция — плоская стенка)
        3. r_ext  = 1 / α_внеш   (α = 11.6 + 7·v на улице, 9.0 в помещении)
        4. r_total = r_wall + r_ins + r_ext
        5. q = ΔT / r_total (Вт/м², БЕЗ safety_factor)
        6. S — площадь по форме (cylinder/rectangle/sphere)
        7. Q = q · S · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры ёмкости. Требует указать геометрию,
            подходящую под `shape`: cylinder (d+h), rectangular (l+w+h), sphere (d).
        coefficients: аналогично `calc_pipe_heat_loss`.

    Returns:
        TankHeatLossResult: `heat_loss_per_m2` (q без K), `total_heat_loss` (Q с K),
        `surface_area` (S).

    Raises:
        ValueError: невалидная форма, отсутствие обязательной геометрии,
            невалидные температуры/толщины.

    See Also:
        formules.md, docs/context/formulas-summary.md
    """
    validate_positive("Толщина изоляции", params.insulation_thickness)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    t_mean = (params.ambient_temperature + params.process_temperature) / 2.0
    delta_t = params.process_temperature - params.ambient_temperature

    # --- 1. Сопротивление стенки резервуара ---
    r_wall = 0.0
    if params.wall_thickness is not None and params.wall_lambda is not None:
        validate_positive("Толщина стенки резервуара", params.wall_thickness)
        validate_positive("Теплопроводность стенки резервуара", params.wall_lambda)
        r_wall = params.wall_thickness / params.wall_lambda

    # --- 2. Сопротивление изоляции (плоская стенка) ---
    lambda_ins = get_insulation_conductivity(
        temperature=t_mean,
    )
    r_ins = params.insulation_thickness / lambda_ins

    # --- 3. Внешнее сопротивление ---
    alpha = _calc_alpha(params)
    r_ext = 1.0 / alpha

    # --- 4–5. Тепловой поток на м² ---
    r_total = r_wall + r_ins + r_ext
    q_per_m2 = delta_t / r_total

    # --- 6. Площадь ---
    area = _surface_area(params)

    # --- 7. Коэффициент запаса ---
    merged = merge_coefficients(coefficients)
    k = params.safety_factor or merged.get("safety_factor", 1.1)

    # --- 8. Итоговые теплопотери ---
    q_total = q_per_m2 * area * k

    return TankHeatLossResult(
        heat_loss_per_m2=round(q_per_m2, 3),
        total_heat_loss=round(q_total, 3),
        surface_area=round(area, 3),
    )


def x_calc_tank_heat_loss__mutmut_43(
    params: TankHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> TankHeatLossResult:
    """Расчёт тепловых потерь ёмкости (модель плоской стенки).

    Упрощение: считаем все стенки плоскими (последовательное сопротивление),
    а площадь поверхности берём по геометрии (цилиндр / параллелепипед / шар).
    Для резервуаров d > 0.5 м кривизна практически не влияет на результат.

    Алгоритм:
        1. r_wall = δ_р / λ_р (если заданы толщина и λ стенки)
        2. r_ins  = δ_из / λ_из  (изоляция — плоская стенка)
        3. r_ext  = 1 / α_внеш   (α = 11.6 + 7·v на улице, 9.0 в помещении)
        4. r_total = r_wall + r_ins + r_ext
        5. q = ΔT / r_total (Вт/м², БЕЗ safety_factor)
        6. S — площадь по форме (cylinder/rectangle/sphere)
        7. Q = q · S · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры ёмкости. Требует указать геометрию,
            подходящую под `shape`: cylinder (d+h), rectangular (l+w+h), sphere (d).
        coefficients: аналогично `calc_pipe_heat_loss`.

    Returns:
        TankHeatLossResult: `heat_loss_per_m2` (q без K), `total_heat_loss` (Q с K),
        `surface_area` (S).

    Raises:
        ValueError: невалидная форма, отсутствие обязательной геометрии,
            невалидные температуры/толщины.

    See Also:
        formules.md, docs/context/formulas-summary.md
    """
    validate_positive("Толщина изоляции", params.insulation_thickness)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    t_mean = (params.ambient_temperature + params.process_temperature) / 2.0
    delta_t = params.process_temperature - params.ambient_temperature

    # --- 1. Сопротивление стенки резервуара ---
    r_wall = 0.0
    if params.wall_thickness is not None and params.wall_lambda is not None:
        validate_positive("Толщина стенки резервуара", params.wall_thickness)
        validate_positive("Теплопроводность стенки резервуара", params.wall_lambda)
        r_wall = params.wall_thickness / params.wall_lambda

    # --- 2. Сопротивление изоляции (плоская стенка) ---
    lambda_ins = get_insulation_conductivity(
        material=params.insulation_material,
        )
    r_ins = params.insulation_thickness / lambda_ins

    # --- 3. Внешнее сопротивление ---
    alpha = _calc_alpha(params)
    r_ext = 1.0 / alpha

    # --- 4–5. Тепловой поток на м² ---
    r_total = r_wall + r_ins + r_ext
    q_per_m2 = delta_t / r_total

    # --- 6. Площадь ---
    area = _surface_area(params)

    # --- 7. Коэффициент запаса ---
    merged = merge_coefficients(coefficients)
    k = params.safety_factor or merged.get("safety_factor", 1.1)

    # --- 8. Итоговые теплопотери ---
    q_total = q_per_m2 * area * k

    return TankHeatLossResult(
        heat_loss_per_m2=round(q_per_m2, 3),
        total_heat_loss=round(q_total, 3),
        surface_area=round(area, 3),
    )


def x_calc_tank_heat_loss__mutmut_44(
    params: TankHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> TankHeatLossResult:
    """Расчёт тепловых потерь ёмкости (модель плоской стенки).

    Упрощение: считаем все стенки плоскими (последовательное сопротивление),
    а площадь поверхности берём по геометрии (цилиндр / параллелепипед / шар).
    Для резервуаров d > 0.5 м кривизна практически не влияет на результат.

    Алгоритм:
        1. r_wall = δ_р / λ_р (если заданы толщина и λ стенки)
        2. r_ins  = δ_из / λ_из  (изоляция — плоская стенка)
        3. r_ext  = 1 / α_внеш   (α = 11.6 + 7·v на улице, 9.0 в помещении)
        4. r_total = r_wall + r_ins + r_ext
        5. q = ΔT / r_total (Вт/м², БЕЗ safety_factor)
        6. S — площадь по форме (cylinder/rectangle/sphere)
        7. Q = q · S · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры ёмкости. Требует указать геометрию,
            подходящую под `shape`: cylinder (d+h), rectangular (l+w+h), sphere (d).
        coefficients: аналогично `calc_pipe_heat_loss`.

    Returns:
        TankHeatLossResult: `heat_loss_per_m2` (q без K), `total_heat_loss` (Q с K),
        `surface_area` (S).

    Raises:
        ValueError: невалидная форма, отсутствие обязательной геометрии,
            невалидные температуры/толщины.

    See Also:
        formules.md, docs/context/formulas-summary.md
    """
    validate_positive("Толщина изоляции", params.insulation_thickness)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    t_mean = (params.ambient_temperature + params.process_temperature) / 2.0
    delta_t = params.process_temperature - params.ambient_temperature

    # --- 1. Сопротивление стенки резервуара ---
    r_wall = 0.0
    if params.wall_thickness is not None and params.wall_lambda is not None:
        validate_positive("Толщина стенки резервуара", params.wall_thickness)
        validate_positive("Теплопроводность стенки резервуара", params.wall_lambda)
        r_wall = params.wall_thickness / params.wall_lambda

    # --- 2. Сопротивление изоляции (плоская стенка) ---
    lambda_ins = get_insulation_conductivity(
        material=params.insulation_material,
        temperature=t_mean,
    )
    r_ins = None

    # --- 3. Внешнее сопротивление ---
    alpha = _calc_alpha(params)
    r_ext = 1.0 / alpha

    # --- 4–5. Тепловой поток на м² ---
    r_total = r_wall + r_ins + r_ext
    q_per_m2 = delta_t / r_total

    # --- 6. Площадь ---
    area = _surface_area(params)

    # --- 7. Коэффициент запаса ---
    merged = merge_coefficients(coefficients)
    k = params.safety_factor or merged.get("safety_factor", 1.1)

    # --- 8. Итоговые теплопотери ---
    q_total = q_per_m2 * area * k

    return TankHeatLossResult(
        heat_loss_per_m2=round(q_per_m2, 3),
        total_heat_loss=round(q_total, 3),
        surface_area=round(area, 3),
    )


def x_calc_tank_heat_loss__mutmut_45(
    params: TankHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> TankHeatLossResult:
    """Расчёт тепловых потерь ёмкости (модель плоской стенки).

    Упрощение: считаем все стенки плоскими (последовательное сопротивление),
    а площадь поверхности берём по геометрии (цилиндр / параллелепипед / шар).
    Для резервуаров d > 0.5 м кривизна практически не влияет на результат.

    Алгоритм:
        1. r_wall = δ_р / λ_р (если заданы толщина и λ стенки)
        2. r_ins  = δ_из / λ_из  (изоляция — плоская стенка)
        3. r_ext  = 1 / α_внеш   (α = 11.6 + 7·v на улице, 9.0 в помещении)
        4. r_total = r_wall + r_ins + r_ext
        5. q = ΔT / r_total (Вт/м², БЕЗ safety_factor)
        6. S — площадь по форме (cylinder/rectangle/sphere)
        7. Q = q · S · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры ёмкости. Требует указать геометрию,
            подходящую под `shape`: cylinder (d+h), rectangular (l+w+h), sphere (d).
        coefficients: аналогично `calc_pipe_heat_loss`.

    Returns:
        TankHeatLossResult: `heat_loss_per_m2` (q без K), `total_heat_loss` (Q с K),
        `surface_area` (S).

    Raises:
        ValueError: невалидная форма, отсутствие обязательной геометрии,
            невалидные температуры/толщины.

    See Also:
        formules.md, docs/context/formulas-summary.md
    """
    validate_positive("Толщина изоляции", params.insulation_thickness)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    t_mean = (params.ambient_temperature + params.process_temperature) / 2.0
    delta_t = params.process_temperature - params.ambient_temperature

    # --- 1. Сопротивление стенки резервуара ---
    r_wall = 0.0
    if params.wall_thickness is not None and params.wall_lambda is not None:
        validate_positive("Толщина стенки резервуара", params.wall_thickness)
        validate_positive("Теплопроводность стенки резервуара", params.wall_lambda)
        r_wall = params.wall_thickness / params.wall_lambda

    # --- 2. Сопротивление изоляции (плоская стенка) ---
    lambda_ins = get_insulation_conductivity(
        material=params.insulation_material,
        temperature=t_mean,
    )
    r_ins = params.insulation_thickness * lambda_ins

    # --- 3. Внешнее сопротивление ---
    alpha = _calc_alpha(params)
    r_ext = 1.0 / alpha

    # --- 4–5. Тепловой поток на м² ---
    r_total = r_wall + r_ins + r_ext
    q_per_m2 = delta_t / r_total

    # --- 6. Площадь ---
    area = _surface_area(params)

    # --- 7. Коэффициент запаса ---
    merged = merge_coefficients(coefficients)
    k = params.safety_factor or merged.get("safety_factor", 1.1)

    # --- 8. Итоговые теплопотери ---
    q_total = q_per_m2 * area * k

    return TankHeatLossResult(
        heat_loss_per_m2=round(q_per_m2, 3),
        total_heat_loss=round(q_total, 3),
        surface_area=round(area, 3),
    )


def x_calc_tank_heat_loss__mutmut_46(
    params: TankHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> TankHeatLossResult:
    """Расчёт тепловых потерь ёмкости (модель плоской стенки).

    Упрощение: считаем все стенки плоскими (последовательное сопротивление),
    а площадь поверхности берём по геометрии (цилиндр / параллелепипед / шар).
    Для резервуаров d > 0.5 м кривизна практически не влияет на результат.

    Алгоритм:
        1. r_wall = δ_р / λ_р (если заданы толщина и λ стенки)
        2. r_ins  = δ_из / λ_из  (изоляция — плоская стенка)
        3. r_ext  = 1 / α_внеш   (α = 11.6 + 7·v на улице, 9.0 в помещении)
        4. r_total = r_wall + r_ins + r_ext
        5. q = ΔT / r_total (Вт/м², БЕЗ safety_factor)
        6. S — площадь по форме (cylinder/rectangle/sphere)
        7. Q = q · S · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры ёмкости. Требует указать геометрию,
            подходящую под `shape`: cylinder (d+h), rectangular (l+w+h), sphere (d).
        coefficients: аналогично `calc_pipe_heat_loss`.

    Returns:
        TankHeatLossResult: `heat_loss_per_m2` (q без K), `total_heat_loss` (Q с K),
        `surface_area` (S).

    Raises:
        ValueError: невалидная форма, отсутствие обязательной геометрии,
            невалидные температуры/толщины.

    See Also:
        formules.md, docs/context/formulas-summary.md
    """
    validate_positive("Толщина изоляции", params.insulation_thickness)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    t_mean = (params.ambient_temperature + params.process_temperature) / 2.0
    delta_t = params.process_temperature - params.ambient_temperature

    # --- 1. Сопротивление стенки резервуара ---
    r_wall = 0.0
    if params.wall_thickness is not None and params.wall_lambda is not None:
        validate_positive("Толщина стенки резервуара", params.wall_thickness)
        validate_positive("Теплопроводность стенки резервуара", params.wall_lambda)
        r_wall = params.wall_thickness / params.wall_lambda

    # --- 2. Сопротивление изоляции (плоская стенка) ---
    lambda_ins = get_insulation_conductivity(
        material=params.insulation_material,
        temperature=t_mean,
    )
    r_ins = params.insulation_thickness / lambda_ins

    # --- 3. Внешнее сопротивление ---
    alpha = None
    r_ext = 1.0 / alpha

    # --- 4–5. Тепловой поток на м² ---
    r_total = r_wall + r_ins + r_ext
    q_per_m2 = delta_t / r_total

    # --- 6. Площадь ---
    area = _surface_area(params)

    # --- 7. Коэффициент запаса ---
    merged = merge_coefficients(coefficients)
    k = params.safety_factor or merged.get("safety_factor", 1.1)

    # --- 8. Итоговые теплопотери ---
    q_total = q_per_m2 * area * k

    return TankHeatLossResult(
        heat_loss_per_m2=round(q_per_m2, 3),
        total_heat_loss=round(q_total, 3),
        surface_area=round(area, 3),
    )


def x_calc_tank_heat_loss__mutmut_47(
    params: TankHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> TankHeatLossResult:
    """Расчёт тепловых потерь ёмкости (модель плоской стенки).

    Упрощение: считаем все стенки плоскими (последовательное сопротивление),
    а площадь поверхности берём по геометрии (цилиндр / параллелепипед / шар).
    Для резервуаров d > 0.5 м кривизна практически не влияет на результат.

    Алгоритм:
        1. r_wall = δ_р / λ_р (если заданы толщина и λ стенки)
        2. r_ins  = δ_из / λ_из  (изоляция — плоская стенка)
        3. r_ext  = 1 / α_внеш   (α = 11.6 + 7·v на улице, 9.0 в помещении)
        4. r_total = r_wall + r_ins + r_ext
        5. q = ΔT / r_total (Вт/м², БЕЗ safety_factor)
        6. S — площадь по форме (cylinder/rectangle/sphere)
        7. Q = q · S · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры ёмкости. Требует указать геометрию,
            подходящую под `shape`: cylinder (d+h), rectangular (l+w+h), sphere (d).
        coefficients: аналогично `calc_pipe_heat_loss`.

    Returns:
        TankHeatLossResult: `heat_loss_per_m2` (q без K), `total_heat_loss` (Q с K),
        `surface_area` (S).

    Raises:
        ValueError: невалидная форма, отсутствие обязательной геометрии,
            невалидные температуры/толщины.

    See Also:
        formules.md, docs/context/formulas-summary.md
    """
    validate_positive("Толщина изоляции", params.insulation_thickness)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    t_mean = (params.ambient_temperature + params.process_temperature) / 2.0
    delta_t = params.process_temperature - params.ambient_temperature

    # --- 1. Сопротивление стенки резервуара ---
    r_wall = 0.0
    if params.wall_thickness is not None and params.wall_lambda is not None:
        validate_positive("Толщина стенки резервуара", params.wall_thickness)
        validate_positive("Теплопроводность стенки резервуара", params.wall_lambda)
        r_wall = params.wall_thickness / params.wall_lambda

    # --- 2. Сопротивление изоляции (плоская стенка) ---
    lambda_ins = get_insulation_conductivity(
        material=params.insulation_material,
        temperature=t_mean,
    )
    r_ins = params.insulation_thickness / lambda_ins

    # --- 3. Внешнее сопротивление ---
    alpha = _calc_alpha(None)
    r_ext = 1.0 / alpha

    # --- 4–5. Тепловой поток на м² ---
    r_total = r_wall + r_ins + r_ext
    q_per_m2 = delta_t / r_total

    # --- 6. Площадь ---
    area = _surface_area(params)

    # --- 7. Коэффициент запаса ---
    merged = merge_coefficients(coefficients)
    k = params.safety_factor or merged.get("safety_factor", 1.1)

    # --- 8. Итоговые теплопотери ---
    q_total = q_per_m2 * area * k

    return TankHeatLossResult(
        heat_loss_per_m2=round(q_per_m2, 3),
        total_heat_loss=round(q_total, 3),
        surface_area=round(area, 3),
    )


def x_calc_tank_heat_loss__mutmut_48(
    params: TankHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> TankHeatLossResult:
    """Расчёт тепловых потерь ёмкости (модель плоской стенки).

    Упрощение: считаем все стенки плоскими (последовательное сопротивление),
    а площадь поверхности берём по геометрии (цилиндр / параллелепипед / шар).
    Для резервуаров d > 0.5 м кривизна практически не влияет на результат.

    Алгоритм:
        1. r_wall = δ_р / λ_р (если заданы толщина и λ стенки)
        2. r_ins  = δ_из / λ_из  (изоляция — плоская стенка)
        3. r_ext  = 1 / α_внеш   (α = 11.6 + 7·v на улице, 9.0 в помещении)
        4. r_total = r_wall + r_ins + r_ext
        5. q = ΔT / r_total (Вт/м², БЕЗ safety_factor)
        6. S — площадь по форме (cylinder/rectangle/sphere)
        7. Q = q · S · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры ёмкости. Требует указать геометрию,
            подходящую под `shape`: cylinder (d+h), rectangular (l+w+h), sphere (d).
        coefficients: аналогично `calc_pipe_heat_loss`.

    Returns:
        TankHeatLossResult: `heat_loss_per_m2` (q без K), `total_heat_loss` (Q с K),
        `surface_area` (S).

    Raises:
        ValueError: невалидная форма, отсутствие обязательной геометрии,
            невалидные температуры/толщины.

    See Also:
        formules.md, docs/context/formulas-summary.md
    """
    validate_positive("Толщина изоляции", params.insulation_thickness)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    t_mean = (params.ambient_temperature + params.process_temperature) / 2.0
    delta_t = params.process_temperature - params.ambient_temperature

    # --- 1. Сопротивление стенки резервуара ---
    r_wall = 0.0
    if params.wall_thickness is not None and params.wall_lambda is not None:
        validate_positive("Толщина стенки резервуара", params.wall_thickness)
        validate_positive("Теплопроводность стенки резервуара", params.wall_lambda)
        r_wall = params.wall_thickness / params.wall_lambda

    # --- 2. Сопротивление изоляции (плоская стенка) ---
    lambda_ins = get_insulation_conductivity(
        material=params.insulation_material,
        temperature=t_mean,
    )
    r_ins = params.insulation_thickness / lambda_ins

    # --- 3. Внешнее сопротивление ---
    alpha = _calc_alpha(params)
    r_ext = None

    # --- 4–5. Тепловой поток на м² ---
    r_total = r_wall + r_ins + r_ext
    q_per_m2 = delta_t / r_total

    # --- 6. Площадь ---
    area = _surface_area(params)

    # --- 7. Коэффициент запаса ---
    merged = merge_coefficients(coefficients)
    k = params.safety_factor or merged.get("safety_factor", 1.1)

    # --- 8. Итоговые теплопотери ---
    q_total = q_per_m2 * area * k

    return TankHeatLossResult(
        heat_loss_per_m2=round(q_per_m2, 3),
        total_heat_loss=round(q_total, 3),
        surface_area=round(area, 3),
    )


def x_calc_tank_heat_loss__mutmut_49(
    params: TankHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> TankHeatLossResult:
    """Расчёт тепловых потерь ёмкости (модель плоской стенки).

    Упрощение: считаем все стенки плоскими (последовательное сопротивление),
    а площадь поверхности берём по геометрии (цилиндр / параллелепипед / шар).
    Для резервуаров d > 0.5 м кривизна практически не влияет на результат.

    Алгоритм:
        1. r_wall = δ_р / λ_р (если заданы толщина и λ стенки)
        2. r_ins  = δ_из / λ_из  (изоляция — плоская стенка)
        3. r_ext  = 1 / α_внеш   (α = 11.6 + 7·v на улице, 9.0 в помещении)
        4. r_total = r_wall + r_ins + r_ext
        5. q = ΔT / r_total (Вт/м², БЕЗ safety_factor)
        6. S — площадь по форме (cylinder/rectangle/sphere)
        7. Q = q · S · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры ёмкости. Требует указать геометрию,
            подходящую под `shape`: cylinder (d+h), rectangular (l+w+h), sphere (d).
        coefficients: аналогично `calc_pipe_heat_loss`.

    Returns:
        TankHeatLossResult: `heat_loss_per_m2` (q без K), `total_heat_loss` (Q с K),
        `surface_area` (S).

    Raises:
        ValueError: невалидная форма, отсутствие обязательной геометрии,
            невалидные температуры/толщины.

    See Also:
        formules.md, docs/context/formulas-summary.md
    """
    validate_positive("Толщина изоляции", params.insulation_thickness)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    t_mean = (params.ambient_temperature + params.process_temperature) / 2.0
    delta_t = params.process_temperature - params.ambient_temperature

    # --- 1. Сопротивление стенки резервуара ---
    r_wall = 0.0
    if params.wall_thickness is not None and params.wall_lambda is not None:
        validate_positive("Толщина стенки резервуара", params.wall_thickness)
        validate_positive("Теплопроводность стенки резервуара", params.wall_lambda)
        r_wall = params.wall_thickness / params.wall_lambda

    # --- 2. Сопротивление изоляции (плоская стенка) ---
    lambda_ins = get_insulation_conductivity(
        material=params.insulation_material,
        temperature=t_mean,
    )
    r_ins = params.insulation_thickness / lambda_ins

    # --- 3. Внешнее сопротивление ---
    alpha = _calc_alpha(params)
    r_ext = 1.0 * alpha

    # --- 4–5. Тепловой поток на м² ---
    r_total = r_wall + r_ins + r_ext
    q_per_m2 = delta_t / r_total

    # --- 6. Площадь ---
    area = _surface_area(params)

    # --- 7. Коэффициент запаса ---
    merged = merge_coefficients(coefficients)
    k = params.safety_factor or merged.get("safety_factor", 1.1)

    # --- 8. Итоговые теплопотери ---
    q_total = q_per_m2 * area * k

    return TankHeatLossResult(
        heat_loss_per_m2=round(q_per_m2, 3),
        total_heat_loss=round(q_total, 3),
        surface_area=round(area, 3),
    )


def x_calc_tank_heat_loss__mutmut_50(
    params: TankHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> TankHeatLossResult:
    """Расчёт тепловых потерь ёмкости (модель плоской стенки).

    Упрощение: считаем все стенки плоскими (последовательное сопротивление),
    а площадь поверхности берём по геометрии (цилиндр / параллелепипед / шар).
    Для резервуаров d > 0.5 м кривизна практически не влияет на результат.

    Алгоритм:
        1. r_wall = δ_р / λ_р (если заданы толщина и λ стенки)
        2. r_ins  = δ_из / λ_из  (изоляция — плоская стенка)
        3. r_ext  = 1 / α_внеш   (α = 11.6 + 7·v на улице, 9.0 в помещении)
        4. r_total = r_wall + r_ins + r_ext
        5. q = ΔT / r_total (Вт/м², БЕЗ safety_factor)
        6. S — площадь по форме (cylinder/rectangle/sphere)
        7. Q = q · S · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры ёмкости. Требует указать геометрию,
            подходящую под `shape`: cylinder (d+h), rectangular (l+w+h), sphere (d).
        coefficients: аналогично `calc_pipe_heat_loss`.

    Returns:
        TankHeatLossResult: `heat_loss_per_m2` (q без K), `total_heat_loss` (Q с K),
        `surface_area` (S).

    Raises:
        ValueError: невалидная форма, отсутствие обязательной геометрии,
            невалидные температуры/толщины.

    See Also:
        formules.md, docs/context/formulas-summary.md
    """
    validate_positive("Толщина изоляции", params.insulation_thickness)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    t_mean = (params.ambient_temperature + params.process_temperature) / 2.0
    delta_t = params.process_temperature - params.ambient_temperature

    # --- 1. Сопротивление стенки резервуара ---
    r_wall = 0.0
    if params.wall_thickness is not None and params.wall_lambda is not None:
        validate_positive("Толщина стенки резервуара", params.wall_thickness)
        validate_positive("Теплопроводность стенки резервуара", params.wall_lambda)
        r_wall = params.wall_thickness / params.wall_lambda

    # --- 2. Сопротивление изоляции (плоская стенка) ---
    lambda_ins = get_insulation_conductivity(
        material=params.insulation_material,
        temperature=t_mean,
    )
    r_ins = params.insulation_thickness / lambda_ins

    # --- 3. Внешнее сопротивление ---
    alpha = _calc_alpha(params)
    r_ext = 2.0 / alpha

    # --- 4–5. Тепловой поток на м² ---
    r_total = r_wall + r_ins + r_ext
    q_per_m2 = delta_t / r_total

    # --- 6. Площадь ---
    area = _surface_area(params)

    # --- 7. Коэффициент запаса ---
    merged = merge_coefficients(coefficients)
    k = params.safety_factor or merged.get("safety_factor", 1.1)

    # --- 8. Итоговые теплопотери ---
    q_total = q_per_m2 * area * k

    return TankHeatLossResult(
        heat_loss_per_m2=round(q_per_m2, 3),
        total_heat_loss=round(q_total, 3),
        surface_area=round(area, 3),
    )


def x_calc_tank_heat_loss__mutmut_51(
    params: TankHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> TankHeatLossResult:
    """Расчёт тепловых потерь ёмкости (модель плоской стенки).

    Упрощение: считаем все стенки плоскими (последовательное сопротивление),
    а площадь поверхности берём по геометрии (цилиндр / параллелепипед / шар).
    Для резервуаров d > 0.5 м кривизна практически не влияет на результат.

    Алгоритм:
        1. r_wall = δ_р / λ_р (если заданы толщина и λ стенки)
        2. r_ins  = δ_из / λ_из  (изоляция — плоская стенка)
        3. r_ext  = 1 / α_внеш   (α = 11.6 + 7·v на улице, 9.0 в помещении)
        4. r_total = r_wall + r_ins + r_ext
        5. q = ΔT / r_total (Вт/м², БЕЗ safety_factor)
        6. S — площадь по форме (cylinder/rectangle/sphere)
        7. Q = q · S · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры ёмкости. Требует указать геометрию,
            подходящую под `shape`: cylinder (d+h), rectangular (l+w+h), sphere (d).
        coefficients: аналогично `calc_pipe_heat_loss`.

    Returns:
        TankHeatLossResult: `heat_loss_per_m2` (q без K), `total_heat_loss` (Q с K),
        `surface_area` (S).

    Raises:
        ValueError: невалидная форма, отсутствие обязательной геометрии,
            невалидные температуры/толщины.

    See Also:
        formules.md, docs/context/formulas-summary.md
    """
    validate_positive("Толщина изоляции", params.insulation_thickness)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    t_mean = (params.ambient_temperature + params.process_temperature) / 2.0
    delta_t = params.process_temperature - params.ambient_temperature

    # --- 1. Сопротивление стенки резервуара ---
    r_wall = 0.0
    if params.wall_thickness is not None and params.wall_lambda is not None:
        validate_positive("Толщина стенки резервуара", params.wall_thickness)
        validate_positive("Теплопроводность стенки резервуара", params.wall_lambda)
        r_wall = params.wall_thickness / params.wall_lambda

    # --- 2. Сопротивление изоляции (плоская стенка) ---
    lambda_ins = get_insulation_conductivity(
        material=params.insulation_material,
        temperature=t_mean,
    )
    r_ins = params.insulation_thickness / lambda_ins

    # --- 3. Внешнее сопротивление ---
    alpha = _calc_alpha(params)
    r_ext = 1.0 / alpha

    # --- 4–5. Тепловой поток на м² ---
    r_total = None
    q_per_m2 = delta_t / r_total

    # --- 6. Площадь ---
    area = _surface_area(params)

    # --- 7. Коэффициент запаса ---
    merged = merge_coefficients(coefficients)
    k = params.safety_factor or merged.get("safety_factor", 1.1)

    # --- 8. Итоговые теплопотери ---
    q_total = q_per_m2 * area * k

    return TankHeatLossResult(
        heat_loss_per_m2=round(q_per_m2, 3),
        total_heat_loss=round(q_total, 3),
        surface_area=round(area, 3),
    )


def x_calc_tank_heat_loss__mutmut_52(
    params: TankHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> TankHeatLossResult:
    """Расчёт тепловых потерь ёмкости (модель плоской стенки).

    Упрощение: считаем все стенки плоскими (последовательное сопротивление),
    а площадь поверхности берём по геометрии (цилиндр / параллелепипед / шар).
    Для резервуаров d > 0.5 м кривизна практически не влияет на результат.

    Алгоритм:
        1. r_wall = δ_р / λ_р (если заданы толщина и λ стенки)
        2. r_ins  = δ_из / λ_из  (изоляция — плоская стенка)
        3. r_ext  = 1 / α_внеш   (α = 11.6 + 7·v на улице, 9.0 в помещении)
        4. r_total = r_wall + r_ins + r_ext
        5. q = ΔT / r_total (Вт/м², БЕЗ safety_factor)
        6. S — площадь по форме (cylinder/rectangle/sphere)
        7. Q = q · S · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры ёмкости. Требует указать геометрию,
            подходящую под `shape`: cylinder (d+h), rectangular (l+w+h), sphere (d).
        coefficients: аналогично `calc_pipe_heat_loss`.

    Returns:
        TankHeatLossResult: `heat_loss_per_m2` (q без K), `total_heat_loss` (Q с K),
        `surface_area` (S).

    Raises:
        ValueError: невалидная форма, отсутствие обязательной геометрии,
            невалидные температуры/толщины.

    See Also:
        formules.md, docs/context/formulas-summary.md
    """
    validate_positive("Толщина изоляции", params.insulation_thickness)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    t_mean = (params.ambient_temperature + params.process_temperature) / 2.0
    delta_t = params.process_temperature - params.ambient_temperature

    # --- 1. Сопротивление стенки резервуара ---
    r_wall = 0.0
    if params.wall_thickness is not None and params.wall_lambda is not None:
        validate_positive("Толщина стенки резервуара", params.wall_thickness)
        validate_positive("Теплопроводность стенки резервуара", params.wall_lambda)
        r_wall = params.wall_thickness / params.wall_lambda

    # --- 2. Сопротивление изоляции (плоская стенка) ---
    lambda_ins = get_insulation_conductivity(
        material=params.insulation_material,
        temperature=t_mean,
    )
    r_ins = params.insulation_thickness / lambda_ins

    # --- 3. Внешнее сопротивление ---
    alpha = _calc_alpha(params)
    r_ext = 1.0 / alpha

    # --- 4–5. Тепловой поток на м² ---
    r_total = r_wall + r_ins - r_ext
    q_per_m2 = delta_t / r_total

    # --- 6. Площадь ---
    area = _surface_area(params)

    # --- 7. Коэффициент запаса ---
    merged = merge_coefficients(coefficients)
    k = params.safety_factor or merged.get("safety_factor", 1.1)

    # --- 8. Итоговые теплопотери ---
    q_total = q_per_m2 * area * k

    return TankHeatLossResult(
        heat_loss_per_m2=round(q_per_m2, 3),
        total_heat_loss=round(q_total, 3),
        surface_area=round(area, 3),
    )


def x_calc_tank_heat_loss__mutmut_53(
    params: TankHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> TankHeatLossResult:
    """Расчёт тепловых потерь ёмкости (модель плоской стенки).

    Упрощение: считаем все стенки плоскими (последовательное сопротивление),
    а площадь поверхности берём по геометрии (цилиндр / параллелепипед / шар).
    Для резервуаров d > 0.5 м кривизна практически не влияет на результат.

    Алгоритм:
        1. r_wall = δ_р / λ_р (если заданы толщина и λ стенки)
        2. r_ins  = δ_из / λ_из  (изоляция — плоская стенка)
        3. r_ext  = 1 / α_внеш   (α = 11.6 + 7·v на улице, 9.0 в помещении)
        4. r_total = r_wall + r_ins + r_ext
        5. q = ΔT / r_total (Вт/м², БЕЗ safety_factor)
        6. S — площадь по форме (cylinder/rectangle/sphere)
        7. Q = q · S · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры ёмкости. Требует указать геометрию,
            подходящую под `shape`: cylinder (d+h), rectangular (l+w+h), sphere (d).
        coefficients: аналогично `calc_pipe_heat_loss`.

    Returns:
        TankHeatLossResult: `heat_loss_per_m2` (q без K), `total_heat_loss` (Q с K),
        `surface_area` (S).

    Raises:
        ValueError: невалидная форма, отсутствие обязательной геометрии,
            невалидные температуры/толщины.

    See Also:
        formules.md, docs/context/formulas-summary.md
    """
    validate_positive("Толщина изоляции", params.insulation_thickness)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    t_mean = (params.ambient_temperature + params.process_temperature) / 2.0
    delta_t = params.process_temperature - params.ambient_temperature

    # --- 1. Сопротивление стенки резервуара ---
    r_wall = 0.0
    if params.wall_thickness is not None and params.wall_lambda is not None:
        validate_positive("Толщина стенки резервуара", params.wall_thickness)
        validate_positive("Теплопроводность стенки резервуара", params.wall_lambda)
        r_wall = params.wall_thickness / params.wall_lambda

    # --- 2. Сопротивление изоляции (плоская стенка) ---
    lambda_ins = get_insulation_conductivity(
        material=params.insulation_material,
        temperature=t_mean,
    )
    r_ins = params.insulation_thickness / lambda_ins

    # --- 3. Внешнее сопротивление ---
    alpha = _calc_alpha(params)
    r_ext = 1.0 / alpha

    # --- 4–5. Тепловой поток на м² ---
    r_total = r_wall - r_ins + r_ext
    q_per_m2 = delta_t / r_total

    # --- 6. Площадь ---
    area = _surface_area(params)

    # --- 7. Коэффициент запаса ---
    merged = merge_coefficients(coefficients)
    k = params.safety_factor or merged.get("safety_factor", 1.1)

    # --- 8. Итоговые теплопотери ---
    q_total = q_per_m2 * area * k

    return TankHeatLossResult(
        heat_loss_per_m2=round(q_per_m2, 3),
        total_heat_loss=round(q_total, 3),
        surface_area=round(area, 3),
    )


def x_calc_tank_heat_loss__mutmut_54(
    params: TankHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> TankHeatLossResult:
    """Расчёт тепловых потерь ёмкости (модель плоской стенки).

    Упрощение: считаем все стенки плоскими (последовательное сопротивление),
    а площадь поверхности берём по геометрии (цилиндр / параллелепипед / шар).
    Для резервуаров d > 0.5 м кривизна практически не влияет на результат.

    Алгоритм:
        1. r_wall = δ_р / λ_р (если заданы толщина и λ стенки)
        2. r_ins  = δ_из / λ_из  (изоляция — плоская стенка)
        3. r_ext  = 1 / α_внеш   (α = 11.6 + 7·v на улице, 9.0 в помещении)
        4. r_total = r_wall + r_ins + r_ext
        5. q = ΔT / r_total (Вт/м², БЕЗ safety_factor)
        6. S — площадь по форме (cylinder/rectangle/sphere)
        7. Q = q · S · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры ёмкости. Требует указать геометрию,
            подходящую под `shape`: cylinder (d+h), rectangular (l+w+h), sphere (d).
        coefficients: аналогично `calc_pipe_heat_loss`.

    Returns:
        TankHeatLossResult: `heat_loss_per_m2` (q без K), `total_heat_loss` (Q с K),
        `surface_area` (S).

    Raises:
        ValueError: невалидная форма, отсутствие обязательной геометрии,
            невалидные температуры/толщины.

    See Also:
        formules.md, docs/context/formulas-summary.md
    """
    validate_positive("Толщина изоляции", params.insulation_thickness)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    t_mean = (params.ambient_temperature + params.process_temperature) / 2.0
    delta_t = params.process_temperature - params.ambient_temperature

    # --- 1. Сопротивление стенки резервуара ---
    r_wall = 0.0
    if params.wall_thickness is not None and params.wall_lambda is not None:
        validate_positive("Толщина стенки резервуара", params.wall_thickness)
        validate_positive("Теплопроводность стенки резервуара", params.wall_lambda)
        r_wall = params.wall_thickness / params.wall_lambda

    # --- 2. Сопротивление изоляции (плоская стенка) ---
    lambda_ins = get_insulation_conductivity(
        material=params.insulation_material,
        temperature=t_mean,
    )
    r_ins = params.insulation_thickness / lambda_ins

    # --- 3. Внешнее сопротивление ---
    alpha = _calc_alpha(params)
    r_ext = 1.0 / alpha

    # --- 4–5. Тепловой поток на м² ---
    r_total = r_wall + r_ins + r_ext
    q_per_m2 = None

    # --- 6. Площадь ---
    area = _surface_area(params)

    # --- 7. Коэффициент запаса ---
    merged = merge_coefficients(coefficients)
    k = params.safety_factor or merged.get("safety_factor", 1.1)

    # --- 8. Итоговые теплопотери ---
    q_total = q_per_m2 * area * k

    return TankHeatLossResult(
        heat_loss_per_m2=round(q_per_m2, 3),
        total_heat_loss=round(q_total, 3),
        surface_area=round(area, 3),
    )


def x_calc_tank_heat_loss__mutmut_55(
    params: TankHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> TankHeatLossResult:
    """Расчёт тепловых потерь ёмкости (модель плоской стенки).

    Упрощение: считаем все стенки плоскими (последовательное сопротивление),
    а площадь поверхности берём по геометрии (цилиндр / параллелепипед / шар).
    Для резервуаров d > 0.5 м кривизна практически не влияет на результат.

    Алгоритм:
        1. r_wall = δ_р / λ_р (если заданы толщина и λ стенки)
        2. r_ins  = δ_из / λ_из  (изоляция — плоская стенка)
        3. r_ext  = 1 / α_внеш   (α = 11.6 + 7·v на улице, 9.0 в помещении)
        4. r_total = r_wall + r_ins + r_ext
        5. q = ΔT / r_total (Вт/м², БЕЗ safety_factor)
        6. S — площадь по форме (cylinder/rectangle/sphere)
        7. Q = q · S · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры ёмкости. Требует указать геометрию,
            подходящую под `shape`: cylinder (d+h), rectangular (l+w+h), sphere (d).
        coefficients: аналогично `calc_pipe_heat_loss`.

    Returns:
        TankHeatLossResult: `heat_loss_per_m2` (q без K), `total_heat_loss` (Q с K),
        `surface_area` (S).

    Raises:
        ValueError: невалидная форма, отсутствие обязательной геометрии,
            невалидные температуры/толщины.

    See Also:
        formules.md, docs/context/formulas-summary.md
    """
    validate_positive("Толщина изоляции", params.insulation_thickness)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    t_mean = (params.ambient_temperature + params.process_temperature) / 2.0
    delta_t = params.process_temperature - params.ambient_temperature

    # --- 1. Сопротивление стенки резервуара ---
    r_wall = 0.0
    if params.wall_thickness is not None and params.wall_lambda is not None:
        validate_positive("Толщина стенки резервуара", params.wall_thickness)
        validate_positive("Теплопроводность стенки резервуара", params.wall_lambda)
        r_wall = params.wall_thickness / params.wall_lambda

    # --- 2. Сопротивление изоляции (плоская стенка) ---
    lambda_ins = get_insulation_conductivity(
        material=params.insulation_material,
        temperature=t_mean,
    )
    r_ins = params.insulation_thickness / lambda_ins

    # --- 3. Внешнее сопротивление ---
    alpha = _calc_alpha(params)
    r_ext = 1.0 / alpha

    # --- 4–5. Тепловой поток на м² ---
    r_total = r_wall + r_ins + r_ext
    q_per_m2 = delta_t * r_total

    # --- 6. Площадь ---
    area = _surface_area(params)

    # --- 7. Коэффициент запаса ---
    merged = merge_coefficients(coefficients)
    k = params.safety_factor or merged.get("safety_factor", 1.1)

    # --- 8. Итоговые теплопотери ---
    q_total = q_per_m2 * area * k

    return TankHeatLossResult(
        heat_loss_per_m2=round(q_per_m2, 3),
        total_heat_loss=round(q_total, 3),
        surface_area=round(area, 3),
    )


def x_calc_tank_heat_loss__mutmut_56(
    params: TankHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> TankHeatLossResult:
    """Расчёт тепловых потерь ёмкости (модель плоской стенки).

    Упрощение: считаем все стенки плоскими (последовательное сопротивление),
    а площадь поверхности берём по геометрии (цилиндр / параллелепипед / шар).
    Для резервуаров d > 0.5 м кривизна практически не влияет на результат.

    Алгоритм:
        1. r_wall = δ_р / λ_р (если заданы толщина и λ стенки)
        2. r_ins  = δ_из / λ_из  (изоляция — плоская стенка)
        3. r_ext  = 1 / α_внеш   (α = 11.6 + 7·v на улице, 9.0 в помещении)
        4. r_total = r_wall + r_ins + r_ext
        5. q = ΔT / r_total (Вт/м², БЕЗ safety_factor)
        6. S — площадь по форме (cylinder/rectangle/sphere)
        7. Q = q · S · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры ёмкости. Требует указать геометрию,
            подходящую под `shape`: cylinder (d+h), rectangular (l+w+h), sphere (d).
        coefficients: аналогично `calc_pipe_heat_loss`.

    Returns:
        TankHeatLossResult: `heat_loss_per_m2` (q без K), `total_heat_loss` (Q с K),
        `surface_area` (S).

    Raises:
        ValueError: невалидная форма, отсутствие обязательной геометрии,
            невалидные температуры/толщины.

    See Also:
        formules.md, docs/context/formulas-summary.md
    """
    validate_positive("Толщина изоляции", params.insulation_thickness)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    t_mean = (params.ambient_temperature + params.process_temperature) / 2.0
    delta_t = params.process_temperature - params.ambient_temperature

    # --- 1. Сопротивление стенки резервуара ---
    r_wall = 0.0
    if params.wall_thickness is not None and params.wall_lambda is not None:
        validate_positive("Толщина стенки резервуара", params.wall_thickness)
        validate_positive("Теплопроводность стенки резервуара", params.wall_lambda)
        r_wall = params.wall_thickness / params.wall_lambda

    # --- 2. Сопротивление изоляции (плоская стенка) ---
    lambda_ins = get_insulation_conductivity(
        material=params.insulation_material,
        temperature=t_mean,
    )
    r_ins = params.insulation_thickness / lambda_ins

    # --- 3. Внешнее сопротивление ---
    alpha = _calc_alpha(params)
    r_ext = 1.0 / alpha

    # --- 4–5. Тепловой поток на м² ---
    r_total = r_wall + r_ins + r_ext
    q_per_m2 = delta_t / r_total

    # --- 6. Площадь ---
    area = None

    # --- 7. Коэффициент запаса ---
    merged = merge_coefficients(coefficients)
    k = params.safety_factor or merged.get("safety_factor", 1.1)

    # --- 8. Итоговые теплопотери ---
    q_total = q_per_m2 * area * k

    return TankHeatLossResult(
        heat_loss_per_m2=round(q_per_m2, 3),
        total_heat_loss=round(q_total, 3),
        surface_area=round(area, 3),
    )


def x_calc_tank_heat_loss__mutmut_57(
    params: TankHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> TankHeatLossResult:
    """Расчёт тепловых потерь ёмкости (модель плоской стенки).

    Упрощение: считаем все стенки плоскими (последовательное сопротивление),
    а площадь поверхности берём по геометрии (цилиндр / параллелепипед / шар).
    Для резервуаров d > 0.5 м кривизна практически не влияет на результат.

    Алгоритм:
        1. r_wall = δ_р / λ_р (если заданы толщина и λ стенки)
        2. r_ins  = δ_из / λ_из  (изоляция — плоская стенка)
        3. r_ext  = 1 / α_внеш   (α = 11.6 + 7·v на улице, 9.0 в помещении)
        4. r_total = r_wall + r_ins + r_ext
        5. q = ΔT / r_total (Вт/м², БЕЗ safety_factor)
        6. S — площадь по форме (cylinder/rectangle/sphere)
        7. Q = q · S · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры ёмкости. Требует указать геометрию,
            подходящую под `shape`: cylinder (d+h), rectangular (l+w+h), sphere (d).
        coefficients: аналогично `calc_pipe_heat_loss`.

    Returns:
        TankHeatLossResult: `heat_loss_per_m2` (q без K), `total_heat_loss` (Q с K),
        `surface_area` (S).

    Raises:
        ValueError: невалидная форма, отсутствие обязательной геометрии,
            невалидные температуры/толщины.

    See Also:
        formules.md, docs/context/formulas-summary.md
    """
    validate_positive("Толщина изоляции", params.insulation_thickness)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    t_mean = (params.ambient_temperature + params.process_temperature) / 2.0
    delta_t = params.process_temperature - params.ambient_temperature

    # --- 1. Сопротивление стенки резервуара ---
    r_wall = 0.0
    if params.wall_thickness is not None and params.wall_lambda is not None:
        validate_positive("Толщина стенки резервуара", params.wall_thickness)
        validate_positive("Теплопроводность стенки резервуара", params.wall_lambda)
        r_wall = params.wall_thickness / params.wall_lambda

    # --- 2. Сопротивление изоляции (плоская стенка) ---
    lambda_ins = get_insulation_conductivity(
        material=params.insulation_material,
        temperature=t_mean,
    )
    r_ins = params.insulation_thickness / lambda_ins

    # --- 3. Внешнее сопротивление ---
    alpha = _calc_alpha(params)
    r_ext = 1.0 / alpha

    # --- 4–5. Тепловой поток на м² ---
    r_total = r_wall + r_ins + r_ext
    q_per_m2 = delta_t / r_total

    # --- 6. Площадь ---
    area = _surface_area(None)

    # --- 7. Коэффициент запаса ---
    merged = merge_coefficients(coefficients)
    k = params.safety_factor or merged.get("safety_factor", 1.1)

    # --- 8. Итоговые теплопотери ---
    q_total = q_per_m2 * area * k

    return TankHeatLossResult(
        heat_loss_per_m2=round(q_per_m2, 3),
        total_heat_loss=round(q_total, 3),
        surface_area=round(area, 3),
    )


def x_calc_tank_heat_loss__mutmut_58(
    params: TankHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> TankHeatLossResult:
    """Расчёт тепловых потерь ёмкости (модель плоской стенки).

    Упрощение: считаем все стенки плоскими (последовательное сопротивление),
    а площадь поверхности берём по геометрии (цилиндр / параллелепипед / шар).
    Для резервуаров d > 0.5 м кривизна практически не влияет на результат.

    Алгоритм:
        1. r_wall = δ_р / λ_р (если заданы толщина и λ стенки)
        2. r_ins  = δ_из / λ_из  (изоляция — плоская стенка)
        3. r_ext  = 1 / α_внеш   (α = 11.6 + 7·v на улице, 9.0 в помещении)
        4. r_total = r_wall + r_ins + r_ext
        5. q = ΔT / r_total (Вт/м², БЕЗ safety_factor)
        6. S — площадь по форме (cylinder/rectangle/sphere)
        7. Q = q · S · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры ёмкости. Требует указать геометрию,
            подходящую под `shape`: cylinder (d+h), rectangular (l+w+h), sphere (d).
        coefficients: аналогично `calc_pipe_heat_loss`.

    Returns:
        TankHeatLossResult: `heat_loss_per_m2` (q без K), `total_heat_loss` (Q с K),
        `surface_area` (S).

    Raises:
        ValueError: невалидная форма, отсутствие обязательной геометрии,
            невалидные температуры/толщины.

    See Also:
        formules.md, docs/context/formulas-summary.md
    """
    validate_positive("Толщина изоляции", params.insulation_thickness)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    t_mean = (params.ambient_temperature + params.process_temperature) / 2.0
    delta_t = params.process_temperature - params.ambient_temperature

    # --- 1. Сопротивление стенки резервуара ---
    r_wall = 0.0
    if params.wall_thickness is not None and params.wall_lambda is not None:
        validate_positive("Толщина стенки резервуара", params.wall_thickness)
        validate_positive("Теплопроводность стенки резервуара", params.wall_lambda)
        r_wall = params.wall_thickness / params.wall_lambda

    # --- 2. Сопротивление изоляции (плоская стенка) ---
    lambda_ins = get_insulation_conductivity(
        material=params.insulation_material,
        temperature=t_mean,
    )
    r_ins = params.insulation_thickness / lambda_ins

    # --- 3. Внешнее сопротивление ---
    alpha = _calc_alpha(params)
    r_ext = 1.0 / alpha

    # --- 4–5. Тепловой поток на м² ---
    r_total = r_wall + r_ins + r_ext
    q_per_m2 = delta_t / r_total

    # --- 6. Площадь ---
    area = _surface_area(params)

    # --- 7. Коэффициент запаса ---
    merged = None
    k = params.safety_factor or merged.get("safety_factor", 1.1)

    # --- 8. Итоговые теплопотери ---
    q_total = q_per_m2 * area * k

    return TankHeatLossResult(
        heat_loss_per_m2=round(q_per_m2, 3),
        total_heat_loss=round(q_total, 3),
        surface_area=round(area, 3),
    )


def x_calc_tank_heat_loss__mutmut_59(
    params: TankHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> TankHeatLossResult:
    """Расчёт тепловых потерь ёмкости (модель плоской стенки).

    Упрощение: считаем все стенки плоскими (последовательное сопротивление),
    а площадь поверхности берём по геометрии (цилиндр / параллелепипед / шар).
    Для резервуаров d > 0.5 м кривизна практически не влияет на результат.

    Алгоритм:
        1. r_wall = δ_р / λ_р (если заданы толщина и λ стенки)
        2. r_ins  = δ_из / λ_из  (изоляция — плоская стенка)
        3. r_ext  = 1 / α_внеш   (α = 11.6 + 7·v на улице, 9.0 в помещении)
        4. r_total = r_wall + r_ins + r_ext
        5. q = ΔT / r_total (Вт/м², БЕЗ safety_factor)
        6. S — площадь по форме (cylinder/rectangle/sphere)
        7. Q = q · S · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры ёмкости. Требует указать геометрию,
            подходящую под `shape`: cylinder (d+h), rectangular (l+w+h), sphere (d).
        coefficients: аналогично `calc_pipe_heat_loss`.

    Returns:
        TankHeatLossResult: `heat_loss_per_m2` (q без K), `total_heat_loss` (Q с K),
        `surface_area` (S).

    Raises:
        ValueError: невалидная форма, отсутствие обязательной геометрии,
            невалидные температуры/толщины.

    See Also:
        formules.md, docs/context/formulas-summary.md
    """
    validate_positive("Толщина изоляции", params.insulation_thickness)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    t_mean = (params.ambient_temperature + params.process_temperature) / 2.0
    delta_t = params.process_temperature - params.ambient_temperature

    # --- 1. Сопротивление стенки резервуара ---
    r_wall = 0.0
    if params.wall_thickness is not None and params.wall_lambda is not None:
        validate_positive("Толщина стенки резервуара", params.wall_thickness)
        validate_positive("Теплопроводность стенки резервуара", params.wall_lambda)
        r_wall = params.wall_thickness / params.wall_lambda

    # --- 2. Сопротивление изоляции (плоская стенка) ---
    lambda_ins = get_insulation_conductivity(
        material=params.insulation_material,
        temperature=t_mean,
    )
    r_ins = params.insulation_thickness / lambda_ins

    # --- 3. Внешнее сопротивление ---
    alpha = _calc_alpha(params)
    r_ext = 1.0 / alpha

    # --- 4–5. Тепловой поток на м² ---
    r_total = r_wall + r_ins + r_ext
    q_per_m2 = delta_t / r_total

    # --- 6. Площадь ---
    area = _surface_area(params)

    # --- 7. Коэффициент запаса ---
    merged = merge_coefficients(None)
    k = params.safety_factor or merged.get("safety_factor", 1.1)

    # --- 8. Итоговые теплопотери ---
    q_total = q_per_m2 * area * k

    return TankHeatLossResult(
        heat_loss_per_m2=round(q_per_m2, 3),
        total_heat_loss=round(q_total, 3),
        surface_area=round(area, 3),
    )


def x_calc_tank_heat_loss__mutmut_60(
    params: TankHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> TankHeatLossResult:
    """Расчёт тепловых потерь ёмкости (модель плоской стенки).

    Упрощение: считаем все стенки плоскими (последовательное сопротивление),
    а площадь поверхности берём по геометрии (цилиндр / параллелепипед / шар).
    Для резервуаров d > 0.5 м кривизна практически не влияет на результат.

    Алгоритм:
        1. r_wall = δ_р / λ_р (если заданы толщина и λ стенки)
        2. r_ins  = δ_из / λ_из  (изоляция — плоская стенка)
        3. r_ext  = 1 / α_внеш   (α = 11.6 + 7·v на улице, 9.0 в помещении)
        4. r_total = r_wall + r_ins + r_ext
        5. q = ΔT / r_total (Вт/м², БЕЗ safety_factor)
        6. S — площадь по форме (cylinder/rectangle/sphere)
        7. Q = q · S · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры ёмкости. Требует указать геометрию,
            подходящую под `shape`: cylinder (d+h), rectangular (l+w+h), sphere (d).
        coefficients: аналогично `calc_pipe_heat_loss`.

    Returns:
        TankHeatLossResult: `heat_loss_per_m2` (q без K), `total_heat_loss` (Q с K),
        `surface_area` (S).

    Raises:
        ValueError: невалидная форма, отсутствие обязательной геометрии,
            невалидные температуры/толщины.

    See Also:
        formules.md, docs/context/formulas-summary.md
    """
    validate_positive("Толщина изоляции", params.insulation_thickness)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    t_mean = (params.ambient_temperature + params.process_temperature) / 2.0
    delta_t = params.process_temperature - params.ambient_temperature

    # --- 1. Сопротивление стенки резервуара ---
    r_wall = 0.0
    if params.wall_thickness is not None and params.wall_lambda is not None:
        validate_positive("Толщина стенки резервуара", params.wall_thickness)
        validate_positive("Теплопроводность стенки резервуара", params.wall_lambda)
        r_wall = params.wall_thickness / params.wall_lambda

    # --- 2. Сопротивление изоляции (плоская стенка) ---
    lambda_ins = get_insulation_conductivity(
        material=params.insulation_material,
        temperature=t_mean,
    )
    r_ins = params.insulation_thickness / lambda_ins

    # --- 3. Внешнее сопротивление ---
    alpha = _calc_alpha(params)
    r_ext = 1.0 / alpha

    # --- 4–5. Тепловой поток на м² ---
    r_total = r_wall + r_ins + r_ext
    q_per_m2 = delta_t / r_total

    # --- 6. Площадь ---
    area = _surface_area(params)

    # --- 7. Коэффициент запаса ---
    merged = merge_coefficients(coefficients)
    k = None

    # --- 8. Итоговые теплопотери ---
    q_total = q_per_m2 * area * k

    return TankHeatLossResult(
        heat_loss_per_m2=round(q_per_m2, 3),
        total_heat_loss=round(q_total, 3),
        surface_area=round(area, 3),
    )


def x_calc_tank_heat_loss__mutmut_61(
    params: TankHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> TankHeatLossResult:
    """Расчёт тепловых потерь ёмкости (модель плоской стенки).

    Упрощение: считаем все стенки плоскими (последовательное сопротивление),
    а площадь поверхности берём по геометрии (цилиндр / параллелепипед / шар).
    Для резервуаров d > 0.5 м кривизна практически не влияет на результат.

    Алгоритм:
        1. r_wall = δ_р / λ_р (если заданы толщина и λ стенки)
        2. r_ins  = δ_из / λ_из  (изоляция — плоская стенка)
        3. r_ext  = 1 / α_внеш   (α = 11.6 + 7·v на улице, 9.0 в помещении)
        4. r_total = r_wall + r_ins + r_ext
        5. q = ΔT / r_total (Вт/м², БЕЗ safety_factor)
        6. S — площадь по форме (cylinder/rectangle/sphere)
        7. Q = q · S · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры ёмкости. Требует указать геометрию,
            подходящую под `shape`: cylinder (d+h), rectangular (l+w+h), sphere (d).
        coefficients: аналогично `calc_pipe_heat_loss`.

    Returns:
        TankHeatLossResult: `heat_loss_per_m2` (q без K), `total_heat_loss` (Q с K),
        `surface_area` (S).

    Raises:
        ValueError: невалидная форма, отсутствие обязательной геометрии,
            невалидные температуры/толщины.

    See Also:
        formules.md, docs/context/formulas-summary.md
    """
    validate_positive("Толщина изоляции", params.insulation_thickness)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    t_mean = (params.ambient_temperature + params.process_temperature) / 2.0
    delta_t = params.process_temperature - params.ambient_temperature

    # --- 1. Сопротивление стенки резервуара ---
    r_wall = 0.0
    if params.wall_thickness is not None and params.wall_lambda is not None:
        validate_positive("Толщина стенки резервуара", params.wall_thickness)
        validate_positive("Теплопроводность стенки резервуара", params.wall_lambda)
        r_wall = params.wall_thickness / params.wall_lambda

    # --- 2. Сопротивление изоляции (плоская стенка) ---
    lambda_ins = get_insulation_conductivity(
        material=params.insulation_material,
        temperature=t_mean,
    )
    r_ins = params.insulation_thickness / lambda_ins

    # --- 3. Внешнее сопротивление ---
    alpha = _calc_alpha(params)
    r_ext = 1.0 / alpha

    # --- 4–5. Тепловой поток на м² ---
    r_total = r_wall + r_ins + r_ext
    q_per_m2 = delta_t / r_total

    # --- 6. Площадь ---
    area = _surface_area(params)

    # --- 7. Коэффициент запаса ---
    merged = merge_coefficients(coefficients)
    k = params.safety_factor and merged.get("safety_factor", 1.1)

    # --- 8. Итоговые теплопотери ---
    q_total = q_per_m2 * area * k

    return TankHeatLossResult(
        heat_loss_per_m2=round(q_per_m2, 3),
        total_heat_loss=round(q_total, 3),
        surface_area=round(area, 3),
    )


def x_calc_tank_heat_loss__mutmut_62(
    params: TankHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> TankHeatLossResult:
    """Расчёт тепловых потерь ёмкости (модель плоской стенки).

    Упрощение: считаем все стенки плоскими (последовательное сопротивление),
    а площадь поверхности берём по геометрии (цилиндр / параллелепипед / шар).
    Для резервуаров d > 0.5 м кривизна практически не влияет на результат.

    Алгоритм:
        1. r_wall = δ_р / λ_р (если заданы толщина и λ стенки)
        2. r_ins  = δ_из / λ_из  (изоляция — плоская стенка)
        3. r_ext  = 1 / α_внеш   (α = 11.6 + 7·v на улице, 9.0 в помещении)
        4. r_total = r_wall + r_ins + r_ext
        5. q = ΔT / r_total (Вт/м², БЕЗ safety_factor)
        6. S — площадь по форме (cylinder/rectangle/sphere)
        7. Q = q · S · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры ёмкости. Требует указать геометрию,
            подходящую под `shape`: cylinder (d+h), rectangular (l+w+h), sphere (d).
        coefficients: аналогично `calc_pipe_heat_loss`.

    Returns:
        TankHeatLossResult: `heat_loss_per_m2` (q без K), `total_heat_loss` (Q с K),
        `surface_area` (S).

    Raises:
        ValueError: невалидная форма, отсутствие обязательной геометрии,
            невалидные температуры/толщины.

    See Also:
        formules.md, docs/context/formulas-summary.md
    """
    validate_positive("Толщина изоляции", params.insulation_thickness)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    t_mean = (params.ambient_temperature + params.process_temperature) / 2.0
    delta_t = params.process_temperature - params.ambient_temperature

    # --- 1. Сопротивление стенки резервуара ---
    r_wall = 0.0
    if params.wall_thickness is not None and params.wall_lambda is not None:
        validate_positive("Толщина стенки резервуара", params.wall_thickness)
        validate_positive("Теплопроводность стенки резервуара", params.wall_lambda)
        r_wall = params.wall_thickness / params.wall_lambda

    # --- 2. Сопротивление изоляции (плоская стенка) ---
    lambda_ins = get_insulation_conductivity(
        material=params.insulation_material,
        temperature=t_mean,
    )
    r_ins = params.insulation_thickness / lambda_ins

    # --- 3. Внешнее сопротивление ---
    alpha = _calc_alpha(params)
    r_ext = 1.0 / alpha

    # --- 4–5. Тепловой поток на м² ---
    r_total = r_wall + r_ins + r_ext
    q_per_m2 = delta_t / r_total

    # --- 6. Площадь ---
    area = _surface_area(params)

    # --- 7. Коэффициент запаса ---
    merged = merge_coefficients(coefficients)
    k = params.safety_factor or merged.get(None, 1.1)

    # --- 8. Итоговые теплопотери ---
    q_total = q_per_m2 * area * k

    return TankHeatLossResult(
        heat_loss_per_m2=round(q_per_m2, 3),
        total_heat_loss=round(q_total, 3),
        surface_area=round(area, 3),
    )


def x_calc_tank_heat_loss__mutmut_63(
    params: TankHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> TankHeatLossResult:
    """Расчёт тепловых потерь ёмкости (модель плоской стенки).

    Упрощение: считаем все стенки плоскими (последовательное сопротивление),
    а площадь поверхности берём по геометрии (цилиндр / параллелепипед / шар).
    Для резервуаров d > 0.5 м кривизна практически не влияет на результат.

    Алгоритм:
        1. r_wall = δ_р / λ_р (если заданы толщина и λ стенки)
        2. r_ins  = δ_из / λ_из  (изоляция — плоская стенка)
        3. r_ext  = 1 / α_внеш   (α = 11.6 + 7·v на улице, 9.0 в помещении)
        4. r_total = r_wall + r_ins + r_ext
        5. q = ΔT / r_total (Вт/м², БЕЗ safety_factor)
        6. S — площадь по форме (cylinder/rectangle/sphere)
        7. Q = q · S · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры ёмкости. Требует указать геометрию,
            подходящую под `shape`: cylinder (d+h), rectangular (l+w+h), sphere (d).
        coefficients: аналогично `calc_pipe_heat_loss`.

    Returns:
        TankHeatLossResult: `heat_loss_per_m2` (q без K), `total_heat_loss` (Q с K),
        `surface_area` (S).

    Raises:
        ValueError: невалидная форма, отсутствие обязательной геометрии,
            невалидные температуры/толщины.

    See Also:
        formules.md, docs/context/formulas-summary.md
    """
    validate_positive("Толщина изоляции", params.insulation_thickness)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    t_mean = (params.ambient_temperature + params.process_temperature) / 2.0
    delta_t = params.process_temperature - params.ambient_temperature

    # --- 1. Сопротивление стенки резервуара ---
    r_wall = 0.0
    if params.wall_thickness is not None and params.wall_lambda is not None:
        validate_positive("Толщина стенки резервуара", params.wall_thickness)
        validate_positive("Теплопроводность стенки резервуара", params.wall_lambda)
        r_wall = params.wall_thickness / params.wall_lambda

    # --- 2. Сопротивление изоляции (плоская стенка) ---
    lambda_ins = get_insulation_conductivity(
        material=params.insulation_material,
        temperature=t_mean,
    )
    r_ins = params.insulation_thickness / lambda_ins

    # --- 3. Внешнее сопротивление ---
    alpha = _calc_alpha(params)
    r_ext = 1.0 / alpha

    # --- 4–5. Тепловой поток на м² ---
    r_total = r_wall + r_ins + r_ext
    q_per_m2 = delta_t / r_total

    # --- 6. Площадь ---
    area = _surface_area(params)

    # --- 7. Коэффициент запаса ---
    merged = merge_coefficients(coefficients)
    k = params.safety_factor or merged.get("safety_factor", None)

    # --- 8. Итоговые теплопотери ---
    q_total = q_per_m2 * area * k

    return TankHeatLossResult(
        heat_loss_per_m2=round(q_per_m2, 3),
        total_heat_loss=round(q_total, 3),
        surface_area=round(area, 3),
    )


def x_calc_tank_heat_loss__mutmut_64(
    params: TankHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> TankHeatLossResult:
    """Расчёт тепловых потерь ёмкости (модель плоской стенки).

    Упрощение: считаем все стенки плоскими (последовательное сопротивление),
    а площадь поверхности берём по геометрии (цилиндр / параллелепипед / шар).
    Для резервуаров d > 0.5 м кривизна практически не влияет на результат.

    Алгоритм:
        1. r_wall = δ_р / λ_р (если заданы толщина и λ стенки)
        2. r_ins  = δ_из / λ_из  (изоляция — плоская стенка)
        3. r_ext  = 1 / α_внеш   (α = 11.6 + 7·v на улице, 9.0 в помещении)
        4. r_total = r_wall + r_ins + r_ext
        5. q = ΔT / r_total (Вт/м², БЕЗ safety_factor)
        6. S — площадь по форме (cylinder/rectangle/sphere)
        7. Q = q · S · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры ёмкости. Требует указать геометрию,
            подходящую под `shape`: cylinder (d+h), rectangular (l+w+h), sphere (d).
        coefficients: аналогично `calc_pipe_heat_loss`.

    Returns:
        TankHeatLossResult: `heat_loss_per_m2` (q без K), `total_heat_loss` (Q с K),
        `surface_area` (S).

    Raises:
        ValueError: невалидная форма, отсутствие обязательной геометрии,
            невалидные температуры/толщины.

    See Also:
        formules.md, docs/context/formulas-summary.md
    """
    validate_positive("Толщина изоляции", params.insulation_thickness)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    t_mean = (params.ambient_temperature + params.process_temperature) / 2.0
    delta_t = params.process_temperature - params.ambient_temperature

    # --- 1. Сопротивление стенки резервуара ---
    r_wall = 0.0
    if params.wall_thickness is not None and params.wall_lambda is not None:
        validate_positive("Толщина стенки резервуара", params.wall_thickness)
        validate_positive("Теплопроводность стенки резервуара", params.wall_lambda)
        r_wall = params.wall_thickness / params.wall_lambda

    # --- 2. Сопротивление изоляции (плоская стенка) ---
    lambda_ins = get_insulation_conductivity(
        material=params.insulation_material,
        temperature=t_mean,
    )
    r_ins = params.insulation_thickness / lambda_ins

    # --- 3. Внешнее сопротивление ---
    alpha = _calc_alpha(params)
    r_ext = 1.0 / alpha

    # --- 4–5. Тепловой поток на м² ---
    r_total = r_wall + r_ins + r_ext
    q_per_m2 = delta_t / r_total

    # --- 6. Площадь ---
    area = _surface_area(params)

    # --- 7. Коэффициент запаса ---
    merged = merge_coefficients(coefficients)
    k = params.safety_factor or merged.get(1.1)

    # --- 8. Итоговые теплопотери ---
    q_total = q_per_m2 * area * k

    return TankHeatLossResult(
        heat_loss_per_m2=round(q_per_m2, 3),
        total_heat_loss=round(q_total, 3),
        surface_area=round(area, 3),
    )


def x_calc_tank_heat_loss__mutmut_65(
    params: TankHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> TankHeatLossResult:
    """Расчёт тепловых потерь ёмкости (модель плоской стенки).

    Упрощение: считаем все стенки плоскими (последовательное сопротивление),
    а площадь поверхности берём по геометрии (цилиндр / параллелепипед / шар).
    Для резервуаров d > 0.5 м кривизна практически не влияет на результат.

    Алгоритм:
        1. r_wall = δ_р / λ_р (если заданы толщина и λ стенки)
        2. r_ins  = δ_из / λ_из  (изоляция — плоская стенка)
        3. r_ext  = 1 / α_внеш   (α = 11.6 + 7·v на улице, 9.0 в помещении)
        4. r_total = r_wall + r_ins + r_ext
        5. q = ΔT / r_total (Вт/м², БЕЗ safety_factor)
        6. S — площадь по форме (cylinder/rectangle/sphere)
        7. Q = q · S · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры ёмкости. Требует указать геометрию,
            подходящую под `shape`: cylinder (d+h), rectangular (l+w+h), sphere (d).
        coefficients: аналогично `calc_pipe_heat_loss`.

    Returns:
        TankHeatLossResult: `heat_loss_per_m2` (q без K), `total_heat_loss` (Q с K),
        `surface_area` (S).

    Raises:
        ValueError: невалидная форма, отсутствие обязательной геометрии,
            невалидные температуры/толщины.

    See Also:
        formules.md, docs/context/formulas-summary.md
    """
    validate_positive("Толщина изоляции", params.insulation_thickness)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    t_mean = (params.ambient_temperature + params.process_temperature) / 2.0
    delta_t = params.process_temperature - params.ambient_temperature

    # --- 1. Сопротивление стенки резервуара ---
    r_wall = 0.0
    if params.wall_thickness is not None and params.wall_lambda is not None:
        validate_positive("Толщина стенки резервуара", params.wall_thickness)
        validate_positive("Теплопроводность стенки резервуара", params.wall_lambda)
        r_wall = params.wall_thickness / params.wall_lambda

    # --- 2. Сопротивление изоляции (плоская стенка) ---
    lambda_ins = get_insulation_conductivity(
        material=params.insulation_material,
        temperature=t_mean,
    )
    r_ins = params.insulation_thickness / lambda_ins

    # --- 3. Внешнее сопротивление ---
    alpha = _calc_alpha(params)
    r_ext = 1.0 / alpha

    # --- 4–5. Тепловой поток на м² ---
    r_total = r_wall + r_ins + r_ext
    q_per_m2 = delta_t / r_total

    # --- 6. Площадь ---
    area = _surface_area(params)

    # --- 7. Коэффициент запаса ---
    merged = merge_coefficients(coefficients)
    k = params.safety_factor or merged.get("safety_factor", )

    # --- 8. Итоговые теплопотери ---
    q_total = q_per_m2 * area * k

    return TankHeatLossResult(
        heat_loss_per_m2=round(q_per_m2, 3),
        total_heat_loss=round(q_total, 3),
        surface_area=round(area, 3),
    )


def x_calc_tank_heat_loss__mutmut_66(
    params: TankHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> TankHeatLossResult:
    """Расчёт тепловых потерь ёмкости (модель плоской стенки).

    Упрощение: считаем все стенки плоскими (последовательное сопротивление),
    а площадь поверхности берём по геометрии (цилиндр / параллелепипед / шар).
    Для резервуаров d > 0.5 м кривизна практически не влияет на результат.

    Алгоритм:
        1. r_wall = δ_р / λ_р (если заданы толщина и λ стенки)
        2. r_ins  = δ_из / λ_из  (изоляция — плоская стенка)
        3. r_ext  = 1 / α_внеш   (α = 11.6 + 7·v на улице, 9.0 в помещении)
        4. r_total = r_wall + r_ins + r_ext
        5. q = ΔT / r_total (Вт/м², БЕЗ safety_factor)
        6. S — площадь по форме (cylinder/rectangle/sphere)
        7. Q = q · S · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры ёмкости. Требует указать геометрию,
            подходящую под `shape`: cylinder (d+h), rectangular (l+w+h), sphere (d).
        coefficients: аналогично `calc_pipe_heat_loss`.

    Returns:
        TankHeatLossResult: `heat_loss_per_m2` (q без K), `total_heat_loss` (Q с K),
        `surface_area` (S).

    Raises:
        ValueError: невалидная форма, отсутствие обязательной геометрии,
            невалидные температуры/толщины.

    See Also:
        formules.md, docs/context/formulas-summary.md
    """
    validate_positive("Толщина изоляции", params.insulation_thickness)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    t_mean = (params.ambient_temperature + params.process_temperature) / 2.0
    delta_t = params.process_temperature - params.ambient_temperature

    # --- 1. Сопротивление стенки резервуара ---
    r_wall = 0.0
    if params.wall_thickness is not None and params.wall_lambda is not None:
        validate_positive("Толщина стенки резервуара", params.wall_thickness)
        validate_positive("Теплопроводность стенки резервуара", params.wall_lambda)
        r_wall = params.wall_thickness / params.wall_lambda

    # --- 2. Сопротивление изоляции (плоская стенка) ---
    lambda_ins = get_insulation_conductivity(
        material=params.insulation_material,
        temperature=t_mean,
    )
    r_ins = params.insulation_thickness / lambda_ins

    # --- 3. Внешнее сопротивление ---
    alpha = _calc_alpha(params)
    r_ext = 1.0 / alpha

    # --- 4–5. Тепловой поток на м² ---
    r_total = r_wall + r_ins + r_ext
    q_per_m2 = delta_t / r_total

    # --- 6. Площадь ---
    area = _surface_area(params)

    # --- 7. Коэффициент запаса ---
    merged = merge_coefficients(coefficients)
    k = params.safety_factor or merged.get("XXsafety_factorXX", 1.1)

    # --- 8. Итоговые теплопотери ---
    q_total = q_per_m2 * area * k

    return TankHeatLossResult(
        heat_loss_per_m2=round(q_per_m2, 3),
        total_heat_loss=round(q_total, 3),
        surface_area=round(area, 3),
    )


def x_calc_tank_heat_loss__mutmut_67(
    params: TankHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> TankHeatLossResult:
    """Расчёт тепловых потерь ёмкости (модель плоской стенки).

    Упрощение: считаем все стенки плоскими (последовательное сопротивление),
    а площадь поверхности берём по геометрии (цилиндр / параллелепипед / шар).
    Для резервуаров d > 0.5 м кривизна практически не влияет на результат.

    Алгоритм:
        1. r_wall = δ_р / λ_р (если заданы толщина и λ стенки)
        2. r_ins  = δ_из / λ_из  (изоляция — плоская стенка)
        3. r_ext  = 1 / α_внеш   (α = 11.6 + 7·v на улице, 9.0 в помещении)
        4. r_total = r_wall + r_ins + r_ext
        5. q = ΔT / r_total (Вт/м², БЕЗ safety_factor)
        6. S — площадь по форме (cylinder/rectangle/sphere)
        7. Q = q · S · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры ёмкости. Требует указать геометрию,
            подходящую под `shape`: cylinder (d+h), rectangular (l+w+h), sphere (d).
        coefficients: аналогично `calc_pipe_heat_loss`.

    Returns:
        TankHeatLossResult: `heat_loss_per_m2` (q без K), `total_heat_loss` (Q с K),
        `surface_area` (S).

    Raises:
        ValueError: невалидная форма, отсутствие обязательной геометрии,
            невалидные температуры/толщины.

    See Also:
        formules.md, docs/context/formulas-summary.md
    """
    validate_positive("Толщина изоляции", params.insulation_thickness)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    t_mean = (params.ambient_temperature + params.process_temperature) / 2.0
    delta_t = params.process_temperature - params.ambient_temperature

    # --- 1. Сопротивление стенки резервуара ---
    r_wall = 0.0
    if params.wall_thickness is not None and params.wall_lambda is not None:
        validate_positive("Толщина стенки резервуара", params.wall_thickness)
        validate_positive("Теплопроводность стенки резервуара", params.wall_lambda)
        r_wall = params.wall_thickness / params.wall_lambda

    # --- 2. Сопротивление изоляции (плоская стенка) ---
    lambda_ins = get_insulation_conductivity(
        material=params.insulation_material,
        temperature=t_mean,
    )
    r_ins = params.insulation_thickness / lambda_ins

    # --- 3. Внешнее сопротивление ---
    alpha = _calc_alpha(params)
    r_ext = 1.0 / alpha

    # --- 4–5. Тепловой поток на м² ---
    r_total = r_wall + r_ins + r_ext
    q_per_m2 = delta_t / r_total

    # --- 6. Площадь ---
    area = _surface_area(params)

    # --- 7. Коэффициент запаса ---
    merged = merge_coefficients(coefficients)
    k = params.safety_factor or merged.get("SAFETY_FACTOR", 1.1)

    # --- 8. Итоговые теплопотери ---
    q_total = q_per_m2 * area * k

    return TankHeatLossResult(
        heat_loss_per_m2=round(q_per_m2, 3),
        total_heat_loss=round(q_total, 3),
        surface_area=round(area, 3),
    )


def x_calc_tank_heat_loss__mutmut_68(
    params: TankHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> TankHeatLossResult:
    """Расчёт тепловых потерь ёмкости (модель плоской стенки).

    Упрощение: считаем все стенки плоскими (последовательное сопротивление),
    а площадь поверхности берём по геометрии (цилиндр / параллелепипед / шар).
    Для резервуаров d > 0.5 м кривизна практически не влияет на результат.

    Алгоритм:
        1. r_wall = δ_р / λ_р (если заданы толщина и λ стенки)
        2. r_ins  = δ_из / λ_из  (изоляция — плоская стенка)
        3. r_ext  = 1 / α_внеш   (α = 11.6 + 7·v на улице, 9.0 в помещении)
        4. r_total = r_wall + r_ins + r_ext
        5. q = ΔT / r_total (Вт/м², БЕЗ safety_factor)
        6. S — площадь по форме (cylinder/rectangle/sphere)
        7. Q = q · S · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры ёмкости. Требует указать геометрию,
            подходящую под `shape`: cylinder (d+h), rectangular (l+w+h), sphere (d).
        coefficients: аналогично `calc_pipe_heat_loss`.

    Returns:
        TankHeatLossResult: `heat_loss_per_m2` (q без K), `total_heat_loss` (Q с K),
        `surface_area` (S).

    Raises:
        ValueError: невалидная форма, отсутствие обязательной геометрии,
            невалидные температуры/толщины.

    See Also:
        formules.md, docs/context/formulas-summary.md
    """
    validate_positive("Толщина изоляции", params.insulation_thickness)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    t_mean = (params.ambient_temperature + params.process_temperature) / 2.0
    delta_t = params.process_temperature - params.ambient_temperature

    # --- 1. Сопротивление стенки резервуара ---
    r_wall = 0.0
    if params.wall_thickness is not None and params.wall_lambda is not None:
        validate_positive("Толщина стенки резервуара", params.wall_thickness)
        validate_positive("Теплопроводность стенки резервуара", params.wall_lambda)
        r_wall = params.wall_thickness / params.wall_lambda

    # --- 2. Сопротивление изоляции (плоская стенка) ---
    lambda_ins = get_insulation_conductivity(
        material=params.insulation_material,
        temperature=t_mean,
    )
    r_ins = params.insulation_thickness / lambda_ins

    # --- 3. Внешнее сопротивление ---
    alpha = _calc_alpha(params)
    r_ext = 1.0 / alpha

    # --- 4–5. Тепловой поток на м² ---
    r_total = r_wall + r_ins + r_ext
    q_per_m2 = delta_t / r_total

    # --- 6. Площадь ---
    area = _surface_area(params)

    # --- 7. Коэффициент запаса ---
    merged = merge_coefficients(coefficients)
    k = params.safety_factor or merged.get("safety_factor", 2.1)

    # --- 8. Итоговые теплопотери ---
    q_total = q_per_m2 * area * k

    return TankHeatLossResult(
        heat_loss_per_m2=round(q_per_m2, 3),
        total_heat_loss=round(q_total, 3),
        surface_area=round(area, 3),
    )


def x_calc_tank_heat_loss__mutmut_69(
    params: TankHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> TankHeatLossResult:
    """Расчёт тепловых потерь ёмкости (модель плоской стенки).

    Упрощение: считаем все стенки плоскими (последовательное сопротивление),
    а площадь поверхности берём по геометрии (цилиндр / параллелепипед / шар).
    Для резервуаров d > 0.5 м кривизна практически не влияет на результат.

    Алгоритм:
        1. r_wall = δ_р / λ_р (если заданы толщина и λ стенки)
        2. r_ins  = δ_из / λ_из  (изоляция — плоская стенка)
        3. r_ext  = 1 / α_внеш   (α = 11.6 + 7·v на улице, 9.0 в помещении)
        4. r_total = r_wall + r_ins + r_ext
        5. q = ΔT / r_total (Вт/м², БЕЗ safety_factor)
        6. S — площадь по форме (cylinder/rectangle/sphere)
        7. Q = q · S · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры ёмкости. Требует указать геометрию,
            подходящую под `shape`: cylinder (d+h), rectangular (l+w+h), sphere (d).
        coefficients: аналогично `calc_pipe_heat_loss`.

    Returns:
        TankHeatLossResult: `heat_loss_per_m2` (q без K), `total_heat_loss` (Q с K),
        `surface_area` (S).

    Raises:
        ValueError: невалидная форма, отсутствие обязательной геометрии,
            невалидные температуры/толщины.

    See Also:
        formules.md, docs/context/formulas-summary.md
    """
    validate_positive("Толщина изоляции", params.insulation_thickness)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    t_mean = (params.ambient_temperature + params.process_temperature) / 2.0
    delta_t = params.process_temperature - params.ambient_temperature

    # --- 1. Сопротивление стенки резервуара ---
    r_wall = 0.0
    if params.wall_thickness is not None and params.wall_lambda is not None:
        validate_positive("Толщина стенки резервуара", params.wall_thickness)
        validate_positive("Теплопроводность стенки резервуара", params.wall_lambda)
        r_wall = params.wall_thickness / params.wall_lambda

    # --- 2. Сопротивление изоляции (плоская стенка) ---
    lambda_ins = get_insulation_conductivity(
        material=params.insulation_material,
        temperature=t_mean,
    )
    r_ins = params.insulation_thickness / lambda_ins

    # --- 3. Внешнее сопротивление ---
    alpha = _calc_alpha(params)
    r_ext = 1.0 / alpha

    # --- 4–5. Тепловой поток на м² ---
    r_total = r_wall + r_ins + r_ext
    q_per_m2 = delta_t / r_total

    # --- 6. Площадь ---
    area = _surface_area(params)

    # --- 7. Коэффициент запаса ---
    merged = merge_coefficients(coefficients)
    k = params.safety_factor or merged.get("safety_factor", 1.1)

    # --- 8. Итоговые теплопотери ---
    q_total = None

    return TankHeatLossResult(
        heat_loss_per_m2=round(q_per_m2, 3),
        total_heat_loss=round(q_total, 3),
        surface_area=round(area, 3),
    )


def x_calc_tank_heat_loss__mutmut_70(
    params: TankHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> TankHeatLossResult:
    """Расчёт тепловых потерь ёмкости (модель плоской стенки).

    Упрощение: считаем все стенки плоскими (последовательное сопротивление),
    а площадь поверхности берём по геометрии (цилиндр / параллелепипед / шар).
    Для резервуаров d > 0.5 м кривизна практически не влияет на результат.

    Алгоритм:
        1. r_wall = δ_р / λ_р (если заданы толщина и λ стенки)
        2. r_ins  = δ_из / λ_из  (изоляция — плоская стенка)
        3. r_ext  = 1 / α_внеш   (α = 11.6 + 7·v на улице, 9.0 в помещении)
        4. r_total = r_wall + r_ins + r_ext
        5. q = ΔT / r_total (Вт/м², БЕЗ safety_factor)
        6. S — площадь по форме (cylinder/rectangle/sphere)
        7. Q = q · S · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры ёмкости. Требует указать геометрию,
            подходящую под `shape`: cylinder (d+h), rectangular (l+w+h), sphere (d).
        coefficients: аналогично `calc_pipe_heat_loss`.

    Returns:
        TankHeatLossResult: `heat_loss_per_m2` (q без K), `total_heat_loss` (Q с K),
        `surface_area` (S).

    Raises:
        ValueError: невалидная форма, отсутствие обязательной геометрии,
            невалидные температуры/толщины.

    See Also:
        formules.md, docs/context/formulas-summary.md
    """
    validate_positive("Толщина изоляции", params.insulation_thickness)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    t_mean = (params.ambient_temperature + params.process_temperature) / 2.0
    delta_t = params.process_temperature - params.ambient_temperature

    # --- 1. Сопротивление стенки резервуара ---
    r_wall = 0.0
    if params.wall_thickness is not None and params.wall_lambda is not None:
        validate_positive("Толщина стенки резервуара", params.wall_thickness)
        validate_positive("Теплопроводность стенки резервуара", params.wall_lambda)
        r_wall = params.wall_thickness / params.wall_lambda

    # --- 2. Сопротивление изоляции (плоская стенка) ---
    lambda_ins = get_insulation_conductivity(
        material=params.insulation_material,
        temperature=t_mean,
    )
    r_ins = params.insulation_thickness / lambda_ins

    # --- 3. Внешнее сопротивление ---
    alpha = _calc_alpha(params)
    r_ext = 1.0 / alpha

    # --- 4–5. Тепловой поток на м² ---
    r_total = r_wall + r_ins + r_ext
    q_per_m2 = delta_t / r_total

    # --- 6. Площадь ---
    area = _surface_area(params)

    # --- 7. Коэффициент запаса ---
    merged = merge_coefficients(coefficients)
    k = params.safety_factor or merged.get("safety_factor", 1.1)

    # --- 8. Итоговые теплопотери ---
    q_total = q_per_m2 * area / k

    return TankHeatLossResult(
        heat_loss_per_m2=round(q_per_m2, 3),
        total_heat_loss=round(q_total, 3),
        surface_area=round(area, 3),
    )


def x_calc_tank_heat_loss__mutmut_71(
    params: TankHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> TankHeatLossResult:
    """Расчёт тепловых потерь ёмкости (модель плоской стенки).

    Упрощение: считаем все стенки плоскими (последовательное сопротивление),
    а площадь поверхности берём по геометрии (цилиндр / параллелепипед / шар).
    Для резервуаров d > 0.5 м кривизна практически не влияет на результат.

    Алгоритм:
        1. r_wall = δ_р / λ_р (если заданы толщина и λ стенки)
        2. r_ins  = δ_из / λ_из  (изоляция — плоская стенка)
        3. r_ext  = 1 / α_внеш   (α = 11.6 + 7·v на улице, 9.0 в помещении)
        4. r_total = r_wall + r_ins + r_ext
        5. q = ΔT / r_total (Вт/м², БЕЗ safety_factor)
        6. S — площадь по форме (cylinder/rectangle/sphere)
        7. Q = q · S · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры ёмкости. Требует указать геометрию,
            подходящую под `shape`: cylinder (d+h), rectangular (l+w+h), sphere (d).
        coefficients: аналогично `calc_pipe_heat_loss`.

    Returns:
        TankHeatLossResult: `heat_loss_per_m2` (q без K), `total_heat_loss` (Q с K),
        `surface_area` (S).

    Raises:
        ValueError: невалидная форма, отсутствие обязательной геометрии,
            невалидные температуры/толщины.

    See Also:
        formules.md, docs/context/formulas-summary.md
    """
    validate_positive("Толщина изоляции", params.insulation_thickness)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    t_mean = (params.ambient_temperature + params.process_temperature) / 2.0
    delta_t = params.process_temperature - params.ambient_temperature

    # --- 1. Сопротивление стенки резервуара ---
    r_wall = 0.0
    if params.wall_thickness is not None and params.wall_lambda is not None:
        validate_positive("Толщина стенки резервуара", params.wall_thickness)
        validate_positive("Теплопроводность стенки резервуара", params.wall_lambda)
        r_wall = params.wall_thickness / params.wall_lambda

    # --- 2. Сопротивление изоляции (плоская стенка) ---
    lambda_ins = get_insulation_conductivity(
        material=params.insulation_material,
        temperature=t_mean,
    )
    r_ins = params.insulation_thickness / lambda_ins

    # --- 3. Внешнее сопротивление ---
    alpha = _calc_alpha(params)
    r_ext = 1.0 / alpha

    # --- 4–5. Тепловой поток на м² ---
    r_total = r_wall + r_ins + r_ext
    q_per_m2 = delta_t / r_total

    # --- 6. Площадь ---
    area = _surface_area(params)

    # --- 7. Коэффициент запаса ---
    merged = merge_coefficients(coefficients)
    k = params.safety_factor or merged.get("safety_factor", 1.1)

    # --- 8. Итоговые теплопотери ---
    q_total = q_per_m2 / area * k

    return TankHeatLossResult(
        heat_loss_per_m2=round(q_per_m2, 3),
        total_heat_loss=round(q_total, 3),
        surface_area=round(area, 3),
    )


def x_calc_tank_heat_loss__mutmut_72(
    params: TankHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> TankHeatLossResult:
    """Расчёт тепловых потерь ёмкости (модель плоской стенки).

    Упрощение: считаем все стенки плоскими (последовательное сопротивление),
    а площадь поверхности берём по геометрии (цилиндр / параллелепипед / шар).
    Для резервуаров d > 0.5 м кривизна практически не влияет на результат.

    Алгоритм:
        1. r_wall = δ_р / λ_р (если заданы толщина и λ стенки)
        2. r_ins  = δ_из / λ_из  (изоляция — плоская стенка)
        3. r_ext  = 1 / α_внеш   (α = 11.6 + 7·v на улице, 9.0 в помещении)
        4. r_total = r_wall + r_ins + r_ext
        5. q = ΔT / r_total (Вт/м², БЕЗ safety_factor)
        6. S — площадь по форме (cylinder/rectangle/sphere)
        7. Q = q · S · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры ёмкости. Требует указать геометрию,
            подходящую под `shape`: cylinder (d+h), rectangular (l+w+h), sphere (d).
        coefficients: аналогично `calc_pipe_heat_loss`.

    Returns:
        TankHeatLossResult: `heat_loss_per_m2` (q без K), `total_heat_loss` (Q с K),
        `surface_area` (S).

    Raises:
        ValueError: невалидная форма, отсутствие обязательной геометрии,
            невалидные температуры/толщины.

    See Also:
        formules.md, docs/context/formulas-summary.md
    """
    validate_positive("Толщина изоляции", params.insulation_thickness)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    t_mean = (params.ambient_temperature + params.process_temperature) / 2.0
    delta_t = params.process_temperature - params.ambient_temperature

    # --- 1. Сопротивление стенки резервуара ---
    r_wall = 0.0
    if params.wall_thickness is not None and params.wall_lambda is not None:
        validate_positive("Толщина стенки резервуара", params.wall_thickness)
        validate_positive("Теплопроводность стенки резервуара", params.wall_lambda)
        r_wall = params.wall_thickness / params.wall_lambda

    # --- 2. Сопротивление изоляции (плоская стенка) ---
    lambda_ins = get_insulation_conductivity(
        material=params.insulation_material,
        temperature=t_mean,
    )
    r_ins = params.insulation_thickness / lambda_ins

    # --- 3. Внешнее сопротивление ---
    alpha = _calc_alpha(params)
    r_ext = 1.0 / alpha

    # --- 4–5. Тепловой поток на м² ---
    r_total = r_wall + r_ins + r_ext
    q_per_m2 = delta_t / r_total

    # --- 6. Площадь ---
    area = _surface_area(params)

    # --- 7. Коэффициент запаса ---
    merged = merge_coefficients(coefficients)
    k = params.safety_factor or merged.get("safety_factor", 1.1)

    # --- 8. Итоговые теплопотери ---
    q_total = q_per_m2 * area * k

    return TankHeatLossResult(
        heat_loss_per_m2=None,
        total_heat_loss=round(q_total, 3),
        surface_area=round(area, 3),
    )


def x_calc_tank_heat_loss__mutmut_73(
    params: TankHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> TankHeatLossResult:
    """Расчёт тепловых потерь ёмкости (модель плоской стенки).

    Упрощение: считаем все стенки плоскими (последовательное сопротивление),
    а площадь поверхности берём по геометрии (цилиндр / параллелепипед / шар).
    Для резервуаров d > 0.5 м кривизна практически не влияет на результат.

    Алгоритм:
        1. r_wall = δ_р / λ_р (если заданы толщина и λ стенки)
        2. r_ins  = δ_из / λ_из  (изоляция — плоская стенка)
        3. r_ext  = 1 / α_внеш   (α = 11.6 + 7·v на улице, 9.0 в помещении)
        4. r_total = r_wall + r_ins + r_ext
        5. q = ΔT / r_total (Вт/м², БЕЗ safety_factor)
        6. S — площадь по форме (cylinder/rectangle/sphere)
        7. Q = q · S · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры ёмкости. Требует указать геометрию,
            подходящую под `shape`: cylinder (d+h), rectangular (l+w+h), sphere (d).
        coefficients: аналогично `calc_pipe_heat_loss`.

    Returns:
        TankHeatLossResult: `heat_loss_per_m2` (q без K), `total_heat_loss` (Q с K),
        `surface_area` (S).

    Raises:
        ValueError: невалидная форма, отсутствие обязательной геометрии,
            невалидные температуры/толщины.

    See Also:
        formules.md, docs/context/formulas-summary.md
    """
    validate_positive("Толщина изоляции", params.insulation_thickness)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    t_mean = (params.ambient_temperature + params.process_temperature) / 2.0
    delta_t = params.process_temperature - params.ambient_temperature

    # --- 1. Сопротивление стенки резервуара ---
    r_wall = 0.0
    if params.wall_thickness is not None and params.wall_lambda is not None:
        validate_positive("Толщина стенки резервуара", params.wall_thickness)
        validate_positive("Теплопроводность стенки резервуара", params.wall_lambda)
        r_wall = params.wall_thickness / params.wall_lambda

    # --- 2. Сопротивление изоляции (плоская стенка) ---
    lambda_ins = get_insulation_conductivity(
        material=params.insulation_material,
        temperature=t_mean,
    )
    r_ins = params.insulation_thickness / lambda_ins

    # --- 3. Внешнее сопротивление ---
    alpha = _calc_alpha(params)
    r_ext = 1.0 / alpha

    # --- 4–5. Тепловой поток на м² ---
    r_total = r_wall + r_ins + r_ext
    q_per_m2 = delta_t / r_total

    # --- 6. Площадь ---
    area = _surface_area(params)

    # --- 7. Коэффициент запаса ---
    merged = merge_coefficients(coefficients)
    k = params.safety_factor or merged.get("safety_factor", 1.1)

    # --- 8. Итоговые теплопотери ---
    q_total = q_per_m2 * area * k

    return TankHeatLossResult(
        heat_loss_per_m2=round(q_per_m2, 3),
        total_heat_loss=None,
        surface_area=round(area, 3),
    )


def x_calc_tank_heat_loss__mutmut_74(
    params: TankHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> TankHeatLossResult:
    """Расчёт тепловых потерь ёмкости (модель плоской стенки).

    Упрощение: считаем все стенки плоскими (последовательное сопротивление),
    а площадь поверхности берём по геометрии (цилиндр / параллелепипед / шар).
    Для резервуаров d > 0.5 м кривизна практически не влияет на результат.

    Алгоритм:
        1. r_wall = δ_р / λ_р (если заданы толщина и λ стенки)
        2. r_ins  = δ_из / λ_из  (изоляция — плоская стенка)
        3. r_ext  = 1 / α_внеш   (α = 11.6 + 7·v на улице, 9.0 в помещении)
        4. r_total = r_wall + r_ins + r_ext
        5. q = ΔT / r_total (Вт/м², БЕЗ safety_factor)
        6. S — площадь по форме (cylinder/rectangle/sphere)
        7. Q = q · S · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры ёмкости. Требует указать геометрию,
            подходящую под `shape`: cylinder (d+h), rectangular (l+w+h), sphere (d).
        coefficients: аналогично `calc_pipe_heat_loss`.

    Returns:
        TankHeatLossResult: `heat_loss_per_m2` (q без K), `total_heat_loss` (Q с K),
        `surface_area` (S).

    Raises:
        ValueError: невалидная форма, отсутствие обязательной геометрии,
            невалидные температуры/толщины.

    See Also:
        formules.md, docs/context/formulas-summary.md
    """
    validate_positive("Толщина изоляции", params.insulation_thickness)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    t_mean = (params.ambient_temperature + params.process_temperature) / 2.0
    delta_t = params.process_temperature - params.ambient_temperature

    # --- 1. Сопротивление стенки резервуара ---
    r_wall = 0.0
    if params.wall_thickness is not None and params.wall_lambda is not None:
        validate_positive("Толщина стенки резервуара", params.wall_thickness)
        validate_positive("Теплопроводность стенки резервуара", params.wall_lambda)
        r_wall = params.wall_thickness / params.wall_lambda

    # --- 2. Сопротивление изоляции (плоская стенка) ---
    lambda_ins = get_insulation_conductivity(
        material=params.insulation_material,
        temperature=t_mean,
    )
    r_ins = params.insulation_thickness / lambda_ins

    # --- 3. Внешнее сопротивление ---
    alpha = _calc_alpha(params)
    r_ext = 1.0 / alpha

    # --- 4–5. Тепловой поток на м² ---
    r_total = r_wall + r_ins + r_ext
    q_per_m2 = delta_t / r_total

    # --- 6. Площадь ---
    area = _surface_area(params)

    # --- 7. Коэффициент запаса ---
    merged = merge_coefficients(coefficients)
    k = params.safety_factor or merged.get("safety_factor", 1.1)

    # --- 8. Итоговые теплопотери ---
    q_total = q_per_m2 * area * k

    return TankHeatLossResult(
        heat_loss_per_m2=round(q_per_m2, 3),
        total_heat_loss=round(q_total, 3),
        surface_area=None,
    )


def x_calc_tank_heat_loss__mutmut_75(
    params: TankHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> TankHeatLossResult:
    """Расчёт тепловых потерь ёмкости (модель плоской стенки).

    Упрощение: считаем все стенки плоскими (последовательное сопротивление),
    а площадь поверхности берём по геометрии (цилиндр / параллелепипед / шар).
    Для резервуаров d > 0.5 м кривизна практически не влияет на результат.

    Алгоритм:
        1. r_wall = δ_р / λ_р (если заданы толщина и λ стенки)
        2. r_ins  = δ_из / λ_из  (изоляция — плоская стенка)
        3. r_ext  = 1 / α_внеш   (α = 11.6 + 7·v на улице, 9.0 в помещении)
        4. r_total = r_wall + r_ins + r_ext
        5. q = ΔT / r_total (Вт/м², БЕЗ safety_factor)
        6. S — площадь по форме (cylinder/rectangle/sphere)
        7. Q = q · S · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры ёмкости. Требует указать геометрию,
            подходящую под `shape`: cylinder (d+h), rectangular (l+w+h), sphere (d).
        coefficients: аналогично `calc_pipe_heat_loss`.

    Returns:
        TankHeatLossResult: `heat_loss_per_m2` (q без K), `total_heat_loss` (Q с K),
        `surface_area` (S).

    Raises:
        ValueError: невалидная форма, отсутствие обязательной геометрии,
            невалидные температуры/толщины.

    See Also:
        formules.md, docs/context/formulas-summary.md
    """
    validate_positive("Толщина изоляции", params.insulation_thickness)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    t_mean = (params.ambient_temperature + params.process_temperature) / 2.0
    delta_t = params.process_temperature - params.ambient_temperature

    # --- 1. Сопротивление стенки резервуара ---
    r_wall = 0.0
    if params.wall_thickness is not None and params.wall_lambda is not None:
        validate_positive("Толщина стенки резервуара", params.wall_thickness)
        validate_positive("Теплопроводность стенки резервуара", params.wall_lambda)
        r_wall = params.wall_thickness / params.wall_lambda

    # --- 2. Сопротивление изоляции (плоская стенка) ---
    lambda_ins = get_insulation_conductivity(
        material=params.insulation_material,
        temperature=t_mean,
    )
    r_ins = params.insulation_thickness / lambda_ins

    # --- 3. Внешнее сопротивление ---
    alpha = _calc_alpha(params)
    r_ext = 1.0 / alpha

    # --- 4–5. Тепловой поток на м² ---
    r_total = r_wall + r_ins + r_ext
    q_per_m2 = delta_t / r_total

    # --- 6. Площадь ---
    area = _surface_area(params)

    # --- 7. Коэффициент запаса ---
    merged = merge_coefficients(coefficients)
    k = params.safety_factor or merged.get("safety_factor", 1.1)

    # --- 8. Итоговые теплопотери ---
    q_total = q_per_m2 * area * k

    return TankHeatLossResult(
        total_heat_loss=round(q_total, 3),
        surface_area=round(area, 3),
    )


def x_calc_tank_heat_loss__mutmut_76(
    params: TankHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> TankHeatLossResult:
    """Расчёт тепловых потерь ёмкости (модель плоской стенки).

    Упрощение: считаем все стенки плоскими (последовательное сопротивление),
    а площадь поверхности берём по геометрии (цилиндр / параллелепипед / шар).
    Для резервуаров d > 0.5 м кривизна практически не влияет на результат.

    Алгоритм:
        1. r_wall = δ_р / λ_р (если заданы толщина и λ стенки)
        2. r_ins  = δ_из / λ_из  (изоляция — плоская стенка)
        3. r_ext  = 1 / α_внеш   (α = 11.6 + 7·v на улице, 9.0 в помещении)
        4. r_total = r_wall + r_ins + r_ext
        5. q = ΔT / r_total (Вт/м², БЕЗ safety_factor)
        6. S — площадь по форме (cylinder/rectangle/sphere)
        7. Q = q · S · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры ёмкости. Требует указать геометрию,
            подходящую под `shape`: cylinder (d+h), rectangular (l+w+h), sphere (d).
        coefficients: аналогично `calc_pipe_heat_loss`.

    Returns:
        TankHeatLossResult: `heat_loss_per_m2` (q без K), `total_heat_loss` (Q с K),
        `surface_area` (S).

    Raises:
        ValueError: невалидная форма, отсутствие обязательной геометрии,
            невалидные температуры/толщины.

    See Also:
        formules.md, docs/context/formulas-summary.md
    """
    validate_positive("Толщина изоляции", params.insulation_thickness)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    t_mean = (params.ambient_temperature + params.process_temperature) / 2.0
    delta_t = params.process_temperature - params.ambient_temperature

    # --- 1. Сопротивление стенки резервуара ---
    r_wall = 0.0
    if params.wall_thickness is not None and params.wall_lambda is not None:
        validate_positive("Толщина стенки резервуара", params.wall_thickness)
        validate_positive("Теплопроводность стенки резервуара", params.wall_lambda)
        r_wall = params.wall_thickness / params.wall_lambda

    # --- 2. Сопротивление изоляции (плоская стенка) ---
    lambda_ins = get_insulation_conductivity(
        material=params.insulation_material,
        temperature=t_mean,
    )
    r_ins = params.insulation_thickness / lambda_ins

    # --- 3. Внешнее сопротивление ---
    alpha = _calc_alpha(params)
    r_ext = 1.0 / alpha

    # --- 4–5. Тепловой поток на м² ---
    r_total = r_wall + r_ins + r_ext
    q_per_m2 = delta_t / r_total

    # --- 6. Площадь ---
    area = _surface_area(params)

    # --- 7. Коэффициент запаса ---
    merged = merge_coefficients(coefficients)
    k = params.safety_factor or merged.get("safety_factor", 1.1)

    # --- 8. Итоговые теплопотери ---
    q_total = q_per_m2 * area * k

    return TankHeatLossResult(
        heat_loss_per_m2=round(q_per_m2, 3),
        surface_area=round(area, 3),
    )


def x_calc_tank_heat_loss__mutmut_77(
    params: TankHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> TankHeatLossResult:
    """Расчёт тепловых потерь ёмкости (модель плоской стенки).

    Упрощение: считаем все стенки плоскими (последовательное сопротивление),
    а площадь поверхности берём по геометрии (цилиндр / параллелепипед / шар).
    Для резервуаров d > 0.5 м кривизна практически не влияет на результат.

    Алгоритм:
        1. r_wall = δ_р / λ_р (если заданы толщина и λ стенки)
        2. r_ins  = δ_из / λ_из  (изоляция — плоская стенка)
        3. r_ext  = 1 / α_внеш   (α = 11.6 + 7·v на улице, 9.0 в помещении)
        4. r_total = r_wall + r_ins + r_ext
        5. q = ΔT / r_total (Вт/м², БЕЗ safety_factor)
        6. S — площадь по форме (cylinder/rectangle/sphere)
        7. Q = q · S · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры ёмкости. Требует указать геометрию,
            подходящую под `shape`: cylinder (d+h), rectangular (l+w+h), sphere (d).
        coefficients: аналогично `calc_pipe_heat_loss`.

    Returns:
        TankHeatLossResult: `heat_loss_per_m2` (q без K), `total_heat_loss` (Q с K),
        `surface_area` (S).

    Raises:
        ValueError: невалидная форма, отсутствие обязательной геометрии,
            невалидные температуры/толщины.

    See Also:
        formules.md, docs/context/formulas-summary.md
    """
    validate_positive("Толщина изоляции", params.insulation_thickness)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    t_mean = (params.ambient_temperature + params.process_temperature) / 2.0
    delta_t = params.process_temperature - params.ambient_temperature

    # --- 1. Сопротивление стенки резервуара ---
    r_wall = 0.0
    if params.wall_thickness is not None and params.wall_lambda is not None:
        validate_positive("Толщина стенки резервуара", params.wall_thickness)
        validate_positive("Теплопроводность стенки резервуара", params.wall_lambda)
        r_wall = params.wall_thickness / params.wall_lambda

    # --- 2. Сопротивление изоляции (плоская стенка) ---
    lambda_ins = get_insulation_conductivity(
        material=params.insulation_material,
        temperature=t_mean,
    )
    r_ins = params.insulation_thickness / lambda_ins

    # --- 3. Внешнее сопротивление ---
    alpha = _calc_alpha(params)
    r_ext = 1.0 / alpha

    # --- 4–5. Тепловой поток на м² ---
    r_total = r_wall + r_ins + r_ext
    q_per_m2 = delta_t / r_total

    # --- 6. Площадь ---
    area = _surface_area(params)

    # --- 7. Коэффициент запаса ---
    merged = merge_coefficients(coefficients)
    k = params.safety_factor or merged.get("safety_factor", 1.1)

    # --- 8. Итоговые теплопотери ---
    q_total = q_per_m2 * area * k

    return TankHeatLossResult(
        heat_loss_per_m2=round(q_per_m2, 3),
        total_heat_loss=round(q_total, 3),
        )


def x_calc_tank_heat_loss__mutmut_78(
    params: TankHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> TankHeatLossResult:
    """Расчёт тепловых потерь ёмкости (модель плоской стенки).

    Упрощение: считаем все стенки плоскими (последовательное сопротивление),
    а площадь поверхности берём по геометрии (цилиндр / параллелепипед / шар).
    Для резервуаров d > 0.5 м кривизна практически не влияет на результат.

    Алгоритм:
        1. r_wall = δ_р / λ_р (если заданы толщина и λ стенки)
        2. r_ins  = δ_из / λ_из  (изоляция — плоская стенка)
        3. r_ext  = 1 / α_внеш   (α = 11.6 + 7·v на улице, 9.0 в помещении)
        4. r_total = r_wall + r_ins + r_ext
        5. q = ΔT / r_total (Вт/м², БЕЗ safety_factor)
        6. S — площадь по форме (cylinder/rectangle/sphere)
        7. Q = q · S · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры ёмкости. Требует указать геометрию,
            подходящую под `shape`: cylinder (d+h), rectangular (l+w+h), sphere (d).
        coefficients: аналогично `calc_pipe_heat_loss`.

    Returns:
        TankHeatLossResult: `heat_loss_per_m2` (q без K), `total_heat_loss` (Q с K),
        `surface_area` (S).

    Raises:
        ValueError: невалидная форма, отсутствие обязательной геометрии,
            невалидные температуры/толщины.

    See Also:
        formules.md, docs/context/formulas-summary.md
    """
    validate_positive("Толщина изоляции", params.insulation_thickness)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    t_mean = (params.ambient_temperature + params.process_temperature) / 2.0
    delta_t = params.process_temperature - params.ambient_temperature

    # --- 1. Сопротивление стенки резервуара ---
    r_wall = 0.0
    if params.wall_thickness is not None and params.wall_lambda is not None:
        validate_positive("Толщина стенки резервуара", params.wall_thickness)
        validate_positive("Теплопроводность стенки резервуара", params.wall_lambda)
        r_wall = params.wall_thickness / params.wall_lambda

    # --- 2. Сопротивление изоляции (плоская стенка) ---
    lambda_ins = get_insulation_conductivity(
        material=params.insulation_material,
        temperature=t_mean,
    )
    r_ins = params.insulation_thickness / lambda_ins

    # --- 3. Внешнее сопротивление ---
    alpha = _calc_alpha(params)
    r_ext = 1.0 / alpha

    # --- 4–5. Тепловой поток на м² ---
    r_total = r_wall + r_ins + r_ext
    q_per_m2 = delta_t / r_total

    # --- 6. Площадь ---
    area = _surface_area(params)

    # --- 7. Коэффициент запаса ---
    merged = merge_coefficients(coefficients)
    k = params.safety_factor or merged.get("safety_factor", 1.1)

    # --- 8. Итоговые теплопотери ---
    q_total = q_per_m2 * area * k

    return TankHeatLossResult(
        heat_loss_per_m2=round(None, 3),
        total_heat_loss=round(q_total, 3),
        surface_area=round(area, 3),
    )


def x_calc_tank_heat_loss__mutmut_79(
    params: TankHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> TankHeatLossResult:
    """Расчёт тепловых потерь ёмкости (модель плоской стенки).

    Упрощение: считаем все стенки плоскими (последовательное сопротивление),
    а площадь поверхности берём по геометрии (цилиндр / параллелепипед / шар).
    Для резервуаров d > 0.5 м кривизна практически не влияет на результат.

    Алгоритм:
        1. r_wall = δ_р / λ_р (если заданы толщина и λ стенки)
        2. r_ins  = δ_из / λ_из  (изоляция — плоская стенка)
        3. r_ext  = 1 / α_внеш   (α = 11.6 + 7·v на улице, 9.0 в помещении)
        4. r_total = r_wall + r_ins + r_ext
        5. q = ΔT / r_total (Вт/м², БЕЗ safety_factor)
        6. S — площадь по форме (cylinder/rectangle/sphere)
        7. Q = q · S · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры ёмкости. Требует указать геометрию,
            подходящую под `shape`: cylinder (d+h), rectangular (l+w+h), sphere (d).
        coefficients: аналогично `calc_pipe_heat_loss`.

    Returns:
        TankHeatLossResult: `heat_loss_per_m2` (q без K), `total_heat_loss` (Q с K),
        `surface_area` (S).

    Raises:
        ValueError: невалидная форма, отсутствие обязательной геометрии,
            невалидные температуры/толщины.

    See Also:
        formules.md, docs/context/formulas-summary.md
    """
    validate_positive("Толщина изоляции", params.insulation_thickness)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    t_mean = (params.ambient_temperature + params.process_temperature) / 2.0
    delta_t = params.process_temperature - params.ambient_temperature

    # --- 1. Сопротивление стенки резервуара ---
    r_wall = 0.0
    if params.wall_thickness is not None and params.wall_lambda is not None:
        validate_positive("Толщина стенки резервуара", params.wall_thickness)
        validate_positive("Теплопроводность стенки резервуара", params.wall_lambda)
        r_wall = params.wall_thickness / params.wall_lambda

    # --- 2. Сопротивление изоляции (плоская стенка) ---
    lambda_ins = get_insulation_conductivity(
        material=params.insulation_material,
        temperature=t_mean,
    )
    r_ins = params.insulation_thickness / lambda_ins

    # --- 3. Внешнее сопротивление ---
    alpha = _calc_alpha(params)
    r_ext = 1.0 / alpha

    # --- 4–5. Тепловой поток на м² ---
    r_total = r_wall + r_ins + r_ext
    q_per_m2 = delta_t / r_total

    # --- 6. Площадь ---
    area = _surface_area(params)

    # --- 7. Коэффициент запаса ---
    merged = merge_coefficients(coefficients)
    k = params.safety_factor or merged.get("safety_factor", 1.1)

    # --- 8. Итоговые теплопотери ---
    q_total = q_per_m2 * area * k

    return TankHeatLossResult(
        heat_loss_per_m2=round(q_per_m2, None),
        total_heat_loss=round(q_total, 3),
        surface_area=round(area, 3),
    )


def x_calc_tank_heat_loss__mutmut_80(
    params: TankHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> TankHeatLossResult:
    """Расчёт тепловых потерь ёмкости (модель плоской стенки).

    Упрощение: считаем все стенки плоскими (последовательное сопротивление),
    а площадь поверхности берём по геометрии (цилиндр / параллелепипед / шар).
    Для резервуаров d > 0.5 м кривизна практически не влияет на результат.

    Алгоритм:
        1. r_wall = δ_р / λ_р (если заданы толщина и λ стенки)
        2. r_ins  = δ_из / λ_из  (изоляция — плоская стенка)
        3. r_ext  = 1 / α_внеш   (α = 11.6 + 7·v на улице, 9.0 в помещении)
        4. r_total = r_wall + r_ins + r_ext
        5. q = ΔT / r_total (Вт/м², БЕЗ safety_factor)
        6. S — площадь по форме (cylinder/rectangle/sphere)
        7. Q = q · S · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры ёмкости. Требует указать геометрию,
            подходящую под `shape`: cylinder (d+h), rectangular (l+w+h), sphere (d).
        coefficients: аналогично `calc_pipe_heat_loss`.

    Returns:
        TankHeatLossResult: `heat_loss_per_m2` (q без K), `total_heat_loss` (Q с K),
        `surface_area` (S).

    Raises:
        ValueError: невалидная форма, отсутствие обязательной геометрии,
            невалидные температуры/толщины.

    See Also:
        formules.md, docs/context/formulas-summary.md
    """
    validate_positive("Толщина изоляции", params.insulation_thickness)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    t_mean = (params.ambient_temperature + params.process_temperature) / 2.0
    delta_t = params.process_temperature - params.ambient_temperature

    # --- 1. Сопротивление стенки резервуара ---
    r_wall = 0.0
    if params.wall_thickness is not None and params.wall_lambda is not None:
        validate_positive("Толщина стенки резервуара", params.wall_thickness)
        validate_positive("Теплопроводность стенки резервуара", params.wall_lambda)
        r_wall = params.wall_thickness / params.wall_lambda

    # --- 2. Сопротивление изоляции (плоская стенка) ---
    lambda_ins = get_insulation_conductivity(
        material=params.insulation_material,
        temperature=t_mean,
    )
    r_ins = params.insulation_thickness / lambda_ins

    # --- 3. Внешнее сопротивление ---
    alpha = _calc_alpha(params)
    r_ext = 1.0 / alpha

    # --- 4–5. Тепловой поток на м² ---
    r_total = r_wall + r_ins + r_ext
    q_per_m2 = delta_t / r_total

    # --- 6. Площадь ---
    area = _surface_area(params)

    # --- 7. Коэффициент запаса ---
    merged = merge_coefficients(coefficients)
    k = params.safety_factor or merged.get("safety_factor", 1.1)

    # --- 8. Итоговые теплопотери ---
    q_total = q_per_m2 * area * k

    return TankHeatLossResult(
        heat_loss_per_m2=round(3),
        total_heat_loss=round(q_total, 3),
        surface_area=round(area, 3),
    )


def x_calc_tank_heat_loss__mutmut_81(
    params: TankHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> TankHeatLossResult:
    """Расчёт тепловых потерь ёмкости (модель плоской стенки).

    Упрощение: считаем все стенки плоскими (последовательное сопротивление),
    а площадь поверхности берём по геометрии (цилиндр / параллелепипед / шар).
    Для резервуаров d > 0.5 м кривизна практически не влияет на результат.

    Алгоритм:
        1. r_wall = δ_р / λ_р (если заданы толщина и λ стенки)
        2. r_ins  = δ_из / λ_из  (изоляция — плоская стенка)
        3. r_ext  = 1 / α_внеш   (α = 11.6 + 7·v на улице, 9.0 в помещении)
        4. r_total = r_wall + r_ins + r_ext
        5. q = ΔT / r_total (Вт/м², БЕЗ safety_factor)
        6. S — площадь по форме (cylinder/rectangle/sphere)
        7. Q = q · S · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры ёмкости. Требует указать геометрию,
            подходящую под `shape`: cylinder (d+h), rectangular (l+w+h), sphere (d).
        coefficients: аналогично `calc_pipe_heat_loss`.

    Returns:
        TankHeatLossResult: `heat_loss_per_m2` (q без K), `total_heat_loss` (Q с K),
        `surface_area` (S).

    Raises:
        ValueError: невалидная форма, отсутствие обязательной геометрии,
            невалидные температуры/толщины.

    See Also:
        formules.md, docs/context/formulas-summary.md
    """
    validate_positive("Толщина изоляции", params.insulation_thickness)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    t_mean = (params.ambient_temperature + params.process_temperature) / 2.0
    delta_t = params.process_temperature - params.ambient_temperature

    # --- 1. Сопротивление стенки резервуара ---
    r_wall = 0.0
    if params.wall_thickness is not None and params.wall_lambda is not None:
        validate_positive("Толщина стенки резервуара", params.wall_thickness)
        validate_positive("Теплопроводность стенки резервуара", params.wall_lambda)
        r_wall = params.wall_thickness / params.wall_lambda

    # --- 2. Сопротивление изоляции (плоская стенка) ---
    lambda_ins = get_insulation_conductivity(
        material=params.insulation_material,
        temperature=t_mean,
    )
    r_ins = params.insulation_thickness / lambda_ins

    # --- 3. Внешнее сопротивление ---
    alpha = _calc_alpha(params)
    r_ext = 1.0 / alpha

    # --- 4–5. Тепловой поток на м² ---
    r_total = r_wall + r_ins + r_ext
    q_per_m2 = delta_t / r_total

    # --- 6. Площадь ---
    area = _surface_area(params)

    # --- 7. Коэффициент запаса ---
    merged = merge_coefficients(coefficients)
    k = params.safety_factor or merged.get("safety_factor", 1.1)

    # --- 8. Итоговые теплопотери ---
    q_total = q_per_m2 * area * k

    return TankHeatLossResult(
        heat_loss_per_m2=round(q_per_m2, ),
        total_heat_loss=round(q_total, 3),
        surface_area=round(area, 3),
    )


def x_calc_tank_heat_loss__mutmut_82(
    params: TankHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> TankHeatLossResult:
    """Расчёт тепловых потерь ёмкости (модель плоской стенки).

    Упрощение: считаем все стенки плоскими (последовательное сопротивление),
    а площадь поверхности берём по геометрии (цилиндр / параллелепипед / шар).
    Для резервуаров d > 0.5 м кривизна практически не влияет на результат.

    Алгоритм:
        1. r_wall = δ_р / λ_р (если заданы толщина и λ стенки)
        2. r_ins  = δ_из / λ_из  (изоляция — плоская стенка)
        3. r_ext  = 1 / α_внеш   (α = 11.6 + 7·v на улице, 9.0 в помещении)
        4. r_total = r_wall + r_ins + r_ext
        5. q = ΔT / r_total (Вт/м², БЕЗ safety_factor)
        6. S — площадь по форме (cylinder/rectangle/sphere)
        7. Q = q · S · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры ёмкости. Требует указать геометрию,
            подходящую под `shape`: cylinder (d+h), rectangular (l+w+h), sphere (d).
        coefficients: аналогично `calc_pipe_heat_loss`.

    Returns:
        TankHeatLossResult: `heat_loss_per_m2` (q без K), `total_heat_loss` (Q с K),
        `surface_area` (S).

    Raises:
        ValueError: невалидная форма, отсутствие обязательной геометрии,
            невалидные температуры/толщины.

    See Also:
        formules.md, docs/context/formulas-summary.md
    """
    validate_positive("Толщина изоляции", params.insulation_thickness)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    t_mean = (params.ambient_temperature + params.process_temperature) / 2.0
    delta_t = params.process_temperature - params.ambient_temperature

    # --- 1. Сопротивление стенки резервуара ---
    r_wall = 0.0
    if params.wall_thickness is not None and params.wall_lambda is not None:
        validate_positive("Толщина стенки резервуара", params.wall_thickness)
        validate_positive("Теплопроводность стенки резервуара", params.wall_lambda)
        r_wall = params.wall_thickness / params.wall_lambda

    # --- 2. Сопротивление изоляции (плоская стенка) ---
    lambda_ins = get_insulation_conductivity(
        material=params.insulation_material,
        temperature=t_mean,
    )
    r_ins = params.insulation_thickness / lambda_ins

    # --- 3. Внешнее сопротивление ---
    alpha = _calc_alpha(params)
    r_ext = 1.0 / alpha

    # --- 4–5. Тепловой поток на м² ---
    r_total = r_wall + r_ins + r_ext
    q_per_m2 = delta_t / r_total

    # --- 6. Площадь ---
    area = _surface_area(params)

    # --- 7. Коэффициент запаса ---
    merged = merge_coefficients(coefficients)
    k = params.safety_factor or merged.get("safety_factor", 1.1)

    # --- 8. Итоговые теплопотери ---
    q_total = q_per_m2 * area * k

    return TankHeatLossResult(
        heat_loss_per_m2=round(q_per_m2, 4),
        total_heat_loss=round(q_total, 3),
        surface_area=round(area, 3),
    )


def x_calc_tank_heat_loss__mutmut_83(
    params: TankHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> TankHeatLossResult:
    """Расчёт тепловых потерь ёмкости (модель плоской стенки).

    Упрощение: считаем все стенки плоскими (последовательное сопротивление),
    а площадь поверхности берём по геометрии (цилиндр / параллелепипед / шар).
    Для резервуаров d > 0.5 м кривизна практически не влияет на результат.

    Алгоритм:
        1. r_wall = δ_р / λ_р (если заданы толщина и λ стенки)
        2. r_ins  = δ_из / λ_из  (изоляция — плоская стенка)
        3. r_ext  = 1 / α_внеш   (α = 11.6 + 7·v на улице, 9.0 в помещении)
        4. r_total = r_wall + r_ins + r_ext
        5. q = ΔT / r_total (Вт/м², БЕЗ safety_factor)
        6. S — площадь по форме (cylinder/rectangle/sphere)
        7. Q = q · S · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры ёмкости. Требует указать геометрию,
            подходящую под `shape`: cylinder (d+h), rectangular (l+w+h), sphere (d).
        coefficients: аналогично `calc_pipe_heat_loss`.

    Returns:
        TankHeatLossResult: `heat_loss_per_m2` (q без K), `total_heat_loss` (Q с K),
        `surface_area` (S).

    Raises:
        ValueError: невалидная форма, отсутствие обязательной геометрии,
            невалидные температуры/толщины.

    See Also:
        formules.md, docs/context/formulas-summary.md
    """
    validate_positive("Толщина изоляции", params.insulation_thickness)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    t_mean = (params.ambient_temperature + params.process_temperature) / 2.0
    delta_t = params.process_temperature - params.ambient_temperature

    # --- 1. Сопротивление стенки резервуара ---
    r_wall = 0.0
    if params.wall_thickness is not None and params.wall_lambda is not None:
        validate_positive("Толщина стенки резервуара", params.wall_thickness)
        validate_positive("Теплопроводность стенки резервуара", params.wall_lambda)
        r_wall = params.wall_thickness / params.wall_lambda

    # --- 2. Сопротивление изоляции (плоская стенка) ---
    lambda_ins = get_insulation_conductivity(
        material=params.insulation_material,
        temperature=t_mean,
    )
    r_ins = params.insulation_thickness / lambda_ins

    # --- 3. Внешнее сопротивление ---
    alpha = _calc_alpha(params)
    r_ext = 1.0 / alpha

    # --- 4–5. Тепловой поток на м² ---
    r_total = r_wall + r_ins + r_ext
    q_per_m2 = delta_t / r_total

    # --- 6. Площадь ---
    area = _surface_area(params)

    # --- 7. Коэффициент запаса ---
    merged = merge_coefficients(coefficients)
    k = params.safety_factor or merged.get("safety_factor", 1.1)

    # --- 8. Итоговые теплопотери ---
    q_total = q_per_m2 * area * k

    return TankHeatLossResult(
        heat_loss_per_m2=round(q_per_m2, 3),
        total_heat_loss=round(None, 3),
        surface_area=round(area, 3),
    )


def x_calc_tank_heat_loss__mutmut_84(
    params: TankHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> TankHeatLossResult:
    """Расчёт тепловых потерь ёмкости (модель плоской стенки).

    Упрощение: считаем все стенки плоскими (последовательное сопротивление),
    а площадь поверхности берём по геометрии (цилиндр / параллелепипед / шар).
    Для резервуаров d > 0.5 м кривизна практически не влияет на результат.

    Алгоритм:
        1. r_wall = δ_р / λ_р (если заданы толщина и λ стенки)
        2. r_ins  = δ_из / λ_из  (изоляция — плоская стенка)
        3. r_ext  = 1 / α_внеш   (α = 11.6 + 7·v на улице, 9.0 в помещении)
        4. r_total = r_wall + r_ins + r_ext
        5. q = ΔT / r_total (Вт/м², БЕЗ safety_factor)
        6. S — площадь по форме (cylinder/rectangle/sphere)
        7. Q = q · S · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры ёмкости. Требует указать геометрию,
            подходящую под `shape`: cylinder (d+h), rectangular (l+w+h), sphere (d).
        coefficients: аналогично `calc_pipe_heat_loss`.

    Returns:
        TankHeatLossResult: `heat_loss_per_m2` (q без K), `total_heat_loss` (Q с K),
        `surface_area` (S).

    Raises:
        ValueError: невалидная форма, отсутствие обязательной геометрии,
            невалидные температуры/толщины.

    See Also:
        formules.md, docs/context/formulas-summary.md
    """
    validate_positive("Толщина изоляции", params.insulation_thickness)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    t_mean = (params.ambient_temperature + params.process_temperature) / 2.0
    delta_t = params.process_temperature - params.ambient_temperature

    # --- 1. Сопротивление стенки резервуара ---
    r_wall = 0.0
    if params.wall_thickness is not None and params.wall_lambda is not None:
        validate_positive("Толщина стенки резервуара", params.wall_thickness)
        validate_positive("Теплопроводность стенки резервуара", params.wall_lambda)
        r_wall = params.wall_thickness / params.wall_lambda

    # --- 2. Сопротивление изоляции (плоская стенка) ---
    lambda_ins = get_insulation_conductivity(
        material=params.insulation_material,
        temperature=t_mean,
    )
    r_ins = params.insulation_thickness / lambda_ins

    # --- 3. Внешнее сопротивление ---
    alpha = _calc_alpha(params)
    r_ext = 1.0 / alpha

    # --- 4–5. Тепловой поток на м² ---
    r_total = r_wall + r_ins + r_ext
    q_per_m2 = delta_t / r_total

    # --- 6. Площадь ---
    area = _surface_area(params)

    # --- 7. Коэффициент запаса ---
    merged = merge_coefficients(coefficients)
    k = params.safety_factor or merged.get("safety_factor", 1.1)

    # --- 8. Итоговые теплопотери ---
    q_total = q_per_m2 * area * k

    return TankHeatLossResult(
        heat_loss_per_m2=round(q_per_m2, 3),
        total_heat_loss=round(q_total, None),
        surface_area=round(area, 3),
    )


def x_calc_tank_heat_loss__mutmut_85(
    params: TankHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> TankHeatLossResult:
    """Расчёт тепловых потерь ёмкости (модель плоской стенки).

    Упрощение: считаем все стенки плоскими (последовательное сопротивление),
    а площадь поверхности берём по геометрии (цилиндр / параллелепипед / шар).
    Для резервуаров d > 0.5 м кривизна практически не влияет на результат.

    Алгоритм:
        1. r_wall = δ_р / λ_р (если заданы толщина и λ стенки)
        2. r_ins  = δ_из / λ_из  (изоляция — плоская стенка)
        3. r_ext  = 1 / α_внеш   (α = 11.6 + 7·v на улице, 9.0 в помещении)
        4. r_total = r_wall + r_ins + r_ext
        5. q = ΔT / r_total (Вт/м², БЕЗ safety_factor)
        6. S — площадь по форме (cylinder/rectangle/sphere)
        7. Q = q · S · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры ёмкости. Требует указать геометрию,
            подходящую под `shape`: cylinder (d+h), rectangular (l+w+h), sphere (d).
        coefficients: аналогично `calc_pipe_heat_loss`.

    Returns:
        TankHeatLossResult: `heat_loss_per_m2` (q без K), `total_heat_loss` (Q с K),
        `surface_area` (S).

    Raises:
        ValueError: невалидная форма, отсутствие обязательной геометрии,
            невалидные температуры/толщины.

    See Also:
        formules.md, docs/context/formulas-summary.md
    """
    validate_positive("Толщина изоляции", params.insulation_thickness)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    t_mean = (params.ambient_temperature + params.process_temperature) / 2.0
    delta_t = params.process_temperature - params.ambient_temperature

    # --- 1. Сопротивление стенки резервуара ---
    r_wall = 0.0
    if params.wall_thickness is not None and params.wall_lambda is not None:
        validate_positive("Толщина стенки резервуара", params.wall_thickness)
        validate_positive("Теплопроводность стенки резервуара", params.wall_lambda)
        r_wall = params.wall_thickness / params.wall_lambda

    # --- 2. Сопротивление изоляции (плоская стенка) ---
    lambda_ins = get_insulation_conductivity(
        material=params.insulation_material,
        temperature=t_mean,
    )
    r_ins = params.insulation_thickness / lambda_ins

    # --- 3. Внешнее сопротивление ---
    alpha = _calc_alpha(params)
    r_ext = 1.0 / alpha

    # --- 4–5. Тепловой поток на м² ---
    r_total = r_wall + r_ins + r_ext
    q_per_m2 = delta_t / r_total

    # --- 6. Площадь ---
    area = _surface_area(params)

    # --- 7. Коэффициент запаса ---
    merged = merge_coefficients(coefficients)
    k = params.safety_factor or merged.get("safety_factor", 1.1)

    # --- 8. Итоговые теплопотери ---
    q_total = q_per_m2 * area * k

    return TankHeatLossResult(
        heat_loss_per_m2=round(q_per_m2, 3),
        total_heat_loss=round(3),
        surface_area=round(area, 3),
    )


def x_calc_tank_heat_loss__mutmut_86(
    params: TankHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> TankHeatLossResult:
    """Расчёт тепловых потерь ёмкости (модель плоской стенки).

    Упрощение: считаем все стенки плоскими (последовательное сопротивление),
    а площадь поверхности берём по геометрии (цилиндр / параллелепипед / шар).
    Для резервуаров d > 0.5 м кривизна практически не влияет на результат.

    Алгоритм:
        1. r_wall = δ_р / λ_р (если заданы толщина и λ стенки)
        2. r_ins  = δ_из / λ_из  (изоляция — плоская стенка)
        3. r_ext  = 1 / α_внеш   (α = 11.6 + 7·v на улице, 9.0 в помещении)
        4. r_total = r_wall + r_ins + r_ext
        5. q = ΔT / r_total (Вт/м², БЕЗ safety_factor)
        6. S — площадь по форме (cylinder/rectangle/sphere)
        7. Q = q · S · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры ёмкости. Требует указать геометрию,
            подходящую под `shape`: cylinder (d+h), rectangular (l+w+h), sphere (d).
        coefficients: аналогично `calc_pipe_heat_loss`.

    Returns:
        TankHeatLossResult: `heat_loss_per_m2` (q без K), `total_heat_loss` (Q с K),
        `surface_area` (S).

    Raises:
        ValueError: невалидная форма, отсутствие обязательной геометрии,
            невалидные температуры/толщины.

    See Also:
        formules.md, docs/context/formulas-summary.md
    """
    validate_positive("Толщина изоляции", params.insulation_thickness)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    t_mean = (params.ambient_temperature + params.process_temperature) / 2.0
    delta_t = params.process_temperature - params.ambient_temperature

    # --- 1. Сопротивление стенки резервуара ---
    r_wall = 0.0
    if params.wall_thickness is not None and params.wall_lambda is not None:
        validate_positive("Толщина стенки резервуара", params.wall_thickness)
        validate_positive("Теплопроводность стенки резервуара", params.wall_lambda)
        r_wall = params.wall_thickness / params.wall_lambda

    # --- 2. Сопротивление изоляции (плоская стенка) ---
    lambda_ins = get_insulation_conductivity(
        material=params.insulation_material,
        temperature=t_mean,
    )
    r_ins = params.insulation_thickness / lambda_ins

    # --- 3. Внешнее сопротивление ---
    alpha = _calc_alpha(params)
    r_ext = 1.0 / alpha

    # --- 4–5. Тепловой поток на м² ---
    r_total = r_wall + r_ins + r_ext
    q_per_m2 = delta_t / r_total

    # --- 6. Площадь ---
    area = _surface_area(params)

    # --- 7. Коэффициент запаса ---
    merged = merge_coefficients(coefficients)
    k = params.safety_factor or merged.get("safety_factor", 1.1)

    # --- 8. Итоговые теплопотери ---
    q_total = q_per_m2 * area * k

    return TankHeatLossResult(
        heat_loss_per_m2=round(q_per_m2, 3),
        total_heat_loss=round(q_total, ),
        surface_area=round(area, 3),
    )


def x_calc_tank_heat_loss__mutmut_87(
    params: TankHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> TankHeatLossResult:
    """Расчёт тепловых потерь ёмкости (модель плоской стенки).

    Упрощение: считаем все стенки плоскими (последовательное сопротивление),
    а площадь поверхности берём по геометрии (цилиндр / параллелепипед / шар).
    Для резервуаров d > 0.5 м кривизна практически не влияет на результат.

    Алгоритм:
        1. r_wall = δ_р / λ_р (если заданы толщина и λ стенки)
        2. r_ins  = δ_из / λ_из  (изоляция — плоская стенка)
        3. r_ext  = 1 / α_внеш   (α = 11.6 + 7·v на улице, 9.0 в помещении)
        4. r_total = r_wall + r_ins + r_ext
        5. q = ΔT / r_total (Вт/м², БЕЗ safety_factor)
        6. S — площадь по форме (cylinder/rectangle/sphere)
        7. Q = q · S · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры ёмкости. Требует указать геометрию,
            подходящую под `shape`: cylinder (d+h), rectangular (l+w+h), sphere (d).
        coefficients: аналогично `calc_pipe_heat_loss`.

    Returns:
        TankHeatLossResult: `heat_loss_per_m2` (q без K), `total_heat_loss` (Q с K),
        `surface_area` (S).

    Raises:
        ValueError: невалидная форма, отсутствие обязательной геометрии,
            невалидные температуры/толщины.

    See Also:
        formules.md, docs/context/formulas-summary.md
    """
    validate_positive("Толщина изоляции", params.insulation_thickness)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    t_mean = (params.ambient_temperature + params.process_temperature) / 2.0
    delta_t = params.process_temperature - params.ambient_temperature

    # --- 1. Сопротивление стенки резервуара ---
    r_wall = 0.0
    if params.wall_thickness is not None and params.wall_lambda is not None:
        validate_positive("Толщина стенки резервуара", params.wall_thickness)
        validate_positive("Теплопроводность стенки резервуара", params.wall_lambda)
        r_wall = params.wall_thickness / params.wall_lambda

    # --- 2. Сопротивление изоляции (плоская стенка) ---
    lambda_ins = get_insulation_conductivity(
        material=params.insulation_material,
        temperature=t_mean,
    )
    r_ins = params.insulation_thickness / lambda_ins

    # --- 3. Внешнее сопротивление ---
    alpha = _calc_alpha(params)
    r_ext = 1.0 / alpha

    # --- 4–5. Тепловой поток на м² ---
    r_total = r_wall + r_ins + r_ext
    q_per_m2 = delta_t / r_total

    # --- 6. Площадь ---
    area = _surface_area(params)

    # --- 7. Коэффициент запаса ---
    merged = merge_coefficients(coefficients)
    k = params.safety_factor or merged.get("safety_factor", 1.1)

    # --- 8. Итоговые теплопотери ---
    q_total = q_per_m2 * area * k

    return TankHeatLossResult(
        heat_loss_per_m2=round(q_per_m2, 3),
        total_heat_loss=round(q_total, 4),
        surface_area=round(area, 3),
    )


def x_calc_tank_heat_loss__mutmut_88(
    params: TankHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> TankHeatLossResult:
    """Расчёт тепловых потерь ёмкости (модель плоской стенки).

    Упрощение: считаем все стенки плоскими (последовательное сопротивление),
    а площадь поверхности берём по геометрии (цилиндр / параллелепипед / шар).
    Для резервуаров d > 0.5 м кривизна практически не влияет на результат.

    Алгоритм:
        1. r_wall = δ_р / λ_р (если заданы толщина и λ стенки)
        2. r_ins  = δ_из / λ_из  (изоляция — плоская стенка)
        3. r_ext  = 1 / α_внеш   (α = 11.6 + 7·v на улице, 9.0 в помещении)
        4. r_total = r_wall + r_ins + r_ext
        5. q = ΔT / r_total (Вт/м², БЕЗ safety_factor)
        6. S — площадь по форме (cylinder/rectangle/sphere)
        7. Q = q · S · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры ёмкости. Требует указать геометрию,
            подходящую под `shape`: cylinder (d+h), rectangular (l+w+h), sphere (d).
        coefficients: аналогично `calc_pipe_heat_loss`.

    Returns:
        TankHeatLossResult: `heat_loss_per_m2` (q без K), `total_heat_loss` (Q с K),
        `surface_area` (S).

    Raises:
        ValueError: невалидная форма, отсутствие обязательной геометрии,
            невалидные температуры/толщины.

    See Also:
        formules.md, docs/context/formulas-summary.md
    """
    validate_positive("Толщина изоляции", params.insulation_thickness)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    t_mean = (params.ambient_temperature + params.process_temperature) / 2.0
    delta_t = params.process_temperature - params.ambient_temperature

    # --- 1. Сопротивление стенки резервуара ---
    r_wall = 0.0
    if params.wall_thickness is not None and params.wall_lambda is not None:
        validate_positive("Толщина стенки резервуара", params.wall_thickness)
        validate_positive("Теплопроводность стенки резервуара", params.wall_lambda)
        r_wall = params.wall_thickness / params.wall_lambda

    # --- 2. Сопротивление изоляции (плоская стенка) ---
    lambda_ins = get_insulation_conductivity(
        material=params.insulation_material,
        temperature=t_mean,
    )
    r_ins = params.insulation_thickness / lambda_ins

    # --- 3. Внешнее сопротивление ---
    alpha = _calc_alpha(params)
    r_ext = 1.0 / alpha

    # --- 4–5. Тепловой поток на м² ---
    r_total = r_wall + r_ins + r_ext
    q_per_m2 = delta_t / r_total

    # --- 6. Площадь ---
    area = _surface_area(params)

    # --- 7. Коэффициент запаса ---
    merged = merge_coefficients(coefficients)
    k = params.safety_factor or merged.get("safety_factor", 1.1)

    # --- 8. Итоговые теплопотери ---
    q_total = q_per_m2 * area * k

    return TankHeatLossResult(
        heat_loss_per_m2=round(q_per_m2, 3),
        total_heat_loss=round(q_total, 3),
        surface_area=round(None, 3),
    )


def x_calc_tank_heat_loss__mutmut_89(
    params: TankHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> TankHeatLossResult:
    """Расчёт тепловых потерь ёмкости (модель плоской стенки).

    Упрощение: считаем все стенки плоскими (последовательное сопротивление),
    а площадь поверхности берём по геометрии (цилиндр / параллелепипед / шар).
    Для резервуаров d > 0.5 м кривизна практически не влияет на результат.

    Алгоритм:
        1. r_wall = δ_р / λ_р (если заданы толщина и λ стенки)
        2. r_ins  = δ_из / λ_из  (изоляция — плоская стенка)
        3. r_ext  = 1 / α_внеш   (α = 11.6 + 7·v на улице, 9.0 в помещении)
        4. r_total = r_wall + r_ins + r_ext
        5. q = ΔT / r_total (Вт/м², БЕЗ safety_factor)
        6. S — площадь по форме (cylinder/rectangle/sphere)
        7. Q = q · S · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры ёмкости. Требует указать геометрию,
            подходящую под `shape`: cylinder (d+h), rectangular (l+w+h), sphere (d).
        coefficients: аналогично `calc_pipe_heat_loss`.

    Returns:
        TankHeatLossResult: `heat_loss_per_m2` (q без K), `total_heat_loss` (Q с K),
        `surface_area` (S).

    Raises:
        ValueError: невалидная форма, отсутствие обязательной геометрии,
            невалидные температуры/толщины.

    See Also:
        formules.md, docs/context/formulas-summary.md
    """
    validate_positive("Толщина изоляции", params.insulation_thickness)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    t_mean = (params.ambient_temperature + params.process_temperature) / 2.0
    delta_t = params.process_temperature - params.ambient_temperature

    # --- 1. Сопротивление стенки резервуара ---
    r_wall = 0.0
    if params.wall_thickness is not None and params.wall_lambda is not None:
        validate_positive("Толщина стенки резервуара", params.wall_thickness)
        validate_positive("Теплопроводность стенки резервуара", params.wall_lambda)
        r_wall = params.wall_thickness / params.wall_lambda

    # --- 2. Сопротивление изоляции (плоская стенка) ---
    lambda_ins = get_insulation_conductivity(
        material=params.insulation_material,
        temperature=t_mean,
    )
    r_ins = params.insulation_thickness / lambda_ins

    # --- 3. Внешнее сопротивление ---
    alpha = _calc_alpha(params)
    r_ext = 1.0 / alpha

    # --- 4–5. Тепловой поток на м² ---
    r_total = r_wall + r_ins + r_ext
    q_per_m2 = delta_t / r_total

    # --- 6. Площадь ---
    area = _surface_area(params)

    # --- 7. Коэффициент запаса ---
    merged = merge_coefficients(coefficients)
    k = params.safety_factor or merged.get("safety_factor", 1.1)

    # --- 8. Итоговые теплопотери ---
    q_total = q_per_m2 * area * k

    return TankHeatLossResult(
        heat_loss_per_m2=round(q_per_m2, 3),
        total_heat_loss=round(q_total, 3),
        surface_area=round(area, None),
    )


def x_calc_tank_heat_loss__mutmut_90(
    params: TankHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> TankHeatLossResult:
    """Расчёт тепловых потерь ёмкости (модель плоской стенки).

    Упрощение: считаем все стенки плоскими (последовательное сопротивление),
    а площадь поверхности берём по геометрии (цилиндр / параллелепипед / шар).
    Для резервуаров d > 0.5 м кривизна практически не влияет на результат.

    Алгоритм:
        1. r_wall = δ_р / λ_р (если заданы толщина и λ стенки)
        2. r_ins  = δ_из / λ_из  (изоляция — плоская стенка)
        3. r_ext  = 1 / α_внеш   (α = 11.6 + 7·v на улице, 9.0 в помещении)
        4. r_total = r_wall + r_ins + r_ext
        5. q = ΔT / r_total (Вт/м², БЕЗ safety_factor)
        6. S — площадь по форме (cylinder/rectangle/sphere)
        7. Q = q · S · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры ёмкости. Требует указать геометрию,
            подходящую под `shape`: cylinder (d+h), rectangular (l+w+h), sphere (d).
        coefficients: аналогично `calc_pipe_heat_loss`.

    Returns:
        TankHeatLossResult: `heat_loss_per_m2` (q без K), `total_heat_loss` (Q с K),
        `surface_area` (S).

    Raises:
        ValueError: невалидная форма, отсутствие обязательной геометрии,
            невалидные температуры/толщины.

    See Also:
        formules.md, docs/context/formulas-summary.md
    """
    validate_positive("Толщина изоляции", params.insulation_thickness)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    t_mean = (params.ambient_temperature + params.process_temperature) / 2.0
    delta_t = params.process_temperature - params.ambient_temperature

    # --- 1. Сопротивление стенки резервуара ---
    r_wall = 0.0
    if params.wall_thickness is not None and params.wall_lambda is not None:
        validate_positive("Толщина стенки резервуара", params.wall_thickness)
        validate_positive("Теплопроводность стенки резервуара", params.wall_lambda)
        r_wall = params.wall_thickness / params.wall_lambda

    # --- 2. Сопротивление изоляции (плоская стенка) ---
    lambda_ins = get_insulation_conductivity(
        material=params.insulation_material,
        temperature=t_mean,
    )
    r_ins = params.insulation_thickness / lambda_ins

    # --- 3. Внешнее сопротивление ---
    alpha = _calc_alpha(params)
    r_ext = 1.0 / alpha

    # --- 4–5. Тепловой поток на м² ---
    r_total = r_wall + r_ins + r_ext
    q_per_m2 = delta_t / r_total

    # --- 6. Площадь ---
    area = _surface_area(params)

    # --- 7. Коэффициент запаса ---
    merged = merge_coefficients(coefficients)
    k = params.safety_factor or merged.get("safety_factor", 1.1)

    # --- 8. Итоговые теплопотери ---
    q_total = q_per_m2 * area * k

    return TankHeatLossResult(
        heat_loss_per_m2=round(q_per_m2, 3),
        total_heat_loss=round(q_total, 3),
        surface_area=round(3),
    )


def x_calc_tank_heat_loss__mutmut_91(
    params: TankHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> TankHeatLossResult:
    """Расчёт тепловых потерь ёмкости (модель плоской стенки).

    Упрощение: считаем все стенки плоскими (последовательное сопротивление),
    а площадь поверхности берём по геометрии (цилиндр / параллелепипед / шар).
    Для резервуаров d > 0.5 м кривизна практически не влияет на результат.

    Алгоритм:
        1. r_wall = δ_р / λ_р (если заданы толщина и λ стенки)
        2. r_ins  = δ_из / λ_из  (изоляция — плоская стенка)
        3. r_ext  = 1 / α_внеш   (α = 11.6 + 7·v на улице, 9.0 в помещении)
        4. r_total = r_wall + r_ins + r_ext
        5. q = ΔT / r_total (Вт/м², БЕЗ safety_factor)
        6. S — площадь по форме (cylinder/rectangle/sphere)
        7. Q = q · S · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры ёмкости. Требует указать геометрию,
            подходящую под `shape`: cylinder (d+h), rectangular (l+w+h), sphere (d).
        coefficients: аналогично `calc_pipe_heat_loss`.

    Returns:
        TankHeatLossResult: `heat_loss_per_m2` (q без K), `total_heat_loss` (Q с K),
        `surface_area` (S).

    Raises:
        ValueError: невалидная форма, отсутствие обязательной геометрии,
            невалидные температуры/толщины.

    See Also:
        formules.md, docs/context/formulas-summary.md
    """
    validate_positive("Толщина изоляции", params.insulation_thickness)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    t_mean = (params.ambient_temperature + params.process_temperature) / 2.0
    delta_t = params.process_temperature - params.ambient_temperature

    # --- 1. Сопротивление стенки резервуара ---
    r_wall = 0.0
    if params.wall_thickness is not None and params.wall_lambda is not None:
        validate_positive("Толщина стенки резервуара", params.wall_thickness)
        validate_positive("Теплопроводность стенки резервуара", params.wall_lambda)
        r_wall = params.wall_thickness / params.wall_lambda

    # --- 2. Сопротивление изоляции (плоская стенка) ---
    lambda_ins = get_insulation_conductivity(
        material=params.insulation_material,
        temperature=t_mean,
    )
    r_ins = params.insulation_thickness / lambda_ins

    # --- 3. Внешнее сопротивление ---
    alpha = _calc_alpha(params)
    r_ext = 1.0 / alpha

    # --- 4–5. Тепловой поток на м² ---
    r_total = r_wall + r_ins + r_ext
    q_per_m2 = delta_t / r_total

    # --- 6. Площадь ---
    area = _surface_area(params)

    # --- 7. Коэффициент запаса ---
    merged = merge_coefficients(coefficients)
    k = params.safety_factor or merged.get("safety_factor", 1.1)

    # --- 8. Итоговые теплопотери ---
    q_total = q_per_m2 * area * k

    return TankHeatLossResult(
        heat_loss_per_m2=round(q_per_m2, 3),
        total_heat_loss=round(q_total, 3),
        surface_area=round(area, ),
    )


def x_calc_tank_heat_loss__mutmut_92(
    params: TankHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> TankHeatLossResult:
    """Расчёт тепловых потерь ёмкости (модель плоской стенки).

    Упрощение: считаем все стенки плоскими (последовательное сопротивление),
    а площадь поверхности берём по геометрии (цилиндр / параллелепипед / шар).
    Для резервуаров d > 0.5 м кривизна практически не влияет на результат.

    Алгоритм:
        1. r_wall = δ_р / λ_р (если заданы толщина и λ стенки)
        2. r_ins  = δ_из / λ_из  (изоляция — плоская стенка)
        3. r_ext  = 1 / α_внеш   (α = 11.6 + 7·v на улице, 9.0 в помещении)
        4. r_total = r_wall + r_ins + r_ext
        5. q = ΔT / r_total (Вт/м², БЕЗ safety_factor)
        6. S — площадь по форме (cylinder/rectangle/sphere)
        7. Q = q · S · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры ёмкости. Требует указать геометрию,
            подходящую под `shape`: cylinder (d+h), rectangular (l+w+h), sphere (d).
        coefficients: аналогично `calc_pipe_heat_loss`.

    Returns:
        TankHeatLossResult: `heat_loss_per_m2` (q без K), `total_heat_loss` (Q с K),
        `surface_area` (S).

    Raises:
        ValueError: невалидная форма, отсутствие обязательной геометрии,
            невалидные температуры/толщины.

    See Also:
        formules.md, docs/context/formulas-summary.md
    """
    validate_positive("Толщина изоляции", params.insulation_thickness)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    t_mean = (params.ambient_temperature + params.process_temperature) / 2.0
    delta_t = params.process_temperature - params.ambient_temperature

    # --- 1. Сопротивление стенки резервуара ---
    r_wall = 0.0
    if params.wall_thickness is not None and params.wall_lambda is not None:
        validate_positive("Толщина стенки резервуара", params.wall_thickness)
        validate_positive("Теплопроводность стенки резервуара", params.wall_lambda)
        r_wall = params.wall_thickness / params.wall_lambda

    # --- 2. Сопротивление изоляции (плоская стенка) ---
    lambda_ins = get_insulation_conductivity(
        material=params.insulation_material,
        temperature=t_mean,
    )
    r_ins = params.insulation_thickness / lambda_ins

    # --- 3. Внешнее сопротивление ---
    alpha = _calc_alpha(params)
    r_ext = 1.0 / alpha

    # --- 4–5. Тепловой поток на м² ---
    r_total = r_wall + r_ins + r_ext
    q_per_m2 = delta_t / r_total

    # --- 6. Площадь ---
    area = _surface_area(params)

    # --- 7. Коэффициент запаса ---
    merged = merge_coefficients(coefficients)
    k = params.safety_factor or merged.get("safety_factor", 1.1)

    # --- 8. Итоговые теплопотери ---
    q_total = q_per_m2 * area * k

    return TankHeatLossResult(
        heat_loss_per_m2=round(q_per_m2, 3),
        total_heat_loss=round(q_total, 3),
        surface_area=round(area, 4),
    )

x_calc_tank_heat_loss__mutmut_mutants : ClassVar[MutantDict] = { # type: ignore
'x_calc_tank_heat_loss__mutmut_1': x_calc_tank_heat_loss__mutmut_1, 
    'x_calc_tank_heat_loss__mutmut_2': x_calc_tank_heat_loss__mutmut_2, 
    'x_calc_tank_heat_loss__mutmut_3': x_calc_tank_heat_loss__mutmut_3, 
    'x_calc_tank_heat_loss__mutmut_4': x_calc_tank_heat_loss__mutmut_4, 
    'x_calc_tank_heat_loss__mutmut_5': x_calc_tank_heat_loss__mutmut_5, 
    'x_calc_tank_heat_loss__mutmut_6': x_calc_tank_heat_loss__mutmut_6, 
    'x_calc_tank_heat_loss__mutmut_7': x_calc_tank_heat_loss__mutmut_7, 
    'x_calc_tank_heat_loss__mutmut_8': x_calc_tank_heat_loss__mutmut_8, 
    'x_calc_tank_heat_loss__mutmut_9': x_calc_tank_heat_loss__mutmut_9, 
    'x_calc_tank_heat_loss__mutmut_10': x_calc_tank_heat_loss__mutmut_10, 
    'x_calc_tank_heat_loss__mutmut_11': x_calc_tank_heat_loss__mutmut_11, 
    'x_calc_tank_heat_loss__mutmut_12': x_calc_tank_heat_loss__mutmut_12, 
    'x_calc_tank_heat_loss__mutmut_13': x_calc_tank_heat_loss__mutmut_13, 
    'x_calc_tank_heat_loss__mutmut_14': x_calc_tank_heat_loss__mutmut_14, 
    'x_calc_tank_heat_loss__mutmut_15': x_calc_tank_heat_loss__mutmut_15, 
    'x_calc_tank_heat_loss__mutmut_16': x_calc_tank_heat_loss__mutmut_16, 
    'x_calc_tank_heat_loss__mutmut_17': x_calc_tank_heat_loss__mutmut_17, 
    'x_calc_tank_heat_loss__mutmut_18': x_calc_tank_heat_loss__mutmut_18, 
    'x_calc_tank_heat_loss__mutmut_19': x_calc_tank_heat_loss__mutmut_19, 
    'x_calc_tank_heat_loss__mutmut_20': x_calc_tank_heat_loss__mutmut_20, 
    'x_calc_tank_heat_loss__mutmut_21': x_calc_tank_heat_loss__mutmut_21, 
    'x_calc_tank_heat_loss__mutmut_22': x_calc_tank_heat_loss__mutmut_22, 
    'x_calc_tank_heat_loss__mutmut_23': x_calc_tank_heat_loss__mutmut_23, 
    'x_calc_tank_heat_loss__mutmut_24': x_calc_tank_heat_loss__mutmut_24, 
    'x_calc_tank_heat_loss__mutmut_25': x_calc_tank_heat_loss__mutmut_25, 
    'x_calc_tank_heat_loss__mutmut_26': x_calc_tank_heat_loss__mutmut_26, 
    'x_calc_tank_heat_loss__mutmut_27': x_calc_tank_heat_loss__mutmut_27, 
    'x_calc_tank_heat_loss__mutmut_28': x_calc_tank_heat_loss__mutmut_28, 
    'x_calc_tank_heat_loss__mutmut_29': x_calc_tank_heat_loss__mutmut_29, 
    'x_calc_tank_heat_loss__mutmut_30': x_calc_tank_heat_loss__mutmut_30, 
    'x_calc_tank_heat_loss__mutmut_31': x_calc_tank_heat_loss__mutmut_31, 
    'x_calc_tank_heat_loss__mutmut_32': x_calc_tank_heat_loss__mutmut_32, 
    'x_calc_tank_heat_loss__mutmut_33': x_calc_tank_heat_loss__mutmut_33, 
    'x_calc_tank_heat_loss__mutmut_34': x_calc_tank_heat_loss__mutmut_34, 
    'x_calc_tank_heat_loss__mutmut_35': x_calc_tank_heat_loss__mutmut_35, 
    'x_calc_tank_heat_loss__mutmut_36': x_calc_tank_heat_loss__mutmut_36, 
    'x_calc_tank_heat_loss__mutmut_37': x_calc_tank_heat_loss__mutmut_37, 
    'x_calc_tank_heat_loss__mutmut_38': x_calc_tank_heat_loss__mutmut_38, 
    'x_calc_tank_heat_loss__mutmut_39': x_calc_tank_heat_loss__mutmut_39, 
    'x_calc_tank_heat_loss__mutmut_40': x_calc_tank_heat_loss__mutmut_40, 
    'x_calc_tank_heat_loss__mutmut_41': x_calc_tank_heat_loss__mutmut_41, 
    'x_calc_tank_heat_loss__mutmut_42': x_calc_tank_heat_loss__mutmut_42, 
    'x_calc_tank_heat_loss__mutmut_43': x_calc_tank_heat_loss__mutmut_43, 
    'x_calc_tank_heat_loss__mutmut_44': x_calc_tank_heat_loss__mutmut_44, 
    'x_calc_tank_heat_loss__mutmut_45': x_calc_tank_heat_loss__mutmut_45, 
    'x_calc_tank_heat_loss__mutmut_46': x_calc_tank_heat_loss__mutmut_46, 
    'x_calc_tank_heat_loss__mutmut_47': x_calc_tank_heat_loss__mutmut_47, 
    'x_calc_tank_heat_loss__mutmut_48': x_calc_tank_heat_loss__mutmut_48, 
    'x_calc_tank_heat_loss__mutmut_49': x_calc_tank_heat_loss__mutmut_49, 
    'x_calc_tank_heat_loss__mutmut_50': x_calc_tank_heat_loss__mutmut_50, 
    'x_calc_tank_heat_loss__mutmut_51': x_calc_tank_heat_loss__mutmut_51, 
    'x_calc_tank_heat_loss__mutmut_52': x_calc_tank_heat_loss__mutmut_52, 
    'x_calc_tank_heat_loss__mutmut_53': x_calc_tank_heat_loss__mutmut_53, 
    'x_calc_tank_heat_loss__mutmut_54': x_calc_tank_heat_loss__mutmut_54, 
    'x_calc_tank_heat_loss__mutmut_55': x_calc_tank_heat_loss__mutmut_55, 
    'x_calc_tank_heat_loss__mutmut_56': x_calc_tank_heat_loss__mutmut_56, 
    'x_calc_tank_heat_loss__mutmut_57': x_calc_tank_heat_loss__mutmut_57, 
    'x_calc_tank_heat_loss__mutmut_58': x_calc_tank_heat_loss__mutmut_58, 
    'x_calc_tank_heat_loss__mutmut_59': x_calc_tank_heat_loss__mutmut_59, 
    'x_calc_tank_heat_loss__mutmut_60': x_calc_tank_heat_loss__mutmut_60, 
    'x_calc_tank_heat_loss__mutmut_61': x_calc_tank_heat_loss__mutmut_61, 
    'x_calc_tank_heat_loss__mutmut_62': x_calc_tank_heat_loss__mutmut_62, 
    'x_calc_tank_heat_loss__mutmut_63': x_calc_tank_heat_loss__mutmut_63, 
    'x_calc_tank_heat_loss__mutmut_64': x_calc_tank_heat_loss__mutmut_64, 
    'x_calc_tank_heat_loss__mutmut_65': x_calc_tank_heat_loss__mutmut_65, 
    'x_calc_tank_heat_loss__mutmut_66': x_calc_tank_heat_loss__mutmut_66, 
    'x_calc_tank_heat_loss__mutmut_67': x_calc_tank_heat_loss__mutmut_67, 
    'x_calc_tank_heat_loss__mutmut_68': x_calc_tank_heat_loss__mutmut_68, 
    'x_calc_tank_heat_loss__mutmut_69': x_calc_tank_heat_loss__mutmut_69, 
    'x_calc_tank_heat_loss__mutmut_70': x_calc_tank_heat_loss__mutmut_70, 
    'x_calc_tank_heat_loss__mutmut_71': x_calc_tank_heat_loss__mutmut_71, 
    'x_calc_tank_heat_loss__mutmut_72': x_calc_tank_heat_loss__mutmut_72, 
    'x_calc_tank_heat_loss__mutmut_73': x_calc_tank_heat_loss__mutmut_73, 
    'x_calc_tank_heat_loss__mutmut_74': x_calc_tank_heat_loss__mutmut_74, 
    'x_calc_tank_heat_loss__mutmut_75': x_calc_tank_heat_loss__mutmut_75, 
    'x_calc_tank_heat_loss__mutmut_76': x_calc_tank_heat_loss__mutmut_76, 
    'x_calc_tank_heat_loss__mutmut_77': x_calc_tank_heat_loss__mutmut_77, 
    'x_calc_tank_heat_loss__mutmut_78': x_calc_tank_heat_loss__mutmut_78, 
    'x_calc_tank_heat_loss__mutmut_79': x_calc_tank_heat_loss__mutmut_79, 
    'x_calc_tank_heat_loss__mutmut_80': x_calc_tank_heat_loss__mutmut_80, 
    'x_calc_tank_heat_loss__mutmut_81': x_calc_tank_heat_loss__mutmut_81, 
    'x_calc_tank_heat_loss__mutmut_82': x_calc_tank_heat_loss__mutmut_82, 
    'x_calc_tank_heat_loss__mutmut_83': x_calc_tank_heat_loss__mutmut_83, 
    'x_calc_tank_heat_loss__mutmut_84': x_calc_tank_heat_loss__mutmut_84, 
    'x_calc_tank_heat_loss__mutmut_85': x_calc_tank_heat_loss__mutmut_85, 
    'x_calc_tank_heat_loss__mutmut_86': x_calc_tank_heat_loss__mutmut_86, 
    'x_calc_tank_heat_loss__mutmut_87': x_calc_tank_heat_loss__mutmut_87, 
    'x_calc_tank_heat_loss__mutmut_88': x_calc_tank_heat_loss__mutmut_88, 
    'x_calc_tank_heat_loss__mutmut_89': x_calc_tank_heat_loss__mutmut_89, 
    'x_calc_tank_heat_loss__mutmut_90': x_calc_tank_heat_loss__mutmut_90, 
    'x_calc_tank_heat_loss__mutmut_91': x_calc_tank_heat_loss__mutmut_91, 
    'x_calc_tank_heat_loss__mutmut_92': x_calc_tank_heat_loss__mutmut_92
}
x_calc_tank_heat_loss__mutmut_orig.__name__ = 'x_calc_tank_heat_loss'
