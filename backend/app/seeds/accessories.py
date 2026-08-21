"""Seed the demo accessory catalog."""

import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.accessory import AccessoryExtended
from app.seeds.loader import load_accessories

logger = logging.getLogger("seeds")
_MANAGED_SOURCES = {None, "seed", "demo_seed", "test"}


async def seed_accessories(db: AsyncSession) -> None:
    for seed in load_accessories():
        result = await db.execute(
            select(AccessoryExtended).where(AccessoryExtended.article == seed.article)
        )
        existing = result.scalar_one_or_none()
        if existing is None:
            db.add(
                AccessoryExtended(
                    category=seed.category,
                    name=seed.name,
                    article=seed.article,
                    params=seed.params,
                )
            )
            logger.info("  + accessory %s", seed.article)
            continue
        params = existing.params if isinstance(existing.params, dict) else {}
        if params.get("commercial_data_source") in _MANAGED_SOURCES:
            existing.params = seed.params
            logger.info("  ~ accessory commercial %s", seed.article)
    await db.flush()
