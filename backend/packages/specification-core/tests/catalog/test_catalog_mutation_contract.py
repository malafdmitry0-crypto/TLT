from __future__ import annotations

from collections.abc import Mapping
from dataclasses import replace

import pytest
from heatcalc_specification_core.catalog import (
    CatalogCategory,
    CatalogContentItem,
    validate_catalog_content,
)
from heatcalc_specification_core.catalog.box_validation import validate_box_matrix_authority
from heatcalc_specification_core.catalog.validation import REQUIRED_MARKS
from heatcalc_specification_core.json_types import JsonValue, json_object


def _item(
    item_key: str,
    category: CatalogCategory,
    mark: str,
    *,
    applicability: Mapping[str, object] | None = None,
    package: Mapping[str, object] | None = None,
    formula: Mapping[str, object] | None = None,
    source_ref: str = "approval:SPEC-OWNER-MATERIALS/mutation-test",
) -> CatalogContentItem:
    return CatalogContentItem(
        item_key=item_key,
        category=category,
        name=f"Name {item_key}",
        mark=mark,
        nomenclature_code=f"CODE-{item_key}",
        supply_unit="шт.",
        applicability=json_object(applicability or {}),
        package_parameters=json_object(package or {}),
        formula_parameters=json_object(formula or {}),
        source_ref=source_ref,
    )


def _box_conditions(*, discriminator: bool = False) -> dict[str, object]:
    owner = "SPEC-OWNER-EX-RGR/mutation-test"
    conditions: dict[str, object] = {
        key: _not_applicable(f"{owner}/{key}")
        for key in (
            "d_ge_57",
            "K1i",
            "K2i",
            "Kiu",
            "L_sec_ge_L_K2i",
            "N_sec_ge_3",
            "Ex",
            "R_gr",
        )
    }
    if discriminator:
        conditions["d_ge_57"] = _match(value=True)
    return conditions


def _match(*, value: object) -> dict[str, object]:
    return {"mode": "match", "operator": "eq", "value": value}


def _not_applicable(decision_ref: str) -> dict[str, object]:
    return {"mode": "not_applicable", "decision_ref": decision_ref}


def _complete_catalog() -> list[CatalogContentItem]:
    items = [
        _item(f"cable-{index}", CatalogCategory.CABLE, mark)
        for index, mark in enumerate(sorted(REQUIRED_MARKS[CatalogCategory.CABLE]))
    ]
    for index, mark in enumerate(sorted(REQUIRED_MARKS[CatalogCategory.CONNECTION_KIT])):
        items.append(
            _item(
                f"connection-{index}",
                CatalogCategory.CONNECTION_KIT,
                mark,
                applicability={"temperature_group": "LOW" if index < 2 else "MEDIUM_HIGH"},
                package={"sections_per_kit": str(index + 1)},
            )
        )
    for index, mark in enumerate(sorted(REQUIRED_MARKS[CatalogCategory.REPAIR_KIT])):
        items.append(
            _item(
                f"repair-{index}",
                CatalogCategory.REPAIR_KIT,
                mark,
                applicability={"temperature_group": "LOW" if index == 0 else "MEDIUM_HIGH"},
                package={"cable_length_per_kit_m": "150"},
            )
        )
    items.extend(
        (
            _item(
                "sealant",
                CatalogCategory.SEALANT,
                "sealant",
                package={"kits_per_sealant_unit": "7"},
            ),
            _item(
                "fiberglass-low",
                CatalogCategory.FIBERGLASS_TAPE,
                "fiberglass-low",
                applicability={"temperature_group": "LOW"},
                package={"reel_length_m": "30"},
            ),
            _item(
                "fiberglass-high",
                CatalogCategory.FIBERGLASS_TAPE,
                "fiberglass-high",
                applicability={"temperature_group": "MEDIUM_HIGH"},
                package={"reel_length_m": "30"},
            ),
            _item(
                "aluminium",
                CatalogCategory.ALUMINIUM_TAPE,
                "aluminium",
                package={"reel_length_m": "50"},
                formula={"consumption_m_per_cable_m": "1"},
            ),
        )
    )
    for index, mark in enumerate(sorted(REQUIRED_MARKS[CatalogCategory.BOX])):
        items.append(
            _item(
                f"box-{index}",
                CatalogCategory.BOX,
                mark,
                applicability=_box_conditions(discriminator=index == 0),
                formula={
                    "section_divider": str(index + 1),
                    "rounding_mode": "up" if index % 2 == 0 else "down",
                    "min_quantity": "1",
                },
            )
        )
    return items


def _issues_for(
    result_items: list[CatalogContentItem],
    item_key: str,
) -> list[dict[str, JsonValue]]:
    return [
        issue.to_dict()
        for issue in validate_catalog_content(result_items).issues
        if issue.item_key == item_key
    ]


def test_duplicate_identities_report_exact_second_row() -> None:
    items = _complete_catalog()
    items[1] = replace(
        items[1],
        item_key=items[0].item_key,
        nomenclature_code=items[0].nomenclature_code,
    )

    assert _issues_for(items, items[0].item_key) == [
        {
            "code": "SPEC_ACCESSORY_CATALOG_INCOMPLETE",
            "reason": "duplicate_item_key",
            "item_key": items[0].item_key,
            "category": "cable",
        },
        {
            "code": "SPEC_ACCESSORY_CATALOG_INCOMPLETE",
            "reason": "duplicate_nomenclature_code",
            "item_key": items[0].item_key,
            "category": "cable",
        },
    ]


def test_material_identity_and_authority_are_all_required() -> None:
    items = _complete_catalog()
    index = next(i for i, item in enumerate(items) if item.category is CatalogCategory.SEALANT)
    items[index] = replace(
        items[index],
        nomenclature_code=" ",
        supply_unit="",
        source_ref="provisional synthetic fixture",
    )

    assert _issues_for(items, "sealant") == [
        {
            "code": "SPEC_ACCESSORY_CATALOG_INCOMPLETE",
            "reason": "untrusted_source_ref",
            "item_key": "sealant",
            "category": "sealant",
        },
        {
            "code": "SPEC_ACCESSORY_CATALOG_ITEM_MISSING",
            "reason": "material_nomenclature_code_missing",
            "item_key": "sealant",
            "category": "sealant",
        },
        {
            "code": "SPEC_ACCESSORY_CATALOG_ITEM_MISSING",
            "reason": "material_supply_unit_missing",
            "item_key": "sealant",
            "category": "sealant",
        },
        {
            "code": "SPEC_ACCESSORY_CATALOG_ITEM_MISSING",
            "reason": "material_approval_reference_missing",
            "item_key": "sealant",
            "category": "sealant",
            "details": {"required_pattern": "approval:SPEC-OWNER-MATERIALS/<ref>"},
        },
    ]


@pytest.mark.parametrize(
    ("category", "parameter_group", "key"),
    [
        (CatalogCategory.CONNECTION_KIT, "package_parameters", "sections_per_kit"),
        (CatalogCategory.REPAIR_KIT, "package_parameters", "cable_length_per_kit_m"),
        (CatalogCategory.SEALANT, "package_parameters", "kits_per_sealant_unit"),
        (CatalogCategory.FIBERGLASS_TAPE, "package_parameters", "reel_length_m"),
        (CatalogCategory.ALUMINIUM_TAPE, "formula_parameters", "consumption_m_per_cable_m"),
    ],
)
def test_each_formula_parameter_is_positive_and_finite(
    category: CatalogCategory,
    parameter_group: str,
    key: str,
) -> None:
    items = _complete_catalog()
    index = next(i for i, item in enumerate(items) if item.category is category)
    changes = {parameter_group: {key: "NaN"}}
    items[index] = replace(items[index], **changes)  # type: ignore[arg-type]

    assert _issues_for(items, items[index].item_key) == [
        {
            "code": "SPEC_FORMULA_INPUT_INVALID",
            "reason": f"invalid_or_missing_{key}",
            "item_key": items[index].item_key,
            "category": category.value,
            "details": {"parameter_group": parameter_group},
        }
    ]


def test_temperature_group_failures_are_exact() -> None:
    items = _complete_catalog()
    connection = next(
        i for i, item in enumerate(items) if item.category is CatalogCategory.CONNECTION_KIT
    )
    items[connection] = replace(items[connection], applicability={"temperature_group": "HIGH"})

    assert _issues_for(items, items[connection].item_key) == [
        {
            "code": "SPEC_ACCESSORY_CATALOG_INCOMPLETE",
            "reason": "temperature_group_missing_or_invalid",
            "item_key": items[connection].item_key,
            "category": "connection_kit",
        }
    ]


def test_missing_global_catalog_slices_report_exact_details() -> None:
    items = _complete_catalog()
    missing_cable = sorted(REQUIRED_MARKS[CatalogCategory.CABLE])[0]
    items = [
        item
        for item in items
        if item.mark != missing_cable
        and item.category is not CatalogCategory.SEALANT
        and item.category is not CatalogCategory.ALUMINIUM_TAPE
        and not (
            item.category is CatalogCategory.FIBERGLASS_TAPE
            and item.applicability.get("temperature_group") == "LOW"
        )
    ]

    global_issues = [issue.to_dict() for issue in validate_catalog_content(items).issues]

    assert {
        (issue["code"], issue["reason"]) for issue in global_issues if "item_key" not in issue
    } == {
        ("SPEC_CABLE_NOMENCLATURE_MISSING", "required_catalog_rows_missing"),
        ("SPEC_ACCESSORY_CATALOG_ITEM_MISSING", "sealant_catalog_missing"),
        ("SPEC_ACCESSORY_CATALOG_ITEM_MISSING", "aluminium_tape_catalog_missing"),
        (
            "SPEC_ACCESSORY_CATALOG_ITEM_MISSING",
            "fiberglass_temperature_groups_incomplete",
        ),
    }
    cable_issue = next(
        issue for issue in global_issues if issue["reason"] == "required_catalog_rows_missing"
    )
    assert cable_issue["details"] == {
        "category": "cable",
        "missing_marks": [missing_cable],
    }
    fiberglass = next(
        issue
        for issue in global_issues
        if issue["reason"] == "fiberglass_temperature_groups_incomplete"
    )
    assert fiberglass["details"] == {"missing_groups": ["LOW"]}


def test_box_validation_reports_each_invalid_decision_field() -> None:
    items = _complete_catalog()
    index = next(i for i, item in enumerate(items) if item.item_key == "box-1")
    applicability = dict(items[index].applicability)
    del applicability["K1i"]
    applicability["Ex"] = True
    del applicability["R_gr"]
    items[index] = replace(
        items[index],
        applicability=applicability,
        formula_parameters={
            "section_divider": "1.5",
            "rounding_mode": "sideways",
            "min_quantity": "2.5",
        },
    )

    issues = _issues_for(items, "box-1")
    assert {issue["reason"] for issue in issues} == {
        "box_condition_K1i_missing_or_invalid",
        "condition_must_be_discriminated_object",
        "authoritative_R_gr_condition_missing",
        "box_min_quantity_must_be_integer",
        "box_section_divider_must_be_integer",
        "box_rounding_mode_invalid",
    }
    assert all(issue["item_key"] == "box-1" and issue["category"] == "box" for issue in issues)
    assert {issue["reason"]: issue["code"] for issue in issues} == {
        "box_condition_K1i_missing_or_invalid": "SPEC_ACCESSORY_CATALOG_INCOMPLETE",
        "condition_must_be_discriminated_object": "SPEC_BOX_EX_RGR_MATRIX_MISSING",
        "authoritative_R_gr_condition_missing": "SPEC_BOX_EX_RGR_MATRIX_MISSING",
        "box_min_quantity_must_be_integer": "SPEC_FORMULA_INPUT_INVALID",
        "box_section_divider_must_be_integer": "SPEC_FORMULA_INPUT_INVALID",
        "box_rounding_mode_invalid": "SPEC_FORMULA_INPUT_INVALID",
    }
    condition_issue = next(
        issue for issue in issues if issue["reason"] == "condition_must_be_discriminated_object"
    )
    assert condition_issue["details"] == {"got_type": "bool"}


def test_box_matrix_authority_has_exact_duplicate_and_owner_failures() -> None:
    first = _item(
        "box-a",
        CatalogCategory.BOX,
        "BOX-A",
        applicability=_box_conditions(),
        formula={"section_divider": "1", "rounding_mode": "up", "min_quantity": "1"},
    )
    duplicate = replace(first, item_key="box-b", nomenclature_code="CODE-box-b")

    issues = [issue.to_dict() for issue in validate_box_matrix_authority((first, duplicate))]

    assert issues == [
        {
            "code": "SPEC_BOX_EX_RGR_MATRIX_MISSING",
            "reason": "box_matrix_silently_duplicated_conditions",
            "details": {
                "duplicate_groups": [
                    {
                        "fingerprint": (
                            "d_ge_57=na:SPEC-OWNER-EX-RGR/mutation-test/d_ge_57|"
                            "K1i=na:SPEC-OWNER-EX-RGR/mutation-test/K1i|"
                            "K2i=na:SPEC-OWNER-EX-RGR/mutation-test/K2i|"
                            "Kiu=na:SPEC-OWNER-EX-RGR/mutation-test/Kiu|"
                            "L_sec_ge_L_K2i=na:SPEC-OWNER-EX-RGR/mutation-test/L_sec_ge_L_K2i|"
                            "N_sec_ge_3=na:SPEC-OWNER-EX-RGR/mutation-test/N_sec_ge_3|"
                            "Ex=na:SPEC-OWNER-EX-RGR/mutation-test/Ex|"
                            "R_gr=na:SPEC-OWNER-EX-RGR/mutation-test/R_gr|"
                            "section_divider=1|rounding_mode=up|min_quantity=1"
                        ),
                        "item_keys": ["box-a", "box-b"],
                    }
                ]
            },
        },
        {
            "code": "SPEC_BOX_EX_RGR_MATRIX_MISSING",
            "reason": "all_boxes_ex_rgr_not_applicable_without_discrimination",
            "details": {"box_count": 2, "owner_decision": "SPEC-OWNER-EX-RGR"},
        },
    ]


def test_box_matrix_all_unresolved_is_rejected_but_empty_is_valid() -> None:
    applicability = {key: {"mode": "unresolved"} for key in _box_conditions()}
    box = _item(
        "box-unresolved",
        CatalogCategory.BOX,
        "BOX-U",
        applicability=applicability,
        formula={"section_divider": "1", "rounding_mode": "up", "min_quantity": "1"},
    )

    assert validate_box_matrix_authority(()) == []
    assert [issue.to_dict() for issue in validate_box_matrix_authority((box,))] == [
        {
            "code": "SPEC_BOX_EX_RGR_MATRIX_MISSING",
            "reason": "all_boxes_ex_rgr_unresolved",
            "details": {"box_count": 1},
        }
    ]


def test_box_matrix_match_value_is_part_of_the_authority_fingerprint() -> None:
    first_conditions = _box_conditions()
    first_conditions["d_ge_57"] = _match(value=True)
    second_conditions = _box_conditions()
    second_conditions["d_ge_57"] = _match(value=False)
    formula = {"section_divider": "1", "rounding_mode": "up", "min_quantity": "1"}
    first = _item(
        "box-true",
        CatalogCategory.BOX,
        "BOX-T",
        applicability=first_conditions,
        formula=formula,
    )
    second = _item(
        "box-false",
        CatalogCategory.BOX,
        "BOX-F",
        applicability=second_conditions,
        formula=formula,
    )

    assert validate_box_matrix_authority((first, second)) == []
