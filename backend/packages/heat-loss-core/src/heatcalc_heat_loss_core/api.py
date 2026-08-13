"""Stable, recommended high-level interface of the heat-loss package.

Low-level formulas and prepared execution kernels remain importable from their
own submodules for advanced use.  They are intentionally absent from this
interface so applications have one obvious validate-and-calculate entrypoint
per domain.
"""

from .conductivity import (
    AffineConductivity,
    ConductivityLaw,
    ConstantConductivity,
    PiecewiseConductivity,
    UnavailableConductivity,
    evaluate_conductivity,
)
from .errors import FormulaDomainError
from .pipe_contract import PipeLayerSource, PipePlacement
from .pipe_formula import (
    PipeFormulaOutcome,
    PipeFormulaResult,
    PipePreparationInput,
    PipePreparationLayer,
    run_pipe_formula,
)
from .profile import (
    CASE_1_PROFILE,
    HeatLossFormulaProfile,
    InsulationTemperatureBasis,
    validate_heat_loss_formula_profile,
)
from .tank_contract import TankLayerSource, TankPlacement, TankShape
from .tank_formula import (
    TankFormulaOutcome,
    TankFormulaResult,
    TankPreparationInput,
    TankPreparationLayer,
    run_tank_formula,
)
from .validation import (
    FormulaValidationCode,
    FormulaValidationIssue,
    FormulaValidationReport,
)

__all__ = [
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
]
