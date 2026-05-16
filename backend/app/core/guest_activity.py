"""Guest session activity tracking.

Every guest request must keep the session alive, but writing
`guest_sessions.last_activity` on every read endpoint makes Postgres the
hottest write path. Redis stores the fresh activity heartbeat on every request
and throttles DB writes to at most once per configured interval.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime

from app.core.config import settings
from app.core.redis_client import get_redis, redis_enabled

logger = logging.getLogger("heatcalc.guest_activity")


async def should_touch_guest_session_in_db(session_id: str) -> bool:
    if not redis_enabled():
        return True

    now = datetime.now(UTC).isoformat()
    ttl_seconds = max(60, settings.GUEST_SESSION_TTL_MINUTES * 60)
    throttle_seconds = max(1, settings.GUEST_ACTIVITY_TOUCH_INTERVAL_SECONDS)
    try:
        redis = get_redis()
        await redis.set(f"guest:last:{session_id}", now, ex=ttl_seconds)
        return bool(
            await redis.set(
                f"guest:last-db-touch:{session_id}",
                now,
                ex=throttle_seconds,
                nx=True,
            )
        )
    except Exception as exc:
        logger.warning("Redis guest activity unavailable, falling back to DB touch: %s", exc)
        return True
