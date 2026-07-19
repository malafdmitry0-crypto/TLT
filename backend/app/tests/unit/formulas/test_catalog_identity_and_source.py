"""PDL-ER-33/34/35 unit coverage for catalog identity and PDF-first mapping."""

from app.formulas.specification.catalog_identity import (
    accessory_identity,
    cable_identity_from_result,
    resolve_accessory_rule,
    temperature_group_from_result,
)
from app.formulas.specification.source_mapping import (
    box_ex_rgr_matrix_registered,
    is_rule_approved,
)
from app.reference_data.loader import list_spec_accessory_rules


def test_all_accessory_rules_have_explicit_identity():
    for rule in list_spec_accessory_rules():
        identity = accessory_identity(rule)
        assert identity is not None, rule.get("rule")
        assert identity["mark"]
        assert identity["nomenclature_code"]


def test_resolve_accessory_by_stable_rule_key_not_row_order():
    resolved, err = resolve_accessory_rule("connector_kit_low_1")
    assert err is None
    assert resolved is not None
    assert resolved["nomenclature_code"] == "001-004-001"
    assert resolved["mark"] == "КСН-1"


def test_temperature_group_requires_explicit_fields():
    assert temperature_group_from_result({"cable_mark": "25ТТН2-СТ"}) is None
    assert (
        temperature_group_from_result(
            {"cable_mark": "25ТТН2-СТ", "selected_cable": "25ТТН2", "temperature_group": "low"}
        )
        == "low"
    )
    assert (
        temperature_group_from_result({"selected_cable": "45ТТХ2", "series": "ТТХ"}) == "high"
    )


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


def test_box_matrix_registered_with_seeds():
    from app.formulas.specification.source_mapping import clear_box_matrix_cache

    clear_box_matrix_cache()
    assert box_ex_rgr_matrix_registered() is True
    # box_Nk rules still require mapping approval; matrix alone is not enough.
    assert is_rule_approved("connector_kit_low_1") is True


def test_pdf_approved_kit_rule_emits_without_matrix():
    assert is_rule_approved("connector_kit_low_1") is True
    assert is_rule_approved("heating_cable_order_length") is True
