"""Container healthcheck for the calculation worker."""

from __future__ import annotations

from app.core.config import settings
from app.services.worker_readiness import worker_consumer_name, worker_is_ready_sync


def main() -> int:
    if not settings.REDIS_URL:
        return 1
    try:
        return 0 if worker_is_ready_sync(settings.REDIS_URL, worker_consumer_name()) else 1
    except Exception:
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
