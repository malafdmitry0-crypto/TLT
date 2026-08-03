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


class SpecificationCandidate(BaseModel):
    """One applicable catalog item inside a selection group."""

    model_config = ConfigDict(extra="forbid")

    catalog_item_id: UUID
    catalog_id: UUID
    catalog_version: str = Field(min_length=1)
    category: str = Field(min_length=1)
    name: str = Field(min_length=1)
    mark: str = Field(min_length=1)
    nomenclature_code: str = Field(min_length=1)
    supply_unit: str = Field(min_length=1)
    applicability: dict[str, Any] = Field(default_factory=dict)
    package_parameters: dict[str, Any] = Field(default_factory=dict)
    formula_parameters: dict[str, Any] = Field(default_factory=dict)


class SpecificationSelectionSource(StrEnum):
    """How the effective catalog item for a group was obtained."""

    AUTO_SINGLE = "auto_single"
    EXPLICIT = "explicit"
    NONE = "none"


class SpecificationCandidateGroup(BaseModel):
    """Collision-free selection group for one ER category/condition slice."""

    model_config = ConfigDict(extra="forbid")

    group_key: str = Field(min_length=1, max_length=128)
    electrical_variant_id: UUID
    category: str = Field(min_length=1)
    object_type_section: str | None = None
    conditions: dict[str, Any] = Field(default_factory=dict)
    candidates: list[SpecificationCandidate] = Field(default_factory=list)
    selected_catalog_item_id: UUID | None = None
    selection_source: SpecificationSelectionSource = SpecificationSelectionSource.NONE
    candidate_set_fingerprint: str | None = None


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
    # Populated for selection protocol; generation copies into its response.
    candidate_groups: list[SpecificationCandidateGroup] = Field(default_factory=list)
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
    candidate_groups: list[SpecificationCandidateGroup] = Field(default_factory=list)
    snapshot: dict[str, Any] | None = None


class SpecificationGenerationResponse(BaseModel):
    project_id: UUID
    settings_version: int
    results: list[SpecificationVariantGenerationResult]


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
    electrical_variant_id: UUID
    items: list[dict[str, Any]]
    snapshot: dict[str, Any] | None = None
    is_stale: bool
    stale_reason: str | None = None
    stale_at: datetime | None = None
    stale_details: dict[str, Any] | None = None
    created_at: datetime
    updated_at: datetime


class SpecificationManualItemsResponse(BaseModel):
    """UUID-scoped response after replacing manual rows of one specification."""

    project_id: UUID
    electrical_variant_id: UUID
    items: list[SpecificationItem]


class SpecificationUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    items: list[SpecificationItem]

    @field_validator("items")
    @classmethod
    def _items_are_manual(cls, value: list[SpecificationItem]) -> list[SpecificationItem]:
        if any(item.source != "manual" for item in value):
            raise ValueError("manual PUT accepts only source=manual items")
        return value


class SpecificationCatalogSelectionEntry(BaseModel):
    """One explicit multi-candidate choice for an ER group."""

    model_config = ConfigDict(extra="forbid")

    candidate_group_key: str = Field(min_length=1, max_length=128)
    catalog_version_id: UUID
    catalog_item_id: UUID
    candidate_set_fingerprint: str = Field(
        pattern=r"^sha256:[0-9a-f]{64}$",
    )


class SpecificationCatalogSelectionsResponse(BaseModel):
    project_id: UUID
    electrical_variant_id: UUID
    collection_version: int = Field(ge=1)
    selections: list[SpecificationCatalogSelectionEntry] = Field(default_factory=list)


class SpecificationCatalogSelectionsPutRequest(BaseModel):
    """Atomic replace of persisted explicit selections for one ER."""

    model_config = ConfigDict(extra="forbid")

    expected_version: int = Field(ge=0)
    selections: list[SpecificationCatalogSelectionEntry] = Field(default_factory=list)

    @field_validator("selections")
    @classmethod
    def _unique_group_keys(
        cls, value: list[SpecificationCatalogSelectionEntry]
    ) -> list[SpecificationCatalogSelectionEntry]:
        keys = [item.candidate_group_key for item in value]
        if len(keys) != len(set(keys)):
            raise ValueError("candidate_group_key must be unique within selections")
        return value
