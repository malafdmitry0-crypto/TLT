"""Application-level UUID isolation for specification preflight."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock

import pytest
from heatcalc_electrical_core import (
    ELECTRICAL_TT_FORMULA_FINGERPRINT,
    ELECTRICAL_TT_FORMULA_VERSION,
)

from app.core.dependencies import CurrentPrincipal
from app.models.electrical_calculation import ElectricalCalculation
from app.models.electrical_variant import ElectricalVariant, ElectricalVariantObject
from app.models.project import Project
from app.models.project_object import ProjectObject
from app.models.specification import (
    SpecificationCatalogItem,
    SpecificationCatalogVersion,
)
from app.schemas.specification import (
    SpecificationDiagnosticCode,
    SpecificationGenerationRequest,
    SpecificationPreflightStatus,
)
from app.services.project_service import ProjectService
from app.services.specification_catalog import (
    ResolvedSpecificationCatalog,
    SpecificationCatalogService,
)
from app.services.specification_preflight_service import (
    SpecificationPreflightService,
    SpecificationPreflightServiceError,
)


def _scalars_result(items):
    result = MagicMock()
    result.scalars.return_value.all.return_value = list(items)
    return result


def _rows_result(items):
    result = MagicMock()
    result.all.return_value = list(items)
    return result


def _project(project_id: uuid.UUID, *, settings: dict | None = None) -> Project:
    return Project(
        id=project_id,
        name="Preflight project",
        user_id=uuid.uuid4(),
        specification_settings=settings or {},
        specification_settings_version=3,
    )


def _variant(project_id: uuid.UUID, *, name: str) -> ElectricalVariant:
    return ElectricalVariant(
        id=uuid.uuid4(),
        project_id=project_id,
        name=name,
        name_normalized=name.casefold(),
        sort_order=0,
        is_active=False,
    )


def _tt_result(*, object_version: int = 4, assignment_version: int = 2) -> dict:
    catalogs = {
        kind: {
            "version": f"{kind}-v1",
            "status": "active",
            "source_checksum": f"sha256:{kind}-checksum",
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


def _row(
    project_id: uuid.UUID,
    variant_id: uuid.UUID,
    *,
    state: str = "ready",
    assignment_version: int = 2,
    with_calculation: bool = True,
    object_params: dict | None = None,
) -> tuple[ElectricalVariantObject, ProjectObject, ElectricalCalculation | None]:
    object_id = uuid.uuid4()
    obj = ProjectObject(
        id=object_id,
        project_id=project_id,
        object_type="pipe",
        sort_order=0,
        version=4,
        params=object_params or {},
        results={"heat_loss": 100},
        is_valid=True,
    )
    assignment = ElectricalVariantObject(
        id=uuid.uuid4(),
        project_id=project_id,
        electrical_variant_id=variant_id,
        object_id=object_id,
        system_type=None if state == "unassigned" else "self_regulating",
        assignment_state=state,
        version=assignment_version,
        object_version_snapshot=4,
        diagnostics={},
    )
    calculation = None
    if with_calculation:
        calculation = ElectricalCalculation(
            id=uuid.uuid4(),
            project_id=project_id,
            object_id=object_id,
            electrical_variant_id=variant_id,
            cable_type="self_regulating_tt",
            cable_mark="30ТТВ2-СР",
            params={},
            results=_tt_result(assignment_version=assignment_version),
            updated_at=datetime(2026, 8, 3, 8, 0, tzinfo=UTC),
        )
    return assignment, obj, calculation


def _catalog(*, multi_connection: bool = False) -> ResolvedSpecificationCatalog:
    """Single-choice accessory set keeps READY path; multi connection forces selection."""
    from app.tests.specification_catalog_fixtures import complete_specification_catalog_items

    version_id = uuid.uuid4()
    version = SpecificationCatalogVersion(
        id=version_id,
        catalog_key="builtin-specification",
        version="approved-v1",
        status="active",
        authority="approved",
        source="owner registry",
        source_checksum=f"sha256:{'a' * 64}",
        payload_checksum=f"sha256:{'b' * 64}",
        schema_version=1,
        item_count=0,
        is_complete=True,
        validation_issues=[],
    )
    items: list[SpecificationCatalogItem] = []
    for index, raw in enumerate(complete_specification_catalog_items()):
        category = raw.category.value if hasattr(raw.category, "value") else raw.category
        if category == "box":
            continue
        if category == "connection_kit" and not multi_connection and raw.mark != "КСВ-1":
            continue
        if (
            category == "connection_kit"
            and multi_connection
            and raw.mark
            not in {
                "КСВ-1",
                "КСВ-2",
            }
        ):
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
                catalog_version_id=version_id,
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
    version.item_count = len(items)
    return ResolvedSpecificationCatalog(version=version, items=tuple(items))


def _request(
    variant_ids: list[uuid.UUID],
    *,
    confirmed: bool = False,
    selections: dict[str, uuid.UUID] | None = None,
    explicit_options: bool = True,
) -> SpecificationGenerationRequest:
    options = (
        {
            "grouping_mode": "separate_by_object_type",
            "Ex": False,
            "K1i": False,
            "K2i": False,
            "Kiu": False,
            "L_K2i_m": "0",
            "R_gr": "1",
        }
        if explicit_options
        else {}
    )
    return SpecificationGenerationRequest.model_validate(
        {
            "variant_ids": variant_ids,
            "options": options,
            "exclude_unassigned_confirmed": confirmed,
            "catalog_selections": selections or {},
        }
    )


def _db_for(variants, rows):
    db = AsyncMock()
    db.execute = AsyncMock(
        side_effect=[
            _scalars_result(variants),
            _rows_result(rows),
        ]
    )
    db.add = MagicMock()
    db.flush = AsyncMock()
    db.commit = AsyncMock()
    return db


def _patch_read_boundaries(monkeypatch: pytest.MonkeyPatch, project, catalog):
    monkeypatch.setattr(
        ProjectService,
        "get_project_basic",
        AsyncMock(return_value=project),
    )
    monkeypatch.setattr(
        SpecificationCatalogService,
        "resolve_active",
        AsyncMock(return_value=catalog),
    )
    # Default unit tests do not exercise persisted selection IO; empty store.
    from app.services.specification_selection_service import SpecificationSelectionService

    monkeypatch.setattr(
        SpecificationSelectionService,
        "as_selection_map",
        AsyncMock(return_value={}),
    )


async def test_two_variants_are_isolated_and_preflight_is_side_effect_free(monkeypatch):
    project_id = uuid.uuid4()
    project = _project(project_id)
    first = _variant(project_id, name="ЭР 1")
    second = _variant(project_id, name="ЭР 2")
    first_row = _row(project_id, first.id)
    second_row = _row(project_id, second.id)
    db = _db_for([second, first], [second_row, first_row])
    _patch_read_boundaries(monkeypatch, project, _catalog())

    result = await SpecificationPreflightService(db).preflight_variants(
        project_id,
        CurrentPrincipal(role="employee", user_id=project.user_id),
        _request([first.id, second.id]),
    )

    assert [item.electrical_variant_id for item in result] == [first.id, second.id]
    assert all(item.status is SpecificationPreflightStatus.READY for item in result)
    assert [item.total_objects for item in result] == [1, 1]
    assert result[0].input_fingerprint != result[1].input_fingerprint
    assert first_row[1].id not in result[1].unassigned_object_ids
    assert second_row[1].id not in result[0].unassigned_object_ids
    db.add.assert_not_called()
    db.flush.assert_not_awaited()
    db.commit.assert_not_awaited()

    assignment_statement = db.execute.await_args_list[1].args[0]
    sql = str(assignment_statement)
    assert "electrical_calculations.variant_number =" not in sql
    assert "electrical_calculations.electrical_variant_id = " in sql
    assert "electrical_variant_objects.electrical_variant_id" in sql


async def test_blocked_er_does_not_change_ready_status_of_another(monkeypatch):
    project_id = uuid.uuid4()
    project = _project(project_id)
    ready = _variant(project_id, name="Ready")
    blocked = _variant(project_id, name="Blocked")
    rows = [
        _row(project_id, ready.id),
        _row(project_id, blocked.id, state="error", with_calculation=False),
    ]
    db = _db_for([ready, blocked], rows)
    _patch_read_boundaries(monkeypatch, project, _catalog())

    result = await SpecificationPreflightService(db).preflight_variants(
        project_id,
        CurrentPrincipal(role="employee", user_id=project.user_id),
        _request([ready.id, blocked.id]),
    )

    assert result[0].status is SpecificationPreflightStatus.READY
    assert result[1].status is SpecificationPreflightStatus.BLOCKED
    assert result[1].diagnostics[0].code is SpecificationDiagnosticCode.VARIANT_NOT_READY


async def test_zero_contributing_variant_is_blocked_without_confirmation(monkeypatch):
    project_id = uuid.uuid4()
    project = _project(project_id)
    variant = _variant(project_id, name="Empty")
    unassigned = _row(
        project_id,
        variant.id,
        state="unassigned",
        with_calculation=False,
    )
    _patch_read_boundaries(monkeypatch, project, _catalog())

    db = _db_for([variant], [unassigned])
    result = await SpecificationPreflightService(db).preflight_variants(
        project_id,
        CurrentPrincipal(role="employee", user_id=project.user_id),
        _request([variant.id]),
    )

    assert result[0].status is SpecificationPreflightStatus.BLOCKED
    assert result[0].contributing_objects == 0
    assert [diagnostic.code for diagnostic in result[0].diagnostics] == [
        SpecificationDiagnosticCode.VARIANT_NOT_READY
    ]
    assert result[0].excluded_unassigned_object_ids == []


async def test_variant_without_assignment_snapshot_keeps_not_ready_blocker(monkeypatch):
    project_id = uuid.uuid4()
    project = _project(project_id)
    variant = _variant(project_id, name="No project objects")
    db = _db_for([variant], [])
    _patch_read_boundaries(monkeypatch, project, _catalog())

    result = await SpecificationPreflightService(db).preflight_variants(
        project_id,
        CurrentPrincipal(role="employee", user_id=project.user_id),
        _request([variant.id]),
    )

    assert result[0].status is SpecificationPreflightStatus.BLOCKED
    assert result[0].total_objects == 0
    assert result[0].contributing_objects == 0
    assert [diagnostic.code for diagnostic in result[0].diagnostics] == [
        SpecificationDiagnosticCode.VARIANT_NOT_READY
    ]
    assert result[0].diagnostics[0].issues == [{"reason": "variant_has_no_assignments"}]


async def test_confirmation_excludes_only_this_er_unassigned_ids(monkeypatch):
    project_id = uuid.uuid4()
    project = _project(project_id)
    variant = _variant(project_id, name="Confirm")
    ready = _row(project_id, variant.id)
    unassigned = _row(
        project_id,
        variant.id,
        state="unassigned",
        with_calculation=False,
    )
    _patch_read_boundaries(monkeypatch, project, _catalog())

    first_db = _db_for([variant], [ready, unassigned])
    first = await SpecificationPreflightService(first_db).preflight_variants(
        project_id,
        CurrentPrincipal(role="employee", user_id=project.user_id),
        _request([variant.id]),
    )
    confirmed_db = _db_for([variant], [ready, unassigned])
    confirmed = await SpecificationPreflightService(confirmed_db).preflight_variants(
        project_id,
        CurrentPrincipal(role="employee", user_id=project.user_id),
        _request([variant.id], confirmed=True),
    )

    object_id = unassigned[1].id
    assert first[0].status is SpecificationPreflightStatus.CONFIRMATION_REQUIRED
    assert first[0].unassigned_object_ids == [object_id]
    assert first[0].excluded_unassigned_object_ids == []
    assert confirmed[0].status is SpecificationPreflightStatus.READY
    assert confirmed[0].excluded_unassigned_object_ids == [object_id]
    assert confirmed[0].input_fingerprint is not None


async def test_missing_options_block_instead_of_using_hidden_defaults(monkeypatch):
    project_id = uuid.uuid4()
    project = _project(project_id, settings={})
    variant = _variant(project_id, name="No settings")
    db = _db_for([variant], [_row(project_id, variant.id)])
    _patch_read_boundaries(monkeypatch, project, _catalog())

    result = await SpecificationPreflightService(db).preflight_variants(
        project_id,
        CurrentPrincipal(role="employee", user_id=project.user_id),
        _request([variant.id], explicit_options=False),
    )

    assert result[0].status is SpecificationPreflightStatus.BLOCKED
    assert result[0].resolved_options is None
    assert SpecificationDiagnosticCode.FORMULA_INPUT_INVALID in {
        item.code for item in result[0].diagnostics
    }


async def test_resolution_uses_only_request_and_preserves_false_and_zero(monkeypatch):
    project_id = uuid.uuid4()
    project = _project(
        project_id,
        settings={
            "grouping_mode": "merge_materials",
            "Ex": True,
            "K1i": True,
            "K2i": True,
            "Kiu": True,
            "L_K2i_m": "25",
            "R_gr": "1.25",
        },
    )
    variant = _variant(project_id, name="Mixed settings")
    db = _db_for([variant], [_row(project_id, variant.id)])
    _patch_read_boundaries(monkeypatch, project, _catalog())
    request = SpecificationGenerationRequest.model_validate(
        {
            "variant_ids": [variant.id],
            "options": {"Ex": False, "L_K2i_m": "0"},
        }
    )

    result = await SpecificationPreflightService(db).preflight_variants(
        project_id,
        CurrentPrincipal(role="employee", user_id=project.user_id),
        request,
    )

    assert result[0].resolved_options is None
    diagnostic = next(
        item
        for item in result[0].diagnostics
        if item.code is SpecificationDiagnosticCode.FORMULA_INPUT_INVALID
    )
    assert {issue["field"] for issue in diagnostic.issues} == {"R_gr"}
    assert "Ex" not in {issue["field"] for issue in diagnostic.issues}
    assert "L_K2i_m" not in {issue["field"] for issue in diagnostic.issues}


async def test_catalog_pin_uses_request_then_unique_active_default(monkeypatch):
    project_id = uuid.uuid4()
    project_catalog_id = uuid.uuid4()
    request_catalog_id = uuid.uuid4()
    project = _project(
        project_id,
        settings={
            "catalog_id": str(project_catalog_id),
            "catalog_version": "project-pinned-v1",
            "grouping_mode": "separate_by_object_type",
            "Ex": False,
            "K1i": False,
            "K2i": False,
            "Kiu": False,
            "L_K2i_m": "0",
            "R_gr": "1",
        },
    )
    variant = _variant(project_id, name="Catalog pin")
    db = _db_for([variant], [_row(project_id, variant.id)])
    catalog = _catalog()
    resolve = AsyncMock(return_value=catalog)
    monkeypatch.setattr(ProjectService, "get_project_basic", AsyncMock(return_value=project))
    monkeypatch.setattr(SpecificationCatalogService, "resolve_active", resolve)
    from app.services.specification_selection_service import SpecificationSelectionService

    monkeypatch.setattr(
        SpecificationSelectionService,
        "as_selection_map",
        AsyncMock(return_value={}),
    )

    # Project specification settings are not a generation input.
    await SpecificationPreflightService(db).preflight_variants(
        project_id,
        CurrentPrincipal(role="employee", user_id=project.user_id),
        _request([variant.id]),
    )
    assert resolve.await_args.kwargs["catalog_id"] is None
    assert resolve.await_args.kwargs["catalog_version"] is None

    # Request pin wins over project settings.
    resolve.reset_mock()
    request = SpecificationGenerationRequest.model_validate(
        {
            "variant_ids": [variant.id],
            "options": {
                "catalog_id": str(request_catalog_id),
                "catalog_version": "request-v9",
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
    db2 = _db_for([variant], [_row(project_id, variant.id)])
    await SpecificationPreflightService(db2).preflight_variants(
        project_id,
        CurrentPrincipal(role="employee", user_id=project.user_id),
        request,
    )
    assert str(resolve.await_args.kwargs["catalog_id"]) == str(request_catalog_id)
    assert resolve.await_args.kwargs["catalog_version"] == "request-v9"

    # Empty project settings → unique active default (None/None).
    resolve.reset_mock()
    bare = _project(project_id, settings={})
    monkeypatch.setattr(ProjectService, "get_project_basic", AsyncMock(return_value=bare))
    db3 = _db_for([variant], [_row(project_id, variant.id)])
    await SpecificationPreflightService(db3).preflight_variants(
        project_id,
        CurrentPrincipal(role="employee", user_id=project.user_id),
        _request([variant.id]),
    )
    assert resolve.await_args.kwargs["catalog_id"] is None
    assert resolve.await_args.kwargs["catalog_version"] is None


async def test_conflicting_legacy_object_options_never_supply_generation_options(monkeypatch):
    project_id = uuid.uuid4()
    project = _project(
        project_id,
        settings={
            "grouping_mode": "separate_by_object_type",
            "Ex": False,
            "K1i": False,
            "K2i": True,
            "Kiu": False,
            "L_K2i_m": "0",
            "R_gr": "1.1",
        },
    )
    first = _variant(project_id, name="Legacy yes")
    second = _variant(project_id, name="Legacy no")
    legacy_yes = {
        "explosion_zone_type": "yes",
        "power_indication_on_boxes": "yes",
        "end_of_section_indication": "yes",
        "top_of_box_indication": "yes",
        "min_length_for_k2i": 999,
        "hot_reserve_coefficient": 9,
    }
    legacy_no = {
        "explosion_zone_type": "no",
        "power_indication_on_boxes": "no",
        "end_of_section_indication": "no",
        "top_of_box_indication": "no",
        "min_length_for_k2i": 123,
        "hot_reserve_coefficient": 2,
    }
    db = _db_for(
        [first, second],
        [
            _row(project_id, first.id, object_params=legacy_yes),
            _row(project_id, second.id, object_params=legacy_no),
        ],
    )
    _patch_read_boundaries(monkeypatch, project, _catalog())

    result = await SpecificationPreflightService(db).preflight_variants(
        project_id,
        CurrentPrincipal(role="employee", user_id=project.user_id),
        _request([first.id, second.id], explicit_options=False),
    )

    assert all(item.status is SpecificationPreflightStatus.BLOCKED for item in result)
    assert all(item.resolved_options is None for item in result)


async def test_legacy_object_options_do_not_supply_missing_generation_fields(
    monkeypatch,
):
    project_id = uuid.uuid4()
    project = _project(project_id, settings={})
    variant = _variant(project_id, name="Legacy-only settings")
    db = _db_for(
        [variant],
        [
            _row(
                project_id,
                variant.id,
                object_params={
                    "explosion_zone_type": "yes",
                    "power_indication_on_boxes": "yes",
                    "end_of_section_indication": "yes",
                    "top_of_box_indication": "yes",
                    "min_length_for_k2i": 50,
                    "hot_reserve_coefficient": 1.1,
                },
            )
        ],
    )
    _patch_read_boundaries(monkeypatch, project, _catalog())

    result = await SpecificationPreflightService(db).preflight_variants(
        project_id,
        CurrentPrincipal(role="employee", user_id=project.user_id),
        _request([variant.id], explicit_options=False),
    )

    assert result[0].status is SpecificationPreflightStatus.BLOCKED
    assert result[0].resolved_options is None
    diagnostic = next(
        item
        for item in result[0].diagnostics
        if item.code is SpecificationDiagnosticCode.FORMULA_INPUT_INVALID
    )
    assert {issue["field"] for issue in diagnostic.issues} == {
        "L_K2i_m",
        "R_gr",
    }


async def test_inactive_submitted_selection_requires_selection_without_writing(monkeypatch):
    project_id = uuid.uuid4()
    project = _project(project_id)
    variant = _variant(project_id, name="Selection")
    db = _db_for([variant], [_row(project_id, variant.id)])
    _patch_read_boundaries(monkeypatch, project, _catalog())

    result = await SpecificationPreflightService(db).preflight_variants(
        project_id,
        CurrentPrincipal(role="employee", user_id=project.user_id),
        _request([variant.id], selections={"connection.low": uuid.uuid4()}),
    )

    assert result[0].status is SpecificationPreflightStatus.SELECTION_REQUIRED
    assert result[0].input_fingerprint is None
    assert any(
        item.code is SpecificationDiagnosticCode.ACCESSORY_SELECTION_REQUIRED
        for item in result[0].diagnostics
    )
    db.commit.assert_not_awaited()


async def test_multi_kit_catalog_requires_selection_with_candidate_groups(monkeypatch):
    project_id = uuid.uuid4()
    project = _project(project_id)
    variant = _variant(project_id, name="Multi kit")
    db = _db_for([variant], [_row(project_id, variant.id)])
    _patch_read_boundaries(monkeypatch, project, _catalog(multi_connection=True))

    result = await SpecificationPreflightService(db).preflight_variants(
        project_id,
        CurrentPrincipal(role="employee", user_id=project.user_id),
        _request([variant.id]),
    )

    assert result[0].status is SpecificationPreflightStatus.SELECTION_REQUIRED
    connection = next(
        group for group in result[0].candidate_groups if group.category == "connection_kit"
    )
    assert len(connection.candidates) == 2
    assert connection.selected_catalog_item_id is None


async def test_selection_from_wrong_group_is_rejected(monkeypatch):
    project_id = uuid.uuid4()
    project = _project(project_id)
    variant = _variant(project_id, name="Wrong group")
    catalog = _catalog(multi_connection=True)
    db = _db_for([variant], [_row(project_id, variant.id)])
    _patch_read_boundaries(monkeypatch, project, catalog)

    # Discover group key first.
    first = await SpecificationPreflightService(db).preflight_variants(
        project_id,
        CurrentPrincipal(role="employee", user_id=project.user_id),
        _request([variant.id]),
    )
    connection = next(
        group for group in first[0].candidate_groups if group.category == "connection_kit"
    )
    foreign_item = next(item for item in catalog.items if item.category == "sealant")

    db2 = _db_for([variant], [_row(project_id, variant.id)])
    rejected = await SpecificationPreflightService(db2).preflight_variants(
        project_id,
        CurrentPrincipal(role="employee", user_id=project.user_id),
        _request(
            [variant.id],
            selections={connection.group_key: foreign_item.id},
        ),
    )
    assert rejected[0].status is SpecificationPreflightStatus.SELECTION_REQUIRED
    assert any(
        issue.get("reason") == "catalog_selection_not_in_group"
        for diagnostic in rejected[0].diagnostics
        for issue in diagnostic.issues
    )


async def test_two_er_selections_are_validated_only_in_their_own_scope(monkeypatch):
    project_id = uuid.uuid4()
    project = _project(project_id)
    first = _variant(project_id, name="First")
    second = _variant(project_id, name="Second")
    rows = [_row(project_id, first.id), _row(project_id, second.id)]
    catalog = _catalog(multi_connection=True)
    _patch_read_boundaries(monkeypatch, project, catalog)

    discovery = await SpecificationPreflightService(
        _db_for([first, second], rows)
    ).preflight_variants(
        project_id,
        CurrentPrincipal(role="employee", user_id=project.user_id),
        _request([first.id, second.id]),
    )
    connection_groups = [
        next(group for group in item.candidate_groups if group.category == "connection_kit")
        for item in discovery
    ]
    selections = {
        group.group_key: group.candidates[0].catalog_item_id for group in connection_groups
    }

    resolved = await SpecificationPreflightService(
        _db_for([first, second], rows)
    ).preflight_variants(
        project_id,
        CurrentPrincipal(role="employee", user_id=project.user_id),
        _request([first.id, second.id], selections=selections),
    )

    assert [item.status for item in resolved] == [
        SpecificationPreflightStatus.READY,
        SpecificationPreflightStatus.READY,
    ]
    assert resolved[0].catalog_selections == {
        connection_groups[0].group_key: selections[connection_groups[0].group_key]
    }
    assert resolved[1].catalog_selections == {
        connection_groups[1].group_key: selections[connection_groups[1].group_key]
    }
    assert not any(
        issue.get("reason") == "catalog_selection_stale_group"
        for item in resolved
        for diagnostic in item.diagnostics
        for issue in diagnostic.issues
    )


async def test_missing_or_foreign_variant_is_non_disclosing_and_stops_before_rows(
    monkeypatch,
):
    project_id = uuid.uuid4()
    project = _project(project_id)
    requested_id = uuid.uuid4()
    db = AsyncMock()
    db.execute = AsyncMock(return_value=_scalars_result([]))
    _patch_read_boundaries(monkeypatch, project, _catalog())

    with pytest.raises(SpecificationPreflightServiceError) as exc:
        await SpecificationPreflightService(db).preflight_variants(
            project_id,
            CurrentPrincipal(role="employee", user_id=project.user_id),
            _request([requested_id]),
        )

    assert exc.value.code is SpecificationDiagnosticCode.VARIANT_NOT_FOUND
    assert exc.value.status_code == 404
    assert exc.value.details == {"missing_variant_ids": [str(requested_id)]}
    assert db.execute.await_count == 1
