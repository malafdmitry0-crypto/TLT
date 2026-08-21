"""OpenAPI ratchet for UUID-only electrical calculation query routes."""

from fastapi.testclient import TestClient

from app.main import app


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
