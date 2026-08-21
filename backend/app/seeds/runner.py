"""Transaction owner and stage orchestration for database seeds."""

import logging

from app.core.database import AsyncSessionLocal
from app.seeds.accessories import seed_accessories
from app.seeds.accounts import existing_admin_principal, seed_users
from app.seeds.catalogs import seed_electrical_catalogs, seed_specification_catalog
from app.seeds.coefficients import seed_coefficients
from app.seeds.demo.electrical import seed_electrical_calculations
from app.seeds.demo.heat import seed_heat_objects
from app.seeds.demo.projects import seed_projects
from app.seeds.references import seed_insulation_materials

logger = logging.getLogger("seeds")


async def run_electrical_catalog_seed() -> None:
    async with AsyncSessionLocal() as db:
        try:
            principal = await existing_admin_principal(db)
            await seed_electrical_catalogs(db, principal)
            await db.commit()
        except Exception:
            await db.rollback()
            raise


async def run_specification_catalog_seed() -> None:
    async with AsyncSessionLocal() as db:
        try:
            try:
                principal = await existing_admin_principal(db)
            except RuntimeError:
                await seed_users(db)
                principal = await existing_admin_principal(db)
            await seed_specification_catalog(db, principal)
            await db.commit()
        except Exception:
            await db.rollback()
            raise
    logger.info("=== Case 1 DEMO specification catalog seed complete ===")


async def run_seeds() -> None:
    async with AsyncSessionLocal() as db:
        try:
            logger.info("=== Seed: users ===")
            users = await seed_users(db)

            principal = await existing_admin_principal(db)
            admin_id = principal.user_id
            if admin_id is None:
                raise RuntimeError("Seed requires an authenticated admin principal")

            logger.info("=== Seed: electrical catalogs ===")
            await seed_electrical_catalogs(db, principal)

            logger.info("=== Seed: specification catalog ===")
            await seed_specification_catalog(db, principal)

            logger.info("=== Seed: correction coefficients ===")
            await seed_coefficients(db, admin_id)

            logger.info("=== Seed: insulation materials ===")
            await seed_insulation_materials(db)

            logger.info("=== Seed: accessories ===")
            await seed_accessories(db)

            logger.info("=== Seed: projects ===")
            projects = await seed_projects(db, users)

            logger.info("=== Seed: heat objects and calculations ===")
            await seed_heat_objects(db, projects, principal)

            logger.info("=== Seed: electrical assignments and calculations ===")
            await seed_electrical_calculations(db, projects, principal)

            await db.commit()
        except Exception:
            await db.rollback()
            raise
    logger.info("=== Seeds complete ===")
