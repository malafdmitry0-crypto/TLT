"""Backend query layer for HeatCalc object table."""

from __future__ import annotations

from collections import Counter
from collections.abc import Callable
from dataclasses import dataclass
from functools import cmp_to_key
from math import ceil
from typing import Any, Literal
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import CurrentPrincipal
from app.models.project_object import ProjectObject
from app.reference_data.loader import (
    list_insulation_materials,
    list_pipe_materials,
    list_soil_conductivity,
)
from app.schemas.project import (
    ObjectQueryCapabilitiesResponse,
    ObjectQueryDefaultSort,
    ObjectQueryFieldCapability,
    ObjectQueryFieldFilterCapability,
    ObjectQueryFieldOptions,
    ObjectQueryFieldSortCapability,
    ObjectQueryOptionItem,
    ObjectQuerySearchCapability,
    ProjectObjectsPageInfo,
    ProjectObjectsQueryCounts,
    ProjectObjectsQueryEcho,
    ProjectObjectsQueryRequest,
    ProjectObjectsQueryResponse,
)
from app.services.project_service import ProjectService

FieldType = Literal["display", "text", "number", "enum", "boolean"]
SortType = Literal["text", "number", "label", "enum_rank"]
OptionMode = Literal["inline", "dictionary", "project_values", "derived"]


class ObjectQueryValidationError(ValueError):
    """Некорректный query для таблицы объектов."""


@dataclass(frozen=True)
class FieldDef:
    key: str
    label: str
    title: str
    object_types: tuple[str, ...]
    data_type: FieldType
    value: Callable[[ProjectObject], Any]
    unit: str | None = None
    filter_ops: tuple[str, ...] = ()
    sortable: bool = False
    sort_type: SortType | None = None
    options_mode: OptionMode | None = None
    static_options: tuple[tuple[Any, str], ...] = ()
    filter_reason: str | None = None
    sort_reason: str | None = None

    @property
    def filterable(self) -> bool:
        return len(self.filter_ops) > 0


DN_TABLE: tuple[tuple[float, int], ...] = (
    (10.2, 6),
    (13.5, 8),
    (17.2, 10),
    (21.3, 15),
    (26.9, 20),
    (33.7, 25),
    (42.3, 32),
    (48.3, 40),
    (60.3, 50),
    (76.1, 65),
    (88.9, 80),
    (101.6, 90),
    (114.3, 100),
    (127.0, 110),
    (139.7, 125),
    (168.3, 150),
    (193.7, 175),
    (219.1, 200),
    (244.5, 225),
    (273.0, 250),
    (323.9, 300),
    (355.6, 350),
    (406.4, 400),
    (457.0, 450),
    (508.0, 500),
    (610.0, 600),
    (711.0, 700),
    (813.0, 800),
    (914.0, 900),
    (1016.0, 1000),
)

PLACEMENT_OPTIONS = (
    ("outdoor", "Открыто"),
    ("indoor", "В помещении"),
    ("underground", "Подземно"),
)
SHAPE_OPTIONS = (
    ("cylindrical", "Цилиндр"),
    ("rectangular", "Прямоуг."),
    ("spherical", "Сфера"),
)
SOURCE_OPTIONS = (("manual", "вручную"), ("climate", "из климата"))
ENVIRONMENT_OPTIONS = (("normal", "Нормальная"), ("aggressive", "Агрессивная"))
ZONE_OPTIONS = (("safe", "Безопасная"), ("hazardous", "Взрывоопасная"))
LAMBDA_MODE_OPTIONS = (("reference", "Справ."), ("manual", "Ручн."))
STEAM_OPTIONS = (("yes", "Да"), ("no", "Нет"), (True, "Да"), (False, "Нет"))
HEAT_LOSS_STATUS_OPTIONS = (
    ("calculated", "Рассчитан"),
    ("error", "Ошибка"),
    ("not_calculated", "Не рассчитан"),
)
CAPABILITIES_SAMPLE_LIMIT = 1000


def _param(key: str) -> Callable[[ProjectObject], Any]:
    return lambda obj: obj.params.get(key)


def _result(key: str) -> Callable[[ProjectObject], Any]:
    return lambda obj: obj.results.get(key) if isinstance(obj.results, dict) else None


def _param_m_as_mm(key: str) -> Callable[[ProjectObject], Any]:
    return (
        lambda obj: _to_float(obj.params.get(key)) * 1000
        if _to_float(obj.params.get(key)) is not None
        else None
    )


def _placement(obj: ProjectObject) -> Any:
    return obj.params.get("placement") or obj.params.get("location")


def _heat_loss_status(obj: ProjectObject) -> str:
    if obj.is_valid and obj.results is not None:
        return "calculated"
    if obj.validation_errors:
        return "error"
    return "not_calculated"


def _layer(obj: ProjectObject, index: int) -> dict[str, Any] | None:
    layers = obj.params.get("insulation_layers")
    if isinstance(layers, list) and index < len(layers) and isinstance(layers[index], dict):
        return layers[index]
    return None


def _layer_value(index: int, key: str) -> Callable[[ProjectObject], Any]:
    return lambda obj: (_layer(obj, index) or {}).get(key)


def _layer_m_as_mm(index: int, key: str) -> Callable[[ProjectObject], Any]:
    def getter(obj: ProjectObject) -> float | None:
        value = _to_float((_layer(obj, index) or {}).get(key))
        return value * 1000 if value is not None else None

    return getter


def _insulation_layer_count(obj: ProjectObject) -> int:
    explicit = _to_float(obj.params.get("insulation_layer_count"))
    if explicit is not None:
        return int(explicit)
    layers = obj.params.get("insulation_layers")
    if isinstance(layers, list) and len(layers) > 0:
        return len(layers)
    return 1


def _find_dn(outer_diameter_mm: float | None) -> int | None:
    if outer_diameter_mm is None or outer_diameter_mm <= 0:
        return None
    best_dn: int | None = None
    best_diff = float("inf")
    for od_mm, dn in DN_TABLE:
        diff = abs(od_mm - outer_diameter_mm)
        if diff < best_diff:
            best_diff = diff
            best_dn = dn
    return best_dn if best_diff <= 5 else None


def _pipe_dn(obj: ProjectObject) -> int | None:
    outer_diameter = _to_float(obj.params.get("outer_diameter"))
    return _find_dn(outer_diameter * 1000 if outer_diameter is not None else None)


def _tank_dimensions(obj: ProjectObject) -> str | None:
    shape = obj.params.get("shape")
    if shape == "cylindrical":
        return f"Ø{_fmt_mm(obj.params.get('diameter'))} × H{_fmt_mm(obj.params.get('height'))} мм"
    if shape == "rectangular":
        return (
            f"{_fmt_mm(obj.params.get('length'))} × {_fmt_mm(obj.params.get('width'))} "
            f"× {_fmt_mm(obj.params.get('height'))} мм"
        )
    if shape == "spherical":
        return f"Ø{_fmt_mm(obj.params.get('diameter'))} мм"
    return None


def _to_float(value: Any) -> float | None:
    if value is None or value == "":
        return None
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return None
    return numeric if numeric == numeric else None


def _is_empty(value: Any) -> bool:
    return value is None or value == "" or value == "—"


def _fmt_mm(value: Any) -> str:
    numeric = _to_float(value)
    return "—" if numeric is None else f"{numeric * 1000:,.0f}".replace(",", " ")


def _normal_text(value: Any) -> str:
    if _is_empty(value):
        return ""
    return str(value).strip().lower()


def _label_from_options(value: Any, options: tuple[tuple[Any, str], ...]) -> str:
    for option_value, label in options:
        if value == option_value or str(value) == str(option_value):
            return label
    return "" if _is_empty(value) else str(value)


def _insulation_options() -> tuple[tuple[Any, str], ...]:
    options: list[tuple[Any, str]] = []
    for item in list_insulation_materials():
        label = str(item.get("name") or item.get("material"))
        if item.get("density_kg_m3") is not None:
            label = f"{label}, {item['density_kg_m3']} кг/м³"
        options.append((item.get("material"), label))
    options.append(("other", "other"))
    return tuple(options)


def _pipe_material_options() -> tuple[tuple[Any, str], ...]:
    return tuple(
        (item.get("material"), str(item.get("name") or item.get("material")))
        for item in list_pipe_materials()
    )


def _soil_options() -> tuple[tuple[Any, str], ...]:
    seen: set[str] = set()
    options: list[tuple[Any, str]] = []
    for item in list_soil_conductivity():
        value = str(item.get("soil_code") or item.get("soil") or "")
        if not value or value in seen:
            continue
        seen.add(value)
        options.append((value, str(item.get("soil") or value)))
    return tuple(options)


def _field_label(field: FieldDef, value: Any) -> str:
    if field.key == "pipe_dn":
        return f"DN{value}" if value is not None else ""
    if field.static_options:
        return _label_from_options(value, field.static_options)
    return "" if _is_empty(value) else str(value)


def _common_fields(object_type: str) -> list[FieldDef]:
    return [
        FieldDef(
            "index",
            "Номер строки",
            "№",
            (object_type,),
            "display",
            lambda _obj: None,
            filter_reason="display_only",
            sort_reason="page_position",
        ),
        FieldDef(
            "type",
            "Тип объекта",
            "Тип",
            (object_type,),
            "display",
            lambda _obj: object_type,
            filter_reason="object_type_query",
            sort_reason="object_type_query",
        ),
        FieldDef(
            "heat_loss_status",
            "Статус расчёта",
            "Статус",
            (object_type,),
            "enum",
            _heat_loss_status,
            filter_ops=("in",),
            sortable=True,
            sort_type="label",
            options_mode="inline",
            static_options=HEAT_LOSS_STATUS_OPTIONS,
        ),
        FieldDef(
            "name",
            "Наименование",
            "Наименование",
            (object_type,),
            "text",
            _param("name"),
            filter_ops=("contains",),
            sortable=True,
            sort_type="text",
        ),
        FieldDef(
            "placement",
            "Размещение",
            "Размещение",
            (object_type,),
            "enum",
            _placement,
            filter_ops=("in",),
            sortable=True,
            sort_type="label",
            options_mode="inline",
            static_options=PLACEMENT_OPTIONS,
        ),
        FieldDef(
            "insulation_layer_count",
            "Количество слоёв ИЗ",
            "Слоёв ИЗ",
            (object_type,),
            "number",
            _insulation_layer_count,
            filter_ops=("range",),
            sortable=True,
            sort_type="number",
        ),
        FieldDef(
            "insulation_thickness",
            "Толщина ИЗ",
            "δ ИЗ, мм",
            (object_type,),
            "number",
            _param_m_as_mm("insulation_thickness"),
            unit="mm",
            filter_ops=("range",),
            sortable=True,
            sort_type="number",
        ),
        FieldDef(
            "insulation_material",
            "Материал ИЗ",
            "Материал ИЗ",
            (object_type,),
            "enum",
            _param("insulation_material"),
            filter_ops=("in",),
            sortable=True,
            sort_type="label",
            options_mode="dictionary",
            static_options=_insulation_options(),
        ),
        FieldDef(
            "first_insulation_lambda",
            "λ 1-го слоя",
            "λ 1 слоя",
            (object_type,),
            "number",
            _layer_value(0, "conductivity"),
            unit="W/mK",
            filter_ops=("range",),
            sortable=True,
            sort_type="number",
        ),
        FieldDef(
            "second_insulation_thickness",
            "Толщина 2-го слоя",
            "δ 2 ИЗ, мм",
            (object_type,),
            "number",
            _layer_m_as_mm(1, "thickness"),
            unit="mm",
            filter_ops=("range",),
            sortable=True,
            sort_type="number",
        ),
        FieldDef(
            "second_insulation_material",
            "Материал 2-го слоя",
            "Материал 2 ИЗ",
            (object_type,),
            "enum",
            _layer_value(1, "material"),
            filter_ops=("in",),
            sortable=True,
            sort_type="label",
            options_mode="dictionary",
            static_options=_insulation_options(),
        ),
        FieldDef(
            "second_insulation_lambda",
            "λ 2-го слоя",
            "λ 2 слоя",
            (object_type,),
            "number",
            _layer_value(1, "conductivity"),
            unit="W/mK",
            filter_ops=("range",),
            sortable=True,
            sort_type="number",
        ),
        FieldDef(
            "third_insulation_thickness",
            "Толщина 3-го слоя",
            "δ 3 ИЗ, мм",
            (object_type,),
            "number",
            _layer_m_as_mm(2, "thickness"),
            unit="mm",
            filter_ops=("range",),
            sortable=True,
            sort_type="number",
        ),
        FieldDef(
            "third_insulation_material",
            "Материал 3-го слоя",
            "Материал 3 ИЗ",
            (object_type,),
            "enum",
            _layer_value(2, "material"),
            filter_ops=("in",),
            sortable=True,
            sort_type="label",
            options_mode="dictionary",
            static_options=_insulation_options(),
        ),
        FieldDef(
            "third_insulation_lambda",
            "λ 3-го слоя",
            "λ 3 слоя",
            (object_type,),
            "number",
            _layer_value(2, "conductivity"),
            unit="W/mK",
            filter_ops=("range",),
            sortable=True,
            sort_type="number",
        ),
        FieldDef(
            "insulation_cover_material",
            "Материал покрытия",
            "Покрытие",
            (object_type,),
            "text",
            _param("insulation_cover_material"),
            filter_ops=("contains", "in"),
            sortable=True,
            sort_type="text",
            options_mode="project_values",
        ),
        FieldDef(
            "process_temperature",
            "Температура поддержания",
            "T подд.",
            (object_type,),
            "number",
            _param("process_temperature"),
            unit="°C",
            filter_ops=("range",),
            sortable=True,
            sort_type="number",
        ),
        FieldDef(
            "ambient_temperature",
            "Температура окружающей среды",
            "T окр.",
            (object_type,),
            "number",
            _param("ambient_temperature"),
            unit="°C",
            filter_ops=("range",),
            sortable=True,
            sort_type="number",
        ),
        FieldDef(
            "ambient_temperature_source",
            "Источник T окр.",
            "T окр. ист.",
            (object_type,),
            "enum",
            _param("ambient_temperature_source"),
            filter_ops=("in",),
            options_mode="inline",
            static_options=SOURCE_OPTIONS,
            sort_reason="value_source",
        ),
        FieldDef(
            "max_ambient_temperature",
            "Макс. T окружающей среды",
            "Макс. T окр.",
            (object_type,),
            "number",
            _param("max_ambient_temperature"),
            unit="°C",
            filter_ops=("range",),
            sortable=True,
            sort_type="number",
        ),
        FieldDef(
            "max_process_temperature",
            "Макс. допуст. T продукта",
            "Макс. T прод.",
            (object_type,),
            "number",
            _param("max_process_temperature"),
            unit="°C",
            filter_ops=("range",),
            sortable=True,
            sort_type="number",
        ),
        FieldDef(
            "wind_speed",
            "Скорость ветра",
            "Ветер",
            (object_type,),
            "number",
            _param("wind_speed"),
            unit="m/s",
            filter_ops=("range",),
            sortable=True,
            sort_type="number",
        ),
        FieldDef(
            "wind_speed_source",
            "Источник ветра",
            "Ветер ист.",
            (object_type,),
            "enum",
            _param("wind_speed_source"),
            filter_ops=("in",),
            options_mode="inline",
            static_options=SOURCE_OPTIONS,
            sort_reason="value_source",
        ),
        FieldDef(
            "alpha_vnesh",
            "α внеш",
            "α внеш",
            (object_type,),
            "number",
            _param("alpha_vnesh"),
            unit="W/m²K",
            filter_ops=("range",),
            sortable=True,
            sort_type="number",
        ),
        FieldDef(
            "environment",
            "Среда",
            "Среда",
            (object_type,),
            "enum",
            _param("environment"),
            filter_ops=("in",),
            sortable=True,
            sort_type="label",
            options_mode="inline",
            static_options=ENVIRONMENT_OPTIONS,
        ),
        FieldDef(
            "zone_classification",
            "Классификация зоны",
            "Зона",
            (object_type,),
            "enum",
            _param("zone_classification"),
            filter_ops=("in",),
            sortable=True,
            sort_type="label",
            options_mode="inline",
            static_options=ZONE_OPTIONS,
        ),
        FieldDef(
            "temperature_group",
            "Температурная группа",
            "Темп. группа",
            (object_type,),
            "text",
            _param("temperature_group"),
            filter_ops=("contains", "in"),
            sortable=True,
            sort_type="text",
            options_mode="project_values",
        ),
        FieldDef(
            "climate_city",
            "Климатический город",
            "Климат",
            (object_type,),
            "text",
            _param("climate_city"),
            filter_ops=("contains",),
            sortable=True,
            sort_type="text",
        ),
        FieldDef(
            "climate_region",
            "Климатический регион",
            "Регион",
            (object_type,),
            "text",
            _param("climate_region"),
            filter_ops=("contains",),
            sortable=True,
            sort_type="text",
        ),
        FieldDef(
            "climate_key",
            "Ключ климата",
            "Ключ клим.",
            (object_type,),
            "text",
            _param("climate_key"),
            filter_ops=("contains",),
            sort_reason="technical_key",
        ),
        FieldDef(
            "climate_temperature_basis",
            "Обеспеченность климата",
            "Обесп.",
            (object_type,),
            "number",
            _param("climate_temperature_basis"),
            filter_ops=("range",),
            sortable=True,
            sort_type="number",
        ),
        FieldDef(
            "burial_depth",
            "Глубина заложения",
            "Глубина, м",
            (object_type,),
            "number",
            _param("burial_depth"),
            unit="m",
            filter_ops=("range",),
            sortable=True,
            sort_type="number",
        ),
        FieldDef(
            "ground_type",
            "Тип грунта",
            "Грунт",
            (object_type,),
            "text",
            _param("ground_type"),
            filter_ops=("contains", "in"),
            sortable=True,
            sort_type="text",
            options_mode="dictionary",
            static_options=_soil_options(),
        ),
        FieldDef(
            "ground_conductivity",
            "λ грунта",
            "λ гр.",
            (object_type,),
            "number",
            _param("ground_conductivity"),
            unit="W/mK",
            filter_ops=("range",),
            sortable=True,
            sort_type="number",
        ),
        FieldDef(
            "min_switch_temperature",
            "Мин. T включения",
            "Мин. T вкл.",
            (object_type,),
            "number",
            _param("min_switch_temperature"),
            unit="°C",
            filter_ops=("range",),
            sortable=True,
            sort_type="number",
        ),
        FieldDef(
            "supply_voltage",
            "Рабочее напряжение",
            "U, В",
            (object_type,),
            "number",
            _param("supply_voltage"),
            unit="V",
            filter_ops=("range",),
            sortable=True,
            sort_type="number",
        ),
        FieldDef(
            "safety_factor",
            "Коэффициент запаса",
            "Кзап",
            (object_type,),
            "number",
            _param("safety_factor"),
            filter_ops=("range",),
            sortable=True,
            sort_type="number",
        ),
        FieldDef(
            "steam_tracing",
            "Пропарка",
            "Пропарка",
            (object_type,),
            "enum",
            _param("steam_tracing"),
            filter_ops=("in",),
            options_mode="inline",
            static_options=STEAM_OPTIONS,
            sort_reason="boolean_flag",
        ),
        FieldDef(
            "vapor_temperature",
            "Температура пропарки",
            "T проп.",
            (object_type,),
            "number",
            _param("vapor_temperature"),
            unit="°C",
            filter_ops=("range",),
            sortable=True,
            sort_type="number",
        ),
    ]


PIPE_FIELDS: tuple[FieldDef, ...] = (
    *_common_fields("pipe")[:4],
    FieldDef(
        "heat_loss_per_meter",
        "Линейные теплопотери",
        "q, Вт/м",
        ("pipe",),
        "number",
        _result("heat_loss_per_meter"),
        unit="W/m",
        filter_ops=("range",),
        sortable=True,
        sort_type="number",
    ),
    FieldDef(
        "total_heat_loss",
        "Суммарные теплопотери",
        "Q, Вт",
        ("pipe",),
        "number",
        _result("total_heat_loss"),
        unit="W",
        filter_ops=("range",),
        sortable=True,
        sort_type="number",
    ),
    FieldDef(
        "pipe_outer_diameter",
        "Наружный диаметр",
        "Ø, мм",
        ("pipe",),
        "number",
        _param_m_as_mm("outer_diameter"),
        unit="mm",
        filter_ops=("range",),
        sortable=True,
        sort_type="number",
    ),
    FieldDef(
        "pipe_dn",
        "DN",
        "DN",
        ("pipe",),
        "enum",
        _pipe_dn,
        filter_ops=("in",),
        sortable=True,
        sort_type="number",
        options_mode="derived",
    ),
    FieldDef(
        "pipe_length",
        "Длина трубопровода",
        "L, м",
        ("pipe",),
        "number",
        _param("pipe_length"),
        unit="m",
        filter_ops=("range",),
        sortable=True,
        sort_type="number",
    ),
    FieldDef(
        "pipe_wall_thickness",
        "Толщина стенки",
        "δ ст., мм",
        ("pipe",),
        "number",
        _param_m_as_mm("wall_thickness"),
        unit="mm",
        filter_ops=("range",),
        sortable=True,
        sort_type="number",
    ),
    FieldDef(
        "pipe_material",
        "Материал трубы",
        "Материал трубы",
        ("pipe",),
        "enum",
        _param("pipe_material"),
        filter_ops=("in", "contains"),
        sortable=True,
        sort_type="label",
        options_mode="dictionary",
        static_options=_pipe_material_options(),
    ),
    FieldDef(
        "pipe_lambda",
        "λ трубы",
        "λ тр.",
        ("pipe",),
        "number",
        _param("pipe_lambda"),
        unit="W/mK",
        filter_ops=("range",),
        sortable=True,
        sort_type="number",
    ),
    FieldDef(
        "pipe_lambda_mode",
        "Режим λ трубы",
        "Режим λ",
        ("pipe",),
        "enum",
        _param("pipe_lambda_mode"),
        filter_ops=("in",),
        options_mode="inline",
        static_options=LAMBDA_MODE_OPTIONS,
        sort_reason="calculation_mode",
    ),
    *_common_fields("pipe")[4:],
    FieldDef(
        "valve_count",
        "Задвижки",
        "Зад.",
        ("pipe",),
        "number",
        _param("valve_count"),
        unit="pcs",
        filter_ops=("range",),
        sortable=True,
        sort_type="number",
    ),
    FieldDef(
        "flange_count",
        "Фланцы",
        "Флн.",
        ("pipe",),
        "number",
        _param("flange_count"),
        unit="pcs",
        filter_ops=("range",),
        sortable=True,
        sort_type="number",
    ),
    FieldDef(
        "support_count",
        "Опоры",
        "Опр.",
        ("pipe",),
        "number",
        _param("support_count"),
        unit="pcs",
        filter_ops=("range",),
        sortable=True,
        sort_type="number",
    ),
    FieldDef(
        "local_element_equiv_length",
        "Эквивалентная длина локальных элементов",
        "L экв.",
        ("pipe",),
        "number",
        _param("local_element_equiv_length"),
        unit="m",
        filter_ops=("range",),
        sortable=True,
        sort_type="number",
    ),
)

TANK_FIELDS: tuple[FieldDef, ...] = (
    *_common_fields("tank")[:4],
    FieldDef(
        "heat_loss_per_m2",
        "Удельные теплопотери",
        "q, Вт/м²",
        ("tank",),
        "number",
        _result("heat_loss_per_m2"),
        unit="W/m²",
        filter_ops=("range",),
        sortable=True,
        sort_type="number",
    ),
    FieldDef(
        "total_heat_loss",
        "Суммарные теплопотери",
        "Q, Вт",
        ("tank",),
        "number",
        _result("total_heat_loss"),
        unit="W",
        filter_ops=("range",),
        sortable=True,
        sort_type="number",
    ),
    FieldDef(
        "tank_shape",
        "Форма резервуара",
        "Форма",
        ("tank",),
        "enum",
        _param("shape"),
        filter_ops=("in",),
        sortable=True,
        sort_type="label",
        options_mode="inline",
        static_options=SHAPE_OPTIONS,
    ),
    FieldDef(
        "tank_dimensions",
        "Габариты",
        "Габариты",
        ("tank",),
        "text",
        _tank_dimensions,
        filter_ops=("contains",),
        sort_reason="combined_dimensions",
    ),
    FieldDef(
        "tank_diameter",
        "Диаметр",
        "Ø, мм",
        ("tank",),
        "number",
        _param_m_as_mm("diameter"),
        unit="mm",
        filter_ops=("range",),
        sortable=True,
        sort_type="number",
    ),
    FieldDef(
        "tank_height",
        "Высота",
        "H, мм",
        ("tank",),
        "number",
        _param_m_as_mm("height"),
        unit="mm",
        filter_ops=("range",),
        sortable=True,
        sort_type="number",
    ),
    FieldDef(
        "tank_length",
        "Длина",
        "L, мм",
        ("tank",),
        "number",
        _param_m_as_mm("length"),
        unit="mm",
        filter_ops=("range",),
        sortable=True,
        sort_type="number",
    ),
    FieldDef(
        "tank_width",
        "Ширина",
        "B, мм",
        ("tank",),
        "number",
        _param_m_as_mm("width"),
        unit="mm",
        filter_ops=("range",),
        sortable=True,
        sort_type="number",
    ),
    FieldDef(
        "tank_wall_thickness",
        "Толщина стенки",
        "δ ст., мм",
        ("tank",),
        "number",
        _param_m_as_mm("wall_thickness"),
        unit="mm",
        filter_ops=("range",),
        sortable=True,
        sort_type="number",
    ),
    FieldDef(
        "tank_wall_lambda",
        "λ стенки",
        "λ ст.",
        ("tank",),
        "number",
        _param("wall_lambda"),
        unit="W/mK",
        filter_ops=("range",),
        sortable=True,
        sort_type="number",
    ),
    *_common_fields("tank")[4:],
    FieldDef(
        "q_additional",
        "Q доп.",
        "Q доп., Вт",
        ("tank",),
        "number",
        _param("q_additional"),
        unit="W",
        filter_ops=("range",),
        sortable=True,
        sort_type="number",
    ),
)

FIELDS_BY_TYPE: dict[str, tuple[FieldDef, ...]] = {"pipe": PIPE_FIELDS, "tank": TANK_FIELDS}
DEFAULT_SEARCH_COLUMNS = {
    "pipe": (
        "name",
        "pipe_dn",
        "pipe_material",
        "placement",
        "insulation_material",
        "second_insulation_material",
        "third_insulation_material",
        "insulation_cover_material",
        "environment",
        "zone_classification",
        "temperature_group",
        "climate_city",
        "climate_region",
        "ground_type",
    ),
    "tank": (
        "name",
        "tank_shape",
        "tank_dimensions",
        "placement",
        "insulation_material",
        "second_insulation_material",
        "third_insulation_material",
        "insulation_cover_material",
        "environment",
        "zone_classification",
        "temperature_group",
        "climate_city",
        "climate_region",
        "ground_type",
    ),
}


class ObjectQueryService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def capabilities(
        self, project_id: UUID, object_type: str, principal: CurrentPrincipal
    ) -> ObjectQueryCapabilitiesResponse:
        if object_type not in FIELDS_BY_TYPE:
            raise ObjectQueryValidationError(f"Неподдерживаемый тип объекта: {object_type}")
        await ProjectService(self.db).get_project_basic(project_id, principal)
        objects_result = await self.db.execute(
            select(ProjectObject)
            .where(
                ProjectObject.project_id == project_id,
                ProjectObject.object_type == object_type,
            )
            .order_by(ProjectObject.sort_order, ProjectObject.id)
            .limit(CAPABILITIES_SAMPLE_LIMIT)
        )
        objects = list(objects_result.scalars().all())
        return ObjectQueryCapabilitiesResponse(
            version=1,
            object_type=object_type,  # type: ignore[arg-type]
            default_page_size=50,
            max_page_size=200,
            default_sort=ObjectQueryDefaultSort(key="sort_order", dir="asc"),
            search=ObjectQuerySearchCapability(
                enabled=True,
                max_text_length=120,
                default_columns=list(DEFAULT_SEARCH_COLUMNS[object_type]),
            ),
            fields=[
                self._field_capability(field, objects) for field in FIELDS_BY_TYPE[object_type]
            ],
        )

    async def query(
        self,
        project_id: UUID,
        data: ProjectObjectsQueryRequest,
        principal: CurrentPrincipal,
    ) -> ProjectObjectsQueryResponse:
        await ProjectService(self.db).get_project_basic(project_id, principal)
        by_type = await self._counts_by_type(project_id)
        if self._can_use_sql_page(data):
            return await self._query_default_page(project_id, data, by_type)

        objects_result = await self.db.execute(
            select(ProjectObject)
            .where(
                ProjectObject.project_id == project_id,
                ProjectObject.object_type == data.object_type,
            )
            .order_by(ProjectObject.sort_order, ProjectObject.id)
        )
        type_objects = list(objects_result.scalars().all())

        filtered = self._apply_search(type_objects, data)
        filtered = self._apply_filters(filtered, data)
        sorted_objects = self._apply_sort(filtered, data)

        filtered_count = len(sorted_objects)
        offset = (data.page - 1) * data.page_size
        items = sorted_objects[offset : offset + data.page_size]
        total_pages = ceil(filtered_count / data.page_size) if filtered_count else 0

        return ProjectObjectsQueryResponse(
            items=items,
            page_info=ProjectObjectsPageInfo(
                page=data.page,
                page_size=data.page_size,
                offset=offset,
                total_pages=total_pages,
                has_next_page=data.page * data.page_size < filtered_count,
                has_previous_page=data.page > 1,
            ),
            counts=ProjectObjectsQueryCounts(
                total=sum(by_type.values()),
                by_type={"pipe": by_type.get("pipe", 0), "tank": by_type.get("tank", 0)},
                filtered=filtered_count,
            ),
            query=ProjectObjectsQueryEcho(object_type=data.object_type, sort=data.sort),
        )

    async def _counts_by_type(self, project_id: UUID) -> Counter[str]:
        result = await self.db.execute(
            select(ProjectObject.object_type, func.count().label("count"))
            .where(ProjectObject.project_id == project_id)
            .group_by(ProjectObject.object_type)
        )
        return Counter({object_type: int(count) for object_type, count in result.all()})

    def _can_use_sql_page(self, data: ProjectObjectsQueryRequest) -> bool:
        search_text = (data.search.text if data.search else "").strip()
        return not search_text and not data.filters and data.sort is None

    async def _query_default_page(
        self,
        project_id: UUID,
        data: ProjectObjectsQueryRequest,
        by_type: Counter[str],
    ) -> ProjectObjectsQueryResponse:
        filtered_count = by_type.get(data.object_type, 0)
        offset = (data.page - 1) * data.page_size
        result = await self.db.execute(
            select(ProjectObject)
            .where(
                ProjectObject.project_id == project_id,
                ProjectObject.object_type == data.object_type,
            )
            .order_by(ProjectObject.sort_order, ProjectObject.id)
            .offset(offset)
            .limit(data.page_size)
        )
        items = list(result.scalars().all())
        total_pages = ceil(filtered_count / data.page_size) if filtered_count else 0

        return ProjectObjectsQueryResponse(
            items=items,
            page_info=ProjectObjectsPageInfo(
                page=data.page,
                page_size=data.page_size,
                offset=offset,
                total_pages=total_pages,
                has_next_page=data.page * data.page_size < filtered_count,
                has_previous_page=data.page > 1,
            ),
            counts=ProjectObjectsQueryCounts(
                total=sum(by_type.values()),
                by_type={"pipe": by_type.get("pipe", 0), "tank": by_type.get("tank", 0)},
                filtered=filtered_count,
            ),
            query=ProjectObjectsQueryEcho(object_type=data.object_type, sort=data.sort),
        )

    def _field_capability(
        self, field: FieldDef, objects: list[ProjectObject]
    ) -> ObjectQueryFieldCapability:
        options = self._field_options(field, objects)
        return ObjectQueryFieldCapability(
            key=field.key,
            label=field.label,
            title=field.title,
            data_type=field.data_type,
            unit=field.unit,
            filter=ObjectQueryFieldFilterCapability(
                enabled=field.filterable,
                ops=list(field.filter_ops),  # type: ignore[arg-type]
                include_empty=field.filterable,
                reason=None if field.filterable else field.filter_reason or "unsupported",
            ),
            sort=ObjectQueryFieldSortCapability(
                enabled=field.sortable,
                type=field.sort_type,
                nulls="last" if field.sortable else None,
                collation="db_ru"
                if field.sortable and field.sort_type in {"text", "label"}
                else None,
                reason=None if field.sortable else field.sort_reason or "unsupported",
            ),
            options=options,
        )

    def _field_options(
        self, field: FieldDef, objects: list[ProjectObject]
    ) -> ObjectQueryFieldOptions | None:
        if field.options_mode is None:
            return None
        if field.options_mode in {"inline", "dictionary"}:
            items = [
                ObjectQueryOptionItem(value=value, label=label)
                for value, label in field.static_options
            ]
        else:
            values: dict[str, ObjectQueryOptionItem] = {}
            for obj in objects:
                value = field.value(obj)
                if _is_empty(value):
                    continue
                option_value = str(value)
                values[option_value] = ObjectQueryOptionItem(
                    value=option_value,
                    label=_field_label(field, value),
                )
            items = list(values.values())
        items.sort(key=lambda item: _normal_text(item.label))
        return ObjectQueryFieldOptions(
            mode=field.options_mode,
            items=items,
            include_empty=field.filterable,
        )

    def _field(self, object_type: str, key: str) -> FieldDef:
        for field in FIELDS_BY_TYPE[object_type]:
            if field.key == key:
                return field
        raise ObjectQueryValidationError(f"Неизвестное поле таблицы: {key}")

    def _apply_search(
        self, objects: list[ProjectObject], data: ProjectObjectsQueryRequest
    ) -> list[ProjectObject]:
        text = (data.search.text if data.search else "").strip()
        if not text:
            return objects
        columns = (
            data.search.columns
            if data.search and data.search.columns
            else list(DEFAULT_SEARCH_COLUMNS[data.object_type])
        )
        fields = [self._field(data.object_type, key) for key in columns]
        needle = _normal_text(text)
        return [
            obj
            for obj in objects
            if any(
                needle in _normal_text(_field_label(field, field.value(obj))) for field in fields
            )
        ]

    def _apply_filters(
        self, objects: list[ProjectObject], data: ProjectObjectsQueryRequest
    ) -> list[ProjectObject]:
        result = objects
        for item in data.filters:
            field = self._field(data.object_type, item.key)
            if item.op not in field.filter_ops:
                raise ObjectQueryValidationError(
                    f"Операция {item.op} недоступна для поля {item.key}"
                )
            if (
                item.op == "range"
                and item.min is not None
                and item.max is not None
                and item.min > item.max
            ):
                raise ObjectQueryValidationError("min не может быть больше max")
            result = [obj for obj in result if self._matches_filter(obj, field, item)]
        return result

    def _matches_filter(self, obj: ProjectObject, field: FieldDef, item: Any) -> bool:
        value = field.value(obj)
        if item.op == "contains":
            needle = _normal_text(item.value)
            return not needle or needle in _normal_text(_field_label(field, value))

        if item.op == "range":
            if _is_empty(value):
                return bool(item.include_empty)
            numeric = _to_float(value)
            if numeric is None:
                return False
            if item.min is not None and numeric < item.min:
                return False
            return not (item.max is not None and numeric > item.max)

        if item.op == "in":
            values = [str(v) for v in item.values or []]
            if _is_empty(value):
                return bool(item.include_empty)
            return str(value) in values or _field_label(field, value) in values

        if item.op == "equals":
            if _is_empty(value):
                return bool(item.include_empty)
            return value == item.value or str(value) == str(item.value)

        return True

    def _apply_sort(
        self, objects: list[ProjectObject], data: ProjectObjectsQueryRequest
    ) -> list[ProjectObject]:
        if data.sort is None:
            return sorted(objects, key=lambda obj: (obj.sort_order, str(obj.id)))
        field = self._field(data.object_type, data.sort.key)
        if not field.sortable:
            raise ObjectQueryValidationError(f"Поле {field.key} не поддерживает сортировку")
        direction = data.sort.dir

        def compare(left: ProjectObject, right: ProjectObject) -> int:
            result = self._compare_values(field, left, right)
            if direction == "desc":
                result = -result
            if result != 0:
                return result
            return (left.sort_order > right.sort_order) - (left.sort_order < right.sort_order) or (
                (str(left.id) > str(right.id)) - (str(left.id) < str(right.id))
            )

        return sorted(objects, key=cmp_to_key(compare))

    def _compare_values(self, field: FieldDef, left: ProjectObject, right: ProjectObject) -> int:
        left_value = field.value(left)
        right_value = field.value(right)
        left_empty = _is_empty(left_value)
        right_empty = _is_empty(right_value)
        if left_empty and right_empty:
            return 0
        if left_empty:
            return 1
        if right_empty:
            return -1
        if field.sort_type == "number":
            left_number = _to_float(left_value)
            right_number = _to_float(right_value)
            if left_number is not None and right_number is not None:
                return (left_number > right_number) - (left_number < right_number)
        left_label = _normal_text(_field_label(field, left_value))
        right_label = _normal_text(_field_label(field, right_value))
        return (left_label > right_label) - (left_label < right_label)
