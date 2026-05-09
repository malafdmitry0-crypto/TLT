"""Regression tests for DB query counts on large project paths."""

from collections.abc import Iterator
from contextlib import contextmanager

import pytest
from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from app.core.dependencies import CurrentPrincipal
from app.models.electrical_calculation import ElectricalCalculation
from app.models.project import Project
from app.models.project_object import ProjectObject
from app.models.user import User
from app.schemas.project import ProjectObjectsQueryRequest
from app.services.calculation_service import CalculationService
from app.services.object_query_service import ObjectQueryService
from app.services.project_service import ProjectService

pytestmark = pytest.mark.asyncio(loop_scope="session")


@contextmanager
def count_sql(async_engine: AsyncEngine) -> Iterator[list[str]]:
    statements: list[str] = []

    def before_cursor_execute(
        _conn,
        _cursor,
        statement: str,
        _parameters,
        _context,
        _executemany,
    ) -> None:
        normalized = statement.lstrip().upper()
        if normalized.startswith(("SELECT", "INSERT", "UPDATE", "DELETE")):
            statements.append(statement)

    event.listen(async_engine.sync_engine, "before_cursor_execute", before_cursor_execute)
    try:
        yield statements
    finally:
        event.remove(async_engine.sync_engine, "before_cursor_execute", before_cursor_execute)


def _assert_query_count(statements: list[str], expected: int) -> None:
    assert len(statements) == expected, "\n\n".join(statements)


def _principal(user: User) -> CurrentPrincipal:
    return CurrentPrincipal(role="employee", user_id=user.id, email=user.email)


async def _seed_project(
    db_session: AsyncSession,
    employee_user: User,
    *,
    per_type: int = 200,
    with_electrical: bool = False,
) -> tuple[Project, list[ProjectObject]]:
    project = Project(name=f"QueryCount-{per_type}", user_id=employee_user.id)
    db_session.add(project)
    await db_session.flush()

    objects = [
        ProjectObject(
            project_id=project.id,
            object_type="pipe",
            sort_order=i,
            is_valid=i % 3 != 0,
            params={
                "name": f"Pipe-{i:03d}",
                "outer_diameter": 0.108,
                "pipe_length": 50.0,
                "insulation_material": "mineral_wool",
                "process_temperature": 80.0,
                "ambient_temperature": -20.0,
            },
        )
        for i in range(per_type)
    ]
    objects.extend(
        ProjectObject(
            project_id=project.id,
            object_type="tank",
            sort_order=per_type + i,
            is_valid=i % 4 != 0,
            params={
                "name": f"Tank-{i:03d}",
                "shape": "cylindrical",
                "diameter": 2.0,
                "height": 3.0,
                "insulation_material": "mineral_wool",
                "process_temperature": 70.0,
                "ambient_temperature": -20.0,
            },
        )
        for i in range(per_type)
    )
    db_session.add_all(objects)
    await db_session.flush()

    if with_electrical:
        db_session.add_all(
            ElectricalCalculation(
                project_id=project.id,
                object_id=obj.id,
                variant_number=1,
                cable_type="self_regulating",
                cable_mark="HTM" if index % 5 != 0 else None,
                params={},
                results={"selected_cable": {"mark": "HTM"}} if index % 5 != 0 else {"error": "x"},
            )
            for index, obj in enumerate(objects)
        )

    await db_session.commit()
    return project, objects


async def _seed_valid_pipes_for_batch(
    db_session: AsyncSession,
    employee_user: User,
    *,
    count: int = 100,
) -> Project:
    project = Project(name=f"BatchQueryCount-{count}", user_id=employee_user.id)
    db_session.add(project)
    await db_session.flush()
    db_session.add_all(
        ProjectObject(
            project_id=project.id,
            object_type="pipe",
            sort_order=index,
            is_valid=True,
            params={
                "name": f"Batch Pipe-{index:03d}",
                "outer_diameter": 0.108,
                "pipe_length": 50.0,
                "insulation_material": "mineral_wool",
                "process_temperature": 80.0,
                "ambient_temperature": -20.0,
            },
            results={
                "heat_loss_per_meter": 20.0,
                "total_heat_loss": 1000.0,
                "effective_length": 50.0,
            },
        )
        for index in range(count)
    )
    await db_session.commit()
    return project


async def test_default_object_query_is_constant_query_count(
    db_session: AsyncSession,
    employee_user: User,
    test_engine: AsyncEngine,
):
    project, _objects = await _seed_project(db_session, employee_user, per_type=200)

    with count_sql(test_engine) as statements:
        response = await ObjectQueryService(db_session).query(
            project.id,
            ProjectObjectsQueryRequest(object_type="pipe"),
            _principal(employee_user),
        )

    assert len(response.items) == 50
    assert response.counts.total == 400
    assert response.counts.filtered == 200
    _assert_query_count(statements, 3)


async def test_batch_electrical_uses_constant_select_count(
    db_session: AsyncSession,
    employee_user: User,
    test_engine: AsyncEngine,
):
    project = await _seed_valid_pipes_for_batch(db_session, employee_user, count=100)

    with count_sql(test_engine) as statements:
        calculated, skipped, heat_loss_failed, errors, calcs = await CalculationService(
            db_session
        ).batch_calc_electrical(project.id)

    select_count = sum(
        1 for statement in statements if statement.lstrip().upper().startswith("SELECT")
    )
    assert calculated == 100
    assert skipped == 0
    assert heat_loss_failed == 0
    assert errors == []
    assert len(calcs) == 100
    assert select_count == 3, "\n\n".join(statements)


async def test_batch_electrical_recalculation_uses_single_bulk_write(
    db_session: AsyncSession,
    employee_user: User,
    test_engine: AsyncEngine,
):
    project = await _seed_valid_pipes_for_batch(db_session, employee_user, count=100)
    await CalculationService(db_session).batch_calc_electrical(project.id)

    with count_sql(test_engine) as statements:
        calculated, skipped, heat_loss_failed, errors, calcs = await CalculationService(
            db_session
        ).batch_calc_electrical(project.id)

    write_count = sum(
        1 for statement in statements if statement.lstrip().upper().startswith(("INSERT", "UPDATE"))
    )
    assert calculated == 100
    assert skipped == 0
    assert heat_loss_failed == 0
    assert errors == []
    assert len(calcs) == 100
    assert write_count == 1, "\n\n".join(statements)


async def test_object_query_capabilities_loads_only_requested_type(
    db_session: AsyncSession,
    employee_user: User,
    test_engine: AsyncEngine,
):
    project, _objects = await _seed_project(db_session, employee_user, per_type=200)

    with count_sql(test_engine) as statements:
        response = await ObjectQueryService(db_session).capabilities(
            project.id,
            "pipe",
            _principal(employee_user),
        )

    assert response.object_type == "pipe"
    _assert_query_count(statements, 2)


async def test_objects_summary_is_constant_query_count_with_many_calculations(
    db_session: AsyncSession,
    employee_user: User,
    test_engine: AsyncEngine,
):
    project, _objects = await _seed_project(
        db_session,
        employee_user,
        per_type=200,
        with_electrical=True,
    )

    with count_sql(test_engine) as statements:
        summary = await ProjectService(db_session).objects_summary(
            project.id, _principal(employee_user)
        )

    assert summary["total"] == 400
    assert summary["electrical_calculations_total"] == 400
    _assert_query_count(statements, 3)


async def test_list_projects_uses_eager_loaded_object_types(
    db_session: AsyncSession,
    employee_user: User,
    test_engine: AsyncEngine,
):
    for project_index in range(10):
        project = Project(name=f"Project-{project_index}", user_id=employee_user.id)
        db_session.add(project)
        await db_session.flush()
        db_session.add_all(
            ProjectObject(
                project_id=project.id,
                object_type="pipe" if object_index % 2 == 0 else "tank",
                sort_order=object_index,
                params={"name": f"Object-{project_index}-{object_index}"},
            )
            for object_index in range(20)
        )
    await db_session.commit()

    with count_sql(test_engine) as statements:
        projects = await ProjectService(db_session).list_projects(_principal(employee_user))

    assert len(projects) == 10
    assert all(set(project.object_types) == {"pipe", "tank"} for project in projects)
    _assert_query_count(statements, 2)


async def test_reorder_objects_uses_single_object_lookup(
    db_session: AsyncSession,
    employee_user: User,
    test_engine: AsyncEngine,
):
    project, objects = await _seed_project(db_session, employee_user, per_type=100)
    order = [obj.id for obj in reversed(objects)]

    with count_sql(test_engine) as statements:
        reordered = await ProjectService(db_session).reorder_objects(
            project.id,
            order,
            _principal(employee_user),
        )

    select_count = sum(
        1 for statement in statements if statement.lstrip().upper().startswith("SELECT")
    )
    assert [obj.id for obj in reordered[: len(order)]] == order
    assert select_count == 3, "\n\n".join(statements)


async def test_perf_indexes_are_declared_in_metadata():
    expected_indexes = {
        "project_objects": {
            "ix_project_objects_project_type_sort": (
                "project_id",
                "object_type",
                "sort_order",
                "id",
            ),
        },
        "electrical_calculations": {
            "ix_electrical_calculations_project_variant": ("project_id", "variant_number"),
            "ix_electrical_calculations_object_variant": ("object_id", "variant_number"),
        },
        "projects": {
            "ix_projects_user_updated": ("user_id", "updated_at"),
            "ix_projects_session_updated": ("session_id", "updated_at"),
        },
        "guest_sessions": {
            "ix_guest_sessions_last_activity": ("last_activity",),
        },
    }

    for table_name, indexes in expected_indexes.items():
        actual = {
            index.name: tuple(column.name for column in index.columns)
            for index in Project.metadata.tables[table_name].indexes
        }
        for index_name, columns in indexes.items():
            assert actual[index_name] == columns

    electrical_indexes = Project.metadata.tables["electrical_calculations"].indexes
    assert any(
        index.name == "ix_electrical_calculations_object_variant" and index.unique
        for index in electrical_indexes
    )
