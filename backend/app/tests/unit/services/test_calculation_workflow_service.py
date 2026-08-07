"""Focused safety contracts for the durable calculation workflow."""

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from app.schemas.specification import (
    SpecificationGenerationResponse,
    SpecificationGenerationStatus,
    SpecificationPreflightStatus,
    SpecificationVariantGenerationResult,
    SpecificationVariantPreflightResult,
)
from app.services.calculation_service import BatchCancelledError
from app.services.calculation_workflow_service import (
    TASK_PROJECT_PIPELINE,
    CalculationWorkflowService,
)


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


class TestCalculationWorkflowOrchestration:
    async def test_uses_saved_heat_without_recalculating_it(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        project_id = uuid4()
        variant_ids = [uuid4(), uuid4()]
        task_id = uuid4()
        task = SimpleNamespace(
            id=task_id,
            type=TASK_PROJECT_PIPELINE,
            queue_deadline_at=None,
            started_at=None,
            request_payload={
                "project_id": str(project_id),
                "variant_ids": [str(variant_id) for variant_id in variant_ids],
            },
            result_payload={"checkpoints": {"electrical": {}}},
        )
        db = AsyncMock()
        db.get.return_value = task
        service = CalculationWorkflowService(db)
        service._principal_for_task = AsyncMock(return_value=MagicMock())  # type: ignore[method-assign]
        service._task_snapshot = AsyncMock(return_value=task)  # type: ignore[method-assign]
        service._run_electrical = AsyncMock()  # type: ignore[method-assign]
        service._run_specification = AsyncMock()  # type: ignore[method-assign]
        batch_recalculate = AsyncMock()
        monkeypatch.setattr(
            "app.services.calculation_workflow_service.CalculationService.batch_recalculate",
            batch_recalculate,
        )

        await service.run_claimed_task(task_id, attempt=1, worker_id="worker-a")

        batch_recalculate.assert_not_awaited()
        assert service._run_electrical.await_args_list == [
            ((task_id, project_id, variant_id, 1, "worker-a"), {}) for variant_id in variant_ids
        ]
        service._run_specification.assert_awaited_once()

    async def test_recovery_resumes_only_unfinished_electrical_stages(self) -> None:
        project_id = uuid4()
        completed_variant_id = uuid4()
        pending_variant_id = uuid4()
        task_id = uuid4()
        task = SimpleNamespace(
            id=task_id,
            type=TASK_PROJECT_PIPELINE,
            queue_deadline_at=None,
            started_at=None,
            request_payload={
                "project_id": str(project_id),
                "variant_ids": [str(completed_variant_id), str(pending_variant_id)],
            },
            result_payload={
                "checkpoints": {
                    "electrical": {str(completed_variant_id): {"calculated": 3}},
                }
            },
        )
        db = AsyncMock()
        db.get.return_value = task
        service = CalculationWorkflowService(db)
        service._principal_for_task = AsyncMock(return_value=MagicMock())  # type: ignore[method-assign]
        service._task_snapshot = AsyncMock(return_value=task)  # type: ignore[method-assign]
        service._run_electrical = AsyncMock()  # type: ignore[method-assign]
        service._run_specification = AsyncMock()  # type: ignore[method-assign]

        await service.run_claimed_task(task_id, attempt=2, worker_id="worker-b")

        service._run_electrical.assert_awaited_once_with(
            task_id,
            project_id,
            pending_variant_id,
            2,
            "worker-b",
        )
        service._run_specification.assert_awaited_once()
        assert str(completed_variant_id) in task.result_payload["checkpoints"]["electrical"]

    async def test_success_completes_new_progress_total(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        task_id = uuid4()
        project_id = uuid4()
        variant_id = uuid4()
        task = SimpleNamespace(
            request_payload={"options": {}},
            result_payload={"checkpoints": {"electrical": {}}},
            progress_current=1,
            progress_total=2,
            status="running",
            workflow_stage="electrical",
            progress_phase="electrical",
            error_message=None,
            locked_by="worker-a",
            lock_expires_at=None,
            heartbeat_at=None,
            finished_at=None,
        )
        db = AsyncMock()
        session = MagicMock()
        session.__aenter__ = AsyncMock(return_value=db)
        session.__aexit__ = AsyncMock(return_value=None)
        ready = SpecificationVariantPreflightResult(
            electrical_variant_id=variant_id,
            status=SpecificationPreflightStatus.READY,
            fingerprint_schema="specification-preflight/v1",
            input_fingerprint=f"sha256:{'0' * 64}",
        )
        generated = SpecificationGenerationResponse(
            project_id=project_id,
            settings_version=1,
            results=[
                SpecificationVariantGenerationResult(
                    electrical_variant_id=variant_id,
                    status=SpecificationGenerationStatus.GENERATED,
                )
            ],
        )
        preflight_service = MagicMock()
        preflight_service.preflight_variants = AsyncMock(return_value=[ready])
        generation_service = MagicMock()
        generation_service.generate = AsyncMock(return_value=generated)
        monkeypatch.setattr(
            "app.services.calculation_workflow_service.SpecificationPreflightService",
            MagicMock(return_value=preflight_service),
        )
        monkeypatch.setattr(
            "app.services.calculation_workflow_service.SpecificationGenerationService",
            MagicMock(return_value=generation_service),
        )
        service = CalculationWorkflowService(
            MagicMock(),
            session_factory=MagicMock(return_value=session),
        )
        service._task_snapshot = AsyncMock(return_value=task)  # type: ignore[method-assign]
        service._stage_budget = AsyncMock(return_value=30)  # type: ignore[method-assign]
        service._fenced_task = AsyncMock(return_value=task)  # type: ignore[method-assign]

        await service._run_specification(
            task_id,
            project_id,
            [variant_id],
            MagicMock(),
            attempt=1,
            worker_id="worker-a",
        )

        assert task.status == "succeeded"
        assert task.progress_current == task.progress_total == 2
        assert "specification" in task.result_payload["checkpoints"]


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
