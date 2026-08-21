"""Upgrade/downgrade proof for specification catalog selections migration 0040."""

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
async def test_0040_upgrade_downgrade_upgrade_round_trip():
    database_name = f"spec_selections_0040_{uuid.uuid4().hex}"
    admin_url, database_url = _database_urls(database_name)
    admin = await asyncpg.connect(admin_url)
    try:
        await admin.execute(f'CREATE DATABASE "{database_name}"')
        up = _alembic(database_url, "upgrade", "0040")
        assert up.returncode == 0, up.stdout + up.stderr

        connection = await asyncpg.connect(database_url)
        try:
            exists = await connection.fetchval(
                """
                SELECT EXISTS (
                    SELECT 1 FROM information_schema.tables
                    WHERE table_name = 'specification_catalog_selections'
                )
                """
            )
            assert exists is True
            # Unique constraint present.
            constraint = await connection.fetchval(
                """
                SELECT 1 FROM pg_constraint
                WHERE conname = 'uq_spec_catalog_selections_project_er_group'
                """
            )
            assert constraint == 1
        finally:
            await connection.close()

        down = _alembic(database_url, "downgrade", "0039")
        assert down.returncode == 0, down.stdout + down.stderr
        connection = await asyncpg.connect(database_url)
        try:
            exists = await connection.fetchval(
                """
                SELECT EXISTS (
                    SELECT 1 FROM information_schema.tables
                    WHERE table_name = 'specification_catalog_selections'
                )
                """
            )
            assert exists is False
        finally:
            await connection.close()

        up_again = _alembic(database_url, "upgrade", "0040")
        assert up_again.returncode == 0, up_again.stdout + up_again.stderr
    finally:
        await admin.execute(f'DROP DATABASE IF EXISTS "{database_name}"')
        await admin.close()
