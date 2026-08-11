"""Cable snapshot helpers for reproducible electrical calculations."""

from __future__ import annotations

import hashlib
import json
import re
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

TECHNICAL_KEYS = (
    "model",
    "brand",
    "series",
    "power_per_meter",
    "nominal_power",
    "q1",
    "q2",
    "voltage",
    "min_temperature",
    "max_temperature",
    "max_product_temp",
    "max_vapor_temp",
    "resistance_ohm_km",
    "conductor_section_mm2",
    "diameter_mm",
    "nominal_size_mm",
)

COMMERCIAL_KEYS = (
    "price_per_meter",
    "currency",
    "stock_quantity_m",
    "stock_status",
    "lead_time_days",
    "supplier_name",
    "supplier_priority",
    "is_preferred",
    "article",
    "order_multiple_m",
    "min_order_quantity_m",
    "is_discontinued",
    "replacement_group",
    "price_updated_at",
    "stock_updated_at",
    "commercial_data_source",
)

COMMERCIAL_CONTEXT_KEYS = (
    "required_order_length",
    "raw_required_length",
    "installed_cable_length",
    "order_cable_length",
    "cable_total_cost",
    "accessory_total_cost",
    "total_cost",
    "cost_scope",
)

SELECTION_KEYS = (
    "selection_policy",
    "applied_selection_policy",
    "selection_reason",
    "candidate_count",
    "num_circuits",
    "number_of_threads_source",
    "requested_number_of_threads",
    "applied_number_of_threads",
    "winding_pitch",
)

COPPER_RESISTANCE_OHM_MM2_KM = 17.5


def json_ready(value: Any) -> Any:
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, int | float) and not isinstance(value, bool):
        return float(value)
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, dict):
        return {str(k): json_ready(v) for k, v in value.items()}
    if isinstance(value, list | tuple):
        return [json_ready(v) for v in value]
    return value


def _compact(data: dict[str, Any]) -> dict[str, Any]:
    return {key: json_ready(value) for key, value in data.items() if value is not None}


def _finite_float(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int | float | Decimal):
        return float(value)
    if isinstance(value, str) and value.strip():
        try:
            return float(value.replace(",", "."))
        except ValueError:
            return None
    return None


def _conductor_section_from_model(model: Any) -> float | None:
    match = re.search(r"[хx×]\s*(\d+(?:[,.]\d+)?)\s*[-–]", str(model or ""))
    if not match:
        return None
    return _finite_float(match.group(1))


def _conductor_section(row: dict[str, Any], nested: dict[str, Any]) -> Any:
    return (
        row.get("conductor_section_mm2")
        or row.get("conductor_cross_section")
        or nested.get("conductor_section_mm2")
        or nested.get("conductor_cross_section")
        or nested.get("cross_section")
        or _conductor_section_from_model(row.get("model"))
    )


def _pick(row: dict[str, Any] | None, keys: tuple[str, ...]) -> dict[str, Any]:
    if not isinstance(row, dict):
        return {}
    params = row.get("params")
    nested = params if isinstance(params, dict) else {}
    picked: dict[str, Any] = {}
    for key in keys:
        if key == "resistance_ohm_km":
            resistance = row.get("resistance_ohm_km", nested.get("resistance_ohm_km"))
            if resistance is None:
                resistance_per_meter = row.get(
                    "resistance_per_meter",
                    nested.get("resistance_per_meter"),
                )
                if resistance_per_meter is not None:
                    resistance = float(resistance_per_meter) * 1000.0
            if resistance is None:
                conductor_section = _finite_float(_conductor_section(row, nested))
                if conductor_section is not None and conductor_section > 0:
                    resistance = COPPER_RESISTANCE_OHM_MM2_KM / conductor_section
            picked[key] = resistance
            continue
        if key == "conductor_section_mm2":
            picked[key] = _conductor_section(row, nested)
            continue
        picked[key] = row.get(key) if row.get(key) is not None else nested.get(key)
    return _compact(picked)


def stable_hash(data: dict[str, Any]) -> str:
    payload = json.dumps(
        json_ready(data), ensure_ascii=False, sort_keys=True, separators=(",", ":")
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def lookup_cable_row(
    catalog: list[dict[str, Any]] | None,
    cable_mark: str | None,
    cable_type: str,
) -> dict[str, Any] | None:
    rows = lookup_cable_rows(catalog, cable_mark, cable_type)
    return rows[0] if rows else None


def lookup_cable_rows(
    catalog: list[dict[str, Any]] | None,
    cable_mark: str | None,
    cable_type: str,
) -> list[dict[str, Any]]:
    if not cable_mark or not catalog:
        return []
    candidates = [cable_mark]
    if cable_type == "self_regulating_tt" and "-" in cable_mark:
        candidates.append(cable_mark.rsplit("-", 1)[0])
    rows: list[dict[str, Any]] = []
    for candidate in candidates:
        for row in catalog:
            if row.get("model") == candidate:
                rows.append(dict(row))
    return rows


def lookup_cable_row_for_snapshot(
    catalog: list[dict[str, Any]] | None,
    cable_mark: str | None,
    cable_type: str,
    snapshot: dict[str, Any] | None,
) -> dict[str, Any] | None:
    rows = lookup_cable_rows(catalog, cable_mark, cable_type)
    if not rows:
        return None
    snapshot_technical_raw = snapshot.get("technical") if isinstance(snapshot, dict) else {}
    snapshot_technical = (
        _pick(snapshot_technical_raw, TECHNICAL_KEYS)
        if isinstance(snapshot_technical_raw, dict)
        else {}
    )
    if snapshot_technical:
        snapshot_technical_hash = stable_hash(snapshot_technical)
        for row in rows:
            if stable_hash(_pick(row, TECHNICAL_KEYS)) == snapshot_technical_hash:
                return row
    return rows[0]


def build_cable_snapshot(
    *,
    cable_type: str,
    cable_mark: str | None,
    cable_row: dict[str, Any] | None,
    requested_catalog_source: str | None,
    cable_mark_source: str,
    result_dict: dict[str, Any] | None,
    origin: str = "calculated_by_backend",
) -> dict[str, Any] | None:
    if not cable_mark:
        return None

    result = result_dict if isinstance(result_dict, dict) else {}
    result_commercial = (
        result.get("commercial") if isinstance(result.get("commercial"), dict) else {}
    )
    row = cable_row if isinstance(cable_row, dict) else {}
    technical = _pick(row, TECHNICAL_KEYS)
    commercial = _pick(row, COMMERCIAL_KEYS)
    commercial_context = _pick(result_commercial, COMMERCIAL_CONTEXT_KEYS)
    selection = _pick(result, SELECTION_KEYS)
    selection["cable_mark_source"] = cable_mark_source

    catalog_identity_raw = row.get("_catalog_identity")
    catalog_identity = (
        _compact(catalog_identity_raw) if isinstance(catalog_identity_raw, dict) else {}
    )
    authority = str(catalog_identity.get("authority") or "").strip().lower()
    actual_source = (
        "database"
        if authority in {"database", "db"}
        else "builtin"
        if authority in {"static", "static_fallback", "builtin"}
        else row.get("source") or row.get("catalog_source") or "builtin"
    )
    fingerprint = {
        "technical_hash": stable_hash(technical),
        "commercial_hash": stable_hash(commercial),
    }
    fingerprint["full_hash"] = stable_hash(
        {
            "cable_type": cable_type,
            "cable_mark": cable_mark,
            "actual_catalog_source": actual_source,
            "catalog_identity": catalog_identity,
            "technical": technical,
            "commercial": commercial,
        }
    )

    return {
        "schema_version": 1,
        "captured_at": datetime.now(UTC).isoformat(),
        "origin": origin,
        "cable_type": cable_type,
        "cable_mark": cable_mark,
        "cable_mark_source": cable_mark_source,
        "requested_catalog_source": requested_catalog_source or "builtin",
        "actual_catalog_source": actual_source,
        "catalog_identity": catalog_identity,
        "catalog_entry_id": row.get("id"),
        "technical": technical,
        "commercial": commercial,
        "commercial_context": commercial_context,
        "selection": selection,
        "fingerprint": fingerprint,
    }


def compare_cable_snapshot(
    snapshot: dict[str, Any] | None,
    current_row: dict[str, Any] | None,
) -> dict[str, Any]:
    if not isinstance(snapshot, dict):
        return {
            "technical_status": "unknown",
            "commercial_status": "unknown",
            "severity": "warning",
            "changed_fields": [],
            "message": "Расчёт создан без сохранённого снимка кабеля.",
        }

    if current_row is None:
        return {
            "technical_status": "missing",
            "commercial_status": "missing",
            "severity": "critical",
            "changed_fields": [],
            "message": "Кабель сохранён в проекте, но отсутствует в текущей базе.",
        }

    current_technical = _pick(current_row, TECHNICAL_KEYS)
    current_commercial = _pick(current_row, COMMERCIAL_KEYS)
    snapshot_technical = _pick(
        snapshot.get("technical") if isinstance(snapshot.get("technical"), dict) else {},
        TECHNICAL_KEYS,
    )
    snapshot_commercial = _pick(
        snapshot.get("commercial") if isinstance(snapshot.get("commercial"), dict) else {},
        COMMERCIAL_KEYS,
    )

    catalog_fields = _changed_catalog_identity_fields(snapshot, current_row)
    technical_changed = stable_hash(snapshot_technical) != stable_hash(current_technical) or bool(
        catalog_fields
    )
    commercial_changed = stable_hash(snapshot_commercial) != stable_hash(current_commercial)
    technical_fields = _changed_fields("technical", snapshot_technical, current_technical)
    commercial_fields = _changed_fields("commercial", snapshot_commercial, current_commercial)

    if technical_changed:
        severity = "critical"
        message = (
            "Источник или версия каталога кабеля изменились."
            if catalog_fields
            else "Кабель найден в базе, но технические параметры изменились."
        )
    elif commercial_changed:
        severity = "warning"
        message = "Кабель найден в базе, но коммерческие данные изменились."
    else:
        severity = "ok"
        message = "Кабель совпадает с текущей базой."

    return {
        "technical_status": "changed" if technical_changed else "current",
        "commercial_status": "changed" if commercial_changed else "current",
        "severity": severity,
        "changed_fields": catalog_fields + technical_fields + commercial_fields,
        "message": message,
    }


def _changed_catalog_identity_fields(
    snapshot: dict[str, Any],
    current_row: dict[str, Any],
) -> list[str]:
    current_raw = current_row.get("_catalog_identity")
    current = current_raw if isinstance(current_raw, dict) else {}
    saved_raw = snapshot.get("catalog_identity")
    saved = saved_raw if isinstance(saved_raw, dict) else {}
    fields: list[str] = []
    if saved and current:
        for key in ("id", "version", "authority", "source_checksum", "payload_checksum"):
            if json_ready(saved.get(key)) != json_ready(current.get(key)):
                fields.append(f"catalog.{key}")
        return fields

    saved_source = str(snapshot.get("actual_catalog_source") or "").strip().lower()
    current_authority = str(current.get("authority") or "").strip().lower()
    current_source = (
        "database"
        if current_authority in {"database", "db"}
        else "builtin"
        if current_authority in {"static", "static_fallback", "builtin"}
        else ""
    )
    if saved_source and current_source and saved_source != current_source:
        fields.append("catalog.authority")
    return fields


def _changed_fields(prefix: str, left: dict[str, Any], right: dict[str, Any]) -> list[str]:
    fields: list[str] = []
    for key in sorted(set(left) | set(right)):
        if json_ready(left.get(key)) != json_ready(right.get(key)):
            fields.append(f"{prefix}.{key}")
    return fields
