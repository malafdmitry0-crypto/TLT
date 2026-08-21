"""Application orchestration for project imports."""

from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import CurrentPrincipal
from app.models.project import Project
from app.services.project_io.contracts import (
    ProjectImportError,
    ProjectImportNameConflictError,
    ProjectImportPayload,
)
from app.services.project_io.csv_codec import parse_sections, rows_to_dicts
from app.services.project_io.mapping import parse_bulk_payloads, parse_single_payload
from app.services.project_io.repository import apply_project_settings, persist_project_payload
from app.services.project_io.validation import validate_project_payload
from app.services.project_service import ProjectAccessError


async def import_project(db: AsyncSession, raw: bytes, principal: CurrentPrincipal) -> Project:
    sections = parse_sections(raw)
    payload = parse_single_payload(sections)
    validate_project_payload(payload, role=principal.role)

    async with db.begin_nested():
        project = await _create_single_project(db, payload, principal)
        apply_project_settings(project, payload)
        db.add(project)
        await db.flush()
        await persist_project_payload(db, project, payload)

    await db.commit()
    await db.refresh(project)
    return project


async def import_projects_bulk(
    db: AsyncSession, raw: bytes, principal: CurrentPrincipal
) -> dict[str, Any]:
    if principal.role not in ("employee", "admin"):
        raise ProjectAccessError("Пакетный импорт доступен только сотруднику")

    sections = parse_sections(raw)
    if not rows_to_dicts(sections.get("projects", [])):
        raise ProjectImportError("Отсутствует секция [SECTION];projects")

    imported = 0
    errors: list[dict[str, Any]] = []
    for payload in parse_bulk_payloads(sections):
        key = payload.project_key or ""
        if not key or not payload.name:
            errors.append({"project_key": key, "error": "пустой project_key или name"})
            continue
        try:
            validate_project_payload(payload, role=principal.role)
            await _resolve_bulk_task_conflict(db, payload, principal)
            async with db.begin_nested():
                project = Project(
                    name=payload.name,
                    description=payload.description,
                    task_number=payload.task_number,
                    status=payload.status,
                    user_id=principal.user_id,
                )
                apply_project_settings(project, payload)
                db.add(project)
                await db.flush()
                await persist_project_payload(db, project, payload)
            imported += 1
        except Exception as exc:
            errors.append({"project_key": key, "error": str(exc)})

    await db.commit()
    return {"imported": imported, "errors": errors}


async def _create_single_project(
    db: AsyncSession,
    payload: ProjectImportPayload,
    principal: CurrentPrincipal,
) -> Project:
    if principal.role == "guest":
        existing = await db.execute(
            select(Project).where(Project.session_id == principal.session_id)
        )
        for project in existing.scalars().all():
            await db.delete(project)
        await db.flush()
        return Project(
            name=payload.name,
            description=payload.description,
            task_number=payload.task_number,
            status=payload.status,
            session_id=principal.session_id,
        )
    if principal.role in ("employee", "admin"):
        existing_id = await db.scalar(
            select(Project.id)
            .where(
                Project.user_id == principal.user_id,
                Project.name == payload.name,
            )
            .limit(1)
        )
        if existing_id is not None:
            raise ProjectImportNameConflictError(payload.name)
        return Project(
            name=payload.name,
            description=payload.description,
            task_number=payload.task_number,
            status=payload.status,
            user_id=principal.user_id,
        )
    raise ProjectAccessError("Нет доступа")


async def _resolve_bulk_task_conflict(
    db: AsyncSession,
    payload: ProjectImportPayload,
    principal: CurrentPrincipal,
) -> None:
    if not payload.task_number:
        return
    conflict = await db.execute(
        select(Project.id).where(
            Project.user_id == principal.user_id,
            Project.task_number == payload.task_number,
        )
    )
    if conflict.first() is not None:
        payload.name = f"{payload.name} (импорт)"
        payload.task_number = f"{payload.task_number}-импорт"
