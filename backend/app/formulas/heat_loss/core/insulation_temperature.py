"""Pure formulas for the insulation conductivity reference temperature."""

from __future__ import annotations

from typing import Literal

from .errors import FormulaDomainError
from .thermal import arithmetic_mean, quotient

InsulationTemperatureFormula = Literal["half_process", "mean_with_reference"]


def calculate_insulation_temperature(
    process_temperature_c: float,
    *,
    formula: InsulationTemperatureFormula,
    reference_temperature_c: float | None = None,
) -> float:
    """Evaluate a caller-selected ``tm`` formula with explicit coefficients.

    Placement, season and basis selection remain application policy. The core
    owns only the two numerical relations used after that policy is resolved.
    """

    if formula == "half_process":
        return quotient(process_temperature_c, divisor=2.0)
    if formula == "mean_with_reference":
        if reference_temperature_c is None:
            raise FormulaDomainError("reference_temperature_required")
        return arithmetic_mean(process_temperature_c, reference_temperature_c)
    raise FormulaDomainError("unknown_insulation_temperature_formula")
