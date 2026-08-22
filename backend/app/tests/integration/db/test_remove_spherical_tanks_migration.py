"""PostgreSQL lifecycle proof for the legacy tank cleanup migration."""

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
async def test_0044_removes_only_spherical_tanks_and_all_dependent_data() -> None:
    database_name = f"remove_spherical_tanks_0044_{uuid.uuid4().hex}"
    admin_url, database_url = _database_urls(database_name)
    admin = await asyncpg.connect(admin_url)
    try:
        await admin.execute(f'CREATE DATABASE "{database_name}"')
        upgraded_0043 = _alembic(database_url, "upgrade", "0043")
        assert upgraded_0043.returncode == 0, upgraded_0043.stdout + upgraded_0043.stderr

        connection = await asyncpg.connect(database_url)
        try:
            await connection.execute(
                """
                INSERT INTO guest_sessions (id, session_id)
                VALUES ('00000000-0000-0000-0000-000000004401', 'tank-cleanup-0044');

                INSERT INTO projects (id, name, session_id, electrical_initialized_at)
                VALUES (
                    '00000000-0000-0000-0000-000000004410',
                    'Tank cleanup migration proof',
                    'tank-cleanup-0044',
                    now()
                );

                INSERT INTO electrical_variants (
                    id, project_id, name, name_normalized, sort_order,
                    is_active
                ) VALUES
                    (
                        '00000000-0000-0000-0000-000000004421',
                        '00000000-0000-0000-0000-000000004410',
                        'ER cleanup', 'er cleanup', 0, true
                    ),
                    (
                        '00000000-0000-0000-0000-000000004422',
                        '00000000-0000-0000-0000-000000004410',
                        'ER retained', 'er retained', 1, false
                    );

                INSERT INTO project_objects (
                    id, project_id, object_type, sort_order, params, results, is_valid, version
                ) VALUES
                    (
                        '00000000-0000-0000-0000-000000004431',
                        '00000000-0000-0000-0000-000000004410',
                        'tank', 0, '{"shape":"spherical"}'::jsonb,
                        '{"total_heat_loss_design":100}'::jsonb, true, 1
                    ),
                    (
                        '00000000-0000-0000-0000-000000004432',
                        '00000000-0000-0000-0000-000000004410',
                        'tank', 1, '{"shape":"cylindrical"}'::jsonb,
                        '{"total_heat_loss_design":200}'::jsonb, true, 1
                    ),
                    (
                        '00000000-0000-0000-0000-000000004433',
                        '00000000-0000-0000-0000-000000004410',
                        'tank', 2, '{"shape":"rectangular"}'::jsonb,
                        '{"total_heat_loss_design":300}'::jsonb, true, 1
                    ),
                    (
                        '00000000-0000-0000-0000-000000004434',
                        '00000000-0000-0000-0000-000000004410',
                        'pipe', 3, '{"shape":"spherical"}'::jsonb,
                        NULL, false, 1
                    );

                UPDATE electrical_variant_objects
                SET system_type = 'self_regulating', assignment_state = 'ready'
                WHERE (electrical_variant_id, object_id) IN (
                    VALUES
                        (
                            '00000000-0000-0000-0000-000000004421'::uuid,
                            '00000000-0000-0000-0000-000000004431'::uuid
                        ),
                        (
                            '00000000-0000-0000-0000-000000004421'::uuid,
                            '00000000-0000-0000-0000-000000004432'::uuid
                        ),
                        (
                            '00000000-0000-0000-0000-000000004422'::uuid,
                            '00000000-0000-0000-0000-000000004433'::uuid
                        )
                );

                INSERT INTO electrical_calculations (
                    id, project_id, object_id, electrical_variant_id,
                    cable_type, cable_type_source, cable_mark, cable_mark_source,
                    params, results
                ) VALUES
                    (
                        '00000000-0000-0000-0000-000000004441',
                        '00000000-0000-0000-0000-000000004410',
                        '00000000-0000-0000-0000-000000004431',
                        '00000000-0000-0000-0000-000000004421',
                        'self_regulating_tt', 'auto', '30TT', 'auto',
                        '{}'::jsonb, '{"status":"ready"}'::jsonb
                    ),
                    (
                        '00000000-0000-0000-0000-000000004442',
                        '00000000-0000-0000-0000-000000004410',
                        '00000000-0000-0000-0000-000000004432',
                        '00000000-0000-0000-0000-000000004421',
                        'self_regulating_tt', 'auto', '30TT', 'auto',
                        '{}'::jsonb, '{"status":"ready"}'::jsonb
                    );

                INSERT INTO electrical_candidates (
                    id, project_id, object_id, electrical_variant_id,
                    cable_type, cable_source, cable_mark, dedupe_key, mode, status,
                    priority, is_recommended, is_pinned, is_applied,
                    params, warnings, risk_flags, candidate_meta
                ) VALUES
                    (
                        '00000000-0000-0000-0000-000000004451',
                        '00000000-0000-0000-0000-000000004410',
                        '00000000-0000-0000-0000-000000004431',
                        '00000000-0000-0000-0000-000000004421',
                        'self_regulating_tt', 'builtin', '30TT', 'sphere-candidate',
                        'auto', 'applicable', 1, true, false, true,
                        '{}'::jsonb, '[]'::jsonb, '[]'::jsonb, '{}'::jsonb
                    ),
                    (
                        '00000000-0000-0000-0000-000000004452',
                        '00000000-0000-0000-0000-000000004410',
                        '00000000-0000-0000-0000-000000004432',
                        '00000000-0000-0000-0000-000000004421',
                        'self_regulating_tt', 'builtin', '30TT', 'cylinder-candidate',
                        'auto', 'applicable', 1, true, false, true,
                        '{}'::jsonb, '[]'::jsonb, '[]'::jsonb, '{}'::jsonb
                    );

                INSERT INTO electrical_candidate_folders (
                    id, project_id, object_id, electrical_variant_id,
                    name, sort_order, created_by_session_id
                ) VALUES
                    (
                        '00000000-0000-0000-0000-000000004461',
                        '00000000-0000-0000-0000-000000004410',
                        '00000000-0000-0000-0000-000000004431',
                        '00000000-0000-0000-0000-000000004421',
                        'Sphere folder', 0, 'tank-cleanup-0044'
                    ),
                    (
                        '00000000-0000-0000-0000-000000004462',
                        '00000000-0000-0000-0000-000000004410',
                        '00000000-0000-0000-0000-000000004432',
                        '00000000-0000-0000-0000-000000004421',
                        'Cylinder folder', 0, 'tank-cleanup-0044'
                    );

                INSERT INTO electrical_candidate_folder_items (folder_id, candidate_id)
                VALUES
                    (
                        '00000000-0000-0000-0000-000000004461',
                        '00000000-0000-0000-0000-000000004451'
                    ),
                    (
                        '00000000-0000-0000-0000-000000004462',
                        '00000000-0000-0000-0000-000000004452'
                    );

                INSERT INTO specifications (
                    id, project_id, electrical_variant_id, items, snapshot,
                    generation_status, generation_diagnostics, generation_candidate_groups
                ) VALUES
                    (
                        '00000000-0000-0000-0000-000000004471',
                        '00000000-0000-0000-0000-000000004410',
                        '00000000-0000-0000-0000-000000004421',
                        '[{"object_id":"00000000-0000-0000-0000-000000004431"}]'::jsonb,
                        '{"status":"generated"}'::jsonb,
                        'generated', '[{"code":"before"}]'::jsonb, '[{"key":"before"}]'::jsonb
                    ),
                    (
                        '00000000-0000-0000-0000-000000004472',
                        '00000000-0000-0000-0000-000000004410',
                        '00000000-0000-0000-0000-000000004422',
                        '[{"object_id":"00000000-0000-0000-0000-000000004433"}]'::jsonb,
                        '{"status":"generated"}'::jsonb,
                        'generated', '[]'::jsonb, '[]'::jsonb
                    );
                """
            )
        finally:
            await connection.close()

        upgraded_0044 = _alembic(database_url, "upgrade", "0044")
        output = upgraded_0044.stdout + upgraded_0044.stderr
        assert upgraded_0044.returncode == 0, output
        assert "0044 removed 1 spherical tank project object(s)" in output

        connection = await asyncpg.connect(database_url)
        try:
            remaining_objects = await connection.fetch(
                "SELECT id, object_type, params ->> 'shape' AS shape FROM project_objects ORDER BY id"
            )
            assert [
                (str(row["id"]), row["object_type"], row["shape"]) for row in remaining_objects
            ] == [
                ("00000000-0000-0000-0000-000000004432", "tank", "cylindrical"),
                ("00000000-0000-0000-0000-000000004433", "tank", "rectangular"),
                ("00000000-0000-0000-0000-000000004434", "pipe", "spherical"),
            ]

            for table in (
                "electrical_variant_objects",
                "electrical_calculations",
                "electrical_calculation_revisions",
                "electrical_candidates",
                "electrical_candidate_folders",
            ):
                count = await connection.fetchval(
                    f"SELECT count(*) FROM {table} WHERE object_id = $1",
                    uuid.UUID("00000000-0000-0000-0000-000000004431"),
                )
                assert count == 0, table
            assert (
                await connection.fetchval(
                    """
                SELECT count(*)
                FROM electrical_candidate_folder_items
                WHERE folder_id = '00000000-0000-0000-0000-000000004461'
                   OR candidate_id = '00000000-0000-0000-0000-000000004451'
                """
                )
                == 0
            )
            assert (
                await connection.fetchval(
                    """
                SELECT count(*)
                FROM electrical_calculation_revisions
                WHERE object_id = '00000000-0000-0000-0000-000000004432'
                """
                )
                == 1
            )
            assert (
                await connection.fetchval(
                    """
                SELECT count(*)
                FROM electrical_candidate_folder_items
                WHERE folder_id = '00000000-0000-0000-0000-000000004462'
                  AND candidate_id = '00000000-0000-0000-0000-000000004452'
                """
                )
                == 1
            )

            affected_specification = await connection.fetchrow(
                """
                SELECT items, snapshot, is_stale, stale_reason, stale_details,
                       generation_status, generation_diagnostics,
                       generation_candidate_groups
                FROM specifications
                WHERE id = '00000000-0000-0000-0000-000000004471'
                """
            )
            assert affected_specification is not None
            assert json.loads(affected_specification["items"]) == []
            assert affected_specification["snapshot"] is None
            assert affected_specification["is_stale"] is True
            assert affected_specification["stale_reason"] == "object_deleted"
            assert (
                json.loads(affected_specification["stale_details"])["migration_revision"] == "0044"
            )
            assert affected_specification["generation_status"] is None
            assert json.loads(affected_specification["generation_diagnostics"]) == []
            assert json.loads(affected_specification["generation_candidate_groups"]) == []

            retained_specification = await connection.fetchrow(
                """
                SELECT items, snapshot, is_stale, generation_status
                FROM specifications
                WHERE id = '00000000-0000-0000-0000-000000004472'
                """
            )
            assert retained_specification is not None
            assert json.loads(retained_specification["items"]) != []
            assert json.loads(retained_specification["snapshot"]) == {"status": "generated"}
            assert retained_specification["is_stale"] is False
            assert retained_specification["generation_status"] == "generated"

            trigger_exists = await connection.fetchval(
                """
                SELECT EXISTS (
                    SELECT 1 FROM pg_trigger
                    WHERE tgrelid = 'electrical_calculation_revisions'::regclass
                      AND tgname = 'tr_electrical_calculation_revisions_immutable'
                      AND NOT tgisinternal
                )
                """
            )
            assert trigger_exists is True
            with pytest.raises(asyncpg.RaiseError):
                await connection.execute(
                    """
                    DELETE FROM electrical_calculation_revisions
                    WHERE object_id = '00000000-0000-0000-0000-000000004432'
                    """
                )
        finally:
            await connection.close()

        downgraded = _alembic(database_url, "downgrade", "0043")
        assert downgraded.returncode == 0, downgraded.stdout + downgraded.stderr
        reupgraded = _alembic(database_url, "upgrade", "0044")
        reupgrade_output = reupgraded.stdout + reupgraded.stderr
        assert reupgraded.returncode == 0, reupgrade_output
        assert "0044 removed 0 spherical tank project object(s)" in reupgrade_output
    finally:
        await admin.execute(
            "SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
            "WHERE datname = $1 AND pid <> pg_backend_pid()",
            database_name,
        )
        await admin.execute(f'DROP DATABASE IF EXISTS "{database_name}"')
        await admin.close()
