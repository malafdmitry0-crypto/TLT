"""Unit-тесты чистых функций project_io_service: парсер CSV, имена файлов, секции."""

from __future__ import annotations

import io

import pytest

from app.services.project_io_service import (
    ProjectImportError,
    _decode_csv,
    _detect_delimiter,
    _first_project_from_bulk,
    _parse_json_or_empty,
    _parse_sections,
    _rows_to_dicts,
    _suggest_filename,
)


class TestDecodeCsv:
    def test_utf8_bom(self):
        text = _decode_csv(b"\xef\xbb\xbf[SECTION];metadata\nname;X\n")
        assert text.startswith("[SECTION]")

    def test_utf8_no_bom(self):
        text = _decode_csv("name;Тест\n".encode())
        assert "Тест" in text

    def test_cp1251(self):
        text = _decode_csv("Кодировка;Win-1251\n".encode("cp1251"))
        assert "Win-1251" in text

    def test_falls_back_through_encodings(self):
        # CP1251 — fallback после UTF-8 → должно успешно
        text = _decode_csv("ABC".encode("cp1251"))
        assert text == "ABC"


class TestDetectDelimiter:
    def test_section_marker_with_semicolon(self):
        assert _detect_delimiter("[SECTION];metadata\nkey;value\n") == ";"

    def test_section_marker_with_comma(self):
        assert _detect_delimiter("[SECTION],metadata\nkey,value\n") == ","

    def test_section_marker_with_tab(self):
        assert _detect_delimiter("[SECTION]\tmetadata\nkey\tvalue\n") == "\t"

    def test_no_section_marker_uses_sniffer(self):
        # Без [SECTION] — sniffer определит по запятой
        assert _detect_delimiter("a,b,c\n1,2,3\n") == ","

    def test_bom_prefix_handled(self):
        assert _detect_delimiter("\ufeff[SECTION];metadata\n") == ";"


class TestParseSections:
    def test_extracts_metadata_section(self):
        raw = b"[SECTION];metadata\nkey;value\nname;Test\nstatus;draft\n"
        sections = _parse_sections(raw)
        assert "metadata" in sections
        assert any("name" in row[0] for row in sections["metadata"])

    def test_multiple_sections(self):
        raw = (
            b"[SECTION];metadata\nkey;value\nname;X\n\n"
            b"[SECTION];objects\ntype;name\npipe;A\ntank;B\n"
        )
        sections = _parse_sections(raw)
        assert "metadata" in sections
        assert "objects" in sections
        assert len(sections["objects"]) == 3  # header + 2 rows

    def test_skips_empty_lines(self):
        raw = b"[SECTION];metadata\n\nkey;value\n\n\nname;X\n"
        sections = _parse_sections(raw)
        # Пустые строки не попадают
        assert all(any(c.strip() for c in row) for row in sections["metadata"])

    def test_lines_before_first_section_ignored(self):
        raw = b"some;noise\nbefore;section\n[SECTION];metadata\nkey;value\nname;X\n"
        sections = _parse_sections(raw)
        # noise/before не попадает ни в какую секцию
        assert "metadata" in sections


class TestRowsToDicts:
    def test_simple_header_and_rows(self):
        rows = [["a", "b", "c"], ["1", "2", "3"], ["4", "5", "6"]]
        out = _rows_to_dicts(rows)
        assert out == [
            {"a": "1", "b": "2", "c": "3"},
            {"a": "4", "b": "5", "c": "6"},
        ]

    def test_short_row_padded_with_empty(self):
        rows = [["a", "b", "c"], ["1"]]
        out = _rows_to_dicts(rows)
        assert out == [{"a": "1", "b": "", "c": ""}]

    def test_empty_rows_returns_empty_list(self):
        assert _rows_to_dicts([]) == []

    def test_header_only_returns_empty(self):
        assert _rows_to_dicts([["a", "b"]]) == []


class TestParseJsonOrEmpty:
    def test_valid_json(self):
        assert _parse_json_or_empty('{"a": 1}', None) == {"a": 1}

    def test_empty_returns_default(self):
        assert _parse_json_or_empty("", "DEFAULT") == "DEFAULT"
        assert _parse_json_or_empty("   ", []) == []

    def test_invalid_raises(self):
        with pytest.raises(ProjectImportError, match="JSON"):
            _parse_json_or_empty("{not valid", None)


class TestSuggestFilename:
    def test_with_task_number(self):
        assert _suggest_filename("T-42", "My Project") == "T-42_My Project.tlt.csv"

    def test_no_task_number(self):
        assert _suggest_filename(None, "Foo") == "Foo.tlt.csv"

    def test_special_chars_sanitized(self):
        name = _suggest_filename(None, "X/Y\\Z*?<>")
        assert "/" not in name
        assert "\\" not in name
        assert "?" not in name

    def test_long_name_truncated(self):
        long_name = "a" * 200
        out = _suggest_filename(None, long_name)
        # 80 + ".tlt.csv"
        assert len(out) <= 100

    def test_empty_name_falls_back_to_project(self):
        assert _suggest_filename(None, "").endswith("project.tlt.csv")


class TestFirstProjectFromBulk:
    def test_extracts_first_project(self):
        sections = {
            "projects": [
                ["project_key", "name", "task_number", "description", "status"],
                ["p1", "Foo", "T-1", "", "draft"],
                ["p2", "Bar", "T-2", "", "completed"],
            ],
            "objects": [
                [
                    "project_key",
                    "type",
                    "name",
                    "sort_order",
                    "params",
                    "results",
                    "is_valid",
                    "validation_errors",
                ],
                ["p1", "pipe", "obj1", "0", "{}", "", "false", ""],
                ["p2", "tank", "obj2", "0", "{}", "", "false", ""],
            ],
        }
        result = _first_project_from_bulk(sections)
        assert result is not None
        meta, child = result
        assert meta["name"] == "Foo"
        # Только objects p1
        assert len(child["objects"]) == 1
        assert child["objects"][0]["type"] == "pipe"

    def test_empty_returns_none(self):
        assert _first_project_from_bulk({}) is None
        assert _first_project_from_bulk({"projects": []}) is None


class TestDumpProjectToWriter:
    """Прямые тесты на _dump_project_to_writer — формирует секционный CSV."""

    def _writer(self):
        import csv

        buf = io.StringIO()
        return buf, csv.writer(buf, delimiter=";")

    def _project(self, **kw):
        from types import SimpleNamespace

        return SimpleNamespace(
            name=kw.get("name", "P"),
            description=kw.get("description", "Desc"),
            task_number=kw.get("task_number", "T-1"),
            status=kw.get("status", "draft"),
        )

    def test_metadata_section_when_no_project_key(self):
        from app.services.project_io_service import _dump_project_to_writer

        buf, w = self._writer()
        _dump_project_to_writer(w, self._project(), [], [], [])
        text = buf.getvalue()
        assert "[SECTION];metadata" in text
        assert "[SECTION];objects" in text
        assert "[SECTION];electrical" not in text

    def test_no_metadata_when_project_key_provided(self):
        from app.services.project_io_service import _dump_project_to_writer

        buf, w = self._writer()
        _dump_project_to_writer(w, self._project(), [], [], [], project_key="p1")
        text = buf.getvalue()
        assert "[SECTION];metadata" not in text
        assert "[SECTION];objects" in text

    def test_writes_objects_with_json_params(self):
        from types import SimpleNamespace

        from app.services.project_io_service import _dump_project_to_writer

        obj = SimpleNamespace(
            id="oid",
            object_type="pipe",
            sort_order=0,
            params={"name": "Tag-1", "outer_diameter": 0.108},
            results=None,
            is_valid=False,
            validation_errors=None,
        )
        buf, w = self._writer()
        _dump_project_to_writer(w, self._project(), [obj], [], [])
        text = buf.getvalue()
        assert "Tag-1" in text
        assert "outer_diameter" in text

    def test_writes_electrical_section(self):
        from types import SimpleNamespace

        from app.services.project_io_service import _dump_project_to_writer

        obj_id = "obj-uuid"
        obj = SimpleNamespace(
            id=obj_id,
            object_type="pipe",
            sort_order=0,
            params={"name": "T1"},
            results=None,
            is_valid=False,
            validation_errors=None,
        )
        calc = SimpleNamespace(
            object_id=obj_id,
            variant_number=1,
            cable_type="self_regulating",
            cable_type_source="manual",
            cable_mark="ТЛТ-25",
            cable_mark_source="manual",
            params={"x": 1},
            results={"selected_cable": "ТЛТ-25"},
        )
        buf, w = self._writer()
        _dump_project_to_writer(w, self._project(), [obj], [calc], [])
        text = buf.getvalue()
        assert "[SECTION];electrical" in text
        assert "cable_type_source" in text
        assert "cable_mark_source" in text
        assert "manual" in text
        assert "ТЛТ-25" in text

    def test_writes_specifications_section(self):
        from types import SimpleNamespace

        from app.services.project_io_service import _dump_project_to_writer

        spec = SimpleNamespace(variant_number=1, items=[{"name": "X", "quantity": 1}])
        buf, w = self._writer()
        _dump_project_to_writer(w, self._project(), [], [], [spec])
        text = buf.getvalue()
        assert "[SECTION];specifications" in text


class TestApplyProjectData:
    async def test_creates_objects_with_params(self):
        from types import SimpleNamespace
        from unittest.mock import AsyncMock, MagicMock

        from app.services.project_io_service import _apply_project_data

        project = SimpleNamespace(id="pid")
        db = AsyncMock()
        db.add = MagicMock()
        db.flush = AsyncMock()
        await _apply_project_data(
            db,
            project,
            objects_rows=[
                {
                    "type": "pipe",
                    "name": "T1",
                    "sort_order": "0",
                    "params": '{"outer_diameter": 0.1}',
                    "results": "",
                    "is_valid": "false",
                    "validation_errors": "",
                }
            ],
            electrical_rows=[],
            spec_rows=[],
        )
        assert db.add.called

    async def test_electrical_links_via_object_key(self):
        from types import SimpleNamespace
        from unittest.mock import AsyncMock, MagicMock

        from app.services.project_io_service import _apply_project_data

        project = SimpleNamespace(id="pid")
        db = AsyncMock()
        db.add = MagicMock()
        db.flush = AsyncMock()
        await _apply_project_data(
            db,
            project,
            objects_rows=[
                {
                    "type": "pipe",
                    "name": "T1",
                    "sort_order": "0",
                    "params": "{}",
                    "results": "",
                    "is_valid": "false",
                    "validation_errors": "",
                }
            ],
            electrical_rows=[
                {
                    "object_key": "T1",
                    "variant_number": "1",
                    "cable_type": "self_regulating",
                    "cable_type_source": "manual",
                    "cable_mark": "ТЛТ-25",
                    "cable_mark_source": "manual",
                    "params": "{}",
                    "results": '{"selected_cable": "ТЛТ-25"}',
                }
            ],
            spec_rows=[],
        )
        # 1 object + 1 electrical → 2 add()
        assert db.add.call_count == 2

    async def test_electrical_with_unknown_key_skipped(self):
        from types import SimpleNamespace
        from unittest.mock import AsyncMock, MagicMock

        from app.services.project_io_service import _apply_project_data

        project = SimpleNamespace(id="pid")
        db = AsyncMock()
        db.add = MagicMock()
        db.flush = AsyncMock()
        await _apply_project_data(
            db,
            project,
            objects_rows=[],
            electrical_rows=[
                {
                    "object_key": "unknown",
                    "variant_number": "1",
                    "cable_type": "x",
                    "cable_mark": "",
                    "params": "{}",
                    "results": "",
                }
            ],
            spec_rows=[],
        )
        db.add.assert_not_called()

    async def test_specifications_added(self):
        from types import SimpleNamespace
        from unittest.mock import AsyncMock, MagicMock

        from app.services.project_io_service import _apply_project_data

        project = SimpleNamespace(id="pid")
        db = AsyncMock()
        db.add = MagicMock()
        db.flush = AsyncMock()
        await _apply_project_data(
            db,
            project,
            objects_rows=[],
            electrical_rows=[],
            spec_rows=[
                {
                    "variant_number": "1",
                    "items": '[{"name": "X", "quantity": 1}]',
                }
            ],
        )
        db.add.assert_called_once()
