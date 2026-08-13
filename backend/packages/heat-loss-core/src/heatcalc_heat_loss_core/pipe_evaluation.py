"""High-level pure evaluation of catalog-resolved pipe heat-loss inputs."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from .conductivity import ConductivityLaw, evaluate_conductivity
from .errors import FormulaDomainError
from .material_validation import validate_hot_side_temperature_in_interval
from .pipe import (
    AbovegroundPipeInput,
    PipeCoreResult,
    PipeInsulationLayer,
    PipeLayerBoundaryTemperature,
    UndergroundPipeInput,
    calculate_aboveground_pipe,
    calculate_underground_pipe,
)
from .profile import (
    CASE_1_PROFILE,
    HeatLossFormulaProfile,
    InsulationTemperatureBasis,
    resolve_external_alpha,
    resolve_insulation_temperature,
    resolve_safety_factor,
)
from .thermal import arithmetic_mean
from .validation import FormulaValidationIssue, FormulaValidationReport

AirPlacement = Literal["indoor", "outdoor"]


@dataclass(frozen=True)
class PipeEvaluationLayer:
    """One catalog-resolved insulation layer without a material identity."""

    thickness_m: float
    conductivity_law: ConductivityLaw
    temperature_interval_c: tuple[float, float]


@dataclass(frozen=True)
class AirPipeEvaluationInput:
    """Resolved air-exposed pipe conditions."""

    placement: AirPlacement
    ambient_temperature_c: float
    wind_speed_m_s: float | None


@dataclass(frozen=True)
class UndergroundPipeEvaluationInput:
    """Resolved directly buried pipe conditions."""

    ground_temperature_c: float
    centerline_depth_m: float
    ground_conductivity_w_mk: float


PipeEvaluationEnvironment = AirPipeEvaluationInput | UndergroundPipeEvaluationInput


@dataclass(frozen=True)
class PipeEvaluationInput:
    """Fully resolved pipe data, ready for a pure high-level calculation."""

    outer_diameter_m: float
    wall_thickness_m: float
    wall_conductivity_law: ConductivityLaw
    insulation_layers: tuple[PipeEvaluationLayer, ...]
    process_temperature_c: float
    insulation_temperature_basis: InsulationTemperatureBasis
    pipe_length_m: float
    local_elements_count: int
    local_element_equiv_length_m: float
    safety_factor_primary: float | None
    safety_factor_override: float | None
    environment: PipeEvaluationEnvironment
    profile: HeatLossFormulaProfile = CASE_1_PROFILE


@dataclass(frozen=True)
class PipeEvaluationLayerResult:
    """Unrounded resolved values and boundary temperatures for one layer."""

    conductivity_w_mk: float
    resistance_mk_w: float
    boundary_temperatures: PipeLayerBoundaryTemperature


@dataclass(frozen=True)
class PipeEvaluationResult:
    """Pure, unrounded pipe result plus resolved trace values."""

    core_result: PipeCoreResult
    wall_conductivity_w_mk: float
    insulation_temperature_c: float
    safety_factor: float
    external_alpha_w_m2k: float | None
    ground_conductivity_w_mk: float | None
    layer_results: tuple[PipeEvaluationLayerResult, ...]
    layer_temperature_report: FormulaValidationReport
    formula_model: str = "pipe_heat_loss"
    formula_model_version: str = "2"
    model_assumptions: tuple[str, ...] = (
        "steady_state_one_dimensional_radial_heat_flow",
        "uniform_equivalent_length_per_local_element",
    )
    source_corrections: tuple[str, ...] = ("base_and_design_heat_losses_reported_separately",)


def evaluate_pipe(data: PipeEvaluationInput) -> PipeEvaluationResult:
    """Evaluate one resolved pipe exactly once per law and low-level branch.

    Structural/range/placement validation and catalog lookup belong to callers.
    Layer-temperature violations are reported structurally after calculating all
    layer boundaries, matching the facade's post-formula validation phase.
    """

    environment_temperature_c = _environment_temperature(data.environment)
    wall_temperature_c = arithmetic_mean(data.process_temperature_c, environment_temperature_c)
    wall_conductivity_w_mk = evaluate_conductivity(data.wall_conductivity_law, wall_temperature_c)
    insulation_temperature_c = resolve_insulation_temperature(
        data.process_temperature_c,
        basis=data.insulation_temperature_basis,
        profile=data.profile,
    )
    layer_conductivities = _layer_conductivities(
        data.insulation_layers,
        insulation_temperature_c,
    )
    numeric_layers = tuple(
        PipeInsulationLayer(thickness_m=layer.thickness_m, conductivity_w_mk=conductivity)
        for layer, conductivity in zip(data.insulation_layers, layer_conductivities, strict=True)
    )
    safety_factor = resolve_safety_factor(
        primary=data.safety_factor_primary,
        override=data.safety_factor_override,
        profile=data.profile,
    )

    if isinstance(data.environment, UndergroundPipeEvaluationInput):
        core_result = calculate_underground_pipe(
            UndergroundPipeInput(
                outer_diameter_m=data.outer_diameter_m,
                wall_thickness_m=data.wall_thickness_m,
                wall_conductivity_w_mk=wall_conductivity_w_mk,
                insulation_layers=numeric_layers,
                process_temperature_c=data.process_temperature_c,
                ground_temperature_c=data.environment.ground_temperature_c,
                pipe_length_m=data.pipe_length_m,
                local_elements_count=data.local_elements_count,
                local_element_equiv_length_m=data.local_element_equiv_length_m,
                safety_factor=safety_factor,
                centerline_depth_m=data.environment.centerline_depth_m,
                ground_conductivity_w_mk=data.environment.ground_conductivity_w_mk,
            )
        )
        external_alpha_w_m2k = None
        ground_conductivity_w_mk = data.environment.ground_conductivity_w_mk
        model_assumptions: tuple[str, ...] = (
            "steady_state_one_dimensional_radial_heat_flow",
            "uniform_equivalent_length_per_local_element",
            "direct_buried_pipe_in_homogeneous_ground",
        )
        source_corrections: tuple[str, ...] = (
            "base_and_design_heat_losses_reported_separately",
            "ground_temperature_used_for_underground_pipe",
        )
    else:
        external_alpha_w_m2k = resolve_external_alpha(
            placement=data.environment.placement,
            wind_speed_m_s=data.environment.wind_speed_m_s,
            profile=data.profile,
        )
        core_result = calculate_aboveground_pipe(
            AbovegroundPipeInput(
                outer_diameter_m=data.outer_diameter_m,
                wall_thickness_m=data.wall_thickness_m,
                wall_conductivity_w_mk=wall_conductivity_w_mk,
                insulation_layers=numeric_layers,
                process_temperature_c=data.process_temperature_c,
                ambient_temperature_c=data.environment.ambient_temperature_c,
                pipe_length_m=data.pipe_length_m,
                local_elements_count=data.local_elements_count,
                local_element_equiv_length_m=data.local_element_equiv_length_m,
                safety_factor=safety_factor,
                external_alpha_w_m2k=external_alpha_w_m2k,
            )
        )
        ground_conductivity_w_mk = None
        model_assumptions = (
            "steady_state_one_dimensional_radial_heat_flow",
            "uniform_equivalent_length_per_local_element",
        )
        source_corrections = (
            "base_and_design_heat_losses_reported_separately",
            *(
                ("outdoor_auto_alpha_requires_explicit_wind_speed",)
                if data.environment.placement == "outdoor"
                else ()
            ),
        )

    layer_results = tuple(
        PipeEvaluationLayerResult(
            conductivity_w_mk=conductivity,
            resistance_mk_w=resistance,
            boundary_temperatures=boundary,
        )
        for conductivity, resistance, boundary in zip(
            layer_conductivities,
            core_result.layer_resistances_mk_w,
            core_result.layer_boundary_temperatures,
            strict=True,
        )
    )
    return PipeEvaluationResult(
        core_result=core_result,
        wall_conductivity_w_mk=wall_conductivity_w_mk,
        insulation_temperature_c=insulation_temperature_c,
        safety_factor=safety_factor,
        external_alpha_w_m2k=external_alpha_w_m2k,
        ground_conductivity_w_mk=ground_conductivity_w_mk,
        layer_results=layer_results,
        layer_temperature_report=_validate_layer_temperatures(
            data.insulation_layers, layer_results
        ),
        model_assumptions=model_assumptions,
        source_corrections=source_corrections,
    )


def _environment_temperature(environment: PipeEvaluationEnvironment) -> float:
    if isinstance(environment, UndergroundPipeEvaluationInput):
        return environment.ground_temperature_c
    return environment.ambient_temperature_c


def _layer_conductivities(
    layers: tuple[PipeEvaluationLayer, ...],
    temperature_c: float,
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


def _validate_layer_temperatures(
    layers: tuple[PipeEvaluationLayer, ...],
    layer_results: tuple[PipeEvaluationLayerResult, ...],
) -> FormulaValidationReport:
    """Collect all hotter-boundary interval violations in layer order."""

    issues: tuple[FormulaValidationIssue, ...] = ()
    for index, (layer, result) in enumerate(zip(layers, layer_results, strict=True)):
        minimum_c, maximum_c = layer.temperature_interval_c
        report = validate_hot_side_temperature_in_interval(
            first_side_c=result.boundary_temperatures.hot_side_c,
            second_side_c=result.boundary_temperatures.cold_side_c,
            minimum_c=minimum_c,
            maximum_c=maximum_c,
            path=("insulation_layers", index),
        )
        issues += report.issues
    return FormulaValidationReport(issues)
