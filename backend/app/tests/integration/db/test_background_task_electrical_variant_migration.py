"""Focused PostgreSQL evidence for background-task ER UUID migration 0028."""

from __future__ import annotations

import importlib.util
import os
import subprocess
import uuid
from pathlib import Path
from types import ModuleType
from urllib.parse import urlsplit, urlunsplit

import asyncpg
import pytest

_BACKEND_ROOT = Path(__file__).resolve().parents[4]


def _database_urls(database_name: str) -> tuple[str, str]:
    configured = os.getenv(
        "TEST_DATABASE_URL",
        "postgresql+asyncpg://test:test@localhost:5433/heatcalc_test",
    )
    asyncpg_url = configured.replace("postgresql+asyncpg://", "postgresql://", 1)
    parsed = urlsplit(asyncpg_url)
    admin_url = urlunsplit(parsed._replace(path="/postgres", query="", fragment=""))
    database_url = urlunsplit(parsed._replace(path=f"/{database_name}", query="", fragment=""))
    return admin_url, database_url


def _run_alembic(
    database_url: str,
    command: str,
    revision: str,
) -> subprocess.CompletedProcess[str]:
    env = os.environ.copy()
    env["DATABASE_URL"] = database_url.replace(
        "postgresql://",
        "postgresql+asyncpg://",
        1,
    )
    return subprocess.run(
        ["alembic", command, revision],
        cwd=_BACKEND_ROOT,
        env=env,
        check=False,
        capture_output=True,
        text=True,
    )


def _migration_module() -> ModuleType:
    migration_path = (
        _BACKEND_ROOT / "alembic" / "versions" / "0028_background_task_electrical_variant.py"
    )
    spec = importlib.util.spec_from_file_location("migration_0028", migration_path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


async def _seed_historical_tasks(connection: asyncpg.Connection) -> None:
    await connection.execute(
        """
        INSERT INTO guest_sessions (id, session_id)
        VALUES (
            '00000000-0000-0000-0000-000000002801',
            'phase1c-0028'
        )
        """
    )
    await connection.execute(
        """
        INSERT INTO projects (id, name, session_id)
        VALUES (
            '00000000-0000-0000-0000-000000002802',
            'Background task migration',
            'phase1c-0028'
        )
        """
    )
    await connection.execute(
        """
        INSERT INTO background_tasks (
            id, type, status, project_id, session_id, request_payload,
            progress_current, cancel_requested, attempts, enqueue_attempts
        ) VALUES
            (
                '00000000-0000-0000-0000-000000002811',
                'electrical_batch', 'succeeded',
                '00000000-0000-0000-0000-000000002802', 'phase1c-0028',
                '{"project_id":"00000000-0000-0000-0000-000000002802",'
                '"variant_number":1}'::jsonb,
                0, false, 0, 0
            ),
            (
                '00000000-0000-0000-0000-000000002812',
                'report_export', 'failed',
                '00000000-0000-0000-0000-000000002802', 'phase1c-0028',
                '{"payload_version":2,"variant_number":1}'::jsonb,
                0, false, 0, 0
            ),
            (
                '00000000-0000-0000-0000-000000002813',
                'heat_loss_batch', 'succeeded',
                '00000000-0000-0000-0000-000000002802', 'phase1c-0028',
                '{"variant_number":1}'::jsonb,
                0, false, 0, 0
            ),
            (
                '00000000-0000-0000-0000-000000002814',
                'electrical_batch', 'queued',
                '00000000-0000-0000-0000-000000002802', 'phase1c-0028',
                '{"payload_version":3,'
                '"electrical_variant_id":"00000000-0000-0000-0000-000000002899",'
                '"variant_number":1}'::jsonb,
                0, false, 0, 0
            ),
            (
                '00000000-0000-0000-0000-000000002815',
                'report_export', 'cancelled',
                '00000000-0000-0000-0000-000000002802', 'phase1c-0028',
                '{"variant_number":1}'::jsonb,
                0, false, 0, 0
            ),
            (
                '00000000-0000-0000-0000-000000002816',
                'electrical_batch', 'cancelled',
                '00000000-0000-0000-0000-000000002802', 'phase1c-0028',
                '{"variant_number":4}'::jsonb,
                0, false, 0, 0
            )
        """
    )


def test_migration_0028_revision_chain_is_linear():
    migration = _migration_module()

    assert migration.revision == "0028"
    assert migration.down_revision == "0027"


@pytest.mark.asyncio(loop_scope="session")
async def test_alembic_0028_backfills_task_trace_without_row_loss_or_fk():
    database_name = f"phase1c_0028_{uuid.uuid4().hex}"
    admin_url, database_url = _database_urls(database_name)
    admin = await asyncpg.connect(admin_url)

    try:
        await admin.execute(f'CREATE DATABASE "{database_name}"')

        to_legacy = _run_alembic(database_url, "upgrade", "0026")
        assert to_legacy.returncode == 0, to_legacy.stdout + to_legacy.stderr

        connection = await asyncpg.connect(database_url)
        try:
            await _seed_historical_tasks(connection)
        finally:
            await connection.close()

        to_variants = _run_alembic(database_url, "upgrade", "0027")
        assert to_variants.returncode == 0, to_variants.stdout + to_variants.stderr

        refused = _run_alembic(database_url, "upgrade", "0028")
        assert refused.returncode != 0
        assert (
            "every v3 electrical/report task must trace an existing same-project UUID"
            in refused.stdout + refused.stderr
        )
        connection = await asyncpg.connect(database_url)
        try:
            assert await connection.fetchval("SELECT version_num FROM alembic_version") == "0027"
            assert (
                await connection.fetchval(
                    """
                SELECT count(*)
                FROM information_schema.columns
                WHERE table_name = 'background_tasks'
                  AND column_name = 'electrical_variant_id'
                """
                )
                == 0
            )
            variant_id = await connection.fetchval(
                """
                SELECT id
                FROM electrical_variants
                WHERE project_id = '00000000-0000-0000-0000-000000002802'
                  AND legacy_variant_number = 1
                """
            )
            assert (
                await connection.fetchval(
                    """
                SELECT count(*)
                FROM electrical_variants
                WHERE project_id = '00000000-0000-0000-0000-000000002802'
                  AND legacy_variant_number = 4
                """
                )
                == 1
            )
            await connection.execute(
                """
                UPDATE background_tasks
                SET request_payload = jsonb_build_object(
                    'payload_version', 3,
                    'project_id', project_id::text,
                    'electrical_variant_id', $1::uuid::text
                )
                WHERE id = '00000000-0000-0000-0000-000000002814'
                """,
                variant_id,
            )
        finally:
            await connection.close()

        upgraded = _run_alembic(database_url, "upgrade", "0028")
        assert upgraded.returncode == 0, upgraded.stdout + upgraded.stderr

        connection = await asyncpg.connect(database_url)
        try:
            assert await connection.fetchval("SELECT version_num FROM alembic_version") == "0028"
            variant_id = await connection.fetchval(
                """
                SELECT id
                FROM electrical_variants
                WHERE project_id = '00000000-0000-0000-0000-000000002802'
                  AND legacy_variant_number = 1
                """
            )
            variant_4_id = await connection.fetchval(
                """
                SELECT id
                FROM electrical_variants
                WHERE project_id = '00000000-0000-0000-0000-000000002802'
                  AND legacy_variant_number = 4
                """
            )
            rows = await connection.fetch(
                """
                SELECT id, electrical_variant_id
                FROM background_tasks
                ORDER BY id
                """
            )
            assert len(rows) == 6
            traces = {str(row["id"]): row["electrical_variant_id"] for row in rows}
            assert traces["00000000-0000-0000-0000-000000002811"] == variant_id
            assert traces["00000000-0000-0000-0000-000000002812"] == variant_id
            assert traces["00000000-0000-0000-0000-000000002813"] is None
            assert traces["00000000-0000-0000-0000-000000002814"] == variant_id
            assert traces["00000000-0000-0000-0000-000000002815"] == variant_id
            assert traces["00000000-0000-0000-0000-000000002816"] == variant_4_id
            assert (
                await connection.fetchval(
                    """
                SELECT count(*)
                FROM pg_indexes
                WHERE tablename = 'background_tasks'
                  AND indexname = 'ix_background_tasks_electrical_variant_id'
                """
                )
                == 1
            )
            assert (
                await connection.fetchval(
                    """
                SELECT count(*)
                FROM pg_constraint
                WHERE conrelid = 'background_tasks'::regclass
                  AND contype = 'f'
                  AND pg_get_constraintdef(oid) LIKE '%electrical_variant_id%'
                """
                )
                == 0
            )
            assert (
                await connection.fetchval(
                    """
                SELECT count(*)
                FROM pg_constraint
                WHERE conrelid = 'background_tasks'::regclass
                  AND conname = 'ck_background_tasks_electrical_variant_trace'
                """
                )
                == 1
            )

            with pytest.raises(asyncpg.CheckViolationError):
                await connection.execute(
                    """
                    INSERT INTO background_tasks (
                        id, type, status, project_id, session_id, request_payload,
                        progress_current, cancel_requested, attempts, enqueue_attempts
                    ) VALUES (
                        '00000000-0000-0000-0000-000000002818',
                        'electrical_batch', 'queued',
                        '00000000-0000-0000-0000-000000002802',
                        'phase1c-0028',
                        '{"payload_version":2,"variant_number":1}'::jsonb,
                        0, false, 0, 0
                    )
                    """
                )

            transaction = connection.transaction()
            await transaction.start()
            await connection.execute(
                "DELETE FROM electrical_variants WHERE id = $1",
                variant_id,
            )
            assert await connection.fetchval("SELECT count(*) FROM background_tasks") == 6
            assert (
                await connection.fetchval(
                    """
                SELECT count(*)
                FROM background_tasks
                WHERE electrical_variant_id = $1
                """,
                    variant_id,
                )
                == 4
            )
            await transaction.rollback()
        finally:
            await connection.close()

        connection = await asyncpg.connect(database_url)
        try:
            await connection.execute(
                """
                INSERT INTO electrical_variants (
                    id, project_id, name, name_normalized, sort_order,
                    is_active, legacy_variant_number
                ) VALUES (
                    '00000000-0000-0000-0000-000000002821',
                    '00000000-0000-0000-0000-000000002802',
                    'Dynamic only', 'dynamic only', 2, false, NULL
                )
                """
            )
            await connection.execute(
                """
                INSERT INTO background_tasks (
                    id, type, status, project_id, session_id,
                    electrical_variant_id, request_payload,
                    progress_current, cancel_requested, attempts, enqueue_attempts
                ) VALUES (
                    '00000000-0000-0000-0000-000000002817',
                    'report_export', 'succeeded',
                    '00000000-0000-0000-0000-000000002802',
                    'phase1c-0028',
                    '00000000-0000-0000-0000-000000002821',
                    jsonb_build_object(
                        'payload_version', 3,
                        'project_id',
                        '00000000-0000-0000-0000-000000002802',
                        'electrical_variant_id',
                        '00000000-0000-0000-0000-000000002821'
                    ),
                    0, false, 0, 0
                )
                """
            )
        finally:
            await connection.close()

        refused_dynamic_v3 = _run_alembic(database_url, "downgrade", "0027")
        assert refused_dynamic_v3.returncode != 0
        assert "cannot be converted to a legacy slot" in (
            refused_dynamic_v3.stdout + refused_dynamic_v3.stderr
        )

        connection = await asyncpg.connect(database_url)
        try:
            await connection.execute(
                """
                DELETE FROM background_tasks
                WHERE id = '00000000-0000-0000-0000-000000002817';
                DELETE FROM electrical_variants
                WHERE id = '00000000-0000-0000-0000-000000002821'
                """
            )
        finally:
            await connection.close()

        downgraded = _run_alembic(database_url, "downgrade", "0027")
        assert downgraded.returncode == 0, downgraded.stdout + downgraded.stderr

        connection = await asyncpg.connect(database_url)
        try:
            assert await connection.fetchval("SELECT version_num FROM alembic_version") == "0027"
            assert await connection.fetchval("SELECT count(*) FROM background_tasks") == 6
            assert (
                await connection.fetchval(
                    """
                SELECT count(*)
                FROM information_schema.columns
                WHERE table_name = 'background_tasks'
                  AND column_name = 'electrical_variant_id'
                """
                )
                == 0
            )
            converted_payload = await connection.fetchval(
                """
                SELECT request_payload::text
                FROM background_tasks
                WHERE id = '00000000-0000-0000-0000-000000002814'
                """
            )
            assert '"payload_version": 2' in converted_payload
            assert '"variant_number": 1' in converted_payload
            assert "electrical_variant_id" not in converted_payload
        finally:
            await connection.close()
    finally:
        await admin.execute(
            """
            SELECT pg_terminate_backend(pid)
            FROM pg_stat_activity
            WHERE datname = $1 AND pid <> pg_backend_pid()
            """,
            database_name,
        )
        await admin.execute(f'DROP DATABASE IF EXISTS "{database_name}"')
        await admin.close()
