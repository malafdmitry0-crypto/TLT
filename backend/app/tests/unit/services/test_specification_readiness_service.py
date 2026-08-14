from __future__ import annotations

from uuid import uuid4

from app.schemas.specification import (
    SpecificationDiagnostic,
    SpecificationDiagnosticCode,
    SpecificationIssueKind,
    SpecificationReadinessNextAction,
    SpecificationReadinessSourceStage,
)
from app.services.specification_readiness_service import (
    _aggregate_blockers,
    _is_generation_form_diagnostic,
    _status_for,
)


def _diagnostic(
    *,
    object_id: str | None = None,
    assignment_state: str | None = None,
    message: str = "Назначение ЭР не готово к формированию спецификации",
) -> SpecificationDiagnostic:
    details: dict[str, object] = {}
    if object_id is not None:
        details["object_id"] = object_id
    if assignment_state is not None:
        details["assignment_state"] = assignment_state
    return SpecificationDiagnostic(
        code=SpecificationDiagnosticCode.VARIANT_NOT_READY,
        kind=SpecificationIssueKind.BLOCKING,
        message=message,
        details=details,
    )


def test_stale_assignments_are_aggregated_into_one_recovery_blocker() -> None:
    variant_id = uuid4()
    object_ids = [uuid4() for _ in range(6)]

    blockers = _aggregate_blockers(
        [
            _diagnostic(object_id=str(object_id), assignment_state="stale")
            for object_id in object_ids
        ],
        variant_id=variant_id,
        variant_name="ЭР1",
    )

    assert len(blockers) == 1
    blocker = blockers[0]
    assert blocker.electrical_variant_id == variant_id
    assert blocker.electrical_variant_name == "ЭР1"
    assert blocker.source_stage is SpecificationReadinessSourceStage.ELECTRICAL
    assert blocker.reason == "assignment_stale"
    assert blocker.count == 6
    assert blocker.object_ids == sorted(object_ids, key=str)
    assert blocker.next_action is SpecificationReadinessNextAction.OPEN_ELECTRICAL_VARIANT


def test_different_root_causes_are_not_collapsed() -> None:
    variant_id = uuid4()
    blockers = _aggregate_blockers(
        [
            _diagnostic(object_id=str(uuid4()), assignment_state="stale"),
            _diagnostic(object_id=str(uuid4()), assignment_state="error"),
            _diagnostic(
                object_id=str(uuid4()),
                message="Объект не прошёл Heat-валидацию",
            ),
        ],
        variant_id=variant_id,
        variant_name="ЭР mixed",
    )

    assert len(blockers) == 3
    assert {blocker.reason for blocker in blockers} == {
        "assignment_stale",
        "assignment_error",
        "heat_validation_failed",
    }
    heat = next(blocker for blocker in blockers if blocker.reason == "heat_validation_failed")
    assert heat.source_stage is SpecificationReadinessSourceStage.HEAT
    assert heat.next_action is SpecificationReadinessNextAction.RECALCULATE_HEAT


def test_catalog_failure_is_project_independent_catalog_recovery() -> None:
    variant_id = uuid4()
    blockers = _aggregate_blockers(
        [
            SpecificationDiagnostic(
                code=SpecificationDiagnosticCode.CATALOG_UNAVAILABLE,
                kind=SpecificationIssueKind.BLOCKING,
                message="Каталог недоступен",
            )
        ],
        variant_id=variant_id,
        variant_name=None,
    )

    assert len(blockers) == 1
    assert blockers[0].source_stage is SpecificationReadinessSourceStage.CATALOG
    assert blockers[0].scope == "catalog"
    assert not hasattr(blockers[0], "electrical_variant_id")
    assert not hasattr(blockers[0], "electrical_variant_name")
    assert blockers[0].next_action is SpecificationReadinessNextAction.CONTACT_CATALOG_ADMIN


def test_generation_form_diagnostic_is_excluded_from_readiness() -> None:
    diagnostic = SpecificationDiagnostic(
        code=SpecificationDiagnosticCode.FORMULA_INPUT_INVALID,
        kind=SpecificationIssueKind.BLOCKING,
        message="Не разрешены обязательные настройки спецификации",
        issues=[
            {"reason": "required_option_unresolved", "field": "grouping_mode"}
        ],
    )
    assert _is_generation_form_diagnostic(diagnostic) is True


def test_confirmation_and_selection_keep_their_status_semantics() -> None:
    confirmable = SpecificationDiagnostic(
        code=SpecificationDiagnosticCode.UNASSIGNED_CONFIRMATION_REQUIRED,
        kind=SpecificationIssueKind.CONFIRMABLE,
        message="Требуется подтверждение",
    )
    selection = SpecificationDiagnostic(
        code=SpecificationDiagnosticCode.ACCESSORY_SELECTION_REQUIRED,
        kind=SpecificationIssueKind.SELECTION_REQUIRED,
        message="Требуется выбор",
    )

    assert _status_for([confirmable]).value == "confirmation_required"
    assert _status_for([selection]).value == "selection_required"
    assert _status_for([confirmable, selection]).value == "selection_required"
    assert _status_for([confirmable, _diagnostic()]).value == "blocked"
