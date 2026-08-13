"""Расчёт теплопотерь трубопровода.

Формула: многослойная цилиндрическая стенка (закон Фурье).

q_linear = ΔT / R_total  [Вт/м]
q_total  = q_linear · L_eff · K  [Вт]

где R_total = R_wall + ΣR_ins_i + R_external (или R_ground для подземных)

Источник: спецификация параметров теплотехнических расчётов, таблица 1–2.
"""

from typing import Any, cast

from heatcalc_heat_loss_core.conductivity import ConstantConductivity
from heatcalc_heat_loss_core.errors import FormulaDomainError
from heatcalc_heat_loss_core.pipe_evaluation import (
    AirPipeEvaluationInput,
    PipeEvaluationInput,
    PipeEvaluationLayer,
    UndergroundPipeEvaluationInput,
    evaluate_pipe,
)
from heatcalc_heat_loss_core.profile import InsulationTemperatureBasis, resolve_external_alpha
from heatcalc_heat_loss_core.validation import FormulaValidationReport

from app.reference_data.loader import (
    get_insulation_conductivity_law,
    get_insulation_temperature_range,
    get_pipe_material_conductivity_law,
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
        return resolve_external_alpha(placement="indoor", wind_speed_m_s=wind_speed)
    if wind_speed is None:
        raise ValueError("Для outdoor auto требуется wind_speed")
    return resolve_external_alpha(
        placement="outdoor",
        wind_speed_m_s=wind_speed,
    )


# ---------------------------------------------------------------------------
# Слои изоляции: нормализация к единому формату
# ---------------------------------------------------------------------------


def _resolve_layers(params: PipeHeatLossParams) -> list[InsulationLayer]:
    """Return the canonical non-empty insulation layer list."""
    return list(params.insulation_layers)


def _fmt_temp(value: float) -> str:
    return f"{value:g}"


def _layer_temperature_range(layer: InsulationLayer) -> tuple[float, float]:
    if layer.material == "other":
        min_temp, max_temp = cast(tuple[float, float], layer.temperature_range)
        return float(min_temp), float(max_temp)
    return get_insulation_temperature_range(layer.material)


def _raise_first_layer_temperature_error(
    layers: list[InsulationLayer],
    report: FormulaValidationReport,
) -> None:
    """Adapt the canonical aggregate report to the established facade error."""
    if report.is_valid:
        return
    issue = report.issues[0]
    index = cast(int, issue.path[1])
    details = issue.details_dict()
    min_temp = float(details["minimum_c"])
    max_temp = float(details["maximum_c"])
    layer_hot_side = float(details["temperature_c"])
    raise ValueError(
        f"Температура горячей стороны слоя изоляции #{index + 1} "
        f"({_fmt_temp(layer_hot_side)} °C) вне диапазона "
        f"материала '{layers[index].material}': {_fmt_temp(min_temp)}…{_fmt_temp(max_temp)} °C"
    )


def _raise_pipe_core_error(
    error: FormulaDomainError,
    *,
    layers: list[InsulationLayer] | None = None,
) -> None:
    """Translate numeric-domain failures back to the established facade errors."""
    if (
        error.code in {"conductivity_law_unavailable", "conductivity_not_positive"}
        and "layer_index" in error.details
        and layers is not None
    ):
        index = int(error.details["layer_index"])
        layer = layers[index]
        temperature = float(error.details["temperature_c"])
        raise ValueError(
            f"Для материала изоляции '{layer.material}' не задана расчётная λ(tm) "
            f"при tm={_fmt_temp(temperature)} °C"
        ) from error
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
        ValueError: ошибка справочных данных, допустимости рассчитанной
            температуры слоя или численной области формулы.

    See Also:
        golden cases in unit tests
        docs/context/formulas-summary.md — краткий справочник
    """
    layers = _resolve_layers(params)

    evaluation_layers = tuple(
        PipeEvaluationLayer(
            thickness_m=layer.thickness,
            conductivity_law=(
                ConstantConductivity(cast(float, layer.conductivity))
                if layer.material == "other"
                else get_insulation_conductivity_law(layer.material)
            ),
            temperature_interval_c=_layer_temperature_range(layer),
        )
        for layer in layers
    )
    environment: AirPipeEvaluationInput | UndergroundPipeEvaluationInput
    if params.placement == "underground":
        environment = UndergroundPipeEvaluationInput(
            ground_temperature_c=cast(float, params.ground_temperature),
            centerline_depth_m=cast(float, params.pipe_centerline_depth),
            ground_conductivity_w_mk=cast(float, params.ground_conductivity),
        )
    else:
        environment = AirPipeEvaluationInput(
            placement=params.placement,
            ambient_temperature_c=cast(float, params.ambient_temperature),
            wind_speed_m_s=params.wind_speed,
        )
    try:
        evaluation = evaluate_pipe(
            PipeEvaluationInput(
                outer_diameter_m=params.outer_diameter,
                wall_thickness_m=params.wall_thickness,
                wall_conductivity_law=(
                    ConstantConductivity(params.pipe_lambda)
                    if params.pipe_lambda is not None
                    else get_pipe_material_conductivity_law(params.pipe_material)
                ),
                insulation_layers=evaluation_layers,
                process_temperature_c=params.process_temperature,
                insulation_temperature_basis=cast(
                    InsulationTemperatureBasis, params.insulation_temperature_basis
                ),
                pipe_length_m=params.pipe_length,
                local_elements_count=params.num_local_elements,
                local_element_equiv_length_m=params.local_element_equiv_length or 0.0,
                safety_factor_primary=params.safety_factor,
                safety_factor_override=(
                    coefficients.get("safety_factor") if coefficients is not None else None
                ),
                environment=environment,
            )
        )
    except FormulaDomainError as exc:
        _raise_pipe_core_error(exc, layers=layers)

    _raise_first_layer_temperature_error(layers, evaluation.layer_temperature_report)
    core_result = evaluation.core_result
    alpha = evaluation.external_alpha_w_m2k
    lambda_gr = evaluation.ground_conductivity_w_mk
    insulation_tm = evaluation.insulation_temperature_c
    k = evaluation.safety_factor

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
        formula_model=evaluation.formula_model,
        formula_model_version=evaluation.formula_model_version,
        model_assumptions=list(evaluation.model_assumptions),
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
                "thickness": layer.thickness,
                "material": layer.material,
                "conductivity_applied": layer_result.conductivity_w_mk,
                "conductivity_source": (
                    "manual" if layer.material == "other" else "reference_data"
                ),
                "conductivity_temperature_applied": insulation_tm,
                "resistance": layer_result.resistance_mk_w,
                "resistance_unit": "m*K/W",
            }
            for index, (layer, layer_result) in enumerate(
                zip(layers, evaluation.layer_results, strict=True),
                start=1,
            )
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
        source_corrections=list(evaluation.source_corrections),
    )
