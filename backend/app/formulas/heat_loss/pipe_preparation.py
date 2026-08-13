"""Build a pipe preparation input from a validated backend facade payload.

InsulationLayer.model_validate() remains a public contract, so this adapter
does not strip layer-level catalog checks. It only chooses the effective K
and assembles the new package preparation object for one calculation.
"""

from __future__ import annotations

from typing import Any, cast

from heatcalc_heat_loss_core.conductivity import ConstantConductivity
from heatcalc_heat_loss_core.pipe_formula import (
    PipeFormulaOutcome,
    PipePreparationInput,
    PipePreparationLayer,
    assemble_prepared_pipe,
    evaluate_prepared_pipe,
)
from heatcalc_heat_loss_core.profile import InsulationTemperatureBasis
from heatcalc_heat_loss_core.validation import FormulaValidationReport

from app.reference_data.loader import (
    get_pipe_material_conductivity_law,
    resolve_reference_insulation,
)
from app.schemas.calculation import InsulationLayer, PipeHeatLossParams


def effective_pipe_safety_factor(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None,
) -> float | None:
    """User/climate K wins; admin K is used only when the first value is absent."""

    if params.safety_factor is not None:
        return params.safety_factor
    if coefficients is not None and "safety_factor" in coefficients:
        return coefficients["safety_factor"]
    return None


def run_validated_pipe_formula(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeFormulaOutcome:
    """Calculate a Pydantic-validated pipe without repeating the core contract."""

    prepared = assemble_prepared_pipe(build_pipe_preparation(params, coefficients))
    if isinstance(prepared, FormulaValidationReport):
        return PipeFormulaOutcome(result=None, report=prepared)
    return evaluate_prepared_pipe(prepared)


def build_pipe_preparation(
    params: PipeHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipePreparationInput:
    return PipePreparationInput(
        outer_diameter=params.outer_diameter,
        wall_thickness=params.wall_thickness,
        pipe_lambda=params.pipe_lambda,
        has_pipe_material=params.pipe_material is not None,
        layers=tuple(_preparation_layer(layer) for layer in params.insulation_layers),
        ambient_temperature=params.ambient_temperature,
        process_temperature=params.process_temperature,
        pipe_length=params.pipe_length,
        pipe_centerline_depth=params.pipe_centerline_depth,
        num_local_elements=params.num_local_elements,
        local_element_equiv_length=params.local_element_equiv_length,
        wind_speed=params.wind_speed,
        ground_conductivity=params.ground_conductivity,
        ground_temperature=params.ground_temperature,
        safety_factor=effective_pipe_safety_factor(params, coefficients),
        placement=params.placement,
        insulation_temperature_basis=cast(
            InsulationTemperatureBasis, params.insulation_temperature_basis
        ),
        wall_conductivity_law=(
            ConstantConductivity(params.pipe_lambda)
            if params.pipe_lambda is not None
            else get_pipe_material_conductivity_law(params.pipe_material)
        ),
    )


def _preparation_layer(layer: InsulationLayer) -> PipePreparationLayer:
    manual = layer.material == "other"
    if manual:
        return PipePreparationLayer(
            thickness_m=layer.thickness,
            source="manual",
            conductivity_supplied=layer.conductivity is not None,
            manual_temperature_range_c=layer.temperature_range,
            reference_temperature_interval_c=None,
            conductivity_law=ConstantConductivity(cast(float, layer.conductivity)),
        )
    law, interval = resolve_reference_insulation(layer.material)
    return PipePreparationLayer(
        thickness_m=layer.thickness,
        source="reference",
        conductivity_supplied=layer.conductivity is not None,
        manual_temperature_range_c=None,
        reference_temperature_interval_c=interval,
        conductivity_law=law,
    )
