"""Dependency-free catalog candidate selection subsystem."""

from heatcalc_specification_core.candidates.condition_contracts import (
    CableCondition,
    CableIdentity,
    CandidateCondition,
    CandidateResultSnapshot,
    InvalidCondition,
    InvalidConditionReason,
    TemperatureCondition,
    UniversalCondition,
    condition_from_json,
    condition_json,
)
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
    "CableCondition",
    "CableIdentity",
    "CandidateBuildResult",
    "CandidateCatalog",
    "CandidateCatalogItem",
    "CandidateCatalogVersion",
    "CandidateDiagnostic",
    "CandidateDiagnosticCode",
    "CandidateGroup",
    "CandidateIssueKind",
    "CandidateCondition",
    "CandidateResultSnapshot",
    "InvalidCondition",
    "InvalidConditionReason",
    "SelectionSource",
    "SpecificationCandidate",
    "TemperatureCondition",
    "UniversalCondition",
    "build_candidate_groups",
    "candidate_groups_fingerprint_payload",
    "candidate_set_fingerprint",
    "catalog_selections_for_variant",
    "condition_from_json",
    "condition_json",
    "stable_group_key",
]
