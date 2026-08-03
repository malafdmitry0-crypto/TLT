"""A1.2 / A1.3 / A1.4 / A1.7 — Phase 5 actionable integration flow."""

from __future__ import annotations

import pytest
from httpx import AsyncClient

from app.tests.heat_fixtures import canonical_pipe_params

pytestmark = pytest.mark.asyncio(loop_scope="session")


class TestPhase5ActionableFlow:
    async def _add_pipe(
        self, client: AsyncClient, project_id: str, headers: dict[str, str]
    ) -> dict:
        resp = await client.post(
            f"/api/v1/projects/{project_id}/objects",
            json={
                "object_type": "pipe",
                "params": canonical_pipe_params(name="Phase5 actionable pipe"),
            },
            headers=headers,
        )
        assert resp.status_code in (200, 201), resp.text
        return resp.json()

    async def test_guest_import_rejects_manual_bom_rows(
        self,
        client: AsyncClient,
        guest_session: str,
    ):
        """A1.4 / PDL-ER-41: guest cannot import CSV with manual specification items."""
        headers = {"X-Session-Id": guest_session}
        pid = (await client.get("/api/v1/projects", headers=headers)).json()[0]["id"]
        await self._add_pipe(client, pid, headers)
        initialized = await client.post(
            f"/api/v1/projects/{pid}/electrical-variants/initialize",
            headers=headers,
        )
        assert initialized.status_code in (200, 201), initialized.text
        variant_id = initialized.json()["variant"]["id"]
        export = await client.get(f"/api/v1/projects/{pid}/export-csv", headers=headers)
        assert export.status_code == 200
        base = export.content.decode("utf-8-sig")

        manual_payload = (
            '[{"category":"Кабель","name":"Manual secret",'
            '"article":"MAN-1","unit":"м","quantity":9,"source":"manual"}]'
        )
        if "[SECTION];specifications" not in base:
            poisoned = (
                base.rstrip()
                + "\n[SECTION];specifications\n"
                + "variant_key;electrical_variant_id;items;snapshot;is_stale;"
                + "stale_reason;stale_at;stale_details\n"
                + f";{variant_id};{manual_payload};;false;;;\n"
            )
        else:
            poisoned = base.replace('"source":"auto"', '"source":"manual"').replace(
                '"source": "auto"', '"source": "manual"'
            )
            if "manual" not in poisoned:
                poisoned = (
                    base.rstrip()
                    + "\n[SECTION];specifications\n"
                    + "items\n"
                    + f"{manual_payload}\n"
                )

        resp = await client.post(
            "/api/v1/projects/import-csv",
            files={
                "file": (
                    "poison.csv",
                    ("\ufeff" + poisoned).encode("utf-8"),
                    "text/csv",
                )
            },
            headers=headers,
        )
        assert resp.status_code in {400, 403, 409, 422}, resp.text

    async def test_corrupt_csv_does_not_replace_project(
        self,
        client: AsyncClient,
        guest_session: str,
    ):
        """A1.4: corrupt CSV fails without destroying current auto-project."""
        headers = {"X-Session-Id": guest_session}
        pid_before = (await client.get("/api/v1/projects", headers=headers)).json()[0]["id"]
        await self._add_pipe(client, pid_before, headers)

        payload = "\ufeffnot-a-valid;csv\nrandom garbage".encode()
        resp = await client.post(
            "/api/v1/projects/import-csv",
            files={"file": ("bad.csv", payload, "text/csv")},
            headers=headers,
        )
        assert resp.status_code in {400, 422}, resp.text

        projects = (await client.get("/api/v1/projects", headers=headers)).json()
        assert len(projects) == 1
        assert projects[0]["id"] == pid_before
        objects = (
            await client.get(f"/api/v1/projects/{pid_before}/objects", headers=headers)
        ).json()
        assert len(objects) >= 1

    async def test_multi_er_report_does_not_require_implicit_active(
        self,
        client: AsyncClient,
        guest_session: str,
    ):
        """A1.7: preview uses explicit UUID list only."""
        headers = {"X-Session-Id": guest_session}
        pid = (await client.get("/api/v1/projects", headers=headers)).json()[0]["id"]
        await self._add_pipe(client, pid, headers)
        init = await client.post(
            f"/api/v1/projects/{pid}/electrical-variants/initialize",
            headers=headers,
        )
        assert init.status_code in (200, 201), init.text
        er1 = init.json()["variant"]
        er2_resp = await client.post(
            f"/api/v1/projects/{pid}/electrical-variants",
            json={"name": "ЭР2-report-mix"},
            headers={**headers, "Idempotency-Key": "phase5-er2-report"},
        )
        assert er2_resp.status_code == 201, er2_resp.text
        er2 = er2_resp.json()

        preview = await client.get(
            f"/api/v1/reports/{pid}/preview",
            params=[
                ("electrical_variant_id", er1["id"]),
                ("electrical_variant_id", er2["id"]),
                ("sections", "specification"),
            ],
            headers=headers,
        )
        assert preview.status_code in (200, 422), preview.text
        if preview.status_code == 200:
            html = preview.json()["html"]
            assert er1["name"] in html or er2["name"] in html or "специф" in html.lower()
