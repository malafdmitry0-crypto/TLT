"""Экспорт / импорт проектов в CSV.

Формат: «секционный CSV» с маркерами `[SECTION];<имя>`.

Export schema_version=3: metadata, objects, electrical_variants,
electrical_assignments, electrical, specifications. Import accepts v2 for the
legacy electrical graph and v3 for named UUID-keyed ЭР; numeric v2
specifications are rejected instead of being guessed. Для пакетного
импорта/экспорта добавляется секция `projects` с `project_key`.

Автоопределение разделителя (`;`, `,`, таб) — через `csv.Sniffer`.
Кодировки: UTF-8, UTF-8 BOM, CP1251.
"""

from __future__ import annotations

import csv
import io
import json
import logging
from collections import defaultdict
from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal, InvalidOperation
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import CurrentPrincipal
from app.models.electrical_calculation import ElectricalCalculation
from app.models.electrical_variant import ElectricalVariant, ElectricalVariantObject
from app.models.project import Project
from app.models.project_electrical_settings import ProjectElectricalSettings
from app.models.project_object import ProjectObject
from app.models.specification import Specification
from app.services.project_object_params import (
    LegacySpecificationObjectParamsError,
    reject_legacy_specification_object_params,
)
from app.services.project_service import (
    ProjectAccessError,
    ProjectNotFoundError,
    ProjectService,
)
from app.services.spreadsheet_safety import safe_spreadsheet_cell

logger = logging.getLogger("heatcalc.project_io")

SCHEMA_VERSION = "3"  # export always writes the current contract
LEGACY_SCHEMA_VERSION = "2"
SUPPORTED_SCHEMA_VERSIONS = {LEGACY_SCHEMA_VERSION, SCHEMA_VERSION}
DELIMITER = ";"  # экспорт всегда `;`; импорт определяет сам
VALID_CABLE_TYPE_SOURCES = {"auto", "manual", "bulk"}
VALID_CABLE_MARK_SOURCES = {"auto", "manual"}
# ER5 write cutover: CSV/import legacy slots align with DB 1..5.
LEGACY_VARIANT_NUMBERS = range(1, 6)
SECTIONS_NOT_READY_CODE = "ELECTRICAL_SECTIONS_NOT_READY"
VALID_ASSIGNMENT_SYSTEM_TYPES = {
    "self_regulating",
    "resistive",
    "skin",
    "mineral",
}
VALID_ASSIGNMENT_STATES = {
    "unassigned",
    "ready",
    "unsupported",
    "stale",
    "error",
}
# PDL-ER-06: barrel is a tank synonym, not a third backend object type.
OBJECT_TYPE_ALIASES = {
    "pipe": "pipe",
    "трубопровод": "pipe",
    "труба": "pipe",
    "tank": "tank",
    "ёмкость": "tank",
    "емкость": "tank",
    "резервуар": "tank",
    "бочка": "tank",
    "barrel": "tank",
}


class ProjectImportError(Exception):
    """Ошибка импорта проекта."""



# ----------------------------------------------------------------------------
# Экспорт
# ----------------------------------------------------------------------------


def _write_section(w: csv._writer, name: str) -> None:
    _write_row(w, ["[SECTION]", name])


def _safe_csv_cell(value: Any) -> Any:
    return safe_spreadsheet_cell(value)


def _write_row(w: csv._writer, row: list[Any]) -> None:
    w.writerow([_safe_csv_cell(value) for value in row])


def _dump_project_to_writer(
    w: csv._writer,
    project: Project,
    objects: list[ProjectObject],
    electrical: list[ElectricalCalculation],
    specifications: list[Specification],
    *,
    variants: list[ElectricalVariant] | None = None,
    assignments: list[ElectricalVariantObject] | None = None,
    electrical_settings: ProjectElectricalSettings | None = None,
    project_key: str | None = None,
) -> None:
    """Записывает секции одного проекта (schema v3).

    Если `project_key` задан — добавляет его в каждую строку (пакетный экспорт).
    """
    prefix = [project_key] if project_key is not None else []
    variants = list(variants or [])
    assignments = list(assignments or [])

    if project_key is None:
        # одиночный экспорт — metadata в отдельной секции
        _write_section(w, "metadata")
        _write_row(w, ["key", "value"])
        _write_row(w, ["schema_version", SCHEMA_VERSION])
        _write_row(w, ["name", project.name])
        _write_row(w, ["task_number", project.task_number or ""])
        _write_row(w, ["description", project.description or ""])
        _write_row(w, ["status", project.status])
        # Кейс §5.12: файл проекта включает настройки формирования спецификаций.
        _write_row(
            w,
            [
                "specification_settings",
                json.dumps(
                    getattr(project, "specification_settings", None) or {},
                    ensure_ascii=False,
                ),
            ],
        )
        _write_row(
            w,
            [
                "specification_settings_version",
                getattr(project, "specification_settings_version", 1) or 1,
            ],
        )
        # Кейс §5.11: настройки отображения входят в файл; NULL → пустая ячейка,
        # чтобы импорт отличал «не задавались» от явного сброса (`{}`).
        display_settings = getattr(project, "display_settings", None)
        _write_row(
            w,
            [
                "display_settings",
                ""
                if display_settings is None
                else json.dumps(display_settings, ensure_ascii=False),
            ],
        )
        _write_row(
            w,
            [
                "display_settings_version",
                getattr(project, "display_settings_version", 0) or 0,
            ],
        )
        _write_row(w, [])

    if electrical_settings is not None:
        # Кейс §5.12: проектные электротехнические настройки входят в файл.
        _write_section(w, "electrical_settings")
        header = ["nominal_voltage_v", "max_section_start_current_a", "version"]
        if project_key is not None:
            header = ["project_key", *header]
        _write_row(w, header)
        row = [
            electrical_settings.nominal_voltage_v,
            ""
            if electrical_settings.max_section_start_current_a is None
            else electrical_settings.max_section_start_current_a,
            electrical_settings.version,
        ]
        _write_row(w, prefix + row)
        _write_row(w, [])

    _write_section(w, "objects")
    header = [
        "object_key",
        "type",
        "name",
        "sort_order",
        "params",
        "results",
        "is_valid",
        "validation_errors",
    ]
    if project_key is not None:
        header = ["project_key", *header]
    _write_row(w, header)

    # object_key связывает electrical/specifications с объектом внутри экспортного файла.
    obj_key_by_id: dict[UUID, str] = {}
    for obj in sorted(objects, key=lambda o: o.sort_order):
        obj_key = str(obj.id)
        obj_key_by_id[obj.id] = obj_key
        obj_name = (obj.params or {}).get("name") or obj_key
        row = [
            obj_key,
            obj.object_type,
            obj_name,
            obj.sort_order,
            json.dumps(obj.params or {}, ensure_ascii=False),
            json.dumps(obj.results, ensure_ascii=False) if obj.results is not None else "",
            "true" if obj.is_valid else "false",
            json.dumps(obj.validation_errors, ensure_ascii=False)
            if obj.validation_errors is not None
            else "",
        ]
        _write_row(w, prefix + row)
    _write_row(w, [])

    # Map ER UUID -> stable in-file variant_key (prefer UUID string).
    variant_key_by_id: dict[UUID, str] = {}
    for variant in sorted(variants, key=lambda item: (item.sort_order, str(item.id))):
        variant_key_by_id[variant.id] = str(variant.id)

    if variants:
        _write_section(w, "electrical_variants")
        header = [
            "variant_key",
            "name",
            "sort_order",
            "is_active",
            "copied_from_key",
            "legacy_variant_number",
        ]
        if project_key is not None:
            header = ["project_key", *header]
        _write_row(w, header)
        for variant in sorted(variants, key=lambda item: (item.sort_order, str(item.id))):
            copied_from_key = ""
            if variant.copied_from_id is not None:
                copied_from_key = variant_key_by_id.get(
                    variant.copied_from_id, str(variant.copied_from_id)
                )
            row = [
                variant_key_by_id[variant.id],
                variant.name,
                variant.sort_order,
                "true" if variant.is_active else "false",
                copied_from_key,
                "" if variant.legacy_variant_number is None else variant.legacy_variant_number,
            ]
            _write_row(w, prefix + row)
        _write_row(w, [])

    if assignments:
        _write_section(w, "electrical_assignments")
        header = [
            "variant_key",
            "object_key",
            "system_type",
            "assignment_state",
            "requested_cable_type",
        ]
        if project_key is not None:
            header = ["project_key", *header]
        _write_row(w, header)
        for assignment in sorted(
            assignments,
            key=lambda item: (
                variant_key_by_id.get(item.electrical_variant_id, str(item.electrical_variant_id)),
                obj_key_by_id.get(item.object_id, str(item.object_id)),
            ),
        ):
            row = [
                variant_key_by_id.get(
                    assignment.electrical_variant_id, str(assignment.electrical_variant_id)
                ),
                obj_key_by_id.get(assignment.object_id, str(assignment.object_id)),
                assignment.system_type or "",
                assignment.assignment_state,
                assignment.requested_cable_type or "",
            ]
            _write_row(w, prefix + row)
        _write_row(w, [])

    if electrical:
        _write_section(w, "electrical")
        header = [
            "variant_key",
            "object_key",
            "legacy_variant_number",
            "cable_type",
            "cable_type_source",
            "cable_mark",
            "cable_mark_source",
            "cable_snapshot",
            "params",
            "results",
        ]
        if project_key is not None:
            header = ["project_key", *header]
        _write_row(w, header)
        for calc in electrical:
            variant_key = ""
            calc_er_id = getattr(calc, "electrical_variant_id", None)
            if calc_er_id is not None:
                variant_key = variant_key_by_id.get(calc_er_id, str(calc_er_id))
            elif getattr(calc, "variant_number", None) is not None:
                # Expand-window rows without UUID: synthesize key from legacy slot.
                variant_key = f"legacy-{calc.variant_number}"
            row = [
                variant_key,
                obj_key_by_id.get(calc.object_id, str(calc.object_id)),
                getattr(calc, "variant_number", ""),
                calc.cable_type,
                calc.cable_type_source,
                calc.cable_mark or "",
                calc.cable_mark_source,
                json.dumps(getattr(calc, "cable_snapshot", None), ensure_ascii=False)
                if getattr(calc, "cable_snapshot", None) is not None
                else "",
                json.dumps(calc.params or {}, ensure_ascii=False),
                json.dumps(calc.results, ensure_ascii=False) if calc.results is not None else "",
            ]
            _write_row(w, prefix + row)
        _write_row(w, [])

    if specifications:
        _write_section(w, "specifications")
        header = [
            "variant_key",
            "electrical_variant_id",
            "items",
            "snapshot",
            "is_stale",
            "stale_reason",
            "stale_at",
            "stale_details",
        ]
        if project_key is not None:
            header = ["project_key", *header]
        _write_row(w, header)
        for spec in specifications:
            spec_er_id = spec.electrical_variant_id
            variant_key = variant_key_by_id.get(spec_er_id, str(spec_er_id))
            row = [
                variant_key,
                str(spec_er_id),
                json.dumps(spec.items or [], ensure_ascii=False),
                json.dumps(spec.snapshot, ensure_ascii=False)
                if spec.snapshot is not None
                else "",
                "true" if spec.is_stale else "false",
                spec.stale_reason or "",
                spec.stale_at.isoformat() if spec.stale_at is not None else "",
                json.dumps(spec.stale_details, ensure_ascii=False)
                if spec.stale_details is not None
                else "",
            ]
            _write_row(w, prefix + row)
        _write_row(w, [])


async def export_project(
    db: AsyncSession, project_id: UUID, principal: CurrentPrincipal
) -> tuple[str, bytes]:
    """Экспортирует проект в CSV. Возвращает (suggested_filename, csv_bytes)."""
    service = ProjectService(db)
    project = await service.get_project_basic(project_id, principal)

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
    specs = list(
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

    buf = io.StringIO()
    w = csv.writer(buf, delimiter=DELIMITER, quoting=csv.QUOTE_MINIMAL)
    _dump_project_to_writer(
        w,
        project,
        objects,
        electrical,
        specs,
        variants=variants,
        assignments=assignments,
        electrical_settings=electrical_settings,
    )
    filename = _suggest_filename(project.task_number, project.name)
    # UTF-8 BOM — чтобы Excel-ru открывал без «крокозябров»
    payload = ("\ufeff" + buf.getvalue()).encode("utf-8")
    return filename, payload


async def export_projects_bulk(
    db: AsyncSession, project_ids: list[UUID], principal: CurrentPrincipal
) -> tuple[str, bytes]:
    """Пакетный экспорт N проектов в один CSV."""
    service = ProjectService(db)
    buf = io.StringIO()
    w = csv.writer(buf, delimiter=DELIMITER, quoting=csv.QUOTE_MINIMAL)

    # Секция projects — общая
    unique_project_ids = list(dict.fromkeys(project_ids))
    projects_result = await db.execute(select(Project).where(Project.id.in_(unique_project_ids)))
    projects_by_id = {project.id: project for project in projects_result.scalars()}

    projects: list[tuple[str, Project]] = []
    for idx, pid in enumerate(project_ids, start=1):
        project = projects_by_id.get(pid)
        if project is None:
            raise ProjectNotFoundError(f"Проект {pid} не найден")
        service._check_access(project, principal)
        projects.append((f"p{idx}", project))

    _write_row(w, ["[SECTION]", "meta"])
    _write_row(w, ["key", "value"])
    _write_row(w, ["schema_version", SCHEMA_VERSION])
    _write_row(w, [])

    _write_row(w, ["[SECTION]", "projects"])
    _write_row(
        w,
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
    for key, project in projects:
        display_settings = getattr(project, "display_settings", None)
        _write_row(
            w,
            [
                key,
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
    _write_row(w, [])

    objects_by_project: dict[UUID, list[ProjectObject]] = defaultdict(list)
    electrical_by_project: dict[UUID, list[ElectricalCalculation]] = defaultdict(list)
    specs_by_project: dict[UUID, list[Specification]] = defaultdict(list)
    variants_by_project: dict[UUID, list[ElectricalVariant]] = defaultdict(list)
    assignments_by_project: dict[UUID, list[ElectricalVariantObject]] = defaultdict(list)

    if unique_project_ids:
        objects_result = await db.execute(
            select(ProjectObject)
            .where(ProjectObject.project_id.in_(unique_project_ids))
            .order_by(ProjectObject.project_id, ProjectObject.sort_order, ProjectObject.id)
        )
        for obj in objects_result.scalars():
            objects_by_project[obj.project_id].append(obj)

        electrical_result = await db.execute(
            select(ElectricalCalculation)
            .where(ElectricalCalculation.project_id.in_(unique_project_ids))
            .order_by(
                ElectricalCalculation.project_id,
                ElectricalCalculation.object_id,
                ElectricalCalculation.variant_number,
            )
        )
        for calc in electrical_result.scalars():
            electrical_by_project[calc.project_id].append(calc)

        specs_result = await db.execute(
            select(Specification)
            .where(Specification.project_id.in_(unique_project_ids))
            .order_by(Specification.project_id, Specification.electrical_variant_id)
        )
        for spec in specs_result.scalars():
            specs_by_project[spec.project_id].append(spec)

        variants_result = await db.execute(
            select(ElectricalVariant)
            .where(ElectricalVariant.project_id.in_(unique_project_ids))
            .order_by(
                ElectricalVariant.project_id,
                ElectricalVariant.sort_order,
                ElectricalVariant.id,
            )
        )
        for variant in variants_result.scalars():
            variants_by_project[variant.project_id].append(variant)

        assignments_result = await db.execute(
            select(ElectricalVariantObject).where(
                ElectricalVariantObject.project_id.in_(unique_project_ids)
            )
        )
        for assignment in assignments_result.scalars():
            assignments_by_project[assignment.project_id].append(assignment)

    electrical_settings_by_project: dict[UUID, ProjectElectricalSettings] = {}
    if unique_project_ids:
        electrical_settings_result = await db.execute(
            select(ProjectElectricalSettings).where(
                ProjectElectricalSettings.project_id.in_(unique_project_ids)
            )
        )
        for settings_row in electrical_settings_result.scalars():
            electrical_settings_by_project[settings_row.project_id] = settings_row

    for key, project in projects:
        _dump_project_to_writer(
            w,
            project,
            objects_by_project[project.id],
            electrical_by_project[project.id],
            specs_by_project[project.id],
            variants=variants_by_project[project.id],
            assignments=assignments_by_project[project.id],
            electrical_settings=electrical_settings_by_project.get(project.id),
            project_key=key,
        )

    payload = ("\ufeff" + buf.getvalue()).encode("utf-8")
    return "projects_export.csv", payload


def _suggest_filename(task_number: str | None, name: str) -> str:
    safe = "".join(c if c.isalnum() or c in "-_ " else "_" for c in name).strip()[:80]
    prefix = f"{task_number}_" if task_number else ""
    return f"{prefix}{safe or 'project'}.tlt.csv"


# ----------------------------------------------------------------------------
# Импорт
# ----------------------------------------------------------------------------


def _decode_csv(raw: bytes) -> str:
    for enc in ("utf-8-sig", "utf-8", "cp1251"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    raise ProjectImportError("Не удалось определить кодировку файла")


def _detect_delimiter(text: str) -> str:
    """Определяет разделитель.

    JSON в ячейках содержит запятые, из-за чего `csv.Sniffer` часто ошибочно
    выбирает `,`. Маркер `[SECTION]<delim><name>` — надёжный якорь: смотрим
    символ сразу после `]` в первой подходящей строке.
    """
    for line in text.splitlines():
        stripped = line.lstrip("\ufeff").strip()
        if stripped.upper().startswith("[SECTION]"):
            if len(stripped) > len("[SECTION]"):
                cand = stripped[len("[SECTION]")]
                if cand in ";,\t|":
                    return cand
            break
    try:
        sample = text[:4096]
        return csv.Sniffer().sniff(sample, delimiters=";,\t").delimiter
    except csv.Error:
        return DELIMITER


def _parse_sections(raw: bytes) -> dict[str, list[list[str]]]:
    """Разбивает CSV на секции `{name: rows}` (rows — без заголовка-маркера)."""
    text = _decode_csv(raw)
    delimiter = _detect_delimiter(text)
    reader = csv.reader(io.StringIO(text), delimiter=delimiter)
    sections: dict[str, list[list[str]]] = defaultdict(list)
    current: str | None = None
    for row in reader:
        if not row or all(not c.strip() for c in row):
            continue
        if row[0].strip().upper() == "[SECTION]" and len(row) >= 2:
            current = row[1].strip().lower()
            continue
        if current is None:
            continue
        sections[current].append([c for c in row])
    return dict(sections)


def _rows_to_dicts(rows: list[list[str]]) -> list[dict[str, str]]:
    if not rows:
        return []
    header = [c.strip() for c in rows[0]]
    out: list[dict[str, str]] = []
    for row in rows[1:]:
        padded = row + [""] * (len(header) - len(row))
        out.append({header[i]: padded[i] for i in range(len(header))})
    return out


def _section_key_values(sections: dict[str, list[list[str]]], name: str) -> dict[str, str]:
    rows = _rows_to_dicts(sections.get(name, []))
    return {r["key"]: r["value"] for r in rows if "key" in r}


def _require_schema_version(sections: dict[str, list[list[str]]], name: str) -> str:
    """Validate and return schema_version. Export is v3; import accepts v2 and v3."""
    meta = _section_key_values(sections, name)
    version = (meta.get("schema_version") or "").strip()
    if version not in SUPPORTED_SCHEMA_VERSIONS:
        raise ProjectImportError(
            f"Неподдерживаемая версия CSV-схемы: {version or 'не указана'}. "
            f"Ожидается schema_version in {sorted(SUPPORTED_SCHEMA_VERSIONS)}."
        )
    return version


def _normalize_object_type(raw: str) -> str:
    """PDL-ER-06: map barrel/бочка synonyms to tank; pipes stay pipe."""
    key = (raw or "").strip().casefold()
    if not key:
        return "pipe"
    mapped = OBJECT_TYPE_ALIASES.get(key)
    if mapped is None:
        raise ProjectImportError(
            f"Неподдерживаемый тип объекта {raw!r}. "
            "Допустимы: pipe/трубопровод, tank/ёмкость/бочка."
        )
    return mapped


def _parse_json_or_empty(raw: str, default: Any) -> Any:
    raw = (raw or "").strip()
    if not raw:
        return default
    try:
        return json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ProjectImportError(f"Некорректный JSON: {exc}") from exc


def _reject_imported_legacy_specification_params(params: Any) -> None:
    if not isinstance(params, dict):
        return
    try:
        reject_legacy_specification_object_params(params)
    except LegacySpecificationObjectParamsError as exc:
        fields = ", ".join(exc.fields)
        raise ProjectImportError(f"{exc} (code={exc.code}; fields={fields})") from exc


def _apply_imported_specification_settings(
    project: Project,
    settings_raw: str | None,
    version_raw: str | None,
) -> None:
    """Кейс §5.11: восстановить настройки формирования спецификаций из файла.

    Структурно повреждённый JSON — ошибка импорта. Внутри payload храним
    как есть (lossless): чтение защищено нормализацией в
    SpecificationService._normalize_settings_payload, а формат полей может
    эволюционировать между версиями контракта настроек.
    """
    if settings_raw is not None and settings_raw.strip():
        payload = _parse_json_or_empty(settings_raw, {})
        if not isinstance(payload, dict):
            raise ProjectImportError(
                "specification_settings в файле проекта должен быть JSON-объектом"
            )
        project.specification_settings = payload
    version_text = (version_raw or "").strip()
    if version_text:
        try:
            version = int(version_text)
        except ValueError as exc:
            raise ProjectImportError(
                f"Некорректный specification_settings_version: {version_text!r}"
            ) from exc
        project.specification_settings_version = max(version, 1)


def _apply_imported_display_settings(
    project: Project,
    settings_raw: str | None,
    version_raw: str | None,
) -> None:
    """Кейс §5.11: восстановить настройки отображения из файла.

    Колонки опциональные — файл v3 без них остаётся валидным. Payload храним
    lossless (как specification_settings): whitelist применяется на PUT,
    чтение фронтом защищено нормализацией. Пустая ячейка — «не задавались»
    (NULL), `{}` — явный сброс.
    """
    if settings_raw is not None and settings_raw.strip():
        payload = _parse_json_or_empty(settings_raw, {})
        if not isinstance(payload, dict):
            raise ProjectImportError(
                "display_settings в файле проекта должен быть JSON-объектом"
            )
        project.display_settings = payload
    version_text = (version_raw or "").strip()
    if version_text:
        try:
            version = int(version_text)
        except ValueError as exc:
            raise ProjectImportError(
                f"Некорректный display_settings_version: {version_text!r}"
            ) from exc
        project.display_settings_version = max(version, 0)


def _apply_imported_electrical_settings(
    db: AsyncSession,
    project: Project,
    rows: list[dict[str, str]],
) -> None:
    """Кейс §5.11: восстановить проектные электротехнические настройки из файла."""
    if not rows:
        return
    if len(rows) > 1:
        raise ProjectImportError(
            "Секция electrical_settings должна содержать одну строку на проект"
        )
    row = rows[0]
    voltage_raw = (row.get("nominal_voltage_v") or "").strip()
    if voltage_raw and voltage_raw != "230":
        raise ProjectImportError(
            f"Неподдерживаемое nominal_voltage_v в electrical_settings: {voltage_raw!r} "
            "(допустимо только 230)"
        )
    current_raw = (row.get("max_section_start_current_a") or "").strip()
    max_current: Decimal | None = None
    if current_raw:
        try:
            max_current = Decimal(current_raw.replace(",", "."))
        except InvalidOperation as exc:
            raise ProjectImportError(
                f"Некорректный max_section_start_current_a: {current_raw!r}"
            ) from exc
        if max_current <= 0:
            raise ProjectImportError(
                "max_section_start_current_a в electrical_settings должен быть больше 0"
            )
    version_raw = (row.get("version") or "").strip()
    version = 1
    if version_raw:
        try:
            version = max(int(version_raw), 1)
        except ValueError as exc:
            raise ProjectImportError(
                f"Некорректный version в electrical_settings: {version_raw!r}"
            ) from exc
    db.add(
        ProjectElectricalSettings(
            project_id=project.id,
            max_section_start_current_a=max_current,
            version=version,
        )
    )


def _spec_rows_contain_manual_items(spec_rows: list[dict[str, str]]) -> bool:
    """True if any specification row embeds source=manual positions (PDL-ER-41)."""
    for row in spec_rows:
        items = _parse_json_or_empty(row.get("items", ""), [])
        if not isinstance(items, list):
            continue
        for item in items:
            if isinstance(item, dict) and str(item.get("source") or "").lower() == "manual":
                return True
    return False


def _variant_keys_from_rows(variant_rows: list[dict[str, str]]) -> set[str]:
    """Collect non-empty electrical_variants.variant_key values without DB writes."""
    keys: set[str] = set()
    for row in variant_rows:
        key = (row.get("variant_key") or "").strip()
        if key:
            keys.add(key)
    return keys


def _resolve_specification_identity(
    *,
    variant_key: str,
    electrical_variant_id_raw: str,
    variants_by_key: dict[str, Any],
) -> Any:
    """Resolve one specification row to a single ER entry from ``variants_by_key``.

    When both identity fields are present they must resolve to the same ER.
    Lookup accepts in-file ``variant_key`` and exported UUID string equality.
    """
    if not variant_key and not electrical_variant_id_raw:
        raise ProjectImportError(
            "В specifications обязателен variant_key или electrical_variant_id"
        )

    def _lookup(token: str) -> Any | None:
        if not token:
            return None
        if token in variants_by_key:
            return variants_by_key[token]
        for key, candidate in variants_by_key.items():
            candidate_id = getattr(candidate, "id", None)
            if key == token or (candidate_id is not None and str(candidate_id) == token):
                return candidate
        return None

    by_key = _lookup(variant_key) if variant_key else None
    by_uuid = _lookup(electrical_variant_id_raw) if electrical_variant_id_raw else None

    if variant_key and electrical_variant_id_raw:
        if by_key is None:
            raise ProjectImportError(
                f"specifications: неизвестный variant_key {variant_key!r}"
            )
        if by_uuid is None:
            raise ProjectImportError(
                "specifications: неизвестный electrical_variant_id "
                f"{electrical_variant_id_raw!r}"
            )
        if by_key is not by_uuid:
            raise ProjectImportError(
                "specifications: конфликт identity — variant_key и "
                "electrical_variant_id указывают на разные ЭР "
                f"({variant_key!r} vs {electrical_variant_id_raw!r})"
            )
        return by_key

    resolved = by_key if by_key is not None else by_uuid
    if resolved is None:
        raise ProjectImportError(
            "specifications: неизвестный variant_key/electrical_variant_id "
            f"{variant_key or electrical_variant_id_raw!r}"
        )
    return resolved


def _parse_specification_row_payload(row: dict[str, str]) -> tuple[list[Any], dict[str, Any] | None]:
    """Validate items/snapshot JSON shape for one specification row."""
    items = _parse_json_or_empty(row.get("items", ""), [])
    if not isinstance(items, list):
        raise ProjectImportError("specifications.items должен быть JSON-массивом")
    snapshot = _parse_json_or_empty(row.get("snapshot", ""), None)
    if snapshot is not None and not isinstance(snapshot, dict):
        raise ProjectImportError("specifications.snapshot должен быть JSON-объектом")
    return items, snapshot


def _validate_specification_section_v3(
    spec_rows: list[dict[str, str]],
    variants_by_key: dict[str, Any],
) -> list[tuple[Any, list[Any], dict[str, Any] | None, str, str]]:
    """Validate the full specifications section before any project mutation.

    Returns resolved ``(variant, items, snapshot, variant_key, electrical_variant_id_raw)``
    tuples. Duplicate resolved ER identity is rejected after resolution.
    """
    resolved_rows: list[tuple[Any, list[Any], dict[str, Any] | None, str, str]] = []
    seen_ids: set[Any] = set()
    for row in spec_rows:
        variant_key = (row.get("variant_key") or "").strip()
        electrical_variant_id_raw = (row.get("electrical_variant_id") or "").strip()
        variant = _resolve_specification_identity(
            variant_key=variant_key,
            electrical_variant_id_raw=electrical_variant_id_raw,
            variants_by_key=variants_by_key,
        )
        identity = getattr(variant, "id", variant)
        if identity in seen_ids:
            raise ProjectImportError(
                "specifications: дубликат electrical_variant_id после resolution "
                f"({identity!s})"
            )
        seen_ids.add(identity)
        items, snapshot = _parse_specification_row_payload(row)
        resolved_rows.append(
            (variant, items, snapshot, variant_key, electrical_variant_id_raw)
        )
    return resolved_rows


def _validate_specification_section_before_mutation(
    *,
    schema_version: str,
    spec_rows: list[dict[str, str]],
    variant_rows: list[dict[str, str]],
) -> None:
    """Fail-closed specification validation with no DB side effects.

    Guest replace and owner create must not stage deletes/inserts until this
    returns successfully for the entire specification section.
    """
    if not spec_rows:
        return
    if schema_version == LEGACY_SCHEMA_VERSION:
        raise ProjectImportError(
            "Секция specifications schema_version=2 не поддерживается: "
            "спецификация требует UUID ЭР и canonical snapshot"
        )
    if not variant_rows:
        raise ProjectImportError(
            "schema_version=3 требует секцию electrical_variants, "
            "если есть electrical/specifications"
        )
    # Pure key map: values are the keys themselves until real ORM variants exist.
    key_tokens = _variant_keys_from_rows(variant_rows)
    if not key_tokens:
        raise ProjectImportError("В electrical_variants пустой variant_key")
    stub_map: dict[str, str] = {key: key for key in key_tokens}
    _validate_specification_section_v3(spec_rows, stub_map)


def _normalize_source(value: str | None, valid_values: set[str]) -> str | None:
    if value is None:
        return None
    normalized = value.strip().lower()
    return normalized if normalized in valid_values else None


def _legacy_variant_number(row: dict[str, str], *, section: str) -> int:
    raw = (row.get("variant_number") or "1").strip()
    try:
        variant_number = int(raw)
    except ValueError as exc:
        raise ProjectImportError(
            f"Некорректный variant_number в секции {section}: {raw!r}"
        ) from exc
    if variant_number not in LEGACY_VARIANT_NUMBERS:
        raise ProjectImportError(
            f"variant_number в секции {section} должен быть в диапазоне 1..5: "
            f"получено {variant_number}"
        )
    return variant_number


def _occupied_legacy_slots(
    electrical_rows: list[dict[str, str]],
    spec_rows: list[dict[str, str]],
) -> set[int]:
    """Validate v2 slots before writes and return their sparse occupied set."""
    occupied = {_legacy_variant_number(row, section="electrical") for row in electrical_rows}
    occupied.update(_legacy_variant_number(row, section="specifications") for row in spec_rows)
    return occupied


def _is_successful_legacy_result(
    cable_mark: str | None,
    results: dict[str, Any] | None,
) -> bool:
    """Mirror the 0027 persisted-result success contract for v2 imports."""
    if not results:
        return False
    if results.get("error_code") or results.get("category") or results.get("stale") is True:
        return False
    snapshot = results.get("cable_snapshot")
    snapshot_mark = snapshot.get("cable_mark") if isinstance(snapshot, dict) else None
    return bool(
        cable_mark or results.get("cable_mark") or results.get("selected_cable") or snapshot_mark
    )


def _legacy_assignment_projection(
    cable_type: str | None,
    cable_mark: str | None,
    results: dict[str, Any] | None,
) -> tuple[str | None, str]:
    """Map lossless requested cable type to normalized system/state fields."""
    normalized_type = (cable_type or "").strip().lower()
    if normalized_type in {"skin", "mineral"}:
        return normalized_type, "unsupported"

    result = results or {}
    if result.get("category") == "stale" or result.get("stale") is True:
        return None, "stale"
    if result.get("category") == "unsupported":
        return None, "unsupported"
    if result.get("error_code") or result.get("category"):
        return None, "error"
    if not _is_successful_legacy_result(cable_mark, results):
        return None, "unassigned"
    if normalized_type in {"self_regulating", "self_regulating_tt"}:
        return "self_regulating", "ready"
    if normalized_type in {"single_core", "three_core"}:
        return "resistive", "ready"
    return None, "unassigned"


@dataclass(slots=True)
class _ImportedElectricalRow:
    object: ProjectObject
    variant_number: int
    cable_type: str
    cable_type_source: str
    cable_mark: str | None
    cable_mark_source: str
    cable_snapshot: Any
    params: dict[str, Any]
    results: dict[str, Any] | None


def _assignment_diagnostics(
    variant_number: int | None,
    imported: _ImportedElectricalRow | None,
    *,
    import_schema_version: str = LEGACY_SCHEMA_VERSION,
) -> dict[str, Any]:
    results = imported.results if imported is not None else None
    result = results or {}
    values = {
        "import_schema_version": import_schema_version,
        "legacy_variant_number": variant_number,
        "legacy_cable_type": imported.cable_type if imported is not None else None,
        "legacy_result_category": result.get("category"),
        "legacy_error_code": result.get("error_code"),
        "legacy_stale": result.get("stale"),
        "legacy_success": _is_successful_legacy_result(
            imported.cable_mark if imported is not None else None,
            results,
        ),
        "sections_status": "not_ready",
        "sections_error_code": SECTIONS_NOT_READY_CODE,
    }
    return {key: value for key, value in values.items() if value is not None}


async def _create_imported_variants(
    db: AsyncSession,
    project: Project,
    occupied_slots: set[int],
) -> dict[int, ElectricalVariant]:
    if not occupied_slots:
        return {}

    ordered_slots = sorted({1, *occupied_slots})
    variants: dict[int, ElectricalVariant] = {}
    for sort_order, variant_number in enumerate(ordered_slots):
        name = f"ЭР{variant_number}"
        variant = ElectricalVariant(
            project_id=project.id,
            name=name,
            name_normalized=name.casefold(),
            sort_order=sort_order,
            is_active=variant_number == 1,
            legacy_variant_number=variant_number,
        )
        db.add(variant)
        variants[variant_number] = variant
    project.electrical_initialized_at = datetime.now(UTC)
    await db.flush()
    return variants


async def _apply_project_data(
    db: AsyncSession,
    project: Project,
    objects_rows: list[dict[str, str]],
    electrical_rows: list[dict[str, str]],
    spec_rows: list[dict[str, str]],
) -> None:
    """Заполняет пустой `project` данными из распарсенных секций."""
    if spec_rows:
        raise ProjectImportError(
            "Секция specifications schema_version=2 не поддерживается: "
            "спецификация требует UUID ЭР и canonical snapshot"
        )
    # Validate the complete v2 payload before staging graph writes. Electrical
    # rows with an unknown object_key retain the legacy "skip" behaviour and
    # therefore must not create an otherwise orphaned ER slot.
    _occupied_legacy_slots(electrical_rows, [])

    # объекты
    obj_by_key: dict[str, ProjectObject] = {}
    for idx, row in enumerate(objects_rows):
        params = _parse_json_or_empty(row.get("params", ""), {})
        _reject_imported_legacy_specification_params(params)
        if row.get("name") and "name" not in params:
            params["name"] = row["name"]
        object_key = (row.get("object_key") or "").strip()
        if not object_key:
            raise ProjectImportError("В секции objects отсутствует обязательный object_key")
        if object_key in obj_by_key:
            raise ProjectImportError(
                "Дублирующийся object_key в секции objects: "
                f"{object_key!r}. Экспортируйте проект заново или задайте уникальные ключи."
            )
        obj = ProjectObject(
            project_id=project.id,
            object_type=_normalize_object_type(row.get("type", "")),
            sort_order=int(row.get("sort_order", idx) or idx),
            params=params,
            results=_parse_json_or_empty(row.get("results", ""), None),
            is_valid=(row.get("is_valid", "").strip().lower() == "true"),
            validation_errors=_parse_json_or_empty(row.get("validation_errors", ""), None),
        )
        db.add(obj)
        obj_by_key[object_key] = obj
    await db.flush()

    imported_electrical: list[_ImportedElectricalRow] = []
    imported_by_scope: dict[tuple[UUID, int], _ImportedElectricalRow] = {}
    for row in electrical_rows:
        key = row.get("object_key", "")
        obj = obj_by_key.get(key)
        if obj is None:
            continue  # расчёт ссылается на объект не из этого CSV
        variant_number = _legacy_variant_number(row, section="electrical")
        cable_mark = row.get("cable_mark", "").strip() or None
        cable_mark_source = _normalize_source(
            row.get("cable_mark_source"),
            VALID_CABLE_MARK_SOURCES,
        ) or ("manual" if cable_mark else "auto")
        cable_type_source = (
            _normalize_source(
                row.get("cable_type_source"),
                VALID_CABLE_TYPE_SOURCES,
            )
            or "auto"
        )
        cable_snapshot = _parse_json_or_empty(row.get("cable_snapshot", ""), None)
        if isinstance(cable_snapshot, dict):
            cable_snapshot = {**cable_snapshot, "origin": "imported_project"}
        imported = _ImportedElectricalRow(
            object=obj,
            variant_number=variant_number,
            cable_type=row.get("cable_type", "").strip() or "self_regulating",
            cable_type_source=cable_type_source,
            cable_mark=cable_mark,
            cable_mark_source=cable_mark_source,
            cable_snapshot=cable_snapshot,
            params=_parse_json_or_empty(row.get("params", ""), {}),
            results=_parse_json_or_empty(row.get("results", ""), None),
        )
        scope = (obj.id, variant_number)
        if scope in imported_by_scope:
            raise ProjectImportError(
                "Дублирующийся электрический расчёт для object_key="
                f"{key!r}, variant_number={variant_number}"
            )
        imported_by_scope[scope] = imported
        imported_electrical.append(imported)

    occupied_slots = {item.variant_number for item in imported_electrical}
    variants_by_slot = await _create_imported_variants(db, project, occupied_slots)

    for variant_number, variant in variants_by_slot.items():
        for obj in obj_by_key.values():
            imported = imported_by_scope.get((obj.id, variant_number))
            system_type, assignment_state = _legacy_assignment_projection(
                imported.cable_type if imported is not None else None,
                imported.cable_mark if imported is not None else None,
                imported.results if imported is not None else None,
            )
            db.add(
                ElectricalVariantObject(
                    project_id=project.id,
                    electrical_variant_id=variant.id,
                    object_id=obj.id,
                    system_type=system_type,
                    assignment_state=assignment_state,
                    requested_cable_type=(imported.cable_type if imported is not None else None),
                    object_version_snapshot=obj.version,
                    diagnostics=_assignment_diagnostics(variant_number, imported),
                )
            )
    if variants_by_slot and obj_by_key:
        await db.flush()

    for imported in imported_electrical:
        variant = variants_by_slot[imported.variant_number]
        db.add(
            ElectricalCalculation(
                project_id=project.id,
                object_id=imported.object.id,
                variant_number=imported.variant_number,
                electrical_variant_id=variant.id,
                cable_type=imported.cable_type,
                cable_type_source=imported.cable_type_source,
                cable_mark=imported.cable_mark,
                cable_mark_source=imported.cable_mark_source,
                cable_snapshot=imported.cable_snapshot,
                params=imported.params,
                results=imported.results,
            )
        )

async def _create_imported_variants_v3(
    db: AsyncSession,
    project: Project,
    variant_rows: list[dict[str, str]],
) -> dict[str, ElectricalVariant]:
    """Create named ЭР from v3 electrical_variants section."""
    if not variant_rows:
        return {}
    if len(variant_rows) > 5:
        raise ProjectImportError("В секции electrical_variants больше 5 ЭР")

    variants_by_key: dict[str, ElectricalVariant] = {}
    seen_names: set[str] = set()
    active_count = 0
    pending_copied_from: list[tuple[ElectricalVariant, str]] = []

    for sort_idx, row in enumerate(variant_rows):
        variant_key = (row.get("variant_key") or "").strip()
        if not variant_key:
            raise ProjectImportError("В electrical_variants пустой variant_key")
        if variant_key in variants_by_key:
            raise ProjectImportError(f"Дублирующийся variant_key: {variant_key!r}")
        name = (row.get("name") or "").strip() or f"ЭР{sort_idx + 1}"
        name_normalized = name.casefold()
        if name_normalized in seen_names:
            raise ProjectImportError(f"Конфликт имени ЭР после trim+casefold: {name!r}")
        seen_names.add(name_normalized)

        is_active = (row.get("is_active") or "").strip().lower() == "true"
        if is_active:
            active_count += 1
        legacy_raw = (row.get("legacy_variant_number") or "").strip()
        legacy_number: int | None
        if legacy_raw == "":
            legacy_number = None
        else:
            try:
                legacy_number = int(legacy_raw)
            except ValueError as exc:
                raise ProjectImportError(
                    f"Некорректный legacy_variant_number {legacy_raw!r}"
                ) from exc
            if legacy_number not in LEGACY_VARIANT_NUMBERS:
                raise ProjectImportError(
                    f"legacy_variant_number должен быть 1..5 или пустым: {legacy_number}"
                )

        try:
            sort_order = int((row.get("sort_order") or sort_idx) or sort_idx)
        except ValueError as exc:
            raise ProjectImportError(
                f"Некорректный sort_order в electrical_variants: {row.get('sort_order')!r}"
            ) from exc

        variant = ElectricalVariant(
            project_id=project.id,
            name=name,
            name_normalized=name_normalized,
            sort_order=sort_order,
            is_active=is_active,
            legacy_variant_number=legacy_number,
        )
        db.add(variant)
        variants_by_key[variant_key] = variant
        copied_from_key = (row.get("copied_from_key") or "").strip()
        if copied_from_key:
            pending_copied_from.append((variant, copied_from_key))

    if variants_by_key and active_count == 0:
        # Guarantee exactly one active when any ER exist.
        first = min(variants_by_key.values(), key=lambda item: (item.sort_order, item.name))
        first.is_active = True
    elif active_count > 1:
        raise ProjectImportError("В electrical_variants больше одного is_active=true")

    project.electrical_initialized_at = datetime.now(UTC)
    await db.flush()

    for variant, copied_from_key in pending_copied_from:
        source = variants_by_key.get(copied_from_key)
        if source is None:
            raise ProjectImportError(
                f"copied_from_key ссылается на неизвестный variant_key: {copied_from_key!r}"
            )
        variant.copied_from_id = source.id
    if pending_copied_from:
        await db.flush()
    return variants_by_key


async def _apply_project_data_v3(
    db: AsyncSession,
    project: Project,
    objects_rows: list[dict[str, str]],
    variant_rows: list[dict[str, str]],
    assignment_rows: list[dict[str, str]],
    electrical_rows: list[dict[str, str]],
    spec_rows: list[dict[str, str]],
) -> None:
    """Import schema v3 graph: named ЭР, assignments, calculations, specifications."""
    # Objects first.
    obj_by_key: dict[str, ProjectObject] = {}
    for idx, row in enumerate(objects_rows):
        params = _parse_json_or_empty(row.get("params", ""), {})
        _reject_imported_legacy_specification_params(params)
        if row.get("name") and "name" not in params:
            params["name"] = row["name"]
        object_key = (row.get("object_key") or "").strip()
        if not object_key:
            raise ProjectImportError("В секции objects отсутствует обязательный object_key")
        if object_key in obj_by_key:
            raise ProjectImportError(
                "Дублирующийся object_key в секции objects: "
                f"{object_key!r}."
            )
        obj = ProjectObject(
            project_id=project.id,
            object_type=_normalize_object_type(row.get("type", "")),
            sort_order=int(row.get("sort_order", idx) or idx),
            params=params,
            results=_parse_json_or_empty(row.get("results", ""), None),
            is_valid=(row.get("is_valid", "").strip().lower() == "true"),
            validation_errors=_parse_json_or_empty(row.get("validation_errors", ""), None),
        )
        db.add(obj)
        obj_by_key[object_key] = obj
    await db.flush()

    variants_by_key = await _create_imported_variants_v3(db, project, variant_rows)

    # Assignments: explicit matrix; if absent, create unassigned for every object×ER.
    seen_assignment: set[tuple[str, str]] = set()
    if assignment_rows:
        for row in assignment_rows:
            variant_key = (row.get("variant_key") or "").strip()
            object_key = (row.get("object_key") or "").strip()
            if variant_key not in variants_by_key:
                raise ProjectImportError(
                    f"electrical_assignments: неизвестный variant_key {variant_key!r}"
                )
            if object_key not in obj_by_key:
                raise ProjectImportError(
                    f"electrical_assignments: неизвестный object_key {object_key!r}"
                )
            scope = (variant_key, object_key)
            if scope in seen_assignment:
                raise ProjectImportError(
                    f"Дублирующееся assignment для {variant_key!r}/{object_key!r}"
                )
            seen_assignment.add(scope)
            system_type = (row.get("system_type") or "").strip().lower() or None
            if system_type is not None and system_type not in VALID_ASSIGNMENT_SYSTEM_TYPES:
                raise ProjectImportError(f"Некорректный system_type: {system_type!r}")
            state = (row.get("assignment_state") or "unassigned").strip().lower()
            if state not in VALID_ASSIGNMENT_STATES:
                raise ProjectImportError(f"Некорректный assignment_state: {state!r}")
            if state == "unassigned":
                system_type = None
            requested = (row.get("requested_cable_type") or "").strip() or None
            variant = variants_by_key[variant_key]
            obj = obj_by_key[object_key]
            db.add(
                ElectricalVariantObject(
                    project_id=project.id,
                    electrical_variant_id=variant.id,
                    object_id=obj.id,
                    system_type=system_type,
                    assignment_state=state,
                    requested_cable_type=requested,
                    object_version_snapshot=obj.version,
                    diagnostics={
                        "import_schema_version": SCHEMA_VERSION,
                        "sections_status": "not_ready",
                        "sections_error_code": SECTIONS_NOT_READY_CODE,
                    },
                )
            )
    else:
        for _variant_key, variant in variants_by_key.items():
            for _object_key, obj in obj_by_key.items():
                db.add(
                    ElectricalVariantObject(
                        project_id=project.id,
                        electrical_variant_id=variant.id,
                        object_id=obj.id,
                        system_type=None,
                        assignment_state="unassigned",
                        requested_cable_type=None,
                        object_version_snapshot=obj.version,
                        diagnostics={
                            "import_schema_version": SCHEMA_VERSION,
                            "sections_status": "not_ready",
                            "sections_error_code": SECTIONS_NOT_READY_CODE,
                        },
                    )
                )
    if variants_by_key and obj_by_key:
        await db.flush()

    # Electrical calculations keyed by variant_key.
    calc_scopes: set[tuple[str, str]] = set()
    for row in electrical_rows:
        variant_key = (row.get("variant_key") or "").strip()
        object_key = (row.get("object_key") or "").strip()
        if not variant_key or not object_key:
            raise ProjectImportError(
                "В секции electrical обязательны variant_key и object_key"
            )
        if variant_key not in variants_by_key:
            raise ProjectImportError(
                f"electrical: неизвестный variant_key {variant_key!r}"
            )
        obj = obj_by_key.get(object_key)
        if obj is None:
            raise ProjectImportError(
                f"electrical: неизвестный object_key {object_key!r}"
            )
        scope = (variant_key, object_key)
        if scope in calc_scopes:
            raise ProjectImportError(
                f"Дублирующийся electrical для {variant_key!r}/{object_key!r}"
            )
        calc_scopes.add(scope)
        variant = variants_by_key[variant_key]
        legacy_number = variant.legacy_variant_number
        if legacy_number is None:
            # Expand-window ER5 without legacy slot cannot persist calculation yet
            # under composite FK constraints — fail the whole project import.
            raise ProjectImportError(
                f"ЭР {variant_key!r} без legacy_variant_number не может импортировать "
                "electrical до UUID-only cutover (Phase 5 residual)"
            )
        cable_mark = row.get("cable_mark", "").strip() or None
        cable_mark_source = _normalize_source(
            row.get("cable_mark_source"),
            VALID_CABLE_MARK_SOURCES,
        ) or ("manual" if cable_mark else "auto")
        cable_type_source = (
            _normalize_source(row.get("cable_type_source"), VALID_CABLE_TYPE_SOURCES) or "auto"
        )
        cable_snapshot = _parse_json_or_empty(row.get("cable_snapshot", ""), None)
        if isinstance(cable_snapshot, dict):
            cable_snapshot = {**cable_snapshot, "origin": "imported_project"}
        db.add(
            ElectricalCalculation(
                project_id=project.id,
                object_id=obj.id,
                variant_number=legacy_number,
                electrical_variant_id=variant.id,
                cable_type=row.get("cable_type", "").strip() or "self_regulating",
                cable_type_source=cable_type_source,
                cable_mark=cable_mark,
                cable_mark_source=cable_mark_source,
                cable_snapshot=cable_snapshot,
                params=_parse_json_or_empty(row.get("params", ""), {}),
                results=_parse_json_or_empty(row.get("results", ""), None),
            )
        )

    # UUID identity: variant_key and/or electrical_variant_id, same-ER when both.
    # Duplicates are rejected after resolution (CANON-07 / SPEC-FINAL-01).
    for variant, items, snapshot, variant_key, electrical_variant_id_raw in (
        _validate_specification_section_v3(spec_rows, variants_by_key)
    ):
        # Phase 4 sections are not reconstructed from CSV; always mark stale.
        # Items and snapshot remain available as history but cannot become current.
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
                    "import_schema_version": SCHEMA_VERSION,
                    "variant_key": variant_key or electrical_variant_id_raw,
                    "electrical_variant_id": str(variant.id),
                    "sections_status": "not_ready",
                    "error_code": SECTIONS_NOT_READY_CODE,
                },
            )
        )


async def import_project(db: AsyncSession, raw: bytes, principal: CurrentPrincipal) -> Project:
    """Одиночный импорт текущего single-формата с секцией `metadata`."""
    sections = _parse_sections(raw)
    schema_version = _require_schema_version(sections, "metadata")
    meta = _section_key_values(sections, "metadata")
    if not meta.get("name"):
        raise ProjectImportError("В секции [SECTION];metadata пустое имя проекта")

    objects_rows = _rows_to_dicts(sections.get("objects", []))
    electrical_rows = _rows_to_dicts(sections.get("electrical", []))
    spec_rows = _rows_to_dicts(sections.get("specifications", []))
    variant_rows = _rows_to_dicts(sections.get("electrical_variants", []))
    assignment_rows = _rows_to_dicts(sections.get("electrical_assignments", []))
    electrical_settings_rows = _rows_to_dicts(sections.get("electrical_settings", []))
    # Reject invalid specification payloads before any guest delete or owner insert.
    if schema_version == LEGACY_SCHEMA_VERSION:
        _occupied_legacy_slots(electrical_rows, spec_rows)
        _validate_specification_section_before_mutation(
            schema_version=schema_version,
            spec_rows=spec_rows,
            variant_rows=variant_rows,
        )
    else:
        if not variant_rows and (electrical_rows or spec_rows):
            raise ProjectImportError(
                "schema_version=3 требует секцию electrical_variants, "
                "если есть electrical/specifications"
            )
        _validate_specification_section_before_mutation(
            schema_version=schema_version,
            spec_rows=spec_rows,
            variant_rows=variant_rows,
        )

    if principal.role == "guest" and _spec_rows_contain_manual_items(spec_rows):
        raise ProjectImportError(
            "Гостю запрещён импорт спецификации с ручными (manual) позициями (PDL-ER-41)"
        )

    # Nested transaction: any domain failure after staging keeps outer session clean
    # (guest original project remains; owner partial insert is rolled back).
    try:
        async with db.begin_nested():
            if principal.role == "guest":
                existing = await db.execute(
                    select(Project).where(Project.session_id == principal.session_id)
                )
                for p in existing.scalars().all():
                    await db.delete(p)
                await db.flush()
                project = Project(
                    name=meta.get("name", "Импорт"),
                    description=meta.get("description") or None,
                    task_number=meta.get("task_number") or None,
                    status=meta.get("status", "draft") or "draft",
                    session_id=principal.session_id,
                )
            elif principal.role in ("employee", "admin"):
                project = Project(
                    name=meta.get("name", "Импорт"),
                    description=meta.get("description") or None,
                    task_number=meta.get("task_number") or None,
                    status=meta.get("status", "draft") or "draft",
                    user_id=principal.user_id,
                )
            else:
                raise ProjectAccessError("Нет доступа")

            _apply_imported_specification_settings(
                project,
                meta.get("specification_settings"),
                meta.get("specification_settings_version"),
            )
            _apply_imported_display_settings(
                project,
                meta.get("display_settings"),
                meta.get("display_settings_version"),
            )
            db.add(project)
            await db.flush()
            _apply_imported_electrical_settings(db, project, electrical_settings_rows)

            if schema_version == LEGACY_SCHEMA_VERSION:
                await _apply_project_data(
                    db,
                    project,
                    objects_rows,
                    electrical_rows,
                    spec_rows,
                )
            else:
                await _apply_project_data_v3(
                    db,
                    project,
                    objects_rows,
                    variant_rows,
                    assignment_rows,
                    electrical_rows,
                    spec_rows,
                )
    except ProjectImportError:
        raise
    except ProjectAccessError:
        raise

    await db.commit()
    await db.refresh(project)
    return project


async def import_projects_bulk(
    db: AsyncSession, raw: bytes, principal: CurrentPrincipal
) -> dict[str, Any]:
    """Пакетный импорт текущего bulk-формата. Только для сотрудника."""
    if principal.role not in ("employee", "admin"):
        raise ProjectAccessError("Пакетный импорт доступен только сотруднику")

    sections = _parse_sections(raw)
    schema_version = _require_schema_version(sections, "meta")
    projects_rows = _rows_to_dicts(sections.get("projects", []))
    if not projects_rows:
        raise ProjectImportError("Отсутствует секция [SECTION];projects")

    def by_project_key(name: str) -> dict[str, list[dict[str, str]]]:
        grouped: dict[str, list[dict[str, str]]] = defaultdict(list)
        for row in _rows_to_dicts(sections.get(name, [])):
            key = row.get("project_key", "")
            if key:
                grouped[key].append(row)
        return grouped

    objects_by_key = by_project_key("objects")
    electrical_by_key = by_project_key("electrical")
    specs_by_key = by_project_key("specifications")
    variants_by_key = by_project_key("electrical_variants")
    assignments_by_key = by_project_key("electrical_assignments")
    electrical_settings_by_key = by_project_key("electrical_settings")

    imported = 0
    errors: list[dict[str, Any]] = []

    for row in projects_rows:
        key = row.get("project_key", "").strip()
        name = row.get("name", "").strip()
        if not key or not name:
            errors.append({"project_key": key, "error": "пустой project_key или name"})
            continue
        task_number = row.get("task_number", "").strip() or None

        # Конфликт по task_number у текущего сотрудника → добавить суффикс.
        # `.first()` — т.к. у сотрудника могут быть несколько проектов с одним
        # task_number (из предыдущих импортов — task_number не unique-constraint).
        if task_number:
            conflict = await db.execute(
                select(Project.id).where(
                    Project.user_id == principal.user_id,
                    Project.task_number == task_number,
                )
            )
            if conflict.first() is not None:
                name = f"{name} (импорт)"
                task_number = f"{task_number}-импорт"

        try:
            project_spec_rows = specs_by_key.get(key, [])
            project_variant_rows = variants_by_key.get(key, [])
            _validate_specification_section_before_mutation(
                schema_version=schema_version,
                spec_rows=project_spec_rows,
                variant_rows=project_variant_rows,
            )
            async with db.begin_nested():
                project = Project(
                    name=name,
                    description=row.get("description") or None,
                    task_number=task_number,
                    status=row.get("status", "draft") or "draft",
                    user_id=principal.user_id,
                )
                _apply_imported_specification_settings(
                    project,
                    row.get("specification_settings"),
                    row.get("specification_settings_version"),
                )
                _apply_imported_display_settings(
                    project,
                    row.get("display_settings"),
                    row.get("display_settings_version"),
                )
                db.add(project)
                await db.flush()
                _apply_imported_electrical_settings(
                    db, project, electrical_settings_by_key.get(key, [])
                )
                if schema_version == LEGACY_SCHEMA_VERSION:
                    await _apply_project_data(
                        db,
                        project,
                        objects_by_key.get(key, []),
                        electrical_by_key.get(key, []),
                        project_spec_rows,
                    )
                else:
                    await _apply_project_data_v3(
                        db,
                        project,
                        objects_by_key.get(key, []),
                        project_variant_rows,
                        assignments_by_key.get(key, []),
                        electrical_by_key.get(key, []),
                        project_spec_rows,
                    )
            imported += 1
        except Exception as exc:
            errors.append({"project_key": key, "error": str(exc)})
            continue

    await db.commit()
    return {"imported": imported, "errors": errors}
