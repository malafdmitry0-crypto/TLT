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

from typing import Any, cast

from heatcalc_heat_loss_core.conductivity import ConstantConductivity
from heatcalc_heat_loss_core.errors import FormulaDomainError
from heatcalc_heat_loss_core.profile import InsulationTemperatureBasis, resolve_external_alpha
from heatcalc_heat_loss_core.tank import (
    CylindricalTankGeometry,
    RectangularTankGeometry,
)
from heatcalc_heat_loss_core.tank_evaluation import (
    ResolvedAirTankEvaluationInput,
    ResolvedBuriedTankEvaluationInput,
    ResolvedTankLayer,
    TankEvaluationResult,
    evaluate_resolved_air_tank,
    evaluate_resolved_buried_tank,
)
from heatcalc_heat_loss_core.validation import FormulaValidationReport

from app.formulas.heat_loss.outcome_errors import raise_heat_formula_report
from app.formulas.heat_loss.tank_preparation import run_validated_tank_formula
from app.reference_data.loader import (
    get_insulation_conductivity_law,
    get_insulation_temperature_range,
)
from app.schemas.calculation import InsulationLayer, TankHeatLossParams, TankHeatLossResult

_COMPAT = (
    ConstantConductivity,
    InsulationTemperatureBasis,
    CylindricalTankGeometry,
    RectangularTankGeometry,
    ResolvedAirTankEvaluationInput,
    ResolvedBuriedTankEvaluationInput,
    ResolvedTankLayer,
    TankEvaluationResult,
    evaluate_resolved_air_tank,
    evaluate_resolved_buried_tank,
    get_insulation_conductivity_law,
    resolve_external_alpha,
)


def _fmt_temp(value: float) -> str:
    return f"{value:g}"


def _layer_temperature_range(layer: InsulationLayer) -> tuple[float, float]:
    if layer.material == "other":
        min_temp, max_temp = cast(tuple[float, float], layer.temperature_range)
        return float(min_temp), float(max_temp)
    return get_insulation_temperature_range(layer.material)


def _calc_alpha(params: TankHeatLossParams) -> float:
    """Коэффициент наружной теплоотдачи α, Вт/(м²·К).

    α = 11,6 + 7·√v  (SNiP 41-03-2003, формула ТНП)
    Помещение: α = 9.0
    """
    return resolve_external_alpha(
        placement=params.placement,
        wind_speed_m_s=params.wind_speed,
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


def _resolved_layers(layers: list[InsulationLayer]) -> tuple[ResolvedTankLayer, ...]:
    """Resolve catalog identity at the facade before pure evaluation."""

    resolved: list[ResolvedTankLayer] = []
    for layer in layers:
        law = (
            ConstantConductivity(cast(float, layer.conductivity))
            if layer.material == "other"
            else get_insulation_conductivity_law(layer.material)
        )
        minimum_c, maximum_c = _layer_temperature_range(layer)
        resolved.append(
            ResolvedTankLayer(
                thickness_m=layer.thickness,
                conductivity_law=law,
                temperature_min_c=minimum_c,
                temperature_max_c=maximum_c,
            )
        )
    return tuple(resolved)


def _raise_first_layer_temperature_error(
    report: FormulaValidationReport,
    layers: list[InsulationLayer],
) -> None:
    if report.is_valid:
        return
    issue = report.issues[0]
    index = cast(int, issue.path[1])
    layer = layers[index]
    details = issue.details_dict()
    minimum_c = float(details["minimum_c"])
    maximum_c = float(details["maximum_c"])
    layer_hot_side = float(details["temperature_c"])
    raise ValueError(
        f"Температура горячей стороны слоя изоляции #{index + 1} "
        f"({_fmt_temp(layer_hot_side)} °C) вне диапазона "
        f"материала '{layer.material}': {_fmt_temp(minimum_c)}…{_fmt_temp(maximum_c)} °C"
    )


def _raise_tank_core_error(
    error: FormulaDomainError,
    *,
    layers: list[InsulationLayer],
) -> None:
    if error.code in {"conductivity_law_unavailable", "conductivity_not_positive"}:
        index = int(error.details["layer_index"])
        temperature = float(error.details["temperature_c"])
        raise ValueError(
            f"Для материала изоляции '{layers[index].material}' не задана расчётная λ(tm) "
            f"при tm={_fmt_temp(temperature)} °C"
        ) from error
    raise ValueError(str(error)) from error


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
    layers = _resolve_layers(params)
    k = params.safety_factor
    buried_height = params.tank_buried_height or 0.0
    q_additional = getattr(params, "q_additional", 0.0) or 0.0
    try:
        outcome = run_validated_tank_formula(params, coefficients)
    except FormulaDomainError as exc:
        _raise_tank_core_error(exc, layers=layers)
        raise
    if outcome.result is None:
        if any(issue.code == "temperature_outside_interval" for issue in outcome.report.issues):
            _raise_first_layer_temperature_error(outcome.report, layers)
        raise_heat_formula_report(outcome.report)
    evaluation = outcome.result
    core_result = evaluation.core_result

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
        alpha_vnesh_applied=evaluation.external_alpha_w_m2k,
        wind_speed_applied=(params.wind_speed if params.placement != "indoor" else None),
        ground_conductivity_applied=(params.ground_conductivity if buried_height > 0 else None),
        safety_factor_applied=k,
        q_additional_applied=q_additional,
        air_surface_area=core_result.air_surface_area_m2,
        ground_surface_area=core_result.ground_surface_area_m2,
        heat_loss_air_base=core_result.heat_loss_air_base_w,
        heat_loss_ground_base=core_result.heat_loss_ground_base_w,
        formula_model=evaluation.formula_model,
        formula_model_version=evaluation.formula_model_version,
        model_assumptions=list(evaluation.model_assumptions),
        process_temperature_applied=params.process_temperature,
        ambient_temperature_applied=params.ambient_temperature,
        ground_temperature_applied=params.ground_temperature if buried_height > 0 else None,
        insulation_layers_applied=[
            {
                "index": index,
                "thickness": layer.thickness,
                "material": layer.material,
                "conductivity_applied": conductivity,
                "conductivity_source": (
                    "manual" if layer.material == "other" else "reference_data"
                ),
                "conductivity_temperature_applied": evaluation.insulation_temperature_c,
                "resistance": resistance,
                "resistance_unit": "m2*K/W",
            }
            for index, (layer, conductivity, resistance) in enumerate(
                zip(
                    layers,
                    evaluation.layer_conductivities_w_mk,
                    core_result.layer_resistances_areal_m2k_w,
                    strict=True,
                ),
                start=1,
            )
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
        source_corrections=list(evaluation.source_corrections),
    )
