from __future__ import annotations

import pytest

from app.services.project_io.contracts import ProjectImportError
from app.services.project_io.csv_codec import (
    decode_csv,
    detect_delimiter,
    parse_sections,
    rows_to_dicts,
    safe_csv_cell,
)


@pytest.mark.parametrize(
    "raw",
    [
        b"\xef\xbb\xbf[SECTION];metadata\nname;X\n",
        "name;Тест\n".encode(),
        "Кодировка;Win-1251\n".encode("cp1251"),
    ],
)
def test_decode_supported_encodings(raw: bytes):
    assert decode_csv(raw)


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("[SECTION];metadata\nkey;value\n", ";"),
        ("[SECTION],metadata\nkey,value\n", ","),
        ("[SECTION]\tmetadata\nkey\tvalue\n", "\t"),
        ("a,b,c\n1,2,3\n", ","),
        ("\ufeff[SECTION];metadata\n", ";"),
    ],
)
def test_detect_delimiter(text: str, expected: str):
    assert detect_delimiter(text) == expected


def test_parse_sections_skips_empty_rows_and_prefix_noise():
    sections = parse_sections(
        b"noise;before\n[SECTION];metadata\n\nkey;value\nname;X\n"
        b"[SECTION];objects\ntype;name\npipe;A\n"
    )
    assert sections["metadata"] == [["key", "value"], ["name", "X"]]
    assert sections["objects"][-1] == ["pipe", "A"]


def test_rows_to_dicts_pads_short_rows():
    assert rows_to_dicts([["a", "b", "c"], ["1"]]) == [{"a": "1", "b": "", "c": ""}]
    assert rows_to_dicts([]) == []
    assert rows_to_dicts([["a"]]) == []


def test_formula_cells_are_escaped():
    assert safe_csv_cell("=SUM(1,2)") == "'=SUM(1,2)"
    assert safe_csv_cell(" @SUM(1,2)") == "' @SUM(1,2)"
    assert safe_csv_cell("plain") == "plain"
    assert safe_csv_cell(42) == 42


def test_invalid_json_error_is_owned_by_validation_layer():
    from app.services.project_io.validation import parse_json_or_empty

    with pytest.raises(ProjectImportError, match="JSON"):
        parse_json_or_empty("{broken", None)
