"""Схемы спецификации."""

from datetime import datetime
from decimal import Decimal
from enum import StrEnum
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class SpecificationItem(BaseModel):
    category: str
    name: str
    article: str | None = None
    unit: str = "шт."
    quantity: float
    params: dict[str, Any] = Field(default_factory=dict)
    # 'auto' — построено генератором из электрорасчёта; 'manual' — добавлено сотрудником.
    # При перегенерации auto-позиции пересоздаются, manual — сохраняются.
    source: str | None = None


class SpecificationGroupingMode(StrEnum):
    """Нормативные режимы группировки строк одного ЭР."""

    SEPARATE_BY_OBJECT_TYPE = "separate_by_object_type"
    MERGE_MATERIALS = "merge_materials"


class SpecificationIssueKind(StrEnum):
    """Взаимоисключающие классы preflight-диагностик."""

    CONFIRMABLE = "confirmable"
    BLOCKING = "blocking"
    SELECTION_REQUIRED = "selection_required"


class SpecificationPreflightStatus(StrEnum):
    READY = "ready"
    CONFIRMATION_REQUIRED = "confirmation_required"
    BLOCKED = "blocked"
    SELECTION_REQUIRED = "selection_required"


class SpecificationGenerationStatus(StrEnum):
    GENERATED = "generated"
    BLOCKED = "blocked"
    CONFIRMATION_REQUIRED = "confirmation_required"
    SELECTION_REQUIRED = "selection_required"


class SpecificationDiagnosticCode(StrEnum):
    """Stable codes утверждённого backend-контракта спецификации."""

    VARIANT_IDS_REQUIRED = "SPEC_VARIANT_IDS_REQUIRED"
    VARIANT_NOT_FOUND = "SPEC_VARIANT_NOT_FOUND"
    VARIANT_PROJECT_MISMATCH = "SPEC_VARIANT_PROJECT_MISMATCH"
    UNASSIGNED_CONFIRMATION_REQUIRED = "SPEC_UNASSIGNED_CONFIRMATION_REQUIRED"
    VARIANT_NOT_READY = "SPEC_VARIANT_NOT_READY"
    UNSUPPORTED_OBJECT_TYPE = "SPEC_UNSUPPORTED_OBJECT_TYPE"
    RESULT_STALE = "SPEC_RESULT_STALE"
    MOCK_INPUTS_NOT_ALLOWED = "ELECTRICAL_MOCK_INPUTS_NOT_ALLOWED"
    SECTION_PLAN_INVALID = "ELECTRICAL_SECTION_PLAN_INVALID"
    CABLE_NOMENCLATURE_MISSING = "SPEC_CABLE_NOMENCLATURE_MISSING"
    CATALOG_VERSION_INACTIVE = "SPEC_CATALOG_VERSION_INACTIVE"
    CATALOG_UNAVAILABLE = "SPEC_CATALOG_UNAVAILABLE"
    ACCESSORY_CATALOG_ITEM_MISSING = "SPEC_ACCESSORY_CATALOG_ITEM_MISSING"
    ACCESSORY_CATALOG_INCOMPLETE = "SPEC_ACCESSORY_CATALOG_INCOMPLETE"
    ACCESSORY_SELECTION_REQUIRED = "SPEC_ACCESSORY_SELECTION_REQUIRED"
    BOX_EX_RGR_MATRIX_MISSING = "SPEC_BOX_EX_RGR_MATRIX_MISSING"
    FORMULA_INPUT_INVALID = "SPEC_FORMULA_INPUT_INVALID"
    GENERATION_CONFLICT = "SPEC_GENERATION_CONFLICT"


class SpecificationRequestedOptions(BaseModel):
    """Опции V2 до resolution из versioned project settings.

    ``None`` означает «разрешить из project settings», а не подставить mock или
    неявный business-default. После resolution сервис обязан получить
    :class:`SpecificationResolvedOptions` либо вернуть domain error.
    """

    model_config = ConfigDict(
        extra="forbid",
        populate_by_name=True,
        allow_inf_nan=False,
    )

    catalog_id: UUID | str | None = None
    catalog_version: str | None = Field(default=None, min_length=1)
    grouping_mode: SpecificationGroupingMode | None = None
    ex: bool | None = Field(default=None, alias="Ex")
    k1i: bool | None = Field(default=None, alias="K1i")
    k2i: bool | None = Field(default=None, alias="K2i")
    kiu: bool | None = Field(default=None, alias="Kiu")
    l_k2i_m: Decimal | None = Field(default=None, ge=0, alias="L_K2i_m")
    r_gr: Decimal | None = Field(default=None, alias="R_gr")

    @field_validator("catalog_id")
    @classmethod
    def _catalog_id_is_not_blank(cls, value: UUID | str | None) -> UUID | str | None:
        if isinstance(value, str) and not value.strip():
            raise ValueError("catalog_id must not be blank")
        return value


class SpecificationResolvedOptions(BaseModel):
    """Полностью разрешённые и snapshot-ready настройки одного запроса."""

    model_config = ConfigDict(
        extra="forbid",
        populate_by_name=True,
        allow_inf_nan=False,
    )

    catalog_id: UUID | str
    catalog_version: str = Field(min_length=1)
    grouping_mode: SpecificationGroupingMode
    ex: bool = Field(alias="Ex")
    k1i: bool = Field(alias="K1i")
    k2i: bool = Field(alias="K2i")
    kiu: bool = Field(alias="Kiu")
    l_k2i_m: Decimal = Field(ge=0, alias="L_K2i_m")
    r_gr: Decimal = Field(alias="R_gr")

    @field_validator("catalog_id")
    @classmethod
    def _catalog_id_is_not_blank(cls, value: UUID | str) -> UUID | str:
        if isinstance(value, str) and not value.strip():
            raise ValueError("catalog_id must not be blank")
        return value


class SpecificationGenerationRequestV2(BaseModel):
    """Канонический UUID-scoped запрос; implicit-all отсутствует."""

    model_config = ConfigDict(extra="forbid")

    variant_ids: list[UUID] = Field(min_length=1, max_length=5)
    options: SpecificationRequestedOptions = Field(default_factory=SpecificationRequestedOptions)
    exclude_unassigned_confirmed: bool = False
    catalog_selections: dict[str, UUID | str] = Field(default_factory=dict)

    @field_validator("variant_ids")
    @classmethod
    def _variant_ids_are_unique(cls, value: list[UUID]) -> list[UUID]:
        if len(set(value)) != len(value):
            raise ValueError("variant_ids must be unique")
        return value


class SpecificationDiagnostic(BaseModel):
    """Typed issue; бизнес-ветвление не зависит от текста message."""

    code: SpecificationDiagnosticCode
    kind: SpecificationIssueKind
    message: str
    issues: list[dict[str, Any]] = Field(default_factory=list)
    details: dict[str, Any] = Field(default_factory=dict)


class SpecificationErrorDetail(BaseModel):
    code: SpecificationDiagnosticCode
    message: str
    issues: list[dict[str, Any]] = Field(default_factory=list)
    details: dict[str, Any] = Field(default_factory=dict)


class SpecificationErrorEnvelope(BaseModel):
    detail: SpecificationErrorDetail


class SpecificationVariantPreflightResultV2(BaseModel):
    electrical_variant_id: UUID
    electrical_variant_name: str | None = None
    status: SpecificationPreflightStatus
    total_objects: int = Field(default=0, ge=0)
    contributing_objects: int = Field(default=0, ge=0)
    excluded_unassigned_object_ids: list[UUID] = Field(default_factory=list)
    diagnostics: list[SpecificationDiagnostic] = Field(default_factory=list)
    input_fingerprint: str | None = None


class SpecificationVariantGenerationResultV2(BaseModel):
    electrical_variant_id: UUID
    status: SpecificationGenerationStatus
    items: list[SpecificationItem] = Field(default_factory=list)
    excluded_unassigned_object_ids: list[UUID] = Field(default_factory=list)
    diagnostics: list[SpecificationDiagnostic] = Field(default_factory=list)
    snapshot: dict[str, Any] | None = None


class SpecificationOptions(BaseModel):
    """Опции полного расчёта спецификации (ТНП BOM).

    Параметры, которых пока нет в карточке объекта, берутся с дефолтами и могут
    переопределяться сотрудником на странице спецификации.

    PDL-ER-07: эти поля — project defaults; при генерации сохраняется snapshot.
    PDL-ER-38: group_by / merge_identical — presentation defaults в snapshot.
    """

    reserve_coefficient: float = Field(
        default=1.0,
        ge=1.0,
        le=3.0,
        description="R,гр — коэффициент горячего резервирования секций",
    )
    ex_zone: bool = Field(
        default=False,
        description="Ex — взрывоопасная зона (бронированный кабельный ввод вместо пластикового)",
    )
    indication_on_boxes: bool = Field(
        default=False, description="К1i — индикация питания на коробках"
    )
    end_section_indication: bool = Field(
        default=False, description="К2i — доп. индикация в конце нагревательной секции"
    )
    top_indication: bool = Field(default=False, description="Кiu — доп. индикация сверху коробки")
    min_length_for_end_indication: float = Field(
        default=0.0,
        ge=0.0,
        description="L,К2i — мин. длина секции для применения К2i, м",
    )
    group_by: str = Field(
        default="object_section",
        description="PDL-ER-38: default grouping key for BOM presentation",
    )
    merge_identical: bool = Field(
        default=False,
        description="PDL-ER-38: merge identical catalog base+code after per-type calc",
    )
    # PDL-ER-44 / PDF §7.10: pick one connector kit capacity (sections per kit).
    # 1 → default КСН-1 / КСВ-1; 2 → КСН-2 / КСВ-2. Not dual XLSX emission.
    connector_kit_sections_per_kit: int = Field(
        default=1,
        ge=1,
        le=2,
        description=(
            "PDF §7.10 / PDL-ER-44: sections covered by one connector kit "
            "(1=КСН-1/КСВ-1 default, 2=КСН-2/КСВ-2). qty=ceil(Nсек/capacity)."
        ),
    )


class SpecificationSettingsResponse(BaseModel):
    """Project-level versioned specification defaults (PDL-ER-07)."""

    project_id: UUID
    version: int
    settings: SpecificationOptions


class SpecificationSettingsUpdateRequest(BaseModel):
    """Update project defaults without regenerating specifications."""

    settings: SpecificationOptions


class SpecificationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    project_id: UUID
    variant_number: int
    electrical_variant_id: UUID | None = None
    items: list[dict[str, Any]]
    # Режим и опции последней генерации — чтобы UI восстанавливал их после reload
    generation_mode: str | None = None
    generation_options: dict[str, Any] | None = None
    is_stale: bool
    stale_reason: str | None = None
    stale_at: datetime | None = None
    stale_details: dict[str, Any] | None = None
    # FA-01/05: persisted partial diagnostics (also mirrored in generation_options)
    is_partial: bool = False
    excluded_groups: list[dict[str, Any]] = Field(default_factory=list)
    skipped_objects: int = 0
    created_at: datetime
    updated_at: datetime

    @model_validator(mode="after")
    def _hydrate_partial_diagnostics(self) -> "SpecificationResponse":
        """Expose generation_options partial fields as first-class GET fields.

        FastAPI response serialization may not call a custom model_validate
        override; mode='after' runs for all validation paths (FA-01/05).
        """
        opts = self.generation_options or {}
        if not isinstance(opts, dict):
            return self
        if "is_partial" in opts:
            self.is_partial = bool(opts.get("is_partial"))
        if isinstance(opts.get("excluded_groups"), list):
            self.excluded_groups = list(opts.get("excluded_groups") or [])
        if opts.get("skipped_objects") is not None:
            try:
                self.skipped_objects = int(opts.get("skipped_objects") or 0)
            except (TypeError, ValueError):
                self.skipped_objects = 0
        return self


class SpecificationGenerateRequest(BaseModel):
    """Тело запроса генерации спецификации.

    PDL-ER-29: канонический режим — full data-driven BOM. ``basic`` принимается
    только как deprecated transitional input и нормализуется в ``full`` на API.

    electrical_variant_ids — явный список UUID ЭР (PDL-ER-01). UI «Выбрать все»
    разворачивается в полный список текущих UUID, а не в implicit all-on-open.
    """

    mode: str = Field(
        default="full",
        pattern="^(basic|full)$",
        description="Канонически full; basic — deprecated compatibility alias.",
    )
    options: SpecificationOptions | None = None
    electrical_variant_ids: list[UUID] | None = Field(
        default=None,
        max_length=5,
        description="Явно выбранные UUID ЭР (1…5). Пустой/None — legacy single slot.",
    )
    confirm_partial: bool = Field(
        default=False,
        description=(
            "PDL-ER-36: true after user confirms preflight exclusions. "
            "If false and any ER would exclude objects, API returns 409."
        ),
    )


class SpecificationGenerateVariantResult(BaseModel):
    electrical_variant_id: UUID
    items: list[SpecificationItem]
    mode: str = "full"
    skipped_objects: int = 0
    partial: bool = False
    excluded_groups: list[dict[str, Any]] = Field(default_factory=list)


class SpecificationGenerateResponse(BaseModel):
    project_id: UUID
    items: list[SpecificationItem]
    # Фактически применённый режим генерации (PDL-ER-29: full)
    mode: str = "full"
    # Объекты/группы без вклада в full BOM (partial diagnostics).
    skipped_objects: int = 0
    partial: bool = False
    excluded_groups: list[dict[str, Any]] = Field(default_factory=list)
    settings_version: int | None = None
    electrical_variant_id: UUID | None = None
    # Multi-ЭР atomic generation: per-variant results (PDL-ER-01/14).
    results: list[SpecificationGenerateVariantResult] | None = None


class SpecificationPreflightVariantResult(BaseModel):
    electrical_variant_id: UUID
    electrical_variant_name: str | None = None
    total_objects: int = 0
    contributing_objects: int = 0
    skipped_objects: int = 0
    excluded_object_ids: list[UUID] = Field(default_factory=list)
    excluded_groups: list[dict[str, Any]] = Field(default_factory=list)


class SpecificationPreflightResponse(BaseModel):
    project_id: UUID
    requires_confirmation: bool
    total_skipped_objects: int = 0
    variants: list[SpecificationPreflightVariantResult] = Field(default_factory=list)


class SpecificationUpdateRequest(BaseModel):
    items: list[SpecificationItem]
