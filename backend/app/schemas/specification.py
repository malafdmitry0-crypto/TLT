"""Схемы спецификации."""

import re
from datetime import datetime
from decimal import Decimal
from enum import StrEnum
from typing import Any, Literal
from uuid import UUID

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    field_serializer,
    field_validator,
    model_validator,
)


class SpecificationItem(BaseModel):
    """Одна позиция BOM.

    ``quantity`` хранится как ``Decimal`` и в JSON сериализуется строкой
    (канонический Decimal-safe контракт). Вход принимает Decimal | str | int | float.
    """

    category: str
    name: str
    article: str | None = None
    unit: str = "шт."
    quantity: Decimal
    params: dict[str, Any] = Field(default_factory=dict)
    # 'auto' — построено генератором из электрорасчёта; 'manual' — добавлено сотрудником.
    # При перегенерации auto-позиции пересоздаются, manual — сохраняются.
    source: str | None = None

    @field_validator("quantity", mode="before")
    @classmethod
    def _coerce_quantity(cls, value: object) -> Decimal:
        if isinstance(value, Decimal):
            return value
        if isinstance(value, bool) or value is None:
            raise ValueError("quantity must be a decimal number")
        if isinstance(value, int):
            return Decimal(value)
        if isinstance(value, float):
            return Decimal(str(value))
        if isinstance(value, str):
            text = value.strip()
            if not text:
                raise ValueError("quantity must not be blank")
            return Decimal(text)
        raise ValueError("quantity must be a decimal number")

    @field_serializer("quantity")
    def _serialize_quantity(self, value: Decimal) -> str:
        # Normalize without scientific notation; keep exact decimal string form.
        text = format(value, "f")
        if "." in text:
            text = text.rstrip("0").rstrip(".")
        return text or "0"


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
    REQUEST_INVALID = "SPEC_REQUEST_INVALID"
    PROJECT_NOT_FOUND = "SPEC_PROJECT_NOT_FOUND"
    PROJECT_ACCESS_DENIED = "SPEC_PROJECT_ACCESS_DENIED"
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
    CATALOG_IMPORT_INVALID = "SPEC_CATALOG_IMPORT_INVALID"
    CATALOG_VERSION_CONFLICT = "SPEC_CATALOG_VERSION_CONFLICT"
    CATALOG_VERSION_NOT_FOUND = "SPEC_CATALOG_VERSION_NOT_FOUND"
    CATALOG_ACTIVATION_INVALID = "SPEC_CATALOG_ACTIVATION_INVALID"
    CATALOG_VALIDATION_FAILED = "SPEC_CATALOG_VALIDATION_FAILED"
    ACCESSORY_CATALOG_ITEM_MISSING = "SPEC_ACCESSORY_CATALOG_ITEM_MISSING"
    ACCESSORY_CATALOG_INCOMPLETE = "SPEC_ACCESSORY_CATALOG_INCOMPLETE"
    ACCESSORY_SELECTION_REQUIRED = "SPEC_ACCESSORY_SELECTION_REQUIRED"
    BOX_EX_RGR_MATRIX_MISSING = "SPEC_BOX_EX_RGR_MATRIX_MISSING"
    FORMULA_INPUT_INVALID = "SPEC_FORMULA_INPUT_INVALID"
    CANONICAL_CALCULATORS_UNAVAILABLE = "SPEC_CANONICAL_CALCULATORS_UNAVAILABLE"
    GENERATION_CONFLICT = "SPEC_GENERATION_CONFLICT"


class SpecificationRequestedOptions(BaseModel):
    """Опции до resolution из versioned project settings.

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


class SpecificationCatalogSnapshot(BaseModel):
    """Resolved immutable catalog identity used by preflight and fingerprints."""

    model_config = ConfigDict(extra="forbid")

    id: UUID
    catalog_key: str = Field(min_length=1)
    version: str = Field(min_length=1)
    source_checksum: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")
    payload_checksum: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")
    schema_version: int = Field(ge=1)


class SpecificationGenerationRequest(BaseModel):
    """Канонический UUID-scoped запрос; implicit-all отсутствует."""

    model_config = ConfigDict(extra="forbid")

    variant_ids: list[UUID] = Field(min_length=1, max_length=5)
    options: SpecificationRequestedOptions = Field(default_factory=SpecificationRequestedOptions)
    exclude_unassigned_confirmed: bool = False
    catalog_selections: dict[str, UUID] = Field(default_factory=dict)

    @field_validator("variant_ids")
    @classmethod
    def _variant_ids_are_unique(cls, value: list[UUID]) -> list[UUID]:
        if len(set(value)) != len(value):
            raise ValueError("variant_ids must be unique")
        return value

    @field_validator("catalog_selections")
    @classmethod
    def _catalog_selection_keys_are_explicit(cls, value: dict[str, UUID]) -> dict[str, UUID]:
        if len(value) > 100:
            raise ValueError("catalog_selections cannot contain more than 100 entries")
        if any(not key.strip() or key != key.strip() or len(key) > 128 for key in value):
            raise ValueError(
                "catalog selection keys must be trimmed, non-empty and at most 128 chars"
            )
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


class SpecificationVariantPreflightResult(BaseModel):
    electrical_variant_id: UUID
    electrical_variant_name: str | None = None
    status: SpecificationPreflightStatus
    total_objects: int = Field(default=0, ge=0)
    contributing_objects: int = Field(default=0, ge=0)
    unassigned_object_ids: list[UUID] = Field(default_factory=list)
    excluded_unassigned_object_ids: list[UUID] = Field(default_factory=list)
    diagnostics: list[SpecificationDiagnostic] = Field(default_factory=list)
    resolved_options: SpecificationResolvedOptions | None = None
    catalog: SpecificationCatalogSnapshot | None = None
    catalog_selections: dict[str, UUID] = Field(default_factory=dict)
    fingerprint_schema: Literal["specification-preflight/v1"] | None = None
    input_fingerprint: str | None = None

    @model_validator(mode="after")
    def _validate_preflight_state(self) -> "SpecificationVariantPreflightResult":
        if self.contributing_objects > self.total_objects:
            raise ValueError("contributing_objects cannot exceed total_objects")
        if len(set(self.unassigned_object_ids)) != len(self.unassigned_object_ids):
            raise ValueError("unassigned_object_ids must be unique")
        if len(set(self.excluded_unassigned_object_ids)) != len(
            self.excluded_unassigned_object_ids
        ):
            raise ValueError("excluded_unassigned_object_ids must be unique")
        if not set(self.excluded_unassigned_object_ids).issubset(self.unassigned_object_ids):
            raise ValueError(
                "excluded_unassigned_object_ids must be a subset of unassigned_object_ids"
            )
        has_fingerprint = self.input_fingerprint is not None
        has_fingerprint_schema = self.fingerprint_schema is not None
        if has_fingerprint != has_fingerprint_schema:
            raise ValueError("fingerprint_schema and input_fingerprint must be set together")
        if has_fingerprint and not re.fullmatch(r"sha256:[0-9a-f]{64}", self.input_fingerprint):
            raise ValueError("input_fingerprint must be SHA-256")

        kinds = {diagnostic.kind for diagnostic in self.diagnostics}
        expected = (
            SpecificationPreflightStatus.BLOCKED
            if SpecificationIssueKind.BLOCKING in kinds
            else (
                SpecificationPreflightStatus.SELECTION_REQUIRED
                if SpecificationIssueKind.SELECTION_REQUIRED in kinds
                else (
                    SpecificationPreflightStatus.CONFIRMATION_REQUIRED
                    if SpecificationIssueKind.CONFIRMABLE in kinds
                    else SpecificationPreflightStatus.READY
                )
            )
        )
        if self.status != expected:
            raise ValueError(
                f"status {self.status.value} does not match diagnostic precedence "
                f"{expected.value}"
            )
        if self.status is SpecificationPreflightStatus.READY and not has_fingerprint:
            raise ValueError("ready preflight must include an input fingerprint")
        if self.status is not SpecificationPreflightStatus.READY and has_fingerprint:
            raise ValueError("non-ready preflight cannot include an input fingerprint")
        return self


class SpecificationVariantGenerationResult(BaseModel):
    electrical_variant_id: UUID
    electrical_variant_name: str | None = None
    status: SpecificationGenerationStatus
    items: list[SpecificationItem] = Field(default_factory=list)
    excluded_unassigned_object_ids: list[UUID] = Field(default_factory=list)
    diagnostics: list[SpecificationDiagnostic] = Field(default_factory=list)
    # CANON-03 will populate applicable catalog candidates; empty until then.
    candidate_groups: list[dict[str, Any]] = Field(default_factory=list)
    snapshot: dict[str, Any] | None = None


class SpecificationGenerationResponse(BaseModel):
    project_id: UUID
    settings_version: int
    results: list[SpecificationVariantGenerationResult]


class SpecificationOptions(BaseModel):
    """Legacy full-BOM options (pre-canonical).

    Soft-deprecated: public generate uses :class:`SpecificationRequestedOptions`.
    Kept for internal unit tests and the transitional formula builder path.
    Not part of the unversioned generate OpenAPI contract.
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
    """Canonical, possibly incomplete, project specification settings."""

    project_id: UUID
    version: int
    settings: SpecificationRequestedOptions


class SpecificationSettingsUpdateRequest(BaseModel):
    """Explicitly update canonical project defaults without regenerating."""

    settings: SpecificationRequestedOptions


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
    """Legacy generate body (soft-deprecated, not mounted on public routes).

    Public generate uses :class:`SpecificationGenerationRequest` (``variant_ids``).
    Kept only so unit tests that import the old shape continue to import.
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
    """Legacy per-variant generate row; soft-deprecated."""

    electrical_variant_id: UUID
    items: list[SpecificationItem]
    mode: str = "full"
    skipped_objects: int = 0
    partial: bool = False
    excluded_groups: list[dict[str, Any]] = Field(default_factory=list)


class SpecificationGenerateResponse(BaseModel):
    """Manual PUT / legacy generate envelope.

    Generate itself uses :class:`SpecificationGenerationResponse`. This shape
    remains for employee manual item saves (and transitional internal callers).
    """

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
    """Legacy preflight row; soft-deprecated (canonical uses VariantPreflightResult)."""

    electrical_variant_id: UUID
    electrical_variant_name: str | None = None
    total_objects: int = 0
    contributing_objects: int = 0
    skipped_objects: int = 0
    excluded_object_ids: list[UUID] = Field(default_factory=list)
    excluded_groups: list[dict[str, Any]] = Field(default_factory=list)


class SpecificationPreflightResponse(BaseModel):
    """Legacy preflight envelope; soft-deprecated."""

    project_id: UUID
    requires_confirmation: bool
    total_skipped_objects: int = 0
    variants: list[SpecificationPreflightVariantResult] = Field(default_factory=list)


class SpecificationUpdateRequest(BaseModel):
    items: list[SpecificationItem]
