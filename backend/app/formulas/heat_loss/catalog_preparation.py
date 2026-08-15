"""Resolve one reference insulation layer for application preparation.

Pydantic stays catalog-free. This adapter owns the single catalog lookup;
the formula core validates calculated layer boundaries against the resolved
temperature interval for both reference and manual materials.
"""

from __future__ import annotations

from dataclasses import dataclass

from heatcalc_heat_loss_core.conductivity import ConductivityLaw

from app.reference_data.loader import (
    ReferenceInsulationError,
    resolve_reference_insulation,
)


@dataclass
class HeatLossPreparationError(ValueError):
    """Structured catalog/input failure with a stable field path."""

    code: str
    message: str
    path: str
    category: str = "validation"

    def __str__(self) -> str:
        return self.message


def layer_material_path(index: int) -> str:
    return f"insulation_layers.{index}.material"


def resolve_reference_layer(
    *,
    material: str,
    index: int,
) -> tuple[ConductivityLaw, tuple[float, float]]:
    """Resolve one selectable material to its conductivity law and interval."""

    try:
        law, interval = resolve_reference_insulation(material)
    except ReferenceInsulationError as exc:
        raise HeatLossPreparationError(
            code=exc.code,
            message=exc.message,
            path=layer_material_path(index),
        ) from exc
    return law, interval


def unavailable_conductivity_error(
    *,
    material: str,
    index: int,
    temperature_c: float,
) -> HeatLossPreparationError:
    return HeatLossPreparationError(
        code="unavailable_conductivity_branch",
        message=(
            f"Для материала изоляции '{material}' не задана расчётная λ(tm) "
            f"при tm={_fmt_temp(temperature_c)} °C"
        ),
        path=layer_material_path(index),
    )


def _fmt_temp(value: float) -> str:
    return f"{value:g}"
