"""Upgrade/downgrade proof for assignment electrical overrides migration 0042."""

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
async def test_0042_upgrade_downgrade_upgrade_round_trip() -> None:
    database_name = f"assignment_overrides_0042_{uuid.uuid4().hex}"
    admin_url, database_url = _database_urls(database_name)
    admin = await asyncpg.connect(admin_url)
    try:
        await admin.execute(f'CREATE DATABASE "{database_name}"')
        upgraded = _alembic(database_url, "upgrade", "0042")
        assert upgraded.returncode == 0, upgraded.stdout + upgraded.stderr

        connection = await asyncpg.connect(database_url)
        try:
            column = await connection.fetchrow(
                """
                SELECT is_nullable, column_default, data_type
                FROM information_schema.columns
                WHERE table_name = 'electrical_variant_objects'
                  AND column_name = 'electrical_overrides'
                """
            )
            assert column is not None
            assert column["is_nullable"] == "NO"
            assert column["data_type"] == "jsonb"
            assert column["column_default"] == "'{}'::jsonb"
        finally:
            await connection.close()

        downgraded = _alembic(database_url, "downgrade", "0041")
        assert downgraded.returncode == 0, downgraded.stdout + downgraded.stderr
        connection = await asyncpg.connect(database_url)
        try:
            exists = await connection.fetchval(
                """
                SELECT EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'electrical_variant_objects'
                      AND column_name = 'electrical_overrides'
                )
                """
            )
            assert exists is False
        finally:
            await connection.close()

        reupgraded = _alembic(database_url, "upgrade", "0042")
        assert reupgraded.returncode == 0, reupgraded.stdout + reupgraded.stderr
    finally:
        await admin.execute(f'DROP DATABASE IF EXISTS "{database_name}"')
        await admin.close()
