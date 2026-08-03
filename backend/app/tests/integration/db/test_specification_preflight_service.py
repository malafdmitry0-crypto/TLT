"""PostgreSQL proof for strict UUID specification preflight isolation."""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import select
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
        variant_number=2,
        electrical_variant_id=legacy_only_variant.id,
        items=[{"name": "previous", "quantity": 7}],
        generation_mode="full",
        generation_options={"snapshot": "unchanged"},
        is_stale=False,
    )
    catalog_id = uuid.uuid4()
    catalog_version = SpecificationCatalogVersion(
        id=catalog_id,
        catalog_key="builtin-specification",
        version="integration-v1",
        status="active",
        authority="approved",
        source="integration owner registry",
        source_checksum=f"sha256:{'a' * 64}",
        payload_checksum=f"sha256:{'b' * 64}",
        schema_version=1,
        item_count=1,
        is_complete=True,
        validation_issues=[],
    )
    catalog_item = SpecificationCatalogItem(
        id=uuid.uuid4(),
        catalog_version_id=catalog_id,
        item_key="cable:30ТТВ2-СР",
        category="cable",
        name="Греющий кабель",
        mark="30ТТВ2-СР",
        nomenclature_code="001-002-002",
        supply_unit="м",
        applicability={},
        package_parameters={},
        formula_parameters={},
        source_ref="integration owner registry row",
        row_checksum=f"sha256:{'d' * 64}",
        position=0,
    )
    db_session.add(catalog_version)
    await db_session.flush()
    db_session.add_all(
        [
            exact_calculation,
            previous_specification,
            catalog_item,
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
    assert results[1].status is SpecificationPreflightStatus.BLOCKED
    assert results[1].contributing_objects == 0
    assert results[1].diagnostics[0].code is SpecificationDiagnosticCode.VARIANT_NOT_READY

    await db_session.refresh(previous_specification)
    assert previous_specification.items == [{"name": "previous", "quantity": 7}]
    assert previous_specification.generation_options == {"snapshot": "unchanged"}
    assert previous_specification.is_stale is False
    assert previous_specification.updated_at == previous_updated_at
