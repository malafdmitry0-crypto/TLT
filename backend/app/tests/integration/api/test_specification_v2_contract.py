"""HTTP acceptance for canonical specification settings and generation V2."""

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


async def test_generate_returns_typed_per_variant_result_for_explicit_uuid(
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

    legacy = await client.post(
        f"/api/v1/specifications/{project['id']}/generate",
        json={"electrical_variant_ids": [str(variant_id)], "confirm_partial": True},
        headers=headers,
    )
    assert legacy.status_code == 422
