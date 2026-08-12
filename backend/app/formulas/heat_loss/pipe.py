"""Расчёт теплопотерь трубопровода.

Формула: многослойная цилиндрическая стенка (закон Фурье).

q_linear = ΔT / R_total  [Вт/м]
q_total  = q_linear · L_eff · K  [Вт]

где R_total = R_wall + ΣR_ins_i + R_external (или R_ground для подземных)

Источник: спецификация параметров теплотехнических расчётов, таблица 1–2.
"""

from dataclasses import dataclass
from typing import Any

from app.formulas.heat_loss.common import (
    merge_coefficients,
    validate_positive,
    validate_temperature_range,
)
from app.formulas.heat_loss.core.errors import FormulaDomainError
from app.formulas.heat_loss.core.pipe import (
    AbovegroundPipeInput,
    PipeInsulationLayer,
    PipeLayerBoundaryTemperature,
    UndergroundPipeInput,
    calculate_aboveground_pipe,
    calculate_underground_pipe,
)
from app.formulas.heat_loss.core.thermal import alpha_from_wind
from app.formulas.heat_loss.insulation import resolve_insulation_tm
from app.reference_data.loader import (
    get_insulation_conductivity,
    get_insulation_temperature_range,
    get_pipe_material_lambda,
)
from app.schemas.calculation import InsulationLayer, PipeHeatLossParams, PipeHeatLossResult


def pipe_material_lambda(material: str | None, temperature: float) -> float:
    """Теплопроводность материала трубы λ(T), Вт/(м·К).

    Args:
        material: ключ из справочника `pipe_materials.json`
        temperature: средняя температура стенки, °C
    """
    return get_pipe_material_lambda(material, temperature)


# ---------------------------------------------------------------------------
# Коэффициент наружной теплоотдачи из скорости ветра
# ---------------------------------------------------------------------------


def calc_alpha_vnesh(wind_speed: float | None, placement: str) -> float:
    """Коэффициент наружной теплоотдачи α, Вт/(м²·К).

    Для помещения: α = 9.0 (свободная конвекция)
    Для улицы: α = 11,6 + 7·√v  (SNiP 41-03-2003, формула для трубопроводов)
    """
    if placement == "indoor":
        return 9.0
    if wind_speed is None:
        raise ValueError("Для outdoor auto требуется wind_speed")
    return alpha_from_wind(
        max(wind_speed, 0.0),
        intercept=11.6,
        sqrt_coefficient=7.0,
    )


# ---------------------------------------------------------------------------
# Слои изоляции: нормализация к единому формату
# ---------------------------------------------------------------------------


def _resolve_layers(params: PipeHeatLossParams) -> list[InsulationLayer]:
    """Return the canonical non-empty insulation layer list."""
    return list(params.insulation_layers)


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
    layer_boundary_temperatures: tuple[PipeLayerBoundaryTemperature, ...],
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


def _raise_pipe_core_error(error: FormulaDomainError) -> None:
    """Translate numeric-domain failures back to the established facade errors."""
    if error.code == "wall_exceeds_pipe_radius":
        wall_thickness = float(error.details["wall_thickness_m"])
        outer_radius = float(error.details["outer_radius_m"])
        raise ValueError(
            f"Толщина стенки ({wall_thickness * 1000:.1f} мм) превышает радиус трубы "
            f"({outer_radius * 1000:.1f} мм)"
        ) from error
    if error.code == "ground_centerline_inside_pipe":
        centerline_depth = float(error.details["centerline_depth_m"])
        outer_radius = float(error.details["outer_radius_m"])
        raise ValueError(
            f"Глубина оси H={centerline_depth:.2f} м меньше наружного радиуса изоляции "
            f"r={outer_radius:.3f} м — труба не помещается в грунт"
        ) from error
    raise ValueError(str(error)) from error


# ---------------------------------------------------------------------------
# Главная функция
# ---------------------------------------------------------------------------


def calc_pipe_heat_loss(
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
           - надземно: `R = 1 / (2π·r_out·α)` где `α = 11.6 + 7·√v`
           - подземно: `R = arccosh(H/r_out) / (2π·λ_gr)`
        4. q_linear = ΔT / R_total (без safety_factor!)
        5. L_eff = L + n_i · L_ekv (с учётом локальных элементов)
        6. Q_total = q_linear · L_eff · K (safety_factor применяется ЗДЕСЬ)

    Args:
        params: валидированные параметры трубопровода. Инварианты: наличие
            insulation_layers (1–3 слоя), ΔT > 0, L > 0.
        coefficients: `safety_factor` и `ground_conductivity`. Приоритет:
            `params.safety_factor` > coefficients >
            DEFAULT_COEFFICIENTS.

    Returns:
        PipeHeatLossResult: base/design values for q and Q, `effective_length`
        (L_eff), and `thermal_resistance` (R_total).

    Raises:
        ValueError: невалидные входы (отрицательные/нулевые размеры, слишком
            толстая стенка, H < r_out для подземной прокладки).

    See Also:
        golden cases in unit tests
        docs/context/formulas-summary.md — краткий справочник
    """
    validate_positive("Наружный диаметр", params.outer_diameter)
    validate_positive("Длина трубы", params.pipe_length)
    layers = _resolve_layers(params)
    for i, layer in enumerate(layers):
        validate_positive(f"Толщина слоя изоляции #{i + 1}", layer.thickness)

    environment_temperature = (
        params.ground_temperature
        if params.placement == "underground"
        else params.ambient_temperature
    )
    assert environment_temperature is not None
    validate_temperature_range(environment_temperature, params.process_temperature)
    t_mean = (params.process_temperature + environment_temperature) / 2.0
    wall_conductivity = (
        params.pipe_lambda
        if params.pipe_lambda is not None
        else pipe_material_lambda(params.pipe_material, t_mean)
    )
    insulation_tm = resolve_insulation_tm(
        process_temperature=params.process_temperature,
        basis=params.insulation_temperature_basis,
        location=None,
        placement=params.placement,
    )
    resolved_layers: list[tuple[InsulationLayer, float, str]] = []
    for layer in layers:
        if layer.material == "other":
            if layer.conductivity is None:
                raise ValueError("Для материала изоляции 'other' необходимо задать λ слоя")
            conductivity = layer.conductivity
            conductivity_source = "manual"
        else:
            conductivity = get_insulation_conductivity(layer.material, insulation_tm)
            conductivity_source = "reference_data"
        resolved_layers.append((layer, conductivity, conductivity_source))

    merged_coeffs = merge_coefficients(coefficients)
    alpha: float | None = None
    lambda_gr: float | None = None
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)
    numeric_layers = tuple(
        PipeInsulationLayer(thickness_m=layer.thickness, conductivity_w_mk=conductivity)
        for layer, conductivity, _ in resolved_layers
    )
    if params.placement == "underground":
        assert params.pipe_centerline_depth is not None
        assert params.ground_conductivity is not None
        assert params.ground_temperature is not None
        lambda_gr = params.ground_conductivity
        try:
            core_result = calculate_underground_pipe(
                UndergroundPipeInput(
                    outer_diameter_m=params.outer_diameter,
                    wall_thickness_m=params.wall_thickness,
                    wall_conductivity_w_mk=wall_conductivity,
                    insulation_layers=numeric_layers,
                    process_temperature_c=params.process_temperature,
                    ground_temperature_c=params.ground_temperature,
                    pipe_length_m=params.pipe_length,
                    local_elements_count=params.num_local_elements,
                    local_element_equiv_length_m=params.local_element_equiv_length or 0.0,
                    safety_factor=k,
                    centerline_depth_m=params.pipe_centerline_depth,
                    ground_conductivity_w_mk=lambda_gr,
                )
            )
        except FormulaDomainError as exc:
            _raise_pipe_core_error(exc)
    else:
        assert params.ambient_temperature is not None
        alpha = calc_alpha_vnesh(params.wind_speed, params.placement)
        try:
            core_result = calculate_aboveground_pipe(
                AbovegroundPipeInput(
                    outer_diameter_m=params.outer_diameter,
                    wall_thickness_m=params.wall_thickness,
                    wall_conductivity_w_mk=wall_conductivity,
                    insulation_layers=numeric_layers,
                    process_temperature_c=params.process_temperature,
                    ambient_temperature_c=params.ambient_temperature,
                    pipe_length_m=params.pipe_length,
                    local_elements_count=params.num_local_elements,
                    local_element_equiv_length_m=params.local_element_equiv_length or 0.0,
                    safety_factor=k,
                    external_alpha_w_m2k=alpha,
                )
            )
        except FormulaDomainError as exc:
            _raise_pipe_core_error(exc)

    layer_resistances = [
        _LayerResistance(
            layer=layer,
            resistance=resistance,
            conductivity=conductivity,
            conductivity_source=conductivity_source,
        )
        for (layer, conductivity, conductivity_source), resistance in zip(
            resolved_layers,
            core_result.layer_resistances_mk_w,
            strict=True,
        )
    ]
    _validate_layer_temperatures(
        layer_resistances,
        layer_boundary_temperatures=core_result.layer_boundary_temperatures,
    )

    input_units = {
        "outer_diameter": "m",
        "wall_thickness": "m",
        "insulation_layers.thickness": "m",
        "process_temperature": "degC",
        "pipe_length": "m",
        "num_local_elements": "1",
        "local_element_equiv_length": "m",
        "safety_factor": "1",
    }
    if params.pipe_lambda is not None:
        input_units["pipe_lambda"] = "W/(m*K)"
    if any(layer.conductivity is not None for layer in layers):
        input_units["insulation_layers.conductivity"] = "W/(m*K)"
    if params.placement == "underground":
        input_units.update(
            {
                "pipe_centerline_depth": "m",
                "ground_temperature": "degC",
                "ground_conductivity": "W/(m*K)",
            }
        )
    else:
        input_units["ambient_temperature"] = "degC"
        if params.wind_speed is not None:
            input_units["wind_speed"] = "m/s"

    model_assumptions = [
        "steady_state_one_dimensional_radial_heat_flow",
        "uniform_equivalent_length_per_local_element",
    ]
    source_corrections = ["base_and_design_heat_losses_reported_separately"]
    if params.placement == "underground":
        model_assumptions.append("direct_buried_pipe_in_homogeneous_ground")
        source_corrections.append("ground_temperature_used_for_underground_pipe")
    elif params.placement == "outdoor":
        source_corrections.append("outdoor_auto_alpha_requires_explicit_wind_speed")

    return PipeHeatLossResult(
        heat_loss_per_meter_base=round(core_result.heat_loss_per_meter_base_w_m, 3),
        heat_loss_per_meter_design=round(core_result.heat_loss_per_meter_design_w_m, 3),
        total_heat_loss_base=round(core_result.total_heat_loss_base_w, 3),
        total_heat_loss_design=round(core_result.total_heat_loss_design_w, 3),
        effective_length=round(core_result.effective_length_m, 3),
        additional_equivalent_length=round(core_result.additional_equivalent_length_m, 3),
        thermal_resistance=round(core_result.thermal_resistance_mk_w, 6),
        wall_resistance=round(core_result.wall_resistance_mk_w, 6),
        insulation_resistance=round(core_result.insulation_resistance_mk_w, 6),
        external_resistance=round(core_result.external_resistance_mk_w, 6),
        alpha_vnesh_applied=round(alpha, 3) if alpha is not None else None,
        wind_speed_applied=(params.wind_speed if params.placement == "outdoor" else None),
        ground_conductivity_applied=(round(lambda_gr, 3) if lambda_gr is not None else None),
        safety_factor_applied=round(k, 3),
        local_elements_count_applied=params.num_local_elements,
        local_element_equiv_length_applied=round(params.local_element_equiv_length or 0.0, 3),
        formula_model="pipe_heat_loss",
        formula_model_version="2",
        model_assumptions=model_assumptions,
        process_temperature_applied=params.process_temperature,
        ambient_temperature_applied=(
            params.ambient_temperature if params.placement != "underground" else None
        ),
        ground_temperature_applied=(
            params.ground_temperature if params.placement == "underground" else None
        ),
        insulation_layers_applied=[
            {
                "index": index,
                "thickness": layer_resistance.layer.thickness,
                "material": layer_resistance.layer.material,
                "conductivity_applied": layer_resistance.conductivity,
                "conductivity_source": layer_resistance.conductivity_source,
                "conductivity_temperature_applied": insulation_tm,
                "resistance": layer_resistance.resistance,
                "resistance_unit": "m*K/W",
            }
            for index, layer_resistance in enumerate(layer_resistances, start=1)
        ],
        input_units=input_units,
        applied_units={
            "heat_loss_per_meter_base": "W/m",
            "heat_loss_per_meter_design": "W/m",
            "total_heat_loss_base": "W",
            "total_heat_loss_design": "W",
            "effective_length": "m",
            "additional_equivalent_length": "m",
            "thermal_resistance": "m*K/W",
            "wall_resistance": "m*K/W",
            "insulation_resistance": "m*K/W",
            "external_resistance": "m*K/W",
            "alpha_vnesh_applied": "W/(m2*K)",
            "ground_conductivity_applied": "W/(m*K)",
            "safety_factor_applied": "1",
        },
        source_corrections=source_corrections,
    )
