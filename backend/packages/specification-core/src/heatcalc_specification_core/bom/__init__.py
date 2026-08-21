"""Dependency-free canonical specification BOM pipeline."""

from heatcalc_specification_core.bom.contracts import (
    BomItem,
    CandidateGroup,
    CatalogIdentity,
    CatalogItem,
    GenerationFailure,
    GenerationInput,
    GenerationOutcome,
    GenerationSuccess,
    ObjectTypeSection,
    ResolvedOptions,
    RevisionContext,
    SelectionSource,
    SpecificationCatalog,
    SpecificationContribution,
    SpecificationDiagnostic,
)
from heatcalc_specification_core.bom.pipeline import run_specification

__all__ = [
    "BomItem",
    "CandidateGroup",
    "CatalogIdentity",
    "CatalogItem",
    "GenerationFailure",
    "GenerationInput",
    "GenerationOutcome",
    "GenerationSuccess",
    "ObjectTypeSection",
    "ResolvedOptions",
    "RevisionContext",
    "SelectionSource",
    "SpecificationCatalog",
    "SpecificationContribution",
    "SpecificationDiagnostic",
    "run_specification",
]
