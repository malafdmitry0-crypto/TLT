"""Regression-guard: safety_factor НЕ применяется дважды в пайплайне.

Контекст:
    Теплорасчёт уже умножает на K в total_heat_loss (но НЕ в heat_loss_per_meter).
    Электрорасчёт принимает required_power_per_meter и сам умножает на
    safety_factor внутри calc_self_regulating.

    Если calculation_service случайно передаст
      - total_heat_loss / L  (вместо heat_loss_per_meter), или
      - heat_loss_per_meter × K (pre-multiplied)
    то K применится дважды → подберётся кабель с запасом 21% вместо 10%.

Эти тесты ловят оба варианта регрессии, перехватывая входной аргумент
в calc_self_regulating через мок.
"""

from __future__ import annotations

import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.schemas.calculation import SelfRegulatingResult
from app.services.calculation_service import CalculationService


def _make_mock_db(pipe_object: SimpleNamespace, cable_catalog_rows: list | None = None):
    """Создаёт моковую AsyncSession, которая по запросу отдаёт один pipe-объект
    и пустой `cables_extended`."""
    cable_catalog_rows = cable_catalog_rows or []

    def _execute_side_effect(*_args, **_kwargs):
        # Первый вызов (ProjectObject.where(is_valid=True)) → список объектов
        # Последующие (CableExtended / ProjectObject lookup / ElectricalCalculation lookup)
        #   возвращают пустые. Это нормально для единичного pipe-объекта.
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [pipe_object]
        mock_result.scalar_one_or_none.return_value = pipe_object
        mock_result.scalars.return_value.first.return_value = None
        return mock_result

    db = AsyncMock()
    db.execute = AsyncMock(side_effect=_execute_side_effect)
    db.commit = AsyncMock()
    db.refresh = AsyncMock()
    db.add = MagicMock()
    return db


def _fake_pipe_object(heat_loss_per_meter: float, pipe_length: float = 50.0):
    """Мок-ProjectObject с уже «посчитанными» теплопотерями."""
    oid = uuid.uuid4()
    pid = uuid.uuid4()
    return SimpleNamespace(
        id=oid,
        project_id=pid,
        object_type="pipe",
        is_valid=True,
        params={
            "outer_diameter": 0.108,
            "insulation_thickness": 0.05,
            "insulation_material": "mineral_wool",
            "ambient_temperature": -30.0,
            "process_temperature": 80.0,
            "pipe_length": pipe_length,
        },
        results={
            "heat_loss_per_meter": heat_loss_per_meter,
            # Значение total_heat_loss вычислено с учётом К=1.1 — важно для теста:
            # если service по ошибке возьмёт total/L, он получит q×K и будет
            # дважды множить на К.
            "total_heat_loss": heat_loss_per_meter * pipe_length * 1.1,
            "effective_length": pipe_length,
            "thermal_resistance": 0.5,
        },
    )


@pytest.mark.asyncio
async def test_batch_calc_electrical_passes_raw_q_linear_not_total():
    """batch_calc_electrical должен передать в электрорасчёт РОВНО
    heat_loss_per_meter (без K), а не total_heat_loss/L (c K).

    Регрессия: если кто-то перепишет строку `required_power = results.get(...)`
    на `total_heat_loss / pipe_length`, safety_factor применится дважды.
    """
    Q_LINEAR = 22.0  # Вт/м — «голое» значение
    PIPE_LEN = 50.0
    TOTAL = Q_LINEAR * PIPE_LEN * 1.1  # в results, но его БРАТЬ НЕ ДОЛЖНЫ

    pipe = _fake_pipe_object(Q_LINEAR, PIPE_LEN)
    db = _make_mock_db(pipe)
    service = CalculationService(db)

    captured: dict = {}

    def fake_calc(params):
        captured["required_power_per_meter"] = params.required_power_per_meter
        captured["safety_factor"] = params.safety_factor
        # Возвращаем любой валидный результат
        return SelfRegulatingResult(
            selected_cable="ТЛТ-25",
            cable_length=PIPE_LEN * 1.1,
            total_power=25 * PIPE_LEN * 1.1,
            current=6.25,
            voltage=220.0,
        )

    with patch("app.services.calculation_service.calc_self_regulating", side_effect=fake_calc):
        await service.batch_calc_electrical(project_id=pipe.project_id)

    assert captured["required_power_per_meter"] == pytest.approx(Q_LINEAR, rel=1e-6), (
        f"Service передал {captured['required_power_per_meter']} Вт/м — "
        f"ожидалось heat_loss_per_meter={Q_LINEAR}. "
        f"Если получили {TOTAL / PIPE_LEN:.2f} — это total/L (double-K bug)."
    )
    # safety_factor=1.1 прямо зашит в service; проверяем, что он один раз применится
    # в calc_self_regulating (другой тест это уже ловит).
    assert captured["safety_factor"] == pytest.approx(1.1, rel=1e-6)


@pytest.mark.asyncio
async def test_heat_loss_per_meter_never_includes_safety_factor():
    """calc_heat_loss (через service) не должен применять K к q_linear.

    Проверяем через реальный вызов формулы: q_linear при K=1.5 == q_linear при K=1.1.
    """
    db = AsyncMock()
    db.execute = AsyncMock(return_value=MagicMock(scalars=lambda: MagicMock(all=lambda: [])))
    service = CalculationService(db)

    pipe_params = {
        "outer_diameter": 0.108,
        "insulation_thickness": 0.05,
        "insulation_material": "mineral_wool",
        "ambient_temperature": -30.0,
        "process_temperature": 150.0,
        "pipe_length": 100.0,
        "safety_factor": 1.1,
    }

    r1 = await service.calc_heat_loss("pipe", {**pipe_params, "safety_factor": 1.1})
    r2 = await service.calc_heat_loss("pipe", {**pipe_params, "safety_factor": 1.5})

    # q_linear — инвариант: НЕ зависит от safety_factor
    assert r1["heat_loss_per_meter"] == pytest.approx(r2["heat_loss_per_meter"], rel=1e-6), (
        "heat_loss_per_meter изменился при изменении safety_factor — "
        "значит K применяется к q_linear. Это сломает электрорасчёт "
        "(будет двойная накрутка). Fix: убрать × K из расчёта q_linear в pipe.py."
    )

    # total_heat_loss — должен пропорционально измениться
    ratio = r2["total_heat_loss"] / r1["total_heat_loss"]
    assert ratio == pytest.approx(1.5 / 1.1, rel=1e-3), (
        f"total_heat_loss пропорционален К: ожидали ratio={1.5/1.1:.4f}, " f"получили {ratio:.4f}"
    )
