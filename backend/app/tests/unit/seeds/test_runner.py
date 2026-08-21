"""Transaction and stage-order contracts for the seed runner."""

from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

import app.seeds.runner as runner


class _SessionContext:
    def __init__(self, db):
        self.db = db

    async def __aenter__(self):
        return self.db

    async def __aexit__(self, exc_type, exc, traceback):
        return False


def _patch_runner(monkeypatch):
    db = AsyncMock()
    users = [SimpleNamespace(role="employee")]
    projects = [SimpleNamespace(name="demo")]
    principal = SimpleNamespace(user_id=uuid4())
    monkeypatch.setattr(runner, "AsyncSessionLocal", lambda: _SessionContext(db))
    monkeypatch.setattr(runner, "seed_users", AsyncMock(return_value=users))
    monkeypatch.setattr(
        runner,
        "existing_admin_principal",
        AsyncMock(return_value=principal),
    )
    monkeypatch.setattr(runner, "seed_electrical_catalogs", AsyncMock())
    monkeypatch.setattr(runner, "seed_specification_catalog", AsyncMock())
    monkeypatch.setattr(runner, "seed_coefficients", AsyncMock())
    monkeypatch.setattr(runner, "seed_insulation_materials", AsyncMock())
    monkeypatch.setattr(runner, "seed_accessories", AsyncMock())
    monkeypatch.setattr(runner, "seed_projects", AsyncMock(return_value=projects))
    monkeypatch.setattr(runner, "seed_heat_objects", AsyncMock())
    monkeypatch.setattr(runner, "seed_electrical_calculations", AsyncMock())
    return db, users, projects, principal


async def test_full_seed_commits_once_after_all_stages(monkeypatch):
    db, users, projects, principal = _patch_runner(monkeypatch)

    await runner.run_seeds()

    runner.seed_projects.assert_awaited_once_with(db, users)
    runner.seed_heat_objects.assert_awaited_once_with(db, projects, principal)
    runner.seed_electrical_calculations.assert_awaited_once_with(db, projects, principal)
    db.commit.assert_awaited_once_with()
    db.rollback.assert_not_awaited()


async def test_full_seed_rolls_back_when_a_stage_fails(monkeypatch):
    db, _, _, _ = _patch_runner(monkeypatch)
    runner.seed_insulation_materials.side_effect = RuntimeError("broken reference seed")

    with pytest.raises(RuntimeError, match="broken reference seed"):
        await runner.run_seeds()

    db.rollback.assert_awaited_once_with()
    db.commit.assert_not_awaited()
    runner.seed_accessories.assert_not_awaited()
