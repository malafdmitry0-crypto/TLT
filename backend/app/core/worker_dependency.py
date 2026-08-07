"""FastAPI dependency that rejects new background work without a ready worker."""

from fastapi import HTTPException, status
from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.core.redis_client import get_redis
from app.services.worker_readiness import readiness_snapshot


async def require_worker_ready() -> None:
    try:
        async with AsyncSessionLocal() as db:
            await db.execute(select(1))
    except Exception as exc:
        raise _worker_not_ready("database_unavailable") from exc

    reason = "no_consumer"
    try:
        redis = get_redis()
        await redis.ping()
        snapshot = await readiness_snapshot(redis)
        if snapshot.ready:
            return
    except Exception:
        reason = "redis_unavailable"
    raise _worker_not_ready(reason)


def _worker_not_ready(reason: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail={
            "code": "WORKER_NOT_READY",
            "message": "Фоновая обработка временно недоступна. Повторите позже.",
            "retryable": True,
            "reason": reason,
        },
        headers={"Retry-After": "5"},
    )
