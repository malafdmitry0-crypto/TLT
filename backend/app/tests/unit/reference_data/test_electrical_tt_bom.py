import pytest

from app.reference_data.loader import (
    electrical_tt_bom_metadata,
    get_electrical_tt_bom_entry,
    list_electrical_tt_bom_entries,
)

EXPECTED_BOM = {
    "10ТТН2-СТ": "001-001-001",
    "17ТТН2-СТ": "001-001-002",
    "25ТТН2-СТ": "001-001-003",
    "31ТТН2-СТ": "001-001-004",
    "10ТТН2-СР": "001-001-005",
    "17ТТН2-СР": "001-001-006",
    "25ТТН2-СР": "001-001-007",
    "31ТТН2-СР": "001-001-008",
    "15ТТВ2-СР": "001-002-001",
    "30ТТВ2-СР": "001-002-002",
    "45ТТВ2-СР": "001-002-003",
    "60ТТВ2-СР": "001-002-004",
    "15ТТХ2-СР": "001-003-001",
    "30ТТХ2-СР": "001-003-002",
    "45ТТХ2-СР": "001-003-003",
    "60ТТХ2-СР": "001-003-004",
    "75ТТХ2-СР": "001-003-005",
    "90ТТХ2-СР": "001-003-006",
}


@pytest.mark.parametrize(("full_mark", "code"), EXPECTED_BOM.items())
def test_exact_tt_bom_v1_mapping(full_mark: str, code: str):
    entry = get_electrical_tt_bom_entry(full_mark)
    assert entry is not None
    assert entry["full_mark"] == full_mark
    assert entry["nomenclature_code"] == code


def test_tt_bom_has_exactly_18_unique_registered_rows():
    entries = list_electrical_tt_bom_entries()
    assert len(entries) == 18
    assert {row["full_mark"] for row in entries} == set(EXPECTED_BOM)
    assert {row["nomenclature_code"] for row in entries} == set(EXPECTED_BOM.values())


def test_tt_bom_metadata_is_versioned_and_source_traced():
    meta = electrical_tt_bom_metadata()
    assert meta["kind"] == "bom"
    assert meta["version"] == "selfreg-spec-2026-05-29"
    assert meta["schema_version"] == 1
    assert meta["status"] == "active"
    assert meta["source_checksum"].startswith("sha256:")
    assert "Расчет_спецификации_трубы_самрег" in meta["source"]


@pytest.mark.parametrize(
    "not_exact",
    ["30ТТВ2", "30ТТВ2-СТ", "30ттв2-ср", " 30ТТВ2-СР"],
)
def test_tt_bom_does_not_normalize_or_fallback(not_exact: str):
    assert get_electrical_tt_bom_entry(not_exact) is None
