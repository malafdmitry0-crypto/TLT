"""Pure Decimal connection-kit calculator (SPEC §7.10).

Normative formula (per temperature group LOW / MEDIUM_HIGH):
  N_connection_kits = ceil(N_sections / sections_per_kit)

Capacity comes only from the selected catalog row (no hardcoded capacity=1 fallback).
Example: ceil(9/2) = 5.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from app.formulas.specification.calculators.common import (
    ceil_div,
    normalize_temperature_group,
    require_positive_divider,
    to_non_negative_int,
)
from app.formulas.specification.calculators.types import (
    ConnectionKitInput,
    ConnectionKitResult,
    TemperatureGroup,
)


def calculate_connection_kits(
    section_count: Any,
    sections_per_kit: Any,
    *,
    temperature_group: TemperatureGroup | str | None = None,
) -> ConnectionKitResult:
    """N_connection_kits = ceil(N_sections / sections_per_kit)."""
    n_sections = to_non_negative_int(section_count, name="section_count")
    capacity = require_positive_divider(sections_per_kit, name="sections_per_kit")
    normalize_temperature_group(temperature_group)

    quantity = ceil_div(Decimal(n_sections), capacity, divider_name="sections_per_kit")
    return ConnectionKitResult(
        quantity=quantity,
        section_count=n_sections,
        sections_per_kit=capacity,
    )


def calculate_connection_kits_from_input(inputs: ConnectionKitInput) -> ConnectionKitResult:
    return calculate_connection_kits(
        inputs.section_count,
        inputs.sections_per_kit,
        temperature_group=inputs.temperature_group,
    )
