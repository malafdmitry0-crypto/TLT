"""Typed, immutable pure laws for insulation thermal conductivity."""

from __future__ import annotations

from dataclasses import dataclass

from .errors import FormulaDomainError
from .thermal import affine_value, clamp_minimum


@dataclass(frozen=True)
class ConstantConductivity:
    """A temperature-independent conductivity in W/(m*K)."""

    value_w_mk: float


@dataclass(frozen=True)
class AffineConductivity:
    """``intercept + slope * (temperature + offset)`` with optional floor."""

    intercept_w_mk: float
    slope_w_mk_per_c: float
    temperature_offset_c: float = 0.0
    minimum_w_mk: float | None = None


@dataclass(frozen=True)
class UnavailableConductivity:
    """An explicitly unresolved branch in a piecewise reference law."""


@dataclass(frozen=True)
class PiecewiseConductivity:
    """Select one typed conductivity law at a temperature threshold."""

    threshold_c: float
    at_or_above: ConductivityLaw
    below: ConductivityLaw


ConductivityLaw = (
    ConstantConductivity | AffineConductivity | UnavailableConductivity | PiecewiseConductivity
)


def evaluate_conductivity(law: ConductivityLaw, temperature_c: float) -> float:
    """Evaluate one law and reject non-finite inputs or results via core math."""

    finite_temperature = affine_value(temperature_c, intercept=0.0, slope=1.0)
    if isinstance(law, UnavailableConductivity):
        raise FormulaDomainError("conductivity_law_unavailable", temperature_c=finite_temperature)
    if isinstance(law, ConstantConductivity):
        result = affine_value(0.0, intercept=law.value_w_mk, slope=0.0)
    elif isinstance(law, AffineConductivity):
        result = affine_value(
            finite_temperature,
            intercept=law.intercept_w_mk,
            slope=law.slope_w_mk_per_c,
            variable_offset=law.temperature_offset_c,
        )
        if law.minimum_w_mk is not None:
            result = clamp_minimum(result, minimum=law.minimum_w_mk)
    else:
        finite_threshold = affine_value(law.threshold_c, intercept=0.0, slope=1.0)
        selected = law.at_or_above if finite_temperature >= finite_threshold else law.below
        return evaluate_conductivity(selected, finite_temperature)
    if result <= 0:
        raise FormulaDomainError(
            "conductivity_not_positive",
            temperature_c=finite_temperature,
            conductivity_w_mk=result,
        )
    return result
