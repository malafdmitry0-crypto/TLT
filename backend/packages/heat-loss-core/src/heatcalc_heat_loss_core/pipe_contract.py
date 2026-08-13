"""Pure cross-field contract validation for pipe heat-loss input."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from .insulation_contract import validate_insulation_basis_for_placement
from .material_validation import validate_temperature_in_interval
from .pipe import validate_pipe_formula_domain
from .pipe_validation import validate_pipe_input_ranges
from .validation import (
    FormulaValidationCode,
    FormulaValidationIssue,
    FormulaValidationPath,
    FormulaValidationReport,
)

PipePlacement = Literal["indoor", "outdoor", "underground"]
PipeLayerSource = Literal["manual", "reference"]


@dataclass(frozen=True)
class PipeLayerContract:
    """One resolved layer shape, without material or catalog dependencies."""

    thickness_m: float
    source: PipeLayerSource
    conductivity_supplied: bool
    manual_temperature_range_c: tuple[float, float] | None
    reference_temperature_interval_c: tuple[float, float] | None


@dataclass(frozen=True)
class PipeContractInput:
    """Parsed pipe scalars and catalog-free flags needed for contract checks."""

    outer_diameter: float
    wall_thickness: float
    pipe_lambda: float | None
    has_pipe_material: bool
    layers: tuple[PipeLayerContract, ...]
    ambient_temperature: float | None
    process_temperature: float
    pipe_length: float
    pipe_centerline_depth: float | None
    num_local_elements: int
    local_element_equiv_length: float | None
    wind_speed: float | None
    ground_conductivity: float | None
    ground_temperature: float | None
    safety_factor: float | None
    placement: PipePlacement
    insulation_temperature_basis: str | None


def validate_pipe_contract(data: PipeContractInput) -> FormulaValidationReport:
    """Validate pipe ranges and cross-field rules in legacy execution order.

    Material lookup remains outside this pure domain. Callers pass resolved
    reference temperature intervals; core owns the membership decision.
    """

    range_report = validate_pipe_input_ranges(
        outer_diameter=data.outer_diameter,
        wall_thickness=data.wall_thickness,
        pipe_lambda=data.pipe_lambda,
        ambient_temperature=data.ambient_temperature,
        process_temperature=data.process_temperature,
        pipe_length=data.pipe_length,
        pipe_centerline_depth=data.pipe_centerline_depth,
        num_local_elements=data.num_local_elements,
        local_element_equiv_length=data.local_element_equiv_length,
        wind_speed=data.wind_speed,
        ground_conductivity=data.ground_conductivity,
        ground_temperature=data.ground_temperature,
        safety_factor=data.safety_factor,
        insulation_layer_count=len(data.layers),
    )
    if not range_report.is_valid:
        return range_report

    basis_report = validate_insulation_basis_for_placement(
        basis=data.insulation_temperature_basis,
        placement=data.placement,
    )
    if not basis_report.is_valid:
        return basis_report

    if data.has_pipe_material == (data.pipe_lambda is not None):
        return _issue("pipe_conductivity_source_xor")

    for index, layer in enumerate(data.layers):
        path = ("insulation_layers", index)
        if layer.source == "manual":
            if not layer.conductivity_supplied:
                return _issue(
                    "manual_layer_conductivity_required", (*path, "conductivity"), index=index
                )
            if layer.manual_temperature_range_c is None:
                return _issue(
                    "manual_layer_temperature_range_required",
                    (*path, "temperature_range"),
                    index=index,
                )
            minimum_c, maximum_c = layer.manual_temperature_range_c
            if minimum_c >= maximum_c:
                return _issue(
                    "invalid_temperature_interval",
                    (*path, "temperature_range"),
                    minimum_c=minimum_c,
                    maximum_c=maximum_c,
                )
        else:
            if layer.conductivity_supplied or layer.manual_temperature_range_c is not None:
                return _issue("reference_layer_has_manual_properties", path, index=index)
            if layer.reference_temperature_interval_c is not None:
                minimum_c, maximum_c = layer.reference_temperature_interval_c
                interval_report = validate_temperature_in_interval(
                    temperature_c=data.process_temperature,
                    minimum_c=minimum_c,
                    maximum_c=maximum_c,
                    path=path,
                )
                if not interval_report.is_valid:
                    return interval_report

    if data.num_local_elements > 0 and data.local_element_equiv_length is None:
        return _issue("local_elements_require_equivalent_length", ("local_element_equiv_length",))

    if data.placement == "underground":
        if data.ground_temperature is None:
            return _issue("underground_field_required", ("ground_temperature",))
        if data.pipe_centerline_depth is None:
            return _issue("underground_field_required", ("pipe_centerline_depth",))
        if data.ground_conductivity is None:
            return _issue("underground_field_required", ("ground_conductivity",))
        if data.ambient_temperature is not None:
            return _issue("underground_forbids_ambient_temperature", ("ambient_temperature",))
        if data.wind_speed is not None:
            return _issue("underground_forbids_wind_speed", ("wind_speed",))
        return validate_pipe_formula_domain(
            outer_diameter_m=data.outer_diameter,
            wall_thickness_m=data.wall_thickness,
            insulation_layer_thicknesses_m=tuple(layer.thickness_m for layer in data.layers),
            process_temperature_c=data.process_temperature,
            environment_temperature_c=data.ground_temperature,
            environment="ground",
            centerline_depth_m=data.pipe_centerline_depth,
        )

    if data.ambient_temperature is None:
        return _issue("air_pipe_ambient_temperature_required", ("ambient_temperature",))
    if data.pipe_centerline_depth is not None:
        return _issue("air_pipe_forbids_centerline_depth", ("pipe_centerline_depth",))
    if data.ground_temperature is not None or data.ground_conductivity is not None:
        return _issue("air_pipe_forbids_ground_parameters")
    if data.placement == "outdoor" and data.wind_speed is None:
        return _issue("outdoor_wind_speed_required", ("wind_speed",))
    return validate_pipe_formula_domain(
        outer_diameter_m=data.outer_diameter,
        wall_thickness_m=data.wall_thickness,
        insulation_layer_thicknesses_m=(),
        process_temperature_c=data.process_temperature,
        environment_temperature_c=data.ambient_temperature,
        environment="ambient",
    )


def _issue(
    code: FormulaValidationCode,
    path: FormulaValidationPath = (),
    **details: float | int,
) -> FormulaValidationReport:
    return FormulaValidationReport(
        (FormulaValidationIssue.with_details(code, path=path, **details),)
    )
