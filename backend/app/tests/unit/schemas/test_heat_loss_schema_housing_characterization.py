"""Freeze formula models in heat_loss and HTTP compatibility in calculation."""

from __future__ import annotations

from app.schemas import calculation, heat_loss
from app.schemas.heat_loss import (
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
    "HeatLossBatchJobRequest",
)


def test_heat_formula_contract_names_exist_only_in_owner_module() -> None:
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
        heat_loss_symbol = getattr(heat_loss, name)
        assert imported[name] is heat_loss_symbol
        assert heat_loss_symbol.__module__ == "app.schemas.heat_loss"
        assert heat_loss_symbol.__name__ == name
        assert not hasattr(calculation, name)


def test_heat_http_envelopes_are_defined_in_heat_loss_and_identity_reexported() -> None:
    for name in HEAT_HTTP_ENVELOPE_NAMES:
        calculation_symbol = getattr(calculation, name)
        heat_loss_symbol = getattr(heat_loss, name)
        assert calculation_symbol is heat_loss_symbol
        assert heat_loss_symbol.__module__ == "app.schemas.heat_loss"
        assert heat_loss_symbol.__name__ == name
