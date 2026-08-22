from __future__ import annotations

from dataclasses import replace
from datetime import UTC, datetime
from decimal import Decimal
from uuid import UUID

from heatcalc_specification_core.diagnostics import (
    Diagnostic,
    DiagnosticCode,
    IssueKind,
    PreflightStatus,
)
from heatcalc_specification_core.json_types import json_object, mutable_json
from heatcalc_specification_core.preflight import (
    CatalogIdentity,
    ElectricalResultSnapshot,
    PreflightAssignment,
    PreflightCatalog,
    PreflightCatalogItem,
    PreflightOutcome,
    prepare_specification,
)

VARIANT_ID = UUID("11111111-1111-4111-8111-111111111111")
PROJECT_ID = UUID("77777777-7777-4777-8777-777777777777")
OBJECT_ID = UUID("22222222-2222-4222-8222-222222222222")
ASSIGNMENT_ID = UUID("33333333-3333-4333-8333-333333333333")
CALCULATION_ID = UUID("44444444-4444-4444-8444-444444444444")
SELECTED_ID = UUID("88888888-8888-4888-8888-888888888888")


def _catalog() -> PreflightCatalog:
    return PreflightCatalog(
        identity=CatalogIdentity(
            catalog_id="catalog-id",
            catalog_key="case1",
            version="2026.08",
            source_checksum="sha256:" + "a" * 64,
            payload_checksum="sha256:" + "b" * 64,
            schema_version=1,
        ),
        is_active=True,
        is_complete=True,
        authority="approved",
        items=(PreflightCatalogItem("cable-id", "cable", "30ТТВ2-СР", "001-002"),),
    )


def _result(**changes: object) -> ElectricalResultSnapshot:
    result = ElectricalResultSnapshot(
        upstream_status="success",
        production_eligible=True,
        provenance_production_eligible=True,
        mocked_fields=(),
        provenance_mocked_fields=(),
        cable_mark="30ТТВ2-СР",
        nomenclature_code="001-002",
        section_count=Decimal("3"),
        section_length_m=Decimal("67"),
        section_plan_origin="automatic",
        actual_installed_length_m=Decimal("201"),
        required_order_length_m=Decimal("221.1"),
        object_snapshot_version=4,
        heat_snapshot_version=4,
        provenance_object_version=4,
        heat_result_version=4,
        provenance_assignment_version=2,
        formula_version="tt-v1",
        formula_fingerprint="sha256:" + "c" * 64,
        calculation_fingerprint="sha256:" + "d" * 64,
        catalog_fingerprints=json_object({"electrical": "sha256:" + "e" * 64}),
    )
    return replace(result, **changes)  # type: ignore[arg-type]


def _assignment(**changes: object) -> PreflightAssignment:
    assignment = PreflightAssignment(
        assignment_id=ASSIGNMENT_ID,
        calculation_id=CALCULATION_ID,
        calculation_updated_at=datetime(2026, 8, 3, 10, 30, tzinfo=UTC),
        object_id=OBJECT_ID,
        object_type="pipe",
        object_is_valid=True,
        assignment_state="ready",
        system_type="self_regulating",
        object_version=4,
        assignment_version=2,
        assignment_object_version=4,
        result=_result(),
    )
    return replace(assignment, **changes)  # type: ignore[arg-type]


def _rich_ready() -> PreflightOutcome:
    return prepare_specification(
        electrical_variant_id=VARIANT_ID,
        electrical_variant_name="ER canonical",
        project_id=PROJECT_ID,
        assignments=(_assignment(),),
        catalog=_catalog(),
        exclude_unassigned_confirmed=False,
        resolved_options=json_object({"grouping_mode": "merge_materials", "ex": False}),
        catalog_selections={"group-a": SELECTED_ID},
        candidate_groups=(
            json_object(
                {
                    "group_key": "group-a",
                    "category": "cable",
                    "candidate_ids": [str(SELECTED_ID)],
                }
            ),
        ),
    )


def test_ready_preflight_has_exact_summary_and_generation_identity() -> None:
    outcome = _rich_ready()

    summary = outcome.summary
    assert summary.electrical_variant_id == VARIANT_ID
    assert summary.electrical_variant_name == "ER canonical"
    assert summary.status is PreflightStatus.READY
    assert summary.total_objects == 1
    assert summary.contributing_objects == 1
    assert summary.unassigned_object_ids == ()
    assert summary.excluded_unassigned_object_ids == ()
    assert summary.diagnostics == ()
    assert outcome.result is not None
    assert outcome.result.fingerprint_schema == "specification-preflight/v1"
    assert outcome.result.input_fingerprint == (
        "sha256:5d056787973db1ec0f5e9ca13a643aaa5a508512be1ef6026e8e1b6e667e43b2"
    )
    assert outcome.result.contributing_assignments == (_assignment(),)


def test_unassigned_requires_confirmation_with_exact_sorted_identity() -> None:
    late_id = UUID("99999999-9999-4999-8999-999999999999")
    early_id = UUID("00000000-0000-4000-8000-000000000001")
    ready = _assignment()
    unassigned_late = replace(
        ready,
        assignment_id=UUID("99999999-9999-4999-8999-999999999998"),
        object_id=late_id,
        assignment_state="unassigned",
        system_type=None,
        result=None,
    )
    unassigned_early = replace(
        unassigned_late,
        assignment_id=UUID("00000000-0000-4000-8000-000000000002"),
        object_id=early_id,
    )

    outcome = prepare_specification(
        electrical_variant_id=VARIANT_ID,
        assignments=(unassigned_late, ready, unassigned_early),
        catalog=_catalog(),
        exclude_unassigned_confirmed=False,
    )

    assert outcome.result is None
    assert outcome.summary.status is PreflightStatus.CONFIRMATION_REQUIRED
    assert outcome.summary.total_objects == 3
    assert outcome.summary.contributing_objects == 1
    assert outcome.summary.unassigned_object_ids == (early_id, late_id)
    assert outcome.summary.excluded_unassigned_object_ids == ()
    assert len(outcome.summary.diagnostics) == 1
    diagnostic = outcome.summary.diagnostics[0]
    assert diagnostic.code is DiagnosticCode.UNASSIGNED_CONFIRMATION_REQUIRED
    assert diagnostic.kind is IssueKind.CONFIRMABLE
    assert diagnostic.message == "Есть объекты без назначения в выбранном ЭР"
    assert diagnostic.issues == ()
    assert mutable_json(diagnostic.details) == {
        "unassigned_object_ids": [str(early_id), str(late_id)]
    }


def test_confirmed_unassigned_is_excluded_and_all_unassigned_is_blocked() -> None:
    unassigned = replace(
        _assignment(),
        object_id=UUID("66666666-6666-4666-8666-666666666666"),
        assignment_state="unassigned",
        system_type=None,
        result=None,
    )
    mixed = prepare_specification(
        electrical_variant_id=VARIANT_ID,
        assignments=(_assignment(), unassigned),
        catalog=_catalog(),
        exclude_unassigned_confirmed=True,
    )
    all_unassigned = prepare_specification(
        electrical_variant_id=VARIANT_ID,
        assignments=(unassigned,),
        catalog=_catalog(),
        exclude_unassigned_confirmed=True,
    )

    assert mixed.summary.status is PreflightStatus.READY
    assert mixed.summary.unassigned_object_ids == (unassigned.object_id,)
    assert mixed.summary.excluded_unassigned_object_ids == (unassigned.object_id,)
    assert mixed.summary.contributing_objects == 1
    assert mixed.result is not None
    assert mixed.result.contributing_assignments == (_assignment(),)
    assert all_unassigned.result is None
    assert all_unassigned.summary.status is PreflightStatus.BLOCKED
    assert all_unassigned.summary.contributing_objects == 0
    assert all_unassigned.summary.diagnostics == (
        Diagnostic(
            DiagnosticCode.VARIANT_NOT_READY,
            IssueKind.BLOCKING,
            "Нет результатов электротехнического расчёта для включения в спецификацию",
        ),
    )


def test_empty_and_missing_catalog_fail_closed_without_prepared_result() -> None:
    empty = prepare_specification(
        electrical_variant_id=VARIANT_ID,
        assignments=(),
        catalog=_catalog(),
        exclude_unassigned_confirmed=False,
    )
    no_catalog = prepare_specification(
        electrical_variant_id=VARIANT_ID,
        assignments=(_assignment(),),
        catalog=None,
        exclude_unassigned_confirmed=False,
    )

    assert empty.result is None
    assert empty.summary.status is PreflightStatus.BLOCKED
    assert empty.summary.total_objects == 0
    assert empty.summary.contributing_objects == 0
    assert empty.summary.diagnostics == (
        Diagnostic(
            DiagnosticCode.VARIANT_NOT_READY,
            IssueKind.BLOCKING,
            "В выбранном ЭР нет assignment snapshot",
            issues=(json_object({"reason": "variant_has_no_assignments"}),),
            details=json_object({"electrical_variant_id": str(VARIANT_ID)}),
        ),
    )
    assert no_catalog.result is None
    assert no_catalog.summary.status is PreflightStatus.BLOCKED
    assert no_catalog.summary.contributing_objects == 0
    assert no_catalog.summary.diagnostics == (
        Diagnostic(
            DiagnosticCode.CATALOG_UNAVAILABLE,
            IssueKind.BLOCKING,
            "Не выбрана immutable версия каталога спецификации",
        ),
    )


def test_additional_selection_diagnostic_prevents_generation() -> None:
    selection = Diagnostic(
        DiagnosticCode.ACCESSORY_SELECTION_REQUIRED,
        IssueKind.SELECTION_REQUIRED,
        "Требуется явный выбор",
        issues=(json_object({"group_key": "group-a"}),),
        details=json_object({"candidate_count": 2}),
    )

    outcome = prepare_specification(
        electrical_variant_id=VARIANT_ID,
        assignments=(_assignment(),),
        catalog=_catalog(),
        exclude_unassigned_confirmed=False,
        additional_diagnostics=(selection,),
    )

    assert outcome.result is None
    assert outcome.summary.status is PreflightStatus.SELECTION_REQUIRED
    assert outcome.summary.diagnostics == (selection,)
    assert outcome.summary.contributing_objects == 1


def test_ambiguous_fingerprint_input_becomes_exact_blocking_diagnostic() -> None:
    outcome = prepare_specification(
        electrical_variant_id=VARIANT_ID,
        assignments=(_assignment(),),
        catalog=_catalog(),
        exclude_unassigned_confirmed=False,
        resolved_options=json_object({"ambiguous": 1.5}),
    )

    assert outcome.result is None
    assert outcome.summary.status is PreflightStatus.BLOCKED
    assert outcome.summary.contributing_objects == 1
    assert len(outcome.summary.diagnostics) == 1
    diagnostic = outcome.summary.diagnostics[0]
    assert diagnostic.code is DiagnosticCode.FORMULA_INPUT_INVALID
    assert diagnostic.kind is IssueKind.BLOCKING
    assert diagnostic.message == "Fingerprint содержит неоднозначные или невалидные входные данные"
    assert diagnostic.issues == ()
    assert mutable_json(diagnostic.details) == {
        "reason": "fingerprint payload contains an ambiguous float"
    }
