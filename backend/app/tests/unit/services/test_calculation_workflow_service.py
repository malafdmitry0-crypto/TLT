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


class TestCalculationWorkflowElectricalStage:
    async def test_supplies_the_required_default_selection_policy(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        db = AsyncMock()
        db.scalar.return_value = SimpleNamespace(legacy_variant_number=1)
        session = MagicMock()
        session.__aenter__ = AsyncMock(return_value=db)
        session.__aexit__ = AsyncMock(return_value=None)
        session_factory = MagicMock(return_value=session)
        calculation_service = MagicMock()
        calculation_service.batch_calc_electrical = AsyncMock(return_value=(1, 0, 0, [], []))
        monkeypatch.setattr(
            "app.services.calculation_workflow_service.CalculationService",
            MagicMock(return_value=calculation_service),
        )
        service = CalculationWorkflowService(
            MagicMock(),
            session_factory=session_factory,
        )
        service._stage_budget = AsyncMock(return_value=30)  # type: ignore[method-assign]
        service._checkpoint_in_transaction = AsyncMock()  # type: ignore[method-assign]

        await service._run_electrical(
            uuid4(),
            uuid4(),
            uuid4(),
            1,
            "worker-a",
        )

        assert calculation_service.batch_calc_electrical.await_args.kwargs["electrical_params"] == {
            "selection_policy": "technical_minimum"
        }
