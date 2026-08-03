"""E6 / B2: table status must keep stale distinct from not_calculated."""

from __future__ import annotations

from types import SimpleNamespace
from uuid import uuid4

from app.services.electrical_query_service import (
    STATUS_OPTIONS,
    ElectricalQueryRow,
    _electrical_status,
)


def _row(
    *,
    calc: object | None,
) -> ElectricalQueryRow:
    obj = SimpleNamespace(id=uuid4(), is_valid=True, results={}, validation_errors=None)
    return ElectricalQueryRow(obj=obj, calc=calc)  # type: ignore[arg-type]


def test_status_options_include_stale_label():
    values = dict(STATUS_OPTIONS)
    assert values["stale"] == "Требуется перерасчёт"
    assert values["error"] == "Требуется корректировка"
    assert values["not_calculated"] == "Не рассчитан"
    assert values["calculated"] == "Рассчитан"


def test_electrical_status_stale_not_collapsed_to_not_calculated():
    calc = SimpleNamespace(
        id=uuid4(),
        cable_mark="30ТТВ2-СР",
        cable_type="self_regulating_tt",
        results={
            "category": "stale",
            "stale": True,
            "message": "Теплопотери изменились",
            "selected_cable": "30ТТВ2",
            "cable_type": "self_regulating_tt",
        },
    )
    assert _electrical_status(_row(calc=calc)) == "stale"


def test_electrical_status_results_stale_flag_without_category():
    calc = SimpleNamespace(
        id=uuid4(),
        cable_mark="30ТТВ2-СР",
        cable_type="self_regulating_tt",
        results={
            "stale": True,
            "selected_cable": "30ТТВ2",
            "cable_type": "self_regulating_tt",
        },
    )
    assert _electrical_status(_row(calc=calc)) == "stale"


def test_electrical_status_missing_calc_is_not_calculated():
    assert _electrical_status(_row(calc=None)) == "not_calculated"


def test_electrical_status_error_vs_unsupported():
    error = SimpleNamespace(
        id=uuid4(),
        cable_mark=None,
        cable_type="self_regulating_tt",
        results={
            "category": "formula",
            "error_code": "ELECTRICAL_CABLE_POWER_INSUFFICIENT",
            "message": "boom",
            "cable_type": "self_regulating_tt",
        },
    )
    unsupported = SimpleNamespace(
        id=uuid4(),
        cable_mark=None,
        cable_type="self_regulating_tt",
        results={
            "category": "unsupported",
            "message": "layout",
            "cable_type": "self_regulating_tt",
        },
    )
    assert _electrical_status(_row(calc=error)) == "error"
    assert _electrical_status(_row(calc=unsupported)) == "unsupported"
