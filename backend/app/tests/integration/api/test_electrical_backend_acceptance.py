"""Backend acceptance goldens for canonical TT batch behavior."""

from typing import Any

import pytest
from httpx import AsyncClient

from app.formulas.electrical.tt_contract import (
    ELECTRICAL_TT_FORMULA_FINGERPRINT,
    ELECTRICAL_TT_FORMULA_VERSION,
)

pytestmark = pytest.mark.asyncio(loop_scope="session")

MINERAL_WOOL = "mineral_wool_boards_120"
STRICT_TT_BATCH_PARAMS: dict[str, Any] = {
    "cable_source": "builtin",
    "cable_type": "self_regulating_tt",
    "supply_voltage": 380,
    "selection_policy": "technical_minimum",
}


def _headers(*, session_id: str | None = None, token: str | None = None) -> dict[str, str]:
    if token is not None:
        return {"Authorization": f"Bearer {token}"}
    assert session_id is not None
    return {"X-Session-Id": session_id}


async def _guest_project(client: AsyncClient, session_id: str) -> dict[str, Any]:
    response = await client.get("/api/v1/projects", headers=_headers(session_id=session_id))
    assert response.status_code == 200, response.text
    return response.json()[0]


async def _employee_project(client: AsyncClient, token: str) -> dict[str, Any]:
    response = await client.post(
        "/api/v1/projects",
        json={"name": "Canonical TT parity"},
        headers=_headers(token=token),
    )
    assert response.status_code == 201, response.text
    return response.json()


async def _add_ready_pipe(
    client: AsyncClient,
    project_id: str,
    headers: dict[str, str],
    *,
    name: str,
    process_temperature: float = 80.0,
) -> dict[str, Any]:
    response = await client.post(
        f"/api/v1/projects/{project_id}/objects",
        headers=headers,
        json={
            "object_type": "pipe",
            "params": {
                "name": name,
                "outer_diameter": 0.108,
                "wall_thickness": 0.004,
                "pipe_material": "carbon_steel",
                "insulation_layers": [{"thickness": 0.05, "material": MINERAL_WOOL}],
                "insulation_temperature_basis": "outdoor_winter",
                "ambient_temperature": -30.0,
                "min_switch_temperature": -30.0,
                "process_temperature": process_temperature,
                "pipe_length": 50.0,
                "placement": "outdoor",
                "wind_speed": 0.0,
            },
        },
    )
    assert response.status_code == 201, response.text
    result = response.json()
    assert result["is_valid"] is True
    return result


async def _set_project_current_limit(
    client: AsyncClient,
    project_id: str,
    headers: dict[str, str],
) -> None:
    response = await client.patch(
        f"/api/v1/projects/{project_id}/electrical-settings",
        headers=headers,
        json={"expected_version": 1, "max_section_start_current_a": "13.065"},
    )
    assert response.status_code == 200, response.text


async def _assign_objects(
    client: AsyncClient,
    project_id: str,
    object_ids: list[str],
    headers: dict[str, str],
) -> None:
    initialized = await client.post(
        f"/api/v1/projects/{project_id}/electrical-variants/initialize",
        headers=headers,
    )
    assert initialized.status_code == 200, initialized.text
    variant = initialized.json()["variant"]
    assignments = await client.get(
        f"/api/v1/projects/{project_id}/electrical-variants/{variant['id']}/assignments",
        headers=headers,
    )
    assert assignments.status_code == 200, assignments.text
    by_object_id = {item["object_id"]: item for item in assignments.json()["items"]}
    response = await client.patch(
        f"/api/v1/projects/{project_id}/electrical-variants/{variant['id']}/assignments",
        headers=headers,
        json={
            "system_type": "self_regulating",
            "items": [
                {
                    "object_id": object_id,
                    "expected_version": by_object_id[object_id]["version"],
                }
                for object_id in object_ids
            ],
        },
    )
    assert response.status_code == 200, response.text


async def _run_strict_tt_batch(
    client: AsyncClient,
    project_id: str,
    headers: dict[str, str],
) -> dict[str, Any]:
    response = await client.post(
        "/api/v1/calc/electrical/batch",
        headers=headers,
        params={"project_id": project_id, **STRICT_TT_BATCH_PARAMS},
    )
    assert response.status_code == 200, response.text
    return response.json()


async def _list_calculations(
    client: AsyncClient,
    project_id: str,
    headers: dict[str, str],
) -> list[dict[str, Any]]:
    response = await client.get(
        "/api/v1/calc/electrical",
        headers=headers,
        params={"project_id": project_id, "variant_number": 1},
    )
    assert response.status_code == 200, response.text
    return response.json()


async def test_ac_be_25_batch_persists_success_and_typed_object_error(
    client: AsyncClient,
    guest_session: str,
) -> None:
    headers = _headers(session_id=guest_session)
    project = await _guest_project(client, guest_session)
    successful = await _add_ready_pipe(
        client,
        project["id"],
        headers,
        name="TT success",
    )
    failed = await _add_ready_pipe(
        client,
        project["id"],
        headers,
        name="TT typed error",
        process_temperature=151.0,
    )
    await _set_project_current_limit(client, project["id"], headers)
    await _assign_objects(client, project["id"], [successful["id"], failed["id"]], headers)

    body = await _run_strict_tt_batch(client, project["id"], headers)

    assert body["calculated"] == 1, body
    assert body["skipped"] == 1
    assert len(body["results"]) == 1
    assert body["results"][0]["object_id"] == successful["id"]
    assert body["results"][0]["results"]["status"] == "ready"
    assert body["results"][0]["results"]["provenance"]["mocked_fields"] == []

    assert len(body["errors"]) == 1
    error = body["errors"][0]
    assert error["object_id"] == failed["id"]
    assert error["code"] == "ELECTRICAL_CABLE_TEMPERATURE_LIMIT_EXCEEDED"
    assert error["error_code"] == error["code"]
    assert error["message"]
    assert error["issues"] == []
    assert error["details"] == {
        "product_temperature_c": 151.0,
        "ambient_temperature_c": -30.0,
        "minimum_supported_ambient_temperature_c": -40.0,
        "maximum_supported_product_temperature_c": 150.0,
        "violations": ["product_above_maximum"],
        "manual_cable_model": None,
    }

    persisted = await _list_calculations(client, project["id"], headers)
    assert {item["object_id"] for item in persisted} == {successful["id"], failed["id"]}
    persisted_by_object = {item["object_id"]: item for item in persisted}
    assert persisted_by_object[successful["id"]]["results"]["status"] == "ready"
    assert persisted_by_object[failed["id"]]["results"]["code"] == error["code"]
    assert persisted_by_object[failed["id"]]["results"]["message"] == error["message"]
    assert persisted_by_object[failed["id"]]["results"]["issues"] == error["issues"]
    assert persisted_by_object[failed["id"]]["results"]["details"] == error["details"]
    failed_result = persisted_by_object[failed["id"]]["results"]
    assert "voltage" not in failed_result
    assert "normalized_voltage_v" not in failed_result
    assert set(failed_result["catalogs"]) == {"power", "section", "bom"}
    assert all("payload" not in item for item in failed_result["catalogs"].values())
    assert all(
        item["version"] and (item["source_checksum"] or item["payload_checksum"])
        for item in failed_result["catalogs"].values()
    )
    assert failed_result["provenance"]["formula_version"] == ELECTRICAL_TT_FORMULA_VERSION
    assert failed_result["provenance"]["formula_fingerprint"] == ELECTRICAL_TT_FORMULA_FINGERPRINT
    assert "normalized_voltage_v" not in failed_result["provenance"]
    assert failed_result["provenance"]["catalogs"] == failed_result["catalogs"]

    repeated_batch = await client.post(
        "/api/v1/calc/electrical/batch",
        headers=headers,
        params={
            "project_id": project["id"],
            "cable_source": "builtin",
            "cable_type": "self_regulating_tt",
            "selection_policy": "technical_minimum",
        },
    )
    assert repeated_batch.status_code == 200, repeated_batch.text
    repeated_ready = next(
        item
        for item in repeated_batch.json()["results"]
        if item["object_id"] == successful["id"]
    )
    assert repeated_ready["results"]["resolved_inputs"]["nominal_voltage_v"] == "380.0"
    assert repeated_ready["results"]["input_sources"]["nominal_voltage_v"] == (
        "assignment_override"
    )

    selected = await client.post(
        "/api/v1/calc/electrical/select-cable",
        headers=headers,
        params={
            "object_id": successful["id"],
            "cable_type": "self_regulating_tt",
            "cable_mark": body["results"][0]["cable_mark"],
        },
    )
    assert selected.status_code == 200, selected.text
    assert selected.json()["cable_mark"] == body["results"][0]["cable_mark"]
    assert selected.json()["results"]["resolved_inputs"]["nominal_voltage_v"] == "380.0"
    assert selected.json()["results"]["input_sources"]["nominal_voltage_v"] == (
        "assignment_override"
    )


@pytest.mark.parametrize("field,value", [("winding_coefficient", 1.2), ("connection_type", "star")])
async def test_batch_query_rejects_retired_tt_inputs_instead_of_ignoring_them(
    client: AsyncClient,
    guest_session: str,
    field: str,
    value: object,
) -> None:
    project = await _guest_project(client, guest_session)

    response = await client.post(
        "/api/v1/calc/electrical/batch",
        headers=_headers(session_id=guest_session),
        params={
            "project_id": project["id"],
            "cable_type": "self_regulating_tt",
            field: value,
        },
    )

    assert response.status_code == 422
    assert response.json()["detail"] == {
        "code": "ELECTRICAL_INPUT_RETIRED",
        "message": "Запрос содержит входы, удалённые из Case 1 TT-контракта",
        "issues": [],
        "details": {"fields": [field]},
    }


async def test_ac_be_28_guest_employee_canonical_tt_parity(
    client: AsyncClient,
    guest_session: str,
    employee_token: str,
) -> None:
    client.cookies.clear()
    guest_headers = _headers(session_id=guest_session)
    employee_headers = _headers(token=employee_token)
    guest_project = await _guest_project(client, guest_session)
    employee_project = await _employee_project(client, employee_token)
    guest_object = await _add_ready_pipe(
        client,
        guest_project["id"],
        guest_headers,
        name="Canonical TT parity",
    )
    employee_object = await _add_ready_pipe(
        client,
        employee_project["id"],
        employee_headers,
        name="Canonical TT parity",
    )
    for project, obj, headers in (
        (guest_project, guest_object, guest_headers),
        (employee_project, employee_object, employee_headers),
    ):
        await _set_project_current_limit(client, project["id"], headers)
        await _assign_objects(client, project["id"], [obj["id"]], headers)

    guest_body = await _run_strict_tt_batch(client, guest_project["id"], guest_headers)
    employee_body = await _run_strict_tt_batch(
        client,
        employee_project["id"],
        employee_headers,
    )
    assert guest_body["calculated"] == employee_body["calculated"] == 1
    assert guest_body["errors"] == employee_body["errors"] == []
    guest_result = guest_body["results"][0]["results"]
    employee_result = employee_body["results"][0]["results"]

    for result in (guest_result, employee_result):
        assert result["provenance"]["mocked_fields"] == []
        assert result["provenance"]["input_sources"]["max_section_start_current_a"] == (
            "project_setting"
        )

    assert guest_result["cable"] == employee_result["cable"]
    assert guest_result["layout"] == employee_result["layout"]
    assert guest_result["section_plan"] == employee_result["section_plan"]
    assert guest_result["electrical"] == employee_result["electrical"]
    assert guest_result["catalogs"] == employee_result["catalogs"]
    assert (
        guest_result["provenance"]["formula_fingerprint"]
        == (employee_result["provenance"]["formula_fingerprint"])
    )
