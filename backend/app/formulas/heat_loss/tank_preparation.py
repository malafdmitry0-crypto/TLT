"""Build a tank preparation input from a validated backend facade payload.

Admin coefficients are intentionally ignored: tank K stays the required
value from the validated params.
"""

from __future__ import annotations

from typing import Any, cast

from heatcalc_heat_loss_core.conductivity import ConstantConductivity
from heatcalc_heat_loss_core.profile import InsulationTemperatureBasis
from heatcalc_heat_loss_core.tank_formula import (
    TankFormulaOutcome,
    TankPreparationInput,
    TankPreparationLayer,
    run_tank_formula,
)

from app.reference_data.loader import (
    get_insulation_conductivity_law,
    get_insulation_temperature_range,
)
from app.schemas.calculation import InsulationLayer, TankHeatLossParams


def run_validated_tank_formula(
    params: TankHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> TankFormulaOutcome:
    del coefficients
    return run_tank_formula(build_tank_preparation(params))


def build_tank_preparation(params: TankHeatLossParams) -> TankPreparationInput:
    return TankPreparationInput(
        shape=params.shape,
        placement=params.placement,
        insulation_temperature_basis=cast(
            InsulationTemperatureBasis, params.insulation_temperature_basis
        ),
        diameter=params.diameter,
        height=params.height,
        length=params.length,
        width=params.width,
        layers=tuple(_preparation_layer(layer) for layer in params.insulation_layers),
        ambient_temperature=params.ambient_temperature,
        ground_temperature=params.ground_temperature,
        process_temperature=params.process_temperature,
        wall_thickness=params.wall_thickness,
        wall_lambda=params.wall_lambda,
        tank_buried_height=params.tank_buried_height,
        ground_conductivity=params.ground_conductivity,
        wind_speed=params.wind_speed,
        safety_factor=params.safety_factor,
        q_additional=getattr(params, "q_additional", 0.0) or 0.0,
        wall_conductivity_law=(
            ConstantConductivity(params.wall_lambda)
            if params.wall_thickness is not None and params.wall_lambda is not None
            else None
        ),
    )


def _preparation_layer(layer: InsulationLayer) -> TankPreparationLayer:
    manual = layer.material == "other"
    return TankPreparationLayer(
        thickness_m=layer.thickness,
        source="manual" if manual else "reference",
        conductivity_supplied=layer.conductivity is not None,
        manual_temperature_range_c=layer.temperature_range if manual else None,
        reference_temperature_range_c=(
            None if manual else get_insulation_temperature_range(layer.material)
        ),
        conductivity_law=(
            ConstantConductivity(cast(float, layer.conductivity))
            if manual
            else get_insulation_conductivity_law(layer.material)
        ),
    )
