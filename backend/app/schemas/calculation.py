"""Схемы расчётов: вход/выход формул и API."""

from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.project import ProjectObjectResponse, ProjectObjectsPageInfo

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
    q_additional: float = Field(
        default=0.0,
        ge=0,
        description="Q_доп — дополнительные теплопотери (днище, фланцы и пр.), Вт",
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
    q_additional: float = 0.0


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
    winding_coefficient: float = Field(
        default=1.0,
        ge=1.0,
        le=10.0,
        description="Коэффициент навива/укладки; 1.0 — прямая укладка",
    )
    winding_pitch: float | None = Field(
        default=None,
        ge=0,
        description="Шаг навива, мм; 0 или null — прямая укладка",
    )
    number_of_threads: int = Field(
        default=1,
        ge=1,
        le=3,
        description="Количество ниток кабеля",
    )
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
    winding_pitch: float
    winding_coefficient: float
    num_circuits: int


class SelfRegulatingTTParams(BaseModel):
    """Параметры расчёта саморегулирующегося кабеля серии ТТН/ТТВ/ТТХ."""

    required_power_per_meter: float = Field(gt=0, description="Требуемая мощность, Вт/м")
    pipe_length: float = Field(gt=0, description="Длина трубопровода/секции, м")
    process_temperature: float = Field(description="T_ж — температура жидкости, °C")
    supply_voltage: float = Field(default=220.0, gt=0, description="U — напряжение питания, В")
    vapor_temperature: float | None = Field(default=None, description="Температура пропарки, °C")
    aggressive_product: bool = Field(
        default=False, description="Агрессивная среда → суффикс -СТ в марке"
    )
    winding_coefficient: float = Field(
        default=1.1,
        ge=1.0,
        le=10.0,
        description="Коэффициент укладки кабеля; может быть >1.5 при расчёте из шага навива",
    )
    winding_pitch: float | None = Field(
        default=None, ge=0, description="Шаг навива, мм; 0 или null — прямая укладка"
    )
    number_of_threads: int | None = Field(
        default=None,
        ge=1,
        le=3,
        description="Заданное пользователем количество ниток; null — автоподбор",
    )
    cable_mark: str | None = Field(default=None, description="Марка кабеля; null — автоподбор")
    safety_factor: float = Field(default=1.1, ge=1.0, le=2.0)
    # Геометрия резервуара (опционально, для укладки на поверхность бака)
    tank_shape: Literal["cylindrical", "rectangular"] | None = Field(
        default=None, description="Форма резервуара для расчёта длины кабеля по периметру"
    )
    tank_diameter: float | None = Field(default=None, gt=0)
    tank_length: float | None = Field(default=None, gt=0)
    tank_width: float | None = Field(default=None, gt=0)
    heating_height: float | None = Field(default=None, gt=0)
    laying_step: float | None = Field(default=None, ge=0.05, le=0.5)


class SelfRegulatingTTResult(BaseModel):
    selected_cable: str
    cable_mark: str
    series: str
    cable_length: float
    num_circuits: int
    power_per_meter: float
    total_power: float
    current: float
    voltage: float
    winding_pitch: float
    winding_coefficient: float


class ResistiveSingleCoreParams(BaseModel):
    """Параметры расчёта одножильного резистивного кабеля ТТ Р1."""

    required_heat_loss: float = Field(gt=0, description="Q — требуемые теплопотери, Вт")
    pipe_length: float = Field(gt=0, description="L — длина трубопровода, м")
    add_length: float = Field(default=0.0, ge=0, description="L_доп — дополнительная длина, м")
    process_temperature: float = Field(description="T_ж — температура жидкости, °C")
    supply_voltage: float = Field(default=220.0, gt=0, description="U — напряжение питания, В")
    connection_type: Literal["line_1ph", "loop_1ph", "star_3ph"] = Field(
        default="line_1ph",
        description="Схема подключения: line_1ph=линия 220В, loop_1ph=петля 220В, star_3ph=звезда 380В",
    )
    winding_coefficient: float = Field(
        default=1.0,
        ge=1.0,
        le=10.0,
        description="w — коэффициент намотки; может быть >1.5 при расчёте из шага навива",
    )
    winding_pitch: float | None = Field(
        default=None, ge=0, description="Шаг навива, мм; 0 или null — прямая укладка"
    )
    number_of_threads: int = Field(default=1, ge=1, le=3, description="Количество ниток")
    cable_catalog: list[dict[str, Any]] | None = Field(
        default=None, description="Каталог ТТ Р1; None — встроенный"
    )
    # Геометрия резервуара (для укладки на поверхность бака)
    tank_shape: Literal["cylindrical", "rectangular"] | None = Field(
        default=None, description="Форма резервуара для расчёта длины кабеля по периметру"
    )
    tank_diameter: float | None = Field(
        default=None, gt=0, description="Диаметр бака, м (для цилиндра)"
    )
    tank_length: float | None = Field(
        default=None, gt=0, description="Длина бака, м (для прямоугольника)"
    )
    tank_width: float | None = Field(
        default=None, gt=0, description="Ширина бака, м (для прямоугольника)"
    )
    heating_height: float | None = Field(
        default=None, gt=0, description="h_укл — высота зоны обогрева, м"
    )
    laying_step: float | None = Field(
        default=None, ge=0.05, le=0.5, description="w_step — шаг укладки, м"
    )


class ResistiveSingleCoreResult(BaseModel):
    selected_cable: str
    conductor_cross_section: float
    cable_length: float
    required_cross_section: float
    total_power: float
    current: float
    voltage: float
    connection_type: str
    winding_pitch: float
    winding_coefficient: float
    num_circuits: int


class ResistiveThreeCoreParams(BaseModel):
    """Параметры расчёта трёхжильного резистивного кабеля ТТ Р3."""

    required_heat_loss: float = Field(gt=0, description="Q — требуемые теплопотери, Вт")
    pipe_length: float = Field(gt=0, description="L — длина трубопровода, м")
    add_length: float = Field(default=0.0, ge=0, description="L_доп — дополнительная длина, м")
    process_temperature: float = Field(description="T_ж — температура жидкости, °C")
    supply_voltage: float = Field(default=220.0, gt=0, description="U — напряжение питания, В")
    connection_type: Literal["line_1ph", "loop_2x3", "loop_1x3", "star_3x3", "star_1x3"] = Field(
        default="line_1ph",
        description="Схема подключения трёхжильного кабеля",
    )
    winding_coefficient: float = Field(
        default=1.0,
        ge=1.0,
        le=10.0,
        description="w — коэффициент намотки; может быть >1.5 при расчёте из шага навива",
    )
    winding_pitch: float | None = Field(
        default=None, ge=0, description="Шаг навива, мм; 0 или null — прямая укладка"
    )
    number_of_threads: int = Field(default=1, ge=1, le=3, description="Количество ниток")
    cable_catalog: list[dict[str, Any]] | None = Field(
        default=None, description="Каталог ТТ Р3; None — встроенный"
    )
    # Геометрия резервуара
    tank_shape: Literal["cylindrical", "rectangular"] | None = Field(
        default=None, description="Форма резервуара для расчёта длины кабеля по периметру"
    )
    tank_diameter: float | None = Field(default=None, gt=0)
    tank_length: float | None = Field(default=None, gt=0)
    tank_width: float | None = Field(default=None, gt=0)
    heating_height: float | None = Field(
        default=None, gt=0, description="h_укл — высота зоны обогрева, м"
    )
    laying_step: float | None = Field(
        default=None, ge=0.05, le=0.5, description="w_step — шаг укладки, м"
    )


class ResistiveThreeCoreResult(BaseModel):
    selected_cable: str
    conductor_cross_section: float
    cable_length: float
    required_cross_section: float
    total_power: float
    current: float
    voltage: float
    connection_type: str
    winding_pitch: float
    winding_coefficient: float
    num_circuits: int


class ElectricalRequest(BaseModel):
    object_id: UUID
    cable_type: Literal[
        "self_regulating",
        "self_regulating_tt",
        "single_core",
        "three_core",
        "mineral",
        "skin",
    ]
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


class ElectricalPageSummary(BaseModel):
    """Агрегаты страницы электрорасчёта без передачи всех строк в браузер."""

    total_objects: int = 0
    valid_objects: int = 0
    invalid_objects: int = 0
    electrical_calculations_total: int = 0
    calculated_count: int = 0
    failed_count: int = 0
    total_cable_length: float = 0.0
    total_power: float = 0.0
    total_current: float = 0.0


class ElectricalPageResponse(BaseModel):
    """Постраничные данные для страницы электрорасчёта."""

    items: list[ProjectObjectResponse]
    calculations: list[ElectricalCalcSummary]
    summary: ElectricalPageSummary
    page_info: ProjectObjectsPageInfo


class BatchElectricalResponse(BaseModel):
    """Результат пакетного электрорасчёта всех объектов проекта."""

    calculated: int
    skipped: int
    heat_loss_failed: int = Field(
        default=0,
        description="Количество объектов с ошибками теплопотерь, исключённых из расчёта",
    )
    errors: list[dict[str, Any]] = Field(default_factory=list)
    results: list[ElectricalCalcSummary] = Field(default_factory=list)
