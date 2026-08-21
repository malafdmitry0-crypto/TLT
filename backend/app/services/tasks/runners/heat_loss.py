"""Heat-loss batch task runner."""

from uuid import UUID

from app.models.background_task import BackgroundTask
from app.services.calculation.container import CalculationContainer
from app.services.calculation.errors import BatchCancelledError
from app.services.tasks.progress import ProgressThrottler
from app.services.tasks.runners.electrical import ElectricalTaskRunner


class HeatLossTaskRunner(ElectricalTaskRunner):
    async def _run_heat_loss_batch(
        self,
        task_id: UUID,
        *,
        attempt: int,
        worker_id: str,
    ) -> None:
        task = await self.db.get(BackgroundTask, task_id)
        if task is None:
            return
        payload = dict(task.request_payload or {})
        progress = ProgressThrottler(
            persist=lambda value: self._update_progress(
                task_id,
                value,
                attempt=attempt,
                worker_id=worker_id,
            )
        )
        try:
            object_ids = [
                UUID(str(object_id)) for object_id in payload.get("object_ids") or []
            ] or None
            async with self.session_factory() as calc_db:
                updated, failed, errors = await CalculationContainer(
                    calc_db
                ).heat_batch.recalculate(
                    UUID(payload["project_id"]),
                    progress_callback=progress.offer,
                    should_cancel=lambda: self._should_cancel(
                        task_id,
                        attempt=attempt,
                        worker_id=worker_id,
                    ),
                    object_ids=object_ids,
                )
        except BatchCancelledError:
            await progress.flush()
            await self._mark_cancelled(task_id, attempt=attempt, worker_id=worker_id)
            return
        except Exception as exc:
            await progress.flush()
            await self._mark_failed(
                task_id,
                f"{type(exc).__name__}: {exc}",
                attempt=attempt,
                worker_id=worker_id,
            )
            return
        await progress.flush()
        await self._mark_succeeded(
            task_id,
            {
                "updated": updated,
                "failed": failed,
                "errors": errors if bool(payload.get("include_errors", True)) else [],
            },
            attempt=attempt,
            worker_id=worker_id,
        )
