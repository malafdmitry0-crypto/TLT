"""Electrical batch task runner."""

from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.background_task import BackgroundTask
from app.services.calculation.container import CalculationContainer
from app.services.calculation.errors import BatchCancelledError
from app.services.tasks.progress import ProgressThrottler
from app.services.tasks.recovery import TaskRecovery


class ElectricalTaskRunner(TaskRecovery):
    async def _current_task_variant_id(
        self,
        task: BackgroundTask,
        payload: dict[str, Any],
        *,
        db: AsyncSession | None = None,
    ) -> UUID:
        try:
            project_id = UUID(str(payload["project_id"]))
            variant_id = UUID(str(payload["electrical_variant_id"]))
        except (KeyError, TypeError, ValueError) as exc:
            raise ValueError("INVALID_ELECTRICAL_VARIANT_PAYLOAD") from exc
        if task.project_id != project_id or task.electrical_variant_id != variant_id:
            raise ValueError("ELECTRICAL_VARIANT_TASK_SCOPE_MISMATCH")
        await self._resolve_electrical_variant(project_id, variant_id, db=db)
        return variant_id

    async def _run_electrical_batch(
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
            object_overrides = [
                {
                    "object_id": UUID(str(item["object_id"])),
                    "cable_type": item.get("cable_type"),
                }
                for item in payload.get("object_overrides") or []
            ]
            async with self.session_factory() as calc_db:
                variant_id = await self._current_task_variant_id(task, payload, db=calc_db)
                (
                    calculated,
                    skipped,
                    heat_loss_failed,
                    errors,
                    calculations,
                ) = await CalculationContainer(calc_db).electrical_batch.calculate_for_variant(
                    UUID(payload["project_id"]),
                    variant_id,
                    payload.get("cable_source", "builtin"),
                    payload.get("cable_type", "self_regulating_tt"),
                    payload.get("electrical_params") or {},
                    skip_manual=bool(payload.get("skip_manual", True)),
                    return_calcs=bool(payload.get("include_results", False)),
                    progress_callback=progress.offer,
                    should_cancel=lambda: self._should_cancel(
                        task_id,
                        attempt=attempt,
                        worker_id=worker_id,
                    ),
                    object_ids=object_ids,
                    object_overrides=object_overrides,
                    force_cable_type=bool(payload.get("force_cable_type", False)),
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
        requested_scope = str(
            payload.get("requested_scope") or ("selected" if payload.get("object_ids") else "all")
        )
        result_payload = {
            "electrical_variant_id": str(variant_id),
            "calculated": calculated,
            "skipped": skipped,
            "requested_scope": requested_scope,
            "scope": requested_scope,
            "heat_loss_failed": heat_loss_failed,
            "errors": errors if bool(payload.get("include_errors", True)) else [],
            "results": [
                {
                    "id": str(calculation.id),
                    "object_id": str(calculation.object_id),
                    "cable_type": calculation.cable_type,
                    "cable_type_source": calculation.cable_type_source,
                    "cable_mark": calculation.cable_mark,
                    "cable_mark_source": calculation.cable_mark_source,
                    "cable_snapshot": calculation.cable_snapshot,
                    "results": calculation.results,
                }
                for calculation in calculations
            ]
            if bool(payload.get("include_results", False))
            else [],
        }
        await self._mark_succeeded(
            task_id,
            result_payload,
            attempt=attempt,
            worker_id=worker_id,
        )
