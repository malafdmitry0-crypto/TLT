"""Cached access to heat-loss correction coefficients."""

from typing import cast

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.coefficient import CorrectionCoefficient


class CorrectionCoefficientProvider:
    """Load the application-owned coefficient snapshot used by heat formulas."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get(self) -> dict[str, float]:
        from app.core.cache import cache

        cached = await cache.aget("coefficients")
        if cached is not None:
            return cast(dict[str, float], cached)
        result = await self.db.execute(select(CorrectionCoefficient))
        coefficients = {
            row.key: row.value
            for row in result.scalars().all()
            if row.key not in {"wind_factor", "location_indoor", "location_outdoor"}
        }
        await cache.aset("coefficients", coefficients, ttl=3600)
        return coefficients
