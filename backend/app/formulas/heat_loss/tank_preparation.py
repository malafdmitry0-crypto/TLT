"""Build a tank preparation input from a validated backend facade payload.

Tank K is the required value from the validated params.
"""

from __future__ import annotations

from typing import cast

from heatcalc_heat_loss_core.conductivity import ConstantConductivity
from heatcalc_heat_loss_core.profile import InsulationTemperatureBasis
from heatcalc_heat_loss_core.tank_formula import (
    TankFormulaOutcome,
    TankPreparationInput,
    TankPreparationLayer,
    assemble_prepared_tank,
    evaluate_prepared_tank,
)
from heatcalc_heat_loss_core.validation import FormulaValidationReport

from app.formulas.heat_loss.catalog_preparation import resolve_reference_layer
from app.schemas.heat_loss import InsulationLayer, TankHeatLossParams


def run_validated_tank_formula(params: TankHeatLossParams) -> TankFormulaOutcome:
    prepared = assemble_prepared_tank(build_tank_preparation(params))
    if isinstance(prepared, FormulaValidationReport):
        return TankFormulaOutcome(result=None, report=prepared)
    return evaluate_prepared_tank(prepared)


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
        layers=tuple(
            _preparation_layer(layer, index, params.process_temperature)
            for index, layer in enumerate(params.insulation_layers)
        ),
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


def _preparation_layer(
    layer: InsulationLayer,
    index: int,
    process_temperature: float,
) -> TankPreparationLayer:
    manual = layer.material == "other"
    if manual:
        return TankPreparationLayer(
            thickness_m=layer.thickness,
            source="manual",
            conductivity_supplied=layer.conductivity is not None,
            manual_temperature_range_c=layer.temperature_range,
            reference_temperature_range_c=None,
            conductivity_law=ConstantConductivity(cast(float, layer.conductivity)),
        )
    law, interval = resolve_reference_layer(
        material=layer.material,
        index=index,
        process_temperature=process_temperature,
    )
    return TankPreparationLayer(
        thickness_m=layer.thickness,
        source="reference",
        conductivity_supplied=layer.conductivity is not None,
        manual_temperature_range_c=None,
        reference_temperature_range_c=interval,
        conductivity_law=law,
    )
