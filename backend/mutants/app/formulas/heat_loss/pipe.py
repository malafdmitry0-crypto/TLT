"""Расчёт теплопотерь трубопровода.

Формула: многослойная цилиндрическая стенка (закон Фурье).

q_linear = ΔT / R_total  [Вт/м]
q_total  = q_linear · L_eff · K  [Вт]

где R_total = R_wall + ΣR_ins_i + R_external (или R_ground для подземных)

Источник: спецификация параметров теплотехнических расчётов, таблица 1–2.
"""

import math
from typing import Any

from app.formulas.heat_loss.common import (
    merge_coefficients,
    validate_positive,
    validate_temperature_range,
)
from app.reference_data.loader import get_insulation_conductivity
from app.schemas.calculation import InsulationLayer, PipeHeatLossParams, PipeHeatLossResult

# ---------------------------------------------------------------------------
# Температурозависимая теплопроводность материалов трубы
# lambda(T) = A + B * (T + 40),  T в °C
# ---------------------------------------------------------------------------

_PIPE_MATERIAL_LAMBDA: dict[str, tuple[float, float]] = {
    "carbon_steel":   (60.0,  -0.10),   # Углеродистая сталь        ±2%
    "stainless_304":  (14.0,   0.01),   # Нерж. сталь AISI 304      ±1%
    "copper":         (410.0, -0.16),   # Медь (электролитическая)  ±1.5%
    "aluminum":       (242.0, -0.07),   # Алюминий (чистый)         ±1%
    "plastic":        (0.20,   0.0005), # Пластик (усредн.)         ±10%
}

_LAMBDA_PIPE_DEFAULT = 50.0   # Вт/(м·К) — углеродистая сталь при 20°C
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


def pipe_material_lambda(material: str | None, temperature: float) -> float:
    args = [material, temperature]# type: ignore
    kwargs = {}# type: ignore
    return _mutmut_trampoline(x_pipe_material_lambda__mutmut_orig, x_pipe_material_lambda__mutmut_mutants, args, kwargs, None)


def x_pipe_material_lambda__mutmut_orig(material: str | None, temperature: float) -> float:
    """Теплопроводность материала трубы λ(T), Вт/(м·К).

    Args:
        material: ключ из _PIPE_MATERIAL_LAMBDA или None → значение по умолчанию
        temperature: средняя температура стенки, °C
    """
    if material is None:
        return _LAMBDA_PIPE_DEFAULT
    coeffs = _PIPE_MATERIAL_LAMBDA.get(material)
    if coeffs is None:
        raise ValueError(
            f"Неизвестный материал трубы: '{material}'. "
            f"Допустимые: {list(_PIPE_MATERIAL_LAMBDA)}"
        )
    A, B = coeffs
    return max(A + B * (temperature + 40), 0.001)


def x_pipe_material_lambda__mutmut_1(material: str | None, temperature: float) -> float:
    """Теплопроводность материала трубы λ(T), Вт/(м·К).

    Args:
        material: ключ из _PIPE_MATERIAL_LAMBDA или None → значение по умолчанию
        temperature: средняя температура стенки, °C
    """
    if material is not None:
        return _LAMBDA_PIPE_DEFAULT
    coeffs = _PIPE_MATERIAL_LAMBDA.get(material)
    if coeffs is None:
        raise ValueError(
            f"Неизвестный материал трубы: '{material}'. "
            f"Допустимые: {list(_PIPE_MATERIAL_LAMBDA)}"
        )
    A, B = coeffs
    return max(A + B * (temperature + 40), 0.001)


def x_pipe_material_lambda__mutmut_2(material: str | None, temperature: float) -> float:
    """Теплопроводность материала трубы λ(T), Вт/(м·К).

    Args:
        material: ключ из _PIPE_MATERIAL_LAMBDA или None → значение по умолчанию
        temperature: средняя температура стенки, °C
    """
    if material is None:
        return _LAMBDA_PIPE_DEFAULT
    coeffs = None
    if coeffs is None:
        raise ValueError(
            f"Неизвестный материал трубы: '{material}'. "
            f"Допустимые: {list(_PIPE_MATERIAL_LAMBDA)}"
        )
    A, B = coeffs
    return max(A + B * (temperature + 40), 0.001)


def x_pipe_material_lambda__mutmut_3(material: str | None, temperature: float) -> float:
    """Теплопроводность материала трубы λ(T), Вт/(м·К).

    Args:
        material: ключ из _PIPE_MATERIAL_LAMBDA или None → значение по умолчанию
        temperature: средняя температура стенки, °C
    """
    if material is None:
        return _LAMBDA_PIPE_DEFAULT
    coeffs = _PIPE_MATERIAL_LAMBDA.get(None)
    if coeffs is None:
        raise ValueError(
            f"Неизвестный материал трубы: '{material}'. "
            f"Допустимые: {list(_PIPE_MATERIAL_LAMBDA)}"
        )
    A, B = coeffs
    return max(A + B * (temperature + 40), 0.001)


def x_pipe_material_lambda__mutmut_4(material: str | None, temperature: float) -> float:
    """Теплопроводность материала трубы λ(T), Вт/(м·К).

    Args:
        material: ключ из _PIPE_MATERIAL_LAMBDA или None → значение по умолчанию
        temperature: средняя температура стенки, °C
    """
    if material is None:
        return _LAMBDA_PIPE_DEFAULT
    coeffs = _PIPE_MATERIAL_LAMBDA.get(material)
    if coeffs is not None:
        raise ValueError(
            f"Неизвестный материал трубы: '{material}'. "
            f"Допустимые: {list(_PIPE_MATERIAL_LAMBDA)}"
        )
    A, B = coeffs
    return max(A + B * (temperature + 40), 0.001)


def x_pipe_material_lambda__mutmut_5(material: str | None, temperature: float) -> float:
    """Теплопроводность материала трубы λ(T), Вт/(м·К).

    Args:
        material: ключ из _PIPE_MATERIAL_LAMBDA или None → значение по умолчанию
        temperature: средняя температура стенки, °C
    """
    if material is None:
        return _LAMBDA_PIPE_DEFAULT
    coeffs = _PIPE_MATERIAL_LAMBDA.get(material)
    if coeffs is None:
        raise ValueError(
            None
        )
    A, B = coeffs
    return max(A + B * (temperature + 40), 0.001)


def x_pipe_material_lambda__mutmut_6(material: str | None, temperature: float) -> float:
    """Теплопроводность материала трубы λ(T), Вт/(м·К).

    Args:
        material: ключ из _PIPE_MATERIAL_LAMBDA или None → значение по умолчанию
        temperature: средняя температура стенки, °C
    """
    if material is None:
        return _LAMBDA_PIPE_DEFAULT
    coeffs = _PIPE_MATERIAL_LAMBDA.get(material)
    if coeffs is None:
        raise ValueError(
            f"Неизвестный материал трубы: '{material}'. "
            f"Допустимые: {list(None)}"
        )
    A, B = coeffs
    return max(A + B * (temperature + 40), 0.001)


def x_pipe_material_lambda__mutmut_7(material: str | None, temperature: float) -> float:
    """Теплопроводность материала трубы λ(T), Вт/(м·К).

    Args:
        material: ключ из _PIPE_MATERIAL_LAMBDA или None → значение по умолчанию
        temperature: средняя температура стенки, °C
    """
    if material is None:
        return _LAMBDA_PIPE_DEFAULT
    coeffs = _PIPE_MATERIAL_LAMBDA.get(material)
    if coeffs is None:
        raise ValueError(
            f"Неизвестный материал трубы: '{material}'. "
            f"Допустимые: {list(_PIPE_MATERIAL_LAMBDA)}"
        )
    A, B = None
    return max(A + B * (temperature + 40), 0.001)


def x_pipe_material_lambda__mutmut_8(material: str | None, temperature: float) -> float:
    """Теплопроводность материала трубы λ(T), Вт/(м·К).

    Args:
        material: ключ из _PIPE_MATERIAL_LAMBDA или None → значение по умолчанию
        temperature: средняя температура стенки, °C
    """
    if material is None:
        return _LAMBDA_PIPE_DEFAULT
    coeffs = _PIPE_MATERIAL_LAMBDA.get(material)
    if coeffs is None:
        raise ValueError(
            f"Неизвестный материал трубы: '{material}'. "
            f"Допустимые: {list(_PIPE_MATERIAL_LAMBDA)}"
        )
    A, B = coeffs
    return max(None, 0.001)


def x_pipe_material_lambda__mutmut_9(material: str | None, temperature: float) -> float:
    """Теплопроводность материала трубы λ(T), Вт/(м·К).

    Args:
        material: ключ из _PIPE_MATERIAL_LAMBDA или None → значение по умолчанию
        temperature: средняя температура стенки, °C
    """
    if material is None:
        return _LAMBDA_PIPE_DEFAULT
    coeffs = _PIPE_MATERIAL_LAMBDA.get(material)
    if coeffs is None:
        raise ValueError(
            f"Неизвестный материал трубы: '{material}'. "
            f"Допустимые: {list(_PIPE_MATERIAL_LAMBDA)}"
        )
    A, B = coeffs
    return max(A + B * (temperature + 40), None)


def x_pipe_material_lambda__mutmut_10(material: str | None, temperature: float) -> float:
    """Теплопроводность материала трубы λ(T), Вт/(м·К).

    Args:
        material: ключ из _PIPE_MATERIAL_LAMBDA или None → значение по умолчанию
        temperature: средняя температура стенки, °C
    """
    if material is None:
        return _LAMBDA_PIPE_DEFAULT
    coeffs = _PIPE_MATERIAL_LAMBDA.get(material)
    if coeffs is None:
        raise ValueError(
            f"Неизвестный материал трубы: '{material}'. "
            f"Допустимые: {list(_PIPE_MATERIAL_LAMBDA)}"
        )
    A, B = coeffs
    return max(0.001)


def x_pipe_material_lambda__mutmut_11(material: str | None, temperature: float) -> float:
    """Теплопроводность материала трубы λ(T), Вт/(м·К).

    Args:
        material: ключ из _PIPE_MATERIAL_LAMBDA или None → значение по умолчанию
        temperature: средняя температура стенки, °C
    """
    if material is None:
        return _LAMBDA_PIPE_DEFAULT
    coeffs = _PIPE_MATERIAL_LAMBDA.get(material)
    if coeffs is None:
        raise ValueError(
            f"Неизвестный материал трубы: '{material}'. "
            f"Допустимые: {list(_PIPE_MATERIAL_LAMBDA)}"
        )
    A, B = coeffs
    return max(A + B * (temperature + 40), )


def x_pipe_material_lambda__mutmut_12(material: str | None, temperature: float) -> float:
    """Теплопроводность материала трубы λ(T), Вт/(м·К).

    Args:
        material: ключ из _PIPE_MATERIAL_LAMBDA или None → значение по умолчанию
        temperature: средняя температура стенки, °C
    """
    if material is None:
        return _LAMBDA_PIPE_DEFAULT
    coeffs = _PIPE_MATERIAL_LAMBDA.get(material)
    if coeffs is None:
        raise ValueError(
            f"Неизвестный материал трубы: '{material}'. "
            f"Допустимые: {list(_PIPE_MATERIAL_LAMBDA)}"
        )
    A, B = coeffs
    return max(A - B * (temperature + 40), 0.001)


def x_pipe_material_lambda__mutmut_13(material: str | None, temperature: float) -> float:
    """Теплопроводность материала трубы λ(T), Вт/(м·К).

    Args:
        material: ключ из _PIPE_MATERIAL_LAMBDA или None → значение по умолчанию
        temperature: средняя температура стенки, °C
    """
    if material is None:
        return _LAMBDA_PIPE_DEFAULT
    coeffs = _PIPE_MATERIAL_LAMBDA.get(material)
    if coeffs is None:
        raise ValueError(
            f"Неизвестный материал трубы: '{material}'. "
            f"Допустимые: {list(_PIPE_MATERIAL_LAMBDA)}"
        )
    A, B = coeffs
    return max(A + B / (temperature + 40), 0.001)


def x_pipe_material_lambda__mutmut_14(material: str | None, temperature: float) -> float:
    """Теплопроводность материала трубы λ(T), Вт/(м·К).

    Args:
        material: ключ из _PIPE_MATERIAL_LAMBDA или None → значение по умолчанию
        temperature: средняя температура стенки, °C
    """
    if material is None:
        return _LAMBDA_PIPE_DEFAULT
    coeffs = _PIPE_MATERIAL_LAMBDA.get(material)
    if coeffs is None:
        raise ValueError(
            f"Неизвестный материал трубы: '{material}'. "
            f"Допустимые: {list(_PIPE_MATERIAL_LAMBDA)}"
        )
    A, B = coeffs
    return max(A + B * (temperature - 40), 0.001)


def x_pipe_material_lambda__mutmut_15(material: str | None, temperature: float) -> float:
    """Теплопроводность материала трубы λ(T), Вт/(м·К).

    Args:
        material: ключ из _PIPE_MATERIAL_LAMBDA или None → значение по умолчанию
        temperature: средняя температура стенки, °C
    """
    if material is None:
        return _LAMBDA_PIPE_DEFAULT
    coeffs = _PIPE_MATERIAL_LAMBDA.get(material)
    if coeffs is None:
        raise ValueError(
            f"Неизвестный материал трубы: '{material}'. "
            f"Допустимые: {list(_PIPE_MATERIAL_LAMBDA)}"
        )
    A, B = coeffs
    return max(A + B * (temperature + 41), 0.001)


def x_pipe_material_lambda__mutmut_16(material: str | None, temperature: float) -> float:
    """Теплопроводность материала трубы λ(T), Вт/(м·К).

    Args:
        material: ключ из _PIPE_MATERIAL_LAMBDA или None → значение по умолчанию
        temperature: средняя температура стенки, °C
    """
    if material is None:
        return _LAMBDA_PIPE_DEFAULT
    coeffs = _PIPE_MATERIAL_LAMBDA.get(material)
    if coeffs is None:
        raise ValueError(
            f"Неизвестный материал трубы: '{material}'. "
            f"Допустимые: {list(_PIPE_MATERIAL_LAMBDA)}"
        )
    A, B = coeffs
    return max(A + B * (temperature + 40), 1.001)

x_pipe_material_lambda__mutmut_mutants : ClassVar[MutantDict] = { # type: ignore
'x_pipe_material_lambda__mutmut_1': x_pipe_material_lambda__mutmut_1, 
    'x_pipe_material_lambda__mutmut_2': x_pipe_material_lambda__mutmut_2, 
    'x_pipe_material_lambda__mutmut_3': x_pipe_material_lambda__mutmut_3, 
    'x_pipe_material_lambda__mutmut_4': x_pipe_material_lambda__mutmut_4, 
    'x_pipe_material_lambda__mutmut_5': x_pipe_material_lambda__mutmut_5, 
    'x_pipe_material_lambda__mutmut_6': x_pipe_material_lambda__mutmut_6, 
    'x_pipe_material_lambda__mutmut_7': x_pipe_material_lambda__mutmut_7, 
    'x_pipe_material_lambda__mutmut_8': x_pipe_material_lambda__mutmut_8, 
    'x_pipe_material_lambda__mutmut_9': x_pipe_material_lambda__mutmut_9, 
    'x_pipe_material_lambda__mutmut_10': x_pipe_material_lambda__mutmut_10, 
    'x_pipe_material_lambda__mutmut_11': x_pipe_material_lambda__mutmut_11, 
    'x_pipe_material_lambda__mutmut_12': x_pipe_material_lambda__mutmut_12, 
    'x_pipe_material_lambda__mutmut_13': x_pipe_material_lambda__mutmut_13, 
    'x_pipe_material_lambda__mutmut_14': x_pipe_material_lambda__mutmut_14, 
    'x_pipe_material_lambda__mutmut_15': x_pipe_material_lambda__mutmut_15, 
    'x_pipe_material_lambda__mutmut_16': x_pipe_material_lambda__mutmut_16
}
x_pipe_material_lambda__mutmut_orig.__name__ = 'x_pipe_material_lambda'


# ---------------------------------------------------------------------------
# Коэффициент наружной теплоотдачи из скорости ветра
# ---------------------------------------------------------------------------

def calc_alpha_vnesh(wind_speed: float | None, location: str) -> float:
    args = [wind_speed, location]# type: ignore
    kwargs = {}# type: ignore
    return _mutmut_trampoline(x_calc_alpha_vnesh__mutmut_orig, x_calc_alpha_vnesh__mutmut_mutants, args, kwargs, None)


# ---------------------------------------------------------------------------
# Коэффициент наружной теплоотдачи из скорости ветра
# ---------------------------------------------------------------------------

def x_calc_alpha_vnesh__mutmut_orig(wind_speed: float | None, location: str) -> float:
    """Коэффициент наружной теплоотдачи α, Вт/(м²·К).

    Для помещения: α = 9.0 (свободная конвекция)
    Для улицы: α = 11,6 + 7·v  (источник: ТНП, формула для трубопроводов)
    Диапазон: 11.6–52 Вт/(м²·К)
    """
    if location == "indoor":
        return 9.0
    v = wind_speed or 0.0
    alpha = 11.6 + 7.0 * v
    return min(max(alpha, 11.6), 52.0)


# ---------------------------------------------------------------------------
# Коэффициент наружной теплоотдачи из скорости ветра
# ---------------------------------------------------------------------------

def x_calc_alpha_vnesh__mutmut_1(wind_speed: float | None, location: str) -> float:
    """Коэффициент наружной теплоотдачи α, Вт/(м²·К).

    Для помещения: α = 9.0 (свободная конвекция)
    Для улицы: α = 11,6 + 7·v  (источник: ТНП, формула для трубопроводов)
    Диапазон: 11.6–52 Вт/(м²·К)
    """
    if location != "indoor":
        return 9.0
    v = wind_speed or 0.0
    alpha = 11.6 + 7.0 * v
    return min(max(alpha, 11.6), 52.0)


# ---------------------------------------------------------------------------
# Коэффициент наружной теплоотдачи из скорости ветра
# ---------------------------------------------------------------------------

def x_calc_alpha_vnesh__mutmut_2(wind_speed: float | None, location: str) -> float:
    """Коэффициент наружной теплоотдачи α, Вт/(м²·К).

    Для помещения: α = 9.0 (свободная конвекция)
    Для улицы: α = 11,6 + 7·v  (источник: ТНП, формула для трубопроводов)
    Диапазон: 11.6–52 Вт/(м²·К)
    """
    if location == "XXindoorXX":
        return 9.0
    v = wind_speed or 0.0
    alpha = 11.6 + 7.0 * v
    return min(max(alpha, 11.6), 52.0)


# ---------------------------------------------------------------------------
# Коэффициент наружной теплоотдачи из скорости ветра
# ---------------------------------------------------------------------------

def x_calc_alpha_vnesh__mutmut_3(wind_speed: float | None, location: str) -> float:
    """Коэффициент наружной теплоотдачи α, Вт/(м²·К).

    Для помещения: α = 9.0 (свободная конвекция)
    Для улицы: α = 11,6 + 7·v  (источник: ТНП, формула для трубопроводов)
    Диапазон: 11.6–52 Вт/(м²·К)
    """
    if location == "INDOOR":
        return 9.0
    v = wind_speed or 0.0
    alpha = 11.6 + 7.0 * v
    return min(max(alpha, 11.6), 52.0)


# ---------------------------------------------------------------------------
# Коэффициент наружной теплоотдачи из скорости ветра
# ---------------------------------------------------------------------------

def x_calc_alpha_vnesh__mutmut_4(wind_speed: float | None, location: str) -> float:
    """Коэффициент наружной теплоотдачи α, Вт/(м²·К).

    Для помещения: α = 9.0 (свободная конвекция)
    Для улицы: α = 11,6 + 7·v  (источник: ТНП, формула для трубопроводов)
    Диапазон: 11.6–52 Вт/(м²·К)
    """
    if location == "indoor":
        return 10.0
    v = wind_speed or 0.0
    alpha = 11.6 + 7.0 * v
    return min(max(alpha, 11.6), 52.0)


# ---------------------------------------------------------------------------
# Коэффициент наружной теплоотдачи из скорости ветра
# ---------------------------------------------------------------------------

def x_calc_alpha_vnesh__mutmut_5(wind_speed: float | None, location: str) -> float:
    """Коэффициент наружной теплоотдачи α, Вт/(м²·К).

    Для помещения: α = 9.0 (свободная конвекция)
    Для улицы: α = 11,6 + 7·v  (источник: ТНП, формула для трубопроводов)
    Диапазон: 11.6–52 Вт/(м²·К)
    """
    if location == "indoor":
        return 9.0
    v = None
    alpha = 11.6 + 7.0 * v
    return min(max(alpha, 11.6), 52.0)


# ---------------------------------------------------------------------------
# Коэффициент наружной теплоотдачи из скорости ветра
# ---------------------------------------------------------------------------

def x_calc_alpha_vnesh__mutmut_6(wind_speed: float | None, location: str) -> float:
    """Коэффициент наружной теплоотдачи α, Вт/(м²·К).

    Для помещения: α = 9.0 (свободная конвекция)
    Для улицы: α = 11,6 + 7·v  (источник: ТНП, формула для трубопроводов)
    Диапазон: 11.6–52 Вт/(м²·К)
    """
    if location == "indoor":
        return 9.0
    v = wind_speed and 0.0
    alpha = 11.6 + 7.0 * v
    return min(max(alpha, 11.6), 52.0)


# ---------------------------------------------------------------------------
# Коэффициент наружной теплоотдачи из скорости ветра
# ---------------------------------------------------------------------------

def x_calc_alpha_vnesh__mutmut_7(wind_speed: float | None, location: str) -> float:
    """Коэффициент наружной теплоотдачи α, Вт/(м²·К).

    Для помещения: α = 9.0 (свободная конвекция)
    Для улицы: α = 11,6 + 7·v  (источник: ТНП, формула для трубопроводов)
    Диапазон: 11.6–52 Вт/(м²·К)
    """
    if location == "indoor":
        return 9.0
    v = wind_speed or 1.0
    alpha = 11.6 + 7.0 * v
    return min(max(alpha, 11.6), 52.0)


# ---------------------------------------------------------------------------
# Коэффициент наружной теплоотдачи из скорости ветра
# ---------------------------------------------------------------------------

def x_calc_alpha_vnesh__mutmut_8(wind_speed: float | None, location: str) -> float:
    """Коэффициент наружной теплоотдачи α, Вт/(м²·К).

    Для помещения: α = 9.0 (свободная конвекция)
    Для улицы: α = 11,6 + 7·v  (источник: ТНП, формула для трубопроводов)
    Диапазон: 11.6–52 Вт/(м²·К)
    """
    if location == "indoor":
        return 9.0
    v = wind_speed or 0.0
    alpha = None
    return min(max(alpha, 11.6), 52.0)


# ---------------------------------------------------------------------------
# Коэффициент наружной теплоотдачи из скорости ветра
# ---------------------------------------------------------------------------

def x_calc_alpha_vnesh__mutmut_9(wind_speed: float | None, location: str) -> float:
    """Коэффициент наружной теплоотдачи α, Вт/(м²·К).

    Для помещения: α = 9.0 (свободная конвекция)
    Для улицы: α = 11,6 + 7·v  (источник: ТНП, формула для трубопроводов)
    Диапазон: 11.6–52 Вт/(м²·К)
    """
    if location == "indoor":
        return 9.0
    v = wind_speed or 0.0
    alpha = 11.6 - 7.0 * v
    return min(max(alpha, 11.6), 52.0)


# ---------------------------------------------------------------------------
# Коэффициент наружной теплоотдачи из скорости ветра
# ---------------------------------------------------------------------------

def x_calc_alpha_vnesh__mutmut_10(wind_speed: float | None, location: str) -> float:
    """Коэффициент наружной теплоотдачи α, Вт/(м²·К).

    Для помещения: α = 9.0 (свободная конвекция)
    Для улицы: α = 11,6 + 7·v  (источник: ТНП, формула для трубопроводов)
    Диапазон: 11.6–52 Вт/(м²·К)
    """
    if location == "indoor":
        return 9.0
    v = wind_speed or 0.0
    alpha = 12.6 + 7.0 * v
    return min(max(alpha, 11.6), 52.0)


# ---------------------------------------------------------------------------
# Коэффициент наружной теплоотдачи из скорости ветра
# ---------------------------------------------------------------------------

def x_calc_alpha_vnesh__mutmut_11(wind_speed: float | None, location: str) -> float:
    """Коэффициент наружной теплоотдачи α, Вт/(м²·К).

    Для помещения: α = 9.0 (свободная конвекция)
    Для улицы: α = 11,6 + 7·v  (источник: ТНП, формула для трубопроводов)
    Диапазон: 11.6–52 Вт/(м²·К)
    """
    if location == "indoor":
        return 9.0
    v = wind_speed or 0.0
    alpha = 11.6 + 7.0 / v
    return min(max(alpha, 11.6), 52.0)


# ---------------------------------------------------------------------------
# Коэффициент наружной теплоотдачи из скорости ветра
# ---------------------------------------------------------------------------

def x_calc_alpha_vnesh__mutmut_12(wind_speed: float | None, location: str) -> float:
    """Коэффициент наружной теплоотдачи α, Вт/(м²·К).

    Для помещения: α = 9.0 (свободная конвекция)
    Для улицы: α = 11,6 + 7·v  (источник: ТНП, формула для трубопроводов)
    Диапазон: 11.6–52 Вт/(м²·К)
    """
    if location == "indoor":
        return 9.0
    v = wind_speed or 0.0
    alpha = 11.6 + 8.0 * v
    return min(max(alpha, 11.6), 52.0)


# ---------------------------------------------------------------------------
# Коэффициент наружной теплоотдачи из скорости ветра
# ---------------------------------------------------------------------------

def x_calc_alpha_vnesh__mutmut_13(wind_speed: float | None, location: str) -> float:
    """Коэффициент наружной теплоотдачи α, Вт/(м²·К).

    Для помещения: α = 9.0 (свободная конвекция)
    Для улицы: α = 11,6 + 7·v  (источник: ТНП, формула для трубопроводов)
    Диапазон: 11.6–52 Вт/(м²·К)
    """
    if location == "indoor":
        return 9.0
    v = wind_speed or 0.0
    alpha = 11.6 + 7.0 * v
    return min(None, 52.0)


# ---------------------------------------------------------------------------
# Коэффициент наружной теплоотдачи из скорости ветра
# ---------------------------------------------------------------------------

def x_calc_alpha_vnesh__mutmut_14(wind_speed: float | None, location: str) -> float:
    """Коэффициент наружной теплоотдачи α, Вт/(м²·К).

    Для помещения: α = 9.0 (свободная конвекция)
    Для улицы: α = 11,6 + 7·v  (источник: ТНП, формула для трубопроводов)
    Диапазон: 11.6–52 Вт/(м²·К)
    """
    if location == "indoor":
        return 9.0
    v = wind_speed or 0.0
    alpha = 11.6 + 7.0 * v
    return min(max(alpha, 11.6), None)


# ---------------------------------------------------------------------------
# Коэффициент наружной теплоотдачи из скорости ветра
# ---------------------------------------------------------------------------

def x_calc_alpha_vnesh__mutmut_15(wind_speed: float | None, location: str) -> float:
    """Коэффициент наружной теплоотдачи α, Вт/(м²·К).

    Для помещения: α = 9.0 (свободная конвекция)
    Для улицы: α = 11,6 + 7·v  (источник: ТНП, формула для трубопроводов)
    Диапазон: 11.6–52 Вт/(м²·К)
    """
    if location == "indoor":
        return 9.0
    v = wind_speed or 0.0
    alpha = 11.6 + 7.0 * v
    return min(52.0)


# ---------------------------------------------------------------------------
# Коэффициент наружной теплоотдачи из скорости ветра
# ---------------------------------------------------------------------------

def x_calc_alpha_vnesh__mutmut_16(wind_speed: float | None, location: str) -> float:
    """Коэффициент наружной теплоотдачи α, Вт/(м²·К).

    Для помещения: α = 9.0 (свободная конвекция)
    Для улицы: α = 11,6 + 7·v  (источник: ТНП, формула для трубопроводов)
    Диапазон: 11.6–52 Вт/(м²·К)
    """
    if location == "indoor":
        return 9.0
    v = wind_speed or 0.0
    alpha = 11.6 + 7.0 * v
    return min(max(alpha, 11.6), )


# ---------------------------------------------------------------------------
# Коэффициент наружной теплоотдачи из скорости ветра
# ---------------------------------------------------------------------------

def x_calc_alpha_vnesh__mutmut_17(wind_speed: float | None, location: str) -> float:
    """Коэффициент наружной теплоотдачи α, Вт/(м²·К).

    Для помещения: α = 9.0 (свободная конвекция)
    Для улицы: α = 11,6 + 7·v  (источник: ТНП, формула для трубопроводов)
    Диапазон: 11.6–52 Вт/(м²·К)
    """
    if location == "indoor":
        return 9.0
    v = wind_speed or 0.0
    alpha = 11.6 + 7.0 * v
    return min(max(None, 11.6), 52.0)


# ---------------------------------------------------------------------------
# Коэффициент наружной теплоотдачи из скорости ветра
# ---------------------------------------------------------------------------

def x_calc_alpha_vnesh__mutmut_18(wind_speed: float | None, location: str) -> float:
    """Коэффициент наружной теплоотдачи α, Вт/(м²·К).

    Для помещения: α = 9.0 (свободная конвекция)
    Для улицы: α = 11,6 + 7·v  (источник: ТНП, формула для трубопроводов)
    Диапазон: 11.6–52 Вт/(м²·К)
    """
    if location == "indoor":
        return 9.0
    v = wind_speed or 0.0
    alpha = 11.6 + 7.0 * v
    return min(max(alpha, None), 52.0)


# ---------------------------------------------------------------------------
# Коэффициент наружной теплоотдачи из скорости ветра
# ---------------------------------------------------------------------------

def x_calc_alpha_vnesh__mutmut_19(wind_speed: float | None, location: str) -> float:
    """Коэффициент наружной теплоотдачи α, Вт/(м²·К).

    Для помещения: α = 9.0 (свободная конвекция)
    Для улицы: α = 11,6 + 7·v  (источник: ТНП, формула для трубопроводов)
    Диапазон: 11.6–52 Вт/(м²·К)
    """
    if location == "indoor":
        return 9.0
    v = wind_speed or 0.0
    alpha = 11.6 + 7.0 * v
    return min(max(11.6), 52.0)


# ---------------------------------------------------------------------------
# Коэффициент наружной теплоотдачи из скорости ветра
# ---------------------------------------------------------------------------

def x_calc_alpha_vnesh__mutmut_20(wind_speed: float | None, location: str) -> float:
    """Коэффициент наружной теплоотдачи α, Вт/(м²·К).

    Для помещения: α = 9.0 (свободная конвекция)
    Для улицы: α = 11,6 + 7·v  (источник: ТНП, формула для трубопроводов)
    Диапазон: 11.6–52 Вт/(м²·К)
    """
    if location == "indoor":
        return 9.0
    v = wind_speed or 0.0
    alpha = 11.6 + 7.0 * v
    return min(max(alpha, ), 52.0)


# ---------------------------------------------------------------------------
# Коэффициент наружной теплоотдачи из скорости ветра
# ---------------------------------------------------------------------------

def x_calc_alpha_vnesh__mutmut_21(wind_speed: float | None, location: str) -> float:
    """Коэффициент наружной теплоотдачи α, Вт/(м²·К).

    Для помещения: α = 9.0 (свободная конвекция)
    Для улицы: α = 11,6 + 7·v  (источник: ТНП, формула для трубопроводов)
    Диапазон: 11.6–52 Вт/(м²·К)
    """
    if location == "indoor":
        return 9.0
    v = wind_speed or 0.0
    alpha = 11.6 + 7.0 * v
    return min(max(alpha, 12.6), 52.0)


# ---------------------------------------------------------------------------
# Коэффициент наружной теплоотдачи из скорости ветра
# ---------------------------------------------------------------------------

def x_calc_alpha_vnesh__mutmut_22(wind_speed: float | None, location: str) -> float:
    """Коэффициент наружной теплоотдачи α, Вт/(м²·К).

    Для помещения: α = 9.0 (свободная конвекция)
    Для улицы: α = 11,6 + 7·v  (источник: ТНП, формула для трубопроводов)
    Диапазон: 11.6–52 Вт/(м²·К)
    """
    if location == "indoor":
        return 9.0
    v = wind_speed or 0.0
    alpha = 11.6 + 7.0 * v
    return min(max(alpha, 11.6), 53.0)

x_calc_alpha_vnesh__mutmut_mutants : ClassVar[MutantDict] = { # type: ignore
'x_calc_alpha_vnesh__mutmut_1': x_calc_alpha_vnesh__mutmut_1, 
    'x_calc_alpha_vnesh__mutmut_2': x_calc_alpha_vnesh__mutmut_2, 
    'x_calc_alpha_vnesh__mutmut_3': x_calc_alpha_vnesh__mutmut_3, 
    'x_calc_alpha_vnesh__mutmut_4': x_calc_alpha_vnesh__mutmut_4, 
    'x_calc_alpha_vnesh__mutmut_5': x_calc_alpha_vnesh__mutmut_5, 
    'x_calc_alpha_vnesh__mutmut_6': x_calc_alpha_vnesh__mutmut_6, 
    'x_calc_alpha_vnesh__mutmut_7': x_calc_alpha_vnesh__mutmut_7, 
    'x_calc_alpha_vnesh__mutmut_8': x_calc_alpha_vnesh__mutmut_8, 
    'x_calc_alpha_vnesh__mutmut_9': x_calc_alpha_vnesh__mutmut_9, 
    'x_calc_alpha_vnesh__mutmut_10': x_calc_alpha_vnesh__mutmut_10, 
    'x_calc_alpha_vnesh__mutmut_11': x_calc_alpha_vnesh__mutmut_11, 
    'x_calc_alpha_vnesh__mutmut_12': x_calc_alpha_vnesh__mutmut_12, 
    'x_calc_alpha_vnesh__mutmut_13': x_calc_alpha_vnesh__mutmut_13, 
    'x_calc_alpha_vnesh__mutmut_14': x_calc_alpha_vnesh__mutmut_14, 
    'x_calc_alpha_vnesh__mutmut_15': x_calc_alpha_vnesh__mutmut_15, 
    'x_calc_alpha_vnesh__mutmut_16': x_calc_alpha_vnesh__mutmut_16, 
    'x_calc_alpha_vnesh__mutmut_17': x_calc_alpha_vnesh__mutmut_17, 
    'x_calc_alpha_vnesh__mutmut_18': x_calc_alpha_vnesh__mutmut_18, 
    'x_calc_alpha_vnesh__mutmut_19': x_calc_alpha_vnesh__mutmut_19, 
    'x_calc_alpha_vnesh__mutmut_20': x_calc_alpha_vnesh__mutmut_20, 
    'x_calc_alpha_vnesh__mutmut_21': x_calc_alpha_vnesh__mutmut_21, 
    'x_calc_alpha_vnesh__mutmut_22': x_calc_alpha_vnesh__mutmut_22
}
x_calc_alpha_vnesh__mutmut_orig.__name__ = 'x_calc_alpha_vnesh'


# ---------------------------------------------------------------------------
# Слои изоляции: нормализация к единому формату
# ---------------------------------------------------------------------------

def _resolve_layers(params: PipeHeatLossParams) -> list[InsulationLayer]:
    args = [params]# type: ignore
    kwargs = {}# type: ignore
    return _mutmut_trampoline(x__resolve_layers__mutmut_orig, x__resolve_layers__mutmut_mutants, args, kwargs, None)


# ---------------------------------------------------------------------------
# Слои изоляции: нормализация к единому формату
# ---------------------------------------------------------------------------

def x__resolve_layers__mutmut_orig(params: PipeHeatLossParams) -> list[InsulationLayer]:
    """Возвращает список слоёв изоляции из параметров (однослойный или многослойный).

    Валидатор `PipeHeatLossParams.check_insulation_provided` гарантирует,
    что ИЛИ `insulation_layers` задан, ИЛИ пара `insulation_thickness +
    insulation_material` — поэтому в однослойной ветке оба поля не None.
    """
    if params.insulation_layers:
        return list(params.insulation_layers)
    # однослойный режим (обратная совместимость)
    thickness = params.insulation_thickness
    material = params.insulation_material
    # Инвариант гарантирован валидатором — assert для mypy + runtime safety net.
    assert thickness is not None and material is not None, (
        "Валидатор PipeHeatLossParams должен был это поймать"
    )
    return [InsulationLayer(thickness=thickness, material=material)]


# ---------------------------------------------------------------------------
# Слои изоляции: нормализация к единому формату
# ---------------------------------------------------------------------------

def x__resolve_layers__mutmut_1(params: PipeHeatLossParams) -> list[InsulationLayer]:
    """Возвращает список слоёв изоляции из параметров (однослойный или многослойный).

    Валидатор `PipeHeatLossParams.check_insulation_provided` гарантирует,
    что ИЛИ `insulation_layers` задан, ИЛИ пара `insulation_thickness +
    insulation_material` — поэтому в однослойной ветке оба поля не None.
    """
    if params.insulation_layers:
        return list(None)
    # однослойный режим (обратная совместимость)
    thickness = params.insulation_thickness
    material = params.insulation_material
    # Инвариант гарантирован валидатором — assert для mypy + runtime safety net.
    assert thickness is not None and material is not None, (
        "Валидатор PipeHeatLossParams должен был это поймать"
    )
    return [InsulationLayer(thickness=thickness, material=material)]


# ---------------------------------------------------------------------------
# Слои изоляции: нормализация к единому формату
# ---------------------------------------------------------------------------

def x__resolve_layers__mutmut_2(params: PipeHeatLossParams) -> list[InsulationLayer]:
    """Возвращает список слоёв изоляции из параметров (однослойный или многослойный).

    Валидатор `PipeHeatLossParams.check_insulation_provided` гарантирует,
    что ИЛИ `insulation_layers` задан, ИЛИ пара `insulation_thickness +
    insulation_material` — поэтому в однослойной ветке оба поля не None.
    """
    if params.insulation_layers:
        return list(params.insulation_layers)
    # однослойный режим (обратная совместимость)
    thickness = None
    material = params.insulation_material
    # Инвариант гарантирован валидатором — assert для mypy + runtime safety net.
    assert thickness is not None and material is not None, (
        "Валидатор PipeHeatLossParams должен был это поймать"
    )
    return [InsulationLayer(thickness=thickness, material=material)]


# ---------------------------------------------------------------------------
# Слои изоляции: нормализация к единому формату
# ---------------------------------------------------------------------------

def x__resolve_layers__mutmut_3(params: PipeHeatLossParams) -> list[InsulationLayer]:
    """Возвращает список слоёв изоляции из параметров (однослойный или многослойный).

    Валидатор `PipeHeatLossParams.check_insulation_provided` гарантирует,
    что ИЛИ `insulation_layers` задан, ИЛИ пара `insulation_thickness +
    insulation_material` — поэтому в однослойной ветке оба поля не None.
    """
    if params.insulation_layers:
        return list(params.insulation_layers)
    # однослойный режим (обратная совместимость)
    thickness = params.insulation_thickness
    material = None
    # Инвариант гарантирован валидатором — assert для mypy + runtime safety net.
    assert thickness is not None and material is not None, (
        "Валидатор PipeHeatLossParams должен был это поймать"
    )
    return [InsulationLayer(thickness=thickness, material=material)]


# ---------------------------------------------------------------------------
# Слои изоляции: нормализация к единому формату
# ---------------------------------------------------------------------------

def x__resolve_layers__mutmut_4(params: PipeHeatLossParams) -> list[InsulationLayer]:
    """Возвращает список слоёв изоляции из параметров (однослойный или многослойный).

    Валидатор `PipeHeatLossParams.check_insulation_provided` гарантирует,
    что ИЛИ `insulation_layers` задан, ИЛИ пара `insulation_thickness +
    insulation_material` — поэтому в однослойной ветке оба поля не None.
    """
    if params.insulation_layers:
        return list(params.insulation_layers)
    # однослойный режим (обратная совместимость)
    thickness = params.insulation_thickness
    material = params.insulation_material
    # Инвариант гарантирован валидатором — assert для mypy + runtime safety net.
    assert thickness is not None or material is not None, (
        "Валидатор PipeHeatLossParams должен был это поймать"
    )
    return [InsulationLayer(thickness=thickness, material=material)]


# ---------------------------------------------------------------------------
# Слои изоляции: нормализация к единому формату
# ---------------------------------------------------------------------------

def x__resolve_layers__mutmut_5(params: PipeHeatLossParams) -> list[InsulationLayer]:
    """Возвращает список слоёв изоляции из параметров (однослойный или многослойный).

    Валидатор `PipeHeatLossParams.check_insulation_provided` гарантирует,
    что ИЛИ `insulation_layers` задан, ИЛИ пара `insulation_thickness +
    insulation_material` — поэтому в однослойной ветке оба поля не None.
    """
    if params.insulation_layers:
        return list(params.insulation_layers)
    # однослойный режим (обратная совместимость)
    thickness = params.insulation_thickness
    material = params.insulation_material
    # Инвариант гарантирован валидатором — assert для mypy + runtime safety net.
    assert thickness is None and material is not None, (
        "Валидатор PipeHeatLossParams должен был это поймать"
    )
    return [InsulationLayer(thickness=thickness, material=material)]


# ---------------------------------------------------------------------------
# Слои изоляции: нормализация к единому формату
# ---------------------------------------------------------------------------

def x__resolve_layers__mutmut_6(params: PipeHeatLossParams) -> list[InsulationLayer]:
    """Возвращает список слоёв изоляции из параметров (однослойный или многослойный).

    Валидатор `PipeHeatLossParams.check_insulation_provided` гарантирует,
    что ИЛИ `insulation_layers` задан, ИЛИ пара `insulation_thickness +
    insulation_material` — поэтому в однослойной ветке оба поля не None.
    """
    if params.insulation_layers:
        return list(params.insulation_layers)
    # однослойный режим (обратная совместимость)
    thickness = params.insulation_thickness
    material = params.insulation_material
    # Инвариант гарантирован валидатором — assert для mypy + runtime safety net.
    assert thickness is not None and material is None, (
        "Валидатор PipeHeatLossParams должен был это поймать"
    )
    return [InsulationLayer(thickness=thickness, material=material)]


# ---------------------------------------------------------------------------
# Слои изоляции: нормализация к единому формату
# ---------------------------------------------------------------------------

def x__resolve_layers__mutmut_7(params: PipeHeatLossParams) -> list[InsulationLayer]:
    """Возвращает список слоёв изоляции из параметров (однослойный или многослойный).

    Валидатор `PipeHeatLossParams.check_insulation_provided` гарантирует,
    что ИЛИ `insulation_layers` задан, ИЛИ пара `insulation_thickness +
    insulation_material` — поэтому в однослойной ветке оба поля не None.
    """
    if params.insulation_layers:
        return list(params.insulation_layers)
    # однослойный режим (обратная совместимость)
    thickness = params.insulation_thickness
    material = params.insulation_material
    # Инвариант гарантирован валидатором — assert для mypy + runtime safety net.
    assert thickness is not None and material is not None, (
        "XXВалидатор PipeHeatLossParams должен был это пойматьXX"
    )
    return [InsulationLayer(thickness=thickness, material=material)]


# ---------------------------------------------------------------------------
# Слои изоляции: нормализация к единому формату
# ---------------------------------------------------------------------------

def x__resolve_layers__mutmut_8(params: PipeHeatLossParams) -> list[InsulationLayer]:
    """Возвращает список слоёв изоляции из параметров (однослойный или многослойный).

    Валидатор `PipeHeatLossParams.check_insulation_provided` гарантирует,
    что ИЛИ `insulation_layers` задан, ИЛИ пара `insulation_thickness +
    insulation_material` — поэтому в однослойной ветке оба поля не None.
    """
    if params.insulation_layers:
        return list(params.insulation_layers)
    # однослойный режим (обратная совместимость)
    thickness = params.insulation_thickness
    material = params.insulation_material
    # Инвариант гарантирован валидатором — assert для mypy + runtime safety net.
    assert thickness is not None and material is not None, (
        "валидатор pipeheatlossparams должен был это поймать"
    )
    return [InsulationLayer(thickness=thickness, material=material)]


# ---------------------------------------------------------------------------
# Слои изоляции: нормализация к единому формату
# ---------------------------------------------------------------------------

def x__resolve_layers__mutmut_9(params: PipeHeatLossParams) -> list[InsulationLayer]:
    """Возвращает список слоёв изоляции из параметров (однослойный или многослойный).

    Валидатор `PipeHeatLossParams.check_insulation_provided` гарантирует,
    что ИЛИ `insulation_layers` задан, ИЛИ пара `insulation_thickness +
    insulation_material` — поэтому в однослойной ветке оба поля не None.
    """
    if params.insulation_layers:
        return list(params.insulation_layers)
    # однослойный режим (обратная совместимость)
    thickness = params.insulation_thickness
    material = params.insulation_material
    # Инвариант гарантирован валидатором — assert для mypy + runtime safety net.
    assert thickness is not None and material is not None, (
        "ВАЛИДАТОР PIPEHEATLOSSPARAMS ДОЛЖЕН БЫЛ ЭТО ПОЙМАТЬ"
    )
    return [InsulationLayer(thickness=thickness, material=material)]


# ---------------------------------------------------------------------------
# Слои изоляции: нормализация к единому формату
# ---------------------------------------------------------------------------

def x__resolve_layers__mutmut_10(params: PipeHeatLossParams) -> list[InsulationLayer]:
    """Возвращает список слоёв изоляции из параметров (однослойный или многослойный).

    Валидатор `PipeHeatLossParams.check_insulation_provided` гарантирует,
    что ИЛИ `insulation_layers` задан, ИЛИ пара `insulation_thickness +
    insulation_material` — поэтому в однослойной ветке оба поля не None.
    """
    if params.insulation_layers:
        return list(params.insulation_layers)
    # однослойный режим (обратная совместимость)
    thickness = params.insulation_thickness
    material = params.insulation_material
    # Инвариант гарантирован валидатором — assert для mypy + runtime safety net.
    assert thickness is not None and material is not None, (
        "Валидатор PipeHeatLossParams должен был это поймать"
    )
    return [InsulationLayer(thickness=None, material=material)]


# ---------------------------------------------------------------------------
# Слои изоляции: нормализация к единому формату
# ---------------------------------------------------------------------------

def x__resolve_layers__mutmut_11(params: PipeHeatLossParams) -> list[InsulationLayer]:
    """Возвращает список слоёв изоляции из параметров (однослойный или многослойный).

    Валидатор `PipeHeatLossParams.check_insulation_provided` гарантирует,
    что ИЛИ `insulation_layers` задан, ИЛИ пара `insulation_thickness +
    insulation_material` — поэтому в однослойной ветке оба поля не None.
    """
    if params.insulation_layers:
        return list(params.insulation_layers)
    # однослойный режим (обратная совместимость)
    thickness = params.insulation_thickness
    material = params.insulation_material
    # Инвариант гарантирован валидатором — assert для mypy + runtime safety net.
    assert thickness is not None and material is not None, (
        "Валидатор PipeHeatLossParams должен был это поймать"
    )
    return [InsulationLayer(thickness=thickness, material=None)]


# ---------------------------------------------------------------------------
# Слои изоляции: нормализация к единому формату
# ---------------------------------------------------------------------------

def x__resolve_layers__mutmut_12(params: PipeHeatLossParams) -> list[InsulationLayer]:
    """Возвращает список слоёв изоляции из параметров (однослойный или многослойный).

    Валидатор `PipeHeatLossParams.check_insulation_provided` гарантирует,
    что ИЛИ `insulation_layers` задан, ИЛИ пара `insulation_thickness +
    insulation_material` — поэтому в однослойной ветке оба поля не None.
    """
    if params.insulation_layers:
        return list(params.insulation_layers)
    # однослойный режим (обратная совместимость)
    thickness = params.insulation_thickness
    material = params.insulation_material
    # Инвариант гарантирован валидатором — assert для mypy + runtime safety net.
    assert thickness is not None and material is not None, (
        "Валидатор PipeHeatLossParams должен был это поймать"
    )
    return [InsulationLayer(material=material)]


# ---------------------------------------------------------------------------
# Слои изоляции: нормализация к единому формату
# ---------------------------------------------------------------------------

def x__resolve_layers__mutmut_13(params: PipeHeatLossParams) -> list[InsulationLayer]:
    """Возвращает список слоёв изоляции из параметров (однослойный или многослойный).

    Валидатор `PipeHeatLossParams.check_insulation_provided` гарантирует,
    что ИЛИ `insulation_layers` задан, ИЛИ пара `insulation_thickness +
    insulation_material` — поэтому в однослойной ветке оба поля не None.
    """
    if params.insulation_layers:
        return list(params.insulation_layers)
    # однослойный режим (обратная совместимость)
    thickness = params.insulation_thickness
    material = params.insulation_material
    # Инвариант гарантирован валидатором — assert для mypy + runtime safety net.
    assert thickness is not None and material is not None, (
        "Валидатор PipeHeatLossParams должен был это поймать"
    )
    return [InsulationLayer(thickness=thickness, )]

x__resolve_layers__mutmut_mutants : ClassVar[MutantDict] = { # type: ignore
'x__resolve_layers__mutmut_1': x__resolve_layers__mutmut_1, 
    'x__resolve_layers__mutmut_2': x__resolve_layers__mutmut_2, 
    'x__resolve_layers__mutmut_3': x__resolve_layers__mutmut_3, 
    'x__resolve_layers__mutmut_4': x__resolve_layers__mutmut_4, 
    'x__resolve_layers__mutmut_5': x__resolve_layers__mutmut_5, 
    'x__resolve_layers__mutmut_6': x__resolve_layers__mutmut_6, 
    'x__resolve_layers__mutmut_7': x__resolve_layers__mutmut_7, 
    'x__resolve_layers__mutmut_8': x__resolve_layers__mutmut_8, 
    'x__resolve_layers__mutmut_9': x__resolve_layers__mutmut_9, 
    'x__resolve_layers__mutmut_10': x__resolve_layers__mutmut_10, 
    'x__resolve_layers__mutmut_11': x__resolve_layers__mutmut_11, 
    'x__resolve_layers__mutmut_12': x__resolve_layers__mutmut_12, 
    'x__resolve_layers__mutmut_13': x__resolve_layers__mutmut_13
}
x__resolve_layers__mutmut_orig.__name__ = 'x__resolve_layers'


# ---------------------------------------------------------------------------
# Тепловые сопротивления
# ---------------------------------------------------------------------------

def _r_cylindrical(r_in: float, r_out: float, lam: float) -> float:
    args = [r_in, r_out, lam]# type: ignore
    kwargs = {}# type: ignore
    return _mutmut_trampoline(x__r_cylindrical__mutmut_orig, x__r_cylindrical__mutmut_mutants, args, kwargs, None)


# ---------------------------------------------------------------------------
# Тепловые сопротивления
# ---------------------------------------------------------------------------

def x__r_cylindrical__mutmut_orig(r_in: float, r_out: float, lam: float) -> float:
    """Термическое сопротивление цилиндрического слоя, м·К/Вт на единицу длины."""
    return math.log(r_out / r_in) / (2 * math.pi * lam)


# ---------------------------------------------------------------------------
# Тепловые сопротивления
# ---------------------------------------------------------------------------

def x__r_cylindrical__mutmut_1(r_in: float, r_out: float, lam: float) -> float:
    """Термическое сопротивление цилиндрического слоя, м·К/Вт на единицу длины."""
    return math.log(r_out / r_in) * (2 * math.pi * lam)


# ---------------------------------------------------------------------------
# Тепловые сопротивления
# ---------------------------------------------------------------------------

def x__r_cylindrical__mutmut_2(r_in: float, r_out: float, lam: float) -> float:
    """Термическое сопротивление цилиндрического слоя, м·К/Вт на единицу длины."""
    return math.log(None) / (2 * math.pi * lam)


# ---------------------------------------------------------------------------
# Тепловые сопротивления
# ---------------------------------------------------------------------------

def x__r_cylindrical__mutmut_3(r_in: float, r_out: float, lam: float) -> float:
    """Термическое сопротивление цилиндрического слоя, м·К/Вт на единицу длины."""
    return math.log(r_out * r_in) / (2 * math.pi * lam)


# ---------------------------------------------------------------------------
# Тепловые сопротивления
# ---------------------------------------------------------------------------

def x__r_cylindrical__mutmut_4(r_in: float, r_out: float, lam: float) -> float:
    """Термическое сопротивление цилиндрического слоя, м·К/Вт на единицу длины."""
    return math.log(r_out / r_in) / (2 * math.pi / lam)


# ---------------------------------------------------------------------------
# Тепловые сопротивления
# ---------------------------------------------------------------------------

def x__r_cylindrical__mutmut_5(r_in: float, r_out: float, lam: float) -> float:
    """Термическое сопротивление цилиндрического слоя, м·К/Вт на единицу длины."""
    return math.log(r_out / r_in) / (2 / math.pi * lam)


# ---------------------------------------------------------------------------
# Тепловые сопротивления
# ---------------------------------------------------------------------------

def x__r_cylindrical__mutmut_6(r_in: float, r_out: float, lam: float) -> float:
    """Термическое сопротивление цилиндрического слоя, м·К/Вт на единицу длины."""
    return math.log(r_out / r_in) / (3 * math.pi * lam)

x__r_cylindrical__mutmut_mutants : ClassVar[MutantDict] = { # type: ignore
'x__r_cylindrical__mutmut_1': x__r_cylindrical__mutmut_1, 
    'x__r_cylindrical__mutmut_2': x__r_cylindrical__mutmut_2, 
    'x__r_cylindrical__mutmut_3': x__r_cylindrical__mutmut_3, 
    'x__r_cylindrical__mutmut_4': x__r_cylindrical__mutmut_4, 
    'x__r_cylindrical__mutmut_5': x__r_cylindrical__mutmut_5, 
    'x__r_cylindrical__mutmut_6': x__r_cylindrical__mutmut_6
}
x__r_cylindrical__mutmut_orig.__name__ = 'x__r_cylindrical'


def _r_wall(r_outer_pipe: float, wall_thickness: float, t_mean: float,
            material: str | None, lam_override: float | None) -> float:
    args = [r_outer_pipe, wall_thickness, t_mean, material, lam_override]# type: ignore
    kwargs = {}# type: ignore
    return _mutmut_trampoline(x__r_wall__mutmut_orig, x__r_wall__mutmut_mutants, args, kwargs, None)


def x__r_wall__mutmut_orig(r_outer_pipe: float, wall_thickness: float, t_mean: float,
            material: str | None, lam_override: float | None) -> float:
    """Термическое сопротивление стенки трубы."""
    r_inner = r_outer_pipe - wall_thickness
    if r_inner <= 0:
        raise ValueError(
            f"Толщина стенки ({wall_thickness * 1000:.1f} мм) превышает радиус трубы "
            f"({r_outer_pipe * 1000:.1f} мм)"
        )
    lam = lam_override if lam_override is not None else pipe_material_lambda(material, t_mean)
    return _r_cylindrical(r_inner, r_outer_pipe, lam)


def x__r_wall__mutmut_1(r_outer_pipe: float, wall_thickness: float, t_mean: float,
            material: str | None, lam_override: float | None) -> float:
    """Термическое сопротивление стенки трубы."""
    r_inner = None
    if r_inner <= 0:
        raise ValueError(
            f"Толщина стенки ({wall_thickness * 1000:.1f} мм) превышает радиус трубы "
            f"({r_outer_pipe * 1000:.1f} мм)"
        )
    lam = lam_override if lam_override is not None else pipe_material_lambda(material, t_mean)
    return _r_cylindrical(r_inner, r_outer_pipe, lam)


def x__r_wall__mutmut_2(r_outer_pipe: float, wall_thickness: float, t_mean: float,
            material: str | None, lam_override: float | None) -> float:
    """Термическое сопротивление стенки трубы."""
    r_inner = r_outer_pipe + wall_thickness
    if r_inner <= 0:
        raise ValueError(
            f"Толщина стенки ({wall_thickness * 1000:.1f} мм) превышает радиус трубы "
            f"({r_outer_pipe * 1000:.1f} мм)"
        )
    lam = lam_override if lam_override is not None else pipe_material_lambda(material, t_mean)
    return _r_cylindrical(r_inner, r_outer_pipe, lam)


def x__r_wall__mutmut_3(r_outer_pipe: float, wall_thickness: float, t_mean: float,
            material: str | None, lam_override: float | None) -> float:
    """Термическое сопротивление стенки трубы."""
    r_inner = r_outer_pipe - wall_thickness
    if r_inner < 0:
        raise ValueError(
            f"Толщина стенки ({wall_thickness * 1000:.1f} мм) превышает радиус трубы "
            f"({r_outer_pipe * 1000:.1f} мм)"
        )
    lam = lam_override if lam_override is not None else pipe_material_lambda(material, t_mean)
    return _r_cylindrical(r_inner, r_outer_pipe, lam)


def x__r_wall__mutmut_4(r_outer_pipe: float, wall_thickness: float, t_mean: float,
            material: str | None, lam_override: float | None) -> float:
    """Термическое сопротивление стенки трубы."""
    r_inner = r_outer_pipe - wall_thickness
    if r_inner <= 1:
        raise ValueError(
            f"Толщина стенки ({wall_thickness * 1000:.1f} мм) превышает радиус трубы "
            f"({r_outer_pipe * 1000:.1f} мм)"
        )
    lam = lam_override if lam_override is not None else pipe_material_lambda(material, t_mean)
    return _r_cylindrical(r_inner, r_outer_pipe, lam)


def x__r_wall__mutmut_5(r_outer_pipe: float, wall_thickness: float, t_mean: float,
            material: str | None, lam_override: float | None) -> float:
    """Термическое сопротивление стенки трубы."""
    r_inner = r_outer_pipe - wall_thickness
    if r_inner <= 0:
        raise ValueError(
            None
        )
    lam = lam_override if lam_override is not None else pipe_material_lambda(material, t_mean)
    return _r_cylindrical(r_inner, r_outer_pipe, lam)


def x__r_wall__mutmut_6(r_outer_pipe: float, wall_thickness: float, t_mean: float,
            material: str | None, lam_override: float | None) -> float:
    """Термическое сопротивление стенки трубы."""
    r_inner = r_outer_pipe - wall_thickness
    if r_inner <= 0:
        raise ValueError(
            f"Толщина стенки ({wall_thickness / 1000:.1f} мм) превышает радиус трубы "
            f"({r_outer_pipe * 1000:.1f} мм)"
        )
    lam = lam_override if lam_override is not None else pipe_material_lambda(material, t_mean)
    return _r_cylindrical(r_inner, r_outer_pipe, lam)


def x__r_wall__mutmut_7(r_outer_pipe: float, wall_thickness: float, t_mean: float,
            material: str | None, lam_override: float | None) -> float:
    """Термическое сопротивление стенки трубы."""
    r_inner = r_outer_pipe - wall_thickness
    if r_inner <= 0:
        raise ValueError(
            f"Толщина стенки ({wall_thickness * 1001:.1f} мм) превышает радиус трубы "
            f"({r_outer_pipe * 1000:.1f} мм)"
        )
    lam = lam_override if lam_override is not None else pipe_material_lambda(material, t_mean)
    return _r_cylindrical(r_inner, r_outer_pipe, lam)


def x__r_wall__mutmut_8(r_outer_pipe: float, wall_thickness: float, t_mean: float,
            material: str | None, lam_override: float | None) -> float:
    """Термическое сопротивление стенки трубы."""
    r_inner = r_outer_pipe - wall_thickness
    if r_inner <= 0:
        raise ValueError(
            f"Толщина стенки ({wall_thickness * 1000:.1f} мм) превышает радиус трубы "
            f"({r_outer_pipe / 1000:.1f} мм)"
        )
    lam = lam_override if lam_override is not None else pipe_material_lambda(material, t_mean)
    return _r_cylindrical(r_inner, r_outer_pipe, lam)


def x__r_wall__mutmut_9(r_outer_pipe: float, wall_thickness: float, t_mean: float,
            material: str | None, lam_override: float | None) -> float:
    """Термическое сопротивление стенки трубы."""
    r_inner = r_outer_pipe - wall_thickness
    if r_inner <= 0:
        raise ValueError(
            f"Толщина стенки ({wall_thickness * 1000:.1f} мм) превышает радиус трубы "
            f"({r_outer_pipe * 1001:.1f} мм)"
        )
    lam = lam_override if lam_override is not None else pipe_material_lambda(material, t_mean)
    return _r_cylindrical(r_inner, r_outer_pipe, lam)


def x__r_wall__mutmut_10(r_outer_pipe: float, wall_thickness: float, t_mean: float,
            material: str | None, lam_override: float | None) -> float:
    """Термическое сопротивление стенки трубы."""
    r_inner = r_outer_pipe - wall_thickness
    if r_inner <= 0:
        raise ValueError(
            f"Толщина стенки ({wall_thickness * 1000:.1f} мм) превышает радиус трубы "
            f"({r_outer_pipe * 1000:.1f} мм)"
        )
    lam = None
    return _r_cylindrical(r_inner, r_outer_pipe, lam)


def x__r_wall__mutmut_11(r_outer_pipe: float, wall_thickness: float, t_mean: float,
            material: str | None, lam_override: float | None) -> float:
    """Термическое сопротивление стенки трубы."""
    r_inner = r_outer_pipe - wall_thickness
    if r_inner <= 0:
        raise ValueError(
            f"Толщина стенки ({wall_thickness * 1000:.1f} мм) превышает радиус трубы "
            f"({r_outer_pipe * 1000:.1f} мм)"
        )
    lam = lam_override if lam_override is None else pipe_material_lambda(material, t_mean)
    return _r_cylindrical(r_inner, r_outer_pipe, lam)


def x__r_wall__mutmut_12(r_outer_pipe: float, wall_thickness: float, t_mean: float,
            material: str | None, lam_override: float | None) -> float:
    """Термическое сопротивление стенки трубы."""
    r_inner = r_outer_pipe - wall_thickness
    if r_inner <= 0:
        raise ValueError(
            f"Толщина стенки ({wall_thickness * 1000:.1f} мм) превышает радиус трубы "
            f"({r_outer_pipe * 1000:.1f} мм)"
        )
    lam = lam_override if lam_override is not None else pipe_material_lambda(None, t_mean)
    return _r_cylindrical(r_inner, r_outer_pipe, lam)


def x__r_wall__mutmut_13(r_outer_pipe: float, wall_thickness: float, t_mean: float,
            material: str | None, lam_override: float | None) -> float:
    """Термическое сопротивление стенки трубы."""
    r_inner = r_outer_pipe - wall_thickness
    if r_inner <= 0:
        raise ValueError(
            f"Толщина стенки ({wall_thickness * 1000:.1f} мм) превышает радиус трубы "
            f"({r_outer_pipe * 1000:.1f} мм)"
        )
    lam = lam_override if lam_override is not None else pipe_material_lambda(material, None)
    return _r_cylindrical(r_inner, r_outer_pipe, lam)


def x__r_wall__mutmut_14(r_outer_pipe: float, wall_thickness: float, t_mean: float,
            material: str | None, lam_override: float | None) -> float:
    """Термическое сопротивление стенки трубы."""
    r_inner = r_outer_pipe - wall_thickness
    if r_inner <= 0:
        raise ValueError(
            f"Толщина стенки ({wall_thickness * 1000:.1f} мм) превышает радиус трубы "
            f"({r_outer_pipe * 1000:.1f} мм)"
        )
    lam = lam_override if lam_override is not None else pipe_material_lambda(t_mean)
    return _r_cylindrical(r_inner, r_outer_pipe, lam)


def x__r_wall__mutmut_15(r_outer_pipe: float, wall_thickness: float, t_mean: float,
            material: str | None, lam_override: float | None) -> float:
    """Термическое сопротивление стенки трубы."""
    r_inner = r_outer_pipe - wall_thickness
    if r_inner <= 0:
        raise ValueError(
            f"Толщина стенки ({wall_thickness * 1000:.1f} мм) превышает радиус трубы "
            f"({r_outer_pipe * 1000:.1f} мм)"
        )
    lam = lam_override if lam_override is not None else pipe_material_lambda(material, )
    return _r_cylindrical(r_inner, r_outer_pipe, lam)


def x__r_wall__mutmut_16(r_outer_pipe: float, wall_thickness: float, t_mean: float,
            material: str | None, lam_override: float | None) -> float:
    """Термическое сопротивление стенки трубы."""
    r_inner = r_outer_pipe - wall_thickness
    if r_inner <= 0:
        raise ValueError(
            f"Толщина стенки ({wall_thickness * 1000:.1f} мм) превышает радиус трубы "
            f"({r_outer_pipe * 1000:.1f} мм)"
        )
    lam = lam_override if lam_override is not None else pipe_material_lambda(material, t_mean)
    return _r_cylindrical(None, r_outer_pipe, lam)


def x__r_wall__mutmut_17(r_outer_pipe: float, wall_thickness: float, t_mean: float,
            material: str | None, lam_override: float | None) -> float:
    """Термическое сопротивление стенки трубы."""
    r_inner = r_outer_pipe - wall_thickness
    if r_inner <= 0:
        raise ValueError(
            f"Толщина стенки ({wall_thickness * 1000:.1f} мм) превышает радиус трубы "
            f"({r_outer_pipe * 1000:.1f} мм)"
        )
    lam = lam_override if lam_override is not None else pipe_material_lambda(material, t_mean)
    return _r_cylindrical(r_inner, None, lam)


def x__r_wall__mutmut_18(r_outer_pipe: float, wall_thickness: float, t_mean: float,
            material: str | None, lam_override: float | None) -> float:
    """Термическое сопротивление стенки трубы."""
    r_inner = r_outer_pipe - wall_thickness
    if r_inner <= 0:
        raise ValueError(
            f"Толщина стенки ({wall_thickness * 1000:.1f} мм) превышает радиус трубы "
            f"({r_outer_pipe * 1000:.1f} мм)"
        )
    lam = lam_override if lam_override is not None else pipe_material_lambda(material, t_mean)
    return _r_cylindrical(r_inner, r_outer_pipe, None)


def x__r_wall__mutmut_19(r_outer_pipe: float, wall_thickness: float, t_mean: float,
            material: str | None, lam_override: float | None) -> float:
    """Термическое сопротивление стенки трубы."""
    r_inner = r_outer_pipe - wall_thickness
    if r_inner <= 0:
        raise ValueError(
            f"Толщина стенки ({wall_thickness * 1000:.1f} мм) превышает радиус трубы "
            f"({r_outer_pipe * 1000:.1f} мм)"
        )
    lam = lam_override if lam_override is not None else pipe_material_lambda(material, t_mean)
    return _r_cylindrical(r_outer_pipe, lam)


def x__r_wall__mutmut_20(r_outer_pipe: float, wall_thickness: float, t_mean: float,
            material: str | None, lam_override: float | None) -> float:
    """Термическое сопротивление стенки трубы."""
    r_inner = r_outer_pipe - wall_thickness
    if r_inner <= 0:
        raise ValueError(
            f"Толщина стенки ({wall_thickness * 1000:.1f} мм) превышает радиус трубы "
            f"({r_outer_pipe * 1000:.1f} мм)"
        )
    lam = lam_override if lam_override is not None else pipe_material_lambda(material, t_mean)
    return _r_cylindrical(r_inner, lam)


def x__r_wall__mutmut_21(r_outer_pipe: float, wall_thickness: float, t_mean: float,
            material: str | None, lam_override: float | None) -> float:
    """Термическое сопротивление стенки трубы."""
    r_inner = r_outer_pipe - wall_thickness
    if r_inner <= 0:
        raise ValueError(
            f"Толщина стенки ({wall_thickness * 1000:.1f} мм) превышает радиус трубы "
            f"({r_outer_pipe * 1000:.1f} мм)"
        )
    lam = lam_override if lam_override is not None else pipe_material_lambda(material, t_mean)
    return _r_cylindrical(r_inner, r_outer_pipe, )

x__r_wall__mutmut_mutants : ClassVar[MutantDict] = { # type: ignore
'x__r_wall__mutmut_1': x__r_wall__mutmut_1, 
    'x__r_wall__mutmut_2': x__r_wall__mutmut_2, 
    'x__r_wall__mutmut_3': x__r_wall__mutmut_3, 
    'x__r_wall__mutmut_4': x__r_wall__mutmut_4, 
    'x__r_wall__mutmut_5': x__r_wall__mutmut_5, 
    'x__r_wall__mutmut_6': x__r_wall__mutmut_6, 
    'x__r_wall__mutmut_7': x__r_wall__mutmut_7, 
    'x__r_wall__mutmut_8': x__r_wall__mutmut_8, 
    'x__r_wall__mutmut_9': x__r_wall__mutmut_9, 
    'x__r_wall__mutmut_10': x__r_wall__mutmut_10, 
    'x__r_wall__mutmut_11': x__r_wall__mutmut_11, 
    'x__r_wall__mutmut_12': x__r_wall__mutmut_12, 
    'x__r_wall__mutmut_13': x__r_wall__mutmut_13, 
    'x__r_wall__mutmut_14': x__r_wall__mutmut_14, 
    'x__r_wall__mutmut_15': x__r_wall__mutmut_15, 
    'x__r_wall__mutmut_16': x__r_wall__mutmut_16, 
    'x__r_wall__mutmut_17': x__r_wall__mutmut_17, 
    'x__r_wall__mutmut_18': x__r_wall__mutmut_18, 
    'x__r_wall__mutmut_19': x__r_wall__mutmut_19, 
    'x__r_wall__mutmut_20': x__r_wall__mutmut_20, 
    'x__r_wall__mutmut_21': x__r_wall__mutmut_21
}
x__r_wall__mutmut_orig.__name__ = 'x__r_wall'


def _r_insulation_layers(
    r_start: float,
    layers: list[InsulationLayer],
    t_mean: float,
) -> tuple[float, float]:
    args = [r_start, layers, t_mean]# type: ignore
    kwargs = {}# type: ignore
    return _mutmut_trampoline(x__r_insulation_layers__mutmut_orig, x__r_insulation_layers__mutmut_mutants, args, kwargs, None)


def x__r_insulation_layers__mutmut_orig(
    r_start: float,
    layers: list[InsulationLayer],
    t_mean: float,
) -> tuple[float, float]:
    """Суммарное сопротивление слоёв изоляции + итоговый наружный радиус."""
    r = r_start
    r_total = 0.0
    for layer in layers:
        r_out = r + layer.thickness
        if layer.conductivity is not None:
            lam = layer.conductivity
        else:
            lam = get_insulation_conductivity(layer.material, t_mean)
        r_total += _r_cylindrical(r, r_out, lam)
        r = r_out
    return r_total, r  # (сопротивление, наружный радиус изоляции)


def x__r_insulation_layers__mutmut_1(
    r_start: float,
    layers: list[InsulationLayer],
    t_mean: float,
) -> tuple[float, float]:
    """Суммарное сопротивление слоёв изоляции + итоговый наружный радиус."""
    r = None
    r_total = 0.0
    for layer in layers:
        r_out = r + layer.thickness
        if layer.conductivity is not None:
            lam = layer.conductivity
        else:
            lam = get_insulation_conductivity(layer.material, t_mean)
        r_total += _r_cylindrical(r, r_out, lam)
        r = r_out
    return r_total, r  # (сопротивление, наружный радиус изоляции)


def x__r_insulation_layers__mutmut_2(
    r_start: float,
    layers: list[InsulationLayer],
    t_mean: float,
) -> tuple[float, float]:
    """Суммарное сопротивление слоёв изоляции + итоговый наружный радиус."""
    r = r_start
    r_total = None
    for layer in layers:
        r_out = r + layer.thickness
        if layer.conductivity is not None:
            lam = layer.conductivity
        else:
            lam = get_insulation_conductivity(layer.material, t_mean)
        r_total += _r_cylindrical(r, r_out, lam)
        r = r_out
    return r_total, r  # (сопротивление, наружный радиус изоляции)


def x__r_insulation_layers__mutmut_3(
    r_start: float,
    layers: list[InsulationLayer],
    t_mean: float,
) -> tuple[float, float]:
    """Суммарное сопротивление слоёв изоляции + итоговый наружный радиус."""
    r = r_start
    r_total = 1.0
    for layer in layers:
        r_out = r + layer.thickness
        if layer.conductivity is not None:
            lam = layer.conductivity
        else:
            lam = get_insulation_conductivity(layer.material, t_mean)
        r_total += _r_cylindrical(r, r_out, lam)
        r = r_out
    return r_total, r  # (сопротивление, наружный радиус изоляции)


def x__r_insulation_layers__mutmut_4(
    r_start: float,
    layers: list[InsulationLayer],
    t_mean: float,
) -> tuple[float, float]:
    """Суммарное сопротивление слоёв изоляции + итоговый наружный радиус."""
    r = r_start
    r_total = 0.0
    for layer in layers:
        r_out = None
        if layer.conductivity is not None:
            lam = layer.conductivity
        else:
            lam = get_insulation_conductivity(layer.material, t_mean)
        r_total += _r_cylindrical(r, r_out, lam)
        r = r_out
    return r_total, r  # (сопротивление, наружный радиус изоляции)


def x__r_insulation_layers__mutmut_5(
    r_start: float,
    layers: list[InsulationLayer],
    t_mean: float,
) -> tuple[float, float]:
    """Суммарное сопротивление слоёв изоляции + итоговый наружный радиус."""
    r = r_start
    r_total = 0.0
    for layer in layers:
        r_out = r - layer.thickness
        if layer.conductivity is not None:
            lam = layer.conductivity
        else:
            lam = get_insulation_conductivity(layer.material, t_mean)
        r_total += _r_cylindrical(r, r_out, lam)
        r = r_out
    return r_total, r  # (сопротивление, наружный радиус изоляции)


def x__r_insulation_layers__mutmut_6(
    r_start: float,
    layers: list[InsulationLayer],
    t_mean: float,
) -> tuple[float, float]:
    """Суммарное сопротивление слоёв изоляции + итоговый наружный радиус."""
    r = r_start
    r_total = 0.0
    for layer in layers:
        r_out = r + layer.thickness
        if layer.conductivity is None:
            lam = layer.conductivity
        else:
            lam = get_insulation_conductivity(layer.material, t_mean)
        r_total += _r_cylindrical(r, r_out, lam)
        r = r_out
    return r_total, r  # (сопротивление, наружный радиус изоляции)


def x__r_insulation_layers__mutmut_7(
    r_start: float,
    layers: list[InsulationLayer],
    t_mean: float,
) -> tuple[float, float]:
    """Суммарное сопротивление слоёв изоляции + итоговый наружный радиус."""
    r = r_start
    r_total = 0.0
    for layer in layers:
        r_out = r + layer.thickness
        if layer.conductivity is not None:
            lam = None
        else:
            lam = get_insulation_conductivity(layer.material, t_mean)
        r_total += _r_cylindrical(r, r_out, lam)
        r = r_out
    return r_total, r  # (сопротивление, наружный радиус изоляции)


def x__r_insulation_layers__mutmut_8(
    r_start: float,
    layers: list[InsulationLayer],
    t_mean: float,
) -> tuple[float, float]:
    """Суммарное сопротивление слоёв изоляции + итоговый наружный радиус."""
    r = r_start
    r_total = 0.0
    for layer in layers:
        r_out = r + layer.thickness
        if layer.conductivity is not None:
            lam = layer.conductivity
        else:
            lam = None
        r_total += _r_cylindrical(r, r_out, lam)
        r = r_out
    return r_total, r  # (сопротивление, наружный радиус изоляции)


def x__r_insulation_layers__mutmut_9(
    r_start: float,
    layers: list[InsulationLayer],
    t_mean: float,
) -> tuple[float, float]:
    """Суммарное сопротивление слоёв изоляции + итоговый наружный радиус."""
    r = r_start
    r_total = 0.0
    for layer in layers:
        r_out = r + layer.thickness
        if layer.conductivity is not None:
            lam = layer.conductivity
        else:
            lam = get_insulation_conductivity(None, t_mean)
        r_total += _r_cylindrical(r, r_out, lam)
        r = r_out
    return r_total, r  # (сопротивление, наружный радиус изоляции)


def x__r_insulation_layers__mutmut_10(
    r_start: float,
    layers: list[InsulationLayer],
    t_mean: float,
) -> tuple[float, float]:
    """Суммарное сопротивление слоёв изоляции + итоговый наружный радиус."""
    r = r_start
    r_total = 0.0
    for layer in layers:
        r_out = r + layer.thickness
        if layer.conductivity is not None:
            lam = layer.conductivity
        else:
            lam = get_insulation_conductivity(layer.material, None)
        r_total += _r_cylindrical(r, r_out, lam)
        r = r_out
    return r_total, r  # (сопротивление, наружный радиус изоляции)


def x__r_insulation_layers__mutmut_11(
    r_start: float,
    layers: list[InsulationLayer],
    t_mean: float,
) -> tuple[float, float]:
    """Суммарное сопротивление слоёв изоляции + итоговый наружный радиус."""
    r = r_start
    r_total = 0.0
    for layer in layers:
        r_out = r + layer.thickness
        if layer.conductivity is not None:
            lam = layer.conductivity
        else:
            lam = get_insulation_conductivity(t_mean)
        r_total += _r_cylindrical(r, r_out, lam)
        r = r_out
    return r_total, r  # (сопротивление, наружный радиус изоляции)


def x__r_insulation_layers__mutmut_12(
    r_start: float,
    layers: list[InsulationLayer],
    t_mean: float,
) -> tuple[float, float]:
    """Суммарное сопротивление слоёв изоляции + итоговый наружный радиус."""
    r = r_start
    r_total = 0.0
    for layer in layers:
        r_out = r + layer.thickness
        if layer.conductivity is not None:
            lam = layer.conductivity
        else:
            lam = get_insulation_conductivity(layer.material, )
        r_total += _r_cylindrical(r, r_out, lam)
        r = r_out
    return r_total, r  # (сопротивление, наружный радиус изоляции)


def x__r_insulation_layers__mutmut_13(
    r_start: float,
    layers: list[InsulationLayer],
    t_mean: float,
) -> tuple[float, float]:
    """Суммарное сопротивление слоёв изоляции + итоговый наружный радиус."""
    r = r_start
    r_total = 0.0
    for layer in layers:
        r_out = r + layer.thickness
        if layer.conductivity is not None:
            lam = layer.conductivity
        else:
            lam = get_insulation_conductivity(layer.material, t_mean)
        r_total = _r_cylindrical(r, r_out, lam)
        r = r_out
    return r_total, r  # (сопротивление, наружный радиус изоляции)


def x__r_insulation_layers__mutmut_14(
    r_start: float,
    layers: list[InsulationLayer],
    t_mean: float,
) -> tuple[float, float]:
    """Суммарное сопротивление слоёв изоляции + итоговый наружный радиус."""
    r = r_start
    r_total = 0.0
    for layer in layers:
        r_out = r + layer.thickness
        if layer.conductivity is not None:
            lam = layer.conductivity
        else:
            lam = get_insulation_conductivity(layer.material, t_mean)
        r_total -= _r_cylindrical(r, r_out, lam)
        r = r_out
    return r_total, r  # (сопротивление, наружный радиус изоляции)


def x__r_insulation_layers__mutmut_15(
    r_start: float,
    layers: list[InsulationLayer],
    t_mean: float,
) -> tuple[float, float]:
    """Суммарное сопротивление слоёв изоляции + итоговый наружный радиус."""
    r = r_start
    r_total = 0.0
    for layer in layers:
        r_out = r + layer.thickness
        if layer.conductivity is not None:
            lam = layer.conductivity
        else:
            lam = get_insulation_conductivity(layer.material, t_mean)
        r_total += _r_cylindrical(None, r_out, lam)
        r = r_out
    return r_total, r  # (сопротивление, наружный радиус изоляции)


def x__r_insulation_layers__mutmut_16(
    r_start: float,
    layers: list[InsulationLayer],
    t_mean: float,
) -> tuple[float, float]:
    """Суммарное сопротивление слоёв изоляции + итоговый наружный радиус."""
    r = r_start
    r_total = 0.0
    for layer in layers:
        r_out = r + layer.thickness
        if layer.conductivity is not None:
            lam = layer.conductivity
        else:
            lam = get_insulation_conductivity(layer.material, t_mean)
        r_total += _r_cylindrical(r, None, lam)
        r = r_out
    return r_total, r  # (сопротивление, наружный радиус изоляции)


def x__r_insulation_layers__mutmut_17(
    r_start: float,
    layers: list[InsulationLayer],
    t_mean: float,
) -> tuple[float, float]:
    """Суммарное сопротивление слоёв изоляции + итоговый наружный радиус."""
    r = r_start
    r_total = 0.0
    for layer in layers:
        r_out = r + layer.thickness
        if layer.conductivity is not None:
            lam = layer.conductivity
        else:
            lam = get_insulation_conductivity(layer.material, t_mean)
        r_total += _r_cylindrical(r, r_out, None)
        r = r_out
    return r_total, r  # (сопротивление, наружный радиус изоляции)


def x__r_insulation_layers__mutmut_18(
    r_start: float,
    layers: list[InsulationLayer],
    t_mean: float,
) -> tuple[float, float]:
    """Суммарное сопротивление слоёв изоляции + итоговый наружный радиус."""
    r = r_start
    r_total = 0.0
    for layer in layers:
        r_out = r + layer.thickness
        if layer.conductivity is not None:
            lam = layer.conductivity
        else:
            lam = get_insulation_conductivity(layer.material, t_mean)
        r_total += _r_cylindrical(r_out, lam)
        r = r_out
    return r_total, r  # (сопротивление, наружный радиус изоляции)


def x__r_insulation_layers__mutmut_19(
    r_start: float,
    layers: list[InsulationLayer],
    t_mean: float,
) -> tuple[float, float]:
    """Суммарное сопротивление слоёв изоляции + итоговый наружный радиус."""
    r = r_start
    r_total = 0.0
    for layer in layers:
        r_out = r + layer.thickness
        if layer.conductivity is not None:
            lam = layer.conductivity
        else:
            lam = get_insulation_conductivity(layer.material, t_mean)
        r_total += _r_cylindrical(r, lam)
        r = r_out
    return r_total, r  # (сопротивление, наружный радиус изоляции)


def x__r_insulation_layers__mutmut_20(
    r_start: float,
    layers: list[InsulationLayer],
    t_mean: float,
) -> tuple[float, float]:
    """Суммарное сопротивление слоёв изоляции + итоговый наружный радиус."""
    r = r_start
    r_total = 0.0
    for layer in layers:
        r_out = r + layer.thickness
        if layer.conductivity is not None:
            lam = layer.conductivity
        else:
            lam = get_insulation_conductivity(layer.material, t_mean)
        r_total += _r_cylindrical(r, r_out, )
        r = r_out
    return r_total, r  # (сопротивление, наружный радиус изоляции)


def x__r_insulation_layers__mutmut_21(
    r_start: float,
    layers: list[InsulationLayer],
    t_mean: float,
) -> tuple[float, float]:
    """Суммарное сопротивление слоёв изоляции + итоговый наружный радиус."""
    r = r_start
    r_total = 0.0
    for layer in layers:
        r_out = r + layer.thickness
        if layer.conductivity is not None:
            lam = layer.conductivity
        else:
            lam = get_insulation_conductivity(layer.material, t_mean)
        r_total += _r_cylindrical(r, r_out, lam)
        r = None
    return r_total, r  # (сопротивление, наружный радиус изоляции)

x__r_insulation_layers__mutmut_mutants : ClassVar[MutantDict] = { # type: ignore
'x__r_insulation_layers__mutmut_1': x__r_insulation_layers__mutmut_1, 
    'x__r_insulation_layers__mutmut_2': x__r_insulation_layers__mutmut_2, 
    'x__r_insulation_layers__mutmut_3': x__r_insulation_layers__mutmut_3, 
    'x__r_insulation_layers__mutmut_4': x__r_insulation_layers__mutmut_4, 
    'x__r_insulation_layers__mutmut_5': x__r_insulation_layers__mutmut_5, 
    'x__r_insulation_layers__mutmut_6': x__r_insulation_layers__mutmut_6, 
    'x__r_insulation_layers__mutmut_7': x__r_insulation_layers__mutmut_7, 
    'x__r_insulation_layers__mutmut_8': x__r_insulation_layers__mutmut_8, 
    'x__r_insulation_layers__mutmut_9': x__r_insulation_layers__mutmut_9, 
    'x__r_insulation_layers__mutmut_10': x__r_insulation_layers__mutmut_10, 
    'x__r_insulation_layers__mutmut_11': x__r_insulation_layers__mutmut_11, 
    'x__r_insulation_layers__mutmut_12': x__r_insulation_layers__mutmut_12, 
    'x__r_insulation_layers__mutmut_13': x__r_insulation_layers__mutmut_13, 
    'x__r_insulation_layers__mutmut_14': x__r_insulation_layers__mutmut_14, 
    'x__r_insulation_layers__mutmut_15': x__r_insulation_layers__mutmut_15, 
    'x__r_insulation_layers__mutmut_16': x__r_insulation_layers__mutmut_16, 
    'x__r_insulation_layers__mutmut_17': x__r_insulation_layers__mutmut_17, 
    'x__r_insulation_layers__mutmut_18': x__r_insulation_layers__mutmut_18, 
    'x__r_insulation_layers__mutmut_19': x__r_insulation_layers__mutmut_19, 
    'x__r_insulation_layers__mutmut_20': x__r_insulation_layers__mutmut_20, 
    'x__r_insulation_layers__mutmut_21': x__r_insulation_layers__mutmut_21
}
x__r_insulation_layers__mutmut_orig.__name__ = 'x__r_insulation_layers'


def _r_external(r_outer: float, alpha: float) -> float:
    args = [r_outer, alpha]# type: ignore
    kwargs = {}# type: ignore
    return _mutmut_trampoline(x__r_external__mutmut_orig, x__r_external__mutmut_mutants, args, kwargs, None)


def x__r_external__mutmut_orig(r_outer: float, alpha: float) -> float:
    """Сопротивление наружного теплообмена (надземная прокладка)."""
    return 1.0 / (2 * math.pi * r_outer * alpha)


def x__r_external__mutmut_1(r_outer: float, alpha: float) -> float:
    """Сопротивление наружного теплообмена (надземная прокладка)."""
    return 1.0 * (2 * math.pi * r_outer * alpha)


def x__r_external__mutmut_2(r_outer: float, alpha: float) -> float:
    """Сопротивление наружного теплообмена (надземная прокладка)."""
    return 2.0 / (2 * math.pi * r_outer * alpha)


def x__r_external__mutmut_3(r_outer: float, alpha: float) -> float:
    """Сопротивление наружного теплообмена (надземная прокладка)."""
    return 1.0 / (2 * math.pi * r_outer / alpha)


def x__r_external__mutmut_4(r_outer: float, alpha: float) -> float:
    """Сопротивление наружного теплообмена (надземная прокладка)."""
    return 1.0 / (2 * math.pi / r_outer * alpha)


def x__r_external__mutmut_5(r_outer: float, alpha: float) -> float:
    """Сопротивление наружного теплообмена (надземная прокладка)."""
    return 1.0 / (2 / math.pi * r_outer * alpha)


def x__r_external__mutmut_6(r_outer: float, alpha: float) -> float:
    """Сопротивление наружного теплообмена (надземная прокладка)."""
    return 1.0 / (3 * math.pi * r_outer * alpha)

x__r_external__mutmut_mutants : ClassVar[MutantDict] = { # type: ignore
'x__r_external__mutmut_1': x__r_external__mutmut_1, 
    'x__r_external__mutmut_2': x__r_external__mutmut_2, 
    'x__r_external__mutmut_3': x__r_external__mutmut_3, 
    'x__r_external__mutmut_4': x__r_external__mutmut_4, 
    'x__r_external__mutmut_5': x__r_external__mutmut_5, 
    'x__r_external__mutmut_6': x__r_external__mutmut_6
}
x__r_external__mutmut_orig.__name__ = 'x__r_external'


def _r_ground(r_outer: float, burial_depth: float, lambda_gr: float) -> float:
    args = [r_outer, burial_depth, lambda_gr]# type: ignore
    kwargs = {}# type: ignore
    return _mutmut_trampoline(x__r_ground__mutmut_orig, x__r_ground__mutmut_mutants, args, kwargs, None)


def x__r_ground__mutmut_orig(r_outer: float, burial_depth: float, lambda_gr: float) -> float:
    """Сопротивление грунта (подземная прокладка).

    R = arccosh(H/r) / (2π·λ_gr)
    При H/r >> 1: arccosh(x) ≈ ln(2x)
    """
    x = burial_depth / r_outer
    if x < 1.0:
        raise ValueError(
            f"Глубина заложения H={burial_depth:.2f} м меньше наружного радиуса изоляции "
            f"r={r_outer:.3f} м — труба не помещается в грунт"
        )
    acosh_val = math.log(x + math.sqrt(x * x - 1))
    return acosh_val / (2 * math.pi * lambda_gr)


def x__r_ground__mutmut_1(r_outer: float, burial_depth: float, lambda_gr: float) -> float:
    """Сопротивление грунта (подземная прокладка).

    R = arccosh(H/r) / (2π·λ_gr)
    При H/r >> 1: arccosh(x) ≈ ln(2x)
    """
    x = None
    if x < 1.0:
        raise ValueError(
            f"Глубина заложения H={burial_depth:.2f} м меньше наружного радиуса изоляции "
            f"r={r_outer:.3f} м — труба не помещается в грунт"
        )
    acosh_val = math.log(x + math.sqrt(x * x - 1))
    return acosh_val / (2 * math.pi * lambda_gr)


def x__r_ground__mutmut_2(r_outer: float, burial_depth: float, lambda_gr: float) -> float:
    """Сопротивление грунта (подземная прокладка).

    R = arccosh(H/r) / (2π·λ_gr)
    При H/r >> 1: arccosh(x) ≈ ln(2x)
    """
    x = burial_depth * r_outer
    if x < 1.0:
        raise ValueError(
            f"Глубина заложения H={burial_depth:.2f} м меньше наружного радиуса изоляции "
            f"r={r_outer:.3f} м — труба не помещается в грунт"
        )
    acosh_val = math.log(x + math.sqrt(x * x - 1))
    return acosh_val / (2 * math.pi * lambda_gr)


def x__r_ground__mutmut_3(r_outer: float, burial_depth: float, lambda_gr: float) -> float:
    """Сопротивление грунта (подземная прокладка).

    R = arccosh(H/r) / (2π·λ_gr)
    При H/r >> 1: arccosh(x) ≈ ln(2x)
    """
    x = burial_depth / r_outer
    if x <= 1.0:
        raise ValueError(
            f"Глубина заложения H={burial_depth:.2f} м меньше наружного радиуса изоляции "
            f"r={r_outer:.3f} м — труба не помещается в грунт"
        )
    acosh_val = math.log(x + math.sqrt(x * x - 1))
    return acosh_val / (2 * math.pi * lambda_gr)


def x__r_ground__mutmut_4(r_outer: float, burial_depth: float, lambda_gr: float) -> float:
    """Сопротивление грунта (подземная прокладка).

    R = arccosh(H/r) / (2π·λ_gr)
    При H/r >> 1: arccosh(x) ≈ ln(2x)
    """
    x = burial_depth / r_outer
    if x < 2.0:
        raise ValueError(
            f"Глубина заложения H={burial_depth:.2f} м меньше наружного радиуса изоляции "
            f"r={r_outer:.3f} м — труба не помещается в грунт"
        )
    acosh_val = math.log(x + math.sqrt(x * x - 1))
    return acosh_val / (2 * math.pi * lambda_gr)


def x__r_ground__mutmut_5(r_outer: float, burial_depth: float, lambda_gr: float) -> float:
    """Сопротивление грунта (подземная прокладка).

    R = arccosh(H/r) / (2π·λ_gr)
    При H/r >> 1: arccosh(x) ≈ ln(2x)
    """
    x = burial_depth / r_outer
    if x < 1.0:
        raise ValueError(
            None
        )
    acosh_val = math.log(x + math.sqrt(x * x - 1))
    return acosh_val / (2 * math.pi * lambda_gr)


def x__r_ground__mutmut_6(r_outer: float, burial_depth: float, lambda_gr: float) -> float:
    """Сопротивление грунта (подземная прокладка).

    R = arccosh(H/r) / (2π·λ_gr)
    При H/r >> 1: arccosh(x) ≈ ln(2x)
    """
    x = burial_depth / r_outer
    if x < 1.0:
        raise ValueError(
            f"Глубина заложения H={burial_depth:.2f} м меньше наружного радиуса изоляции "
            f"r={r_outer:.3f} м — труба не помещается в грунт"
        )
    acosh_val = None
    return acosh_val / (2 * math.pi * lambda_gr)


def x__r_ground__mutmut_7(r_outer: float, burial_depth: float, lambda_gr: float) -> float:
    """Сопротивление грунта (подземная прокладка).

    R = arccosh(H/r) / (2π·λ_gr)
    При H/r >> 1: arccosh(x) ≈ ln(2x)
    """
    x = burial_depth / r_outer
    if x < 1.0:
        raise ValueError(
            f"Глубина заложения H={burial_depth:.2f} м меньше наружного радиуса изоляции "
            f"r={r_outer:.3f} м — труба не помещается в грунт"
        )
    acosh_val = math.log(None)
    return acosh_val / (2 * math.pi * lambda_gr)


def x__r_ground__mutmut_8(r_outer: float, burial_depth: float, lambda_gr: float) -> float:
    """Сопротивление грунта (подземная прокладка).

    R = arccosh(H/r) / (2π·λ_gr)
    При H/r >> 1: arccosh(x) ≈ ln(2x)
    """
    x = burial_depth / r_outer
    if x < 1.0:
        raise ValueError(
            f"Глубина заложения H={burial_depth:.2f} м меньше наружного радиуса изоляции "
            f"r={r_outer:.3f} м — труба не помещается в грунт"
        )
    acosh_val = math.log(x - math.sqrt(x * x - 1))
    return acosh_val / (2 * math.pi * lambda_gr)


def x__r_ground__mutmut_9(r_outer: float, burial_depth: float, lambda_gr: float) -> float:
    """Сопротивление грунта (подземная прокладка).

    R = arccosh(H/r) / (2π·λ_gr)
    При H/r >> 1: arccosh(x) ≈ ln(2x)
    """
    x = burial_depth / r_outer
    if x < 1.0:
        raise ValueError(
            f"Глубина заложения H={burial_depth:.2f} м меньше наружного радиуса изоляции "
            f"r={r_outer:.3f} м — труба не помещается в грунт"
        )
    acosh_val = math.log(x + math.sqrt(None))
    return acosh_val / (2 * math.pi * lambda_gr)


def x__r_ground__mutmut_10(r_outer: float, burial_depth: float, lambda_gr: float) -> float:
    """Сопротивление грунта (подземная прокладка).

    R = arccosh(H/r) / (2π·λ_gr)
    При H/r >> 1: arccosh(x) ≈ ln(2x)
    """
    x = burial_depth / r_outer
    if x < 1.0:
        raise ValueError(
            f"Глубина заложения H={burial_depth:.2f} м меньше наружного радиуса изоляции "
            f"r={r_outer:.3f} м — труба не помещается в грунт"
        )
    acosh_val = math.log(x + math.sqrt(x * x + 1))
    return acosh_val / (2 * math.pi * lambda_gr)


def x__r_ground__mutmut_11(r_outer: float, burial_depth: float, lambda_gr: float) -> float:
    """Сопротивление грунта (подземная прокладка).

    R = arccosh(H/r) / (2π·λ_gr)
    При H/r >> 1: arccosh(x) ≈ ln(2x)
    """
    x = burial_depth / r_outer
    if x < 1.0:
        raise ValueError(
            f"Глубина заложения H={burial_depth:.2f} м меньше наружного радиуса изоляции "
            f"r={r_outer:.3f} м — труба не помещается в грунт"
        )
    acosh_val = math.log(x + math.sqrt(x / x - 1))
    return acosh_val / (2 * math.pi * lambda_gr)


def x__r_ground__mutmut_12(r_outer: float, burial_depth: float, lambda_gr: float) -> float:
    """Сопротивление грунта (подземная прокладка).

    R = arccosh(H/r) / (2π·λ_gr)
    При H/r >> 1: arccosh(x) ≈ ln(2x)
    """
    x = burial_depth / r_outer
    if x < 1.0:
        raise ValueError(
            f"Глубина заложения H={burial_depth:.2f} м меньше наружного радиуса изоляции "
            f"r={r_outer:.3f} м — труба не помещается в грунт"
        )
    acosh_val = math.log(x + math.sqrt(x * x - 2))
    return acosh_val / (2 * math.pi * lambda_gr)


def x__r_ground__mutmut_13(r_outer: float, burial_depth: float, lambda_gr: float) -> float:
    """Сопротивление грунта (подземная прокладка).

    R = arccosh(H/r) / (2π·λ_gr)
    При H/r >> 1: arccosh(x) ≈ ln(2x)
    """
    x = burial_depth / r_outer
    if x < 1.0:
        raise ValueError(
            f"Глубина заложения H={burial_depth:.2f} м меньше наружного радиуса изоляции "
            f"r={r_outer:.3f} м — труба не помещается в грунт"
        )
    acosh_val = math.log(x + math.sqrt(x * x - 1))
    return acosh_val * (2 * math.pi * lambda_gr)


def x__r_ground__mutmut_14(r_outer: float, burial_depth: float, lambda_gr: float) -> float:
    """Сопротивление грунта (подземная прокладка).

    R = arccosh(H/r) / (2π·λ_gr)
    При H/r >> 1: arccosh(x) ≈ ln(2x)
    """
    x = burial_depth / r_outer
    if x < 1.0:
        raise ValueError(
            f"Глубина заложения H={burial_depth:.2f} м меньше наружного радиуса изоляции "
            f"r={r_outer:.3f} м — труба не помещается в грунт"
        )
    acosh_val = math.log(x + math.sqrt(x * x - 1))
    return acosh_val / (2 * math.pi / lambda_gr)


def x__r_ground__mutmut_15(r_outer: float, burial_depth: float, lambda_gr: float) -> float:
    """Сопротивление грунта (подземная прокладка).

    R = arccosh(H/r) / (2π·λ_gr)
    При H/r >> 1: arccosh(x) ≈ ln(2x)
    """
    x = burial_depth / r_outer
    if x < 1.0:
        raise ValueError(
            f"Глубина заложения H={burial_depth:.2f} м меньше наружного радиуса изоляции "
            f"r={r_outer:.3f} м — труба не помещается в грунт"
        )
    acosh_val = math.log(x + math.sqrt(x * x - 1))
    return acosh_val / (2 / math.pi * lambda_gr)


def x__r_ground__mutmut_16(r_outer: float, burial_depth: float, lambda_gr: float) -> float:
    """Сопротивление грунта (подземная прокладка).

    R = arccosh(H/r) / (2π·λ_gr)
    При H/r >> 1: arccosh(x) ≈ ln(2x)
    """
    x = burial_depth / r_outer
    if x < 1.0:
        raise ValueError(
            f"Глубина заложения H={burial_depth:.2f} м меньше наружного радиуса изоляции "
            f"r={r_outer:.3f} м — труба не помещается в грунт"
        )
    acosh_val = math.log(x + math.sqrt(x * x - 1))
    return acosh_val / (3 * math.pi * lambda_gr)

x__r_ground__mutmut_mutants : ClassVar[MutantDict] = { # type: ignore
'x__r_ground__mutmut_1': x__r_ground__mutmut_1, 
    'x__r_ground__mutmut_2': x__r_ground__mutmut_2, 
    'x__r_ground__mutmut_3': x__r_ground__mutmut_3, 
    'x__r_ground__mutmut_4': x__r_ground__mutmut_4, 
    'x__r_ground__mutmut_5': x__r_ground__mutmut_5, 
    'x__r_ground__mutmut_6': x__r_ground__mutmut_6, 
    'x__r_ground__mutmut_7': x__r_ground__mutmut_7, 
    'x__r_ground__mutmut_8': x__r_ground__mutmut_8, 
    'x__r_ground__mutmut_9': x__r_ground__mutmut_9, 
    'x__r_ground__mutmut_10': x__r_ground__mutmut_10, 
    'x__r_ground__mutmut_11': x__r_ground__mutmut_11, 
    'x__r_ground__mutmut_12': x__r_ground__mutmut_12, 
    'x__r_ground__mutmut_13': x__r_ground__mutmut_13, 
    'x__r_ground__mutmut_14': x__r_ground__mutmut_14, 
    'x__r_ground__mutmut_15': x__r_ground__mutmut_15, 
    'x__r_ground__mutmut_16': x__r_ground__mutmut_16
}
x__r_ground__mutmut_orig.__name__ = 'x__r_ground'


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def calc_pipe_heat_loss(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    args = [params, coefficients]# type: ignore
    kwargs = {}# type: ignore
    return _mutmut_trampoline(x_calc_pipe_heat_loss__mutmut_orig, x_calc_pipe_heat_loss__mutmut_mutants, args, kwargs, None)


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_orig(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_1(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive(None, params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_2(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", None)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_3(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive(params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_4(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", )
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_5(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("XXНаружный диаметрXX", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_6(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_7(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("НАРУЖНЫЙ ДИАМЕТР", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_8(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive(None, params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_9(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", None)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_10(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive(params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_11(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", )
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_12(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("XXДлина трубыXX", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_13(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_14(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("ДЛИНА ТРУБЫ", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_15(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(None, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_16(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, None)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_17(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_18(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, )

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_19(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = None
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_20(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(None)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_21(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(None):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_22(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(None, layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_23(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", None)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_24(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_25(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", )

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_26(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i - 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_27(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 2}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_28(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = None
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_29(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature + params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_30(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = None
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_31(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) * 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_32(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature - params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_33(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 3.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_34(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = None

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_35(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter * 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_36(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 3.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_37(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = None
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_38(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 1.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_39(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_40(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = None

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_41(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=None,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_42(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=None,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_43(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=None,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_44(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=None,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_45(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=None,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_46(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_47(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_48(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_49(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_50(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_51(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = None

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_52(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(None, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_53(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, None, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_54(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, None)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_55(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_56(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_57(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, )

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_58(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = None

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_59(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(None)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_60(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = None
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_61(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = None

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_62(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None or burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_63(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_64(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth >= 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_65(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 1

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_66(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_67(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = None
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_68(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity and merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_69(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get(None, 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_70(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", None)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_71(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get(1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_72(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", )
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_73(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("XXground_conductivityXX", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_74(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("GROUND_CONDUCTIVITY", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_75(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 2.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_76(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = None
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_77(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(None, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_78(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, None, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_79(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, None)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_80(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_81(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_82(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, )
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_83(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = None
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_84(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_85(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(None, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_86(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, None)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_87(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_88(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, )
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_89(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = None
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_90(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get(None, 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_91(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", None)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_92(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get(1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_93(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", )
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_94(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("XXwind_factorXX", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_95(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("WIND_FACTOR", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_96(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 2.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_97(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k == 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_98(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 2.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_99(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = None
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_100(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(None, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_101(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, None)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_102(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_103(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, )
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_104(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha / wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_105(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 53.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_106(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = None

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_107(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(None, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_108(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, None)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_109(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_110(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, )

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_111(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = None

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_112(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins - r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_113(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall - r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_114(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = None

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_115(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t * r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_116(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = None
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_117(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements and 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_118(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 1
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_119(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = None
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_120(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length and 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_121(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 1.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_122(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = None

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_123(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length - n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_124(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i / l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_125(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = None

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_126(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor and merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_127(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get(None, 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_128(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", None)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_129(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get(1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_130(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", )

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_131(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("XXsafety_factorXX", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_132(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("SAFETY_FACTOR", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_133(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 2.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_134(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = None

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_135(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff / k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_136(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear / l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_137(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=None,
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_138(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=None,
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_139(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=None,
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_140(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=None,
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_141(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_142(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_143(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_144(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_145(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_146(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(None, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_147(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, None),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_148(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_149(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, ),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_150(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 4),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_151(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(None, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_152(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, None),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_153(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_154(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, ),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_155(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 4),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_156(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(None, 3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_157(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, None),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_158(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(3),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_159(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, ),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_160(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 4),
        thermal_resistance=round(r_total, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_161(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(None, 6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_162(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, None),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_163(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(6),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_164(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, ),
        surface_temperature=None,
    )


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------

def x_calc_pipe_heat_loss__mutmut_165(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult:
    """Расчёт тепловых потерь трубопровода (многослойная цилиндрическая стенка).

    Формула: закон Фурье для установившейся теплопроводности в цилиндрических
    координатах. Результат — линейный тепловой поток q [Вт/м] и полный поток Q [Вт]
    с учётом коэффициента запаса и локальных элементов (фланцы и пр.).

    Алгоритм:
        1. R_wall — сопротивление стенки трубы (если задана толщина)
        2. ΣR_ins — сумма сопротивлений слоёв изоляции (1–3 слоя)
        3. R_ext — внешнее сопротивление:
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            изоляции (layers или thickness+material), ΔT > 0, L > 0.
        coefficients: корректирующие коэффициенты (safety_factor, wind_factor,
            ground_conductivity). Приоритет: `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: `heat_loss_per_meter` (q без K), `total_heat_loss`
        (Q с K), `effective_length` (L_eff), `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        formules.md — формулы с численными примерами
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    delta_t = params.process_temperature - params.ambient_temperature
    t_mean = (params.process_temperature + params.ambient_temperature) / 2.0
    r_outer_pipe = params.outer_diameter / 2.0

    # --- 1. Сопротивление стенки трубы ---
    r_pipe_wall = 0.0
    if params.wall_thickness is not None:
        r_pipe_wall = _r_wall(
            r_outer_pipe=r_outer_pipe,
            wall_thickness=params.wall_thickness,
            t_mean=t_mean,
            material=params.pipe_material,
            lam_override=params.pipe_lambda,
        )

    # --- 2. Сопротивление слоёв изоляции ---
    r_ins, r_outer_total = _r_insulation_layers(r_outer_pipe, layers, t_mean)

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    burial_depth = params.burial_depth
    is_buried = burial_depth is not None and burial_depth > 0

    if is_buried:
        assert burial_depth is not None  # сужение типа для mypy
        lambda_gr = params.ground_conductivity or merged_coeffs.get("ground_conductivity", 1.5)
        r_external = _r_ground(r_outer_total, burial_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.location)
        )
        # Поправка на скорость ветра через коэффициент (обратная совместимость)
        wind_k = merged_coeffs.get("wind_factor", 1.0)
        if wind_k != 1.0:
            alpha = min(alpha * wind_k, 52.0)
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements or 0
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    return PipeHeatLossResult(
        heat_loss_per_meter=round(q_linear, 3),
        total_heat_loss=round(q_total, 3),
        effective_length=round(l_eff, 3),
        thermal_resistance=round(r_total, 7),
        surface_temperature=None,
    )

x_calc_pipe_heat_loss__mutmut_mutants : ClassVar[MutantDict] = { # type: ignore
'x_calc_pipe_heat_loss__mutmut_1': x_calc_pipe_heat_loss__mutmut_1, 
    'x_calc_pipe_heat_loss__mutmut_2': x_calc_pipe_heat_loss__mutmut_2, 
    'x_calc_pipe_heat_loss__mutmut_3': x_calc_pipe_heat_loss__mutmut_3, 
    'x_calc_pipe_heat_loss__mutmut_4': x_calc_pipe_heat_loss__mutmut_4, 
    'x_calc_pipe_heat_loss__mutmut_5': x_calc_pipe_heat_loss__mutmut_5, 
    'x_calc_pipe_heat_loss__mutmut_6': x_calc_pipe_heat_loss__mutmut_6, 
    'x_calc_pipe_heat_loss__mutmut_7': x_calc_pipe_heat_loss__mutmut_7, 
    'x_calc_pipe_heat_loss__mutmut_8': x_calc_pipe_heat_loss__mutmut_8, 
    'x_calc_pipe_heat_loss__mutmut_9': x_calc_pipe_heat_loss__mutmut_9, 
    'x_calc_pipe_heat_loss__mutmut_10': x_calc_pipe_heat_loss__mutmut_10, 
    'x_calc_pipe_heat_loss__mutmut_11': x_calc_pipe_heat_loss__mutmut_11, 
    'x_calc_pipe_heat_loss__mutmut_12': x_calc_pipe_heat_loss__mutmut_12, 
    'x_calc_pipe_heat_loss__mutmut_13': x_calc_pipe_heat_loss__mutmut_13, 
    'x_calc_pipe_heat_loss__mutmut_14': x_calc_pipe_heat_loss__mutmut_14, 
    'x_calc_pipe_heat_loss__mutmut_15': x_calc_pipe_heat_loss__mutmut_15, 
    'x_calc_pipe_heat_loss__mutmut_16': x_calc_pipe_heat_loss__mutmut_16, 
    'x_calc_pipe_heat_loss__mutmut_17': x_calc_pipe_heat_loss__mutmut_17, 
    'x_calc_pipe_heat_loss__mutmut_18': x_calc_pipe_heat_loss__mutmut_18, 
    'x_calc_pipe_heat_loss__mutmut_19': x_calc_pipe_heat_loss__mutmut_19, 
    'x_calc_pipe_heat_loss__mutmut_20': x_calc_pipe_heat_loss__mutmut_20, 
    'x_calc_pipe_heat_loss__mutmut_21': x_calc_pipe_heat_loss__mutmut_21, 
    'x_calc_pipe_heat_loss__mutmut_22': x_calc_pipe_heat_loss__mutmut_22, 
    'x_calc_pipe_heat_loss__mutmut_23': x_calc_pipe_heat_loss__mutmut_23, 
    'x_calc_pipe_heat_loss__mutmut_24': x_calc_pipe_heat_loss__mutmut_24, 
    'x_calc_pipe_heat_loss__mutmut_25': x_calc_pipe_heat_loss__mutmut_25, 
    'x_calc_pipe_heat_loss__mutmut_26': x_calc_pipe_heat_loss__mutmut_26, 
    'x_calc_pipe_heat_loss__mutmut_27': x_calc_pipe_heat_loss__mutmut_27, 
    'x_calc_pipe_heat_loss__mutmut_28': x_calc_pipe_heat_loss__mutmut_28, 
    'x_calc_pipe_heat_loss__mutmut_29': x_calc_pipe_heat_loss__mutmut_29, 
    'x_calc_pipe_heat_loss__mutmut_30': x_calc_pipe_heat_loss__mutmut_30, 
    'x_calc_pipe_heat_loss__mutmut_31': x_calc_pipe_heat_loss__mutmut_31, 
    'x_calc_pipe_heat_loss__mutmut_32': x_calc_pipe_heat_loss__mutmut_32, 
    'x_calc_pipe_heat_loss__mutmut_33': x_calc_pipe_heat_loss__mutmut_33, 
    'x_calc_pipe_heat_loss__mutmut_34': x_calc_pipe_heat_loss__mutmut_34, 
    'x_calc_pipe_heat_loss__mutmut_35': x_calc_pipe_heat_loss__mutmut_35, 
    'x_calc_pipe_heat_loss__mutmut_36': x_calc_pipe_heat_loss__mutmut_36, 
    'x_calc_pipe_heat_loss__mutmut_37': x_calc_pipe_heat_loss__mutmut_37, 
    'x_calc_pipe_heat_loss__mutmut_38': x_calc_pipe_heat_loss__mutmut_38, 
    'x_calc_pipe_heat_loss__mutmut_39': x_calc_pipe_heat_loss__mutmut_39, 
    'x_calc_pipe_heat_loss__mutmut_40': x_calc_pipe_heat_loss__mutmut_40, 
    'x_calc_pipe_heat_loss__mutmut_41': x_calc_pipe_heat_loss__mutmut_41, 
    'x_calc_pipe_heat_loss__mutmut_42': x_calc_pipe_heat_loss__mutmut_42, 
    'x_calc_pipe_heat_loss__mutmut_43': x_calc_pipe_heat_loss__mutmut_43, 
    'x_calc_pipe_heat_loss__mutmut_44': x_calc_pipe_heat_loss__mutmut_44, 
    'x_calc_pipe_heat_loss__mutmut_45': x_calc_pipe_heat_loss__mutmut_45, 
    'x_calc_pipe_heat_loss__mutmut_46': x_calc_pipe_heat_loss__mutmut_46, 
    'x_calc_pipe_heat_loss__mutmut_47': x_calc_pipe_heat_loss__mutmut_47, 
    'x_calc_pipe_heat_loss__mutmut_48': x_calc_pipe_heat_loss__mutmut_48, 
    'x_calc_pipe_heat_loss__mutmut_49': x_calc_pipe_heat_loss__mutmut_49, 
    'x_calc_pipe_heat_loss__mutmut_50': x_calc_pipe_heat_loss__mutmut_50, 
    'x_calc_pipe_heat_loss__mutmut_51': x_calc_pipe_heat_loss__mutmut_51, 
    'x_calc_pipe_heat_loss__mutmut_52': x_calc_pipe_heat_loss__mutmut_52, 
    'x_calc_pipe_heat_loss__mutmut_53': x_calc_pipe_heat_loss__mutmut_53, 
    'x_calc_pipe_heat_loss__mutmut_54': x_calc_pipe_heat_loss__mutmut_54, 
    'x_calc_pipe_heat_loss__mutmut_55': x_calc_pipe_heat_loss__mutmut_55, 
    'x_calc_pipe_heat_loss__mutmut_56': x_calc_pipe_heat_loss__mutmut_56, 
    'x_calc_pipe_heat_loss__mutmut_57': x_calc_pipe_heat_loss__mutmut_57, 
    'x_calc_pipe_heat_loss__mutmut_58': x_calc_pipe_heat_loss__mutmut_58, 
    'x_calc_pipe_heat_loss__mutmut_59': x_calc_pipe_heat_loss__mutmut_59, 
    'x_calc_pipe_heat_loss__mutmut_60': x_calc_pipe_heat_loss__mutmut_60, 
    'x_calc_pipe_heat_loss__mutmut_61': x_calc_pipe_heat_loss__mutmut_61, 
    'x_calc_pipe_heat_loss__mutmut_62': x_calc_pipe_heat_loss__mutmut_62, 
    'x_calc_pipe_heat_loss__mutmut_63': x_calc_pipe_heat_loss__mutmut_63, 
    'x_calc_pipe_heat_loss__mutmut_64': x_calc_pipe_heat_loss__mutmut_64, 
    'x_calc_pipe_heat_loss__mutmut_65': x_calc_pipe_heat_loss__mutmut_65, 
    'x_calc_pipe_heat_loss__mutmut_66': x_calc_pipe_heat_loss__mutmut_66, 
    'x_calc_pipe_heat_loss__mutmut_67': x_calc_pipe_heat_loss__mutmut_67, 
    'x_calc_pipe_heat_loss__mutmut_68': x_calc_pipe_heat_loss__mutmut_68, 
    'x_calc_pipe_heat_loss__mutmut_69': x_calc_pipe_heat_loss__mutmut_69, 
    'x_calc_pipe_heat_loss__mutmut_70': x_calc_pipe_heat_loss__mutmut_70, 
    'x_calc_pipe_heat_loss__mutmut_71': x_calc_pipe_heat_loss__mutmut_71, 
    'x_calc_pipe_heat_loss__mutmut_72': x_calc_pipe_heat_loss__mutmut_72, 
    'x_calc_pipe_heat_loss__mutmut_73': x_calc_pipe_heat_loss__mutmut_73, 
    'x_calc_pipe_heat_loss__mutmut_74': x_calc_pipe_heat_loss__mutmut_74, 
    'x_calc_pipe_heat_loss__mutmut_75': x_calc_pipe_heat_loss__mutmut_75, 
    'x_calc_pipe_heat_loss__mutmut_76': x_calc_pipe_heat_loss__mutmut_76, 
    'x_calc_pipe_heat_loss__mutmut_77': x_calc_pipe_heat_loss__mutmut_77, 
    'x_calc_pipe_heat_loss__mutmut_78': x_calc_pipe_heat_loss__mutmut_78, 
    'x_calc_pipe_heat_loss__mutmut_79': x_calc_pipe_heat_loss__mutmut_79, 
    'x_calc_pipe_heat_loss__mutmut_80': x_calc_pipe_heat_loss__mutmut_80, 
    'x_calc_pipe_heat_loss__mutmut_81': x_calc_pipe_heat_loss__mutmut_81, 
    'x_calc_pipe_heat_loss__mutmut_82': x_calc_pipe_heat_loss__mutmut_82, 
    'x_calc_pipe_heat_loss__mutmut_83': x_calc_pipe_heat_loss__mutmut_83, 
    'x_calc_pipe_heat_loss__mutmut_84': x_calc_pipe_heat_loss__mutmut_84, 
    'x_calc_pipe_heat_loss__mutmut_85': x_calc_pipe_heat_loss__mutmut_85, 
    'x_calc_pipe_heat_loss__mutmut_86': x_calc_pipe_heat_loss__mutmut_86, 
    'x_calc_pipe_heat_loss__mutmut_87': x_calc_pipe_heat_loss__mutmut_87, 
    'x_calc_pipe_heat_loss__mutmut_88': x_calc_pipe_heat_loss__mutmut_88, 
    'x_calc_pipe_heat_loss__mutmut_89': x_calc_pipe_heat_loss__mutmut_89, 
    'x_calc_pipe_heat_loss__mutmut_90': x_calc_pipe_heat_loss__mutmut_90, 
    'x_calc_pipe_heat_loss__mutmut_91': x_calc_pipe_heat_loss__mutmut_91, 
    'x_calc_pipe_heat_loss__mutmut_92': x_calc_pipe_heat_loss__mutmut_92, 
    'x_calc_pipe_heat_loss__mutmut_93': x_calc_pipe_heat_loss__mutmut_93, 
    'x_calc_pipe_heat_loss__mutmut_94': x_calc_pipe_heat_loss__mutmut_94, 
    'x_calc_pipe_heat_loss__mutmut_95': x_calc_pipe_heat_loss__mutmut_95, 
    'x_calc_pipe_heat_loss__mutmut_96': x_calc_pipe_heat_loss__mutmut_96, 
    'x_calc_pipe_heat_loss__mutmut_97': x_calc_pipe_heat_loss__mutmut_97, 
    'x_calc_pipe_heat_loss__mutmut_98': x_calc_pipe_heat_loss__mutmut_98, 
    'x_calc_pipe_heat_loss__mutmut_99': x_calc_pipe_heat_loss__mutmut_99, 
    'x_calc_pipe_heat_loss__mutmut_100': x_calc_pipe_heat_loss__mutmut_100, 
    'x_calc_pipe_heat_loss__mutmut_101': x_calc_pipe_heat_loss__mutmut_101, 
    'x_calc_pipe_heat_loss__mutmut_102': x_calc_pipe_heat_loss__mutmut_102, 
    'x_calc_pipe_heat_loss__mutmut_103': x_calc_pipe_heat_loss__mutmut_103, 
    'x_calc_pipe_heat_loss__mutmut_104': x_calc_pipe_heat_loss__mutmut_104, 
    'x_calc_pipe_heat_loss__mutmut_105': x_calc_pipe_heat_loss__mutmut_105, 
    'x_calc_pipe_heat_loss__mutmut_106': x_calc_pipe_heat_loss__mutmut_106, 
    'x_calc_pipe_heat_loss__mutmut_107': x_calc_pipe_heat_loss__mutmut_107, 
    'x_calc_pipe_heat_loss__mutmut_108': x_calc_pipe_heat_loss__mutmut_108, 
    'x_calc_pipe_heat_loss__mutmut_109': x_calc_pipe_heat_loss__mutmut_109, 
    'x_calc_pipe_heat_loss__mutmut_110': x_calc_pipe_heat_loss__mutmut_110, 
    'x_calc_pipe_heat_loss__mutmut_111': x_calc_pipe_heat_loss__mutmut_111, 
    'x_calc_pipe_heat_loss__mutmut_112': x_calc_pipe_heat_loss__mutmut_112, 
    'x_calc_pipe_heat_loss__mutmut_113': x_calc_pipe_heat_loss__mutmut_113, 
    'x_calc_pipe_heat_loss__mutmut_114': x_calc_pipe_heat_loss__mutmut_114, 
    'x_calc_pipe_heat_loss__mutmut_115': x_calc_pipe_heat_loss__mutmut_115, 
    'x_calc_pipe_heat_loss__mutmut_116': x_calc_pipe_heat_loss__mutmut_116, 
    'x_calc_pipe_heat_loss__mutmut_117': x_calc_pipe_heat_loss__mutmut_117, 
    'x_calc_pipe_heat_loss__mutmut_118': x_calc_pipe_heat_loss__mutmut_118, 
    'x_calc_pipe_heat_loss__mutmut_119': x_calc_pipe_heat_loss__mutmut_119, 
    'x_calc_pipe_heat_loss__mutmut_120': x_calc_pipe_heat_loss__mutmut_120, 
    'x_calc_pipe_heat_loss__mutmut_121': x_calc_pipe_heat_loss__mutmut_121, 
    'x_calc_pipe_heat_loss__mutmut_122': x_calc_pipe_heat_loss__mutmut_122, 
    'x_calc_pipe_heat_loss__mutmut_123': x_calc_pipe_heat_loss__mutmut_123, 
    'x_calc_pipe_heat_loss__mutmut_124': x_calc_pipe_heat_loss__mutmut_124, 
    'x_calc_pipe_heat_loss__mutmut_125': x_calc_pipe_heat_loss__mutmut_125, 
    'x_calc_pipe_heat_loss__mutmut_126': x_calc_pipe_heat_loss__mutmut_126, 
    'x_calc_pipe_heat_loss__mutmut_127': x_calc_pipe_heat_loss__mutmut_127, 
    'x_calc_pipe_heat_loss__mutmut_128': x_calc_pipe_heat_loss__mutmut_128, 
    'x_calc_pipe_heat_loss__mutmut_129': x_calc_pipe_heat_loss__mutmut_129, 
    'x_calc_pipe_heat_loss__mutmut_130': x_calc_pipe_heat_loss__mutmut_130, 
    'x_calc_pipe_heat_loss__mutmut_131': x_calc_pipe_heat_loss__mutmut_131, 
    'x_calc_pipe_heat_loss__mutmut_132': x_calc_pipe_heat_loss__mutmut_132, 
    'x_calc_pipe_heat_loss__mutmut_133': x_calc_pipe_heat_loss__mutmut_133, 
    'x_calc_pipe_heat_loss__mutmut_134': x_calc_pipe_heat_loss__mutmut_134, 
    'x_calc_pipe_heat_loss__mutmut_135': x_calc_pipe_heat_loss__mutmut_135, 
    'x_calc_pipe_heat_loss__mutmut_136': x_calc_pipe_heat_loss__mutmut_136, 
    'x_calc_pipe_heat_loss__mutmut_137': x_calc_pipe_heat_loss__mutmut_137, 
    'x_calc_pipe_heat_loss__mutmut_138': x_calc_pipe_heat_loss__mutmut_138, 
    'x_calc_pipe_heat_loss__mutmut_139': x_calc_pipe_heat_loss__mutmut_139, 
    'x_calc_pipe_heat_loss__mutmut_140': x_calc_pipe_heat_loss__mutmut_140, 
    'x_calc_pipe_heat_loss__mutmut_141': x_calc_pipe_heat_loss__mutmut_141, 
    'x_calc_pipe_heat_loss__mutmut_142': x_calc_pipe_heat_loss__mutmut_142, 
    'x_calc_pipe_heat_loss__mutmut_143': x_calc_pipe_heat_loss__mutmut_143, 
    'x_calc_pipe_heat_loss__mutmut_144': x_calc_pipe_heat_loss__mutmut_144, 
    'x_calc_pipe_heat_loss__mutmut_145': x_calc_pipe_heat_loss__mutmut_145, 
    'x_calc_pipe_heat_loss__mutmut_146': x_calc_pipe_heat_loss__mutmut_146, 
    'x_calc_pipe_heat_loss__mutmut_147': x_calc_pipe_heat_loss__mutmut_147, 
    'x_calc_pipe_heat_loss__mutmut_148': x_calc_pipe_heat_loss__mutmut_148, 
    'x_calc_pipe_heat_loss__mutmut_149': x_calc_pipe_heat_loss__mutmut_149, 
    'x_calc_pipe_heat_loss__mutmut_150': x_calc_pipe_heat_loss__mutmut_150, 
    'x_calc_pipe_heat_loss__mutmut_151': x_calc_pipe_heat_loss__mutmut_151, 
    'x_calc_pipe_heat_loss__mutmut_152': x_calc_pipe_heat_loss__mutmut_152, 
    'x_calc_pipe_heat_loss__mutmut_153': x_calc_pipe_heat_loss__mutmut_153, 
    'x_calc_pipe_heat_loss__mutmut_154': x_calc_pipe_heat_loss__mutmut_154, 
    'x_calc_pipe_heat_loss__mutmut_155': x_calc_pipe_heat_loss__mutmut_155, 
    'x_calc_pipe_heat_loss__mutmut_156': x_calc_pipe_heat_loss__mutmut_156, 
    'x_calc_pipe_heat_loss__mutmut_157': x_calc_pipe_heat_loss__mutmut_157, 
    'x_calc_pipe_heat_loss__mutmut_158': x_calc_pipe_heat_loss__mutmut_158, 
    'x_calc_pipe_heat_loss__mutmut_159': x_calc_pipe_heat_loss__mutmut_159, 
    'x_calc_pipe_heat_loss__mutmut_160': x_calc_pipe_heat_loss__mutmut_160, 
    'x_calc_pipe_heat_loss__mutmut_161': x_calc_pipe_heat_loss__mutmut_161, 
    'x_calc_pipe_heat_loss__mutmut_162': x_calc_pipe_heat_loss__mutmut_162, 
    'x_calc_pipe_heat_loss__mutmut_163': x_calc_pipe_heat_loss__mutmut_163, 
    'x_calc_pipe_heat_loss__mutmut_164': x_calc_pipe_heat_loss__mutmut_164, 
    'x_calc_pipe_heat_loss__mutmut_165': x_calc_pipe_heat_loss__mutmut_165
}
x_calc_pipe_heat_loss__mutmut_orig.__name__ = 'x_calc_pipe_heat_loss'
