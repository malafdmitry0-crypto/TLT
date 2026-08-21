"""Seed the bundled electrical and demo specification catalogs."""

import logging

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.dependencies import CurrentPrincipal
from app.reference_data.specification_catalog_case1_demo import (
    CASE1_DEMO_VERSION,
    is_case1_demo_source,
)
from app.services.electrical_catalog_service import ElectricalCatalogService
from app.services.specification_catalog import SpecificationCatalogService

logger = logging.getLogger("seeds")


async def seed_electrical_catalogs(db: AsyncSession, principal: CurrentPrincipal) -> None:
    active = await ElectricalCatalogService(db).ensure_bundled_catalogs_active(
        principal,
        commit=False,
    )
    logger.info(
        "  + active electrical catalogs: %s",
        ", ".join(f"{kind}={active[kind].version}" for kind in sorted(active)),
    )


async def seed_specification_catalog(db: AsyncSession, principal: CurrentPrincipal) -> None:
    """Bootstrap the Case 1 demo catalog outside production."""
    if settings.is_production:
        logger.warning(
            "  ! specification catalog Case 1 DEMO seed SKIPPED in production "
            "(import production catalog via admin API)",
        )
        return

    catalog = await SpecificationCatalogService(db).ensure_case1_demo_catalog_active(
        principal,
        commit=False,
    )
    if catalog.version == CASE1_DEMO_VERSION and is_case1_demo_source(catalog.source):
        logger.info(
            "  + specification catalog Case 1 DEMO active: key=%s version=%s "
            "(non-production only; not for procurement)",
            catalog.catalog_key,
            catalog.version,
        )
        return
    logger.info(
        "  = specification catalog already has healthy non-demo active version=%s; "
        "Case 1 DEMO left untouched",
        catalog.version,
    )
