"""Pure geometry formulas shared by heat-loss calculation and validation."""

import math

from .errors import FormulaDomainError


def radius_from_diameter(diameter_m: float) -> float:
    """Return a radius for an explicitly supplied diameter."""

    return _finite_result(diameter_m / 2.0)


def outer_radius_after_layer(inner_radius_m: float, layer_thickness_m: float) -> float:
    """Return the outer radius after one concentric layer."""

    return _finite_result(inner_radius_m + layer_thickness_m)


def layered_outer_radius(
    outer_diameter_m: float,
    layer_thicknesses_m: tuple[float, ...],
) -> float:
    """Return the outer radius after applying ordered concentric layers."""

    radius_m = radius_from_diameter(outer_diameter_m)
    for thickness_m in layer_thicknesses_m:
        radius_m = outer_radius_after_layer(radius_m, thickness_m)
    return radius_m


def _finite_result(value: float) -> float:
    if not math.isfinite(value):
        raise FormulaDomainError("non_finite_result")
    return value
