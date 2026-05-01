"""Схемы расчётов: вход/выход формул и API."""

from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

# ---------- Heat loss ----------


class InsulationLayer(BaseModel):
    """Один слой тепловой изоляции (для многослойного расчёта)."""

    thickness: float = Field(gt=0, le=0.5, description="Толщина слоя, м (0.001–0.5)")
    material: str = Field(min_length=1, description="Код материала из справочника")
    conductivity: float | None = Field(
        default=None,
        gt=0,
        le=5.0,
        description="λ слоя, Вт/(м·К) — переопределяет справочник если задано",
    )


class PipeHeatLossParams(BaseModel):
    """Параметры для расчёта теплопотерь трубопровода.

    Поддерживает два режима:
    - Однослойный (обратная совместимость): insulation_thickness + insulation_material
    - Многослойный: insulation_layers (список InsulationLayer, 1–3 слоя)
    """

    model_config = ConfigDict(extra="ignore")

    # --- Геометрия трубы ---
    outer_diameter: float = Field(
        ge=0.010,
        le=3.0,
        description="d_tp — наружный диаметр трубы, м",
    )
    wall_thickness: float | None = Field(
        default=None,
        gt=0,
        le=0.1,
        description="delta_tp — толщина стенки трубы, м (1–100 мм)",
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

    # --- Изоляция (однослойный режим, обратная совместимость) ---
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
        ge=-60.0,
        le=50.0,
        description="T_os — температура окружающей среды, °C",
    )
    process_temperature: float = Field(
        ge=-60.0,
        le=350.0,
        description="T_zh — температура жидкости, °C",
    )

    # --- Длина и конфигурация ---
    pipe_length: float = Field(
        ge=0.5,
        le=10_000.0,
        description="L — длина трубопровода / секции, м",
    )
    burial_depth: float | None = Field(
        default=None,
        ge=0.1,
        le=5.0,
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
        ge=0.0,
        le=50.0,
        description="L_ekv — эквивалентная длина одного локального элемента, м",
    )

    # --- Внешние условия ---
    wind_speed: float | None = Field(
        default=None, ge=0.0, le=50.0, description="v — скорость ветра, м/с"
    )
    alpha_vnesh: float | None = Field(
        default=None,
        ge=9.0,
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
        ge=1.0,
        le=2.0,
        description="K — коэффициент запаса",
    )
    location: Literal["indoor", "outdoor"] = "outdoor"

    @model_validator(mode="after")
    def check_insulation_provided(self) -> "PipeHeatLossParams":
        if self.process_temperature <= self.ambient_temperature:
            raise ValueError("Температура продукта должна быть выше температуры окружающей среды")
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
    surface_temperature: float | None = None


class TankHeatLossParams(BaseModel):
    """Параметры для расчёта теплопотерь ёмкости."""

    model_config = ConfigDict(extra="ignore")

    shape: Literal["cylindrical", "rectangular", "spherical"] = "cylindrical"
    diameter: float | None = Field(
        default=None,
        ge=0.1,
        le=50.0,
        description="d_р — наружный диаметр резервуара, м (100–50 000 мм)",
    )
    height: float | None = Field(default=None, ge=0.1, le=50.0)
    length: float | None = Field(default=None, ge=0.1, le=50.0)
    width: float | None = Field(default=None, ge=0.1, le=50.0)
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
        description="λ_р — теплопроводность стенки резервуара, Вт/(м·К)",
    )
    # --- Внешние условия ---
    wind_speed: float | None = Field(
        default=None,
        ge=0.0,
        le=20.0,
        description="v — скорость ветра, м/с",
    )
    safety_factor: float | None = Field(
        default=None,
        ge=1.0,
        le=2.0,
        description="K — коэффициент запаса",
    )

    @model_validator(mode="after")
    def check_ranges_and_layers(self) -> "TankHeatLossParams":
        if not (-60.0 <= self.ambient_temperature <= 50.0):
            raise ValueError("Температура окружающей среды должна быть в диапазоне −60…+50 °C")
        if not (-60.0 <= self.process_temperature <= 350.0):
            raise ValueError("Температура продукта должна быть в диапазоне −60…+350 °C")
        if self.process_temperature <= self.ambient_temperature:
            raise ValueError("Температура продукта должна быть выше температуры окружающей среды")
        if self.insulation_layers and len(self.insulation_layers) > 3:
            raise ValueError("Максимальное количество слоёв изоляции: 3 (N_iz ≤ 3)")
        return self


class TankHeatLossResult(BaseModel):
    heat_loss_per_m2: float
    total_heat_loss: float
    surface_area: float


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
