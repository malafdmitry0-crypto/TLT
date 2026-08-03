"""HTTP acceptance for canonical specification settings and generation."""

from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def test_settings_preserve_unset_false_and_zero_without_defaults(
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

    initial = await client.get(url, headers=headers)
    assert initial.status_code == 200, initial.text
    assert initial.json()["version"] == 1
    assert all(value is None for value in initial.json()["settings"].values())

    payload = {
        "settings": {
            "grouping_mode": "separate_by_object_type",
            "Ex": False,
            "K1i": False,
            "K2i": True,
            "Kiu": False,
            "L_K2i_m": "0",
            "R_gr": "1.1",
        }
    }
    updated = await client.put(url, json=payload, headers=headers)
    assert updated.status_code == 200, updated.text
    assert updated.json()["version"] == 2
    assert updated.json()["settings"]["Ex"] is False
    assert updated.json()["settings"]["L_K2i_m"] == "0"

    repeated = await client.put(url, json=payload, headers=headers)
    assert repeated.status_code == 200, repeated.text
    assert repeated.json()["version"] == 2

    legacy = await client.put(
        url,
        json={"settings": {"reserve_coefficient": 1.5, "ex_zone": True}},
        headers=headers,
    )
    assert legacy.status_code == 422


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
        json={"variant_ids": [variant_id]},
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
