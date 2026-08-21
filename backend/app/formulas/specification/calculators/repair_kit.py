"""Pure Decimal repair-kit calculator (SPEC §7.11).

Normative formula (per temperature group):
  L_group_actual = sum(actual_installed_length_m)  # provided as aggregate or single
  N_repair_kits  = ceil(L_group_actual / cable_length_per_kit_m)

Capacity from selected catalog row only.
Example: ceil(729/150) = 5.
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any

from app.formulas.specification.calculators.common import (
    ceil_div,
    normalize_temperature_group,
    require_positive_divider,
    sum_decimals,
    to_non_negative_decimal,
)
from app.formulas.specification.calculators.types import (
    RepairKitInput,
    RepairKitResult,
    TemperatureGroup,
)


def calculate_repair_kits(
    actual_installed_length_m: Any,
    cable_length_per_kit_m: Any,
    *,
    temperature_group: TemperatureGroup | str | None = None,
) -> RepairKitResult:
    """N_repair_kits = ceil(L_group_actual / cable_length_per_kit_m)."""
    length = to_non_negative_decimal(
        actual_installed_length_m, name="actual_installed_length_m"
    )
    per_kit = require_positive_divider(
        cable_length_per_kit_m, name="cable_length_per_kit_m"
    )
    normalize_temperature_group(temperature_group)

    quantity = ceil_div(length, per_kit, divider_name="cable_length_per_kit_m")
    return RepairKitResult(
        quantity=quantity,
        actual_installed_length_m=length,
        cable_length_per_kit_m=per_kit,
    )


def calculate_repair_kits_from_lengths(
    lengths_m: Sequence[Any],
    cable_length_per_kit_m: Any,
    *,
    temperature_group: TemperatureGroup | str | None = None,
) -> RepairKitResult:
    """Sum per-object actual lengths, then apply repair-kit formula once."""
    values = [
        to_non_negative_decimal(item, name=f"lengths_m[{index}]")
        for index, item in enumerate(lengths_m)
    ]
    total = sum_decimals(values)
    return calculate_repair_kits(
        total,
        cable_length_per_kit_m,
        temperature_group=temperature_group,
    )


def calculate_repair_kits_from_input(inputs: RepairKitInput) -> RepairKitResult:
    return calculate_repair_kits(
        inputs.actual_installed_length_m,
        inputs.cable_length_per_kit_m,
        temperature_group=inputs.temperature_group,
    )
