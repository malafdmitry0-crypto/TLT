"""Dependency-free catalog candidate selection subsystem."""

from heatcalc_specification_core.candidates.contracts import (
    CandidateBuildResult,
    CandidateCatalog,
    CandidateCatalogItem,
    CandidateCatalogVersion,
    CandidateDiagnostic,
    CandidateDiagnosticCode,
    CandidateGroup,
    CandidateIssueKind,
    SelectionSource,
    SpecificationCandidate,
)
from heatcalc_specification_core.candidates.fingerprint import (
    candidate_groups_fingerprint_payload,
    candidate_set_fingerprint,
    stable_group_key,
)
from heatcalc_specification_core.candidates.pipeline import build_candidate_groups
from heatcalc_specification_core.candidates.selections import catalog_selections_for_variant

__all__ = [
    "CandidateBuildResult",
    "CandidateCatalog",
    "CandidateCatalogItem",
    "CandidateCatalogVersion",
    "CandidateDiagnostic",
    "CandidateDiagnosticCode",
    "CandidateGroup",
    "CandidateIssueKind",
    "SelectionSource",
    "SpecificationCandidate",
    "build_candidate_groups",
    "candidate_groups_fingerprint_payload",
    "candidate_set_fingerprint",
    "catalog_selections_for_variant",
    "stable_group_key",
]
