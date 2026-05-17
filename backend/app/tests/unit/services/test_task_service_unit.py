"""Unit tests for durable calculation task service."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import ANY, AsyncMock, MagicMock

import pytest

from app.core.dependencies import CurrentPrincipal
from app.models.background_task import BackgroundTask
from app.schemas.calculation import ElectricalBatchJobRequest, HeatLossBatchJobRequest
from app.schemas.report import ReportExportJobRequest
from app.services.calculation_service import BatchProgress
from app.services.project_service import ProjectService
from app.services.task_service import (
    MAX_TASK_ERROR_MESSAGE_LENGTH,
    TASK_ELECTRICAL_BATCH,
    TASK_HEAT_LOSS_BATCH,
    TASK_REPORT_EXPORT,
    ProgressThrottler,
    ProgressWritePolicy,
    TaskAccessError,
    TaskLimitError,
    TaskService,
)


class ResultRows:
    def __init__(self, rows):
        self.rows = rows

    def scalars(self):
        return self

    def all(self):
        return self.rows

    def scalar_one_or_none(self):
        return self.rows[0] if self.rows else None


class QueueOk:
    async def enqueue(self, task_id, task_type: str) -> str:
        return f"stream:{task_id}:{task_type}"


class QueueFail:
    async def enqueue(self, task_id, task_type: str) -> str:
        raise RuntimeError("redis down")


def _allow_active_task_limits(service: TaskService) -> None:
    service._active_global_task_count = AsyncMock(return_value=0)  # type: ignore[method-assign]
    service._active_project_task_count = AsyncMock(return_value=0)  # type: ignore[method-assign]
    service._active_principal_task_count = AsyncMock(return_value=0)  # type: ignore[method-assign]


class ManualClock:
    def __init__(self) -> None:
        self.value = 0.0

    def __call__(self) -> float:
        return self.value

    def advance_ms(self, value: int) -> None:
        self.value += value / 1000


class StaticSessionFactory:
    def __init__(self, db) -> None:
        self.db = db

    def __call__(self):
        return self

    async def __aenter__(self):
        return self.db

    async def __aexit__(self, exc_type, exc, tb):
        return None


@pytest.fixture
def guest_principal() -> CurrentPrincipal:
    return CurrentPrincipal(role="guest", session_id="sid")


@pytest.fixture
def employee_principal() -> CurrentPrincipal:
    return CurrentPrincipal(role="employee", user_id=uuid.uuid4())


@pytest.fixture
def mock_db():
    db = AsyncMock()
    db.add = MagicMock()
    db.commit = AsyncMock()
    db.rollback = AsyncMock()

    async def refresh(obj):
        if getattr(obj, "id", None) is None:
            obj.id = uuid.uuid4()

    db.refresh = AsyncMock(side_effect=refresh)
    return db


async def _allow_project_access(self, project_id, principal):
    return SimpleNamespace(id=project_id)


class TestProgressThrottler:
    async def test_persists_first_phase_changes_and_final_flush(self):
        clock = ManualClock()
        persisted: list[BatchProgress] = []

        async def persist(progress: BatchProgress) -> None:
            persisted.append(progress)

        throttler = ProgressThrottler(
            persist,
            policy=ProgressWritePolicy(min_interval_ms=500, min_percent_delta=1.0),
            now_func=clock,
        )

        await throttler.offer(BatchProgress(current=0, total=100, phase="prepare"))
        await throttler.offer(BatchProgress(current=1, total=100, phase="calculate"))
        await throttler.offer(BatchProgress(current=2, total=100, phase="calculate"))
        await throttler.flush()

        assert [(item.phase, item.current) for item in persisted] == [
            ("prepare", 0),
            ("calculate", 1),
            ("calculate", 2),
        ]

    async def test_short_burst_does_not_write_every_progress_event(self):
        clock = ManualClock()
        persisted: list[BatchProgress] = []

        async def persist(progress: BatchProgress) -> None:
            persisted.append(progress)

        throttler = ProgressThrottler(
            persist,
            policy=ProgressWritePolicy(min_interval_ms=500, min_percent_delta=1.0),
            now_func=clock,
        )

        for current in range(1, 401):
            await throttler.offer(BatchProgress(current=current, total=400, phase="calculate"))
        await throttler.flush()

        assert len(persisted) == 2
        assert persisted[0].current == 1
        assert persisted[-1].current == 400

    async def test_skips_small_percent_delta_even_after_interval(self):
        clock = ManualClock()
        persisted: list[BatchProgress] = []

        async def persist(progress: BatchProgress) -> None:
            persisted.append(progress)

        throttler = ProgressThrottler(
            persist,
            policy=ProgressWritePolicy(min_interval_ms=500, min_percent_delta=1.0),
            now_func=clock,
        )

        await throttler.offer(BatchProgress(current=0, total=400, phase="calculate"))
        clock.advance_ms(600)
        await throttler.offer(BatchProgress(current=3, total=400, phase="calculate"))
        clock.advance_ms(600)
        await throttler.offer(BatchProgress(current=4, total=400, phase="calculate"))

        assert [item.current for item in persisted] == [0, 4]


class TestWorkerFailureRecording:
    async def test_record_worker_exception_retries_when_attempts_left(
        self,
        mock_db,
        monkeypatch: pytest.MonkeyPatch,
    ):
        task = BackgroundTask(
            id=uuid.uuid4(),
            type=TASK_ELECTRICAL_BATCH,
            status="running",
            session_id="sid",
            request_payload={},
            attempts=1,
            locked_by="worker-a",
        )
        mock_db.get = AsyncMock(return_value=task)
        monkeypatch.setattr("app.services.task_service.settings.WORKER_MAX_ATTEMPTS", 3)

        action = await TaskService(mock_db).record_worker_exception(
            task.id,
            worker_id="worker-a",
            error_message="RuntimeError: redis glitch",
        )

        assert action == "retry"
        assert task.status == "enqueued"
        assert task.progress_phase == "retry_pending"
        assert task.locked_by is None
        assert task.lock_expires_at is None
        assert task.error_message == "RuntimeError: redis glitch"
        mock_db.commit.assert_awaited_once()

    async def test_record_worker_exception_fails_after_max_attempts(
        self,
        mock_db,
        monkeypatch: pytest.MonkeyPatch,
    ):
        task = BackgroundTask(
            id=uuid.uuid4(),
            type=TASK_ELECTRICAL_BATCH,
            status="running",
            session_id="sid",
            request_payload={},
            attempts=3,
            locked_by="worker-a",
        )
        mock_db.get = AsyncMock(return_value=task)
        monkeypatch.setattr("app.services.task_service.settings.WORKER_MAX_ATTEMPTS", 3)

        action = await TaskService(mock_db).record_worker_exception(
            task.id,
            worker_id="worker-a",
            error_message="RuntimeError: permanent bug",
        )

        assert action == "dead_letter"
        assert task.status == "failed"
        assert task.progress_phase == "failed"
        assert task.finished_at is not None
        assert task.locked_by is None
        mock_db.commit.assert_awaited_once()


class TestTaskCreation:
    async def test_create_electrical_batch_task_enqueues_and_persists_payload(
        self,
        mock_db,
        guest_principal: CurrentPrincipal,
        monkeypatch: pytest.MonkeyPatch,
    ):
        monkeypatch.setattr(ProjectService, "get_project_basic", _allow_project_access)
        service = TaskService(mock_db)
        service._find_active_by_dedupe = AsyncMock(return_value=None)  # type: ignore[method-assign]
        _allow_active_task_limits(service)
        project_id = uuid.uuid4()

        task = await service.create_electrical_batch_task(
            ElectricalBatchJobRequest(
                project_id=project_id,
                variant_number=2,
                winding_pitch=120,
                force_cable_type=True,
                include_errors=False,
            ),
            guest_principal,
            queue=QueueOk(),
            idempotency_key="click-1",
        )

        assert task.status == "enqueued"
        assert task.session_id == "sid"
        assert task.request_payload["project_id"] == str(project_id)
        assert task.request_payload["variant_number"] == 2
        assert task.request_payload["force_cable_type"] is True
        assert task.request_payload["skip_manual"] is True
        assert task.request_payload["electrical_params"]["winding_pitch"] == 120
        assert task.request_payload["include_errors"] is False
        assert task.arq_job_id is not None
        mock_db.add.assert_called_once()

    async def test_create_electrical_batch_task_allows_explicit_manual_overwrite(
        self,
        mock_db,
        guest_principal: CurrentPrincipal,
        monkeypatch: pytest.MonkeyPatch,
    ):
        monkeypatch.setattr(ProjectService, "get_project_basic", _allow_project_access)
        service = TaskService(mock_db)
        service._find_active_by_dedupe = AsyncMock(return_value=None)  # type: ignore[method-assign]
        _allow_active_task_limits(service)
        project_id = uuid.uuid4()

        task = await service.create_electrical_batch_task(
            ElectricalBatchJobRequest(
                project_id=project_id,
                skip_manual=False,
            ),
            guest_principal,
            queue=QueueOk(),
            idempotency_key="overwrite-manual",
        )

        assert task.request_payload["skip_manual"] is False
        mock_db.add.assert_called_once()

    async def test_create_returns_existing_active_task(
        self,
        mock_db,
        guest_principal: CurrentPrincipal,
        monkeypatch: pytest.MonkeyPatch,
    ):
        monkeypatch.setattr(ProjectService, "get_project_basic", _allow_project_access)
        existing = BackgroundTask(
            id=uuid.uuid4(),
            type=TASK_ELECTRICAL_BATCH,
            status="running",
            session_id="sid",
            request_payload={},
            progress_current=0,
        )
        service = TaskService(mock_db)
        service._find_active_by_dedupe = AsyncMock(return_value=existing)  # type: ignore[method-assign]

        task = await service.create_electrical_batch_task(
            ElectricalBatchJobRequest(project_id=uuid.uuid4()),
            guest_principal,
            queue=QueueOk(),
        )

        assert task is existing
        mock_db.add.assert_not_called()

    async def test_create_rejects_when_project_active_task_limit_reached(
        self,
        mock_db,
        guest_principal: CurrentPrincipal,
        monkeypatch: pytest.MonkeyPatch,
    ):
        monkeypatch.setattr(ProjectService, "get_project_basic", _allow_project_access)
        monkeypatch.setattr("app.services.task_service.settings.MAX_ACTIVE_TASKS_GLOBAL", 200)
        monkeypatch.setattr("app.services.task_service.settings.MAX_ACTIVE_TASKS_PER_PROJECT", 1)
        monkeypatch.setattr("app.services.task_service.settings.MAX_ACTIVE_TASKS_PER_PRINCIPAL", 5)
        service = TaskService(mock_db)
        service._find_active_by_dedupe = AsyncMock(return_value=None)  # type: ignore[method-assign]
        service._active_global_task_count = AsyncMock(return_value=0)  # type: ignore[method-assign]
        service._active_project_task_count = AsyncMock(return_value=1)  # type: ignore[method-assign]
        service._active_principal_task_count = AsyncMock(return_value=0)  # type: ignore[method-assign]

        with pytest.raises(TaskLimitError, match="активных задач для проекта"):
            await service.create_electrical_batch_task(
                ElectricalBatchJobRequest(project_id=uuid.uuid4()),
                guest_principal,
                queue=QueueOk(),
            )

        mock_db.add.assert_not_called()

    async def test_create_rejects_when_principal_active_task_limit_reached(
        self,
        mock_db,
        guest_principal: CurrentPrincipal,
        monkeypatch: pytest.MonkeyPatch,
    ):
        monkeypatch.setattr(ProjectService, "get_project_basic", _allow_project_access)
        monkeypatch.setattr("app.services.task_service.settings.MAX_ACTIVE_TASKS_GLOBAL", 200)
        monkeypatch.setattr("app.services.task_service.settings.MAX_ACTIVE_TASKS_PER_PROJECT", 3)
        monkeypatch.setattr("app.services.task_service.settings.MAX_ACTIVE_TASKS_PER_PRINCIPAL", 1)
        service = TaskService(mock_db)
        service._find_active_by_dedupe = AsyncMock(return_value=None)  # type: ignore[method-assign]
        service._active_global_task_count = AsyncMock(return_value=0)  # type: ignore[method-assign]
        service._active_project_task_count = AsyncMock(return_value=0)  # type: ignore[method-assign]
        service._active_principal_task_count = AsyncMock(return_value=1)  # type: ignore[method-assign]

        with pytest.raises(TaskLimitError, match="активных задач для пользователя"):
            await service.create_heat_loss_batch_task(
                HeatLossBatchJobRequest(project_id=uuid.uuid4()),
                guest_principal,
                queue=QueueOk(),
            )

        mock_db.add.assert_not_called()

    async def test_create_rejects_when_global_queue_depth_reached(
        self,
        mock_db,
        employee_principal: CurrentPrincipal,
        monkeypatch: pytest.MonkeyPatch,
    ):
        monkeypatch.setattr(ProjectService, "get_project_basic", _allow_project_access)
        monkeypatch.setattr("app.services.task_service.settings.MAX_ACTIVE_TASKS_GLOBAL", 1)
        service = TaskService(mock_db)
        service._find_active_by_dedupe = AsyncMock(return_value=None)  # type: ignore[method-assign]
        service._active_global_task_count = AsyncMock(return_value=1)  # type: ignore[method-assign]
        service._active_project_task_count = AsyncMock(return_value=0)  # type: ignore[method-assign]
        service._active_principal_task_count = AsyncMock(return_value=0)  # type: ignore[method-assign]

        with pytest.raises(TaskLimitError, match="Очередь задач перегружена"):
            await service.create_report_export_task(
                ReportExportJobRequest(project_id=uuid.uuid4(), format="pdf"),
                employee_principal,
                queue=QueueOk(),
            )

        mock_db.add.assert_not_called()

    async def test_create_heat_loss_batch_task_enqueues_and_persists_payload(
        self,
        mock_db,
        guest_principal: CurrentPrincipal,
        monkeypatch: pytest.MonkeyPatch,
    ):
        monkeypatch.setattr(ProjectService, "get_project_basic", _allow_project_access)
        service = TaskService(mock_db)
        service._find_active_by_dedupe = AsyncMock(return_value=None)  # type: ignore[method-assign]
        _allow_active_task_limits(service)
        project_id = uuid.uuid4()

        task = await service.create_heat_loss_batch_task(
            HeatLossBatchJobRequest(project_id=project_id, include_errors=False),
            guest_principal,
            queue=QueueOk(),
            idempotency_key="heat-click-1",
        )

        assert task.status == "enqueued"
        assert task.type == TASK_HEAT_LOSS_BATCH
        assert task.session_id == "sid"
        assert task.request_payload == {
            "project_id": str(project_id),
            "include_errors": False,
        }
        assert task.arq_job_id is not None
        mock_db.add.assert_called_once()

    async def test_create_report_export_task_enqueues_and_persists_payload(
        self,
        mock_db,
        employee_principal: CurrentPrincipal,
        monkeypatch: pytest.MonkeyPatch,
    ):
        monkeypatch.setattr(ProjectService, "get_project_basic", _allow_project_access)
        service = TaskService(mock_db)
        service._find_active_by_dedupe = AsyncMock(return_value=None)  # type: ignore[method-assign]
        _allow_active_task_limits(service)
        project_id = uuid.uuid4()

        task = await service.create_report_export_task(
            ReportExportJobRequest(
                project_id=project_id,
                format="pdf",
                sections=["summary", "electrical"],
            ),
            employee_principal,
            queue=QueueOk(),
            idempotency_key="report-click-1",
        )

        assert task.status == "enqueued"
        assert task.type == TASK_REPORT_EXPORT
        assert task.user_id == employee_principal.user_id
        assert task.progress_total == 3
        assert task.request_payload == {
            "project_id": str(project_id),
            "format": "pdf",
            "variant_number": 1,
            "sections": ["summary", "electrical"],
        }
        assert task.arq_job_id is not None
        mock_db.add.assert_called_once()

    async def test_guest_cannot_enqueue_report_export(
        self,
        mock_db,
        guest_principal: CurrentPrincipal,
    ):
        with pytest.raises(TaskAccessError):
            await TaskService(mock_db).create_report_export_task(
                ReportExportJobRequest(project_id=uuid.uuid4(), format="pdf"),
                guest_principal,
                queue=QueueOk(),
            )

    async def test_guest_cannot_enqueue_extended_catalog(
        self,
        mock_db,
        guest_principal: CurrentPrincipal,
        monkeypatch: pytest.MonkeyPatch,
    ):
        monkeypatch.setattr(ProjectService, "get_project_basic", _allow_project_access)

        with pytest.raises(TaskAccessError):
            await TaskService(mock_db).create_electrical_batch_task(
                ElectricalBatchJobRequest(project_id=uuid.uuid4(), cable_source="extended"),
                guest_principal,
                queue=QueueOk(),
            )


class TestTaskStateTransitions:
    async def test_run_task_cancel_requested_marks_cancelled(self, mock_db):
        task = BackgroundTask(
            id=uuid.uuid4(),
            type=TASK_ELECTRICAL_BATCH,
            status="enqueued",
            session_id="sid",
            request_payload={},
            progress_current=0,
            cancel_requested=True,
        )
        mock_db.execute = AsyncMock(return_value=ResultRows([]))
        mock_db.get = AsyncMock(return_value=task)
        service = TaskService(mock_db)
        service._mark_cancelled = AsyncMock()  # type: ignore[method-assign]

        await service.run_task(task.id, worker_id="worker")

        service._mark_cancelled.assert_awaited_once_with(task.id)
        mock_db.commit.assert_not_awaited()

    async def test_run_task_unknown_type_marks_failed(self, mock_db):
        task = BackgroundTask(
            id=uuid.uuid4(),
            type="unknown",
            status="enqueued",
            session_id="sid",
            request_payload={},
            progress_current=0,
            cancel_requested=False,
        )
        mock_db.execute = AsyncMock(return_value=ResultRows([task]))
        mock_db.get = AsyncMock(return_value=None)
        service = TaskService(mock_db)
        service._mark_failed = AsyncMock()  # type: ignore[method-assign]

        await service.run_task(task.id, worker_id="worker")

        service._mark_failed.assert_awaited_once()
        mock_db.commit.assert_awaited_once()

    async def test_run_task_dispatches_heat_loss_batch(self, mock_db):
        task = BackgroundTask(
            id=uuid.uuid4(),
            type=TASK_HEAT_LOSS_BATCH,
            status="enqueued",
            session_id="sid",
            request_payload={"project_id": str(uuid.uuid4())},
            progress_current=0,
            cancel_requested=False,
            attempts=0,
        )
        task.status = "running"
        task.attempts = 1
        task.locked_by = "worker"
        mock_db.execute = AsyncMock(return_value=ResultRows([task]))
        mock_db.get = AsyncMock(return_value=None)
        service = TaskService(mock_db)
        service._run_heat_loss_batch = AsyncMock()  # type: ignore[method-assign]

        await service.run_task(task.id, worker_id="worker")

        assert task.status == "running"
        assert task.locked_by == "worker"
        service._run_heat_loss_batch.assert_awaited_once_with(task.id)
        mock_db.commit.assert_awaited_once()

    async def test_run_task_dispatches_report_export(self, mock_db):
        task = BackgroundTask(
            id=uuid.uuid4(),
            type=TASK_REPORT_EXPORT,
            status="enqueued",
            session_id="sid",
            request_payload={"project_id": str(uuid.uuid4()), "format": "pdf"},
            progress_current=0,
            cancel_requested=False,
            attempts=0,
        )
        task.status = "running"
        task.attempts = 1
        task.locked_by = "worker"
        mock_db.execute = AsyncMock(return_value=ResultRows([task]))
        mock_db.get = AsyncMock(return_value=None)
        service = TaskService(mock_db)
        service._run_report_export = AsyncMock()  # type: ignore[method-assign]

        await service.run_task(task.id, worker_id="worker")

        service._run_report_export.assert_awaited_once_with(task.id)
        mock_db.commit.assert_awaited_once()

    async def test_run_task_does_not_dispatch_if_claim_lost(self, mock_db):
        task = BackgroundTask(
            id=uuid.uuid4(),
            type=TASK_HEAT_LOSS_BATCH,
            status="running",
            session_id="sid",
            request_payload={"project_id": str(uuid.uuid4())},
            progress_current=0,
            cancel_requested=False,
            attempts=1,
        )
        mock_db.execute = AsyncMock(return_value=ResultRows([]))
        mock_db.get = AsyncMock(return_value=task)
        service = TaskService(mock_db)
        service._run_heat_loss_batch = AsyncMock()  # type: ignore[method-assign]

        await service.run_task(task.id, worker_id="worker-2")

        service._run_heat_loss_batch.assert_not_awaited()
        mock_db.commit.assert_not_awaited()

    async def test_run_heat_loss_batch_marks_succeeded(
        self,
        mock_db,
        monkeypatch: pytest.MonkeyPatch,
    ):
        project_id = uuid.uuid4()
        task = BackgroundTask(
            id=uuid.uuid4(),
            type=TASK_HEAT_LOSS_BATCH,
            status="running",
            project_id=project_id,
            session_id="sid",
            request_payload={
                "project_id": str(project_id),
                "include_errors": True,
                "object_ids": [str(uuid.uuid4()), str(uuid.uuid4())],
            },
            progress_current=0,
            progress_total=None,
        )
        mock_db.get = AsyncMock(return_value=task)
        expected_object_ids = [uuid.UUID(value) for value in task.request_payload["object_ids"]]

        class FakeCalculationService:
            def __init__(self, db) -> None:
                self.db = db

            async def batch_recalculate(
                self,
                project_id_arg,
                *,
                progress_callback=None,
                should_cancel=None,
                object_ids=None,
            ):
                assert project_id_arg == project_id
                assert should_cancel is not None
                assert object_ids == expected_object_ids
                if progress_callback is not None:
                    await progress_callback(BatchProgress(current=1, total=2, phase="calculate"))
                return 1, 1, [{"object_id": "bad", "error": {"message": "missing"}}]

        monkeypatch.setattr("app.services.task_service.CalculationService", FakeCalculationService)

        await TaskService(
            mock_db, session_factory=StaticSessionFactory(mock_db)
        )._run_heat_loss_batch(task.id)

        assert task.status == "succeeded"
        assert task.result_payload == {
            "updated": 1,
            "failed": 1,
            "errors": [{"object_id": "bad", "error": {"message": "missing"}}],
        }
        assert task.progress_phase == "done"
        assert mock_db.commit.await_count >= 2

    async def test_run_heat_loss_batch_honors_include_errors_false(
        self,
        mock_db,
        monkeypatch: pytest.MonkeyPatch,
    ):
        project_id = uuid.uuid4()
        task = BackgroundTask(
            id=uuid.uuid4(),
            type=TASK_HEAT_LOSS_BATCH,
            status="running",
            project_id=project_id,
            session_id="sid",
            request_payload={"project_id": str(project_id), "include_errors": False},
            progress_current=0,
        )
        mock_db.get = AsyncMock(return_value=task)

        class FakeCalculationService:
            def __init__(self, db) -> None:
                self.db = db

            async def batch_recalculate(self, *args, **kwargs):
                return 0, 1, [{"object_id": "bad", "error": {"message": "hidden"}}]

        monkeypatch.setattr("app.services.task_service.CalculationService", FakeCalculationService)

        await TaskService(
            mock_db, session_factory=StaticSessionFactory(mock_db)
        )._run_heat_loss_batch(task.id)

        assert task.status == "succeeded"
        assert task.result_payload == {"updated": 0, "failed": 1, "errors": []}

    async def test_run_heat_loss_batch_cancel_marks_cancelled(
        self,
        mock_db,
        monkeypatch: pytest.MonkeyPatch,
    ):
        project_id = uuid.uuid4()
        task = BackgroundTask(
            id=uuid.uuid4(),
            type=TASK_HEAT_LOSS_BATCH,
            status="running",
            project_id=project_id,
            session_id="sid",
            request_payload={"project_id": str(project_id)},
            progress_current=0,
        )
        mock_db.get = AsyncMock(return_value=task)

        class FakeCalculationService:
            def __init__(self, db) -> None:
                self.db = db

            async def batch_recalculate(self, *args, **kwargs):
                from app.services.calculation_service import BatchCancelledError

                raise BatchCancelledError("cancelled")

        monkeypatch.setattr("app.services.task_service.CalculationService", FakeCalculationService)

        await TaskService(
            mock_db, session_factory=StaticSessionFactory(mock_db)
        )._run_heat_loss_batch(task.id)

        assert task.status == "cancelled"
        assert task.cancel_requested is True

    async def test_run_heat_loss_batch_failure_marks_failed(
        self,
        mock_db,
        monkeypatch: pytest.MonkeyPatch,
    ):
        project_id = uuid.uuid4()
        task = BackgroundTask(
            id=uuid.uuid4(),
            type=TASK_HEAT_LOSS_BATCH,
            status="running",
            project_id=project_id,
            session_id="sid",
            request_payload={"project_id": str(project_id)},
            progress_current=0,
        )
        mock_db.get = AsyncMock(return_value=task)

        class FakeCalculationService:
            def __init__(self, db) -> None:
                self.db = db

            async def batch_recalculate(self, *args, **kwargs):
                raise RuntimeError("boom")

        monkeypatch.setattr("app.services.task_service.CalculationService", FakeCalculationService)

        await TaskService(
            mock_db, session_factory=StaticSessionFactory(mock_db)
        )._run_heat_loss_batch(task.id)

        assert task.status == "failed"
        assert task.error_message == "RuntimeError: boom"

    async def test_run_report_export_marks_succeeded(
        self,
        mock_db,
        monkeypatch: pytest.MonkeyPatch,
    ):
        project_id = uuid.uuid4()
        task = BackgroundTask(
            id=uuid.uuid4(),
            type=TASK_REPORT_EXPORT,
            status="running",
            project_id=project_id,
            user_id=uuid.uuid4(),
            request_payload={
                "project_id": str(project_id),
                "format": "pdf",
                "variant_number": 2,
                "sections": ["summary"],
            },
            progress_current=0,
            progress_total=3,
        )
        mock_db.get = AsyncMock(return_value=task)

        class FakeReportService:
            def __init__(self, db) -> None:
                self.db = db

            async def export(self, project_id_arg, fmt, sections, *, variant_number=1):
                assert project_id_arg == project_id
                assert fmt == "pdf"
                assert sections == ["summary"]
                assert variant_number == 2
                return b"%PDF"

            async def export_trusted(self, project_id_arg, fmt, sections, *, variant_number=1):
                return await self.export(
                    project_id_arg,
                    fmt,
                    sections,
                    variant_number=variant_number,
                )

        monkeypatch.setattr("app.services.task_service.ReportService", FakeReportService)
        monkeypatch.setattr(
            "app.services.task_service.write_report_artifact",
            lambda task_id, fmt, data: {
                "artifact_name": f"{task_id}.{fmt}",
                "size_bytes": len(data),
            },
        )
        service = TaskService(mock_db, session_factory=StaticSessionFactory(mock_db))
        service._should_cancel = AsyncMock(return_value=False)  # type: ignore[method-assign]

        await service._run_report_export(task.id)

        assert task.status == "succeeded"
        assert task.result_payload == {
            "project_id": str(project_id),
            "format": "pdf",
            "variant_number": 2,
            "filename": "report.pdf",
            "media_type": "application/pdf",
            "download_url": f"/api/v1/reports/jobs/{task.id}/download",
            "artifact_name": f"{task.id}.pdf",
            "size_bytes": 4,
        }

    async def test_mark_failed_compacts_large_error_message(self, mock_db):
        task = BackgroundTask(
            id=uuid.uuid4(),
            type=TASK_ELECTRICAL_BATCH,
            status="running",
            session_id="sid",
            request_payload={},
            progress_current=10,
        )
        mock_db.get = AsyncMock(return_value=task)
        large_error = "InterfaceError: " + ("x" * 10_000)

        await TaskService(mock_db)._mark_failed(task.id, large_error)

        assert task.status == "failed"
        assert task.error_message is not None
        assert len(task.error_message) == MAX_TASK_ERROR_MESSAGE_LENGTH
        assert "truncated" in task.error_message
        mock_db.commit.assert_awaited_once()

    async def test_enqueue_failure_keeps_task_queued_for_recovery(self, mock_db):
        task = BackgroundTask(
            id=uuid.uuid4(),
            type=TASK_ELECTRICAL_BATCH,
            status="queued",
            session_id="sid",
            request_payload={},
            progress_current=0,
        )

        await TaskService(mock_db).enqueue_existing_task(task, queue=QueueFail())

        assert task.status == "queued"
        assert task.enqueue_attempts == 1
        assert "RuntimeError" in (task.last_enqueue_error or "")
        assert task.next_retry_at is not None

    async def test_cancel_terminal_task_is_noop(
        self,
        mock_db,
        guest_principal: CurrentPrincipal,
    ):
        task = BackgroundTask(
            id=uuid.uuid4(),
            type=TASK_ELECTRICAL_BATCH,
            status="succeeded",
            session_id="sid",
            request_payload={},
            progress_current=0,
        )
        service = TaskService(mock_db)
        service.get_task_for_principal = AsyncMock(return_value=task)  # type: ignore[method-assign]

        result = await service.cancel_task(task.id, guest_principal)

        assert result.status == "succeeded"
        mock_db.commit.assert_not_awaited()

    async def test_recover_requeues_and_fails_stale_tasks(self, mock_db):
        queued = BackgroundTask(
            id=uuid.uuid4(),
            type=TASK_ELECTRICAL_BATCH,
            status="queued",
            session_id="sid",
            request_payload={},
            progress_current=0,
        )
        stale = BackgroundTask(
            id=uuid.uuid4(),
            type=TASK_ELECTRICAL_BATCH,
            status="running",
            session_id="sid",
            request_payload={},
            progress_current=0,
            attempts=99,
            heartbeat_at=datetime.now(UTC) - timedelta(minutes=10),
        )
        mock_db.execute = AsyncMock(side_effect=[ResultRows([queued]), ResultRows([stale])])
        service = TaskService(mock_db)
        service.enqueue_existing_task = AsyncMock()  # type: ignore[method-assign]
        service._mark_failed = AsyncMock()  # type: ignore[method-assign]

        recovered = await service.recover_stuck_tasks(queue=QueueOk())

        assert recovered == 2
        service.enqueue_existing_task.assert_awaited_once_with(queued, queue=ANY)
        service._mark_failed.assert_awaited_once()


class TestTaskResponse:
    def test_to_response_includes_progress_result_and_links(self):
        task_id = uuid.uuid4()
        object_id = uuid.uuid4()
        task = BackgroundTask(
            id=task_id,
            type=TASK_ELECTRICAL_BATCH,
            status="succeeded",
            project_id=uuid.uuid4(),
            session_id="sid",
            request_payload={},
            result_payload={
                "calculated": 1,
                "skipped": 0,
                "heat_loss_failed": 0,
                "errors": [],
                "results": [
                    {
                        "id": str(uuid.uuid4()),
                        "object_id": str(object_id),
                        "cable_type": "self_regulating",
                        "cable_mark": "ТЛТ-30",
                        "variant_number": 1,
                        "results": {"selected_cable": "ТЛТ-30"},
                    }
                ],
            },
            progress_current=10,
            progress_total=10,
            progress_phase="done",
            created_at=datetime.now(UTC),
        )

        response = TaskService.to_response(task)

        assert response.progress.percent == 100
        assert response.result is not None
        assert response.result.calculated == 1
        assert response.result.results[0].object_id == object_id
        assert response.links.status.endswith(f"/calc/jobs/{task_id}")

    def test_to_response_supports_heat_loss_result(self):
        task_id = uuid.uuid4()
        task = BackgroundTask(
            id=task_id,
            type=TASK_HEAT_LOSS_BATCH,
            status="succeeded",
            project_id=uuid.uuid4(),
            session_id="sid",
            request_payload={},
            result_payload={
                "updated": 2,
                "failed": 1,
                "errors": [{"object_id": str(uuid.uuid4()), "error": {"message": "bad"}}],
            },
            progress_current=3,
            progress_total=3,
            progress_phase="done",
            created_at=datetime.now(UTC),
        )

        response = TaskService.to_response(task)

        assert response.progress.percent == 100
        assert response.result is not None
        assert response.result.updated == 2
        assert response.result.failed == 1

    def test_to_response_supports_report_export_result(self):
        task_id = uuid.uuid4()
        project_id = uuid.uuid4()
        task = BackgroundTask(
            id=task_id,
            type=TASK_REPORT_EXPORT,
            status="succeeded",
            project_id=project_id,
            user_id=uuid.uuid4(),
            request_payload={},
            result_payload={
                "project_id": str(project_id),
                "format": "pdf",
                "filename": "report.pdf",
                "media_type": "application/pdf",
                "download_url": f"/api/v1/reports/jobs/{task_id}/download",
                "artifact_name": f"{task_id}.pdf",
                "size_bytes": 123,
            },
            progress_current=3,
            progress_total=3,
            progress_phase="done",
            created_at=datetime.now(UTC),
        )

        response = TaskService.to_response(task)

        assert response.progress.percent == 100
        assert response.result is not None
        assert response.result.filename == "report.pdf"
        assert response.links.status.endswith(f"/reports/jobs/{task_id}")
        assert response.links.result.endswith(f"/reports/jobs/{task_id}/download")
