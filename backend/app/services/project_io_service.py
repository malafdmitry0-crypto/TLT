"""Экспорт / импорт проектов в CSV.

Формат: «секционный CSV» с маркерами `[SECTION];<имя>`. В одном файле живут:
metadata, objects, electrical, specifications. Для пакетного импорта/экспорта
добавляется секция `projects` с `project_key`, который связывает записи
между секциями.

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
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import CurrentPrincipal
from app.models.electrical_calculation import ElectricalCalculation
from app.models.electrical_variant import ElectricalVariant, ElectricalVariantObject
from app.models.project import Project
from app.models.project_object import ProjectObject
from app.models.specification import Specification
from app.services.project_service import (
    ProjectAccessError,
    ProjectNotFoundError,
    ProjectService,
)
from app.services.spreadsheet_safety import safe_spreadsheet_cell

logger = logging.getLogger("heatcalc.project_io")

SCHEMA_VERSION = "2"
DELIMITER = ";"  # экспорт всегда `;`; импорт определяет сам
VALID_CABLE_TYPE_SOURCES = {"auto", "manual", "bulk"}
VALID_CABLE_MARK_SOURCES = {"auto", "manual"}
LEGACY_VARIANT_NUMBERS = range(1, 5)
SECTIONS_NOT_READY_CODE = "ELECTRICAL_SECTIONS_NOT_READY"


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
    project_key: str | None = None,
) -> None:
    """Записывает секции одного проекта. Если `project_key` задан — добавляет
    его в каждую строку (для пакетного экспорта)."""
    prefix = [project_key] if project_key is not None else []

    if project_key is None:
        # одиночный экспорт — metadata в отдельной секции
        _write_section(w, "metadata")
        _write_row(w, ["key", "value"])
        _write_row(w, ["schema_version", SCHEMA_VERSION])
        _write_row(w, ["name", project.name])
        _write_row(w, ["task_number", project.task_number or ""])
        _write_row(w, ["description", project.description or ""])
        _write_row(w, ["status", project.status])
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

    if electrical:
        _write_section(w, "electrical")
        header = [
            "object_key",
            "variant_number",
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
            row = [
                obj_key_by_id.get(calc.object_id, str(calc.object_id)),
                calc.variant_number,
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
        header = ["variant_number", "items"]
        if project_key is not None:
            header = ["project_key", *header]
        _write_row(w, header)
        for spec in specifications:
            row = [spec.variant_number, json.dumps(spec.items or [], ensure_ascii=False)]
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

    buf = io.StringIO()
    w = csv.writer(buf, delimiter=DELIMITER, quoting=csv.QUOTE_MINIMAL)
    _dump_project_to_writer(w, project, objects, electrical, specs)
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
    _write_row(w, ["project_key", "name", "task_number", "description", "status"])
    for key, project in projects:
        _write_row(
            w,
            [
                key,
                project.name,
                project.task_number or "",
                project.description or "",
                project.status,
            ],
        )
    _write_row(w, [])

    objects_by_project: dict[UUID, list[ProjectObject]] = defaultdict(list)
    electrical_by_project: dict[UUID, list[ElectricalCalculation]] = defaultdict(list)
    specs_by_project: dict[UUID, list[Specification]] = defaultdict(list)

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
            .order_by(Specification.project_id, Specification.variant_number)
        )
        for spec in specs_result.scalars():
            specs_by_project[spec.project_id].append(spec)

    for key, project in projects:
        _dump_project_to_writer(
            w,
            project,
            objects_by_project[project.id],
            electrical_by_project[project.id],
            specs_by_project[project.id],
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


def _require_schema_version(sections: dict[str, list[list[str]]], name: str) -> None:
    meta = _section_key_values(sections, name)
    version = (meta.get("schema_version") or "").strip()
    if version != SCHEMA_VERSION:
        raise ProjectImportError(
            f"Неподдерживаемая версия CSV-схемы: {version or 'не указана'}. "
            f"Ожидается schema_version={SCHEMA_VERSION}."
        )


def _parse_json_or_empty(raw: str, default: Any) -> Any:
    raw = (raw or "").strip()
    if not raw:
        return default
    try:
        return json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ProjectImportError(f"Некорректный JSON: {exc}") from exc


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
            f"variant_number в секции {section} должен быть в диапазоне 1..4: "
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
    variant_number: int,
    imported: _ImportedElectricalRow | None,
) -> dict[str, Any]:
    results = imported.results if imported is not None else None
    result = results or {}
    values = {
        "import_schema_version": SCHEMA_VERSION,
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
    # Validate the complete v2 payload before staging graph writes. Electrical
    # rows with an unknown object_key retain the legacy "skip" behaviour and
    # therefore must not create an otherwise orphaned ER slot.
    _occupied_legacy_slots(electrical_rows, spec_rows)

    # объекты
    obj_by_key: dict[str, ProjectObject] = {}
    for idx, row in enumerate(objects_rows):
        params = _parse_json_or_empty(row.get("params", ""), {})
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
            object_type=row.get("type", "").strip() or "pipe",
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
    occupied_slots.update(
        _legacy_variant_number(row, section="specifications") for row in spec_rows
    )
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

    # specifications
    for row in spec_rows:
        variant_number = _legacy_variant_number(row, section="specifications")
        variant = variants_by_slot[variant_number]
        spec = Specification(
            project_id=project.id,
            variant_number=variant_number,
            electrical_variant_id=variant.id,
            items=_parse_json_or_empty(row.get("items", ""), []),
            is_stale=True,
            stale_reason="electrical_sections_not_ready",
            stale_at=datetime.now(UTC),
            stale_details={
                "import_schema_version": SCHEMA_VERSION,
                "legacy_variant_number": variant_number,
                "sections_status": "not_ready",
                "error_code": SECTIONS_NOT_READY_CODE,
            },
        )
        db.add(spec)


async def import_project(db: AsyncSession, raw: bytes, principal: CurrentPrincipal) -> Project:
    """Одиночный импорт текущего single-формата с секцией `metadata`."""
    sections = _parse_sections(raw)
    _require_schema_version(sections, "metadata")
    meta = _section_key_values(sections, "metadata")
    if not meta.get("name"):
        raise ProjectImportError("В секции [SECTION];metadata пустое имя проекта")

    objects_rows = _rows_to_dicts(sections.get("objects", []))
    electrical_rows = _rows_to_dicts(sections.get("electrical", []))
    spec_rows = _rows_to_dicts(sections.get("specifications", []))
    # Guest import replaces its current project, so reject an invalid slot before
    # staging any delete or insert in the session.
    _occupied_legacy_slots(electrical_rows, spec_rows)

    if principal.role == "guest":
        # Замещаем единственный авто-проект
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

    db.add(project)
    await db.flush()

    await _apply_project_data(
        db,
        project,
        objects_rows,
        electrical_rows,
        spec_rows,
    )
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
    _require_schema_version(sections, "meta")
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
            async with db.begin_nested():
                project = Project(
                    name=name,
                    description=row.get("description") or None,
                    task_number=task_number,
                    status=row.get("status", "draft") or "draft",
                    user_id=principal.user_id,
                )
                db.add(project)
                await db.flush()
                await _apply_project_data(
                    db,
                    project,
                    objects_by_key.get(key, []),
                    electrical_by_key.get(key, []),
                    specs_by_key.get(key, []),
                )
            imported += 1
        except Exception as exc:
            errors.append({"project_key": key, "error": str(exc)})
            continue

    await db.commit()
    return {"imported": imported, "errors": errors}
