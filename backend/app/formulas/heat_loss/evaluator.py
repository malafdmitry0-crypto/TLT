"""Application entrypoint for evaluating already validated heat-loss inputs.

This module owns only formula dispatch.  Pydantic validation happens before
this boundary; reference-data and policy resolution remain in the compatible
pipe/tank facades; numeric equations live in ``heat_loss.core``.
"""

from typing import Any

from app.formulas.heat_loss.pipe import calc_pipe_heat_loss
from app.formulas.heat_loss.tank import calc_tank_heat_loss
from app.schemas.calculation import (
    PipeHeatLossParams,
    PipeHeatLossResult,
    TankHeatLossParams,
    TankHeatLossResult,
)


def evaluate_validated_heat_loss(
    params: PipeHeatLossParams | TankHeatLossParams,
    coefficients: dict[str, Any] | None = None,
) -> PipeHeatLossResult | TankHeatLossResult:
    """Evaluate one validated heat model without constructing another model."""

    if isinstance(params, PipeHeatLossParams):
        return calc_pipe_heat_loss(params, coefficients=coefficients)
    if isinstance(params, TankHeatLossParams):
        return calc_tank_heat_loss(params, coefficients=coefficients)
    raise TypeError(f"Unsupported heat-loss parameter model: {type(params).__name__}")
