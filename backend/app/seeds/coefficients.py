"""Seed current heat-calculation coefficients."""

import logging
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import cache
from app.models.coefficient import CorrectionCoefficient
from app.seeds.loader import load_coefficients

logger = logging.getLogger("seeds")


async def seed_coefficients(
    db: AsyncSession,
    admin_id: uuid.UUID,
) -> list[CorrectionCoefficient]:
    coefficients: list[CorrectionCoefficient] = []
    for seed in load_coefficients():
        result = await db.execute(
            select(CorrectionCoefficient).where(CorrectionCoefficient.key == seed.key)
        )
        coefficient = result.scalar_one_or_none()
        if coefficient is None:
            coefficient = CorrectionCoefficient(
                key=seed.key,
                value=seed.value,
                description=seed.description,
                updated_by=admin_id,
            )
            db.add(coefficient)
            logger.info("  + coefficient %s = %s", seed.key, seed.value)
        coefficients.append(coefficient)
    await db.flush()
    await cache.ainvalidate("coefficients")
    return coefficients
