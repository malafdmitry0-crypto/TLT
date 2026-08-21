from dataclasses import replace
from datetime import UTC, datetime
from decimal import Decimal
from uuid import uuid4

import pytest
from heatcalc_electrical_core import (
    ELECTRICAL_TT_FORMULA_FINGERPRINT,
    ELECTRICAL_TT_FORMULA_VERSION,
)

from app.schemas.specification import SpecificationDiagnosticCode, SpecificationPreflightStatus
from app.services.specification_preflight_rules import (
    ImmutableSpecificationCatalog,
    ImmutableSpecificationCatalogItem,
    SpecificationPreflightAssignment,
    evaluate_specification_preflight,
)

VARIANT_ID = uuid4()
OBJECT_ID = uuid4()


def _catalog(*, mark: str = "30ТТВ2-СР", code: str = "001-002", complete: bool = True):
    return ImmutableSpecificationCatalog(
        "catalog-id",
        "case1-production",
        "2026.08",
        "sha256:" + "a" * 64,
        "sha256:" + "b" * 64,
        1,
        True,
        complete,
        "approved",
        (ImmutableSpecificationCatalogItem("cable-id", "cable", mark, code),),
    )


def _result(**overrides):
    result = {
        "cable_type": "self_regulating_tt",
        "cable": {"mark": "30ТТВ2-СР", "nomenclature_code": "001-002"},
        "production_eligible": True,
        "mocked_fields": [],
        "resolved_inputs": {"nominal_voltage_v": 230, "max_section_start_current_a": 12.0},
        "catalogs": {
            kind: {"source_checksum": f"sha256:{kind}"} for kind in ("power", "section", "bom")
        },
        "provenance": {
            "formula_version": ELECTRICAL_TT_FORMULA_VERSION,
            "formula_fingerprint": ELECTRICAL_TT_FORMULA_FINGERPRINT,
            "production_eligible": True,
            "mocked_fields": [],
            "object_snapshot": {"version": 4},
            "heat_snapshot": {"version": 4},
            "object_version": 4,
            "heat_result_version": 4,
            "assignment_version": 2,
        },
        "section_plan": {"count": 3, "length_m": 67.0},
        "layout": {
            "actual_installed_length_m": 201.0,
            "required_order_length_m": 221.1,
        },
    }
    result.update(overrides)
    return result


def _assignment(**overrides):
    values = {
        "assignment_id": uuid4(),
        "calculation_id": uuid4(),
        "calculation_updated_at": datetime(2026, 8, 3, tzinfo=UTC),
        "object_id": OBJECT_ID,
        "object_type": "pipe",
        "object_is_valid": True,
        "assignment_state": "ready",
        "system_type": "self_regulating",
        "object_version": 4,
        "assignment_version": 2,
        "assignment_object_version": 4,
        "result": _result(),
    }
    values.update(overrides)
    return SpecificationPreflightAssignment(**values)


@pytest.mark.parametrize("object_type", ["pipe", "tank"])
def test_ready_uses_canonical_tt_snapshot_and_only_nonblocking_rows_contribute(object_type):
    result = evaluate_specification_preflight(
        electrical_variant_id=VARIANT_ID,
        assignments=[_assignment(object_type=object_type)],
        catalog=_catalog(),
        exclude_unassigned_confirmed=False,
    )

    assert result.status is SpecificationPreflightStatus.READY
    assert result.total_objects == result.contributing_objects == 1
    assert result.fingerprint_schema == "specification-preflight/v1"
    assert result.input_fingerprint and result.input_fingerprint.startswith("sha256:")


@pytest.mark.parametrize(
    ("assignments", "expected_status", "expected_contributing", "expected_code"),
    [
        pytest.param(
            [_assignment(assignment_state="unassigned", system_type=None)],
            SpecificationPreflightStatus.BLOCKED,
            0,
            SpecificationDiagnosticCode.VARIANT_NOT_READY,
            id="all-unassigned-is-blocked",
        ),
        pytest.param(
            [
                _assignment(object_id=uuid4()),
                _assignment(
                    object_id=uuid4(),
                    assignment_state="unassigned",
                    system_type=None,
                ),
            ],
            SpecificationPreflightStatus.CONFIRMATION_REQUIRED,
            1,
            SpecificationDiagnosticCode.UNASSIGNED_CONFIRMATION_REQUIRED,
            id="partial-is-confirmable",
        ),
        pytest.param(
            [_assignment(object_id=uuid4()), _assignment(object_id=uuid4())],
            SpecificationPreflightStatus.READY,
            2,
            None,
            id="all-contributing-is-ready",
        ),
    ],
)
def test_contribution_matrix_prioritizes_no_contributing_over_confirmation(
    assignments,
    expected_status,
    expected_contributing,
    expected_code,
):
    result = evaluate_specification_preflight(
        electrical_variant_id=VARIANT_ID,
        assignments=assignments,
        catalog=_catalog(),
        exclude_unassigned_confirmed=False,
    )

    assert result.status is expected_status
    assert result.contributing_objects == expected_contributing
    assert [diagnostic.code for diagnostic in result.diagnostics] == (
        [expected_code] if expected_code is not None else []
    )
    if expected_code is SpecificationDiagnosticCode.VARIANT_NOT_READY:
        assert result.diagnostics[0].message == (
            "Нет результатов электротехнического расчёта для включения в спецификацию"
        )


def test_unknown_object_type_is_rejected_by_specification_preflight():
    result = evaluate_specification_preflight(
        electrical_variant_id=VARIANT_ID,
        assignments=[_assignment(object_type="pump")],
        catalog=_catalog(),
        exclude_unassigned_confirmed=False,
    )

    assert result.status is SpecificationPreflightStatus.BLOCKED
    assert result.diagnostics[0].code is SpecificationDiagnosticCode.UNSUPPORTED_OBJECT_TYPE


def test_legacy_identity_is_rejected_and_unassigned_details_use_canonical_key():
    legacy = _assignment(
        result=_result(cable=None, cable_mark="30ТТВ2-СР", nomenclature_code="001-002")
    )
    unassigned = _assignment(assignment_state="unassigned", system_type=None)
    result = evaluate_specification_preflight(
        electrical_variant_id=VARIANT_ID,
        assignments=[legacy, unassigned],
        catalog=_catalog(),
        exclude_unassigned_confirmed=False,
    )

    assert result.status is SpecificationPreflightStatus.BLOCKED
    assert result.contributing_objects == 0
    assert result.diagnostics[0].code is SpecificationDiagnosticCode.CABLE_NOMENCLATURE_MISSING

    confirmed_blocked = evaluate_specification_preflight(
        electrical_variant_id=VARIANT_ID,
        assignments=[legacy, unassigned],
        catalog=_catalog(),
        exclude_unassigned_confirmed=True,
    )
    assert confirmed_blocked.status is SpecificationPreflightStatus.BLOCKED
    assert confirmed_blocked.excluded_unassigned_object_ids == [unassigned.object_id]
    assert confirmed_blocked.diagnostics[0].code is (
        SpecificationDiagnosticCode.CABLE_NOMENCLATURE_MISSING
    )

    confirmation = evaluate_specification_preflight(
        electrical_variant_id=VARIANT_ID,
        assignments=[_assignment(object_id=uuid4()), unassigned],
        catalog=_catalog(),
        exclude_unassigned_confirmed=False,
    )
    assert confirmation.status is SpecificationPreflightStatus.CONFIRMATION_REQUIRED
    assert confirmation.diagnostics[0].details == {
        "unassigned_object_ids": [str(unassigned.object_id)]
    }


@pytest.mark.parametrize(
    "result",
    [
        _result(provenance={}),
        _result(provenance={**_result()["provenance"], "production_eligible": False}),
        _result(provenance={**_result()["provenance"], "mocked_fields": ["temperature"]}),
    ],
)
def test_requires_exactly_production_eligible_and_empty_mocked_fields(result):
    preflight = evaluate_specification_preflight(
        electrical_variant_id=VARIANT_ID,
        assignments=[_assignment(result=result)],
        catalog=_catalog(),
        exclude_unassigned_confirmed=False,
    )
    assert preflight.status is SpecificationPreflightStatus.BLOCKED
    assert preflight.diagnostics[0].code is SpecificationDiagnosticCode.MOCK_INPUTS_NOT_ALLOWED


def test_rejects_revision_mismatch_invalid_object_and_invalid_sections():
    cases = [
        (_assignment(object_is_valid=False), SpecificationDiagnosticCode.VARIANT_NOT_READY),
        (
            _assignment(
                result=_result(provenance={**_result()["provenance"], "assignment_version": 3})
            ),
            SpecificationDiagnosticCode.RESULT_STALE,
        ),
        (
            _assignment(
                result=_result(section_plan={"count": Decimal("2"), "length_m": Decimal("67")})
            ),
            SpecificationDiagnosticCode.SECTION_PLAN_INVALID,
        ),
        (
            _assignment(
                result=_result(section_plan={"count": 3, "length_m": 67.0, "origin": "manual"})
            ),
            SpecificationDiagnosticCode.SECTION_PLAN_INVALID,
        ),
    ]
    for assignment, code in cases:
        result = evaluate_specification_preflight(
            electrical_variant_id=VARIANT_ID,
            assignments=[assignment],
            catalog=_catalog(),
            exclude_unassigned_confirmed=False,
        )
        assert result.status is SpecificationPreflightStatus.BLOCKED
        assert result.diagnostics[0].code is code


def test_missing_calculation_and_heat_revision_drift_are_fail_closed():
    missing = _assignment(
        calculation_id=None,
        calculation_updated_at=None,
        result=None,
    )
    stale_provenance = {
        **_result()["provenance"],
        "heat_snapshot": {"version": 3},
        "heat_result_version": 3,
    }
    stale = _assignment(result=_result(provenance=stale_provenance))

    missing_result = evaluate_specification_preflight(
        electrical_variant_id=VARIANT_ID,
        assignments=[missing],
        catalog=_catalog(),
        exclude_unassigned_confirmed=False,
    )
    stale_result = evaluate_specification_preflight(
        electrical_variant_id=VARIANT_ID,
        assignments=[stale],
        catalog=_catalog(),
        exclude_unassigned_confirmed=False,
    )

    assert missing_result.diagnostics[0].code is SpecificationDiagnosticCode.VARIANT_NOT_READY
    assert missing_result.status is SpecificationPreflightStatus.BLOCKED
    assert missing_result.contributing_objects == 0
    assert stale_result.diagnostics[0].code is SpecificationDiagnosticCode.RESULT_STALE


def test_fingerprint_is_stable_under_row_order_and_changes_with_revision():
    first = _assignment(object_id=uuid4())
    second = _assignment(object_id=uuid4())
    forward = evaluate_specification_preflight(
        electrical_variant_id=VARIANT_ID,
        assignments=[first, second],
        catalog=_catalog(),
        exclude_unassigned_confirmed=False,
    )
    reversed_result = evaluate_specification_preflight(
        electrical_variant_id=VARIANT_ID,
        assignments=[second, first],
        catalog=_catalog(),
        exclude_unassigned_confirmed=False,
    )
    changed_provenance = {
        **first.result["provenance"],
        "assignment_version": 3,
    }
    changed = replace(
        first,
        assignment_version=3,
        result={**first.result, "provenance": changed_provenance},
    )
    changed_result = evaluate_specification_preflight(
        electrical_variant_id=VARIANT_ID,
        assignments=[changed, second],
        catalog=_catalog(),
        exclude_unassigned_confirmed=False,
    )

    assert forward.input_fingerprint == reversed_result.input_fingerprint
    assert forward.input_fingerprint != changed_result.input_fingerprint
