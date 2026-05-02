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
from app.reference_data.loader import get_insulation_conductivity, get_pipe_material_lambda
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


def calc_alpha_vnesh(wind_speed: float | None, location: str) -> float:
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
# Слои изоляции: нормализация к единому формату
# ---------------------------------------------------------------------------


def _resolve_layers(params: PipeHeatLossParams) -> list[InsulationLayer]:
    """Возвращает список слоёв изоляции из параметров (однослойный или многослойный).

    Валидатор `PipeHeatLossParams.check_insulation_provided` гарантирует,
    что ИЛИ `insulation_layers` задан, ИЛИ пара `insulation_thickness +
    insulation_material` — поэтому в однослойной ветке оба поля не None.
    """
    if params.insulation_layers:
        return list(params.insulation_layers)
    # однослойный режим
    thickness = params.insulation_thickness
    material = params.insulation_material
    # Инвариант гарантирован валидатором — assert для mypy + runtime safety net.
    assert (
        thickness is not None and material is not None
    ), "Валидатор PipeHeatLossParams должен был это поймать"
    return [InsulationLayer(thickness=thickness, material=material)]


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


def _r_external(r_outer: float, alpha: float) -> float:
    """Сопротивление наружного теплообмена (надземная прокладка)."""
    return 1.0 / (2 * math.pi * r_outer * alpha)


def _r_ground(r_outer: float, burial_depth: float, lambda_gr: float) -> float:
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

    alpha: float | None = None
    lambda_gr: float | None = None
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
        # Дополнительный коэффициент внешней теплоотдачи из настроек расчёта.
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
        wall_resistance=round(r_pipe_wall, 6),
        insulation_resistance=round(r_ins, 6),
        external_resistance=round(r_external, 6),
        alpha_vnesh=round(alpha, 3) if alpha is not None else None,
        wind_speed=params.wind_speed,
        ground_conductivity=round(lambda_gr, 3) if lambda_gr is not None else None,
        safety_factor=round(k, 3),
        local_elements_count=n_i,
        local_element_equiv_length=round(l_ekv, 3),
        surface_temperature=None,
    )
