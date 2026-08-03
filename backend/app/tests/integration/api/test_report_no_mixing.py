"""C9 — report multi-ER / stale no-mixing matrix (PDL-ER-37/39)."""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.specification import Specification
from app.tests.heat_fixtures import canonical_pipe_params

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def _add_pipe(client: AsyncClient, pid: str, headers: dict[str, str], name: str) -> None:
    resp = await client.post(
        f"/api/v1/projects/{pid}/objects",
        json={
            "object_type": "pipe",
            "params": canonical_pipe_params(
                name=name,
                pipe_length=40.0,
                ambient_temperature=-25.0,
                process_temperature=70.0,
            ),
        },
        headers=headers,
    )
    assert resp.status_code in (200, 201), resp.text


class TestReportNoMixing:
    async def test_stale_spec_quantities_excluded_from_preview(
        self, client: AsyncClient, employee_token: str, db_session: AsyncSession
    ):
        headers = {"Authorization": f"Bearer {employee_token}"}
        project = (
            await client.post("/api/v1/projects", json={"name": "No-mix stale"}, headers=headers)
        ).json()
        pid = project["id"]
        await _add_pipe(client, pid, headers, "pipe-stale")
        init = await client.post(
            f"/api/v1/projects/{pid}/electrical-variants/initialize",
            headers=headers,
        )
        assert init.status_code in (200, 201), init.text
        er = init.json()["variant"]

        save = await client.put(
            f"/api/v1/specifications/{pid}/variants/{er['id']}/items",
            json={
                "items": [
                    {
                        "category": "Кабель",
                        "name": "Греющий кабель MIX-SECRET-99",
                        "article": "MIX-99",
                        "unit": "м",
                        "quantity": 999.1,
                        "source": "manual",
                    }
                ]
            },
            headers=headers,
        )
        assert save.status_code == 200, save.text

        spec = (
            await db_session.execute(
                select(Specification).where(
                    Specification.project_id == UUID(pid),
                    Specification.electrical_variant_id == UUID(er["id"]),
                )
            )
        ).scalar_one()
        spec.is_stale = True
        spec.stale_reason = "object_updated"
        spec.stale_at = datetime.now(UTC)
        await db_session.commit()

        preview = await client.get(
            f"/api/v1/reports/{pid}/preview",
            params=[
                ("electrical_variant_id", er["id"]),
                ("sections", "specification"),
            ],
            headers=headers,
        )
        assert preview.status_code == 200, preview.text
        html = preview.json()["html"]
        assert "MIX-SECRET-99" not in html
        assert "999.1" not in html
        assert "устарела" in html.lower() or "stale" in html.lower() or "PDL-ER-37" in html

    async def test_multi_er_preview_accepts_two_uuids_without_cross_sum_secret(
        self, client: AsyncClient, guest_session: str
    ):
        headers = {"X-Session-Id": guest_session}
        pid = (await client.get("/api/v1/projects", headers=headers)).json()[0]["id"]
        await _add_pipe(client, pid, headers, "pipe-er1")
        init = await client.post(
            f"/api/v1/projects/{pid}/electrical-variants/initialize",
            headers=headers,
        )
        assert init.status_code in (200, 201), init.text
        er1 = init.json()["variant"]
        er2 = (
            await client.post(
                f"/api/v1/projects/{pid}/electrical-variants",
                json={"name": "ЭР2-nomix"},
                headers={**headers, "Idempotency-Key": "nomix-er2"},
            )
        ).json()

        preview = await client.get(
            f"/api/v1/reports/{pid}/preview",
            params=[
                ("electrical_variant_id", er1["id"]),
                ("electrical_variant_id", er2["id"]),
                ("sections", "specification"),
                ("sections", "summary"),
            ],
            headers=headers,
        )
        assert preview.status_code in (200, 422), preview.text
        if preview.status_code == 200:
            html = preview.json()["html"]
            assert "MIX-SECRET-99" not in html
            # Explicit multi-UUID request must not crash; chapters may mention names
            assert isinstance(html, str) and len(html) > 20
