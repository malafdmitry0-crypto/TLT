"""High-level pure evaluation of fully resolved tank heat-loss inputs."""

from __future__ import annotations

from dataclasses import dataclass

from .conductivity import ConductivityLaw, evaluate_conductivity
from .errors import FormulaDomainError
from .material_validation import validate_hot_side_temperature_in_interval
from .profile import (
    CASE_1_PROFILE,
    ExternalAlphaPlacement,
    HeatLossFormulaProfile,
    InsulationTemperatureBasis,
    resolve_external_alpha,
    resolve_insulation_temperature,
)
from .tank import (
    AirTankHeatLossInput,
    BuriedTankHeatLossInput,
    TankCoreResult,
    TankGeometry,
    TankInsulationLayer,
    calculate_air_tank_heat_loss,
    calculate_buried_tank_heat_loss,
)
from .validation import FormulaValidationIssue, FormulaValidationReport


@dataclass(frozen=True)
class ResolvedTankLayer:
    """A layer with a pure conductivity law and already-resolved temperature limits."""

    thickness_m: float
    conductivity_law: ConductivityLaw
    temperature_min_c: float
    temperature_max_c: float


@dataclass(frozen=True)
class ResolvedAirTankEvaluationInput:
    """Fully resolved numeric input for an air-exposed tank."""

    geometry: TankGeometry
    wall_thickness_m: float
    wall_conductivity_w_mk: float
    insulation_layers: tuple[ResolvedTankLayer, ...]
    process_temperature_c: float
    ambient_temperature_c: float
    placement: ExternalAlphaPlacement
    wind_speed_m_s: float | None
    insulation_temperature_basis: InsulationTemperatureBasis
    safety_factor: float
    additional_heat_loss_w: float
    profile: HeatLossFormulaProfile = CASE_1_PROFILE


@dataclass(frozen=True)
class ResolvedBuriedTankEvaluationInput:
    """Fully resolved numeric input for a partially buried tank."""

    geometry: TankGeometry
    wall_thickness_m: float
    wall_conductivity_w_mk: float
    insulation_layers: tuple[ResolvedTankLayer, ...]
    process_temperature_c: float
    ambient_temperature_c: float
    ground_temperature_c: float
    buried_height_m: float
    ground_conductivity_w_mk: float
    placement: ExternalAlphaPlacement
    wind_speed_m_s: float | None
    insulation_temperature_basis: InsulationTemperatureBasis
    safety_factor: float
    additional_heat_loss_w: float
    profile: HeatLossFormulaProfile = CASE_1_PROFILE


@dataclass(frozen=True)
class TankEvaluationResult:
    """Core result plus all resolved formula quantities and layer checks."""

    core_result: TankCoreResult
    insulation_temperature_c: float
    external_alpha_w_m2k: float
    safety_factor_applied: float
    additional_heat_loss_applied_w: float
    layer_conductivities_w_mk: tuple[float, ...]
    layer_resistances_areal_m2k_w: tuple[float, ...]
    layer_temperature_report: FormulaValidationReport
    formula_model: str = "tank_heat_loss"
    formula_model_version: str = "3"
    model_assumptions: tuple[str, ...] = (
        "plane_wall_resistance_for_cylindrical_and_rectangular_tank",
    )
    source_corrections: tuple[str, ...] = (
        "tank_external_resistance_is_areal_inverse_alpha",
        "tank_air_and_ground_temperatures_are_separate",
        "tank_additional_load_is_applied_after_safety_factor",
    )


def evaluate_resolved_air_tank(data: ResolvedAirTankEvaluationInput) -> TankEvaluationResult:
    """Evaluate a resolved air tank exactly once through the low-level branch."""

    insulation_temperature = resolve_insulation_temperature(
        data.process_temperature_c,
        basis=data.insulation_temperature_basis,
        profile=data.profile,
    )
    conductivities = _conductivities(data.insulation_layers, insulation_temperature)
    alpha = resolve_external_alpha(
        placement=data.placement,
        wind_speed_m_s=data.wind_speed_m_s,
        profile=data.profile,
    )
    core_result = calculate_air_tank_heat_loss(
        AirTankHeatLossInput(
            geometry=data.geometry,
            wall_thickness_m=data.wall_thickness_m,
            wall_conductivity_w_mk=data.wall_conductivity_w_mk,
            insulation_layers=_numeric_layers(data.insulation_layers, conductivities),
            process_temperature_c=data.process_temperature_c,
            ambient_temperature_c=data.ambient_temperature_c,
            external_alpha_w_m2k=alpha,
            safety_factor=data.safety_factor,
            additional_heat_loss_w=data.additional_heat_loss_w,
        )
    )
    return _result(
        data.insulation_layers,
        conductivities,
        insulation_temperature,
        alpha,
        data.safety_factor,
        data.additional_heat_loss_w,
        core_result,
    )


def evaluate_resolved_buried_tank(data: ResolvedBuriedTankEvaluationInput) -> TankEvaluationResult:
    """Evaluate a resolved buried tank exactly once through the low-level branch."""

    insulation_temperature = resolve_insulation_temperature(
        data.process_temperature_c,
        basis=data.insulation_temperature_basis,
        profile=data.profile,
    )
    conductivities = _conductivities(data.insulation_layers, insulation_temperature)
    alpha = resolve_external_alpha(
        placement=data.placement,
        wind_speed_m_s=data.wind_speed_m_s,
        profile=data.profile,
    )
    core_result = calculate_buried_tank_heat_loss(
        BuriedTankHeatLossInput(
            geometry=data.geometry,
            wall_thickness_m=data.wall_thickness_m,
            wall_conductivity_w_mk=data.wall_conductivity_w_mk,
            insulation_layers=_numeric_layers(data.insulation_layers, conductivities),
            process_temperature_c=data.process_temperature_c,
            ambient_temperature_c=data.ambient_temperature_c,
            ground_temperature_c=data.ground_temperature_c,
            external_alpha_w_m2k=alpha,
            buried_height_m=data.buried_height_m,
            ground_conductivity_w_mk=data.ground_conductivity_w_mk,
            safety_factor=data.safety_factor,
            additional_heat_loss_w=data.additional_heat_loss_w,
        )
    )
    return _result(
        data.insulation_layers,
        conductivities,
        insulation_temperature,
        alpha,
        data.safety_factor,
        data.additional_heat_loss_w,
        core_result,
    )


def _conductivities(
    layers: tuple[ResolvedTankLayer, ...], temperature_c: float
) -> tuple[float, ...]:
    values: list[float] = []
    for index, layer in enumerate(layers):
        try:
            values.append(evaluate_conductivity(layer.conductivity_law, temperature_c))
        except FormulaDomainError as error:
            if error.code not in {"conductivity_law_unavailable", "conductivity_not_positive"}:
                raise
            raise FormulaDomainError(
                error.code,
                layer_index=index,
                temperature_c=temperature_c,
                **{key: value for key, value in error.details.items() if key != "temperature_c"},
            ) from error
    return tuple(values)


def _numeric_layers(
    layers: tuple[ResolvedTankLayer, ...], conductivities: tuple[float, ...]
) -> tuple[TankInsulationLayer, ...]:
    return tuple(
        TankInsulationLayer(thickness_m=layer.thickness_m, conductivity_w_mk=conductivity)
        for layer, conductivity in zip(layers, conductivities, strict=True)
    )


def _result(
    layers: tuple[ResolvedTankLayer, ...],
    conductivities: tuple[float, ...],
    insulation_temperature_c: float,
    alpha_w_m2k: float,
    safety_factor: float,
    additional_heat_loss_w: float,
    core_result: TankCoreResult,
) -> TankEvaluationResult:
    issues: tuple[FormulaValidationIssue, ...] = ()
    for boundaries in (
        core_result.air_layer_boundary_temperatures,
        core_result.ground_layer_boundary_temperatures,
    ):
        if not boundaries:
            continue
        for index, (layer, boundary) in enumerate(zip(layers, boundaries, strict=True)):
            issues += validate_hot_side_temperature_in_interval(
                first_side_c=boundary.hot_side_c,
                second_side_c=boundary.cold_side_c,
                minimum_c=layer.temperature_min_c,
                maximum_c=layer.temperature_max_c,
                path=("insulation_layers", index),
            ).issues
    return TankEvaluationResult(
        core_result=core_result,
        insulation_temperature_c=insulation_temperature_c,
        external_alpha_w_m2k=alpha_w_m2k,
        safety_factor_applied=safety_factor,
        additional_heat_loss_applied_w=additional_heat_loss_w,
        layer_conductivities_w_mk=conductivities,
        layer_resistances_areal_m2k_w=core_result.layer_resistances_areal_m2k_w,
        layer_temperature_report=FormulaValidationReport(issues),
    )
