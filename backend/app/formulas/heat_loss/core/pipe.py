"""Pure numeric pipe heat-loss formulas.

All inputs use SI units (temperatures are expressed in degrees Celsius, where
only temperature differences are used).  Reference-data resolution and result
serialization intentionally belong to the backend facade.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from .errors import FormulaDomainError
from .geometry import layered_outer_radius, outer_radius_after_layer, radius_from_diameter


@dataclass(frozen=True)
class PipeInsulationLayer:
    """A resolved cylindrical insulation layer."""

    thickness_m: float
    conductivity_w_mk: float


@dataclass(frozen=True)
class AbovegroundPipeInput:
    """Numeric input for a pipe exchanging heat with air."""

    outer_diameter_m: float
    wall_thickness_m: float
    wall_conductivity_w_mk: float
    insulation_layers: tuple[PipeInsulationLayer, ...]
    process_temperature_c: float
    ambient_temperature_c: float
    pipe_length_m: float
    local_elements_count: int
    local_element_equiv_length_m: float
    safety_factor: float
    external_alpha_w_m2k: float


@dataclass(frozen=True)
class UndergroundPipeInput:
    """Numeric input for a directly buried pipe."""

    outer_diameter_m: float
    wall_thickness_m: float
    wall_conductivity_w_mk: float
    insulation_layers: tuple[PipeInsulationLayer, ...]
    process_temperature_c: float
    ground_temperature_c: float
    pipe_length_m: float
    local_elements_count: int
    local_element_equiv_length_m: float
    safety_factor: float
    centerline_depth_m: float
    ground_conductivity_w_mk: float


@dataclass(frozen=True)
class PipeLayerBoundaryTemperature:
    """Temperatures at the hot and cold sides of an insulation layer."""

    hot_side_c: float
    cold_side_c: float


@dataclass(frozen=True)
class PipeCoreResult:
    """Unrounded numerical result of a pipe heat-loss calculation."""

    heat_loss_per_meter_base_w_m: float
    heat_loss_per_meter_design_w_m: float
    total_heat_loss_base_w: float
    total_heat_loss_design_w: float
    effective_length_m: float
    additional_equivalent_length_m: float
    thermal_resistance_mk_w: float
    wall_resistance_mk_w: float
    insulation_resistance_mk_w: float
    external_resistance_mk_w: float
    insulation_outer_radius_m: float
    layer_resistances_mk_w: tuple[float, ...]
    layer_boundary_temperatures: tuple[PipeLayerBoundaryTemperature, ...]


def calculate_aboveground_pipe(data: AbovegroundPipeInput) -> PipeCoreResult:
    """Calculate an air-exposed cylindrical pipe with resolved numeric input."""
    return _calculate_pipe(
        outer_diameter_m=data.outer_diameter_m,
        wall_thickness_m=data.wall_thickness_m,
        wall_conductivity_w_mk=data.wall_conductivity_w_mk,
        insulation_layers=data.insulation_layers,
        process_temperature_c=data.process_temperature_c,
        environment_temperature_c=data.ambient_temperature_c,
        pipe_length_m=data.pipe_length_m,
        local_elements_count=data.local_elements_count,
        local_element_equiv_length_m=data.local_element_equiv_length_m,
        safety_factor=data.safety_factor,
        external_resistance_mk_w=_external_resistance(
            data.outer_diameter_m,
            data.insulation_layers,
            data.external_alpha_w_m2k,
        ),
    )


def calculate_underground_pipe(data: UndergroundPipeInput) -> PipeCoreResult:
    """Calculate a directly buried cylindrical pipe with resolved numeric input."""
    outer_radius = layered_outer_radius(
        data.outer_diameter_m,
        tuple(layer.thickness_m for layer in data.insulation_layers),
    )
    return _calculate_pipe(
        outer_diameter_m=data.outer_diameter_m,
        wall_thickness_m=data.wall_thickness_m,
        wall_conductivity_w_mk=data.wall_conductivity_w_mk,
        insulation_layers=data.insulation_layers,
        process_temperature_c=data.process_temperature_c,
        environment_temperature_c=data.ground_temperature_c,
        pipe_length_m=data.pipe_length_m,
        local_elements_count=data.local_elements_count,
        local_element_equiv_length_m=data.local_element_equiv_length_m,
        safety_factor=data.safety_factor,
        external_resistance_mk_w=_ground_resistance(
            outer_radius,
            data.centerline_depth_m,
            data.ground_conductivity_w_mk,
        ),
    )


def _calculate_pipe(
    *,
    outer_diameter_m: float,
    wall_thickness_m: float,
    wall_conductivity_w_mk: float,
    insulation_layers: tuple[PipeInsulationLayer, ...],
    process_temperature_c: float,
    environment_temperature_c: float,
    pipe_length_m: float,
    local_elements_count: int,
    local_element_equiv_length_m: float,
    safety_factor: float,
    external_resistance_mk_w: float,
) -> PipeCoreResult:
    r_outer_pipe = radius_from_diameter(outer_diameter_m)
    r_inner_pipe = r_outer_pipe - wall_thickness_m
    wall_resistance = _cylindrical_resistance(r_inner_pipe, r_outer_pipe, wall_conductivity_w_mk)
    insulation_resistance, insulation_outer_radius, layer_resistances = _insulation_resistance(
        r_outer_pipe,
        insulation_layers,
    )
    thermal_resistance = wall_resistance + insulation_resistance + external_resistance_mk_w
    heat_loss_per_meter_base = (
        process_temperature_c - environment_temperature_c
    ) / thermal_resistance
    layer_boundary_temperatures = _layer_boundary_temperatures(
        process_temperature_c - heat_loss_per_meter_base * wall_resistance,
        heat_loss_per_meter_base,
        layer_resistances,
    )
    additional_equivalent_length = local_elements_count * local_element_equiv_length_m
    effective_length = pipe_length_m + additional_equivalent_length
    heat_loss_per_meter_design = heat_loss_per_meter_base * safety_factor
    total_heat_loss_base = heat_loss_per_meter_base * effective_length
    total_heat_loss_design = heat_loss_per_meter_base * effective_length * safety_factor
    _validate_result_finite(
        heat_loss_per_meter_base,
        heat_loss_per_meter_design,
        total_heat_loss_base,
        total_heat_loss_design,
        effective_length,
        additional_equivalent_length,
        thermal_resistance,
        wall_resistance,
        insulation_resistance,
        external_resistance_mk_w,
        insulation_outer_radius,
        *layer_resistances,
        *(
            temperature
            for boundary in layer_boundary_temperatures
            for temperature in (boundary.hot_side_c, boundary.cold_side_c)
        ),
    )
    return PipeCoreResult(
        heat_loss_per_meter_base_w_m=heat_loss_per_meter_base,
        heat_loss_per_meter_design_w_m=heat_loss_per_meter_design,
        total_heat_loss_base_w=total_heat_loss_base,
        total_heat_loss_design_w=total_heat_loss_design,
        effective_length_m=effective_length,
        additional_equivalent_length_m=additional_equivalent_length,
        thermal_resistance_mk_w=thermal_resistance,
        wall_resistance_mk_w=wall_resistance,
        insulation_resistance_mk_w=insulation_resistance,
        external_resistance_mk_w=external_resistance_mk_w,
        insulation_outer_radius_m=insulation_outer_radius,
        layer_resistances_mk_w=layer_resistances,
        layer_boundary_temperatures=layer_boundary_temperatures,
    )


def _external_resistance(
    outer_diameter_m: float,
    layers: tuple[PipeInsulationLayer, ...],
    alpha_w_m2k: float,
) -> float:
    outer_radius = layered_outer_radius(
        outer_diameter_m,
        tuple(layer.thickness_m for layer in layers),
    )
    return 1.0 / (2 * math.pi * outer_radius * alpha_w_m2k)


def _ground_resistance(
    outer_radius_m: float,
    centerline_depth_m: float,
    ground_conductivity_w_mk: float,
) -> float:
    x = centerline_depth_m / outer_radius_m
    # Keep this log/sqrt form (rather than acosh) for stable legacy results.
    acosh_value = math.log(x + math.sqrt(x * x - 1))
    return acosh_value / (2 * math.pi * ground_conductivity_w_mk)


def _cylindrical_resistance(r_in_m: float, r_out_m: float, conductivity_w_mk: float) -> float:
    return math.log(r_out_m / r_in_m) / (2 * math.pi * conductivity_w_mk)


def _insulation_resistance(
    r_start_m: float,
    layers: tuple[PipeInsulationLayer, ...],
) -> tuple[float, float, tuple[float, ...]]:
    radius = r_start_m
    resistance_total = 0.0
    resistances: list[float] = []
    for layer in layers:
        r_out = outer_radius_after_layer(radius, layer.thickness_m)
        resistance = _cylindrical_resistance(radius, r_out, layer.conductivity_w_mk)
        resistance_total += resistance
        resistances.append(resistance)
        radius = r_out
    return resistance_total, radius, tuple(resistances)


def _layer_boundary_temperatures(
    hot_side_temperature_c: float,
    heat_flux_w_m: float,
    layer_resistances_mk_w: tuple[float, ...],
) -> tuple[PipeLayerBoundaryTemperature, ...]:
    current_temperature = hot_side_temperature_c
    boundaries: list[PipeLayerBoundaryTemperature] = []
    for resistance in layer_resistances_mk_w:
        next_temperature = current_temperature - heat_flux_w_m * resistance
        boundaries.append(
            PipeLayerBoundaryTemperature(
                hot_side_c=current_temperature,
                cold_side_c=next_temperature,
            )
        )
        current_temperature = next_temperature
    return tuple(boundaries)


def _validate_pipe_input(
    *,
    outer_diameter_m: float,
    wall_thickness_m: float,
    wall_conductivity_w_mk: float,
    insulation_layers: tuple[PipeInsulationLayer, ...],
    process_temperature_c: float,
    environment_temperature_c: float,
    pipe_length_m: float,
    local_elements_count: int,
    local_element_equiv_length_m: float,
    safety_factor: float,
    external_resistance_mk_w: float,
) -> None:
    """Dormant input guard retained while Pydantic owns production admission."""

    _validate_finite(
        outer_diameter_m,
        wall_thickness_m,
        wall_conductivity_w_mk,
        process_temperature_c,
        environment_temperature_c,
        pipe_length_m,
        local_element_equiv_length_m,
        safety_factor,
        external_resistance_mk_w,
    )
    if outer_diameter_m <= 0:
        raise FormulaDomainError("nonpositive_outer_diameter", outer_diameter_m=outer_diameter_m)
    if wall_thickness_m <= 0:
        raise FormulaDomainError("nonpositive_wall_thickness", wall_thickness_m=wall_thickness_m)
    if wall_conductivity_w_mk <= 0:
        raise FormulaDomainError(
            "nonpositive_wall_conductivity", conductivity_w_mk=wall_conductivity_w_mk
        )
    if pipe_length_m <= 0:
        raise FormulaDomainError("nonpositive_pipe_length", pipe_length_m=pipe_length_m)
    if local_elements_count < 0:
        raise FormulaDomainError(
            "negative_local_elements", local_elements_count=local_elements_count
        )
    if local_element_equiv_length_m < 0:
        raise FormulaDomainError(
            "negative_local_element_length", length_m=local_element_equiv_length_m
        )
    if safety_factor <= 0:
        raise FormulaDomainError("nonpositive_safety_factor", safety_factor=safety_factor)
    if process_temperature_c <= environment_temperature_c:
        raise FormulaDomainError("nonpositive_temperature_difference")

    r_outer_pipe = radius_from_diameter(outer_diameter_m)
    if wall_thickness_m >= r_outer_pipe:
        raise FormulaDomainError(
            "wall_exceeds_pipe_radius",
            wall_thickness_m=wall_thickness_m,
            outer_radius_m=r_outer_pipe,
        )
    for layer in insulation_layers:
        if not math.isfinite(layer.thickness_m) or layer.thickness_m <= 0:
            raise FormulaDomainError("nonpositive_layer_thickness", thickness_m=layer.thickness_m)
        if not math.isfinite(layer.conductivity_w_mk) or layer.conductivity_w_mk <= 0:
            raise FormulaDomainError(
                "nonpositive_layer_conductivity",
                conductivity_w_mk=layer.conductivity_w_mk,
            )


def _validate_ground_input(
    outer_radius_m: float,
    centerline_depth_m: float,
    ground_conductivity_w_mk: float,
) -> None:
    """Dormant buried-pipe input guard retained outside the production path."""

    _validate_finite(outer_radius_m, centerline_depth_m, ground_conductivity_w_mk)
    if outer_radius_m <= 0 or centerline_depth_m <= 0:
        raise FormulaDomainError("invalid_ground_geometry")
    if ground_conductivity_w_mk <= 0:
        raise FormulaDomainError(
            "nonpositive_ground_conductivity",
            conductivity_w_mk=ground_conductivity_w_mk,
        )
    if centerline_depth_m < outer_radius_m:
        raise FormulaDomainError(
            "ground_centerline_inside_pipe",
            centerline_depth_m=centerline_depth_m,
            outer_radius_m=outer_radius_m,
        )


def _validate_insulation_outer_radius_input(
    outer_diameter_m: float,
    wall_thickness_m: float,
    layers: tuple[PipeInsulationLayer, ...],
) -> None:
    """Dormant geometry guard retained outside the production path."""

    if not math.isfinite(outer_diameter_m) or not math.isfinite(wall_thickness_m):
        raise FormulaDomainError("non_finite_input")
    if outer_diameter_m <= 0 or wall_thickness_m <= 0:
        raise FormulaDomainError("invalid_pipe_geometry")
    for layer in layers:
        if not math.isfinite(layer.thickness_m) or layer.thickness_m <= 0:
            raise FormulaDomainError("nonpositive_layer_thickness", thickness_m=layer.thickness_m)


def _validate_external_resistance_input(alpha_w_m2k: float) -> None:
    """Dormant air-film guard retained outside the production path."""

    if not math.isfinite(alpha_w_m2k) or alpha_w_m2k <= 0:
        raise FormulaDomainError("nonpositive_external_alpha", alpha_w_m2k=alpha_w_m2k)


def _validate_cylindrical_resistance_input(
    r_in_m: float,
    r_out_m: float,
    conductivity_w_mk: float,
) -> None:
    """Dormant cylindrical-domain guard retained outside the production path."""

    if r_in_m <= 0 or r_out_m <= 0 or r_out_m <= r_in_m:
        raise FormulaDomainError("invalid_cylindrical_geometry")
    if conductivity_w_mk <= 0:
        raise FormulaDomainError(
            "nonpositive_conductivity",
            conductivity_w_mk=conductivity_w_mk,
        )


def _validate_thermal_resistance_input(thermal_resistance_mk_w: float) -> None:
    """Dormant aggregate-resistance guard retained outside the production path."""

    if thermal_resistance_mk_w == 0:
        raise FormulaDomainError("zero_thermal_resistance")


def _validate_finite(*values: float) -> None:
    if not all(math.isfinite(value) for value in values):
        raise FormulaDomainError("non_finite_input")


def _validate_result_finite(*values: float) -> None:
    if not all(math.isfinite(value) for value in values):
        raise FormulaDomainError("non_finite_result")
