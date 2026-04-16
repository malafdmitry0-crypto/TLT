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
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import CurrentPrincipal
from app.models.electrical_calculation import ElectricalCalculation
from app.models.project import Project
from app.models.project_object import ProjectObject
from app.models.specification import Specification
from app.services.project_service import (
    ProjectAccessError,
    ProjectService,
)

logger = logging.getLogger("heatcalc.project_io")

SCHEMA_VERSION = "1"
DELIMITER = ";"  # экспорт всегда `;`; импорт определяет сам


class ProjectImportError(Exception):
    """Ошибка импорта проекта."""


# ----------------------------------------------------------------------------
# Экспорт
# ----------------------------------------------------------------------------


def _write_section(w: csv._writer, name: str) -> None:
    w.writerow(["[SECTION]", name])


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
        w.writerow(["key", "value"])
        w.writerow(["schema_version", SCHEMA_VERSION])
        w.writerow(["name", project.name])
        w.writerow(["task_number", project.task_number or ""])
        w.writerow(["description", project.description or ""])
        w.writerow(["status", project.status])
        w.writerow([])

    _write_section(w, "objects")
    header = ["type", "name", "sort_order", "params", "results", "is_valid", "validation_errors"]
    if project_key is not None:
        header = ["project_key", *header]
    w.writerow(header)

    # Авто-имя объекта нужно для связи с electrical/specifications
    obj_key_by_id: dict[UUID, str] = {}
    for obj in sorted(objects, key=lambda o: o.sort_order):
        obj_key = (obj.params or {}).get("name") or str(obj.id)
        obj_key_by_id[obj.id] = obj_key
        row = [
            obj.object_type,
            obj_key,
            obj.sort_order,
            json.dumps(obj.params or {}, ensure_ascii=False),
            json.dumps(obj.results, ensure_ascii=False) if obj.results is not None else "",
            "true" if obj.is_valid else "false",
            json.dumps(obj.validation_errors, ensure_ascii=False)
            if obj.validation_errors is not None
            else "",
        ]
        w.writerow(prefix + row)
    w.writerow([])

    if electrical:
        _write_section(w, "electrical")
        header = ["object_key", "variant_number", "cable_type", "cable_mark", "params", "results"]
        if project_key is not None:
            header = ["project_key", *header]
        w.writerow(header)
        for calc in electrical:
            row = [
                obj_key_by_id.get(calc.object_id, str(calc.object_id)),
                calc.variant_number,
                calc.cable_type,
                calc.cable_mark or "",
                json.dumps(calc.params or {}, ensure_ascii=False),
                json.dumps(calc.results, ensure_ascii=False) if calc.results is not None else "",
            ]
            w.writerow(prefix + row)
        w.writerow([])

    if specifications:
        _write_section(w, "specifications")
        header = ["variant_number", "items"]
        if project_key is not None:
            header = ["project_key", *header]
        w.writerow(header)
        for spec in specifications:
            row = [spec.variant_number, json.dumps(spec.items or [], ensure_ascii=False)]
            w.writerow(prefix + row)
        w.writerow([])


async def export_project(
    db: AsyncSession, project_id: UUID, principal: CurrentPrincipal
) -> tuple[str, bytes]:
    """Экспортирует проект в CSV. Возвращает (suggested_filename, csv_bytes)."""
    service = ProjectService(db)
    project = await service.get_project(project_id, principal)

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
    projects: list[tuple[str, Project]] = []
    for idx, pid in enumerate(project_ids, start=1):
        project = await service.get_project(pid, principal)
        projects.append((f"p{idx}", project))

    w.writerow(["[SECTION]", "meta"])
    w.writerow(["key", "value"])
    w.writerow(["schema_version", SCHEMA_VERSION])
    w.writerow([])

    w.writerow(["[SECTION]", "projects"])
    w.writerow(["project_key", "name", "task_number", "description", "status"])
    for key, project in projects:
        w.writerow(
            [
                key,
                project.name,
                project.task_number or "",
                project.description or "",
                project.status,
            ]
        )
    w.writerow([])

    for key, project in projects:
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
                    select(ElectricalCalculation).where(
                        ElectricalCalculation.project_id == project.id
                    )
                )
            ).scalars()
        )
        specs = list(
            (
                await db.execute(
                    select(Specification).where(Specification.project_id == project.id)
                )
            ).scalars()
        )
        _dump_project_to_writer(w, project, objects, electrical, specs, project_key=key)

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


def _parse_json_or_empty(raw: str, default: Any) -> Any:
    raw = (raw or "").strip()
    if not raw:
        return default
    try:
        return json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ProjectImportError(f"Некорректный JSON: {exc}") from exc


async def _apply_project_data(
    db: AsyncSession,
    project: Project,
    objects_rows: list[dict[str, str]],
    electrical_rows: list[dict[str, str]],
    spec_rows: list[dict[str, str]],
) -> None:
    """Заполняет пустой `project` данными из распарсенных секций."""
    # объекты
    obj_by_key: dict[str, ProjectObject] = {}
    for idx, row in enumerate(objects_rows):
        params = _parse_json_or_empty(row.get("params", ""), {})
        if row.get("name") and "name" not in params:
            params["name"] = row["name"]
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
        obj_by_key[row.get("name") or f"obj{idx}"] = obj
    await db.flush()

    # electrical
    for row in electrical_rows:
        key = row.get("object_key", "")
        obj = obj_by_key.get(key)
        if obj is None:
            continue  # объект мог не сохраниться — пропускаем расчёт
        calc = ElectricalCalculation(
            project_id=project.id,
            object_id=obj.id,
            variant_number=int(row.get("variant_number", "1") or "1"),
            cable_type=row.get("cable_type", "").strip() or "self_regulating",
            cable_mark=row.get("cable_mark", "").strip() or None,
            params=_parse_json_or_empty(row.get("params", ""), {}),
            results=_parse_json_or_empty(row.get("results", ""), None),
        )
        db.add(calc)

    # specifications
    for row in spec_rows:
        spec = Specification(
            project_id=project.id,
            variant_number=int(row.get("variant_number", "1") or "1"),
            items=_parse_json_or_empty(row.get("items", ""), []),
        )
        db.add(spec)


def _first_project_from_bulk(
    sections: dict[str, list[list[str]]],
) -> tuple[dict[str, str], dict[str, list[dict[str, str]]]] | None:
    """Извлекает первый проект из bulk-формата (`[SECTION];projects`).

    Возвращает (meta_как_словарь, {«objects»: rows, «electrical»: rows, «specifications»: rows}),
    отфильтрованные по первому `project_key`. Если секции `projects` нет — `None`.
    """
    rows = _rows_to_dicts(sections.get("projects", []))
    if not rows:
        return None
    first = rows[0]
    key = first.get("project_key", "").strip()
    meta: dict[str, str] = {
        "name": first.get("name", ""),
        "task_number": first.get("task_number", ""),
        "description": first.get("description", ""),
        "status": first.get("status", "draft"),
    }
    child: dict[str, list[dict[str, str]]] = {"objects": [], "electrical": [], "specifications": []}
    if key:
        for section_name in child:
            child[section_name] = [
                r
                for r in _rows_to_dicts(sections.get(section_name, []))
                if r.get("project_key", "").strip() == key
            ]
    return meta, child


async def import_project(db: AsyncSession, raw: bytes, principal: CurrentPrincipal) -> Project:
    """Одиночный импорт. Принимает оба формата (single с `metadata` и bulk с `projects` —
    тогда берётся первый проект). Для гостя замещает авто-проект; для сотрудника — создаёт новый.
    """
    sections = _parse_sections(raw)
    meta_rows = _rows_to_dicts(sections.get("metadata", []))
    meta = {r["key"]: r["value"] for r in meta_rows if "key" in r}

    # Если metadata нет — пробуем bulk-формат (первый проект)
    bulk_child: dict[str, list[dict[str, str]]] | None = None
    if not meta.get("name"):
        bulk = _first_project_from_bulk(sections)
        if bulk is None:
            raise ProjectImportError(
                "В файле отсутствует секция [SECTION];metadata (одиночный экспорт) "
                "или [SECTION];projects (пакетный экспорт)"
            )
        meta, bulk_child = bulk
        if not meta.get("name"):
            raise ProjectImportError("В секции [SECTION];projects пустое имя первого проекта")

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

    if bulk_child is not None:
        await _apply_project_data(
            db,
            project,
            bulk_child["objects"],
            bulk_child["electrical"],
            bulk_child["specifications"],
        )
    else:
        await _apply_project_data(
            db,
            project,
            _rows_to_dicts(sections.get("objects", [])),
            _rows_to_dicts(sections.get("electrical", [])),
            _rows_to_dicts(sections.get("specifications", [])),
        )
    await db.commit()
    await db.refresh(project)
    return project


async def import_projects_bulk(
    db: AsyncSession, raw: bytes, principal: CurrentPrincipal
) -> dict[str, Any]:
    """Пакетный импорт. Только для сотрудника. Конфликт по task_number → суффикс."""
    if principal.role not in ("employee", "admin"):
        raise ProjectAccessError("Пакетный импорт доступен только сотруднику")

    sections = _parse_sections(raw)
    projects_rows = _rows_to_dicts(sections.get("projects", []))

    # Если `projects` нет, но есть `metadata` — это одиночный экспорт; «виртуализуем» в 1 проект.
    if not projects_rows:
        meta_rows = _rows_to_dicts(sections.get("metadata", []))
        meta = {r["key"]: r["value"] for r in meta_rows if "key" in r}
        if not meta.get("name"):
            raise ProjectImportError(
                "Отсутствует секция [SECTION];projects (пакетный) "
                "или [SECTION];metadata (одиночный)"
            )
        virtual_key = "p1"
        projects_rows = [
            {
                "project_key": virtual_key,
                "name": meta.get("name", ""),
                "task_number": meta.get("task_number", ""),
                "description": meta.get("description", ""),
                "status": meta.get("status", "draft"),
            }
        ]

        # Одиночные секции без `project_key` → все относятся к виртуальному проекту.
        def by_project_key(name: str) -> dict[str, list[dict[str, str]]]:
            rows = _rows_to_dicts(sections.get(name, []))
            return {virtual_key: rows}
    else:
        # Пакетный формат — как раньше, фильтруем по project_key.
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

    await db.commit()
    return {"imported": imported, "errors": errors}
