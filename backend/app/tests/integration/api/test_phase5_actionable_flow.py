"""A1.2 / A1.3 / A1.4 / A1.7 — Phase 5 actionable integration flow."""

from __future__ import annotations

from uuid import UUID

import pytest
from httpx import AsyncClient
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.electrical_variant import ElectricalVariant
from app.models.specification import Specification

pytestmark = pytest.mark.asyncio(loop_scope="session")

MINERAL_WOOL = "mineral_wool_boards_120"


class TestPhase5ActionableFlow:
    async def _add_pipe(
        self, client: AsyncClient, project_id: str, headers: dict[str, str]
    ) -> dict:
        resp = await client.post(
            f"/api/v1/projects/{project_id}/objects",
            json={
                "object_type": "pipe",
                "params": {
                    "name": "Phase5 actionable pipe",
                    "outer_diameter": 0.108,
                    "pipe_length": 50,
                    "insulation_thickness": 0.05,
                    "insulation_material": MINERAL_WOOL,
                    "insulation_temperature_basis": "outdoor_winter",
                    "ambient_temperature": -30,
                    "process_temperature": 80,
                },
            },
            headers=headers,
        )
        assert resp.status_code in (200, 201), resp.text
        return resp.json()

    async def test_guest_settings_generate_csv_report_and_db_shape(
        self,
        client: AsyncClient,
        guest_session: str,
        db_session: AsyncSession,
    ):
        headers = {"X-Session-Id": guest_session}
        pid = (await client.get("/api/v1/projects", headers=headers)).json()[0]["id"]
        await self._add_pipe(client, pid, headers)

        init = await client.post(
            f"/api/v1/projects/{pid}/electrical-variants/initialize",
            headers=headers,
        )
        assert init.status_code in (200, 201), init.text
        er1 = init.json()["variant"]

        settings = await client.put(
            f"/api/v1/specifications/{pid}/settings",
            json={
                "settings": {
                    "reserve_coefficient": 1.1,
                    "ex_zone": False,
                    "indication_on_boxes": False,
                    "end_section_indication": False,
                    "top_indication": False,
                    "min_length_for_end_indication": 0,
                    "group_by": "object_section",
                    "merge_identical": False,
                }
            },
            headers=headers,
        )
        assert settings.status_code == 200, settings.text
        assert settings.json()["version"] >= 1

        gen = await client.post(
            f"/api/v1/specifications/{pid}/generate",
            params={
                "variant": er1.get("legacy_variant_number") or 1,
                "electrical_variant_id": er1["id"],
            },
            json={
                "mode": "full",
                "electrical_variant_ids": [er1["id"]],
                "confirm_partial": True,
                "options": {"reserve_coefficient": 1.1, "ex_zone": False},
            },
            headers=headers,
        )
        assert gen.status_code == 201, gen.text
        assert gen.json()["mode"] == "full"

        await db_session.commit()  # ensure visibility if needed
        spec_row = (
            await db_session.execute(
                select(Specification).where(
                    Specification.project_id == UUID(pid),
                    Specification.electrical_variant_id == UUID(er1["id"]),
                )
            )
        ).scalar_one()
        assert spec_row.generation_options is not None
        assert "settings_version" in (spec_row.generation_options or {})

        export = await client.get(f"/api/v1/projects/{pid}/export-csv", headers=headers)
        assert export.status_code == 200, export.text
        csv_text = export.content.decode("utf-8-sig")
        assert "schema_version;3" in csv_text
        assert "[SECTION];objects" in csv_text

        preview = await client.get(
            f"/api/v1/reports/{pid}/preview",
            params=[
                ("electrical_variant_id", er1["id"]),
                ("sections", "specification"),
            ],
            headers=headers,
        )
        assert preview.status_code == 200, preview.text
        assert isinstance(preview.json()["html"], str)

        bad_slots = (
            await db_session.execute(
                text(
                    """
                    SELECT COUNT(*) FROM electrical_variants
                    WHERE project_id = CAST(:pid AS uuid)
                      AND legacy_variant_number IS NOT NULL
                      AND (legacy_variant_number < 1 OR legacy_variant_number > 5)
                    """
                ),
                {"pid": pid},
            )
        ).scalar_one()
        assert int(bad_slots) == 0

        active = (
            await db_session.execute(
                select(ElectricalVariant).where(
                    ElectricalVariant.project_id == UUID(pid),
                    ElectricalVariant.is_active.is_(True),
                )
            )
        ).scalars().all()
        assert len(active) == 1

    async def test_guest_import_rejects_manual_bom_rows(
        self,
        client: AsyncClient,
        guest_session: str,
    ):
        """A1.4 / PDL-ER-41: guest cannot import CSV with manual specification items."""
        headers = {"X-Session-Id": guest_session}
        pid = (await client.get("/api/v1/projects", headers=headers)).json()[0]["id"]
        await self._add_pipe(client, pid, headers)
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
                + "project_id;variant_number;electrical_variant_id;items;"
                + "generation_mode;generation_options;is_stale;stale_reason\n"
                + f"{pid};1;;{manual_payload};full;{{}};false;\n"
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
