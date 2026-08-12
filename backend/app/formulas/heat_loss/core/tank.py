"""Pure numeric tank heat-loss formulas.

Inputs are fully resolved SI quantities; reference data, placement policy, and
result serialization intentionally remain in the backend facade.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from .errors import FormulaDomainError
from .geometry import radius_from_diameter
from .validation import (
    VALID_FORMULA_VALIDATION_REPORT,
    FormulaValidationIssue,
    FormulaValidationReport,
)


@dataclass(frozen=True)
class TankInsulationLayer:
    thickness_m: float
    conductivity_w_mk: float


@dataclass(frozen=True)
class CylindricalTankGeometry:
    diameter_m: float
    height_m: float


@dataclass(frozen=True)
class RectangularTankGeometry:
    length_m: float
    width_m: float
    height_m: float


TankGeometry = CylindricalTankGeometry | RectangularTankGeometry


@dataclass(frozen=True)
class TankLayerBoundaryTemperature:
    hot_side_c: float
    cold_side_c: float


@dataclass(frozen=True)
class AirTankHeatLossInput:
    geometry: TankGeometry
    wall_thickness_m: float
    wall_conductivity_w_mk: float
    insulation_layers: tuple[TankInsulationLayer, ...]
    process_temperature_c: float
    ambient_temperature_c: float
    external_alpha_w_m2k: float
    safety_factor: float
    additional_heat_loss_w: float


@dataclass(frozen=True)
class BuriedTankHeatLossInput:
    geometry: TankGeometry
    wall_thickness_m: float
    wall_conductivity_w_mk: float
    insulation_layers: tuple[TankInsulationLayer, ...]
    process_temperature_c: float
    ambient_temperature_c: float
    ground_temperature_c: float
    external_alpha_w_m2k: float
    buried_height_m: float
    ground_conductivity_w_mk: float
    safety_factor: float
    additional_heat_loss_w: float


@dataclass(frozen=True)
class TankCoreResult:
    total_heat_loss_base_w: float
    total_heat_loss_design_w: float
    heat_loss_per_m2_base_w_m2: float
    heat_loss_per_m2_design_w_m2: float
    surface_area_m2: float
    thermal_resistance_areal_m2k_w: float | None
    wall_resistance_areal_m2k_w: float
    insulation_resistance_areal_m2k_w: float
    external_resistance_areal_m2k_w: float
    ground_resistance_areal_m2k_w: float | None
    air_surface_area_m2: float | None
    ground_surface_area_m2: float | None
    heat_loss_air_base_w: float | None
    heat_loss_ground_base_w: float | None
    layer_resistances_areal_m2k_w: tuple[float, ...]
    air_layer_boundary_temperatures: tuple[TankLayerBoundaryTemperature, ...]
    ground_layer_boundary_temperatures: tuple[TankLayerBoundaryTemperature, ...]


def validate_tank_formula_domain(
    *,
    cylindrical_diameter_m: float | None,
    height_m: float,
    wall_thickness_m: float,
    process_temperature_c: float,
    ambient_temperature_c: float,
    ground_temperature_c: float | None = None,
    buried_height_m: float | None = None,
) -> FormulaValidationReport:
    """Validate all derived constraints of the selected tank formula once."""

    issues: tuple[FormulaValidationIssue, ...] = ()
    if cylindrical_diameter_m is not None and wall_thickness_m > 0:
        tank_outer_radius_m = radius_from_diameter(cylindrical_diameter_m)
        if wall_thickness_m >= tank_outer_radius_m:
            issues += (
                FormulaValidationIssue.with_details(
                    "wall_exceeds_tank_radius",
                    diameter_m=cylindrical_diameter_m,
                    wall_thickness_m=wall_thickness_m,
                    outer_radius_m=tank_outer_radius_m,
                ),
            )

    if process_temperature_c <= ambient_temperature_c:
        issues += (
            FormulaValidationIssue.with_details(
                "process_temperature_not_above_ambient",
                process_temperature_c=process_temperature_c,
                environment_temperature_c=ambient_temperature_c,
            ),
        )
    if ground_temperature_c is not None and process_temperature_c <= ground_temperature_c:
        issues += (
            FormulaValidationIssue.with_details(
                "process_temperature_not_above_ground",
                process_temperature_c=process_temperature_c,
                environment_temperature_c=ground_temperature_c,
            ),
        )
    if buried_height_m is not None and (buried_height_m <= 0 or buried_height_m > height_m):
        issues += (
            FormulaValidationIssue.with_details(
                "invalid_buried_height",
                buried_height_m=buried_height_m,
                height_m=height_m,
            ),
        )

    if not issues:
        return VALID_FORMULA_VALIDATION_REPORT
    return FormulaValidationReport(issues)


def calculate_air_tank_heat_loss(data: AirTankHeatLossInput) -> TankCoreResult:
    """Calculate a tank exchanging heat with the explicitly supplied air film."""
    common = _common_resistances(
        geometry=data.geometry,
        wall_thickness_m=data.wall_thickness_m,
        wall_conductivity_w_mk=data.wall_conductivity_w_mk,
        layers=data.insulation_layers,
    )

    external_resistance = 1.0 / data.external_alpha_w_m2k
    thermal_resistance = common.wall + common.insulation + external_resistance
    heat_flux = (data.process_temperature_c - data.ambient_temperature_c) / thermal_resistance
    area = _surface_area(data.geometry)
    total_base = heat_flux * area
    total_design = total_base * data.safety_factor + data.additional_heat_loss_w
    boundaries = _layer_boundaries(
        data.process_temperature_c - heat_flux * common.wall,
        heat_flux,
        common.layer_resistances,
    )
    result = TankCoreResult(
        total_heat_loss_base_w=total_base,
        total_heat_loss_design_w=total_design,
        heat_loss_per_m2_base_w_m2=heat_flux,
        heat_loss_per_m2_design_w_m2=total_design / area,
        surface_area_m2=area,
        thermal_resistance_areal_m2k_w=thermal_resistance,
        wall_resistance_areal_m2k_w=common.wall,
        insulation_resistance_areal_m2k_w=common.insulation,
        external_resistance_areal_m2k_w=external_resistance,
        ground_resistance_areal_m2k_w=None,
        air_surface_area_m2=None,
        ground_surface_area_m2=None,
        heat_loss_air_base_w=None,
        heat_loss_ground_base_w=None,
        layer_resistances_areal_m2k_w=common.layer_resistances,
        air_layer_boundary_temperatures=boundaries,
        ground_layer_boundary_temperatures=(),
    )
    _validate_result(result)
    return result


def calculate_buried_tank_heat_loss(data: BuriedTankHeatLossInput) -> TankCoreResult:
    """Calculate separately the air and ground branches of a partly buried tank."""
    common = _common_resistances(
        geometry=data.geometry,
        wall_thickness_m=data.wall_thickness_m,
        wall_conductivity_w_mk=data.wall_conductivity_w_mk,
        layers=data.insulation_layers,
    )

    air_area, ground_area = _surface_area_split(data.geometry, data.buried_height_m)
    external_resistance = 1.0 / data.external_alpha_w_m2k
    ground_resistance = data.buried_height_m / data.ground_conductivity_w_mk
    air_resistance = common.wall + common.insulation + external_resistance
    ground_total_resistance = common.wall + common.insulation + ground_resistance
    q_air = (data.process_temperature_c - data.ambient_temperature_c) / air_resistance
    q_ground = (data.process_temperature_c - data.ground_temperature_c) / ground_total_resistance
    air_loss = q_air * air_area
    ground_loss = q_ground * ground_area
    area = air_area + ground_area
    total_base = air_loss + ground_loss
    total_design = total_base * data.safety_factor + data.additional_heat_loss_w
    result = TankCoreResult(
        total_heat_loss_base_w=total_base,
        total_heat_loss_design_w=total_design,
        heat_loss_per_m2_base_w_m2=total_base / area,
        heat_loss_per_m2_design_w_m2=total_design / area,
        surface_area_m2=area,
        thermal_resistance_areal_m2k_w=None,
        wall_resistance_areal_m2k_w=common.wall,
        insulation_resistance_areal_m2k_w=common.insulation,
        external_resistance_areal_m2k_w=external_resistance,
        ground_resistance_areal_m2k_w=ground_resistance,
        air_surface_area_m2=air_area,
        ground_surface_area_m2=ground_area,
        heat_loss_air_base_w=air_loss,
        heat_loss_ground_base_w=ground_loss,
        layer_resistances_areal_m2k_w=common.layer_resistances,
        air_layer_boundary_temperatures=_layer_boundaries(
            data.process_temperature_c - q_air * common.wall,
            q_air,
            common.layer_resistances,
        ),
        ground_layer_boundary_temperatures=_layer_boundaries(
            data.process_temperature_c - q_ground * common.wall,
            q_ground,
            common.layer_resistances,
        ),
    )
    _validate_result(result)
    return result


@dataclass(frozen=True)
class _CommonResistances:
    wall: float
    insulation: float
    layer_resistances: tuple[float, ...]


def _common_resistances(
    *,
    geometry: TankGeometry,
    wall_thickness_m: float,
    wall_conductivity_w_mk: float,
    layers: tuple[TankInsulationLayer, ...],
) -> _CommonResistances:
    wall = wall_thickness_m / wall_conductivity_w_mk
    layer_resistances: list[float] = []
    insulation = 0.0
    for layer in layers:
        resistance = layer.thickness_m / layer.conductivity_w_mk
        layer_resistances.append(resistance)
        insulation += resistance
    return _CommonResistances(wall, insulation, tuple(layer_resistances))


def _surface_area(geometry: TankGeometry) -> float:
    if isinstance(geometry, CylindricalTankGeometry):
        radius_m = radius_from_diameter(geometry.diameter_m)
        return math.pi * geometry.diameter_m * geometry.height_m + 2.0 * math.pi * radius_m**2
    return 2.0 * (
        geometry.length_m * geometry.width_m
        + geometry.length_m * geometry.height_m
        + geometry.width_m * geometry.height_m
    )


def _surface_area_split(geometry: TankGeometry, buried_height_m: float) -> tuple[float, float]:
    height_m = geometry.height_m
    air_height = height_m - buried_height_m
    if isinstance(geometry, CylindricalTankGeometry):
        cap_area = math.pi * geometry.diameter_m**2 / 4.0
        return (
            cap_area + math.pi * geometry.diameter_m * air_height,
            cap_area + math.pi * geometry.diameter_m * buried_height_m,
        )
    cap_area = geometry.length_m * geometry.width_m
    perimeter_area_factor = 2.0 * (geometry.length_m + geometry.width_m)
    return (
        perimeter_area_factor * air_height + cap_area,
        perimeter_area_factor * buried_height_m + cap_area,
    )


def _layer_boundaries(
    hot_side_c: float,
    heat_flux_w_m2: float,
    resistances_m2k_w: tuple[float, ...],
) -> tuple[TankLayerBoundaryTemperature, ...]:
    current = hot_side_c
    boundaries: list[TankLayerBoundaryTemperature] = []
    for resistance in resistances_m2k_w:
        next_temperature = current - heat_flux_w_m2 * resistance
        boundaries.append(TankLayerBoundaryTemperature(current, next_temperature))
        current = next_temperature
    return tuple(boundaries)


def _validate_result(result: TankCoreResult) -> None:
    values = [
        result.total_heat_loss_base_w,
        result.total_heat_loss_design_w,
        result.heat_loss_per_m2_base_w_m2,
        result.heat_loss_per_m2_design_w_m2,
        result.surface_area_m2,
        result.wall_resistance_areal_m2k_w,
        result.insulation_resistance_areal_m2k_w,
        result.external_resistance_areal_m2k_w,
        *result.layer_resistances_areal_m2k_w,
    ]
    optional_values = (
        result.thermal_resistance_areal_m2k_w,
        result.ground_resistance_areal_m2k_w,
        result.air_surface_area_m2,
        result.ground_surface_area_m2,
        result.heat_loss_air_base_w,
        result.heat_loss_ground_base_w,
    )
    values.extend(value for value in optional_values if value is not None)
    for boundary in (
        *result.air_layer_boundary_temperatures,
        *result.ground_layer_boundary_temperatures,
    ):
        values.extend((boundary.hot_side_c, boundary.cold_side_c))
    _validate_finite_result(*values)


def _validate_finite_result(*values: float) -> None:
    if not all(math.isfinite(value) for value in values):
        raise FormulaDomainError("non_finite_result")
