"""Dedupe keys for electrical cable candidates (engineering variants, not run history)."""

from __future__ import annotations

from typing import Any

from app.services.cable_snapshot import stable_hash

DEDUPE_KEY_VERSION = "v1"
TT_DEDUPE_KEY_VERSION = "v3"
UNSUPPORTED_CABLE_TYPES = {"mineral", "skin"}

_DIAGNOSTIC_CONTROL_KEYS = (
    "number_of_threads",
    "winding_pitch",
    "winding_coefficient",
    "supply_voltage",
    "voltage",
    "heating_height",
    "laying_step",
    "process_temperature",
    "connection_type",
    "scheme_count",
    "scheme_threads",
)


def _resolve(results: dict[str, Any] | None, params: dict[str, Any] | None, key: str) -> Any:
    if isinstance(results, dict) and results.get(key) is not None:
        return results[key]
    if isinstance(params, dict) and params.get(key) is not None:
        return params[key]
    return None


def _resolve_param_first(
    results: dict[str, Any] | None,
    params: dict[str, Any] | None,
    key: str,
) -> Any:
    if isinstance(params, dict) and params.get(key) is not None:
        return params[key]
    if isinstance(results, dict) and results.get(key) is not None:
        return results[key]
    return None


def _normalize_string(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _normalize_number(value: Any, *, decimals: int) -> float | int | None:
    if value is None:
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if decimals == 0:
        return int(round(number))
    return round(number, decimals)


def _normalize_int(value: Any) -> int | None:
    normalized = _normalize_number(value, decimals=0)
    return normalized if isinstance(normalized, int) else None


def normalize_object_type(object_type: Any) -> str:
    value = getattr(object_type, "value", object_type)
    normalized = str(value or "").strip().lower()
    return "tank" if normalized == "tank" else "pipe"


def normalize_winding_pitch(value: Any) -> float:
    if value is None:
        return 0.0
    try:
        pitch = float(value)
    except (TypeError, ValueError):
        return 0.0
    if pitch <= 0:
        return 0.0
    return round(pitch, 3)


def normalize_laying_step(
    results: dict[str, Any] | None,
    params: dict[str, Any] | None,
) -> float | None:
    pitch_mm = normalize_winding_pitch(_resolve(results, params, "winding_pitch"))
    if pitch_mm > 0:
        laying = _resolve(results, params, "laying_step")
        if laying is not None:
            return _normalize_number(laying, decimals=3)
        return round(pitch_mm / 1000.0, 3)
    laying = _resolve(results, params, "laying_step")
    return _normalize_number(laying, decimals=3)


def normalize_voltage(
    results: dict[str, Any] | None, params: dict[str, Any] | None
) -> float | int | None:
    for key in ("voltage", "supply_voltage"):
        value = _resolve(results, params, key)
        if value is not None:
            return _normalize_number(value, decimals=3)
    return None


def normalize_variant_voltage(
    results: dict[str, Any] | None,
    params: dict[str, Any] | None,
) -> float | int | None:
    for key in ("supply_voltage", "voltage"):
        value = _resolve_param_first(results, params, key)
        if value is not None:
            return _normalize_number(value, decimals=3)
    return None


def normalize_variant_laying_step(
    results: dict[str, Any] | None,
    params: dict[str, Any] | None,
) -> float | None:
    pitch_mm = normalize_winding_pitch(_resolve_param_first(results, params, "winding_pitch"))
    if pitch_mm > 0:
        laying = _resolve_param_first(results, params, "laying_step")
        if laying is not None:
            return _normalize_number(laying, decimals=3)
        return round(pitch_mm / 1000.0, 3)
    laying = _resolve_param_first(results, params, "laying_step")
    return _normalize_number(laying, decimals=3)


def normalize_threads(results: dict[str, Any] | None, params: dict[str, Any] | None) -> int | None:
    applied = _resolve(results, params, "applied_number_of_threads")
    if applied is not None:
        return _normalize_int(applied)
    num = _resolve(results, params, "num_circuits")
    if num is not None:
        return _normalize_int(num)
    requested = _resolve(results, params, "number_of_threads")
    if requested is not None:
        return _normalize_int(requested)
    return None


def normalize_resistive_scheme(
    results: dict[str, Any] | None,
    params: dict[str, Any] | None,
) -> dict[str, int | None]:
    scheme_count = _normalize_int(_resolve(results, params, "scheme_count"))
    scheme_threads = _normalize_int(_resolve(results, params, "scheme_threads"))
    threads = normalize_threads(results, params)

    if scheme_count is None and scheme_threads is None and threads is not None:
        scheme_count = 1
        scheme_threads = threads
    elif scheme_count is None and scheme_threads and threads and scheme_threads != 0:
        ratio = threads / scheme_threads
        if ratio.is_integer():
            scheme_count = int(ratio)
    elif scheme_threads is None and scheme_count and threads and scheme_count != 0:
        ratio = threads / scheme_count
        if ratio.is_integer():
            scheme_threads = int(ratio)

    return {"scheme_count": scheme_count, "scheme_threads": scheme_threads}


def actual_catalog_source(
    cable_snapshot: dict[str, Any] | None,
    cable_source: str,
) -> str:
    actual: str | None = None
    if isinstance(cable_snapshot, dict):
        raw = cable_snapshot.get("actual_catalog_source")
        if isinstance(raw, str) and raw.strip() and raw.strip() != "all":
            actual = raw.strip()
    if actual:
        return actual
    if cable_source and cable_source != "all":
        return cable_source
    return "builtin"


def catalog_identity(
    *,
    cable_snapshot: dict[str, Any] | None,
    cable_source: str,
    cable_mark: str | None,
) -> str:
    if isinstance(cable_snapshot, dict):
        fingerprint = cable_snapshot.get("fingerprint")
        if isinstance(fingerprint, dict):
            technical_hash = fingerprint.get("technical_hash")
            if technical_hash:
                return f"tech:{technical_hash}"
        entry_id = cable_snapshot.get("catalog_entry_id")
        if entry_id is not None:
            return f"id:{entry_id}"
    source = actual_catalog_source(cable_snapshot, cable_source)
    mark = _normalize_string(cable_mark) or ""
    return f"{source}:{mark}"


def resolved_cable_mark(
    *,
    cable_type: str,
    cable_mark: str | None,
    results: dict[str, Any] | None,
    params: dict[str, Any] | None,
) -> str | None:
    values: list[Any] = []
    if isinstance(results, dict):
        if cable_type == "self_regulating_tt":
            values.extend([results.get("cable_mark"), results.get("selected_cable")])
        else:
            values.extend([results.get("cable_mark"), results.get("selected_cable")])
    if isinstance(params, dict):
        values.extend([params.get("cable_mark"), params.get("selected_cable")])
    values.append(cable_mark)
    for value in values:
        mark = _normalize_string(value)
        if mark:
            return mark
    return None


def _variant_payload(
    *,
    object_type: str,
    cable_type: str,
    cable_source: str,
    cable_mark: str | None,
    results: dict[str, Any] | None,
    params: dict[str, Any] | None,
    cable_snapshot: dict[str, Any] | None,
) -> dict[str, Any]:
    object_kind = normalize_object_type(object_type)
    mark = resolved_cable_mark(
        cable_type=cable_type,
        cable_mark=cable_mark,
        results=results,
        params=params,
    )
    payload: dict[str, Any] = {
        "cable_type": cable_type,
        "object_type": object_kind,
        "catalog_identity": catalog_identity(
            cable_snapshot=cable_snapshot,
            cable_source=cable_source,
            cable_mark=mark,
        ),
        "resolved_mark": mark,
    }
    if cable_type != "self_regulating_tt":
        payload.update(
            {
                "voltage": normalize_variant_voltage(results, params),
                "winding_coefficient": _normalize_number(
                    _resolve_param_first(results, params, "winding_coefficient"),
                    decimals=6,
                ),
            }
        )

    if cable_type in {"self_regulating", "self_regulating_tt"}:
        payload["threads"] = normalize_threads(results, params)

    if object_kind == "tank":
        payload.update(
            {
                "heating_height": _normalize_number(
                    _resolve_param_first(results, params, "heating_height"),
                    decimals=3,
                ),
                "laying_step_resolved": normalize_variant_laying_step(results, params),
            }
        )
    else:
        payload["winding_pitch"] = normalize_winding_pitch(
            _resolve_param_first(results, params, "winding_pitch")
        )

    if cable_type == "self_regulating_tt":
        payload["voltage"] = normalize_variant_voltage(results, params)
    if cable_type in {"single_core", "three_core"}:
        scheme = normalize_resistive_scheme(results, params)
        payload.update(
            {
                "scheme_count": scheme["scheme_count"],
                "scheme_threads": scheme["scheme_threads"],
                "connection_type": _normalize_string(_resolve(results, params, "connection_type")),
                "requested_connection_type": _normalize_string(
                    _resolve_param_first(results, params, "connection_type")
                ),
            }
        )
    return payload


def build_identity_payload(
    *,
    object_type: str,
    cable_type: str,
    cable_source: str,
    cable_mark: str | None,
    results: dict[str, Any] | None,
    params: dict[str, Any] | None,
    cable_snapshot: dict[str, Any] | None,
    reason_code: str | None = None,
    status: str | None = None,
) -> dict[str, Any]:
    object_kind = normalize_object_type(object_type)
    mark = resolved_cable_mark(
        cable_type=cable_type,
        cable_mark=cable_mark,
        results=results,
        params=params,
    )
    # Error with a resolved mark is still an engineering variant attempt (manual cable check).
    use_diagnostic = (
        cable_type in UNSUPPORTED_CABLE_TYPES or mark is None or status == "not_applicable"
    )
    if use_diagnostic:
        controls: dict[str, Any] = {}
        for key in _DIAGNOSTIC_CONTROL_KEYS:
            if cable_type == "self_regulating_tt" and key in {
                "voltage",
                "supply_voltage",
                "winding_coefficient",
            }:
                continue
            value = _resolve(results, params, key)
            if value is None:
                continue
            if key == "winding_pitch":
                controls[key] = normalize_winding_pitch(value)
            elif key == "winding_coefficient":
                controls[key] = _normalize_number(value, decimals=6)
            elif key == "number_of_threads":
                controls[key] = _normalize_number(value, decimals=0)
            elif key in {"voltage", "supply_voltage"}:
                controls["voltage"] = normalize_voltage(results, params)
            elif key in {"scheme_count", "scheme_threads"}:
                controls[key] = _normalize_number(value, decimals=0)
            elif key in {
                "heating_height",
                "process_temperature",
                "laying_step",
            }:
                controls[key] = _normalize_number(value, decimals=3)
            else:
                controls[key] = _normalize_string(value) or value
        if cable_type == "self_regulating_tt":
            voltage = normalize_variant_voltage(results, params)
            if voltage is not None:
                controls["voltage"] = voltage
        return {
            "kind": "diagnostic",
            "cable_type": cable_type,
            "object_type": object_kind,
            "catalog_source": actual_catalog_source(cable_snapshot, cable_source),
            "reason_code": _normalize_string(reason_code) or "unknown",
            "controls": controls,
        }
    return {
        "kind": "variant",
        **_variant_payload(
            object_type=object_kind,
            cable_type=cable_type,
            cable_source=cable_source,
            cable_mark=cable_mark,
            results=results,
            params=params,
            cable_snapshot=cable_snapshot,
        ),
    }


def build_dedupe_key(
    *,
    object_type: str,
    cable_type: str,
    cable_source: str,
    cable_mark: str | None,
    results: dict[str, Any] | None,
    params: dict[str, Any] | None,
    cable_snapshot: dict[str, Any] | None,
    reason_code: str | None = None,
    status: str | None = None,
) -> str:
    payload = build_identity_payload(
        object_type=object_type,
        cable_type=cable_type,
        cable_source=cable_source,
        cable_mark=cable_mark,
        results=results,
        params=params,
        cable_snapshot=cable_snapshot,
        reason_code=reason_code,
        status=status,
    )
    version = TT_DEDUPE_KEY_VERSION if cable_type == "self_regulating_tt" else DEDUPE_KEY_VERSION
    return f"{version}:{stable_hash(payload)}"


def merge_engineer_comments(*comments: str | None) -> str | None:
    seen: list[str] = []
    for comment in comments:
        if not comment:
            continue
        text = comment.strip()
        if text and text not in seen:
            seen.append(text)
    if not seen:
        return None
    return "; ".join(seen)


def pick_survivor_index(rows: list[Any]) -> int:
    """Pick row index to keep when collapsing duplicates (higher priority first)."""

    def sort_key(index: int) -> tuple[int, int, float, float]:
        row = rows[index]
        updated = getattr(row, "updated_at", None)
        created = getattr(row, "created_at", None)
        updated_ts = updated.timestamp() if updated is not None else 0.0
        created_ts = created.timestamp() if created is not None else 0.0
        return (
            1 if getattr(row, "is_applied", False) else 0,
            1 if getattr(row, "is_pinned", False) else 0,
            updated_ts,
            created_ts,
        )

    return max(range(len(rows)), key=sort_key)


def merge_duplicate_candidate_fields(keeper: Any, other: Any) -> None:
    """Merge engineer flags/comments from duplicate into survivor (in-place)."""
    keeper.priority = max(getattr(keeper, "priority", 0), getattr(other, "priority", 0))
    keeper.is_recommended = bool(getattr(keeper, "is_recommended", False)) or bool(
        getattr(other, "is_recommended", False)
    )
    keeper.is_pinned = bool(getattr(keeper, "is_pinned", False)) or bool(
        getattr(other, "is_pinned", False)
    )
    keeper.engineer_comment = merge_engineer_comments(
        getattr(keeper, "engineer_comment", None),
        getattr(other, "engineer_comment", None),
    )
    if getattr(other, "is_applied", False) and not getattr(keeper, "is_applied", False):
        keeper.is_applied = True
