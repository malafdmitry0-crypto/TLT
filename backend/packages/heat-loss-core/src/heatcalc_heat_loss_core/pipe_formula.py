"""Preparation and calculation-ready pipe inputs for the new high-level path.

Old ``PipeContractInput`` / ``PipeEvaluationInput`` / ``evaluate_pipe`` stay
unchanged. This module adds a candidate input that may lack conductivity laws
and a prepared input that the formula can accept.
"""

from __future__ import annotations

from dataclasses import dataclass

from .conductivity import ConductivityLaw
from .formula_outcome import FormulaOutcome
from .pipe_contract import (
    PipeContractInput,
    PipeLayerContract,
    PipeLayerSource,
    PipePlacement,
    validate_pipe_contract,
)
from .pipe_evaluation import (
    PipeEvaluationEnvironment,
    PipeEvaluationInput,
    PipeEvaluationLayer,
    PipeEvaluationResult,
    evaluate_pipe,
)
from .profile import CASE_1_PROFILE, HeatLossFormulaProfile, InsulationTemperatureBasis
from .validation import (
    VALID_FORMULA_VALIDATION_REPORT,
    FormulaValidationIssue,
    FormulaValidationReport,
)

PipeFormulaOutcome = FormulaOutcome[PipeEvaluationResult]


@dataclass(frozen=True)
class PipePreparationLayer:
    """One pipe layer before catalog/manual law resolution is proven complete."""

    thickness_m: float
    source: PipeLayerSource
    conductivity_supplied: bool
    manual_temperature_range_c: tuple[float, float] | None
    reference_temperature_interval_c: tuple[float, float] | None
    conductivity_law: ConductivityLaw | None = None


@dataclass(frozen=True)
class PipePreparationInput:
    """Application-resolved candidate. Conductivity laws may still be missing."""

    outer_diameter: float
    wall_thickness: float
    pipe_lambda: float | None
    has_pipe_material: bool
    layers: tuple[PipePreparationLayer, ...]
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
    insulation_temperature_basis: InsulationTemperatureBasis | None
    environment: PipeEvaluationEnvironment
    wall_conductivity_law: ConductivityLaw | None = None
    profile: HeatLossFormulaProfile = CASE_1_PROFILE


@dataclass(frozen=True)
class PreparedPipeLayer:
    """Layer that already has everything the numeric formula needs."""

    thickness_m: float
    source: PipeLayerSource
    conductivity_law: ConductivityLaw
    temperature_interval_c: tuple[float, float]


@dataclass(frozen=True)
class PreparedPipeCalculation:
    """Immutable pipe input with required laws and a concrete safety factor."""

    outer_diameter_m: float
    wall_thickness_m: float
    wall_conductivity_law: ConductivityLaw
    layers: tuple[PreparedPipeLayer, ...]
    process_temperature_c: float
    insulation_temperature_basis: InsulationTemperatureBasis
    pipe_length_m: float
    local_elements_count: int
    local_element_equiv_length_m: float
    safety_factor: float
    environment: PipeEvaluationEnvironment
    profile: HeatLossFormulaProfile = CASE_1_PROFILE


def validate_pipe_preparation(data: PipePreparationInput) -> FormulaValidationReport:
    """Reuse the existing fail-fast contract; do not rewrite pipe rules."""

    return validate_pipe_contract(_to_pipe_contract(data))


def prepare_pipe_calculation(
    data: PipePreparationInput,
) -> PreparedPipeCalculation | FormulaValidationReport:
    """Return a calculation-ready input only after contract and laws succeed."""

    contract_report = validate_pipe_preparation(data)
    if not contract_report.is_valid:
        return contract_report
    law_report = _require_pipe_laws(data)
    if not law_report.is_valid:
        return law_report
    return _to_prepared_pipe(data)


def evaluate_prepared_pipe(data: PreparedPipeCalculation) -> PipeFormulaOutcome:
    """Calculate one prepared pipe. Layer temperature failures are blocking."""

    evaluation = evaluate_pipe(_to_evaluation_input(data))
    if not evaluation.layer_temperature_report.is_valid:
        return PipeFormulaOutcome(result=None, report=evaluation.layer_temperature_report)
    return PipeFormulaOutcome(result=evaluation, report=VALID_FORMULA_VALIDATION_REPORT)


def run_pipe_formula(data: PipePreparationInput) -> PipeFormulaOutcome:
    """Validate, prepare, then calculate. Never returns result plus errors."""

    prepared = prepare_pipe_calculation(data)
    if isinstance(prepared, FormulaValidationReport):
        return PipeFormulaOutcome(result=None, report=prepared)
    return evaluate_prepared_pipe(prepared)


def _to_pipe_contract(data: PipePreparationInput) -> PipeContractInput:
    return PipeContractInput(
        outer_diameter=data.outer_diameter,
        wall_thickness=data.wall_thickness,
        pipe_lambda=data.pipe_lambda,
        has_pipe_material=data.has_pipe_material,
        layers=tuple(
            PipeLayerContract(
                thickness_m=layer.thickness_m,
                source=layer.source,
                conductivity_supplied=layer.conductivity_supplied,
                manual_temperature_range_c=layer.manual_temperature_range_c,
                reference_temperature_interval_c=layer.reference_temperature_interval_c,
            )
            for layer in data.layers
        ),
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
        placement=data.placement,
        insulation_temperature_basis=data.insulation_temperature_basis,
    )


def _require_pipe_laws(data: PipePreparationInput) -> FormulaValidationReport:
    if data.wall_conductivity_law is None:
        return FormulaValidationReport(
            (FormulaValidationIssue(code="conductivity_law_required", path=("pipe_lambda",)),)
        )
    for index, layer in enumerate(data.layers):
        if layer.conductivity_law is None:
            return FormulaValidationReport(
                (
                    FormulaValidationIssue(
                        code="conductivity_law_required",
                        path=("insulation_layers", index, "conductivity"),
                    ),
                )
            )
        if _layer_interval(layer) is None:
            return FormulaValidationReport(
                (
                    FormulaValidationIssue(
                        code="manual_layer_temperature_range_required",
                        path=("insulation_layers", index, "temperature_range"),
                    ),
                )
            )
    return VALID_FORMULA_VALIDATION_REPORT


def _layer_interval(layer: PipePreparationLayer) -> tuple[float, float] | None:
    if layer.source == "manual":
        return layer.manual_temperature_range_c
    return layer.reference_temperature_interval_c


def _to_prepared_pipe(data: PipePreparationInput) -> PreparedPipeCalculation:
    if data.insulation_temperature_basis is None:
        raise ValueError("validated pipe preparation must include insulation_temperature_basis")
    if data.wall_conductivity_law is None:
        raise ValueError("validated pipe preparation must include wall_conductivity_law")
    prepared_layers: list[PreparedPipeLayer] = []
    for layer in data.layers:
        if layer.conductivity_law is None:
            raise ValueError("validated pipe layer must include conductivity_law")
        interval = _layer_interval(layer)
        if interval is None:
            raise ValueError("validated pipe layer must include a temperature interval")
        prepared_layers.append(
            PreparedPipeLayer(
                thickness_m=layer.thickness_m,
                source=layer.source,
                conductivity_law=layer.conductivity_law,
                temperature_interval_c=interval,
            )
        )
    safety_factor = (
        data.profile.default_safety_factor if data.safety_factor is None else data.safety_factor
    )
    return PreparedPipeCalculation(
        outer_diameter_m=data.outer_diameter,
        wall_thickness_m=data.wall_thickness,
        wall_conductivity_law=data.wall_conductivity_law,
        layers=tuple(prepared_layers),
        process_temperature_c=data.process_temperature,
        insulation_temperature_basis=data.insulation_temperature_basis,
        pipe_length_m=data.pipe_length,
        local_elements_count=data.num_local_elements,
        local_element_equiv_length_m=data.local_element_equiv_length or 0.0,
        safety_factor=safety_factor,
        environment=data.environment,
        profile=data.profile,
    )


def _to_evaluation_input(data: PreparedPipeCalculation) -> PipeEvaluationInput:
    return PipeEvaluationInput(
        outer_diameter_m=data.outer_diameter_m,
        wall_thickness_m=data.wall_thickness_m,
        wall_conductivity_law=data.wall_conductivity_law,
        insulation_layers=tuple(
            PipeEvaluationLayer(
                thickness_m=layer.thickness_m,
                conductivity_law=layer.conductivity_law,
                temperature_interval_c=layer.temperature_interval_c,
            )
            for layer in data.layers
        ),
        process_temperature_c=data.process_temperature_c,
        insulation_temperature_basis=data.insulation_temperature_basis,
        pipe_length_m=data.pipe_length_m,
        local_elements_count=data.local_elements_count,
        local_element_equiv_length_m=data.local_element_equiv_length_m,
        safety_factor_primary=data.safety_factor,
        safety_factor_override=None,
        environment=data.environment,
        profile=data.profile,
    )
