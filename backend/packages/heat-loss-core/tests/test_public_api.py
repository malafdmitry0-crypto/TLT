"""Contract tests for the single recommended package interface."""

from __future__ import annotations

import dataclasses

import heatcalc_heat_loss_core as root
import heatcalc_heat_loss_core.api as api

EXPECTED_PUBLIC_API = {
    "AffineConductivity",
    "CASE_1_PROFILE",
    "ConductivityLaw",
    "ConstantConductivity",
    "FormulaDomainError",
    "FormulaValidationCode",
    "FormulaValidationIssue",
    "FormulaValidationReport",
    "HeatLossFormulaProfile",
    "InsulationTemperatureBasis",
    "PiecewiseConductivity",
    "PipeFormulaOutcome",
    "PipeFormulaResult",
    "PipeLayerSource",
    "PipePlacement",
    "PipePreparationInput",
    "PipePreparationLayer",
    "TankFormulaOutcome",
    "TankFormulaResult",
    "TankLayerSource",
    "TankPlacement",
    "TankPreparationInput",
    "TankPreparationLayer",
    "TankShape",
    "UnavailableConductivity",
    "evaluate_conductivity",
    "run_pipe_formula",
    "run_tank_formula",
    "validate_heat_loss_formula_profile",
}


def test_root_and_api_module_expose_the_same_exact_contract() -> None:
    assert set(root.__all__) == EXPECTED_PUBLIC_API
    assert root.__all__ == api.__all__
    assert all(getattr(root, name) is getattr(api, name) for name in root.__all__)


def test_removed_parallel_high_level_api_is_physically_absent() -> None:
    removed = {
        "PipeEvaluationInput",
        "ResolvedAirTankEvaluationInput",
        "ResolvedBuriedTankEvaluationInput",
        "evaluate_pipe",
        "evaluate_resolved_air_tank",
        "evaluate_resolved_buried_tank",
        "resolve_safety_factor",
    }

    assert removed.isdisjoint(root.__all__)
    assert all(not hasattr(root, name) for name in removed)


def test_pipe_and_tank_expose_one_safety_factor_contract() -> None:
    pipe_fields = {field.name: field for field in dataclasses.fields(root.PipePreparationInput)}
    tank_fields = {field.name: field for field in dataclasses.fields(root.TankPreparationInput)}

    assert "safety_factor" in pipe_fields
    assert "safety_factor" in tank_fields
    assert "safety_factor_primary" not in pipe_fields
    assert "safety_factor_override" not in pipe_fields
    assert tank_fields["safety_factor"].default is dataclasses.MISSING
