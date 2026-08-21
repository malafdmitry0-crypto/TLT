"""PostgreSQL proof for strict UUID specification preflight isolation."""

from __future__ import annotations

import uuid

import pytest
from heatcalc_electrical_core import (
    ELECTRICAL_TT_FORMULA_FINGERPRINT,
    ELECTRICAL_TT_FORMULA_VERSION,
)
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import CurrentPrincipal
from app.models.electrical_calculation import ElectricalCalculation
from app.models.electrical_variant import ElectricalVariant, ElectricalVariantObject
from app.models.project import Project
from app.models.project_object import ProjectObject
from app.models.specification import Specification
from app.models.user import User
from app.schemas.specification import (
    SpecificationDiagnosticCode,
    SpecificationGenerationRequest,
    SpecificationPreflightStatus,
)
from app.services.specification_preflight_service import SpecificationPreflightService
from app.tests.specification_catalog_fixtures import (
    import_and_activate_complete_specification_catalog,
)

pytestmark = pytest.mark.asyncio(loop_scope="session")


def _result(*, object_version: int, assignment_version: int) -> dict:
    catalogs = {
        kind: {
            "version": f"{kind}-v1",
            "status": "active",
            "source_checksum": f"sha256:{kind}-integration",
        }
        for kind in ("power", "section", "bom")
    }
    return {
        "cable_type": "self_regulating_tt",
        "cable": {
            "mark": "30ТТВ2-СР",
            "nomenclature_code": "001-002-002",
        },
        "temperature_group": "high",
        "selected_cable": "30ТТВ2",
        "production_eligible": True,
        "mocked_fields": [],
        "resolved_inputs": {
            "nominal_voltage_v": 230,
            "max_section_start_current_a": 13.065,
        },
        "catalogs": catalogs,
        "provenance": {
            "formula_version": ELECTRICAL_TT_FORMULA_VERSION,
            "formula_fingerprint": ELECTRICAL_TT_FORMULA_FINGERPRINT,
            "calculation_fingerprint": f"sha256:{'c' * 64}",
            "production_eligible": True,
            "mocked_fields": [],
            "object_snapshot": {"version": object_version},
            "heat_snapshot": {"version": object_version},
            "object_version": object_version,
            "heat_result_version": object_version,
            "assignment_version": assignment_version,
            "catalogs": catalogs,
        },
        "section_plan": {"count": 1, "length_m": 10.0},
        "layout": {
            "actual_installed_length_m": 10.0,
            "required_order_length_m": 11.0,
        },
    }


async def test_uuid_preflight_isolates_variants_and_preserves_previous_specification(
    db_session: AsyncSession,
    employee_user: User,
):
    project = Project(
        id=uuid.uuid4(),
        name="UUID preflight integration",
        user_id=employee_user.id,
        specification_settings={},
        specification_settings_version=1,
    )
    ready_variant = ElectricalVariant(
        id=uuid.uuid4(),
        project_id=project.id,
        name="ЭР ready",
        name_normalized="эр ready",
        sort_order=0,
        legacy_variant_number=1,
        is_active=True,
    )
    legacy_only_variant = ElectricalVariant(
        id=uuid.uuid4(),
        project_id=project.id,
        name="ЭР legacy only",
        name_normalized="эр legacy only",
        sort_order=1,
        legacy_variant_number=2,
        is_active=False,
    )
    ready_object = ProjectObject(
        id=uuid.uuid4(),
        project_id=project.id,
        object_type="pipe",
        sort_order=0,
        version=4,
        params={},
        results={"heat_loss": 100},
        is_valid=True,
    )
    legacy_only_object = ProjectObject(
        id=uuid.uuid4(),
        project_id=project.id,
        object_type="pipe",
        sort_order=1,
        version=4,
        params={},
        results={"heat_loss": 100},
        is_valid=True,
    )
    db_session.add(project)
    await db_session.flush()
    db_session.add_all([ready_variant, legacy_only_variant])
    await db_session.flush()
    db_session.add_all([ready_object, legacy_only_object])
    await db_session.flush()

    ready_assignment = await db_session.scalar(
        select(ElectricalVariantObject).where(
            ElectricalVariantObject.electrical_variant_id == ready_variant.id,
            ElectricalVariantObject.object_id == ready_object.id,
        )
    )
    legacy_only_assignment = await db_session.scalar(
        select(ElectricalVariantObject).where(
            ElectricalVariantObject.electrical_variant_id == legacy_only_variant.id,
            ElectricalVariantObject.object_id == legacy_only_object.id,
        )
    )
    ready_foreign_assignment = await db_session.scalar(
        select(ElectricalVariantObject).where(
            ElectricalVariantObject.electrical_variant_id == ready_variant.id,
            ElectricalVariantObject.object_id == legacy_only_object.id,
        )
    )
    legacy_foreign_assignment = await db_session.scalar(
        select(ElectricalVariantObject).where(
            ElectricalVariantObject.electrical_variant_id == legacy_only_variant.id,
            ElectricalVariantObject.object_id == ready_object.id,
        )
    )
    assert ready_assignment is not None
    assert legacy_only_assignment is not None
    assert ready_foreign_assignment is not None
    assert legacy_foreign_assignment is not None
    await db_session.delete(ready_foreign_assignment)
    await db_session.delete(legacy_foreign_assignment)
    for assignment in (ready_assignment, legacy_only_assignment):
        assignment.system_type = "self_regulating"
        assignment.assignment_state = "ready"
        assignment.version = 2
        assignment.object_version_snapshot = 4
        assignment.diagnostics = {}
    await db_session.flush()

    exact_calculation = ElectricalCalculation(
        id=uuid.uuid4(),
        project_id=project.id,
        object_id=ready_object.id,
        variant_number=1,
        electrical_variant_id=ready_variant.id,
        cable_type="self_regulating_tt",
        cable_mark="30ТТВ2-СР",
        params={},
        results=_result(object_version=4, assignment_version=2),
    )
    previous_specification = Specification(
        id=uuid.uuid4(),
        project_id=project.id,
        electrical_variant_id=legacy_only_variant.id,
        items=[{"name": "previous", "quantity": 7}],
        snapshot={"state": "unchanged"},
        is_stale=False,
    )
    await import_and_activate_complete_specification_catalog(
        db_session,
        version_prefix="integration-v1",
        high_temperature_connection_marks={"КСВ-1"},
    )
    db_session.add_all(
        [
            exact_calculation,
            previous_specification,
        ]
    )
    await db_session.commit()
    previous_updated_at = previous_specification.updated_at

    request = SpecificationGenerationRequest.model_validate(
        {
            "variant_ids": [ready_variant.id, legacy_only_variant.id],
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
    results = await SpecificationPreflightService(db_session).preflight_variants(
        project.id,
        CurrentPrincipal(
            role="employee",
            user_id=employee_user.id,
            email=employee_user.email,
        ),
        request,
    )

    assert [item.total_objects for item in results] == [1, 1]
    assert results[0].status is SpecificationPreflightStatus.READY
    assert results[0].input_fingerprint is not None
    assert all(group.selected_catalog_item_id is not None for group in results[0].candidate_groups)
    assert results[1].status is SpecificationPreflightStatus.BLOCKED
    assert results[1].contributing_objects == 0
    assert results[1].diagnostics[0].code is SpecificationDiagnosticCode.VARIANT_NOT_READY

    await db_session.refresh(previous_specification)
    assert previous_specification.items == [{"name": "previous", "quantity": 7}]
    assert previous_specification.snapshot == {"state": "unchanged"}
    assert previous_specification.is_stale is False
    assert previous_specification.updated_at == previous_updated_at


async def _seed_ready_project(
    db_session: AsyncSession,
    employee_user: User,
    *,
    name: str,
    multi_connection: bool,
) -> tuple[Project, ElectricalVariant]:
    project = Project(
        id=uuid.uuid4(),
        name=name,
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
        params={},
        results={"heat_loss": 100},
        is_valid=True,
    )
    db_session.add(project)
    await db_session.flush()
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
    assignment.assignment_state = "ready"
    assignment.version = 2
    assignment.object_version_snapshot = 4
    assignment.diagnostics = {}
    await import_and_activate_complete_specification_catalog(
        db_session,
        version_prefix="canon03",
        high_temperature_connection_marks=({"КСВ-1", "КСВ-2"} if multi_connection else {"КСВ-1"}),
    )
    calculation = ElectricalCalculation(
        id=uuid.uuid4(),
        project_id=project.id,
        object_id=obj.id,
        variant_number=1,
        electrical_variant_id=variant.id,
        cable_type="self_regulating_tt",
        cable_mark="30ТТВ2-СР",
        params={},
        results=_result(object_version=4, assignment_version=2),
    )
    db_session.add(calculation)
    await db_session.commit()
    return project, variant


async def test_multi_kit_catalog_preflight_requires_selection(
    db_session: AsyncSession,
    employee_user: User,
):
    project, variant = await _seed_ready_project(
        db_session,
        employee_user,
        name="Multi kit selection",
        multi_connection=True,
    )
    request = SpecificationGenerationRequest.model_validate(
        {
            "variant_ids": [variant.id],
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
    results = await SpecificationPreflightService(db_session).preflight_variants(
        project.id,
        CurrentPrincipal(role="employee", user_id=employee_user.id, email=employee_user.email),
        request,
    )
    assert results[0].status is SpecificationPreflightStatus.SELECTION_REQUIRED
    connection = next(
        group for group in results[0].candidate_groups if group.category == "connection_kit"
    )
    assert len(connection.candidates) == 2
    assert connection.selected_catalog_item_id is None


async def test_generate_returns_selection_required_with_candidate_groups(
    db_session: AsyncSession,
    employee_user: User,
):
    from app.schemas.specification import SpecificationGenerationStatus
    from app.services.specification_generation_service import SpecificationGenerationService

    project, variant = await _seed_ready_project(
        db_session,
        employee_user,
        name="Generate multi kit",
        multi_connection=True,
    )
    request = SpecificationGenerationRequest.model_validate(
        {
            "variant_ids": [variant.id],
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
    response = await SpecificationGenerationService(db_session).generate(
        project.id,
        CurrentPrincipal(role="employee", user_id=employee_user.id, email=employee_user.email),
        request,
    )
    assert len(response.results) == 1
    assert response.results[0].status is SpecificationGenerationStatus.SELECTION_REQUIRED
    assert response.results[0].candidate_groups
    connection = next(
        group
        for group in response.results[0].candidate_groups
        if group.category == "connection_kit"
    )
    assert len(connection.candidates) == 2

    # Wrong-group selection stays selection_required.
    foreign = next(
        group for group in response.results[0].candidate_groups if group.category == "sealant"
    )
    wrong = await SpecificationGenerationService(db_session).generate(
        project.id,
        CurrentPrincipal(role="employee", user_id=employee_user.id, email=employee_user.email),
        SpecificationGenerationRequest.model_validate(
            {
                "variant_ids": [variant.id],
                "options": request.options.model_dump(mode="json", by_alias=True),
                "catalog_selections": {
                    connection.group_key: str(foreign.candidates[0].catalog_item_id),
                },
            }
        ),
    )
    assert wrong.results[0].status is SpecificationGenerationStatus.SELECTION_REQUIRED
    assert any(
        issue.get("reason") == "catalog_selection_not_in_group"
        for diagnostic in wrong.results[0].diagnostics
        for issue in diagnostic.issues
    )
