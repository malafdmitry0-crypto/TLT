"""Расчёт теплопотерь трубопровода.

Формула: многослойная цилиндрическая стенка (закон Фурье).

q_linear = ΔT / R_total  [Вт/м]
q_total  = q_linear · L_eff · K  [Вт]

где R_total = R_wall + ΣR_ins_i + R_external (или R_ground для подземных)

Источник: спецификация параметров теплотехнических расчётов, таблица 1–2.
"""

import math
from dataclasses import dataclass
from typing import Any

from app.formulas.heat_loss.common import (
    merge_coefficients,
    validate_positive,
    validate_temperature_range,
)
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
    Отдельный ручной ``alpha_vnesh`` допускается параметрическим контрактом.
    """
    if placement == "indoor":
        return 9.0
    if wind_speed is None:
        raise ValueError("Для outdoor auto требуется wind_speed")
    v = max(wind_speed, 0.0)
    return 11.6 + 7.0 * math.sqrt(v)


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


# ---------------------------------------------------------------------------
# Тепловые сопротивления
# ---------------------------------------------------------------------------


def _r_cylindrical(r_in: float, r_out: float, lam: float) -> float:
    """Термическое сопротивление цилиндрического слоя, м·К/Вт на единицу длины."""
    return math.log(r_out / r_in) / (2 * math.pi * lam)


def _r_wall(
    r_outer_pipe: float,
    wall_thickness: float,
    t_mean: float,
    material: str | None,
    lam_override: float | None,
) -> float:
    """Термическое сопротивление стенки трубы."""
    r_inner = r_outer_pipe - wall_thickness
    if r_inner <= 0:
        raise ValueError(
            f"Толщина стенки ({wall_thickness * 1000:.1f} мм) превышает радиус трубы "
            f"({r_outer_pipe * 1000:.1f} мм)"
        )
    lam = lam_override if lam_override is not None else pipe_material_lambda(material, t_mean)
    return _r_cylindrical(r_inner, r_outer_pipe, lam)


def _r_insulation_layers(
    r_start: float,
    layers: list[InsulationLayer],
    insulation_tm: float,
) -> tuple[float, float, list[_LayerResistance]]:
    """Суммарное сопротивление слоёв изоляции + итоговый наружный радиус."""
    r = r_start
    r_total = 0.0
    layer_resistances: list[_LayerResistance] = []
    for layer in layers:
        r_out = r + layer.thickness
        if layer.material == "other":
            if layer.conductivity is None:
                raise ValueError("Для материала изоляции 'other' необходимо задать λ слоя")
            lam = layer.conductivity
            conductivity_source = "manual"
        else:
            lam = get_insulation_conductivity(layer.material, insulation_tm)
            conductivity_source = "reference_data"
        layer_resistance = _r_cylindrical(r, r_out, lam)
        r_total += layer_resistance
        layer_resistances.append(
            _LayerResistance(
                layer=layer,
                resistance=layer_resistance,
                conductivity=lam,
                conductivity_source=conductivity_source,
            )
        )
        r = r_out
    return r_total, r, layer_resistances  # (сопротивление, наружный радиус, слои)


def _r_external(r_outer: float, alpha: float) -> float:
    """Сопротивление наружного теплообмена (надземная прокладка)."""
    return 1.0 / (2 * math.pi * r_outer * alpha)


def _r_ground(r_outer: float, centerline_depth: float, lambda_gr: float) -> float:
    """Сопротивление грунта (подземная прокладка).

    R = arccosh(H/r) / (2π·λ_gr)
    При H/r >> 1: arccosh(x) ≈ ln(2x)
    """
    x = centerline_depth / r_outer
    if x < 1.0:
        raise ValueError(
            f"Глубина оси H={centerline_depth:.2f} м меньше наружного радиуса изоляции "
            f"r={r_outer:.3f} м — труба не помещается в грунт"
        )
    acosh_val = math.log(x + math.sqrt(x * x - 1))
    return acosh_val / (2 * math.pi * lambda_gr)


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
    delta_t = params.process_temperature - environment_temperature
    t_mean = (params.process_temperature + environment_temperature) / 2.0
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
    insulation_tm = resolve_insulation_tm(
        process_temperature=params.process_temperature,
        basis=params.insulation_temperature_basis,
        location=None,
        placement=params.placement,
    )
    r_ins, r_outer_total, layer_resistances = _r_insulation_layers(
        r_outer_pipe,
        layers,
        insulation_tm,
    )

    # --- 3. Внешнее сопротивление ---
    merged_coeffs = merge_coefficients(coefficients)

    alpha: float | None = None
    lambda_gr: float | None = None
    if params.placement == "underground":
        assert params.pipe_centerline_depth is not None
        assert params.ground_conductivity is not None
        lambda_gr = params.ground_conductivity
        r_external = _r_ground(r_outer_total, params.pipe_centerline_depth, lambda_gr)
    else:
        alpha = (
            params.alpha_vnesh
            if params.alpha_vnesh is not None
            else calc_alpha_vnesh(params.wind_speed, params.placement)
        )
        r_external = _r_external(r_outer_total, alpha)

    r_total = r_pipe_wall + r_ins + r_external

    # --- 4. Теплопотери на метр ---
    q_linear = delta_t / r_total
    _validate_layer_temperatures(
        layer_resistances,
        heat_flux=q_linear,
        hot_side_temperature=params.process_temperature - q_linear * r_pipe_wall,
    )

    # --- 5. Эффективная длина с локальными элементами ---
    n_i = params.num_local_elements
    l_ekv = params.local_element_equiv_length or 0.0
    l_eff = params.pipe_length + n_i * l_ekv

    # --- 6. Коэффициент запаса ---
    k = params.safety_factor or merged_coeffs.get("safety_factor", 1.1)

    # --- 7. Итоговые теплопотери ---
    q_total = q_linear * l_eff * k

    q_design = q_linear * k
    q_base_total = q_linear * l_eff
    additional_length = n_i * l_ekv

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
        if params.alpha_vnesh is not None:
            input_units["alpha_vnesh"] = "W/(m2*K)"

    model_assumptions = [
        "steady_state_one_dimensional_radial_heat_flow",
        "uniform_equivalent_length_per_local_element",
    ]
    source_corrections = ["base_and_design_heat_losses_reported_separately"]
    if params.placement == "underground":
        model_assumptions.append("direct_buried_pipe_in_homogeneous_ground")
        source_corrections.append("ground_temperature_used_for_underground_pipe")
    elif params.placement == "outdoor" and params.alpha_vnesh is None:
        source_corrections.append("outdoor_auto_alpha_requires_explicit_wind_speed")

    return PipeHeatLossResult(
        heat_loss_per_meter_base=round(q_linear, 3),
        heat_loss_per_meter_design=round(q_design, 3),
        total_heat_loss_base=round(q_base_total, 3),
        total_heat_loss_design=round(q_total, 3),
        effective_length=round(l_eff, 3),
        additional_equivalent_length=round(additional_length, 3),
        thermal_resistance=round(r_total, 6),
        wall_resistance=round(r_pipe_wall, 6),
        insulation_resistance=round(r_ins, 6),
        external_resistance=round(r_external, 6),
        alpha_vnesh_applied=round(alpha, 3) if alpha is not None else None,
        wind_speed_applied=(
            params.wind_speed
            if alpha is not None and params.alpha_vnesh is None and params.placement == "outdoor"
            else None
        ),
        ground_conductivity_applied=(round(lambda_gr, 3) if lambda_gr is not None else None),
        safety_factor_applied=round(k, 3),
        local_elements_count_applied=n_i,
        local_element_equiv_length_applied=round(l_ekv, 3),
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
