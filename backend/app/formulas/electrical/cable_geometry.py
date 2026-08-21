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


def compute_tank_cable_length(
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
