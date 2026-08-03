"""Admin HTTP lifecycle for versioned specification catalogs (SPEC-CANON-02)."""

from __future__ import annotations

from uuid import UUID, uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.specification import Specification
from app.tests.specification_catalog_fixtures import complete_specification_catalog_items

pytestmark = pytest.mark.asyncio(loop_scope="session")


def _checksum(suffix: str = "a") -> str:
    return f"sha256:{suffix * 64}"


def _import_body(
    *,
    version: str,
    authority: str = "approved",
    source: str = "owner registry",
    catalog_key: str = "builtin-specification",
    items=None,
) -> dict:
    payload_items = items
    if payload_items is None:
        payload_items = [
            item.model_dump(mode="json") for item in complete_specification_catalog_items()
        ]
    return {
        "catalog_key": catalog_key,
        "version": version,
        "authority": authority,
        "source": source,
        "source_checksum": _checksum("b"),
        "schema_version": 1,
        "items": payload_items,
    }


async def test_catalog_routes_are_admin_only(
    client: AsyncClient,
    guest_session: str,
    employee_token: str,
    admin_token: str,
):
    body = _import_body(version=f"draft-{uuid4()}")
    guest = await client.post(
        "/api/v1/admin/specification-catalogs/import",
        headers={"X-Session-Id": guest_session},
        json=body,
    )
    employee = await client.post(
        "/api/v1/admin/specification-catalogs/import",
        headers={"Authorization": f"Bearer {employee_token}"},
        json=body,
    )
    assert guest.status_code == 403
    assert employee.status_code == 403

    listed = await client.get(
        "/api/v1/admin/specification-catalogs",
        headers={"Authorization": f"Bearer {employee_token}"},
    )
    assert listed.status_code == 403

    admin_list = await client.get(
        "/api/v1/admin/specification-catalogs",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert admin_list.status_code == 200, admin_list.text


async def test_import_creates_immutable_draft_with_validation_issues(
    client: AsyncClient,
    admin_token: str,
):
    headers = {"Authorization": f"Bearer {admin_token}"}
    incomplete_items = [
        item.model_dump(mode="json")
        for item in complete_specification_catalog_items()
        if item.category.value != "sealant"
    ]
    version = f"incomplete-{uuid4()}"
    response = await client.post(
        "/api/v1/admin/specification-catalogs/import",
        headers=headers,
        json=_import_body(version=version, items=incomplete_items),
    )
    assert response.status_code == 201, response.text
    payload = response.json()
    assert payload["status"] == "draft"
    assert payload["is_complete"] is False
    assert payload["authority"] == "approved"
    assert any(
        issue.get("reason") == "sealant_catalog_missing"
        for issue in payload["validation_issues"]
    )

    listed = await client.get(
        "/api/v1/admin/specification-catalogs",
        headers=headers,
        params={"status": "draft", "catalog_key": "builtin-specification"},
    )
    assert listed.status_code == 200
    assert any(item["id"] == payload["id"] for item in listed.json())

    detail = await client.get(
        f"/api/v1/admin/specification-catalogs/{payload['id']}",
        headers=headers,
    )
    assert detail.status_code == 200, detail.text
    body = detail.json()
    assert body["item_count"] == len(incomplete_items)
    assert len(body["items"]) == len(incomplete_items)
    assert body["items"][0]["item_key"]
    assert body["source_checksum"].startswith("sha256:")
    assert body["payload_checksum"].startswith("sha256:")


async def test_provisional_and_incomplete_cannot_activate_as_production(
    client: AsyncClient,
    admin_token: str,
):
    headers = {"Authorization": f"Bearer {admin_token}"}
    provisional = await client.post(
        "/api/v1/admin/specification-catalogs/import",
        headers=headers,
        json=_import_body(
            version=f"provisional-{uuid4()}",
            authority="provisional",
            source="owner registry",
        ),
    )
    assert provisional.status_code == 201, provisional.text
    assert provisional.json()["is_complete"] is True

    provisional_activation = await client.post(
        f"/api/v1/admin/specification-catalogs/{provisional.json()['id']}/activate",
        headers=headers,
    )
    assert provisional_activation.status_code == 422
    assert (
        provisional_activation.json()["detail"]["code"] == "SPEC_CATALOG_VALIDATION_FAILED"
    )

    incomplete = await client.post(
        "/api/v1/admin/specification-catalogs/import",
        headers=headers,
        json=_import_body(
            version=f"static-shape-{uuid4()}",
            authority="approved",
            source="synthetic generated registry",
        ),
    )
    assert incomplete.status_code == 201
    static_activation = await client.post(
        f"/api/v1/admin/specification-catalogs/{incomplete.json()['id']}/activate",
        headers=headers,
    )
    assert static_activation.status_code == 422
    assert static_activation.json()["detail"]["code"] == "SPEC_CATALOG_VALIDATION_FAILED"


async def test_activation_retires_previous_and_stales_specifications(
    client: AsyncClient,
    admin_token: str,
    employee_token: str,
    db_session: AsyncSession,
):
    headers = {"Authorization": f"Bearer {admin_token}"}
    employee_headers = {"Authorization": f"Bearer {employee_token}"}

    first = await client.post(
        "/api/v1/admin/specification-catalogs/import",
        headers=headers,
        json=_import_body(version=f"approved-v1-{uuid4()}"),
    )
    second = await client.post(
        "/api/v1/admin/specification-catalogs/import",
        headers=headers,
        json=_import_body(version=f"approved-v2-{uuid4()}"),
    )
    assert first.status_code == 201 and second.status_code == 201

    project = (
        await client.post(
            "/api/v1/projects",
            json={"name": f"Spec catalog stale {uuid4()}"},
            headers=employee_headers,
        )
    ).json()
    # Activation marks all non-stale specs globally; no ER initialize required.
    spec = Specification(
        project_id=UUID(project["id"]),
        variant_number=1,
        items=[{"name": "old", "quantity": 1}],
        is_stale=False,
    )
    db_session.add(spec)
    await db_session.commit()
    specification_id = spec.id

    first_activation = await client.post(
        f"/api/v1/admin/specification-catalogs/{first.json()['id']}/activate",
        headers=headers,
    )
    assert first_activation.status_code == 200, first_activation.text
    assert first_activation.json()["catalog"]["status"] == "active"
    assert first_activation.json()["stale_specification_count"] >= 1

    second_activation = await client.post(
        f"/api/v1/admin/specification-catalogs/{second.json()['id']}/activate",
        headers=headers,
    )
    assert second_activation.status_code == 200, second_activation.text
    assert second_activation.json()["catalog"]["id"] == second.json()["id"]
    assert second_activation.json()["catalog"]["status"] == "active"

    first_detail = await client.get(
        f"/api/v1/admin/specification-catalogs/{first.json()['id']}",
        headers=headers,
    )
    assert first_detail.status_code == 200
    assert first_detail.json()["status"] == "retired"

    db_session.expire_all()
    refreshed = await db_session.get(Specification, specification_id)
    assert refreshed is not None
    assert refreshed.is_stale is True
    assert refreshed.stale_reason == "specification_catalog_activated"


async def test_activate_nonexistent_and_non_draft_have_stable_codes(
    client: AsyncClient,
    admin_token: str,
):
    headers = {"Authorization": f"Bearer {admin_token}"}
    missing = await client.post(
        f"/api/v1/admin/specification-catalogs/{uuid4()}/activate",
        headers=headers,
    )
    assert missing.status_code == 404
    assert missing.json()["detail"]["code"] == "SPEC_CATALOG_VERSION_NOT_FOUND"

    imported = await client.post(
        "/api/v1/admin/specification-catalogs/import",
        headers=headers,
        json=_import_body(version=f"once-{uuid4()}"),
    )
    assert imported.status_code == 201
    activated = await client.post(
        f"/api/v1/admin/specification-catalogs/{imported.json()['id']}/activate",
        headers=headers,
    )
    assert activated.status_code == 200, activated.text
    again = await client.post(
        f"/api/v1/admin/specification-catalogs/{imported.json()['id']}/activate",
        headers=headers,
    )
    assert again.status_code == 409
    assert again.json()["detail"]["code"] == "SPEC_CATALOG_ACTIVATION_INVALID"


async def test_duplicate_version_import_conflicts(
    client: AsyncClient,
    admin_token: str,
):
    headers = {"Authorization": f"Bearer {admin_token}"}
    version = f"dup-{uuid4()}"
    first = await client.post(
        "/api/v1/admin/specification-catalogs/import",
        headers=headers,
        json=_import_body(version=version),
    )
    second = await client.post(
        "/api/v1/admin/specification-catalogs/import",
        headers=headers,
        json=_import_body(version=version),
    )
    assert first.status_code == 201
    assert second.status_code == 409
    assert second.json()["detail"]["code"] == "SPEC_CATALOG_VERSION_CONFLICT"
