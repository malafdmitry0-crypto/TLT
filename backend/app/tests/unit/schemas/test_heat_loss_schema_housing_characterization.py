"""Freeze heat-loss formula models in heat_loss, re-exported from calculation."""

from __future__ import annotations

from app.schemas import calculation, heat_loss
from app.schemas.calculation import (
    InsulationLayer,
    InsulationLayerApplied,
    PipeHeatLossParams,
    PipeHeatLossResult,
    StoredPipeHeatParams,
    StoredTankHeatParams,
    TankHeatLossParams,
    TankHeatLossResult,
)

HEAT_FORMULA_CONTRACT_NAMES = (
    "InsulationLayer",
    "InsulationLayerApplied",
    "PipeHeatLossParams",
    "StoredPipeHeatParams",
    "PipeHeatLossResult",
    "TankHeatLossParams",
    "StoredTankHeatParams",
    "TankHeatLossResult",
)

HEAT_HTTP_ENVELOPE_NAMES = (
    "HeatLossRequest",
    "HeatLossResponse",
    "BatchCalcResponse",
)


def test_heat_formula_contract_names_are_identity_reexports() -> None:
    imported = {
        "InsulationLayer": InsulationLayer,
        "InsulationLayerApplied": InsulationLayerApplied,
        "PipeHeatLossParams": PipeHeatLossParams,
        "StoredPipeHeatParams": StoredPipeHeatParams,
        "PipeHeatLossResult": PipeHeatLossResult,
        "TankHeatLossParams": TankHeatLossParams,
        "StoredTankHeatParams": StoredTankHeatParams,
        "TankHeatLossResult": TankHeatLossResult,
    }

    assert tuple(imported) == HEAT_FORMULA_CONTRACT_NAMES
    for name in HEAT_FORMULA_CONTRACT_NAMES:
        calculation_symbol = getattr(calculation, name)
        heat_loss_symbol = getattr(heat_loss, name)
        assert imported[name] is calculation_symbol
        assert calculation_symbol is heat_loss_symbol
        assert heat_loss_symbol.__module__ == "app.schemas.heat_loss"
        assert calculation_symbol.__name__ == name


def test_heat_http_envelopes_remain_defined_in_calculation() -> None:
    for name in HEAT_HTTP_ENVELOPE_NAMES:
        symbol = getattr(calculation, name)
        assert symbol.__module__ == "app.schemas.calculation"
        assert symbol.__name__ == name
        assert not hasattr(heat_loss, name)
