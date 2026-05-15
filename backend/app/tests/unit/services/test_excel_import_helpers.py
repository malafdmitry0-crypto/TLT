"""Unit-тесты чистых функций-парсеров excel_import_service.

Методология: table-driven testing. Эти функции получают произвольные строки
из Excel (локалями, запятыми, unicode) и должны корректно превращать их в
питоновские типы. Любая ошибка здесь = неправильный расчёт.
"""

import pytest

from app.services.excel_import_service import (
    MATERIAL_ALIASES,
    SHAPE_ALIASES,
    ExcelImportError,
    _build_pipe_params,
    _build_tank_params,
    _norm,
    _parse_csv,
    _resolve_material,
    _resolve_shape,
    _to_float,
    build_template_csv,
    build_template_xlsx,
)


class TestNorm:
    @pytest.mark.parametrize(
        "inp,expected",
        [
            ("Наименование", "наименование"),
            ("  Длина, м  ", "длина, м"),
            ("T°  среды", "t° среды"),
            ("", ""),
            (None, ""),
            (42, "42"),
        ],
    )
    def test_variants(self, inp, expected):
        assert _norm(inp) == expected


class TestToFloat:
    @pytest.mark.parametrize(
        "inp,expected",
        [
            (1, 1.0),
            (1.5, 1.5),
            ("2.5", 2.5),
            ("2,5", 2.5),  # русская запятая как десятичный
            ("  3.14  ", 3.14),
            (None, None),
            ("", None),
            ("abc", None),
        ],
    )
    def test_variants(self, inp, expected):
        assert _to_float(inp) == expected


class TestResolveMaterial:
    @pytest.mark.parametrize(
        "inp,expected",
        [
            ("Минеральная вата", "mineral_wool"),
            ("мин. вата", "mineral_wool"),
            ("минвата", "mineral_wool"),
            ("MINERAL_WOOL", "mineral_wool"),
            ("Пеностекло", "foam_glass"),
            ("ППУ", "polyurethane"),
            ("polyurethane", "polyurethane"),
            ("Аэрогель", "aerogel"),
            ("силикат кальция", "calcium_silicate"),
        ],
    )
    def test_known_aliases(self, inp, expected):
        assert _resolve_material(inp) == expected

    @pytest.mark.parametrize("inp", ["", None, "некий материал"])
    def test_unknown_returns_none(self, inp):
        assert _resolve_material(inp) is None


class TestResolveShape:
    @pytest.mark.parametrize(
        "inp,expected",
        [
            ("Цилиндр", "cylindrical"),
            ("цилиндрический", "cylindrical"),
            ("cylindrical", "cylindrical"),
            ("Параллелепипед", "rectangular"),
            ("прямоугольный", "rectangular"),
            ("Шар", "spherical"),
            ("сфера", "spherical"),
            ("spherical", "spherical"),
        ],
    )
    def test_known(self, inp, expected):
        assert _resolve_shape(inp) == expected

    def test_unknown_returns_none(self):
        assert _resolve_shape("кубик") is None
        assert _resolve_shape("") is None
        assert _resolve_shape(None) is None


class TestBuildPipeParams:
    def test_full_row_ok(self):
        row = {
            "_row": 2,
            "name": "Т1",
            "outer_diameter_mm": 108,
            "pipe_length": 50,
            "insulation_thickness_mm": 50,
            "insulation_material": "Минеральная вата",
            "ambient_temperature": -20,
            "process_temperature": 80,
        }
        params, err = _build_pipe_params(row)
        assert err is None
        # мм → м
        assert params["outer_diameter"] == pytest.approx(0.108)
        assert params["insulation_thickness"] == pytest.approx(0.05)
        assert params["pipe_length"] == 50
        assert params["insulation_material"] == "mineral_wool"
        assert params["name"] == "Т1"

    def test_missing_required_field_keeps_partial_params(self):
        row = {"_row": 5, "outer_diameter_mm": 108, "pipe_length": 50}
        params, err = _build_pipe_params(row)
        assert err is None
        assert params is not None
        assert params["outer_diameter"] == pytest.approx(0.108)
        assert params["pipe_length"] == 50
        assert "insulation_thickness" not in params

    def test_unknown_material_keeps_object_without_material(self):
        row = {
            "_row": 3,
            "outer_diameter_mm": 108,
            "pipe_length": 50,
            "insulation_thickness_mm": 50,
            "insulation_material": "какой-то-крутой",
            "ambient_temperature": -20,
            "process_temperature": 80,
        }
        params, err = _build_pipe_params(row)
        assert err is None
        assert params is not None
        assert "insulation_material" not in params

    def test_name_stripped(self):
        row = {
            "_row": 2,
            "name": "  Спейс Т  ",
            "outer_diameter_mm": 108,
            "pipe_length": 50,
            "insulation_thickness_mm": 50,
            "insulation_material": "mineral_wool",
            "ambient_temperature": -20,
            "process_temperature": 80,
        }
        params, _ = _build_pipe_params(row)
        assert params["name"] == "Спейс Т"

    def test_russian_decimal_comma_works(self):
        """Пользователи часто пишут 108,5 вместо 108.5 — должно работать."""
        row = {
            "_row": 2,
            "outer_diameter_mm": "108,5",
            "pipe_length": "50,0",
            "insulation_thickness_mm": 50,
            "insulation_material": "mineral_wool",
            "ambient_temperature": -20,
            "process_temperature": 80,
        }
        params, err = _build_pipe_params(row)
        assert err is None
        assert params["outer_diameter"] == pytest.approx(0.1085)


class TestBuildTankParams:
    def test_cylindrical_full(self):
        row = {
            "_row": 2,
            "shape": "Цилиндр",
            "diameter_mm": 2000,
            "height_mm": 3000,
            "insulation_thickness_mm": 80,
            "insulation_material": "mineral_wool",
            "ambient_temperature": -20,
            "process_temperature": 80,
        }
        params, err = _build_tank_params(row)
        assert err is None
        assert params["shape"] == "cylindrical"
        assert params["diameter"] == pytest.approx(2.0)
        assert params["height"] == pytest.approx(3.0)

    def test_rectangular_full(self):
        row = {
            "_row": 2,
            "shape": "Параллелепипед",
            "length_mm": 5000,
            "width_mm": 3000,
            "height_mm": 4000,
            "insulation_thickness_mm": 80,
            "insulation_material": "mineral_wool",
            "ambient_temperature": -20,
            "process_temperature": 60,
        }
        params, err = _build_tank_params(row)
        assert err is None
        assert params["length"] == pytest.approx(5.0)
        assert params["width"] == pytest.approx(3.0)
        assert params["height"] == pytest.approx(4.0)

    def test_spherical_full(self):
        row = {
            "_row": 2,
            "shape": "Шар",
            "diameter_mm": 1500,
            "insulation_thickness_mm": 60,
            "insulation_material": "mineral_wool",
            "ambient_temperature": -20,
            "process_temperature": 50,
        }
        params, err = _build_tank_params(row)
        assert err is None
        assert params["diameter"] == pytest.approx(1.5)

    def test_missing_shape_keeps_partial_params(self):
        row = {"_row": 2, "insulation_thickness_mm": 60}
        params, err = _build_tank_params(row)
        assert err is None
        assert params is not None
        assert params["insulation_thickness"] == pytest.approx(0.06)

    def test_unknown_shape_rejected(self):
        row = {"_row": 2, "shape": "Куб", "insulation_thickness_mm": 60}
        params, err = _build_tank_params(row)
        assert params is None
        assert err is not None
        assert "форма" in err.lower()

    def test_cylindrical_missing_height_keeps_partial_params(self):
        row = {
            "_row": 2,
            "shape": "Цилиндр",
            "diameter_mm": 2000,
            "insulation_thickness_mm": 80,
            "insulation_material": "mineral_wool",
            "ambient_temperature": -20,
            "process_temperature": 80,
        }
        params, err = _build_tank_params(row)
        assert err is None
        assert params is not None
        assert params["shape"] == "cylindrical"
        assert params["diameter"] == pytest.approx(2.0)
        assert "height" not in params

    def test_rectangular_missing_width_keeps_partial_params(self):
        row = {
            "_row": 2,
            "shape": "Параллелепипед",
            "length_mm": 5000,
            "height_mm": 4000,  # width пропущен
            "insulation_thickness_mm": 80,
            "insulation_material": "mineral_wool",
            "ambient_temperature": -20,
            "process_temperature": 60,
        }
        params, err = _build_tank_params(row)
        assert err is None
        assert params is not None
        assert params["shape"] == "rectangular"
        assert params["length"] == pytest.approx(5.0)
        assert params["height"] == pytest.approx(4.0)
        assert "width" not in params


class TestParseCsv:
    def test_rejects_empty(self):
        with pytest.raises(ExcelImportError, match="пустой"):
            _parse_csv(b"")

    def test_rejects_missing_type_column(self):
        with pytest.raises(ExcelImportError, match="Тип"):
            _parse_csv(b"name;value\nfoo;1\n")

    def test_semicolon_delimiter(self):
        csv_data = (
            "Тип;Наименование;Диаметр, мм;Длина, м;Толщина изоляции, мм;"
            "Материал изоляции;T° среды;T° продукта\n"
            "труба;T1;108;50;50;Минеральная вата;-20;80\n"
        ).encode()
        sheets = _parse_csv(csv_data)
        assert len(sheets) == 1
        label, rows = sheets[0]
        assert "Трубопроводы" in label
        assert len(rows) == 1

    def test_comma_delimiter_autodetected(self):
        csv_data = (
            "Тип,Наименование,Форма,Диаметр, мм,Длина, мм,Ширина, мм,"
            "Высота, мм,Толщина изоляции, мм,Материал изоляции,T° среды,T° продукта\n"
        ).encode()
        # Только заголовок — результат пуст, но не падает
        sheets = _parse_csv(csv_data)
        assert sheets == []

    def test_cp1251_decoded(self):
        """Кодировка CP1251 — старый Excel, часто используется в РФ."""
        text = (
            "Тип;Наименование;Диаметр, мм;Длина, м;Толщина изоляции, мм;"
            "Материал изоляции;T° среды;T° продукта\n"
            "труба;T1;108;50;50;Минеральная вата;-20;80\n"
        )
        sheets = _parse_csv(text.encode("cp1251"))
        assert len(sheets) == 1

    def test_ignores_rows_without_type(self):
        csv_data = ("Тип;Наименование\n" "неизвестный_тип;foo\n" "труба;bar\n").encode()
        sheets = _parse_csv(csv_data)
        # Только «труба» попадает — раздел pipes
        # (но без других полей — распарсить в params нельзя, но это уже не дело _parse_csv)
        assert len(sheets) <= 1


class TestTemplateBuilders:
    def test_xlsx_has_both_sheets(self):
        import io

        from openpyxl import load_workbook

        data = build_template_xlsx()
        wb = load_workbook(io.BytesIO(data))
        assert "Трубопроводы" in wb.sheetnames
        assert "Резервуары" in wb.sheetnames
        # Есть хотя бы одна строка с примером данных
        assert wb["Трубопроводы"].max_row >= 2

    def test_csv_starts_with_type_header(self):
        data = build_template_csv()
        text = data.decode("utf-8-sig")
        assert text.splitlines()[0].startswith("Тип")


class TestAliasTables:
    """Консистентность таблиц алиасов."""

    def test_material_aliases_point_to_known_codes(self):
        """Все алиасы материалов должны указывать на коды из insulation.json."""
        from app.reference_data.loader import list_insulation_materials

        known = {m["material"] for m in list_insulation_materials()} | {"other"}
        for alias, code in MATERIAL_ALIASES.items():
            assert code in known, f"Алиас {alias!r} → {code!r} не найден в справочнике"

    def test_shape_aliases_point_to_known_shapes(self):
        for alias, code in SHAPE_ALIASES.items():
            assert code in {
                "cylindrical",
                "rectangular",
                "spherical",
            }, f"Алиас формы {alias!r} → {code!r} неизвестен"


class TestAddRowsHelper:
    """Прямые unit-тесты на _add_rows (внутренний helper import flow)."""

    async def test_skip_structural_row_error_continues_to_next(self):
        from types import SimpleNamespace
        from unittest.mock import AsyncMock
        from uuid import uuid4

        from app.services import excel_import_service as mod
        from app.services.excel_import_service import _add_rows

        rows = [
            {"_row": 2, "shape": "куб"},
            {
                "_row": 3,
                "shape": "Цилиндр",
                "diameter_mm": 108,
                "height_mm": 50,
                "insulation_thickness_mm": 50,
                "insulation_material": "mineral_wool",
                "ambient_temperature": -20,
                "process_temperature": 80,
            },
        ]

        class FakeProjectService:
            def __init__(self, db):
                pass

            async def add_object(self, project_id, payload, principal):
                return SimpleNamespace(
                    id="oid",
                    project_id=project_id,
                    params=payload.params,
                    object_type="tank",
                    results=None,
                    is_valid=False,
                    validation_errors=None,
                )

        original_ps = mod.ProjectService
        mod.ProjectService = FakeProjectService
        try:
            db = AsyncMock()
            db.commit = AsyncMock()
            principal = SimpleNamespace(role="employee", user_id=uuid4(), session_id=None)
            created, next_sort, errors, object_ids = await _add_rows(
                db,
                uuid4(),
                principal,
                "Tanks",
                rows,
                "tank",
                next_sort=0,
            )
            assert created == 1
            assert len(errors) == 1
            assert next_sort == 1
            assert object_ids == ["oid"]
        finally:
            mod.ProjectService = original_ps

    async def test_project_limit_breaks_loop(self):
        from types import SimpleNamespace
        from unittest.mock import AsyncMock
        from uuid import uuid4

        from app.services import excel_import_service as mod
        from app.services.excel_import_service import _add_rows
        from app.services.project_service import ProjectLimitError

        rows = [
            {
                "_row": 2,
                "outer_diameter_mm": 108,
                "pipe_length": 50,
                "insulation_thickness_mm": 50,
                "insulation_material": "mineral_wool",
                "ambient_temperature": -20,
                "process_temperature": 80,
            },
            {
                "_row": 3,
                "outer_diameter_mm": 108,
                "pipe_length": 60,
                "insulation_thickness_mm": 50,
                "insulation_material": "mineral_wool",
                "ambient_temperature": -20,
                "process_temperature": 80,
            },
        ]

        class LimitProjectService:
            def __init__(self, db):
                pass

            async def add_object(self, *a, **kw):
                raise ProjectLimitError("Лимит исчерпан")

        original_ps = mod.ProjectService
        mod.ProjectService = LimitProjectService
        try:
            db = AsyncMock()
            principal = SimpleNamespace(role="guest", session_id="s", user_id=None)
            created, _, errors, object_ids = await _add_rows(
                db,
                uuid4(),
                principal,
                "Pipes",
                rows,
                "pipe",
                next_sort=0,
            )
            assert created == 0
            assert len(errors) == 1  # break после первой ошибки
            assert object_ids == []
        finally:
            mod.ProjectService = original_ps

    async def test_unexpected_exception_logged_to_errors(self):
        from types import SimpleNamespace
        from unittest.mock import AsyncMock
        from uuid import uuid4

        from app.services import excel_import_service as mod
        from app.services.excel_import_service import _add_rows

        rows = [
            {
                "_row": 2,
                "outer_diameter_mm": 108,
                "pipe_length": 50,
                "insulation_thickness_mm": 50,
                "insulation_material": "mineral_wool",
                "ambient_temperature": -20,
                "process_temperature": 80,
            },
        ]

        class BoomService:
            def __init__(self, db):
                pass

            async def add_object(self, *a, **kw):
                raise RuntimeError("DB down")

        original_ps = mod.ProjectService
        mod.ProjectService = BoomService
        try:
            db = AsyncMock()
            principal = SimpleNamespace(role="employee", user_id=uuid4(), session_id=None)
            created, _, errors, object_ids = await _add_rows(
                db,
                uuid4(),
                principal,
                "X",
                rows,
                "pipe",
                next_sort=0,
            )
            assert created == 0
            assert "RuntimeError" in errors[0]["message"]
            assert object_ids == []
        finally:
            mod.ProjectService = original_ps


class TestParseCsvAdvanced:
    def test_only_header_no_data(self):
        csv_data = "Тип;Наименование\n".encode()
        assert _parse_csv(csv_data) == []

    def test_unknown_type_value_skipped(self):
        csv_data = (
            "Тип;Наименование;Диаметр, мм;Длина, м;Толщина изоляции, мм;"
            "Материал изоляции;T° среды;T° продукта\n"
            "странный;X;108;50;50;Минеральная вата;-20;80\n"
        ).encode()
        assert _parse_csv(csv_data) == []

    def test_mixed_pipe_and_tank_in_same_csv(self):
        csv_data = (
            "Тип;Наименование;Диаметр, мм;Длина, м;Толщина изоляции, мм;"
            "Материал изоляции;T° среды;T° продукта;Форма;Длина, мм;Ширина, мм;Высота, мм\n"
            "труба;P1;108;50;50;Минеральная вата;-20;80;;;;\n"
            "резервуар;T1;;;80;Минеральная вата;-20;60;Параллелепипед;5000;3000;4000\n"
        ).encode()
        result = _parse_csv(csv_data)
        labels = [label for label, _ in result]
        assert "Трубопроводы (CSV)" in labels
        assert "Резервуары (CSV)" in labels
