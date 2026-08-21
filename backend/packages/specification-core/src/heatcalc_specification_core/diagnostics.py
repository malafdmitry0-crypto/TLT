"""Typed diagnostic contracts shared by specification core stages."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any


class IssueKind(StrEnum):
    CONFIRMABLE = "confirmable"
    BLOCKING = "blocking"
    SELECTION_REQUIRED = "selection_required"


class PreflightStatus(StrEnum):
    READY = "ready"
    CONFIRMATION_REQUIRED = "confirmation_required"
    BLOCKED = "blocked"
    SELECTION_REQUIRED = "selection_required"


class DiagnosticCode(StrEnum):
    UNASSIGNED_CONFIRMATION_REQUIRED = "SPEC_UNASSIGNED_CONFIRMATION_REQUIRED"
    VARIANT_NOT_READY = "SPEC_VARIANT_NOT_READY"
    UNSUPPORTED_OBJECT_TYPE = "SPEC_UNSUPPORTED_OBJECT_TYPE"
    RESULT_STALE = "SPEC_RESULT_STALE"
    MOCK_INPUTS_NOT_ALLOWED = "ELECTRICAL_MOCK_INPUTS_NOT_ALLOWED"
    SECTION_PLAN_INVALID = "ELECTRICAL_SECTION_PLAN_INVALID"
    CABLE_NOMENCLATURE_MISSING = "SPEC_CABLE_NOMENCLATURE_MISSING"
    CATALOG_VERSION_INACTIVE = "SPEC_CATALOG_VERSION_INACTIVE"
    CATALOG_UNAVAILABLE = "SPEC_CATALOG_UNAVAILABLE"
    ACCESSORY_CATALOG_ITEM_MISSING = "SPEC_ACCESSORY_CATALOG_ITEM_MISSING"
    ACCESSORY_CATALOG_INCOMPLETE = "SPEC_ACCESSORY_CATALOG_INCOMPLETE"
    ACCESSORY_SELECTION_REQUIRED = "SPEC_ACCESSORY_SELECTION_REQUIRED"
    BOX_EX_RGR_MATRIX_MISSING = "SPEC_BOX_EX_RGR_MATRIX_MISSING"
    FORMULA_INPUT_INVALID = "SPEC_FORMULA_INPUT_INVALID"


@dataclass(frozen=True, slots=True)
class Diagnostic:
    code: str
    kind: IssueKind
    message: str
    issues: tuple[Mapping[str, Any], ...] = ()
    details: Mapping[str, Any] = field(default_factory=dict)


def status_for(diagnostics: tuple[Diagnostic, ...] | list[Diagnostic]) -> PreflightStatus:
    """Derive the public status from the fixed diagnostic precedence."""
    kinds = {item.kind for item in diagnostics}
    if IssueKind.BLOCKING in kinds:
        return PreflightStatus.BLOCKED
    if IssueKind.SELECTION_REQUIRED in kinds:
        return PreflightStatus.SELECTION_REQUIRED
    if IssueKind.CONFIRMABLE in kinds:
        return PreflightStatus.CONFIRMATION_REQUIRED
    return PreflightStatus.READY
