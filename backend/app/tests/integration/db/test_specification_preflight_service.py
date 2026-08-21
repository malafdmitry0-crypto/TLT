"""PostgreSQL proof for strict UUID specification preflight isolation."""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import CurrentPrincipal
from app.formulas.electrical.tt_contract import (
    ELECTRICAL_TT_FORMULA_FINGERPRINT,
    ELECTRICAL_TT_FORMULA_VERSION,
)
from app.models.electrical_calculation import ElectricalCalculation
from app.models.electrical_variant import ElectricalVariant, ElectricalVariantObject
from app.models.project import Project
from app.models.project_object import ProjectObject
from app.models.specification import (
    Specification,
    SpecificationCatalogItem,
    SpecificationCatalogVersion,
)
from app.models.user import User
from app.schemas.specification import (
    SpecificationDiagnosticCode,
    SpecificationGenerationRequest,
    SpecificationPreflightStatus,
)
from app.services.specification_preflight_service import SpecificationPreflightService

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


def _single_choice_catalog_items(catalog_id: uuid.UUID) -> list[SpecificationCatalogItem]:
    """One candidate per selection category so READY path auto-selects."""
    from app.tests.specification_catalog_fixtures import complete_specification_catalog_items

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
    catalog_id = uuid.uuid4()
    catalog_items = _single_choice_catalog_items(catalog_id)
    await db_session.execute(
        update(SpecificationCatalogVersion)
        .where(SpecificationCatalogVersion.status == "active")
        .values(status="retired")
    )
    catalog_version = SpecificationCatalogVersion(
        id=catalog_id,
        catalog_key="builtin-specification",
        version=f"integration-v1-{uuid.uuid4()}",
        status="active",
        authority="approved",
        source="integration owner registry",
        source_checksum=f"sha256:{'a' * 64}",
        payload_checksum=f"sha256:{'b' * 64}",
        schema_version=1,
        item_count=len(catalog_items),
        is_complete=True,
        validation_issues=[],
    )
    db_session.add(catalog_version)
    await db_session.flush()
    db_session.add_all(
        [
            exact_calculation,
            previous_specification,
            *catalog_items,
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
    assert all(
        group.selected_catalog_item_id is not None for group in results[0].candidate_groups
    )
    assert results[1].status is SpecificationPreflightStatus.BLOCKED
    assert results[1].contributing_objects == 0
    assert results[1].diagnostics[0].code is SpecificationDiagnosticCode.VARIANT_NOT_READY

    await db_session.refresh(previous_specification)
    assert previous_specification.items == [{"name": "previous", "quantity": 7}]
    assert previous_specification.snapshot == {"state": "unchanged"}
    assert previous_specification.is_stale is False
    assert previous_specification.updated_at == previous_updated_at


def _multi_connection_catalog_items(catalog_id: uuid.UUID) -> list[SpecificationCatalogItem]:
    from app.tests.specification_catalog_fixtures import complete_specification_catalog_items

    items: list[SpecificationCatalogItem] = []
    for index, raw in enumerate(complete_specification_catalog_items()):
        category = raw.category.value if hasattr(raw.category, "value") else raw.category
        if category == "box":
            continue
        if category == "connection_kit" and raw.mark not in {"КСВ-1", "КСВ-2"}:
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
                row_checksum=f"sha256:{(index + 100):064x}",
                position=index,
            )
        )
    return items


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
    catalog_id = uuid.uuid4()
    items = (
        _multi_connection_catalog_items(catalog_id)
        if multi_connection
        else _single_choice_catalog_items(catalog_id)
    )
    await db_session.execute(
        update(SpecificationCatalogVersion)
        .where(SpecificationCatalogVersion.status == "active")
        .values(status="retired")
    )
    catalog_version = SpecificationCatalogVersion(
        id=catalog_id,
        catalog_key="builtin-specification",
        version=f"canon03-{uuid.uuid4()}",
        status="active",
        authority="approved",
        source="integration multi kit",
        source_checksum=f"sha256:{'c' * 64}",
        payload_checksum=f"sha256:{'d' * 64}",
        schema_version=1,
        item_count=len(items),
        is_complete=True,
        validation_issues=[],
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
    db_session.add(catalog_version)
    await db_session.flush()
    db_session.add_all([calculation, *items])
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
