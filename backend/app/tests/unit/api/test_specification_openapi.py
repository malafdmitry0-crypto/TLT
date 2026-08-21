"""OpenAPI and HTTP aggregation lock for canonical specification generation."""

from uuid import uuid4

from fastapi import status

from app.api.v1.specifications import _generation_http_status
from app.main import app
from app.schemas.specification import (
    SpecificationDiagnostic,
    SpecificationDiagnosticCode,
    SpecificationGenerationResponse,
    SpecificationGenerationStatus,
    SpecificationIssueKind,
    SpecificationVariantGenerationResult,
)


def test_generate_route_exposes_only_canonical_body() -> None:
    operation = app.openapi()["paths"]["/api/v1/specifications/{project_id}/generate"]["post"]
    request_schema = operation["requestBody"]["content"]["application/json"]["schema"]

    assert request_schema["$ref"].endswith("/SpecificationGenerationRequest")
    assert not {"variant", "electrical_variant_id"} & {
        parameter["name"] for parameter in operation["parameters"]
    }

    components = app.openapi()["components"]["schemas"]
    request_properties = components["SpecificationGenerationRequest"]["properties"]
    assert set(request_properties) == {
        "variant_ids",
        "options",
        "exclude_unassigned_confirmed",
        "catalog_selections",
    }
    option_properties = components["SpecificationRequestedOptions-Input"]["properties"]
    assert {"Ex", "K1i", "K2i", "Kiu", "L_K2i_m", "R_gr"} <= set(option_properties)
    assert not {
        "electrical_variant_ids",
        "confirm_partial",
        "reserve_coefficient",
        "ex_zone",
        "connector_kit_sections_per_kit",
    } & (set(request_properties) | set(option_properties))

    # SPEC-CANON-08: dead dual-mode generate body must not re-enter OpenAPI.
    assert "SpecificationGenerateRequest" not in components
    assert "SpecificationPreflightResponse" not in components
    assert "SpecificationPreflightVariantResult" not in components

    responses = operation["responses"]
    assert {"201", "403", "404", "409", "422", "503"} <= set(responses)


def test_generation_http_status_uses_per_er_precedence() -> None:
    def response(*statuses: SpecificationGenerationStatus) -> SpecificationGenerationResponse:
        return SpecificationGenerationResponse(
            project_id=uuid4(),
            settings_version=1,
            results=[
                SpecificationVariantGenerationResult(
                    electrical_variant_id=uuid4(),
                    status=result_status,
                    diagnostics=(
                        [
                            SpecificationDiagnostic(
                                code=SpecificationDiagnosticCode.FORMULA_INPUT_INVALID,
                                kind=SpecificationIssueKind.BLOCKING,
                                message="blocked",
                            )
                        ]
                        if result_status is SpecificationGenerationStatus.BLOCKED
                        else []
                    ),
                )
                for result_status in statuses
            ],
        )

    assert _generation_http_status(response(SpecificationGenerationStatus.GENERATED)) == 201
    assert (
        _generation_http_status(
            response(
                SpecificationGenerationStatus.GENERATED,
                SpecificationGenerationStatus.BLOCKED,
            )
        )
        == status.HTTP_201_CREATED
    )
    assert _generation_http_status(response(SpecificationGenerationStatus.BLOCKED)) == 422
    assert (
        _generation_http_status(
            response(SpecificationGenerationStatus.SELECTION_REQUIRED)
        )
        == status.HTTP_409_CONFLICT
    )


def test_settings_routes_use_incomplete_canonical_options() -> None:
    schema = app.openapi()
    settings_path = schema["paths"]["/api/v1/specifications/{project_id}/settings"]
    update_ref = settings_path["put"]["requestBody"]["content"]["application/json"]["schema"]
    assert update_ref["$ref"].endswith("/SpecificationSettingsUpdateRequest")

    options = schema["components"]["schemas"]["SpecificationRequestedOptions-Input"]
    assert "required" not in options
    assert "default" not in options["properties"]["Ex"]
    assert "default" not in options["properties"]["L_K2i_m"]


def test_uuid_read_and_manual_routes_are_primary_data_plane() -> None:
    schema = app.openapi()
    paths = schema["paths"]
    assert "/api/v1/specifications/{project_id}" not in paths
    assert "/api/v1/specifications/{project_id}/items" not in paths
    uuid_get = paths["/api/v1/specifications/{project_id}/variants/{electrical_variant_id}"]["get"]
    uuid_put = paths[
        "/api/v1/specifications/{project_id}/variants/{electrical_variant_id}/items"
    ]["put"]
    assert "variant" not in {p["name"] for p in uuid_get.get("parameters", [])}
    assert "variant" not in {p["name"] for p in uuid_put.get("parameters", [])}

    result_schema = schema["components"]["schemas"]["SpecificationVariantGenerationResult"]
    assert "candidate_groups" in result_schema["properties"]

    # With field_serializer, OpenAPI may emit Input/Output variants.
    components = schema["components"]["schemas"]
    assert "SpecificationOptions" not in components
    assert "SpecificationGenerateResponse" not in components
    specification = components["SpecificationResponse"]
    specification_properties = specification["properties"]
    assert "electrical_variant_id" in specification.get("required", [])
    assert "snapshot" in specification_properties
    # SPEC-REM-02: last generation status survives F5 via GET.
    assert "generation_status" in specification_properties
    assert "generation_diagnostics" in specification_properties
    assert "generation_candidate_groups" in specification_properties
    assert "generation_at" in specification_properties
    assert not {
        "variant_number",
        "generation_mode",
        "generation_options",
        "is_partial",
        "excluded_groups",
        "skipped_objects",
    } & set(specification_properties)

    item_keys = [key for key in components if key.startswith("SpecificationItem")]
    assert item_keys, "SpecificationItem schema missing from OpenAPI components"
    quantity_seen = False
    for key in item_keys:
        quantity = components[key]["properties"].get("quantity")
        if quantity is None:
            continue
        quantity_seen = True
        # Serialized output is string; input may still accept number/string.
        assert (
            quantity.get("type") == "string"
            or "anyOf" in quantity
            or "oneOf" in quantity
            or quantity.get("type") == "number"
        )
    assert quantity_seen
