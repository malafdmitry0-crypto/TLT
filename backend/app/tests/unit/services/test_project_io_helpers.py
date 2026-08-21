"""Unit-тесты чистых функций project_io_service: парсер CSV, имена файлов, секции."""

from __future__ import annotations

import io

import pytest

from app.services.project_io_service import (
    SCHEMA_VERSION,
    SUPPORTED_SCHEMA_VERSIONS,
    ProjectImportError,
    _decode_csv,
    _detect_delimiter,
    _normalize_object_type,
    _parse_json_or_empty,
    _parse_sections,
    _require_schema_version,
    _resolve_specification_identity,
    _rows_to_dicts,
    _safe_csv_cell,
    _spec_rows_contain_manual_items,
    _suggest_filename,
    _validate_catalog_selection_rows_shape,
    _validate_specification_section_before_mutation,
    _validate_specification_section_v3,
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


class TestObjectImportScopeGuard:
    async def test_project_import_rejects_legacy_object_specification_settings(self):
        from types import SimpleNamespace
        from unittest.mock import AsyncMock, MagicMock

        from app.services.project_io_service import _apply_project_data

        project = SimpleNamespace(id="pid")
        db = AsyncMock()
        db.add = MagicMock()
        db.flush = AsyncMock()

        with pytest.raises(
            ProjectImportError,
            match="OBJECT_SPECIFICATION_SETTINGS_SCOPE_VIOLATION",
        ):
            await _apply_project_data(
                db,
                project,
                objects_rows=[
                    {
                        "object_key": "obj-1",
                        "type": "pipe",
                        "params": '{"explosion_zone_type": "yes"}',
                    }
                ],
                electrical_rows=[],
                spec_rows=[],
            )

        db.add.assert_not_called()


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


class TestCsvFormulaInjection:
    def test_safe_csv_cell_escapes_formula_prefixes(self):
        assert _safe_csv_cell("=cmd|' /C calc'!A0") == "'=cmd|' /C calc'!A0"
        assert _safe_csv_cell(" @SUM(1,2)") == "' @SUM(1,2)"
        assert _safe_csv_cell("\t=SUM(1,2)") == "'\t=SUM(1,2)"
        assert _safe_csv_cell("-2+3") == "'-2+3"
        assert _safe_csv_cell("+SUM(1,2)") == "'+SUM(1,2)"
        assert _safe_csv_cell("plain") == "plain"
        assert _safe_csv_cell(42) == 42


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
        assert "object_key;type;name;sort_order" in text
        assert "oid;pipe;Tag-1;0" in text
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
            electrical_variant_id=None,
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
        assert "legacy-1;obj-uuid;1;self_regulating" in text
        assert "manual" in text
        assert "ТЛТ-25" in text

    def test_writes_duplicate_names_with_stable_object_keys(self):
        from types import SimpleNamespace

        from app.services.project_io_service import _dump_project_to_writer

        objects = [
            SimpleNamespace(
                id="obj-1",
                object_type="pipe",
                sort_order=0,
                params={"name": "T1"},
                results=None,
                is_valid=False,
                validation_errors=None,
            ),
            SimpleNamespace(
                id="obj-2",
                object_type="pipe",
                sort_order=1,
                params={"name": "T1"},
                results=None,
                is_valid=False,
                validation_errors=None,
            ),
        ]
        calculations = [
            SimpleNamespace(
                object_id="obj-1",
                electrical_variant_id=None,
                variant_number=1,
                cable_type="self_regulating",
                cable_type_source="manual",
                cable_mark="ТЛТ-25",
                cable_mark_source="manual",
                params={},
                results={},
            ),
            SimpleNamespace(
                object_id="obj-2",
                electrical_variant_id=None,
                variant_number=1,
                cable_type="self_regulating",
                cable_type_source="manual",
                cable_mark="ТЛТ-30",
                cable_mark_source="manual",
                params={},
                results={},
            ),
        ]

        buf, w = self._writer()
        _dump_project_to_writer(w, self._project(), objects, calculations, [])
        text = buf.getvalue()

        assert "obj-1;pipe;T1;0" in text
        assert "obj-2;pipe;T1;1" in text
        assert "legacy-1;obj-1;1;self_regulating" in text
        assert "legacy-1;obj-2;1;self_regulating" in text

    def test_writes_specifications_section(self):
        from types import SimpleNamespace
        from uuid import uuid4

        from app.services.project_io_service import _dump_project_to_writer

        er_id = uuid4()
        variant = SimpleNamespace(
            id=er_id,
            name="ЭР alpha",
            sort_order=0,
            is_active=True,
            copied_from_id=None,
            legacy_variant_number=None,
        )
        spec = SimpleNamespace(
            electrical_variant_id=er_id,
            items=[{"name": "X", "quantity": 1}],
            snapshot={"catalog": {"catalog_key": "approved-2026"}},
            is_stale=False,
            stale_reason=None,
            stale_at=None,
            stale_details=None,
        )
        buf, w = self._writer()
        _dump_project_to_writer(
            w,
            self._project(),
            [],
            [],
            [spec],
            variants=[variant],
        )
        text = buf.getvalue()
        assert "[SECTION];specifications" in text
        assert "variant_key;electrical_variant_id;items;snapshot" in text
        assert str(er_id) in text
        assert "approved-2026" in text


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
                    "object_key": "obj-1",
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
        from uuid import uuid4

        from app.models.electrical_calculation import ElectricalCalculation
        from app.models.electrical_variant import (
            ElectricalVariant,
            ElectricalVariantObject,
        )
        from app.models.project_object import ProjectObject
        from app.services.project_io_service import _apply_project_data

        project = SimpleNamespace(id="pid")
        added: list[object] = []
        db = AsyncMock()
        db.add = MagicMock(side_effect=added.append)

        async def fake_flush():
            for item in added:
                if isinstance(item, ElectricalVariant | ProjectObject) and item.id is None:
                    item.id = uuid4()
                if isinstance(item, ProjectObject) and item.version is None:
                    item.version = 1

        db.flush = AsyncMock(side_effect=fake_flush)
        await _apply_project_data(
            db,
            project,
            objects_rows=[
                {
                    "object_key": "obj-1",
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
                    "object_key": "obj-1",
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

        objects = [item for item in added if isinstance(item, ProjectObject)]
        variants = [item for item in added if isinstance(item, ElectricalVariant)]
        assignments = [item for item in added if isinstance(item, ElectricalVariantObject)]
        calculations = [item for item in added if isinstance(item, ElectricalCalculation)]
        assert len(objects) == len(variants) == len(assignments) == len(calculations) == 1

        obj = objects[0]
        variant = variants[0]
        assignment = assignments[0]
        calculation = calculations[0]
        assert variant.name == "ЭР1"
        assert variant.name_normalized == "эр1"
        assert variant.legacy_variant_number == 1
        assert variant.is_active is True
        assert assignment.object_id == obj.id
        assert assignment.electrical_variant_id == variant.id
        # E9: legacy self_regulating / ТЛТ results import successfully but must
        # be recalculated through the canonical TT / 230 V flow.
        assert assignment.assignment_state == "stale"
        assert assignment.system_type == "self_regulating"
        assert calculation.object_id == obj.id
        assert calculation.variant_number == 1
        assert calculation.electrical_variant_id == variant.id
        assert calculation.cable_mark == "ТЛТ-25"
        assert calculation.results["stale"] is True
        assert calculation.results["category"] == "stale"
        assert calculation.results["stale_reason"] == "legacy_cable_mark"

    async def test_electrical_prefers_stable_object_key_over_duplicate_name(self):
        from types import SimpleNamespace
        from unittest.mock import AsyncMock, MagicMock
        from uuid import uuid4

        from app.models.electrical_calculation import ElectricalCalculation
        from app.models.project_object import ProjectObject
        from app.services.project_io_service import _apply_project_data

        project = SimpleNamespace(id="pid")
        added: list[object] = []
        db = AsyncMock()
        db.add = MagicMock(side_effect=added.append)

        async def fake_flush():
            for item in added:
                if isinstance(item, ProjectObject) and item.id is None:
                    item.id = uuid4()

        db.flush = AsyncMock(side_effect=fake_flush)
        await _apply_project_data(
            db,
            project,
            objects_rows=[
                {
                    "object_key": "obj-1",
                    "type": "pipe",
                    "name": "T1",
                    "sort_order": "0",
                    "params": "{}",
                    "results": "",
                    "is_valid": "false",
                    "validation_errors": "",
                },
                {
                    "object_key": "obj-2",
                    "type": "pipe",
                    "name": "T1",
                    "sort_order": "1",
                    "params": "{}",
                    "results": "",
                    "is_valid": "false",
                    "validation_errors": "",
                },
            ],
            electrical_rows=[
                {
                    "object_key": "obj-1",
                    "variant_number": "1",
                    "cable_type": "self_regulating",
                    "cable_type_source": "manual",
                    "cable_mark": "ТЛТ-25",
                    "cable_mark_source": "manual",
                    "params": "{}",
                    "results": '{"selected_cable": "ТЛТ-25"}',
                },
                {
                    "object_key": "obj-2",
                    "variant_number": "1",
                    "cable_type": "self_regulating",
                    "cable_type_source": "manual",
                    "cable_mark": "ТЛТ-30",
                    "cable_mark_source": "manual",
                    "params": "{}",
                    "results": '{"selected_cable": "ТЛТ-30"}',
                },
            ],
            spec_rows=[],
        )

        electrical = [
            call.args[0]
            for call in db.add.call_args_list
            if isinstance(call.args[0], ElectricalCalculation)
        ]
        objects = [item for item in added if isinstance(item, ProjectObject)]
        assert len(electrical) == 2
        assert [calc.object_id for calc in electrical] == [objects[0].id, objects[1].id]

    async def test_missing_object_key_is_rejected(self):
        from types import SimpleNamespace
        from unittest.mock import AsyncMock, MagicMock

        import pytest

        from app.services.project_io_service import ProjectImportError, _apply_project_data

        project = SimpleNamespace(id="pid")
        db = AsyncMock()
        db.add = MagicMock()
        db.flush = AsyncMock()
        with pytest.raises(ProjectImportError, match="обязательный object_key"):
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
                    },
                    {
                        "type": "pipe",
                        "name": "T1",
                        "sort_order": "1",
                        "params": "{}",
                        "results": "",
                        "is_valid": "false",
                        "validation_errors": "",
                    },
                ],
                electrical_rows=[],
                spec_rows=[],
            )

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

    async def test_v2_specifications_are_rejected_without_writes(self):
        from types import SimpleNamespace
        from unittest.mock import AsyncMock, MagicMock

        from app.services.project_io_service import _apply_project_data

        project = SimpleNamespace(id="pid")
        db = AsyncMock()
        db.add = MagicMock()

        with pytest.raises(ProjectImportError, match="schema_version=2 не поддерживается"):
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

        db.add.assert_not_called()


class TestSchemaV3Helpers:
    def test_export_schema_is_v3(self):
        assert SCHEMA_VERSION == "3"
        assert "2" in SUPPORTED_SCHEMA_VERSIONS
        assert "3" in SUPPORTED_SCHEMA_VERSIONS

    def test_require_schema_accepts_v2_and_v3(self):
        def sections(version: str):
            return {
                "metadata": [
                    ["key", "value"],
                    ["schema_version", version],
                    ["name", "X"],
                ]
            }

        assert _require_schema_version(sections("2"), "metadata") == "2"
        assert _require_schema_version(sections("3"), "metadata") == "3"
        with pytest.raises(ProjectImportError, match="Неподдерживаемая"):
            _require_schema_version(sections("1"), "metadata")

    def test_barrel_normalizes_to_tank(self):
        assert _normalize_object_type("barrel") == "tank"
        assert _normalize_object_type("Бочка") == "tank"
        assert _normalize_object_type("pipe") == "pipe"
        assert _normalize_object_type("ёмкость") == "tank"
        with pytest.raises(ProjectImportError):
            _normalize_object_type("floor")

    def test_dump_writes_v3_variant_sections_when_variants_present(self):
        import csv
        from types import SimpleNamespace

        from app.services.project_io_service import _dump_project_to_writer

        buf = io.StringIO()
        w = csv.writer(buf, delimiter=";")
        project = SimpleNamespace(name="P", description="", task_number="", status="draft")
        obj = SimpleNamespace(
            id="oid",
            object_type="pipe",
            sort_order=0,
            params={"name": "T"},
            results=None,
            is_valid=True,
            validation_errors=None,
        )
        from uuid import uuid4

        er_id = uuid4()
        variant = SimpleNamespace(
            id=er_id,
            name="ЭР1",
            sort_order=0,
            is_active=True,
            copied_from_id=None,
            legacy_variant_number=1,
        )
        assignment = SimpleNamespace(
            electrical_variant_id=er_id,
            object_id="oid",
            system_type="self_regulating",
            assignment_state="ready",
            requested_cable_type="self_regulating",
        )
        _dump_project_to_writer(
            w,
            project,
            [obj],
            [],
            [],
            variants=[variant],
            assignments=[assignment],
        )
        text = buf.getvalue()
        assert "schema_version;3" in text
        assert "[SECTION];electrical_variants" in text
        assert "[SECTION];electrical_assignments" in text
        assert "ЭР1" in text


class TestGuestManualBomReject:
    def test_detects_manual_items_in_spec_rows(self):
        rows = [
            {
                "variant_key": "v1",
                "items": '[{"name": "X", "quantity": 1, "source": "manual"}]',
            }
        ]
        assert _spec_rows_contain_manual_items(rows) is True

    def test_auto_only_is_clean(self):
        rows = [
            {
                "variant_key": "v1",
                "items": '[{"name": "Y", "quantity": 2, "source": "auto"}]',
            }
        ]
        assert _spec_rows_contain_manual_items(rows) is False


class TestSpecificationIdentityResolution:
    def test_both_fields_must_point_to_same_er(self):
        variants = {"er-a": object(), "er-b": object()}
        with pytest.raises(ProjectImportError, match="конфликт identity"):
            _resolve_specification_identity(
                variant_key="er-a",
                electrical_variant_id_raw="er-b",
                variants_by_key=variants,
            )

    def test_both_fields_same_er_accepted(self):
        er = object()
        variants = {"er-a": er}
        assert (
            _resolve_specification_identity(
                variant_key="er-a",
                electrical_variant_id_raw="er-a",
                variants_by_key=variants,
            )
            is er
        )

    def test_duplicate_resolved_uuid_rejected(self):
        er = object()
        variants = {"er-a": er}
        rows = [
            {"variant_key": "er-a", "items": "[]", "snapshot": "{}"},
            {
                "variant_key": "",
                "electrical_variant_id": "er-a",
                "items": "[]",
                "snapshot": "{}",
            },
        ]
        with pytest.raises(ProjectImportError, match="дубликат"):
            _validate_specification_section_v3(rows, variants)

    def test_legacy_spec_section_rejected_before_mutation(self):
        with pytest.raises(ProjectImportError, match="schema_version=2 не поддерживается"):
            _validate_specification_section_before_mutation(
                schema_version="2",
                spec_rows=[{"variant_number": "1", "items": "[]"}],
                variant_rows=[],
            )

    def test_v3_conflict_rejected_before_mutation(self):
        with pytest.raises(ProjectImportError, match="конфликт identity"):
            _validate_specification_section_before_mutation(
                schema_version="3",
                spec_rows=[
                    {
                        "variant_key": "er-a",
                        "electrical_variant_id": "er-b",
                        "items": "[]",
                        "snapshot": "{}",
                    }
                ],
                variant_rows=[
                    {"variant_key": "er-a", "name": "ЭР1"},
                    {"variant_key": "er-b", "name": "ЭР2"},
                ],
            )


class TestCatalogSelectionImportShape:
    def test_rejects_bad_fingerprint_before_mutation(self):
        with pytest.raises(ProjectImportError, match="candidate_set_fingerprint"):
            _validate_catalog_selection_rows_shape(
                [
                    {
                        "variant_key": "er-a",
                        "candidate_group_key": "cg_" + "a" * 32 + "_" + "b" * 40,
                        "catalog_version_id": "00000000-0000-0000-0000-000000000001",
                        "catalog_item_id": "00000000-0000-0000-0000-000000000002",
                        "candidate_set_fingerprint": "not-a-hash",
                        "collection_version": "1",
                    }
                ],
                {"er-a"},
            )

    def test_rejects_duplicate_group_for_same_er(self):
        group = "cg_" + "a" * 32 + "_" + "b" * 40
        fingerprint = "sha256:" + "c" * 64
        row = {
            "variant_key": "er-a",
            "candidate_group_key": group,
            "catalog_version_id": "00000000-0000-0000-0000-000000000001",
            "catalog_item_id": "00000000-0000-0000-0000-000000000002",
            "candidate_set_fingerprint": fingerprint,
            "collection_version": "1",
        }
        with pytest.raises(ProjectImportError, match="дубликат"):
            _validate_catalog_selection_rows_shape([row, dict(row)], {"er-a"})

    def test_accepts_valid_shape(self):
        _validate_catalog_selection_rows_shape(
            [
                {
                    "variant_key": "er-a",
                    "candidate_group_key": "cg_" + "a" * 32 + "_" + "b" * 40,
                    "catalog_version_id": "00000000-0000-0000-0000-000000000001",
                    "catalog_item_id": "00000000-0000-0000-0000-000000000002",
                    "candidate_set_fingerprint": "sha256:" + "c" * 64,
                    "collection_version": "2",
                }
            ],
            {"er-a"},
        )
