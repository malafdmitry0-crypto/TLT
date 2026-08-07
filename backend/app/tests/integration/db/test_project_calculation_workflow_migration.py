"""Upgrade proof for the one-active-calculation-per-project invariant (0048)."""

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


async def _insert_task(
    connection: asyncpg.Connection,
    task_id: str,
    task_type: str,
    status: str = "queued",
) -> None:
    await connection.execute(
        """
        INSERT INTO background_tasks (
            id, type, status, project_id, session_id, request_payload,
            progress_current, cancel_requested, attempts, enqueue_attempts
        ) VALUES (
            $1, $2, $3, '00000000-0000-0000-0000-000000004810',
            'workflow-0048', '{}'::jsonb, 0, false, 0, 0
        )
        """,
        uuid.UUID(task_id),
        task_type,
        status,
    )


@pytest.mark.asyncio(loop_scope="session")
async def test_0048_refuses_conflicts_and_enforces_single_active_calculation() -> None:
    database_name = f"calculation_workflow_0048_{uuid.uuid4().hex}"
    admin_url, database_url = _database_urls(database_name)
    admin = await asyncpg.connect(admin_url)
    try:
        await admin.execute(f'CREATE DATABASE "{database_name}"')
        upgraded = _alembic(database_url, "upgrade", "0047")
        assert upgraded.returncode == 0, upgraded.stdout + upgraded.stderr

        connection = await asyncpg.connect(database_url)
        try:
            await connection.execute(
                """
                INSERT INTO guest_sessions (id, session_id)
                VALUES ('00000000-0000-0000-0000-000000004801', 'workflow-0048');
                INSERT INTO projects (id, name, session_id)
                VALUES (
                    '00000000-0000-0000-0000-000000004810',
                    'Workflow migration proof', 'workflow-0048'
                );
                """
            )
            await _insert_task(
                connection,
                "00000000-0000-0000-0000-000000004821",
                "heat_loss_batch",
            )
            await _insert_task(
                connection,
                "00000000-0000-0000-0000-000000004822",
                "heat_loss_batch",
            )
        finally:
            await connection.close()

        refused = _alembic(database_url, "upgrade", "0048")
        assert refused.returncode != 0
        assert "concurrent active calculation tasks" in refused.stdout + refused.stderr

        connection = await asyncpg.connect(database_url)
        try:
            await connection.execute(
                "UPDATE background_tasks SET status = 'cancelled' "
                "WHERE id = '00000000-0000-0000-0000-000000004822'"
            )
        finally:
            await connection.close()

        upgraded = _alembic(database_url, "upgrade", "0048")
        assert upgraded.returncode == 0, upgraded.stdout + upgraded.stderr

        connection = await asyncpg.connect(database_url)
        try:
            with pytest.raises(asyncpg.UniqueViolationError):
                await _insert_task(
                    connection,
                    "00000000-0000-0000-0000-000000004823",
                    "project_pipeline",
                )
            await connection.execute(
                "UPDATE background_tasks SET status = 'waiting_input', "
                "workflow_stage = 'waiting_input' "
                "WHERE id = '00000000-0000-0000-0000-000000004821'"
            )
            with pytest.raises(asyncpg.UniqueViolationError):
                await _insert_task(
                    connection,
                    "00000000-0000-0000-0000-000000004824",
                    "heat_loss_batch",
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
