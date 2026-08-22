"""Static and ORM contract tests for append-only electrical result history."""

from __future__ import annotations

import ast
from pathlib import Path

from sqlalchemy.dialects.postgresql import JSONB

from app.models.electrical_calculation_revision import ElectricalCalculationRevision

MIGRATION_PATH = (
    Path(__file__).resolve().parents[4]
    / "alembic"
    / "versions"
    / "0001_current_schema.py"
)


def _migration_source() -> str:
    return MIGRATION_PATH.read_text(encoding="utf-8")


def test_revision_model_preserves_full_projection_without_mutable_timestamp():
    table = ElectricalCalculationRevision.__table__

    assert set(table.columns.keys()) == {
        "id",
        "electrical_calculation_id",
        "revision_number",
        "supersedes_result_id",
        "project_id",
        "object_id",
        "electrical_variant_id",
        "cable_type",
        "cable_type_source",
        "cable_mark",
        "cable_mark_source",
        "cable_snapshot",
        "params",
        "results",
        "status",
        "source_created_at",
        "source_updated_at",
        "recorded_at",
    }
    assert isinstance(table.c.params.type, JSONB)
    assert isinstance(table.c.results.type, JSONB)
    assert isinstance(table.c.cable_snapshot.type, JSONB)
    assert "updated_at" not in table.columns
    assert table.c.recorded_at.onupdate is None
    assert table.c.electrical_variant_id.nullable is False
    for snapshot_id in (
        "electrical_calculation_id",
        "project_id",
        "object_id",
        "electrical_variant_id",
    ):
        assert not table.c[snapshot_id].foreign_keys
    assert next(iter(table.c.supersedes_result_id.foreign_keys)).target_fullname == (
        "electrical_calculation_revisions.id"
    )


def test_baseline_contains_revision_table_and_capture_trigger_contract():
    source = _migration_source()
    module = ast.parse(source)
    assignments = {
        node.target.id: ast.literal_eval(node.value)
        for node in module.body
        if isinstance(node, ast.AnnAssign)
        and isinstance(node.target, ast.Name)
        and node.target.id in {"revision", "down_revision"}
        and node.value is not None
    }

    assert assignments == {"revision": "0001", "down_revision": None}
    assert "CREATE TABLE public.electrical_calculation_revisions" in source
    assert "AFTER INSERT OR UPDATE ON public.electrical_calculations" in source
    assert "tlt_capture_electrical_calculation_revision" in source


def test_capture_trigger_builds_a_deterministic_immutable_revision_chain():
    source = _migration_source()

    assert "ORDER BY revision_number DESC, recorded_at DESC, id DESC" in source
    assert "LIMIT 1" in source
    assert "FOR UPDATE" in source
    assert "COALESCE(previous_revision_number, 0) + 1" in source
    assert "previous_revision_id" in source
    assert "ux_electrical_calculation_revisions_source_number" in source
    assert "ux_electrical_calculation_revisions_supersedes" in source
    assert "BEFORE DELETE OR UPDATE ON public.electrical_calculation_revisions" in source
    assert "electrical calculation revisions are append-only" in source


def test_revision_status_and_downgrade_cover_success_error_and_stale_history():
    source = _migration_source()

    for status in ("pending", "success", "error", "stale"):
        assert f"'{status}'" in source
    assert "NEW.results ->> 'error_code'" in source
    assert "NEW.results ->> 'category' = 'stale'" in source
    assert "'calculation_error', 'external', 'formula', 'unsupported', 'validation'" in source
    assert "NULLIF(BTRIM(COALESCE(NEW.results ->> 'error', '')), '')" in source

    downgrade = source[source.index("def downgrade()") :]
    assert "electrical_calculation_revisions" in downgrade
    assert "tlt_capture_electrical_calculation_revision" in downgrade
    assert "DROP EXTENSION" not in downgrade
