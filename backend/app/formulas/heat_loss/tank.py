"""Расчёт теплопотерь ёмкости.

Формула (плоская стенка, источник: ТНП):
  q = ΔT / (δ_р/λ_р + δ_из/λ_из + R_внеш)   [Вт/м²]
  Q = q × S × K                                 [Вт]

R_внеш (воздух):   R = 1 / α_внеш,    α = 11,6 + 7·√v  [Вт/(м²·К)]
R_внеш (помещение): R = 1 / 9.0

Подземное расположение:
  Q = (q_air × S_air + q_ground × S_ground) × K
  q_ground = ΔT / (δ_р/λ_р + Σδ_из/λ_из + h/λ_гр)
"""

import math
from typing import Any

from app.formulas.heat_loss.common import (
    location_key,
    merge_coefficients,
    validate_positive,
    validate_temperature_range,
)
from app.reference_data.loader import get_insulation_conductivity
from app.schemas.calculation import InsulationLayer, TankHeatLossParams, TankHeatLossResult


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


def _surface_area_split(params: TankHeatLossParams, buried_height: float) -> tuple[float, float]:
    """Площади надземной и подземной частей резервуара по ТНП.

    Возвращает `(S_air, S_ground)`.
    """
    if params.height is None:
        raise ValueError("Для подземного резервуара требуется height")
    h_total = params.height
    if buried_height > h_total:
        raise ValueError("Высота подземной части не может превышать высоту резервуара")

    h_air = h_total - buried_height
    if params.shape == "cylindrical":
        if params.diameter is None:
            raise ValueError("Для цилиндра требуется diameter")
        d = params.diameter
        cap_area = math.pi * d**2 / 4
        return cap_area + math.pi * d * h_air, cap_area + math.pi * d * buried_height

    if params.shape == "rectangular":
        if params.length is None or params.width is None:
            raise ValueError("Для параллелепипеда требуются length, width, height")
        length, width = params.length, params.width
        cap_area = length * width
        perimeter_area_factor = 2 * (length + width)
        return (
            perimeter_area_factor * h_air + cap_area,
            perimeter_area_factor * buried_height + cap_area,
        )

    raise ValueError(
        "Подземный расчёт резервуара задан в ТНП для круглого и прямоугольного сечения"
    )


def _calc_alpha(params: TankHeatLossParams) -> float:
    """Коэффициент наружной теплоотдачи α, Вт/(м²·К).

    α = 11,6 + 7·√v  (SNiP 41-03-2003, формула ТНП)
    Помещение: α = 9.0
    Диапазон: [11.6, 52] Вт/(м²·К)
    """
    if params.alpha_vnesh is not None:
        return params.alpha_vnesh
    if params.location == "indoor":
        return 9.0
    v = max(params.wind_speed or 0.0, 0.0)
    alpha = 11.6 + 7.0 * math.sqrt(v)
    return min(max(alpha, 11.6), 52.0)


def _resolve_layers(params: TankHeatLossParams) -> list[InsulationLayer]:
    if params.insulation_layers:
        return list(params.insulation_layers)
    return [
        InsulationLayer(
            thickness=params.insulation_thickness,
            material=params.insulation_material,
        )
    ]


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
        4. Для подземной части: r_ground = h / λ_гр
        5. q = ΔT / r_total (Вт/м², БЕЗ safety_factor)
        6. S — площадь по форме или раздельно S_air/S_ground
        7. Q = q · S · K или (q_air·S_air + q_ground·S_ground)·K

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
    r_ins = 0.0
    layers = _resolve_layers(params)
    if len(layers) > 3:
        raise ValueError("Максимальное количество слоёв изоляции: 3 (N_iz ≤ 3)")
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина изоляции слоя {i + 1}", layer.thickness)
        lambda_ins = (
            layer.conductivity
            if layer.conductivity is not None
            else get_insulation_conductivity(
                material=layer.material,
                temperature=t_mean,
            )
        )
        validate_positive(f"Теплопроводность изоляции слоя {i + 1}", lambda_ins)
        r_ins += layer.thickness / lambda_ins

    # --- 3. Внешнее сопротивление ---
    alpha = _calc_alpha(params)
    r_ext = 1.0 / alpha

    # --- 7. Коэффициент запаса ---
    merged = merge_coefficients(coefficients)
    k = params.safety_factor or merged.get("safety_factor", 1.1)
    location_factor = merged.get(location_key(params.location), 1.0)

    r_common = r_wall + r_ins
    buried_height = params.burial_depth or 0.0
    lambda_gr: float | None = None
    r_ground: float | None = None
    s_air: float | None = None
    s_ground: float | None = None
    q_air: float | None = None
    q_ground: float | None = None
    if buried_height > 0:
        lambda_gr = params.ground_conductivity or merged.get("ground_conductivity", 1.5)
        validate_positive("Теплопроводность грунта", lambda_gr)
        s_air, s_ground = _surface_area_split(params, buried_height)
        q_air = delta_t / (r_common + r_ext)
        r_ground = buried_height / lambda_gr
        q_ground = delta_t / (r_common + r_ground)
        area = s_air + s_ground
        q_total = (q_air * s_air + q_ground * s_ground) * k * location_factor
        q_per_m2 = (q_air * s_air + q_ground * s_ground) / area
    else:
        # --- 4–5. Тепловой поток на м² ---
        r_total = r_common + r_ext
        q_per_m2 = delta_t / r_total

        # --- 6. Площадь ---
        area = _surface_area(params)

        # --- 8. Итоговые теплопотери ---
        q_total = q_per_m2 * area * k * location_factor

    q_additional = getattr(params, "q_additional", 0.0) or 0.0
    q_total += q_additional

    return TankHeatLossResult(
        heat_loss_per_m2=round(q_per_m2, 3),
        total_heat_loss=round(q_total, 3),
        surface_area=round(area, 3),
        q_additional=round(q_additional, 3),
        wall_resistance=round(r_wall, 6),
        insulation_resistance=round(r_ins, 6),
        external_resistance=round(r_ext, 6),
        ground_resistance=round(r_ground, 6) if r_ground is not None else None,
        alpha_vnesh=round(alpha, 3),
        wind_speed=params.wind_speed,
        ground_conductivity=round(lambda_gr, 3) if lambda_gr is not None else None,
        safety_factor=round(k, 3),
        location_factor=round(location_factor, 3),
        air_surface_area=round(s_air, 3) if s_air is not None else None,
        ground_surface_area=round(s_ground, 3) if s_ground is not None else None,
        heat_loss_air_per_m2=round(q_air, 3) if q_air is not None else None,
        heat_loss_ground_per_m2=round(q_ground, 3) if q_ground is not None else None,
    )
