"""Проверка CRUD-операций через модели напрямую."""

import pytest
from sqlalchemy import select

from app.models.project import Project
from app.models.user import User

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def test_user_crud(db_session):
    user = User(
        email="crud@test.com",
        hashed_password="x",
        role="employee",
        is_active=True,
    )
    db_session.add(user)
    await db_session.commit()
    fetched = (await db_session.execute(select(User))).scalar_one()
    assert fetched.email == "crud@test.com"


async def test_project_requires_owner(db_session):
    """CHECK-constraint: user_id или session_id должны быть заполнены."""
    project = Project(name="Orphan")
    db_session.add(project)
    with pytest.raises(Exception):
        await db_session.commit()
    await db_session.rollback()
