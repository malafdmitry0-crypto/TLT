"""Fresh-install acceptance proof for UUID-only electrical identity."""

from __future__ import annotations

import os
import subprocess
import uuid
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

import asyncpg
import pytest

_BACKEND_ROOT = Path(__file__).resolve().parents[4]
_UUID_IDENTITY_TABLES = (
    "electrical_calculations",
    "electrical_candidates",
    "electrical_candidate_folders",
    "specifications",
    "electrical_calculation_revisions",
)
_RETIRED_IDENTIFIERS = ("variant_number", "legacy_variant_number")


def _database_urls(database_name: str) -> tuple[str, str]:
    configured = os.getenv(
        "TEST_DATABASE_URL",
        "postgresql+asyncpg://test:test@localhost:5433/heatcalc_test",
    )
    parsed = urlsplit(configured.replace("postgresql+asyncpg://", "postgresql://", 1))
    admin_url = urlunsplit(parsed._replace(path="/postgres", query="", fragment=""))
    database_url = urlunsplit(parsed._replace(path=f"/{database_name}", query="", fragment=""))
    return admin_url, database_url


def _upgrade_head(database_url: str) -> subprocess.CompletedProcess[str]:
    env = os.environ.copy()
    env["DATABASE_URL"] = database_url.replace("postgresql://", "postgresql+asyncpg://", 1)
    return subprocess.run(
        ["alembic", "upgrade", "head"],
        cwd=_BACKEND_ROOT,
        env=env,
        check=False,
        capture_output=True,
        text=True,
    )


@pytest.mark.asyncio(loop_scope="session")
async def test_fresh_install_has_uuid_only_electrical_identity_contract() -> None:
    database_name = f"uuid_identity_fresh_{uuid.uuid4().hex}"
    admin_url, database_url = _database_urls(database_name)
    admin = await asyncpg.connect(admin_url)
    try:
        await admin.execute(f'CREATE DATABASE "{database_name}"')
        upgraded = _upgrade_head(database_url)
        assert upgraded.returncode == 0, upgraded.stdout + upgraded.stderr

        connection = await asyncpg.connect(database_url)
        try:
            assert await connection.fetchval("SELECT version_num FROM alembic_version") == "0057"

            retired_columns = await connection.fetch(
                """
                SELECT table_schema, table_name, column_name
                FROM information_schema.columns
                WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
                  AND column_name = ANY($1::text[])
                """,
                list(_RETIRED_IDENTIFIERS),
            )
            assert retired_columns == []

            identity_columns = await connection.fetch(
                """
                SELECT table_name, data_type, is_nullable
                FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND column_name = 'electrical_variant_id'
                  AND table_name = ANY($1::text[])
                ORDER BY table_name
                """,
                list(_UUID_IDENTITY_TABLES),
            )
            assert {
                row["table_name"]: (row["data_type"], row["is_nullable"])
                for row in identity_columns
            } == {table: ("uuid", "NO") for table in _UUID_IDENTITY_TABLES}

            cable_type_values = await connection.fetch(
                """
                SELECT enumlabel
                FROM pg_enum
                JOIN pg_type ON pg_type.oid = pg_enum.enumtypid
                WHERE pg_type.typname = 'cable_type'
                ORDER BY enumsortorder
                """
            )
            assert [row["enumlabel"] for row in cable_type_values] == [
                "self_regulating",
                "single_core",
                "three_core",
            ]

            supported_type_constraints = set(
                await connection.fetchval(
                    """
                    SELECT array_agg(conname ORDER BY conname)
                    FROM pg_constraint
                    WHERE conname = ANY($1::text[])
                    """,
                    [
                        "ck_cables_extended_supported_type",
                        "ck_electrical_calculations_supported_cable_type",
                        "ck_electrical_calculation_revisions_supported_cable_type",
                        "ck_electrical_candidates_supported_cable_type",
                        "ck_electrical_variant_objects_requested_cable_type",
                    ],
                )
                or []
            )
            assert supported_type_constraints == {
                "ck_cables_extended_supported_type",
                "ck_electrical_calculations_supported_cable_type",
                "ck_electrical_calculation_revisions_supported_cable_type",
                "ck_electrical_candidates_supported_cable_type",
                "ck_electrical_variant_objects_requested_cable_type",
            }

            diagnostics_default = await connection.fetchval(
                """
                SELECT column_default
                FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND table_name = 'electrical_variant_objects'
                  AND column_name = 'diagnostics'
                """
            )
            assert diagnostics_default is not None
            assert "legacy_success" not in diagnostics_default

            routine_sources = await connection.fetchval(
                """
                SELECT coalesce(string_agg(pg_get_functiondef(oid), E'\\n'), '')
                FROM pg_proc
                WHERE pronamespace = 'public'::regnamespace
                """
            )
            schema_definitions = "\n".join(
                (
                    routine_sources,
                    await connection.fetchval(
                        """
                        SELECT coalesce(string_agg(pg_get_triggerdef(oid), E'\\n'), '')
                        FROM pg_trigger
                        WHERE NOT tgisinternal
                        """
                    ),
                    await connection.fetchval(
                        """
                        SELECT coalesce(string_agg(indexdef, E'\\n'), '')
                        FROM pg_indexes
                        WHERE schemaname = 'public'
                        """
                    ),
                )
            )
            for retired in (*_RETIRED_IDENTIFIERS, "legacy_success"):
                assert retired not in schema_definitions

            triggers = set(
                await connection.fetchval(
                    """
                    SELECT array_agg(tgname ORDER BY tgname)
                    FROM pg_trigger
                    WHERE NOT tgisinternal
                    """
                )
                or []
            )
            assert "trg_0027_sync_project_object_assignments" in triggers
            assert "trg_0047_enforce_electrical_variant_limit" in triggers
        finally:
            await connection.close()
    finally:
        await admin.execute(
            "SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
            "WHERE datname = $1 AND pid <> pg_backend_pid()",
            database_name,
        )
        await admin.execute(f'DROP DATABASE IF EXISTS "{database_name}"')
        await admin.close()
