"""Concurrency regressions for atomic upserts.

These tests use independent AsyncSession instances to exercise the same
database-level races that can happen between parallel HTTP requests.
"""

import asyncio
import uuid

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from app.models.electrical_calculation import ElectricalCalculation
from app.models.guest_session import GuestSession
from app.models.project import Project
from app.models.project_object import ProjectObject
from app.models.specification import Specification
from app.schemas.calculation import ElectricalRequest
from app.schemas.specification import SpecificationItem
from app.services.calculation_service import CalculationService
from app.services.specification_service import SpecificationService

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def _create_guest_project(db_session: AsyncSession, name: str) -> Project:
    session_id = f"race-{uuid.uuid4()}"
    db_session.add(GuestSession(session_id=session_id))
    project = Project(name=name, session_id=session_id)
    db_session.add(project)
    await db_session.commit()
    await db_session.refresh(project)
    return project


async def _create_valid_pipe(db_session: AsyncSession, project_id: uuid.UUID) -> ProjectObject:
    obj = ProjectObject(
        project_id=project_id,
        object_type="pipe",
        sort_order=0,
        params={
            "name": "Race pipe",
            "ambient_temperature": -30,
            "process_temperature": 80,
            "pipe_length": 50,
        },
        results={
            "heat_loss_per_meter": 20,
            "total_heat_loss": 1000,
            "safety_factor": 1.1,
        },
        is_valid=True,
    )
    db_session.add(obj)
    await db_session.commit()
    await db_session.refresh(obj)
    return obj


async def _create_tank_without_cable_layout(
    db_session: AsyncSession,
    project_id: uuid.UUID,
) -> ProjectObject:
    obj = ProjectObject(
        project_id=project_id,
        object_type="tank",
        sort_order=0,
        params={
            "name": "Race spherical tank",
            "shape": "spherical",
            "ambient_temperature": -20,
            "process_temperature": 80,
        },
        results={
            "total_heat_loss": 300,
            "safety_factor": 1.1,
        },
        is_valid=True,
    )
    db_session.add(obj)
    await db_session.commit()
    await db_session.refresh(obj)
    return obj


class TestAtomicUpsertRaceConditions:
    async def test_parallel_specification_save_keeps_single_project_variant_row(
        self,
        test_engine: AsyncEngine,
        db_session: AsyncSession,
    ):
        project = await _create_guest_project(db_session, "Spec race")
        session_factory = async_sessionmaker(test_engine, expire_on_commit=False)

        async def save_spec(index: int) -> None:
            async with session_factory() as session:
                await SpecificationService(session).save_items(
                    project.id,
                    [
                        SpecificationItem(
                            category="manual",
                            name=f"Manual item {index}",
                            unit="шт",
                            quantity=index + 1,
                            source="manual",
                        )
                    ],
                    variant_number=1,
                )

        await asyncio.gather(*(save_spec(index) for index in range(10)))

        rows = (
            (
                await db_session.execute(
                    select(Specification).where(
                        Specification.project_id == project.id,
                        Specification.variant_number == 1,
                    )
                )
            )
            .scalars()
            .all()
        )
        assert len(rows) == 1
        assert rows[0].is_stale is False
        assert len(rows[0].items) == 1
        assert rows[0].items[0]["name"].startswith("Manual item ")

    async def test_parallel_single_electrical_calc_keeps_single_object_variant_row(
        self,
        test_engine: AsyncEngine,
        db_session: AsyncSession,
    ):
        project = await _create_guest_project(db_session, "Single electrical race")
        obj = await _create_valid_pipe(db_session, project.id)
        session_factory = async_sessionmaker(test_engine, expire_on_commit=False)
        marks = ["ТЛТ-25", "ТЛТ-40", "ТЛТ-60", "ТЛТ-75"]

        async def calc(mark: str) -> None:
            async with session_factory() as session:
                await CalculationService(session).calc_electrical(
                    ElectricalRequest(
                        object_id=obj.id,
                        cable_type="self_regulating",
                        variant_number=1,
                        data={
                            "required_power_per_meter": 20,
                            "cable_mark": mark,
                            "supply_voltage": 220,
                            "ambient_temperature": -30,
                            "pipe_length": 50,
                            "safety_factor": 1.1,
                        },
                    )
                )

        await asyncio.gather(*(calc(mark) for mark in marks))

        rows = (
            (
                await db_session.execute(
                    select(ElectricalCalculation).where(
                        ElectricalCalculation.object_id == obj.id,
                        ElectricalCalculation.variant_number == 1,
                    )
                )
            )
            .scalars()
            .all()
        )
        assert len(rows) == 1
        assert rows[0].project_id == project.id
        assert rows[0].cable_mark in marks
        assert rows[0].results["selected_cable"] == rows[0].cable_mark

    async def test_parallel_failed_electrical_batch_keeps_single_failure_row(
        self,
        test_engine: AsyncEngine,
        db_session: AsyncSession,
    ):
        project = await _create_guest_project(db_session, "Failed batch race")
        obj = await _create_tank_without_cable_layout(db_session, project.id)
        session_factory = async_sessionmaker(test_engine, expire_on_commit=False)

        async def batch() -> tuple[int, int, int, list[dict], list[ElectricalCalculation]]:
            async with session_factory() as session:
                return await CalculationService(session).batch_calc_electrical(
                    project.id,
                    variant_number=1,
                    return_calcs=False,
                )

        results = await asyncio.gather(*(batch() for _ in range(6)))
        assert all(result[:3] == (0, 1, 0) for result in results)
        assert all(result[3][0]["error_code"] == "unsupported_layout" for result in results)

        count = (
            await db_session.execute(
                select(func.count(ElectricalCalculation.id)).where(
                    ElectricalCalculation.object_id == obj.id,
                    ElectricalCalculation.variant_number == 1,
                )
            )
        ).scalar_one()
        row = (
            await db_session.execute(
                select(ElectricalCalculation).where(
                    ElectricalCalculation.object_id == obj.id,
                    ElectricalCalculation.variant_number == 1,
                )
            )
        ).scalar_one()

        assert count == 1
        assert row.cable_mark is None
        assert row.results["error_code"] == "unsupported_layout"
        assert row.results["category"] == "unsupported"
