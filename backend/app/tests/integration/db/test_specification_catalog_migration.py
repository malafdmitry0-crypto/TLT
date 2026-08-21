"""PostgreSQL lifecycle proof for specification catalog migration 0036."""

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
async def test_0036_upgrade_guards_active_data_and_round_trips():
    database_name = f"specification_catalog_0036_{uuid.uuid4().hex}"
    admin_url, database_url = _database_urls(database_name)
    admin = await asyncpg.connect(admin_url)
    try:
        await admin.execute(f'CREATE DATABASE "{database_name}"')
        upgraded = _alembic(database_url, "upgrade", "0036")
        assert upgraded.returncode == 0, upgraded.stdout + upgraded.stderr

        connection = await asyncpg.connect(database_url)
        try:
            await connection.execute(
                """
                INSERT INTO specification_catalog_versions (
                    id, catalog_key, version, status, authority, source,
                    source_checksum, payload_checksum, schema_version,
                    item_count, is_complete
                ) VALUES (
                    '00000000-0000-0000-0000-000000003601',
                    'builtin-specification', 'approved-v1', 'draft', 'approved',
                    'owner registry',
                    'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
                    'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
                    1, 1, true
                )
                """
            )
            await connection.execute(
                """
                INSERT INTO specification_catalog_items (
                    id, catalog_version_id, item_key, category, name, mark,
                    nomenclature_code, supply_unit, source_ref, row_checksum, position
                ) VALUES (
                    '00000000-0000-0000-0000-000000003611',
                    '00000000-0000-0000-0000-000000003601',
                    'sealant:approved', 'sealant', 'Клей', 'APPROVED-SEALANT',
                    'TEST-003-001', 'шт.', 'owner registry row',
                    'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc', 0
                )
                """
            )
            await connection.execute(
                """
                UPDATE specification_catalog_versions
                SET status = 'active', activated_at = now(), activated_by = 'test'
                WHERE id = '00000000-0000-0000-0000-000000003601'
                """
            )
            with pytest.raises(asyncpg.RaiseError):
                await connection.execute(
                    """
                    UPDATE specification_catalog_items SET mark = 'CHANGED'
                    WHERE id = '00000000-0000-0000-0000-000000003611'
                    """
                )
            with pytest.raises(asyncpg.RaiseError):
                await connection.execute(
                    """
                    UPDATE specification_catalog_versions SET source = 'changed'
                    WHERE id = '00000000-0000-0000-0000-000000003601'
                    """
                )
            with pytest.raises(asyncpg.UniqueViolationError):
                await connection.execute(
                    """
                    INSERT INTO specification_catalog_versions (
                        id, catalog_key, version, status, authority, source,
                        source_checksum, payload_checksum, schema_version,
                        item_count, is_complete
                    ) VALUES (
                        '00000000-0000-0000-0000-000000003602',
                        'builtin-specification', 'approved-v2', 'active', 'approved',
                        'second registry',
                        'sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
                        'sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
                        1, 1, true
                    )
                    """
                )
            with pytest.raises(asyncpg.CheckViolationError):
                await connection.execute(
                    """
                    INSERT INTO specification_catalog_versions (
                        id, catalog_key, version, status, authority, source,
                        source_checksum, payload_checksum, schema_version,
                        item_count, is_complete
                    ) VALUES (
                        '00000000-0000-0000-0000-000000003603',
                        'other-specification', 'provisional-v1', 'active', 'provisional',
                        'provisional registry',
                        'sha256:1111111111111111111111111111111111111111111111111111111111111111',
                        'sha256:2222222222222222222222222222222222222222222222222222222222222222',
                        1, 1, true
                    )
                    """
                )
        finally:
            await connection.close()

        downgraded = _alembic(database_url, "downgrade", "0035")
        assert downgraded.returncode == 0, downgraded.stdout + downgraded.stderr
        connection = await asyncpg.connect(database_url)
        try:
            assert not await connection.fetchval(
                "SELECT to_regclass('public.specification_catalog_versions') IS NOT NULL"
            )
            assert not await connection.fetchval(
                "SELECT to_regclass('public.specification_catalog_items') IS NOT NULL"
            )
        finally:
            await connection.close()

        reupgraded = _alembic(database_url, "upgrade", "0036")
        assert reupgraded.returncode == 0, reupgraded.stdout + reupgraded.stderr
    finally:
        await admin.execute(
            "SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
            "WHERE datname = $1 AND pid <> pg_backend_pid()",
            database_name,
        )
        await admin.execute(f'DROP DATABASE IF EXISTS "{database_name}"')
        await admin.close()
