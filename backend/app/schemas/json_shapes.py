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

InsulationTemperatureBasisDict = Literal[
    "indoor",
    "outdoor_summer",
    "outdoor_winter",
    "channel",
    "tunnel",
    "technical_subfloor",
    "attic",
    "basement",
]


# ---------------------------------------------------------------------------
# results-поля project_objects.results (JSONB)
# ---------------------------------------------------------------------------


class InsulationLayerAppliedDict(TypedDict):
    """Resolved insulation data used by the formula."""

    index: int
    thickness: float
    material: str
    conductivity_applied: float
    conductivity_source: Literal["manual", "reference_data"]
    conductivity_temperature_applied: float
    resistance: float
    resistance_unit: Literal["m*K/W", "m2*K/W", "K/W"]


class HeatResultTraceDict(TypedDict):
    """Common top-level trace shared by both heat result variants."""

    formula_model: str
    formula_model_version: str
    model_assumptions: list[str]
    process_temperature_applied: float | None
    ambient_temperature_applied: float | None
    ground_temperature_applied: float | None
    safety_factor_applied: float
    insulation_layers_applied: list[InsulationLayerAppliedDict]
    input_units: dict[str, str]
    applied_units: dict[str, str]
    source_corrections: list[str]


class PipeHeatLossResultDict(HeatResultTraceDict):
    """Результат расчёта теплопотерь трубы. Зеркало `PipeHeatLossResult`."""

    heat_loss_per_meter_base: float  # q_linear — без safety_factor
    heat_loss_per_meter_design: float  # q_linear × K
    total_heat_loss_base: float  # q_linear × L_eff
    total_heat_loss_design: float  # q_linear × L_eff × K
    effective_length: float  # L + n·L_экв
    additional_equivalent_length: float
    thermal_resistance: float  # м·К/Вт
    wall_resistance: float | None
    insulation_resistance: float | None
    external_resistance: float | None
    alpha_vnesh_applied: float | None
    wind_speed_applied: float | None
    ground_conductivity_applied: float | None
    local_elements_count_applied: int | None
    local_element_equiv_length_applied: float | None


class TankHeatLossResultDict(HeatResultTraceDict):
    """Результат расчёта теплопотерь резервуара. Зеркало `TankHeatLossResult`."""

    total_heat_loss_base: float
    total_heat_loss_design: float
    heat_loss_per_m2_bare_base: float
    heat_loss_per_m2_bare_design: float
    surface_area_bare: float
    surface_area_outer: float | None
    thermal_resistance_areal_bare: float | None
    wall_resistance_areal_bare: float | None
    insulation_resistance_areal_bare: float | None
    external_resistance_areal_bare: float | None
    ground_resistance_areal_bare: float | None
    thermal_resistance_total: float | None
    wall_resistance_total: float | None
    insulation_resistance_total: float | None
    external_resistance_total: float | None
    external_heat_flux_base: float | None
    critical_insulation_radius: float | None
    outer_insulation_radius: float | None
    critical_radius_check_passed: bool | None
    alpha_vnesh_applied: float | None
    wind_speed_applied: float | None
    ground_conductivity_applied: float | None
    air_surface_area: float | None
    ground_surface_area: float | None
    heat_loss_air_base: float | None
    heat_loss_ground_base: float | None
    q_additional_applied: float


# Алиас: результат любого теплорасчёта
HeatLossResultDict = PipeHeatLossResultDict | TankHeatLossResultDict


# ---------------------------------------------------------------------------
# results-поля electrical_calculations.results (JSONB)
# ---------------------------------------------------------------------------


class ElectricalCalcSuccessDict(TypedDict):
    """Успешный электрорасчёт."""

    selected_cable: str  # марка кабеля (например "ТЛТ-25")
    installed_cable_length: float  # расчётная/уложенная длина кабеля, м
    order_cable_length: float  # длина для заказа с монтажным запасом, м
    cable_length: NotRequired[float]  # вычисляемый alias на время разработки
    total_power: float  # полная мощность, Вт
    current: float  # ток нагрузки, А
    voltage: float  # напряжение питания, В


class ElectricalCalcErrorDict(TypedDict):
    """Персистентная ошибка электрорасчёта (см. US-09.12)."""

    error_code: str  # стабильный код ошибки для UI/автоматизации
    category: str  # validation/formula/unsupported/external
    message: str  # пользовательское сообщение без Python-префикса ошибки
    field: NotRequired[str | None]  # поле, с которым связана причина
    hint: NotRequired[str | None]  # краткая подсказка для UI
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
    wall_thickness: float
    pipe_material: str | None
    pipe_lambda: float | None
    insulation_cover_material: str | None
    insulation_layers: list[dict[str, float | str | list[float] | None]]
    ambient_temperature: float | None
    ground_temperature: float | None
    process_temperature: float
    max_ambient_temperature: float | None
    max_process_temperature: float | None
    pipe_length: float
    placement: Literal["indoor", "outdoor", "underground"]
    pipe_centerline_depth: float | None
    ground_type: str | None
    climate_city: str | None
    climate_region: str | None
    climate_key: str | None
    climate_temperature_basis: Literal["t_0_92", "t_0_98", "t_abs_min"] | None
    insulation_temperature_basis: InsulationTemperatureBasisDict | None
    ambient_temperature_source: Literal["manual", "climate"] | None
    ground_temperature_source: Literal["manual", "climate"] | None
    wind_speed_source: Literal["manual", "climate"] | None
    ground_conductivity_source: Literal["manual", "reference"] | None
    safety_factor_source: Literal["default", "manual", "climate_policy"] | None
    climate_policy_rule: Literal["pipe_diameter_ge_100", "pipe_diameter_lt_100"] | None
    num_local_elements: int
    local_element_equiv_length: float | None
    wind_speed: float | None
    alpha_vnesh: float | None
    ground_conductivity: float | None
    safety_factor: float
    environment: Literal["normal", "aggressive"] | None
    zone_classification: Literal["safe", "explosive"] | None
    temperature_group: Literal["T1", "T2", "T3", "T4", "T5", "T6"] | None
    min_switch_temperature: float | None
    supply_voltage: float | None
    steam_tracing: Literal["yes", "no"] | None
    vapor_temperature: float | None
    maintain_temperature: float | None


class TankParamsDict(TypedDict, total=False):
    """Параметры резервуара."""

    name: str
    shape: Literal["cylindrical", "rectangular", "spherical"]
    diameter: float | None
    height: float | None
    length: float | None
    width: float | None
    volume: float | None
    insulation_cover_material: str | None
    insulation_layers: list[dict[str, float | str | list[float] | None]]
    ambient_temperature: float | None
    ground_temperature: float | None
    process_temperature: float
    max_ambient_temperature: float | None
    max_process_temperature: float | None
    placement: Literal["indoor", "outdoor", "underground"]
    tank_buried_height: float | None
    ground_temperature_source: Literal["manual", "climate"] | None
    ground_type: str | None
    ground_conductivity: float | None
    ground_conductivity_source: Literal["manual", "reference"] | None
    climate_city: str | None
    climate_region: str | None
    climate_key: str | None
    climate_temperature_basis: Literal["t_0_92", "t_0_98", "t_abs_min"] | None
    insulation_temperature_basis: InsulationTemperatureBasisDict | None
    ambient_temperature_source: Literal["manual", "climate"] | None
    wind_speed_source: Literal["manual", "climate"] | None
    safety_factor_source: Literal["default", "manual", "climate_policy"] | None
    wall_thickness: float | None
    wall_lambda: float | None
    wind_speed: float | None
    alpha_vnesh: float | None
    safety_factor: float
    q_additional: float
    environment: Literal["normal", "aggressive"] | None
    zone_classification: Literal["safe", "explosive"] | None
    temperature_group: Literal["T1", "T2", "T3", "T4", "T5", "T6"] | None
    min_switch_temperature: float | None
    supply_voltage: float | None
    steam_tracing: Literal["yes", "no"] | None
    vapor_temperature: float | None
    maintain_temperature: float | None


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

    source: Literal["builtin", "extended", "commercial"]
    cable_type: str  # "self_regulating" и др.
    brand: str
    model: str  # "ТЛТ-25"
    power_per_meter: float
    max_temperature: float
    min_temperature: float
    resistance_per_meter: float | None
    supplier_name: str | None
    article: str | None
    currency: str | None
    price_per_meter: float | None
    stock_quantity_m: float | None
    stock_status: str | None
    lead_time_days: int | None
    supplier_priority: int | None
    is_preferred: bool
    order_multiple_m: float | None
    min_order_quantity_m: float | None
    is_discontinued: bool
    replacement_group: str | None
    price_updated_at: str | None
    stock_updated_at: str | None
    commercial_data_source: str | None
