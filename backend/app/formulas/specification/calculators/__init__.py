"""Pure Decimal specification calculators (SPEC-CANON-04).

Cable, connection kits, repair kits, sealant, fiberglass tape, aluminium tape.
No database, FastAPI, filesystem, or static JSON imports.
"""

from app.formulas.specification.calculators.aluminium_tape import (
    calculate_aluminium_from_scalar,
    calculate_aluminium_object_length,
    calculate_aluminium_reels_from_total,
    calculate_aluminium_tape,
    calculate_aluminium_tape_from_input,
)
from app.formulas.specification.calculators.cable import (
    calculate_cable_mark,
    calculate_group_actual,
    calculate_mark_actual,
    calculate_mark_order,
)
from app.formulas.specification.calculators.common import (
    FIBERGLASS_RESERVE,
    PI,
    ceil_div,
    require_positive_divider,
    to_decimal,
    to_non_negative_decimal,
    to_non_negative_int,
    to_positive_decimal,
)
from app.formulas.specification.calculators.connection_kit import (
    calculate_connection_kits,
    calculate_connection_kits_from_input,
)
from app.formulas.specification.calculators.fiberglass_tape import (
    calculate_fiberglass_object_length,
    calculate_fiberglass_reels_from_total,
    calculate_fiberglass_tape,
    calculate_fiberglass_tape_from_input,
)
from app.formulas.specification.calculators.repair_kit import (
    calculate_repair_kits,
    calculate_repair_kits_from_input,
    calculate_repair_kits_from_lengths,
)
from app.formulas.specification.calculators.sealant import (
    calculate_sealant,
    calculate_sealant_from_input,
    calculate_sealant_from_totals,
)
from app.formulas.specification.calculators.types import (
    AluminiumObjectInput,
    AluminiumObjectResult,
    AluminiumTapeInput,
    AluminiumTapeResult,
    CableGroupInput,
    CableGroupResult,
    CableMarkInput,
    CableMarkResult,
    ConnectionKitInput,
    ConnectionKitResult,
    FiberglassObjectInput,
    FiberglassObjectResult,
    FiberglassTapeInput,
    FiberglassTapeResult,
    FormulaInputError,
    RepairKitInput,
    RepairKitResult,
    SealantInput,
    SealantResult,
    TemperatureGroup,
)

__all__ = [
    "AluminiumObjectInput",
    "AluminiumObjectResult",
    "AluminiumTapeInput",
    "AluminiumTapeResult",
    "CableGroupInput",
    "CableGroupResult",
    "CableMarkInput",
    "CableMarkResult",
    "ConnectionKitInput",
    "ConnectionKitResult",
    "FIBERGLASS_RESERVE",
    "FiberglassObjectInput",
    "FiberglassObjectResult",
    "FiberglassTapeInput",
    "FiberglassTapeResult",
    "FormulaInputError",
    "PI",
    "RepairKitInput",
    "RepairKitResult",
    "SealantInput",
    "SealantResult",
    "TemperatureGroup",
    "calculate_aluminium_from_scalar",
    "calculate_aluminium_object_length",
    "calculate_aluminium_reels_from_total",
    "calculate_aluminium_tape",
    "calculate_aluminium_tape_from_input",
    "calculate_cable_mark",
    "calculate_connection_kits",
    "calculate_connection_kits_from_input",
    "calculate_fiberglass_object_length",
    "calculate_fiberglass_reels_from_total",
    "calculate_fiberglass_tape",
    "calculate_fiberglass_tape_from_input",
    "calculate_group_actual",
    "calculate_mark_actual",
    "calculate_mark_order",
    "calculate_repair_kits",
    "calculate_repair_kits_from_input",
    "calculate_repair_kits_from_lengths",
    "calculate_sealant",
    "calculate_sealant_from_input",
    "calculate_sealant_from_totals",
    "ceil_div",
    "require_positive_divider",
    "to_decimal",
    "to_non_negative_decimal",
    "to_non_negative_int",
    "to_positive_decimal",
]
