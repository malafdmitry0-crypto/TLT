"""Focused safety contracts for the durable calculation workflow."""

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from app.services.calculation_service import BatchCancelledError
from app.services.calculation_workflow_service import CalculationWorkflowService


class _NoRows:
    def scalar_one_or_none(self):
        return None


class TestCalculationWorkflowStageBudget:
    async def test_uses_the_stricter_overall_deadline(self) -> None:
        service = CalculationWorkflowService(MagicMock())
        service._task_snapshot = AsyncMock(  # type: ignore[method-assign]
            return_value=SimpleNamespace(
                execution_deadline_at=datetime.now(UTC) + timedelta(seconds=5),
            )
        )

        budget = await service._stage_budget(MagicMock(), 60)

        assert 0 < budget <= 5

    async def test_rejects_a_stage_after_the_overall_deadline(self) -> None:
        service = CalculationWorkflowService(MagicMock())
        service._task_snapshot = AsyncMock(  # type: ignore[method-assign]
            return_value=SimpleNamespace(
                execution_deadline_at=datetime.now(UTC) - timedelta(seconds=1),
            )
        )

        with pytest.raises(TimeoutError, match="общий таймаут"):
            await service._stage_budget(MagicMock(), 60)


class TestCalculationWorkflowFencing:
    async def test_cancel_request_invalidates_the_publish_token(self) -> None:
        db = AsyncMock()
        db.execute.return_value = _NoRows()
        service = CalculationWorkflowService(MagicMock())

        with pytest.raises(BatchCancelledError):
            await service._fenced_task(db, uuid4(), 1, "worker-a")

        statement = str(db.execute.await_args.args[0])
        assert "background_tasks.cancel_requested IS false" in statement
