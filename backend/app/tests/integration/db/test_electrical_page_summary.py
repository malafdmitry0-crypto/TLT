"""Acceptance coverage for server-side Electrical page aggregates."""

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.electrical_calculation import ElectricalCalculation
from app.models.electrical_variant import ElectricalVariant, ElectricalVariantObject
from app.models.project import Project
from app.models.project_object import ProjectObject
from app.models.user import User
from app.services.calculation_service import CalculationService

pytestmark = pytest.mark.asyncio(loop_scope="session")


def _ready_result(*, installed: float, order: float, sections: int, working: float, start: float):
    return {
        "selected_cable": "HTM",
        "installed_cable_length": installed,
        "order_cable_length": order,
        "section_count": sections,
        "total_power": installed * 10,
        "working_current": working,
        "start_current": start,
    }


async def test_electrical_page_summary_uses_ready_rows_and_assignment_systems(
    db_session: AsyncSession,
    employee_user: User,
):
    project = Project(name="Electrical summary", user_id=employee_user.id)
    db_session.add(project)
    await db_session.flush()
    objects = [
        ProjectObject(
            project_id=project.id,
            object_type="pipe",
            sort_order=index,
            is_valid=True,
            params={"name": f"Pipe {index}"},
        )
        for index in range(4)
    ]
    db_session.add_all(objects)
    await db_session.flush()
    variant = ElectricalVariant(
        project_id=project.id,
        name="Summary ER",
        name_normalized="summary er",
        sort_order=0,
        is_active=True,
        legacy_variant_number=1,
    )
    db_session.add(variant)
    await db_session.flush()
    db_session.add_all(
        ElectricalVariantObject(
            project_id=project.id,
            electrical_variant_id=variant.id,
            object_id=obj.id,
            system_type=system_type,
            assignment_state=state,
            version=1,
            object_version_snapshot=obj.version,
        )
        for obj, system_type, state in (
            (objects[0], "self_regulating", "ready"),
            (objects[1], "resistive", "ready"),
            (objects[2], "self_regulating", "stale"),
            (objects[3], "skin", "unsupported"),
        )
    )
    await db_session.flush()
    db_session.add_all(
        [
            ElectricalCalculation(
                project_id=project.id,
                object_id=objects[0].id,
                variant_number=1,
                electrical_variant_id=variant.id,
                cable_type="self_regulating",
                cable_mark="HTM",
                params={},
                results={
                    "selected_cable": "HTM",
                    "order_cable_length": 99,
                    "layout": {"actual_installed_length_m": 10},
                    "section_plan": {"count": 2},
                    "electrical": {
                        "total_power_w": 100,
                        "working_current_a": 1.5,
                        "start_current_a": 4,
                    },
                },
            ),
            ElectricalCalculation(
                project_id=project.id,
                object_id=objects[1].id,
                variant_number=1,
                electrical_variant_id=variant.id,
                cable_type="single_core",
                cable_mark="R-1",
                params={},
                results={
                    **_ready_result(installed=15, order=98, sections=3, working=2.5, start=5),
                    "section_count": None,
                    "num_sections": 3,
                    "start_current": None,
                    "section_start_current_a": 5,
                },
            ),
            ElectricalCalculation(
                project_id=project.id,
                object_id=objects[2].id,
                variant_number=1,
                electrical_variant_id=variant.id,
                cable_type="self_regulating",
                cable_mark="STALE",
                params={},
                results={
                    **_ready_result(installed=50, order=50, sections=9, working=9, start=9),
                    "stale": True,
                },
            ),
            ElectricalCalculation(
                project_id=project.id,
                object_id=objects[3].id,
                variant_number=1,
                electrical_variant_id=variant.id,
                cable_type="skin",
                cable_mark="FAILED",
                params={},
                results={"error_code": "NOPE", "category": "formula"},
            ),
        ]
    )
    await db_session.commit()

    service = CalculationService(db_session)
    _, _, first_summary, _ = await service.electrical_project_page(
        project.id, electrical_variant_id=variant.id, page=1, page_size=1
    )
    _, _, second_summary, _ = await service.electrical_project_page(
        project.id, electrical_variant_id=variant.id, page=2, page_size=1
    )
    _, _, legacy_summary, _ = await service.electrical_project_page(
        project.id, variant_number=1, page=1, page_size=1
    )

    assert first_summary == second_summary
    assert first_summary == legacy_summary
    assert first_summary["total_cable_length"] == 25
    assert first_summary["total_power"] == 250
    assert first_summary["total_sections"] == 5
    assert first_summary["total_current"] == 4
    assert first_summary["total_start_current_a"] == 9
    assert first_summary["system_summaries"]["self_regulating"]["object_count"] == 1
    assert first_summary["system_summaries"]["resistive"]["section_count"] == 3
    assert first_summary["system_summaries"]["skin"]["object_count"] == 0
    assert first_summary["system_summaries"]["total"]["cable_length_m"] == 25
