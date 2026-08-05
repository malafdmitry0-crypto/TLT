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
from app.models.specification import SpecificationCatalogItem, SpecificationCatalogVersion
from app.models.user import User
from app.schemas.calculation import ElectricalRequest
from app.schemas.specification import (
    SpecificationGenerationRequest,
    SpecificationPreflightStatus,
)
from app.seeds import seed_electrical_catalogs
from app.services.calculation_service import CalculationService
from app.services.specification_preflight_service import SpecificationPreflightService
from app.tests.specification_catalog_fixtures import complete_specification_catalog_items

pytestmark = pytest.mark.asyncio(loop_scope="session")


@dataclass
class _RevisionContext:
    project: Project
    variant: ElectricalVariant
    obj: ProjectObject
    assignment: ElectricalVariantObject
    principal: CurrentPrincipal


def _single_choice_specification_items(
    catalog_id: uuid.UUID,
) -> list[SpecificationCatalogItem]:
    items: list[SpecificationCatalogItem] = []
    for index, raw in enumerate(complete_specification_catalog_items()):
        category = raw.category.value if hasattr(raw.category, "value") else raw.category
        if category == "box":
            continue
        if category == "connection_kit" and raw.mark != "КСВ-1":
            continue
        if category == "repair_kit" and raw.mark != "КСР-2":
            continue
        if category == "fiberglass_tape" and raw.mark != "ЛКВ 12":
            continue
        if category == "cable" and raw.mark != "30ТТВ2-СР":
            continue
        items.append(
            SpecificationCatalogItem(
                id=uuid.uuid4(),
                catalog_version_id=catalog_id,
                item_key=raw.item_key,
                category=category,
                name=raw.name,
                mark=raw.mark,
                nomenclature_code=raw.nomenclature_code,
                supply_unit=raw.supply_unit,
                applicability=dict(raw.applicability or {}),
                package_parameters=dict(raw.package_parameters or {}),
                formula_parameters=dict(raw.formula_parameters or {}),
                source_ref=raw.source_ref,
                row_checksum=f"sha256:{index:064x}",
                position=index,
            )
        )
    return items


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

    catalog_id = uuid.uuid4()
    spec_items = _single_choice_specification_items(catalog_id)
    db_session.add(
        SpecificationCatalogVersion(
            id=catalog_id,
            catalog_key="builtin-specification",
            version=f"assignment-revision-{uuid.uuid4().hex[:8]}",
            status="active",
            authority="approved",
            source="assignment revision integration fixture",
            source_checksum=f"sha256:{'a' * 64}",
            payload_checksum=f"sha256:{'b' * 64}",
            schema_version=1,
            item_count=len(spec_items),
            is_complete=True,
            validation_issues=[],
        )
    )
    await db_session.flush()
    db_session.add_all(spec_items)
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
    )


async def _calculate(
    db_session: AsyncSession,
    context: _RevisionContext,
):
    return await CalculationService(db_session).calc_electrical(
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
    request = SpecificationGenerationRequest.model_validate(
        {
            "variant_ids": [context.variant.id],
            "options": {
                "grouping_mode": "separate_by_object_type",
                "Ex": False,
                "K1i": False,
                "K2i": False,
                "Kiu": False,
                "L_K2i_m": "0",
                "R_gr": "1",
            },
        }
    )
    return (
        await SpecificationPreflightService(db_session).preflight_variants(
            context.project.id,
            context.principal,
            request,
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
    assert preflight.status is SpecificationPreflightStatus.READY
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
    assert (await _preflight(db_session, context)).status is SpecificationPreflightStatus.READY
