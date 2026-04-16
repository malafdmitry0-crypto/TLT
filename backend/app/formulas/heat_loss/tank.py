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


def _surface_area(params: TankHeatLossParams) -> float:
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
        length, w, h = params.length, params.width, params.height
        return 2 * (length * w + length * h + w * h)
    if params.shape == "spherical":
        if params.diameter is None:
            raise ValueError("Для сферы требуется diameter")
        return 4 * math.pi * (params.diameter / 2) ** 2
    raise ValueError(f"Неизвестная форма ёмкости: {params.shape}")


def _calc_alpha(params: TankHeatLossParams) -> float:
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


def calc_tank_heat_loss(
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
