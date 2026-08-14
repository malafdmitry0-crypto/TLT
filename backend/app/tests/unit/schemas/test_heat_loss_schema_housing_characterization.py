"""Freeze which heat-loss formula models live in app.schemas.calculation today."""

from __future__ import annotations

from app.schemas import calculation
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


def test_heat_formula_contract_names_import_from_calculation_today() -> None:
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
        symbol = getattr(calculation, name)
        assert imported[name] is symbol
        assert symbol.__module__ == "app.schemas.calculation"
        assert symbol.__name__ == name


def test_heat_http_envelopes_also_live_in_calculation_today() -> None:
    for name in HEAT_HTTP_ENVELOPE_NAMES:
        symbol = getattr(calculation, name)
        assert symbol.__module__ == "app.schemas.calculation"
        assert symbol.__name__ == name
