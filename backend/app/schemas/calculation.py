"""Схемы расчётов: вход/выход формул и API."""

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

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

# ---------- Electrical ----------


SelectionPolicy = Literal[
    "technical_minimum",
    "lowest_cost",
    "fastest_delivery",
    "in_stock",
    "preferred_supplier",
    "balanced",
]


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


# High-level calculation bodies currently expose only the canonical TT formula.
# Query endpoints keep the existing resistive discriminators so new formula
# families can be added by extending this explicit contract.
ElectricalCableType = Literal["self_regulating_tt"]
ElectricalCableQueryType = Literal[
    "self_regulating",
    "self_regulating_tt",
    "single_core",
    "three_core",
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
