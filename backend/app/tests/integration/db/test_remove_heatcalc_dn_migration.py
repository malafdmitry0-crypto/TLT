"""Upgrade proof for removing persisted HeatCalc DN settings (0052)."""

from __future__ import annotations

import json
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
async def test_0052_removes_dn_from_persisted_settings_only() -> None:
    database_name = f"remove_heatcalc_dn_0052_{uuid.uuid4().hex}"
    admin_url, database_url = _database_urls(database_name)
    admin = await asyncpg.connect(admin_url)
    try:
        await admin.execute(f'CREATE DATABASE "{database_name}"')
        upgraded = _alembic(database_url, "0051")
        assert upgraded.returncode == 0, upgraded.stdout + upgraded.stderr

        connection = await asyncpg.connect(database_url)
        try:
            await connection.execute(
                """
                INSERT INTO users (id, email, hashed_password, role)
                VALUES (
                    '00000000-0000-0000-0000-000000005201',
                    'remove-dn-0052@example.test', 'unused', 'employee'
                );
                INSERT INTO user_preferences (id, user_id, key, value)
                VALUES (
                    '00000000-0000-0000-0000-000000005202',
                    '00000000-0000-0000-0000-000000005201',
                    'heatcalc.tableColumns.v9',
                    '{
                        "version": 9,
                        "types": {
                            "pipe": {
                                "visibleOrder": ["name", "pipe_dn", "pipe_outer_diameter"],
                                "columns": {
                                    "name": {"widthPct": 24},
                                    "pipe_dn": {"widthPct": 5.8},
                                    "pipe_outer_diameter": {"widthPct": 7.6}
                                }
                            }
                        }
                    }'::jsonb
                );
                INSERT INTO guest_sessions (id, session_id)
                VALUES ('00000000-0000-0000-0000-000000005203', 'remove-dn-0052');
                INSERT INTO projects (id, name, session_id, display_settings)
                VALUES (
                    '00000000-0000-0000-0000-000000005204',
                    'Remove DN proof', 'remove-dn-0052',
                    '{
                        "heatcalc": {
                            "tableColumns": {
                                "types": {
                                    "all": {
                                        "visibleOrder": ["type", "pipe_dn", "name"],
                                        "columns": {
                                            "pipe_dn": {"widthPct": 5.8},
                                            "name": {"widthPct": 24}
                                        }
                                    }
                                }
                            },
                            "tableView": {"fontSize": "compact"}
                        },
                        "electrical": {"columns": ["cable_mark"]}
                    }'::jsonb
                )
                """
            )
        finally:
            await connection.close()

        upgraded = _alembic(database_url, "0052")
        assert upgraded.returncode == 0, upgraded.stdout + upgraded.stderr

        connection = await asyncpg.connect(database_url)
        try:
            preference = await connection.fetchval(
                "SELECT value FROM user_preferences WHERE key = 'heatcalc.tableColumns.v9'"
            )
            project_settings = await connection.fetchval(
                "SELECT display_settings FROM projects "
                "WHERE id = '00000000-0000-0000-0000-000000005204'"
            )
            dn_columns = await connection.fetchval(
                "SELECT count(*) FROM information_schema.columns "
                "WHERE table_schema = 'public' "
                "AND column_name IN ('dn', 'pipe_dn', 'nominal_diameter')"
            )
        finally:
            await connection.close()

        preference = json.loads(preference)
        project_settings = json.loads(project_settings)

        assert preference["types"]["pipe"]["visibleOrder"] == [
            "name",
            "pipe_outer_diameter",
        ]
        assert preference["types"]["pipe"]["columns"] == {
            "name": {"widthPct": 24},
            "pipe_outer_diameter": {"widthPct": 7.6},
        }
        assert project_settings["heatcalc"]["tableColumns"]["types"]["all"] == {
            "visibleOrder": ["type", "name"],
            "columns": {"name": {"widthPct": 24}},
        }
        assert project_settings["heatcalc"]["tableView"] == {"fontSize": "compact"}
        assert project_settings["electrical"] == {"columns": ["cable_mark"]}
        assert dn_columns == 0
    finally:
        await admin.execute(
            "SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
            "WHERE datname = $1 AND pid <> pg_backend_pid()",
            database_name,
        )
        await admin.execute(f'DROP DATABASE IF EXISTS "{database_name}"')
        await admin.close()
