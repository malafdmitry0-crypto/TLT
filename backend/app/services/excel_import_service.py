"""Импорт объектов проекта из Excel."""

from __future__ import annotations

import asyncio
from typing import Any, Literal
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import CurrentPrincipal
from app.services.object_spreadsheet.parsing import (
    ExcelImportError,
    _parse_csv,
    _parse_excel_workbook,
    _validate_xlsx_archive,
)
from app.services.object_spreadsheet.persistence import (
    _add_rows,
    _ensure_import_access,
    _existing_dedupe_keys,
    _project_import_state,
    _replace_project_objects,
    _touch_project_updated_at,
)
from app.services.object_spreadsheet.preparation import _prepare_import_rows
from app.services.project_service import (
    ProjectAccessError,
    ProjectNotFoundError,
)

ImportMode = Literal["append", "merge", "replace"]


# Алиасы для колонки «Тип» в CSV (различает трубу/резервуар в одном файле)


def _validate_import_mode(mode: str) -> ImportMode:
    normalized = (mode or "merge").strip().lower()
    if normalized not in {"append", "merge", "replace"}:
        raise ExcelImportError(
            "Некорректный режим импорта: " f"{mode!r} (допустимо: append, merge, replace)"
        )
    return normalized  # type: ignore[return-value]


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
