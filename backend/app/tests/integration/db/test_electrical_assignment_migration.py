"""PostgreSQL evidence for Phase 3 assignment migration 0029."""

from __future__ import annotations

import importlib.util
import json
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
        _BACKEND_ROOT / "alembic" / "versions" / "0029_electrical_assignment_versions.py"
    )
    spec = importlib.util.spec_from_file_location("migration_0029", migration_path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


async def _seed_0028_assignment_graph(connection: asyncpg.Connection) -> None:
    await connection.execute(
        """
        INSERT INTO guest_sessions (id, session_id)
        VALUES ('00000000-0000-0000-0000-000000002901', 'phase3-0029');

        INSERT INTO projects (id, name, session_id)
        VALUES (
            '00000000-0000-0000-0000-000000002902',
            'Assignment migration',
            'phase3-0029'
        );

        INSERT INTO electrical_variants (
            id, project_id, name, name_normalized, sort_order,
            is_active, legacy_variant_number
        ) VALUES (
            '00000000-0000-0000-0000-000000002903',
            '00000000-0000-0000-0000-000000002902',
            'ЭР1', 'эр1', 0, true, 1
        );

        INSERT INTO project_objects (
            id, project_id, object_type, sort_order, params, results,
            is_valid, validation_errors, version
        ) VALUES
            (
                '00000000-0000-0000-0000-000000002911',
                '00000000-0000-0000-0000-000000002902',
                'pipe', 10, '{}'::jsonb, '{}'::jsonb, true, '[]'::jsonb, 7
            ),
            (
                '00000000-0000-0000-0000-000000002912',
                '00000000-0000-0000-0000-000000002902',
                'pipe', 20, '{}'::jsonb, '{}'::jsonb, true, '[]'::jsonb, 8
            ),
            (
                '00000000-0000-0000-0000-000000002913',
                '00000000-0000-0000-0000-000000002902',
                'tank', 30, '{}'::jsonb, '{}'::jsonb, true, '[]'::jsonb, 9
            ),
            (
                '00000000-0000-0000-0000-000000002914',
                '00000000-0000-0000-0000-000000002902',
                'tank', 40, '{}'::jsonb, '{}'::jsonb, true, '[]'::jsonb, 10
            );

        INSERT INTO electrical_calculations (
            id, project_id, object_id, variant_number, electrical_variant_id,
            cable_type, cable_type_source, cable_mark, cable_mark_source,
            params, results
        ) VALUES
            (
                '00000000-0000-0000-0000-000000002921',
                '00000000-0000-0000-0000-000000002902',
                '00000000-0000-0000-0000-000000002911', 1,
                '00000000-0000-0000-0000-000000002903',
                'self_regulating', 'auto', NULL, 'auto', '{}'::jsonb,
                '{"category":"calculation_error","error_code":"NO_CABLE",'
                '"message":"No cable"}'::jsonb
            ),
            (
                '00000000-0000-0000-0000-000000002922',
                '00000000-0000-0000-0000-000000002902',
                '00000000-0000-0000-0000-000000002912', 1,
                '00000000-0000-0000-0000-000000002903',
                'three_core', 'manual', 'R-3', 'manual', '{}'::jsonb,
                '{"category":"stale","stale":true,'
                '"stale_reason":"object_changed"}'::jsonb
            ),
            (
                '00000000-0000-0000-0000-000000002923',
                '00000000-0000-0000-0000-000000002902',
                '00000000-0000-0000-0000-000000002913', 1,
                '00000000-0000-0000-0000-000000002903',
                'mineral', 'manual', NULL, 'manual', '{}'::jsonb,
                '{"category":"unsupported"}'::jsonb
            ),
            (
                '00000000-0000-0000-0000-000000002924',
                '00000000-0000-0000-0000-000000002902',
                '00000000-0000-0000-0000-000000002914', 1,
                '00000000-0000-0000-0000-000000002903',
                'self_regulating_tt', 'auto', 'TLT-TT', 'auto', '{}'::jsonb,
                '{"selected_cable":"TLT-TT"}'::jsonb
            );
        """
    )


def test_migration_0029_projection_and_revision_contract():
    migration = _migration_module()

    assert migration.revision == "0029"
    assert migration.down_revision == "0028"
    assert migration._phase3_assignment_projection(
        "self_regulating", None, {"category": "calculation_error"}
    ) == ("self_regulating", "error")
    assert migration._phase3_assignment_projection(
        "three_core", "R-3", {"category": "stale"}
    ) == ("resistive", "stale")
    assert migration._phase3_assignment_projection(
        "mineral", None, None
    ) == ("mineral", "unsupported")
    assert migration._phase3_assignment_projection(
        "self_regulating_tt", "TLT-TT", {}
    ) == ("self_regulating", "ready")
    assert migration._phase3_assignment_projection(
        "self_regulating", "TLT-25", None
    ) == ("self_regulating", "error")


@pytest.mark.asyncio(loop_scope="session")
async def test_alembic_0029_reconciles_exact_uuid_assignments_and_downgrades():
    database_name = f"phase3_0029_{uuid.uuid4().hex}"
    admin_url, database_url = _database_urls(database_name)
    admin = await asyncpg.connect(admin_url)

    try:
        await admin.execute(f'CREATE DATABASE "{database_name}"')
        to_0028 = _run_alembic(database_url, "upgrade", "0028")
        assert to_0028.returncode == 0, to_0028.stdout + to_0028.stderr

        connection = await asyncpg.connect(database_url)
        try:
            await _seed_0028_assignment_graph(connection)
            assert (
                await connection.fetchval(
                    """
                    SELECT count(*)
                    FROM information_schema.columns
                    WHERE table_name = 'electrical_variant_objects'
                      AND column_name = 'version'
                    """
                )
                == 0
            )
        finally:
            await connection.close()

        upgraded = _run_alembic(database_url, "upgrade", "0029")
        assert upgraded.returncode == 0, upgraded.stdout + upgraded.stderr

        connection = await asyncpg.connect(database_url)
        try:
            assert await connection.fetchval("SELECT version_num FROM alembic_version") == "0029"
            rows = await connection.fetch(
                """
                SELECT object_id, system_type, assignment_state,
                       requested_cable_type, object_version_snapshot,
                       diagnostics, version
                FROM electrical_variant_objects
                WHERE electrical_variant_id =
                    '00000000-0000-0000-0000-000000002903'
                ORDER BY object_id
                """
            )
            assert [
                (
                    row["system_type"],
                    row["assignment_state"],
                    row["requested_cable_type"],
                    row["object_version_snapshot"],
                    row["version"],
                )
                for row in rows
            ] == [
                ("self_regulating", "error", "self_regulating", 7, 1),
                ("resistive", "stale", "three_core", 8, 1),
                ("mineral", "unsupported", "mineral", 9, 1),
                ("self_regulating", "ready", "self_regulating_tt", 10, 1),
            ]
            assert all(
                json.loads(row["diagnostics"])["migration_revision"] == "0029"
                for row in rows
            )
            assert (
                await connection.fetchval(
                    """
                    SELECT count(*)
                    FROM pg_indexes
                    WHERE tablename = 'electrical_variant_objects'
                      AND indexname =
                        'ix_electrical_variant_objects_variant_system_state'
                    """
                )
                == 1
            )
            constraint_names = set(
                await connection.fetch(
                    """
                    SELECT conname
                    FROM pg_constraint
                    WHERE conrelid = 'electrical_variant_objects'::regclass
                      AND conname LIKE 'ck_electrical_variant_objects_%'
                    """
                )
            )
            assert {
                "ck_electrical_variant_objects_assignment_version_positive",
                "ck_electrical_variant_objects_unassigned_system_null",
                "ck_electrical_variant_objects_ready_supported_system",
                "ck_electrical_variant_objects_unsupported_system_state",
            }.issubset({row["conname"] for row in constraint_names})

            with pytest.raises(asyncpg.CheckViolationError):
                await connection.execute(
                    """
                    UPDATE electrical_variant_objects
                    SET version = 0
                    WHERE object_id = '00000000-0000-0000-0000-000000002911'
                    """
                )
            with pytest.raises(asyncpg.CheckViolationError):
                await connection.execute(
                    """
                    UPDATE electrical_variant_objects
                    SET assignment_state = 'unassigned'
                    WHERE object_id = '00000000-0000-0000-0000-000000002912'
                    """
                )

            await connection.execute(
                """
                INSERT INTO project_objects (
                    id, project_id, object_type, sort_order, params, results,
                    is_valid, validation_errors, version
                ) VALUES (
                    '00000000-0000-0000-0000-000000002915',
                    '00000000-0000-0000-0000-000000002902',
                    'pipe', 50, '{}'::jsonb, '{}'::jsonb, true, '[]'::jsonb, 11
                )
                """
            )
            assert (
                await connection.fetchval(
                    """
                    SELECT version
                    FROM electrical_variant_objects
                    WHERE object_id = '00000000-0000-0000-0000-000000002915'
                    """
                )
                == 1
            )
        finally:
            await connection.close()

        downgraded = _run_alembic(database_url, "downgrade", "0028")
        assert downgraded.returncode == 0, downgraded.stdout + downgraded.stderr
        connection = await asyncpg.connect(database_url)
        try:
            assert await connection.fetchval("SELECT version_num FROM alembic_version") == "0028"
            assert (
                await connection.fetchval(
                    """
                    SELECT count(*)
                    FROM information_schema.columns
                    WHERE table_name = 'electrical_variant_objects'
                      AND column_name = 'version'
                    """
                )
                == 0
            )
            assert (
                await connection.fetchval(
                    """
                    SELECT count(*)
                    FROM pg_indexes
                    WHERE tablename = 'electrical_variant_objects'
                      AND indexname =
                        'ix_electrical_variant_objects_variant_system_state'
                    """
                )
                == 0
            )
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
