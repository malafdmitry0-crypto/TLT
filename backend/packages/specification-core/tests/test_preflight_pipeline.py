from dataclasses import replace
from datetime import UTC, datetime
from decimal import Decimal
from uuid import UUID

import pytest
from heatcalc_specification_core.diagnostics import DiagnosticCode, PreflightStatus
from heatcalc_specification_core.immutable_json import canonical_fingerprint
from heatcalc_specification_core.preflight import (
    CatalogIdentity,
    ElectricalResultSnapshot,
    PreflightAssignment,
    PreflightCatalog,
    PreflightCatalogItem,
    prepare_specification,
)

VARIANT_ID = UUID("11111111-1111-4111-8111-111111111111")
OBJECT_ID = UUID("22222222-2222-4222-8222-222222222222")
ASSIGNMENT_ID = UUID("33333333-3333-4333-8333-333333333333")
CALCULATION_ID = UUID("44444444-4444-4444-8444-444444444444")


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
    )
    return replace(result, **changes)  # type: ignore[arg-type]


def _assignment(**changes: object) -> PreflightAssignment:
    row = PreflightAssignment(
        assignment_id=ASSIGNMENT_ID,
        calculation_id=CALCULATION_ID,
        calculation_updated_at=datetime(2026, 8, 3, tzinfo=UTC),
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
    return replace(row, **changes)  # type: ignore[arg-type]


def test_ready_preflight_has_typed_result_and_stable_fingerprint() -> None:
    first = _assignment()
    second = replace(first, object_id=UUID("55555555-5555-4555-8555-555555555555"))

    forward = prepare_specification(
        electrical_variant_id=VARIANT_ID,
        assignments=(first, second),
        catalog=_catalog(),
        exclude_unassigned_confirmed=False,
    )
    reverse = prepare_specification(
        electrical_variant_id=VARIANT_ID,
        assignments=(second, first),
        catalog=_catalog(),
        exclude_unassigned_confirmed=False,
    )

    assert forward.summary.status is PreflightStatus.READY
    assert forward.summary.contributing_objects == 2
    assert forward.result is not None
    assert reverse.result is not None
    assert forward.result.input_fingerprint == reverse.result.input_fingerprint


@pytest.mark.parametrize(
    ("changes", "code"),
    [
        ({"object_type": "pump"}, DiagnosticCode.UNSUPPORTED_OBJECT_TYPE),
        ({"object_is_valid": False}, DiagnosticCode.VARIANT_NOT_READY),
        ({"result": None}, DiagnosticCode.VARIANT_NOT_READY),
        ({"result": _result(upstream_status="stale")}, DiagnosticCode.RESULT_STALE),
        (
            {"result": _result(section_plan_origin="manual")},
            DiagnosticCode.SECTION_PLAN_INVALID,
        ),
    ],
)
def test_upstream_failures_are_blocking(changes: dict[str, object], code: DiagnosticCode) -> None:
    outcome = prepare_specification(
        electrical_variant_id=VARIANT_ID,
        assignments=(_assignment(**changes),),
        catalog=_catalog(),
        exclude_unassigned_confirmed=False,
    )

    assert outcome.summary.status is PreflightStatus.BLOCKED
    assert outcome.result is None
    assert outcome.summary.diagnostics[0].code == code.value


def test_empty_variant_is_blocked_and_unassigned_requires_confirmation() -> None:
    empty = prepare_specification(
        electrical_variant_id=VARIANT_ID,
        assignments=(),
        catalog=_catalog(),
        exclude_unassigned_confirmed=False,
    )
    ready = _assignment()
    unassigned = replace(
        ready,
        object_id=UUID("66666666-6666-4666-8666-666666666666"),
        assignment_state="unassigned",
        system_type=None,
        result=None,
    )
    confirmation = prepare_specification(
        electrical_variant_id=VARIANT_ID,
        assignments=(ready, unassigned),
        catalog=_catalog(),
        exclude_unassigned_confirmed=False,
    )

    assert empty.summary.status is PreflightStatus.BLOCKED
    assert empty.summary.diagnostics[0].code == DiagnosticCode.VARIANT_NOT_READY.value
    assert confirmation.summary.status is PreflightStatus.CONFIRMATION_REQUIRED
    assert confirmation.summary.unassigned_object_ids == (unassigned.object_id,)


def test_canonical_fingerprint_normalizes_decimal_zero_and_rejects_floats() -> None:
    assert canonical_fingerprint({"value": Decimal("-0.0")}) == canonical_fingerprint(
        {"value": Decimal("0")}
    )
    with pytest.raises(ValueError, match="ambiguous float"):
        canonical_fingerprint({"value": 1.0})
