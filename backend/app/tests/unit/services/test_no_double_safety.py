"""Regression-guard: safety_factor не входит в базовые удельные теплопотери."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest

from app.services.calculation_service import CalculationService

MINERAL_WOOL = "mineral_wool_boards_120"


@pytest.mark.asyncio
async def test_heat_loss_per_meter_base_never_includes_safety_factor():
    """calc_heat_loss (через service) не должен применять K к q_linear.

    Проверяем через реальный вызов формулы: q_linear не меняется от входного K.
    Явно заданный K сохраняется, поэтому total_heat_loss_design меняется пропорционально
    K, но heat_loss_per_meter_base остается неизменным.
    """
    db = AsyncMock()
    db.execute = AsyncMock(return_value=MagicMock(scalars=lambda: MagicMock(all=lambda: [])))
    service = CalculationService(db)

    pipe_params = {
        "outer_diameter": 0.108,
        "wall_thickness": 0.004,
        "pipe_material": "carbon_steel",
        "insulation_layers": [{"thickness": 0.05, "material": MINERAL_WOOL}],
        "insulation_temperature_basis": "outdoor_winter",
        "ambient_temperature": -30.0,
        "process_temperature": 150.0,
        "pipe_length": 100.0,
        "safety_factor": 1.1,
        "placement": "outdoor",
        "wind_speed": 0,
    }

    r1 = await service.calc_heat_loss("pipe", {**pipe_params, "safety_factor": 1.1})
    r2 = await service.calc_heat_loss("pipe", {**pipe_params, "safety_factor": 1.5})

    # q_linear — инвариант: НЕ зависит от safety_factor
    assert r1["heat_loss_per_meter_base"] == pytest.approx(r2["heat_loss_per_meter_base"], rel=1e-6), (
        "heat_loss_per_meter_base изменился при изменении safety_factor — "
        "значит K применяется к q_linear. Это сломает электрорасчёт "
        "(будет двойная накрутка). Fix: убрать × K из расчёта q_linear в pipe.py."
    )

    # total_heat_loss_design масштабируется только один раз через safety_factor.
    ratio = r2["total_heat_loss_design"] / r1["total_heat_loss_design"]
    assert ratio == pytest.approx(1.5 / 1.1, rel=1e-3)
    assert r1["safety_factor_applied"] == pytest.approx(1.1)
    assert r2["safety_factor_applied"] == pytest.approx(1.5)
