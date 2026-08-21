"""Focused invariants for the Phase 1A dynamic-ER expand migration."""

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
from sqlalchemy import delete, func, select, text
from sqlalchemy.exc import IntegrityError

from app.models.electrical_calculation import ElectricalCalculation
from app.models.electrical_variant import ElectricalVariant, ElectricalVariantObject
from app.models.guest_session import GuestSession
from app.models.project import Project
from app.models.project_object import ProjectObject

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
    database_url: str, command: str, revision: str
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


async def _seed_legacy_graph(connection: asyncpg.Connection) -> None:
    await connection.execute(
        """
        INSERT INTO guest_sessions (id, session_id)
        VALUES ('00000000-0000-0000-0000-000000000001', 'phase1a-migration')
        """
    )
    await connection.execute(
        """
        INSERT INTO projects (id, name, session_id) VALUES
            ('00000000-0000-0000-0000-000000000101', 'Empty', 'phase1a-migration'),
            ('00000000-0000-0000-0000-000000000102', 'Slot1', 'phase1a-migration'),
            ('00000000-0000-0000-0000-000000000103', 'Slot14', 'phase1a-migration')
        """
    )
    await connection.execute(
        """
        INSERT INTO project_objects (
            id, project_id, object_type, params, is_valid, version
        ) VALUES
            (
                '00000000-0000-0000-0000-000000000201',
                '00000000-0000-0000-0000-000000000102',
                'pipe', '{}', true, 2
            ),
            (
                '00000000-0000-0000-0000-000000000202',
                '00000000-0000-0000-0000-000000000103',
                'tank', '{}', true, 4
            )
        """
    )
    await connection.execute(
        """
        INSERT INTO electrical_calculations (
            id, project_id, object_id, variant_number,
            cable_type, cable_type_source, cable_mark, cable_mark_source,
            params, results
        ) VALUES
            (
                '00000000-0000-0000-0000-000000000301',
                '00000000-0000-0000-0000-000000000102',
                '00000000-0000-0000-0000-000000000201',
                1, 'self_regulating', 'auto', 'SRL-20', 'auto',
                '{}', '{"total_length": 12}'
            ),
            (
                '00000000-0000-0000-0000-000000000302',
                '00000000-0000-0000-0000-000000000103',
                '00000000-0000-0000-0000-000000000202',
                1, 'three_core', 'auto', 'TT-R3', 'auto',
                '{}', '{"total_length": 18}'
            ),
            (
                '00000000-0000-0000-0000-000000000303',
                '00000000-0000-0000-0000-000000000103',
                '00000000-0000-0000-0000-000000000202',
                4, 'single_core', 'auto', 'TT-R1', 'auto',
                '{}', '{"category": "stale", "stale": true, "error_code": "STALE"}'
            )
        """
    )
    await connection.execute(
        """
        INSERT INTO electrical_candidates (
            id, project_id, object_id, variant_number,
            cable_type, cable_source, cable_mark, mode, status, priority,
            is_recommended, is_pinned, is_applied, params, warnings,
            risk_flags, candidate_meta, dedupe_key
        ) VALUES (
            '00000000-0000-0000-0000-000000000401',
            '00000000-0000-0000-0000-000000000103',
            '00000000-0000-0000-0000-000000000202',
            4, 'single_core', 'builtin', 'TT-R1', 'manual', 'stale', 0,
            false, false, true, '{}', '[]', '[]', '{}', 'slot-4'
        )
        """
    )
    await connection.execute(
        """
        INSERT INTO electrical_candidate_folders (
            id, project_id, object_id, variant_number, name, created_by_session_id
        ) VALUES (
            '00000000-0000-0000-0000-000000000501',
            '00000000-0000-0000-0000-000000000103',
            '00000000-0000-0000-0000-000000000202',
            4, 'Slot 4 folder', 'phase1a-migration'
        )
        """
    )
    await connection.execute(
        """
        INSERT INTO specifications (
            id, project_id, variant_number, items, is_stale, stale_details, generation_mode
        ) VALUES (
            '00000000-0000-0000-0000-000000000601',
            '00000000-0000-0000-0000-000000000103',
            4, '[]', false, '{"before": "kept"}', 'full'
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
                '00000000-0000-0000-0000-000000000701',
                'electrical_batch', 'succeeded',
                '00000000-0000-0000-0000-000000000101',
                'phase1a-migration',
                '{"variant_number":2}'::jsonb,
                0, false, 0, 0
            ),
            (
                '00000000-0000-0000-0000-000000000702',
                'report_export', 'failed',
                '00000000-0000-0000-0000-000000000101',
                'phase1a-migration',
                '{"payload_version":2,"variant_number":3}'::jsonb,
                0, false, 0, 0
            )
        """
    )


def _migration_module() -> ModuleType:
    migration_path = (
        Path(__file__).resolve().parents[4]
        / "alembic"
        / "versions"
        / "0027_dynamic_electrical_variants_expand.py"
    )
    spec = importlib.util.spec_from_file_location("migration_0027", migration_path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_migration_projection_preserves_success_failure_and_unsupported_states():
    migration = _migration_module()

    assert migration.revision == "0027"
    assert migration.down_revision == "0026"
    assert migration._legacy_assignment_projection(
        "self_regulating",
        "SRL-20",
        {"total_length": 12.0},
    ) == ("self_regulating", "ready")
    assert migration._legacy_assignment_projection(
        "three_core",
        "TT-R3",
        {"total_length": 12.0},
    ) == ("resistive", "ready")
    assert migration._legacy_assignment_projection(
        "single_core",
        None,
        {"error_code": "POWER_TOO_HIGH", "category": "formula"},
    ) == (None, "error")
    assert migration._legacy_assignment_projection(
        "self_regulating",
        "SRL-20",
        {"category": "stale", "stale": True},
    ) == (None, "stale")
    assert migration._legacy_assignment_projection(
        "mineral",
        "MI-01",
        {"cable_mark": "MI-01"},
    ) == ("mineral", "unsupported")


@pytest.mark.asyncio(loop_scope="session")
async def test_alembic_0027_backfills_and_losslessly_downgrades_real_postgresql():
    database_name = f"phase1a_0027_{uuid.uuid4().hex}"
    admin_url, database_url = _database_urls(database_name)
    admin = await asyncpg.connect(admin_url)

    try:
        await admin.execute(f'CREATE DATABASE "{database_name}"')

        to_legacy = _run_alembic(database_url, "upgrade", "0026")
        assert to_legacy.returncode == 0, to_legacy.stdout + to_legacy.stderr

        connection = await asyncpg.connect(database_url)
        try:
            await _seed_legacy_graph(connection)
            await connection.execute(
                """
                INSERT INTO electrical_calculations (
                    id, project_id, object_id, variant_number,
                    cable_type, cable_type_source, cable_mark_source, params, results
                ) VALUES (
                    '00000000-0000-0000-0000-000000000399',
                    '00000000-0000-0000-0000-000000000101',
                    '00000000-0000-0000-0000-000000000201',
                    2, 'self_regulating', 'auto', 'auto', '{}',
                    '{"error_code": "DIRTY_SCOPE", "category": "validation"}'
                )
                """
            )
        finally:
            await connection.close()

        refused = _run_alembic(database_url, "upgrade", "0027")
        assert refused.returncode != 0
        assert "cross-project object reference" in refused.stdout + refused.stderr

        connection = await asyncpg.connect(database_url)
        try:
            assert await connection.fetchval("SELECT version_num FROM alembic_version") == "0026"
            assert await connection.fetchval("SELECT to_regclass('electrical_variants')") is None
            await connection.execute(
                """
                DELETE FROM electrical_calculations
                WHERE id = '00000000-0000-0000-0000-000000000399'
                """
            )
            before_counts = {
                table: await connection.fetchval(f"SELECT count(*) FROM {table}")
                for table in (
                    "electrical_calculations",
                    "electrical_candidates",
                    "electrical_candidate_folders",
                    "specifications",
                )
            }
        finally:
            await connection.close()

        upgraded = _run_alembic(database_url, "upgrade", "0027")
        assert upgraded.returncode == 0, upgraded.stdout + upgraded.stderr

        connection = await asyncpg.connect(database_url)
        try:
            variants = await connection.fetch(
                """
                SELECT project_row.name,
                       array_agg(
                           variant.legacy_variant_number
                           ORDER BY variant.sort_order
                       ) AS slots
                FROM projects AS project_row
                JOIN electrical_variants AS variant
                  ON variant.project_id = project_row.id
                GROUP BY project_row.id, project_row.name
                """
            )
            assert {row["name"]: list(row["slots"]) for row in variants} == {
                "Empty": [1, 2, 3],
                "Slot1": [1],
                "Slot14": [1, 4],
            }
            assert (
                await connection.fetchval(
                    """
                SELECT count(*)
                FROM electrical_variants
                WHERE name_normalized <> lower(name)
                """
                )
                == 0
            )
            assert (
                await connection.fetchval(
                    """
                SELECT count(*)
                FROM projects
                WHERE electrical_initialized_at IS NULL
                """
                )
                == 0
            )
            assert (
                await connection.fetchval(
                    """
                SELECT count(*)
                FROM (
                    SELECT project_id
                    FROM electrical_variants
                    GROUP BY project_id
                    HAVING count(*) FILTER (WHERE is_active) <> 1
                       OR min(legacy_variant_number) FILTER (WHERE is_active)
                          <> min(legacy_variant_number)
                ) AS invalid_active
                """
                )
                == 0
            )

            for table, expected_count in before_counts.items():
                assert await connection.fetchval(f"SELECT count(*) FROM {table}") == expected_count
                assert (
                    await connection.fetchval(
                        f"SELECT count(*) FROM {table} WHERE electrical_variant_id IS NULL"
                    )
                    == 0
                )
                assert (
                    await connection.fetchval(
                        f"""
                    SELECT count(*)
                    FROM {table} AS legacy_row
                    JOIN electrical_variants AS variant
                      ON variant.id = legacy_row.electrical_variant_id
                    WHERE variant.project_id <> legacy_row.project_id
                       OR variant.legacy_variant_number <> legacy_row.variant_number
                    """
                    )
                    == 0
                )

            assignments = await connection.fetch(
                """
                SELECT
                    project_row.name,
                    variant.legacy_variant_number AS slot,
                    assignment.system_type,
                    assignment.assignment_state,
                    assignment.diagnostics ->> 'legacy_error_code' AS error_code,
                    assignment.diagnostics ->> 'sections_status' AS sections_status
                FROM electrical_variant_objects AS assignment
                JOIN electrical_variants AS variant
                  ON variant.id = assignment.electrical_variant_id
                JOIN projects AS project_row ON project_row.id = assignment.project_id
                ORDER BY project_row.name, variant.legacy_variant_number
                """
            )
            assert [
                (row["name"], row["slot"], row["system_type"], row["assignment_state"])
                for row in assignments
            ] == [
                ("Slot1", 1, "self_regulating", "ready"),
                ("Slot14", 1, "resistive", "ready"),
                ("Slot14", 4, None, "stale"),
            ]
            assert assignments[-1]["error_code"] == "STALE"
            assert all(row["sections_status"] == "not_ready" for row in assignments)
            assert await connection.fetchval("SELECT count(*) FROM electrical_variant_objects") == 3
            assignment_trigger_function = await connection.fetchval(
                """
                SELECT pg_get_functiondef(
                    'tlt_0027_sync_project_object_assignments()'::regprocedure
                )
                """
            )
            assert "FOR NO KEY UPDATE" in assignment_trigger_function

            specification_state = await connection.fetchrow(
                """
                SELECT is_stale, stale_reason,
                       stale_details ->> 'error_code' AS error_code,
                       stale_details::text AS stale_details
                FROM specifications
                """
            )
            assert tuple(specification_state)[:3] == (
                True,
                "electrical_sections_not_ready",
                "ELECTRICAL_SECTIONS_NOT_READY",
            )
            original_stale_details = specification_state["stale_details"]

            hash_column = await connection.fetchrow(
                """
                SELECT data_type, character_maximum_length, is_nullable
                FROM information_schema.columns
                WHERE table_name = 'electrical_variants'
                  AND column_name = 'creation_idempotency_key_hash'
                """
            )
            assert hash_column == ("character varying", 64, "YES")
            assert (
                await connection.fetchval(
                    """
                SELECT count(*)
                FROM pg_constraint
                WHERE conrelid = 'electrical_variants'::regclass
                  AND conname IN (
                      'ck_electrical_variants_creation_idempotency_hash',
                      'uq_electrical_variants_project_creation_idempotency_hash',
                      'uq_electrical_variants_id_project_legacy'
                  )
                """
                )
                == 3
            )

            await connection.execute(
                """
                INSERT INTO projects (
                    id, name, session_id, electrical_initialized_at
                ) VALUES (
                    '00000000-0000-0000-0000-000000000910',
                    'Trigger and cascade',
                    'phase1a-migration',
                    now()
                )
                """
            )
            await connection.execute(
                """
                INSERT INTO electrical_variants (
                    id, project_id, name, name_normalized, sort_order,
                    is_active, copied_from_id, legacy_variant_number,
                    creation_idempotency_key_hash
                ) VALUES
                    (
                        '00000000-0000-0000-0000-000000000911',
                        '00000000-0000-0000-0000-000000000910',
                        'ЭР1', 'эр1', 0, true, NULL, 1,
                        repeat('a', 64)
                    ),
                    (
                        '00000000-0000-0000-0000-000000000912',
                        '00000000-0000-0000-0000-000000000910',
                        'ЭР2', 'эр2', 1, false,
                        '00000000-0000-0000-0000-000000000911', 2,
                        repeat('b', 64)
                    )
                """
            )
            await connection.execute(
                """
                INSERT INTO project_objects (
                    id, project_id, object_type, params, is_valid, version
                ) VALUES (
                    '00000000-0000-0000-0000-000000000913',
                    '00000000-0000-0000-0000-000000000910',
                    'pipe', '{}', true, 7
                )
                """
            )
            synced_assignments = await connection.fetch(
                """
                SELECT electrical_variant_id, project_id, object_version_snapshot,
                       assignment_state
                FROM electrical_variant_objects
                WHERE object_id = '00000000-0000-0000-0000-000000000913'
                ORDER BY electrical_variant_id
                """
            )
            assert len(synced_assignments) == 2
            assert {str(row["electrical_variant_id"]) for row in synced_assignments} == {
                "00000000-0000-0000-0000-000000000911",
                "00000000-0000-0000-0000-000000000912",
            }
            assert all(
                str(row["project_id"]) == "00000000-0000-0000-0000-000000000910"
                and row["object_version_snapshot"] == 7
                and row["assignment_state"] == "unassigned"
                for row in synced_assignments
            )

            await connection.execute(
                """
                INSERT INTO electrical_calculations (
                    id, project_id, object_id, variant_number,
                    cable_type, cable_type_source, cable_mark_source, params
                ) VALUES (
                    '00000000-0000-0000-0000-000000000921',
                    '00000000-0000-0000-0000-000000000910',
                    '00000000-0000-0000-0000-000000000913',
                    1, 'self_regulating', 'auto', 'auto', '{}'
                )
                """
            )
            await connection.execute(
                """
                INSERT INTO electrical_candidates (
                    id, project_id, object_id, variant_number,
                    cable_type, cable_source, cable_mark, mode, status, priority,
                    is_recommended, is_pinned, is_applied, params, warnings,
                    risk_flags, candidate_meta, dedupe_key
                ) VALUES (
                    '00000000-0000-0000-0000-000000000922',
                    '00000000-0000-0000-0000-000000000910',
                    '00000000-0000-0000-0000-000000000913',
                    1, 'self_regulating', 'builtin', 'SRL-20', 'manual',
                    'applicable', 0, false, false, false, '{}', '[]', '[]',
                    '{}', 'trigger-candidate'
                )
                """
            )
            await connection.execute(
                """
                INSERT INTO electrical_candidate_folders (
                    id, project_id, object_id, variant_number, name,
                    created_by_session_id
                ) VALUES (
                    '00000000-0000-0000-0000-000000000923',
                    '00000000-0000-0000-0000-000000000910',
                    '00000000-0000-0000-0000-000000000913',
                    1, 'Trigger folder', 'phase1a-migration'
                )
                """
            )
            await connection.execute(
                """
                INSERT INTO specifications (
                    id, project_id, variant_number, items, generation_mode
                ) VALUES (
                    '00000000-0000-0000-0000-000000000924',
                    '00000000-0000-0000-0000-000000000910',
                    1, '[]', 'full'
                )
                """
            )
            synced_downstream = await connection.fetch(
                """
                SELECT electrical_variant_id
                FROM electrical_calculations
                WHERE id = '00000000-0000-0000-0000-000000000921'
                UNION ALL
                SELECT electrical_variant_id
                FROM electrical_candidates
                WHERE id = '00000000-0000-0000-0000-000000000922'
                UNION ALL
                SELECT electrical_variant_id
                FROM electrical_candidate_folders
                WHERE id = '00000000-0000-0000-0000-000000000923'
                UNION ALL
                SELECT electrical_variant_id
                FROM specifications
                WHERE id = '00000000-0000-0000-0000-000000000924'
                """
            )
            assert [str(row["electrical_variant_id"]) for row in synced_downstream] == [
                "00000000-0000-0000-0000-000000000911"
            ] * 4

            with pytest.raises(asyncpg.ForeignKeyViolationError) as mismatch:
                await connection.execute(
                    """
                    UPDATE electrical_calculations
                    SET electrical_variant_id =
                        '00000000-0000-0000-0000-000000000912'
                    WHERE id = '00000000-0000-0000-0000-000000000921'
                    """
                )
            assert "fk_electrical_calculations_variant_project_legacy" in str(mismatch.value)

            await connection.execute(
                """
                INSERT INTO specifications (
                    id, project_id, variant_number, items
                ) VALUES (
                    '00000000-0000-0000-0000-000000000925',
                    '00000000-0000-0000-0000-000000000910',
                    3, '[]'
                )
                """
            )
            assert (
                await connection.fetchval(
                    """
                SELECT electrical_variant_id
                FROM specifications
                WHERE id = '00000000-0000-0000-0000-000000000925'
                """
                )
                is None
            )

            with pytest.raises(asyncpg.CheckViolationError):
                await connection.execute(
                    """
                    UPDATE electrical_variants
                    SET creation_idempotency_key_hash = repeat('A', 64)
                    WHERE id = '00000000-0000-0000-0000-000000000911'
                    """
                )
            with pytest.raises(asyncpg.UniqueViolationError):
                await connection.execute(
                    """
                    UPDATE electrical_variants
                    SET creation_idempotency_key_hash = repeat('a', 64)
                    WHERE id = '00000000-0000-0000-0000-000000000912'
                    """
                )

            await connection.execute(
                """
                INSERT INTO projects (
                    id, name, session_id, electrical_initialized_at
                ) VALUES (
                    '00000000-0000-0000-0000-000000000930',
                    'Hash scope', 'phase1a-migration', now()
                );
                INSERT INTO electrical_variants (
                    id, project_id, name, name_normalized, sort_order,
                    is_active, legacy_variant_number,
                    creation_idempotency_key_hash
                ) VALUES (
                    '00000000-0000-0000-0000-000000000931',
                    '00000000-0000-0000-0000-000000000930',
                    'ЭР1', 'эр1', 0, true, 1, repeat('a', 64)
                )
                """
            )
            assert (
                await connection.fetchval(
                    """
                SELECT creation_idempotency_key_hash
                FROM electrical_variants
                WHERE id = '00000000-0000-0000-0000-000000000931'
                """
                )
                == "a" * 64
            )
            await connection.execute(
                """
                DELETE FROM projects
                WHERE id IN (
                    '00000000-0000-0000-0000-000000000910',
                    '00000000-0000-0000-0000-000000000930'
                )
                """
            )
            assert (
                await connection.fetchval(
                    """
                SELECT count(*)
                FROM electrical_variants
                WHERE project_id IN (
                    '00000000-0000-0000-0000-000000000910',
                    '00000000-0000-0000-0000-000000000930'
                )
                """
                )
                == 0
            )
            assert (
                await connection.fetchval(
                    """
                SELECT count(*)
                FROM electrical_variant_objects
                WHERE object_id = '00000000-0000-0000-0000-000000000913'
                """
                )
                == 0
            )
        finally:
            await connection.close()

        connection = await asyncpg.connect(database_url)
        try:
            await connection.execute(
                """
                UPDATE electrical_variants
                SET creation_idempotency_key_hash = repeat('c', 64)
                WHERE project_id = '00000000-0000-0000-0000-000000000101'
                  AND legacy_variant_number = 1
                """
            )
        finally:
            await connection.close()
        refused_idempotency_state = _run_alembic(database_url, "downgrade", "0026")
        assert refused_idempotency_state.returncode != 0
        assert "cannot be represented by legacy slots" in (
            refused_idempotency_state.stdout + refused_idempotency_state.stderr
        )

        connection = await asyncpg.connect(database_url)
        try:
            await connection.execute(
                """
                UPDATE electrical_variants
                SET creation_idempotency_key_hash = NULL
                WHERE project_id = '00000000-0000-0000-0000-000000000101'
                  AND legacy_variant_number = 1
                """
            )
        finally:
            await connection.close()

        connection = await asyncpg.connect(database_url)
        try:
            await connection.execute(
                """
                UPDATE specifications
                SET stale_details = stale_details || '{"post_migration":true}'::jsonb
                """
            )
        finally:
            await connection.close()
        refused_changed_spec = _run_alembic(database_url, "downgrade", "0026")
        assert refused_changed_spec.returncode != 0
        assert "changed and cannot be restored safely" in (
            refused_changed_spec.stdout + refused_changed_spec.stderr
        )

        connection = await asyncpg.connect(database_url)
        try:
            await connection.execute(
                "UPDATE specifications SET stale_details = $1::jsonb",
                original_stale_details,
            )
            await connection.execute(
                """
                UPDATE specifications
                SET stale_details = stale_details - '_0027_previous_stale'
                """
            )
        finally:
            await connection.close()
        refused_missing_marker = _run_alembic(database_url, "downgrade", "0026")
        assert refused_missing_marker.returncode != 0
        assert "lost its restoration marker" in (
            refused_missing_marker.stdout + refused_missing_marker.stderr
        )

        connection = await asyncpg.connect(database_url)
        try:
            await connection.execute(
                "UPDATE specifications SET stale_details = $1::jsonb",
                original_stale_details,
            )
        finally:
            await connection.close()

        downgraded = _run_alembic(database_url, "downgrade", "0026")
        assert downgraded.returncode == 0, downgraded.stdout + downgraded.stderr

        connection = await asyncpg.connect(database_url)
        try:
            assert await connection.fetchval("SELECT version_num FROM alembic_version") == "0026"
            assert await connection.fetchval("SELECT to_regclass('electrical_variants')") is None
            for table, expected_count in before_counts.items():
                assert await connection.fetchval(f"SELECT count(*) FROM {table}") == expected_count
            restored_specification = await connection.fetchrow(
                """
                SELECT is_stale, stale_reason, stale_details ->> 'before'
                FROM specifications
                """
            )
            assert restored_specification == (False, None, "kept")
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


@pytest.mark.asyncio(loop_scope="session")
async def test_new_project_can_remain_uninitialized_without_variants(db_session):
    guest = GuestSession(session_id="phase1a-zero-er")
    project = Project(name="Новый проект без ЭР", session_id=guest.session_id)
    db_session.add_all([guest, project])
    await db_session.flush()

    variant_count = await db_session.scalar(
        select(func.count(ElectricalVariant.id)).where(ElectricalVariant.project_id == project.id)
    )
    assert project.electrical_initialized_at is None
    assert variant_count == 0


@pytest.mark.asyncio(loop_scope="session")
async def test_variant_name_and_active_indexes_are_project_scoped(db_session):
    guest = GuestSession(session_id="phase1a-indexes")
    project = Project(name="Индексы ЭР", session_id=guest.session_id)
    db_session.add_all([guest, project])
    await db_session.flush()

    db_session.add(
        ElectricalVariant(
            project_id=project.id,
            name="ЭР1",
            name_normalized="эр1",
            sort_order=0,
            is_active=True,
            legacy_variant_number=1,
        )
    )
    await db_session.flush()

    db_session.add(
        ElectricalVariant(
            project_id=project.id,
            name="Straße",
            name_normalized="strasse",
            sort_order=1,
            is_active=False,
            legacy_variant_number=2,
        )
    )
    await db_session.flush()

    with pytest.raises(IntegrityError) as duplicate_name:
        async with db_session.begin_nested():
            db_session.add(
                ElectricalVariant(
                    project_id=project.id,
                    name="STRASSE",
                    name_normalized="strasse",
                    sort_order=2,
                    is_active=False,
                    legacy_variant_number=3,
                )
            )
            await db_session.flush()
    assert "ux_electrical_variants_project_normalized_name" in str(duplicate_name.value.orig)

    with pytest.raises(IntegrityError) as duplicate_active:
        async with db_session.begin_nested():
            db_session.add(
                ElectricalVariant(
                    project_id=project.id,
                    name="ЭР3",
                    name_normalized="эр3",
                    sort_order=2,
                    is_active=True,
                    legacy_variant_number=3,
                )
            )
            await db_session.flush()
    assert "ux_electrical_variants_project_active" in str(duplicate_active.value.orig)


@pytest.mark.asyncio(loop_scope="session")
async def test_assignment_and_downstream_rows_reject_foreign_object_scope(db_session):
    guest = GuestSession(session_id="phase1a-assignment-scope")
    project_a = Project(name="Проект A", session_id=guest.session_id)
    project_b = Project(name="Проект B", session_id=guest.session_id)
    db_session.add_all([guest, project_a, project_b])
    await db_session.flush()

    object_a = ProjectObject(
        project_id=project_a.id,
        object_type="pipe",
        params={},
        is_valid=True,
    )
    object_without_assignment = ProjectObject(
        project_id=project_a.id,
        object_type="pipe",
        params={},
        is_valid=True,
    )
    foreign_object = ProjectObject(
        project_id=project_b.id,
        object_type="tank",
        params={},
        is_valid=True,
    )
    variant = ElectricalVariant(
        project_id=project_a.id,
        name="ЭР1",
        name_normalized="эр1",
        sort_order=0,
        is_active=True,
        legacy_variant_number=1,
    )
    db_session.add_all([object_a, object_without_assignment, foreign_object, variant])
    await db_session.flush()

    assignment_count = await db_session.scalar(
        select(func.count(ElectricalVariantObject.id)).where(
            ElectricalVariantObject.electrical_variant_id == variant.id,
            ElectricalVariantObject.object_id.in_([object_a.id, object_without_assignment.id]),
        )
    )
    assert assignment_count == 2

    with pytest.raises(IntegrityError) as cross_project_copy:
        async with db_session.begin_nested():
            db_session.add(
                ElectricalVariant(
                    project_id=project_b.id,
                    name="Cross-project copy",
                    name_normalized="cross-project copy",
                    sort_order=0,
                    is_active=True,
                    copied_from_id=variant.id,
                    legacy_variant_number=1,
                )
            )
            await db_session.flush()
            await db_session.execute(
                text("SET CONSTRAINTS fk_electrical_variants_copied_from_project IMMEDIATE")
            )
    assert "fk_electrical_variants_copied_from_project" in str(cross_project_copy.value.orig)

    await db_session.execute(
        delete(ElectricalVariantObject).where(
            ElectricalVariantObject.electrical_variant_id == variant.id,
            ElectricalVariantObject.object_id == object_without_assignment.id,
        )
    )
    await db_session.flush()

    with pytest.raises(IntegrityError) as foreign_assignment:
        async with db_session.begin_nested():
            db_session.add(
                ElectricalVariantObject(
                    project_id=project_a.id,
                    electrical_variant_id=variant.id,
                    object_id=foreign_object.id,
                    assignment_state="unassigned",
                    object_version_snapshot=foreign_object.version,
                    diagnostics={},
                )
            )
            await db_session.flush()
    assert "fk_electrical_variant_objects_object_project" in str(foreign_assignment.value.orig)

    with pytest.raises(IntegrityError) as missing_assignment:
        async with db_session.begin_nested():
            db_session.add(
                ElectricalCalculation(
                    project_id=project_a.id,
                    object_id=object_without_assignment.id,
                    variant_number=1,
                    electrical_variant_id=variant.id,
                    cable_type="self_regulating",
                    cable_type_source="auto",
                    cable_mark="SRL-20",
                    cable_mark_source="auto",
                    params={},
                    results={"total_length": 12.0},
                )
            )
            await db_session.flush()
    assert "fk_electrical_calculations_variant_object_assignment" in str(
        missing_assignment.value.orig
    )
