"""Canonical catalog → upstream → report → fingerprint preflight flow."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any
from uuid import UUID

from heatcalc_specification_core.diagnostics import (
    Diagnostic,
    DiagnosticCode,
    IssueKind,
    PreflightStatus,
    status_for,
)

from .contracts import (
    PreflightAssignment,
    PreflightCatalog,
    PreflightOutcome,
    PreflightSummary,
    PreparedSpecification,
)
from .fingerprint import FINGERPRINT_SCHEMA, preflight_fingerprint
from .upstream_gate import assignment_diagnostics, catalog_diagnostics


def prepare_specification(
    *,
    electrical_variant_id: UUID,
    assignments: Sequence[PreflightAssignment],
    catalog: PreflightCatalog | None,
    exclude_unassigned_confirmed: bool,
    electrical_variant_name: str | None = None,
    project_id: UUID | None = None,
    resolved_options: Mapping[str, Any] | None = None,
    catalog_selections: Mapping[str, UUID] | None = None,
    candidate_groups: Sequence[Mapping[str, Any]] = (),
    additional_diagnostics: Sequence[Diagnostic] = (),
) -> PreflightOutcome:
    """Prepare one ER from fully loaded immutable application snapshots."""
    unassigned = tuple(
        sorted(
            (row.object_id for row in assignments if row.assignment_state == "unassigned"), key=str
        )
    )
    excluded = unassigned if exclude_unassigned_confirmed else ()
    diagnostics = catalog_diagnostics(catalog)
    row_diagnostics: dict[UUID, list[Diagnostic]] = {}
    if catalog is not None:
        for row in assignments:
            if row.assignment_state != "unassigned":
                row_diagnostics[row.object_id] = assignment_diagnostics(row, catalog)
                diagnostics.extend(row_diagnostics[row.object_id])
    contributing_rows = tuple(
        row
        for row in assignments
        if row.assignment_state != "unassigned"
        and row.object_id in row_diagnostics
        and not row_diagnostics[row.object_id]
    )
    if (
        assignments
        and not contributing_rows
        and not any(item.kind is IssueKind.BLOCKING for item in diagnostics)
    ):
        diagnostics.append(
            _diagnostic(
                DiagnosticCode.VARIANT_NOT_READY,
                IssueKind.BLOCKING,
                "Нет результатов электротехнического расчёта для включения в спецификацию",
            )
        )
    elif (
        unassigned
        and not exclude_unassigned_confirmed
        and not any(item.kind is IssueKind.BLOCKING for item in diagnostics)
    ):
        diagnostics.append(
            _diagnostic(
                DiagnosticCode.UNASSIGNED_CONFIRMATION_REQUIRED,
                IssueKind.CONFIRMABLE,
                "Есть объекты без назначения в выбранном ЭР",
                details={"unassigned_object_ids": [str(item) for item in unassigned]},
            )
        )
    if not assignments:
        diagnostics.append(
            _diagnostic(
                DiagnosticCode.VARIANT_NOT_READY,
                IssueKind.BLOCKING,
                "В выбранном ЭР нет assignment snapshot",
                issues=({"reason": "variant_has_no_assignments"},),
                details={"electrical_variant_id": str(electrical_variant_id)},
            )
        )
    diagnostics.extend(additional_diagnostics)
    status = status_for(diagnostics)
    prepared = None
    if status is PreflightStatus.READY:
        assert catalog is not None
        try:
            fingerprint = preflight_fingerprint(
                project_id=project_id,
                electrical_variant_id=electrical_variant_id,
                assignments=assignments,
                catalog=catalog.identity,
                resolved_options=resolved_options,
                catalog_selections=catalog_selections or {},
                candidate_groups=candidate_groups,
                excluded_unassigned_object_ids=excluded,
            )
            prepared = PreparedSpecification(FINGERPRINT_SCHEMA, fingerprint, contributing_rows)
        except (TypeError, ValueError) as exc:
            diagnostics.append(
                _diagnostic(
                    DiagnosticCode.FORMULA_INPUT_INVALID,
                    IssueKind.BLOCKING,
                    "Fingerprint содержит неоднозначные или невалидные входные данные",
                    details={"reason": str(exc)},
                )
            )
            status = PreflightStatus.BLOCKED
    summary = PreflightSummary(
        electrical_variant_id=electrical_variant_id,
        electrical_variant_name=electrical_variant_name,
        status=status,
        total_objects=len(assignments),
        contributing_objects=len(contributing_rows),
        unassigned_object_ids=unassigned,
        excluded_unassigned_object_ids=excluded,
        diagnostics=tuple(diagnostics),
    )
    return PreflightOutcome(summary, prepared)


def _diagnostic(
    code: DiagnosticCode,
    kind: IssueKind,
    message: str,
    *,
    issues: tuple[Mapping[str, Any], ...] = (),
    details: Mapping[str, Any] | None = None,
) -> Diagnostic:
    return Diagnostic(code.value, kind, message, issues, details or {})
