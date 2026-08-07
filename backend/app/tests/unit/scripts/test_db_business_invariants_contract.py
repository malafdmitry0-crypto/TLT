"""Static contract for the Postgres business-invariant audit."""

from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[5]
_INVARIANTS_SQL = _REPO_ROOT / "scripts/db-business-invariants.sql"


def test_invariants_match_uuid_only_specification_schema() -> None:
    sql = _INVARIANTS_SQL.read_text(encoding="utf-8")

    assert "generation_options" not in sql
    assert "s.variant_number" not in sql
    assert "specification_variant_out_of_range" not in sql
    assert "variant_number > 4" in sql
    assert "HAVING COUNT(*) > 4" in sql
    assert "more than four electrical variants" in sql
    assert "snapshot -> 'settings_revision'" in sql
