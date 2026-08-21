from decimal import Decimal

from heatcalc_electrical_core.decimal_math import decimal_value, round_down, round_result, round_up


def test_decimal_value_preserves_supplied_float_spelling() -> None:
    assert decimal_value(0.1) == Decimal("0.1")
    assert decimal_value("1.2300") == Decimal("1.2300")


def test_normative_rounding_is_deterministic() -> None:
    assert round_result(Decimal("1.2345")) == Decimal("1.235")
    assert round_down(Decimal("1.2345")) == Decimal("1.234")
    assert round_up(Decimal("1.2341")) == Decimal("1.235")
