"""Pure Decimal sealant (glue) calculator (SPEC §7.12).

Normative formulas (after connection and repair kit quantities exist):
  N_all_kits = sum(N_connection_kits) + sum(N_repair_kits)
  N_sealant  = ceil(N_all_kits / kits_per_sealant_unit)

Example: ceil((9+5)/7) = 2.
No R_gr multiplication.
"""

from __future__ import annotations

from collections.abc import Sequence
from decimal import Decimal
from typing import Any

from heatcalc_specification_core.common import (
    ceil_div,
    require_positive_divider,
    to_non_negative_int,
)
from heatcalc_specification_core.types import SealantInput, SealantResult


def calculate_sealant(
    connection_kits: Any,
    repair_kits: Any,
    kits_per_sealant_unit: Any,
) -> SealantResult:
    """N_sealant = ceil((connection + repair) / kits_per_sealant_unit)."""
    n_connection = to_non_negative_int(connection_kits, name="connection_kits")
    n_repair = to_non_negative_int(repair_kits, name="repair_kits")
    per_unit = require_positive_divider(
        kits_per_sealant_unit, name="kits_per_sealant_unit"
    )

    n_all = n_connection + n_repair
    quantity = ceil_div(Decimal(n_all), per_unit, divider_name="kits_per_sealant_unit")
    return SealantResult(
        quantity=quantity,
        n_all_kits=n_all,
        kits_per_sealant_unit=per_unit,
    )


def calculate_sealant_from_totals(
    connection_kit_quantities: Sequence[Any],
    repair_kit_quantities: Sequence[Any],
    kits_per_sealant_unit: Any,
) -> SealantResult:
    """Sum kit quantities across groups, then apply sealant formula once."""
    n_connection = sum(
        to_non_negative_int(item, name=f"connection_kit_quantities[{index}]")
        for index, item in enumerate(connection_kit_quantities)
    )
    n_repair = sum(
        to_non_negative_int(item, name=f"repair_kit_quantities[{index}]")
        for index, item in enumerate(repair_kit_quantities)
    )
    return calculate_sealant(n_connection, n_repair, kits_per_sealant_unit)


def calculate_sealant_from_input(inputs: SealantInput) -> SealantResult:
    return calculate_sealant(
        inputs.connection_kits,
        inputs.repair_kits,
        inputs.kits_per_sealant_unit,
    )
