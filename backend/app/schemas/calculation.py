"""Схемы расчётов: вход/выход формул и API."""

from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

# ---------- Heat loss ----------


class InsulationLayer(BaseModel):
    """Один слой тепловой изоляции (для многослойного расчёта)."""

    thickness: float = Field(gt=0, le=0.5, description="Толщина слоя, м (до 500 мм)")
    material: str = Field(min_length=1, description="Код материала из справочника")
    conductivity: float | None = Field(
        default=None,
        gt=0,
        le=400.0,
        description="λ слоя, Вт/(м·К) — переопределяет справочник если задано",
    )


class PipeHeatLossParams(BaseModel):
    """Параметры для расчёта теплопотерь трубопровода.

    Поддерживает два режима:
    - Однослойный: insulation_thickness + insulation_material
    - Многослойный: insulation_layers (список InsulationLayer, 1–3 слоя)
    """

    model_config = ConfigDict(extra="ignore")

    # --- Геометрия трубы ---
    outer_diameter: float = Field(
        ge=0.0108,
        le=3.0,
        description="d_tp — наружный диаметр трубы, м",
    )
    wall_thickness: float | None = Field(
        default=None,
        ge=0.0001,
        le=0.04,
        description="delta_tp — толщина стенки трубы, м (0.1–40 мм)",
    )
    pipe_material: str | None = Field(
        default=None,
        description="Материал трубы: carbon_steel, stainless_304, copper, aluminum, plastic",
    )
    pipe_lambda: float | None = Field(
        default=None,
        gt=0,
        le=400,
        description="lambda_tp — ручное задание теплопроводности трубы, Вт/(м·К)",
    )

    # --- Изоляция (однослойный режим) ---
    insulation_thickness: float | None = Field(
        default=None,
        gt=0,
        le=0.5,
        description="Толщина изоляции, м — однослойный режим",
    )
    insulation_material: str | None = Field(
        default=None,
        description="Материал изоляции — однослойный режим",
    )

    # --- Изоляция (многослойный режим) ---
    insulation_layers: list[InsulationLayer] | None = Field(
        default=None,
        description="N_iz — слои изоляции (1–3), многослойный режим",
    )

    # --- Температуры ---
    ambient_temperature: float = Field(
        ge=-70.0,
        le=70.0,
        description="T_os — температура окружающей среды, °C",
    )
    process_temperature: float = Field(
        ge=-90.0,
        le=600.0,
        description="T_zh — температура жидкости, °C",
    )

    # --- Длина и конфигурация ---
    pipe_length: float = Field(
        ge=0.5,
        le=200_000.0,
        description="L — длина трубопровода / секции, м",
    )
    burial_depth: float | None = Field(
        default=None,
        ge=0.0,
        le=200.0,
        description="H — глубина заложения трубы, м",
    )
    num_local_elements: int | None = Field(
        default=None,
        ge=0,
        le=100,
        description="n_i — количество локальных элементов (фланцы и др.)",
    )
    local_element_equiv_length: float | None = Field(
        default=None,
        ge=0.1,
        le=6.9,
        description="L_ekv — эквивалентная длина одного локального элемента, м",
    )

    # --- Внешние условия ---
    wind_speed: float | None = Field(
        default=None, ge=0.0, le=20.0, description="v — скорость ветра, м/с"
    )
    alpha_vnesh: float | None = Field(
        default=None,
        ge=7.0,
        le=52.0,
        description="alpha — коэф. наружной теплоотдачи, Вт/(м²·К) — рассчитывается из v если не задан",
    )
    ground_conductivity: float | None = Field(
        default=None,
        ge=0.8,
        le=3.0,
        description="lambda_gr — теплопроводность грунта, Вт/(м·К)",
    )
    safety_factor: float | None = Field(
        default=None,
        ge=1.05,
        le=1.7,
        description="K — коэффициент запаса",
    )
    location: Literal["indoor", "outdoor"] = "outdoor"

    @model_validator(mode="after")
    def check_insulation_provided(self) -> "PipeHeatLossParams":
        if self.process_temperature <= self.ambient_temperature:
            raise ValueError("Температура продукта должна быть выше температуры окружающей среды")
        if (
            self.wall_thickness is not None
            and self.pipe_material is None
            and self.pipe_lambda is None
        ):
            raise ValueError(
                "Для расчёта стенки трубы необходимо задать материал трубы или λ трубы"
            )
        has_single = self.insulation_thickness is not None and self.insulation_material is not None
        multi_layers = self.insulation_layers or []
        has_multi = len(multi_layers) > 0
        if not has_single and not has_multi:
            raise ValueError(
                "Необходимо задать изоляцию: либо insulation_thickness + insulation_material, "
                "либо insulation_layers"
            )
        if len(multi_layers) > 3:
            raise ValueError("Максимальное количество слоёв изоляции: 3 (N_iz ≤ 3)")
        return self


class PipeHeatLossResult(BaseModel):
    heat_loss_per_meter: float = Field(description="Теплопотери q_linear, Вт/м")
    total_heat_loss: float = Field(
        description="Полные теплопотери с учётом K и локальных элементов, Вт"
    )
    effective_length: float = Field(description="Расчётная длина с учётом локальных элементов, м")
    thermal_resistance: float = Field(description="Суммарное термическое сопротивление, м·К/Вт")
    wall_resistance: float | None = Field(
        default=None,
        description="Сопротивление стенки трубы, м·К/Вт",
    )
    insulation_resistance: float | None = Field(
        default=None,
        description="Суммарное сопротивление слоёв изоляции, м·К/Вт",
    )
    external_resistance: float | None = Field(
        default=None,
        description="Внешнее/грунтовое сопротивление, м·К/Вт",
    )
    alpha_vnesh: float | None = Field(
        default=None,
        description="Коэффициент внешней теплоотдачи, Вт/(м²·К)",
    )
    wind_speed: float | None = Field(default=None, description="Скорость ветра, м/с")
    ground_conductivity: float | None = Field(
        default=None,
        description="Теплопроводность грунта, Вт/(м·К)",
    )
    safety_factor: float | None = Field(default=None, description="Коэффициент запаса")
    local_elements_count: int | None = Field(
        default=None,
        description="Количество локальных элементов",
    )
    local_element_equiv_length: float | None = Field(
        default=None,
        description="Эквивалентная длина одного локального элемента, м",
    )
    surface_temperature: float | None = None


class TankHeatLossParams(BaseModel):
    """Параметры для расчёта теплопотерь ёмкости."""

    model_config = ConfigDict(extra="ignore")

    shape: Literal["cylindrical", "rectangular", "spherical"] = "cylindrical"
    diameter: float | None = Field(
        default=None,
        ge=0.0108,
        le=3.0,
        description="d_р — наружный диаметр резервуара, м",
    )
    height: float | None = Field(default=None, ge=0.5, le=200_000.0)
    length: float | None = Field(default=None, gt=0)
    width: float | None = Field(default=None, gt=0)
    volume: float | None = Field(default=None, gt=0)
    insulation_thickness: float = Field(gt=0)
    insulation_material: str = Field(min_length=1)
    insulation_layers: list[InsulationLayer] | None = Field(
        default=None,
        description="N_iz — слои изоляции (1–3), многослойный режим",
    )
    ambient_temperature: float
    process_temperature: float
    location: Literal["indoor", "outdoor"] = "outdoor"
    # --- Стенка резервуара ---
    wall_thickness: float | None = Field(
        default=None,
        ge=0.001,
        le=0.5,
        description="δ_р — толщина стенки резервуара, м",
    )
    wall_lambda: float | None = Field(
        default=None,
        gt=0,
        le=400,
        description="λ_р — теплопроводность стенки резервуара, Вт/(м·К)",
    )
    burial_depth: float | None = Field(
        default=None,
        ge=0.0,
        le=200.0,
        description="h — высота подземной части резервуара, м",
    )
    ground_conductivity: float | None = Field(
        default=None,
        ge=0.8,
        le=3.0,
        description="lambda_gr — теплопроводность грунта, Вт/(м·К)",
    )
    # --- Внешние условия ---
    wind_speed: float | None = Field(
        default=None,
        ge=0.0,
        le=20.0,
        description="v — скорость ветра, м/с",
    )
    alpha_vnesh: float | None = Field(
        default=None,
        ge=7.0,
        le=52.0,
        description="alpha — ручной коэф. наружной теплоотдачи, Вт/(м²·К)",
    )
    safety_factor: float | None = Field(
        default=None,
        ge=1.05,
        le=1.7,
        description="K — коэффициент запаса",
    )

    @model_validator(mode="after")
    def check_ranges_and_layers(self) -> "TankHeatLossParams":
        if not (-70.0 <= self.ambient_temperature <= 70.0):
            raise ValueError("Температура окружающей среды должна быть в диапазоне −70…+70 °C")
        if not (-90.0 <= self.process_temperature <= 600.0):
            raise ValueError("Температура продукта должна быть в диапазоне −90…+600 °C")
        if self.process_temperature <= self.ambient_temperature:
            raise ValueError("Температура продукта должна быть выше температуры окружающей среды")
        if self.insulation_layers and len(self.insulation_layers) > 3:
            raise ValueError("Максимальное количество слоёв изоляции: 3 (N_iz ≤ 3)")
        return self


class TankHeatLossResult(BaseModel):
    heat_loss_per_m2: float
    total_heat_loss: float
    surface_area: float
    wall_resistance: float | None = None
    insulation_resistance: float | None = None
    external_resistance: float | None = None
    ground_resistance: float | None = None
    alpha_vnesh: float | None = None
    wind_speed: float | None = None
    ground_conductivity: float | None = None
    safety_factor: float | None = None
    air_surface_area: float | None = None
    ground_surface_area: float | None = None
    heat_loss_air_per_m2: float | None = None
    heat_loss_ground_per_m2: float | None = None


class HeatLossRequest(BaseModel):
    """Унифицированный запрос расчёта теплопотерь."""

    project_id: UUID
    object_type: Literal["pipe", "tank"]
    data: dict[str, Any]


class HeatLossResponse(BaseModel):
    object_type: str
    result: dict[str, Any]


class BatchCalcResponse(BaseModel):
    updated: int
    failed: int
    errors: list[dict[str, Any]] = Field(default_factory=list)


# ---------- Electrical ----------


class SelfRegulatingParams(BaseModel):
    """Параметры расчёта саморегулирующегося кабеля."""

    required_power_per_meter: float = Field(gt=0, description="Требуемая мощность, Вт/м")
    cable_mark: str | None = Field(default=None, description="Марка кабеля; null — автоподбор")
    supply_voltage: float = Field(default=220.0, gt=0)
    ambient_temperature: float
    process_temperature: float | None = Field(
        default=None,
        description="Температура продукта для проверки T_max кабеля",
    )
    pipe_length: float = Field(gt=0)
    safety_factor: float = Field(default=1.1, ge=1.0, le=2.0)
    cable_catalog: list[dict[str, Any]] | None = Field(
        default=None,
        description=(
            "Источник кабелей для автоподбора / ручного выбора. "
            "Если None — используется встроенный справочник ТЛТ."
        ),
    )


class SelfRegulatingResult(BaseModel):
    selected_cable: str
    cable_length: float
    total_power: float
    current: float
    voltage: float


class ElectricalRequest(BaseModel):
    object_id: UUID
    cable_type: Literal["self_regulating", "single_core", "three_core", "mineral", "skin"]
    data: dict[str, Any]
    variant_number: int = 1


class ElectricalResponse(BaseModel):
    object_id: UUID
    cable_type: str
    result: dict[str, Any]


class ElectricalCalcSummary(BaseModel):
    """Краткая информация об электрорасчёте объекта."""

    id: UUID
    object_id: UUID
    cable_type: str
    cable_mark: str | None
    variant_number: int
    results: dict[str, Any] | None


class BatchElectricalResponse(BaseModel):
    """Результат пакетного электрорасчёта всех объектов проекта."""

    calculated: int
    skipped: int
    errors: list[dict[str, Any]] = Field(default_factory=list)
    results: list[ElectricalCalcSummary] = Field(default_factory=list)
