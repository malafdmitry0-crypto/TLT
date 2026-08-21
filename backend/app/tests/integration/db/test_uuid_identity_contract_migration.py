"""Static contract for the physical UUID-only electrical identity cutover."""

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

from app.models.electrical_calculation import ElectricalCalculation
from app.models.electrical_calculation_revision import ElectricalCalculationRevision
from app.models.electrical_candidate import ElectricalCandidate
from app.models.electrical_candidate_folder import ElectricalCandidateFolder
from app.models.electrical_variant import ElectricalVariant

_BACKEND_ROOT = Path(__file__).resolve().parents[4]


def _migration() -> ModuleType:
    path = Path(__file__).resolve().parents[4] / "alembic/versions/0057_uuid_identity_contract.py"
    spec = importlib.util.spec_from_file_location("migration_0057", path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _database_urls(database_name: str) -> tuple[str, str]:
    configured = os.getenv(
        "TEST_DATABASE_URL",
        "postgresql+asyncpg://test:test@localhost:5433/heatcalc_test",
    )
    parsed = urlsplit(configured.replace("postgresql+asyncpg://", "postgresql://", 1))
    return (
        urlunsplit(parsed._replace(path="/postgres", query="", fragment="")),
        urlunsplit(parsed._replace(path=f"/{database_name}", query="", fragment="")),
    )


def _alembic(database_url: str, command: str, revision: str) -> subprocess.CompletedProcess[str]:
    env = os.environ.copy()
    env["DATABASE_URL"] = database_url.replace(
        "postgresql://", "postgresql+asyncpg://", 1
    )
    return subprocess.run(
        ["alembic", command, revision],
        cwd=_BACKEND_ROOT,
        env=env,
        check=False,
        capture_output=True,
        text=True,
    )


def test_contract_revision_follows_current_foreign_head() -> None:
    migration = _migration()

    assert migration.revision == "0057"
    assert migration.down_revision == "0056"


def test_runtime_models_expose_uuid_identity_only() -> None:
    for model in (
        ElectricalCalculation,
        ElectricalCandidate,
        ElectricalCandidateFolder,
        ElectricalCalculationRevision,
    ):
        assert "variant_number" not in model.__table__.c
        assert model.__table__.c.electrical_variant_id.nullable is False
    assert "legacy_variant_number" not in ElectricalVariant.__table__.c


def test_contract_removes_legacy_columns_and_sync_bridge() -> None:
    migration = _migration()
    source = Path(migration.__file__).read_text(encoding="utf-8")
    upgrade = source[source.index("def upgrade()") : source.index("def downgrade()")]

    assert migration._SCOPED_TABLES == (
        "electrical_calculations",
        "electrical_candidates",
        "electrical_candidate_folders",
    )
    assert "DROP TRIGGER IF EXISTS trg_0027_sync_electrical_variant_id ON {table}" in upgrade
    assert 'op.drop_column(table, "variant_number")' in upgrade
    assert 'op.drop_column("electrical_calculation_revisions", "variant_number")' in upgrade
    assert 'op.drop_column("electrical_variants", "legacy_variant_number")' in upgrade
    assert "DROP FUNCTION IF EXISTS tlt_0027_sync_legacy_electrical_variant_id()" in upgrade
    assert "contains rows without UUID identity" in upgrade


def test_replacement_runtime_functions_do_not_read_numeric_identity() -> None:
    migration = _migration()

    assert "variant_number" not in migration._capture_revision_function(
        include_numeric_identity=False
    )
    assert "legacy_variant_number" not in migration._project_object_assignment_function(
        include_legacy_diagnostic=False
    )


@pytest.mark.asyncio(loop_scope="session")
async def test_contract_upgrade_and_downgrade_on_postgresql() -> None:
    database_name = f"uuid_identity_contract_0057_{uuid.uuid4().hex}"
    admin_url, database_url = _database_urls(database_name)
    admin = await asyncpg.connect(admin_url)
    try:
        await admin.execute(f'CREATE DATABASE "{database_name}"')
        upgraded = _alembic(database_url, "upgrade", "0057")
        assert upgraded.returncode == 0, upgraded.stdout + upgraded.stderr

        connection = await asyncpg.connect(database_url)
        try:
            columns = await connection.fetch(
                """
                SELECT table_name, column_name
                FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND (
                    (table_name IN (
                        'electrical_calculations', 'electrical_candidates',
                        'electrical_candidate_folders', 'electrical_calculation_revisions'
                    ) AND column_name = 'variant_number')
                    OR (table_name = 'electrical_variants'
                        AND column_name = 'legacy_variant_number')
                  )
                """
            )
            assert columns == []
            function_source = await connection.fetchval(
                "SELECT pg_get_functiondef('tlt_0035_capture_electrical_calculation_revision()'::regprocedure)"
            )
            assert "variant_number" not in function_source
        finally:
            await connection.close()

        downgraded = _alembic(database_url, "downgrade", "0056")
        assert downgraded.returncode == 0, downgraded.stdout + downgraded.stderr
    finally:
        await admin.execute(
            "SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
            "WHERE datname = $1 AND pid <> pg_backend_pid()",
            database_name,
        )
        await admin.execute(f'DROP DATABASE IF EXISTS "{database_name}"')
        await admin.close()
