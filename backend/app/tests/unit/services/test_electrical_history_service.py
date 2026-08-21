"""Focused authorization and pagination tests for electrical result history."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.services.electrical_history_service import (
    ElectricalCalculationHistoryNotFoundError,
    ElectricalHistoryService,
)


def _revision(calculation_id: uuid.UUID, project_id: uuid.UUID, number: int):
    now = datetime.now(UTC)
    return SimpleNamespace(
        id=uuid.uuid4(),
        electrical_calculation_id=calculation_id,
        revision_number=number,
        supersedes_result_id=None,
        project_id=project_id,
        object_id=uuid.uuid4(),
        electrical_variant_id=uuid.uuid4(),
        cable_type="self_regulating_tt",
        cable_type_source="auto",
        cable_mark="25ТТН2-СТ",
        cable_mark_source="auto",
        cable_snapshot={},
        params={},
        results={"status": "ready"},
        status="success",
        source_created_at=now,
        source_updated_at=now,
        recorded_at=now,
    )


async def test_history_is_authorized_by_owning_project(monkeypatch: pytest.MonkeyPatch):
    calculation_id = uuid.uuid4()
    project_id = uuid.uuid4()
    rows = [_revision(calculation_id, project_id, 2)]
    db = AsyncMock()
    db.scalar = AsyncMock(side_effect=[project_id, 2])
    scalar_rows = MagicMock()
    scalar_rows.all.return_value = rows
    db.scalars = AsyncMock(return_value=scalar_rows)
    authorize = AsyncMock(return_value=SimpleNamespace(id=project_id))
    monkeypatch.setattr(
        "app.services.electrical_history_service.ProjectService.get_project_basic",
        authorize,
    )
    principal = SimpleNamespace(role="guest", user_id=None, session_id="session")

    response = await ElectricalHistoryService(db).list_revisions(
        calculation_id,
        principal,
        page=2,
        page_size=1,
    )

    authorize.assert_awaited_once_with(project_id, principal)
    assert response.total == 2
    assert response.page == 2
    assert response.page_size == 1
    assert response.items[0].revision_number == 2


async def test_history_uses_current_projection_scope_before_first_revision(
    monkeypatch: pytest.MonkeyPatch,
):
    calculation_id = uuid.uuid4()
    project_id = uuid.uuid4()
    db = AsyncMock()
    db.scalar = AsyncMock(side_effect=[None, project_id, 0])
    scalar_rows = MagicMock()
    scalar_rows.all.return_value = []
    db.scalars = AsyncMock(return_value=scalar_rows)
    authorize = AsyncMock(return_value=SimpleNamespace(id=project_id))
    monkeypatch.setattr(
        "app.services.electrical_history_service.ProjectService.get_project_basic",
        authorize,
    )

    response = await ElectricalHistoryService(db).list_revisions(
        calculation_id,
        SimpleNamespace(role="admin", user_id=uuid.uuid4(), session_id=None),
    )

    assert response.project_id == project_id
    assert response.total == 0
    assert response.items == []


async def test_missing_history_and_projection_is_not_found():
    db = AsyncMock()
    db.scalar = AsyncMock(side_effect=[None, None])

    with pytest.raises(ElectricalCalculationHistoryNotFoundError):
        await ElectricalHistoryService(db).list_revisions(
            uuid.uuid4(),
            SimpleNamespace(role="guest", user_id=None, session_id="session"),
        )

    db.scalars.assert_not_awaited()
