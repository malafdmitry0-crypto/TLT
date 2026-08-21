"""Импорт объектов проекта из Excel."""

from __future__ import annotations

import asyncio
import hashlib
import io
import json
import re
import zipfile
from dataclasses import dataclass
from typing import Any, Literal
from uuid import UUID

from openpyxl import load_workbook
from sqlalchemy import delete, func, select, update
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import use_fast_commit_for_current_transaction
from app.core.dependencies import CurrentPrincipal
from app.models.electrical_calculation import ElectricalCalculation
from app.models.project import Project
from app.models.project_object import ProjectObject
from app.models.specification import Specification
from app.services.object_spreadsheet.mapping import TYPE_ALIASES, _norm
from app.services.object_spreadsheet.pipe_mapping import _build_pipe_params
from app.services.object_spreadsheet.tank_mapping import _build_tank_params
from app.services.project_object_params import (
    normalize_project_object_params,
    reject_legacy_specification_object_params,
    validate_and_canonicalize_project_object_params,
)
from app.services.project_service import (
    ProjectAccessError,
    ProjectNotFoundError,
    ProjectService,
)
from app.services.spreadsheet_schema import (
    PIPE_HEADERS,
    TANK_HEADERS,
    TYPE_HEADERS,
)

PIPE_SHEET_NAMES = {"трубопроводы", "трубы", "pipes"}
TANK_SHEET_NAMES = {"резервуары", "ёмкости", "емкости", "tanks"}
IMPORT_COMMIT_BATCH_SIZE = 25
ImportMode = Literal["append", "merge", "replace"]


@dataclass(frozen=True)
class PreparedImportRows:
    rows: list[tuple[dict[str, Any], dict[str, Any]]]
    errors: list[dict[str, Any]]
    validation_errors: list[dict[str, Any]]
    invalid: int


# Алиасы для колонки «Тип» в CSV (различает трубу/резервуар в одном файле)


class ExcelImportError(Exception):
    """Ошибка импорта Excel/CSV."""


def _validate_xlsx_archive(content: bytes) -> None:
    try:
        with zipfile.ZipFile(io.BytesIO(content)) as archive:
            infos = archive.infolist()
            if len(infos) > settings.MAX_XLSX_FILES:
                raise ExcelImportError(
                    f"XLSX содержит слишком много внутренних файлов: {len(infos)}"
                )
            total_uncompressed = sum(info.file_size for info in infos)
            if total_uncompressed > settings.MAX_XLSX_UNCOMPRESSED_BYTES:
                raise ExcelImportError(
                    "XLSX слишком большой после распаковки " f"({total_uncompressed // 1024} КБ)"
                )
            for info in infos:
                if info.compress_size and info.file_size / info.compress_size > 100:
                    raise ExcelImportError(
                        "XLSX похож на zip-bomb: слишком высокий коэффициент сжатия"
                    )
    except zipfile.BadZipFile as exc:
        raise ExcelImportError("Файл не является корректным XLSX-архивом") from exc


def _read_sheet(ws: Any, header_map: dict[str, str]) -> list[dict[str, Any]]:
    """Читает лист, мапит заголовки → канонические имена, возвращает список строк-словарей.

    Строки возвращаются с ключом ``_row`` — номер строки в Excel (1-based).
    """
    rows_iter = ws.iter_rows(values_only=True)
    try:
        header_row = next(rows_iter)
    except StopIteration:
        return []
    mapped_cols: list[tuple[int, str]] = []
    for idx, h in enumerate(header_row):
        key = header_map.get(_norm(h))
        if key:
            mapped_cols.append((idx, key))
    result: list[dict[str, Any]] = []
    for row_idx, row in enumerate(rows_iter, start=2):
        if len(result) >= settings.MAX_IMPORT_ROWS:
            raise ExcelImportError(f"Превышен лимит строк импорта: {settings.MAX_IMPORT_ROWS}")
        if all(v is None or str(v).strip() == "" for v in row):
            continue
        item: dict[str, Any] = {"_row": row_idx}
        for idx, key in mapped_cols:
            if idx < len(row):
                item[key] = row[idx]
        result.append(item)
    return result


def _parse_csv(content: bytes) -> list[tuple[str, list[dict[str, Any]]]]:
    """Парсит CSV-файл.

    Возвращает список пар (sheet_label, rows) по типу:
    [('Трубопроводы', [...]), ('Резервуары', [...])].
    CSV должен содержать колонку «Тип» со значениями «труба» / «резервуар».
    Автодетект разделителя (``,``, ``;``, ``\t``). Кодировки: UTF-8 / UTF-8-BOM / CP1251.
    """
    import csv

    # Определяем кодировку
    text: str | None = None
    for enc in ("utf-8-sig", "utf-8", "cp1251"):
        try:
            text = content.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    if text is None:
        raise ExcelImportError("Не удалось определить кодировку CSV (ожидается UTF-8 или CP1251)")

    # Автодетект разделителя по первой строке
    first_line = text.splitlines()[0] if text.strip() else ""
    if not first_line:
        raise ExcelImportError("CSV-файл пустой")
    counts = {d: first_line.count(d) for d in (";", ",", "\t")}
    delimiter = max(counts, key=lambda item: counts[item]) if any(counts.values()) else ","

    reader = csv.reader(io.StringIO(text), delimiter=delimiter)
    all_rows = list(reader)
    if not all_rows:
        raise ExcelImportError("CSV-файл пустой")
    if len(all_rows) - 1 > settings.MAX_IMPORT_ROWS:
        raise ExcelImportError(f"Превышен лимит строк импорта: {settings.MAX_IMPORT_ROWS}")

    header = all_rows[0]
    # Индекс колонки «Тип»
    type_idx = next((i for i, h in enumerate(header) if _norm(h) in TYPE_HEADERS), None)
    if type_idx is None:
        raise ExcelImportError(
            "В CSV не найдена колонка «Тип» (со значениями «труба»/«резервуар»). "
            "Используйте шаблон CSV или файл Excel."
        )

    # Разделяем строки по типу
    pipe_rows_raw: list[tuple[int, list[str]]] = []
    tank_rows_raw: list[tuple[int, list[str]]] = []
    for row_idx, row in enumerate(all_rows[1:], start=2):
        if all((v is None or str(v).strip() == "") for v in row):
            continue
        if type_idx >= len(row):
            continue
        t = TYPE_ALIASES.get(_norm(row[type_idx]))
        if t == "pipe":
            pipe_rows_raw.append((row_idx, row))
        elif t == "tank":
            tank_rows_raw.append((row_idx, row))

    def build_mapped(
        rows_raw: list[tuple[int, list[str]]], header_map: dict[str, str]
    ) -> list[dict[str, Any]]:
        # Определяем маппинг колонок общего header
        mapped_cols: list[tuple[int, str]] = []
        for idx, h in enumerate(header):
            key = header_map.get(_norm(h))
            if key:
                mapped_cols.append((idx, key))
        out: list[dict[str, Any]] = []
        for row_idx, row in rows_raw:
            item: dict[str, Any] = {"_row": row_idx}
            for idx, key in mapped_cols:
                if idx < len(row):
                    val = row[idx]
                    # Пустые строки — None
                    normalized_value = val if (val is not None and str(val).strip() != "") else None
                    # «Материал изоляции» and its code are both aliases of
                    # one semantic field. Keep a meaningful earlier alias
                    # when a later optional display/code column is blank.
                    if normalized_value is not None or item.get(key) in (None, ""):
                        item[key] = normalized_value
            out.append(item)
        return out

    result: list[tuple[str, list[dict[str, Any]]]] = []
    if pipe_rows_raw:
        result.append(("Трубопроводы (CSV)", build_mapped(pipe_rows_raw, PIPE_HEADERS)))
    if tank_rows_raw:
        result.append(("Резервуары (CSV)", build_mapped(tank_rows_raw, TANK_HEADERS)))
    return result


async def _project_import_state(db: AsyncSession, project_id: UUID) -> tuple[int, int]:
    result = await db.execute(
        select(func.count(ProjectObject.id), func.max(ProjectObject.sort_order)).where(
            ProjectObject.project_id == project_id
        )
    )
    count, max_sort = result.one()
    return int(count or 0), int(max_sort if max_sort is not None else -1) + 1


def _normalize_name_for_dedupe(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip()).casefold()


def _dedupe_key(object_type: str, params: dict[str, Any]) -> str:
    key_params = dict(params)
    name = _normalize_name_for_dedupe(key_params.pop("name", ""))
    payload = json.dumps(
        key_params,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        default=str,
    )
    digest = hashlib.sha256(payload.encode("utf-8")).hexdigest()
    return f"{object_type}:{name}:{digest}"


def _object_type_for_dedupe(value: Any) -> str:
    return str(getattr(value, "value", value))


async def _existing_dedupe_keys(db: AsyncSession, project_id: UUID) -> set[str]:
    result = await db.execute(
        select(ProjectObject.object_type, ProjectObject.params).where(
            ProjectObject.project_id == project_id
        )
    )
    return {
        _dedupe_key(_object_type_for_dedupe(object_type), params or {})
        for object_type, params in result.all()
    }


async def _touch_project_updated_at(db: AsyncSession, project_id: UUID) -> None:
    """Кейс §4.4/§4.6: импорт объектов обновляет «Последнее изменение» проекта."""
    await db.execute(update(Project).where(Project.id == project_id).values(updated_at=func.now()))
    await db.commit()


async def _replace_project_objects(db: AsyncSession, project_id: UUID) -> None:
    await db.execute(
        delete(ElectricalCalculation).where(ElectricalCalculation.project_id == project_id)
    )
    await db.execute(delete(Specification).where(Specification.project_id == project_id))
    await db.execute(delete(ProjectObject).where(ProjectObject.project_id == project_id))
    await db.flush()


def _validate_import_mode(mode: str) -> ImportMode:
    normalized = (mode or "merge").strip().lower()
    if normalized not in {"append", "merge", "replace"}:
        raise ExcelImportError(
            "Некорректный режим импорта: " f"{mode!r} (допустимо: append, merge, replace)"
        )
    return normalized  # type: ignore[return-value]


async def _ensure_import_access(
    db: AsyncSession,
    project_id: UUID,
    principal: CurrentPrincipal,
) -> None:
    project_service = ProjectService(db)
    project = await project_service.get_project_basic(project_id, principal)
    project_service._check_owner(project, principal)


async def _commit_object_batch(
    db: AsyncSession,
    batch: list[tuple[ProjectObject, dict[str, Any]]],
    sheet_label: str,
) -> tuple[int, list[UUID], list[dict[str, Any]]]:
    if not batch:
        return 0, [], []
    objects = [item[0] for item in batch]
    try:
        db.add_all(objects)
        await db.flush()
        object_ids = [obj.id for obj in objects]
        await use_fast_commit_for_current_transaction(db)
        await db.commit()
        return len(objects), object_ids, []
    except SQLAlchemyError as exc:
        await db.rollback()
        return await _commit_object_batch_row_by_row(db, batch, sheet_label, exc)


async def _commit_object_batch_row_by_row(
    db: AsyncSession,
    batch: list[tuple[ProjectObject, dict[str, Any]]],
    sheet_label: str,
    batch_error: SQLAlchemyError,
) -> tuple[int, list[UUID], list[dict[str, Any]]]:
    created = 0
    object_ids: list[UUID] = []
    errors: list[dict[str, Any]] = []
    for obj, row in batch:
        retry_obj = ProjectObject(
            project_id=obj.project_id,
            object_type=obj.object_type,
            sort_order=obj.sort_order,
            params=obj.params,
        )
        try:
            db.add(retry_obj)
            await db.flush()
            object_ids.append(retry_obj.id)
            await use_fast_commit_for_current_transaction(db)
            await db.commit()
            created += 1
        except Exception as exc:
            await db.rollback()
            message = f"{type(exc).__name__}: {exc}"
            if not message.strip():
                message = f"{type(batch_error).__name__}: {batch_error}"
            errors.append({"sheet": sheet_label, "row": row["_row"], "message": message})
    return created, object_ids, errors


async def _add_rows(
    db: AsyncSession,
    project_id: UUID,
    sheet_label: str,
    rows: list[dict[str, Any]],
    object_type: str,
    next_sort: int,
    current_count: int,
    dedupe_keys: set[str] | None = None,
    prepared_rows: PreparedImportRows | None = None,
) -> tuple[int, int, int, list[dict[str, Any]], list[UUID], int, int, int, list[dict[str, Any]]]:
    """Создаёт объекты из распарсенных строк.

    Расчёт теплопотерь здесь намеренно не запускается: импорт должен быстро
    сохранить всё распознанное и отдать новые объекты в один фоновый batch.
    """
    created = 0
    skipped_duplicates = 0
    skipped_limit = 0
    created_object_ids: list[UUID] = []
    prepared = prepared_rows or _prepare_import_rows(sheet_label, rows, object_type)
    errors = list(prepared.errors)
    validation_errors = list(prepared.validation_errors)
    batch: list[tuple[ProjectObject, dict[str, Any]]] = []

    async def flush_batch() -> None:
        nonlocal batch, created, current_count
        attempted = len(batch)
        batch_created, object_ids, batch_errors = await _commit_object_batch(
            db,
            batch,
            sheet_label,
        )
        created += batch_created
        created_object_ids.extend(object_ids)
        errors.extend(batch_errors)
        current_count -= attempted - batch_created
        batch = []

    for row_index, (params, row) in enumerate(prepared.rows):
        if current_count >= settings.GUEST_MAX_OBJECTS_PER_PROJECT:
            skipped_limit = len(prepared.rows) - row_index
            errors.append(
                {
                    "sheet": sheet_label,
                    "row": row["_row"],
                    "message": (
                        "Достигнут лимит объектов в проекте "
                        f"({settings.GUEST_MAX_OBJECTS_PER_PROJECT}). "
                        f"Пропущено строк: {skipped_limit}."
                    ),
                }
            )
            break
        try:
            if dedupe_keys is not None:
                key = _dedupe_key(object_type, params)
                if key in dedupe_keys:
                    skipped_duplicates += 1
                    continue
                dedupe_keys.add(key)
            obj = ProjectObject(
                project_id=project_id,
                object_type=object_type,
                sort_order=next_sort,
                params=params,
            )
            batch.append((obj, row))
            current_count += 1
            next_sort += 1
            if len(batch) >= IMPORT_COMMIT_BATCH_SIZE:
                await flush_batch()
        except Exception as exc:
            errors.append(
                {
                    "sheet": sheet_label,
                    "row": row["_row"],
                    "message": f"{type(exc).__name__}: {exc}",
                }
            )
    await flush_batch()
    return (
        created,
        next_sort,
        current_count,
        errors,
        created_object_ids,
        skipped_duplicates,
        skipped_limit,
        prepared.invalid,
        validation_errors,
    )


def _prepare_import_rows(
    sheet_label: str,
    rows: list[dict[str, Any]],
    object_type: str,
) -> PreparedImportRows:
    """Normalize and validate every row before any import-side mutation."""

    accepted: list[tuple[dict[str, Any], dict[str, Any]]] = []
    errors: list[dict[str, Any]] = []
    validation_errors: list[dict[str, Any]] = []
    invalid = 0
    builder = _build_pipe_params if object_type == "pipe" else _build_tank_params

    for row in rows:
        params, err = builder(row)
        if err or params is None:
            errors.append(
                {"sheet": sheet_label, "row": row["_row"], "message": err or "Ошибка парсинга"}
            )
            continue
        try:
            reject_legacy_specification_object_params(params)
            normalized_params = normalize_project_object_params(object_type, params)
            prepared = validate_and_canonicalize_project_object_params(
                object_type,
                normalized_params,
            )
        except Exception as exc:
            errors.append(
                {
                    "sheet": sheet_label,
                    "row": row["_row"],
                    "message": f"{type(exc).__name__}: {exc}",
                }
            )
            continue
        if not prepared.report.is_valid:
            invalid += 1
            validation_errors.extend(
                {
                    "sheet": sheet_label,
                    "row": row["_row"],
                    "field": issue.field,
                    "code": issue.code,
                    "message": _import_validation_message(issue.field, issue.message),
                }
                for issue in prepared.report.issues
            )
            continue
        accepted.append((prepared.params, row))

    return PreparedImportRows(
        rows=accepted,
        errors=errors,
        validation_errors=validation_errors,
        invalid=invalid,
    )


def _import_validation_message(field: str | None, message: str) -> str:
    if field == "outer_diameter":
        return "Наружный диаметр должен быть от 10,8 до 3000 мм"
    if re.search(r"[А-Яа-яЁё]", message):
        return message
    if field is not None:
        return f"Поле «{field}» содержит недопустимое значение"
    return "Строка не прошла проверку параметров объекта"


async def import_objects_from_csv(
    db: AsyncSession,
    project_id: UUID,
    principal: CurrentPrincipal,
    content: bytes,
    mode: str = "merge",
) -> dict[str, Any]:
    """Импортирует объекты из CSV-файла. Требуется колонка «Тип»."""
    import_mode = _validate_import_mode(mode)
    await _ensure_import_access(db, project_id, principal)

    sheets = _parse_csv(content)
    if not sheets:
        raise ExcelImportError(
            "В CSV не найдено ни одной строки с распознанным типом (труба/резервуар)."
        )

    prepared_sheets = []
    for sheet_label, rows in sheets:
        object_type = "pipe" if "Трубопровод" in sheet_label else "tank"
        prepared_sheets.append(
            (
                sheet_label,
                object_type,
                rows,
                _prepare_import_rows(sheet_label, rows, object_type),
            )
        )

    replace_applied = import_mode == "replace" and any(
        prepared.rows for _sheet, _type, _rows, prepared in prepared_sheets
    )
    if import_mode == "replace":
        current_count, next_sort = 0, 0
        dedupe_keys = None
    else:
        current_count, next_sort = await _project_import_state(db, project_id)
        dedupe_keys = (
            await _existing_dedupe_keys(db, project_id) if import_mode == "merge" else None
        )
    if replace_applied:
        await _replace_project_objects(db, project_id)

    total_created = 0
    skipped_duplicates = 0
    skipped_limit = 0
    invalid = 0
    all_errors: list[dict[str, Any]] = []
    all_validation_errors: list[dict[str, Any]] = []
    created_object_ids: list[UUID] = []
    for sheet_label, obj_type, rows, prepared_rows in prepared_sheets:
        (
            created,
            next_sort,
            current_count,
            errors,
            object_ids,
            skipped,
            limit_skipped,
            invalid_rows,
            validation_errors,
        ) = await _add_rows(
            db,
            project_id,
            sheet_label,
            rows,
            obj_type,
            next_sort,
            current_count,
            dedupe_keys=dedupe_keys,
            prepared_rows=prepared_rows,
        )
        total_created += created
        skipped_duplicates += skipped
        skipped_limit += limit_skipped
        invalid += invalid_rows
        all_errors.extend(errors)
        all_validation_errors.extend(validation_errors)
        created_object_ids.extend(object_ids)

    if replace_applied and not created_object_ids:
        await db.commit()
    if created_object_ids or replace_applied:
        await _touch_project_updated_at(db, project_id)

    return {
        "created": total_created,
        "skipped_duplicates": skipped_duplicates,
        "skipped_limit": skipped_limit,
        "invalid": invalid,
        "mode": import_mode,
        "errors": all_errors,
        "validation_errors": all_validation_errors,
        "created_object_ids": created_object_ids,
    }


def _parse_excel_workbook(content: bytes) -> list[tuple[str, str, list[dict[str, Any]]]]:
    """Синхронный разбор xlsx: открыть книгу, проверить лимит листов и прочитать
    листы трубопроводов/резервуаров.

    openpyxl полностью блокирующий (parsing + распаковка XML), поэтому функция
    запускается в отдельном потоке через ``asyncio.to_thread`` и не должна
    держать event loop на время разбора файла (см. import_objects_from_excel).
    Возвращает список ``(sheet_label, object_type, rows)`` по найденным листам.
    """
    try:
        wb = load_workbook(io.BytesIO(content), read_only=True, data_only=True)
    except Exception as exc:
        raise ExcelImportError(f"Не удалось открыть файл: {exc}") from exc
    if len(wb.sheetnames) > settings.MAX_IMPORT_SHEETS:
        raise ExcelImportError(f"Превышен лимит листов импорта: {settings.MAX_IMPORT_SHEETS}")

    parsed_sheets: list[tuple[str, str, list[dict[str, Any]]]] = []
    for sheet in wb.sheetnames:
        norm = _norm(sheet)
        if norm in PIPE_SHEET_NAMES:
            parsed_sheets.append((sheet, "pipe", _read_sheet(wb[sheet], PIPE_HEADERS)))
        elif norm in TANK_SHEET_NAMES:
            parsed_sheets.append((sheet, "tank", _read_sheet(wb[sheet], TANK_HEADERS)))
    return parsed_sheets


async def import_objects_from_excel(
    db: AsyncSession,
    project_id: UUID,
    principal: CurrentPrincipal,
    content: bytes,
    mode: str = "merge",
) -> dict[str, Any]:
    """Импортирует объекты из xlsx-файла в проект.

    Возвращает сводку: {"created": N, "errors": [{"sheet", "row", "message"}]}.
    """
    import_mode = _validate_import_mode(mode)
    _validate_xlsx_archive(content)

    # Блокирующий разбор openpyxl уводим в поток, чтобы не стопорить event loop
    # на время парсинга (как уже сделано для генерации отчётов).
    parsed_sheets = await asyncio.to_thread(_parse_excel_workbook, content)

    # Проверяем доступ к проекту
    try:
        await _ensure_import_access(db, project_id, principal)
    except (ProjectNotFoundError, ProjectAccessError):
        raise

    created = 0
    skipped_duplicates = 0
    skipped_limit = 0
    errors: list[dict[str, Any]] = []
    created_object_ids: list[UUID] = []

    if not parsed_sheets:
        raise ExcelImportError(
            "В файле не найдены листы «Трубопроводы» или «Резервуары». "
            "Используйте шаблон (кнопка «Скачать шаблон»)."
        )

    prepared_sheets = [
        (sheet, object_type, rows, _prepare_import_rows(sheet, rows, object_type))
        for sheet, object_type, rows in parsed_sheets
    ]

    replace_applied = import_mode == "replace" and any(
        prepared.rows for _sheet, _type, _rows, prepared in prepared_sheets
    )
    if import_mode == "replace":
        current_count, next_sort = 0, 0
        dedupe_keys = None
    else:
        current_count, next_sort = await _project_import_state(db, project_id)
        dedupe_keys = (
            await _existing_dedupe_keys(db, project_id) if import_mode == "merge" else None
        )
    if replace_applied:
        await _replace_project_objects(db, project_id)

    invalid = 0
    validation_errors: list[dict[str, Any]] = []
    for sheet, object_type, rows, prepared_rows in prepared_sheets:
        (
            added,
            next_sort,
            current_count,
            sheet_errors,
            object_ids,
            skipped,
            limit_skipped,
            invalid_rows,
            row_validation_errors,
        ) = await _add_rows(
            db,
            project_id,
            sheet,
            rows,
            object_type,
            next_sort,
            current_count,
            dedupe_keys=dedupe_keys,
            prepared_rows=prepared_rows,
        )
        created += added
        skipped_duplicates += skipped
        skipped_limit += limit_skipped
        invalid += invalid_rows
        errors.extend(sheet_errors)
        validation_errors.extend(row_validation_errors)
        created_object_ids.extend(object_ids)

    if replace_applied and not created_object_ids:
        await db.commit()
    if created_object_ids or replace_applied:
        await _touch_project_updated_at(db, project_id)

    return {
        "created": created,
        "skipped_duplicates": skipped_duplicates,
        "skipped_limit": skipped_limit,
        "invalid": invalid,
        "mode": import_mode,
        "errors": errors,
        "validation_errors": validation_errors,
        "created_object_ids": created_object_ids,
    }
