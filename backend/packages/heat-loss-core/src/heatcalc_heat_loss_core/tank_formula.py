"""Preparation and calculation-ready tank inputs for the new high-level path."""

from __future__ import annotations

from dataclasses import dataclass

from . import tank_evaluation
from .conductivity import ConductivityLaw
from .formula_outcome import FormulaOutcome
from .profile import (
    CASE_1_PROFILE,
    HeatLossFormulaProfile,
    InsulationTemperatureBasis,
    validate_heat_loss_formula_profile,
)
from .tank import CylindricalTankGeometry, RectangularTankGeometry, TankGeometry
from .tank_contract import (
    TankContractInput,
    TankContractLayer,
    TankLayerSource,
    TankPlacement,
    TankShape,
    validate_tank_contract,
)
from .tank_evaluation import AirTankFormulaEnvironment as AirTankFormulaEnvironment
from .tank_evaluation import BuriedTankFormulaEnvironment as BuriedTankFormulaEnvironment
from .tank_evaluation import PreparedTankCalculation as PreparedTankCalculation
from .tank_evaluation import PreparedTankLayer as PreparedTankLayer
from .tank_evaluation import TankEvaluationResult as TankEvaluationResult
from .tank_evaluation import TankFormulaEnvironment as TankFormulaEnvironment
from .validation import (
    TANK_SAFETY_FACTOR_RANGE,
    VALID_FORMULA_VALIDATION_REPORT,
    FormulaValidationIssue,
    FormulaValidationReport,
    validate_numeric_range,
)

TankFormulaOutcome = FormulaOutcome[TankEvaluationResult]


@dataclass(frozen=True)
class TankPreparationLayer:
    """One tank layer before conductivity law resolution is complete."""

    thickness_m: float
    source: TankLayerSource
    conductivity_supplied: bool
    manual_temperature_range_c: tuple[float, float] | None
    reference_temperature_range_c: tuple[float, float] | None
    conductivity_law: ConductivityLaw | None = None


@dataclass(frozen=True)
class TankPreparationInput:
    """Application-resolved tank candidate. Laws may still be missing."""

    shape: TankShape
    placement: TankPlacement
    insulation_temperature_basis: InsulationTemperatureBasis | None
    diameter: float | None
    height: float | None
    length: float | None
    width: float | None
    layers: tuple[TankPreparationLayer, ...]
    ambient_temperature: float | None
    ground_temperature: float | None
    process_temperature: float
    wall_thickness: float | None
    wall_lambda: float | None
    tank_buried_height: float | None
    ground_conductivity: float | None
    wind_speed: float | None
    safety_factor: float
    q_additional: float
    wall_conductivity_law: ConductivityLaw | None = None
    profile: HeatLossFormulaProfile = CASE_1_PROFILE


def validate_tank_preparation(data: TankPreparationInput) -> FormulaValidationReport:
    return validate_tank_contract(_to_tank_contract(data))


def assemble_prepared_tank(
    data: TankPreparationInput,
) -> PreparedTankCalculation | FormulaValidationReport:
    """Build the calculation input without repeating contract validation."""

    range_report = validate_numeric_range(
        path=("safety_factor",),
        value=data.safety_factor,
        spec=TANK_SAFETY_FACTOR_RANGE,
    )
    if not range_report.is_valid:
        return range_report
    return _assemble_validated_tank(data)


def prepare_tank_calculation(
    data: TankPreparationInput,
) -> PreparedTankCalculation | FormulaValidationReport:
    contract_report = validate_tank_preparation(data)
    if not contract_report.is_valid:
        return contract_report
    return _assemble_validated_tank(data)


def evaluate_prepared_tank(data: PreparedTankCalculation) -> TankFormulaOutcome:
    evaluation = tank_evaluation.execute_prepared_tank(data)
    if not evaluation.layer_temperature_report.is_valid:
        return TankFormulaOutcome(result=None, report=evaluation.layer_temperature_report)
    return TankFormulaOutcome(result=evaluation, report=VALID_FORMULA_VALIDATION_REPORT)


def run_tank_formula(data: TankPreparationInput) -> TankFormulaOutcome:
    prepared = prepare_tank_calculation(data)
    if isinstance(prepared, FormulaValidationReport):
        return TankFormulaOutcome(result=None, report=prepared)
    return evaluate_prepared_tank(prepared)


def _to_tank_contract(data: TankPreparationInput) -> TankContractInput:
    return TankContractInput(
        shape=data.shape,
        placement=data.placement,
        insulation_temperature_basis=data.insulation_temperature_basis,
        diameter=data.diameter,
        height=data.height,
        length=data.length,
        width=data.width,
        insulation_layers=tuple(
            TankContractLayer(
                source=layer.source,
                conductivity_supplied=layer.conductivity_supplied,
                manual_temperature_range_c=layer.manual_temperature_range_c,
                reference_temperature_range_c=layer.reference_temperature_range_c,
            )
            for layer in data.layers
        ),
        ambient_temperature=data.ambient_temperature,
        ground_temperature=data.ground_temperature,
        process_temperature=data.process_temperature,
        wall_thickness=data.wall_thickness,
        wall_lambda=data.wall_lambda,
        tank_buried_height=data.tank_buried_height,
        ground_conductivity=data.ground_conductivity,
        wind_speed=data.wind_speed,
        safety_factor=data.safety_factor,
        q_additional=data.q_additional,
    )


def _require_tank_laws(data: TankPreparationInput) -> FormulaValidationReport:
    if data.wall_conductivity_law is None and (
        data.wall_thickness is not None and data.wall_lambda is not None
    ):
        return FormulaValidationReport(
            (FormulaValidationIssue(code="conductivity_law_required", path=("wall_lambda",)),)
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


def _assemble_validated_tank(
    data: TankPreparationInput,
) -> PreparedTankCalculation | FormulaValidationReport:
    profile_report = validate_heat_loss_formula_profile(data.profile)
    if not profile_report.is_valid:
        return profile_report
    law_report = _require_tank_laws(data)
    if not law_report.is_valid:
        return law_report
    return _to_prepared_tank(data)


def _layer_interval(layer: TankPreparationLayer) -> tuple[float, float] | None:
    if layer.source == "manual":
        return layer.manual_temperature_range_c
    return layer.reference_temperature_range_c


def _to_prepared_tank(data: TankPreparationInput) -> PreparedTankCalculation:
    if data.insulation_temperature_basis is None:
        raise ValueError("validated tank preparation must include insulation_temperature_basis")
    prepared_layers: list[PreparedTankLayer] = []
    for layer in data.layers:
        if layer.conductivity_law is None:
            raise ValueError("validated tank layer must include conductivity_law")
        interval = _layer_interval(layer)
        if interval is None:
            raise ValueError("validated tank layer must include a temperature interval")
        prepared_layers.append(
            PreparedTankLayer(
                thickness_m=layer.thickness_m,
                source=layer.source,
                conductivity_law=layer.conductivity_law,
                temperature_min_c=interval[0],
                temperature_max_c=interval[1],
            )
        )
    geometry = _tank_geometry(data)
    wall_thickness = 0.0
    wall_conductivity = 1.0
    if data.wall_thickness is not None and data.wall_lambda is not None:
        wall_thickness = data.wall_thickness
        wall_conductivity = data.wall_lambda
    return PreparedTankCalculation(
        geometry=geometry,
        insulation_temperature_basis=data.insulation_temperature_basis,
        layers=tuple(prepared_layers),
        process_temperature_c=data.process_temperature,
        wall_thickness_m=wall_thickness,
        wall_conductivity_w_mk=wall_conductivity,
        safety_factor=data.safety_factor,
        additional_heat_loss_w=data.q_additional,
        environment=_tank_environment(data),
        profile=data.profile,
    )


def _tank_geometry(data: TankPreparationInput) -> TankGeometry:
    if data.height is None:
        raise ValueError("validated tank preparation must include height")
    if data.shape == "cylindrical":
        if data.diameter is None:
            raise ValueError("validated cylindrical tank requires diameter")
        return CylindricalTankGeometry(diameter_m=data.diameter, height_m=data.height)
    if data.length is None or data.width is None:
        raise ValueError("validated rectangular tank requires length and width")
    return RectangularTankGeometry(
        length_m=data.length,
        width_m=data.width,
        height_m=data.height,
    )


def _tank_environment(data: TankPreparationInput) -> TankFormulaEnvironment:
    if data.ambient_temperature is None:
        raise ValueError("validated tank preparation must include ambient_temperature")
    if data.placement == "underground":
        if (
            data.ground_temperature is None
            or data.tank_buried_height is None
            or data.ground_conductivity is None
            or data.wind_speed is None
        ):
            raise ValueError("validated underground tank requires ground environment fields")
        return BuriedTankFormulaEnvironment(
            placement="underground",
            ambient_temperature_c=data.ambient_temperature,
            ground_temperature_c=data.ground_temperature,
            buried_height_m=data.tank_buried_height,
            ground_conductivity_w_mk=data.ground_conductivity,
            wind_speed_m_s=data.wind_speed,
        )
    return AirTankFormulaEnvironment(
        placement=data.placement,
        ambient_temperature_c=data.ambient_temperature,
        wind_speed_m_s=data.wind_speed,
    )
