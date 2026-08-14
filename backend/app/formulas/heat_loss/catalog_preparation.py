"""Resolve one reference insulation layer for application preparation.

Pydantic stays catalog-free. This adapter owns the single catalog lookup and
the missing pre-formula process-temperature interval check.
"""

from __future__ import annotations

from dataclasses import dataclass

from heatcalc_heat_loss_core.conductivity import ConductivityLaw
from heatcalc_heat_loss_core.material_validation import validate_temperature_in_interval

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
    process_temperature: float,
) -> tuple[ConductivityLaw, tuple[float, float]]:
    """One catalog resolve plus the pre-formula process-T interval check."""

    try:
        law, interval = resolve_reference_insulation(material)
    except ReferenceInsulationError as exc:
        raise HeatLossPreparationError(
            code=exc.code,
            message=exc.message,
            path=layer_material_path(index),
        ) from exc
    report = validate_temperature_in_interval(
        temperature_c=process_temperature,
        minimum_c=interval[0],
        maximum_c=interval[1],
        path=("insulation_layers", index, "material"),
    )
    if not report.is_valid:
        details = report.issues[0].details_dict()
        raise HeatLossPreparationError(
            code="process_temperature_outside_interval",
            message=(
                f"Температура продукта {_fmt_temp(float(details['temperature_c']))} °C "
                f"вне диапазона материала изоляции #{index + 1} '{material}': "
                f"{_fmt_temp(float(details['minimum_c']))}…"
                f"{_fmt_temp(float(details['maximum_c']))} °C"
            ),
            path=layer_material_path(index),
        )
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
