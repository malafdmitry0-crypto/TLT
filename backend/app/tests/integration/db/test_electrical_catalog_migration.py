"""PostgreSQL lifecycle proof for electrical catalog migration 0034."""

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
async def test_0034_upgrade_immutability_unique_active_and_downgrade():
    database_name = f"electrical_catalog_0034_{uuid.uuid4().hex}"
    admin_url, database_url = _database_urls(database_name)
    admin = await asyncpg.connect(admin_url)
    try:
        await admin.execute(f'CREATE DATABASE "{database_name}"')
        upgraded = _alembic(database_url, "upgrade", "0034")
        assert upgraded.returncode == 0, upgraded.stdout + upgraded.stderr

        connection = await asyncpg.connect(database_url)
        try:
            await connection.execute(
                """
                INSERT INTO electrical_catalog_versions (
                    id, kind, version, status, source, source_checksum, import_checksum,
                    payload_checksum, schema_version, payload,
                    valid_row_count, rejected_row_count, production_approved,
                    activated_at, activated_by
                ) VALUES (
                    '00000000-0000-0000-0000-000000003401',
                    'bom', 'bom-v1', 'active', 'approved.xlsx',
                    'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
                    'sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
                    'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
                    1, '{"entries": []}'::jsonb, 18, 0, true, now(), 'admin'
                )
                """
            )
            with pytest.raises(asyncpg.UniqueViolationError):
                await connection.execute(
                    """
                    INSERT INTO electrical_catalog_versions (
                        id, kind, version, status, source, source_checksum, import_checksum,
                        payload_checksum, schema_version, payload,
                        valid_row_count, rejected_row_count
                    ) VALUES (
                        '00000000-0000-0000-0000-000000003402',
                        'bom', 'bom-v2', 'active', 'other.xlsx',
                        'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
                        'sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
                        'sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
                        1, '{"entries": []}'::jsonb, 18, 0
                    )
                    """
                )
            with pytest.raises(asyncpg.RaiseError):
                await connection.execute(
                    """
                    UPDATE electrical_catalog_versions
                    SET payload = '{"entries": [{"changed": true}]}'::jsonb
                    WHERE id = '00000000-0000-0000-0000-000000003401'
                    """
                )
            with pytest.raises(asyncpg.CheckViolationError):
                await connection.execute(
                    """
                    INSERT INTO electrical_catalog_versions (
                        id, kind, version, status, source, source_checksum, import_checksum,
                        payload_checksum, schema_version, payload,
                        valid_row_count, rejected_row_count, production_approved
                    ) VALUES (
                        '00000000-0000-0000-0000-000000003403',
                        'power', 'provisional', 'active', 'provisional.json',
                        'sha256:1111111111111111111111111111111111111111111111111111111111111111',
                        'sha256:2222222222222222222222222222222222222222222222222222222222222222',
                        'sha256:3333333333333333333333333333333333333333333333333333333333333333',
                        1, '{"rows": []}'::jsonb, 14, 0, false
                    )
                    """
                )
            await connection.execute(
                """
                UPDATE electrical_catalog_versions SET status = 'retired'
                WHERE id = '00000000-0000-0000-0000-000000003401'
                """
            )
            with pytest.raises(asyncpg.RaiseError):
                await connection.execute(
                    """
                    UPDATE electrical_catalog_versions SET status = 'active'
                    WHERE id = '00000000-0000-0000-0000-000000003401'
                    """
                )
        finally:
            await connection.close()

        downgraded = _alembic(database_url, "downgrade", "0033")
        assert downgraded.returncode == 0, downgraded.stdout + downgraded.stderr
        connection = await asyncpg.connect(database_url)
        try:
            assert not await connection.fetchval(
                "SELECT to_regclass('public.electrical_catalog_versions') IS NOT NULL"
            )
        finally:
            await connection.close()
        reupgraded = _alembic(database_url, "upgrade", "0034")
        assert reupgraded.returncode == 0, reupgraded.stdout + reupgraded.stderr
    finally:
        await admin.execute(
            "SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
            "WHERE datname = $1 AND pid <> pg_backend_pid()",
            database_name,
        )
        await admin.execute(f'DROP DATABASE IF EXISTS "{database_name}"')
        await admin.close()
