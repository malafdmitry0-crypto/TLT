"""Worker entrypoint for CPU-bound calculation tasks."""

from __future__ import annotations

import asyncio
import logging
import socket
from contextlib import suppress
from uuid import UUID

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.reference_data.loader import preload_all
from app.services.task_queue import TaskQueue
from app.services.task_service import TaskService

logger = logging.getLogger("heatcalc.worker")
logging.basicConfig(level=logging.INFO)


class CalculationWorker:
    def __init__(self, *, consumer: str | None = None) -> None:
        host = socket.gethostname()
        self.consumer = consumer or f"{settings.WORKER_QUEUE_CONSUMER}-{host}"
        self.queue = TaskQueue()
        self._last_recovery = 0.0

    async def run(self) -> None:
        preload_all()
        await self.queue.ensure_group()
        logger.info("Calculation worker started as %s", self.consumer)
        try:
            while True:
                await self._recover_if_due()
                messages = await self.queue.read(
                    consumer=self.consumer,
                    count=1,
                    block_ms=settings.WORKER_POLL_TIMEOUT_MS,
                )
                for _stream, entries in messages:
                    for stream_id, fields in entries:
                        await self._handle_message(stream_id, fields)
        finally:
            await self.queue.close()

    async def _recover_if_due(self) -> None:
        now = asyncio.get_running_loop().time()
        if now - self._last_recovery < settings.WORKER_RECOVERY_INTERVAL_SECONDS:
            return
        self._last_recovery = now
        await self._claim_pending_entries()
        async with AsyncSessionLocal() as db:
            recovered = await TaskService(db).recover_stuck_tasks(queue=self.queue)
            if recovered:
                logger.info("Recovered/requeued %s background tasks", recovered)

    async def _claim_pending_entries(self) -> None:
        min_idle_ms = settings.WORKER_TASK_STALE_SECONDS * 1000
        start_id = "0-0"
        while True:
            next_start_id, entries = await self.queue.reclaim_pending(
                consumer=self.consumer,
                min_idle_ms=min_idle_ms,
                start_id=start_id,
                count=10,
            )
            for stream_id, fields in entries:
                await self._handle_message(stream_id, fields)
            if not entries or next_start_id in {"0-0", start_id}:
                return
            start_id = next_start_id

    async def _handle_message(self, stream_id: str, fields: dict[str, str]) -> None:
        raw_task_id = fields.get("task_id")
        if not raw_task_id:
            await self._dead_letter(stream_id, fields, reason="missing_task_id")
            await self.queue.ack(stream_id)
            return
        try:
            task_id = UUID(raw_task_id)
        except ValueError:
            logger.warning("Invalid task_id in worker stream: %s", raw_task_id)
            await self._dead_letter(stream_id, fields, reason="invalid_task_id")
            await self.queue.ack(stream_id)
            return

        try:
            async with AsyncSessionLocal() as db:
                await TaskService(db).run_task(task_id, worker_id=self.consumer)
        except Exception as exc:
            logger.exception("Worker failed to process task %s", task_id)
            await self._handle_worker_exception(stream_id, fields, task_id, exc)
            return
        await self.queue.ack(stream_id)

    async def _handle_worker_exception(
        self,
        stream_id: str,
        fields: dict[str, str],
        task_id: UUID,
        exc: Exception,
    ) -> None:
        error_message = f"{type(exc).__name__}: {exc}"
        try:
            async with AsyncSessionLocal() as db:
                action = await TaskService(db).record_worker_exception(
                    task_id,
                    worker_id=self.consumer,
                    error_message=error_message,
                )
        except Exception:
            logger.exception("Failed to persist worker failure for task %s", task_id)
            return
        if action == "dead_letter":
            await self._dead_letter(stream_id, fields, reason="worker_attempts_exhausted")
            await self.queue.ack(stream_id)
        elif action == "ack":
            await self.queue.ack(stream_id)

    async def _dead_letter(self, stream_id: str, fields: dict[str, str], *, reason: str) -> None:
        try:
            await self.queue.dead_letter(stream_id, fields, reason=reason)
        except Exception:
            logger.exception("Failed to write dead-letter entry for stream message %s", stream_id)


async def main() -> None:
    worker = CalculationWorker()
    await worker.run()


if __name__ == "__main__":
    with suppress(KeyboardInterrupt):
        asyncio.run(main())
