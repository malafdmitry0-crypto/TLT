"""Candidate-folder CRUD and membership use cases."""

from collections.abc import Awaitable, Callable
from typing import Any
from uuid import UUID

from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.electrical_candidate import ElectricalCandidate
from app.models.electrical_candidate_folder import (
    ElectricalCandidateFolder,
    ElectricalCandidateFolderItem,
)
from app.models.project_object import ProjectObject
from app.services.calculation.electrical_candidate_scope import ElectricalCandidateScopeService
from app.services.calculation_errors import CalculationError
from app.services.electrical_assignment_service import (
    ElectricalAssignmentService,
    ElectricalAssignmentServiceError,
)


class ElectricalCandidateFolderService:
    def __init__(
        self,
        db: AsyncSession,
        *,
        scope: ElectricalCandidateScopeService,
        load_object: Callable[[UUID, UUID], Awaitable[ProjectObject]],
        get_candidate: Callable[[UUID], Awaitable[ElectricalCandidate]],
        lock_project: Callable[[UUID], Awaitable[None]],
    ) -> None:
        self.db = db
        self.scope = scope
        self._load_object = load_object
        self._get_candidate = get_candidate
        self._lock_project = lock_project

    @staticmethod
    def _normalize_candidate_folder_name(name: str) -> str:
        normalized = " ".join(name.strip().split())
        if not normalized:
            raise CalculationError("Название папки не должно быть пустым")
        if normalized.lower() in {"все", "избранное"}:
            raise CalculationError("Это системная папка, задайте другое название")
        if len(normalized) > 64:
            raise CalculationError("Название папки должно быть не длиннее 64 символов")
        return normalized

    async def _candidate_folder_payload(
        self,
        folder: ElectricalCandidateFolder,
    ) -> dict[str, Any]:
        item_result = await self.db.execute(
            select(ElectricalCandidateFolderItem.candidate_id).where(
                ElectricalCandidateFolderItem.folder_id == folder.id
            )
        )
        return {
            "id": folder.id,
            "project_id": folder.project_id,
            "object_id": folder.object_id,
            "electrical_variant_id": folder.electrical_variant_id,
            "name": folder.name,
            "color": folder.color,
            "sort_order": folder.sort_order,
            "candidate_ids": list(item_result.scalars().all()),
            "created_at": folder.created_at,
            "updated_at": folder.updated_at,
        }

    async def list_electrical_candidate_folders(
        self,
        project_id: UUID,
        *,
        object_id: UUID,
        electrical_variant_id: UUID,
    ) -> list[dict[str, Any]]:
        filters = [
            ElectricalCandidateFolder.project_id == project_id,
            ElectricalCandidateFolder.object_id == object_id,
            ElectricalCandidateFolder.electrical_variant_id == electrical_variant_id,
        ]
        result = await self.db.execute(
            select(ElectricalCandidateFolder)
            .where(*filters)
            .order_by(
                ElectricalCandidateFolder.sort_order,
                ElectricalCandidateFolder.created_at,
            )
        )
        folders = list(result.scalars().all())
        item_result = (
            await self.db.execute(
                select(
                    ElectricalCandidateFolderItem.folder_id,
                    ElectricalCandidateFolderItem.candidate_id,
                ).where(
                    ElectricalCandidateFolderItem.folder_id.in_([folder.id for folder in folders])
                )
            )
            if folders
            else None
        )
        folder_items: dict[UUID, list[UUID]] = {folder.id: [] for folder in folders}
        if item_result is not None:
            for folder_id, candidate_id in item_result.all():
                folder_items.setdefault(folder_id, []).append(candidate_id)
        return [
            {
                "id": folder.id,
                "project_id": folder.project_id,
                "object_id": folder.object_id,
                "electrical_variant_id": folder.electrical_variant_id,
                "name": folder.name,
                "color": folder.color,
                "sort_order": folder.sort_order,
                "candidate_ids": folder_items.get(folder.id, []),
                "created_at": folder.created_at,
                "updated_at": folder.updated_at,
            }
            for folder in folders
        ]

    async def create_electrical_candidate_folder(
        self,
        *,
        project_id: UUID,
        object_id: UUID,
        electrical_variant_id: UUID,
        name: str,
        color: str | None,
        created_by_user_id: UUID | None,
        created_by_session_id: str | None,
    ) -> dict[str, Any]:
        await ElectricalAssignmentService(self.db).require_supported_assignment(
            project_id,
            electrical_variant_id,
            object_id,
        )
        await self._load_object(project_id, object_id)
        max_sort_result = await self.db.execute(
            select(func.max(ElectricalCandidateFolder.sort_order)).where(
                ElectricalCandidateFolder.project_id == project_id,
                ElectricalCandidateFolder.object_id == object_id,
                ElectricalCandidateFolder.electrical_variant_id == electrical_variant_id,
            )
        )
        next_sort = int(max_sort_result.scalar() or 0) + 10
        folder = ElectricalCandidateFolder(
            project_id=project_id,
            object_id=object_id,
            variant_number=None,
            electrical_variant_id=electrical_variant_id,
            name=self._normalize_candidate_folder_name(name),
            color=color,
            sort_order=next_sort,
            created_by_user_id=created_by_user_id,
            created_by_session_id=created_by_session_id,
        )
        self.db.add(folder)
        try:
            await self.db.commit()
        except IntegrityError as exc:
            await self.db.rollback()
            raise CalculationError("Папка с таким названием уже существует") from exc
        await self.db.refresh(folder)
        return await self._candidate_folder_payload(folder)

    async def get_electrical_candidate_folder(
        self,
        folder_id: UUID,
    ) -> ElectricalCandidateFolder:
        result = await self.db.execute(
            select(ElectricalCandidateFolder).where(ElectricalCandidateFolder.id == folder_id)
        )
        folder = result.scalar_one_or_none()
        if folder is None:
            raise CalculationError("Папка вариантов не найдена")
        return folder

    async def update_electrical_candidate_folder(
        self,
        folder_id: UUID,
        **updates: Any,
    ) -> dict[str, Any]:
        folder = await self.get_electrical_candidate_folder(folder_id)
        if "name" in updates and updates["name"] is not None:
            folder.name = self._normalize_candidate_folder_name(str(updates["name"]))
        if "color" in updates:
            folder.color = updates["color"]
        if "sort_order" in updates and updates["sort_order"] is not None:
            folder.sort_order = int(updates["sort_order"])
        try:
            await self.db.commit()
        except IntegrityError as exc:
            await self.db.rollback()
            raise CalculationError("Папка с таким названием уже существует") from exc
        await self.db.refresh(folder)
        return await self._candidate_folder_payload(folder)

    async def delete_electrical_candidate_folder(self, folder_id: UUID) -> None:
        folder = await self.get_electrical_candidate_folder(folder_id)
        await self.db.delete(folder)
        await self.db.commit()

    async def add_electrical_candidate_to_folder(
        self,
        *,
        folder_id: UUID,
        candidate_id: UUID,
    ) -> dict[str, Any]:
        # First read discovers the owning project; the second read below is an
        # intentional post-lock TOCTOU recheck before validating the candidate.
        folder = await self.get_electrical_candidate_folder(folder_id)
        await self._lock_project(folder.project_id)
        folder = await self.get_electrical_candidate_folder(folder_id)
        candidate = await self._get_candidate(candidate_id)
        if (
            candidate.project_id != folder.project_id
            or candidate.object_id != folder.object_id
            or candidate.electrical_variant_id is None
            or folder.electrical_variant_id is None
            or candidate.electrical_variant_id != folder.electrical_variant_id
        ):
            raise ElectricalAssignmentServiceError(
                "ELECTRICAL_ASSIGNMENT_DOWNSTREAM_SCOPE_CONFLICT",
                "Кандидат и папка относятся к разным объектам или ЭР",
                status_code=409,
                details={
                    "folder_id": str(folder_id),
                    "candidate_id": str(candidate_id),
                },
            )
        await ElectricalAssignmentService(self.db).require_supported_assignment(
            folder.project_id,
            folder.electrical_variant_id,
            folder.object_id,
            requested_cable_type=candidate.cable_type,
            lock_project=False,
        )
        stmt = (
            pg_insert(ElectricalCandidateFolderItem)
            .values(folder_id=folder_id, candidate_id=candidate_id)
            .on_conflict_do_nothing(
                index_elements=[
                    ElectricalCandidateFolderItem.folder_id,
                    ElectricalCandidateFolderItem.candidate_id,
                ]
            )
        )
        await self.db.execute(stmt)
        await self.db.commit()
        await self.db.refresh(folder)
        return await self._candidate_folder_payload(folder)

    async def remove_electrical_candidate_from_folder(
        self,
        *,
        folder_id: UUID,
        candidate_id: UUID,
    ) -> dict[str, Any]:
        folder = await self.get_electrical_candidate_folder(folder_id)
        await self.db.execute(
            delete(ElectricalCandidateFolderItem).where(
                ElectricalCandidateFolderItem.folder_id == folder_id,
                ElectricalCandidateFolderItem.candidate_id == candidate_id,
            )
        )
        await self.db.commit()
        await self.db.refresh(folder)
        return await self._candidate_folder_payload(folder)
