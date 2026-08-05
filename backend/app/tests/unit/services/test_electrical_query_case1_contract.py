"""Case 1 field registry excludes retired TT-only query controls."""

from app.services.electrical_query_service import (
    ELECTRICAL_CALC_PARAM_KEYS,
    ELECTRICAL_SQL_EXPRESSIONS,
    FIELDS_BY_KEY,
)


def test_retired_tt_controls_are_absent_but_shared_non_tt_fields_remain() -> None:
    retired = {"vapor_temperature", "maintain_temperature", "aggressive_product"}

    assert retired.isdisjoint(FIELDS_BY_KEY)
    assert retired.isdisjoint(ELECTRICAL_SQL_EXPRESSIONS)
    assert retired.isdisjoint(ELECTRICAL_CALC_PARAM_KEYS)
    assert {"connection_type", "winding_coefficient"} <= FIELDS_BY_KEY.keys()
    assert {"connection_type", "winding_coefficient"} <= ELECTRICAL_SQL_EXPRESSIONS.keys()
    assert {"connection_type", "winding_coefficient"} <= ELECTRICAL_CALC_PARAM_KEYS
