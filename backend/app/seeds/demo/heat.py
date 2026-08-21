"""Create demo heat objects through the production write and calculation paths."""

import logging

from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import CurrentPrincipal
from app.models.project import Project
from app.models.project_object import ProjectObject
from app.schemas.project import ProjectObjectCreate
from app.seeds.loader import load_demo_manifest
from app.seeds.schemas import ObjectSeed
from app.services.calculation.container import CalculationContainer
from app.services.project_service import ProjectService

logger = logging.getLogger("seeds")


async def seed_heat_objects(
    db: AsyncSession,
    projects: list[Project],
    principal: CurrentPrincipal,
) -> None:
    if not projects:
        raise RuntimeError("Demo heat seeds require at least one project")

    deleted = await db.execute(
        delete(ProjectObject).where(ProjectObject.object_type.in_(("pipe", "tank")))
    )
    await db.flush()
    logger.info("  - replaced %d existing heat objects", deleted.rowcount or 0)

    manifest = load_demo_manifest()
    projects_by_name = {project.name: project for project in projects}
    cases_by_name = {seed.seed_case: seed for seed in manifest.heat_cases}
    project_service = ProjectService(db)
    calculations = CalculationContainer(db)

    for plan in manifest.project_plans:
        project = projects_by_name[plan.project]
        seeds: list[ObjectSeed] = [cases_by_name[name] for name in plan.canonical]
        seeds.extend(plan.volume)
        for sort_order, seed in enumerate(seeds):
            data = ProjectObjectCreate(
                object_type=seed.object_type,
                sort_order=sort_order,
                params=seed.params,
            )
            obj = await project_service.add_object(project.id, data, principal)
            await calculations.heat.recalculate(obj)
            if not obj.is_valid or obj.results is None:
                detail = (obj.validation_errors or {}).get("message", "unknown heat seed error")
                label = seed.seed_case or seed.name
                raise RuntimeError(f"Heat seed '{label}' failed: {detail}")
        object_types = {seed.object_type for seed in seeds}
        kind = (
            "трубы"
            if object_types == {"pipe"}
            else "резервуары"
            if object_types == {"tank"}
            else "смешанный"
        )
        logger.info("  + project '%s': %d объектов (%s)", project.name, len(seeds), kind)

    await db.flush()
