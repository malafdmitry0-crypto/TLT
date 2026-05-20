"""Тесты stub-реализаций электрических формул полной версии.

По ТЗ §4.3.2 кабель с минеральной изоляцией — в «Полной версии».
Тест гарантирует, что stub явно сообщает о недоступности, а не молча
возвращает мусор.
"""

import pytest

from app.formulas.electrical.mineral import calc_mineral
from app.schemas.calculation import SelfRegulatingParams


def _params() -> SelfRegulatingParams:
    return SelfRegulatingParams(
        required_power_per_meter=30.0,
        cable_mark=None,
        supply_voltage=220.0,
        ambient_temperature=-20.0,
        process_temperature=80.0,
        pipe_length=50.0,
        safety_factor=1.1,
    )


def test_mineral_stub_raises_not_implemented():
    with pytest.raises(NotImplementedError, match="полной версии"):
        calc_mineral(_params())
