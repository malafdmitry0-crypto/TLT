"""Mappings between current CSV sections and project transfer objects."""

from __future__ import annotations

import json
from collections import defaultdict
from typing import Any
from uuid import UUID

from app.services.project_display_settings_service import strip_retired_heatcalc_columns
from app.services.project_io.contracts import (
    ProjectExportGraph,
    ProjectImportPayload,
    Row,
    Sections,
)
from app.services.project_io.csv_codec import CsvWriter, rows_to_dicts, write_row, write_section


def parse_single_payload(sections: Sections) -> ProjectImportPayload:
    metadata_rows = rows_to_dicts(sections.get("metadata", []))
    metadata = {
        row["key"]: row["value"] for row in metadata_rows if "key" in row and "value" in row
    }
    return ProjectImportPayload(
        project_key=None,
        name=metadata.get("name", ""),
        task_number=metadata.get("task_number") or None,
        description=metadata.get("description") or None,
        status=metadata.get("status", "draft") or "draft",
        specification_settings_raw=metadata.get("specification_settings"),
        specification_settings_version_raw=metadata.get("specification_settings_version"),
        display_settings_raw=metadata.get("display_settings"),
        display_settings_version_raw=metadata.get("display_settings_version"),
        objects=rows_to_dicts(sections.get("objects", [])),
        variants=rows_to_dicts(sections.get("electrical_variants", [])),
        assignments=rows_to_dicts(sections.get("electrical_assignments", [])),
        electrical=rows_to_dicts(sections.get("electrical", [])),
        specifications=rows_to_dicts(sections.get("specifications", [])),
        electrical_settings=rows_to_dicts(sections.get("electrical_settings", [])),
        catalog_selections=rows_to_dicts(sections.get("catalog_selections", [])),
    )


def parse_bulk_payloads(sections: Sections) -> list[ProjectImportPayload]:
    def by_project_key(section_name: str) -> dict[str, list[Row]]:
        grouped: dict[str, list[Row]] = defaultdict(list)
        for section_row in rows_to_dicts(sections.get(section_name, [])):
            key = section_row.get("project_key", "")
            if key:
                grouped[key].append(section_row)
        return grouped

    grouped_sections = {
        name: by_project_key(name)
        for name in (
            "objects",
            "electrical_variants",
            "electrical_assignments",
            "electrical",
            "specifications",
            "electrical_settings",
            "catalog_selections",
        )
    }
    payloads: list[ProjectImportPayload] = []
    for row in rows_to_dicts(sections.get("projects", [])):
        key = row.get("project_key", "").strip()
        payloads.append(
            ProjectImportPayload(
                project_key=key,
                name=row.get("name", "").strip(),
                task_number=row.get("task_number", "").strip() or None,
                description=row.get("description") or None,
                status=row.get("status", "draft") or "draft",
                specification_settings_raw=row.get("specification_settings"),
                specification_settings_version_raw=row.get("specification_settings_version"),
                display_settings_raw=row.get("display_settings"),
                display_settings_version_raw=row.get("display_settings_version"),
                objects=grouped_sections["objects"].get(key, []),
                variants=grouped_sections["electrical_variants"].get(key, []),
                assignments=grouped_sections["electrical_assignments"].get(key, []),
                electrical=grouped_sections["electrical"].get(key, []),
                specifications=grouped_sections["specifications"].get(key, []),
                electrical_settings=grouped_sections["electrical_settings"].get(key, []),
                catalog_selections=grouped_sections["catalog_selections"].get(key, []),
            )
        )
    return payloads


def write_single_project(writer: CsvWriter, graph: ProjectExportGraph) -> None:
    project = graph.project
    write_section(writer, "metadata")
    write_row(writer, ["key", "value"])
    write_row(writer, ["name", project.name])
    write_row(writer, ["task_number", project.task_number or ""])
    write_row(writer, ["description", project.description or ""])
    write_row(writer, ["status", project.status])
    write_row(
        writer,
        [
            "specification_settings",
            json.dumps(
                getattr(project, "specification_settings", None) or {},
                ensure_ascii=False,
            ),
        ],
    )
    write_row(
        writer,
        [
            "specification_settings_version",
            getattr(project, "specification_settings_version", 1) or 1,
        ],
    )
    display_settings = getattr(project, "display_settings", None)
    if isinstance(display_settings, dict):
        display_settings = strip_retired_heatcalc_columns(display_settings)
    write_row(
        writer,
        [
            "display_settings",
            "" if display_settings is None else json.dumps(display_settings, ensure_ascii=False),
        ],
    )
    write_row(
        writer,
        [
            "display_settings_version",
            getattr(project, "display_settings_version", 0) or 0,
        ],
    )
    write_row(writer, [])
    write_project_sections(writer, graph)


def write_bulk_header(writer: CsvWriter, graphs: list[tuple[str, ProjectExportGraph]]) -> None:
    write_section(writer, "projects")
    write_row(
        writer,
        [
            "project_key",
            "name",
            "task_number",
            "description",
            "status",
            "specification_settings",
            "specification_settings_version",
            "display_settings",
            "display_settings_version",
        ],
    )
    for project_key, graph in graphs:
        project = graph.project
        display_settings = getattr(project, "display_settings", None)
        if isinstance(display_settings, dict):
            display_settings = strip_retired_heatcalc_columns(display_settings)
        write_row(
            writer,
            [
                project_key,
                project.name,
                project.task_number or "",
                project.description or "",
                project.status,
                json.dumps(
                    getattr(project, "specification_settings", None) or {},
                    ensure_ascii=False,
                ),
                getattr(project, "specification_settings_version", 1) or 1,
                ""
                if display_settings is None
                else json.dumps(display_settings, ensure_ascii=False),
                getattr(project, "display_settings_version", 0) or 0,
            ],
        )
    write_row(writer, [])


def write_project_sections(
    writer: CsvWriter,
    graph: ProjectExportGraph,
    *,
    project_key: str | None = None,
) -> None:
    prefix = [project_key] if project_key is not None else []
    _write_electrical_settings(writer, graph.electrical_settings, prefix, project_key is not None)
    object_keys = _write_objects(writer, graph.objects, prefix, project_key is not None)
    variant_keys = _write_variants(writer, graph.variants, prefix, project_key is not None)
    _write_assignments(
        writer,
        graph.assignments,
        object_keys,
        variant_keys,
        prefix,
        project_key is not None,
    )
    _write_electrical(
        writer,
        graph.electrical,
        object_keys,
        variant_keys,
        prefix,
        project_key is not None,
    )
    _write_specifications(
        writer,
        graph.specifications,
        variant_keys,
        prefix,
        project_key is not None,
    )
    _write_catalog_selections(
        writer,
        graph.catalog_selections,
        variant_keys,
        prefix,
        project_key is not None,
    )


def _header(prefix_project_key: bool, columns: list[str]) -> list[str]:
    return ["project_key", *columns] if prefix_project_key else columns


def _write_objects(
    writer: CsvWriter,
    objects: list[Any],
    prefix: list[str],
    is_bulk: bool,
) -> dict[UUID, str]:
    write_section(writer, "objects")
    write_row(
        writer,
        _header(
            is_bulk,
            [
                "object_key",
                "type",
                "name",
                "sort_order",
                "params",
                "results",
                "is_valid",
                "validation_errors",
            ],
        ),
    )
    object_keys: dict[UUID, str] = {}
    for obj in sorted(objects, key=lambda item: item.sort_order):
        object_key = str(obj.id)
        object_keys[obj.id] = object_key
        write_row(
            writer,
            [
                *prefix,
                object_key,
                obj.object_type,
                (obj.params or {}).get("name") or object_key,
                obj.sort_order,
                json.dumps(obj.params or {}, ensure_ascii=False),
                json.dumps(obj.results, ensure_ascii=False) if obj.results is not None else "",
                "true" if obj.is_valid else "false",
                json.dumps(obj.validation_errors, ensure_ascii=False)
                if obj.validation_errors is not None
                else "",
            ],
        )
    write_row(writer, [])
    return object_keys


def _write_variants(
    writer: CsvWriter,
    variants: list[Any],
    prefix: list[str],
    is_bulk: bool,
) -> dict[UUID, str]:
    ordered = sorted(variants, key=lambda item: (item.sort_order, str(item.id)))
    variant_keys = {variant.id: str(variant.id) for variant in ordered}
    if not ordered:
        return variant_keys
    write_section(writer, "electrical_variants")
    write_row(
        writer,
        _header(
            is_bulk,
            [
                "variant_key",
                "name",
                "sort_order",
                "is_active",
                "copied_from_key",
            ],
        ),
    )
    for variant in ordered:
        copied_from_key = ""
        if variant.copied_from_id is not None:
            copied_from_key = variant_keys.get(variant.copied_from_id, str(variant.copied_from_id))
        write_row(
            writer,
            [
                *prefix,
                variant_keys[variant.id],
                variant.name,
                variant.sort_order,
                "true" if variant.is_active else "false",
                copied_from_key,
            ],
        )
    write_row(writer, [])
    return variant_keys


def _write_electrical_settings(
    writer: CsvWriter,
    settings: Any | None,
    prefix: list[str],
    is_bulk: bool,
) -> None:
    if settings is None:
        return
    write_section(writer, "electrical_settings")
    write_row(
        writer,
        _header(is_bulk, ["nominal_voltage_v", "max_section_start_current_a", "version"]),
    )
    write_row(
        writer,
        [
            *prefix,
            settings.nominal_voltage_v,
            ""
            if settings.max_section_start_current_a is None
            else settings.max_section_start_current_a,
            settings.version,
        ],
    )
    write_row(writer, [])


def _write_assignments(
    writer: CsvWriter,
    assignments: list[Any],
    object_keys: dict[UUID, str],
    variant_keys: dict[UUID, str],
    prefix: list[str],
    is_bulk: bool,
) -> None:
    if not assignments:
        return
    write_section(writer, "electrical_assignments")
    write_row(
        writer,
        _header(
            is_bulk,
            [
                "variant_key",
                "object_key",
                "system_type",
                "assignment_state",
                "requested_cable_type",
            ],
        ),
    )
    ordered = sorted(
        assignments,
        key=lambda item: (
            variant_keys.get(item.electrical_variant_id, str(item.electrical_variant_id)),
            object_keys.get(item.object_id, str(item.object_id)),
        ),
    )
    for assignment in ordered:
        write_row(
            writer,
            [
                *prefix,
                variant_keys.get(
                    assignment.electrical_variant_id, str(assignment.electrical_variant_id)
                ),
                object_keys.get(assignment.object_id, str(assignment.object_id)),
                assignment.system_type or "",
                assignment.assignment_state,
                assignment.requested_cable_type or "",
            ],
        )
    write_row(writer, [])


def _write_electrical(
    writer: CsvWriter,
    calculations: list[Any],
    object_keys: dict[UUID, str],
    variant_keys: dict[UUID, str],
    prefix: list[str],
    is_bulk: bool,
) -> None:
    if not calculations:
        return
    write_section(writer, "electrical")
    write_row(
        writer,
        _header(
            is_bulk,
            [
                "variant_key",
                "object_key",
                "cable_type",
                "cable_type_source",
                "cable_mark",
                "cable_mark_source",
                "cable_snapshot",
                "params",
                "results",
            ],
        ),
    )
    for calculation in calculations:
        variant_id = getattr(calculation, "electrical_variant_id", None)
        if variant_id is None:
            raise ValueError(
                "electrical calculation has no electrical_variant_id; "
                "the current project CSV format requires UUID variant identity"
            )
        variant_key = variant_keys.get(variant_id, str(variant_id))
        write_row(
            writer,
            [
                *prefix,
                variant_key,
                object_keys.get(calculation.object_id, str(calculation.object_id)),
                calculation.cable_type,
                calculation.cable_type_source,
                calculation.cable_mark or "",
                calculation.cable_mark_source,
                json.dumps(getattr(calculation, "cable_snapshot", None), ensure_ascii=False)
                if getattr(calculation, "cable_snapshot", None) is not None
                else "",
                json.dumps(calculation.params or {}, ensure_ascii=False),
                json.dumps(calculation.results, ensure_ascii=False)
                if calculation.results is not None
                else "",
            ],
        )
    write_row(writer, [])


def _write_specifications(
    writer: CsvWriter,
    specifications: list[Any],
    variant_keys: dict[UUID, str],
    prefix: list[str],
    is_bulk: bool,
) -> None:
    if not specifications:
        return
    write_section(writer, "specifications")
    write_row(
        writer,
        _header(
            is_bulk,
            [
                "variant_key",
                "electrical_variant_id",
                "items",
                "snapshot",
                "is_stale",
                "stale_reason",
                "stale_at",
                "stale_details",
            ],
        ),
    )
    for specification in specifications:
        variant_id = specification.electrical_variant_id
        write_row(
            writer,
            [
                *prefix,
                variant_keys.get(variant_id, str(variant_id)),
                str(variant_id),
                json.dumps(specification.items or [], ensure_ascii=False),
                json.dumps(specification.snapshot, ensure_ascii=False)
                if specification.snapshot is not None
                else "",
                "true" if specification.is_stale else "false",
                specification.stale_reason or "",
                specification.stale_at.isoformat() if specification.stale_at is not None else "",
                json.dumps(specification.stale_details, ensure_ascii=False)
                if specification.stale_details is not None
                else "",
            ],
        )
    write_row(writer, [])


def _write_catalog_selections(
    writer: CsvWriter,
    selections: list[Any],
    variant_keys: dict[UUID, str],
    prefix: list[str],
    is_bulk: bool,
) -> None:
    if not selections:
        return
    write_section(writer, "catalog_selections")
    write_row(
        writer,
        _header(
            is_bulk,
            [
                "variant_key",
                "electrical_variant_id",
                "candidate_group_key",
                "catalog_version_id",
                "catalog_item_id",
                "candidate_set_fingerprint",
                "collection_version",
            ],
        ),
    )
    for selection in selections:
        variant_id = selection.electrical_variant_id
        write_row(
            writer,
            [
                *prefix,
                variant_keys.get(variant_id, str(variant_id)),
                str(variant_id),
                selection.candidate_group_key,
                str(selection.catalog_version_id),
                str(selection.catalog_item_id),
                selection.candidate_set_fingerprint,
                str(selection.collection_version),
            ],
        )
    write_row(writer, [])
