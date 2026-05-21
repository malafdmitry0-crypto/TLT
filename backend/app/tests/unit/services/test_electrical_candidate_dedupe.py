"""Unit tests for electrical candidate dedupe keys."""

import uuid

from app.models.electrical_candidate import ElectricalCandidate
from app.services.calculation_service import CalculationService
from app.services.electrical_candidate_dedupe import (
    build_dedupe_key,
    build_identity_payload,
    catalog_identity,
    normalize_winding_pitch,
)


def test_winding_pitch_null_and_zero_are_equal():
    assert normalize_winding_pitch(None) == 0.0
    assert normalize_winding_pitch(0) == 0.0
    assert normalize_winding_pitch(0.0) == 0.0


def test_auto_and_manual_same_configuration_share_dedupe_key():
    results = {
        "selected_cable": "ТЛТ-75",
        "applied_number_of_threads": 2,
        "num_circuits": 2,
        "winding_pitch": 0.0,
        "winding_coefficient": 1.0,
        "voltage": 220,
        "selection_policy": "technical_minimum",
        "selection_reason": "auto",
        "number_of_threads_source": "auto",
    }
    params = {"winding_coefficient": 1.0, "supply_voltage": 220}
    snapshot = {
        "actual_catalog_source": "builtin",
        "catalog_entry_id": "tlt-75-id",
        "fingerprint": {"technical_hash": "abc123"},
    }
    auto_key = build_dedupe_key(
        object_type="pipe",
        cable_type="self_regulating",
        cable_source="builtin",
        cable_mark=None,
        results=results,
        params=params,
        cable_snapshot=snapshot,
        status="applicable",
    )
    manual_key = build_dedupe_key(
        object_type="pipe",
        cable_type="self_regulating",
        cable_source="builtin",
        cable_mark="ТЛТ-75",
        results=results,
        params=params,
        cable_snapshot=snapshot,
        status="applicable",
    )
    assert auto_key == manual_key


def test_different_threads_produce_different_keys():
    base_results = {
        "selected_cable": "ТЛТ-75",
        "winding_pitch": 0.0,
        "winding_coefficient": 1.0,
        "voltage": 220,
    }
    key_one = build_dedupe_key(
        object_type="pipe",
        cable_type="self_regulating",
        cable_source="builtin",
        cable_mark="ТЛТ-75",
        results={**base_results, "num_circuits": 1},
        params={},
        cable_snapshot={"actual_catalog_source": "builtin"},
        status="applicable",
    )
    key_two = build_dedupe_key(
        object_type="pipe",
        cable_type="self_regulating",
        cable_source="builtin",
        cable_mark="ТЛТ-75",
        results={**base_results, "num_circuits": 2},
        params={},
        cable_snapshot={"actual_catalog_source": "builtin"},
        status="applicable",
    )
    assert key_one != key_two


def test_different_winding_pitch_produces_different_keys():
    base = {
        "selected_cable": "ТЛТ-75",
        "num_circuits": 1,
        "winding_coefficient": 1.0,
        "voltage": 220,
    }
    straight = build_dedupe_key(
        object_type="pipe",
        cable_type="self_regulating",
        cable_source="builtin",
        cable_mark="ТЛТ-75",
        results={**base, "winding_pitch": 0.0},
        params={},
        cable_snapshot={"actual_catalog_source": "builtin"},
        status="applicable",
    )
    coiled = build_dedupe_key(
        object_type="pipe",
        cable_type="self_regulating",
        cable_source="builtin",
        cable_mark="ТЛТ-75",
        results={**base, "winding_pitch": 150.0},
        params={"laying_step": 0.15},
        cable_snapshot={"actual_catalog_source": "builtin"},
        status="applicable",
    )
    assert straight != coiled


def test_self_regulating_requested_controls_change_key_when_auto_result_is_same():
    results = {
        "selected_cable": "ТЛТ-10",
        "num_circuits": 1,
        "winding_pitch": 0,
        "winding_coefficient": 1,
        "voltage": 220,
    }
    base = build_dedupe_key(
        object_type="pipe",
        cable_type="self_regulating",
        cable_source="builtin",
        cable_mark="ТЛТ-10",
        results=results,
        params={"supply_voltage": 220, "winding_coefficient": 1},
        cable_snapshot={"actual_catalog_source": "builtin"},
        status="applicable",
    )
    changed_voltage = build_dedupe_key(
        object_type="pipe",
        cable_type="self_regulating",
        cable_source="builtin",
        cable_mark="ТЛТ-10",
        results=results,
        params={"supply_voltage": 230, "winding_coefficient": 1},
        cable_snapshot={"actual_catalog_source": "builtin"},
        status="applicable",
    )
    changed_winding = build_dedupe_key(
        object_type="pipe",
        cable_type="self_regulating",
        cable_source="builtin",
        cable_mark="ТЛТ-10",
        results=results,
        params={"supply_voltage": 220, "winding_coefficient": 1.05},
        cable_snapshot={"actual_catalog_source": "builtin"},
        status="applicable",
    )
    assert base != changed_voltage
    assert base != changed_winding


def test_cable_source_all_uses_actual_catalog_source():
    identity = catalog_identity(
        cable_snapshot={
            "actual_catalog_source": "extended",
            "catalog_entry_id": "ext-1",
            "fingerprint": {"technical_hash": "same-tech"},
        },
        cable_source="all",
        cable_mark="ТЛТ-75",
    )
    assert identity == "tech:same-tech"


def test_diagnostic_candidates_dedupe_by_reason_and_controls():
    params = {"selection_policy": "technical_minimum", "number_of_threads": 2}
    key_a = build_dedupe_key(
        object_type="pipe",
        cable_type="mineral",
        cable_source="builtin",
        cable_mark=None,
        results=None,
        params=params,
        cable_snapshot=None,
        reason_code="no_candidate_generator",
        status="not_applicable",
    )
    key_b = build_dedupe_key(
        object_type="pipe",
        cable_type="mineral",
        cable_source="builtin",
        cable_mark=None,
        results=None,
        params=params,
        cable_snapshot=None,
        reason_code="no_candidate_generator",
        status="not_applicable",
    )
    assert key_a == key_b


def test_resistive_connection_type_changes_key():
    base = {
        "selected_cable": "ТТ Р1-1.5",
        "num_circuits": 2,
        "scheme_count": 1,
        "scheme_threads": 2,
        "winding_pitch": 0.0,
        "winding_coefficient": 1.0,
        "voltage": 220,
    }
    line = build_dedupe_key(
        object_type="pipe",
        cable_type="single_core",
        cable_source="builtin",
        cable_mark="ТТ Р1-1.5",
        results={**base, "connection_type": "line_1ph"},
        params={},
        cable_snapshot={"actual_catalog_source": "builtin"},
        status="applicable",
    )
    star = build_dedupe_key(
        object_type="pipe",
        cable_type="single_core",
        cable_source="builtin",
        cable_mark="ТТ Р1-1.5",
        results={**base, "connection_type": "star_3ph"},
        params={},
        cable_snapshot={"actual_catalog_source": "builtin"},
        status="applicable",
    )
    assert line != star


def test_resistive_requested_connection_type_changes_key_when_auto_result_is_same():
    results = {
        "selected_cable": "ТТ Р1-1.5",
        "num_circuits": 2,
        "scheme_count": 1,
        "scheme_threads": 2,
        "winding_pitch": 0,
        "winding_coefficient": 1,
        "voltage": 220,
        "connection_type": "line_1ph",
    }
    line_requested = build_dedupe_key(
        object_type="pipe",
        cable_type="single_core",
        cable_source="builtin",
        cable_mark="ТТ Р1-1.5",
        results=results,
        params={"connection_type": "line_1ph"},
        cable_snapshot={"actual_catalog_source": "builtin"},
        status="applicable",
    )
    star_requested = build_dedupe_key(
        object_type="pipe",
        cable_type="single_core",
        cable_source="builtin",
        cable_mark="ТТ Р1-1.5",
        results=results,
        params={"connection_type": "star_3ph"},
        cable_snapshot={"actual_catalog_source": "builtin"},
        status="applicable",
    )
    assert line_requested != star_requested


def test_resistive_requested_voltage_changes_key_when_auto_result_voltage_is_same():
    results = {
        "selected_cable": "ТТ Р1-1.5",
        "num_circuits": 2,
        "scheme_count": 1,
        "scheme_threads": 2,
        "winding_pitch": 0,
        "winding_coefficient": 1,
        "voltage": 220,
        "connection_type": "line_1ph",
    }
    voltage_220 = build_dedupe_key(
        object_type="pipe",
        cable_type="single_core",
        cable_source="builtin",
        cable_mark="ТТ Р1-1.5",
        results=results,
        params={"supply_voltage": 220},
        cable_snapshot={"actual_catalog_source": "builtin"},
        status="applicable",
    )
    voltage_230 = build_dedupe_key(
        object_type="pipe",
        cable_type="single_core",
        cable_source="builtin",
        cable_mark="ТТ Р1-1.5",
        results=results,
        params={"supply_voltage": 230},
        cable_snapshot={"actual_catalog_source": "builtin"},
        status="applicable",
    )
    assert voltage_220 != voltage_230


def test_three_core_requested_connection_type_changes_key_when_auto_result_is_same():
    results = {
        "selected_cable": "ТТ Р3 х 1,5-1,0",
        "num_circuits": 3,
        "scheme_count": 1,
        "scheme_threads": 3,
        "winding_pitch": 0,
        "winding_coefficient": 1,
        "voltage": 220,
        "connection_type": "line_1ph",
    }
    line_requested = build_dedupe_key(
        object_type="pipe",
        cable_type="three_core",
        cable_source="builtin",
        cable_mark="ТТ Р3 х 1,5-1,0",
        results=results,
        params={"connection_type": "line_1ph"},
        cable_snapshot={"actual_catalog_source": "builtin"},
        status="applicable",
    )
    star_requested = build_dedupe_key(
        object_type="pipe",
        cable_type="three_core",
        cable_source="builtin",
        cable_mark="ТТ Р3 х 1,5-1,0",
        results=results,
        params={"connection_type": "star_3x3"},
        cable_snapshot={"actual_catalog_source": "builtin"},
        status="applicable",
    )
    assert line_requested != star_requested


def test_apply_upsert_clears_is_applied_when_status_not_applicable():
    existing = ElectricalCandidate(
        project_id=uuid.uuid4(),
        object_id=uuid.uuid4(),
        variant_number=1,
        cable_type="self_regulating",
        cable_source="builtin",
        cable_mark="ТЛТ-75",
        dedupe_key="v1:test",
        mode="manual",
        status="applicable",
        priority=0,
        is_recommended=False,
        is_pinned=False,
        is_applied=True,
        params={},
        results={},
        warnings=[],
        risk_flags=[],
        candidate_meta={},
    )
    CalculationService._apply_candidate_upsert(
        existing,
        params={},
        results=None,
        cable_snapshot=None,
        warnings=[],
        risk_flags=[],
        reason_code="candidate_calculation_failed",
        reason_message="ошибка",
        cable_mark="ТЛТ-75",
        mode="auto",
        new_status="error",
        candidate_meta={"autoselection_used": True},
    )
    assert existing.is_applied is False
    assert existing.status == "error"


def test_selection_policy_not_in_variant_payload():
    payload = build_identity_payload(
        object_type="pipe",
        cable_type="self_regulating",
        cable_source="builtin",
        cable_mark="ТЛТ-75",
        results={
            "selected_cable": "ТЛТ-75",
            "num_circuits": 1,
            "winding_pitch": 0,
            "winding_coefficient": 1,
            "voltage": 220,
            "selection_policy": "lowest_cost",
            "applied_selection_policy": "technical_minimum",
        },
        params={"selection_policy": "balanced"},
        cable_snapshot={"actual_catalog_source": "builtin"},
        status="applicable",
    )
    assert payload["kind"] == "variant"
    assert "selection_policy" not in payload


def test_voltage_aliases_share_key():
    common = {
        "selected_cable": "ТЛТ-10",
        "num_circuits": 1,
        "winding_pitch": 0,
        "winding_coefficient": 1,
    }
    from_results = build_dedupe_key(
        object_type="pipe",
        cable_type="self_regulating",
        cable_source="builtin",
        cable_mark="ТЛТ-10",
        results={**common, "voltage": 220},
        params={},
        cable_snapshot={"actual_catalog_source": "builtin"},
        status="applicable",
    )
    from_params = build_dedupe_key(
        object_type="pipe",
        cable_type="self_regulating",
        cable_source="builtin",
        cable_mark="ТЛТ-10",
        results=common,
        params={"supply_voltage": 220},
        cable_snapshot={"actual_catalog_source": "builtin"},
        status="applicable",
    )
    assert from_results == from_params


def test_pipe_ignores_tank_only_fields():
    base_results = {
        "selected_cable": "ТЛТ-10",
        "num_circuits": 1,
        "winding_pitch": 0,
        "winding_coefficient": 1,
        "voltage": 220,
    }
    key_without_tank_fields = build_dedupe_key(
        object_type="pipe",
        cable_type="self_regulating",
        cable_source="builtin",
        cable_mark="ТЛТ-10",
        results=base_results,
        params={},
        cable_snapshot={"actual_catalog_source": "builtin"},
        status="applicable",
    )
    key_with_tank_fields = build_dedupe_key(
        object_type="pipe",
        cable_type="self_regulating",
        cable_source="builtin",
        cable_mark="ТЛТ-10",
        results=base_results,
        params={"heating_height": 2, "laying_step": 0.2},
        cable_snapshot={"actual_catalog_source": "builtin"},
        status="applicable",
    )
    assert key_without_tank_fields == key_with_tank_fields


def test_tank_uses_resolved_laying_step_not_winding_pitch_alias():
    base_results = {
        "selected_cable": "ТЛТ-10",
        "num_circuits": 1,
        "winding_coefficient": 1,
        "voltage": 220,
    }
    from_pitch_alias = build_dedupe_key(
        object_type="tank",
        cable_type="self_regulating",
        cable_source="builtin",
        cable_mark="ТЛТ-10",
        results={**base_results, "winding_pitch": 200},
        params={"heating_height": 2},
        cable_snapshot={"actual_catalog_source": "builtin"},
        status="applicable",
    )
    from_laying_step = build_dedupe_key(
        object_type="tank",
        cable_type="self_regulating",
        cable_source="builtin",
        cable_mark="ТЛТ-10",
        results={**base_results, "winding_pitch": 0},
        params={"heating_height": 2, "laying_step": 0.2},
        cable_snapshot={"actual_catalog_source": "builtin"},
        status="applicable",
    )
    assert from_pitch_alias == from_laying_step


def test_tank_laying_step_changes_key():
    base_results = {
        "selected_cable": "ТЛТ-10",
        "num_circuits": 1,
        "winding_coefficient": 1,
        "voltage": 220,
    }
    step_020 = build_dedupe_key(
        object_type="tank",
        cable_type="self_regulating",
        cable_source="builtin",
        cable_mark="ТЛТ-10",
        results=base_results,
        params={"heating_height": 2, "laying_step": 0.2},
        cable_snapshot={"actual_catalog_source": "builtin"},
        status="applicable",
    )
    step_025 = build_dedupe_key(
        object_type="tank",
        cable_type="self_regulating",
        cable_source="builtin",
        cable_mark="ТЛТ-10",
        results=base_results,
        params={"heating_height": 2, "laying_step": 0.25},
        cable_snapshot={"actual_catalog_source": "builtin"},
        status="applicable",
    )
    assert step_020 != step_025


def test_tt_maintain_temperature_falls_back_to_process_temperature():
    base_results = {
        "cable_mark": "10ТТН2-СР",
        "num_circuits": 1,
        "winding_pitch": 0,
        "winding_coefficient": 1.1,
        "voltage": 220,
    }
    explicit = build_dedupe_key(
        object_type="pipe",
        cable_type="self_regulating_tt",
        cable_source="builtin",
        cable_mark="10ТТН2-СР",
        results=base_results,
        params={"maintain_temperature": 5, "process_temperature": 20},
        cable_snapshot={"actual_catalog_source": "builtin"},
        status="applicable",
    )
    fallback = build_dedupe_key(
        object_type="pipe",
        cable_type="self_regulating_tt",
        cable_source="builtin",
        cable_mark="10ТТН2-СР",
        results=base_results,
        params={"process_temperature": 5},
        cable_snapshot={"actual_catalog_source": "builtin"},
        status="applicable",
    )
    assert explicit == fallback


def test_tt_requested_temperature_controls_change_key_when_auto_result_is_same():
    results = {
        "cable_mark": "10ТТН2-СР",
        "num_circuits": 1,
        "winding_pitch": 0,
        "winding_coefficient": 1.1,
        "voltage": 220,
    }
    base = build_dedupe_key(
        object_type="pipe",
        cable_type="self_regulating_tt",
        cable_source="builtin",
        cable_mark="10ТТН2-СР",
        results=results,
        params={
            "maintain_temperature": 5,
            "vapor_temperature": 80,
            "aggressive_product": False,
        },
        cable_snapshot={"actual_catalog_source": "builtin"},
        status="applicable",
    )
    changed_maintain = build_dedupe_key(
        object_type="pipe",
        cable_type="self_regulating_tt",
        cable_source="builtin",
        cable_mark="10ТТН2-СР",
        results=results,
        params={
            "maintain_temperature": 10,
            "vapor_temperature": 80,
            "aggressive_product": False,
        },
        cable_snapshot={"actual_catalog_source": "builtin"},
        status="applicable",
    )
    changed_vapor = build_dedupe_key(
        object_type="pipe",
        cable_type="self_regulating_tt",
        cable_source="builtin",
        cable_mark="10ТТН2-СР",
        results=results,
        params={
            "maintain_temperature": 5,
            "vapor_temperature": 90,
            "aggressive_product": False,
        },
        cable_snapshot={"actual_catalog_source": "builtin"},
        status="applicable",
    )
    changed_aggressive = build_dedupe_key(
        object_type="pipe",
        cable_type="self_regulating_tt",
        cable_source="builtin",
        cable_mark="10ТТН2-СР",
        results=results,
        params={
            "maintain_temperature": 5,
            "vapor_temperature": 80,
            "aggressive_product": True,
        },
        cable_snapshot={"actual_catalog_source": "builtin"},
        status="applicable",
    )
    assert base != changed_maintain
    assert base != changed_vapor
    assert base != changed_aggressive


def test_tt_tank_winding_coefficient_changes_key():
    base_results = {
        "cable_mark": "10ТТН2-СР",
        "num_circuits": 1,
        "voltage": 220,
    }
    coefficient_110 = build_dedupe_key(
        object_type="tank",
        cable_type="self_regulating_tt",
        cable_source="builtin",
        cable_mark="10ТТН2-СР",
        results=base_results,
        params={
            "heating_height": 2,
            "laying_step": 0.2,
            "winding_coefficient": 1.1,
            "process_temperature": 5,
        },
        cable_snapshot={"actual_catalog_source": "builtin"},
        status="applicable",
    )
    coefficient_120 = build_dedupe_key(
        object_type="tank",
        cable_type="self_regulating_tt",
        cable_source="builtin",
        cable_mark="10ТТН2-СР",
        results=base_results,
        params={
            "heating_height": 2,
            "laying_step": 0.2,
            "winding_coefficient": 1.2,
            "process_temperature": 5,
        },
        cable_snapshot={"actual_catalog_source": "builtin"},
        status="applicable",
    )
    assert coefficient_110 != coefficient_120


def test_resistive_scheme_is_primary_over_num_circuits():
    base_results = {
        "selected_cable": "ТТ Р1-1.5",
        "winding_pitch": 0,
        "winding_coefficient": 1,
        "voltage": 220,
        "connection_type": "line_1ph",
        "num_circuits": 4,
    }
    one_scheme_four_threads = build_dedupe_key(
        object_type="pipe",
        cable_type="single_core",
        cable_source="builtin",
        cable_mark="ТТ Р1-1.5",
        results={**base_results, "scheme_count": 1, "scheme_threads": 4},
        params={},
        cable_snapshot={"actual_catalog_source": "builtin"},
        status="applicable",
    )
    two_schemes_two_threads = build_dedupe_key(
        object_type="pipe",
        cable_type="single_core",
        cable_source="builtin",
        cable_mark="ТТ Р1-1.5",
        results={**base_results, "scheme_count": 2, "scheme_threads": 2},
        params={},
        cable_snapshot={"actual_catalog_source": "builtin"},
        status="applicable",
    )
    assert one_scheme_four_threads != two_schemes_two_threads
