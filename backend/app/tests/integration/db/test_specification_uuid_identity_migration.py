"""PostgreSQL proof for project-scoped specification UUID identity (0037)."""

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
    env["DATABASE_URL"] = database_url.replace(
        "postgresql://", "postgresql+asyncpg://", 1
    )
    return subprocess.run(
        ["alembic", command, revision],
        cwd=_BACKEND_ROOT,
        env=env,
        check=False,
        capture_output=True,
        text=True,
    )


@pytest.mark.asyncio(loop_scope="session")
async def test_0037_clean_upgrade_rejects_cross_project_specification_variant() -> None:
    database_name = f"specification_uuid_0037_{uuid.uuid4().hex}"
    admin_url, database_url = _database_urls(database_name)
    admin = await asyncpg.connect(admin_url)
    try:
        await admin.execute(f'CREATE DATABASE "{database_name}"')
        upgraded = _alembic(database_url, "upgrade", "0037")
        assert upgraded.returncode == 0, upgraded.stdout + upgraded.stderr

        connection = await asyncpg.connect(database_url)
        try:
            await connection.execute(
                """
                INSERT INTO guest_sessions (id, session_id)
                VALUES
                    ('00000000-0000-0000-0000-000000003701', 'spec-0037-a'),
                    ('00000000-0000-0000-0000-000000003702', 'spec-0037-b')
                """
            )
            await connection.execute(
                """
                INSERT INTO projects (id, name, session_id, status)
                VALUES
                    ('00000000-0000-0000-0000-000000003711', 'Project A',
                     'spec-0037-a', 'draft'),
                    ('00000000-0000-0000-0000-000000003712', 'Project B',
                     'spec-0037-b', 'draft')
                """
            )
            await connection.execute(
                """
                INSERT INTO electrical_variants (
                    id, project_id, name, name_normalized, sort_order,
                    is_active, legacy_variant_number
                ) VALUES
                    ('00000000-0000-0000-0000-000000003721',
                     '00000000-0000-0000-0000-000000003711',
                     'ER A', 'er a', 0, true, 1),
                    ('00000000-0000-0000-0000-000000003722',
                     '00000000-0000-0000-0000-000000003712',
                     'ER B', 'er b', 0, true, 1)
                """
            )

            definition = await connection.fetchval(
                """
                SELECT pg_get_constraintdef(oid)
                FROM pg_constraint
                WHERE conname = 'fk_specifications_electrical_variant_project'
                """
            )
            assert definition is not None
            assert "FOREIGN KEY (electrical_variant_id, project_id)" in definition
            assert "REFERENCES electrical_variants(id, project_id)" in definition

            with pytest.raises(asyncpg.ForeignKeyViolationError):
                await connection.execute(
                    """
                    INSERT INTO specifications (
                        id, project_id, electrical_variant_id, items
                    ) VALUES (
                        '00000000-0000-0000-0000-000000003731',
                        '00000000-0000-0000-0000-000000003711',
                        '00000000-0000-0000-0000-000000003722', '[]'::jsonb
                    )
                    """
                )

            await connection.execute(
                """
                INSERT INTO specifications (
                    id, project_id, electrical_variant_id, items, snapshot
                ) VALUES (
                    '00000000-0000-0000-0000-000000003732',
                    '00000000-0000-0000-0000-000000003711',
                    '00000000-0000-0000-0000-000000003721', '[]'::jsonb,
                    '{"schema":"specification-generation"}'::jsonb
                )
                """
            )
            columns = await connection.fetch(
                """
                SELECT column_name
                FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'specifications'
                """
            )
            names = {row["column_name"] for row in columns}
            assert "snapshot" in names
            assert "variant_number" not in names
            assert "generation_mode" not in names
            assert "generation_options" not in names
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
