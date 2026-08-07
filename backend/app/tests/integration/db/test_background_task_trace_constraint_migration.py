"""Upgrade/downgrade proof for strict background-task ER tracing (0046)."""

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


async def _insert_task(
    connection: asyncpg.Connection,
    *,
    task_id: str,
    electrical_variant_id: str | None,
    request_payload: str,
) -> None:
    await connection.execute(
        """
        INSERT INTO background_tasks (
            id, type, status, project_id, session_id, electrical_variant_id,
            request_payload, progress_current, cancel_requested, attempts,
            enqueue_attempts
        ) VALUES (
            $1, 'electrical_batch', 'queued',
            '00000000-0000-0000-0000-000000004610', 'trace-0046', $2,
            $3::jsonb, 0, false, 0, 0
        )
        """,
        uuid.UUID(task_id),
        uuid.UUID(electrical_variant_id) if electrical_variant_id is not None else None,
        request_payload,
    )


@pytest.mark.asyncio(loop_scope="session")
async def test_0046_rejects_dirty_upgrade_and_enforces_strict_trace() -> None:
    database_name = f"background_trace_0046_{uuid.uuid4().hex}"
    admin_url, database_url = _database_urls(database_name)
    admin = await asyncpg.connect(admin_url)
    try:
        await admin.execute(f'CREATE DATABASE "{database_name}"')
        upgraded_0045 = _alembic(database_url, "upgrade", "0045")
        assert upgraded_0045.returncode == 0, upgraded_0045.stdout + upgraded_0045.stderr

        connection = await asyncpg.connect(database_url)
        try:
            await connection.execute(
                """
                INSERT INTO guest_sessions (id, session_id)
                VALUES ('00000000-0000-0000-0000-000000004601', 'trace-0046');

                INSERT INTO projects (
                    id, name, session_id, electrical_initialized_at
                ) VALUES (
                    '00000000-0000-0000-0000-000000004610',
                    'Background trace migration proof', 'trace-0046', now()
                );

                INSERT INTO electrical_variants (
                    id, project_id, name, name_normalized, sort_order,
                    is_active, legacy_variant_number
                ) VALUES (
                    '00000000-0000-0000-0000-000000004620',
                    '00000000-0000-0000-0000-000000004610',
                    'ER', 'er', 0, true, 1
                );
                """
            )
            await _insert_task(
                connection,
                task_id="00000000-0000-0000-0000-000000004631",
                electrical_variant_id=None,
                request_payload='{"payload_version":2,"variant_number":1}',
            )
        finally:
            await connection.close()

        refused = _alembic(database_url, "upgrade", "0046")
        assert refused.returncode != 0
        assert "1 electrical/report task row(s) violate the UUID trace contract" in (
            refused.stdout + refused.stderr
        )

        connection = await asyncpg.connect(database_url)
        try:
            await connection.execute(
                "DELETE FROM background_tasks "
                "WHERE id = '00000000-0000-0000-0000-000000004631'"
            )
        finally:
            await connection.close()

        upgraded_0046 = _alembic(database_url, "upgrade", "0046")
        assert upgraded_0046.returncode == 0, upgraded_0046.stdout + upgraded_0046.stderr

        connection = await asyncpg.connect(database_url)
        try:
            with pytest.raises(asyncpg.CheckViolationError):
                await _insert_task(
                    connection,
                    task_id="00000000-0000-0000-0000-000000004632",
                    electrical_variant_id=None,
                    request_payload='{"payload_version":2,"variant_number":1}',
                )

            with pytest.raises(asyncpg.CheckViolationError):
                await _insert_task(
                    connection,
                    task_id="00000000-0000-0000-0000-000000004633",
                    electrical_variant_id="00000000-0000-0000-0000-000000004620",
                    request_payload=(
                        '{"payload_version":3,'
                        '"project_id":"00000000-0000-0000-0000-000000004610",'
                        '"electrical_variant_id":"00000000-0000-0000-0000-000000004699"}'
                    ),
                )

            await _insert_task(
                connection,
                task_id="00000000-0000-0000-0000-000000004634",
                electrical_variant_id="00000000-0000-0000-0000-000000004620",
                request_payload='{"payload_version":2,"variant_number":1}',
            )
            await _insert_task(
                connection,
                task_id="00000000-0000-0000-0000-000000004635",
                electrical_variant_id="00000000-0000-0000-0000-000000004620",
                request_payload=(
                    '{"payload_version":3,'
                    '"project_id":"00000000-0000-0000-0000-000000004610",'
                    '"electrical_variant_id":"00000000-0000-0000-0000-000000004620"}'
                ),
            )
            await connection.execute(_BUSINESS_INVARIANTS.read_text(encoding="utf-8"))
        finally:
            await connection.close()

        downgraded = _alembic(database_url, "downgrade", "0045")
        assert downgraded.returncode == 0, downgraded.stdout + downgraded.stderr
        connection = await asyncpg.connect(database_url)
        try:
            await _insert_task(
                connection,
                task_id="00000000-0000-0000-0000-000000004636",
                electrical_variant_id=None,
                request_payload='{"payload_version":2,"variant_number":1}',
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
