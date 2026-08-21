"""Unit tests for durable calculation task service."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import ANY, AsyncMock, MagicMock

import pytest
from sqlalchemy.exc import IntegrityError

from app.core.dependencies import CurrentPrincipal
from app.models.background_task import BackgroundTask
from app.schemas.calculation import ElectricalBatchJobRequest, HeatLossBatchJobRequest
from app.schemas.report import ReportExportJobRequest
from app.services.calculation.contracts import BatchProgress
from app.services.calculation.electrical_repository import ElectricalCalculationRepository
from app.services.calculation.errors import BatchCancelledError
from app.services.calculation.heat_batch import HeatBatchCalculationService
from app.services.electrical_assignment_service import ElectricalAssignmentService
from app.services.project_service import ProjectAccessError, ProjectNotFoundError, ProjectService
from app.services.tasks import (
    ELECTRICAL_VARIANT_NOT_FOUND,
    MAX_TASK_ERROR_MESSAGE_LENGTH,
    TASK_ELECTRICAL_BATCH,
    TASK_HEAT_LOSS_BATCH,
    TASK_REPORT_EXPORT,
    ProgressThrottler,
    ProgressWritePolicy,
    TaskAccessError,
    TaskIdempotencyConflictError,
    TaskLimitError,
    TaskNotFoundError,
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

    async def is_worker_ready(self, _consumer: str) -> bool:
        return False


class QueueFail:
    async def enqueue(self, task_id, task_type: str) -> str:
        raise RuntimeError("redis down")


class DeadLetterQueueOk(QueueOk):
    def __init__(self, task_id, task_type: str = TASK_ELECTRICAL_BATCH) -> None:
        self.entry = (
            "9-0",
            {
                "task_id": str(task_id),
                "type": task_type,
                "dead_letter_reason": "worker_attempts_exhausted",
                "original_stream_id": "1-0",
            },
        )
        self.deleted: list[str] = []

    async def get_dead_letter(self, stream_id: str):
        return self.entry if stream_id == self.entry[0] else None

    async def delete_dead_letter(self, stream_id: str) -> int:
        self.deleted.append(stream_id)
        return 1


def _allow_active_task_limits(service: TaskService) -> None:
    service._active_global_task_count = AsyncMock(return_value=0)  # type: ignore[method-assign]
    service._active_project_task_count = AsyncMock(return_value=0)  # type: ignore[method-assign]
    service._active_principal_task_count = AsyncMock(return_value=0)  # type: ignore[method-assign]


def _allow_electrical_variant(
    service: TaskService,
    project_id: uuid.UUID,
    *,
    electrical_variant_id: uuid.UUID | None = None,
) -> SimpleNamespace:
    variant = SimpleNamespace(
        id=electrical_variant_id or uuid.uuid4(),
        project_id=project_id,
    )
    service._lock_project_for_electrical_task = AsyncMock()  # type: ignore[method-assign]
    service._resolve_electrical_variant = AsyncMock(return_value=variant)  # type: ignore[method-assign]
    return variant


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


@pytest.fixture(autouse=True)
def explicit_electrical_assignment_scope(monkeypatch: pytest.MonkeyPatch) -> uuid.UUID:
    """Keep TaskService unit tests focused beyond the DB-backed assignment boundary."""
    object_id = uuid.uuid4()
    monkeypatch.setattr(
        ElectricalAssignmentService,
        "assignment_object_ids_for_system",
        AsyncMock(return_value=[object_id]),
    )
    monkeypatch.setattr(
        ElectricalAssignmentService,
        "validate_supported_assignment_objects",
        AsyncMock(return_value=None),
    )
    monkeypatch.setattr(
        ElectricalCalculationRepository,
        "load_existing_for_variant",
        AsyncMock(return_value={}),
    )
    return object_id


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


async def _allow_project_write(self, project_id, principal, **_kwargs):
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

    async def test_drops_duplicate_and_persists_unknown_total_progress_change(self):
        clock = ManualClock()
        persisted: list[BatchProgress] = []

        async def persist(progress: BatchProgress) -> None:
            persisted.append(progress)

        throttler = ProgressThrottler(
            persist,
            policy=ProgressWritePolicy(min_interval_ms=500, min_percent_delta=1.0),
            now_func=clock,
        )

        first = BatchProgress(current=1, total=0, phase="calculate")
        await throttler.offer(first)
        clock.advance_ms(600)
        await throttler.offer(first)
        clock.advance_ms(600)
        await throttler.offer(BatchProgress(current=2, total=0, phase="calculate"))

        assert [item.current for item in persisted] == [1, 2]


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
        mock_db.execute = AsyncMock(return_value=ResultRows([task]))
        monkeypatch.setattr("app.services.tasks.lifecycle.settings.WORKER_MAX_ATTEMPTS", 3)

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
        mock_db.execute = AsyncMock(return_value=ResultRows([task]))
        monkeypatch.setattr("app.services.tasks.lifecycle.settings.WORKER_MAX_ATTEMPTS", 3)

        action = await TaskService(mock_db).record_worker_exception(
            task.id,
            worker_id="worker-a",
            error_message="RuntimeError: permanent bug",
        )

        assert action == "dead_letter"
        assert task.status == "enqueued"
        assert task.progress_phase == "dead_letter_pending"
        assert task.finished_at is None
        assert task.locked_by is None
        mock_db.commit.assert_awaited_once()

    async def test_stale_worker_exception_cannot_mutate_new_attempt(self, mock_db):
        mock_db.execute = AsyncMock(return_value=ResultRows([]))

        action = await TaskService(mock_db).record_worker_exception(
            uuid.uuid4(),
            worker_id="worker-old",
            error_message="RuntimeError: late failure",
        )

        assert action == "ack"
        mock_db.rollback.assert_awaited_once()
        mock_db.commit.assert_not_awaited()

    async def test_finalize_dead_letter_marks_pending_task_failed(self, mock_db):
        task = BackgroundTask(
            id=uuid.uuid4(),
            type=TASK_ELECTRICAL_BATCH,
            status="enqueued",
            session_id="sid",
            request_payload={},
            attempts=3,
            progress_phase="dead_letter_pending",
            error_message="RuntimeError: permanent bug",
        )
        mock_db.get = AsyncMock(return_value=task)

        await TaskService(mock_db).finalize_dead_letter(task.id)

        assert task.status == "failed"
        assert task.progress_phase == "failed"
        assert task.finished_at is not None


class TestDeadLetterReplay:
    async def test_replay_dead_letter_resets_failed_task_and_reenqueues(self, mock_db):
        task = BackgroundTask(
            id=uuid.uuid4(),
            type=TASK_HEAT_LOSS_BATCH,
            status="failed",
            session_id="sid",
            request_payload={},
            result_payload={"calculated": 1},
            error_message="RuntimeError: boom",
            progress_current=7,
            progress_total=10,
            progress_phase="failed",
            cancel_requested=True,
            attempts=3,
            enqueue_attempts=1,
            locked_by="worker-a",
            started_at=datetime.now(UTC),
            finished_at=datetime.now(UTC),
        )
        mock_db.get = AsyncMock(return_value=task)
        queue = DeadLetterQueueOk(task.id, TASK_HEAT_LOSS_BATCH)

        replayed, removed = await TaskService(mock_db).replay_dead_letter("9-0", queue=queue)

        assert replayed is task
        assert removed is True
        assert task.status == "enqueued"
        assert task.result_payload is None
        assert task.error_message is None
        assert task.progress_current == 0
        assert task.progress_phase == "enqueued"
        assert task.cancel_requested is False
        assert task.attempts == 0
        assert task.enqueue_attempts == 1
        assert task.locked_by is None
        assert task.started_at is None
        assert task.finished_at is None
        assert task.arq_job_id is not None
        assert queue.deleted == ["9-0"]
        assert mock_db.commit.await_count == 2

    async def test_replay_dead_letter_validates_current_uuid_scope(self, mock_db):
        project_id = uuid.uuid4()
        variant_id = uuid.uuid4()
        task = BackgroundTask(
            id=uuid.uuid4(),
            type=TASK_ELECTRICAL_BATCH,
            status="failed",
            project_id=project_id,
            electrical_variant_id=variant_id,
            session_id="sid",
            request_payload={
                "project_id": str(project_id),
                "electrical_variant_id": str(variant_id),
                "include_errors": True,
            },
            progress_current=0,
        )
        mock_db.get = AsyncMock(return_value=task)
        service = TaskService(mock_db)
        service._lock_project_for_task = AsyncMock()  # type: ignore[method-assign]
        service._resolve_electrical_variant = AsyncMock(  # type: ignore[method-assign]
            return_value=SimpleNamespace(id=variant_id, project_id=project_id)
        )
        queue = DeadLetterQueueOk(task.id)

        replayed, removed = await service.replay_dead_letter("9-0", queue=queue)

        assert removed is True
        assert replayed.request_payload == {
            "project_id": str(project_id),
            "electrical_variant_id": str(variant_id),
            "include_errors": True,
        }
        service._lock_project_for_task.assert_awaited_once_with(project_id)  # type: ignore[attr-defined]
        service._resolve_electrical_variant.assert_awaited_once_with(  # type: ignore[attr-defined]
            project_id,
            variant_id,
        )

    async def test_replay_dead_letter_refuses_deleted_exact_variant(self, mock_db):
        project_id = uuid.uuid4()
        variant_id = uuid.uuid4()
        task = BackgroundTask(
            id=uuid.uuid4(),
            type=TASK_REPORT_EXPORT,
            status="failed",
            project_id=project_id,
            electrical_variant_id=variant_id,
            session_id="sid",
            request_payload={
                "project_id": str(project_id),
                "electrical_variant_id": str(variant_id),
                "format": "pdf",
            },
            progress_current=0,
        )
        mock_db.get = AsyncMock(return_value=task)
        service = TaskService(mock_db)
        service._lock_project_for_task = AsyncMock()  # type: ignore[method-assign]
        service._resolve_electrical_variant = AsyncMock(  # type: ignore[method-assign]
            side_effect=TaskNotFoundError(ELECTRICAL_VARIANT_NOT_FOUND)
        )
        queue = DeadLetterQueueOk(task.id, TASK_REPORT_EXPORT)

        with pytest.raises(TaskNotFoundError, match=ELECTRICAL_VARIANT_NOT_FOUND):
            await service.replay_dead_letter("9-0", queue=queue)

        assert queue.deleted == []
        mock_db.commit.assert_not_awaited()

    async def test_replay_dead_letter_rejects_active_task(self, mock_db):
        task = BackgroundTask(
            id=uuid.uuid4(),
            type=TASK_HEAT_LOSS_BATCH,
            status="running",
            session_id="sid",
            request_payload={},
            progress_current=0,
        )
        mock_db.get = AsyncMock(return_value=task)
        queue = DeadLetterQueueOk(task.id, TASK_HEAT_LOSS_BATCH)

        with pytest.raises(TaskLimitError, match="уже находится"):
            await TaskService(mock_db).replay_dead_letter("9-0", queue=queue)

        assert queue.deleted == []
        mock_db.commit.assert_not_awaited()


class TestTaskCreation:
    @pytest.mark.parametrize(
        ("task_status", "audit_result"),
        [
            ("queued", "queued"),
            ("enqueued", "queued"),
            ("running", "queued"),
            ("succeeded", "success"),
            ("failed", "failure"),
            ("cancelled", "cancelled"),
        ],
    )
    def test_task_audit_result_matches_durable_status(self, task_status, audit_result):
        task = BackgroundTask(
            type=TASK_HEAT_LOSS_BATCH,
            status=task_status,
            session_id="sid",
            request_payload={},
            progress_current=0,
        )

        assert TaskService.audit_result_for_task(task) == audit_result

    def test_electrical_request_requires_uuid_and_rejects_legacy_selector(self):
        project_id = uuid.uuid4()
        variant_id = uuid.uuid4()

        with pytest.raises(ValueError, match="electrical_variant_id"):
            ElectricalBatchJobRequest(project_id=project_id)
        uuid_request = ElectricalBatchJobRequest(
            project_id=project_id,
            electrical_variant_id=variant_id,
        )
        assert uuid_request.electrical_variant_id == variant_id

    def test_report_request_requires_uuid_selector(self):
        with pytest.raises(ValueError, match="electrical_variant_id"):
            ReportExportJobRequest(
                project_id=uuid.uuid4(),
                format="pdf",
            )
        variant_id = uuid.uuid4()
        request = ReportExportJobRequest(
            project_id=uuid.uuid4(),
            format="pdf",
            electrical_variant_id=variant_id,
        )
        assert request.electrical_variant_id == variant_id

    @pytest.mark.parametrize(
        ("project_error", "task_error"),
        [
            (ProjectAccessError("forbidden"), TaskAccessError),
            (ProjectNotFoundError("missing"), TaskNotFoundError),
        ],
    )
    async def test_project_write_errors_are_normalized_for_task_endpoints(
        self,
        mock_db,
        guest_principal: CurrentPrincipal,
        monkeypatch: pytest.MonkeyPatch,
        project_error: Exception,
        task_error: type[Exception],
    ):
        monkeypatch.setattr(
            ProjectService,
            "get_project_for_write",
            AsyncMock(side_effect=project_error),
        )

        with pytest.raises(task_error):
            await TaskService(mock_db)._require_project_write(
                uuid.uuid4(),
                guest_principal,
            )

    async def test_resolve_variant_hides_cross_project_and_unknown_uuid(self, mock_db):
        mock_db.execute = AsyncMock(return_value=ResultRows([]))

        with pytest.raises(TaskNotFoundError, match=ELECTRICAL_VARIANT_NOT_FOUND):
            await TaskService(mock_db)._resolve_electrical_variant(
                uuid.uuid4(),
                uuid.uuid4(),
            )

    async def test_resolve_variant_accepts_uuid_without_numeric_slot(self, mock_db):
        variant = SimpleNamespace(
            id=uuid.uuid4(),
            project_id=uuid.uuid4(),
        )
        mock_db.execute = AsyncMock(return_value=ResultRows([variant]))

        resolved = await TaskService(mock_db)._resolve_electrical_variant(
            variant.project_id,
            variant.id,
        )

        assert resolved is variant

    async def test_enqueue_locks_and_guards_project_before_variant_resolution(
        self,
        mock_db,
        guest_principal: CurrentPrincipal,
        monkeypatch: pytest.MonkeyPatch,
    ):
        monkeypatch.setattr(ProjectService, "get_project_for_write", _allow_project_write)
        project_id = uuid.uuid4()
        events: list[str] = []
        existing = BackgroundTask(
            id=uuid.uuid4(),
            type=TASK_ELECTRICAL_BATCH,
            status="queued",
            project_id=project_id,
            session_id="sid",
            request_payload={},
            progress_current=0,
        )
        service = TaskService(mock_db)

        async def guard(*args, **kwargs):
            events.append("guard")

        async def lock(*args, **kwargs):
            events.append("lock")

        async def resolve(*args, **kwargs):
            events.append("resolve")
            return SimpleNamespace(
                id=uuid.uuid4(),
                project_id=project_id,
            )

        service._require_project_write = AsyncMock(side_effect=guard)  # type: ignore[method-assign]
        service._lock_project_for_electrical_task = AsyncMock(side_effect=lock)  # type: ignore[method-assign]
        service._resolve_electrical_variant = AsyncMock(side_effect=resolve)  # type: ignore[method-assign]
        service._find_active_by_dedupe = AsyncMock(return_value=existing)  # type: ignore[method-assign]

        result = await service.create_electrical_batch_task(
            ElectricalBatchJobRequest(
                project_id=project_id,
                electrical_variant_id=uuid.uuid4(),
            ),
            guest_principal,
            queue=QueueOk(),
        )

        assert result is existing
        assert events == ["lock", "resolve", "guard", "lock"]

    async def test_create_electrical_batch_task_enqueues_and_persists_payload(
        self,
        mock_db,
        guest_principal: CurrentPrincipal,
        monkeypatch: pytest.MonkeyPatch,
    ):
        monkeypatch.setattr(ProjectService, "get_project_for_write", _allow_project_write)
        service = TaskService(mock_db)
        service._find_active_by_dedupe = AsyncMock(return_value=None)  # type: ignore[method-assign]
        _allow_active_task_limits(service)
        project_id = uuid.uuid4()
        requested_variant_id = uuid.uuid4()
        variant = _allow_electrical_variant(
            service,
            project_id,
            electrical_variant_id=requested_variant_id,
        )

        task = await service.create_electrical_batch_task(
            ElectricalBatchJobRequest(
                project_id=project_id,
                electrical_variant_id=requested_variant_id,
                winding_pitch=120,
                force_cable_type=True,
                include_errors=False,
            ),
            guest_principal,
            queue=QueueOk(),
            idempotency_key="click-1",
        )

        assert task.status == "enqueued"
        assert TaskService.is_idempotency_replay(task) is False
        assert task.session_id == "sid"
        assert task.electrical_variant_id == variant.id
        assert task.request_payload["project_id"] == str(project_id)
        assert task.request_payload["electrical_variant_id"] == str(requested_variant_id)
        assert "variant_number" not in task.request_payload
        assert task.request_payload["force_cable_type"] is True
        assert task.request_payload["skip_manual"] is True
        assert task.request_payload["requested_scope"] == "all"
        assert len(task.request_payload["object_ids"]) == 1
        assert task.request_payload["electrical_params"]["winding_pitch"] == 120
        assert task.request_payload["include_errors"] is False
        assert task.arq_job_id is not None
        service._resolve_electrical_variant.assert_awaited_once_with(  # type: ignore[attr-defined]
            project_id,
            requested_variant_id,
        )
        assert service._lock_project_for_electrical_task.await_count == 2  # type: ignore[attr-defined]
        service._lock_project_for_electrical_task.assert_any_await(project_id)  # type: ignore[attr-defined]
        mock_db.add.assert_called_once()

    async def test_create_electrical_batch_task_allows_explicit_manual_overwrite(
        self,
        mock_db,
        guest_principal: CurrentPrincipal,
        monkeypatch: pytest.MonkeyPatch,
    ):
        monkeypatch.setattr(ProjectService, "get_project_for_write", _allow_project_write)
        service = TaskService(mock_db)
        service._find_active_by_dedupe = AsyncMock(return_value=None)  # type: ignore[method-assign]
        _allow_active_task_limits(service)
        project_id = uuid.uuid4()
        variant = _allow_electrical_variant(service, project_id)

        task = await service.create_electrical_batch_task(
            ElectricalBatchJobRequest(
                project_id=project_id,
                electrical_variant_id=variant.id,
                skip_manual=False,
            ),
            guest_principal,
            queue=QueueOk(),
            idempotency_key="overwrite-manual",
        )

        assert task.request_payload["skip_manual"] is False
        assert task.request_payload["electrical_variant_id"] == str(variant.id)
        service._resolve_electrical_variant.assert_awaited_once_with(  # type: ignore[attr-defined]
            project_id,
            variant.id,
        )
        mock_db.add.assert_called_once()

    async def test_create_returns_existing_active_task(
        self,
        mock_db,
        guest_principal: CurrentPrincipal,
        monkeypatch: pytest.MonkeyPatch,
    ):
        monkeypatch.setattr(ProjectService, "get_project_for_write", _allow_project_write)
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
        project_id = uuid.uuid4()
        variant = _allow_electrical_variant(service, project_id)

        task = await service.create_electrical_batch_task(
            ElectricalBatchJobRequest(
                project_id=project_id,
                electrical_variant_id=variant.id,
            ),
            guest_principal,
            queue=QueueOk(),
        )

        assert task is existing
        assert TaskService.is_idempotency_replay(task) is True
        mock_db.add.assert_not_called()

    async def test_explicit_idempotency_key_rejects_different_electrical_variant(
        self,
        mock_db,
        guest_principal: CurrentPrincipal,
        monkeypatch: pytest.MonkeyPatch,
    ):
        monkeypatch.setattr(ProjectService, "get_project_for_write", _allow_project_write)
        project_id = uuid.uuid4()
        first_variant_id = uuid.uuid4()
        second_variant_id = uuid.uuid4()
        first_request = ElectricalBatchJobRequest(
            project_id=project_id,
            electrical_variant_id=first_variant_id,
        )
        existing = BackgroundTask(
            id=uuid.uuid4(),
            type=TASK_ELECTRICAL_BATCH,
            status="enqueued",
            project_id=project_id,
            electrical_variant_id=first_variant_id,
            session_id="sid",
            request_payload=TaskService._electrical_payload(
                first_request,
                electrical_variant_id=first_variant_id,
                object_ids=None,
                object_overrides=None,
            ),
            progress_current=0,
        )
        service = TaskService(mock_db)
        service._find_active_by_dedupe = AsyncMock(return_value=existing)  # type: ignore[method-assign]
        _allow_electrical_variant(
            service,
            project_id,
            electrical_variant_id=second_variant_id,
        )

        with pytest.raises(TaskIdempotencyConflictError) as exc_info:
            await service.create_electrical_batch_task(
                ElectricalBatchJobRequest(
                    project_id=project_id,
                    electrical_variant_id=second_variant_id,
                ),
                guest_principal,
                queue=QueueOk(),
                idempotency_key="one-click-one-operation",
            )

        assert exc_info.value.as_detail() == {
            "code": "TASK_IDEMPOTENCY_KEY_REUSED",
            "message": "Idempotency-Key уже использован для другой операции",
        }
        mock_db.add.assert_not_called()

    async def test_create_rejects_when_project_active_task_limit_reached(
        self,
        mock_db,
        guest_principal: CurrentPrincipal,
        monkeypatch: pytest.MonkeyPatch,
    ):
        monkeypatch.setattr(ProjectService, "get_project_for_write", _allow_project_write)
        monkeypatch.setattr("app.services.tasks.base.settings.MAX_ACTIVE_TASKS_GLOBAL", 200)
        monkeypatch.setattr("app.services.tasks.base.settings.MAX_ACTIVE_TASKS_PER_PROJECT", 1)
        monkeypatch.setattr("app.services.tasks.base.settings.MAX_ACTIVE_TASKS_PER_PRINCIPAL", 5)
        service = TaskService(mock_db)
        service._find_active_by_dedupe = AsyncMock(return_value=None)  # type: ignore[method-assign]
        service._active_global_task_count = AsyncMock(return_value=0)  # type: ignore[method-assign]
        service._active_project_task_count = AsyncMock(return_value=1)  # type: ignore[method-assign]
        service._active_principal_task_count = AsyncMock(return_value=0)  # type: ignore[method-assign]
        project_id = uuid.uuid4()
        variant = _allow_electrical_variant(service, project_id)

        with pytest.raises(TaskLimitError, match="активных задач для проекта"):
            await service.create_electrical_batch_task(
                ElectricalBatchJobRequest(
                    project_id=project_id,
                    electrical_variant_id=variant.id,
                ),
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
        monkeypatch.setattr(ProjectService, "get_project_for_write", _allow_project_write)
        monkeypatch.setattr("app.services.tasks.base.settings.MAX_ACTIVE_TASKS_GLOBAL", 200)
        monkeypatch.setattr("app.services.tasks.base.settings.MAX_ACTIVE_TASKS_PER_PROJECT", 3)
        monkeypatch.setattr("app.services.tasks.base.settings.MAX_ACTIVE_TASKS_PER_PRINCIPAL", 1)
        service = TaskService(mock_db)
        service._find_active_by_dedupe = AsyncMock(return_value=None)  # type: ignore[method-assign]
        service._active_global_task_count = AsyncMock(return_value=0)  # type: ignore[method-assign]
        service._active_project_task_count = AsyncMock(return_value=0)  # type: ignore[method-assign]
        service._active_principal_task_count = AsyncMock(return_value=1)  # type: ignore[method-assign]
        service._lock_project_for_electrical_task = AsyncMock()  # type: ignore[method-assign]

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
        monkeypatch.setattr(ProjectService, "get_project_for_write", _allow_project_write)
        monkeypatch.setattr("app.services.tasks.base.settings.MAX_ACTIVE_TASKS_GLOBAL", 1)
        service = TaskService(mock_db)
        service._find_active_by_dedupe = AsyncMock(return_value=None)  # type: ignore[method-assign]
        service._active_global_task_count = AsyncMock(return_value=1)  # type: ignore[method-assign]
        service._active_project_task_count = AsyncMock(return_value=0)  # type: ignore[method-assign]
        service._active_principal_task_count = AsyncMock(return_value=0)  # type: ignore[method-assign]
        project_id = uuid.uuid4()
        variant = _allow_electrical_variant(service, project_id)

        with pytest.raises(TaskLimitError, match="Очередь задач перегружена"):
            await service.create_report_export_task(
                ReportExportJobRequest(
                    project_id=project_id,
                    format="pdf",
                    electrical_variant_id=variant.id,
                ),
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
        monkeypatch.setattr(ProjectService, "get_project_for_write", _allow_project_write)
        service = TaskService(mock_db)
        service._find_active_by_dedupe = AsyncMock(return_value=None)  # type: ignore[method-assign]
        service._lock_project_for_electrical_task = AsyncMock()  # type: ignore[method-assign]
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
        assert TaskService.is_idempotency_replay(task) is False
        service._lock_project_for_electrical_task.assert_awaited_once_with(project_id)  # type: ignore[attr-defined]
        mock_db.add.assert_called_once()

    async def test_heat_loss_idempotency_key_rejects_changed_payload(
        self,
        mock_db,
        guest_principal: CurrentPrincipal,
        monkeypatch: pytest.MonkeyPatch,
    ):
        monkeypatch.setattr(ProjectService, "get_project_for_write", _allow_project_write)
        project_id = uuid.uuid4()
        first_request = HeatLossBatchJobRequest(
            project_id=project_id,
            include_errors=False,
        )
        existing = BackgroundTask(
            id=uuid.uuid4(),
            type=TASK_HEAT_LOSS_BATCH,
            status="succeeded",
            project_id=project_id,
            session_id="sid",
            request_payload=TaskService._heat_loss_payload(first_request),
            progress_current=0,
        )
        service = TaskService(mock_db)
        service._find_active_by_dedupe = AsyncMock(return_value=existing)  # type: ignore[method-assign]
        service._lock_project_for_electrical_task = AsyncMock()  # type: ignore[method-assign]

        with pytest.raises(TaskIdempotencyConflictError) as exc_info:
            await service.create_heat_loss_batch_task(
                HeatLossBatchJobRequest(
                    project_id=project_id,
                    include_errors=True,
                ),
                guest_principal,
                queue=QueueOk(),
                idempotency_key="heat-one-key-one-operation",
            )

        assert exc_info.value.code == "TASK_IDEMPOTENCY_KEY_REUSED"
        mock_db.add.assert_not_called()

    async def test_heat_loss_integrity_recovery_is_marked_as_idempotency_replay(
        self,
        mock_db,
        guest_principal: CurrentPrincipal,
        monkeypatch: pytest.MonkeyPatch,
    ):
        monkeypatch.setattr(ProjectService, "get_project_for_write", _allow_project_write)
        project_id = uuid.uuid4()
        request = HeatLossBatchJobRequest(project_id=project_id, include_errors=False)
        existing = BackgroundTask(
            id=uuid.uuid4(),
            type=TASK_HEAT_LOSS_BATCH,
            status="enqueued",
            project_id=project_id,
            session_id="sid",
            request_payload=TaskService._heat_loss_payload(request),
            progress_current=0,
        )
        service = TaskService(mock_db)
        service._lock_project_for_electrical_task = AsyncMock()  # type: ignore[method-assign]
        service._find_active_by_dedupe = AsyncMock(  # type: ignore[method-assign]
            side_effect=[None, None, existing]
        )
        _allow_active_task_limits(service)
        mock_db.commit.side_effect = [IntegrityError("duplicate", {}, Exception())]

        task = await service.create_heat_loss_batch_task(
            request,
            guest_principal,
            queue=QueueOk(),
            idempotency_key="same-heat-race",
        )

        assert task is existing
        assert TaskService.is_idempotency_replay(task) is True
        mock_db.rollback.assert_awaited_once()
        assert service._find_active_by_dedupe.await_count == 3  # type: ignore[attr-defined]

    async def test_create_report_export_task_enqueues_and_persists_payload(
        self,
        mock_db,
        employee_principal: CurrentPrincipal,
        monkeypatch: pytest.MonkeyPatch,
    ):
        monkeypatch.setattr(ProjectService, "get_project_for_write", _allow_project_write)
        service = TaskService(mock_db)
        service._find_active_by_dedupe = AsyncMock(return_value=None)  # type: ignore[method-assign]
        _allow_active_task_limits(service)
        project_id = uuid.uuid4()
        variant = _allow_electrical_variant(service, project_id)

        task = await service.create_report_export_task(
            ReportExportJobRequest(
                project_id=project_id,
                format="pdf",
                electrical_variant_id=variant.id,
                sections=["summary", "electrical"],
            ),
            employee_principal,
            queue=QueueOk(),
            idempotency_key="report-click-1",
        )

        assert task.status == "enqueued"
        assert task.type == TASK_REPORT_EXPORT
        assert task.user_id == employee_principal.user_id
        assert task.electrical_variant_id == variant.id
        assert task.progress_total == 3
        assert task.request_payload == {
            "project_id": str(project_id),
            "electrical_variant_id": str(variant.id),
            "format": "pdf",
            "sections": ["summary", "electrical"],
        }
        service._resolve_electrical_variant.assert_awaited_once_with(  # type: ignore[attr-defined]
            project_id,
            variant.id,
        )
        assert service._lock_project_for_electrical_task.await_count == 2  # type: ignore[attr-defined]
        assert task.arq_job_id is not None
        mock_db.add.assert_called_once()

    async def test_guest_cannot_enqueue_report_export(
        self,
        mock_db,
        guest_principal: CurrentPrincipal,
    ):
        with pytest.raises(TaskAccessError):
            await TaskService(mock_db).create_report_export_task(
                ReportExportJobRequest(
                    project_id=uuid.uuid4(),
                    format="pdf",
                    electrical_variant_id=uuid.uuid4(),
                ),
                guest_principal,
                queue=QueueOk(),
            )

    async def test_guest_cannot_enqueue_extended_catalog(
        self,
        mock_db,
        guest_principal: CurrentPrincipal,
        monkeypatch: pytest.MonkeyPatch,
    ):
        monkeypatch.setattr(ProjectService, "get_project_for_write", _allow_project_write)
        service = TaskService(mock_db)
        service._lock_project_for_electrical_task = AsyncMock()  # type: ignore[method-assign]

        with pytest.raises(TaskAccessError):
            await service.create_electrical_batch_task(
                ElectricalBatchJobRequest(
                    project_id=uuid.uuid4(),
                    electrical_variant_id=uuid.uuid4(),
                    cable_source="extended",
                ),
                guest_principal,
                queue=QueueOk(),
            )


class TestTaskStateTransitions:
    async def test_worker_resolves_current_uuid_payload(self, mock_db):
        project_id = uuid.uuid4()
        variant_id = uuid.uuid4()
        task = BackgroundTask(
            id=uuid.uuid4(),
            type=TASK_ELECTRICAL_BATCH,
            status="running",
            project_id=project_id,
            electrical_variant_id=variant_id,
            session_id="sid",
            request_payload={},
            progress_current=0,
        )
        service = TaskService(mock_db)
        service._resolve_electrical_variant = AsyncMock(  # type: ignore[method-assign]
            return_value=SimpleNamespace(id=variant_id, project_id=project_id)
        )

        resolved = await service._current_task_variant_id(
            task,
            {
                "project_id": str(project_id),
                "electrical_variant_id": str(variant_id),
            },
            db=mock_db,
        )

        assert resolved == variant_id
        service._resolve_electrical_variant.assert_awaited_once_with(  # type: ignore[attr-defined]
            project_id,
            variant_id,
            db=mock_db,
        )

    async def test_worker_rejects_payload_without_uuid_identity(self, mock_db):
        variant_id = uuid.uuid4()
        task = BackgroundTask(
            id=uuid.uuid4(),
            type=TASK_ELECTRICAL_BATCH,
            status="running",
            project_id=uuid.uuid4(),
            electrical_variant_id=variant_id,
            session_id="sid",
            request_payload={},
            progress_current=0,
        )
        service = TaskService(mock_db)
        service._resolve_electrical_variant = AsyncMock()  # type: ignore[method-assign]

        with pytest.raises(ValueError, match="INVALID_ELECTRICAL_VARIANT_PAYLOAD"):
            await service._current_task_variant_id(
                task,
                {"project_id": str(task.project_id)},
                db=mock_db,
            )
        service._resolve_electrical_variant.assert_not_awaited()  # type: ignore[attr-defined]

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
        service._run_heat_loss_batch.assert_awaited_once_with(
            task.id,
            attempt=1,
            worker_id="worker",
        )
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

        service._run_report_export.assert_awaited_once_with(
            task.id,
            attempt=1,
            worker_id="worker",
        )
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
        variant_id = uuid.uuid4()
        task = BackgroundTask(
            id=uuid.uuid4(),
            type=TASK_HEAT_LOSS_BATCH,
            status="running",
            project_id=project_id,
            electrical_variant_id=variant_id,
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
        mock_db.execute = AsyncMock(return_value=ResultRows([task]))

        async def fake_recalculate(
            _service,
            project_id_arg,
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

        monkeypatch.setattr(HeatBatchCalculationService, "recalculate", fake_recalculate)

        service = TaskService(mock_db, session_factory=StaticSessionFactory(mock_db))
        service._task_for_terminal_transition = AsyncMock(  # type: ignore[method-assign]
            return_value=task
        )
        await service._run_heat_loss_batch(task.id, attempt=1, worker_id="worker-a")

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
        variant_id = uuid.uuid4()
        task = BackgroundTask(
            id=uuid.uuid4(),
            type=TASK_HEAT_LOSS_BATCH,
            status="running",
            project_id=project_id,
            electrical_variant_id=variant_id,
            session_id="sid",
            request_payload={"project_id": str(project_id), "include_errors": False},
            progress_current=0,
        )
        mock_db.get = AsyncMock(return_value=task)
        mock_db.execute = AsyncMock(return_value=ResultRows([task]))

        async def fake_recalculate(_service, *args, **kwargs):
            return 0, 1, [{"object_id": "bad", "error": {"message": "hidden"}}]

        monkeypatch.setattr(HeatBatchCalculationService, "recalculate", fake_recalculate)

        service = TaskService(mock_db, session_factory=StaticSessionFactory(mock_db))
        service._task_for_terminal_transition = AsyncMock(  # type: ignore[method-assign]
            return_value=task
        )
        await service._run_heat_loss_batch(task.id, attempt=1, worker_id="worker-a")

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
        mock_db.execute = AsyncMock(return_value=ResultRows([task]))

        async def fake_recalculate(_service, *args, **kwargs):
            raise BatchCancelledError("cancelled")

        monkeypatch.setattr(HeatBatchCalculationService, "recalculate", fake_recalculate)

        service = TaskService(mock_db, session_factory=StaticSessionFactory(mock_db))
        service._task_for_terminal_transition = AsyncMock(  # type: ignore[method-assign]
            return_value=task
        )
        await service._run_heat_loss_batch(task.id, attempt=1, worker_id="worker-a")

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
        mock_db.execute = AsyncMock(return_value=ResultRows([task]))

        async def fake_recalculate(_service, *args, **kwargs):
            raise RuntimeError("boom")

        monkeypatch.setattr(HeatBatchCalculationService, "recalculate", fake_recalculate)

        service = TaskService(mock_db, session_factory=StaticSessionFactory(mock_db))
        service._task_for_terminal_transition = AsyncMock(  # type: ignore[method-assign]
            return_value=task
        )
        await service._run_heat_loss_batch(task.id, attempt=1, worker_id="worker-a")

        assert task.status == "failed"
        assert task.error_message == "RuntimeError: boom"

    async def test_run_report_export_marks_succeeded(
        self,
        mock_db,
        monkeypatch: pytest.MonkeyPatch,
    ):
        project_id = uuid.uuid4()
        variant_id = uuid.uuid4()
        task = BackgroundTask(
            id=uuid.uuid4(),
            type=TASK_REPORT_EXPORT,
            status="running",
            project_id=project_id,
            electrical_variant_id=variant_id,
            user_id=uuid.uuid4(),
            request_payload={
                "project_id": str(project_id),
                "electrical_variant_id": str(variant_id),
                "format": "pdf",
                "sections": ["summary"],
            },
            progress_current=0,
            progress_total=3,
        )
        mock_db.get = AsyncMock(return_value=task)
        mock_db.execute = AsyncMock(return_value=ResultRows([task]))

        class FakeReportService:
            def __init__(self, db) -> None:
                self.db = db

            async def export_trusted_for_electrical_variant(
                self,
                project_id_arg,
                fmt,
                electrical_variant_id,
                sections,
            ):
                assert project_id_arg == project_id
                assert fmt == "pdf"
                assert sections == ["summary"]
                assert electrical_variant_id == variant_id
                return b"%PDF"

        monkeypatch.setattr(
            "app.services.tasks.runners.report_export.ReportService", FakeReportService
        )
        monkeypatch.setattr(
            "app.services.tasks.runners.report_export.write_report_artifact",
            lambda task_id, fmt, data, *, attempt=None: {
                "artifact_name": f"{task_id}.{fmt}",
                "size_bytes": len(data),
            },
        )
        service = TaskService(mock_db, session_factory=StaticSessionFactory(mock_db))
        service._should_cancel = AsyncMock(return_value=False)  # type: ignore[method-assign]
        service._task_for_terminal_transition = AsyncMock(  # type: ignore[method-assign]
            return_value=task
        )

        await service._run_report_export(task.id, attempt=1, worker_id="worker-a")

        assert task.status == "succeeded"
        assert task.result_payload == {
            "project_id": str(project_id),
            "format": "pdf",
            "electrical_variant_id": str(variant_id),
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

    async def test_enqueue_records_transport_heartbeat(self, mock_db):
        task = BackgroundTask(
            id=uuid.uuid4(),
            type=TASK_ELECTRICAL_BATCH,
            status="queued",
            session_id="sid",
            request_payload={},
            progress_current=0,
        )

        await TaskService(mock_db).enqueue_existing_task(task, queue=QueueOk())

        assert task.status == "enqueued"
        assert task.heartbeat_at is not None

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
        mock_db.execute = AsyncMock(
            side_effect=[ResultRows([queued]), ResultRows([]), ResultRows([stale])]
        )
        service = TaskService(mock_db)
        service.enqueue_existing_task = AsyncMock()  # type: ignore[method-assign]
        service._mark_failed = AsyncMock()  # type: ignore[method-assign]

        recovered = await service.recover_stuck_tasks(queue=QueueOk())

        assert recovered == 2
        service.enqueue_existing_task.assert_awaited_once_with(queued, queue=ANY)
        service._mark_failed.assert_awaited_once()

    async def test_recovery_does_not_requeue_task_owned_by_live_worker(self, mock_db):
        stale = BackgroundTask(
            id=uuid.uuid4(),
            type=TASK_ELECTRICAL_BATCH,
            status="running",
            session_id="sid",
            request_payload={},
            progress_current=0,
            attempts=1,
            locked_by="worker-a",
            heartbeat_at=datetime.now(UTC) - timedelta(minutes=10),
        )
        mock_db.execute = AsyncMock(
            side_effect=[ResultRows([]), ResultRows([]), ResultRows([stale])]
        )
        service = TaskService(mock_db)
        service.enqueue_existing_task = AsyncMock()  # type: ignore[method-assign]
        queue = QueueOk()
        queue.is_worker_ready = AsyncMock(return_value=True)  # type: ignore[method-assign]

        recovered = await service.recover_stuck_tasks(queue=queue)

        assert recovered == 0
        queue.is_worker_ready.assert_awaited_once_with("worker-a")  # type: ignore[attr-defined]
        service.enqueue_existing_task.assert_not_awaited()


class TestAttemptFencing:
    async def test_stale_attempt_cannot_publish_after_new_attempt_wins(self, mock_db):
        task = BackgroundTask(
            id=uuid.uuid4(),
            type=TASK_HEAT_LOSS_BATCH,
            status="running",
            session_id="sid",
            request_payload={},
            progress_current=0,
            attempts=2,
            locked_by="worker-new",
        )
        mock_db.execute = AsyncMock(side_effect=(ResultRows([]), ResultRows([task])))
        service = TaskService(mock_db)
        service._record_task_audit = AsyncMock()  # type: ignore[method-assign]

        stale_published = await service._mark_succeeded(
            task.id,
            {"winner": "stale"},
            attempt=1,
            worker_id="worker-old",
        )
        current_published = await service._mark_succeeded(
            task.id,
            {"winner": "current"},
            attempt=2,
            worker_id="worker-new",
        )

        assert stale_published is False
        assert current_published is True
        assert task.status == "succeeded"
        assert task.result_payload == {"winner": "current"}
        mock_db.rollback.assert_awaited_once()
        mock_db.commit.assert_awaited_once()

    async def test_stale_attempt_progress_is_guarded_by_database_cas(self, mock_db):
        mock_db.execute = AsyncMock(return_value=ResultRows([]))
        service = TaskService(mock_db, session_factory=StaticSessionFactory(mock_db))

        await service._update_progress(
            uuid.uuid4(),
            BatchProgress(current=7, total=10, phase="calculate"),
            attempt=3,
            worker_id="worker-old",
        )

        statement = mock_db.execute.await_args.args[0]
        sql = str(statement)
        params = statement.compile().params.values()
        assert "background_tasks.status" in sql
        assert "background_tasks.attempts" in sql
        assert "background_tasks.locked_by" in sql
        assert 3 in params
        assert "worker-old" in params
        mock_db.commit.assert_awaited_once()

    async def test_lost_attempt_observes_cancellation_barrier(self, mock_db):
        result = MagicMock()
        result.one_or_none.return_value = None
        mock_db.execute = AsyncMock(return_value=result)
        service = TaskService(mock_db, session_factory=StaticSessionFactory(mock_db))

        should_stop = await service._should_cancel(
            uuid.uuid4(),
            attempt=1,
            worker_id="worker-old",
        )

        assert should_stop is True


class TestTaskResponse:
    def test_to_response_includes_progress_result_and_links(self):
        task_id = uuid.uuid4()
        object_id = uuid.uuid4()
        variant_id = uuid.uuid4()
        task = BackgroundTask(
            id=task_id,
            type=TASK_ELECTRICAL_BATCH,
            status="succeeded",
            project_id=uuid.uuid4(),
            electrical_variant_id=variant_id,
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
        assert response.electrical_variant_id == variant_id
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
        variant_id = uuid.uuid4()
        task = BackgroundTask(
            id=task_id,
            type=TASK_REPORT_EXPORT,
            status="succeeded",
            project_id=project_id,
            electrical_variant_id=variant_id,
            user_id=uuid.uuid4(),
            request_payload={},
            result_payload={
                "project_id": str(project_id),
                "format": "pdf",
                "electrical_variant_id": str(variant_id),
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
        assert response.electrical_variant_id == variant_id
        assert response.result is not None
        assert response.result.electrical_variant_id == variant_id
        assert response.result.filename == "report.pdf"
        assert response.links.status.endswith(f"/reports/jobs/{task_id}")
        assert response.links.result.endswith(f"/reports/jobs/{task_id}/download")
