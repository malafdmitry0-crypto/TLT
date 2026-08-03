"""Lifecycle classification for saved canonical TT result snapshots."""

from copy import deepcopy

from app.electrical_result_status import (
    electrical_result_status,
    electrical_result_with_lifecycle,
    is_successful_electrical_result,
)
from app.formulas.electrical.tt_contract import (
    ELECTRICAL_TT_FORMULA_FINGERPRINT,
    ELECTRICAL_TT_FORMULA_VERSION,
)


def _current_result() -> dict:
    return {
        "cable_type": "self_regulating_tt",
        "cable_mark": "30ТТВ2-СР",
        "voltage": 230,
        "resolved_inputs": {
            "nominal_voltage_v": 230,
            "max_section_start_current_a": 13.065,
        },
        "catalogs": {
            kind: {"status": "active", "source_checksum": f"sha256:{kind}"}
            for kind in ("power", "section", "bom")
        },
        "provenance": {
            "formula_version": ELECTRICAL_TT_FORMULA_VERSION,
            "formula_fingerprint": ELECTRICAL_TT_FORMULA_FINGERPRINT,
        },
    }


def test_current_tt_snapshot_is_successful():
    result = _current_result()

    assert is_successful_electrical_result("30ТТВ2-СР", result) is True
    assert electrical_result_status("30ТТВ2-СР", result) == "success"
    assert electrical_result_with_lifecycle("30ТТВ2-СР", result) == result


def test_legacy_220_tt_snapshot_is_readable_but_stale():
    result = _current_result()
    result["voltage"] = 220
    result["resolved_inputs"]["nominal_voltage_v"] = 220

    visible = electrical_result_with_lifecycle("30ТТВ2-СР", result)

    assert visible is not None
    assert visible["stale"] is True
    assert visible["stale_reason"] == "legacy_or_missing_nominal_voltage"
    assert electrical_result_status("30ТТВ2-СР", result) == "stale"
    assert is_successful_electrical_result("30ТТВ2-СР", result) is False
    assert result.get("stale") is None


def test_changed_formula_and_missing_catalog_fingerprint_are_stale():
    changed_formula = _current_result()
    changed_formula["provenance"]["formula_fingerprint"] = "sha256:old"
    assert (
        electrical_result_with_lifecycle("30ТТВ2-СР", changed_formula)["stale_reason"]
        == "formula_version_changed"
    )

    missing_catalog = deepcopy(_current_result())
    missing_catalog["catalogs"]["section"] = {}
    assert (
        electrical_result_with_lifecycle("30ТТВ2-СР", missing_catalog)["stale_reason"]
        == "section_catalog_fingerprint_missing"
    )


def test_typed_formula_error_remains_error_not_derived_stale():
    result = {
        "cable_type": "self_regulating_tt",
        "error_code": "ELECTRICAL_CABLE_POWER_INSUFFICIENT",
        "category": "formula",
        "message": "Недостаточно мощности",
    }

    assert electrical_result_status(None, result) == "failed"
    assert electrical_result_with_lifecycle(None, result) == result


def test_untyped_legacy_payload_keeps_read_compatibility():
    result = {"selected_cable": "ТЛТ-25", "order_cable_length": 10}

    assert electrical_result_status("ТЛТ-25", result) == "success"
