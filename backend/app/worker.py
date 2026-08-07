"""Worker entrypoint for CPU-bound calculation tasks."""

from __future__ import annotations

import asyncio
import logging
import random
from collections.abc import Callable
from contextlib import suppress
from uuid import UUID

from sqlalchemy import select

from app.core.config import settings
from app.core.database import AsyncSessionLocal, engine
from app.core.logging_config import configure_logging
from app.core.redis_client import close_redis, get_redis
from app.reference_data.loader import preload_all
from app.services.task_queue import TaskQueue
from app.services.task_service import TaskService
from app.services.worker_readiness import (
    WorkerHeartbeat,
    clear_worker_ready,
    mark_worker_ready,
    worker_consumer_name,
)

configure_logging()
logger = logging.getLogger("heatcalc.worker")
_DEPENDENCY_PROBE_TIMEOUT_SECONDS = 5


class CalculationWorker:
    def __init__(
        self,
        *,
        consumer: str | None = None,
        jitter_func: Callable[[float, float], float] = random.uniform,
    ) -> None:
        self.consumer = consumer or worker_consumer_name()
        self.queue = TaskQueue()
        self._last_recovery = 0.0
        self._jitter_func = jitter_func

    async def run(self) -> None:
        heartbeat: WorkerHeartbeat | None = None
        event_loop_heartbeat: asyncio.Task[None] | None = None
        readiness_published = False
        try:
            preload_all()
            await self._probe_runtime_dependencies()
            await mark_worker_ready(self.queue.redis, self.consumer)
            readiness_published = True
            heartbeat = WorkerHeartbeat(self.queue.redis_url, self.consumer)
            heartbeat.start()
            event_loop_heartbeat = asyncio.create_task(self._tick_event_loop(heartbeat))
            logger.info("Calculation worker started as %s", self.consumer)
            backoff_seconds = 1
            runtime_ready = True
            while True:
                if runtime_ready and heartbeat.is_paused:
                    # A heartbeat transport failure is also a readiness
                    # failure. Only the full dependency probe below may make
                    # the consumer visible again.
                    runtime_ready = False
                    await self._reset_runtime_connections()
                if not runtime_ready:
                    try:
                        await self._probe_runtime_dependencies()
                        await mark_worker_ready(self.queue.redis, self.consumer)
                        heartbeat.resume()
                        runtime_ready = True
                        backoff_seconds = 1
                        logger.info("Worker runtime dependencies recovered")
                    except asyncio.CancelledError:
                        raise
                    except Exception:
                        logger.exception(
                            "Worker dependency reprobe failed; retrying in %s seconds",
                            backoff_seconds,
                        )
                        await asyncio.sleep(self._retry_delay(backoff_seconds))
                        backoff_seconds = min(
                            backoff_seconds * 2,
                            settings.WORKER_RETRY_BACKOFF_MAX_SECONDS,
                        )
                        continue
                try:
                    await self._recover_if_due()
                    messages = await self.queue.read(
                        consumer=self.consumer,
                        count=1,
                        block_ms=settings.WORKER_POLL_TIMEOUT_MS,
                    )
                    for _stream, entries in messages:
                        for stream_id, fields in entries:
                            await self._handle_message(stream_id, fields)
                    backoff_seconds = 1
                except asyncio.CancelledError:
                    raise
                except Exception:
                    runtime_ready = False
                    heartbeat.pause()
                    with suppress(Exception):
                        await clear_worker_ready(self.queue.redis, self.consumer)
                    await self._reset_runtime_connections()
                    logger.exception(
                        "Worker loop failed; retrying in %s seconds",
                        backoff_seconds,
                    )
                    await asyncio.sleep(self._retry_delay(backoff_seconds))
                    backoff_seconds = min(
                        backoff_seconds * 2,
                        settings.WORKER_RETRY_BACKOFF_MAX_SECONDS,
                    )
        finally:
            if event_loop_heartbeat is not None:
                event_loop_heartbeat.cancel()
                with suppress(asyncio.CancelledError):
                    await event_loop_heartbeat
            if heartbeat is not None:
                heartbeat.stop()
            if readiness_published:
                with suppress(Exception):
                    await clear_worker_ready(self.queue.redis, self.consumer)
            await self.queue.close()

    async def _probe_database(self) -> None:
        async with asyncio.timeout(_DEPENDENCY_PROBE_TIMEOUT_SECONDS):
            async with AsyncSessionLocal() as db:
                await db.execute(select(1))

    async def _reset_runtime_connections(self) -> None:
        for name, close in (
            ("queue Redis", self.queue.close),
            ("shared Redis", close_redis),
        ):
            try:
                async with asyncio.timeout(3):
                    await close()
            except Exception as exc:
                logger.warning("Failed to close stale %s pool during recovery: %s", name, exc)
        # Do not wait for black-holed PostgreSQL sockets to close. Detach the
        # stale pool immediately; the next probe creates a fresh one.
        await engine.dispose(close=False)

    def _retry_delay(self, base_seconds: int) -> float:
        upper = min(
            float(settings.WORKER_RETRY_BACKOFF_MAX_SECONDS),
            max(1.0, float(base_seconds) * 1.5),
        )
        lower = min(upper, max(0.0, float(base_seconds) * 0.5))
        return min(upper, max(lower, self._jitter_func(lower, upper)))

    async def _probe_runtime_dependencies(self) -> None:
        await self.queue.ensure_group()
        await self.queue.redis.ping()
        # Calculation/cache paths use the shared client rather than TaskQueue's
        # dedicated pool. Readiness covers both transports.
        await get_redis().ping()
        await self._probe_database()

    async def _tick_event_loop(self, heartbeat: WorkerHeartbeat) -> None:
        while True:
            heartbeat.tick()
            await asyncio.sleep(1)

    async def _recover_if_due(self) -> None:
        now = asyncio.get_running_loop().time()
        if now - self._last_recovery < settings.WORKER_RECOVERY_INTERVAL_SECONDS:
            return
        self._last_recovery = now
        await self._claim_pending_entries()

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
            if await self._dead_letter(stream_id, fields, reason="missing_task_id"):
                await self.queue.ack(stream_id)
            return
        try:
            task_id = UUID(raw_task_id)
        except ValueError:
            logger.warning("Invalid task_id in worker stream: %s", raw_task_id)
            if await self._dead_letter(stream_id, fields, reason="invalid_task_id"):
                await self.queue.ack(stream_id)
            return

        async with AsyncSessionLocal() as db:
            if await TaskService(db).is_dead_letter_pending(task_id):
                if await self._dead_letter(
                    stream_id,
                    fields,
                    reason="worker_attempts_exhausted",
                ):
                    async with AsyncSessionLocal() as finalize_db:
                        await TaskService(finalize_db).finalize_dead_letter(task_id)
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
            if await self._dead_letter(
                stream_id,
                fields,
                reason="worker_attempts_exhausted",
            ):
                async with AsyncSessionLocal() as db:
                    await TaskService(db).finalize_dead_letter(task_id)
                await self.queue.ack(stream_id)
        elif action == "ack":
            await self.queue.ack(stream_id)

    async def _dead_letter(
        self,
        stream_id: str,
        fields: dict[str, str],
        *,
        reason: str,
    ) -> bool:
        try:
            await self.queue.dead_letter(stream_id, fields, reason=reason)
        except Exception:
            logger.exception("Failed to write dead-letter entry for stream message %s", stream_id)
            return False
        return True


async def main() -> None:
    worker = CalculationWorker()
    await worker.run()


if __name__ == "__main__":
    with suppress(KeyboardInterrupt):
        asyncio.run(main())
