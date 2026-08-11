"""Upgrade proof for retiring multi-ER electrical calculation tasks (0051)."""

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


def _alembic(database_url: str, revision: str) -> subprocess.CompletedProcess[str]:
    env = os.environ.copy()
    env["DATABASE_URL"] = database_url.replace("postgresql://", "postgresql+asyncpg://", 1)
    return subprocess.run(
        ["alembic", "upgrade", revision],
        cwd=_BACKEND_ROOT,
        env=env,
        check=False,
        capture_output=True,
        text=True,
    )


@pytest.mark.asyncio(loop_scope="session")
async def test_0051_refuses_active_retired_task_and_releases_index_scope() -> None:
    database_name = f"remove_variant_set_0051_{uuid.uuid4().hex}"
    admin_url, database_url = _database_urls(database_name)
    admin = await asyncpg.connect(admin_url)
    try:
        await admin.execute(f'CREATE DATABASE "{database_name}"')
        upgraded = _alembic(database_url, "0050")
        assert upgraded.returncode == 0, upgraded.stdout + upgraded.stderr

        connection = await asyncpg.connect(database_url)
        try:
            await connection.execute(
                """
                INSERT INTO guest_sessions (id, session_id)
                VALUES ('00000000-0000-0000-0000-000000005101', 'remove-set-0051');
                INSERT INTO projects (id, name, session_id)
                VALUES (
                    '00000000-0000-0000-0000-000000005110',
                    'Remove variant set proof', 'remove-set-0051'
                );
                INSERT INTO background_tasks (
                    id, type, status, project_id, session_id, request_payload,
                    progress_current, cancel_requested, attempts, enqueue_attempts
                ) VALUES (
                    '00000000-0000-0000-0000-000000005121',
                    'electrical_variant_set', 'queued',
                    '00000000-0000-0000-0000-000000005110',
                    'remove-set-0051', '{}'::jsonb, 0, false, 0, 0
                )
                """
            )
        finally:
            await connection.close()

        refused = _alembic(database_url, "0051")
        assert refused.returncode != 0
        assert "active electrical_variant_set tasks" in refused.stdout + refused.stderr

        connection = await asyncpg.connect(database_url)
        try:
            await connection.execute(
                "UPDATE background_tasks SET status = 'cancelled' "
                "WHERE type = 'electrical_variant_set'"
            )
        finally:
            await connection.close()

        upgraded = _alembic(database_url, "0051")
        assert upgraded.returncode == 0, upgraded.stdout + upgraded.stderr

        connection = await asyncpg.connect(database_url)
        try:
            await connection.execute(
                """
                INSERT INTO background_tasks (
                    id, type, status, project_id, session_id, request_payload,
                    progress_current, cancel_requested, attempts, enqueue_attempts
                ) VALUES (
                    '00000000-0000-0000-0000-000000005122',
                    'electrical_variant_set', 'queued',
                    '00000000-0000-0000-0000-000000005110',
                    'remove-set-0051', '{}'::jsonb, 0, false, 0, 0
                )
                """
            )
            await connection.execute(
                """
                INSERT INTO background_tasks (
                    id, type, status, project_id, session_id, request_payload,
                    progress_current, cancel_requested, attempts, enqueue_attempts
                ) VALUES (
                    '00000000-0000-0000-0000-000000005123',
                    'heat_loss_batch', 'queued',
                    '00000000-0000-0000-0000-000000005110',
                    'remove-set-0051', '{}'::jsonb, 0, false, 0, 0
                )
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
