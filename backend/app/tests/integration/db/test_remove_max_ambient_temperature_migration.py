"""Upgrade proof for removing the retired ambient-temperature maximum (0053)."""

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
_FIELD_KEY = "max_ambient_temperature"


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
async def test_0053_removes_field_from_objects_and_persisted_ui_settings() -> None:
    database_name = f"remove_max_ambient_0053_{uuid.uuid4().hex}"
    admin_url, database_url = _database_urls(database_name)
    admin = await asyncpg.connect(admin_url)
    try:
        await admin.execute(f'CREATE DATABASE "{database_name}"')
        upgraded = _alembic(database_url, "0052")
        assert upgraded.returncode == 0, upgraded.stdout + upgraded.stderr

        connection = await asyncpg.connect(database_url)
        try:
            await connection.execute(
                f"""
                INSERT INTO users (id, email, hashed_password, role)
                VALUES (
                    '00000000-0000-0000-0000-000000005301',
                    'remove-max-ambient-0053@example.test', 'unused', 'employee'
                );
                INSERT INTO user_preferences (id, user_id, key, value)
                VALUES
                (
                    '00000000-0000-0000-0000-000000005302',
                    '00000000-0000-0000-0000-000000005301',
                    'heatcalc.tableColumns.v9',
                    '{{
                        "version": 9,
                        "types": {{
                            "pipe": {{
                                "visibleOrder": ["name", "{_FIELD_KEY}", "pipe_outer_diameter"],
                                "columns": {{
                                    "name": {{"widthPct": 24}},
                                    "{_FIELD_KEY}": {{"widthPct": 9.8}},
                                    "pipe_outer_diameter": {{"widthPct": 7.6}}
                                }}
                            }}
                        }}
                    }}'::jsonb
                ),
                (
                    '00000000-0000-0000-0000-000000005303',
                    '00000000-0000-0000-0000-000000005301',
                    'heatcalc.fieldInputs.v1',
                    '{{
                        "version": 1,
                        "fields": {{
                            "{_FIELD_KEY}": {{"step": 1}},
                            "process_temperature": {{"step": 0.5}}
                        }}
                    }}'::jsonb
                );
                INSERT INTO guest_sessions (id, session_id)
                VALUES ('00000000-0000-0000-0000-000000005304', 'remove-max-ambient-0053');
                INSERT INTO projects (id, name, session_id, display_settings)
                VALUES (
                    '00000000-0000-0000-0000-000000005305',
                    'Remove maximum ambient proof', 'remove-max-ambient-0053',
                    '{{
                        "heatcalc": {{
                            "tableColumns": {{
                                "types": {{
                                    "tank": {{
                                        "visibleOrder": ["name", "{_FIELD_KEY}", "tank_diameter"],
                                        "columns": {{
                                            "{_FIELD_KEY}": {{"widthPct": 9.8}},
                                            "name": {{"widthPct": 24}}
                                        }}
                                    }}
                                }}
                            }},
                            "tableView": {{"fontSize": "compact"}}
                        }}
                    }}'::jsonb
                );
                INSERT INTO project_objects (
                    id, project_id, object_type, sort_order, version, params
                )
                VALUES (
                    '00000000-0000-0000-0000-000000005306',
                    '00000000-0000-0000-0000-000000005305',
                    'pipe', 0, 1,
                    '{{
                        "name": "Pipe 1",
                        "ambient_temperature": -20,
                        "{_FIELD_KEY}": 30
                    }}'::jsonb
                )
                """
            )
        finally:
            await connection.close()

        upgraded = _alembic(database_url, "0053")
        assert upgraded.returncode == 0, upgraded.stdout + upgraded.stderr

        connection = await asyncpg.connect(database_url)
        try:
            object_params = await connection.fetchval(
                "SELECT params FROM project_objects "
                "WHERE id = '00000000-0000-0000-0000-000000005306'"
            )
            table_preference = await connection.fetchval(
                "SELECT value FROM user_preferences WHERE key = 'heatcalc.tableColumns.v9'"
            )
            input_preference = await connection.fetchval(
                "SELECT value FROM user_preferences WHERE key = 'heatcalc.fieldInputs.v1'"
            )
            project_settings = await connection.fetchval(
                "SELECT display_settings FROM projects "
                "WHERE id = '00000000-0000-0000-0000-000000005305'"
            )
        finally:
            await connection.close()

        object_params = json.loads(object_params)
        table_preference = json.loads(table_preference)
        input_preference = json.loads(input_preference)
        project_settings = json.loads(project_settings)

        assert object_params == {"name": "Pipe 1", "ambient_temperature": -20}
        assert table_preference["types"]["pipe"] == {
            "visibleOrder": ["name", "pipe_outer_diameter"],
            "columns": {
                "name": {"widthPct": 24},
                "pipe_outer_diameter": {"widthPct": 7.6},
            },
        }
        assert input_preference["fields"] == {"process_temperature": {"step": 0.5}}
        assert project_settings["heatcalc"]["tableColumns"]["types"]["tank"] == {
            "visibleOrder": ["name", "tank_diameter"],
            "columns": {"name": {"widthPct": 24}},
        }
        assert project_settings["heatcalc"]["tableView"] == {"fontSize": "compact"}
    finally:
        await admin.execute(
            "SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
            "WHERE datname = $1 AND pid <> pg_backend_pid()",
            database_name,
        )
        await admin.execute(f'DROP DATABASE IF EXISTS "{database_name}"')
        await admin.close()
