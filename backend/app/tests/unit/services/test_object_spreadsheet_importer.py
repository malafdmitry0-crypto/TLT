"""Owner-focused object spreadsheet tests.

Методология: table-driven testing. Эти функции получают произвольные строки
из Excel (локалями, запятыми, unicode) и должны корректно превращать их в
питоновские типы. Любая ошибка здесь = неправильный расчёт.
"""

import pytest
from sqlalchemy.exc import SQLAlchemyError

from app.core.config import settings
from app.models.project_object import ProjectObject
from app.services.object_spreadsheet import persistence, preparation
from app.services.object_spreadsheet.importer import (
    import_objects_from_csv,
    import_objects_from_excel,
)
from app.services.object_spreadsheet.parsing import (
    ExcelImportError,
)
from app.services.object_spreadsheet.persistence import (
    _commit_object_batch,
    _commit_object_batch_row_by_row,
)
from app.services.object_spreadsheet.pipe_mapping import _build_pipe_params


class TestAddRowsHelper:
    """Прямые unit-тесты на _add_rows (внутренний helper import flow)."""

    async def test_rejects_invalid_diameter_before_batch_state_and_dedupe(
        self, monkeypatch: pytest.MonkeyPatch
    ):
        from unittest.mock import AsyncMock
        from uuid import uuid4

        from app.services.object_spreadsheet.persistence import _add_rows

        rows = [
            {
                "_row": 2,
                "name": "Невалидная",
                "outer_diameter_mm": 5000,
                "pipe_length": 50,
                "insulation_thickness_mm": 50,
                "insulation_material": "mineral_wool_boards_120",
                "insulation_temperature_basis": "outdoor_winter",
                "ambient_temperature": -20,
                "process_temperature": 80,
                "min_switch_temperature": -20,
                "wall_thickness_mm": 4,
                "pipe_material": "carbon_steel",
                "placement": "outdoor",
                "wind_speed": 0,
            },
            {
                "_row": 3,
                "name": "Валидная",
                "outer_diameter_mm": 108,
                "pipe_length": 50,
                "insulation_thickness_mm": 50,
                "insulation_material": "mineral_wool_boards_120",
                "insulation_temperature_basis": "outdoor_winter",
                "ambient_temperature": -20,
                "process_temperature": 80,
                "min_switch_temperature": -20,
                "wall_thickness_mm": 4,
                "pipe_material": "carbon_steel",
                "placement": "outdoor",
                "wind_speed": 0,
            },
        ]
        committed_rows: list[int] = []

        async def fake_commit(db, batch, sheet_label):
            committed_rows.extend(row["_row"] for _obj, row in batch)
            return len(batch), [uuid4() for _obj, _row in batch], []

        monkeypatch.setattr(persistence, "_commit_object_batch", fake_commit)
        dedupe_keys: set[str] = set()

        (
            created,
            next_sort,
            current_count,
            errors,
            object_ids,
            skipped,
            skipped_limit,
            invalid,
            validation_errors,
        ) = await _add_rows(
            AsyncMock(),
            uuid4(),
            "Трубопроводы",
            rows,
            "pipe",
            next_sort=7,
            current_count=3,
            dedupe_keys=dedupe_keys,
        )

        assert created == 1
        assert next_sort == 8
        assert current_count == 4
        assert len(object_ids) == 1
        assert errors == []
        assert skipped == 0
        assert skipped_limit == 0
        assert invalid == 1
        assert committed_rows == [3]
        assert len(dedupe_keys) == 1
        assert validation_errors == [
            {
                "sheet": "Трубопроводы",
                "row": 2,
                "field": "outer_diameter",
                "code": "OBJECT_PARAMS_INVALID",
                "message": "Наружный диаметр должен быть от 10,8 до 3000 мм",
            }
        ]

    async def test_commits_rows_in_batches(self, monkeypatch: pytest.MonkeyPatch):
        from unittest.mock import AsyncMock
        from uuid import uuid4

        from app.services.object_spreadsheet.persistence import _add_rows

        rows = [
            {
                "_row": idx,
                "outer_diameter_mm": 108,
                "pipe_length": 50,
                "insulation_thickness_mm": 50,
                "insulation_material": "mineral_wool_boards_120",
                "insulation_temperature_basis": "outdoor_winter",
                "ambient_temperature": -20,
                "process_temperature": 80,
                "min_switch_temperature": -20,
                "wall_thickness_mm": 4,
                "pipe_material": "carbon_steel",
                "placement": "outdoor",
                "wind_speed": 0,
            }
            for idx in range(2, 32)
        ]
        batch_sizes: list[int] = []
        stored_params: list[dict] = []

        async def fake_commit(db, batch, sheet_label):
            batch_sizes.append(len(batch))
            stored_params.extend(obj.params for obj, _row in batch)
            return len(batch), [uuid4() for _obj, _row in batch], []

        monkeypatch.setattr(persistence, "_commit_object_batch", fake_commit)
        db = AsyncMock()

        (
            created,
            next_sort,
            current_count,
            errors,
            object_ids,
            skipped,
            skipped_limit,
            invalid,
            validation_errors,
        ) = await _add_rows(
            db,
            uuid4(),
            "Pipes",
            rows,
            "pipe",
            next_sort=0,
            current_count=0,
        )

        assert created == 30
        assert next_sort == 30
        assert current_count == 30
        assert len(object_ids) == 30
        assert skipped == 0
        assert skipped_limit == 0
        assert invalid == 0
        assert validation_errors == []
        assert errors == []
        assert batch_sizes == [25, 5]
        assert all(params["insulation_layers"] for params in stored_params)
        assert all(params["placement"] == "outdoor" for params in stored_params)
        assert all(
            forbidden not in params
            for params in stored_params
            for forbidden in (
                "location",
                "burial_depth",
                "insulation_thickness",
                "insulation_material",
                "insulation_layer_count",
                "valve_count",
                "flange_count",
                "support_count",
            )
        )

    async def test_merge_mode_skips_existing_dedupe_key(self, monkeypatch: pytest.MonkeyPatch):
        from unittest.mock import AsyncMock
        from uuid import uuid4

        from app.services.object_spreadsheet.persistence import _add_rows, _dedupe_key
        from app.services.project_object_params import prepare_project_object_params

        row = {
            "_row": 2,
            "name": " Line A ",
            "outer_diameter_mm": 108,
            "pipe_length": 50,
            "insulation_thickness_mm": 50,
            "insulation_material": "mineral_wool_boards_120",
            "insulation_temperature_basis": "outdoor_winter",
            "ambient_temperature": -20,
            "process_temperature": 80,
            "min_switch_temperature": -20,
            "wall_thickness_mm": 4,
            "pipe_material": "carbon_steel",
            "placement": "outdoor",
            "wind_speed": 0,
        }
        built, err = _build_pipe_params(row)
        assert err is None
        assert built is not None
        normalized = prepare_project_object_params("pipe", built)
        dedupe_keys = {_dedupe_key("pipe", normalized)}

        async def fake_commit(db, batch, sheet_label):
            return len(batch), ["should-not-create"] if batch else [], []

        monkeypatch.setattr(persistence, "_commit_object_batch", fake_commit)

        (
            created,
            next_sort,
            current_count,
            errors,
            object_ids,
            skipped,
            skipped_limit,
            invalid,
            validation_errors,
        ) = await _add_rows(
            AsyncMock(),
            uuid4(),
            "Pipes",
            [row],
            "pipe",
            next_sort=7,
            current_count=3,
            dedupe_keys=dedupe_keys,
        )

        assert created == 0
        assert next_sort == 7
        assert current_count == 3
        assert errors == []
        assert object_ids == []
        assert skipped == 1
        assert skipped_limit == 0
        assert invalid == 0
        assert validation_errors == []

    async def test_empty_batch_is_noop(self):
        from unittest.mock import AsyncMock

        created, object_ids, errors = await _commit_object_batch(AsyncMock(), [], "Pipes")

        assert created == 0
        assert object_ids == []
        assert errors == []

    async def test_commit_batch_success_adds_all_and_commits(self):
        from unittest.mock import AsyncMock, Mock
        from uuid import uuid4

        project_id = uuid4()
        objects = [
            ProjectObject(
                project_id=project_id,
                object_type="pipe",
                sort_order=idx,
                params={"name": f"P{idx}"},
            )
            for idx in range(2)
        ]
        db = AsyncMock()
        db.add_all = Mock()

        created, object_ids, errors = await _commit_object_batch(
            db,
            [(obj, {"_row": idx + 2}) for idx, obj in enumerate(objects)],
            "Pipes",
        )

        assert created == 2
        assert object_ids == [obj.id for obj in objects]
        assert errors == []
        db.add_all.assert_called_once_with(objects)
        db.flush.assert_awaited_once()
        db.commit.assert_awaited_once()

    async def test_commit_batch_falls_back_to_row_by_row_on_sql_error(
        self, monkeypatch: pytest.MonkeyPatch
    ):
        from unittest.mock import AsyncMock, Mock
        from uuid import uuid4

        async def fake_row_by_row(db, batch, sheet_label, batch_error):
            assert sheet_label == "Pipes"
            assert isinstance(batch_error, SQLAlchemyError)
            return 1, [uuid4()], [{"sheet": sheet_label, "row": 3, "message": "bad row"}]

        monkeypatch.setattr(persistence, "_commit_object_batch_row_by_row", fake_row_by_row)

        db = AsyncMock()
        db.add_all = Mock()
        db.flush.side_effect = SQLAlchemyError("batch failed")
        obj = ProjectObject(project_id=uuid4(), object_type="pipe", sort_order=0, params={})

        created, object_ids, errors = await _commit_object_batch(db, [(obj, {"_row": 2})], "Pipes")

        assert created == 1
        assert len(object_ids) == 1
        assert errors == [{"sheet": "Pipes", "row": 3, "message": "bad row"}]
        db.rollback.assert_awaited_once()

    async def test_row_by_row_fallback_keeps_successes_and_reports_failures(self):
        from unittest.mock import AsyncMock, Mock
        from uuid import uuid4

        db = AsyncMock()
        db.add = Mock()
        db.flush.side_effect = [None, RuntimeError("second failed")]
        batch = [
            (
                ProjectObject(
                    project_id=uuid4(),
                    object_type="pipe",
                    sort_order=0,
                    params={"name": "ok"},
                ),
                {"_row": 2},
            ),
            (
                ProjectObject(
                    project_id=uuid4(),
                    object_type="pipe",
                    sort_order=1,
                    params={"name": "bad"},
                ),
                {"_row": 3},
            ),
        ]

        created, object_ids, errors = await _commit_object_batch_row_by_row(
            db,
            batch,
            "Pipes",
            SQLAlchemyError("batch failed"),
        )

        assert created == 1
        assert len(object_ids) == 1
        assert errors == [{"sheet": "Pipes", "row": 3, "message": "RuntimeError: second failed"}]
        assert db.add.call_count == 2
        assert db.commit.await_count == 1
        assert db.rollback.await_count == 1

    async def test_import_csv_orchestrates_access_state_and_batches(
        self, monkeypatch: pytest.MonkeyPatch
    ):
        from unittest.mock import AsyncMock
        from uuid import uuid4

        from app.services.object_spreadsheet import importer as mod

        project_id = uuid4()
        first_id = uuid4()
        second_id = uuid4()
        calls: list[tuple[str, int, int]] = []

        async def fake_access(db, checked_project_id, principal):
            assert checked_project_id == project_id

        async def fake_state(db, checked_project_id):
            assert checked_project_id == project_id
            return 3, 4

        async def fake_dedupe_keys(db, checked_project_id):
            assert checked_project_id == project_id
            return set()

        async def fake_add_rows(
            db,
            checked_project_id,
            sheet_label,
            rows,
            object_type,
            next_sort,
            current_count,
            dedupe_keys=None,
            prepared_rows=None,
        ):
            calls.append((object_type, next_sort, current_count))
            object_id = first_id if object_type == "pipe" else second_id
            return 1, next_sort + 1, current_count + 1, [], [object_id], 0, 0, 0, []

        monkeypatch.setattr(mod, "_ensure_import_access", fake_access)
        monkeypatch.setattr(mod, "_project_import_state", fake_state)
        monkeypatch.setattr(mod, "_existing_dedupe_keys", fake_dedupe_keys)
        monkeypatch.setattr(
            mod,
            "_parse_csv",
            lambda content: [
                ("Трубопроводы (CSV)", [{"_row": 2}]),
                ("Резервуары (CSV)", [{"_row": 3}]),
            ],
        )
        monkeypatch.setattr(mod, "_add_rows", fake_add_rows)

        result = await import_objects_from_csv(AsyncMock(), project_id, object(), b"csv")

        assert result == {
            "created": 2,
            "skipped_duplicates": 0,
            "skipped_limit": 0,
            "invalid": 0,
            "mode": "merge",
            "errors": [],
            "validation_errors": [],
            "created_object_ids": [first_id, second_id],
        }
        assert calls == [("pipe", 4, 3), ("tank", 5, 4)]

    async def test_import_csv_rejects_file_without_recognized_rows(
        self, monkeypatch: pytest.MonkeyPatch
    ):
        from unittest.mock import AsyncMock
        from uuid import uuid4

        from app.services.object_spreadsheet import importer as mod

        async def fake_access(db, checked_project_id, principal):
            return None

        async def fake_state(db, checked_project_id):
            return 0, 0

        monkeypatch.setattr(mod, "_ensure_import_access", fake_access)
        monkeypatch.setattr(mod, "_project_import_state", fake_state)
        monkeypatch.setattr(mod, "_parse_csv", lambda content: [])

        with pytest.raises(ExcelImportError, match="распознанным типом"):
            await import_objects_from_csv(AsyncMock(), uuid4(), object(), b"csv")

    async def test_import_excel_orchestrates_known_sheets(self, monkeypatch: pytest.MonkeyPatch):
        from unittest.mock import AsyncMock
        from uuid import uuid4

        from app.services.object_spreadsheet import importer as mod
        from app.services.object_spreadsheet import parsing

        class FakeWorkbook:
            sheetnames = ["Трубопроводы", "Резервуары", "Неизвестный"]

            def __getitem__(self, name):
                return f"worksheet:{name}"

        project_id = uuid4()
        pipe_id = uuid4()
        tank_id = uuid4()
        read_sheets: list[str] = []
        add_calls: list[tuple[str, int, int]] = []

        async def fake_access(db, checked_project_id, principal):
            assert checked_project_id == project_id

        async def fake_state(db, checked_project_id):
            return 0, 0

        async def fake_dedupe_keys(db, checked_project_id):
            assert checked_project_id == project_id
            return set()

        def fake_read_sheet(worksheet, headers):
            read_sheets.append(worksheet)
            return [{"_row": len(read_sheets) + 1}]

        async def fake_add_rows(
            db,
            checked_project_id,
            sheet_label,
            rows,
            object_type,
            next_sort,
            current_count,
            dedupe_keys=None,
            prepared_rows=None,
        ):
            add_calls.append((object_type, next_sort, current_count))
            object_id = pipe_id if object_type == "pipe" else tank_id
            return 1, next_sort + 1, current_count + 1, [], [object_id], 0, 0, 0, []

        monkeypatch.setattr(mod, "_validate_xlsx_archive", lambda content: None)
        monkeypatch.setattr(parsing, "load_workbook", lambda *args, **kwargs: FakeWorkbook())
        monkeypatch.setattr(mod, "_ensure_import_access", fake_access)
        monkeypatch.setattr(mod, "_project_import_state", fake_state)
        monkeypatch.setattr(mod, "_existing_dedupe_keys", fake_dedupe_keys)
        monkeypatch.setattr(parsing, "_read_sheet", fake_read_sheet)
        monkeypatch.setattr(mod, "_add_rows", fake_add_rows)

        result = await import_objects_from_excel(AsyncMock(), project_id, object(), b"xlsx")

        assert result == {
            "created": 2,
            "skipped_duplicates": 0,
            "skipped_limit": 0,
            "invalid": 0,
            "mode": "merge",
            "errors": [],
            "validation_errors": [],
            "created_object_ids": [pipe_id, tank_id],
        }
        assert read_sheets == ["worksheet:Трубопроводы", "worksheet:Резервуары"]
        assert add_calls == [("pipe", 0, 0), ("tank", 1, 1)]

    async def test_import_excel_rejects_workbook_without_known_sheets(
        self, monkeypatch: pytest.MonkeyPatch
    ):
        from unittest.mock import AsyncMock
        from uuid import uuid4

        from app.services.object_spreadsheet import importer as mod
        from app.services.object_spreadsheet import parsing

        class FakeWorkbook:
            sheetnames = ["Лист1"]

        async def fake_access(db, checked_project_id, principal):
            return None

        async def fake_state(db, checked_project_id):
            return 0, 0

        monkeypatch.setattr(mod, "_validate_xlsx_archive", lambda content: None)
        monkeypatch.setattr(parsing, "load_workbook", lambda *args, **kwargs: FakeWorkbook())
        monkeypatch.setattr(mod, "_ensure_import_access", fake_access)
        monkeypatch.setattr(mod, "_project_import_state", fake_state)

        with pytest.raises(ExcelImportError, match="не найдены листы"):
            await import_objects_from_excel(AsyncMock(), uuid4(), object(), b"xlsx")

    async def test_skip_structural_row_error_continues_to_next(
        self, monkeypatch: pytest.MonkeyPatch
    ):
        from unittest.mock import AsyncMock
        from uuid import uuid4

        from app.services.object_spreadsheet.persistence import _add_rows

        rows = [
            {"_row": 2, "shape": "куб"},
            {
                "_row": 3,
                "shape": "Цилиндр",
                "diameter_mm": 2000,
                "height_mm": 3000,
                "insulation_thickness_mm": 50,
                "insulation_material": "mineral_wool_boards_120",
                "ambient_temperature": -20,
                "process_temperature": 80,
                "min_switch_temperature": -20,
                "heating_height": 3,
                "laying_step": 0.2,
                "wind_speed": 0,
            },
        ]

        async def fake_commit(db, batch, sheet_label):
            return len(batch), ["oid"], []

        monkeypatch.setattr(persistence, "_commit_object_batch", fake_commit)
        db = AsyncMock()
        (
            created,
            next_sort,
            current_count,
            errors,
            object_ids,
            skipped,
            skipped_limit,
            invalid,
            validation_errors,
        ) = await _add_rows(
            db,
            uuid4(),
            "Tanks",
            rows,
            "tank",
            next_sort=0,
            current_count=0,
        )
        assert created == 1
        assert len(errors) == 1
        assert next_sort == 1
        assert current_count == 1
        assert object_ids == ["oid"]
        assert skipped == 0
        assert skipped_limit == 0
        assert invalid == 0
        assert validation_errors == []

    async def test_project_limit_breaks_loop(self, monkeypatch: pytest.MonkeyPatch):
        from unittest.mock import AsyncMock
        from uuid import uuid4

        from app.services.object_spreadsheet.persistence import _add_rows

        rows = [
            {
                "_row": 2,
                "outer_diameter_mm": 108,
                "pipe_length": 50,
                "insulation_thickness_mm": 50,
                "insulation_material": "mineral_wool_boards_120",
                "ambient_temperature": -20,
                "process_temperature": 80,
                "min_switch_temperature": -20,
                "wall_thickness_mm": 4,
                "pipe_material": "carbon_steel",
                "placement": "outdoor",
                "wind_speed": 0,
                "insulation_temperature_basis": "outdoor_winter",
            },
            {
                "_row": 3,
                "outer_diameter_mm": 108,
                "pipe_length": 60,
                "insulation_thickness_mm": 50,
                "insulation_material": "mineral_wool_boards_120",
                "ambient_temperature": -20,
                "process_temperature": 80,
                "min_switch_temperature": -20,
                "wall_thickness_mm": 4,
                "pipe_material": "carbon_steel",
                "placement": "outdoor",
                "wind_speed": 0,
                "insulation_temperature_basis": "outdoor_winter",
            },
        ]

        monkeypatch.setattr(settings, "GUEST_MAX_OBJECTS_PER_PROJECT", 0)
        db = AsyncMock()
        (
            created,
            _,
            current_count,
            errors,
            object_ids,
            skipped,
            skipped_limit,
            invalid,
            validation_errors,
        ) = await _add_rows(
            db,
            uuid4(),
            "Pipes",
            rows,
            "pipe",
            next_sort=0,
            current_count=0,
        )
        assert created == 0
        assert current_count == 0
        assert len(errors) == 1
        assert "Пропущено строк: 2" in errors[0]["message"]
        assert object_ids == []
        assert skipped == 0
        assert skipped_limit == 2
        assert invalid == 0
        assert validation_errors == []

    async def test_unexpected_exception_logged_to_errors(self, monkeypatch: pytest.MonkeyPatch):
        from unittest.mock import AsyncMock
        from uuid import uuid4

        from app.services.object_spreadsheet.persistence import _add_rows

        rows = [
            {
                "_row": 2,
                "outer_diameter_mm": 108,
                "pipe_length": 50,
                "insulation_thickness_mm": 50,
                "insulation_material": "mineral_wool_boards_120",
                "ambient_temperature": -20,
                "process_temperature": 80,
            },
        ]

        def boom_prepare(*args, **kwargs):
            raise RuntimeError("bad prepare")

        monkeypatch.setattr(
            preparation,
            "validate_and_canonicalize_project_object_params",
            boom_prepare,
        )
        db = AsyncMock()
        (
            created,
            _,
            current_count,
            errors,
            object_ids,
            skipped,
            skipped_limit,
            invalid,
            validation_errors,
        ) = await _add_rows(
            db,
            uuid4(),
            "X",
            rows,
            "pipe",
            next_sort=0,
            current_count=0,
        )
        assert created == 0
        assert current_count == 0
        assert "RuntimeError" in errors[0]["message"]
        assert object_ids == []
        assert skipped == 0
        assert skipped_limit == 0
        assert invalid == 0
        assert validation_errors == []
