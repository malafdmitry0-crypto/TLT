"""Canonical high-level input and outcome for pipe heat-loss calculation."""

from __future__ import annotations

from dataclasses import dataclass

from . import pipe_evaluation
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
    AirPipeEvaluationInput as AirPipeEvaluationInput,
)
from .pipe_evaluation import (
    PipeEvaluationEnvironment as PipeEvaluationEnvironment,
)
from .pipe_evaluation import PipeFormulaResult as PipeFormulaResult
from .pipe_evaluation import PreparedPipeCalculation as PreparedPipeCalculation
from .pipe_evaluation import PreparedPipeLayer as PreparedPipeLayer
from .pipe_evaluation import (
    UndergroundPipeEvaluationInput as UndergroundPipeEvaluationInput,
)
from .profile import (
    CASE_1_PROFILE,
    HeatLossFormulaProfile,
    InsulationTemperatureBasis,
    validate_heat_loss_formula_profile,
)
from .validation import (
    PIPE_SAFETY_FACTOR_RANGE,
    VALID_FORMULA_VALIDATION_REPORT,
    FormulaValidationIssue,
    FormulaValidationReport,
    validate_numeric_range,
)

PipeFormulaOutcome = FormulaOutcome[PipeFormulaResult]


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
    wall_conductivity_law: ConductivityLaw | None = None
    profile: HeatLossFormulaProfile = CASE_1_PROFILE


def validate_pipe_preparation(data: PipePreparationInput) -> FormulaValidationReport:
    """Reuse the existing fail-fast contract; do not rewrite pipe rules."""

    return validate_pipe_contract(_to_pipe_contract(data))


def assemble_prepared_pipe(
    data: PipePreparationInput,
) -> PreparedPipeCalculation | FormulaValidationReport:
    """Build the calculation input without repeating contract validation.

    Backend callers must already have run the Pydantic/core contract. The
    library entry ``prepare_pipe_calculation`` still validates first.
    """

    if data.safety_factor is not None:
        range_report = validate_numeric_range(
            path=("safety_factor",),
            value=data.safety_factor,
            spec=PIPE_SAFETY_FACTOR_RANGE,
        )
        if not range_report.is_valid:
            return range_report
    return _assemble_validated_pipe(data)


def prepare_pipe_calculation(
    data: PipePreparationInput,
) -> PreparedPipeCalculation | FormulaValidationReport:
    """Return a calculation-ready input only after contract and laws succeed."""

    contract_report = validate_pipe_preparation(data)
    if not contract_report.is_valid:
        return contract_report
    return _assemble_validated_pipe(data)


def evaluate_prepared_pipe(data: PreparedPipeCalculation) -> PipeFormulaOutcome:
    """Calculate one prepared pipe. Layer temperature failures are blocking."""

    evaluation = pipe_evaluation.execute_prepared_pipe(data)
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


def _assemble_validated_pipe(
    data: PipePreparationInput,
) -> PreparedPipeCalculation | FormulaValidationReport:
    profile_report = validate_heat_loss_formula_profile(data.profile)
    if not profile_report.is_valid:
        return profile_report
    law_report = _require_pipe_laws(data)
    if not law_report.is_valid:
        return law_report
    return _to_prepared_pipe(data)


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
        environment=pipe_environment_from_fields(
            placement=data.placement,
            ambient_temperature=data.ambient_temperature,
            wind_speed=data.wind_speed,
            ground_temperature=data.ground_temperature,
            centerline_depth=data.pipe_centerline_depth,
            ground_conductivity=data.ground_conductivity,
        ),
        profile=data.profile,
    )


def pipe_environment_from_fields(
    *,
    placement: PipePlacement,
    ambient_temperature: float | None,
    wind_speed: float | None,
    ground_temperature: float | None,
    centerline_depth: float | None,
    ground_conductivity: float | None,
) -> PipeEvaluationEnvironment:
    """Derive the evaluation environment from the same scalars the contract saw."""

    if placement == "underground":
        if ground_temperature is None or centerline_depth is None or ground_conductivity is None:
            raise ValueError("validated underground pipe requires ground environment fields")
        return UndergroundPipeEvaluationInput(
            ground_temperature_c=ground_temperature,
            centerline_depth_m=centerline_depth,
            ground_conductivity_w_mk=ground_conductivity,
        )
    if ambient_temperature is None:
        raise ValueError("validated air pipe requires ambient_temperature")
    return AirPipeEvaluationInput(
        placement=placement,
        ambient_temperature_c=ambient_temperature,
        wind_speed_m_s=wind_speed,
    )
