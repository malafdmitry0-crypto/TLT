"""Upgrade/downgrade proof for project-only Iдоп migration 0045."""

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


async def _assignment_idop_column_exists(connection: asyncpg.Connection) -> bool:
    return bool(
        await connection.fetchval(
            """
            SELECT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'electrical_variant_objects'
                  AND column_name = 'max_section_start_current_a'
            )
            """
        )
    )


@pytest.mark.asyncio(loop_scope="session")
async def test_0045_drops_assignment_idop_without_promoting_data() -> None:
    database_name = f"project_idop_only_0045_{uuid.uuid4().hex}"
    admin_url, database_url = _database_urls(database_name)
    admin = await asyncpg.connect(admin_url)
    try:
        await admin.execute(f'CREATE DATABASE "{database_name}"')
        upgraded_0044 = _alembic(database_url, "upgrade", "0044")
        assert upgraded_0044.returncode == 0, upgraded_0044.stdout + upgraded_0044.stderr

        connection = await asyncpg.connect(database_url)
        try:
            assert await _assignment_idop_column_exists(connection) is True
            await connection.execute(
                """
                INSERT INTO guest_sessions (id, session_id)
                VALUES ('00000000-0000-0000-0000-000000004501', 'project-idop-0045');

                INSERT INTO projects (id, name, session_id, electrical_initialized_at)
                VALUES (
                    '00000000-0000-0000-0000-000000004510',
                    'Project Iдоп migration proof',
                    'project-idop-0045',
                    now()
                );

                INSERT INTO project_electrical_settings (project_id)
                VALUES ('00000000-0000-0000-0000-000000004510');

                INSERT INTO electrical_variants (
                    id, project_id, name, name_normalized, sort_order,
                    is_active, legacy_variant_number
                ) VALUES (
                    '00000000-0000-0000-0000-000000004520',
                    '00000000-0000-0000-0000-000000004510',
                    'ER', 'er', 0, true, 1
                );

                INSERT INTO project_objects (
                    id, project_id, object_type, sort_order, params, is_valid, version
                ) VALUES (
                    '00000000-0000-0000-0000-000000004530',
                    '00000000-0000-0000-0000-000000004510',
                    'pipe', 0, '{}'::jsonb, false, 1
                );

                UPDATE electrical_variant_objects
                SET max_section_start_current_a = 13.065
                WHERE project_id = '00000000-0000-0000-0000-000000004510';
                """
            )
        finally:
            await connection.close()

        upgraded_0045 = _alembic(database_url, "upgrade", "0045")
        assert upgraded_0045.returncode == 0, upgraded_0045.stdout + upgraded_0045.stderr
        connection = await asyncpg.connect(database_url)
        try:
            assert await _assignment_idop_column_exists(connection) is False
            assert (
                await connection.fetchval(
                    "SELECT max_section_start_current_a FROM project_electrical_settings "
                    "WHERE project_id = '00000000-0000-0000-0000-000000004510'"
                )
                is None
            )
        finally:
            await connection.close()

        downgraded = _alembic(database_url, "downgrade", "0044")
        assert downgraded.returncode == 0, downgraded.stdout + downgraded.stderr
        connection = await asyncpg.connect(database_url)
        try:
            assert await _assignment_idop_column_exists(connection) is True
        finally:
            await connection.close()
    finally:
        await admin.execute(f'DROP DATABASE IF EXISTS "{database_name}"')
        await admin.close()
