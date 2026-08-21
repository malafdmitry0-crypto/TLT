"""Contract checks for the UUID electrical identity expand migration."""

from __future__ import annotations

import importlib.util
from pathlib import Path
from types import ModuleType

from app.models.electrical_calculation import ElectricalCalculation
from app.models.electrical_candidate import ElectricalCandidate
from app.models.electrical_candidate_folder import ElectricalCandidateFolder


def _migration() -> ModuleType:
    path = Path(__file__).resolve().parents[4] / "alembic/versions/0054_uuid_identity_expand.py"
    spec = importlib.util.spec_from_file_location("migration_0054", path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_uuid_identity_expand_revision_is_linear() -> None:
    migration = _migration()

    assert migration.revision == "0054"
    assert migration.down_revision == "0053"


def test_models_require_uuid_and_allow_empty_numeric_compatibility_slot() -> None:
    for model in (ElectricalCalculation, ElectricalCandidate, ElectricalCandidateFolder):
        table = model.__table__
        assert table.c.electrical_variant_id.nullable is False
        assert table.c.variant_number.nullable is True


def test_models_use_uuid_project_foreign_keys() -> None:
    expected = {
        "fk_electrical_calculations_variant_project",
        "fk_electrical_candidates_variant_project",
        "fk_electrical_candidate_folders_variant_project",
    }
    actual = {
        constraint.name
        for model in (ElectricalCalculation, ElectricalCandidate, ElectricalCandidateFolder)
        for constraint in model.__table__.foreign_key_constraints
    }

    assert expected <= actual
    assert not any(name and name.endswith("_legacy") for name in actual)
