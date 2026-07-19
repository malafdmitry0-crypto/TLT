"""PDL-ER-34 PDF-first source mapping loader."""

from __future__ import annotations

from functools import lru_cache
from typing import Any

from app.reference_data.loader import _load_json  # type: ignore[attr-defined]


@lru_cache
def _mapping() -> dict[str, Any]:
    return dict(_load_json("spec_source_mapping.json"))


@lru_cache
def _box_matrix() -> dict[str, Any]:
    try:
        return dict(_load_json("box_ex_rgr_matrix.json"))
    except Exception:
        return {"status": "missing", "rows": {}}


def clear_box_matrix_cache() -> None:
    _box_matrix.cache_clear()


def box_ex_rgr_matrix_registered() -> bool:
    data = _box_matrix()
    if data.get("status") != "registered":
        return False
    rows = data.get("rows")
    return isinstance(rows, dict) and len(rows) > 0


def box_ex_rgr_matrix_meta() -> dict[str, Any]:
    data = _box_matrix()
    return {
        "status": data.get("status"),
        "source": data.get("source"),
        "version": data.get("version"),
    }


def rule_mapping(rule_key: str) -> dict[str, Any] | None:
    rules = _mapping().get("rules") or {}
    item = rules.get(rule_key)
    return dict(item) if isinstance(item, dict) else None


def is_rule_approved(rule_key: str) -> bool:
    item = rule_mapping(rule_key)
    if not item:
        return False
    if item.get("status") != "approved":
        return False
    # XLSX-only formulas are not approved for auto emission (PDL-ER-34).
    if item.get("source") not in {"pdf", "pdf+catalog"}:
        return False
    requires = item.get("requires") or []
    return not (
        "box_ex_rgr_matrix" in requires and not box_ex_rgr_matrix_registered()
    )


def rule_exclusion(rule_key: str) -> dict[str, Any] | None:
    """Diagnostic payload when a rule cannot be emitted."""
    item = rule_mapping(rule_key)
    if item is None:
        return {
            "group": rule_key,
            "error_code": "SPEC_RULE_NOT_IN_SOURCE_MAPPING",
            "message": f"Правило «{rule_key}» отсутствует в PDF-first mapping (PDL-ER-34).",
        }
    if item.get("status") != "approved":
        return {
            "group": rule_key,
            "error_code": "SPEC_RULE_NOT_APPROVED",
            "message": f"Правило «{rule_key}» не утверждено для Phase 5 (PDL-ER-34).",
            "source": item.get("source"),
        }
    if item.get("source") == "xlsx_only":
        return {
            "group": rule_key,
            "error_code": "SPEC_RULE_XLSX_ONLY",
            "message": (
                f"Правило «{rule_key}» есть только в XLSX и не переносится "
                "без PDF contract (PDL-ER-34)."
            ),
        }
    requires = item.get("requires") or []
    if "box_ex_rgr_matrix" in requires and not box_ex_rgr_matrix_registered():
        return {
            "group": rule_key,
            "error_code": "BOX_EX_RGR_MATRIX_MISSING",
            "message": (
                "Официальная per-row матрица Ex/Rгр не зарегистрирована "
                f"(PDL-ER-35); правило «{rule_key}» fail-closed."
            ),
            "matrix": box_ex_rgr_matrix_meta(),
        }
    return None
