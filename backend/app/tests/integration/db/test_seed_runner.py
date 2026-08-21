"""End-to-end idempotency contract for the database seed runner."""

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

import app.seeds.runner as runner
from app.models.accessory import AccessoryExtended
from app.models.coefficient import CorrectionCoefficient
from app.models.electrical_calculation import ElectricalCalculation
from app.models.project import Project
from app.models.project_object import ProjectObject
from app.models.user import User
from app.seeds.loader import load_demo_manifest

pytestmark = pytest.mark.asyncio(loop_scope="session")


class _SessionContext:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def __aenter__(self) -> AsyncSession:
        return self.db

    async def __aexit__(self, exc_type, exc, traceback) -> bool:
        return False


async def _seed_counts(db: AsyncSession) -> tuple[int, ...]:
    models = (
        User,
        Project,
        ProjectObject,
        ElectricalCalculation,
        CorrectionCoefficient,
        AccessoryExtended,
    )
    counts: list[int] = []
    for model in models:
        counts.append(int(await db.scalar(select(func.count(model.id))) or 0))
    return tuple(counts)


async def test_full_seed_run_is_idempotent(
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(runner, "AsyncSessionLocal", lambda: _SessionContext(db_session))

    await runner.run_seeds()
    first_counts = await _seed_counts(db_session)
    await runner.run_seeds()
    second_counts = await _seed_counts(db_session)

    manifest = load_demo_manifest()
    expected_objects = sum(
        len(plan.canonical) + len(plan.volume) for plan in manifest.project_plans
    )
    assert first_counts == second_counts
    assert first_counts == (6, 10, expected_objects, expected_objects, 2, 10)
