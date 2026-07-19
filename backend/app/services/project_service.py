"""Сервис управления проектами."""

import copy
from uuid import UUID

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.dependencies import CurrentPrincipal
from app.electrical_result_status import is_successful_electrical_result
from app.models.electrical_calculation import ElectricalCalculation
from app.models.electrical_variant import ElectricalVariant
from app.models.project import Project
from app.models.project_object import ProjectObject
from app.models.user import User
from app.schemas.project import (
    ProjectCreate,
    ProjectObjectCreate,
    ProjectObjectUpdate,
    ProjectUpdate,
)
from app.services.project_object_params import normalize_project_object_params


class ProjectNotFoundError(Exception):
    """Проект не найден."""


class ProjectAccessError(Exception):
    """Нет доступа к проекту."""


class ProjectLimitError(Exception):
    """Превышен лимит."""


class ProjectValidationError(Exception):
    """Некорректные данные операции проекта."""


class ProjectConflictError(Exception):
    """Объект был изменён параллельно."""


class ProjectElectricalVariantNotFoundError(Exception):
    """UUID ЭР не существует в указанном проекте."""


class ProjectService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def list_projects(self, principal: CurrentPrincipal) -> list[Project]:
        stmt = select(Project, User.email.label("owner_email")).outerjoin(
            User, Project.user_id == User.id
        )
        if principal.role == "guest":
            stmt = stmt.where(Project.session_id == principal.session_id)
        elif principal.role == "employee":
            stmt = stmt.where(Project.user_id.is_not(None))
        # admin видит все проекты для администрирования и поддержки.
        stmt = stmt.order_by(Project.updated_at.desc())
        rows = await self.db.execute(stmt)
        projects = []
        for project, owner_email in rows.all():
            project.owner_email = owner_email  # annotate for response schema
            projects.append(project)
        await self._annotate_object_types(projects)
        return projects

    async def create_project(self, data: ProjectCreate, principal: CurrentPrincipal) -> Project:
        # Лимит проектов для гостевой сессии
        if principal.role == "guest" and principal.session_id:
            count_result = await self.db.execute(
                select(func.count())
                .select_from(Project)
                .where(Project.session_id == principal.session_id)
            )
            count = count_result.scalar_one()
            if count >= settings.GUEST_MAX_PROJECTS:
                raise ProjectLimitError(
                    "У пользователя может быть только один проект. "
                    "Войдите как сотрудник, чтобы работать с несколькими проектами."
                )
        project = Project(
            name=data.name,
            description=data.description,
            task_number=data.task_number,
            user_id=principal.user_id,
            session_id=principal.session_id,
        )
        self.db.add(project)
        await self.db.commit()
        await self.db.refresh(project)
        return project

    async def get_project(self, project_id: UUID, principal: CurrentPrincipal) -> Project:
        result = await self.db.execute(
            select(Project).where(Project.id == project_id).options(selectinload(Project.objects))
        )
        project = result.scalar_one_or_none()
        if project is None:
            raise ProjectNotFoundError(f"Проект {project_id} не найден")
        self._check_access(project, principal)
        return project

    async def get_project_basic(self, project_id: UUID, principal: CurrentPrincipal) -> Project:
        result = await self.db.execute(select(Project).where(Project.id == project_id))
        project = result.scalar_one_or_none()
        if project is None:
            raise ProjectNotFoundError(f"Проект {project_id} не найден")
        self._check_access(project, principal)
        return project

    async def get_project_for_write(self, project_id: UUID, principal: CurrentPrincipal) -> Project:
        project = await self.get_project_basic(project_id, principal)
        self._check_owner(project, principal)
        return project

    async def get_object_for_read(
        self, object_id: UUID, principal: CurrentPrincipal
    ) -> ProjectObject:
        obj, project = await self._get_object_with_project(object_id)
        self._check_access(project, principal)
        return obj

    async def get_object_for_write(
        self, object_id: UUID, principal: CurrentPrincipal
    ) -> ProjectObject:
        obj, project = await self._get_object_with_project(object_id)
        self._check_access(project, principal)
        self._check_owner(project, principal)
        return obj

    async def get_project_summary(self, project_id: UUID, principal: CurrentPrincipal) -> Project:
        project = await self.get_project_basic(project_id, principal)
        await self._annotate_object_types([project])
        return project

    async def update_project(
        self, project_id: UUID, data: ProjectUpdate, principal: CurrentPrincipal
    ) -> Project:
        project = await self.get_project_basic(project_id, principal)
        self._check_owner(project, principal)
        update_data = data.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(project, key, value)
        await self.db.commit()
        await self.db.refresh(project)
        return project

    async def delete_project(self, project_id: UUID, principal: CurrentPrincipal) -> None:
        project = await self.get_project_basic(project_id, principal)
        self._check_owner(project, principal)
        await self.db.delete(project)
        await self.db.commit()

    async def duplicate_project(self, source_id: UUID, principal: CurrentPrincipal) -> Project:
        """Создать копию проекта с объектами (без расчётов — будут пересчитаны).

        Доступно только зарегистрированному пользователю (employee/admin).
        Копируются только `params` объектов; `results`, `is_valid`,
        `validation_errors` очищаются. Вызывающая сторона заново выполняет
        теплорасчёт; электрический расчёт не запускается до явного назначения
        объекта в систему ЭР.
        """
        if principal.role not in ("employee", "admin"):
            raise ProjectAccessError(
                "Копирование проекта доступно только зарегистрированному пользователю"
            )
        source = await self.get_project(source_id, principal)

        new_project = Project(
            name=f"{source.name} (копия)",
            description=source.description,
            task_number=source.task_number,
            user_id=principal.user_id,
            session_id=None,
            status="draft",
        )
        self.db.add(new_project)
        await self.db.flush()

        for src_obj in sorted(source.objects, key=lambda o: o.sort_order):
            self.db.add(
                ProjectObject(
                    project_id=new_project.id,
                    object_type=src_obj.object_type,
                    sort_order=src_obj.sort_order,
                    params=copy.deepcopy(src_obj.params),
                )
            )
        await self.db.commit()
        await self.db.refresh(new_project)
        return new_project

    # ---- Objects ----

    async def list_objects(
        self, project_id: UUID, principal: CurrentPrincipal
    ) -> list[ProjectObject]:
        await self.get_project_basic(project_id, principal)
        result = await self.db.execute(
            select(ProjectObject)
            .where(ProjectObject.project_id == project_id)
            .order_by(ProjectObject.sort_order)
        )
        return list(result.scalars().all())

    async def objects_summary(
        self,
        project_id: UUID,
        principal: CurrentPrincipal,
        *,
        electrical_variant_id: UUID | None = None,
    ) -> dict[str, object]:
        await self.get_project_basic(project_id, principal)

        if electrical_variant_id is not None:
            variant_id = await self.db.scalar(
                select(ElectricalVariant.id).where(
                    ElectricalVariant.id == electrical_variant_id,
                    ElectricalVariant.project_id == project_id,
                )
            )
            if variant_id is None:
                raise ProjectElectricalVariantNotFoundError(
                    f"ЭР {electrical_variant_id} не найден в проекте {project_id}",
                )

        object_rows = await self.db.execute(
            select(
                ProjectObject.object_type,
                ProjectObject.is_valid,
                func.count().label("count"),
            )
            .where(ProjectObject.project_id == project_id)
            .group_by(ProjectObject.object_type, ProjectObject.is_valid)
        )

        by_type = {"pipe": 0, "tank": 0}
        valid_by_type = {"pipe": 0, "tank": 0}
        total = 0
        valid = 0
        for object_type, is_valid, count in object_rows.all():
            count_int = int(count)
            if object_type in by_type:
                by_type[object_type] += count_int
                if is_valid:
                    valid_by_type[object_type] += count_int
            total += count_int
            if is_valid:
                valid += count_int

        calculation_scope = select(
            ElectricalCalculation.object_id,
            ElectricalCalculation.cable_mark,
            ElectricalCalculation.results,
        ).where(ElectricalCalculation.project_id == project_id)
        if electrical_variant_id is not None:
            calculation_scope = calculation_scope.where(
                ElectricalCalculation.electrical_variant_id == electrical_variant_id,
            )
        calc_rows = await self.db.execute(calculation_scope)
        electrical_total = 0
        electrical_success = 0
        electrical_unsupported = 0
        electrical_stale = 0
        successful_object_ids: set[UUID] = set()
        for object_id, cable_mark, results in calc_rows.all():
            electrical_total += 1
            if isinstance(results, dict):
                if results.get("category") == "unsupported":
                    electrical_unsupported += 1
                    continue
                if results.get("category") == "stale":
                    electrical_stale += 1
                    continue
            if self._is_successful_electrical_calculation(cable_mark, results):
                electrical_success += 1
                successful_object_ids.add(object_id)

        return {
            "total": total,
            "valid": valid,
            "invalid": total - valid,
            "by_type": by_type,
            "valid_by_type": valid_by_type,
            "electrical_calculations_total": electrical_total,
            "successful_electrical_calculations": electrical_success,
            "failed_electrical_calculations": (
                electrical_total - electrical_success - electrical_unsupported - electrical_stale
            ),
            "objects_with_successful_electrical_calculation": len(successful_object_ids),
        }

    async def add_object(
        self,
        project_id: UUID,
        data: ProjectObjectCreate,
        principal: CurrentPrincipal,
    ) -> ProjectObject:
        project = await self.get_project_basic(project_id, principal)
        self._check_owner(project, principal)
        # Лимит объектов в проекте
        count_result = await self.db.execute(
            select(func.count())
            .select_from(ProjectObject)
            .where(ProjectObject.project_id == project_id)
        )
        count = count_result.scalar_one()
        if count >= settings.GUEST_MAX_OBJECTS_PER_PROJECT:
            raise ProjectLimitError(
                f"Достигнут лимит объектов в проекте ({settings.GUEST_MAX_OBJECTS_PER_PROJECT})."
            )
        obj = ProjectObject(
            project_id=project_id,
            object_type=data.object_type,
            sort_order=data.sort_order,
            params=normalize_project_object_params(data.object_type, data.params),
        )
        self.db.add(obj)
        await self.db.flush()
        await self.db.refresh(obj)
        return obj

    async def update_object(
        self,
        project_id: UUID,
        object_id: UUID,
        data: ProjectObjectUpdate,
        principal: CurrentPrincipal,
    ) -> ProjectObject:
        """Apply a version-checked object update without committing.

        The API layer commits after recalculation and dependent invalidation so
        the object payload, computed results, and stale markers become visible
        atomically.
        """
        project = await self.get_project_basic(project_id, principal)
        self._check_owner(project, principal)
        await self.db.execute(
            select(Project)
            .where(Project.id == project_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        obj = await self._get_object(project_id, object_id)
        update_data = data.model_dump(exclude_unset=True, exclude={"version"})
        if "params" in update_data:
            incoming_params = update_data["params"] or {}
            merged_params = {
                **(obj.params or {}),
                **incoming_params,
            }
            update_data["params"] = normalize_project_object_params(obj.object_type, merged_params)
        stmt = (
            update(ProjectObject)
            .where(
                ProjectObject.id == object_id,
                ProjectObject.project_id == project_id,
                ProjectObject.version == data.version,
            )
            .values(
                **update_data,
                version=ProjectObject.version + 1,
                updated_at=func.now(),
            )
        )
        result = await self.db.execute(stmt)
        if result.rowcount != 1:
            await self.db.rollback()
            raise ProjectConflictError("Объект был изменён в другой вкладке, перезагрузите.")
        await self.db.refresh(obj)
        return obj

    async def delete_object(
        self,
        project_id: UUID,
        object_id: UUID,
        principal: CurrentPrincipal,
    ) -> None:
        project = await self.get_project_basic(project_id, principal)
        self._check_owner(project, principal)
        await self.db.execute(
            select(Project)
            .where(Project.id == project_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        obj = await self._get_object(project_id, object_id)
        await self.db.delete(obj)
        await self.db.flush()

    async def reorder_objects(
        self,
        project_id: UUID,
        order: list[UUID],
        principal: CurrentPrincipal,
    ) -> list[ProjectObject]:
        project = await self.get_project_basic(project_id, principal)
        self._check_owner(project, principal)
        result = await self.db.execute(
            select(ProjectObject)
            .where(ProjectObject.project_id == project_id)
            .order_by(ProjectObject.sort_order, ProjectObject.id)
        )
        objects = list(result.scalars().all())
        existing_ids = {obj.id for obj in objects}
        order_ids = set(order)

        if len(order) != len(order_ids):
            raise ProjectValidationError("Список order содержит повторяющиеся ID объектов")
        if order_ids != existing_ids:
            missing_count = len(existing_ids - order_ids)
            extra_count = len(order_ids - existing_ids)
            details: list[str] = []
            if missing_count:
                details.append(f"пропущено объектов проекта: {missing_count}")
            if extra_count:
                details.append(f"чужих или несуществующих ID: {extra_count}")
            detail = "; ".join(details) if details else "набор ID не совпадает"
            raise ProjectValidationError(
                "Список order должен содержать все объекты проекта без дублей "
                f"и посторонних ID ({detail})"
            )

        objects_by_id = {obj.id: obj for obj in objects}
        for idx, obj_id in enumerate(order):
            objects_by_id[obj_id].sort_order = idx
        await self.db.commit()
        result = await self.db.execute(
            select(ProjectObject)
            .where(ProjectObject.project_id == project_id)
            .order_by(ProjectObject.sort_order)
        )
        return list(result.scalars().all())

    async def _get_object(self, project_id: UUID, object_id: UUID) -> ProjectObject:
        result = await self.db.execute(
            select(ProjectObject).where(
                ProjectObject.id == object_id,
                ProjectObject.project_id == project_id,
            )
        )
        obj = result.scalar_one_or_none()
        if obj is None:
            raise ProjectNotFoundError(f"Объект {object_id} не найден")
        return obj

    async def _get_object_with_project(self, object_id: UUID) -> tuple[ProjectObject, Project]:
        result = await self.db.execute(
            select(ProjectObject, Project)
            .join(Project, ProjectObject.project_id == Project.id)
            .where(ProjectObject.id == object_id)
        )
        row = result.one_or_none()
        if row is None:
            raise ProjectNotFoundError(f"Объект {object_id} не найден")
        return row[0], row[1]

    async def _annotate_object_types(self, projects: list[Project]) -> None:
        if not projects:
            return
        project_ids = [project.id for project in projects]
        result = await self.db.execute(
            select(ProjectObject.project_id, ProjectObject.object_type)
            .where(ProjectObject.project_id.in_(project_ids))
            .distinct()
        )
        types_by_project: dict[UUID, set[str]] = {project_id: set() for project_id in project_ids}
        for project_id, object_type in result.all():
            value = getattr(object_type, "value", object_type)
            types_by_project.setdefault(project_id, set()).add(str(value))
        for project in projects:
            project.object_types = sorted(types_by_project.get(project.id, set()))

    def _check_access(self, project: Project, principal: CurrentPrincipal) -> None:
        if principal.role == "admin":
            return
        if principal.role == "employee":
            if project.user_id is not None:
                return
            raise ProjectAccessError("Нет доступа к гостевому проекту")
        if principal.role == "guest":
            if project.session_id != principal.session_id:
                raise ProjectAccessError("Нет доступа к чужому проекту")
            return
        raise ProjectAccessError("Нет доступа")

    def _check_owner(self, project: Project, principal: CurrentPrincipal) -> None:
        if principal.role == "admin":
            return
        if principal.role == "guest":
            if project.session_id != principal.session_id:
                raise ProjectAccessError("Нет доступа")
            return
        if principal.role == "employee":
            if project.user_id == principal.user_id:
                return
            raise ProjectAccessError("Нельзя редактировать чужой проект")
        raise ProjectAccessError("Нет доступа")

    @staticmethod
    def _is_successful_electrical_calculation(
        cable_mark: str | None,
        results: dict[str, object] | None,
    ) -> bool:
        return is_successful_electrical_result(cable_mark, results)
