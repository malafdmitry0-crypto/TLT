"""Схемы спецификации."""

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


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
    top_indication: bool = Field(
        default=False, description="Кiu — доп. индикация сверху коробки"
    )
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
