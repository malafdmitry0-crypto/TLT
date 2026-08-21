"""Database proofs for canonical project-scoped specification generation (CANON-06)."""

from __future__ import annotations

import uuid
from decimal import Decimal

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
from app.models.specification import Specification
from app.models.user import User
from app.schemas.specification import (
    SpecificationDiagnosticCode,
    SpecificationGenerationRequest,
    SpecificationGenerationStatus,
    SpecificationPreflightStatus,
    SpecificationRequestedOptions,
)
from app.services.specification_generation_service import (
    SpecificationGenerationService,
)
from app.services.specification_preflight_service import SpecificationPreflightService
from app.tests.specification_catalog_fixtures import (
    import_and_activate_complete_specification_catalog,
)

pytestmark = pytest.mark.asyncio(loop_scope="session")


def _calc_result(*, object_version: int, assignment_version: int) -> dict:
    catalogs = {
        kind: {
            "version": f"{kind}-v1",
            "status": "active",
            "source_checksum": f"sha256:{kind}-integration",
        }
        for kind in ("power", "section", "bom")
    }
    catalogs["bom"]["row"] = {
        "full_mark": "30ТТВ2-СР",
        "nomenclature_code": "001-002-002",
        "supplier": "ТЛТ",
        "unit": "м",
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
        "section_plan": {"count": 9, "length_m": 81.0},
        "layout": {
            "actual_installed_length_m": 729.0,
            "required_order_length_m": 801.9,
        },
    }


async def _seed_ready_project(
    db_session: AsyncSession,
    employee_user: User,
    *,
    name: str,
    with_second_blocked: bool = False,
) -> tuple[Project, list[ElectricalVariant], ProjectObject]:
    project = Project(
        id=uuid.uuid4(),
        name=name,
        user_id=employee_user.id,
        specification_settings={
            "grouping_mode": "separate_by_object_type",
            "Ex": False,
            "K1i": False,
            "K2i": False,
            "Kiu": False,
            "L_K2i_m": "0",
            "R_gr": "1",
        },
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
    variants = [ready_variant]
    blocked_variant: ElectricalVariant | None = None
    if with_second_blocked:
        blocked_variant = ElectricalVariant(
            id=uuid.uuid4(),
            project_id=project.id,
            name="ЭР blocked",
            name_normalized="эр blocked",
            sort_order=1,
            legacy_variant_number=2,
            is_active=False,
        )
        variants.append(blocked_variant)

    obj = ProjectObject(
        id=uuid.uuid4(),
        project_id=project.id,
        object_type="pipe",
        sort_order=0,
        version=4,
        params={"outer_diameter": 0.108},
        results={"heat_loss": 100},
        is_valid=True,
    )
    db_session.add(project)
    await db_session.flush()
    db_session.add_all(variants)
    await db_session.flush()
    db_session.add(obj)
    await db_session.flush()

    # Trim auto assignments to ready object only for ready variant.
    for variant in variants:
        rows = (
            (
                await db_session.execute(
                    select(ElectricalVariantObject).where(
                        ElectricalVariantObject.electrical_variant_id == variant.id
                    )
                )
            )
            .scalars()
            .all()
        )
        for assignment in rows:
            if assignment.object_id != obj.id:
                await db_session.delete(assignment)
            else:
                assignment.system_type = "self_regulating"
                assignment.assignment_state = "ready"
                assignment.version = 2
                assignment.object_version_snapshot = 4
                assignment.diagnostics = {}
    await db_session.flush()

    calc = ElectricalCalculation(
        id=uuid.uuid4(),
        project_id=project.id,
        object_id=obj.id,
        variant_number=1,
        electrical_variant_id=ready_variant.id,
        cable_type="self_regulating_tt",
        cable_mark="30ТТВ2-СР",
        params={},
        results=_calc_result(object_version=4, assignment_version=2),
    )
    await import_and_activate_complete_specification_catalog(
        db_session,
        version_prefix="generation-v1",
        high_temperature_connection_marks={"КСВ-2"},
    )
    db_session.add(calc)

    if blocked_variant is not None:
        # Leave blocked without calculation so preflight BLOCKED.
        pass

    await db_session.commit()
    return project, variants, obj


def _principal(user: User) -> CurrentPrincipal:
    return CurrentPrincipal(role="employee", user_id=user.id, email=user.email)


def _generation_options() -> SpecificationRequestedOptions:
    return SpecificationRequestedOptions.model_validate(
        {
            "grouping_mode": "separate_by_object_type",
            "Ex": False,
            "K1i": False,
            "K2i": False,
            "Kiu": False,
            "L_K2i_m": "0",
            "R_gr": "1",
        }
    )


async def test_ready_complete_catalog_generates_and_persists_by_uuid(
    db_session: AsyncSession,
    employee_user: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    project, variants, _obj = await _seed_ready_project(
        db_session,
        employee_user,
        name="READY generate UUID BOM",
    )
    ready = variants[0]
    request = SpecificationGenerationRequest(
        variant_ids=[ready.id],
        options=_generation_options(),
    )
    response = await SpecificationGenerationService(db_session).generate(
        project.id,
        _principal(employee_user),
        request,
    )
    assert len(response.results) == 1
    result = response.results[0]
    assert result.status is SpecificationGenerationStatus.GENERATED
    assert result.items
    assert all(item.source == "auto" for item in result.items)
    assert any(item.category == "cable" for item in result.items)
    assert any(item.category == "connection_kit" for item in result.items)
    connection = next(item for item in result.items if item.category == "connection_kit")
    assert connection.quantity == Decimal("5")  # ceil(9/2)
    assert result.snapshot is not None
    assert result.snapshot["schema"] == "specification-generation"
    assert result.snapshot["settings_revision"] == 1
    assert result.snapshot["variant_revision"]["updated_at"].endswith("Z")
    assert result.snapshot["preflight_fingerprint_schema"] == ("specification-preflight/v1")
    assert result.snapshot["preflight_fingerprint"].startswith("sha256:")
    revisions = result.snapshot["input_revisions"]
    assert len(revisions) == 1
    assert revisions[0]["object"] == {"id": str(_obj.id), "version": 4}
    assert revisions[0]["assignment"]["version"] == 2
    assert revisions[0]["assignment"]["object_version_snapshot"] == 4
    assert revisions[0]["electrical_result"]["id"]
    assert revisions[0]["electrical_result"]["formula_version"] == (ELECTRICAL_TT_FORMULA_VERSION)
    assert revisions[0]["section_plan_revision"]["payload"] == {
        "count": 9,
        "length_m": 81.0,
    }
    normalized = result.snapshot["normalized_inputs"]["objects"]
    assert normalized == [
        {
            "object_id": str(_obj.id),
            "object_type_section": "pipe",
            "cable_mark": "30ТТВ2-СР",
            "temperature_group": "MEDIUM_HIGH",
            "section_plan": {"count": "9", "length_m": "81.0"},
            "layout": {
                "actual_installed_length_m": "729.0",
                "required_order_length_m": "801.9",
            },
            "outer_diameter_mm": "108.000",
        }
    ]

    persisted = (
        await db_session.execute(
            select(Specification).where(
                Specification.project_id == project.id,
                Specification.electrical_variant_id == ready.id,
            )
        )
    ).scalar_one()
    assert persisted.electrical_variant_id == ready.id
    assert persisted.is_stale is False
    assert len(persisted.items) >= 1
    assert persisted.snapshot is not None
    assert persisted.snapshot["schema"] == "specification-generation"

    async def no_contributing(*_args, **_kwargs):  # type: ignore[no-untyped-def]
        return [], {}, []

    monkeypatch.setattr(
        SpecificationGenerationService, "_load_contributing_context", no_contributing
    )
    blocked = await SpecificationGenerationService(db_session).generate(
        project.id, _principal(employee_user), request
    )
    assert blocked.results[0].diagnostics[0].message == (
        "Нет результатов электротехнического расчёта для включения в спецификацию"
    )


async def test_ready_and_blocked_mixed_writes_ready_bom_and_blocked_outcome(
    db_session: AsyncSession,
    employee_user: User,
) -> None:
    project, variants, _obj = await _seed_ready_project(
        db_session,
        employee_user,
        name="Mixed READY/BLOCKED",
        with_second_blocked=True,
    )
    ready, blocked = variants
    request = SpecificationGenerationRequest(
        variant_ids=[ready.id, blocked.id],
        options=_generation_options(),
    )
    response = await SpecificationGenerationService(db_session).generate(
        project.id,
        _principal(employee_user),
        request,
    )
    by_id = {item.electrical_variant_id: item for item in response.results}
    assert by_id[ready.id].status is SpecificationGenerationStatus.GENERATED
    assert by_id[blocked.id].status is SpecificationGenerationStatus.BLOCKED

    rows = (
        (
            await db_session.execute(
                select(Specification).where(Specification.project_id == project.id)
            )
        )
        .scalars()
        .all()
    )
    assert len(rows) == 2
    persisted_by_id = {row.electrical_variant_id: row for row in rows}
    assert persisted_by_id[ready.id].items
    assert persisted_by_id[ready.id].snapshot is not None
    assert persisted_by_id[ready.id].generation_status == "generated"
    assert persisted_by_id[blocked.id].items == []
    assert persisted_by_id[blocked.id].snapshot is None
    assert persisted_by_id[blocked.id].generation_status == "blocked"
    assert persisted_by_id[blocked.id].generation_diagnostics


async def test_unexpected_exception_rolls_back_whole_request_and_bubbles(
    db_session: AsyncSession,
    employee_user: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    project, variants, _obj = await _seed_ready_project(
        db_session,
        employee_user,
        name="Savepoint isolation",
        with_second_blocked=False,
    )
    # Seed a second ready-like variant with its own calculation.
    second = ElectricalVariant(
        id=uuid.uuid4(),
        project_id=project.id,
        name="ЭР 2",
        name_normalized="эр 2",
        sort_order=1,
        legacy_variant_number=2,
        is_active=False,
    )
    db_session.add(second)
    await db_session.flush()
    obj = (
        await db_session.execute(
            select(ProjectObject).where(ProjectObject.project_id == project.id)
        )
    ).scalar_one()
    assignment = await db_session.scalar(
        select(ElectricalVariantObject).where(
            ElectricalVariantObject.electrical_variant_id == second.id,
            ElectricalVariantObject.object_id == obj.id,
        )
    )
    if assignment is None:
        assignment = ElectricalVariantObject(
            id=uuid.uuid4(),
            project_id=project.id,
            electrical_variant_id=second.id,
            object_id=obj.id,
            system_type="self_regulating",
            assignment_state="ready",
            version=2,
            object_version_snapshot=4,
            diagnostics={},
        )
        db_session.add(assignment)
    else:
        assignment.system_type = "self_regulating"
        assignment.assignment_state = "ready"
        assignment.version = 2
        assignment.object_version_snapshot = 4
        assignment.diagnostics = {}
    await db_session.flush()
    db_session.add(
        ElectricalCalculation(
            id=uuid.uuid4(),
            project_id=project.id,
            object_id=obj.id,
            variant_number=2,
            electrical_variant_id=second.id,
            cable_type="self_regulating_tt",
            cable_mark="30ТТВ2-СР",
            params={},
            results=_calc_result(object_version=4, assignment_version=2),
        )
    )
    await db_session.commit()

    from app.services import specification_bom_builder as bom_mod

    original = bom_mod.materialize_specification_bom

    def flaky_materialize(**kwargs):  # type: ignore[no-untyped-def]
        if kwargs["electrical_variant_id"] == second.id:
            raise RuntimeError("simulated mid-ER failure")
        return original(**kwargs)

    monkeypatch.setattr(
        "app.services.specification_generation_service.materialize_specification_bom",
        flaky_materialize,
    )

    request = SpecificationGenerationRequest(
        variant_ids=[variants[0].id, second.id],
        options=_generation_options(),
    )
    project_id = project.id
    with pytest.raises(RuntimeError, match="simulated mid-ER failure"):
        await SpecificationGenerationService(db_session).generate(
            project_id,
            _principal(employee_user),
            request,
        )

    rows = (
        (
            await db_session.execute(
                select(Specification).where(Specification.project_id == project_id)
            )
        )
        .scalars()
        .all()
    )
    assert rows == []


async def test_fingerprint_race_returns_conflict_without_bom_write(
    db_session: AsyncSession,
    employee_user: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    project, variants, _obj = await _seed_ready_project(
        db_session,
        employee_user,
        name="Fingerprint race",
    )
    ready = variants[0]

    real_preflight = SpecificationPreflightService.preflight_variants
    call_count = {"n": 0}

    async def race_preflight(self, project_id, principal, request):  # type: ignore[no-untyped-def]
        call_count["n"] += 1
        results = await real_preflight(self, project_id, principal, request)
        if call_count["n"] == 1:
            # First call (outer) is ready; second (under lock) will be mutated.
            return results
        # Mutate fingerprint to simulate concurrent change.
        mutated = []
        for item in results:
            if item.status is SpecificationPreflightStatus.READY:
                mutated.append(item.model_copy(update={"input_fingerprint": f"sha256:{'f' * 64}"}))
            else:
                mutated.append(item)
        return mutated

    monkeypatch.setattr(
        SpecificationPreflightService,
        "preflight_variants",
        race_preflight,
    )

    request = SpecificationGenerationRequest(
        variant_ids=[ready.id],
        options=_generation_options(),
    )
    response = await SpecificationGenerationService(db_session).generate(
        project.id,
        _principal(employee_user),
        request,
    )
    assert response.results[0].status is SpecificationGenerationStatus.BLOCKED
    assert (
        response.results[0].diagnostics[0].code is SpecificationDiagnosticCode.GENERATION_CONFLICT
    )
    rows = (
        (
            await db_session.execute(
                select(Specification).where(Specification.project_id == project.id)
            )
        )
        .scalars()
        .all()
    )
    assert len(rows) == 1
    persisted = rows[0]
    assert persisted.electrical_variant_id == ready.id
    assert persisted.items == []
    assert persisted.snapshot is None
    assert persisted.generation_status == "blocked"
    assert persisted.generation_diagnostics[0]["code"] == (
        SpecificationDiagnosticCode.GENERATION_CONFLICT.value
    )


async def test_confirmed_unassigned_still_generates_when_gates_pass(
    db_session: AsyncSession,
    employee_user: User,
) -> None:
    project, variants, obj = await _seed_ready_project(
        db_session,
        employee_user,
        name="Confirmed unassigned path",
    )
    ready = variants[0]
    # Add a second unassigned object on the ready ER.
    extra = ProjectObject(
        id=uuid.uuid4(),
        project_id=project.id,
        object_type="pipe",
        sort_order=1,
        version=1,
        params={"outer_diameter": 0.089},
        results={},
        is_valid=True,
    )
    db_session.add(extra)
    await db_session.flush()
    assignment = await db_session.scalar(
        select(ElectricalVariantObject).where(
            ElectricalVariantObject.electrical_variant_id == ready.id,
            ElectricalVariantObject.object_id == extra.id,
        )
    )
    assert assignment is not None
    assignment.assignment_state = "unassigned"
    assignment.system_type = None
    assignment.diagnostics = {}
    await db_session.commit()

    request = SpecificationGenerationRequest(
        variant_ids=[ready.id],
        options=_generation_options(),
        exclude_unassigned_confirmed=True,
    )
    response = await SpecificationGenerationService(db_session).generate(
        project.id,
        _principal(employee_user),
        request,
    )
    assert response.results[0].status is SpecificationGenerationStatus.GENERATED
    assert extra.id in response.results[0].excluded_unassigned_object_ids
    # Contributing object still present; extra excluded from BOM inputs.
    assert response.results[0].items
    del obj  # silence unused after setup


async def test_manual_items_preserved_on_regenerate(
    db_session: AsyncSession,
    employee_user: User,
) -> None:
    project, variants, _obj = await _seed_ready_project(
        db_session,
        employee_user,
        name="Preserve manual",
    )
    ready = variants[0]
    db_session.add(
        Specification(
            id=uuid.uuid4(),
            project_id=project.id,
            electrical_variant_id=ready.id,
            items=[
                {
                    "category": "manual",
                    "name": "Ручная позиция",
                    "article": "M-1",
                    "unit": "шт.",
                    "quantity": "3",
                    "source": "manual",
                    "params": {},
                }
            ],
            snapshot={"schema": "old"},
            is_stale=False,
        )
    )
    await db_session.commit()

    request = SpecificationGenerationRequest(
        variant_ids=[ready.id],
        options=_generation_options(),
    )
    response = await SpecificationGenerationService(db_session).generate(
        project.id,
        _principal(employee_user),
        request,
    )
    assert response.results[0].status is SpecificationGenerationStatus.GENERATED
    sources = {item.source for item in response.results[0].items}
    assert "manual" in sources
    assert "auto" in sources
    manual = next(item for item in response.results[0].items if item.source == "manual")
    assert manual.name == "Ручная позиция"
    assert manual.quantity == Decimal("3")


async def test_invalid_manual_item_blocks_regeneration_without_row_loss(
    db_session: AsyncSession,
    employee_user: User,
) -> None:
    project, variants, _obj = await _seed_ready_project(
        db_session,
        employee_user,
        name="Reject invalid manual",
    )
    ready = variants[0]
    stored_items = [
        {
            "category": "manual",
            "name": "Повреждённая ручная позиция",
            "article": "M-BROKEN",
            "unit": "шт.",
            "quantity": "not-a-decimal",
            "source": "manual",
            "params": {},
        }
    ]
    previous_snapshot = {"schema": "old", "proof": "must-survive"}
    specification = Specification(
        id=uuid.uuid4(),
        project_id=project.id,
        electrical_variant_id=ready.id,
        items=stored_items,
        snapshot=previous_snapshot,
        is_stale=False,
    )
    db_session.add(specification)
    await db_session.commit()

    response = await SpecificationGenerationService(db_session).generate(
        project.id,
        _principal(employee_user),
        SpecificationGenerationRequest(
            variant_ids=[ready.id],
            options=_generation_options(),
        ),
    )

    result = response.results[0]
    assert result.status is SpecificationGenerationStatus.BLOCKED
    assert result.diagnostics[0].code is SpecificationDiagnosticCode.FORMULA_INPUT_INVALID
    assert result.diagnostics[0].issues == [
        {
            "reason": "invalid_stored_manual_item",
            "item_index": 0,
            "error": "ValidationError",
        }
    ]
    await db_session.refresh(specification)
    assert specification.items == stored_items
    assert specification.snapshot == previous_snapshot
