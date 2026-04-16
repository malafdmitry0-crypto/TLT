"""Тесты stub-реализаций электрических формул полной версии.

По ТЗ §4.3.2 поддержка резистивных кабелей и кабелей с минеральной изоляцией
— в «Полной версии», а не MVP. Тесты гарантируют, что:
1. Вызов этих функций явно сообщает пользователю о недоступности
2. Они не молча возвращают мусор
"""

import pytest

from app.formulas.electrical.mineral import calc_mineral
from app.formulas.electrical.resistive import calc_resistive
from app.schemas.calculation import SelfRegulatingParams


def _params() -> SelfRegulatingParams:
    return SelfRegulatingParams(
        required_power_per_meter=30.0,
        cable_mark=None,
        supply_voltage=220.0,
        ambient_temperature=-20.0,
        pipe_length=50.0,
        safety_factor=1.1,
    )


def test_resistive_stub_raises_not_implemented():
    with pytest.raises(NotImplementedError, match="полной версии"):
        calc_resistive(_params())


def test_mineral_stub_raises_not_implemented():
    with pytest.raises(NotImplementedError, match="полной версии"):
        calc_mineral(_params())
