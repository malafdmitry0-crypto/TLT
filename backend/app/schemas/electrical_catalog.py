"""Typed API contracts for versioned electrical catalogs."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

ElectricalCatalogKind = Literal["power", "section", "bom"]
ElectricalCatalogStatus = Literal["draft", "active", "retired"]


class ElectricalCatalogImportDocument(BaseModel):
    model_config = ConfigDict(extra="forbid")

    version: str
    source: str
    source_checksum: str
    import_checksum: str
    schema_version: int
    payload: dict[str, Any]
    production_approved: bool = False
    diagnostics: list[dict[str, Any]] = Field(default_factory=list)


class ElectricalCatalogVersionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID | None
    kind: ElectricalCatalogKind
    version: str
    status: ElectricalCatalogStatus
    source: str
    source_checksum: str
    import_checksum: str | None
    payload_checksum: str
    schema_version: int
    valid_row_count: int
    rejected_row_count: int
    diagnostics: list[dict[str, Any]]
    production_approved: bool
    imported_at: datetime | None
    imported_by: str | None
    activated_at: datetime | None
    activated_by: str | None
    authority: Literal["database"] = "database"


class ElectricalCatalogMetadataResponse(BaseModel):
    catalogs: list[ElectricalCatalogVersionResponse]
    production_ready: bool
    missing_active_kinds: list[ElectricalCatalogKind] = Field(default_factory=list)
    invalid_active_kinds: list[ElectricalCatalogKind] = Field(default_factory=list)


class ElectricalCatalogActivationResponse(BaseModel):
    catalog: ElectricalCatalogVersionResponse
    stale_calculations: int
    stale_assignments: int
    stale_specifications: int
