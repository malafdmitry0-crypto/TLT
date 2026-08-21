"""PostgreSQL proof for append-only electrical calculation revisions."""

from __future__ import annotations

import os
import subprocess
import uuid
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

import asyncpg
import pytest

_BACKEND_ROOT = Path(__file__).resolve().parents[4]


def _database_urls(database_name: str) -> tuple[str, str]:
    configured = os.getenv(
        "TEST_DATABASE_URL",
        "postgresql+asyncpg://test:test@localhost:5433/heatcalc_test",
    )
    parsed = urlsplit(configured.replace("postgresql+asyncpg://", "postgresql://", 1))
    admin_url = urlunsplit(parsed._replace(path="/postgres", query="", fragment=""))
    database_url = urlunsplit(parsed._replace(path=f"/{database_name}", query="", fragment=""))
    return admin_url, database_url


def _alembic(database_url: str, command: str, revision: str) -> subprocess.CompletedProcess[str]:
    env = os.environ.copy()
    env["DATABASE_URL"] = database_url.replace("postgresql://", "postgresql+asyncpg://", 1)
    return subprocess.run(
        ["alembic", command, revision],
        cwd=_BACKEND_ROOT,
        env=env,
        check=False,
        capture_output=True,
        text=True,
    )


@pytest.mark.asyncio(loop_scope="session")
async def test_0035_backfill_capture_chain_immutability_and_downgrade():
    database_name = f"electrical_revisions_0035_{uuid.uuid4().hex}"
    admin_url, database_url = _database_urls(database_name)
    admin = await asyncpg.connect(admin_url)
    try:
        await admin.execute(f'CREATE DATABASE "{database_name}"')
        upgraded_0034 = _alembic(database_url, "upgrade", "0034")
        assert upgraded_0034.returncode == 0, upgraded_0034.stdout + upgraded_0034.stderr

        connection = await asyncpg.connect(database_url)
        try:
            await connection.execute(
                """
                INSERT INTO guest_sessions (id, session_id)
                VALUES ('00000000-0000-0000-0000-000000003501', 'revision-test-session');

                INSERT INTO projects (id, name, session_id)
                VALUES (
                    '00000000-0000-0000-0000-000000003502',
                    'Revision migration proof',
                    'revision-test-session'
                );

                INSERT INTO project_objects (
                    id, project_id, object_type, params, results, is_valid, version
                ) VALUES (
                    '00000000-0000-0000-0000-000000003503',
                    '00000000-0000-0000-0000-000000003502',
                    'pipe', '{}'::jsonb, '{}'::jsonb, true, 1
                );

                INSERT INTO electrical_calculations (
                    id, project_id, object_id, variant_number, electrical_variant_id,
                    cable_type, cable_type_source, cable_mark, cable_mark_source,
                    cable_snapshot, params, results
                ) VALUES (
                    '00000000-0000-0000-0000-000000003504',
                    '00000000-0000-0000-0000-000000003502',
                    '00000000-0000-0000-0000-000000003503',
                    1, NULL, 'self_regulating_tt', 'auto', '30ТТВ2-СР', 'auto',
                    '{"model":"30ТТВ2"}'::jsonb,
                    '{}'::jsonb,
                    '{"status":"ready","selected_cable":"30ТТВ2"}'::jsonb
                );
                """
            )
        finally:
            await connection.close()

        upgraded_0035 = _alembic(database_url, "upgrade", "0035")
        assert upgraded_0035.returncode == 0, upgraded_0035.stdout + upgraded_0035.stderr

        connection = await asyncpg.connect(database_url)
        try:
            first = await connection.fetchrow(
                """
                SELECT id, revision_number, supersedes_result_id, status
                FROM electrical_calculation_revisions
                WHERE electrical_calculation_id =
                    '00000000-0000-0000-0000-000000003504'
                """
            )
            assert first is not None
            assert (first["revision_number"], first["supersedes_result_id"], first["status"]) == (
                1,
                None,
                "success",
            )

            await connection.execute(
                """
                UPDATE electrical_calculations
                SET results = '{
                    "error_code":"ELECTRICAL_CABLE_POWER_INSUFFICIENT",
                    "category":"formula"
                }'::jsonb,
                    updated_at = now()
                WHERE id = '00000000-0000-0000-0000-000000003504'
                """
            )
            await connection.execute(
                """
                UPDATE electrical_calculations
                SET results = '{"stale":true,"category":"stale"}'::jsonb,
                    updated_at = now()
                WHERE id = '00000000-0000-0000-0000-000000003504'
                """
            )
            chain = await connection.fetch(
                """
                SELECT id, revision_number, supersedes_result_id, status
                FROM electrical_calculation_revisions
                WHERE electrical_calculation_id =
                    '00000000-0000-0000-0000-000000003504'
                ORDER BY revision_number
                """
            )
            assert [row["status"] for row in chain] == ["success", "error", "stale"]
            assert [row["revision_number"] for row in chain] == [1, 2, 3]
            assert chain[1]["supersedes_result_id"] == chain[0]["id"]
            assert chain[2]["supersedes_result_id"] == chain[1]["id"]

            with pytest.raises(asyncpg.RaiseError):
                await connection.execute(
                    """
                    UPDATE electrical_calculation_revisions
                    SET status = 'success'
                    WHERE id = $1
                    """,
                    chain[0]["id"],
                )
        finally:
            await connection.close()

        downgraded = _alembic(database_url, "downgrade", "0034")
        assert downgraded.returncode == 0, downgraded.stdout + downgraded.stderr
        connection = await asyncpg.connect(database_url)
        try:
            assert not await connection.fetchval(
                "SELECT to_regclass('public.electrical_calculation_revisions') IS NOT NULL"
            )
        finally:
            await connection.close()

        reupgraded = _alembic(database_url, "upgrade", "0035")
        assert reupgraded.returncode == 0, reupgraded.stdout + reupgraded.stderr
        connection = await asyncpg.connect(database_url)
        try:
            assert await connection.fetchval(
                """
                SELECT status = 'stale' AND revision_number = 1
                FROM electrical_calculation_revisions
                WHERE electrical_calculation_id =
                    '00000000-0000-0000-0000-000000003504'
                """
            )
        finally:
            await connection.close()
    finally:
        await admin.execute(
            "SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
            "WHERE datname = $1 AND pid <> pg_backend_pid()",
            database_name,
        )
        await admin.execute(f'DROP DATABASE IF EXISTS "{database_name}"')
        await admin.close()
