"""Upgrade/downgrade proof for the four-ER product contract (0047)."""

from __future__ import annotations

import os
import subprocess
import uuid
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

import asyncpg
import pytest

_BACKEND_ROOT = Path(__file__).resolve().parents[4]
_BUSINESS_INVARIANTS = _BACKEND_ROOT.parent / "scripts/db-business-invariants.sql"


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


async def _insert_variant(
    connection: asyncpg.Connection,
    *,
    variant_id: str,
    sort_order: int,
    legacy_variant_number: int | None,
) -> None:
    await connection.execute(
        """
        INSERT INTO electrical_variants (
            id, project_id, name, name_normalized, sort_order,
            is_active, legacy_variant_number
        ) VALUES (
            $1, '00000000-0000-0000-0000-000000004710', $2, $3, $4,
            $5, $6
        )
        """,
        uuid.UUID(variant_id),
        f"ER {sort_order + 1}",
        f"er {sort_order + 1}",
        sort_order,
        sort_order == 0,
        legacy_variant_number,
    )


@pytest.mark.asyncio(loop_scope="session")
async def test_0047_refuses_er5_data_and_enforces_four_variants() -> None:
    database_name = f"electrical_limit_0047_{uuid.uuid4().hex}"
    admin_url, database_url = _database_urls(database_name)
    admin = await asyncpg.connect(admin_url)
    try:
        await admin.execute(f'CREATE DATABASE "{database_name}"')
        upgraded_0046 = _alembic(database_url, "upgrade", "0046")
        assert upgraded_0046.returncode == 0, upgraded_0046.stdout + upgraded_0046.stderr

        connection = await asyncpg.connect(database_url)
        try:
            await connection.execute(
                """
                INSERT INTO guest_sessions (id, session_id)
                VALUES ('00000000-0000-0000-0000-000000004701', 'limit-0047');

                INSERT INTO projects (
                    id, name, session_id, electrical_initialized_at
                ) VALUES (
                    '00000000-0000-0000-0000-000000004710',
                    'Four ER migration proof', 'limit-0047', now()
                );
                """
            )
            for index in range(5):
                await _insert_variant(
                    connection,
                    variant_id=f"00000000-0000-0000-0000-{4720 + index:012d}",
                    sort_order=index,
                    legacy_variant_number=index + 1,
                )
        finally:
            await connection.close()

        refused = _alembic(database_url, "upgrade", "0047")
        assert refused.returncode != 0
        output = refused.stdout + refused.stderr
        assert "rows outside the four-ER product contract" in output
        assert "projects_over_limit=1" in output
        assert "electrical_variants=1" in output

        connection = await asyncpg.connect(database_url)
        try:
            await connection.execute(
                "DELETE FROM electrical_variants "
                "WHERE id = '00000000-0000-0000-0000-000000004724'"
            )
        finally:
            await connection.close()

        upgraded_0047 = _alembic(database_url, "upgrade", "0047")
        assert upgraded_0047.returncode == 0, upgraded_0047.stdout + upgraded_0047.stderr

        connection = await asyncpg.connect(database_url)
        try:
            with pytest.raises(asyncpg.CheckViolationError):
                await _insert_variant(
                    connection,
                    variant_id="00000000-0000-0000-0000-000000004725",
                    sort_order=4,
                    legacy_variant_number=None,
                )

            with pytest.raises(asyncpg.CheckViolationError):
                await connection.execute(
                    """
                    INSERT INTO background_tasks (
                        id, type, status, project_id, session_id,
                        electrical_variant_id, request_payload, progress_current,
                        cancel_requested, attempts, enqueue_attempts
                    ) VALUES (
                        '00000000-0000-0000-0000-000000004731',
                        'electrical_batch', 'queued',
                        '00000000-0000-0000-0000-000000004710', 'limit-0047',
                        '00000000-0000-0000-0000-000000004723',
                        '{"payload_version":2,"variant_number":5}'::jsonb,
                        0, false, 0, 0
                    )
                    """
                )

            await connection.execute(_BUSINESS_INVARIANTS.read_text(encoding="utf-8"))
        finally:
            await connection.close()

        downgraded = _alembic(database_url, "downgrade", "0046")
        assert downgraded.returncode == 0, downgraded.stdout + downgraded.stderr
        connection = await asyncpg.connect(database_url)
        try:
            await _insert_variant(
                connection,
                variant_id="00000000-0000-0000-0000-000000004725",
                sort_order=4,
                legacy_variant_number=5,
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
