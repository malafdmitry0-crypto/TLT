"""Схемы расчётов: вход/выход формул и API."""

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, PrivateAttr, model_validator

from app.schemas.electrical_assignment import ElectricalAssignmentResponse
from app.schemas.electrical_variant import (
    ElectricalAssignmentState,
    ElectricalSystemType,
)
from app.schemas.heat_loss import BatchCalcResponse as BatchCalcResponse
from app.schemas.heat_loss import HeatLossBatchJobRequest as HeatLossBatchJobRequest
from app.schemas.heat_loss import HeatLossRequest as HeatLossRequest
from app.schemas.heat_loss import HeatLossResponse as HeatLossResponse
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

RESISTIVE_DEFAULT_MIN_ADJUSTED_VOLTAGE = 40.0
RESISTIVE_DEFAULT_VOLTAGE_STEP = 5.0


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

    model_config = ConfigDict(extra="forbid")

    required_power_per_meter: float = Field(gt=0, description="Требуемая мощность, Вт/м")
    pipe_length: float = Field(gt=0, description="Длина трубопровода/секции, м")
    process_temperature: float = Field(
        description="Температура продукта для проверки T_product <= T_max марки, °C"
    )
    ambient_temperature: float = Field(
        description="Температура окружающей среды для проверки T_env >= T_min марки, °C"
    )
    supply_voltage: float = Field(
        gt=0,
        description="Рабочее напряжение downstream-расчёта тока и секций, В",
    )
    max_start_current_per_section: float | None = Field(
        default=None,
        gt=0,
        description=(
            "Ручной Iдоп для расчёта секций; null — вывести предел из "
            "Lмакс × Iст.уд выбранной строки каталога"
        ),
    )
    outer_diameter_mm: float | None = Field(
        default=None,
        gt=0,
        description="Наружный диаметр трубы D для системного расчёта Kнав, мм",
    )
    winding_pitch: float | None = Field(
        default=None, ge=0, description="Шаг навива, мм; 0 или null — прямая укладка"
    )
    number_of_threads: int | None = Field(
        default=None,
        ge=1,
        le=3,
        description="Заданное пользователем количество ниток 1..3; null — автоподбор",
    )
    cable_mark: str | None = Field(
        default=None,
        description="Exact full_mark из BOM-каталога; null — автоподбор",
    )
    selection_policy: str = Field(
        default="technical_minimum",
        description="Для нового TT-расчёта поддерживается только technical_minimum",
    )
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

    @model_validator(mode="after")
    def validate_tank_geometry(self) -> "SelfRegulatingTTParams":
        if self.tank_shape is None:
            return self
        if self.heating_height is None or self.laying_step is None:
            raise ValueError("Для резервуара требуются heating_height и laying_step")
        if self.tank_shape == "cylindrical" and self.tank_diameter is None:
            raise ValueError("Для цилиндрического резервуара требуется tank_diameter")
        if self.tank_shape == "rectangular" and (
            self.tank_length is None or self.tank_width is None
        ):
            raise ValueError("Для прямоугольного резервуара требуются tank_length и tank_width")
        if self.winding_pitch not in (None, 0) or self.outer_diameter_mm is not None:
            raise ValueError("Для резервуара Kнав=1; трубный шаг навива и D недопустимы")
        return self


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
    # DEC-19: у базовой модели было несколько исполнений, и выбор «-СТ»
    # сделан правилом по умолчанию, а не пользователем.
    execution_defaulted: bool = False


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
    number_of_threads: int = Field(
        default=1, ge=1, le=3, description="Количество ниток (DEC-06 / E0: 1..3)"
    )
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
    number_of_threads: int = Field(
        default=1, ge=1, le=3, description="Количество ниток (DEC-06 / E0: 1..3)"
    )
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


# РЕШЕНИЕ 2026-08-03: legacy-линейка ТЛТ (self_regulating/single_core/three_core)
# выпилена без совместимости (DEC-07, BE-16 ТЗ). Расчётный тип — только
# self_regulating_tt (серии ТТН/ТТВ/ТТХ); mineral/skin — unsupported-системы.
ElectricalCableType = Literal[
    "self_regulating_tt",
    "mineral",
    "skin",
]
ElectricalCableSource = Literal["builtin", "commercial", "extended", "all"]


class ElectricalRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    object_id: UUID
    cable_type: ElectricalCableType
    data: dict[str, Any]
    electrical_variant_id: UUID
    # Optimistic concurrency token for the object's ER assignment (E8 / B6).
    expected_assignment_version: int | None = None
    _variant_number: int = PrivateAttr(default=1)

    @property
    def variant_number(self) -> int:
        return self._variant_number

    def bind_persistence_variant_number(self, value: int) -> None:
        self._variant_number = value


class ElectricalResponse(BaseModel):
    object_id: UUID
    cable_type: str
    result: dict[str, Any]


class CableOptionCatalogMeta(BaseModel):
    """Provenance of the power catalog that produced a cable option."""

    kind: str = "power"
    version: str | None = None
    status: str | None = None
    source_checksum: str | None = None
    authority: str | None = None
    production_approved: bool | None = None


class CableOptionOut(BaseModel):
    """One manual TT cable model for GET /calc/cable-options (B1 / E5)."""

    model: str | None = None
    series: str | None = None
    base_model: str | None = None
    full_mark_preview: str | None = None
    eligible: bool = False
    unavailable_reason: str | None = None
    temperature_group: str | None = None
    nominal_power: float | None = None
    passport_power_w_per_m: float | None = None
    min_ambient_temperature_c: float | None = None
    max_product_temperature_c: float | None = None
    object_ambient_temperature_c: float | None = None
    object_product_temperature_c: float | None = None
    nomenclature_code: str | None = None
    catalog: CableOptionCatalogMeta | None = None


class TaskElectricalCalcSummary(BaseModel):
    """UUID-only calculation item returned by a background task."""

    id: UUID
    object_id: UUID
    cable_type: str
    cable_type_source: str = "auto"
    cable_mark: str | None
    cable_mark_source: str = "auto"
    cable_snapshot: dict[str, Any] | None = None
    cable_snapshot_status: dict[str, Any] | None = None
    params: dict[str, Any] | None = None
    results: dict[str, Any] | None


class ElectricalCalcSummary(TaskElectricalCalcSummary):
    """Краткая информация синхронного электрорасчёта объекта."""

    electrical_variant_id: UUID


ElectricalCableSelectionMode = Literal["auto", "manual"]


class ElectricalCableSelectionRequest(BaseModel):
    """Atomic cable selection for one object inside one exact UUID ER."""

    model_config = ConfigDict(extra="forbid")

    expected_assignment_version: int = Field(ge=1)
    mode: ElectricalCableSelectionMode
    cable_mark: str | None = Field(default=None, max_length=128)
    cable_source: ElectricalCableSource = "builtin"
    selection_policy: SelectionPolicy = "technical_minimum"
    thread_count: int | None = Field(default=None, ge=1, le=3)
    winding_pitch_mm: float | None = Field(default=None, gt=0)

    @model_validator(mode="after")
    def validate_selection(self) -> "ElectricalCableSelectionRequest":
        if isinstance(self.cable_mark, str):
            self.cable_mark = self.cable_mark.strip() or None
        if self.mode == "manual" and self.cable_mark is None:
            raise ValueError("Для ручного выбора укажите точную марку кабеля")
        if self.mode == "manual" and self.thread_count is None:
            raise ValueError("Для ручного выбора укажите количество ниток от 1 до 3")
        if self.mode == "auto" and self.cable_mark is not None:
            raise ValueError("Автоматический выбор выполняется без ручной марки")
        return self


class ElectricalCableSelectionResponse(BaseModel):
    assignment: ElectricalAssignmentResponse
    calculation: ElectricalCalcSummary


ElectricalCandidateMode = Literal["auto", "manual"]
ElectricalCandidateStatus = Literal["applicable", "error", "not_applicable", "excluded", "stale"]


class ElectricalCandidateCreateRequest(BaseModel):
    """Создание кандидата подбора кабеля без применения в основной расчёт."""

    model_config = ConfigDict(extra="forbid")

    project_id: UUID
    object_id: UUID
    electrical_variant_id: UUID
    cable_type: ElectricalCableType = "self_regulating_tt"
    cable_source: ElectricalCableSource = "builtin"
    mode: ElectricalCandidateMode = "auto"
    cable_mark: str | None = None
    electrical_params: dict[str, Any] = Field(default_factory=dict)
    _variant_number: int = PrivateAttr(default=1)

    @property
    def variant_number(self) -> int:
        return self._variant_number

    def bind_persistence_variant_number(self, value: int) -> None:
        self._variant_number = value

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
    electrical_variant_id: UUID
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

    model_config = ConfigDict(extra="forbid")

    project_id: UUID
    object_id: UUID
    electrical_variant_id: UUID
    name: str = Field(min_length=1, max_length=64)
    color: str | None = Field(default=None, max_length=32)
    _variant_number: int = PrivateAttr(default=1)

    @property
    def variant_number(self) -> int:
        return self._variant_number

    def bind_persistence_variant_number(self, value: int) -> None:
        self._variant_number = value


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
    electrical_variant_id: UUID
    name: str
    color: str | None = None
    sort_order: int
    candidate_ids: list[UUID] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class ElectricalCandidateFolderItemRequest(BaseModel):
    """Добавление кандидата в пользовательскую папку."""

    candidate_id: UUID


class ElectricalSystemSummary(BaseModel):
    """Ready electrical totals for one assigned system type."""

    object_count: int = 0
    cable_length_m: float = 0.0
    section_count: int = 0
    power_w: float = 0.0
    working_current_a: float = 0.0
    start_current_a: float = 0.0


class ElectricalSystemSummaries(BaseModel):
    """Same metric composition for every supported dashboard bucket."""

    self_regulating: ElectricalSystemSummary = Field(default_factory=ElectricalSystemSummary)
    resistive: ElectricalSystemSummary = Field(default_factory=ElectricalSystemSummary)
    skin: ElectricalSystemSummary = Field(default_factory=ElectricalSystemSummary)
    total: ElectricalSystemSummary = Field(default_factory=ElectricalSystemSummary)


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
    total_sections: int = 0
    total_start_current_a: float = 0.0
    system_summaries: ElectricalSystemSummaries = Field(default_factory=ElectricalSystemSummaries)


class ElectricalPageResponse(BaseModel):
    """Постраничные данные для страницы электрорасчёта."""

    items: list[ProjectObjectResponse]
    calculations: list[ElectricalCalcSummary]
    summary: ElectricalPageSummary
    page_info: ProjectObjectsPageInfo


class ElectricalQueryRequest(BaseModel):
    """Backend-query таблицы электрорасчёта."""

    model_config = ConfigDict(extra="forbid")

    project_id: UUID
    electrical_variant_id: UUID
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

    _variant_number: int | None = PrivateAttr(default=None)

    @property
    def variant_number(self) -> int | None:
        return self._variant_number

    def bind_persistence_variant_number(self, value: int) -> None:
        self._variant_number = value


class ElectricalQueryCounts(BaseModel):
    """Счётчики backend-query таблицы электрорасчёта."""

    total: int
    filtered: int


class ElectricalQueryEcho(BaseModel):
    """Нормализованный query, применённый к таблице электрорасчёта."""

    electrical_variant_id: UUID
    sort: ObjectQuerySort | None = None


class ElectricalQueryAssignment(BaseModel):
    """Assignment snapshot for one object on the current electrical page."""

    object_id: UUID
    system_type: ElectricalSystemType | None
    assignment_state: ElectricalAssignmentState
    version: int = Field(ge=1)
    electrical_overrides: dict[str, Any] = Field(default_factory=dict)


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


class TaskBatchElectricalResponse(BaseModel):
    """UUID-only result of an asynchronous electrical batch calculation."""

    calculated: int
    skipped: int
    scope: Literal["all", "selected"] = "all"
    heat_loss_failed: int = Field(
        default=0,
        description="Количество объектов с ошибками теплопотерь, исключённых из расчёта",
    )
    errors: list[dict[str, Any]] = Field(default_factory=list)
    results: list[TaskElectricalCalcSummary] = Field(default_factory=list)


TaskStatus = Literal[
    "queued",
    "enqueued",
    "running",
    "waiting_input",
    "succeeded",
    "failed",
    "cancelled",
    "timed_out",
]


class ElectricalObjectBatchOverride(BaseModel):
    """Переопределение параметров электрорасчёта для конкретного объекта."""

    object_id: UUID
    cable_type: ElectricalCableType | None = None


class ElectricalBatchJobRequest(BaseModel):
    """Запрос асинхронного пакетного электрорасчёта."""

    model_config = ConfigDict(extra="forbid")

    project_id: UUID
    object_ids: list[UUID] | None = Field(default=None, min_length=1)
    cable_source: str = "builtin"
    electrical_variant_id: UUID
    cable_type: ElectricalCableType = "self_regulating_tt"
    selection_policy: SelectionPolicy = "technical_minimum"
    object_overrides: list[ElectricalObjectBatchOverride] | None = None
    force_cable_type: bool = False
    connection_type: str | None = None
    winding_pitch: float | None = None
    number_of_threads: int | None = None
    heating_height: float | None = None
    laying_step: float | None = Field(default=None, ge=0.1, le=0.4)
    supply_voltage: float | None = Field(default=None, gt=0)
    skip_manual: bool = True
    include_results: bool = False
    include_errors: bool = True

    def electrical_params(self) -> dict[str, Any]:
        values = {
            "connection_type": self.connection_type,
            "winding_pitch": self.winding_pitch,
            "number_of_threads": self.number_of_threads,
            "heating_height": self.heating_height,
            "laying_step": self.laying_step,
            "supply_voltage": self.supply_voltage,
            "selection_policy": self.selection_policy,
        }
        return {
            key: value
            for key, value in values.items()
            if key == "selection_policy" or key in self.model_fields_set
        }


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
    result: TaskBatchElectricalResponse | BatchCalcResponse | ReportExportTaskResult | None = None
    error_message: str | None = None
    cancel_requested: bool = False
    created_at: datetime
    started_at: datetime | None = None
    finished_at: datetime | None = None
    links: CalculationTaskLinks
