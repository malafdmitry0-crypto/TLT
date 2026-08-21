"""OpenAPI ratchet for UUID-only electrical calculation query routes."""

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.main import app
from app.schemas.calculation import (
    ElectricalCandidateCreateRequest,
    ElectricalCandidateFolderCreateRequest,
    ElectricalQueryRequest,
    ElectricalRequest,
)


def test_legacy_electrical_list_operation_is_absent() -> None:
    operations = app.openapi()["paths"]["/api/v1/calc/electrical"]

    assert "get" not in operations
    assert "post" in operations

    response = TestClient(app).get("/api/v1/calc/electrical")
    assert response.status_code == 405


def test_electrical_query_routes_expose_only_uuid_variant_selector() -> None:
    paths = app.openapi()["paths"]
    operations = (
        paths["/api/v1/calc/electrical/page"]["get"],
        paths["/api/v1/calc/electrical/query-capabilities"]["get"],
        paths["/api/v1/calc/electrical/candidates"]["get"],
        paths["/api/v1/calc/electrical/candidate-folders"]["get"],
        paths["/api/v1/calc/electrical/select-cable"]["post"],
        paths["/api/v1/calc/electrical/batch"]["post"],
    )

    for operation in operations:
        parameters = {parameter["name"]: parameter for parameter in operation["parameters"]}
        assert "variant_number" not in parameters
        assert parameters["electrical_variant_id"]["required"] is True


def test_electrical_body_and_response_schemas_are_uuid_only() -> None:
    components = app.openapi()["components"]["schemas"]
    request_schemas = {
        "ElectricalRequest",
        "ElectricalQueryRequest",
        "ElectricalCandidateCreateRequest",
        "ElectricalCandidateFolderCreateRequest",
    }
    response_schemas = {
        "ElectricalCalcSummary",
        "ElectricalQueryEcho",
        "ElectricalCandidateResponse",
        "ElectricalCandidateFolderResponse",
    }

    for name in request_schemas | response_schemas:
        properties = components[name]["properties"]
        assert "variant_number" not in properties
        assert "electrical_variant_id" in properties
    for name in request_schemas:
        assert "electrical_variant_id" in components[name]["required"]


@pytest.mark.parametrize(
    ("schema", "payload"),
    [
        (
            ElectricalRequest,
            {"object_id": "00000000-0000-0000-0000-000000000001", "cable_type": "mineral", "data": {}},
        ),
        (
            ElectricalQueryRequest,
            {"project_id": "00000000-0000-0000-0000-000000000001"},
        ),
        (
            ElectricalCandidateCreateRequest,
            {
                "project_id": "00000000-0000-0000-0000-000000000001",
                "object_id": "00000000-0000-0000-0000-000000000002",
            },
        ),
        (
            ElectricalCandidateFolderCreateRequest,
            {
                "project_id": "00000000-0000-0000-0000-000000000001",
                "object_id": "00000000-0000-0000-0000-000000000002",
                "name": "folder",
            },
        ),
    ],
)
def test_numeric_only_body_fails_closed(schema: type, payload: dict[str, object]) -> None:
    with pytest.raises(ValidationError):
        schema.model_validate({**payload, "variant_number": 1})
