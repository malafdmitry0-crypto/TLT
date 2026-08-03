"""OpenAPI lock for the only active specification generation contract."""

from app.main import app


def test_generate_route_exposes_only_canonical_v2_body() -> None:
    operation = app.openapi()["paths"]["/api/v1/specifications/{project_id}/generate"]["post"]
    request_schema = operation["requestBody"]["content"]["application/json"]["schema"]

    assert request_schema["$ref"].endswith("/SpecificationGenerationRequestV2")
    assert not {"variant", "electrical_variant_id"} & {
        parameter["name"] for parameter in operation["parameters"]
    }

    components = app.openapi()["components"]["schemas"]
    request_properties = components["SpecificationGenerationRequestV2"]["properties"]
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


def test_settings_routes_use_incomplete_canonical_options() -> None:
    schema = app.openapi()
    settings_path = schema["paths"]["/api/v1/specifications/{project_id}/settings"]
    update_ref = settings_path["put"]["requestBody"]["content"]["application/json"]["schema"]
    assert update_ref["$ref"].endswith("/SpecificationSettingsUpdateRequest")

    options = schema["components"]["schemas"]["SpecificationRequestedOptions-Input"]
    assert "required" not in options
    assert "default" not in options["properties"]["Ex"]
    assert "default" not in options["properties"]["L_K2i_m"]
