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

from dataclasses import dataclass
from typing import Any, cast

from app.formulas.heat_loss.core.errors import FormulaDomainError
from app.formulas.heat_loss.core.tank import (
    AirTankHeatLossInput,
    BuriedTankHeatLossInput,
    CylindricalTankGeometry,
    RectangularTankGeometry,
    TankInsulationLayer,
    TankLayerBoundaryTemperature,
    calculate_air_tank_heat_loss,
    calculate_buried_tank_heat_loss,
)
from app.formulas.heat_loss.core.thermal import alpha_from_wind, clamp_minimum, higher_temperature
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
        min_temp, max_temp = cast(tuple[float, float], layer.temperature_range)
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
    layer_hot_side = higher_temperature(t_hot, t_cold)
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
    layer_boundary_temperatures: tuple[TankLayerBoundaryTemperature, ...],
) -> None:
    for index, (layer_resistance, boundary) in enumerate(
        zip(layer_resistances, layer_boundary_temperatures, strict=True)
    ):
        _validate_layer_temperature_interval(
            layer_resistance.layer,
            index=index,
            t_hot=boundary.hot_side_c,
            t_cold=boundary.cold_side_c,
        )


def _calc_alpha(params: TankHeatLossParams) -> float:
    """Коэффициент наружной теплоотдачи α, Вт/(м²·К).

    α = 11,6 + 7·√v  (SNiP 41-03-2003, формула ТНП)
    Помещение: α = 9.0
    """
    if params.placement == "indoor":
        return 9.0
    wind_speed = cast(float, params.wind_speed)
    return alpha_from_wind(
        clamp_minimum(wind_speed, minimum=0.0),
        intercept=11.6,
        sqrt_coefficient=7.0,
    )


def _resolve_layers(params: TankHeatLossParams) -> list[InsulationLayer]:
    return list(params.insulation_layers)


def _tank_geometry(
    params: TankHeatLossParams,
) -> CylindricalTankGeometry | RectangularTankGeometry:
    if params.shape == "cylindrical":
        return CylindricalTankGeometry(
            diameter_m=cast(float, params.diameter),
            height_m=cast(float, params.height),
        )
    return RectangularTankGeometry(
        length_m=cast(float, params.length),
        width_m=cast(float, params.width),
        height_m=cast(float, params.height),
    )


def _resolve_layer_resistances(
    layers: list[InsulationLayer],
    insulation_tm: float,
) -> list[tuple[InsulationLayer, float, str]]:
    resolved_layers: list[tuple[InsulationLayer, float, str]] = []
    for layer in layers:
        if layer.material == "other":
            lambda_ins = cast(float, layer.conductivity)
            conductivity_source = "manual"
        else:
            lambda_ins = get_insulation_conductivity(
                material=layer.material,
                temperature=insulation_tm,
            )
            conductivity_source = "reference_data"
        resolved_layers.append((layer, lambda_ins, conductivity_source))
    return resolved_layers


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
        ValueError: ошибка справочных данных, допустимости рассчитанной
            температуры слоя или численной области формулы.

    See Also:
        backend formula unit tests / golden cases
    """
    ambient_temperature = cast(float, params.ambient_temperature)

    # The facade keeps reference-data resolution. The core receives only
    # resolved numeric SI values.
    wall_thickness = 0.0
    wall_conductivity = 1.0
    if params.wall_thickness is not None and params.wall_lambda is not None:
        wall_thickness = params.wall_thickness
        wall_conductivity = params.wall_lambda

    layers = _resolve_layers(params)
    insulation_tm = resolve_insulation_tm(
        process_temperature=params.process_temperature,
        basis=params.insulation_temperature_basis,
        location="indoor" if params.placement == "indoor" else "outdoor",
        placement=params.placement,
    )
    resolved_layers = _resolve_layer_resistances(layers, insulation_tm)
    numeric_layers = tuple(
        TankInsulationLayer(thickness_m=layer.thickness, conductivity_w_mk=conductivity)
        for layer, conductivity, _ in resolved_layers
    )
    alpha = _calc_alpha(params)
    k = params.safety_factor
    buried_height = params.tank_buried_height or 0.0
    q_additional = getattr(params, "q_additional", 0.0) or 0.0
    if buried_height > 0:
        ground_temperature = cast(float, params.ground_temperature)
        ground_conductivity = cast(float, params.ground_conductivity)
        try:
            core_result = calculate_buried_tank_heat_loss(
                BuriedTankHeatLossInput(
                    geometry=_tank_geometry(params),
                    wall_thickness_m=wall_thickness,
                    wall_conductivity_w_mk=wall_conductivity,
                    insulation_layers=numeric_layers,
                    process_temperature_c=params.process_temperature,
                    ambient_temperature_c=ambient_temperature,
                    ground_temperature_c=ground_temperature,
                    external_alpha_w_m2k=alpha,
                    buried_height_m=buried_height,
                    ground_conductivity_w_mk=ground_conductivity,
                    safety_factor=k,
                    additional_heat_loss_w=q_additional,
                )
            )
        except FormulaDomainError as exc:
            raise ValueError(str(exc)) from exc
    else:
        try:
            core_result = calculate_air_tank_heat_loss(
                AirTankHeatLossInput(
                    geometry=_tank_geometry(params),
                    wall_thickness_m=wall_thickness,
                    wall_conductivity_w_mk=wall_conductivity,
                    insulation_layers=numeric_layers,
                    process_temperature_c=params.process_temperature,
                    ambient_temperature_c=ambient_temperature,
                    external_alpha_w_m2k=alpha,
                    safety_factor=k,
                    additional_heat_loss_w=q_additional,
                )
            )
        except FormulaDomainError as exc:
            raise ValueError(str(exc)) from exc

    layer_resistances = [
        _LayerResistance(
            layer=layer,
            resistance=resistance,
            conductivity=conductivity,
            conductivity_source=conductivity_source,
        )
        for (layer, conductivity, conductivity_source), resistance in zip(
            resolved_layers,
            core_result.layer_resistances_areal_m2k_w,
            strict=True,
        )
    ]
    _validate_layer_temperatures(
        layer_resistances,
        layer_boundary_temperatures=core_result.air_layer_boundary_temperatures,
    )
    if buried_height > 0:
        _validate_layer_temperatures(
            layer_resistances,
            layer_boundary_temperatures=core_result.ground_layer_boundary_temperatures,
        )

    return TankHeatLossResult(
        total_heat_loss_base=core_result.total_heat_loss_base_w,
        total_heat_loss_design=core_result.total_heat_loss_design_w,
        heat_loss_per_m2_bare_base=core_result.heat_loss_per_m2_base_w_m2,
        heat_loss_per_m2_bare_design=core_result.heat_loss_per_m2_design_w_m2,
        surface_area_bare=core_result.surface_area_m2,
        thermal_resistance_areal_bare=core_result.thermal_resistance_areal_m2k_w,
        wall_resistance_areal_bare=core_result.wall_resistance_areal_m2k_w,
        insulation_resistance_areal_bare=core_result.insulation_resistance_areal_m2k_w,
        external_resistance_areal_bare=core_result.external_resistance_areal_m2k_w,
        ground_resistance_areal_bare=core_result.ground_resistance_areal_m2k_w,
        alpha_vnesh_applied=alpha,
        wind_speed_applied=(params.wind_speed if params.placement != "indoor" else None),
        ground_conductivity_applied=(params.ground_conductivity if buried_height > 0 else None),
        safety_factor_applied=k,
        q_additional_applied=q_additional,
        air_surface_area=core_result.air_surface_area_m2,
        ground_surface_area=core_result.ground_surface_area_m2,
        heat_loss_air_base=core_result.heat_loss_air_base_w,
        heat_loss_ground_base=core_result.heat_loss_ground_base_w,
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
