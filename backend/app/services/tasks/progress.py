"""Worker progress write throttling."""

from collections.abc import Awaitable, Callable
from time import monotonic

from app.services.calculation.contracts import BatchProgress
from app.services.tasks.contracts import ProgressWritePolicy


class ProgressThrottler:
    """Persist frequent worker progress events only at useful UI checkpoints."""

    def __init__(
        self,
        persist: Callable[[BatchProgress], Awaitable[None]],
        *,
        policy: ProgressWritePolicy | None = None,
        now_func: Callable[[], float] = monotonic,
    ) -> None:
        self._persist = persist
        self._policy = policy or ProgressWritePolicy()
        self._now = now_func
        self._last_persisted: BatchProgress | None = None
        self._last_persisted_at: float | None = None
        self._buffered: BatchProgress | None = None

    async def offer(self, progress: BatchProgress) -> None:
        now = self._now()
        if self._should_persist(progress, now):
            await self._write(progress, now)
            return
        self._buffered = progress

    async def flush(self) -> None:
        if self._buffered is None or self._buffered == self._last_persisted:
            return
        await self._write(self._buffered, self._now())

    async def _write(self, progress: BatchProgress, now: float) -> None:
        await self._persist(progress)
        self._last_persisted = progress
        self._last_persisted_at = now
        self._buffered = None

    def _should_persist(self, progress: BatchProgress, now: float) -> bool:
        if self._last_persisted is None or self._last_persisted_at is None:
            return True
        if progress == self._last_persisted:
            return False
        if progress.phase != self._last_persisted.phase or progress.phase != "calculate":
            return True
        elapsed_ms = (now - self._last_persisted_at) * 1000
        if elapsed_ms < self._policy.min_interval_ms:
            return False
        current_percent = self._percent(progress)
        previous_percent = self._percent(self._last_persisted)
        if current_percent is None or previous_percent is None:
            return progress.current != self._last_persisted.current
        return (current_percent - previous_percent) >= self._policy.min_percent_delta

    @staticmethod
    def _percent(progress: BatchProgress) -> float | None:
        if progress.total is None or progress.total <= 0:
            return None
        return min(100.0, (progress.current / progress.total) * 100)
