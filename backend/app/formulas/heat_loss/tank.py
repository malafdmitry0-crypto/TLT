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

from heatcalc_heat_loss_core.errors import FormulaDomainError

from app.formulas.heat_loss.outcome_errors import (
    raise_heat_formula_domain_error,
    raise_heat_formula_report,
)
from app.formulas.heat_loss.tank_preparation import run_validated_tank_formula
from app.schemas.heat_loss import InsulationLayer, TankHeatLossParams, TankHeatLossResult


def _resolve_layers(params: TankHeatLossParams) -> list[InsulationLayer]:
    return list(params.insulation_layers)


def calc_tank_heat_loss(params: TankHeatLossParams) -> TankHeatLossResult:
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
            Читает только `params.safety_factor`.

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
        outcome = run_validated_tank_formula(params)
    except FormulaDomainError as exc:
        raise_heat_formula_domain_error(exc, layers=layers)
        raise
    if outcome.result is None:
        raise_heat_formula_report(outcome.report, layers=layers)
        raise AssertionError("invalid heat-loss outcome")
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
