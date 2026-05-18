"""Схемы расчётов: вход/выход формул и API."""

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.formulas.heat_loss.insulation import InsulationTemperatureBasis
from app.reference_data.loader import get_insulation_temperature_range
from app.schemas.project import (
    ObjectQueryDefaultSort,
    ObjectQueryFieldCapability,
    ObjectQueryFilter,
    ObjectQuerySearch,
    ObjectQuerySearchCapability,
    ObjectQuerySort,
    ProjectObjectResponse,
    ProjectObjectsPageInfo,
)
from app.schemas.report import ReportExportTaskResult

# ---------- Heat loss ----------

GROUND_CONDUCTIVITY_MIN = 0.5
GROUND_CONDUCTIVITY_MAX = 3.0
TANK_DIAMETER_MIN = 0.1
TANK_DIAMETER_MAX = 30.0
TANK_HEIGHT_MIN = 0.1
TANK_HEIGHT_MAX = 50.0
TANK_SIDE_MIN = 0.1
TANK_SIDE_MAX = 100.0


def _fmt_temp(value: float) -> str:
    return f"{value:g}"


def _validate_temperature_range_shape(
    temperature_range: tuple[float, float],
    *,
    label: str,
) -> tuple[float, float]:
    min_temp = float(temperature_range[0])
    max_temp = float(temperature_range[1])
    if min_temp >= max_temp:
        raise ValueError(f"{label}: нижняя граница должна быть меньше верхней")
    return min_temp, max_temp


def _validate_temperature_in_material_range(
    *,
    material: str,
    process_temperature: float,
    temperature_range: tuple[float, float],
    label: str,
) -> None:
    min_temp, max_temp = _validate_temperature_range_shape(
        temperature_range,
        label=f"Температурный диапазон {label}",
    )
    if min_temp <= process_temperature <= max_temp:
        return
    raise ValueError(
        f"Температура продукта {_fmt_temp(process_temperature)} °C вне диапазона "
        f"{label} '{material}': {_fmt_temp(min_temp)}…{_fmt_temp(max_temp)} °C"
    )


def _validate_reference_insulation_temperature(
    *,
    material: str,
    process_temperature: float,
    label: str,
) -> None:
    if material == "other":
        raise ValueError(
            f"Для {label} 'other' задайте insulation_layers с conductivity и temperature_range"
        )
    _validate_temperature_in_material_range(
        material=material,
        process_temperature=process_temperature,
        temperature_range=get_insulation_temperature_range(material),
        label=label,
    )


class InsulationLayer(BaseModel):
    """Один слой тепловой изоляции (для многослойного расчёта)."""

    thickness: float = Field(gt=0, le=0.5, description="Толщина слоя, м (до 500 мм)")
    material: str = Field(min_length=1, description="Код материала из справочника")
    conductivity: float | None = Field(
        default=None,
        gt=0,
        le=400.0,
        description="λ слоя, Вт/(м·К) — используется только для материала 'other'",
    )
    temperature_range: tuple[float, float] | None = Field(
        default=None,
        description="Температурный диапазон применения слоя, °C — справочные метаданные",
    )

    @model_validator(mode="after")
    def check_material_contract(self) -> "InsulationLayer":
        if self.material == "other":
            if self.conductivity is None:
                raise ValueError("Для материала изоляции 'other' необходимо задать λ слоя")
            if self.temperature_range is None:
                raise ValueError(
                    "Для материала изоляции 'other' необходимо задать temperature_range слоя"
                )
            _validate_temperature_range_shape(
                self.temperature_range,
                label="Температурный диапазон материала изоляции 'other'",
            )
            return self
        get_insulation_temperature_range(self.material)
        return self


class PipeHeatLossParams(BaseModel):
    """Параметры для расчёта теплопотерь трубопровода.

    Поддерживает два режима:
    - Однослойный: insulation_thickness + insulation_material
    - Многослойный: insulation_layers (список InsulationLayer, 1–3 слоя)
    """

    model_config = ConfigDict(extra="forbid")

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
    insulation_temperature_basis: InsulationTemperatureBasis | None = Field(
        default=None,
        description=(
            "Режим расчётной температуры tm для λ изоляции: indoor/outdoor_summer/"
            "outdoor_winter/channel/tunnel/technical_subfloor/attic/basement"
        ),
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
    valve_count: int | None = Field(
        default=None,
        ge=0,
        le=100,
        description="Количество задвижек/клапанов для расчёта локальных элементов",
    )
    flange_count: int | None = Field(
        default=None,
        ge=0,
        le=100,
        description="Количество фланцев для расчёта локальных элементов",
    )
    support_count: int | None = Field(
        default=None,
        ge=0,
        le=100,
        description="Количество опор для расчёта локальных элементов",
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
        ge=GROUND_CONDUCTIVITY_MIN,
        le=GROUND_CONDUCTIVITY_MAX,
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
        if self.num_local_elements is None:
            local_count = sum(
                value or 0 for value in (self.valve_count, self.flange_count, self.support_count)
            )
            if local_count > 0:
                self.num_local_elements = local_count
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
        if has_single and not has_multi:
            assert self.insulation_material is not None
            _validate_reference_insulation_temperature(
                material=self.insulation_material,
                process_temperature=self.process_temperature,
                label="материала изоляции",
            )
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
    location_factor: float | None = Field(default=None, description="Коэффициент размещения")
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

    model_config = ConfigDict(extra="forbid")

    shape: Literal["cylindrical", "rectangular", "spherical"] = "cylindrical"
    diameter: float | None = Field(
        default=None,
        ge=TANK_DIAMETER_MIN,
        le=TANK_DIAMETER_MAX,
        description="d_р — наружный диаметр резервуара, м",
    )
    height: float | None = Field(default=None, ge=TANK_HEIGHT_MIN, le=TANK_HEIGHT_MAX)
    length: float | None = Field(default=None, ge=TANK_SIDE_MIN, le=TANK_SIDE_MAX)
    width: float | None = Field(default=None, ge=TANK_SIDE_MIN, le=TANK_SIDE_MAX)
    volume: float | None = Field(default=None, gt=0)
    insulation_thickness: float = Field(gt=0)
    insulation_material: str = Field(min_length=1)
    insulation_layers: list[InsulationLayer] | None = Field(
        default=None,
        description="N_iz — слои изоляции (1–3), многослойный режим",
    )
    ambient_temperature: float
    process_temperature: float
    insulation_temperature_basis: InsulationTemperatureBasis | None = Field(
        default=None,
        description=(
            "Режим расчётной температуры tm для λ изоляции: indoor/outdoor_summer/"
            "outdoor_winter/channel/tunnel/technical_subfloor/attic/basement"
        ),
    )
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
        ge=GROUND_CONDUCTIVITY_MIN,
        le=GROUND_CONDUCTIVITY_MAX,
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
        if not self.insulation_layers:
            _validate_reference_insulation_temperature(
                material=self.insulation_material,
                process_temperature=self.process_temperature,
                label="материала изоляции",
            )
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
    location_factor: float | None = None
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
    """Результат пакетного пересчёта теплопотерь всех объектов проекта."""

    updated: int
    failed: int
    errors: list[dict[str, Any]] = Field(default_factory=list)


# ---------- Electrical ----------


SelectionPolicy = Literal[
    "technical_minimum",
    "lowest_cost",
    "fastest_delivery",
    "in_stock",
    "preferred_supplier",
    "balanced",
]


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
    number_of_threads: int | None = Field(
        default=None,
        ge=1,
        le=3,
        description="Явно заданное количество ниток; null — автоподбор",
    )
    cable_catalog: list[dict[str, Any]] | None = Field(
        default=None,
        description=(
            "Источник кабелей для автоподбора / ручного выбора. "
            "Если None — используется встроенный справочник ТЛТ."
        ),
    )
    selection_policy: SelectionPolicy = Field(
        default="technical_minimum",
        description="Критерий выбора среди технически подходящих кабелей",
    )
    balanced_weights: dict[str, float] | None = Field(
        default=None,
        description=(
            "Веса commercial balanced ranking: cost, delivery, stock, supplier. "
            "Используются только если balanced_weights_approved=true."
        ),
    )
    balanced_weights_approved: bool = Field(
        default=False,
        description="Явное бизнес-утверждение весов balanced ranking",
    )
    balanced_weights_version: str | None = Field(
        default=None,
        description="Версия/источник весов balanced ranking",
    )


class SelfRegulatingResult(BaseModel):
    selected_cable: str
    cable_length: float
    installed_cable_length: float
    order_cable_length: float
    total_power: float
    current: float
    voltage: float
    winding_pitch: float
    winding_coefficient: float
    num_circuits: int
    requested_number_of_threads: int | None = None
    applied_number_of_threads: int
    number_of_threads_source: Literal["manual", "auto", "default", "previous_result"] = "auto"
    selection_policy: str = "technical_minimum"
    applied_selection_policy: str = "technical_minimum"
    selection_reason: str | None = None
    candidate_count: int = 0
    commercial: dict[str, Any] | None = None
    warnings: list[str] = Field(default_factory=list)


class SelfRegulatingTTParams(BaseModel):
    """Параметры расчёта саморегулирующегося кабеля серии ТТН/ТТВ/ТТХ."""

    required_power_per_meter: float = Field(gt=0, description="Требуемая мощность, Вт/м")
    pipe_length: float = Field(gt=0, description="Длина трубопровода/секции, м")
    process_temperature: float = Field(
        description="T1 — температура продукта для выбора серии ТТН/ТТВ/ТТХ, °C"
    )
    maintain_temperature: float | None = Field(
        default=None,
        description=(
            "T3 — температура поддержания для расчёта q_б(T3), °C; "
            "если не задана, для совместимости используется T1/process_temperature"
        ),
    )
    supply_voltage: float = Field(default=220.0, gt=0, description="U — напряжение питания, В")
    vapor_temperature: float | None = Field(
        default=None,
        description="T2 — температура пропарки для выбора серии ТТН/ТТВ/ТТХ, °C",
    )
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
        le=100,
        description="Заданное пользователем количество ниток; null — автоподбор по full-version policy",
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
    installed_cable_length: float
    order_cable_length: float
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
    selection_mode: Literal["manual", "auto"] = Field(
        default="manual",
        description=(
            "manual — прежний расчёт по явно заданной схеме; "
            "auto — full-version VSDX-подбор U/N/M по p2/p3 и 65 А"
        ),
    )
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
    number_of_threads: int = Field(default=1, ge=1, le=100, description="Количество ниток")
    max_current_a: float = Field(default=65.0, gt=0, description="Лимит тока резистивного кабеля")
    max_linear_power_w_m: float | None = Field(
        default=None,
        gt=0,
        description="Дополнительный лимит p3, Вт/м; если не задан — используется только 65 А",
    )
    max_parallel_schemes: int = Field(
        default=20,
        ge=1,
        le=1000,
        description="Максимальное M при full-version автоподборе",
    )
    start_voltage: float | None = Field(
        default=None,
        gt=0,
        description="Начальное U для автоподбора; fallback — supply_voltage",
    )
    high_voltage: float = Field(default=380.0, gt=0, description="U для повышенной схемы/звезды")
    min_adjusted_voltage: float = Field(
        default=1.0,
        gt=0,
        description="Минимальное U при шаговом снижении, если первый вариант перегрет",
    )
    voltage_step: float = Field(default=1.0, gt=0, description="Шаг снижения U в auto")
    maintain_temperature: float | None = Field(
        default=None,
        description="T1/температура поддержания для VSDX-подбора; fallback — process_temperature",
    )
    max_conductor_temperature: float | None = Field(
        default=None,
        description="T3 — максимальная температура жилы/кабеля из справочника; metadata для p3",
    )
    cable_catalog: list[dict[str, Any]] | None = Field(
        default=None, description="Каталог ТТ Р1; None — встроенный"
    )
    selection_policy: SelectionPolicy = Field(
        default="technical_minimum",
        description="Commercial ranking для auto-подбора среди технически подходящих схем",
    )
    balanced_weights: dict[str, float] | None = Field(default=None)
    balanced_weights_approved: bool = False
    balanced_weights_version: str | None = None
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
    installed_cable_length: float
    order_cable_length: float
    required_cross_section: float
    resistance_ohm_km: float | None = None
    circuit_resistance_ohm: float | None = None
    max_current_limit_a: float | None = None
    power_margin_w: float | None = None
    total_power: float
    current: float
    voltage: float
    connection_type: str
    winding_pitch: float
    winding_coefficient: float
    num_circuits: int
    selection_mode: str = "manual"
    scheme_count: int | None = None
    scheme_threads: int | None = None
    linear_power_w_m: float | None = None
    required_linear_power_w_m: float | None = None
    p2_w_m: float | None = None
    p3_w_m: float | None = None
    section_length_m: float | None = None
    l1_m: float | None = None
    l2_m: float | None = None
    selection_policy: str = "technical_minimum"
    applied_selection_policy: str = "technical_minimum"
    selection_reason: str | None = None
    candidate_count: int = 0
    commercial: dict[str, Any] | None = None
    warnings: list[str] = Field(default_factory=list)


class ResistiveThreeCoreParams(BaseModel):
    """Параметры расчёта трёхжильного резистивного кабеля ТТ Р3."""

    required_heat_loss: float = Field(gt=0, description="Q — требуемые теплопотери, Вт")
    pipe_length: float = Field(gt=0, description="L — длина трубопровода, м")
    add_length: float = Field(default=0.0, ge=0, description="L_доп — дополнительная длина, м")
    process_temperature: float = Field(description="T_ж — температура жидкости, °C")
    supply_voltage: float = Field(default=220.0, gt=0, description="U — напряжение питания, В")
    selection_mode: Literal["manual", "auto"] = Field(
        default="manual",
        description=(
            "manual — прежний расчёт по явно заданной схеме; "
            "auto — full-version VSDX-подбор U/N/M по p2/p3 и 65 А"
        ),
    )
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
    number_of_threads: int = Field(default=1, ge=1, le=100, description="Количество ниток")
    max_current_a: float = Field(default=65.0, gt=0, description="Лимит тока резистивного кабеля")
    max_linear_power_w_m: float | None = Field(
        default=None,
        gt=0,
        description="Дополнительный лимит p3, Вт/м; если не задан — используется только 65 А",
    )
    max_parallel_schemes: int = Field(
        default=20,
        ge=1,
        le=1000,
        description="Максимальное M при full-version автоподборе",
    )
    start_voltage: float | None = Field(
        default=None,
        gt=0,
        description="Начальное U для автоподбора; fallback — supply_voltage",
    )
    high_voltage: float = Field(default=380.0, gt=0, description="U для повышенной схемы/звезды")
    min_adjusted_voltage: float = Field(
        default=1.0,
        gt=0,
        description="Минимальное U при шаговом снижении, если первый вариант перегрет",
    )
    voltage_step: float = Field(default=1.0, gt=0, description="Шаг снижения U в auto")
    maintain_temperature: float | None = Field(
        default=None,
        description="T1/температура поддержания для VSDX-подбора; fallback — process_temperature",
    )
    max_conductor_temperature: float | None = Field(
        default=None,
        description="T3 — максимальная температура жилы/кабеля из справочника; metadata для p3",
    )
    cable_catalog: list[dict[str, Any]] | None = Field(
        default=None, description="Каталог ТТ Р3; None — встроенный"
    )
    selection_policy: SelectionPolicy = Field(
        default="technical_minimum",
        description="Commercial ranking для auto-подбора среди технически подходящих схем",
    )
    balanced_weights: dict[str, float] | None = Field(default=None)
    balanced_weights_approved: bool = False
    balanced_weights_version: str | None = None
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
    installed_cable_length: float
    order_cable_length: float
    required_cross_section: float
    resistance_ohm_km: float | None = None
    circuit_resistance_ohm: float | None = None
    max_current_limit_a: float | None = None
    power_margin_w: float | None = None
    total_power: float
    current: float
    voltage: float
    connection_type: str
    winding_pitch: float
    winding_coefficient: float
    num_circuits: int
    selection_mode: str = "manual"
    scheme_count: int | None = None
    scheme_threads: int | None = None
    linear_power_w_m: float | None = None
    required_linear_power_w_m: float | None = None
    p2_w_m: float | None = None
    p3_w_m: float | None = None
    section_length_m: float | None = None
    l1_m: float | None = None
    l2_m: float | None = None
    selection_policy: str = "technical_minimum"
    applied_selection_policy: str = "technical_minimum"
    selection_reason: str | None = None
    candidate_count: int = 0
    commercial: dict[str, Any] | None = None
    warnings: list[str] = Field(default_factory=list)


ElectricalCableType = Literal[
    "self_regulating",
    "self_regulating_tt",
    "single_core",
    "three_core",
    "mineral",
    "skin",
]


class ElectricalRequest(BaseModel):
    object_id: UUID
    cable_type: ElectricalCableType
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
    cable_type_source: str = "auto"
    cable_mark: str | None
    cable_mark_source: str = "auto"
    variant_number: int
    params: dict[str, Any] | None = None
    results: dict[str, Any] | None


class ElectricalPageSummary(BaseModel):
    """Агрегаты страницы электрорасчёта без передачи всех строк в браузер."""

    total_objects: int = 0
    valid_objects: int = 0
    invalid_objects: int = 0
    electrical_calculations_total: int = 0
    calculated_count: int = 0
    failed_count: int = 0
    manual_cable_mark_count: int = 0
    total_cable_length: float = 0.0
    total_power: float = 0.0
    total_current: float = 0.0


class ElectricalPageResponse(BaseModel):
    """Постраничные данные для страницы электрорасчёта."""

    items: list[ProjectObjectResponse]
    calculations: list[ElectricalCalcSummary]
    summary: ElectricalPageSummary
    page_info: ProjectObjectsPageInfo


class ElectricalQueryRequest(BaseModel):
    """Backend-query таблицы электрорасчёта."""

    project_id: UUID
    variant_number: int = 1
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=50, ge=1, le=200)
    after_sort_order: int | None = None
    after_id: UUID | None = None
    after_key: str | None = None
    after_value: Any | None = None
    after_value_is_null: bool = False
    search: ObjectQuerySearch | None = None
    filters: list[ObjectQueryFilter] = Field(default_factory=list, max_length=20)
    sort: ObjectQuerySort | None = None


class ElectricalQueryCounts(BaseModel):
    """Счётчики backend-query таблицы электрорасчёта."""

    total: int
    filtered: int


class ElectricalQueryEcho(BaseModel):
    """Нормализованный query, применённый к таблице электрорасчёта."""

    variant_number: int
    sort: ObjectQuerySort | None = None


class ElectricalQueryResponse(BaseModel):
    """Постраничные данные электрорасчёта после поиска/фильтрации/сортировки."""

    items: list[ProjectObjectResponse]
    calculations: list[ElectricalCalcSummary]
    summary: ElectricalPageSummary
    page_info: ProjectObjectsPageInfo
    counts: ElectricalQueryCounts
    query: ElectricalQueryEcho


class ElectricalQueryCapabilitiesResponse(BaseModel):
    """Возможности backend-фильтров и сортировок таблицы электрорасчёта."""

    version: int
    default_page_size: int
    max_page_size: int
    default_sort: ObjectQueryDefaultSort
    search: ObjectQuerySearchCapability
    fields: list[ObjectQueryFieldCapability]


class BatchElectricalResponse(BaseModel):
    """Результат пакетного электрорасчёта всех объектов проекта."""

    calculated: int
    skipped: int
    scope: Literal["all", "selected"] = "all"
    heat_loss_failed: int = Field(
        default=0,
        description="Количество объектов с ошибками теплопотерь, исключённых из расчёта",
    )
    errors: list[dict[str, Any]] = Field(default_factory=list)
    results: list[ElectricalCalcSummary] = Field(default_factory=list)


TaskStatus = Literal["queued", "enqueued", "running", "succeeded", "failed", "cancelled"]


class ElectricalObjectBatchOverride(BaseModel):
    """Переопределение параметров электрорасчёта для конкретного объекта."""

    object_id: UUID
    cable_type: ElectricalCableType | None = None


class ElectricalBatchJobRequest(BaseModel):
    """Запрос асинхронного пакетного электрорасчёта."""

    project_id: UUID
    object_ids: list[UUID] | None = Field(default=None, min_length=1)
    cable_source: str = "builtin"
    variant_number: int = Field(default=1, ge=1, le=4)
    cable_type: ElectricalCableType = "self_regulating"
    selection_policy: SelectionPolicy = "technical_minimum"
    object_overrides: list[ElectricalObjectBatchOverride] | None = None
    force_cable_type: bool = False
    supply_voltage: float | None = None
    connection_type: str | None = None
    winding_coefficient: float | None = None
    winding_pitch: float | None = None
    number_of_threads: int | None = None
    heating_height: float | None = None
    laying_step: float | None = None
    maintain_temperature: float | None = None
    vapor_temperature: float | None = None
    aggressive_product: bool = False
    skip_manual: bool = True
    include_results: bool = False
    include_errors: bool = True

    def electrical_params(self) -> dict[str, Any]:
        return {
            "supply_voltage": self.supply_voltage,
            "connection_type": self.connection_type,
            "winding_coefficient": self.winding_coefficient,
            "winding_pitch": self.winding_pitch,
            "number_of_threads": self.number_of_threads,
            "heating_height": self.heating_height,
            "laying_step": self.laying_step,
            "maintain_temperature": self.maintain_temperature,
            "vapor_temperature": self.vapor_temperature,
            "aggressive_product": self.aggressive_product,
            "selection_policy": self.selection_policy,
        }


class HeatLossBatchJobRequest(BaseModel):
    """Запрос асинхронного пакетного пересчёта теплопотерь."""

    project_id: UUID
    include_errors: bool = True
    object_ids: list[UUID] | None = None


class CalculationTaskProgress(BaseModel):
    current: int = 0
    total: int | None = None
    phase: str | None = None
    percent: float | None = None


class CalculationTaskLinks(BaseModel):
    status: str
    result: str
    cancel: str


class CalculationTaskResponse(BaseModel):
    """Состояние background task для UI/polling."""

    id: UUID
    type: str
    status: TaskStatus
    project_id: UUID | None = None
    progress: CalculationTaskProgress
    result: BatchElectricalResponse | BatchCalcResponse | ReportExportTaskResult | None = None
    error_message: str | None = None
    cancel_requested: bool = False
    created_at: datetime
    started_at: datetime | None = None
    finished_at: datetime | None = None
    links: CalculationTaskLinks
