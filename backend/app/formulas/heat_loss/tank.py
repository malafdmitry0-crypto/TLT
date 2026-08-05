"""Расчёт теплопотерь резервуара.

Цилиндрическая и прямоугольная формы используют удельные сопротивления
плоской стенки (источник: ТНП):
  q = ΔT / (δ_р/λ_р + δ_из/λ_из + R_внеш)   [Вт/м²]
  Q = q × S × K + Q_доп                          [Вт]

R_внеш (воздух):   R = 1 / α_внеш,    α = 11,6 + 7·√v  [Вт/(м²·К)]
R_внеш (помещение): R = 1 / 9.0

Подземное расположение:
  Q = (q_air × S_air + q_ground × S_ground) × K
  q_ground = ΔT / (δ_р/λ_р + Σδ_из/λ_из + h/λ_гр)
"""

import math
from dataclasses import dataclass
from typing import Any

from app.formulas.heat_loss.common import validate_positive, validate_temperature_range
from app.formulas.heat_loss.insulation import resolve_insulation_tm
from app.reference_data.loader import get_insulation_conductivity, get_insulation_temperature_range
from app.schemas.calculation import InsulationLayer, TankHeatLossParams, TankHeatLossResult


@dataclass(frozen=True)
class _LayerResistance:
    layer: InsulationLayer
    resistance: float
    conductivity: float
    conductivity_source: str


def _fmt_temp(value: float) -> str:
    return f"{value:g}"


def _layer_temperature_range(layer: InsulationLayer) -> tuple[float, float]:
    if layer.material == "other":
        if layer.temperature_range is None:
            raise ValueError(
                "Для материала изоляции 'other' необходимо задать temperature_range слоя"
            )
        min_temp, max_temp = layer.temperature_range
        return float(min_temp), float(max_temp)
    return get_insulation_temperature_range(layer.material)


def _validate_layer_temperature_interval(
    layer: InsulationLayer,
    *,
    index: int,
    t_hot: float,
    t_cold: float,
) -> None:
    min_temp, max_temp = _layer_temperature_range(layer)
    layer_hot_side = max(t_hot, t_cold)
    if min_temp <= layer_hot_side <= max_temp:
        return
    raise ValueError(
        f"Температура горячей стороны слоя изоляции #{index + 1} "
        f"({_fmt_temp(layer_hot_side)} °C) вне диапазона "
        f"материала '{layer.material}': {_fmt_temp(min_temp)}…{_fmt_temp(max_temp)} °C"
    )


def _validate_layer_temperatures(
    layer_resistances: list[_LayerResistance],
    *,
    heat_flux: float,
    hot_side_temperature: float,
) -> None:
    current_temperature = hot_side_temperature
    for index, layer_resistance in enumerate(layer_resistances):
        next_temperature = current_temperature - heat_flux * layer_resistance.resistance
        _validate_layer_temperature_interval(
            layer_resistance.layer,
            index=index,
            t_hot=current_temperature,
            t_cold=next_temperature,
        )
        current_temperature = next_temperature


def _surface_area(params: TankHeatLossParams) -> float:
    """Площадь внешней поверхности ёмкости, м².

    Цилиндр:       S = π·d·H + 2·π·(d/2)²   (боковая + 2 крышки)
    Параллелепипед: S = 2·(L·W + L·H + W·H)
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
    Ручной ``alpha_vnesh`` сохраняется как разрешённый параметрический ввод.
    """
    if params.alpha_vnesh is not None:
        return params.alpha_vnesh
    if params.placement == "indoor":
        return 9.0
    if params.wind_speed is None:
        raise ValueError("Для автоматического alpha_vnesh требуется wind_speed")
    v = max(params.wind_speed, 0.0)
    return 11.6 + 7.0 * math.sqrt(v)


def _resolve_layers(params: TankHeatLossParams) -> list[InsulationLayer]:
    return list(params.insulation_layers)


def _r_insulation_layers(
    layers: list[InsulationLayer],
    insulation_tm: float,
) -> tuple[float, list[_LayerResistance]]:
    r_ins = 0.0
    layer_resistances: list[_LayerResistance] = []
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина изоляции слоя {i + 1}", layer.thickness)
        if layer.material == "other":
            if layer.conductivity is None:
                raise ValueError("Для материала изоляции 'other' необходимо задать λ слоя")
            lambda_ins = layer.conductivity
            conductivity_source = "manual"
        else:
            lambda_ins = get_insulation_conductivity(
                material=layer.material,
                temperature=insulation_tm,
            )
            conductivity_source = "reference_data"
        validate_positive(f"Теплопроводность изоляции слоя {i + 1}", lambda_ins)
        resistance = layer.thickness / lambda_ins
        r_ins += resistance
        layer_resistances.append(
            _LayerResistance(
                layer=layer,
                resistance=resistance,
                conductivity=lambda_ins,
                conductivity_source=conductivity_source,
            )
        )
    return r_ins, layer_resistances


def calc_tank_heat_loss(
    params: TankHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> TankHeatLossResult:
    """Рассчитать теплопотери резервуара по модели, соответствующей форме.

    Алгоритм cylindrical/rectangular:
        1. r_wall = δ_р / λ_р (если заданы толщина и λ стенки)
        2. r_ins  = δ_из / λ_из  (изоляция — плоская стенка)
        3. r_ext  = 1 / α_внеш   (α = 11.6 + 7·sqrt(v) на улице, 9.0 в помещении)
        4. Для подземной части: r_ground = h / λ_гр
        5. q = ΔT / r_total (Вт/м², БЕЗ safety_factor)
        6. S — площадь по форме или раздельно S_air/S_ground
        7. Q = q · S · K + Q_доп или
           (q_air·S_air + q_ground·S_ground)·K + Q_доп

    Args:
        params: валидированные параметры ёмкости. Требует указать геометрию,
            подходящую под `shape`: cylinder (d+h), rectangular (l+w+h).
        coefficients: аналогично `calc_pipe_heat_loss`.

    Returns:
        TankHeatLossResult: base/design values for q and Q and the bare
        geometric surface area.

    Raises:
        ValueError: невалидная форма, отсутствие обязательной геометрии,
            невалидные температуры/толщины.

    See Also:
        backend formula unit tests / golden cases
    """
    if params.ambient_temperature is None:
        raise ValueError("Для резервуара требуется ambient_temperature")
    validate_temperature_range(params.ambient_temperature, params.process_temperature)

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
    insulation_tm = resolve_insulation_tm(
        process_temperature=params.process_temperature,
        basis=params.insulation_temperature_basis,
        location="indoor" if params.placement == "indoor" else "outdoor",
        placement=params.placement,
    )
    r_ins, layer_resistances = _r_insulation_layers(layers, insulation_tm)

    # --- 3. Внешнее сопротивление ---
    alpha = _calc_alpha(params)
    r_ext = 1.0 / alpha

    # --- 7. Коэффициент запаса ---
    k = params.safety_factor

    r_common = r_wall + r_ins
    buried_height = params.tank_buried_height or 0.0
    lambda_gr: float | None = None
    r_ground: float | None = None
    s_air: float | None = None
    s_ground: float | None = None
    q_air: float | None = None
    q_ground: float | None = None
    if buried_height > 0:
        if params.ground_temperature is None:
            raise ValueError("Для underground требуется ground_temperature")
        if params.ground_conductivity is None:
            raise ValueError("Для underground требуется ground_conductivity")
        lambda_gr = params.ground_conductivity
        validate_positive("Теплопроводность грунта", lambda_gr)
        s_air, s_ground = _surface_area_split(params, buried_height)
        q_air = (params.process_temperature - params.ambient_temperature) / (r_common + r_ext)
        r_ground = buried_height / lambda_gr
        q_ground = (params.process_temperature - params.ground_temperature) / (r_common + r_ground)
        for heat_flux in (q_air, q_ground):
            _validate_layer_temperatures(
                layer_resistances,
                heat_flux=heat_flux,
                hot_side_temperature=params.process_temperature - heat_flux * r_wall,
            )
        area = s_air + s_ground
        q_base_total = q_air * s_air + q_ground * s_ground
        q_total = q_base_total * k
        q_per_m2 = q_base_total / area
        effective_resistance = (params.process_temperature - params.ambient_temperature) / q_per_m2
    else:
        # --- 4–5. Тепловой поток на м² ---
        r_total = r_common + r_ext
        delta_t = params.process_temperature - params.ambient_temperature
        q_per_m2 = delta_t / r_total
        _validate_layer_temperatures(
            layer_resistances,
            heat_flux=q_per_m2,
            hot_side_temperature=params.process_temperature - q_per_m2 * r_wall,
        )

        # --- 6. Площадь ---
        area = _surface_area(params)

        # --- 8. Итоговые теплопотери ---
        q_base_total = q_per_m2 * area
        q_total = q_base_total * k
        effective_resistance = r_total

    q_additional = getattr(params, "q_additional", 0.0) or 0.0
    q_total += q_additional

    return TankHeatLossResult(
        total_heat_loss_base=q_base_total,
        total_heat_loss_design=q_total,
        heat_loss_per_m2_bare_base=q_per_m2,
        heat_loss_per_m2_bare_design=q_total / area,
        surface_area_bare=area,
        thermal_resistance_areal_bare=None if buried_height > 0 else effective_resistance,
        wall_resistance_areal_bare=r_wall,
        insulation_resistance_areal_bare=r_ins,
        external_resistance_areal_bare=r_ext,
        ground_resistance_areal_bare=r_ground,
        alpha_vnesh_applied=alpha,
        wind_speed_applied=(
            params.wind_speed
            if params.alpha_vnesh is None and params.placement != "indoor"
            else None
        ),
        ground_conductivity_applied=lambda_gr,
        safety_factor_applied=k,
        q_additional_applied=q_additional,
        air_surface_area=s_air,
        ground_surface_area=s_ground,
        heat_loss_air_base=(
            q_air * s_air if q_air is not None and s_air is not None else None
        ),
        heat_loss_ground_base=(
            q_ground * s_ground if q_ground is not None and s_ground is not None else None
        ),
        formula_model="tank_heat_loss",
        formula_model_version="3",
        model_assumptions=["plane_wall_resistance_for_cylindrical_and_rectangular_tank"],
        process_temperature_applied=params.process_temperature,
        ambient_temperature_applied=params.ambient_temperature,
        ground_temperature_applied=params.ground_temperature if buried_height > 0 else None,
        insulation_layers_applied=[
            {
                "index": index,
                "thickness": layer_resistance.layer.thickness,
                "material": layer_resistance.layer.material,
                "conductivity_applied": layer_resistance.conductivity,
                "conductivity_source": layer_resistance.conductivity_source,
                "conductivity_temperature_applied": insulation_tm,
                "resistance": layer_resistance.resistance,
                "resistance_unit": "m2*K/W",
            }
            for index, layer_resistance in enumerate(layer_resistances, start=1)
        ],
        input_units={
            "diameter": "m",
            "height": "m",
            "length": "m",
            "width": "m",
            "wall_thickness": "m",
            "wall_lambda": "W/(m*K)",
            "insulation_layers.thickness": "m",
            "insulation_layers.conductivity": "W/(m*K)",
            "ambient_temperature": "degC",
            "process_temperature": "degC",
            "tank_buried_height": "m",
            "ground_temperature": "degC",
            "wind_speed": "m/s",
            "alpha_vnesh": "W/(m2*K)",
            "ground_conductivity": "W/(m*K)",
            "safety_factor": "1",
            "q_additional": "W",
        },
        applied_units={
            "heat_loss_per_m2_bare_base": "W/m2",
            "heat_loss_per_m2_bare_design": "W/m2",
            "total_heat_loss_base": "W",
            "total_heat_loss_design": "W",
            "surface_area_bare": "m2",
            "thermal_resistance_areal_bare": "m2*K/W",
            "wall_resistance_areal_bare": "m2*K/W",
            "insulation_resistance_areal_bare": "m2*K/W",
            "external_resistance_areal_bare": "m2*K/W",
            "ground_resistance_areal_bare": "m2*K/W",
            "air_surface_area": "m2",
            "ground_surface_area": "m2",
            "heat_loss_air_base": "W",
            "heat_loss_ground_base": "W",
            "alpha_vnesh_applied": "W/(m2*K)",
            "wind_speed_applied": "m/s",
            "ground_conductivity_applied": "W/(m*K)",
            "safety_factor_applied": "1",
            "q_additional_applied": "W",
        },
        source_corrections=[
            "tank_external_resistance_is_areal_inverse_alpha",
            "tank_air_and_ground_temperatures_are_separate",
            "tank_additional_load_is_applied_after_safety_factor",
        ],
    )
