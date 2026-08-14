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


@dataclass(frozen=True)
class InsulationConductivityTemperatures:
    """Process temperature selects a catalog branch; insulation temperature evaluates it.

    ``process_temperature_c`` is Tж. ``insulation_temperature_c`` is tm.
    Every piecewise threshold uses Tж, including nested cold-range splits.
    Affine ``a + b × tm`` uses only tm.
    """

    process_temperature_c: float
    insulation_temperature_c: float


ConductivityLaw = (
    ConstantConductivity | AffineConductivity | UnavailableConductivity | PiecewiseConductivity
)


def evaluate_insulation_conductivity(
    law: ConductivityLaw,
    temperatures: InsulationConductivityTemperatures,
) -> float:
    """Evaluate a law with explicit selector and formula temperatures."""

    finite_process = affine_value(temperatures.process_temperature_c, intercept=0.0, slope=1.0)
    finite_insulation = affine_value(
        temperatures.insulation_temperature_c, intercept=0.0, slope=1.0
    )
    finite_temperatures = InsulationConductivityTemperatures(
        process_temperature_c=finite_process,
        insulation_temperature_c=finite_insulation,
    )
    if isinstance(law, UnavailableConductivity):
        raise FormulaDomainError("conductivity_law_unavailable", temperature_c=finite_insulation)
    if isinstance(law, ConstantConductivity):
        result = affine_value(0.0, intercept=law.value_w_mk, slope=0.0)
    elif isinstance(law, AffineConductivity):
        result = affine_value(
            finite_insulation,
            intercept=law.intercept_w_mk,
            slope=law.slope_w_mk_per_c,
            variable_offset=law.temperature_offset_c,
        )
        if law.minimum_w_mk is not None:
            result = clamp_minimum(result, minimum=law.minimum_w_mk)
    else:
        finite_threshold = affine_value(law.threshold_c, intercept=0.0, slope=1.0)
        selected = law.at_or_above if finite_process >= finite_threshold else law.below
        return evaluate_insulation_conductivity(selected, finite_temperatures)
    if result <= 0:
        raise FormulaDomainError(
            "conductivity_not_positive",
            temperature_c=finite_insulation,
            conductivity_w_mk=result,
        )
    return result


def evaluate_conductivity(law: ConductivityLaw, temperature_c: float) -> float:
    """Evaluate a law when branch selection and the formula share one temperature."""

    return evaluate_insulation_conductivity(
        law,
        InsulationConductivityTemperatures(
            process_temperature_c=temperature_c,
            insulation_temperature_c=temperature_c,
        ),
    )
