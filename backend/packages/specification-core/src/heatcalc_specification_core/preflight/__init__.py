"""Typed specification preflight pipeline."""

from .contracts import (
    CatalogIdentity,
    ElectricalResultSnapshot,
    PreflightAssignment,
    PreflightCatalog,
    PreflightCatalogItem,
    PreflightOutcome,
    PreflightSummary,
)
from .pipeline import prepare_specification

__all__ = [
    "CatalogIdentity",
    "ElectricalResultSnapshot",
    "PreflightAssignment",
    "PreflightCatalog",
    "PreflightCatalogItem",
    "PreflightOutcome",
    "PreflightSummary",
    "prepare_specification",
]
