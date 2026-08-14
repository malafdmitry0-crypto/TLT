"""Internal execution kernel for prepared tank heat-loss inputs."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from .conductivity import (
    ConductivityLaw,
    InsulationConductivityTemperatures,
    evaluate_conductivity,
    evaluate_insulation_conductivity,
)
from .errors import FormulaDomainError
from .material_validation import validate_layer_boundary_temperatures_in_interval
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
from .tank_contract import TankLayerSource
from .validation import FormulaValidationIssue, FormulaValidationReport


@dataclass(frozen=True)
class PreparedTankLayer:
    thickness_m: float
    source: TankLayerSource
    conductivity_law: ConductivityLaw
    temperature_min_c: float
    temperature_max_c: float


@dataclass(frozen=True)
class AirTankFormulaEnvironment:
    """Required conditions for an air-exposed tank calculation."""

    placement: ExternalAlphaPlacement
    ambient_temperature_c: float
    wind_speed_m_s: float | None


@dataclass(frozen=True)
class BuriedTankFormulaEnvironment:
    """Required air and ground conditions for a partially buried tank."""

    placement: Literal["underground"]
    ambient_temperature_c: float
    ground_temperature_c: float
    buried_height_m: float
    ground_conductivity_w_mk: float
    wind_speed_m_s: float | None


TankFormulaEnvironment = AirTankFormulaEnvironment | BuriedTankFormulaEnvironment


@dataclass(frozen=True)
class PreparedTankCalculation:
    """Immutable tank input with required laws. Safety factor stays required."""

    geometry: TankGeometry
    insulation_temperature_basis: InsulationTemperatureBasis
    layers: tuple[PreparedTankLayer, ...]
    process_temperature_c: float
    wall_thickness_m: float
    wall_conductivity_w_mk: float
    safety_factor: float
    additional_heat_loss_w: float
    environment: TankFormulaEnvironment
    profile: HeatLossFormulaProfile = CASE_1_PROFILE


@dataclass(frozen=True)
class TankFormulaResult:
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


def execute_prepared_tank(data: PreparedTankCalculation) -> TankFormulaResult:
    """Single tank execution kernel. Expects resolved laws and a concrete K."""

    insulation_temperature = resolve_insulation_temperature(
        data.process_temperature_c,
        basis=data.insulation_temperature_basis,
        profile=data.profile,
    )
    conductivities = _conductivities(
        data.layers,
        InsulationConductivityTemperatures(
            process_temperature_c=data.process_temperature_c,
            insulation_temperature_c=insulation_temperature,
        ),
    )
    alpha = resolve_external_alpha(
        placement=data.environment.placement,
        wind_speed_m_s=data.environment.wind_speed_m_s,
        profile=data.profile,
    )
    numeric_layers = _numeric_layers(data.layers, conductivities)
    if isinstance(data.environment, BuriedTankFormulaEnvironment):
        core_result = calculate_buried_tank_heat_loss(
            BuriedTankHeatLossInput(
                geometry=data.geometry,
                wall_thickness_m=data.wall_thickness_m,
                wall_conductivity_w_mk=data.wall_conductivity_w_mk,
                insulation_layers=numeric_layers,
                process_temperature_c=data.process_temperature_c,
                ambient_temperature_c=data.environment.ambient_temperature_c,
                ground_temperature_c=data.environment.ground_temperature_c,
                external_alpha_w_m2k=alpha,
                buried_height_m=data.environment.buried_height_m,
                ground_conductivity_w_mk=data.environment.ground_conductivity_w_mk,
                safety_factor=data.safety_factor,
                additional_heat_loss_w=data.additional_heat_loss_w,
            )
        )
    else:
        core_result = calculate_air_tank_heat_loss(
            AirTankHeatLossInput(
                geometry=data.geometry,
                wall_thickness_m=data.wall_thickness_m,
                wall_conductivity_w_mk=data.wall_conductivity_w_mk,
                insulation_layers=numeric_layers,
                process_temperature_c=data.process_temperature_c,
                ambient_temperature_c=data.environment.ambient_temperature_c,
                external_alpha_w_m2k=alpha,
                safety_factor=data.safety_factor,
                additional_heat_loss_w=data.additional_heat_loss_w,
            )
        )
    return _result(
        data.layers,
        conductivities,
        insulation_temperature,
        alpha,
        data.safety_factor,
        data.additional_heat_loss_w,
        core_result,
    )


def _conductivities(
    layers: tuple[PreparedTankLayer, ...],
    temperatures: InsulationConductivityTemperatures,
) -> tuple[float, ...]:
    values: list[float] = []
    for index, layer in enumerate(layers):
        try:
            if layer.source == "reference":
                conductivity = evaluate_insulation_conductivity(
                    layer.conductivity_law,
                    temperatures,
                )
            else:
                conductivity = evaluate_conductivity(
                    layer.conductivity_law,
                    temperatures.insulation_temperature_c,
                )
            values.append(conductivity)
        except FormulaDomainError as error:
            if error.code not in {"conductivity_law_unavailable", "conductivity_not_positive"}:
                raise
            raise FormulaDomainError(
                error.code,
                layer_index=index,
                temperature_c=temperatures.insulation_temperature_c,
                **{key: value for key, value in error.details.items() if key != "temperature_c"},
            ) from error
    return tuple(values)


def _numeric_layers(
    layers: tuple[PreparedTankLayer, ...], conductivities: tuple[float, ...]
) -> tuple[TankInsulationLayer, ...]:
    return tuple(
        TankInsulationLayer(thickness_m=layer.thickness_m, conductivity_w_mk=conductivity)
        for layer, conductivity in zip(layers, conductivities, strict=True)
    )


def _result(
    layers: tuple[PreparedTankLayer, ...],
    conductivities: tuple[float, ...],
    insulation_temperature_c: float,
    alpha_w_m2k: float,
    safety_factor: float,
    additional_heat_loss_w: float,
    core_result: TankCoreResult,
) -> TankFormulaResult:
    issues: tuple[FormulaValidationIssue, ...] = ()
    for boundaries in (
        core_result.air_layer_boundary_temperatures,
        core_result.ground_layer_boundary_temperatures,
    ):
        if not boundaries:
            continue
        for index, (layer, boundary) in enumerate(zip(layers, boundaries, strict=True)):
            issues += validate_layer_boundary_temperatures_in_interval(
                first_side_c=boundary.hot_side_c,
                second_side_c=boundary.cold_side_c,
                minimum_c=layer.temperature_min_c,
                maximum_c=layer.temperature_max_c,
                path=("insulation_layers", index),
            ).issues
    return TankFormulaResult(
        core_result=core_result,
        insulation_temperature_c=insulation_temperature_c,
        external_alpha_w_m2k=alpha_w_m2k,
        safety_factor_applied=safety_factor,
        additional_heat_loss_applied_w=additional_heat_loss_w,
        layer_conductivities_w_mk=conductivities,
        layer_resistances_areal_m2k_w=core_result.layer_resistances_areal_m2k_w,
        layer_temperature_report=FormulaValidationReport(issues),
    )
