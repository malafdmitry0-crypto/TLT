"""Fresh-install ratchet for UUID-only electrical variant identity."""

from __future__ import annotations

from pathlib import Path

_APP_ROOT = Path(__file__).resolve().parents[3]
_BACKEND_ROOT = _APP_ROOT.parent
_RETIRED_IDENTIFIERS = ("variant_number", "legacy_variant_number", "legacy_success")


def _python_sources(root: Path) -> list[Path]:
    return sorted(path for path in root.rglob("*.py") if "__pycache__" not in path.parts)


def test_runtime_electrical_identity_is_uuid_only() -> None:
    roots = (
        _APP_ROOT / "api",
        _APP_ROOT / "services",
        _APP_ROOT / "seeds",
    )
    model_files = (
        _APP_ROOT / "models/electrical_variant.py",
        _APP_ROOT / "models/electrical_calculation.py",
        _APP_ROOT / "models/electrical_calculation_revision.py",
        _APP_ROOT / "models/electrical_candidate.py",
        _APP_ROOT / "models/electrical_candidate_folder.py",
    )
    sources = [path for root in roots for path in _python_sources(root)] + list(model_files)

    offenders = {
        str(path.relative_to(_BACKEND_ROOT)): identifier
        for path in sources
        for identifier in _RETIRED_IDENTIFIERS
        if identifier in path.read_text(encoding="utf-8")
    }

    assert offenders == {}


def test_migration_history_never_creates_retired_numeric_identity() -> None:
    migration_root = _BACKEND_ROOT / "alembic/versions"
    offenders = {
        str(path.relative_to(_BACKEND_ROOT)): identifier
        for path in _python_sources(migration_root)
        for identifier in _RETIRED_IDENTIFIERS
        if identifier in path.read_text(encoding="utf-8")
    }

    assert offenders == {}
