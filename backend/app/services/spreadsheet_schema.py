"""Canonical field descriptors for heat-calculation spreadsheets.

The import aliases and the visible export/template columns deliberately live
in one descriptor.  Import parsing still consumes the same canonical payload
keys as before; this module only removes the parallel header declarations.
"""

from __future__ import annotations

import re
from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Literal

ObjectType = Literal["pipe", "tank"]
Format = Literal["xlsx", "csv"]
OBJECTS: frozenset[ObjectType] = frozenset({"pipe", "tank"})


def normalize_header(value: object) -> str:
    """Match the import service's stable header normalization contract."""

    if value is None:
        return ""
    return re.sub(r"\s+", " ", str(value).strip().lower())


@dataclass(frozen=True)
class SpreadsheetField:
    """One semantic field and all of its spreadsheet representations."""

    key: str
    export_header: str | None = None
    aliases: tuple[str, ...] = ()
    objects: frozenset[ObjectType] = OBJECTS
    unit: str | None = None
    object_aliases: Mapping[ObjectType, tuple[str, ...]] = field(default_factory=dict)
    format_headers: Mapping[str, tuple[str, ...]] = field(default_factory=dict)

    def aliases_for(self, object_type: ObjectType) -> tuple[str, ...]:
        if object_type not in self.objects:
            return ()
        return self.aliases + self.object_aliases.get(object_type, ())

    def headers_for(self, fmt: Format, object_type: ObjectType) -> tuple[str, ...]:
        # CSV is one mixed-object table, so its header contains the union of
        # pipe- and tank-specific columns. XLSX sheets remain applicability
        # aware and only emit their own fields.
        if object_type not in self.objects and fmt != "csv":
            return ()
        override = self.format_headers.get(f"{fmt}:{object_type}")
        if override is not None:
            return override
        return (self.export_header,) if self.export_header else ()


def _aliases(value: str) -> tuple[str, ...]:
    return tuple(part.strip() for part in value.split("|"))


def _field(
    key: str,
    header: str | None,
    aliases: str = "",
    *,
    objects: frozenset[ObjectType] = OBJECTS,
    unit: str | None = None,
    object_aliases: Mapping[ObjectType, tuple[str, ...]] | None = None,
    format_headers: Mapping[str, tuple[str, ...]] | None = None,
) -> SpreadsheetField:
    return SpreadsheetField(
        key=key,
        export_header=header,
        aliases=_aliases(aliases) if aliases else (),
        objects=objects,
        unit=unit,
        object_aliases=object_aliases or {},
        format_headers=format_headers or {},
    )


# A semantic key is declared exactly once. Object-specific aliases preserve
# the old accepted vocabulary without creating a second field table.
FIELDS: tuple[SpreadsheetField, ...] = (
    _field("name", "Наименование", "наименование|название", object_aliases={"pipe": ("имя",)}),
    _field(
        "outer_diameter_mm",
        "Диаметр, мм",
        "диаметр, мм|диаметр мм|диаметр|ø, мм|ø мм",
        objects=frozenset({"pipe"}),
        unit="мм",
    ),
    _field(
        "pipe_length",
        "Длина, м",
        "длина, м|длина м|длина|l, м",
        objects=frozenset({"pipe"}),
        unit="м",
    ),
    _field("shape", "Форма", "форма", objects=frozenset({"tank"})),
    _field(
        "diameter_mm",
        "Диаметр, мм",
        "диаметр, мм|диаметр мм|диаметр",
        objects=frozenset({"tank"}),
        unit="мм",
    ),
    _field(
        "length_mm", "Длина, мм", "длина, мм|длина мм|длина", objects=frozenset({"tank"}), unit="мм"
    ),
    _field(
        "width_mm",
        "Ширина, мм",
        "ширина, мм|ширина мм|ширина",
        objects=frozenset({"tank"}),
        unit="мм",
    ),
    _field(
        "height_mm",
        "Высота, мм",
        "высота, мм|высота мм|высота",
        objects=frozenset({"tank"}),
        unit="мм",
    ),
    _field(
        "wall_thickness_mm",
        "Толщина стенки, мм",
        "толщина стенки, мм|толщина стенки мм",
        unit="мм",
        object_aliases={"pipe": ("толщина стенки",)},
    ),
    _field(
        "wall_lambda",
        "λ стенки",
        "λ стенки|лямбда стенки",
        objects=frozenset({"tank"}),
        unit="Вт/(м·К)",
    ),
    _field("pipe_material", "Материал трубы", "материал трубы", objects=frozenset({"pipe"})),
    _field(
        "pipe_lambda",
        "λ трубы",
        "λ трубы|лямбда трубы",
        objects=frozenset({"pipe"}),
        unit="Вт/(м·К)",
    ),
    _field(
        "insulation_thickness_mm",
        "Толщина изоляции, мм",
        "толщина изоляции, мм|толщина изоляции мм|толщина изоляции|δ, мм|δ мм",
        unit="мм",
    ),
    _field(
        "insulation_material",
        "Материал изоляции",
        "материал изоляции|код материала изоляции|материал",
        format_headers={
            "xlsx:pipe": ("Код материала изоляции",),
            "xlsx:tank": (
                "Материал изоляции",
                "Код материала изоляции",
                "Статус материала изоляции",
                "Комментарий материала изоляции",
            ),
            "csv:pipe": (
                "Материал изоляции",
                "Код материала изоляции",
                "Статус материала изоляции",
                "Комментарий материала изоляции",
            ),
            "csv:tank": (
                "Материал изоляции",
                "Код материала изоляции",
                "Статус материала изоляции",
                "Комментарий материала изоляции",
            ),
        },
    ),
    _field("first_insulation_lambda", "λ 1-го слоя", "λ 1-го слоя", unit="Вт/(м·К)"),
    _field(
        "first_insulation_temperature_range",
        "Диапазон температур 1-го слоя, °C",
        "диапазон температур 1-го слоя, °c",
        unit="°C",
    ),
    _field(
        "second_insulation_thickness_mm",
        "Толщина 2-го слоя, мм",
        "толщина 2-го слоя, мм|толщина 2-го слоя",
        unit="мм",
    ),
    _field("second_insulation_material", "Материал 2-го слоя", "материал 2-го слоя"),
    _field("second_insulation_lambda", "λ 2-го слоя", "λ 2-го слоя", unit="Вт/(м·К)"),
    _field(
        "second_insulation_temperature_range",
        "Диапазон температур 2-го слоя, °C",
        "диапазон температур 2-го слоя, °c",
        unit="°C",
    ),
    _field(
        "third_insulation_thickness_mm",
        "Толщина 3-го слоя, мм",
        "толщина 3-го слоя, мм|толщина 3-го слоя",
        unit="мм",
    ),
    _field("third_insulation_material", "Материал 3-го слоя", "материал 3-го слоя"),
    _field("third_insulation_lambda", "λ 3-го слоя", "λ 3-го слоя", unit="Вт/(м·К)"),
    _field(
        "third_insulation_temperature_range",
        "Диапазон температур 3-го слоя, °C",
        "диапазон температур 3-го слоя, °c",
        unit="°C",
    ),
    _field("insulation_cover_material", "Материал покрытия", "материал покрытия"),
    _field(
        "ambient_temperature",
        "Мин. T° окр. среды",
        "мин. t° окр. среды|мин t° окр. среды|т° среды|т среды|t° среды|t среды|температура среды",
        unit="°C",
    ),
    _field(
        "max_ambient_temperature",
        "Макс. T° окр. среды",
        "макс. t° окр. среды|макс t° окр. среды",
        unit="°C",
    ),
    _field(
        "ambient_temperature_source",
        "Источник T° среды",
        "источник t° среды|источник т° среды|источник температуры среды|ambient_temperature_source",
    ),
    _field(
        "ground_temperature",
        "Температура грунта",
        "температура грунта|t° грунта",
        objects=OBJECTS,
        unit="°C",
    ),
    _field(
        "process_temperature",
        "T° продукта",
        "т° продукта|т продукта|t° продукта|t продукта|температура продукта|требуемая температура|требуемая температура трубы|температура поддержания|т° поддержания|t° поддержания",
        unit="°C",
    ),
    _field(
        "vapor_temperature",
        "T проп., °C",
        "t проп|t проп.|t° проп|t° пропарки|t проп., °c|температура пропарки",
        unit="°C",
    ),
    _field(
        "maintain_temperature",
        None,
        "t3|t3, °c|t3 поддержания|температура поддержания t3",
        unit="°C",
    ),
    _field(
        "max_process_temperature",
        None,
        "макс. допуст. t° продукта|макс допуст t° продукта",
        unit="°C",
    ),
    _field(
        "placement",
        "Размещение",
        "размещение",
        object_aliases={"pipe": ("размещение трубопровода",), "tank": ("размещение резервуара",)},
    ),
    _field(
        "pipe_centerline_depth",
        "Глубина заложения оси трубы, м",
        "глубина прокладки|глубина заложения оси трубы, м|глубина заложения оси трубы",
        objects=frozenset({"pipe"}),
        unit="м",
    ),
    _field(
        "tank_buried_height",
        "Высота заглубленной части, м",
        "высота заглубленной части, м|высота заглублённой части, м",
        objects=frozenset({"tank"}),
        unit="м",
    ),
    _field("ground_type", "Грунт", "грунт"),
    _field("ground_conductivity", "λ грунта", "λ грунта", unit="Вт/(м·К)"),
    _field("wind_speed", "Скорость ветра, м/с", "скорость ветра, м/с|скорость ветра", unit="м/с"),
    _field(
        "wind_speed_source",
        "Источник скорости ветра",
        "источник скорости ветра|источник ветра|wind_speed_source",
    ),
    _field(
        "insulation_temperature_basis",
        "Режим температуры изоляции",
        "режим температуры изоляции|tm изоляции|tм изоляции",
    ),
    _field("safety_factor", "Kзап", "kзап|k зап|коэффициент запаса"),
    _field(
        "safety_factor_source",
        "Источник Kзап",
        "источник kзап|источник коэффициента запаса|safety_factor_source",
    ),
    _field("supply_voltage", None, "рабочее напряжение"),
    _field(
        "min_switch_temperature",
        "Мин. T включения, °C",
        "мин. t включения, °c|мин t включения|минимальная температура включения",
        unit="°C",
    ),
    _field("climate_region", "Климатический регион", "климатический регион|регион климата"),
    _field("climate_city", "Климатический город", "климатический город|город климата|климат"),
    _field("climate_key", "Ключ климата", "ключ климата|climate_key"),
    _field(
        "climate_temperature_basis",
        "Обеспеченность климата",
        "обеспеченность климата|температура климата",
    ),
    _field(
        "num_local_elements",
        "Количество локальных элементов",
        "количество локальных элементов|локальных элементов",
        objects=frozenset({"pipe"}),
    ),
    _field(
        "local_element_equiv_length",
        "L экв., м",
        "l экв., м|l экв. м|эквивалентная длина локального элемента|эквивалентная длина, м",
        objects=frozenset({"pipe"}),
        unit="м",
    ),
    _field(
        "heating_height",
        "Высота обогрева, м",
        "высота обогрева, м|высота обогрева",
        objects=frozenset({"tank"}),
        unit="м",
    ),
    _field(
        "laying_step",
        "Шаг укладки, м",
        "шаг укладки, м|шаг укладки",
        objects=frozenset({"tank"}),
        unit="м",
    ),
    _field(
        "q_additional",
        "Q доп., Вт",
        "q доп., вт|q доп, вт|дополнительные теплопотери, вт",
        objects=frozenset({"tank"}),
        unit="Вт",
    ),
)

TYPE_FIELD = _field("type", "Тип", "тип|type")

PIPE_ORDER = (
    "name",
    "outer_diameter_mm",
    "pipe_length",
    "wall_thickness_mm",
    "pipe_material",
    "pipe_lambda",
    "insulation_thickness_mm",
    "insulation_material",
    "first_insulation_lambda",
    "first_insulation_temperature_range",
    "second_insulation_thickness_mm",
    "second_insulation_material",
    "second_insulation_lambda",
    "second_insulation_temperature_range",
    "third_insulation_thickness_mm",
    "third_insulation_material",
    "third_insulation_lambda",
    "third_insulation_temperature_range",
    "ambient_temperature",
    "max_ambient_temperature",
    "ambient_temperature_source",
    "ground_temperature",
    "process_temperature",
    "vapor_temperature",
    "placement",
    "pipe_centerline_depth",
    "ground_type",
    "ground_conductivity",
    "wind_speed",
    "wind_speed_source",
    "insulation_temperature_basis",
    "insulation_cover_material",
    "climate_region",
    "climate_city",
    "climate_key",
    "climate_temperature_basis",
    "safety_factor",
    "safety_factor_source",
    "min_switch_temperature",
    "num_local_elements",
    "local_element_equiv_length",
)
TANK_ORDER = (
    "name",
    "shape",
    "diameter_mm",
    "length_mm",
    "width_mm",
    "height_mm",
    "insulation_thickness_mm",
    "insulation_material",
    "ambient_temperature",
    "max_ambient_temperature",
    "ambient_temperature_source",
    "process_temperature",
    "vapor_temperature",
    "placement",
    "insulation_temperature_basis",
    "climate_region",
    "climate_city",
    "climate_key",
    "climate_temperature_basis",
    "safety_factor",
    "safety_factor_source",
    "min_switch_temperature",
    "heating_height",
    "laying_step",
    "q_additional",
    "wall_thickness_mm",
    "wall_lambda",
    "ground_temperature",
    "tank_buried_height",
    "ground_type",
    "ground_conductivity",
    "wind_speed",
    "wind_speed_source",
    "first_insulation_lambda",
    "first_insulation_temperature_range",
    "second_insulation_thickness_mm",
    "second_insulation_material",
    "second_insulation_lambda",
    "second_insulation_temperature_range",
    "third_insulation_thickness_mm",
    "third_insulation_material",
    "third_insulation_lambda",
    "third_insulation_temperature_range",
)
TANK_XLSX_TEMPLATE_ORDER = (
    "name",
    "shape",
    "diameter_mm",
    "length_mm",
    "width_mm",
    "height_mm",
    "insulation_thickness_mm",
    "insulation_material",
    "ambient_temperature",
    "max_ambient_temperature",
    "ambient_temperature_source",
    "process_temperature",
    "vapor_temperature",
    "placement",
    "wind_speed",
    "wind_speed_source",
    "insulation_temperature_basis",
    "climate_region",
    "climate_city",
    "climate_key",
    "climate_temperature_basis",
    "safety_factor",
    "safety_factor_source",
    "min_switch_temperature",
    "heating_height",
    "laying_step",
    "q_additional",
)
CSV_ORDER = (
    "type",
    "name",
    "shape",
    "diameter_mm",
    "length_mm",
    "width_mm",
    "height_mm",
    "pipe_length",
    "insulation_thickness_mm",
    "insulation_material",
    "ambient_temperature",
    "max_ambient_temperature",
    "process_temperature",
    "vapor_temperature",
    "placement",
    "insulation_temperature_basis",
    "climate_region",
    "climate_city",
    "climate_key",
    "climate_temperature_basis",
    "safety_factor",
    "min_switch_temperature",
    "heating_height",
    "laying_step",
    "wall_thickness_mm",
    "pipe_material",
    "wind_speed",
    "num_local_elements",
    "local_element_equiv_length",
    "q_additional",
    # Keep the legacy prefix above stable; these columns complete the union
    # of the pipe/tank XLSX export fields for mixed CSV rows.
    "pipe_lambda",
    "first_insulation_lambda",
    "first_insulation_temperature_range",
    "second_insulation_thickness_mm",
    "second_insulation_material",
    "second_insulation_lambda",
    "second_insulation_temperature_range",
    "third_insulation_thickness_mm",
    "third_insulation_material",
    "third_insulation_lambda",
    "third_insulation_temperature_range",
    "ambient_temperature_source",
    "ground_temperature",
    "pipe_centerline_depth",
    "tank_buried_height",
    "ground_type",
    "ground_conductivity",
    "wind_speed_source",
    "insulation_cover_material",
    "safety_factor_source",
    "wall_lambda",
)
# ``maintain_temperature``, ``max_process_temperature`` and ``supply_voltage``
# remain import-only legacy aliases: neither XLSX export emits them, so they
# are intentionally excluded from this CSV union as well.


def _index_fields(fields: tuple[SpreadsheetField, ...]) -> dict[str, SpreadsheetField]:
    indexed: dict[str, SpreadsheetField] = {}
    for descriptor in fields:
        if descriptor.key in indexed:
            raise ValueError(f"Duplicate spreadsheet semantic key: {descriptor.key}")
        indexed[descriptor.key] = descriptor
    return indexed


def header_maps(fields: tuple[SpreadsheetField, ...] = FIELDS) -> dict[ObjectType, dict[str, str]]:
    """Build import maps and fail closed on ambiguous normalized aliases."""

    indexed = _index_fields(fields)
    result: dict[ObjectType, dict[str, str]] = {"pipe": {}, "tank": {}}
    for descriptor in indexed.values():
        for object_type in descriptor.objects:
            target = result[object_type]
            for alias in descriptor.aliases_for(object_type):
                normalized = normalize_header(alias)
                previous = target.get(normalized)
                if previous is not None and previous != descriptor.key:
                    raise ValueError(
                        f"Ambiguous spreadsheet alias {alias!r}: {previous} vs {descriptor.key}"
                    )
                target[normalized] = descriptor.key
    return result


def export_headers(fmt: Format, object_type: ObjectType, order: tuple[str, ...]) -> tuple[str, ...]:
    indexed = _index_fields((*FIELDS, TYPE_FIELD))
    headers: list[str] = []
    for key in order:
        descriptor = indexed[key]
        headers.extend(descriptor.headers_for(fmt, object_type))
    return tuple(headers)


_MAPS = header_maps()
PIPE_HEADERS = _MAPS["pipe"]
TANK_HEADERS = _MAPS["tank"]
TYPE_HEADERS = frozenset(normalize_header(alias) for alias in TYPE_FIELD.aliases)
PIPE_XLSX_HEADERS = export_headers("xlsx", "pipe", PIPE_ORDER)
TANK_XLSX_HEADERS = export_headers("xlsx", "tank", TANK_ORDER)
PIPE_TEMPLATE_HEADERS = export_headers("xlsx", "pipe", PIPE_ORDER)
TANK_TEMPLATE_HEADERS = export_headers("xlsx", "tank", TANK_XLSX_TEMPLATE_ORDER)
CSV_HEADERS = export_headers("csv", "pipe", CSV_ORDER)
