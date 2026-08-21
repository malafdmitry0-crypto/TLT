"""Contract tests for the canonical spreadsheet field descriptor."""

import hashlib
import json

import pytest

from app.services.spreadsheet_schema import (
    CSV_HEADERS,
    PIPE_HEADERS,
    PIPE_ORDER,
    PIPE_TEMPLATE_HEADERS,
    PIPE_XLSX_HEADERS,
    RETIRED_IMPORT_HEADERS,
    TANK_HEADERS,
    TANK_TEMPLATE_HEADERS,
    TANK_XLSX_HEADERS,
    SpreadsheetField,
    export_headers,
    header_maps,
)

PIPE_GOLDEN = (
    "Наименование",
    "Диаметр, мм",
    "Длина, м",
    "Толщина стенки, мм",
    "Материал трубы",
    "λ трубы",
    "Толщина изоляции, мм",
    "Код материала изоляции",
    "λ 1-го слоя",
    "Диапазон температур 1-го слоя, °C",
    "Толщина 2-го слоя, мм",
    "Материал 2-го слоя",
    "λ 2-го слоя",
    "Диапазон температур 2-го слоя, °C",
    "Толщина 3-го слоя, мм",
    "Материал 3-го слоя",
    "λ 3-го слоя",
    "Диапазон температур 3-го слоя, °C",
    "Мин. T° окр. среды",
    "Макс. T° окр. среды",
    "Источник T° среды",
    "Температура грунта",
    "T° продукта",
    "T проп., °C",
    "Размещение",
    "Глубина заложения оси трубы, м",
    "Грунт",
    "λ грунта",
    "Скорость ветра, м/с",
    "Источник скорости ветра",
    "Режим температуры изоляции",
    "Материал покрытия",
    "Климатический регион",
    "Климатический город",
    "Ключ климата",
    "Обеспеченность климата",
    "Kзап",
    "Источник Kзап",
    "Мин. T включения, °C",
    "Количество локальных элементов",
    "L экв., м",
)
TANK_GOLDEN = (
    "Наименование",
    "Форма",
    "Диаметр, мм",
    "Длина, мм",
    "Ширина, мм",
    "Высота, мм",
    "Толщина изоляции, мм",
    "Материал изоляции",
    "Код материала изоляции",
    "Статус материала изоляции",
    "Комментарий материала изоляции",
    "Мин. T° окр. среды",
    "Макс. T° окр. среды",
    "Источник T° среды",
    "T° продукта",
    "T проп., °C",
    "Размещение",
    "Режим температуры изоляции",
    "Климатический регион",
    "Климатический город",
    "Ключ климата",
    "Обеспеченность климата",
    "Kзап",
    "Источник Kзап",
    "Мин. T включения, °C",
    "Высота обогрева, м",
    "Шаг укладки, м",
    "Q доп., Вт",
    "Толщина стенки, мм",
    "λ стенки",
    "Температура грунта",
    "Высота заглубленной части, м",
    "Грунт",
    "λ грунта",
    "Скорость ветра, м/с",
    "Источник скорости ветра",
    "λ 1-го слоя",
    "Диапазон температур 1-го слоя, °C",
    "Толщина 2-го слоя, мм",
    "Материал 2-го слоя",
    "λ 2-го слоя",
    "Диапазон температур 2-го слоя, °C",
    "Толщина 3-го слоя, мм",
    "Материал 3-го слоя",
    "λ 3-го слоя",
    "Диапазон температур 3-го слоя, °C",
)
TANK_TEMPLATE_GOLDEN = (
    "Наименование",
    "Форма",
    "Диаметр, мм",
    "Длина, мм",
    "Ширина, мм",
    "Высота, мм",
    "Толщина изоляции, мм",
    "Материал изоляции",
    "Код материала изоляции",
    "Статус материала изоляции",
    "Комментарий материала изоляции",
    "Мин. T° окр. среды",
    "Макс. T° окр. среды",
    "Источник T° среды",
    "T° продукта",
    "T проп., °C",
    "Размещение",
    "Скорость ветра, м/с",
    "Источник скорости ветра",
    "Режим температуры изоляции",
    "Климатический регион",
    "Климатический город",
    "Ключ климата",
    "Обеспеченность климата",
    "Kзап",
    "Источник Kзап",
    "Мин. T включения, °C",
    "Высота обогрева, м",
    "Шаг укладки, м",
    "Q доп., Вт",
)
CSV_GOLDEN = (
    "Тип",
    "Наименование",
    "Форма",
    "Диаметр, мм",
    "Длина, мм",
    "Ширина, мм",
    "Высота, мм",
    "Длина, м",
    "Толщина изоляции, мм",
    "Материал изоляции",
    "Код материала изоляции",
    "Статус материала изоляции",
    "Комментарий материала изоляции",
    "Мин. T° окр. среды",
    "Макс. T° окр. среды",
    "T° продукта",
    "T проп., °C",
    "Размещение",
    "Режим температуры изоляции",
    "Климатический регион",
    "Климатический город",
    "Ключ климата",
    "Обеспеченность климата",
    "Kзап",
    "Мин. T включения, °C",
    "Высота обогрева, м",
    "Шаг укладки, м",
    "Толщина стенки, мм",
    "Материал трубы",
    "Скорость ветра, м/с",
    "Количество локальных элементов",
    "L экв., м",
    "Q доп., Вт",
    "λ трубы",
    "λ 1-го слоя",
    "Диапазон температур 1-го слоя, °C",
    "Толщина 2-го слоя, мм",
    "Материал 2-го слоя",
    "λ 2-го слоя",
    "Диапазон температур 2-го слоя, °C",
    "Толщина 3-го слоя, мм",
    "Материал 3-го слоя",
    "λ 3-го слоя",
    "Диапазон температур 3-го слоя, °C",
    "Источник T° среды",
    "Температура грунта",
    "Глубина заложения оси трубы, м",
    "Высота заглубленной части, м",
    "Грунт",
    "λ грунта",
    "Источник скорости ветра",
    "Материал покрытия",
    "Источник Kзап",
    "λ стенки",
)

CURRENT_ALIAS_MAPS = {
    "pipe": (109, "3d258a551de69cbe74b4a1cd8348787234854ff2fc393cab6063fc314e6376a5"),
    "tank": (110, "3fa301cfd8ff92ce7a5c33005c793e8b6105513ef293adc69417466113abf27c"),
}


def _alias_map_digest(value: dict[str, str]) -> str:
    payload = json.dumps(
        sorted(value.items()),
        ensure_ascii=False,
        separators=(",", ":"),
    ).encode()
    return hashlib.sha256(payload).hexdigest()


def test_import_maps_preserve_the_current_alias_contract():
    assert PIPE_HEADERS["имя"] == "name"
    assert PIPE_HEADERS["глубина прокладки"] == "pipe_centerline_depth"
    assert "имя" not in TANK_HEADERS
    assert "толщина стенки" not in TANK_HEADERS
    assert TANK_HEADERS["высота заглублённой части, м"] == "tank_buried_height"


@pytest.mark.parametrize(
    ("object_type", "actual"),
    [("pipe", PIPE_HEADERS), ("tank", TANK_HEADERS)],
)
def test_import_maps_preserve_every_current_alias(object_type, actual):
    expected_count, expected_digest = CURRENT_ALIAS_MAPS[object_type]
    assert len(actual) == expected_count
    assert _alias_map_digest(actual) == expected_digest


def test_retired_import_headers_are_not_mapped_to_object_params():
    assert RETIRED_IMPORT_HEADERS.isdisjoint(PIPE_HEADERS)
    assert RETIRED_IMPORT_HEADERS.isdisjoint(TANK_HEADERS)


@pytest.mark.parametrize(
    ("actual", "expected"),
    [
        (PIPE_XLSX_HEADERS, PIPE_GOLDEN),
        (PIPE_TEMPLATE_HEADERS, PIPE_GOLDEN),
        (TANK_XLSX_HEADERS, TANK_GOLDEN),
        (TANK_TEMPLATE_HEADERS, TANK_TEMPLATE_GOLDEN),
        (CSV_HEADERS, CSV_GOLDEN),
    ],
)
def test_export_and_template_headers_are_golden(actual, expected):
    assert actual == expected


def test_export_headers_are_derived_from_the_descriptor():
    assert export_headers("xlsx", "pipe", PIPE_ORDER) == PIPE_XLSX_HEADERS


def test_csv_semantic_union_covers_both_xlsx_exports():
    assert set(PIPE_XLSX_HEADERS) | set(TANK_XLSX_HEADERS) <= set(CSV_HEADERS)


def test_duplicate_semantic_keys_fail_closed():
    field = SpreadsheetField(key="same", export_header="A", aliases=("a",))
    with pytest.raises(ValueError, match="Duplicate spreadsheet semantic key"):
        header_maps((field, field))


def test_ambiguous_normalized_aliases_fail_closed():
    with pytest.raises(ValueError, match="Ambiguous spreadsheet alias"):
        header_maps(
            (
                SpreadsheetField(key="first", aliases=("A",)),
                SpreadsheetField(key="second", aliases=(" a ",)),
            )
        )
