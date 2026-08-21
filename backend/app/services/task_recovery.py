"""Consumer-independent, single-leader recovery for durable background tasks."""

from __future__ import annotations

import socket
import uuid
from collections.abc import Awaitable
from typing import Any, cast

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.services.task_queue import TaskQueue
from app.services.task_service import TaskService

_RELEASE_LEADER_LUA = """
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
"""


class TaskRecoveryCoordinator:
    def __init__(
        self,
        *,
        queue: TaskQueue | None = None,
        session_factory: async_sessionmaker[AsyncSession] | None = None,
    ) -> None:
        self.queue = queue or TaskQueue()
        self.session_factory = session_factory or AsyncSessionLocal
        self.identity = f"{socket.gethostname()}:{uuid.uuid4().hex}"

    async def run_once(self) -> int:
        interval = max(5, settings.WORKER_RECOVERY_INTERVAL_SECONDS)
        acquired = await self.queue.redis.set(
            settings.WORKER_RECOVERY_LEADER_KEY,
            self.identity,
            nx=True,
            ex=max(30, interval * 2),
        )
        if not acquired:
            return 0
        try:
            async with self.session_factory() as db:
                return await TaskService(db).recover_stuck_tasks(queue=self.queue)
        finally:
            await cast(
                Awaitable[Any],
                self.queue.redis.eval(
                    _RELEASE_LEADER_LUA,
                    1,
                    settings.WORKER_RECOVERY_LEADER_KEY,
                    self.identity,
                ),
            )

    async def close(self) -> None:
        await self.queue.close()
