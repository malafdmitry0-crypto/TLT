"""Compatibility identities for the standalone heat-loss core package."""

import heatcalc_heat_loss_core as canonical

from app.formulas.heat_loss.core import pipe as legacy_pipe
from app.formulas.heat_loss.core import tank as legacy_tank
from app.formulas.heat_loss.core.conductivity import (
    AffineConductivity as LegacyAffineConductivity,
)
from app.formulas.heat_loss.core.conductivity import (
    evaluate_conductivity as legacy_evaluate_conductivity,
)
from app.formulas.heat_loss.core.errors import FormulaDomainError as LegacyFormulaDomainError
from app.formulas.heat_loss.core.insulation_contract import (
    InsulationContractInput as LegacyInsulationContractInput,
)
from app.formulas.heat_loss.core.pipe_contract import PipeContractInput as LegacyPipeContractInput
from app.formulas.heat_loss.core.pipe_evaluation import (
    PipeEvaluationInput as LegacyPipeEvaluationInput,
)
from app.formulas.heat_loss.core.pipe_evaluation import (
    evaluate_pipe as legacy_evaluate_pipe,
)
from app.formulas.heat_loss.core.profile import (
    HeatLossFormulaProfile as LegacyHeatLossFormulaProfile,
)
from app.formulas.heat_loss.core.profile import (
    resolve_external_alpha as legacy_resolve_external_alpha,
)
from app.formulas.heat_loss.core.tank_contract import TankContractInput as LegacyTankContractInput
from app.formulas.heat_loss.core.tank_evaluation import (
    ResolvedAirTankEvaluationInput as LegacyResolvedAirTankEvaluationInput,
)
from app.formulas.heat_loss.core.tank_evaluation import (
    evaluate_resolved_air_tank as legacy_evaluate_resolved_air_tank,
)
from app.formulas.heat_loss.core.validation import FormulaValidationReport as LegacyReport


def test_legacy_modules_reexport_canonical_objects_by_identity() -> None:
    assert legacy_pipe.calculate_aboveground_pipe is canonical.calculate_aboveground_pipe
    assert legacy_pipe.PipeCoreResult is canonical.PipeCoreResult
    assert legacy_tank.calculate_air_tank_heat_loss is canonical.calculate_air_tank_heat_loss
    assert legacy_tank.TankCoreResult is canonical.TankCoreResult
    assert LegacyFormulaDomainError is canonical.FormulaDomainError
    assert LegacyInsulationContractInput is canonical.InsulationContractInput
    assert LegacyPipeContractInput is canonical.PipeContractInput
    assert LegacyTankContractInput is canonical.TankContractInput
    assert LegacyReport is canonical.FormulaValidationReport
    assert LegacyHeatLossFormulaProfile is canonical.HeatLossFormulaProfile
    assert legacy_resolve_external_alpha is canonical.resolve_external_alpha
    assert LegacyAffineConductivity is canonical.AffineConductivity
    assert legacy_evaluate_conductivity is canonical.evaluate_conductivity
    assert LegacyPipeEvaluationInput is canonical.PipeEvaluationInput
    assert legacy_evaluate_pipe is canonical.evaluate_pipe
    assert LegacyResolvedAirTankEvaluationInput is canonical.ResolvedAirTankEvaluationInput
    assert legacy_evaluate_resolved_air_tank is canonical.evaluate_resolved_air_tank


def test_canonical_package_exposes_calculations_and_input_result_models() -> None:
    expected = {
        "AbovegroundPipeInput",
        "AirTankHeatLossInput",
        "BuriedTankHeatLossInput",
        "CASE_1_PROFILE",
        "AffineConductivity",
        "AirPipeEvaluationInput",
        "ConductivityLaw",
        "ConstantConductivity",
        "HeatLossFormulaProfile",
        "PipeCoreResult",
        "PipeEvaluationInput",
        "PipeEvaluationResult",
        "PipeInsulationLayer",
        "PiecewiseConductivity",
        "ResolvedAirTankEvaluationInput",
        "ResolvedBuriedTankEvaluationInput",
        "ResolvedTankLayer",
        "TankCoreResult",
        "TankEvaluationResult",
        "TankInsulationLayer",
        "UndergroundPipeInput",
        "UnavailableConductivity",
        "calculate_aboveground_pipe",
        "calculate_air_tank_heat_loss",
        "calculate_buried_tank_heat_loss",
        "calculate_underground_pipe",
        "evaluate_conductivity",
        "evaluate_pipe",
        "evaluate_resolved_air_tank",
        "evaluate_resolved_buried_tank",
        "resolve_external_alpha",
        "resolve_insulation_temperature",
        "resolve_safety_factor",
        "validate_pipe_contract",
        "validate_tank_contract",
    }

    assert expected.issubset(canonical.__all__)
    assert all(hasattr(canonical, name) for name in expected)
