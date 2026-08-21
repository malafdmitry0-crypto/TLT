"""SQLAlchemy boundary for project CSV import/export."""

from __future__ import annotations

from collections import defaultdict
from datetime import UTC, datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.electrical_calculation import ElectricalCalculation
from app.models.electrical_variant import ElectricalVariant, ElectricalVariantObject
from app.models.project import Project
from app.models.project_electrical_settings import ProjectElectricalSettings
from app.models.project_object import ProjectObject
from app.models.specification import (
    Specification,
    SpecificationCatalogItem,
    SpecificationCatalogSelection,
)
from app.services.project_display_settings_service import strip_retired_heatcalc_columns
from app.services.project_io.contracts import (
    SECTIONS_NOT_READY_CODE,
    VALID_CABLE_MARK_SOURCES,
    VALID_CABLE_TYPE_SOURCES,
    ProjectExportGraph,
    ProjectImportError,
    ProjectImportPayload,
)
from app.services.project_io.validation import (
    normalize_object_type,
    normalize_source,
    parse_json_or_empty,
    resolve_specification_identity,
    validate_specification_section,
)


async def load_project_graph(db: AsyncSession, project: Project) -> ProjectExportGraph:
    objects = list(
        (
            await db.execute(
                select(ProjectObject)
                .where(ProjectObject.project_id == project.id)
                .order_by(ProjectObject.sort_order)
            )
        ).scalars()
    )
    electrical = list(
        (
            await db.execute(
                select(ElectricalCalculation).where(ElectricalCalculation.project_id == project.id)
            )
        ).scalars()
    )
    specifications = list(
        (
            await db.execute(select(Specification).where(Specification.project_id == project.id))
        ).scalars()
    )
    variants = list(
        (
            await db.execute(
                select(ElectricalVariant)
                .where(ElectricalVariant.project_id == project.id)
                .order_by(ElectricalVariant.sort_order, ElectricalVariant.id)
            )
        ).scalars()
    )
    assignments = list(
        (
            await db.execute(
                select(ElectricalVariantObject).where(
                    ElectricalVariantObject.project_id == project.id
                )
            )
        ).scalars()
    )
    electrical_settings = await db.get(ProjectElectricalSettings, project.id)
    catalog_selections = list(
        (
            await db.execute(
                select(SpecificationCatalogSelection)
                .where(SpecificationCatalogSelection.project_id == project.id)
                .order_by(
                    SpecificationCatalogSelection.electrical_variant_id,
                    SpecificationCatalogSelection.candidate_group_key,
                )
            )
        ).scalars()
    )
    return ProjectExportGraph(
        project=project,
        objects=objects,
        electrical=electrical,
        specifications=specifications,
        variants=variants,
        assignments=assignments,
        electrical_settings=electrical_settings,
        catalog_selections=catalog_selections,
    )


async def load_bulk_project_graphs(
    db: AsyncSession, project_ids: list[UUID], projects_by_id: dict[UUID, Project]
) -> dict[UUID, ProjectExportGraph]:
    graphs = {
        project_id: ProjectExportGraph(project=projects_by_id[project_id])
        for project_id in project_ids
        if project_id in projects_by_id
    }
    if not project_ids:
        return graphs

    queries = (
        (
            "objects",
            select(ProjectObject)
            .where(ProjectObject.project_id.in_(project_ids))
            .order_by(ProjectObject.project_id, ProjectObject.sort_order, ProjectObject.id),
        ),
        (
            "electrical",
            select(ElectricalCalculation)
            .where(ElectricalCalculation.project_id.in_(project_ids))
            .order_by(
                ElectricalCalculation.project_id,
                ElectricalCalculation.object_id,
                ElectricalCalculation.electrical_variant_id,
            ),
        ),
        (
            "specifications",
            select(Specification)
            .where(Specification.project_id.in_(project_ids))
            .order_by(Specification.project_id, Specification.electrical_variant_id),
        ),
        (
            "variants",
            select(ElectricalVariant)
            .where(ElectricalVariant.project_id.in_(project_ids))
            .order_by(
                ElectricalVariant.project_id,
                ElectricalVariant.sort_order,
                ElectricalVariant.id,
            ),
        ),
        (
            "assignments",
            select(ElectricalVariantObject).where(
                ElectricalVariantObject.project_id.in_(project_ids)
            ),
        ),
        (
            "catalog_selections",
            select(SpecificationCatalogSelection)
            .where(SpecificationCatalogSelection.project_id.in_(project_ids))
            .order_by(
                SpecificationCatalogSelection.project_id,
                SpecificationCatalogSelection.electrical_variant_id,
                SpecificationCatalogSelection.candidate_group_key,
            ),
        ),
    )
    for attribute, query in queries:
        result = await db.execute(query)
        grouped: dict[UUID, list[object]] = defaultdict(list)
        for item in result.scalars():
            grouped[item.project_id].append(item)
        for project_id, values in grouped.items():
            setattr(graphs[project_id], attribute, values)

    settings_result = await db.execute(
        select(ProjectElectricalSettings).where(
            ProjectElectricalSettings.project_id.in_(project_ids)
        )
    )
    for settings in settings_result.scalars():
        graphs[settings.project_id].electrical_settings = settings
    return graphs


def apply_project_settings(project: Project, payload: ProjectImportPayload) -> None:
    if (
        payload.specification_settings_raw is not None
        and payload.specification_settings_raw.strip()
    ):
        project.specification_settings = parse_json_or_empty(payload.specification_settings_raw, {})
    if (
        payload.specification_settings_version_raw is not None
        and payload.specification_settings_version_raw.strip()
    ):
        project.specification_settings_version = max(
            int(payload.specification_settings_version_raw), 1
        )
    if payload.display_settings_raw is not None and payload.display_settings_raw.strip():
        project.display_settings = strip_retired_heatcalc_columns(
            parse_json_or_empty(payload.display_settings_raw, {})
        )
    if (
        payload.display_settings_version_raw is not None
        and payload.display_settings_version_raw.strip()
    ):
        project.display_settings_version = max(int(payload.display_settings_version_raw), 0)


async def persist_project_payload(
    db: AsyncSession, project: Project, payload: ProjectImportPayload
) -> None:
    object_by_key = await _persist_objects(db, project, payload)
    variants_by_key = await _persist_variants(db, project, payload)
    _persist_electrical_settings(db, project, payload)
    await _persist_assignments(db, project, payload, object_by_key, variants_by_key)
    _persist_electrical(db, project, payload, object_by_key, variants_by_key)
    _persist_specifications(db, project, payload, variants_by_key)
    await _persist_catalog_selections(db, project, payload, variants_by_key)


async def _persist_objects(
    db: AsyncSession, project: Project, payload: ProjectImportPayload
) -> dict[str, ProjectObject]:
    objects: dict[str, ProjectObject] = {}
    for index, row in enumerate(payload.objects):
        params = parse_json_or_empty(row.get("params", ""), {})
        if row.get("name") and "name" not in params:
            params["name"] = row["name"]
        object_key = (row.get("object_key") or "").strip()
        obj = ProjectObject(
            project_id=project.id,
            object_type=normalize_object_type(row.get("type", "")),
            sort_order=int(row.get("sort_order", index) or index),
            params=params,
            results=parse_json_or_empty(row.get("results", ""), None),
            is_valid=(row.get("is_valid", "").strip().lower() == "true"),
            validation_errors=parse_json_or_empty(row.get("validation_errors", ""), None),
        )
        db.add(obj)
        objects[object_key] = obj
    await db.flush()
    return objects


async def _persist_variants(
    db: AsyncSession, project: Project, payload: ProjectImportPayload
) -> dict[str, ElectricalVariant]:
    variants: dict[str, ElectricalVariant] = {}
    pending_copies: list[tuple[ElectricalVariant, str]] = []
    active_count = 0
    for index, row in enumerate(payload.variants):
        key = (row.get("variant_key") or "").strip()
        name = (row.get("name") or "").strip() or f"ЭР{index + 1}"
        is_active = (row.get("is_active") or "").strip().lower() == "true"
        active_count += is_active
        variant = ElectricalVariant(
            project_id=project.id,
            name=name,
            name_normalized=name.casefold(),
            sort_order=int((row.get("sort_order") or index) or index),
            is_active=is_active,
        )
        db.add(variant)
        variants[key] = variant
        copied_from_key = (row.get("copied_from_key") or "").strip()
        if copied_from_key:
            pending_copies.append((variant, copied_from_key))
    if variants and active_count == 0:
        first = min(variants.values(), key=lambda item: (item.sort_order, item.name))
        first.is_active = True
    if variants:
        project.electrical_initialized_at = datetime.now(UTC)
    await db.flush()
    for variant, copied_from_key in pending_copies:
        variant.copied_from_id = variants[copied_from_key].id
    if pending_copies:
        await db.flush()
    return variants


def _persist_electrical_settings(
    db: AsyncSession, project: Project, payload: ProjectImportPayload
) -> None:
    if not payload.electrical_settings:
        return
    row = payload.electrical_settings[0]
    current_raw = (row.get("max_section_start_current_a") or "").strip()
    version_raw = (row.get("version") or "").strip()
    db.add(
        ProjectElectricalSettings(
            project_id=project.id,
            max_section_start_current_a=(
                Decimal(current_raw.replace(",", ".")) if current_raw else None
            ),
            version=max(int(version_raw), 1) if version_raw else 1,
        )
    )


async def _persist_assignments(
    db: AsyncSession,
    project: Project,
    payload: ProjectImportPayload,
    objects: dict[str, ProjectObject],
    variants: dict[str, ElectricalVariant],
) -> None:
    if payload.assignments:
        for row in payload.assignments:
            variant = variants[(row.get("variant_key") or "").strip()]
            obj = objects[(row.get("object_key") or "").strip()]
            state = (row.get("assignment_state") or "unassigned").strip().lower()
            system_type = (row.get("system_type") or "").strip().lower() or None
            if state == "unassigned":
                system_type = None
            db.add(
                ElectricalVariantObject(
                    project_id=project.id,
                    electrical_variant_id=variant.id,
                    object_id=obj.id,
                    system_type=system_type,
                    assignment_state=state,
                    requested_cable_type=((row.get("requested_cable_type") or "").strip() or None),
                    object_version_snapshot=obj.version,
                    diagnostics=_current_import_diagnostics(),
                )
            )
    else:
        for variant in variants.values():
            for obj in objects.values():
                db.add(
                    ElectricalVariantObject(
                        project_id=project.id,
                        electrical_variant_id=variant.id,
                        object_id=obj.id,
                        system_type=None,
                        assignment_state="unassigned",
                        requested_cable_type=None,
                        object_version_snapshot=obj.version,
                        diagnostics=_current_import_diagnostics(),
                    )
                )
    if variants and objects:
        await db.flush()


def _persist_electrical(
    db: AsyncSession,
    project: Project,
    payload: ProjectImportPayload,
    objects: dict[str, ProjectObject],
    variants: dict[str, ElectricalVariant],
) -> None:
    for row in payload.electrical:
        variant = variants[(row.get("variant_key") or "").strip()]
        obj = objects[(row.get("object_key") or "").strip()]
        cable_mark = (row.get("cable_mark") or "").strip() or None
        cable_mark_source = normalize_source(
            row.get("cable_mark_source"), VALID_CABLE_MARK_SOURCES
        ) or ("manual" if cable_mark else "auto")
        cable_type_source = (
            normalize_source(row.get("cable_type_source"), VALID_CABLE_TYPE_SOURCES) or "auto"
        )
        cable_snapshot = parse_json_or_empty(row.get("cable_snapshot", ""), None)
        if isinstance(cable_snapshot, dict):
            cable_snapshot = {**cable_snapshot, "origin": "imported_project"}
        db.add(
            ElectricalCalculation(
                project_id=project.id,
                object_id=obj.id,
                electrical_variant_id=variant.id,
                cable_type=(row.get("cable_type") or "").strip() or "self_regulating",
                cable_type_source=cable_type_source,
                cable_mark=cable_mark,
                cable_mark_source=cable_mark_source,
                cable_snapshot=cable_snapshot,
                params=parse_json_or_empty(row.get("params", ""), {}),
                results=parse_json_or_empty(row.get("results", ""), None),
            )
        )


def _persist_specifications(
    db: AsyncSession,
    project: Project,
    payload: ProjectImportPayload,
    variants: dict[str, ElectricalVariant],
) -> None:
    resolved_rows = validate_specification_section(payload.specifications, variants)
    for variant, items, snapshot, variant_key, variant_id_raw in resolved_rows:
        db.add(
            Specification(
                project_id=project.id,
                electrical_variant_id=variant.id,
                items=items,
                snapshot=snapshot,
                is_stale=True,
                stale_reason="electrical_sections_not_ready",
                stale_at=datetime.now(UTC),
                stale_details={
                    "variant_key": variant_key or variant_id_raw,
                    "electrical_variant_id": str(variant.id),
                    "sections_status": "not_ready",
                    "error_code": SECTIONS_NOT_READY_CODE,
                },
            )
        )


async def _persist_catalog_selections(
    db: AsyncSession,
    project: Project,
    payload: ProjectImportPayload,
    variants: dict[str, ElectricalVariant],
) -> None:
    for row in payload.catalog_selections:
        variant = resolve_specification_identity(
            variant_key=(row.get("variant_key") or "").strip(),
            electrical_variant_id_raw=(row.get("electrical_variant_id") or "").strip(),
            variants_by_key=variants,
        )
        version_id = UUID((row.get("catalog_version_id") or "").strip())
        item_id = UUID((row.get("catalog_item_id") or "").strip())
        item = await db.scalar(
            select(SpecificationCatalogItem).where(
                SpecificationCatalogItem.id == item_id,
                SpecificationCatalogItem.catalog_version_id == version_id,
            )
        )
        if item is None:
            raise ProjectImportError(
                "catalog_selections: catalog_item_id не найден в catalog_version "
                f"({item_id} / {version_id})"
            )
        db.add(
            SpecificationCatalogSelection(
                project_id=project.id,
                electrical_variant_id=variant.id,
                candidate_group_key=(row.get("candidate_group_key") or "").strip(),
                catalog_version_id=version_id,
                catalog_item_id=item_id,
                candidate_set_fingerprint=(row.get("candidate_set_fingerprint") or "").strip(),
                collection_version=int((row.get("collection_version") or "1").strip() or "1"),
            )
        )


def _current_import_diagnostics() -> dict[str, str]:
    return {
        "sections_status": "not_ready",
        "sections_error_code": SECTIONS_NOT_READY_CODE,
    }
