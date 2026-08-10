"""SPEC-FINAL-08: HTTP production generation flow (seeded catalog, no mocks of BOM path).

Proves many-candidate → PUT selection → generate → GET current → generate without
re-send, plus auto_single, isolation, and catalog-unavailable 503.
"""

from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

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
    SpecificationCatalogSelection,
    SpecificationCatalogVersion,
)
from app.models.user import User
from app.reference_data.specification_catalog_case1_demo import (
    CASE1_DEMO_CATALOG_KEY,
    CASE1_DEMO_SCHEMA_VERSION,
    CASE1_DEMO_VERSION,
    bundled_case1_demo_catalog_document,
)
from app.schemas.specification_catalog import (
    SpecificationCatalogAuthority,
    SpecificationCatalogImportRequest,
    SpecificationCatalogItemInput,
)
from app.services.electrical_catalog_service import ElectricalCatalogService
from app.services.specification_catalog_service import (
    SpecificationCatalogService,
    _canonical_checksum,
)
from app.tests.specification_catalog_fixtures import complete_specification_catalog_items

pytestmark = pytest.mark.asyncio(loop_scope="session")


def _options() -> dict[str, object]:
    return {
        "grouping_mode": "separate_by_object_type",
        "Ex": False,
        "K1i": False,
        "K2i": False,
        "Kiu": False,
        "L_K2i_m": "0",
        "R_gr": "1",
    }


def _calc_result(*, object_version: int = 4, assignment_version: int = 2) -> dict:
    catalogs = {
        kind: {
            "version": f"{kind}-v1",
            "status": "active",
            "source_checksum": f"sha256:{kind}-http-flow",
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


def _catalog_items_multi_connection(
    *,
    multi_connection: bool,
    include_connection_kits: bool = True,
) -> list[SpecificationCatalogItemInput]:
    """Return a complete schema-1 catalog with controlled connection candidates."""
    items: list[SpecificationCatalogItemInput] = []
    for raw in complete_specification_catalog_items():
        category = raw.category.value if hasattr(raw.category, "value") else raw.category
        if category == "connection_kit":
            high_temperature_marks: set[str] = set()
            if include_connection_kits:
                high_temperature_marks = {"КСВ-1", "КСВ-2"} if multi_connection else {"КСВ-2"}
            raw = raw.model_copy(
                update={
                    "applicability": {
                        "temperature_group": (
                            "MEDIUM_HIGH" if raw.mark in high_temperature_marks else "LOW"
                        )
                    }
                }
            )
        items.append(raw)
    return items


async def _import_http_flow_catalog(
    db_session: AsyncSession,
    *,
    multi_connection: bool,
    include_connection_kits: bool,
) -> SpecificationCatalogVersion:
    """Import and activate a complete catalog through the production lifecycle."""
    items = _catalog_items_multi_connection(
        multi_connection=multi_connection,
        include_connection_kits=include_connection_kits,
    )
    version = f"http-flow-{uuid.uuid4().hex[:8]}"
    canonical_items = sorted(
        (item.model_dump(mode="json") for item in items),
        key=lambda item: item["item_key"],
    )
    document = SpecificationCatalogImportRequest(
        catalog_key="builtin-specification",
        version=version,
        authority=SpecificationCatalogAuthority.APPROVED,
        source="integration owner registry http-flow",
        source_checksum=_canonical_checksum(
            {
                "catalog_key": "builtin-specification",
                "version": version,
                "schema_version": CASE1_DEMO_SCHEMA_VERSION,
                "items": canonical_items,
            }
        ),
        schema_version=CASE1_DEMO_SCHEMA_VERSION,
        items=items,
    )
    service = SpecificationCatalogService(db_session)
    draft = await service.import_draft(document, commit=False)
    activated = await service.activate(draft.id, commit=False)
    return activated.catalog


async def _seed_http_ready_project(
    db_session: AsyncSession,
    employee_user: User,
    *,
    name: str,
    multi_connection: bool,
    second_er: bool = False,
    include_connection_kits: bool = True,
) -> tuple[Project, list[ElectricalVariant], ProjectObject, SpecificationCatalogVersion]:
    project = Project(
        id=uuid.uuid4(),
        name=name,
        user_id=employee_user.id,
        specification_settings=_options(),
        specification_settings_version=1,
    )
    ready = ElectricalVariant(
        id=uuid.uuid4(),
        project_id=project.id,
        name="ЭР ready",
        name_normalized="эр ready",
        sort_order=0,
        legacy_variant_number=1,
        is_active=True,
    )
    variants = [ready]
    other: ElectricalVariant | None = None
    if second_er:
        other = ElectricalVariant(
            id=uuid.uuid4(),
            project_id=project.id,
            name="ЭР other",
            name_normalized="эр other",
            sort_order=1,
            legacy_variant_number=2,
            is_active=False,
        )
        variants.append(other)

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

    for variant in variants:
        rows = list(
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
        electrical_variant_id=ready.id,
        cable_type="self_regulating_tt",
        cable_mark="30ТТВ2-СР",
        params={},
        results=_calc_result(),
    )
    await db_session.execute(
        update(SpecificationCatalogVersion)
        .where(SpecificationCatalogVersion.status == "active")
        .values(status="retired")
    )
    catalog = await _import_http_flow_catalog(
        db_session,
        multi_connection=multi_connection,
        include_connection_kits=include_connection_kits,
    )
    db_session.add(calc)
    await db_session.commit()
    return project, variants, obj, catalog


async def test_http_readiness_aggregates_upstream_blockers_per_er_without_generation_write(
    client: AsyncClient,
    db_session: AsyncSession,
    employee_user: User,
    employee_token: str,
) -> None:
    headers = {"Authorization": f"Bearer {employee_token}"}
    project, variants, obj, _catalog = await _seed_http_ready_project(
        db_session,
        employee_user,
        name="HTTP live readiness",
        multi_connection=False,
        second_er=True,
    )
    ready, stale = variants
    stale_assignment = await db_session.scalar(
        select(ElectricalVariantObject).where(
            ElectricalVariantObject.electrical_variant_id == stale.id,
            ElectricalVariantObject.object_id == obj.id,
        )
    )
    assert stale_assignment is not None
    stale_assignment.assignment_state = "stale"
    stale_assignment.diagnostics = {
        "error_code": "ELECTRICAL_RECALCULATION_REQUIRED",
        "stale_reason": "project_section_current_limit_changed",
    }
    await db_session.commit()

    response = await client.get(
        f"/api/v1/specifications/{project.id}/readiness",
        params=[("variant_ids", str(ready.id)), ("variant_ids", str(stale.id))],
        headers=headers,
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["project_id"] == str(project.id)
    assert body["status"] == "blocked"
    assert body["blockers"] == []
    assert [item["electrical_variant_id"] for item in body["results"]] == [
        str(ready.id),
        str(stale.id),
    ]
    assert body["results"][0]["status"] == "ready"
    assert body["results"][0]["blockers"] == []
    blocked = body["results"][1]
    assert blocked["status"] == "blocked"
    assert len(blocked["blockers"]) == 1
    assert blocked["blockers"][0]["source_stage"] == "electrical"
    assert blocked["blockers"][0]["reason"] == "project_section_current_limit_changed"
    assert blocked["blockers"][0]["next_action"] == "open_electrical_variant"
    assert blocked["blockers"][0]["count"] == 1
    assert blocked["blockers"][0]["object_ids"] == [str(obj.id)]

    invalid_generate = await client.post(
        f"/api/v1/specifications/{project.id}/generate",
        json={
            "variant_ids": [str(ready.id)],
            "options": {"Ex": False, "K1i": False, "K2i": False, "Kiu": False},
        },
        headers=headers,
    )
    assert invalid_generate.status_code == 422, invalid_generate.text
    assert {
        issue["field"] for issue in invalid_generate.json()["detail"]["issues"]
    } == {"grouping_mode", "L_K2i_m", "R_gr"}

    persisted = await client.get(
        f"/api/v1/specifications/{project.id}/readiness",
        params=[("variant_ids", str(ready.id)), ("variant_ids", str(stale.id))],
        headers=headers,
    )
    assert persisted.status_code == 200, persisted.text
    assert persisted.json()["blockers"] == []
    assert [item["status"] for item in persisted.json()["results"]] == ["ready", "blocked"]

    # Readiness is strictly read-only and must not create generation outcome rows.
    assert (
        await db_session.scalar(select(Specification).where(Specification.project_id == project.id))
        is None
    )


async def test_http_real_electrical_recalculation_unlocks_specification_generation(
    client: AsyncClient,
    db_session: AsyncSession,
    admin_user: User,
    employee_token: str,
) -> None:
    """A successful public ER batch must immediately satisfy specification preflight."""
    headers = {"Authorization": f"Bearer {employee_token}"}
    await ElectricalCatalogService(db_session).ensure_bundled_catalogs_active(
        CurrentPrincipal(
            role="admin",
            user_id=admin_user.id,
            email=admin_user.email,
        ),
        commit=True,
    )
    project_response = await client.post(
        "/api/v1/projects",
        json={"name": "HTTP real ER to specification"},
        headers=headers,
    )
    assert project_response.status_code == 201, project_response.text
    project = project_response.json()
    object_response = await client.post(
        f"/api/v1/projects/{project['id']}/objects",
        headers=headers,
        json={
            "object_type": "pipe",
            "params": {
                "name": "Трубопровод для спецификации",
                "outer_diameter": 0.108,
                "wall_thickness": 0.004,
                "pipe_material": "carbon_steel",
                "insulation_layers": [{"thickness": 0.05, "material": "mineral_wool_boards_120"}],
                "insulation_temperature_basis": "outdoor_winter",
                "ambient_temperature": -30.0,
                "min_switch_temperature": -30.0,
                "process_temperature": 80.0,
                "pipe_length": 50.0,
                "placement": "outdoor",
                "wind_speed": 0.0,
            },
        },
    )
    assert object_response.status_code == 201, object_response.text
    obj = object_response.json()
    assert obj["is_valid"] is True

    settings_response = await client.patch(
        f"/api/v1/projects/{project['id']}/electrical-settings",
        headers=headers,
        json={"expected_version": 1, "max_section_start_current_a": "13.065"},
    )
    assert settings_response.status_code == 200, settings_response.text

    initialize_response = await client.post(
        f"/api/v1/projects/{project['id']}/electrical-variants/initialize",
        headers=headers,
    )
    assert initialize_response.status_code == 200, initialize_response.text
    variant = initialize_response.json()["variant"]
    assignments_response = await client.get(
        f"/api/v1/projects/{project['id']}/electrical-variants/" f"{variant['id']}/assignments",
        headers=headers,
    )
    assert assignments_response.status_code == 200, assignments_response.text
    assignment = next(
        item for item in assignments_response.json()["items"] if item["object_id"] == obj["id"]
    )
    assign_response = await client.patch(
        f"/api/v1/projects/{project['id']}/electrical-variants/" f"{variant['id']}/assignments",
        headers=headers,
        json={
            "system_type": "self_regulating",
            "items": [{"object_id": obj["id"], "expected_version": assignment["version"]}],
        },
    )
    assert assign_response.status_code == 200, assign_response.text

    await db_session.execute(
        update(SpecificationCatalogVersion)
        .where(SpecificationCatalogVersion.status == "active")
        .values(status="retired")
    )
    await _import_http_flow_catalog(
        db_session,
        multi_connection=False,
        include_connection_kits=True,
    )
    await db_session.commit()

    batch_response = await client.post(
        "/api/v1/calc/electrical/batch",
        headers=headers,
        params={
            "project_id": project["id"],
            "variant_number": 1,
            "electrical_variant_id": variant["id"],
        },
    )
    assert batch_response.status_code == 200, batch_response.text
    assert batch_response.json()["calculated"] == 1, batch_response.text

    readiness_response = await client.get(
        f"/api/v1/specifications/{project['id']}/readiness",
        headers=headers,
        params={"variant_ids": variant["id"]},
    )
    assert readiness_response.status_code == 200, readiness_response.text
    readiness = readiness_response.json()["results"][0]
    calculation = await db_session.scalar(
        select(ElectricalCalculation).where(
            ElectricalCalculation.project_id == uuid.UUID(project["id"]),
            ElectricalCalculation.object_id == uuid.UUID(obj["id"]),
        )
    )
    assert calculation is not None
    assert calculation.results.get("mocked_fields") == [], calculation.results.get("mocked_fields")
    assert calculation.results["provenance"].get("mocked_fields") == [], calculation.results[
        "provenance"
    ]
    assert calculation.results.get("production_eligible") is True, calculation.results
    assert (
        calculation.results["provenance"].get("production_eligible") is True
    ), calculation.results["provenance"]
    assert readiness["status"] == "ready", {
        "readiness": readiness,
        "result": calculation.results,
    }
    assert readiness["blockers"] == []

    generation_response = await client.post(
        f"/api/v1/specifications/{project['id']}/generate",
        headers=headers,
        json={
            "variant_ids": [variant["id"]],
            "options": _options(),
            "exclude_unassigned_confirmed": False,
            "catalog_selections": {},
        },
    )
    assert generation_response.status_code == 201, generation_response.text
    assert generation_response.json()["results"][0]["status"] == "generated"


async def test_http_many_candidates_put_generate_get_reload_without_resend(
    client: AsyncClient,
    db_session: AsyncSession,
    employee_user: User,
    employee_token: str,
) -> None:
    headers = {"Authorization": f"Bearer {employee_token}"}
    project, variants, _obj, catalog = await _seed_http_ready_project(
        db_session,
        employee_user,
        name="HTTP many-candidate flow",
        multi_connection=True,
        second_er=True,
    )
    ready, other = variants[0], variants[1]
    options = _options()

    # 1) First generate → selection_required with N>1 connection candidates.
    first = await client.post(
        f"/api/v1/specifications/{project.id}/generate",
        json={
            "variant_ids": [str(ready.id)],
            "options": options,
            "exclude_unassigned_confirmed": False,
            "catalog_selections": {},
        },
        headers=headers,
    )
    # Fail-closed multi-candidate: HTTP maps selection_required to 409 Conflict
    # (not 422) when generation cannot complete without an explicit choice.
    assert first.status_code == 409, first.text
    body = first.json()
    assert body["project_id"] == str(project.id)
    result = body["results"][0]
    assert result["status"] == "selection_required"
    assert result["electrical_variant_id"] == str(ready.id)
    connection_groups = [
        group for group in result["candidate_groups"] if group["category"] == "connection_kit"
    ]
    assert len(connection_groups) == 1
    group = connection_groups[0]
    assert group["selection_source"] == "none"
    assert len(group["candidates"]) >= 2
    chosen = group["candidates"][0]
    assert group["candidate_set_fingerprint"].startswith("sha256:")

    # 1b) F5/GET restores last generation status without re-calling generate.
    after_required = await client.get(
        f"/api/v1/specifications/{project.id}/variants/{ready.id}",
        headers=headers,
    )
    assert after_required.status_code == 200, after_required.text
    status_body = after_required.json()
    assert status_body is not None
    assert status_body["generation_status"] == "selection_required"
    assert status_body["items"] == []
    assert status_body["generation_at"] is not None
    assert any(
        g["category"] == "connection_kit" and len(g["candidates"]) >= 2
        for g in status_body["generation_candidate_groups"]
    )
    assert status_body["generation_diagnostics"]

    # 2) PUT explicit selection.
    get_sel = await client.get(
        f"/api/v1/specifications/{project.id}/variants/{ready.id}/catalog-selections",
        headers=headers,
    )
    assert get_sel.status_code == 200, get_sel.text
    version = get_sel.json()["collection_version"]
    put = await client.put(
        f"/api/v1/specifications/{project.id}/variants/{ready.id}/catalog-selections",
        json={
            "expected_version": version,
            "selections": [
                {
                    "candidate_group_key": group["group_key"],
                    "catalog_version_id": chosen["catalog_id"],
                    "catalog_item_id": chosen["catalog_item_id"],
                    "candidate_set_fingerprint": group["candidate_set_fingerprint"],
                }
            ],
        },
        headers=headers,
    )
    assert put.status_code == 200, put.text
    put_body = put.json()
    # Empty collection defaults to version 1; first write also stores version 1.
    # Only subsequent replaces (when selections already exist) bump the version.
    assert put_body["collection_version"] == 1
    assert version in {0, 1}
    assert len(put_body["selections"]) == 1

    # 3) Generate again without catalog_selections → generated.
    second = await client.post(
        f"/api/v1/specifications/{project.id}/generate",
        json={
            "variant_ids": [str(ready.id)],
            "options": options,
            "exclude_unassigned_confirmed": False,
            "catalog_selections": {},
        },
        headers=headers,
    )
    assert second.status_code == 201, second.text
    gen = second.json()["results"][0]
    assert gen["status"] == "generated"
    assert gen["items"]
    assert any(item["source"] == "auto" for item in gen["items"])
    snapshot = gen["snapshot"]
    assert snapshot is not None
    assert "catalog_selections" in snapshot
    conn_snap = snapshot["catalog_selections"][group["group_key"]]
    assert conn_snap["selection_source"] == "explicit"
    assert conn_snap["catalog_item_id"] == chosen["catalog_item_id"]

    # 4) GET by UUID returns current non-stale rows + generated status.
    got = await client.get(
        f"/api/v1/specifications/{project.id}/variants/{ready.id}",
        headers=headers,
    )
    assert got.status_code == 200, got.text
    spec = got.json()
    assert spec["electrical_variant_id"] == str(ready.id)
    assert spec["is_stale"] is False
    assert len(spec["items"]) >= 1
    assert spec["generation_status"] == "generated"
    assert spec["generation_diagnostics"] == []

    # 5) Third generate without selections remains deterministic generated.
    third = await client.post(
        f"/api/v1/specifications/{project.id}/generate",
        json={
            "variant_ids": [str(ready.id)],
            "options": options,
            "catalog_selections": {},
        },
        headers=headers,
    )
    assert third.status_code == 201, third.text
    assert third.json()["results"][0]["status"] == "generated"

    # 6) Other ER still has no specification row.
    other_get = await client.get(
        f"/api/v1/specifications/{project.id}/variants/{other.id}",
        headers=headers,
    )
    assert other_get.status_code == 200
    assert other_get.json() is None
    other_rows = list(
        (
            await db_session.execute(
                select(Specification).where(
                    Specification.project_id == project.id,
                    Specification.electrical_variant_id == other.id,
                )
            )
        )
        .scalars()
        .all()
    )
    assert other_rows == []

    # Stored selection still present for ready ER.
    stored = list(
        (
            await db_session.execute(
                select(SpecificationCatalogSelection).where(
                    SpecificationCatalogSelection.project_id == project.id,
                    SpecificationCatalogSelection.electrical_variant_id == ready.id,
                )
            )
        )
        .scalars()
        .all()
    )
    assert len(stored) == 1
    assert str(stored[0].catalog_item_id) == chosen["catalog_item_id"]
    assert stored[0].catalog_version_id == catalog.id


async def test_http_single_candidate_auto_selects_without_selection_row(
    client: AsyncClient,
    db_session: AsyncSession,
    employee_user: User,
    employee_token: str,
) -> None:
    headers = {"Authorization": f"Bearer {employee_token}"}
    project, variants, _obj, _catalog = await _seed_http_ready_project(
        db_session,
        employee_user,
        name="HTTP auto_single flow",
        multi_connection=False,
    )
    ready = variants[0]

    response = await client.post(
        f"/api/v1/specifications/{project.id}/generate",
        json={
            "variant_ids": [str(ready.id)],
            "options": _options(),
            "catalog_selections": {},
        },
        headers=headers,
    )
    assert response.status_code == 201, response.text
    result = response.json()["results"][0]
    assert result["status"] == "generated"
    connection_groups = [
        group for group in result["candidate_groups"] if group["category"] == "connection_kit"
    ]
    assert len(connection_groups) == 1
    group = connection_groups[0]
    assert group["selection_source"] == "auto_single"
    assert group["selected_catalog_item_id"] is not None
    assert len(group["candidates"]) == 1
    snap = result["snapshot"]["catalog_selections"][group["group_key"]]
    assert snap["selection_source"] == "auto_single"
    assert snap["catalog_item_id"] == group["selected_catalog_item_id"]

    stored = list(
        (
            await db_session.execute(
                select(SpecificationCatalogSelection).where(
                    SpecificationCatalogSelection.project_id == project.id,
                    SpecificationCatalogSelection.electrical_variant_id == ready.id,
                )
            )
        )
        .scalars()
        .all()
    )
    # auto_single is derived — no explicit persistence row required.
    assert stored == []


async def test_http_foreign_selection_uuid_rejected_with_stable_status(
    client: AsyncClient,
    db_session: AsyncSession,
    employee_user: User,
    employee_token: str,
) -> None:
    headers = {"Authorization": f"Bearer {employee_token}"}
    project, variants, _obj, catalog = await _seed_http_ready_project(
        db_session,
        employee_user,
        name="HTTP foreign selection",
        multi_connection=True,
    )
    ready = variants[0]
    first = await client.post(
        f"/api/v1/specifications/{project.id}/generate",
        json={
            "variant_ids": [str(ready.id)],
            "options": _options(),
            "catalog_selections": {},
        },
        headers=headers,
    )
    assert first.status_code == 409, first.text
    group = next(
        g
        for g in first.json()["results"][0]["candidate_groups"]
        if g["category"] == "connection_kit"
    )
    foreign_item = uuid.uuid4()
    put = await client.put(
        f"/api/v1/specifications/{project.id}/variants/{ready.id}/catalog-selections",
        json={
            "expected_version": 1,
            "selections": [
                {
                    "candidate_group_key": group["group_key"],
                    "catalog_version_id": str(catalog.id),
                    "catalog_item_id": str(foreign_item),
                    "candidate_set_fingerprint": group["candidate_set_fingerprint"],
                }
            ],
        },
        headers=headers,
    )
    assert put.status_code == 422, put.text
    assert put.json()["detail"]["code"] == "SPEC_REQUEST_INVALID"


async def test_http_report_specification_states_absent_current_stale(
    client: AsyncClient,
    db_session: AsyncSession,
    employee_user: User,
    employee_token: str,
) -> None:
    headers = {"Authorization": f"Bearer {employee_token}"}
    project, variants, _obj, _catalog = await _seed_http_ready_project(
        db_session,
        employee_user,
        name="HTTP report states",
        multi_connection=False,
    )
    ready = variants[0]

    # absent
    preview_absent = await client.get(
        f"/api/v1/reports/{project.id}/preview",
        params={
            "sections": "specification",
            "electrical_variant_id": str(ready.id),
        },
        headers=headers,
    )
    # Report API may return html; exercise generate first for current/stale.
    gen = await client.post(
        f"/api/v1/specifications/{project.id}/generate",
        json={
            "variant_ids": [str(ready.id)],
            "options": _options(),
            "catalog_selections": {},
        },
        headers=headers,
    )
    assert gen.status_code == 201, gen.text

    got = await client.get(
        f"/api/v1/specifications/{project.id}/variants/{ready.id}",
        headers=headers,
    )
    assert got.json()["is_stale"] is False

    # Force stale
    spec = (
        await db_session.execute(
            select(Specification).where(
                Specification.project_id == project.id,
                Specification.electrical_variant_id == ready.id,
            )
        )
    ).scalar_one()
    spec.is_stale = True
    spec.stale_reason = "object_updated"
    await db_session.commit()

    stale_get = await client.get(
        f"/api/v1/specifications/{project.id}/variants/{ready.id}",
        headers=headers,
    )
    assert stale_get.json()["is_stale"] is True
    assert stale_get.json()["stale_reason"] == "object_updated"

    # HTML report should not leak phantom keys; status may still render.
    preview = await client.get(
        f"/api/v1/reports/{project.id}/preview",
        params={
            "sections": "specification",
            "electrical_variant_id": str(ready.id),
        },
        headers=headers,
    )
    assert preview.status_code == 200, preview.text
    html = preview.json().get("html") or preview.text
    assert "is_partial" not in html
    assert "excluded_groups" not in html
    # unused variable silence for optional absent preview
    _ = preview_absent


async def test_case1_demo_catalog_bootstrap_is_idempotent(
    db_session: AsyncSession,
    employee_user: User,
) -> None:
    from app.core.dependencies import CurrentPrincipal

    principal = CurrentPrincipal(
        role="admin",
        user_id=employee_user.id,
        email=employee_user.email,
    )
    # Retire any active so the demo catalog can activate.
    await db_session.execute(
        update(SpecificationCatalogVersion)
        .where(SpecificationCatalogVersion.status == "active")
        .values(status="retired")
    )
    await db_session.commit()

    svc = SpecificationCatalogService(db_session)
    first = await svc.ensure_case1_demo_catalog_active(principal, commit=True)
    second = await svc.ensure_case1_demo_catalog_active(principal, commit=True)
    assert first.id == second.id
    assert first.version == CASE1_DEMO_VERSION
    assert first.catalog_key == CASE1_DEMO_CATALOG_KEY
    assert first.status == "active"
    doc = bundled_case1_demo_catalog_document()
    assert doc.version == CASE1_DEMO_VERSION
    count = await db_session.scalar(
        select(SpecificationCatalogVersion).where(
            SpecificationCatalogVersion.catalog_key == CASE1_DEMO_CATALOG_KEY,
            SpecificationCatalogVersion.version == CASE1_DEMO_VERSION,
        )
    )
    assert count is not None


async def test_http_case1_demo_catalog_generates_pipe_bom_without_ex_rgr_matrix_error(
    client: AsyncClient,
    db_session: AsyncSession,
    employee_user: User,
    employee_token: str,
) -> None:
    """The bundled schema-1 Case 1 demo reaches a persisted pipe BOM."""
    from app.core.dependencies import CurrentPrincipal

    headers = {"Authorization": f"Bearer {employee_token}"}
    project, variants, _obj, http_flow_catalog = await _seed_http_ready_project(
        db_session,
        employee_user,
        name="HTTP Case 1 demo catalog pipe",
        multi_connection=True,
    )
    ready = variants[0]
    http_flow_catalog.status = "retired"
    await db_session.commit()
    demo = await SpecificationCatalogService(db_session).ensure_case1_demo_catalog_active(
        CurrentPrincipal(
            role="admin",
            user_id=employee_user.id,
            email=employee_user.email,
        ),
        commit=True,
    )

    first = await client.post(
        f"/api/v1/specifications/{project.id}/generate",
        json={
            "variant_ids": [str(ready.id)],
            "options": _options(),
            "catalog_selections": {},
        },
        headers=headers,
    )
    assert first.status_code == 409, first.text
    pending = first.json()["results"][0]
    group = next(
        item
        for item in pending["candidate_groups"]
        if item["category"] == "connection_kit" and len(item["candidates"]) > 1
    )
    selected = group["candidates"][0]

    collection = await client.get(
        f"/api/v1/specifications/{project.id}/variants/{ready.id}/catalog-selections",
        headers=headers,
    )
    assert collection.status_code == 200, collection.text
    put = await client.put(
        f"/api/v1/specifications/{project.id}/variants/{ready.id}/catalog-selections",
        json={
            "expected_version": collection.json()["collection_version"],
            "selections": [
                {
                    "candidate_group_key": group["group_key"],
                    "catalog_version_id": selected["catalog_id"],
                    "catalog_item_id": selected["catalog_item_id"],
                    "candidate_set_fingerprint": group["candidate_set_fingerprint"],
                }
            ],
        },
        headers=headers,
    )
    assert put.status_code == 200, put.text

    generated = await client.post(
        f"/api/v1/specifications/{project.id}/generate",
        json={
            "variant_ids": [str(ready.id)],
            "options": _options(),
            "catalog_selections": {},
        },
        headers=headers,
    )
    assert generated.status_code == 201, generated.text
    result = generated.json()["results"][0]
    assert result["status"] == "generated"
    assert result["items"]
    assert all(
        diagnostic["code"] != "SPEC_BOX_EX_RGR_MATRIX_MISSING"
        for diagnostic in result["diagnostics"]
    )
    assert any(item["article"].startswith("DEMO-") for item in result["items"]), result["items"]
    snapshot = result["snapshot"]
    assert snapshot["catalog"] == {
        "id": str(demo.id),
        "catalog_key": CASE1_DEMO_CATALOG_KEY,
        "version": CASE1_DEMO_VERSION,
        "source_checksum": demo.source_checksum,
        "payload_checksum": demo.payload_checksum,
        "schema_version": CASE1_DEMO_SCHEMA_VERSION,
    }
    assert snapshot["normalized_inputs"]["resolved_options"]["Ex"] is False
    assert snapshot["normalized_inputs"]["resolved_options"]["R_gr"] == "1"
    assert snapshot["resolved_options"] == {
        **_options(),
        "catalog_id": str(demo.id),
        "catalog_version": CASE1_DEMO_VERSION,
    }

    # A separate GET reads the committed DB outcome; it does not depend on the
    # mutation response or frontend/process memory.
    persisted_response = await client.get(
        f"/api/v1/specifications/{project.id}/variants/{ready.id}",
        headers=headers,
    )
    assert persisted_response.status_code == 200, persisted_response.text
    persisted = persisted_response.json()
    assert persisted["items"] == result["items"]
    assert persisted["snapshot"] == snapshot
    assert persisted["generation_status"] == "generated"
    assert persisted["generation_at"] is not None

    project_id = project.id
    ready_id = ready.id
    session_factory = async_sessionmaker(db_session.bind, expire_on_commit=False)
    async with session_factory() as fresh_session:
        stored = await fresh_session.scalar(
            select(Specification).where(
                Specification.project_id == project_id,
                Specification.electrical_variant_id == ready_id,
            )
        )
        assert stored is not None
        assert stored.items == result["items"]
        assert stored.snapshot == snapshot


async def test_http_zero_connection_candidates_blocks_without_bom_write(
    client: AsyncClient,
    db_session: AsyncSession,
    employee_user: User,
    employee_token: str,
) -> None:
    """No matching catalog item → blocked, outcome row only, no BOM items."""
    headers = {"Authorization": f"Bearer {employee_token}"}
    project, variants, _obj, _catalog = await _seed_http_ready_project(
        db_session,
        employee_user,
        name="HTTP zero candidates",
        multi_connection=False,
        include_connection_kits=False,
    )
    ready = variants[0]

    response = await client.post(
        f"/api/v1/specifications/{project.id}/generate",
        json={
            "variant_ids": [str(ready.id)],
            "options": _options(),
            "catalog_selections": {},
        },
        headers=headers,
    )
    assert response.status_code == 422, response.text
    result = response.json()["results"][0]
    assert result["status"] == "blocked"
    assert result["items"] == []
    assert any(d["code"] == "SPEC_ACCESSORY_CATALOG_ITEM_MISSING" for d in result["diagnostics"])

    got = await client.get(
        f"/api/v1/specifications/{project.id}/variants/{ready.id}",
        headers=headers,
    )
    assert got.status_code == 200, got.text
    body = got.json()
    assert body is not None
    assert body["generation_status"] == "blocked"
    assert body["items"] == []
    assert any(
        d["code"] == "SPEC_ACCESSORY_CATALOG_ITEM_MISSING" for d in body["generation_diagnostics"]
    )


async def test_http_stale_selection_fingerprint_requires_choice_again(
    client: AsyncClient,
    db_session: AsyncSession,
    employee_user: User,
    employee_token: str,
) -> None:
    """Persisted selection with mismatched fingerprint is ignored → selection_required."""
    headers = {"Authorization": f"Bearer {employee_token}"}
    project, variants, _obj, _catalog = await _seed_http_ready_project(
        db_session,
        employee_user,
        name="HTTP stale fingerprint",
        multi_connection=True,
    )
    ready = variants[0]
    options = _options()

    first = await client.post(
        f"/api/v1/specifications/{project.id}/generate",
        json={
            "variant_ids": [str(ready.id)],
            "options": options,
            "catalog_selections": {},
        },
        headers=headers,
    )
    assert first.status_code == 409, first.text
    group = next(
        g
        for g in first.json()["results"][0]["candidate_groups"]
        if g["category"] == "connection_kit"
    )
    chosen = group["candidates"][0]

    get_sel = await client.get(
        f"/api/v1/specifications/{project.id}/variants/{ready.id}/catalog-selections",
        headers=headers,
    )
    put = await client.put(
        f"/api/v1/specifications/{project.id}/variants/{ready.id}/catalog-selections",
        json={
            "expected_version": get_sel.json()["collection_version"],
            "selections": [
                {
                    "candidate_group_key": group["group_key"],
                    "catalog_version_id": chosen["catalog_id"],
                    "catalog_item_id": chosen["catalog_item_id"],
                    "candidate_set_fingerprint": group["candidate_set_fingerprint"],
                }
            ],
        },
        headers=headers,
    )
    assert put.status_code == 200, put.text

    # Corrupt stored fingerprint so server drop-filters the choice.
    stored = (
        await db_session.execute(
            select(SpecificationCatalogSelection).where(
                SpecificationCatalogSelection.project_id == project.id,
                SpecificationCatalogSelection.electrical_variant_id == ready.id,
            )
        )
    ).scalar_one()
    stored.candidate_set_fingerprint = f"sha256:{'0' * 64}"
    await db_session.commit()

    second = await client.post(
        f"/api/v1/specifications/{project.id}/generate",
        json={
            "variant_ids": [str(ready.id)],
            "options": options,
            "catalog_selections": {},
        },
        headers=headers,
    )
    assert second.status_code == 409, second.text
    again = second.json()["results"][0]
    assert again["status"] == "selection_required"
    assert again["items"] == []
    conn = next(g for g in again["candidate_groups"] if g["category"] == "connection_kit")
    assert conn["selection_source"] == "none"
    assert len(conn["candidates"]) >= 2


async def test_http_no_active_catalog_is_typed_503_without_spec_write(
    client: AsyncClient,
    db_session: AsyncSession,
    employee_user: User,
    employee_token: str,
) -> None:
    """Retire active catalog → generate fails closed with 503 envelope."""
    headers = {"Authorization": f"Bearer {employee_token}"}
    project, variants, _obj, catalog = await _seed_http_ready_project(
        db_session,
        employee_user,
        name="HTTP catalog unavailable",
        multi_connection=False,
    )
    ready = variants[0]

    await db_session.execute(
        update(SpecificationCatalogVersion)
        .where(SpecificationCatalogVersion.id == catalog.id)
        .values(status="retired")
    )
    await db_session.commit()

    response = await client.post(
        f"/api/v1/specifications/{project.id}/generate",
        json={
            "variant_ids": [str(ready.id)],
            "options": _options(),
            "catalog_selections": {},
        },
        headers=headers,
    )
    assert response.status_code == 503, response.text
    detail = response.json()["detail"]
    assert detail["code"] == "SPEC_CATALOG_UNAVAILABLE"

    got = await client.get(
        f"/api/v1/specifications/{project.id}/variants/{ready.id}",
        headers=headers,
    )
    assert got.status_code == 200
    # 503 raises before per-ER outcome persist when all ERs hit catalog gap.
    assert got.json() is None
