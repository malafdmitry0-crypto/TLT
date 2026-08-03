"""Unit tests for SPEC-CANON-07 pure BOM grouping keys and merge."""

from __future__ import annotations

from decimal import Decimal

import pytest

from app.formulas.specification.grouping import (
    MODE_MERGE_MATERIALS,
    MODE_SEPARATE_BY_OBJECT_TYPE,
    grouping_key,
    merge_items,
)

ER_A = "er-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
ER_B = "er-bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
CATALOG = "cat-11111111-1111-1111-1111-111111111111"
VERSION_V1 = "2026.07.01"
VERSION_V2 = "2026.08.01"
CODE_TAPE = "001-003-001"
CODE_KIT = "001-004-001"
UNIT_M = "м"
UNIT_PCS = "шт."
SECTION_PIPE = "pipe"
SECTION_TANK = "tank"


def _item(
    *,
    electrical_variant_id: str = ER_A,
    catalog_id: str = CATALOG,
    catalog_version: str = VERSION_V1,
    object_type_section: str = SECTION_PIPE,
    nomenclature_code: str = CODE_TAPE,
    supply_unit: str = UNIT_M,
    quantity: Decimal | int | str = Decimal("1"),
    provenance: list | None = None,
    **extra,
) -> dict:
    row = {
        "electrical_variant_id": electrical_variant_id,
        "catalog_id": catalog_id,
        "catalog_version": catalog_version,
        "object_type_section": object_type_section,
        "nomenclature_code": nomenclature_code,
        "supply_unit": supply_unit,
        "quantity": quantity,
        "mark": extra.pop("mark", "TAPE-1"),
        "name": extra.pop("name", "Алюминиевая лента"),
    }
    if provenance is not None:
        row["provenance"] = provenance
    row.update(extra)
    return row


class TestGroupingKey:
    def test_separate_by_object_type_includes_section(self) -> None:
        key = grouping_key(
            MODE_SEPARATE_BY_OBJECT_TYPE,
            electrical_variant_id=ER_A,
            catalog_id=CATALOG,
            catalog_version=VERSION_V1,
            object_type_section=SECTION_PIPE,
            nomenclature_code=CODE_TAPE,
            supply_unit=UNIT_M,
        )
        assert key == (
            ER_A,
            CATALOG,
            VERSION_V1,
            SECTION_PIPE,
            CODE_TAPE,
            UNIT_M,
        )

    def test_merge_materials_excludes_section(self) -> None:
        key = grouping_key(
            MODE_MERGE_MATERIALS,
            electrical_variant_id=ER_A,
            catalog_id=CATALOG,
            catalog_version=VERSION_V1,
            object_type_section=SECTION_PIPE,
            nomenclature_code=CODE_TAPE,
            supply_unit=UNIT_M,
        )
        assert key == (
            ER_A,
            CATALOG,
            VERSION_V1,
            CODE_TAPE,
            UNIT_M,
        )
        # Section is not part of the key — same materials from different
        # object types share this key under merge_materials.
        other = grouping_key(
            MODE_MERGE_MATERIALS,
            electrical_variant_id=ER_A,
            catalog_id=CATALOG,
            catalog_version=VERSION_V1,
            object_type_section=SECTION_TANK,
            nomenclature_code=CODE_TAPE,
            supply_unit=UNIT_M,
        )
        assert key == other

    def test_separate_keys_differ_by_object_type(self) -> None:
        pipe = grouping_key(
            MODE_SEPARATE_BY_OBJECT_TYPE,
            electrical_variant_id=ER_A,
            catalog_id=CATALOG,
            catalog_version=VERSION_V1,
            object_type_section=SECTION_PIPE,
            nomenclature_code=CODE_TAPE,
            supply_unit=UNIT_M,
        )
        tank = grouping_key(
            MODE_SEPARATE_BY_OBJECT_TYPE,
            electrical_variant_id=ER_A,
            catalog_id=CATALOG,
            catalog_version=VERSION_V1,
            object_type_section=SECTION_TANK,
            nomenclature_code=CODE_TAPE,
            supply_unit=UNIT_M,
        )
        assert pipe != tank

    def test_unknown_mode_raises(self) -> None:
        with pytest.raises(ValueError, match="unknown grouping mode"):
            grouping_key(
                "by_name",
                electrical_variant_id=ER_A,
                catalog_id=CATALOG,
                catalog_version=VERSION_V1,
                object_type_section=SECTION_PIPE,
                nomenclature_code=CODE_TAPE,
                supply_unit=UNIT_M,
            )

    def test_enum_like_mode_accepted(self) -> None:
        class FakeMode:
            value = MODE_MERGE_MATERIALS

        key = grouping_key(
            FakeMode(),
            electrical_variant_id=ER_A,
            catalog_id=CATALOG,
            catalog_version=VERSION_V1,
            object_type_section=SECTION_PIPE,
            nomenclature_code=CODE_TAPE,
            supply_unit=UNIT_M,
        )
        assert key == (ER_A, CATALOG, VERSION_V1, CODE_TAPE, UNIT_M)


class TestMergeItemsSeparateByObjectType:
    def test_same_code_two_object_types_stay_separate(self) -> None:
        items = [
            _item(
                object_type_section=SECTION_PIPE,
                quantity=Decimal("3.5"),
                provenance=[{"object_id": "o1"}],
            ),
            _item(
                object_type_section=SECTION_TANK,
                quantity=Decimal("1.5"),
                provenance=[{"object_id": "o2"}],
            ),
        ]
        merged = merge_items(items, MODE_SEPARATE_BY_OBJECT_TYPE)
        assert len(merged) == 2
        assert merged[0]["object_type_section"] == SECTION_PIPE
        assert merged[0]["quantity"] == Decimal("3.5")
        assert merged[1]["object_type_section"] == SECTION_TANK
        assert merged[1]["quantity"] == Decimal("1.5")


class TestMergeItemsMergeMaterials:
    def test_same_code_merges_across_object_types(self) -> None:
        items = [
            _item(
                object_type_section=SECTION_PIPE,
                quantity=Decimal("3.5"),
                provenance=[{"object_id": "o1"}],
            ),
            _item(
                object_type_section=SECTION_TANK,
                quantity=Decimal("1.5"),
                provenance=[{"object_id": "o2"}],
            ),
        ]
        merged = merge_items(items, MODE_MERGE_MATERIALS)
        assert len(merged) == 1
        assert merged[0]["quantity"] == Decimal("5.0")
        assert merged[0]["nomenclature_code"] == CODE_TAPE
        assert merged[0]["provenance"] == [
            {"object_id": "o1"},
            {"object_id": "o2"},
        ]


class TestNeverMergeDifferentIdentity:
    def test_different_catalog_version_never_merges(self) -> None:
        items = [
            _item(catalog_version=VERSION_V1, quantity=Decimal("2")),
            _item(catalog_version=VERSION_V2, quantity=Decimal("3")),
        ]
        for mode in (MODE_SEPARATE_BY_OBJECT_TYPE, MODE_MERGE_MATERIALS):
            merged = merge_items(items, mode)
            assert len(merged) == 2, mode
            versions = {row["catalog_version"] for row in merged}
            assert versions == {VERSION_V1, VERSION_V2}
            quantities = sorted(row["quantity"] for row in merged)
            assert quantities == [Decimal("2"), Decimal("3")]

    def test_different_er_never_merges(self) -> None:
        items = [
            _item(electrical_variant_id=ER_A, quantity=Decimal("10")),
            _item(electrical_variant_id=ER_B, quantity=Decimal("20")),
        ]
        for mode in (MODE_SEPARATE_BY_OBJECT_TYPE, MODE_MERGE_MATERIALS):
            merged = merge_items(items, mode)
            assert len(merged) == 2, mode
            ers = {row["electrical_variant_id"] for row in merged}
            assert ers == {ER_A, ER_B}

    def test_different_nomenclature_code_never_merges(self) -> None:
        items = [
            _item(nomenclature_code=CODE_TAPE, quantity=Decimal("1")),
            _item(nomenclature_code=CODE_KIT, supply_unit=UNIT_PCS, quantity=Decimal("2")),
        ]
        merged = merge_items(items, MODE_MERGE_MATERIALS)
        assert len(merged) == 2

    def test_different_supply_unit_never_merges(self) -> None:
        items = [
            _item(supply_unit=UNIT_M, quantity=Decimal("1")),
            _item(supply_unit=UNIT_PCS, quantity=Decimal("2")),
        ]
        merged = merge_items(items, MODE_MERGE_MATERIALS)
        assert len(merged) == 2


class TestQuantityDecimalSum:
    def test_quantity_decimal_sum_same_key(self) -> None:
        items = [
            _item(quantity=Decimal("1.25")),
            _item(quantity=Decimal("2.75")),
            _item(quantity="0.5"),  # string coerce
            _item(quantity=1),  # int coerce
        ]
        merged = merge_items(items, MODE_MERGE_MATERIALS)
        assert len(merged) == 1
        assert isinstance(merged[0]["quantity"], Decimal)
        assert merged[0]["quantity"] == Decimal("5.50")

    def test_same_key_within_separate_mode_sums(self) -> None:
        items = [
            _item(object_type_section=SECTION_PIPE, quantity=Decimal("4")),
            _item(object_type_section=SECTION_PIPE, quantity=Decimal("6")),
        ]
        merged = merge_items(items, MODE_SEPARATE_BY_OBJECT_TYPE)
        assert len(merged) == 1
        assert merged[0]["quantity"] == Decimal("10")

    def test_provenance_concatenated_in_order(self) -> None:
        items = [
            _item(quantity=Decimal("1"), provenance=[{"src": "a"}, {"src": "b"}]),
            _item(quantity=Decimal("2"), provenance=[{"src": "c"}]),
            _item(quantity=Decimal("3")),  # no provenance on this row
        ]
        merged = merge_items(items, MODE_MERGE_MATERIALS)
        assert merged[0]["provenance"] == [{"src": "a"}, {"src": "b"}, {"src": "c"}]

    def test_stable_first_seen_order(self) -> None:
        items = [
            _item(nomenclature_code=CODE_KIT, supply_unit=UNIT_PCS, quantity=1),
            _item(nomenclature_code=CODE_TAPE, supply_unit=UNIT_M, quantity=2),
            _item(nomenclature_code=CODE_KIT, supply_unit=UNIT_PCS, quantity=3),
        ]
        merged = merge_items(items, MODE_MERGE_MATERIALS)
        assert [row["nomenclature_code"] for row in merged] == [CODE_KIT, CODE_TAPE]
        assert merged[0]["quantity"] == Decimal("4")
        assert merged[1]["quantity"] == Decimal("2")
