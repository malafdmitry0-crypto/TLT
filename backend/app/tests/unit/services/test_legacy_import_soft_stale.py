"""E9: imported legacy electrical rows are soft-stale, never ready."""

from __future__ import annotations

from app.services.project_io_service import (
    _legacy_assignment_projection,
    _legacy_import_results_soft_stale,
)


def test_legacy_self_regulating_assignment_is_stale_not_ready():
    system, state = _legacy_assignment_projection(
        "self_regulating",
        "ТЛТ-25",
        {"selected_cable": "ТЛТ-25", "power_per_meter": 25},
    )
    assert system == "self_regulating"
    assert state == "stale"


def test_legacy_resistive_assignment_is_stale():
    system, state = _legacy_assignment_projection(
        "single_core",
        "RES-1",
        {"selected_cable": "RES-1"},
    )
    assert system == "resistive"
    assert state == "stale"


def test_tt_successful_import_can_be_ready():
    system, state = _legacy_assignment_projection(
        "self_regulating_tt",
        "30ТТВ2-СР",
        {
            "selected_cable": "30ТТВ2",
            "cable_type": "self_regulating_tt",
            "voltage": 230,
        },
    )
    assert system == "self_regulating"
    assert state == "ready"


def test_tt_with_tlt_mark_is_stale():
    system, state = _legacy_assignment_projection(
        "self_regulating_tt",
        "ТЛТ-30",
        {"selected_cable": "ТЛТ-30"},
    )
    assert state == "stale"


def test_soft_stale_results_overlay_legacy_type():
    out = _legacy_import_results_soft_stale(
        "self_regulating",
        "ТЛТ-25",
        {"selected_cable": "ТЛТ-25", "power_per_meter": 25},
    )
    assert out is not None
    assert out["stale"] is True
    assert out["category"] == "stale"
    assert out["stale_reason"] == "legacy_cable_mark"


def test_soft_stale_does_not_touch_tt_payload():
    original = {"selected_cable": "30ТТВ2", "voltage": 230}
    out = _legacy_import_results_soft_stale("self_regulating_tt", "30ТТВ2-СР", original)
    assert out == original
