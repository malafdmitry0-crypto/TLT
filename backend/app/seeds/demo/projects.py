"""Create demo projects and assign them to demo employees."""

import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.project import Project
from app.models.user import User
from app.seeds.loader import load_demo_manifest

logger = logging.getLogger("seeds")


async def seed_projects(db: AsyncSession, users: list[User]) -> list[Project]:
    employees = [user for user in users if user.role == "employee"]
    if not employees:
        raise RuntimeError("Demo projects require at least one employee")

    projects: list[Project] = []
    for index, seed in enumerate(load_demo_manifest().projects):
        result = await db.execute(select(Project).where(Project.name == seed.name))
        project = result.scalar_one_or_none()
        if project is None:
            owner = employees[index % len(employees)]
            project = Project(
                name=seed.name,
                description=seed.description,
                status=seed.status,
                user_id=owner.id,
            )
            db.add(project)
            logger.info("  + project '%s'", seed.name)
        projects.append(project)
    await db.flush()
    return projects
