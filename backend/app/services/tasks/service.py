"""Public task workflow facade and worker dispatcher."""

from uuid import UUID

from app.models.background_task import BackgroundTask
from app.schemas.calculation import CalculationTaskResponse
from app.services.tasks.contracts import (
    SUPPORTED_TASK_TYPES,
    TASK_ELECTRICAL_BATCH,
    TASK_HEAT_LOSS_BATCH,
    TASK_REPORT_EXPORT,
    TERMINAL_STATUSES,
)
from app.services.tasks.creation import TaskCreation
from app.services.tasks.responses import task_to_response


class TaskService(TaskCreation):
    async def run_task(self, task_id: UUID, *, worker_id: str) -> None:
        task = await self._claim_task_for_run(task_id, worker_id=worker_id)
        if task is None:
            current = await self.db.get(BackgroundTask, task_id)
            if (
                current is not None
                and current.cancel_requested
                and current.status not in TERMINAL_STATUSES
            ):
                await self._mark_cancelled(task_id)
            return
        if task.type not in SUPPORTED_TASK_TYPES:
            await self._mark_failed(
                task_id,
                f"Неизвестный тип задачи: {task.type}",
                attempt=task.attempts,
                worker_id=worker_id,
            )
            return
        runners = {
            TASK_HEAT_LOSS_BATCH: self._run_heat_loss_batch,
            TASK_ELECTRICAL_BATCH: self._run_electrical_batch,
            TASK_REPORT_EXPORT: self._run_report_export,
        }
        await runners[task.type](
            task_id,
            attempt=task.attempts,
            worker_id=worker_id,
        )

    @staticmethod
    def to_response(task: BackgroundTask) -> CalculationTaskResponse:
        return task_to_response(task)
