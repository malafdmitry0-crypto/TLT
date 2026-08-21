from app.services.cable_snapshot import (
    build_cable_snapshot,
    compare_cable_snapshot,
    lookup_cable_row,
    lookup_cable_row_for_snapshot,
)


def test_build_cable_snapshot_hash_is_stable_for_key_order():
    row_a = {"model": "TLT-75", "power_per_meter": 75, "price_per_meter": 10}
    row_b = {"price_per_meter": 10, "power_per_meter": 75, "model": "TLT-75"}

    left = build_cable_snapshot(
        cable_type="self_regulating",
        cable_mark="TLT-75",
        cable_row=row_a,
        requested_catalog_source="commercial",
        cable_mark_source="auto",
        result_dict={"selected_cable": "TLT-75"},
    )
    right = build_cable_snapshot(
        cable_type="self_regulating",
        cable_mark="TLT-75",
        cable_row=row_b,
        requested_catalog_source="commercial",
        cable_mark_source="auto",
        result_dict={"selected_cable": "TLT-75"},
    )

    assert left is not None
    assert right is not None
    assert left["fingerprint"]["technical_hash"] == right["fingerprint"]["technical_hash"]
    assert left["fingerprint"]["commercial_hash"] == right["fingerprint"]["commercial_hash"]


def test_compare_cable_snapshot_reports_missing_and_changed():
    snapshot = build_cable_snapshot(
        cable_type="self_regulating",
        cable_mark="TLT-75",
        cable_row={"model": "TLT-75", "power_per_meter": 75, "price_per_meter": 10},
        requested_catalog_source="commercial",
        cable_mark_source="manual",
        result_dict={"selected_cable": "TLT-75"},
    )

    assert snapshot is not None
    assert compare_cable_snapshot(snapshot, None)["technical_status"] == "missing"

    status = compare_cable_snapshot(
        snapshot,
        {"model": "TLT-75", "power_per_meter": 80, "price_per_meter": 10},
    )
    assert status["technical_status"] == "changed"
    assert status["severity"] == "critical"
    assert "technical.power_per_meter" in status["changed_fields"]


def test_compare_cable_snapshot_ignores_catalog_source_metadata():
    snapshot = build_cable_snapshot(
        cable_type="self_regulating",
        cable_mark="TLT-75",
        cable_row={"model": "TLT-75", "power_per_meter": 75, "source": "extended"},
        requested_catalog_source="extended",
        cable_mark_source="manual",
        result_dict={"selected_cable": "TLT-75"},
    )

    assert snapshot is not None
    status = compare_cable_snapshot(
        snapshot,
        {"model": "TLT-75", "power_per_meter": 75, "source": "builtin"},
    )

    assert status["technical_status"] == "current"
    assert status["severity"] == "ok"


def test_compare_cable_snapshot_reads_technical_fields_from_params():
    snapshot = build_cable_snapshot(
        cable_type="self_regulating",
        cable_mark="TLT-75",
        cable_row={"model": "TLT-75", "power_per_meter": 75, "voltage": 220},
        requested_catalog_source="builtin",
        cable_mark_source="manual",
        result_dict={"selected_cable": "TLT-75"},
    )

    assert snapshot is not None
    status = compare_cable_snapshot(
        snapshot,
        {"model": "TLT-75", "power_per_meter": 75, "params": {"voltage": 220}},
    )

    assert status["technical_status"] == "current"
    assert status["severity"] == "ok"


def test_compare_cable_snapshot_normalizes_resistive_aliases():
    snapshot = build_cable_snapshot(
        cable_type="single_core",
        cable_mark="TT R1 8000",
        cable_row={
            "model": "TT R1 8000",
            "brand": "TT R1",
            "resistance_ohm_km": 8000,
            "conductor_section_mm2": 0.14,
            "diameter_mm": 3.52,
        },
        requested_catalog_source="builtin",
        cable_mark_source="manual",
        result_dict={"selected_cable": "TT R1 8000"},
    )

    assert snapshot is not None
    status = compare_cable_snapshot(
        snapshot,
        {
            "model": "TT R1 8000",
            "brand": "TT R1",
            "resistance_per_meter": 8,
            "conductor_cross_section": 0.14,
            "diameter_mm": 3.52,
        },
    )

    assert status["technical_status"] == "current"
    assert status["severity"] == "ok"


def test_compare_cable_snapshot_normalizes_resistive_fallback_resistance():
    snapshot = build_cable_snapshot(
        cable_type="three_core",
        cable_mark="ТТ Р3 х 4,0-1,0",
        cable_row={
            "model": "ТТ Р3 х 4,0-1,0",
            "brand": "ТТ Р3",
            "nominal_size_mm": "23,60 х 10,40",
        },
        requested_catalog_source="builtin",
        cable_mark_source="manual",
        result_dict={"selected_cable": "ТТ Р3 х 4,0-1,0"},
    )

    assert snapshot is not None
    status = compare_cable_snapshot(
        snapshot,
        {
            "model": "ТТ Р3 х 4,0-1,0",
            "brand": "ТТ Р3",
            "resistance_per_meter": 0.004375,
            "params": {
                "conductor_section_mm2": 4,
                "nominal_size_mm": "23,60 х 10,40",
            },
        },
    )

    assert status["technical_status"] == "current"
    assert status["severity"] == "ok"


def test_lookup_cable_row_for_snapshot_prefers_full_technical_match():
    snapshot = build_cable_snapshot(
        cable_type="self_regulating",
        cable_mark="TLT-75",
        cable_row={"model": "TLT-75", "power_per_meter": 75, "max_temperature": 120},
        requested_catalog_source="builtin",
        cable_mark_source="manual",
        result_dict={"selected_cable": "TLT-75"},
    )

    row = lookup_cable_row_for_snapshot(
        [
            {"model": "TLT-75", "power_per_meter": 80, "max_temperature": 120},
            {"model": "TLT-75", "power_per_meter": 75, "max_temperature": 120},
        ],
        "TLT-75",
        "self_regulating",
        snapshot,
    )

    assert row == {"model": "TLT-75", "power_per_meter": 75, "max_temperature": 120}


def test_lookup_tt_mark_ignores_material_suffix():
    row = lookup_cable_row(
        [{"model": "30TTB2", "nominal_power": 30}],
        "30TTB2-СР",
        "self_regulating_tt",
    )

    assert row == {"model": "30TTB2", "nominal_power": 30}
