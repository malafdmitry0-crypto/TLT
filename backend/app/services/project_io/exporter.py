"""Application orchestration for project exports."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import CurrentPrincipal
from app.models.project import Project
from app.services.project_io.csv_codec import create_writer, encode_buffer
from app.services.project_io.mapping import (
    write_bulk_header,
    write_project_sections,
    write_single_project,
)
from app.services.project_io.repository import load_bulk_project_graphs, load_project_graph
from app.services.project_service import ProjectNotFoundError, ProjectService


async def export_project(
    db: AsyncSession, project_id: UUID, principal: CurrentPrincipal
) -> tuple[str, bytes]:
    service = ProjectService(db)
    project = await service.get_project_basic(project_id, principal)
    graph = await load_project_graph(db, project)
    buffer, writer = create_writer()
    write_single_project(writer, graph)
    return suggest_filename(project.task_number, project.name), encode_buffer(buffer)


async def export_projects_bulk(
    db: AsyncSession, project_ids: list[UUID], principal: CurrentPrincipal
) -> tuple[str, bytes]:
    service = ProjectService(db)
    unique_ids = list(dict.fromkeys(project_ids))
    projects_result = await db.execute(select(Project).where(Project.id.in_(unique_ids)))
    projects_by_id = {project.id: project for project in projects_result.scalars()}

    ordered_projects: list[tuple[str, Project]] = []
    for index, project_id in enumerate(project_ids, start=1):
        project = projects_by_id.get(project_id)
        if project is None:
            raise ProjectNotFoundError(f"Проект {project_id} не найден")
        service._check_access(project, principal)
        ordered_projects.append((f"p{index}", project))

    graphs = await load_bulk_project_graphs(db, unique_ids, projects_by_id)
    keyed_graphs = [(key, graphs[project.id]) for key, project in ordered_projects]
    buffer, writer = create_writer()
    write_bulk_header(writer, keyed_graphs)
    for project_key, graph in keyed_graphs:
        write_project_sections(writer, graph, project_key=project_key)
    return "projects_export.csv", encode_buffer(buffer)


def suggest_filename(task_number: str | None, name: str) -> str:
    safe = "".join(
        character if character.isalnum() or character in "-_ " else "_" for character in name
    ).strip()[:80]
    prefix = f"{task_number}_" if task_number else ""
    return f"{prefix}{safe or 'project'}.tlt.csv"
