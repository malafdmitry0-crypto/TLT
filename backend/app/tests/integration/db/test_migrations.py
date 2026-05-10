"""Проверка, что все таблицы созданы (metadata вместо реальных миграций)."""

import pytest

from app.models import Base

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def test_all_tables_created(test_engine):
    expected = {
        "users",
        "guest_sessions",
        "projects",
        "project_objects",
        "electrical_calculations",
        "background_tasks",
        "specifications",
        "correction_coefficients",
        "cables_extended",
        "accessories_extended",
    }
    actual = set(Base.metadata.tables.keys())
    assert expected.issubset(actual)
