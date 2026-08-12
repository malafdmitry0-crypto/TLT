"""Pure numeric heat-loss core with no application-layer dependencies."""

from .errors import FormulaDomainError
from .insulation_contract import (
    InsulationContractInput,
    validate_insulation_basis_for_placement,
    validate_insulation_contract,
)
from .insulation_temperature import calculate_insulation_temperature
from .insulation_validation import (
    validate_insulation_conductivity,
    validate_insulation_layer_count,
    validate_insulation_layer_ranges,
    validate_insulation_thickness,
)
from .material_validation import (
    validate_hot_side_temperature_in_interval,
    validate_temperature_in_interval,
    validate_temperature_interval,
)
from .pipe import validate_pipe_formula_domain
from .pipe_contract import PipeContractInput, PipeLayerContract, validate_pipe_contract
from .pipe_validation import validate_pipe_input_ranges
from .tank import validate_tank_formula_domain
from .tank_contract import (
    TankContractInput,
    TankContractLayer,
    validate_tank_contract,
    validate_tank_shape,
)
from .tank_validation import validate_tank_input_ranges
from .validation import (
    FormulaValidationCode,
    FormulaValidationIssue,
    FormulaValidationReport,
    NumericRangeCheck,
    NumericRangeSpec,
    SequenceLengthCheck,
    SequenceLengthSpec,
    validate_numeric_range,
    validate_range_checks,
    validate_sequence_length,
)

__all__ = [
    "FormulaDomainError",
    "FormulaValidationCode",
    "FormulaValidationIssue",
    "FormulaValidationReport",
    "InsulationContractInput",
    "NumericRangeCheck",
    "NumericRangeSpec",
    "PipeContractInput",
    "PipeLayerContract",
    "SequenceLengthCheck",
    "SequenceLengthSpec",
    "TankContractInput",
    "TankContractLayer",
    "calculate_insulation_temperature",
    "validate_insulation_conductivity",
    "validate_insulation_basis_for_placement",
    "validate_insulation_contract",
    "validate_insulation_layer_count",
    "validate_insulation_layer_ranges",
    "validate_insulation_thickness",
    "validate_hot_side_temperature_in_interval",
    "validate_numeric_range",
    "validate_pipe_formula_domain",
    "validate_pipe_contract",
    "validate_pipe_input_ranges",
    "validate_range_checks",
    "validate_sequence_length",
    "validate_tank_formula_domain",
    "validate_tank_contract",
    "validate_tank_shape",
    "validate_tank_input_ranges",
    "validate_temperature_in_interval",
    "validate_temperature_interval",
]
