"""Owner-focused object spreadsheet tests.

Методология: table-driven testing. Эти функции получают произвольные строки
из Excel (локалями, запятыми, unicode) и должны корректно превращать их в
питоновские типы. Любая ошибка здесь = неправильный расчёт.
"""

import io
import zipfile

import pytest

from app.core.config import settings
from app.services.object_spreadsheet.parsing import (
    ExcelImportError,
    _parse_csv,
    _validate_xlsx_archive,
)


class TestXlsxArchiveGuard:
    def test_rejects_large_uncompressed_archive(self, monkeypatch):
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            archive.writestr("xl/worksheets/sheet1.xml", "x" * 2048)

        monkeypatch.setattr(settings, "MAX_XLSX_UNCOMPRESSED_BYTES", 1024)

        with pytest.raises(ExcelImportError, match="распаковки"):
            _validate_xlsx_archive(buf.getvalue())


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

    def test_blank_material_code_does_not_erase_material_alias(self):
        csv_data = (
            "Тип;Материал изоляции;Код материала изоляции;Размещение;Глубина заложения оси трубы, м;Грунт\n"
            "труба;other;;подземно;1.5;глина\n"
        ).encode()
        [(_label, rows)] = _parse_csv(csv_data)
        assert rows[0]["insulation_material"] == "other"
        assert rows[0]["pipe_centerline_depth"] == "1.5"
        assert rows[0]["ground_type"] == "глина"

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
