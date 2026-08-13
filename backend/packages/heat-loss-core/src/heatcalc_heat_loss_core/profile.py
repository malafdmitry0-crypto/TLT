"""Pure formula-profile defaults and deterministic scalar resolution."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from .errors import FormulaDomainError
from .insulation_temperature import calculate_insulation_temperature
from .thermal import alpha_from_wind, clamp_minimum

InsulationTemperatureBasis = Literal[
    "indoor",
    "outdoor_summer",
    "outdoor_winter",
    "channel",
    "tunnel",
    "technical_subfloor",
    "attic",
    "basement",
]
ExternalAlphaPlacement = Literal["indoor", "outdoor", "underground"]


@dataclass(frozen=True)
class HeatLossFormulaProfile:
    """Explicit pure constants for the currently supported Case 1 formulas."""

    indoor_external_alpha_w_m2k: float = 9.0
    outdoor_alpha_intercept_w_m2k: float = 11.6
    outdoor_alpha_sqrt_coefficient: float = 7.0
    default_safety_factor: float = 1.1
    warm_insulation_reference_temperature_c: float = 40.0


CASE_1_PROFILE = HeatLossFormulaProfile()

WARM_INSULATION_TEMPERATURE_BASES: frozenset[InsulationTemperatureBasis] = frozenset(
    {
        "indoor",
        "outdoor_summer",
        "channel",
        "tunnel",
        "technical_subfloor",
        "attic",
        "basement",
    }
)


def resolve_insulation_temperature(
    process_temperature_c: float,
    *,
    basis: InsulationTemperatureBasis,
    profile: HeatLossFormulaProfile = CASE_1_PROFILE,
) -> float:
    """Resolve the reference insulation temperature for an explicit basis."""

    if basis == "outdoor_winter":
        return calculate_insulation_temperature(process_temperature_c, formula="half_process")
    if basis not in WARM_INSULATION_TEMPERATURE_BASES:
        raise FormulaDomainError("unknown_insulation_temperature_basis")
    return calculate_insulation_temperature(
        process_temperature_c,
        formula="mean_with_reference",
        reference_temperature_c=profile.warm_insulation_reference_temperature_c,
    )


def resolve_external_alpha(
    *,
    placement: ExternalAlphaPlacement,
    wind_speed_m_s: float | None,
    profile: HeatLossFormulaProfile = CASE_1_PROFILE,
) -> float:
    """Resolve the indoor constant or outdoor-like wind correlation."""

    if placement == "indoor":
        return profile.indoor_external_alpha_w_m2k
    if placement not in {"outdoor", "underground"}:
        raise FormulaDomainError("unknown_external_alpha_placement")
    if wind_speed_m_s is None:
        raise FormulaDomainError("wind_speed_required")
    return alpha_from_wind(
        clamp_minimum(wind_speed_m_s, minimum=0.0),
        intercept=profile.outdoor_alpha_intercept_w_m2k,
        sqrt_coefficient=profile.outdoor_alpha_sqrt_coefficient,
    )


def resolve_safety_factor(
    *,
    primary: float | None,
    override: float | None = None,
    profile: HeatLossFormulaProfile = CASE_1_PROFILE,
) -> float:
    """Preserve pipe legacy precedence: truthy primary, then present override.

    This is equivalent to ``primary or merged.get('safety_factor', default)``:
    zero primary falls through, while a present zero override is retained.
    """

    if primary:
        return primary
    if override is not None:
        return override
    return profile.default_safety_factor
