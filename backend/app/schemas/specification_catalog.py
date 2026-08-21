"""Typed boundary for versioned specification catalogs."""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

# Bound import payloads so admin HTTP cannot stream unbounded catalogs.
SPECIFICATION_CATALOG_IMPORT_MAX_ITEMS = 5000


class SpecificationCatalogStatus(StrEnum):
    DRAFT = "draft"
    ACTIVE = "active"
    RETIRED = "retired"


class SpecificationCatalogAuthority(StrEnum):
    APPROVED = "approved"
    PROVISIONAL = "provisional"
    SYNTHETIC = "synthetic"
    DEMO = "demo"
    GUESSED = "guessed"


class SpecificationCatalogCategory(StrEnum):
    CABLE = "cable"
    CONNECTION_KIT = "connection_kit"
    REPAIR_KIT = "repair_kit"
    SEALANT = "sealant"
    FIBERGLASS_TAPE = "fiberglass_tape"
    ALUMINIUM_TAPE = "aluminium_tape"
    BOX = "box"


class SpecificationCatalogItemInput(BaseModel):
    """Нормализованная строка импорта до присвоения immutable UUID."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    item_key: str = Field(min_length=1, max_length=128)
    category: SpecificationCatalogCategory
    name: str = Field(min_length=1)
    mark: str = Field(min_length=1, max_length=255)
    nomenclature_code: str = Field(min_length=1, max_length=128)
    supply_unit: str = Field(min_length=1, max_length=32)
    applicability: dict[str, Any] = Field(default_factory=dict)
    package_parameters: dict[str, Any] = Field(default_factory=dict)
    formula_parameters: dict[str, Any] = Field(default_factory=dict)
    source_ref: str = Field(min_length=1)


class SpecificationCatalogImportRequest(BaseModel):
    """Draft import; activation is a separate fail-closed operation."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    catalog_key: str = Field(min_length=1, max_length=64)
    version: str = Field(min_length=1, max_length=128)
    authority: SpecificationCatalogAuthority
    source: str = Field(min_length=1)
    source_checksum: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")
    schema_version: int = Field(ge=1)
    items: list[SpecificationCatalogItemInput] = Field(
        min_length=1,
        max_length=SPECIFICATION_CATALOG_IMPORT_MAX_ITEMS,
    )


class SpecificationCatalogVersionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    catalog_key: str
    version: str
    status: SpecificationCatalogStatus
    authority: SpecificationCatalogAuthority
    source: str
    source_checksum: str
    payload_checksum: str
    schema_version: int
    item_count: int
    is_complete: bool
    validation_issues: list[dict[str, Any]]
    imported_at: datetime | None = None
    imported_by: str | None = None
    activated_at: datetime | None = None
    activated_by: str | None = None


class SpecificationCatalogItemSummary(BaseModel):
    """Admin-facing item row without raw formula parameter dump by default."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    item_key: str
    category: SpecificationCatalogCategory
    name: str
    mark: str
    nomenclature_code: str
    supply_unit: str
    source_ref: str
    position: int
    applicability: dict[str, Any] = Field(default_factory=dict)
    package_parameters: dict[str, Any] = Field(default_factory=dict)
    formula_parameters: dict[str, Any] = Field(default_factory=dict)


class SpecificationCatalogDetailResponse(SpecificationCatalogVersionResponse):
    """Version metadata plus ordered items for admin inspection."""

    items: list[SpecificationCatalogItemSummary] = Field(default_factory=list)


class SpecificationCatalogActivationResponse(BaseModel):
    catalog: SpecificationCatalogVersionResponse
    stale_specification_count: int = Field(ge=0)
