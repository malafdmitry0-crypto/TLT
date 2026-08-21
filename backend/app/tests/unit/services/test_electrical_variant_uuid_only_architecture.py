"""Architecture ratchet for the UUID-only electrical variant lifecycle."""

import inspect

from app.api.v1 import calculations
from app.schemas import calculation, electrical_history
from app.schemas.electrical_variant import ElectricalVariantResponse
from app.services import electrical_query_service
from app.services.calculation import (
    electrical_batch,
    electrical_candidate_apply,
    electrical_candidate_folders,
    electrical_candidate_scope,
    electrical_candidates,
    electrical_single,
)
from app.services.electrical_variant_service import ElectricalVariantService


def test_service_has_no_numeric_selector_bridge() -> None:
    retired = {
        "prepare_legacy_variant_for_write",
        "prepare_legacy_variants_for_write",
        "validate_legacy_variant_for_read",
        "_prepare_legacy_variants_for_write",
        "_validate_expected_legacy_variant",
        "_legacy_adapter_name",
        "_next_legacy_variant_number",
        "_bind_unmapped_legacy_rows",
        "_require_no_unmapped_legacy_rows",
    }

    assert retired.isdisjoint(vars(ElectricalVariantService))


def test_new_variant_writes_leave_transitional_numeric_column_null() -> None:
    source = inspect.getsource(ElectricalVariantService)

    assert "legacy_variant_number=1" not in source
    assert "variant_number=legacy_number" not in source
    assert "legacy_variant_number=" not in source
    assert source.count("\n                variant_number=None") == 3


def test_calculation_boundary_has_no_numeric_binding_bridge() -> None:
    api_source = inspect.getsource(calculations)
    schema_source = inspect.getsource(calculation)

    assert "_require_uuid_variant_number" not in api_source
    assert "bind_persistence_variant_number" not in api_source
    assert "bind_persistence_variant_number" not in schema_source
    assert "PrivateAttr" not in schema_source


def test_execution_paths_do_not_require_numeric_variant_identity() -> None:
    sources = "\n".join(
        inspect.getsource(module)
        for module in (
            electrical_single,
            electrical_batch,
            electrical_candidate_apply,
            electrical_candidate_scope,
        )
    )

    assert "ELECTRICAL_VARIANT_LEGACY_SLOT_REQUIRED" not in sources
    assert "ElectricalVariant.legacy_variant_number ==" not in sources
    assert "require_clean" not in sources


def test_history_public_contract_is_uuid_only() -> None:
    fields = electrical_history.ElectricalCalculationRevisionResponse.model_fields

    assert "variant_number" not in fields
    assert fields["electrical_variant_id"].is_required()


def test_candidate_and_folder_boundaries_use_uuid_as_the_only_scope() -> None:
    sources = "\n".join(
        inspect.getsource(module)
        for module in (
            electrical_candidates,
            electrical_candidate_folders,
            electrical_candidate_scope,
        )
    )

    assert '"variant_number":' not in sources
    assert "ElectricalCandidate.variant_number ==" not in sources
    assert "ElectricalCandidateFolder.variant_number ==" not in sources
    assert "candidate.variant_number != folder.variant_number" not in sources


def test_query_and_variant_response_do_not_publish_numeric_identity() -> None:
    query_source = inspect.getsource(electrical_query_service)

    assert "variant_number" not in query_source
    assert "legacy_variant_number" not in ElectricalVariantResponse.model_fields
