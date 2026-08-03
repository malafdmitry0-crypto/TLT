"""PDL-ER-33 catalog identity helpers (no legacy source_mapping / static accessories)."""

import inspect

import app.formulas.specification.catalog_identity as catalog_identity_module
from app.formulas.specification.catalog_identity import (
    cable_identity_from_result,
    resolve_accessory_rule,
    temperature_group_from_result,
)
from app.reference_data.loader import get_electrical_tt_bom_entry


def test_legacy_static_accessory_lookup_is_fail_closed():
    resolved, err = resolve_accessory_rule("connector_kit_low_1")
    assert resolved is None
    assert err == "CATALOG_RULE_NOT_FOUND"


def test_catalog_identity_boundary_has_no_static_reference_data_dependency():
    source = inspect.getsource(catalog_identity_module)
    assert "app.reference_data" not in source
    assert "list_tt_cables" not in source
    assert "list_tlt_cables" not in source
    assert "list_spec_accessory_rules" not in source


def test_temperature_group_requires_explicit_fields():
    assert temperature_group_from_result({"cable_mark": "25ТТН2-СТ"}) is None
    assert (
        temperature_group_from_result(
            {"cable_mark": "25ТТН2-СТ", "selected_cable": "25ТТН2", "temperature_group": "low"}
        )
        == "low"
    )
    assert temperature_group_from_result({"selected_cable": "45ТТХ2", "series": "ТТХ"}) is None


def test_cable_identity_uses_explicit_nomenclature():
    identity = cable_identity_from_result(
        {
            "cable_mark": "25ТТН2-СТ",
            "selected_cable": "25ТТН2",
            "nomenclature_code": "CAB-25-TTN",
            "temperature_group": "low",
        }
    )
    assert identity is not None
    assert identity["mark"] == "25ТТН2-СТ"
    assert identity["nomenclature_code"] == "CAB-25-TTN"


def test_tt_cable_identity_uses_exact_bom_and_ignores_result_article():
    bom = get_electrical_tt_bom_entry("30ТТВ2-СР")
    assert bom is not None
    identity = cable_identity_from_result(
        {
            "cable_type": "self_regulating_tt",
            "cable_mark": "30ТТВ2-СР",
            "selected_cable": "30ТТВ2",
            "nomenclature_code": "WRONG-FROM-RESULT",
            "series": "ТТВ",
            "catalogs": {
                "power": {
                    "status": "active",
                    "version": "test-power-v1",
                    "source_checksum": "sha256:test-power",
                },
                "section": {
                    "status": "registered",
                    "version": "test-section-v1",
                    "source_checksum": "sha256:test-section",
                },
                "bom": {
                    **bom["catalog"],
                    "row": {key: value for key, value in bom.items() if key != "catalog"},
                },
            },
        }
    )
    assert identity is not None
    assert identity["nomenclature_code"] == "001-002-002"
    assert identity["catalog_version"] == "selfreg-spec-2026-05-29"
    assert identity["catalog_checksum"].startswith("sha256:")


def test_tt_cable_identity_uses_saved_active_db_bom_version():
    bom = get_electrical_tt_bom_entry("30ТТВ2-СР")
    assert bom is not None
    saved_row = {
        **{key: value for key, value in bom.items() if key != "catalog"},
        "nomenclature_code": "DB-BOM-30-TTV2-SR",
    }
    identity = cable_identity_from_result(
        {
            "cable_type": "self_regulating_tt",
            "cable_mark": "30ТТВ2-СР",
            "selected_cable": "30ТТВ2",
            "nomenclature_code": "OUTDATED-TOP-LEVEL-CODE",
            "series": "ТТВ",
            "catalogs": {
                "power": {
                    "status": "active",
                    "version": "db-power-v2",
                    "source_checksum": "sha256:db-power",
                },
                "section": {
                    "status": "active",
                    "version": "db-section-v2",
                    "source_checksum": "sha256:db-section",
                },
                "bom": {
                    "status": "active",
                    "version": "db-bom-v2",
                    "source": "approved-db-bom.xlsx",
                    "source_checksum": "sha256:db-bom",
                    "schema_version": 2,
                    "row": saved_row,
                },
            },
        }
    )

    assert identity is not None
    assert identity["nomenclature_code"] == "DB-BOM-30-TTV2-SR"
    assert identity["catalog_version"] == "db-bom-v2"
    assert identity["catalog_source"] == "approved-db-bom.xlsx"


def test_tt_cable_identity_accepts_exact_saved_active_row_without_static_lookup():
    identity = cable_identity_from_result(
        {
            "cable_type": "self_regulating_tt",
            "cable_mark": "30ТТВ2-СТ",
            "selected_cable": "30ТТВ2",
            "nomenclature_code": "OUTDATED-TOP-LEVEL-CODE",
            "catalogs": {
                "power": {"status": "active", "payload_checksum": "sha256:power"},
                "section": {
                    "status": "active",
                    "payload_checksum": "sha256:section",
                },
                "bom": {
                    "status": "active",
                    "payload_checksum": "sha256:bom",
                    "row": {
                        "full_mark": "30ТТВ2-СТ",
                        "nomenclature_code": "DB-BOM-CODE",
                    },
                },
            },
        }
    )
    assert identity is not None
    assert identity["mark"] == "30ТТВ2-СТ"
    assert identity["nomenclature_code"] == "DB-BOM-CODE"
