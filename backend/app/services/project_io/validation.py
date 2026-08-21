"""Pure validation for the project CSV contract."""

from __future__ import annotations

import json
from decimal import Decimal, InvalidOperation
from typing import Any
from uuid import UUID

from app.electrical_variant_limits import MAX_ELECTRICAL_VARIANTS
from app.services.project_io.contracts import (
    OBJECT_TYPE_ALIASES,
    VALID_ASSIGNMENT_STATES,
    VALID_ASSIGNMENT_SYSTEM_TYPES,
    ProjectImportError,
    ProjectImportPayload,
    Row,
)
from app.services.project_object_params import (
    LegacySpecificationObjectParamsError,
    UnsupportedTankShapeError,
    reject_legacy_specification_object_params,
    reject_unsupported_tank_shape,
)


def parse_json_or_empty(raw: str, default: Any) -> Any:
    value = (raw or "").strip()
    if not value:
        return default
    try:
        return json.loads(value)
    except json.JSONDecodeError as exc:
        raise ProjectImportError(f"Некорректный JSON: {exc}") from exc


def normalize_object_type(raw: str) -> str:
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


def reject_imported_object_params(object_type: str, params: Any) -> None:
    if not isinstance(params, dict):
        raise ProjectImportError("objects.params должен быть JSON-объектом")
    try:
        reject_legacy_specification_object_params(params)
    except LegacySpecificationObjectParamsError as exc:
        fields = ", ".join(exc.fields)
        raise ProjectImportError(f"{exc} (code={exc.code}; fields={fields})") from exc
    try:
        reject_unsupported_tank_shape(object_type, params)
    except UnsupportedTankShapeError as exc:
        raise ProjectImportError(str(exc)) from exc


def normalize_source(value: str | None, valid_values: set[str]) -> str | None:
    if value is None:
        return None
    normalized = value.strip().lower()
    return normalized if normalized in valid_values else None


def spec_rows_contain_manual_items(rows: list[Row]) -> bool:
    for row in rows:
        items = parse_json_or_empty(row.get("items", ""), [])
        if not isinstance(items, list):
            continue
        for item in items:
            if isinstance(item, dict) and str(item.get("source") or "").lower() == "manual":
                return True
    return False


def variant_keys_from_rows(rows: list[Row]) -> set[str]:
    return {key for row in rows if (key := (row.get("variant_key") or "").strip())}


def resolve_specification_identity(
    *,
    variant_key: str,
    electrical_variant_id_raw: str,
    variants_by_key: dict[str, Any],
) -> Any:
    if not variant_key and not electrical_variant_id_raw:
        raise ProjectImportError(
            "В specifications обязателен variant_key или electrical_variant_id"
        )

    def lookup(token: str) -> Any | None:
        if not token:
            return None
        if token in variants_by_key:
            return variants_by_key[token]
        for key, candidate in variants_by_key.items():
            candidate_id = getattr(candidate, "id", None)
            if key == token or (candidate_id is not None and str(candidate_id) == token):
                return candidate
        return None

    by_key = lookup(variant_key) if variant_key else None
    by_uuid = lookup(electrical_variant_id_raw) if electrical_variant_id_raw else None
    if variant_key and electrical_variant_id_raw:
        if by_key is None:
            raise ProjectImportError(f"specifications: неизвестный variant_key {variant_key!r}")
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


def parse_specification_row_payload(row: Row) -> tuple[list[Any], dict[str, Any] | None]:
    items = parse_json_or_empty(row.get("items", ""), [])
    if not isinstance(items, list):
        raise ProjectImportError("specifications.items должен быть JSON-массивом")
    snapshot = parse_json_or_empty(row.get("snapshot", ""), None)
    if snapshot is not None and not isinstance(snapshot, dict):
        raise ProjectImportError("specifications.snapshot должен быть JSON-объектом")
    return items, snapshot


def validate_specification_section(
    rows: list[Row], variants_by_key: dict[str, Any]
) -> list[tuple[Any, list[Any], dict[str, Any] | None, str, str]]:
    resolved_rows: list[tuple[Any, list[Any], dict[str, Any] | None, str, str]] = []
    seen_ids: set[Any] = set()
    for row in rows:
        variant_key = (row.get("variant_key") or "").strip()
        electrical_variant_id_raw = (row.get("electrical_variant_id") or "").strip()
        variant = resolve_specification_identity(
            variant_key=variant_key,
            electrical_variant_id_raw=electrical_variant_id_raw,
            variants_by_key=variants_by_key,
        )
        identity = getattr(variant, "id", variant)
        if identity in seen_ids:
            raise ProjectImportError(
                "specifications: дубликат electrical_variant_id после resolution " f"({identity!s})"
            )
        seen_ids.add(identity)
        items, snapshot = parse_specification_row_payload(row)
        resolved_rows.append((variant, items, snapshot, variant_key, electrical_variant_id_raw))
    return resolved_rows


def validate_catalog_selection_rows(rows: list[Row], variant_keys: set[str]) -> None:
    if not rows:
        return
    if not variant_keys:
        raise ProjectImportError(
            "catalog_selections требует секцию electrical_variants с variant_key"
        )
    seen: set[tuple[str, str]] = set()
    variants_by_key = {key: key for key in variant_keys}
    for row in rows:
        variant_key = (row.get("variant_key") or "").strip()
        electrical_variant_id_raw = (row.get("electrical_variant_id") or "").strip()
        group_key = (row.get("candidate_group_key") or "").strip()
        version_id = (row.get("catalog_version_id") or "").strip()
        item_id = (row.get("catalog_item_id") or "").strip()
        fingerprint = (row.get("candidate_set_fingerprint") or "").strip()
        if not group_key or len(group_key) > 128:
            raise ProjectImportError("catalog_selections: candidate_group_key обязателен (1..128)")
        if not fingerprint.startswith("sha256:") or len(fingerprint) != 71:
            raise ProjectImportError(
                "catalog_selections: candidate_set_fingerprint должен быть sha256:<64 hex>"
            )
        try:
            UUID(version_id)
            UUID(item_id)
        except ValueError as exc:
            raise ProjectImportError(
                "catalog_selections: catalog_version_id и catalog_item_id должны быть UUID"
            ) from exc
        resolved = resolve_specification_identity(
            variant_key=variant_key,
            electrical_variant_id_raw=electrical_variant_id_raw,
            variants_by_key=variants_by_key,
        )
        scope = (str(resolved), group_key)
        if scope in seen:
            raise ProjectImportError(
                "catalog_selections: дубликат candidate_group_key для одного ЭР"
            )
        seen.add(scope)
        collection_version = (row.get("collection_version") or "1").strip() or "1"
        try:
            if int(collection_version) < 1:
                raise ValueError
        except ValueError as exc:
            raise ProjectImportError(
                "catalog_selections: collection_version должен быть целым >= 1"
            ) from exc


def validate_project_payload(payload: ProjectImportPayload, *, role: str) -> None:
    if not payload.name:
        raise ProjectImportError("В файле проекта пустое имя проекта")
    if len(payload.name) > 255:
        raise ProjectImportError("Имя проекта не должно превышать 255 символов")
    if payload.task_number is not None and len(payload.task_number) > 64:
        raise ProjectImportError("Номер задания не должен превышать 64 символа")
    if payload.status not in {"draft", "completed"}:
        raise ProjectImportError(f"Некорректный статус проекта: {payload.status!r}")
    object_keys = _validate_objects(payload.objects)
    variants = _validate_variants(payload.variants)
    _validate_assignments(payload.assignments, object_keys, variants)
    _validate_electrical(payload.electrical, object_keys, variants)
    validate_specification_section(
        payload.specifications,
        {key: key for key in variants},
    )
    validate_catalog_selection_rows(payload.catalog_selections, set(variants))
    _validate_settings(payload)
    if role == "guest" and spec_rows_contain_manual_items(payload.specifications):
        raise ProjectImportError(
            "Гостю запрещён импорт спецификации с ручными (manual) позициями (PDL-ER-41)"
        )


def _validate_objects(rows: list[Row]) -> set[str]:
    keys: set[str] = set()
    for index, row in enumerate(rows):
        params = parse_json_or_empty(row.get("params", ""), {})
        object_type = normalize_object_type(row.get("type", ""))
        reject_imported_object_params(object_type, params)
        object_key = (row.get("object_key") or "").strip()
        if not object_key:
            raise ProjectImportError("В секции objects отсутствует обязательный object_key")
        if object_key in keys:
            raise ProjectImportError(f"Дублирующийся object_key в секции objects: {object_key!r}.")
        keys.add(object_key)
        try:
            int(row.get("sort_order", index) or index)
        except ValueError as exc:
            raise ProjectImportError(
                f"Некорректный sort_order в objects: {row.get('sort_order')!r}"
            ) from exc
        parse_json_or_empty(row.get("results", ""), None)
        parse_json_or_empty(row.get("validation_errors", ""), None)
    return keys


def _validate_variants(rows: list[Row]) -> set[str]:
    if len(rows) > MAX_ELECTRICAL_VARIANTS:
        raise ProjectImportError(
            f"В секции electrical_variants больше {MAX_ELECTRICAL_VARIANTS} ЭР"
        )
    variants: set[str] = set()
    names: set[str] = set()
    active_count = 0
    copied_from: list[str] = []
    sort_orders: set[int] = set()
    for index, row in enumerate(rows):
        key = (row.get("variant_key") or "").strip()
        if not key:
            raise ProjectImportError("В electrical_variants пустой variant_key")
        try:
            UUID(key)
        except ValueError as exc:
            raise ProjectImportError(
                "electrical_variants.variant_key должен быть UUID; "
                f"numeric/legacy identity не поддерживается: {key!r}"
            ) from exc
        if key in variants:
            raise ProjectImportError(f"Дублирующийся variant_key: {key!r}")
        name = (row.get("name") or "").strip() or f"ЭР{index + 1}"
        normalized_name = name.casefold()
        if normalized_name in names:
            raise ProjectImportError(f"Конфликт имени ЭР после trim+casefold: {name!r}")
        names.add(normalized_name)
        active_count += (row.get("is_active") or "").strip().lower() == "true"
        try:
            sort_order = int((row.get("sort_order") or index) or index)
        except ValueError as exc:
            raise ProjectImportError(
                f"Некорректный sort_order в electrical_variants: {row.get('sort_order')!r}"
            ) from exc
        if sort_order < 0:
            raise ProjectImportError("sort_order в electrical_variants должен быть >= 0")
        if sort_order in sort_orders:
            raise ProjectImportError(
                f"Дублирующийся sort_order в electrical_variants: {sort_order}"
            )
        sort_orders.add(sort_order)
        variants.add(key)
        copied_key = (row.get("copied_from_key") or "").strip()
        if copied_key:
            copied_from.append(copied_key)
    if active_count > 1:
        raise ProjectImportError("В electrical_variants больше одного is_active=true")
    for copied_key in copied_from:
        if copied_key not in variants:
            raise ProjectImportError(
                f"copied_from_key ссылается на неизвестный variant_key: {copied_key!r}"
            )
    return variants


def _validate_assignments(rows: list[Row], object_keys: set[str], variants: set[str]) -> None:
    seen: set[tuple[str, str]] = set()
    for row in rows:
        variant_key = (row.get("variant_key") or "").strip()
        object_key = (row.get("object_key") or "").strip()
        if variant_key not in variants:
            raise ProjectImportError(
                f"electrical_assignments: неизвестный variant_key {variant_key!r}"
            )
        if object_key not in object_keys:
            raise ProjectImportError(
                f"electrical_assignments: неизвестный object_key {object_key!r}"
            )
        scope = (variant_key, object_key)
        if scope in seen:
            raise ProjectImportError(f"Дублирующееся assignment для {variant_key!r}/{object_key!r}")
        seen.add(scope)
        system_type = (row.get("system_type") or "").strip().lower() or None
        if system_type is not None and system_type not in VALID_ASSIGNMENT_SYSTEM_TYPES:
            raise ProjectImportError(f"Некорректный system_type: {system_type!r}")
        state = (row.get("assignment_state") or "unassigned").strip().lower()
        if state not in VALID_ASSIGNMENT_STATES:
            raise ProjectImportError(f"Некорректный assignment_state: {state!r}")
        if state == "ready" and system_type not in {"self_regulating", "resistive"}:
            raise ProjectImportError("assignment_state='ready' требует поддерживаемый system_type")
        if system_type in {"skin", "mineral"} and state != "unsupported":
            raise ProjectImportError(
                "system_type skin/mineral требует assignment_state='unsupported'"
            )


def _validate_electrical(rows: list[Row], object_keys: set[str], variants: set[str]) -> None:
    seen: set[tuple[str, str]] = set()
    for row in rows:
        variant_key = (row.get("variant_key") or "").strip()
        object_key = (row.get("object_key") or "").strip()
        if not variant_key or not object_key:
            raise ProjectImportError("В секции electrical обязательны variant_key и object_key")
        if variant_key not in variants:
            raise ProjectImportError(f"electrical: неизвестный variant_key {variant_key!r}")
        if object_key not in object_keys:
            raise ProjectImportError(f"electrical: неизвестный object_key {object_key!r}")
        scope = (variant_key, object_key)
        if scope in seen:
            raise ProjectImportError(f"Дублирующийся electrical для {variant_key!r}/{object_key!r}")
        seen.add(scope)
        for field, default in (
            ("cable_snapshot", None),
            ("params", {}),
            ("results", None),
        ):
            parse_json_or_empty(row.get(field, ""), default)


def _validate_settings(payload: ProjectImportPayload) -> None:
    for field_name, raw in (
        ("specification_settings", payload.specification_settings_raw),
        ("display_settings", payload.display_settings_raw),
    ):
        if raw is not None and raw.strip():
            value = parse_json_or_empty(raw, {})
            if not isinstance(value, dict):
                raise ProjectImportError(f"{field_name} в файле проекта должен быть JSON-объектом")
    for field_name, raw, minimum in (
        (
            "specification_settings_version",
            payload.specification_settings_version_raw,
            1,
        ),
        ("display_settings_version", payload.display_settings_version_raw, 0),
    ):
        if raw is not None and raw.strip():
            try:
                max(int(raw.strip()), minimum)
            except ValueError as exc:
                raise ProjectImportError(f"Некорректный {field_name}: {raw.strip()!r}") from exc
    if len(payload.electrical_settings) > 1:
        raise ProjectImportError(
            "Секция electrical_settings должна содержать одну строку на проект"
        )
    if not payload.electrical_settings:
        return
    row = payload.electrical_settings[0]
    voltage = (row.get("nominal_voltage_v") or "").strip()
    if voltage and voltage != "230":
        raise ProjectImportError(
            f"Неподдерживаемое nominal_voltage_v в electrical_settings: {voltage!r} "
            "(допустимо только 230)"
        )
    current = (row.get("max_section_start_current_a") or "").strip()
    if current:
        try:
            parsed_current = Decimal(current.replace(",", "."))
        except InvalidOperation as exc:
            raise ProjectImportError(
                f"Некорректный max_section_start_current_a: {current!r}"
            ) from exc
        if parsed_current <= 0:
            raise ProjectImportError(
                "max_section_start_current_a в electrical_settings должен быть больше 0"
            )
    version = (row.get("version") or "").strip()
    if version:
        try:
            max(int(version), 1)
        except ValueError as exc:
            raise ProjectImportError(
                f"Некорректный version в electrical_settings: {version!r}"
            ) from exc
