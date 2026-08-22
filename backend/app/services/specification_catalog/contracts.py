"""Application contracts for specification catalog lifecycle operations."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.models.specification import (
    SpecificationCatalogItem,
    SpecificationCatalogVersion,
)


@dataclass(frozen=True)
class SpecificationCatalogValidation:
    is_complete: bool
    issues: list[dict[str, Any]]


@dataclass(frozen=True)
class ResolvedSpecificationCatalog:
    version: SpecificationCatalogVersion
    items: tuple[SpecificationCatalogItem, ...]


@dataclass(frozen=True)
class SpecificationCatalogActivationResult:
    catalog: SpecificationCatalogVersion
    stale_specification_count: int
