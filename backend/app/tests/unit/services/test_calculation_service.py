"""Тесты calculation_service без БД (мок-сессия)."""

from unittest.mock import AsyncMock, MagicMock

import pytest

from app.services.calculation_service import CalculationError, CalculationService


@pytest.mark.asyncio
async def test_calc_heat_loss_pipe_returns_dict():
    mock_db = AsyncMock()
    mock_db.execute = AsyncMock(return_value=MagicMock(scalars=lambda: MagicMock(all=lambda: [])))
    service = CalculationService(mock_db)
    result = await service.calc_heat_loss(
        "pipe",
        {
            "outer_diameter": 0.1,
            "insulation_thickness": 0.05,
            "insulation_material": "mineral_wool",
            "ambient_temperature": -30,
            "process_temperature": 80,
            "pipe_length": 10,
        },
    )
    assert "heat_loss_per_meter" in result
    assert result["heat_loss_per_meter"] > 0


@pytest.mark.asyncio
async def test_calc_heat_loss_unknown_type_raises():
    mock_db = AsyncMock()
    mock_db.execute = AsyncMock(return_value=MagicMock(scalars=lambda: MagicMock(all=lambda: [])))
    service = CalculationService(mock_db)
    with pytest.raises(CalculationError):
        await service.calc_heat_loss("spaceship", {})
