"""Database proofs for canonical project-scoped specification settings."""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import CurrentPrincipal
from app.models.electrical_variant import ElectricalVariant
from app.models.project import Project
from app.models.project_object import ProjectObject
from app.models.specification import Specification
from app.models.user import User
from app.schemas.specification import (
    SpecificationCatalogSnapshot,
    SpecificationDiagnostic,
    SpecificationDiagnosticCode,
    SpecificationGenerationRequest,
    SpecificationGenerationStatus,
    SpecificationGroupingMode,
    SpecificationIssueKind,
    SpecificationPreflightStatus,
    SpecificationRequestedOptions,
    SpecificationResolvedOptions,
    SpecificationVariantPreflightResult,
)
from app.services.specification_generation_service import (
    SpecificationGenerationService,
    SpecificationProjectSettingsService,
)

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def test_settings_change_is_versioned_and_stales_every_spec_atomically(
    db_session: AsyncSession,
    employee_user: User,
) -> None:
    project = Project(
        id=uuid.uuid4(),
        name="Canonical specification settings",
        user_id=employee_user.id,
        specification_settings={},
        specification_settings_version=1,
    )
    obj = ProjectObject(
        id=uuid.uuid4(),
        project_id=project.id,
        object_type="pipe",
        sort_order=0,
        version=1,
        params={"outer_diameter": 0.108},
        results={},
        is_valid=True,
    )
    specs = [
        Specification(
            id=uuid.uuid4(),
            project_id=project.id,
            variant_number=index,
            items=[],
            generation_options={"schema": "old"},
            is_stale=False,
        )
        for index in (1, 2)
    ]
    db_session.add(project)
    await db_session.flush()
    db_session.add_all([obj, *specs])
    await db_session.commit()

    service = SpecificationProjectSettingsService(db_session)
    initial = await service.get(project.id)
    assert initial.version == 1
    assert initial.settings.model_dump(exclude_none=True) == {}

    requested = SpecificationRequestedOptions.model_validate(
        {
            "grouping_mode": "separate_by_object_type",
            "Ex": False,
            "K1i": False,
            "K2i": True,
            "Kiu": False,
            "L_K2i_m": "0",
            "R_gr": "1.1",
        }
    )
    updated = await service.update(project.id, requested)
    assert updated.version == 2
    assert updated.settings.ex is False
    assert str(updated.settings.l_k2i_m) == "0"

    await db_session.refresh(project)
    await db_session.refresh(obj)
    for spec in specs:
        await db_session.refresh(spec)
        assert spec.is_stale is True
        assert spec.stale_reason == "specification_settings_changed"
    assert project.specification_settings == {
        "grouping_mode": "separate_by_object_type",
        "Ex": False,
        "K1i": False,
        "K2i": True,
        "Kiu": False,
        "L_K2i_m": "0",
        "R_gr": "1.1",
    }
    assert obj.params == {"outer_diameter": 0.108}

    repeated = await service.update(project.id, requested)
    assert repeated.version == 2


async def test_settings_reader_ignores_legacy_values(
    db_session: AsyncSession,
    employee_user: User,
) -> None:
    project = Project(
        id=uuid.uuid4(),
        name="Legacy settings reader",
        user_id=employee_user.id,
        specification_settings={
            "ex_zone": False,
            "min_length_for_end_indication": 0,
            "reserve_coefficient": 1.25,
            "connector_kit_sections_per_kit": 2,
        },
        specification_settings_version=7,
    )
    db_session.add(project)
    await db_session.commit()

    response = await SpecificationProjectSettingsService(db_session).get(project.id)
    assert response.version == 7
    assert response.settings.ex is None
    assert response.settings.l_k2i_m is None
    assert response.settings.r_gr is None
    assert response.settings.k1i is None
    assert "connector_kit_sections_per_kit" not in response.settings.model_dump()


async def test_generation_fails_closed_until_canonical_calculators_are_connected(
    db_session: AsyncSession,
    employee_user: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    project = Project(
        id=uuid.uuid4(),
        name="Multi ER canonical generation",
        user_id=employee_user.id,
        specification_settings_version=4,
        specification_settings={},
    )
    variants = [
        ElectricalVariant(
            id=uuid.uuid4(),
            project_id=project.id,
            name=f"ЭР {index}",
            name_normalized=f"эр {index}",
            sort_order=index,
            legacy_variant_number=index,
            is_active=index == 1,
        )
        for index in (1, 2, 3)
    ]
    db_session.add(project)
    await db_session.flush()
    db_session.add_all(variants)
    await db_session.commit()

    resolved = SpecificationResolvedOptions.model_validate(
        {
            "catalog_id": "approved-catalog",
            "catalog_version": "2026-08-03",
            "grouping_mode": SpecificationGroupingMode.SEPARATE_BY_OBJECT_TYPE,
            "Ex": False,
            "K1i": False,
            "K2i": True,
            "Kiu": False,
            "L_K2i_m": "0",
            "R_gr": "1.1",
        }
    )
    catalog = SpecificationCatalogSnapshot(
        id=uuid.uuid4(),
        catalog_key="approved-catalog",
        version="2026-08-03",
        source_checksum=f"sha256:{'a' * 64}",
        payload_checksum=f"sha256:{'b' * 64}",
        schema_version=1,
    )
    ready = [
        SpecificationVariantPreflightResult(
            electrical_variant_id=variant.id,
            electrical_variant_name=variant.name,
            status=SpecificationPreflightStatus.READY,
            resolved_options=resolved,
            catalog=catalog,
            fingerprint_schema="specification-preflight/v1",
            input_fingerprint=f"sha256:{digit * 64}",
        )
        for variant, digit in zip(variants[:2], ("1", "2"), strict=True)
    ]
    blocked = SpecificationVariantPreflightResult(
        electrical_variant_id=variants[2].id,
        electrical_variant_name=variants[2].name,
        status=SpecificationPreflightStatus.BLOCKED,
        diagnostics=[
            SpecificationDiagnostic(
                code=SpecificationDiagnosticCode.ACCESSORY_CATALOG_INCOMPLETE,
                kind=SpecificationIssueKind.BLOCKING,
                message="Approved fixture intentionally blocks one ER",
            )
        ],
    )
    preflight_mock = AsyncMock(return_value=[ready[0], blocked, ready[1]])
    monkeypatch.setattr(
        "app.services.specification_generation_service."
        "SpecificationPreflightService.preflight_variants",
        preflight_mock,
    )

    request = SpecificationGenerationRequest(
        variant_ids=[variant.id for variant in variants],
        options=SpecificationRequestedOptions.model_validate(
            resolved.model_dump(by_alias=True, exclude={"catalog_id", "catalog_version"})
        ),
    )
    response = await SpecificationGenerationService(db_session).generate(
        project.id,
        CurrentPrincipal(
            role="employee",
            user_id=employee_user.id,
            email=employee_user.email,
        ),
        request,
    )

    assert [item.status for item in response.results] == [
        SpecificationGenerationStatus.BLOCKED,
        SpecificationGenerationStatus.BLOCKED,
        SpecificationGenerationStatus.BLOCKED,
    ]
    persisted = list(
        (
            await db_session.execute(
                select(Specification)
                .where(Specification.project_id == project.id)
                .order_by(Specification.variant_number)
            )
        )
        .scalars()
        .all()
    )
    assert persisted == []
    assert all(
        result.diagnostics[0].code
        is SpecificationDiagnosticCode.CANONICAL_CALCULATORS_UNAVAILABLE
        for result in (response.results[0], response.results[2])
    )
