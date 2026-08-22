from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal

import pytest
from heatcalc_specification_core.bom.grouping import (
    MODE_MERGE_MATERIALS,
    MODE_SEPARATE_BY_OBJECT_TYPE,
    grouping_key,
    merge_items,
)


@dataclass(frozen=True)
class _Mode:
    value: str


def _row(
    *,
    section: str = "pipe",
    quantity: object = "1.25",
    provenance: object = "first",
    **identity: object,
) -> dict[str, object]:
    row: dict[str, object] = {
        "electrical_variant_id": "variant-1",
        "catalog_id": "catalog-1",
        "catalog_version": "v1",
        "object_type_section": section,
        "nomenclature_code": "N-1",
        "supply_unit": "м",
        "quantity": quantity,
        "name": "first row",
        "provenance": provenance,
    }
    row.update(identity)
    return row


def test_grouping_key_has_exact_identity_for_each_mode() -> None:
    fields = {
        "electrical_variant_id": "variant-1",
        "catalog_id": "catalog-1",
        "catalog_version": "v1",
        "object_type_section": "pipe",
        "nomenclature_code": "N-1",
        "supply_unit": "м",
    }

    assert grouping_key(MODE_SEPARATE_BY_OBJECT_TYPE, **fields) == (
        "variant-1",
        "catalog-1",
        "v1",
        "pipe",
        "N-1",
        "м",
    )
    assert grouping_key(_Mode(MODE_MERGE_MATERIALS), **fields) == (
        "variant-1",
        "catalog-1",
        "v1",
        "N-1",
        "м",
    )


@pytest.mark.parametrize(
    ("field", "value", "message"),
    [
        (
            "electrical_variant_id",
            None,
            "grouping identity field electrical_variant_id is required",
        ),
        ("catalog_id", False, "grouping identity field catalog_id is required"),
        ("catalog_version", "", "grouping identity field catalog_version must not be blank"),
        (
            "object_type_section",
            "  ",
            "grouping identity field object_type_section must not be blank",
        ),
        ("nomenclature_code", None, "grouping identity field nomenclature_code is required"),
        ("supply_unit", " ", "grouping identity field supply_unit must not be blank"),
    ],
)
def test_grouping_key_rejects_each_missing_identity(
    field: str,
    value: object,
    message: str,
) -> None:
    fields: dict[str, object] = {
        "electrical_variant_id": "variant-1",
        "catalog_id": "catalog-1",
        "catalog_version": "v1",
        "object_type_section": "pipe",
        "nomenclature_code": "N-1",
        "supply_unit": "м",
    }
    fields[field] = value

    with pytest.raises(ValueError, match=f"^{message}$"):
        grouping_key(MODE_SEPARATE_BY_OBJECT_TYPE, **fields)


def test_grouping_mode_is_fail_closed() -> None:
    with pytest.raises(
        ValueError,
        match=(
            "^unknown grouping mode: 'all_together'; expected one of "
            "\\['merge_materials', 'separate_by_object_type'\\]$"
        ),
    ):
        merge_items((_row(),), "all_together")


def test_merge_items_preserves_stable_first_row_and_combines_provenance() -> None:
    first = _row(quantity="1.25", provenance="first")
    second = _row(
        section="tank",
        quantity=2,
        provenance=["second-a", "second-b"],
        name="second row",
    )

    assert merge_items((first, second), MODE_SEPARATE_BY_OBJECT_TYPE) == [
        {**first, "quantity": Decimal("1.25"), "provenance": ["first"]},
        {**second, "quantity": Decimal("2"), "provenance": ["second-a", "second-b"]},
    ]
    assert merge_items((first, second), MODE_MERGE_MATERIALS) == [
        {**first, "quantity": Decimal("3.25"), "provenance": ["first", "second-a", "second-b"]}
    ]
    assert first["quantity"] == "1.25"
    assert first["provenance"] == "first"


def test_every_merge_identity_boundary_keeps_rows_separate() -> None:
    rows = (
        _row(quantity=1),
        _row(quantity=2, electrical_variant_id="variant-2"),
        _row(quantity=3, catalog_id="catalog-2"),
        _row(quantity=4, catalog_version="v2"),
        _row(quantity=5, nomenclature_code="N-2"),
        _row(quantity=6, supply_unit="шт."),
    )

    merged = merge_items(rows, MODE_MERGE_MATERIALS)

    assert [item["quantity"] for item in merged] == [
        Decimal("1"),
        Decimal("2"),
        Decimal("3"),
        Decimal("4"),
        Decimal("5"),
        Decimal("6"),
    ]


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        (Decimal("1.200"), Decimal("1.200")),
        (7, Decimal("7")),
        (1.25, Decimal("1.25")),
        (" 2.50 ", Decimal("2.50")),
    ],
)
def test_quantity_normalization_is_exact(value: object, expected: Decimal) -> None:
    assert merge_items((_row(quantity=value),), MODE_MERGE_MATERIALS)[0]["quantity"] == expected


@pytest.mark.parametrize(
    ("value", "message"),
    [
        (True, "boolean is not a valid quantity"),
        (None, "quantity is required"),
        (" ", "invalid quantity: ' '"),
        ("not-a-number", "invalid quantity: 'not-a-number'"),
    ],
)
def test_invalid_quantity_is_fail_closed(value: object, message: str) -> None:
    with pytest.raises(TypeError, match=f"^{message}$"):
        merge_items((_row(quantity=value),), MODE_MERGE_MATERIALS)


def test_provenance_is_only_created_when_a_contributor_has_it() -> None:
    first = _row(quantity=1)
    second = _row(quantity=2)
    first.pop("provenance")
    second.pop("provenance")

    assert merge_items((first, second), MODE_MERGE_MATERIALS) == [
        {**first, "quantity": Decimal("3")}
    ]
