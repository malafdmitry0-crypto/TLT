"""Геометрия укладки греющего кабеля на поверхности резервуаров.

Формула длины кабеля при укладке по периметру с шагом w_step и высотой h_укл:

    N = (perimeter / 2) × (heating_height / laying_step)   [м]

Периметр в зависимости от формы:
    - cylindrical:  perimeter = π × diameter
    - rectangular:  perimeter = 2 × (length + width)
"""

import math

LAYING_STEP_MIN = 0.1
LAYING_STEP_MAX = 0.4
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


def compute_tank_cable_length(
    *,
    shape: str,
    diameter: float | None = None,
    length: float | None = None,
    width: float | None = None,
    heating_height: float,
    laying_step: float,
) -> float:
    args = []# type: ignore
    kwargs = {'shape': shape, 'diameter': diameter, 'length': length, 'width': width, 'heating_height': heating_height, 'laying_step': laying_step}# type: ignore
    return _mutmut_trampoline(x_compute_tank_cable_length__mutmut_orig, x_compute_tank_cable_length__mutmut_mutants, args, kwargs, None)


def x_compute_tank_cable_length__mutmut_orig(
    *,
    shape: str,
    diameter: float | None = None,
    length: float | None = None,
    width: float | None = None,
    heating_height: float,
    laying_step: float,
) -> float:
    """Длина греющего кабеля для укладки на поверхность резервуара.

    Args:
        shape: 'cylindrical' или 'rectangular'
        diameter: для цилиндра — диаметр, м (>0)
        length, width: для прямоугольника — длина и ширина основания, м (>0)
        heating_height: высота зоны обогрева h_укл, м (>0)
        laying_step: шаг укладки w_step, м (0.1–0.4)

    Returns:
        Длина кабеля N, м.

    Raises:
        ValueError: если параметры некорректны или форма не поддерживается.
    """
    if heating_height <= 0:
        raise ValueError(f"heating_height должна быть > 0, получено {heating_height}")
    if not (LAYING_STEP_MIN <= laying_step <= LAYING_STEP_MAX):
        raise ValueError(
            f"laying_step должен быть в диапазоне {LAYING_STEP_MIN}–{LAYING_STEP_MAX} м, "
            f"получено {laying_step}"
        )

    if shape == "cylindrical":
        if diameter is None or diameter <= 0:
            raise ValueError("Для цилиндра требуется diameter > 0")
        perimeter = math.pi * diameter
    elif shape == "rectangular":
        if length is None or length <= 0 or width is None or width <= 0:
            raise ValueError("Для прямоугольника требуются length и width > 0")
        perimeter = 2.0 * (length + width)
    else:
        raise ValueError(
            f"Укладка кабеля не поддерживается для формы '{shape}'. "
            "Допустимы только cylindrical и rectangular."
        )

    return (perimeter / 2.0) * (heating_height / laying_step)


def x_compute_tank_cable_length__mutmut_1(
    *,
    shape: str,
    diameter: float | None = None,
    length: float | None = None,
    width: float | None = None,
    heating_height: float,
    laying_step: float,
) -> float:
    """Длина греющего кабеля для укладки на поверхность резервуара.

    Args:
        shape: 'cylindrical' или 'rectangular'
        diameter: для цилиндра — диаметр, м (>0)
        length, width: для прямоугольника — длина и ширина основания, м (>0)
        heating_height: высота зоны обогрева h_укл, м (>0)
        laying_step: шаг укладки w_step, м (0.1–0.4)

    Returns:
        Длина кабеля N, м.

    Raises:
        ValueError: если параметры некорректны или форма не поддерживается.
    """
    if heating_height < 0:
        raise ValueError(f"heating_height должна быть > 0, получено {heating_height}")
    if not (LAYING_STEP_MIN <= laying_step <= LAYING_STEP_MAX):
        raise ValueError(
            f"laying_step должен быть в диапазоне {LAYING_STEP_MIN}–{LAYING_STEP_MAX} м, "
            f"получено {laying_step}"
        )

    if shape == "cylindrical":
        if diameter is None or diameter <= 0:
            raise ValueError("Для цилиндра требуется diameter > 0")
        perimeter = math.pi * diameter
    elif shape == "rectangular":
        if length is None or length <= 0 or width is None or width <= 0:
            raise ValueError("Для прямоугольника требуются length и width > 0")
        perimeter = 2.0 * (length + width)
    else:
        raise ValueError(
            f"Укладка кабеля не поддерживается для формы '{shape}'. "
            "Допустимы только cylindrical и rectangular."
        )

    return (perimeter / 2.0) * (heating_height / laying_step)


def x_compute_tank_cable_length__mutmut_2(
    *,
    shape: str,
    diameter: float | None = None,
    length: float | None = None,
    width: float | None = None,
    heating_height: float,
    laying_step: float,
) -> float:
    """Длина греющего кабеля для укладки на поверхность резервуара.

    Args:
        shape: 'cylindrical' или 'rectangular'
        diameter: для цилиндра — диаметр, м (>0)
        length, width: для прямоугольника — длина и ширина основания, м (>0)
        heating_height: высота зоны обогрева h_укл, м (>0)
        laying_step: шаг укладки w_step, м (0.1–0.4)

    Returns:
        Длина кабеля N, м.

    Raises:
        ValueError: если параметры некорректны или форма не поддерживается.
    """
    if heating_height <= 1:
        raise ValueError(f"heating_height должна быть > 0, получено {heating_height}")
    if not (LAYING_STEP_MIN <= laying_step <= LAYING_STEP_MAX):
        raise ValueError(
            f"laying_step должен быть в диапазоне {LAYING_STEP_MIN}–{LAYING_STEP_MAX} м, "
            f"получено {laying_step}"
        )

    if shape == "cylindrical":
        if diameter is None or diameter <= 0:
            raise ValueError("Для цилиндра требуется diameter > 0")
        perimeter = math.pi * diameter
    elif shape == "rectangular":
        if length is None or length <= 0 or width is None or width <= 0:
            raise ValueError("Для прямоугольника требуются length и width > 0")
        perimeter = 2.0 * (length + width)
    else:
        raise ValueError(
            f"Укладка кабеля не поддерживается для формы '{shape}'. "
            "Допустимы только cylindrical и rectangular."
        )

    return (perimeter / 2.0) * (heating_height / laying_step)


def x_compute_tank_cable_length__mutmut_3(
    *,
    shape: str,
    diameter: float | None = None,
    length: float | None = None,
    width: float | None = None,
    heating_height: float,
    laying_step: float,
) -> float:
    """Длина греющего кабеля для укладки на поверхность резервуара.

    Args:
        shape: 'cylindrical' или 'rectangular'
        diameter: для цилиндра — диаметр, м (>0)
        length, width: для прямоугольника — длина и ширина основания, м (>0)
        heating_height: высота зоны обогрева h_укл, м (>0)
        laying_step: шаг укладки w_step, м (0.1–0.4)

    Returns:
        Длина кабеля N, м.

    Raises:
        ValueError: если параметры некорректны или форма не поддерживается.
    """
    if heating_height <= 0:
        raise ValueError(None)
    if not (LAYING_STEP_MIN <= laying_step <= LAYING_STEP_MAX):
        raise ValueError(
            f"laying_step должен быть в диапазоне {LAYING_STEP_MIN}–{LAYING_STEP_MAX} м, "
            f"получено {laying_step}"
        )

    if shape == "cylindrical":
        if diameter is None or diameter <= 0:
            raise ValueError("Для цилиндра требуется diameter > 0")
        perimeter = math.pi * diameter
    elif shape == "rectangular":
        if length is None or length <= 0 or width is None or width <= 0:
            raise ValueError("Для прямоугольника требуются length и width > 0")
        perimeter = 2.0 * (length + width)
    else:
        raise ValueError(
            f"Укладка кабеля не поддерживается для формы '{shape}'. "
            "Допустимы только cylindrical и rectangular."
        )

    return (perimeter / 2.0) * (heating_height / laying_step)


def x_compute_tank_cable_length__mutmut_4(
    *,
    shape: str,
    diameter: float | None = None,
    length: float | None = None,
    width: float | None = None,
    heating_height: float,
    laying_step: float,
) -> float:
    """Длина греющего кабеля для укладки на поверхность резервуара.

    Args:
        shape: 'cylindrical' или 'rectangular'
        diameter: для цилиндра — диаметр, м (>0)
        length, width: для прямоугольника — длина и ширина основания, м (>0)
        heating_height: высота зоны обогрева h_укл, м (>0)
        laying_step: шаг укладки w_step, м (0.1–0.4)

    Returns:
        Длина кабеля N, м.

    Raises:
        ValueError: если параметры некорректны или форма не поддерживается.
    """
    if heating_height <= 0:
        raise ValueError(f"heating_height должна быть > 0, получено {heating_height}")
    if (LAYING_STEP_MIN <= laying_step <= LAYING_STEP_MAX):
        raise ValueError(
            f"laying_step должен быть в диапазоне {LAYING_STEP_MIN}–{LAYING_STEP_MAX} м, "
            f"получено {laying_step}"
        )

    if shape == "cylindrical":
        if diameter is None or diameter <= 0:
            raise ValueError("Для цилиндра требуется diameter > 0")
        perimeter = math.pi * diameter
    elif shape == "rectangular":
        if length is None or length <= 0 or width is None or width <= 0:
            raise ValueError("Для прямоугольника требуются length и width > 0")
        perimeter = 2.0 * (length + width)
    else:
        raise ValueError(
            f"Укладка кабеля не поддерживается для формы '{shape}'. "
            "Допустимы только cylindrical и rectangular."
        )

    return (perimeter / 2.0) * (heating_height / laying_step)


def x_compute_tank_cable_length__mutmut_5(
    *,
    shape: str,
    diameter: float | None = None,
    length: float | None = None,
    width: float | None = None,
    heating_height: float,
    laying_step: float,
) -> float:
    """Длина греющего кабеля для укладки на поверхность резервуара.

    Args:
        shape: 'cylindrical' или 'rectangular'
        diameter: для цилиндра — диаметр, м (>0)
        length, width: для прямоугольника — длина и ширина основания, м (>0)
        heating_height: высота зоны обогрева h_укл, м (>0)
        laying_step: шаг укладки w_step, м (0.1–0.4)

    Returns:
        Длина кабеля N, м.

    Raises:
        ValueError: если параметры некорректны или форма не поддерживается.
    """
    if heating_height <= 0:
        raise ValueError(f"heating_height должна быть > 0, получено {heating_height}")
    if not (LAYING_STEP_MIN < laying_step <= LAYING_STEP_MAX):
        raise ValueError(
            f"laying_step должен быть в диапазоне {LAYING_STEP_MIN}–{LAYING_STEP_MAX} м, "
            f"получено {laying_step}"
        )

    if shape == "cylindrical":
        if diameter is None or diameter <= 0:
            raise ValueError("Для цилиндра требуется diameter > 0")
        perimeter = math.pi * diameter
    elif shape == "rectangular":
        if length is None or length <= 0 or width is None or width <= 0:
            raise ValueError("Для прямоугольника требуются length и width > 0")
        perimeter = 2.0 * (length + width)
    else:
        raise ValueError(
            f"Укладка кабеля не поддерживается для формы '{shape}'. "
            "Допустимы только cylindrical и rectangular."
        )

    return (perimeter / 2.0) * (heating_height / laying_step)


def x_compute_tank_cable_length__mutmut_6(
    *,
    shape: str,
    diameter: float | None = None,
    length: float | None = None,
    width: float | None = None,
    heating_height: float,
    laying_step: float,
) -> float:
    """Длина греющего кабеля для укладки на поверхность резервуара.

    Args:
        shape: 'cylindrical' или 'rectangular'
        diameter: для цилиндра — диаметр, м (>0)
        length, width: для прямоугольника — длина и ширина основания, м (>0)
        heating_height: высота зоны обогрева h_укл, м (>0)
        laying_step: шаг укладки w_step, м (0.1–0.4)

    Returns:
        Длина кабеля N, м.

    Raises:
        ValueError: если параметры некорректны или форма не поддерживается.
    """
    if heating_height <= 0:
        raise ValueError(f"heating_height должна быть > 0, получено {heating_height}")
    if not (LAYING_STEP_MIN <= laying_step < LAYING_STEP_MAX):
        raise ValueError(
            f"laying_step должен быть в диапазоне {LAYING_STEP_MIN}–{LAYING_STEP_MAX} м, "
            f"получено {laying_step}"
        )

    if shape == "cylindrical":
        if diameter is None or diameter <= 0:
            raise ValueError("Для цилиндра требуется diameter > 0")
        perimeter = math.pi * diameter
    elif shape == "rectangular":
        if length is None or length <= 0 or width is None or width <= 0:
            raise ValueError("Для прямоугольника требуются length и width > 0")
        perimeter = 2.0 * (length + width)
    else:
        raise ValueError(
            f"Укладка кабеля не поддерживается для формы '{shape}'. "
            "Допустимы только cylindrical и rectangular."
        )

    return (perimeter / 2.0) * (heating_height / laying_step)


def x_compute_tank_cable_length__mutmut_7(
    *,
    shape: str,
    diameter: float | None = None,
    length: float | None = None,
    width: float | None = None,
    heating_height: float,
    laying_step: float,
) -> float:
    """Длина греющего кабеля для укладки на поверхность резервуара.

    Args:
        shape: 'cylindrical' или 'rectangular'
        diameter: для цилиндра — диаметр, м (>0)
        length, width: для прямоугольника — длина и ширина основания, м (>0)
        heating_height: высота зоны обогрева h_укл, м (>0)
        laying_step: шаг укладки w_step, м (0.1–0.4)

    Returns:
        Длина кабеля N, м.

    Raises:
        ValueError: если параметры некорректны или форма не поддерживается.
    """
    if heating_height <= 0:
        raise ValueError(f"heating_height должна быть > 0, получено {heating_height}")
    if not (LAYING_STEP_MIN <= laying_step <= LAYING_STEP_MAX):
        raise ValueError(
            None
        )

    if shape == "cylindrical":
        if diameter is None or diameter <= 0:
            raise ValueError("Для цилиндра требуется diameter > 0")
        perimeter = math.pi * diameter
    elif shape == "rectangular":
        if length is None or length <= 0 or width is None or width <= 0:
            raise ValueError("Для прямоугольника требуются length и width > 0")
        perimeter = 2.0 * (length + width)
    else:
        raise ValueError(
            f"Укладка кабеля не поддерживается для формы '{shape}'. "
            "Допустимы только cylindrical и rectangular."
        )

    return (perimeter / 2.0) * (heating_height / laying_step)


def x_compute_tank_cable_length__mutmut_8(
    *,
    shape: str,
    diameter: float | None = None,
    length: float | None = None,
    width: float | None = None,
    heating_height: float,
    laying_step: float,
) -> float:
    """Длина греющего кабеля для укладки на поверхность резервуара.

    Args:
        shape: 'cylindrical' или 'rectangular'
        diameter: для цилиндра — диаметр, м (>0)
        length, width: для прямоугольника — длина и ширина основания, м (>0)
        heating_height: высота зоны обогрева h_укл, м (>0)
        laying_step: шаг укладки w_step, м (0.1–0.4)

    Returns:
        Длина кабеля N, м.

    Raises:
        ValueError: если параметры некорректны или форма не поддерживается.
    """
    if heating_height <= 0:
        raise ValueError(f"heating_height должна быть > 0, получено {heating_height}")
    if not (LAYING_STEP_MIN <= laying_step <= LAYING_STEP_MAX):
        raise ValueError(
            f"laying_step должен быть в диапазоне {LAYING_STEP_MIN}–{LAYING_STEP_MAX} м, "
            f"получено {laying_step}"
        )

    if shape != "cylindrical":
        if diameter is None or diameter <= 0:
            raise ValueError("Для цилиндра требуется diameter > 0")
        perimeter = math.pi * diameter
    elif shape == "rectangular":
        if length is None or length <= 0 or width is None or width <= 0:
            raise ValueError("Для прямоугольника требуются length и width > 0")
        perimeter = 2.0 * (length + width)
    else:
        raise ValueError(
            f"Укладка кабеля не поддерживается для формы '{shape}'. "
            "Допустимы только cylindrical и rectangular."
        )

    return (perimeter / 2.0) * (heating_height / laying_step)


def x_compute_tank_cable_length__mutmut_9(
    *,
    shape: str,
    diameter: float | None = None,
    length: float | None = None,
    width: float | None = None,
    heating_height: float,
    laying_step: float,
) -> float:
    """Длина греющего кабеля для укладки на поверхность резервуара.

    Args:
        shape: 'cylindrical' или 'rectangular'
        diameter: для цилиндра — диаметр, м (>0)
        length, width: для прямоугольника — длина и ширина основания, м (>0)
        heating_height: высота зоны обогрева h_укл, м (>0)
        laying_step: шаг укладки w_step, м (0.1–0.4)

    Returns:
        Длина кабеля N, м.

    Raises:
        ValueError: если параметры некорректны или форма не поддерживается.
    """
    if heating_height <= 0:
        raise ValueError(f"heating_height должна быть > 0, получено {heating_height}")
    if not (LAYING_STEP_MIN <= laying_step <= LAYING_STEP_MAX):
        raise ValueError(
            f"laying_step должен быть в диапазоне {LAYING_STEP_MIN}–{LAYING_STEP_MAX} м, "
            f"получено {laying_step}"
        )

    if shape == "XXcylindricalXX":
        if diameter is None or diameter <= 0:
            raise ValueError("Для цилиндра требуется diameter > 0")
        perimeter = math.pi * diameter
    elif shape == "rectangular":
        if length is None or length <= 0 or width is None or width <= 0:
            raise ValueError("Для прямоугольника требуются length и width > 0")
        perimeter = 2.0 * (length + width)
    else:
        raise ValueError(
            f"Укладка кабеля не поддерживается для формы '{shape}'. "
            "Допустимы только cylindrical и rectangular."
        )

    return (perimeter / 2.0) * (heating_height / laying_step)


def x_compute_tank_cable_length__mutmut_10(
    *,
    shape: str,
    diameter: float | None = None,
    length: float | None = None,
    width: float | None = None,
    heating_height: float,
    laying_step: float,
) -> float:
    """Длина греющего кабеля для укладки на поверхность резервуара.

    Args:
        shape: 'cylindrical' или 'rectangular'
        diameter: для цилиндра — диаметр, м (>0)
        length, width: для прямоугольника — длина и ширина основания, м (>0)
        heating_height: высота зоны обогрева h_укл, м (>0)
        laying_step: шаг укладки w_step, м (0.1–0.4)

    Returns:
        Длина кабеля N, м.

    Raises:
        ValueError: если параметры некорректны или форма не поддерживается.
    """
    if heating_height <= 0:
        raise ValueError(f"heating_height должна быть > 0, получено {heating_height}")
    if not (LAYING_STEP_MIN <= laying_step <= LAYING_STEP_MAX):
        raise ValueError(
            f"laying_step должен быть в диапазоне {LAYING_STEP_MIN}–{LAYING_STEP_MAX} м, "
            f"получено {laying_step}"
        )

    if shape == "CYLINDRICAL":
        if diameter is None or diameter <= 0:
            raise ValueError("Для цилиндра требуется diameter > 0")
        perimeter = math.pi * diameter
    elif shape == "rectangular":
        if length is None or length <= 0 or width is None or width <= 0:
            raise ValueError("Для прямоугольника требуются length и width > 0")
        perimeter = 2.0 * (length + width)
    else:
        raise ValueError(
            f"Укладка кабеля не поддерживается для формы '{shape}'. "
            "Допустимы только cylindrical и rectangular."
        )

    return (perimeter / 2.0) * (heating_height / laying_step)


def x_compute_tank_cable_length__mutmut_11(
    *,
    shape: str,
    diameter: float | None = None,
    length: float | None = None,
    width: float | None = None,
    heating_height: float,
    laying_step: float,
) -> float:
    """Длина греющего кабеля для укладки на поверхность резервуара.

    Args:
        shape: 'cylindrical' или 'rectangular'
        diameter: для цилиндра — диаметр, м (>0)
        length, width: для прямоугольника — длина и ширина основания, м (>0)
        heating_height: высота зоны обогрева h_укл, м (>0)
        laying_step: шаг укладки w_step, м (0.1–0.4)

    Returns:
        Длина кабеля N, м.

    Raises:
        ValueError: если параметры некорректны или форма не поддерживается.
    """
    if heating_height <= 0:
        raise ValueError(f"heating_height должна быть > 0, получено {heating_height}")
    if not (LAYING_STEP_MIN <= laying_step <= LAYING_STEP_MAX):
        raise ValueError(
            f"laying_step должен быть в диапазоне {LAYING_STEP_MIN}–{LAYING_STEP_MAX} м, "
            f"получено {laying_step}"
        )

    if shape == "cylindrical":
        if diameter is None and diameter <= 0:
            raise ValueError("Для цилиндра требуется diameter > 0")
        perimeter = math.pi * diameter
    elif shape == "rectangular":
        if length is None or length <= 0 or width is None or width <= 0:
            raise ValueError("Для прямоугольника требуются length и width > 0")
        perimeter = 2.0 * (length + width)
    else:
        raise ValueError(
            f"Укладка кабеля не поддерживается для формы '{shape}'. "
            "Допустимы только cylindrical и rectangular."
        )

    return (perimeter / 2.0) * (heating_height / laying_step)


def x_compute_tank_cable_length__mutmut_12(
    *,
    shape: str,
    diameter: float | None = None,
    length: float | None = None,
    width: float | None = None,
    heating_height: float,
    laying_step: float,
) -> float:
    """Длина греющего кабеля для укладки на поверхность резервуара.

    Args:
        shape: 'cylindrical' или 'rectangular'
        diameter: для цилиндра — диаметр, м (>0)
        length, width: для прямоугольника — длина и ширина основания, м (>0)
        heating_height: высота зоны обогрева h_укл, м (>0)
        laying_step: шаг укладки w_step, м (0.1–0.4)

    Returns:
        Длина кабеля N, м.

    Raises:
        ValueError: если параметры некорректны или форма не поддерживается.
    """
    if heating_height <= 0:
        raise ValueError(f"heating_height должна быть > 0, получено {heating_height}")
    if not (LAYING_STEP_MIN <= laying_step <= LAYING_STEP_MAX):
        raise ValueError(
            f"laying_step должен быть в диапазоне {LAYING_STEP_MIN}–{LAYING_STEP_MAX} м, "
            f"получено {laying_step}"
        )

    if shape == "cylindrical":
        if diameter is not None or diameter <= 0:
            raise ValueError("Для цилиндра требуется diameter > 0")
        perimeter = math.pi * diameter
    elif shape == "rectangular":
        if length is None or length <= 0 or width is None or width <= 0:
            raise ValueError("Для прямоугольника требуются length и width > 0")
        perimeter = 2.0 * (length + width)
    else:
        raise ValueError(
            f"Укладка кабеля не поддерживается для формы '{shape}'. "
            "Допустимы только cylindrical и rectangular."
        )

    return (perimeter / 2.0) * (heating_height / laying_step)


def x_compute_tank_cable_length__mutmut_13(
    *,
    shape: str,
    diameter: float | None = None,
    length: float | None = None,
    width: float | None = None,
    heating_height: float,
    laying_step: float,
) -> float:
    """Длина греющего кабеля для укладки на поверхность резервуара.

    Args:
        shape: 'cylindrical' или 'rectangular'
        diameter: для цилиндра — диаметр, м (>0)
        length, width: для прямоугольника — длина и ширина основания, м (>0)
        heating_height: высота зоны обогрева h_укл, м (>0)
        laying_step: шаг укладки w_step, м (0.1–0.4)

    Returns:
        Длина кабеля N, м.

    Raises:
        ValueError: если параметры некорректны или форма не поддерживается.
    """
    if heating_height <= 0:
        raise ValueError(f"heating_height должна быть > 0, получено {heating_height}")
    if not (LAYING_STEP_MIN <= laying_step <= LAYING_STEP_MAX):
        raise ValueError(
            f"laying_step должен быть в диапазоне {LAYING_STEP_MIN}–{LAYING_STEP_MAX} м, "
            f"получено {laying_step}"
        )

    if shape == "cylindrical":
        if diameter is None or diameter < 0:
            raise ValueError("Для цилиндра требуется diameter > 0")
        perimeter = math.pi * diameter
    elif shape == "rectangular":
        if length is None or length <= 0 or width is None or width <= 0:
            raise ValueError("Для прямоугольника требуются length и width > 0")
        perimeter = 2.0 * (length + width)
    else:
        raise ValueError(
            f"Укладка кабеля не поддерживается для формы '{shape}'. "
            "Допустимы только cylindrical и rectangular."
        )

    return (perimeter / 2.0) * (heating_height / laying_step)


def x_compute_tank_cable_length__mutmut_14(
    *,
    shape: str,
    diameter: float | None = None,
    length: float | None = None,
    width: float | None = None,
    heating_height: float,
    laying_step: float,
) -> float:
    """Длина греющего кабеля для укладки на поверхность резервуара.

    Args:
        shape: 'cylindrical' или 'rectangular'
        diameter: для цилиндра — диаметр, м (>0)
        length, width: для прямоугольника — длина и ширина основания, м (>0)
        heating_height: высота зоны обогрева h_укл, м (>0)
        laying_step: шаг укладки w_step, м (0.1–0.4)

    Returns:
        Длина кабеля N, м.

    Raises:
        ValueError: если параметры некорректны или форма не поддерживается.
    """
    if heating_height <= 0:
        raise ValueError(f"heating_height должна быть > 0, получено {heating_height}")
    if not (LAYING_STEP_MIN <= laying_step <= LAYING_STEP_MAX):
        raise ValueError(
            f"laying_step должен быть в диапазоне {LAYING_STEP_MIN}–{LAYING_STEP_MAX} м, "
            f"получено {laying_step}"
        )

    if shape == "cylindrical":
        if diameter is None or diameter <= 1:
            raise ValueError("Для цилиндра требуется diameter > 0")
        perimeter = math.pi * diameter
    elif shape == "rectangular":
        if length is None or length <= 0 or width is None or width <= 0:
            raise ValueError("Для прямоугольника требуются length и width > 0")
        perimeter = 2.0 * (length + width)
    else:
        raise ValueError(
            f"Укладка кабеля не поддерживается для формы '{shape}'. "
            "Допустимы только cylindrical и rectangular."
        )

    return (perimeter / 2.0) * (heating_height / laying_step)


def x_compute_tank_cable_length__mutmut_15(
    *,
    shape: str,
    diameter: float | None = None,
    length: float | None = None,
    width: float | None = None,
    heating_height: float,
    laying_step: float,
) -> float:
    """Длина греющего кабеля для укладки на поверхность резервуара.

    Args:
        shape: 'cylindrical' или 'rectangular'
        diameter: для цилиндра — диаметр, м (>0)
        length, width: для прямоугольника — длина и ширина основания, м (>0)
        heating_height: высота зоны обогрева h_укл, м (>0)
        laying_step: шаг укладки w_step, м (0.1–0.4)

    Returns:
        Длина кабеля N, м.

    Raises:
        ValueError: если параметры некорректны или форма не поддерживается.
    """
    if heating_height <= 0:
        raise ValueError(f"heating_height должна быть > 0, получено {heating_height}")
    if not (LAYING_STEP_MIN <= laying_step <= LAYING_STEP_MAX):
        raise ValueError(
            f"laying_step должен быть в диапазоне {LAYING_STEP_MIN}–{LAYING_STEP_MAX} м, "
            f"получено {laying_step}"
        )

    if shape == "cylindrical":
        if diameter is None or diameter <= 0:
            raise ValueError(None)
        perimeter = math.pi * diameter
    elif shape == "rectangular":
        if length is None or length <= 0 or width is None or width <= 0:
            raise ValueError("Для прямоугольника требуются length и width > 0")
        perimeter = 2.0 * (length + width)
    else:
        raise ValueError(
            f"Укладка кабеля не поддерживается для формы '{shape}'. "
            "Допустимы только cylindrical и rectangular."
        )

    return (perimeter / 2.0) * (heating_height / laying_step)


def x_compute_tank_cable_length__mutmut_16(
    *,
    shape: str,
    diameter: float | None = None,
    length: float | None = None,
    width: float | None = None,
    heating_height: float,
    laying_step: float,
) -> float:
    """Длина греющего кабеля для укладки на поверхность резервуара.

    Args:
        shape: 'cylindrical' или 'rectangular'
        diameter: для цилиндра — диаметр, м (>0)
        length, width: для прямоугольника — длина и ширина основания, м (>0)
        heating_height: высота зоны обогрева h_укл, м (>0)
        laying_step: шаг укладки w_step, м (0.1–0.4)

    Returns:
        Длина кабеля N, м.

    Raises:
        ValueError: если параметры некорректны или форма не поддерживается.
    """
    if heating_height <= 0:
        raise ValueError(f"heating_height должна быть > 0, получено {heating_height}")
    if not (LAYING_STEP_MIN <= laying_step <= LAYING_STEP_MAX):
        raise ValueError(
            f"laying_step должен быть в диапазоне {LAYING_STEP_MIN}–{LAYING_STEP_MAX} м, "
            f"получено {laying_step}"
        )

    if shape == "cylindrical":
        if diameter is None or diameter <= 0:
            raise ValueError("XXДля цилиндра требуется diameter > 0XX")
        perimeter = math.pi * diameter
    elif shape == "rectangular":
        if length is None or length <= 0 or width is None or width <= 0:
            raise ValueError("Для прямоугольника требуются length и width > 0")
        perimeter = 2.0 * (length + width)
    else:
        raise ValueError(
            f"Укладка кабеля не поддерживается для формы '{shape}'. "
            "Допустимы только cylindrical и rectangular."
        )

    return (perimeter / 2.0) * (heating_height / laying_step)


def x_compute_tank_cable_length__mutmut_17(
    *,
    shape: str,
    diameter: float | None = None,
    length: float | None = None,
    width: float | None = None,
    heating_height: float,
    laying_step: float,
) -> float:
    """Длина греющего кабеля для укладки на поверхность резервуара.

    Args:
        shape: 'cylindrical' или 'rectangular'
        diameter: для цилиндра — диаметр, м (>0)
        length, width: для прямоугольника — длина и ширина основания, м (>0)
        heating_height: высота зоны обогрева h_укл, м (>0)
        laying_step: шаг укладки w_step, м (0.1–0.4)

    Returns:
        Длина кабеля N, м.

    Raises:
        ValueError: если параметры некорректны или форма не поддерживается.
    """
    if heating_height <= 0:
        raise ValueError(f"heating_height должна быть > 0, получено {heating_height}")
    if not (LAYING_STEP_MIN <= laying_step <= LAYING_STEP_MAX):
        raise ValueError(
            f"laying_step должен быть в диапазоне {LAYING_STEP_MIN}–{LAYING_STEP_MAX} м, "
            f"получено {laying_step}"
        )

    if shape == "cylindrical":
        if diameter is None or diameter <= 0:
            raise ValueError("для цилиндра требуется diameter > 0")
        perimeter = math.pi * diameter
    elif shape == "rectangular":
        if length is None or length <= 0 or width is None or width <= 0:
            raise ValueError("Для прямоугольника требуются length и width > 0")
        perimeter = 2.0 * (length + width)
    else:
        raise ValueError(
            f"Укладка кабеля не поддерживается для формы '{shape}'. "
            "Допустимы только cylindrical и rectangular."
        )

    return (perimeter / 2.0) * (heating_height / laying_step)


def x_compute_tank_cable_length__mutmut_18(
    *,
    shape: str,
    diameter: float | None = None,
    length: float | None = None,
    width: float | None = None,
    heating_height: float,
    laying_step: float,
) -> float:
    """Длина греющего кабеля для укладки на поверхность резервуара.

    Args:
        shape: 'cylindrical' или 'rectangular'
        diameter: для цилиндра — диаметр, м (>0)
        length, width: для прямоугольника — длина и ширина основания, м (>0)
        heating_height: высота зоны обогрева h_укл, м (>0)
        laying_step: шаг укладки w_step, м (0.1–0.4)

    Returns:
        Длина кабеля N, м.

    Raises:
        ValueError: если параметры некорректны или форма не поддерживается.
    """
    if heating_height <= 0:
        raise ValueError(f"heating_height должна быть > 0, получено {heating_height}")
    if not (LAYING_STEP_MIN <= laying_step <= LAYING_STEP_MAX):
        raise ValueError(
            f"laying_step должен быть в диапазоне {LAYING_STEP_MIN}–{LAYING_STEP_MAX} м, "
            f"получено {laying_step}"
        )

    if shape == "cylindrical":
        if diameter is None or diameter <= 0:
            raise ValueError("ДЛЯ ЦИЛИНДРА ТРЕБУЕТСЯ DIAMETER > 0")
        perimeter = math.pi * diameter
    elif shape == "rectangular":
        if length is None or length <= 0 or width is None or width <= 0:
            raise ValueError("Для прямоугольника требуются length и width > 0")
        perimeter = 2.0 * (length + width)
    else:
        raise ValueError(
            f"Укладка кабеля не поддерживается для формы '{shape}'. "
            "Допустимы только cylindrical и rectangular."
        )

    return (perimeter / 2.0) * (heating_height / laying_step)


def x_compute_tank_cable_length__mutmut_19(
    *,
    shape: str,
    diameter: float | None = None,
    length: float | None = None,
    width: float | None = None,
    heating_height: float,
    laying_step: float,
) -> float:
    """Длина греющего кабеля для укладки на поверхность резервуара.

    Args:
        shape: 'cylindrical' или 'rectangular'
        diameter: для цилиндра — диаметр, м (>0)
        length, width: для прямоугольника — длина и ширина основания, м (>0)
        heating_height: высота зоны обогрева h_укл, м (>0)
        laying_step: шаг укладки w_step, м (0.1–0.4)

    Returns:
        Длина кабеля N, м.

    Raises:
        ValueError: если параметры некорректны или форма не поддерживается.
    """
    if heating_height <= 0:
        raise ValueError(f"heating_height должна быть > 0, получено {heating_height}")
    if not (LAYING_STEP_MIN <= laying_step <= LAYING_STEP_MAX):
        raise ValueError(
            f"laying_step должен быть в диапазоне {LAYING_STEP_MIN}–{LAYING_STEP_MAX} м, "
            f"получено {laying_step}"
        )

    if shape == "cylindrical":
        if diameter is None or diameter <= 0:
            raise ValueError("Для цилиндра требуется diameter > 0")
        perimeter = None
    elif shape == "rectangular":
        if length is None or length <= 0 or width is None or width <= 0:
            raise ValueError("Для прямоугольника требуются length и width > 0")
        perimeter = 2.0 * (length + width)
    else:
        raise ValueError(
            f"Укладка кабеля не поддерживается для формы '{shape}'. "
            "Допустимы только cylindrical и rectangular."
        )

    return (perimeter / 2.0) * (heating_height / laying_step)


def x_compute_tank_cable_length__mutmut_20(
    *,
    shape: str,
    diameter: float | None = None,
    length: float | None = None,
    width: float | None = None,
    heating_height: float,
    laying_step: float,
) -> float:
    """Длина греющего кабеля для укладки на поверхность резервуара.

    Args:
        shape: 'cylindrical' или 'rectangular'
        diameter: для цилиндра — диаметр, м (>0)
        length, width: для прямоугольника — длина и ширина основания, м (>0)
        heating_height: высота зоны обогрева h_укл, м (>0)
        laying_step: шаг укладки w_step, м (0.1–0.4)

    Returns:
        Длина кабеля N, м.

    Raises:
        ValueError: если параметры некорректны или форма не поддерживается.
    """
    if heating_height <= 0:
        raise ValueError(f"heating_height должна быть > 0, получено {heating_height}")
    if not (LAYING_STEP_MIN <= laying_step <= LAYING_STEP_MAX):
        raise ValueError(
            f"laying_step должен быть в диапазоне {LAYING_STEP_MIN}–{LAYING_STEP_MAX} м, "
            f"получено {laying_step}"
        )

    if shape == "cylindrical":
        if diameter is None or diameter <= 0:
            raise ValueError("Для цилиндра требуется diameter > 0")
        perimeter = math.pi / diameter
    elif shape == "rectangular":
        if length is None or length <= 0 or width is None or width <= 0:
            raise ValueError("Для прямоугольника требуются length и width > 0")
        perimeter = 2.0 * (length + width)
    else:
        raise ValueError(
            f"Укладка кабеля не поддерживается для формы '{shape}'. "
            "Допустимы только cylindrical и rectangular."
        )

    return (perimeter / 2.0) * (heating_height / laying_step)


def x_compute_tank_cable_length__mutmut_21(
    *,
    shape: str,
    diameter: float | None = None,
    length: float | None = None,
    width: float | None = None,
    heating_height: float,
    laying_step: float,
) -> float:
    """Длина греющего кабеля для укладки на поверхность резервуара.

    Args:
        shape: 'cylindrical' или 'rectangular'
        diameter: для цилиндра — диаметр, м (>0)
        length, width: для прямоугольника — длина и ширина основания, м (>0)
        heating_height: высота зоны обогрева h_укл, м (>0)
        laying_step: шаг укладки w_step, м (0.1–0.4)

    Returns:
        Длина кабеля N, м.

    Raises:
        ValueError: если параметры некорректны или форма не поддерживается.
    """
    if heating_height <= 0:
        raise ValueError(f"heating_height должна быть > 0, получено {heating_height}")
    if not (LAYING_STEP_MIN <= laying_step <= LAYING_STEP_MAX):
        raise ValueError(
            f"laying_step должен быть в диапазоне {LAYING_STEP_MIN}–{LAYING_STEP_MAX} м, "
            f"получено {laying_step}"
        )

    if shape == "cylindrical":
        if diameter is None or diameter <= 0:
            raise ValueError("Для цилиндра требуется diameter > 0")
        perimeter = math.pi * diameter
    elif shape != "rectangular":
        if length is None or length <= 0 or width is None or width <= 0:
            raise ValueError("Для прямоугольника требуются length и width > 0")
        perimeter = 2.0 * (length + width)
    else:
        raise ValueError(
            f"Укладка кабеля не поддерживается для формы '{shape}'. "
            "Допустимы только cylindrical и rectangular."
        )

    return (perimeter / 2.0) * (heating_height / laying_step)


def x_compute_tank_cable_length__mutmut_22(
    *,
    shape: str,
    diameter: float | None = None,
    length: float | None = None,
    width: float | None = None,
    heating_height: float,
    laying_step: float,
) -> float:
    """Длина греющего кабеля для укладки на поверхность резервуара.

    Args:
        shape: 'cylindrical' или 'rectangular'
        diameter: для цилиндра — диаметр, м (>0)
        length, width: для прямоугольника — длина и ширина основания, м (>0)
        heating_height: высота зоны обогрева h_укл, м (>0)
        laying_step: шаг укладки w_step, м (0.1–0.4)

    Returns:
        Длина кабеля N, м.

    Raises:
        ValueError: если параметры некорректны или форма не поддерживается.
    """
    if heating_height <= 0:
        raise ValueError(f"heating_height должна быть > 0, получено {heating_height}")
    if not (LAYING_STEP_MIN <= laying_step <= LAYING_STEP_MAX):
        raise ValueError(
            f"laying_step должен быть в диапазоне {LAYING_STEP_MIN}–{LAYING_STEP_MAX} м, "
            f"получено {laying_step}"
        )

    if shape == "cylindrical":
        if diameter is None or diameter <= 0:
            raise ValueError("Для цилиндра требуется diameter > 0")
        perimeter = math.pi * diameter
    elif shape == "XXrectangularXX":
        if length is None or length <= 0 or width is None or width <= 0:
            raise ValueError("Для прямоугольника требуются length и width > 0")
        perimeter = 2.0 * (length + width)
    else:
        raise ValueError(
            f"Укладка кабеля не поддерживается для формы '{shape}'. "
            "Допустимы только cylindrical и rectangular."
        )

    return (perimeter / 2.0) * (heating_height / laying_step)


def x_compute_tank_cable_length__mutmut_23(
    *,
    shape: str,
    diameter: float | None = None,
    length: float | None = None,
    width: float | None = None,
    heating_height: float,
    laying_step: float,
) -> float:
    """Длина греющего кабеля для укладки на поверхность резервуара.

    Args:
        shape: 'cylindrical' или 'rectangular'
        diameter: для цилиндра — диаметр, м (>0)
        length, width: для прямоугольника — длина и ширина основания, м (>0)
        heating_height: высота зоны обогрева h_укл, м (>0)
        laying_step: шаг укладки w_step, м (0.1–0.4)

    Returns:
        Длина кабеля N, м.

    Raises:
        ValueError: если параметры некорректны или форма не поддерживается.
    """
    if heating_height <= 0:
        raise ValueError(f"heating_height должна быть > 0, получено {heating_height}")
    if not (LAYING_STEP_MIN <= laying_step <= LAYING_STEP_MAX):
        raise ValueError(
            f"laying_step должен быть в диапазоне {LAYING_STEP_MIN}–{LAYING_STEP_MAX} м, "
            f"получено {laying_step}"
        )

    if shape == "cylindrical":
        if diameter is None or diameter <= 0:
            raise ValueError("Для цилиндра требуется diameter > 0")
        perimeter = math.pi * diameter
    elif shape == "RECTANGULAR":
        if length is None or length <= 0 or width is None or width <= 0:
            raise ValueError("Для прямоугольника требуются length и width > 0")
        perimeter = 2.0 * (length + width)
    else:
        raise ValueError(
            f"Укладка кабеля не поддерживается для формы '{shape}'. "
            "Допустимы только cylindrical и rectangular."
        )

    return (perimeter / 2.0) * (heating_height / laying_step)


def x_compute_tank_cable_length__mutmut_24(
    *,
    shape: str,
    diameter: float | None = None,
    length: float | None = None,
    width: float | None = None,
    heating_height: float,
    laying_step: float,
) -> float:
    """Длина греющего кабеля для укладки на поверхность резервуара.

    Args:
        shape: 'cylindrical' или 'rectangular'
        diameter: для цилиндра — диаметр, м (>0)
        length, width: для прямоугольника — длина и ширина основания, м (>0)
        heating_height: высота зоны обогрева h_укл, м (>0)
        laying_step: шаг укладки w_step, м (0.1–0.4)

    Returns:
        Длина кабеля N, м.

    Raises:
        ValueError: если параметры некорректны или форма не поддерживается.
    """
    if heating_height <= 0:
        raise ValueError(f"heating_height должна быть > 0, получено {heating_height}")
    if not (LAYING_STEP_MIN <= laying_step <= LAYING_STEP_MAX):
        raise ValueError(
            f"laying_step должен быть в диапазоне {LAYING_STEP_MIN}–{LAYING_STEP_MAX} м, "
            f"получено {laying_step}"
        )

    if shape == "cylindrical":
        if diameter is None or diameter <= 0:
            raise ValueError("Для цилиндра требуется diameter > 0")
        perimeter = math.pi * diameter
    elif shape == "rectangular":
        if length is None or length <= 0 or width is None and width <= 0:
            raise ValueError("Для прямоугольника требуются length и width > 0")
        perimeter = 2.0 * (length + width)
    else:
        raise ValueError(
            f"Укладка кабеля не поддерживается для формы '{shape}'. "
            "Допустимы только cylindrical и rectangular."
        )

    return (perimeter / 2.0) * (heating_height / laying_step)


def x_compute_tank_cable_length__mutmut_25(
    *,
    shape: str,
    diameter: float | None = None,
    length: float | None = None,
    width: float | None = None,
    heating_height: float,
    laying_step: float,
) -> float:
    """Длина греющего кабеля для укладки на поверхность резервуара.

    Args:
        shape: 'cylindrical' или 'rectangular'
        diameter: для цилиндра — диаметр, м (>0)
        length, width: для прямоугольника — длина и ширина основания, м (>0)
        heating_height: высота зоны обогрева h_укл, м (>0)
        laying_step: шаг укладки w_step, м (0.1–0.4)

    Returns:
        Длина кабеля N, м.

    Raises:
        ValueError: если параметры некорректны или форма не поддерживается.
    """
    if heating_height <= 0:
        raise ValueError(f"heating_height должна быть > 0, получено {heating_height}")
    if not (LAYING_STEP_MIN <= laying_step <= LAYING_STEP_MAX):
        raise ValueError(
            f"laying_step должен быть в диапазоне {LAYING_STEP_MIN}–{LAYING_STEP_MAX} м, "
            f"получено {laying_step}"
        )

    if shape == "cylindrical":
        if diameter is None or diameter <= 0:
            raise ValueError("Для цилиндра требуется diameter > 0")
        perimeter = math.pi * diameter
    elif shape == "rectangular":
        if length is None or length <= 0 and width is None or width <= 0:
            raise ValueError("Для прямоугольника требуются length и width > 0")
        perimeter = 2.0 * (length + width)
    else:
        raise ValueError(
            f"Укладка кабеля не поддерживается для формы '{shape}'. "
            "Допустимы только cylindrical и rectangular."
        )

    return (perimeter / 2.0) * (heating_height / laying_step)


def x_compute_tank_cable_length__mutmut_26(
    *,
    shape: str,
    diameter: float | None = None,
    length: float | None = None,
    width: float | None = None,
    heating_height: float,
    laying_step: float,
) -> float:
    """Длина греющего кабеля для укладки на поверхность резервуара.

    Args:
        shape: 'cylindrical' или 'rectangular'
        diameter: для цилиндра — диаметр, м (>0)
        length, width: для прямоугольника — длина и ширина основания, м (>0)
        heating_height: высота зоны обогрева h_укл, м (>0)
        laying_step: шаг укладки w_step, м (0.1–0.4)

    Returns:
        Длина кабеля N, м.

    Raises:
        ValueError: если параметры некорректны или форма не поддерживается.
    """
    if heating_height <= 0:
        raise ValueError(f"heating_height должна быть > 0, получено {heating_height}")
    if not (LAYING_STEP_MIN <= laying_step <= LAYING_STEP_MAX):
        raise ValueError(
            f"laying_step должен быть в диапазоне {LAYING_STEP_MIN}–{LAYING_STEP_MAX} м, "
            f"получено {laying_step}"
        )

    if shape == "cylindrical":
        if diameter is None or diameter <= 0:
            raise ValueError("Для цилиндра требуется diameter > 0")
        perimeter = math.pi * diameter
    elif shape == "rectangular":
        if length is None and length <= 0 or width is None or width <= 0:
            raise ValueError("Для прямоугольника требуются length и width > 0")
        perimeter = 2.0 * (length + width)
    else:
        raise ValueError(
            f"Укладка кабеля не поддерживается для формы '{shape}'. "
            "Допустимы только cylindrical и rectangular."
        )

    return (perimeter / 2.0) * (heating_height / laying_step)


def x_compute_tank_cable_length__mutmut_27(
    *,
    shape: str,
    diameter: float | None = None,
    length: float | None = None,
    width: float | None = None,
    heating_height: float,
    laying_step: float,
) -> float:
    """Длина греющего кабеля для укладки на поверхность резервуара.

    Args:
        shape: 'cylindrical' или 'rectangular'
        diameter: для цилиндра — диаметр, м (>0)
        length, width: для прямоугольника — длина и ширина основания, м (>0)
        heating_height: высота зоны обогрева h_укл, м (>0)
        laying_step: шаг укладки w_step, м (0.1–0.4)

    Returns:
        Длина кабеля N, м.

    Raises:
        ValueError: если параметры некорректны или форма не поддерживается.
    """
    if heating_height <= 0:
        raise ValueError(f"heating_height должна быть > 0, получено {heating_height}")
    if not (LAYING_STEP_MIN <= laying_step <= LAYING_STEP_MAX):
        raise ValueError(
            f"laying_step должен быть в диапазоне {LAYING_STEP_MIN}–{LAYING_STEP_MAX} м, "
            f"получено {laying_step}"
        )

    if shape == "cylindrical":
        if diameter is None or diameter <= 0:
            raise ValueError("Для цилиндра требуется diameter > 0")
        perimeter = math.pi * diameter
    elif shape == "rectangular":
        if length is not None or length <= 0 or width is None or width <= 0:
            raise ValueError("Для прямоугольника требуются length и width > 0")
        perimeter = 2.0 * (length + width)
    else:
        raise ValueError(
            f"Укладка кабеля не поддерживается для формы '{shape}'. "
            "Допустимы только cylindrical и rectangular."
        )

    return (perimeter / 2.0) * (heating_height / laying_step)


def x_compute_tank_cable_length__mutmut_28(
    *,
    shape: str,
    diameter: float | None = None,
    length: float | None = None,
    width: float | None = None,
    heating_height: float,
    laying_step: float,
) -> float:
    """Длина греющего кабеля для укладки на поверхность резервуара.

    Args:
        shape: 'cylindrical' или 'rectangular'
        diameter: для цилиндра — диаметр, м (>0)
        length, width: для прямоугольника — длина и ширина основания, м (>0)
        heating_height: высота зоны обогрева h_укл, м (>0)
        laying_step: шаг укладки w_step, м (0.1–0.4)

    Returns:
        Длина кабеля N, м.

    Raises:
        ValueError: если параметры некорректны или форма не поддерживается.
    """
    if heating_height <= 0:
        raise ValueError(f"heating_height должна быть > 0, получено {heating_height}")
    if not (LAYING_STEP_MIN <= laying_step <= LAYING_STEP_MAX):
        raise ValueError(
            f"laying_step должен быть в диапазоне {LAYING_STEP_MIN}–{LAYING_STEP_MAX} м, "
            f"получено {laying_step}"
        )

    if shape == "cylindrical":
        if diameter is None or diameter <= 0:
            raise ValueError("Для цилиндра требуется diameter > 0")
        perimeter = math.pi * diameter
    elif shape == "rectangular":
        if length is None or length < 0 or width is None or width <= 0:
            raise ValueError("Для прямоугольника требуются length и width > 0")
        perimeter = 2.0 * (length + width)
    else:
        raise ValueError(
            f"Укладка кабеля не поддерживается для формы '{shape}'. "
            "Допустимы только cylindrical и rectangular."
        )

    return (perimeter / 2.0) * (heating_height / laying_step)


def x_compute_tank_cable_length__mutmut_29(
    *,
    shape: str,
    diameter: float | None = None,
    length: float | None = None,
    width: float | None = None,
    heating_height: float,
    laying_step: float,
) -> float:
    """Длина греющего кабеля для укладки на поверхность резервуара.

    Args:
        shape: 'cylindrical' или 'rectangular'
        diameter: для цилиндра — диаметр, м (>0)
        length, width: для прямоугольника — длина и ширина основания, м (>0)
        heating_height: высота зоны обогрева h_укл, м (>0)
        laying_step: шаг укладки w_step, м (0.1–0.4)

    Returns:
        Длина кабеля N, м.

    Raises:
        ValueError: если параметры некорректны или форма не поддерживается.
    """
    if heating_height <= 0:
        raise ValueError(f"heating_height должна быть > 0, получено {heating_height}")
    if not (LAYING_STEP_MIN <= laying_step <= LAYING_STEP_MAX):
        raise ValueError(
            f"laying_step должен быть в диапазоне {LAYING_STEP_MIN}–{LAYING_STEP_MAX} м, "
            f"получено {laying_step}"
        )

    if shape == "cylindrical":
        if diameter is None or diameter <= 0:
            raise ValueError("Для цилиндра требуется diameter > 0")
        perimeter = math.pi * diameter
    elif shape == "rectangular":
        if length is None or length <= 1 or width is None or width <= 0:
            raise ValueError("Для прямоугольника требуются length и width > 0")
        perimeter = 2.0 * (length + width)
    else:
        raise ValueError(
            f"Укладка кабеля не поддерживается для формы '{shape}'. "
            "Допустимы только cylindrical и rectangular."
        )

    return (perimeter / 2.0) * (heating_height / laying_step)


def x_compute_tank_cable_length__mutmut_30(
    *,
    shape: str,
    diameter: float | None = None,
    length: float | None = None,
    width: float | None = None,
    heating_height: float,
    laying_step: float,
) -> float:
    """Длина греющего кабеля для укладки на поверхность резервуара.

    Args:
        shape: 'cylindrical' или 'rectangular'
        diameter: для цилиндра — диаметр, м (>0)
        length, width: для прямоугольника — длина и ширина основания, м (>0)
        heating_height: высота зоны обогрева h_укл, м (>0)
        laying_step: шаг укладки w_step, м (0.1–0.4)

    Returns:
        Длина кабеля N, м.

    Raises:
        ValueError: если параметры некорректны или форма не поддерживается.
    """
    if heating_height <= 0:
        raise ValueError(f"heating_height должна быть > 0, получено {heating_height}")
    if not (LAYING_STEP_MIN <= laying_step <= LAYING_STEP_MAX):
        raise ValueError(
            f"laying_step должен быть в диапазоне {LAYING_STEP_MIN}–{LAYING_STEP_MAX} м, "
            f"получено {laying_step}"
        )

    if shape == "cylindrical":
        if diameter is None or diameter <= 0:
            raise ValueError("Для цилиндра требуется diameter > 0")
        perimeter = math.pi * diameter
    elif shape == "rectangular":
        if length is None or length <= 0 or width is not None or width <= 0:
            raise ValueError("Для прямоугольника требуются length и width > 0")
        perimeter = 2.0 * (length + width)
    else:
        raise ValueError(
            f"Укладка кабеля не поддерживается для формы '{shape}'. "
            "Допустимы только cylindrical и rectangular."
        )

    return (perimeter / 2.0) * (heating_height / laying_step)


def x_compute_tank_cable_length__mutmut_31(
    *,
    shape: str,
    diameter: float | None = None,
    length: float | None = None,
    width: float | None = None,
    heating_height: float,
    laying_step: float,
) -> float:
    """Длина греющего кабеля для укладки на поверхность резервуара.

    Args:
        shape: 'cylindrical' или 'rectangular'
        diameter: для цилиндра — диаметр, м (>0)
        length, width: для прямоугольника — длина и ширина основания, м (>0)
        heating_height: высота зоны обогрева h_укл, м (>0)
        laying_step: шаг укладки w_step, м (0.1–0.4)

    Returns:
        Длина кабеля N, м.

    Raises:
        ValueError: если параметры некорректны или форма не поддерживается.
    """
    if heating_height <= 0:
        raise ValueError(f"heating_height должна быть > 0, получено {heating_height}")
    if not (LAYING_STEP_MIN <= laying_step <= LAYING_STEP_MAX):
        raise ValueError(
            f"laying_step должен быть в диапазоне {LAYING_STEP_MIN}–{LAYING_STEP_MAX} м, "
            f"получено {laying_step}"
        )

    if shape == "cylindrical":
        if diameter is None or diameter <= 0:
            raise ValueError("Для цилиндра требуется diameter > 0")
        perimeter = math.pi * diameter
    elif shape == "rectangular":
        if length is None or length <= 0 or width is None or width < 0:
            raise ValueError("Для прямоугольника требуются length и width > 0")
        perimeter = 2.0 * (length + width)
    else:
        raise ValueError(
            f"Укладка кабеля не поддерживается для формы '{shape}'. "
            "Допустимы только cylindrical и rectangular."
        )

    return (perimeter / 2.0) * (heating_height / laying_step)


def x_compute_tank_cable_length__mutmut_32(
    *,
    shape: str,
    diameter: float | None = None,
    length: float | None = None,
    width: float | None = None,
    heating_height: float,
    laying_step: float,
) -> float:
    """Длина греющего кабеля для укладки на поверхность резервуара.

    Args:
        shape: 'cylindrical' или 'rectangular'
        diameter: для цилиндра — диаметр, м (>0)
        length, width: для прямоугольника — длина и ширина основания, м (>0)
        heating_height: высота зоны обогрева h_укл, м (>0)
        laying_step: шаг укладки w_step, м (0.1–0.4)

    Returns:
        Длина кабеля N, м.

    Raises:
        ValueError: если параметры некорректны или форма не поддерживается.
    """
    if heating_height <= 0:
        raise ValueError(f"heating_height должна быть > 0, получено {heating_height}")
    if not (LAYING_STEP_MIN <= laying_step <= LAYING_STEP_MAX):
        raise ValueError(
            f"laying_step должен быть в диапазоне {LAYING_STEP_MIN}–{LAYING_STEP_MAX} м, "
            f"получено {laying_step}"
        )

    if shape == "cylindrical":
        if diameter is None or diameter <= 0:
            raise ValueError("Для цилиндра требуется diameter > 0")
        perimeter = math.pi * diameter
    elif shape == "rectangular":
        if length is None or length <= 0 or width is None or width <= 1:
            raise ValueError("Для прямоугольника требуются length и width > 0")
        perimeter = 2.0 * (length + width)
    else:
        raise ValueError(
            f"Укладка кабеля не поддерживается для формы '{shape}'. "
            "Допустимы только cylindrical и rectangular."
        )

    return (perimeter / 2.0) * (heating_height / laying_step)


def x_compute_tank_cable_length__mutmut_33(
    *,
    shape: str,
    diameter: float | None = None,
    length: float | None = None,
    width: float | None = None,
    heating_height: float,
    laying_step: float,
) -> float:
    """Длина греющего кабеля для укладки на поверхность резервуара.

    Args:
        shape: 'cylindrical' или 'rectangular'
        diameter: для цилиндра — диаметр, м (>0)
        length, width: для прямоугольника — длина и ширина основания, м (>0)
        heating_height: высота зоны обогрева h_укл, м (>0)
        laying_step: шаг укладки w_step, м (0.1–0.4)

    Returns:
        Длина кабеля N, м.

    Raises:
        ValueError: если параметры некорректны или форма не поддерживается.
    """
    if heating_height <= 0:
        raise ValueError(f"heating_height должна быть > 0, получено {heating_height}")
    if not (LAYING_STEP_MIN <= laying_step <= LAYING_STEP_MAX):
        raise ValueError(
            f"laying_step должен быть в диапазоне {LAYING_STEP_MIN}–{LAYING_STEP_MAX} м, "
            f"получено {laying_step}"
        )

    if shape == "cylindrical":
        if diameter is None or diameter <= 0:
            raise ValueError("Для цилиндра требуется diameter > 0")
        perimeter = math.pi * diameter
    elif shape == "rectangular":
        if length is None or length <= 0 or width is None or width <= 0:
            raise ValueError(None)
        perimeter = 2.0 * (length + width)
    else:
        raise ValueError(
            f"Укладка кабеля не поддерживается для формы '{shape}'. "
            "Допустимы только cylindrical и rectangular."
        )

    return (perimeter / 2.0) * (heating_height / laying_step)


def x_compute_tank_cable_length__mutmut_34(
    *,
    shape: str,
    diameter: float | None = None,
    length: float | None = None,
    width: float | None = None,
    heating_height: float,
    laying_step: float,
) -> float:
    """Длина греющего кабеля для укладки на поверхность резервуара.

    Args:
        shape: 'cylindrical' или 'rectangular'
        diameter: для цилиндра — диаметр, м (>0)
        length, width: для прямоугольника — длина и ширина основания, м (>0)
        heating_height: высота зоны обогрева h_укл, м (>0)
        laying_step: шаг укладки w_step, м (0.1–0.4)

    Returns:
        Длина кабеля N, м.

    Raises:
        ValueError: если параметры некорректны или форма не поддерживается.
    """
    if heating_height <= 0:
        raise ValueError(f"heating_height должна быть > 0, получено {heating_height}")
    if not (LAYING_STEP_MIN <= laying_step <= LAYING_STEP_MAX):
        raise ValueError(
            f"laying_step должен быть в диапазоне {LAYING_STEP_MIN}–{LAYING_STEP_MAX} м, "
            f"получено {laying_step}"
        )

    if shape == "cylindrical":
        if diameter is None or diameter <= 0:
            raise ValueError("Для цилиндра требуется diameter > 0")
        perimeter = math.pi * diameter
    elif shape == "rectangular":
        if length is None or length <= 0 or width is None or width <= 0:
            raise ValueError("XXДля прямоугольника требуются length и width > 0XX")
        perimeter = 2.0 * (length + width)
    else:
        raise ValueError(
            f"Укладка кабеля не поддерживается для формы '{shape}'. "
            "Допустимы только cylindrical и rectangular."
        )

    return (perimeter / 2.0) * (heating_height / laying_step)


def x_compute_tank_cable_length__mutmut_35(
    *,
    shape: str,
    diameter: float | None = None,
    length: float | None = None,
    width: float | None = None,
    heating_height: float,
    laying_step: float,
) -> float:
    """Длина греющего кабеля для укладки на поверхность резервуара.

    Args:
        shape: 'cylindrical' или 'rectangular'
        diameter: для цилиндра — диаметр, м (>0)
        length, width: для прямоугольника — длина и ширина основания, м (>0)
        heating_height: высота зоны обогрева h_укл, м (>0)
        laying_step: шаг укладки w_step, м (0.1–0.4)

    Returns:
        Длина кабеля N, м.

    Raises:
        ValueError: если параметры некорректны или форма не поддерживается.
    """
    if heating_height <= 0:
        raise ValueError(f"heating_height должна быть > 0, получено {heating_height}")
    if not (LAYING_STEP_MIN <= laying_step <= LAYING_STEP_MAX):
        raise ValueError(
            f"laying_step должен быть в диапазоне {LAYING_STEP_MIN}–{LAYING_STEP_MAX} м, "
            f"получено {laying_step}"
        )

    if shape == "cylindrical":
        if diameter is None or diameter <= 0:
            raise ValueError("Для цилиндра требуется diameter > 0")
        perimeter = math.pi * diameter
    elif shape == "rectangular":
        if length is None or length <= 0 or width is None or width <= 0:
            raise ValueError("для прямоугольника требуются length и width > 0")
        perimeter = 2.0 * (length + width)
    else:
        raise ValueError(
            f"Укладка кабеля не поддерживается для формы '{shape}'. "
            "Допустимы только cylindrical и rectangular."
        )

    return (perimeter / 2.0) * (heating_height / laying_step)


def x_compute_tank_cable_length__mutmut_36(
    *,
    shape: str,
    diameter: float | None = None,
    length: float | None = None,
    width: float | None = None,
    heating_height: float,
    laying_step: float,
) -> float:
    """Длина греющего кабеля для укладки на поверхность резервуара.

    Args:
        shape: 'cylindrical' или 'rectangular'
        diameter: для цилиндра — диаметр, м (>0)
        length, width: для прямоугольника — длина и ширина основания, м (>0)
        heating_height: высота зоны обогрева h_укл, м (>0)
        laying_step: шаг укладки w_step, м (0.1–0.4)

    Returns:
        Длина кабеля N, м.

    Raises:
        ValueError: если параметры некорректны или форма не поддерживается.
    """
    if heating_height <= 0:
        raise ValueError(f"heating_height должна быть > 0, получено {heating_height}")
    if not (LAYING_STEP_MIN <= laying_step <= LAYING_STEP_MAX):
        raise ValueError(
            f"laying_step должен быть в диапазоне {LAYING_STEP_MIN}–{LAYING_STEP_MAX} м, "
            f"получено {laying_step}"
        )

    if shape == "cylindrical":
        if diameter is None or diameter <= 0:
            raise ValueError("Для цилиндра требуется diameter > 0")
        perimeter = math.pi * diameter
    elif shape == "rectangular":
        if length is None or length <= 0 or width is None or width <= 0:
            raise ValueError("ДЛЯ ПРЯМОУГОЛЬНИКА ТРЕБУЮТСЯ LENGTH И WIDTH > 0")
        perimeter = 2.0 * (length + width)
    else:
        raise ValueError(
            f"Укладка кабеля не поддерживается для формы '{shape}'. "
            "Допустимы только cylindrical и rectangular."
        )

    return (perimeter / 2.0) * (heating_height / laying_step)


def x_compute_tank_cable_length__mutmut_37(
    *,
    shape: str,
    diameter: float | None = None,
    length: float | None = None,
    width: float | None = None,
    heating_height: float,
    laying_step: float,
) -> float:
    """Длина греющего кабеля для укладки на поверхность резервуара.

    Args:
        shape: 'cylindrical' или 'rectangular'
        diameter: для цилиндра — диаметр, м (>0)
        length, width: для прямоугольника — длина и ширина основания, м (>0)
        heating_height: высота зоны обогрева h_укл, м (>0)
        laying_step: шаг укладки w_step, м (0.1–0.4)

    Returns:
        Длина кабеля N, м.

    Raises:
        ValueError: если параметры некорректны или форма не поддерживается.
    """
    if heating_height <= 0:
        raise ValueError(f"heating_height должна быть > 0, получено {heating_height}")
    if not (LAYING_STEP_MIN <= laying_step <= LAYING_STEP_MAX):
        raise ValueError(
            f"laying_step должен быть в диапазоне {LAYING_STEP_MIN}–{LAYING_STEP_MAX} м, "
            f"получено {laying_step}"
        )

    if shape == "cylindrical":
        if diameter is None or diameter <= 0:
            raise ValueError("Для цилиндра требуется diameter > 0")
        perimeter = math.pi * diameter
    elif shape == "rectangular":
        if length is None or length <= 0 or width is None or width <= 0:
            raise ValueError("Для прямоугольника требуются length и width > 0")
        perimeter = None
    else:
        raise ValueError(
            f"Укладка кабеля не поддерживается для формы '{shape}'. "
            "Допустимы только cylindrical и rectangular."
        )

    return (perimeter / 2.0) * (heating_height / laying_step)


def x_compute_tank_cable_length__mutmut_38(
    *,
    shape: str,
    diameter: float | None = None,
    length: float | None = None,
    width: float | None = None,
    heating_height: float,
    laying_step: float,
) -> float:
    """Длина греющего кабеля для укладки на поверхность резервуара.

    Args:
        shape: 'cylindrical' или 'rectangular'
        diameter: для цилиндра — диаметр, м (>0)
        length, width: для прямоугольника — длина и ширина основания, м (>0)
        heating_height: высота зоны обогрева h_укл, м (>0)
        laying_step: шаг укладки w_step, м (0.1–0.4)

    Returns:
        Длина кабеля N, м.

    Raises:
        ValueError: если параметры некорректны или форма не поддерживается.
    """
    if heating_height <= 0:
        raise ValueError(f"heating_height должна быть > 0, получено {heating_height}")
    if not (LAYING_STEP_MIN <= laying_step <= LAYING_STEP_MAX):
        raise ValueError(
            f"laying_step должен быть в диапазоне {LAYING_STEP_MIN}–{LAYING_STEP_MAX} м, "
            f"получено {laying_step}"
        )

    if shape == "cylindrical":
        if diameter is None or diameter <= 0:
            raise ValueError("Для цилиндра требуется diameter > 0")
        perimeter = math.pi * diameter
    elif shape == "rectangular":
        if length is None or length <= 0 or width is None or width <= 0:
            raise ValueError("Для прямоугольника требуются length и width > 0")
        perimeter = 2.0 / (length + width)
    else:
        raise ValueError(
            f"Укладка кабеля не поддерживается для формы '{shape}'. "
            "Допустимы только cylindrical и rectangular."
        )

    return (perimeter / 2.0) * (heating_height / laying_step)


def x_compute_tank_cable_length__mutmut_39(
    *,
    shape: str,
    diameter: float | None = None,
    length: float | None = None,
    width: float | None = None,
    heating_height: float,
    laying_step: float,
) -> float:
    """Длина греющего кабеля для укладки на поверхность резервуара.

    Args:
        shape: 'cylindrical' или 'rectangular'
        diameter: для цилиндра — диаметр, м (>0)
        length, width: для прямоугольника — длина и ширина основания, м (>0)
        heating_height: высота зоны обогрева h_укл, м (>0)
        laying_step: шаг укладки w_step, м (0.1–0.4)

    Returns:
        Длина кабеля N, м.

    Raises:
        ValueError: если параметры некорректны или форма не поддерживается.
    """
    if heating_height <= 0:
        raise ValueError(f"heating_height должна быть > 0, получено {heating_height}")
    if not (LAYING_STEP_MIN <= laying_step <= LAYING_STEP_MAX):
        raise ValueError(
            f"laying_step должен быть в диапазоне {LAYING_STEP_MIN}–{LAYING_STEP_MAX} м, "
            f"получено {laying_step}"
        )

    if shape == "cylindrical":
        if diameter is None or diameter <= 0:
            raise ValueError("Для цилиндра требуется diameter > 0")
        perimeter = math.pi * diameter
    elif shape == "rectangular":
        if length is None or length <= 0 or width is None or width <= 0:
            raise ValueError("Для прямоугольника требуются length и width > 0")
        perimeter = 3.0 * (length + width)
    else:
        raise ValueError(
            f"Укладка кабеля не поддерживается для формы '{shape}'. "
            "Допустимы только cylindrical и rectangular."
        )

    return (perimeter / 2.0) * (heating_height / laying_step)


def x_compute_tank_cable_length__mutmut_40(
    *,
    shape: str,
    diameter: float | None = None,
    length: float | None = None,
    width: float | None = None,
    heating_height: float,
    laying_step: float,
) -> float:
    """Длина греющего кабеля для укладки на поверхность резервуара.

    Args:
        shape: 'cylindrical' или 'rectangular'
        diameter: для цилиндра — диаметр, м (>0)
        length, width: для прямоугольника — длина и ширина основания, м (>0)
        heating_height: высота зоны обогрева h_укл, м (>0)
        laying_step: шаг укладки w_step, м (0.1–0.4)

    Returns:
        Длина кабеля N, м.

    Raises:
        ValueError: если параметры некорректны или форма не поддерживается.
    """
    if heating_height <= 0:
        raise ValueError(f"heating_height должна быть > 0, получено {heating_height}")
    if not (LAYING_STEP_MIN <= laying_step <= LAYING_STEP_MAX):
        raise ValueError(
            f"laying_step должен быть в диапазоне {LAYING_STEP_MIN}–{LAYING_STEP_MAX} м, "
            f"получено {laying_step}"
        )

    if shape == "cylindrical":
        if diameter is None or diameter <= 0:
            raise ValueError("Для цилиндра требуется diameter > 0")
        perimeter = math.pi * diameter
    elif shape == "rectangular":
        if length is None or length <= 0 or width is None or width <= 0:
            raise ValueError("Для прямоугольника требуются length и width > 0")
        perimeter = 2.0 * (length - width)
    else:
        raise ValueError(
            f"Укладка кабеля не поддерживается для формы '{shape}'. "
            "Допустимы только cylindrical и rectangular."
        )

    return (perimeter / 2.0) * (heating_height / laying_step)


def x_compute_tank_cable_length__mutmut_41(
    *,
    shape: str,
    diameter: float | None = None,
    length: float | None = None,
    width: float | None = None,
    heating_height: float,
    laying_step: float,
) -> float:
    """Длина греющего кабеля для укладки на поверхность резервуара.

    Args:
        shape: 'cylindrical' или 'rectangular'
        diameter: для цилиндра — диаметр, м (>0)
        length, width: для прямоугольника — длина и ширина основания, м (>0)
        heating_height: высота зоны обогрева h_укл, м (>0)
        laying_step: шаг укладки w_step, м (0.1–0.4)

    Returns:
        Длина кабеля N, м.

    Raises:
        ValueError: если параметры некорректны или форма не поддерживается.
    """
    if heating_height <= 0:
        raise ValueError(f"heating_height должна быть > 0, получено {heating_height}")
    if not (LAYING_STEP_MIN <= laying_step <= LAYING_STEP_MAX):
        raise ValueError(
            f"laying_step должен быть в диапазоне {LAYING_STEP_MIN}–{LAYING_STEP_MAX} м, "
            f"получено {laying_step}"
        )

    if shape == "cylindrical":
        if diameter is None or diameter <= 0:
            raise ValueError("Для цилиндра требуется diameter > 0")
        perimeter = math.pi * diameter
    elif shape == "rectangular":
        if length is None or length <= 0 or width is None or width <= 0:
            raise ValueError("Для прямоугольника требуются length и width > 0")
        perimeter = 2.0 * (length + width)
    else:
        raise ValueError(
            None
        )

    return (perimeter / 2.0) * (heating_height / laying_step)


def x_compute_tank_cable_length__mutmut_42(
    *,
    shape: str,
    diameter: float | None = None,
    length: float | None = None,
    width: float | None = None,
    heating_height: float,
    laying_step: float,
) -> float:
    """Длина греющего кабеля для укладки на поверхность резервуара.

    Args:
        shape: 'cylindrical' или 'rectangular'
        diameter: для цилиндра — диаметр, м (>0)
        length, width: для прямоугольника — длина и ширина основания, м (>0)
        heating_height: высота зоны обогрева h_укл, м (>0)
        laying_step: шаг укладки w_step, м (0.1–0.4)

    Returns:
        Длина кабеля N, м.

    Raises:
        ValueError: если параметры некорректны или форма не поддерживается.
    """
    if heating_height <= 0:
        raise ValueError(f"heating_height должна быть > 0, получено {heating_height}")
    if not (LAYING_STEP_MIN <= laying_step <= LAYING_STEP_MAX):
        raise ValueError(
            f"laying_step должен быть в диапазоне {LAYING_STEP_MIN}–{LAYING_STEP_MAX} м, "
            f"получено {laying_step}"
        )

    if shape == "cylindrical":
        if diameter is None or diameter <= 0:
            raise ValueError("Для цилиндра требуется diameter > 0")
        perimeter = math.pi * diameter
    elif shape == "rectangular":
        if length is None or length <= 0 or width is None or width <= 0:
            raise ValueError("Для прямоугольника требуются length и width > 0")
        perimeter = 2.0 * (length + width)
    else:
        raise ValueError(
            f"Укладка кабеля не поддерживается для формы '{shape}'. "
            "XXДопустимы только cylindrical и rectangular.XX"
        )

    return (perimeter / 2.0) * (heating_height / laying_step)


def x_compute_tank_cable_length__mutmut_43(
    *,
    shape: str,
    diameter: float | None = None,
    length: float | None = None,
    width: float | None = None,
    heating_height: float,
    laying_step: float,
) -> float:
    """Длина греющего кабеля для укладки на поверхность резервуара.

    Args:
        shape: 'cylindrical' или 'rectangular'
        diameter: для цилиндра — диаметр, м (>0)
        length, width: для прямоугольника — длина и ширина основания, м (>0)
        heating_height: высота зоны обогрева h_укл, м (>0)
        laying_step: шаг укладки w_step, м (0.1–0.4)

    Returns:
        Длина кабеля N, м.

    Raises:
        ValueError: если параметры некорректны или форма не поддерживается.
    """
    if heating_height <= 0:
        raise ValueError(f"heating_height должна быть > 0, получено {heating_height}")
    if not (LAYING_STEP_MIN <= laying_step <= LAYING_STEP_MAX):
        raise ValueError(
            f"laying_step должен быть в диапазоне {LAYING_STEP_MIN}–{LAYING_STEP_MAX} м, "
            f"получено {laying_step}"
        )

    if shape == "cylindrical":
        if diameter is None or diameter <= 0:
            raise ValueError("Для цилиндра требуется diameter > 0")
        perimeter = math.pi * diameter
    elif shape == "rectangular":
        if length is None or length <= 0 or width is None or width <= 0:
            raise ValueError("Для прямоугольника требуются length и width > 0")
        perimeter = 2.0 * (length + width)
    else:
        raise ValueError(
            f"Укладка кабеля не поддерживается для формы '{shape}'. "
            "допустимы только cylindrical и rectangular."
        )

    return (perimeter / 2.0) * (heating_height / laying_step)


def x_compute_tank_cable_length__mutmut_44(
    *,
    shape: str,
    diameter: float | None = None,
    length: float | None = None,
    width: float | None = None,
    heating_height: float,
    laying_step: float,
) -> float:
    """Длина греющего кабеля для укладки на поверхность резервуара.

    Args:
        shape: 'cylindrical' или 'rectangular'
        diameter: для цилиндра — диаметр, м (>0)
        length, width: для прямоугольника — длина и ширина основания, м (>0)
        heating_height: высота зоны обогрева h_укл, м (>0)
        laying_step: шаг укладки w_step, м (0.1–0.4)

    Returns:
        Длина кабеля N, м.

    Raises:
        ValueError: если параметры некорректны или форма не поддерживается.
    """
    if heating_height <= 0:
        raise ValueError(f"heating_height должна быть > 0, получено {heating_height}")
    if not (LAYING_STEP_MIN <= laying_step <= LAYING_STEP_MAX):
        raise ValueError(
            f"laying_step должен быть в диапазоне {LAYING_STEP_MIN}–{LAYING_STEP_MAX} м, "
            f"получено {laying_step}"
        )

    if shape == "cylindrical":
        if diameter is None or diameter <= 0:
            raise ValueError("Для цилиндра требуется diameter > 0")
        perimeter = math.pi * diameter
    elif shape == "rectangular":
        if length is None or length <= 0 or width is None or width <= 0:
            raise ValueError("Для прямоугольника требуются length и width > 0")
        perimeter = 2.0 * (length + width)
    else:
        raise ValueError(
            f"Укладка кабеля не поддерживается для формы '{shape}'. "
            "ДОПУСТИМЫ ТОЛЬКО CYLINDRICAL И RECTANGULAR."
        )

    return (perimeter / 2.0) * (heating_height / laying_step)


def x_compute_tank_cable_length__mutmut_45(
    *,
    shape: str,
    diameter: float | None = None,
    length: float | None = None,
    width: float | None = None,
    heating_height: float,
    laying_step: float,
) -> float:
    """Длина греющего кабеля для укладки на поверхность резервуара.

    Args:
        shape: 'cylindrical' или 'rectangular'
        diameter: для цилиндра — диаметр, м (>0)
        length, width: для прямоугольника — длина и ширина основания, м (>0)
        heating_height: высота зоны обогрева h_укл, м (>0)
        laying_step: шаг укладки w_step, м (0.1–0.4)

    Returns:
        Длина кабеля N, м.

    Raises:
        ValueError: если параметры некорректны или форма не поддерживается.
    """
    if heating_height <= 0:
        raise ValueError(f"heating_height должна быть > 0, получено {heating_height}")
    if not (LAYING_STEP_MIN <= laying_step <= LAYING_STEP_MAX):
        raise ValueError(
            f"laying_step должен быть в диапазоне {LAYING_STEP_MIN}–{LAYING_STEP_MAX} м, "
            f"получено {laying_step}"
        )

    if shape == "cylindrical":
        if diameter is None or diameter <= 0:
            raise ValueError("Для цилиндра требуется diameter > 0")
        perimeter = math.pi * diameter
    elif shape == "rectangular":
        if length is None or length <= 0 or width is None or width <= 0:
            raise ValueError("Для прямоугольника требуются length и width > 0")
        perimeter = 2.0 * (length + width)
    else:
        raise ValueError(
            f"Укладка кабеля не поддерживается для формы '{shape}'. "
            "Допустимы только cylindrical и rectangular."
        )

    return (perimeter / 2.0) / (heating_height / laying_step)


def x_compute_tank_cable_length__mutmut_46(
    *,
    shape: str,
    diameter: float | None = None,
    length: float | None = None,
    width: float | None = None,
    heating_height: float,
    laying_step: float,
) -> float:
    """Длина греющего кабеля для укладки на поверхность резервуара.

    Args:
        shape: 'cylindrical' или 'rectangular'
        diameter: для цилиндра — диаметр, м (>0)
        length, width: для прямоугольника — длина и ширина основания, м (>0)
        heating_height: высота зоны обогрева h_укл, м (>0)
        laying_step: шаг укладки w_step, м (0.1–0.4)

    Returns:
        Длина кабеля N, м.

    Raises:
        ValueError: если параметры некорректны или форма не поддерживается.
    """
    if heating_height <= 0:
        raise ValueError(f"heating_height должна быть > 0, получено {heating_height}")
    if not (LAYING_STEP_MIN <= laying_step <= LAYING_STEP_MAX):
        raise ValueError(
            f"laying_step должен быть в диапазоне {LAYING_STEP_MIN}–{LAYING_STEP_MAX} м, "
            f"получено {laying_step}"
        )

    if shape == "cylindrical":
        if diameter is None or diameter <= 0:
            raise ValueError("Для цилиндра требуется diameter > 0")
        perimeter = math.pi * diameter
    elif shape == "rectangular":
        if length is None or length <= 0 or width is None or width <= 0:
            raise ValueError("Для прямоугольника требуются length и width > 0")
        perimeter = 2.0 * (length + width)
    else:
        raise ValueError(
            f"Укладка кабеля не поддерживается для формы '{shape}'. "
            "Допустимы только cylindrical и rectangular."
        )

    return (perimeter * 2.0) * (heating_height / laying_step)


def x_compute_tank_cable_length__mutmut_47(
    *,
    shape: str,
    diameter: float | None = None,
    length: float | None = None,
    width: float | None = None,
    heating_height: float,
    laying_step: float,
) -> float:
    """Длина греющего кабеля для укладки на поверхность резервуара.

    Args:
        shape: 'cylindrical' или 'rectangular'
        diameter: для цилиндра — диаметр, м (>0)
        length, width: для прямоугольника — длина и ширина основания, м (>0)
        heating_height: высота зоны обогрева h_укл, м (>0)
        laying_step: шаг укладки w_step, м (0.1–0.4)

    Returns:
        Длина кабеля N, м.

    Raises:
        ValueError: если параметры некорректны или форма не поддерживается.
    """
    if heating_height <= 0:
        raise ValueError(f"heating_height должна быть > 0, получено {heating_height}")
    if not (LAYING_STEP_MIN <= laying_step <= LAYING_STEP_MAX):
        raise ValueError(
            f"laying_step должен быть в диапазоне {LAYING_STEP_MIN}–{LAYING_STEP_MAX} м, "
            f"получено {laying_step}"
        )

    if shape == "cylindrical":
        if diameter is None or diameter <= 0:
            raise ValueError("Для цилиндра требуется diameter > 0")
        perimeter = math.pi * diameter
    elif shape == "rectangular":
        if length is None or length <= 0 or width is None or width <= 0:
            raise ValueError("Для прямоугольника требуются length и width > 0")
        perimeter = 2.0 * (length + width)
    else:
        raise ValueError(
            f"Укладка кабеля не поддерживается для формы '{shape}'. "
            "Допустимы только cylindrical и rectangular."
        )

    return (perimeter / 3.0) * (heating_height / laying_step)


def x_compute_tank_cable_length__mutmut_48(
    *,
    shape: str,
    diameter: float | None = None,
    length: float | None = None,
    width: float | None = None,
    heating_height: float,
    laying_step: float,
) -> float:
    """Длина греющего кабеля для укладки на поверхность резервуара.

    Args:
        shape: 'cylindrical' или 'rectangular'
        diameter: для цилиндра — диаметр, м (>0)
        length, width: для прямоугольника — длина и ширина основания, м (>0)
        heating_height: высота зоны обогрева h_укл, м (>0)
        laying_step: шаг укладки w_step, м (0.1–0.4)

    Returns:
        Длина кабеля N, м.

    Raises:
        ValueError: если параметры некорректны или форма не поддерживается.
    """
    if heating_height <= 0:
        raise ValueError(f"heating_height должна быть > 0, получено {heating_height}")
    if not (LAYING_STEP_MIN <= laying_step <= LAYING_STEP_MAX):
        raise ValueError(
            f"laying_step должен быть в диапазоне {LAYING_STEP_MIN}–{LAYING_STEP_MAX} м, "
            f"получено {laying_step}"
        )

    if shape == "cylindrical":
        if diameter is None or diameter <= 0:
            raise ValueError("Для цилиндра требуется diameter > 0")
        perimeter = math.pi * diameter
    elif shape == "rectangular":
        if length is None or length <= 0 or width is None or width <= 0:
            raise ValueError("Для прямоугольника требуются length и width > 0")
        perimeter = 2.0 * (length + width)
    else:
        raise ValueError(
            f"Укладка кабеля не поддерживается для формы '{shape}'. "
            "Допустимы только cylindrical и rectangular."
        )

    return (perimeter / 2.0) * (heating_height * laying_step)

x_compute_tank_cable_length__mutmut_mutants : ClassVar[MutantDict] = { # type: ignore
'x_compute_tank_cable_length__mutmut_1': x_compute_tank_cable_length__mutmut_1, 
    'x_compute_tank_cable_length__mutmut_2': x_compute_tank_cable_length__mutmut_2, 
    'x_compute_tank_cable_length__mutmut_3': x_compute_tank_cable_length__mutmut_3, 
    'x_compute_tank_cable_length__mutmut_4': x_compute_tank_cable_length__mutmut_4, 
    'x_compute_tank_cable_length__mutmut_5': x_compute_tank_cable_length__mutmut_5, 
    'x_compute_tank_cable_length__mutmut_6': x_compute_tank_cable_length__mutmut_6, 
    'x_compute_tank_cable_length__mutmut_7': x_compute_tank_cable_length__mutmut_7, 
    'x_compute_tank_cable_length__mutmut_8': x_compute_tank_cable_length__mutmut_8, 
    'x_compute_tank_cable_length__mutmut_9': x_compute_tank_cable_length__mutmut_9, 
    'x_compute_tank_cable_length__mutmut_10': x_compute_tank_cable_length__mutmut_10, 
    'x_compute_tank_cable_length__mutmut_11': x_compute_tank_cable_length__mutmut_11, 
    'x_compute_tank_cable_length__mutmut_12': x_compute_tank_cable_length__mutmut_12, 
    'x_compute_tank_cable_length__mutmut_13': x_compute_tank_cable_length__mutmut_13, 
    'x_compute_tank_cable_length__mutmut_14': x_compute_tank_cable_length__mutmut_14, 
    'x_compute_tank_cable_length__mutmut_15': x_compute_tank_cable_length__mutmut_15, 
    'x_compute_tank_cable_length__mutmut_16': x_compute_tank_cable_length__mutmut_16, 
    'x_compute_tank_cable_length__mutmut_17': x_compute_tank_cable_length__mutmut_17, 
    'x_compute_tank_cable_length__mutmut_18': x_compute_tank_cable_length__mutmut_18, 
    'x_compute_tank_cable_length__mutmut_19': x_compute_tank_cable_length__mutmut_19, 
    'x_compute_tank_cable_length__mutmut_20': x_compute_tank_cable_length__mutmut_20, 
    'x_compute_tank_cable_length__mutmut_21': x_compute_tank_cable_length__mutmut_21, 
    'x_compute_tank_cable_length__mutmut_22': x_compute_tank_cable_length__mutmut_22, 
    'x_compute_tank_cable_length__mutmut_23': x_compute_tank_cable_length__mutmut_23, 
    'x_compute_tank_cable_length__mutmut_24': x_compute_tank_cable_length__mutmut_24, 
    'x_compute_tank_cable_length__mutmut_25': x_compute_tank_cable_length__mutmut_25, 
    'x_compute_tank_cable_length__mutmut_26': x_compute_tank_cable_length__mutmut_26, 
    'x_compute_tank_cable_length__mutmut_27': x_compute_tank_cable_length__mutmut_27, 
    'x_compute_tank_cable_length__mutmut_28': x_compute_tank_cable_length__mutmut_28, 
    'x_compute_tank_cable_length__mutmut_29': x_compute_tank_cable_length__mutmut_29, 
    'x_compute_tank_cable_length__mutmut_30': x_compute_tank_cable_length__mutmut_30, 
    'x_compute_tank_cable_length__mutmut_31': x_compute_tank_cable_length__mutmut_31, 
    'x_compute_tank_cable_length__mutmut_32': x_compute_tank_cable_length__mutmut_32, 
    'x_compute_tank_cable_length__mutmut_33': x_compute_tank_cable_length__mutmut_33, 
    'x_compute_tank_cable_length__mutmut_34': x_compute_tank_cable_length__mutmut_34, 
    'x_compute_tank_cable_length__mutmut_35': x_compute_tank_cable_length__mutmut_35, 
    'x_compute_tank_cable_length__mutmut_36': x_compute_tank_cable_length__mutmut_36, 
    'x_compute_tank_cable_length__mutmut_37': x_compute_tank_cable_length__mutmut_37, 
    'x_compute_tank_cable_length__mutmut_38': x_compute_tank_cable_length__mutmut_38, 
    'x_compute_tank_cable_length__mutmut_39': x_compute_tank_cable_length__mutmut_39, 
    'x_compute_tank_cable_length__mutmut_40': x_compute_tank_cable_length__mutmut_40, 
    'x_compute_tank_cable_length__mutmut_41': x_compute_tank_cable_length__mutmut_41, 
    'x_compute_tank_cable_length__mutmut_42': x_compute_tank_cable_length__mutmut_42, 
    'x_compute_tank_cable_length__mutmut_43': x_compute_tank_cable_length__mutmut_43, 
    'x_compute_tank_cable_length__mutmut_44': x_compute_tank_cable_length__mutmut_44, 
    'x_compute_tank_cable_length__mutmut_45': x_compute_tank_cable_length__mutmut_45, 
    'x_compute_tank_cable_length__mutmut_46': x_compute_tank_cable_length__mutmut_46, 
    'x_compute_tank_cable_length__mutmut_47': x_compute_tank_cable_length__mutmut_47, 
    'x_compute_tank_cable_length__mutmut_48': x_compute_tank_cable_length__mutmut_48
}
x_compute_tank_cable_length__mutmut_orig.__name__ = 'x_compute_tank_cable_length'
