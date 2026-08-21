"""Assignment input revision remains stable across derived TT synchronization."""

from __future__ import annotations

import uuid
from dataclasses import dataclass

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import CurrentPrincipal
from app.models.electrical_variant import ElectricalVariant, ElectricalVariantObject
from app.models.project import Project
from app.models.project_electrical_settings import ProjectElectricalSettings
from app.models.project_object import ProjectObject
from app.models.user import User
from app.schemas.calculation import ElectricalRequest
from app.schemas.specification import (
    SpecificationGenerationRequest,
    SpecificationPreflightStatus,
)
from app.seeds.catalogs import seed_electrical_catalogs
from app.services.calculation.container import CalculationContainer
from app.services.specification_preflight_service import SpecificationPreflightService
from app.tests.specification_catalog_fixtures import (
    import_and_activate_complete_specification_catalog,
)

pytestmark = pytest.mark.asyncio(loop_scope="session")


@dataclass
class _RevisionContext:
    project: Project
    variant: ElectricalVariant
    obj: ProjectObject
    assignment: ElectricalVariantObject
    principal: CurrentPrincipal
    specification_catalog_version: str


async def _seed_context(
    db_session: AsyncSession,
    admin_user: User,
    employee_user: User,
) -> _RevisionContext:
    admin = CurrentPrincipal(
        role="admin",
        user_id=admin_user.id,
        email=admin_user.email,
    )
    await seed_electrical_catalogs(db_session, admin)

    project = Project(
        id=uuid.uuid4(),
        name="Assignment revision integration",
        user_id=employee_user.id,
        specification_settings={},
        specification_settings_version=1,
    )
    variant = ElectricalVariant(
        id=uuid.uuid4(),
        project_id=project.id,
        name="ЭР 1",
        name_normalized="эр 1",
        sort_order=0,
        legacy_variant_number=1,
        is_active=True,
    )
    obj = ProjectObject(
        id=uuid.uuid4(),
        project_id=project.id,
        object_type="pipe",
        sort_order=0,
        version=4,
        params={
            "name": "Revision pipe",
            "process_temperature": 80.0,
            "ambient_temperature": -20.0,
            "min_switch_temperature": -20.0,
            "steam_tracing": False,
            "selection_policy": "technical_minimum",
            "outer_diameter": 0.108,
            "pipe_length": 200.0,
        },
        results={
            "heat_loss_per_meter_base": 20.0,
            "effective_length": 200.0,
            "safety_factor_applied": 1.1,
        },
        is_valid=True,
    )
    db_session.add(project)
    await db_session.flush()
    db_session.add(
        ProjectElectricalSettings(
            project_id=project.id,
            max_section_start_current_a=13.065,
            version=1,
        )
    )
    db_session.add(variant)
    await db_session.flush()
    db_session.add(obj)
    await db_session.flush()

    assignment = await db_session.scalar(
        select(ElectricalVariantObject).where(
            ElectricalVariantObject.electrical_variant_id == variant.id,
            ElectricalVariantObject.object_id == obj.id,
        )
    )
    assert assignment is not None
    assignment.system_type = "self_regulating"
    assignment.assignment_state = "stale"
    assignment.version = 2
    assignment.object_version_snapshot = obj.version
    assignment.electrical_overrides = {
        "supply_voltage_v": "380",
    }
    assignment.diagnostics = {}

    specification_catalog = await import_and_activate_complete_specification_catalog(
        db_session,
        version_prefix="assignment-revision",
        high_temperature_connection_marks={"КСВ-1", "КСВ-2"},
    )
    await db_session.commit()

    return _RevisionContext(
        project=project,
        variant=variant,
        obj=obj,
        assignment=assignment,
        principal=CurrentPrincipal(
            role="employee",
            user_id=employee_user.id,
            email=employee_user.email,
        ),
        specification_catalog_version=specification_catalog.version,
    )


async def _calculate(
    db_session: AsyncSession,
    context: _RevisionContext,
):
    return await CalculationContainer(db_session).electrical_single.calculate(
        ElectricalRequest(
            object_id=context.obj.id,
            cable_type="self_regulating_tt",
            electrical_variant_id=context.variant.id,
            expected_assignment_version=context.assignment.version,
            data={"_tt_explicit_overrides": {}},
        )
    )


async def _preflight(
    db_session: AsyncSession,
    context: _RevisionContext,
):
    payload = {
        "variant_ids": [context.variant.id],
        "options": {
            "grouping_mode": "separate_by_object_type",
            "Ex": False,
            "K1i": False,
            "K2i": False,
            "Kiu": False,
            "L_K2i_m": "0",
            "R_gr": "1",
            "catalog_id": "builtin-specification",
            "catalog_version": context.specification_catalog_version,
        },
    }
    service = SpecificationPreflightService(db_session)
    discovery = (
        await service.preflight_variants(
            context.project.id,
            context.principal,
            SpecificationGenerationRequest.model_validate(payload),
        )
    )[0]
    if not discovery.candidate_groups:
        return discovery
    payload["catalog_selections"] = {
        group.group_key: group.candidates[0].catalog_item_id
        for group in discovery.candidate_groups
        if group.candidates
    }
    return (
        await service.preflight_variants(
            context.project.id,
            context.principal,
            SpecificationGenerationRequest.model_validate(payload),
        )
    )[0]


async def test_real_tt_upsert_sync_keeps_input_revision_and_preflight_ready(
    db_session: AsyncSession,
    admin_user: User,
    employee_user: User,
) -> None:
    context = await _seed_context(db_session, admin_user, employee_user)
    input_revision = context.assignment.version

    calculation = await _calculate(db_session, context)
    await db_session.refresh(context.assignment)

    assert context.assignment.assignment_state == "ready"
    assert context.assignment.version == input_revision
    assert calculation.results["provenance"]["assignment_version"] == input_revision
    preflight = await _preflight(db_session, context)
    assert preflight.status is SpecificationPreflightStatus.READY, [
        item.model_dump() for item in preflight.diagnostics
    ]
    assert preflight.diagnostics == []


async def test_recalculation_does_not_drift_assignment_revision(
    db_session: AsyncSession,
    admin_user: User,
    employee_user: User,
) -> None:
    context = await _seed_context(db_session, admin_user, employee_user)
    input_revision = context.assignment.version

    first = await _calculate(db_session, context)
    second = await _calculate(db_session, context)
    await db_session.refresh(context.assignment)

    assert second.id == first.id
    assert context.assignment.version == input_revision
    assert first.results["provenance"]["assignment_version"] == input_revision
    assert second.results["provenance"]["assignment_version"] == input_revision
    preflight = await _preflight(db_session, context)
    assert preflight.status is SpecificationPreflightStatus.READY, [
        item.model_dump() for item in preflight.diagnostics
    ]
