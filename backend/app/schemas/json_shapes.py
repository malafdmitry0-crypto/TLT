"""TypedDict-аннотации для JSONB-полей.

SQLAlchemy хранит JSONB как `dict[str, Any]`. Эти TypedDict'ы дают mypy и
разработчику (включая Claude) точное знание о структуре данных на уровне API,
без необходимости писать полноценные Pydantic-модели в самих SQLAlchemy-моделях.

Используются как type hints при чтении `ProjectObject.results`,
`ElectricalCalculation.results` и аналогичных полей.

Pydantic-модели в `schemas/calculation.py` остаются единственным источником
правды для валидации. Эти TypedDict'ы — проекция их структуры для mypy.
"""

from __future__ import annotations

from typing import Literal, NotRequired, TypedDict

# ---------------------------------------------------------------------------
# results-поля project_objects.results (JSONB)
# ---------------------------------------------------------------------------


class PipeHeatLossResultDict(TypedDict):
    """Результат расчёта теплопотерь трубы. Зеркало `PipeHeatLossResult`."""

    heat_loss_per_meter: float  # q_linear — без учёта safety_factor
    total_heat_loss: float  # q_linear × L_eff × K (с safety_factor)
    effective_length: float  # L + n·L_экв
    thermal_resistance: float  # м·К/Вт
    wall_resistance: NotRequired[float | None]
    insulation_resistance: NotRequired[float | None]
    external_resistance: NotRequired[float | None]
    alpha_vnesh: NotRequired[float | None]
    wind_speed: NotRequired[float | None]
    ground_conductivity: NotRequired[float | None]
    safety_factor: NotRequired[float | None]
    local_elements_count: NotRequired[int | None]
    local_element_equiv_length: NotRequired[float | None]
    surface_temperature: NotRequired[float | None]


class TankHeatLossResultDict(TypedDict):
    """Результат расчёта теплопотерь резервуара. Зеркало `TankHeatLossResult`."""

    heat_loss_per_m2: float  # q — без учёта safety_factor
    total_heat_loss: float  # q × S × K (с safety_factor)
    surface_area: float  # м²
    wall_resistance: NotRequired[float | None]
    insulation_resistance: NotRequired[float | None]
    external_resistance: NotRequired[float | None]
    ground_resistance: NotRequired[float | None]
    alpha_vnesh: NotRequired[float | None]
    wind_speed: NotRequired[float | None]
    ground_conductivity: NotRequired[float | None]
    safety_factor: NotRequired[float | None]
    air_surface_area: NotRequired[float | None]
    ground_surface_area: NotRequired[float | None]
    heat_loss_air_per_m2: NotRequired[float | None]
    heat_loss_ground_per_m2: NotRequired[float | None]


# Алиас: результат любого теплорасчёта
HeatLossResultDict = PipeHeatLossResultDict | TankHeatLossResultDict


# ---------------------------------------------------------------------------
# results-поля electrical_calculations.results (JSONB)
# ---------------------------------------------------------------------------


class ElectricalCalcSuccessDict(TypedDict):
    """Успешный электрорасчёт."""

    selected_cable: str  # марка кабеля (например "ТЛТ-25")
    cable_length: float  # длина кабеля с 10% запасом, м
    total_power: float  # полная мощность, Вт
    current: float  # ток нагрузки, А
    voltage: float  # напряжение питания, В


class ElectricalCalcErrorDict(TypedDict):
    """Персистентная ошибка электрорасчёта (см. US-09.12)."""

    error: str  # legacy/raw причина, сохраняется для обратной совместимости
    error_code: NotRequired[str]  # стабильный код ошибки для UI/автоматизации
    message: NotRequired[str]  # пользовательское сообщение без Python-префикса ошибки
    suggested_actions: NotRequired[list[str]]  # коды рекомендуемых действий
    error_context: NotRequired[dict[str, object]]  # численные детали и параметры подбора
    object_type: NotRequired[str]  # для удобства отображения
    object_name: NotRequired[str | None]


# Results электрорасчёта — либо успех, либо ошибка
ElectricalResultDict = ElectricalCalcSuccessDict | ElectricalCalcErrorDict


# ---------------------------------------------------------------------------
# params-поля project_objects.params (JSONB) — зеркало PipeHeatLossParams / TankHeatLossParams
# ---------------------------------------------------------------------------


class PipeParamsDict(TypedDict, total=False):
    """Параметры трубы (total=False — все опциональны на уровне JSONB)."""

    name: str
    outer_diameter: float
    wall_thickness: float | None
    pipe_material: str | None
    pipe_lambda: float | None
    insulation_thickness: float | None
    insulation_material: str | None
    insulation_cover_material: str | None
    insulation_layers: list[dict[str, float | str | list[float] | None]]
    ambient_temperature: float
    process_temperature: float
    max_ambient_temperature: float | None
    max_process_temperature: float | None
    pipe_length: float
    placement: Literal["indoor", "outdoor", "underground"]
    burial_depth: float | None
    ground_type: str | None
    climate_city: str | None
    climate_region: str | None
    climate_temperature_basis: Literal["t_0_92", "t_0_98", "t_abs_min"] | None
    ambient_temperature_source: Literal["manual", "climate"] | None
    wind_speed_source: Literal["manual", "climate"] | None
    num_local_elements: int | None
    local_element_equiv_length: float | None
    valve_count: int | None
    flange_count: int | None
    support_count: int | None
    wind_speed: float | None
    alpha_vnesh: float | None
    ground_conductivity: float | None
    safety_factor: float | None
    location: Literal["indoor", "outdoor"]
    environment: Literal["normal", "aggressive"] | None
    zone_classification: Literal["safe", "explosive"] | None
    temperature_group: Literal["T1", "T2", "T3", "T4", "T5", "T6"] | None
    min_switch_temperature: float | None
    supply_voltage: float | None
    steam_tracing: Literal["yes", "no"] | None
    vapor_temperature: float | None


class TankParamsDict(TypedDict, total=False):
    """Параметры резервуара."""

    name: str
    shape: Literal["cylindrical", "rectangular", "spherical"]
    diameter: float | None
    height: float | None
    length: float | None
    width: float | None
    volume: float | None
    insulation_thickness: float
    insulation_material: str
    insulation_cover_material: str | None
    insulation_layers: list[dict[str, float | str | list[float] | None]]
    ambient_temperature: float
    process_temperature: float
    max_ambient_temperature: float | None
    max_process_temperature: float | None
    placement: Literal["indoor", "outdoor", "underground"]
    burial_depth: float | None
    ground_type: str | None
    climate_city: str | None
    climate_region: str | None
    climate_temperature_basis: Literal["t_0_92", "t_0_98", "t_abs_min"] | None
    ambient_temperature_source: Literal["manual", "climate"] | None
    wind_speed_source: Literal["manual", "climate"] | None
    location: Literal["indoor", "outdoor"]
    wall_thickness: float | None
    wall_lambda: float | None
    wind_speed: float | None
    alpha_vnesh: float | None
    safety_factor: float | None
    environment: Literal["normal", "aggressive"] | None
    zone_classification: Literal["safe", "explosive"] | None
    temperature_group: Literal["T1", "T2", "T3", "T4", "T5", "T6"] | None
    min_switch_temperature: float | None
    supply_voltage: float | None
    steam_tracing: Literal["yes", "no"] | None
    vapor_temperature: float | None


# ---------------------------------------------------------------------------
# Ответы API пакетных операций
# ---------------------------------------------------------------------------


class BatchErrorDict(TypedDict):
    """Ошибка в пакетной операции (теплорасчёт или электрорасчёт)."""

    object_id: str  # UUID как строка (JSON-сериализуемый)
    error: str | dict[str, str]


class ImportRowErrorDict(TypedDict):
    """Ошибка при импорте объектов из Excel/CSV."""

    sheet: str  # "Трубопроводы" / "Резервуары" / "csv"
    row: int  # 1-indexed
    message: str


# ---------------------------------------------------------------------------
# Элементы справочника кабелей (cables_tlt.json + cables_extended)
# ---------------------------------------------------------------------------


class CableCatalogEntryDict(TypedDict, total=False):
    """Строка каталога кабелей."""

    source: Literal["builtin", "extended"]
    cable_type: str  # "self_regulating" и др.
    brand: str
    model: str  # "ТЛТ-25"
    power_per_meter: float
    max_temperature: float
    min_temperature: float
    resistance_per_meter: float | None
