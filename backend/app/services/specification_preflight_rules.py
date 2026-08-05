"""Pure UUID-scoped readiness rules for specification generation."""

from __future__ import annotations

import hashlib
import json
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import Any
from uuid import UUID

from app.electrical_result_status import electrical_result_status
from app.schemas.specification import (
    SpecificationDiagnostic,
    SpecificationDiagnosticCode,
    SpecificationIssueKind,
    SpecificationPreflightStatus,
    SpecificationVariantPreflightResult,
)


@dataclass(frozen=True)
class ImmutableSpecificationCatalogItem:
    item_id: UUID | str
    category: str
    mark: str
    nomenclature_code: str


@dataclass(frozen=True)
class ImmutableSpecificationCatalog:
    catalog_id: UUID | str
    version: str
    checksum: str
    is_active: bool
    is_complete: bool
    authority: str
    items: tuple[ImmutableSpecificationCatalogItem, ...]
    completeness_issues: tuple[Mapping[str, Any], ...] = ()


@dataclass(frozen=True)
class SpecificationPreflightAssignment:
    """One already ER-scoped object, assignment, and saved calculation snapshot."""

    assignment_id: UUID
    calculation_id: UUID | None
    calculation_updated_at: datetime | None
    object_id: UUID
    object_type: str
    object_is_valid: bool
    assignment_state: str
    system_type: str | None
    object_version: int
    assignment_version: int
    assignment_object_version: int
    result: Mapping[str, Any] | None = None


def canonical_fingerprint(payload: Any) -> str:
    """Return SHA-256 over canonical JSON; floats are intentionally rejected."""
    encoded = json.dumps(
        _normalize_json(payload),
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    ).encode("utf-8")
    return f"sha256:{hashlib.sha256(encoded).hexdigest()}"


def evaluate_specification_preflight(
    *,
    electrical_variant_id: UUID,
    assignments: Sequence[SpecificationPreflightAssignment],
    catalog: ImmutableSpecificationCatalog | None,
    exclude_unassigned_confirmed: bool,
    electrical_variant_name: str | None = None,
) -> SpecificationVariantPreflightResult:
    """Evaluate only supplied ER assignments; this function has no side effects."""
    unassigned = sorted(
        (row.object_id for row in assignments if row.assignment_state == "unassigned"), key=str
    )
    excluded = unassigned if exclude_unassigned_confirmed else []
    diagnostics = _catalog_diagnostics(catalog)
    row_diagnostics: dict[UUID, list[SpecificationDiagnostic]] = {}
    if catalog is not None:
        for row in assignments:
            if row.assignment_state != "unassigned":
                row_diagnostics[row.object_id] = _assignment_diagnostics(row, catalog)
                diagnostics.extend(row_diagnostics[row.object_id])

    if any(item.kind is SpecificationIssueKind.BLOCKING for item in diagnostics):
        status = SpecificationPreflightStatus.BLOCKED
    elif unassigned and not exclude_unassigned_confirmed:
        diagnostics.append(
            _diagnostic(
                SpecificationDiagnosticCode.UNASSIGNED_CONFIRMATION_REQUIRED,
                SpecificationIssueKind.CONFIRMABLE,
                "Есть объекты без назначения в выбранном ЭР",
                details={"unassigned_object_ids": [str(object_id) for object_id in unassigned]},
            )
        )
        status = SpecificationPreflightStatus.CONFIRMATION_REQUIRED
    else:
        status = SpecificationPreflightStatus.READY

    contributing = sum(
        row.assignment_state != "unassigned"
        and row.object_id in row_diagnostics
        and not row_diagnostics[row.object_id]
        for row in assignments
    )
    fingerprint: str | None = None
    if status is SpecificationPreflightStatus.READY:
        try:
            fingerprint = canonical_fingerprint(
                _preflight_fingerprint_payload(
                    electrical_variant_id=electrical_variant_id,
                    assignments=assignments,
                    catalog=catalog,
                    excluded_unassigned_object_ids=excluded,
                )
            )
        except (TypeError, ValueError) as exc:
            diagnostics.append(
                _diagnostic(
                    SpecificationDiagnosticCode.FORMULA_INPUT_INVALID,
                    SpecificationIssueKind.BLOCKING,
                    "Fingerprint содержит неоднозначные или невалидные входные данные",
                    details={"reason": str(exc)},
                )
            )
            status = SpecificationPreflightStatus.BLOCKED

    return SpecificationVariantPreflightResult(
        electrical_variant_id=electrical_variant_id,
        electrical_variant_name=electrical_variant_name,
        status=status,
        total_objects=len(assignments),
        contributing_objects=contributing,
        unassigned_object_ids=unassigned,
        excluded_unassigned_object_ids=excluded,
        diagnostics=diagnostics,
        fingerprint_schema="specification-preflight/v1" if fingerprint else None,
        input_fingerprint=fingerprint,
    )


def _catalog_diagnostics(
    catalog: ImmutableSpecificationCatalog | None,
) -> list[SpecificationDiagnostic]:
    if catalog is None:
        return [
            _diagnostic(
                SpecificationDiagnosticCode.CATALOG_UNAVAILABLE,
                SpecificationIssueKind.BLOCKING,
                "Не выбрана immutable версия каталога спецификации",
            )
        ]
    if not catalog.is_active:
        return [
            _diagnostic(
                SpecificationDiagnosticCode.CATALOG_VERSION_INACTIVE,
                SpecificationIssueKind.BLOCKING,
                "Версия каталога спецификации не активна",
                details={"catalog_id": str(catalog.catalog_id), "catalog_version": catalog.version},
            )
        ]
    # ``demo`` can arrive here only through SpecificationCatalogService,
    # which admits the exact bundled Case 1 identity in non-production.
    if catalog.authority not in {"approved", "demo"} or not catalog.is_complete:
        return [
            _diagnostic(
                SpecificationDiagnosticCode.ACCESSORY_CATALOG_INCOMPLETE,
                SpecificationIssueKind.BLOCKING,
                "Каталог спецификации неполный или неавторитетный",
                issues=[dict(issue) for issue in catalog.completeness_issues],
                details={
                    "catalog_id": str(catalog.catalog_id),
                    "catalog_version": catalog.version,
                    "authority": catalog.authority,
                    "is_complete": catalog.is_complete,
                },
            )
        ]
    return []


def _assignment_diagnostics(
    row: SpecificationPreflightAssignment,
    catalog: ImmutableSpecificationCatalog,
) -> list[SpecificationDiagnostic]:
    details = {
        "object_id": str(row.object_id),
        "assignment_id": str(row.assignment_id),
        "calculation_id": str(row.calculation_id) if row.calculation_id else None,
    }
    if row.object_type != "pipe":
        return [
            _diagnostic(
                SpecificationDiagnosticCode.UNSUPPORTED_OBJECT_TYPE,
                SpecificationIssueKind.BLOCKING,
                "Для спецификации поддерживаются только трубопроводы",
                details=details,
            )
        ]
    if not row.object_is_valid:
        return [
            _diagnostic(
                SpecificationDiagnosticCode.VARIANT_NOT_READY,
                SpecificationIssueKind.BLOCKING,
                "Объект не прошёл Heat-валидацию",
                details=details,
            )
        ]
    if row.system_type != "self_regulating":
        return [
            _diagnostic(
                SpecificationDiagnosticCode.UNSUPPORTED_OBJECT_TYPE,
                SpecificationIssueKind.BLOCKING,
                "Для спецификации поддерживается только саморегулирующаяся система",
                details=details,
            )
        ]
    if row.assignment_state != "ready":
        return [
            _diagnostic(
                SpecificationDiagnosticCode.VARIANT_NOT_READY,
                SpecificationIssueKind.BLOCKING,
                "Назначение ЭР не готово к формированию спецификации",
                details={**details, "assignment_state": row.assignment_state},
            )
        ]
    if not isinstance(row.result, Mapping):
        return [
            _diagnostic(
                SpecificationDiagnosticCode.VARIANT_NOT_READY,
                SpecificationIssueKind.BLOCKING,
                "Отсутствует результат электрического расчёта",
                details=details,
            )
        ]
    if row.calculation_id is None or row.calculation_updated_at is None:
        return [
            _diagnostic(
                SpecificationDiagnosticCode.VARIANT_NOT_READY,
                SpecificationIssueKind.BLOCKING,
                "У результата нет immutable identity/revision snapshot",
                details=details,
            )
        ]
    if not _production_result(row.result):
        return [
            _diagnostic(
                SpecificationDiagnosticCode.MOCK_INPUTS_NOT_ALLOWED,
                SpecificationIssueKind.BLOCKING,
                "Непроизводственный или mocked результат нельзя использовать в спецификации",
                details=details,
            )
        ]

    cable = row.result.get("cable")
    canonical_mark = cable.get("mark") if isinstance(cable, Mapping) else None
    result_status = electrical_result_status(
        canonical_mark if isinstance(canonical_mark, str) else None,
        dict(row.result),
    )
    if result_status == "stale":
        return [
            _diagnostic(
                SpecificationDiagnosticCode.RESULT_STALE,
                SpecificationIssueKind.BLOCKING,
                "Результат электрического расчёта устарел",
                details=details,
            )
        ]
    if result_status != "success":
        return [
            _diagnostic(
                SpecificationDiagnosticCode.VARIANT_NOT_READY,
                SpecificationIssueKind.BLOCKING,
                "Результат электрического расчёта неуспешен",
                details={**details, "result_status": result_status},
            )
        ]
    if not _revisions_match(row, row.result):
        return [
            _diagnostic(
                SpecificationDiagnosticCode.RESULT_STALE,
                SpecificationIssueKind.BLOCKING,
                "Ревизии объекта, Heat, назначения и результата не совпадают",
                details=details,
            )
        ]
    if (
        not isinstance(cable, Mapping)
        or not isinstance(cable.get("mark"), str)
        or not isinstance(cable.get("nomenclature_code"), str)
    ):
        return [
            _diagnostic(
                SpecificationDiagnosticCode.CABLE_NOMENCLATURE_MISSING,
                SpecificationIssueKind.BLOCKING,
                "В canonical TT result отсутствует точная кабельная номенклатура",
                details=details,
            )
        ]
    mark = cable["mark"]
    code = cable["nomenclature_code"]
    exact_item = any(
        item.category == "cable" and item.mark == mark and item.nomenclature_code == code
        for item in catalog.items
    )
    if not mark or not code or not exact_item:
        return [
            _diagnostic(
                SpecificationDiagnosticCode.CABLE_NOMENCLATURE_MISSING,
                SpecificationIssueKind.BLOCKING,
                "В активном каталоге нет точной номенклатуры кабеля",
                details={
                    **details,
                    "cable_mark": mark,
                    "nomenclature_code": code,
                },
            )
        ]
    section_issue = _section_plan_issue(row.result)
    if section_issue is not None:
        return [
            _diagnostic(
                SpecificationDiagnosticCode.SECTION_PLAN_INVALID,
                SpecificationIssueKind.BLOCKING,
                "Автоматический план секций отсутствует или неконсистентен",
                details={**details, **section_issue},
            )
        ]
    return []


def _production_result(result: Mapping[str, Any]) -> bool:
    provenance = result.get("provenance")
    return (
        isinstance(provenance, Mapping)
        and result.get("production_eligible") is True
        and provenance.get("production_eligible") is True
        and result.get("mocked_fields") == []
        and provenance.get("mocked_fields") == []
    )


def _revisions_match(row: SpecificationPreflightAssignment, result: Mapping[str, Any]) -> bool:
    provenance = result.get("provenance")
    if not isinstance(provenance, Mapping):
        return False
    object_snapshot = provenance.get("object_snapshot")
    heat_snapshot = provenance.get("heat_snapshot")
    if not isinstance(object_snapshot, Mapping) or not isinstance(heat_snapshot, Mapping):
        return False
    return (
        row.assignment_object_version == row.object_version
        and object_snapshot.get("version") == row.object_version
        and provenance.get("object_version") == row.object_version
        and heat_snapshot.get("version") == row.object_version
        and provenance.get("heat_result_version") == row.object_version
        and provenance.get("assignment_version") == row.assignment_version
    )


def _section_plan_issue(result: Mapping[str, Any]) -> dict[str, Any] | None:
    layout = result.get("layout") if isinstance(result.get("layout"), Mapping) else {}
    plan = result.get("section_plan") if isinstance(result.get("section_plan"), Mapping) else {}
    origin = plan.get("origin", "automatic")
    if origin != "automatic":
        return {"section_plan_origin": origin}
    values = {
        "section_count": _positive_decimal(
            result.get("section_count", result.get("num_sections", plan.get("count")))
        ),
        "section_length_m": _positive_decimal(result.get("section_length_m", plan.get("length_m"))),
        "actual_installed_length_m": _positive_decimal(layout.get("actual_installed_length_m")),
        "required_order_length_m": _positive_decimal(layout.get("required_order_length_m")),
    }
    missing = sorted(key for key, value in values.items() if value is None)
    if missing:
        return {"missing_or_invalid_fields": missing}
    count, length, installed = (
        values["section_count"],
        values["section_length_m"],
        values["actual_installed_length_m"],
    )
    assert count is not None and length is not None and installed is not None
    if count != count.to_integral_value() or length * count != installed:
        return {
            "section_count": str(count),
            "section_length_m": str(length),
            "actual_installed_length_m": str(installed),
        }
    return None


def _preflight_fingerprint_payload(
    *,
    electrical_variant_id: UUID,
    assignments: Sequence[SpecificationPreflightAssignment],
    catalog: ImmutableSpecificationCatalog | None,
    excluded_unassigned_object_ids: Sequence[UUID],
) -> dict[str, Any]:
    assert catalog is not None
    rows = []
    for row in sorted(
        (item for item in assignments if item.assignment_state != "unassigned"),
        key=lambda item: str(item.object_id),
    ):
        assert row.result is not None
        cable = row.result["cable"]
        layout = row.result["layout"]
        plan = row.result["section_plan"]
        provenance = row.result["provenance"]
        rows.append(
            {
                "assignment_id": row.assignment_id,
                "calculation_id": row.calculation_id,
                "calculation_updated_at": row.calculation_updated_at,
                "object_id": row.object_id,
                "object_version": row.object_version,
                "assignment_version": row.assignment_version,
                "cable": {"mark": cable["mark"], "nomenclature_code": cable["nomenclature_code"]},
                "section_plan": {
                    "count": _decimal_token(plan["count"]),
                    "length_m": _decimal_token(plan["length_m"]),
                },
                "layout": {
                    "actual_installed_length_m": _decimal_token(
                        layout["actual_installed_length_m"]
                    ),
                    "required_order_length_m": _decimal_token(layout["required_order_length_m"]),
                },
                "revisions": {
                    "object_snapshot_version": provenance["object_snapshot"]["version"],
                    "heat_snapshot_version": provenance["heat_snapshot"]["version"],
                    "object_version": provenance["object_version"],
                    "heat_result_version": provenance["heat_result_version"],
                    "assignment_version": provenance["assignment_version"],
                },
            }
        )
    return {
        "schema": "specification-preflight/v1",
        "electrical_variant_id": electrical_variant_id,
        "catalog": {
            "id": catalog.catalog_id,
            "version": catalog.version,
            "checksum": catalog.checksum,
        },
        "assignments": rows,
        "excluded_unassigned_object_ids": sorted(excluded_unassigned_object_ids, key=str),
    }


def _positive_decimal(value: Any) -> Decimal | None:
    try:
        decimal = _decimal_value(value)
    except (TypeError, ValueError):
        return None
    return decimal if decimal > 0 else None


def _decimal_token(value: Any) -> str:
    return _canonical_decimal(_decimal_value(value))


def _decimal_value(value: Any) -> Decimal:
    if isinstance(value, bool) or value is None:
        raise TypeError("numeric values must be Decimal, int, float, or decimal string")
    try:
        decimal = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError) as exc:
        raise ValueError("invalid decimal value") from exc
    if not decimal.is_finite():
        raise ValueError("non-finite decimal value")
    return decimal


def _canonical_decimal(value: Decimal) -> str:
    normalized = value.normalize()
    return "0" if normalized.is_zero() else format(normalized, "f")


def _diagnostic(
    code: SpecificationDiagnosticCode,
    kind: SpecificationIssueKind,
    message: str,
    *,
    issues: list[dict[str, Any]] | None = None,
    details: dict[str, Any] | None = None,
) -> SpecificationDiagnostic:
    return SpecificationDiagnostic(
        code=code, kind=kind, message=message, issues=issues or [], details=details or {}
    )


def _normalize_json(value: Any) -> Any:
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, Decimal):
        if not value.is_finite():
            raise ValueError("fingerprint payload contains a non-finite Decimal")
        return _canonical_decimal(value)
    if isinstance(value, datetime):
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("fingerprint payload contains a timezone-naive datetime")
        return value.isoformat().replace("+00:00", "Z")
    if isinstance(value, Mapping):
        return {str(key): _normalize_json(item) for key, item in value.items()}
    if isinstance(value, tuple | list):
        return [_normalize_json(item) for item in value]
    if value is None or isinstance(value, str | int | bool):
        return value
    if isinstance(value, float):
        raise ValueError("fingerprint payload contains an ambiguous float")
    raise TypeError(f"fingerprint payload contains unsupported type: {type(value).__name__}")
