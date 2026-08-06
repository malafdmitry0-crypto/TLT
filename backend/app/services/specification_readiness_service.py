"""Read-only, aggregated readiness projection for Specification UI."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import CurrentPrincipal
from app.schemas.specification import (
    SpecificationDiagnostic,
    SpecificationDiagnosticCode,
    SpecificationGenerationRequest,
    SpecificationReadinessBlocker,
    SpecificationReadinessNextAction,
    SpecificationReadinessResponse,
    SpecificationReadinessSourceStage,
    SpecificationRequestedOptions,
    SpecificationVariantReadinessResult,
)
from app.services.specification_preflight_service import SpecificationPreflightService


@dataclass(frozen=True, slots=True)
class _Recovery:
    stage: SpecificationReadinessSourceStage
    scope: Literal["project", "electrical_variant", "catalog"]
    reason: str
    action: SpecificationReadinessNextAction


@dataclass(slots=True)
class _BlockerAccumulator:
    diagnostic: SpecificationDiagnostic
    recovery: _Recovery
    occurrences: int = 0
    object_ids: set[UUID] = field(default_factory=set)


class SpecificationReadinessService:
    """Reuse canonical preflight while omitting candidate-selection DB work."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get(
        self,
        project_id: UUID,
        principal: CurrentPrincipal,
        variant_ids: list[UUID],
    ) -> SpecificationReadinessResponse:
        request = SpecificationGenerationRequest(
            variant_ids=variant_ids,
            options=SpecificationRequestedOptions(),
        )
        preflight = await SpecificationPreflightService(self.db).preflight_variants(
            project_id,
            principal,
            request,
            include_candidate_selection=False,
        )
        return SpecificationReadinessResponse(
            project_id=project_id,
            results=[
                SpecificationVariantReadinessResult(
                    electrical_variant_id=result.electrical_variant_id,
                    electrical_variant_name=result.electrical_variant_name,
                    status=result.status,
                    total_objects=result.total_objects,
                    contributing_objects=result.contributing_objects,
                    blockers=_aggregate_blockers(
                        result.diagnostics,
                        variant_id=result.electrical_variant_id,
                        variant_name=result.electrical_variant_name,
                    ),
                )
                for result in preflight
            ],
        )


def _aggregate_blockers(
    diagnostics: list[SpecificationDiagnostic],
    *,
    variant_id: UUID,
    variant_name: str | None,
) -> list[SpecificationReadinessBlocker]:
    grouped: dict[tuple[str, ...], _BlockerAccumulator] = {}
    for diagnostic in diagnostics:
        recovery = _recovery_for(diagnostic)
        key = (
            recovery.stage.value,
            recovery.scope,
            recovery.reason,
            recovery.action.value,
            diagnostic.code.value,
            diagnostic.kind.value,
            diagnostic.message,
        )
        accumulator = grouped.setdefault(
            key,
            _BlockerAccumulator(diagnostic=diagnostic, recovery=recovery),
        )
        accumulator.occurrences += 1
        object_id = _uuid_or_none(diagnostic.details.get("object_id"))
        if object_id is not None:
            accumulator.object_ids.add(object_id)

    blockers: list[SpecificationReadinessBlocker] = []
    for accumulator in grouped.values():
        object_ids = sorted(accumulator.object_ids, key=str)
        blockers.append(
            SpecificationReadinessBlocker(
                code=accumulator.diagnostic.code,
                kind=accumulator.diagnostic.kind,
                message=accumulator.diagnostic.message,
                source_stage=accumulator.recovery.stage,
                scope=accumulator.recovery.scope,
                electrical_variant_id=variant_id,
                electrical_variant_name=variant_name,
                reason=accumulator.recovery.reason,
                count=max(accumulator.occurrences, len(object_ids), 1),
                object_ids=object_ids,
                next_action=accumulator.recovery.action,
            )
        )
    return blockers


def _recovery_for(diagnostic: SpecificationDiagnostic) -> _Recovery:
    code = diagnostic.code
    details = diagnostic.details
    assignment_state = details.get("assignment_state")

    if code is SpecificationDiagnosticCode.CATALOG_UNAVAILABLE or code.value.startswith(
        "SPEC_CATALOG_"
    ):
        return _Recovery(
            SpecificationReadinessSourceStage.CATALOG,
            "catalog",
            code.value.lower(),
            SpecificationReadinessNextAction.CONTACT_CATALOG_ADMIN,
        )
    if code is SpecificationDiagnosticCode.ACCESSORY_SELECTION_REQUIRED:
        return _Recovery(
            SpecificationReadinessSourceStage.SPECIFICATION,
            "electrical_variant",
            "catalog_selection_required",
            SpecificationReadinessNextAction.SELECT_CATALOG_ITEMS,
        )
    if code is SpecificationDiagnosticCode.UNASSIGNED_CONFIRMATION_REQUIRED:
        return _Recovery(
            SpecificationReadinessSourceStage.ELECTRICAL,
            "electrical_variant",
            "unassigned_objects",
            SpecificationReadinessNextAction.CONFIRM_UNASSIGNED_EXCLUSION,
        )
    if code is SpecificationDiagnosticCode.FORMULA_INPUT_INVALID:
        return _Recovery(
            SpecificationReadinessSourceStage.SPECIFICATION,
            "project",
            "specification_settings_invalid",
            SpecificationReadinessNextAction.CONFIGURE_SPECIFICATION,
        )
    if "Heat" in diagnostic.message:
        return _Recovery(
            SpecificationReadinessSourceStage.HEAT,
            "project",
            "heat_validation_failed",
            SpecificationReadinessNextAction.RECALCULATE_HEAT,
        )
    if assignment_state is not None:
        upstream_reason = details.get("reason")
        return _Recovery(
            SpecificationReadinessSourceStage.ELECTRICAL,
            "electrical_variant",
            (
                upstream_reason
                if isinstance(upstream_reason, str) and upstream_reason
                else f"assignment_{assignment_state}"
            ),
            SpecificationReadinessNextAction.OPEN_ELECTRICAL_VARIANT,
        )
    if code in {
        SpecificationDiagnosticCode.VARIANT_NOT_READY,
        SpecificationDiagnosticCode.RESULT_STALE,
        SpecificationDiagnosticCode.MOCK_INPUTS_NOT_ALLOWED,
        SpecificationDiagnosticCode.SECTION_PLAN_INVALID,
        SpecificationDiagnosticCode.CABLE_NOMENCLATURE_MISSING,
    }:
        return _Recovery(
            SpecificationReadinessSourceStage.ELECTRICAL,
            "electrical_variant",
            code.value.lower(),
            SpecificationReadinessNextAction.OPEN_ELECTRICAL_VARIANT,
        )
    return _Recovery(
        SpecificationReadinessSourceStage.SPECIFICATION,
        "electrical_variant",
        code.value.lower(),
        SpecificationReadinessNextAction.RETRY_GENERATION,
    )


def _uuid_or_none(value: object) -> UUID | None:
    try:
        return UUID(str(value)) if value is not None else None
    except (TypeError, ValueError, AttributeError):
        return None
