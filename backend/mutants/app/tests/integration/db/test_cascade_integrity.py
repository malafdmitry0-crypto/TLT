"""КРИТИЧЕСКИЕ тесты целостности данных.

Цена ошибки: orphaned записи в БД, утечка данных через FK после удаления.
Каскады, концурентные обновления, foreign keys.
"""

from datetime import UTC, datetime

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.electrical_calculation import ElectricalCalculation
from app.models.guest_session import GuestSession
from app.models.project import Project
from app.models.project_object import ProjectObject
from app.models.specification import Specification

pytestmark = pytest.mark.asyncio(loop_scope="session")


class TestCascadeDeletion:
    """ON DELETE CASCADE: при удалении сессии/проекта НИКАКИХ orphans остаться не должно."""

    async def test_session_delete_cascades_to_project(self, db_session: AsyncSession):
        """Удалили GuestSession → удалился её Project."""
        sess = GuestSession(session_id="cascade-test-1")
        db_session.add(sess)
        await db_session.commit()

        proj = Project(name="Каскад", session_id="cascade-test-1")
        db_session.add(proj)
        await db_session.commit()
        proj_id = proj.id

        # Удаляем сессию
        await db_session.delete(sess)
        await db_session.commit()

        # Проект должен исчезнуть
        result = await db_session.execute(select(Project).where(Project.id == proj_id))
        assert (
            result.scalar_one_or_none() is None
        ), "ORPHAN: проект остался после удаления его сессии"

    async def test_project_delete_cascades_to_objects(self, db_session: AsyncSession):
        sess = GuestSession(session_id="cascade-test-2")
        db_session.add(sess)
        proj = Project(name="P", session_id="cascade-test-2")
        db_session.add(proj)
        await db_session.commit()

        # Создаём 3 объекта
        for i in range(3):
            db_session.add(
                ProjectObject(
                    project_id=proj.id,
                    object_type="pipe",
                    sort_order=i,
                    params={},
                )
            )
        await db_session.commit()

        proj_id = proj.id
        await db_session.delete(proj)
        await db_session.commit()

        # Все объекты исчезли
        objs = (
            (
                await db_session.execute(
                    select(ProjectObject).where(ProjectObject.project_id == proj_id)
                )
            )
            .scalars()
            .all()
        )
        assert len(objs) == 0, "ORPHAN: объекты остались после удаления проекта"

    async def test_object_delete_cascades_to_electrical(self, db_session: AsyncSession):
        """Удалили ProjectObject → его ElectricalCalculation тоже удалился."""
        sess = GuestSession(session_id="cascade-test-3")
        db_session.add(sess)
        proj = Project(name="P", session_id="cascade-test-3")
        db_session.add(proj)
        await db_session.commit()

        obj = ProjectObject(
            project_id=proj.id,
            object_type="pipe",
            sort_order=0,
            params={},
        )
        db_session.add(obj)
        await db_session.commit()

        calc = ElectricalCalculation(
            project_id=proj.id,
            object_id=obj.id,
            variant_number=1,
            cable_type="self_regulating",
            cable_mark="ТЛТ-25",
            params={},
            results={"selected_cable": "ТЛТ-25"},
        )
        db_session.add(calc)
        await db_session.commit()

        obj_id = obj.id
        await db_session.delete(obj)
        await db_session.commit()

        orphan = (
            await db_session.execute(
                select(ElectricalCalculation).where(ElectricalCalculation.object_id == obj_id)
            )
        ).scalar_one_or_none()
        assert orphan is None, "ORPHAN: electrical_calc остался после удаления объекта"

    async def test_project_delete_cascades_to_specifications(self, db_session: AsyncSession):
        sess = GuestSession(session_id="cascade-test-4")
        db_session.add(sess)
        proj = Project(name="P", session_id="cascade-test-4")
        db_session.add(proj)
        await db_session.commit()

        spec = Specification(project_id=proj.id, variant_number=1, items=[])
        db_session.add(spec)
        await db_session.commit()

        proj_id = proj.id
        await db_session.delete(proj)
        await db_session.commit()

        leftover = (
            await db_session.execute(
                select(Specification).where(Specification.project_id == proj_id)
            )
        ).scalar_one_or_none()
        assert leftover is None


class TestProjectOwnershipConstraint:
    """CHECK: project имеет либо user_id, либо session_id."""

    async def test_project_without_owner_rejected(self, db_session: AsyncSession):
        from sqlalchemy.exc import IntegrityError

        proj = Project(name="Orphan", user_id=None, session_id=None)
        db_session.add(proj)
        with pytest.raises(IntegrityError):
            await db_session.commit()
        await db_session.rollback()


class TestExpiredSessionCleanupCascade:
    """Кастомный cleanup expired guest sessions удаляет всё каскадно."""

    async def test_expired_session_cleanup_removes_data(self, db_session: AsyncSession):
        from datetime import timedelta

        from app.services.auth_service import AuthService

        sess = GuestSession(
            session_id="will-expire",
            last_activity=datetime.now(UTC) - timedelta(minutes=30),
        )
        db_session.add(sess)
        proj = Project(name="To-be-deleted", session_id="will-expire")
        db_session.add(proj)
        await db_session.commit()

        proj_id = proj.id
        # Cleanup сессий с TTL 20 мин
        await AuthService(db_session).cleanup_expired_guest_sessions(20)

        # Сессия удалена
        s_check = (
            await db_session.execute(
                select(GuestSession).where(GuestSession.session_id == "will-expire")
            )
        ).scalar_one_or_none()
        assert s_check is None
        # Проект тоже исчез по каскаду
        p_check = (
            await db_session.execute(select(Project).where(Project.id == proj_id))
        ).scalar_one_or_none()
        assert p_check is None

    async def test_fresh_session_not_touched_by_cleanup(self, db_session: AsyncSession):
        from app.services.auth_service import AuthService

        sess = GuestSession(
            session_id="still-alive",
            last_activity=datetime.now(UTC),
        )
        db_session.add(sess)
        await db_session.commit()

        await AuthService(db_session).cleanup_expired_guest_sessions(20)

        s_check = (
            await db_session.execute(
                select(GuestSession).where(GuestSession.session_id == "still-alive")
            )
        ).scalar_one_or_none()
        assert s_check is not None, "Свежая сессия не должна удаляться"
