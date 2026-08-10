"""HTTP acceptance for canonical specification settings and generation."""

from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def test_project_specification_settings_routes_are_removed(
    client: AsyncClient,
    employee_token: str,
) -> None:
    headers = {"Authorization": f"Bearer {employee_token}"}
    project = (
        await client.post(
            "/api/v1/projects",
            json={"name": "Canonical settings API"},
            headers=headers,
        )
    ).json()
    url = f"/api/v1/specifications/{project['id']}/settings"

    assert (await client.get(url, headers=headers)).status_code == 404
    assert (
        await client.put(url, json={"settings": {}}, headers=headers)
    ).status_code == 404


async def test_generate_returns_typed_error_for_unknown_explicit_uuid(
    client: AsyncClient,
    employee_token: str,
) -> None:
    headers = {"Authorization": f"Bearer {employee_token}"}
    project = (
        await client.post(
            "/api/v1/projects",
            json={"name": "Canonical generation API"},
            headers=headers,
        )
    ).json()
    variant_id = uuid.uuid4()

    response = await client.post(
        f"/api/v1/specifications/{project['id']}/generate",
        json={"variant_ids": [str(variant_id)]},
        headers=headers,
    )
    assert response.status_code == 404, response.text
    assert response.json()["detail"] == {
        "code": "SPEC_VARIANT_NOT_FOUND",
        "message": "Один или несколько ЭР не найдены в проекте",
        "issues": [],
        "details": {"missing_variant_ids": [str(variant_id)]},
    }


@pytest.mark.parametrize("payload", [{}, {"variant_ids": []}])
async def test_generate_requires_non_empty_variant_ids_with_stable_envelope(
    client: AsyncClient,
    employee_token: str,
    payload: dict[str, object],
) -> None:
    headers = {"Authorization": f"Bearer {employee_token}"}
    project = (
        await client.post(
            "/api/v1/projects",
            json={"name": "Required variant IDs"},
            headers=headers,
        )
    ).json()

    response = await client.post(
        f"/api/v1/specifications/{project['id']}/generate",
        json=payload,
        headers=headers,
    )

    assert response.status_code == 422, response.text
    detail = response.json()["detail"]
    assert detail["code"] == "SPEC_VARIANT_IDS_REQUIRED"
    assert detail["issues"]
    assert detail["details"] == {}


async def test_generate_distinguishes_duplicate_ids_from_missing_ids(
    client: AsyncClient,
    employee_token: str,
) -> None:
    headers = {"Authorization": f"Bearer {employee_token}"}
    project = (
        await client.post(
            "/api/v1/projects",
            json={"name": "Invalid variant IDs"},
            headers=headers,
        )
    ).json()
    variant_id = str(uuid.uuid4())

    response = await client.post(
        f"/api/v1/specifications/{project['id']}/generate",
        json={"variant_ids": [variant_id, variant_id]},
        headers=headers,
    )

    assert response.status_code == 422, response.text
    detail = response.json()["detail"]
    assert detail["code"] == "SPEC_REQUEST_INVALID"
    assert detail["issues"] == [
        {
            "path": "body.variant_ids",
            "message": "Value error, variant_ids must be unique",
            "type": "value_error",
        }
    ]


async def test_generate_without_active_catalog_is_exact_typed_503(
    client: AsyncClient,
    employee_token: str,
) -> None:
    headers = {"Authorization": f"Bearer {employee_token}"}
    project = (
        await client.post(
            "/api/v1/projects",
            json={"name": "No production BOM catalog"},
            headers=headers,
        )
    ).json()
    created_object = await client.post(
        f"/api/v1/projects/{project['id']}/objects",
        json={
            "object_type": "pipe",
            "params": {
                "outer_diameter": 0.108,
                "wall_thickness": 0.004,
                "pipe_material": "carbon_steel",
                "insulation_layers": [
                    {"thickness": 0.05, "material": "mineral_wool_boards_120"}
                ],
                "insulation_temperature_basis": "outdoor_winter",
                "ambient_temperature": -30,
                "process_temperature": 80,
                "pipe_length": 50,
                "placement": "outdoor",
                "wind_speed": 0.0,
            },
        },
        headers=headers,
    )
    assert created_object.status_code in (200, 201), created_object.text
    initialized = await client.post(
        f"/api/v1/projects/{project['id']}/electrical-variants/initialize",
        headers=headers,
    )
    assert initialized.status_code in (200, 201), initialized.text
    variant_id = initialized.json()["variant"]["id"]

    response = await client.post(
        f"/api/v1/specifications/{project['id']}/generate",
        json={
            "variant_ids": [variant_id],
            "options": {
                "grouping_mode": "separate_by_object_type",
                "Ex": False,
                "K1i": False,
                "K2i": False,
                "Kiu": False,
                "L_K2i_m": "0",
                "R_gr": "0",
            },
        },
        headers=headers,
    )

    assert response.status_code == 503, response.text
    assert response.json()["detail"] == {
        "code": "SPEC_CATALOG_UNAVAILABLE",
        "message": "Нет разрешимой active approved complete версии каталога спецификации",
        "issues": [],
        "details": {},
    }


async def test_generate_rejects_legacy_body_without_accepting_aliases(
    client: AsyncClient,
    employee_token: str,
) -> None:
    headers = {"Authorization": f"Bearer {employee_token}"}
    project = (
        await client.post(
            "/api/v1/projects",
            json={"name": "Reject legacy generation body"},
            headers=headers,
        )
    ).json()
    variant_id = str(uuid.uuid4())

    response = await client.post(
        f"/api/v1/specifications/{project['id']}/generate",
        json={
            "electrical_variant_ids": [variant_id],
            "confirm_partial": True,
        },
        headers=headers,
    )

    assert response.status_code == 422, response.text
    assert response.json()["detail"]["code"] == "SPEC_VARIANT_IDS_REQUIRED"


_PIPE_OBJECT = {
    "object_type": "pipe",
    "params": {
        "outer_diameter": 0.108,
        "wall_thickness": 0.004,
        "pipe_material": "carbon_steel",
        "insulation_layers": [{"thickness": 0.05, "material": "mineral_wool_boards_120"}],
        "insulation_temperature_basis": "outdoor_winter",
        "ambient_temperature": -30,
        "process_temperature": 80,
        "pipe_length": 50,
        "placement": "outdoor",
        "wind_speed": 0.0,
    },
}


async def _project_with_initialized_variant(
    client: AsyncClient,
    headers: dict[str, str],
    name: str,
) -> tuple[dict[str, object], dict[str, object]]:
    project = (
        await client.post("/api/v1/projects", json={"name": name}, headers=headers)
    ).json()
    created_object = await client.post(
        f"/api/v1/projects/{project['id']}/objects",
        json=_PIPE_OBJECT,
        headers=headers,
    )
    assert created_object.status_code in (200, 201), created_object.text
    initialized = await client.post(
        f"/api/v1/projects/{project['id']}/electrical-variants/initialize",
        headers=headers,
    )
    assert initialized.status_code in (200, 201), initialized.text
    return project, initialized.json()["variant"]


async def test_uuid_get_returns_null_when_specification_not_formed(
    client: AsyncClient,
    employee_token: str,
) -> None:
    headers = {"Authorization": f"Bearer {employee_token}"}
    project, variant = await _project_with_initialized_variant(
        client, headers, "UUID GET empty"
    )
    variant_id = variant["id"]

    response = await client.get(
        f"/api/v1/specifications/{project['id']}/variants/{variant_id}",
        headers=headers,
    )
    assert response.status_code == 200, response.text
    assert response.json() is None


async def test_uuid_get_cross_project_variant_is_404_without_leak(
    client: AsyncClient,
    employee_token: str,
) -> None:
    headers = {"Authorization": f"Bearer {employee_token}"}
    project_a, variant = await _project_with_initialized_variant(
        client, headers, "Project A UUID scope"
    )
    project_b = (
        await client.post(
            "/api/v1/projects",
            json={"name": "Project B UUID scope"},
            headers=headers,
        )
    ).json()
    foreign_variant_id = variant["id"]

    response = await client.get(
        f"/api/v1/specifications/{project_b['id']}/variants/{foreign_variant_id}",
        headers=headers,
    )
    assert response.status_code == 404, response.text
    detail = response.json()["detail"]
    # Stable not-found shape; never reveal the foreign ER name or project.
    if isinstance(detail, dict):
        assert detail.get("code") in {
            "ELECTRICAL_VARIANT_NOT_FOUND",
            "SPEC_VARIANT_NOT_FOUND",
        }
        assert "Project A" not in str(detail)
    else:
        assert "Project A" not in str(detail)
    assert project_a["id"] != project_b["id"]


async def test_uuid_manual_put_round_trip_serializes_quantity_as_decimal_string(
    client: AsyncClient,
    employee_token: str,
) -> None:
    headers = {"Authorization": f"Bearer {employee_token}"}
    project, variant = await _project_with_initialized_variant(
        client, headers, "UUID manual PUT"
    )
    variant_id = variant["id"]

    put_response = await client.put(
        f"/api/v1/specifications/{project['id']}/variants/{variant_id}/items",
        json={
            "items": [
                {
                    "category": "extra",
                    "name": "Ручная позиция",
                    "article": "MAN-1",
                    "unit": "шт.",
                    "quantity": "2.50",
                    "source": "manual",
                }
            ]
        },
        headers=headers,
    )
    assert put_response.status_code == 200, put_response.text
    body = put_response.json()
    assert body["electrical_variant_id"] == variant_id
    assert body["items"][0]["quantity"] == "2.5"

    get_response = await client.get(
        f"/api/v1/specifications/{project['id']}/variants/{variant_id}",
        headers=headers,
    )
    assert get_response.status_code == 200, get_response.text
    loaded = get_response.json()
    assert loaded is not None
    assert loaded["electrical_variant_id"] == variant_id
    # items JSONB may still hold the stored dump; quantity is string after mode=json.
    assert loaded["items"][0]["quantity"] in ("2.5", "2.50", 2.5)


async def test_uuid_manual_put_is_employee_only(
    client: AsyncClient,
    guest_session: str,
    employee_token: str,
) -> None:
    headers = {"Authorization": f"Bearer {employee_token}"}
    project, variant = await _project_with_initialized_variant(
        client, headers, "UUID PUT guest forbidden"
    )
    variant_id = variant["id"]

    guest_headers = {"X-Session-Id": guest_session}
    response = await client.put(
        f"/api/v1/specifications/{project['id']}/variants/{variant_id}/items",
        json={
            "items": [
                {
                    "category": "extra",
                    "name": "Guest attempt",
                    "unit": "шт.",
                    "quantity": 1,
                    "source": "manual",
                }
            ]
        },
        headers=guest_headers,
    )
    assert response.status_code in (401, 403), response.text
