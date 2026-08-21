"""Canonical validation preparation for parsed spreadsheet rows."""

from __future__ import annotations

import re
from typing import Any

from app.services.object_spreadsheet.contracts import PreparedImportRows
from app.services.object_spreadsheet.pipe_mapping import _build_pipe_params
from app.services.object_spreadsheet.tank_mapping import _build_tank_params
from app.services.project_object_params import (
    normalize_project_object_params,
    reject_legacy_specification_object_params,
    validate_and_canonicalize_project_object_params,
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
