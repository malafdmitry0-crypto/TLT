"""Contract lock для нормализованной backend-спецификации."""

from __future__ import annotations

import json
from decimal import Decimal
from pathlib import Path
from uuid import uuid4

import pytest
from pydantic import TypeAdapter, ValidationError

from app.schemas.specification import (
    SpecificationDiagnostic,
    SpecificationDiagnosticCode,
    SpecificationErrorEnvelope,
    SpecificationGenerationRequest,
    SpecificationGenerationStatus,
    SpecificationGroupingMode,
    SpecificationIssueKind,
    SpecificationPreflightStatus,
    SpecificationReadinessBlocker,
    SpecificationResolvedOptions,
    SpecificationVariantGenerationResult,
    SpecificationVariantPreflightResult,
)
from app.services.specification_generation_service import (
    SpecificationOptionsValidationError,
    _validate_generation_options,
)

GOLDENS_PATH = Path(__file__).parents[2] / "fixtures" / "specification_normalized_goldens.json"


def _canonical_request_data(*variant_ids):
    return {
        "variant_ids": list(variant_ids),
        "options": {
            "catalog_id": "builtin-specification",
            "catalog_version": "2026-08-03",
            "grouping_mode": "separate_by_object_type",
            "Ex": False,
            "K1i": False,
            "K2i": False,
            "Kiu": False,
            "L_K2i_m": "0",
            "R_gr": "1",
        },
    }


class TestCanonicalGenerationRequest:
    def test_requires_explicit_non_empty_variant_scope(self):
        with pytest.raises(ValidationError):
            SpecificationGenerationRequest.model_validate({})
        with pytest.raises(ValidationError):
            SpecificationGenerationRequest.model_validate({"variant_ids": []})

    def test_rejects_duplicate_or_more_than_four_variants(self):
        variant_id = uuid4()
        with pytest.raises(ValidationError, match="must be unique"):
            SpecificationGenerationRequest.model_validate(
                {"variant_ids": [variant_id, variant_id]}
            )
        with pytest.raises(ValidationError):
            SpecificationGenerationRequest.model_validate(
                {"variant_ids": [uuid4() for _ in range(5)]}
            )

    def test_preserves_canonical_option_names_and_decimal_values(self):
        request = SpecificationGenerationRequest.model_validate(_canonical_request_data(uuid4()))
        assert request.options.grouping_mode is SpecificationGroupingMode.SEPARATE_BY_OBJECT_TYPE
        assert request.options.l_k2i_m == Decimal("0")
        assert request.options.r_gr == Decimal("1")
        dumped = request.model_dump(mode="json", by_alias=True)
        assert dumped["options"]["Ex"] is False
        assert dumped["options"]["L_K2i_m"] == "0"
        assert dumped["options"]["R_gr"] == "1"

    def test_empty_form_defaults_binary_options_to_no_only(self):
        request = SpecificationGenerationRequest(variant_ids=[uuid4()])
        assert request.options.ex is False
        assert request.options.k1i is False
        assert request.options.k2i is False
        assert request.options.kiu is False
        assert request.options.grouping_mode is None
        assert request.options.l_k2i_m is None
        assert request.options.r_gr is None
        with pytest.raises(SpecificationOptionsValidationError) as exc_info:
            _validate_generation_options(request.options)
        assert {issue["field"] for issue in exc_info.value.diagnostic.issues} == {
            "grouping_mode",
            "L_K2i_m",
            "R_gr",
        }
        with pytest.raises(ValidationError):
            SpecificationResolvedOptions.model_validate(
                {
                    "catalog_id": "builtin-specification",
                    "catalog_version": "2026-08-03",
                    "grouping_mode": "merge_materials",
                }
            )

    def test_legacy_frontend_field_is_not_part_of_canonical_contract(self):
        variant_id = uuid4()
        with pytest.raises(ValidationError):
            SpecificationGenerationRequest.model_validate(
                {"electrical_variant_ids": [str(variant_id)]}
            )

    def test_catalog_selections_require_immutable_item_uuids(self):
        variant_id = uuid4()
        item_id = uuid4()
        request = SpecificationGenerationRequest.model_validate(
            {
                "variant_ids": [variant_id],
                "catalog_selections": {"connection.low": str(item_id)},
            }
        )
        assert request.catalog_selections == {"connection.low": item_id}
        with pytest.raises(ValidationError):
            SpecificationGenerationRequest.model_validate(
                {
                    "variant_ids": [variant_id],
                    "catalog_selections": {"connection.low": "first-row"},
                }
            )
        with pytest.raises(ValidationError, match="trimmed"):
            SpecificationGenerationRequest.model_validate(
                {
                    "variant_ids": [variant_id],
                    "catalog_selections": {" connection.low ": item_id},
                }
            )


class TestReadinessBlockers:
    def test_global_blocker_rejects_fabricated_er_identity(self):
        with pytest.raises(ValidationError):
            TypeAdapter(SpecificationReadinessBlocker).validate_python(
                {
                    "code": "SPEC_CATALOG_UNAVAILABLE",
                    "kind": "blocking",
                    "message": "Каталог недоступен",
                    "issues": [],
                    "source_stage": "catalog",
                    "scope": "catalog",
                    "electrical_variant_id": str(uuid4()),
                    "reason": "spec_catalog_unavailable",
                    "count": 1,
                    "object_ids": [],
                    "next_action": "contact_catalog_admin",
                }
            )


class TestTypedDiagnostics:
    @pytest.mark.parametrize(
        ("status", "kind", "code"),
        [
            (
                SpecificationPreflightStatus.CONFIRMATION_REQUIRED,
                SpecificationIssueKind.CONFIRMABLE,
                SpecificationDiagnosticCode.UNASSIGNED_CONFIRMATION_REQUIRED,
            ),
            (
                SpecificationPreflightStatus.BLOCKED,
                SpecificationIssueKind.BLOCKING,
                SpecificationDiagnosticCode.ACCESSORY_CATALOG_INCOMPLETE,
            ),
            (
                SpecificationPreflightStatus.SELECTION_REQUIRED,
                SpecificationIssueKind.SELECTION_REQUIRED,
                SpecificationDiagnosticCode.ACCESSORY_SELECTION_REQUIRED,
            ),
        ],
    )
    def test_preflight_distinguishes_issue_classes(self, status, kind, code):
        diagnostic = SpecificationDiagnostic(
            code=code,
            kind=kind,
            message="stable test diagnostic",
        )
        result = SpecificationVariantPreflightResult(
            electrical_variant_id=uuid4(),
            status=status,
            diagnostics=[diagnostic],
        )
        assert result.diagnostics[0].kind is kind

    def test_generation_result_and_error_envelope_are_per_er_and_stable(self):
        variant_id = uuid4()
        result = SpecificationVariantGenerationResult(
            electrical_variant_id=variant_id,
            status=SpecificationGenerationStatus.BLOCKED,
            diagnostics=[
                SpecificationDiagnostic(
                    code=SpecificationDiagnosticCode.BOX_EX_RGR_MATRIX_MISSING,
                    kind=SpecificationIssueKind.BLOCKING,
                    message="matrix missing",
                )
            ],
        )
        assert result.items == []
        assert result.electrical_variant_id == variant_id

        envelope = SpecificationErrorEnvelope.model_validate(
            {
                "detail": {
                    "code": "SPEC_BOX_EX_RGR_MATRIX_MISSING",
                    "message": "matrix missing",
                    "issues": [],
                    "details": {"catalog_kind": "box_matrix"},
                }
            }
        )
        assert envelope.detail.code is SpecificationDiagnosticCode.BOX_EX_RGR_MATRIX_MISSING

    def test_preflight_status_must_match_diagnostic_precedence(self):
        with pytest.raises(ValidationError, match="diagnostic precedence"):
            SpecificationVariantPreflightResult(
                electrical_variant_id=uuid4(),
                status=SpecificationPreflightStatus.READY,
                diagnostics=[
                    SpecificationDiagnostic(
                        code=SpecificationDiagnosticCode.RESULT_STALE,
                        kind=SpecificationIssueKind.BLOCKING,
                        message="stale",
                    )
                ],
            )
        with pytest.raises(ValidationError, match="subset"):
            SpecificationVariantPreflightResult(
                electrical_variant_id=uuid4(),
                status=SpecificationPreflightStatus.READY,
                unassigned_object_ids=[],
                excluded_unassigned_object_ids=[uuid4()],
            )
        with pytest.raises(ValidationError, match="input fingerprint"):
            SpecificationVariantPreflightResult(
                electrical_variant_id=uuid4(),
                status=SpecificationPreflightStatus.READY,
            )


def test_normalized_golden_fixture_is_complete_and_explicitly_non_production():
    payload = json.loads(GOLDENS_PATH.read_text(encoding="utf-8"))
    assert payload["authority"] == "test_fixture_only"
    # Baseline PDF formula sections plus algorithm control-example tags.
    assert {
        "7.9",
        "7.10",
        "7.11",
        "7.12",
        "7.13",
        "7.14",
        "7.15",
        "algorithm-§10",
        "SPEC-DEC-02",
    } <= set(payload["source_sections"])
    case_ids = {case["id"] for case in payload["cases"]}
    assert {
        "SPEC-GOLDEN-CABLE-ACTUAL",
        "SPEC-BE-12",
        "SPEC-BE-13",
        "SPEC-BE-14",
        "SPEC-BE-15",
        "SPEC-BE-16",
        "SPEC-BE-19",
        "SPEC-BE-20-UP",
        "SPEC-BE-20-DOWN",
        "SPEC-BE-21",
        "SPEC-CTRL-CABLE-ORDER",
        "SPEC-CTRL-CABLE-MULTI-MARK",
        "SPEC-CTRL-BOX-PDF-EX1",
        "SPEC-CTRL-BOX-PDF-EX3",
        "SPEC-CTRL-ER-ISOLATION",
        "SPEC-CTRL-FIBER-OBJECT-FORMULA",
    } <= case_ids
    aliases = payload.get("aliases") or {}
    assert aliases.get("SPEC-CTRL-CABLE-FACT") == "SPEC-GOLDEN-CABLE-ACTUAL"
    assert aliases.get("SPEC-CTRL-CONN-KSN2") == "SPEC-BE-12"
    assert payload["production_blockers"] == [
        "sealant.nomenclature_code",
        "fiberglass_tape.nomenclature_code",
        "aluminium_tape.identity",
        "box.condition_Ex",
        "box.condition_R_gr",
    ]
