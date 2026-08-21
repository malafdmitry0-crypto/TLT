"""Canonical, dependency-free JSON helpers for specification fingerprints."""

from __future__ import annotations

import hashlib
import json
from collections.abc import Mapping
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID


def canonical_decimal(value: Decimal) -> str:
    """Serialize a finite Decimal without exponent or insignificant zeroes."""
    if not value.is_finite():
        raise ValueError("fingerprint payload contains a non-finite Decimal")
    normalized = value.normalize()
    return "0" if normalized.is_zero() else format(normalized, "f")


def normalize_json(value: Any) -> Any:
    """Normalize the supported immutable value domain for canonical JSON."""
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, Decimal):
        return canonical_decimal(value)
    if isinstance(value, datetime):
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("fingerprint payload contains a timezone-naive datetime")
        return value.astimezone(UTC).isoformat().replace("+00:00", "Z")
    if isinstance(value, Mapping):
        return {str(key): normalize_json(item) for key, item in value.items()}
    if isinstance(value, tuple | list):
        return [normalize_json(item) for item in value]
    if value is None or isinstance(value, str | int | bool):
        return value
    if isinstance(value, float):
        raise ValueError("fingerprint payload contains an ambiguous float")
    raise TypeError(f"fingerprint payload contains unsupported type: {type(value).__name__}")


def canonical_fingerprint(payload: Any) -> str:
    """Return SHA-256 over canonical JSON; ambiguous floats are rejected."""
    encoded = json.dumps(
        normalize_json(payload),
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    ).encode("utf-8")
    return f"sha256:{hashlib.sha256(encoded).hexdigest()}"
