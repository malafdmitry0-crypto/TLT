"""Схемы расчётов: вход/выход формул и API."""

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.formulas.heat_loss.insulation import (
    InsulationTemperatureBasis,
    validate_insulation_temperature_basis_for_placement,
)
from app.reference_data.loader import get_insulation_temperature_range
from app.schemas.electrical_variant import (
    ElectricalAssignmentState,
    ElectricalSystemType,
)
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
RESISTIVE_DEFAULT_MIN_ADJUSTED_VOLTAGE = 40.0
RESISTIVE_DEFAULT_VOLTAGE_STEP = 5.0


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


def _validate_insulation_temperature_basis_for_location(
    *,
    basis: InsulationTemperatureBasis | None,
    location: str | None,
    placement: str | None,
) -> None:
    validate_insulation_temperature_basis_for_placement(
        basis=basis,
        location=location,
        placement=placement,
    )


class InsulationLayer(BaseModel):
    """Один слой тепловой изоляции (для многослойного расчёта)."""

    model_config = ConfigDict(extra="forbid")

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


class InsulationLayerApplied(BaseModel):
    """Resolved layer values persisted in the flat heat-calculation trace."""

    model_config = ConfigDict(extra="forbid")

    index: int = Field(ge=1, le=3)
    thickness: float = Field(gt=0)
    material: str = Field(min_length=1)
    conductivity_applied: float = Field(gt=0)
    conductivity_source: Literal["manual", "reference_data"]
    conductivity_temperature_applied: float
    resistance: float = Field(ge=0)
    resistance_unit: Literal["m*K/W", "m2*K/W"]


class PipeHeatLossParams(BaseModel):
    """Canonical formula-only parameters for pipe heat loss."""

    model_config = ConfigDict(extra="forbid")

    outer_diameter: float = Field(
        ge=0.0108,
        le=3.0,
        description="d_tp — наружный диаметр трубы, м",
    )
    wall_thickness: float = Field(
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

    insulation_layers: list[InsulationLayer] = Field(
        min_length=1,
        max_length=3,
        description="N_iz — единственный канонический список слоёв изоляции (1–3)",
    )

    # --- Температуры ---
    ambient_temperature: float | None = Field(
        default=None,
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

    pipe_length: float = Field(
        ge=0.5,
        le=200_000.0,
        description="L — длина трубопровода / секции, м",
    )
    pipe_centerline_depth: float | None = Field(
        default=None,
        ge=0.0,
        le=200.0,
        description="H — глубина заложения трубы, м",
    )
    num_local_elements: int = Field(
        default=0,
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
    ground_temperature: float | None = Field(default=None, ge=-70.0, le=70.0)
    safety_factor: float | None = Field(
        default=None,
        ge=1.0,
        le=1.7,
        description="K — коэффициент запаса",
    )
    placement: Literal["indoor", "outdoor", "underground"]

    @model_validator(mode="after")
    def check_canonical_contract(self) -> "PipeHeatLossParams":
        _validate_insulation_temperature_basis_for_location(
            basis=self.insulation_temperature_basis,
            location=None,
            placement=self.placement,
        )
        if (self.pipe_material is None) == (self.pipe_lambda is None):
            raise ValueError("Задайте ровно один источник λ трубы: pipe_material или pipe_lambda")
        if self.wall_thickness >= self.outer_diameter / 2:
            raise ValueError("wall_thickness должна быть меньше половины outer_diameter")
        for index, layer in enumerate(self.insulation_layers, start=1):
            if layer.material != "other" and (
                layer.conductivity is not None or layer.temperature_range is not None
            ):
                raise ValueError(
                    f"Справочный слой #{index} не должен содержать ручные conductivity/temperature_range"
                )
            if layer.material != "other":
                _validate_reference_insulation_temperature(
                    material=layer.material,
                    process_temperature=self.process_temperature,
                    label=f"материала изоляции #{index}",
                )
        if self.num_local_elements > 0 and self.local_element_equiv_length is None:
            raise ValueError(
                "Для num_local_elements > 0 требуется local_element_equiv_length"
            )
        if self.placement == "underground":
            if self.ground_temperature is None:
                raise ValueError("Для underground требуется ground_temperature")
            if self.pipe_centerline_depth is None:
                raise ValueError("Для underground требуется pipe_centerline_depth")
            if self.ground_conductivity is None:
                raise ValueError("Для underground требуется ground_conductivity")
            if self.ambient_temperature is not None:
                raise ValueError("ambient_temperature запрещена для underground pipe")
            if self.wind_speed is not None or self.alpha_vnesh is not None:
                raise ValueError("wind_speed и alpha_vnesh запрещены для underground pipe")
            if self.process_temperature <= self.ground_temperature:
                raise ValueError(
                    "process_temperature_not_above_ground: температура продукта должна быть выше температуры грунта"
                )
            outer_radius = self.outer_diameter / 2 + sum(
                layer.thickness for layer in self.insulation_layers
            )
            if self.pipe_centerline_depth <= outer_radius:
                raise ValueError(
                    "Глубина заложения pipe_centerline_depth должна быть больше наружного радиуса изоляции"
                )
        else:
            if self.ambient_temperature is None:
                raise ValueError("Для воздушной трубы требуется ambient_temperature")
            if self.process_temperature <= self.ambient_temperature:
                raise ValueError(
                    "process_temperature_not_above_ambient: температура продукта должна быть выше температуры среды"
                )
            if self.pipe_centerline_depth is not None:
                raise ValueError("pipe_centerline_depth допустима только для underground")
            if self.ground_temperature is not None or self.ground_conductivity is not None:
                raise ValueError("Грунтовые параметры допустимы только для underground")
            if self.placement == "outdoor" and self.alpha_vnesh is None and self.wind_speed is None:
                raise ValueError("Для outdoor auto требуется wind_speed")
        return self


class StoredPipeHeatParams(PipeHeatLossParams):
    """Strict stored heat-owned pipe payload, including provenance metadata."""

    safety_factor: float = Field(ge=1.0, le=1.7)
    ground_type: str | None = None
    climate_key: str | None = None
    climate_city: str | None = None
    climate_region: str | None = None
    climate_temperature_basis: Literal["t_0_92", "t_0_98", "t_abs_min"] | None = None
    ambient_temperature_source: Literal["manual", "climate"] | None = None
    ground_temperature_source: Literal["manual", "climate"] | None = None
    wind_speed_source: Literal["manual", "climate"] | None = None
    ground_conductivity_source: Literal["manual", "reference"] | None = None
    safety_factor_source: Literal["default", "manual", "climate_policy"] | None = None
    climate_policy_rule: Literal["pipe_diameter_ge_100", "pipe_diameter_lt_100"] | None = None
    insulation_cover_material: str | None = None

    @model_validator(mode="after")
    def check_metadata_matches_placement(self) -> "StoredPipeHeatParams":
        if self.placement == "underground":
            if (
                self.ambient_temperature_source is not None
                or self.wind_speed_source is not None
                or self.climate_temperature_basis is not None
            ):
                raise ValueError(
                    "Метаданные температуры воздуха и ветра запрещены для underground pipe"
                )
        elif (
            self.ground_type is not None
            or self.ground_temperature_source is not None
            or self.ground_conductivity_source is not None
        ):
            raise ValueError("Метаданные грунта допустимы только для underground pipe")
        return self


class PipeHeatLossResult(BaseModel):
    """Canonical pipe heat result; base values never include safety_factor."""

    model_config = ConfigDict(extra="forbid", protected_namespaces=())

    heat_loss_per_meter_base: float = Field(description="Базовые теплопотери, Вт/м")
    heat_loss_per_meter_design: float = Field(description="Проектные теплопотери, Вт/м")
    total_heat_loss_base: float = Field(description="Базовые полные теплопотери, Вт")
    total_heat_loss_design: float = Field(description="Проектные полные теплопотери, Вт")
    effective_length: float = Field(description="Расчётная длина с учётом локальных элементов, м")
    additional_equivalent_length: float = Field(description="Дополнительная эквивалентная длина, м")
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
    alpha_vnesh_applied: float | None = Field(
        default=None,
        description="Коэффициент внешней теплоотдачи, Вт/(м²·К)",
    )
    wind_speed_applied: float | None = Field(default=None, description="Скорость ветра, м/с")
    ground_conductivity_applied: float | None = Field(
        default=None,
        description="Теплопроводность грунта, Вт/(м·К)",
    )
    safety_factor_applied: float = Field(description="Применённый коэффициент запаса")
    local_elements_count_applied: int | None = Field(
        default=None,
        description="Количество локальных элементов",
    )
    local_element_equiv_length_applied: float | None = Field(
        default=None,
        description="Эквивалентная длина одного локального элемента, м",
    )
    formula_model: str
    formula_model_version: str
    model_assumptions: list[str] = Field(default_factory=list)
    process_temperature_applied: float | None = None
    ambient_temperature_applied: float | None = None
    ground_temperature_applied: float | None = None
    insulation_layers_applied: list[InsulationLayerApplied] = Field(default_factory=list)
    input_units: dict[str, str] = Field(default_factory=dict)
    applied_units: dict[str, str] = Field(default_factory=dict)
    source_corrections: list[str] = Field(default_factory=list)


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
    insulation_layers: list[InsulationLayer] = Field(min_length=1, max_length=3)
    ambient_temperature: float | None = Field(default=None, ge=-70.0, le=70.0)
    ground_temperature: float | None = Field(default=None, ge=-70.0, le=70.0)
    process_temperature: float = Field(ge=-90.0, le=600.0)
    insulation_temperature_basis: InsulationTemperatureBasis | None = Field(
        default=None,
        description=(
            "Режим расчётной температуры tm для λ изоляции: indoor/outdoor_summer/"
            "outdoor_winter/channel/tunnel/technical_subfloor/attic/basement"
        ),
    )
    placement: Literal["indoor", "outdoor", "underground"]
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
        le=500,
        description="λ_р — теплопроводность стенки резервуара, Вт/(м·К)",
    )
    tank_buried_height: float | None = Field(
        default=None,
        gt=0.0,
        le=TANK_HEIGHT_MAX,
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
    safety_factor: float = Field(
        ge=1.0,
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
        _validate_insulation_temperature_basis_for_location(
            basis=self.insulation_temperature_basis,
            location="indoor" if self.placement == "indoor" else "outdoor",
            placement=self.placement,
        )
        for index, layer in enumerate(self.insulation_layers, start=1):
            if layer.material != "other" and (
                layer.conductivity is not None or layer.temperature_range is not None
            ):
                raise ValueError(
                    f"Справочный слой #{index} не должен содержать ручные "
                    "conductivity/temperature_range"
                )
            if layer.material != "other":
                _validate_reference_insulation_temperature(
                    material=layer.material,
                    process_temperature=self.process_temperature,
                    label=f"материала изоляции #{index}",
                )
        if self.placement == "underground":
            if self.shape == "spherical":
                raise ValueError("spherical + underground не поддерживается")
            if self.ground_temperature is None:
                raise ValueError("Для underground требуется ground_temperature")
            if self.ground_conductivity is None:
                raise ValueError("Для underground требуется ground_conductivity")
            if self.tank_buried_height is None:
                raise ValueError("Для underground требуется tank_buried_height")
            if self.height is None or self.tank_buried_height > self.height:
                raise ValueError("tank_buried_height должна быть в диапазоне (0, height]")
            if self.ambient_temperature is None:
                raise ValueError("Для underground требуется ambient_temperature")
            if self.process_temperature <= self.ambient_temperature:
                raise ValueError("process_temperature_not_above_ambient")
            if self.process_temperature <= self.ground_temperature:
                raise ValueError("process_temperature_not_above_ground")
            if self.alpha_vnesh is None and self.wind_speed is None:
                raise ValueError("Для underground tank auto требуется wind_speed")
        else:
            if self.ambient_temperature is None:
                raise ValueError("Для воздушного резервуара требуется ambient_temperature")
            if self.process_temperature <= self.ambient_temperature:
                raise ValueError("process_temperature_not_above_ambient")
            if self.ground_temperature is not None or self.ground_conductivity is not None:
                raise ValueError("Грунтовые параметры допустимы только для underground")
            if self.tank_buried_height is not None:
                raise ValueError("tank_buried_height допустима только для underground")
            if self.placement == "outdoor" and self.alpha_vnesh is None and self.wind_speed is None:
                raise ValueError("Для outdoor auto требуется wind_speed")
        if (self.wall_thickness is None) != (self.wall_lambda is None):
            raise ValueError("wall_thickness и wall_lambda задаются парой")
        if (
            self.shape in {"cylindrical", "spherical"}
            and self.wall_thickness is not None
            and self.diameter is not None
            and self.wall_thickness >= self.diameter / 2
        ):
            raise ValueError("wall_thickness должна быть меньше половины diameter")
        if self.shape == "cylindrical" and (self.diameter is None or self.height is None):
            raise ValueError("Для цилиндра требуются diameter и height")
        if self.shape == "rectangular" and (
            self.length is None or self.width is None or self.height is None
        ):
            raise ValueError("Для параллелепипеда требуются length, width и height")
        if self.shape == "spherical" and self.diameter is None:
            raise ValueError("Для сферы требуется diameter")
        if self.shape == "cylindrical" and (self.length is not None or self.width is not None):
            raise ValueError("cylindrical не принимает length или width")
        if self.shape == "rectangular" and self.diameter is not None:
            raise ValueError("rectangular не принимает diameter")
        if self.shape == "spherical" and any(
            value is not None for value in (self.height, self.length, self.width)
        ):
            raise ValueError("spherical не принимает height, length или width")
        return self


class StoredTankHeatParams(TankHeatLossParams):
    """Strict stored heat-owned tank payload, including provenance metadata."""

    ground_type: str | None = None
    climate_key: str | None = None
    climate_city: str | None = None
    climate_region: str | None = None
    climate_temperature_basis: Literal["t_0_92", "t_0_98", "t_abs_min"] | None = None
    ambient_temperature_source: Literal["manual", "climate"] | None = None
    ground_temperature_source: Literal["manual", "climate"] | None = None
    wind_speed_source: Literal["manual", "climate"] | None = None
    ground_conductivity_source: Literal["manual", "reference"] | None = None
    safety_factor_source: Literal["default", "manual", "climate_policy"] | None = None
    climate_policy_rule: str | None = None
    insulation_cover_material: str | None = None

    @model_validator(mode="after")
    def check_metadata_matches_placement(self) -> "StoredTankHeatParams":
        if self.placement != "underground" and (
            self.ground_type is not None
            or self.ground_temperature_source is not None
            or self.ground_conductivity_source is not None
        ):
            raise ValueError("Метаданные грунта допустимы только для underground tank")
        return self


class TankHeatLossResult(BaseModel):
    """Canonical tank heat result; additional load is applied after K."""

    model_config = ConfigDict(extra="forbid", protected_namespaces=())

    total_heat_loss_base: float
    total_heat_loss_design: float
    heat_loss_per_m2_bare_base: float
    heat_loss_per_m2_bare_design: float
    surface_area_bare: float
    thermal_resistance_areal_bare: float | None = None
    wall_resistance_areal_bare: float | None = None
    insulation_resistance_areal_bare: float | None = None
    external_resistance_areal_bare: float | None = None
    ground_resistance_areal_bare: float | None = None
    air_surface_area: float | None = None
    ground_surface_area: float | None = None
    heat_loss_air_base: float | None = None
    heat_loss_ground_base: float | None = None
    alpha_vnesh_applied: float | None = None
    wind_speed_applied: float | None = None
    ground_conductivity_applied: float | None = None
    safety_factor_applied: float
    q_additional_applied: float = 0.0
    formula_model: str
    formula_model_version: str
    model_assumptions: list[str] = Field(default_factory=list)
    process_temperature_applied: float | None = None
    ambient_temperature_applied: float | None = None
    ground_temperature_applied: float | None = None
    insulation_layers_applied: list[InsulationLayerApplied] = Field(default_factory=list)
    input_units: dict[str, str] = Field(default_factory=dict)
    applied_units: dict[str, str] = Field(default_factory=dict)
    source_corrections: list[str] = Field(default_factory=list)


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
    process_temperature: float = Field(description="Температура продукта для проверки T_max кабеля")
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
    power_per_meter: float
    installed_power_per_meter: float
    total_power: float
    current: float
    voltage: float
    winding_pitch: float
    winding_coefficient: float
    num_circuits: int
    # PDL-ER-33: explicit catalog identity fields (no mark prefix inference).
    cable_model: str | None = None
    temperature_group: Literal["low", "high"] = "low"
    series: str | None = "ТЛТ"
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
    max_start_current_per_section: float | None = Field(
        default=None,
        gt=0,
        description=(
            "Iдоп — допустимый стартовый ток одной нагревательной секции, А; "
            "при отсутствии применяется паспортное Lмакс"
        ),
    )
    vapor_temperature: float | None = Field(
        default=None,
        description="T2 — температура пропарки для выбора серии ТТН/ТТВ/ТТХ, °C",
    )
    aggressive_product: bool = Field(
        default=False,
        description="Агрессивная среда → суффикс -СР; неагрессивная → -СТ в марке",
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
    laying_step: float | None = Field(default=None, ge=0.1, le=0.4)


class SelfRegulatingTTResult(BaseModel):
    selected_cable: str
    cable_mark: str
    series: str
    # PDL-ER-33: explicit fields for BOM temperature-group routing.
    cable_model: str | None = None
    temperature_group: Literal["low", "high"] | None = None
    cable_length: float
    installed_cable_length: float
    order_cable_length: float
    num_circuits: int
    power_per_meter: float
    installed_power_per_meter: float
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
        description="Override лимита p3, Вт/м; в auto по умолчанию берётся ТТ Р1=40 из справочника",
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
        default=RESISTIVE_DEFAULT_MIN_ADJUSTED_VOLTAGE,
        gt=0,
        description="Минимальное U при шаговом снижении, если первый вариант перегрет",
    )
    voltage_step: float = Field(
        default=RESISTIVE_DEFAULT_VOLTAGE_STEP,
        gt=0,
        description="Шаг снижения U в auto",
    )
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
        default=None,
        ge=0.1,
        le=0.4,
        description="w_step — шаг укладки, м",
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
        description="Override лимита p3, Вт/м; в auto по умолчанию берётся ТТ Р3=50 из справочника",
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
        default=RESISTIVE_DEFAULT_MIN_ADJUSTED_VOLTAGE,
        gt=0,
        description="Минимальное U при шаговом снижении, если первый вариант перегрет",
    )
    voltage_step: float = Field(
        default=RESISTIVE_DEFAULT_VOLTAGE_STEP,
        gt=0,
        description="Шаг снижения U в auto",
    )
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
        default=None,
        ge=0.1,
        le=0.4,
        description="w_step — шаг укладки, м",
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
ElectricalCableSource = Literal["builtin", "commercial", "extended", "all"]


class ElectricalRequest(BaseModel):
    object_id: UUID
    cable_type: ElectricalCableType
    data: dict[str, Any]
    variant_number: int = 1
    electrical_variant_id: UUID | None = None


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
    cable_snapshot: dict[str, Any] | None = None
    cable_snapshot_status: dict[str, Any] | None = None
    variant_number: int
    params: dict[str, Any] | None = None
    results: dict[str, Any] | None


class ElectricalCableSelectionVariantsRequest(BaseModel):
    """Атомарное применение выбора кабеля к нескольким СО одного объекта."""

    object_id: UUID
    cable_mark: str | None = None
    cable_source: ElectricalCableSource = "builtin"
    variant_numbers: list[int] = Field(default_factory=lambda: [1], min_length=1, max_length=5)
    electrical_variant_ids: dict[int, UUID] = Field(default_factory=dict)
    cable_type: ElectricalCableType = "self_regulating"
    selection_mode: Literal["auto", "manual"] | None = None
    supply_voltage: float | None = None
    connection_type: str | None = None
    winding_coefficient: float | None = None
    winding_pitch: float | None = None
    number_of_threads: int | None = None
    heating_height: float | None = None
    laying_step: float | None = Field(default=None, ge=0.1, le=0.4)
    maintain_temperature: float | None = None
    vapor_temperature: float | None = None
    aggressive_product: bool = False
    selection_policy: SelectionPolicy = "technical_minimum"

    @model_validator(mode="after")
    def normalize_variants_and_mark(self) -> "ElectricalCableSelectionVariantsRequest":
        normalized_variants = list(dict.fromkeys(int(value) for value in self.variant_numbers))
        invalid = [value for value in normalized_variants if value < 1 or value > 5]
        if invalid:
            raise ValueError("variant_numbers должны быть от 1 до 5")
        if not normalized_variants:
            raise ValueError("Нужно выбрать хотя бы одно СО")
        self.variant_numbers = normalized_variants
        if self.electrical_variant_ids and set(self.electrical_variant_ids) != set(
            normalized_variants
        ):
            raise ValueError(
                "electrical_variant_ids должны точно соответствовать variant_numbers"
            )
        if isinstance(self.cable_mark, str):
            mark = self.cable_mark.strip()
            self.cable_mark = mark or None
        return self

    def electrical_params(self) -> dict[str, Any]:
        return {
            "selection_mode": self.selection_mode,
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


ElectricalCandidateMode = Literal["auto", "manual"]
ElectricalCandidateStatus = Literal["applicable", "error", "not_applicable", "excluded", "stale"]


class ElectricalCandidateCreateRequest(BaseModel):
    """Создание кандидата подбора кабеля без применения в основной расчёт."""

    project_id: UUID
    object_id: UUID
    variant_number: int = Field(default=1, ge=1, le=5)
    electrical_variant_id: UUID | None = None
    cable_type: ElectricalCableType = "self_regulating"
    cable_source: ElectricalCableSource = "builtin"
    mode: ElectricalCandidateMode = "auto"
    cable_mark: str | None = None
    electrical_params: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def check_manual_mark(self) -> "ElectricalCandidateCreateRequest":
        if self.mode == "manual" and not self.cable_mark:
            raise ValueError("Для ручного варианта подбора укажите cable_mark")
        if self.mode == "auto" and self.cable_mark:
            raise ValueError("Авторасчёт кандидата запускается без cable_mark")
        return self


class ElectricalCandidateUpdateRequest(BaseModel):
    """Редактирование инженерских пометок кандидата."""

    priority: int | None = Field(default=None, ge=0, le=100)
    is_recommended: bool | None = None
    is_pinned: bool | None = None
    status: Literal["applicable", "excluded"] | None = None
    engineer_comment: str | None = Field(default=None, max_length=2000)


class ElectricalCandidateResponse(BaseModel):
    """Кандидат кабеля для модалки SC-04 «Подбор»."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    project_id: UUID
    object_id: UUID
    variant_number: int
    electrical_variant_id: UUID | None = None
    cable_type: str
    cable_source: str
    cable_mark: str | None
    dedupe_key: str
    mode: str
    status: str
    priority: int
    is_recommended: bool
    is_pinned: bool
    is_applied: bool
    reason_code: str | None = None
    reason_message: str | None = None
    engineer_comment: str | None = None
    params: dict[str, Any] = Field(default_factory=dict)
    results: dict[str, Any] | None = None
    cable_snapshot: dict[str, Any] | None = None
    warnings: list[Any] = Field(default_factory=list)
    risk_flags: list[Any] = Field(default_factory=list)
    candidate_meta: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    updated_at: datetime


class ElectricalCandidateUpsertResponse(BaseModel):
    """Результат создания или обновления кандидата (идентичный инженерный вариант)."""

    candidate: ElectricalCandidateResponse
    action: Literal["created", "updated"]


class ElectricalCandidateApplyResponse(BaseModel):
    """Результат применения кандидата в основной электрорасчёт."""

    candidate: ElectricalCandidateResponse
    calculation: ElectricalCalcSummary


class ElectricalCandidateFolderCreateRequest(BaseModel):
    """Создание пользовательской папки вариантов подбора."""

    project_id: UUID
    object_id: UUID
    variant_number: int = Field(default=1, ge=1, le=5)
    electrical_variant_id: UUID | None = None
    name: str = Field(min_length=1, max_length=64)
    color: str | None = Field(default=None, max_length=32)


class ElectricalCandidateFolderUpdateRequest(BaseModel):
    """Редактирование пользовательской папки вариантов подбора."""

    name: str | None = Field(default=None, min_length=1, max_length=64)
    color: str | None = Field(default=None, max_length=32)
    sort_order: int | None = Field(default=None, ge=0)


class ElectricalCandidateFolderResponse(BaseModel):
    """Пользовательская папка вариантов подбора."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    project_id: UUID
    object_id: UUID
    variant_number: int
    electrical_variant_id: UUID | None = None
    name: str
    color: str | None = None
    sort_order: int
    candidate_ids: list[UUID] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class ElectricalCandidateFolderItemRequest(BaseModel):
    """Добавление кандидата в пользовательскую папку."""

    candidate_id: UUID


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
    electrical_variant_id: UUID | None = None
    cable_source: ElectricalCableSource = "builtin"
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


class ElectricalQueryAssignment(BaseModel):
    """Assignment snapshot for one object on the current electrical page."""

    object_id: UUID
    system_type: ElectricalSystemType | None
    assignment_state: ElectricalAssignmentState
    version: int = Field(ge=1)


class ElectricalQueryResponse(BaseModel):
    """Постраничные данные электрорасчёта после поиска/фильтрации/сортировки."""

    items: list[ProjectObjectResponse]
    calculations: list[ElectricalCalcSummary]
    assignments: list[ElectricalQueryAssignment] = Field(default_factory=list)
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
    """Результат расчёта назначенного exact ER/system scope."""

    calculated: int
    skipped: int
    scope: Literal["all", "selected"] = "all"
    heat_loss_failed: int = Field(
        default=0,
        description="Количество объектов с ошибками теплопотерь, исключённых из расчёта",
    )
    errors: list[dict[str, Any]] = Field(default_factory=list)
    results: list[ElectricalCalcSummary] = Field(default_factory=list)


class CopyElectricalVariantRequest(BaseModel):
    """Legacy-запрос копирования расчётов и назначений одного ЭР в другой."""

    project_id: UUID
    source_variant_number: int = Field(ge=1, le=5)
    target_variant_number: int = Field(ge=1, le=5)
    overwrite: bool = False
    regenerate_specification: bool = False


class CopyElectricalVariantResponse(BaseModel):
    """Результат legacy-копирования ЭР без копирования спецификации."""

    project_id: UUID
    source_variant_number: int
    target_variant_number: int
    copied_count: int
    project_objects_count: int
    not_copied_uncalculated_count: int = 0
    deleted_target_count: int
    overwrite_applied: bool
    specification_regenerated: bool
    validated_count: int = 0
    validation_failed_count: int = 0
    preserved_without_validation_count: int = 0


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
    electrical_variant_id: UUID | None = None
    variant_number: int | None = Field(default=1, ge=1, le=5, deprecated=True)
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
    laying_step: float | None = Field(default=None, ge=0.1, le=0.4)
    maintain_temperature: float | None = None
    vapor_temperature: float | None = None
    aggressive_product: bool = False
    skip_manual: bool = True
    include_results: bool = False
    include_errors: bool = True

    @model_validator(mode="after")
    def normalize_electrical_variant_selector(self) -> "ElectricalBatchJobRequest":
        """Keep omitted legacy requests on slot 1, but never accept two selectors."""
        if self.electrical_variant_id is not None:
            if "variant_number" not in self.model_fields_set:
                self.variant_number = None
            elif self.variant_number is not None:
                raise ValueError("ELECTRICAL_VARIANT_SELECTOR_CONFLICT")
        elif self.variant_number is None:
            raise ValueError("ELECTRICAL_VARIANT_SELECTOR_REQUIRED")
        return self

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
    electrical_variant_id: UUID | None = None
    progress: CalculationTaskProgress
    result: BatchElectricalResponse | BatchCalcResponse | ReportExportTaskResult | None = None
    error_message: str | None = None
    cancel_requested: bool = False
    created_at: datetime
    started_at: datetime | None = None
    finished_at: datetime | None = None
    links: CalculationTaskLinks
