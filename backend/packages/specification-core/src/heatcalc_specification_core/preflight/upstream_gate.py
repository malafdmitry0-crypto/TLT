"""Pure catalog and electrical-result gates for specification preflight."""

from __future__ import annotations

from decimal import Decimal

from heatcalc_specification_core.diagnostics import Diagnostic, DiagnosticCode, IssueKind
from heatcalc_specification_core.json_types import JsonObject, JsonValue

from .contracts import PreflightAssignment, PreflightCatalog


def catalog_diagnostics(catalog: PreflightCatalog | None) -> list[Diagnostic]:
    if catalog is None:
        return [
            _diagnostic(
                DiagnosticCode.CATALOG_UNAVAILABLE,
                "Не выбрана immutable версия каталога спецификации",
            )
        ]
    identity = catalog.identity
    if not catalog.is_active:
        return [
            _diagnostic(
                DiagnosticCode.CATALOG_VERSION_INACTIVE,
                "Версия каталога спецификации не активна",
                details={
                    "catalog_id": str(identity.catalog_id),
                    "catalog_version": identity.version,
                },
            )
        ]
    if catalog.authority not in {"approved", "demo"} or not catalog.is_complete:
        return [
            _diagnostic(
                DiagnosticCode.ACCESSORY_CATALOG_INCOMPLETE,
                "Каталог спецификации неполный или неавторитетный",
                issues=catalog.completeness_issues,
                details={
                    "catalog_id": str(identity.catalog_id),
                    "catalog_version": identity.version,
                    "authority": catalog.authority,
                    "is_complete": catalog.is_complete,
                },
            )
        ]
    return []


def assignment_diagnostics(row: PreflightAssignment, catalog: PreflightCatalog) -> list[Diagnostic]:
    details: dict[str, JsonValue] = {
        "object_id": str(row.object_id),
        "assignment_id": str(row.assignment_id),
        "calculation_id": str(row.calculation_id) if row.calculation_id else None,
    }
    if row.upstream_reason:
        details["reason"] = row.upstream_reason
    if row.upstream_error_code:
        details["upstream_error_code"] = row.upstream_error_code
    if row.object_type not in {"pipe", "tank"}:
        return [
            _diagnostic(
                DiagnosticCode.UNSUPPORTED_OBJECT_TYPE,
                "Для спецификации поддерживаются только трубопроводы и резервуары",
                details=details,
            )
        ]
    if not row.object_is_valid:
        return [
            _diagnostic(
                DiagnosticCode.VARIANT_NOT_READY, "Объект не прошёл Heat-валидацию", details=details
            )
        ]
    if row.system_type != "self_regulating":
        return [
            _diagnostic(
                DiagnosticCode.UNSUPPORTED_OBJECT_TYPE,
                "Для спецификации поддерживается только саморегулирующаяся система",
                details=details,
            )
        ]
    if row.assignment_state != "ready":
        return [
            _diagnostic(
                DiagnosticCode.VARIANT_NOT_READY,
                "Назначение ЭР не готово к формированию спецификации",
                details={**details, "assignment_state": row.assignment_state},
            )
        ]
    result = row.result
    if result is None:
        return [
            _diagnostic(
                DiagnosticCode.VARIANT_NOT_READY,
                "Отсутствует результат электрического расчёта",
                details=details,
            )
        ]
    if row.calculation_id is None or row.calculation_updated_at is None:
        return [
            _diagnostic(
                DiagnosticCode.VARIANT_NOT_READY,
                "У результата нет immutable identity/revision snapshot",
                details=details,
            )
        ]
    if not (
        result.production_eligible
        and result.provenance_production_eligible
        and not result.mocked_fields
        and not result.provenance_mocked_fields
    ):
        return [
            _diagnostic(
                DiagnosticCode.MOCK_INPUTS_NOT_ALLOWED,
                "Непроизводственный или mocked результат нельзя использовать в спецификации",
                details=details,
            )
        ]
    if result.upstream_status == "stale":
        return [
            _diagnostic(
                DiagnosticCode.RESULT_STALE,
                "Результат электрического расчёта устарел",
                details=details,
            )
        ]
    if result.upstream_status != "success":
        return [
            _diagnostic(
                DiagnosticCode.VARIANT_NOT_READY,
                "Результат электрического расчёта неуспешен",
                details={**details, "result_status": result.upstream_status},
            )
        ]
    if not _revisions_match(row):
        return [
            _diagnostic(
                DiagnosticCode.RESULT_STALE,
                "Ревизии объекта, Heat, назначения и результата не совпадают",
                details=details,
            )
        ]
    if not result.cable_mark or not result.nomenclature_code:
        return [
            _diagnostic(
                DiagnosticCode.CABLE_NOMENCLATURE_MISSING,
                "В canonical TT result отсутствует точная кабельная номенклатура",
                details=details,
            )
        ]
    exact_item = any(
        item.category == "cable"
        and item.mark == result.cable_mark
        and item.nomenclature_code == result.nomenclature_code
        for item in catalog.items
    )
    if not exact_item:
        return [
            _diagnostic(
                DiagnosticCode.CABLE_NOMENCLATURE_MISSING,
                "В активном каталоге нет точной номенклатуры кабеля",
                details={
                    **details,
                    "cable_mark": result.cable_mark,
                    "nomenclature_code": result.nomenclature_code,
                },
            )
        ]
    section_issue = _section_plan_issue(row)
    if section_issue is not None:
        return [
            _diagnostic(
                DiagnosticCode.SECTION_PLAN_INVALID,
                "Автоматический план секций отсутствует или неконсистентен",
                details={**details, **section_issue},
            )
        ]
    return []


def _revisions_match(row: PreflightAssignment) -> bool:
    result = row.result
    assert result is not None
    return (
        row.assignment_object_version == row.object_version
        and result.object_snapshot_version == row.object_version
        and result.provenance_object_version == row.object_version
        and result.heat_snapshot_version == row.object_version
        and result.heat_result_version == row.object_version
        and result.provenance_assignment_version == row.assignment_version
    )


def _section_plan_issue(row: PreflightAssignment) -> dict[str, JsonValue] | None:
    result = row.result
    assert result is not None
    if result.section_plan_origin != "automatic":
        return {"section_plan_origin": result.section_plan_origin}
    values = {
        "section_count": _positive(result.section_count),
        "section_length_m": _positive(result.section_length_m),
        "actual_installed_length_m": _positive(result.actual_installed_length_m),
        "required_order_length_m": _positive(result.required_order_length_m),
    }
    missing = sorted(key for key, value in values.items() if value is None)
    if missing:
        return {"missing_or_invalid_fields": missing}
    count = values["section_count"]
    length = values["section_length_m"]
    installed = values["actual_installed_length_m"]
    assert count is not None and length is not None and installed is not None
    if count != count.to_integral_value() or length * count != installed:
        return {
            "section_count": str(count),
            "section_length_m": str(length),
            "actual_installed_length_m": str(installed),
        }
    return None


def _positive(value: Decimal | None) -> Decimal | None:
    return value if value is not None and value.is_finite() and value > 0 else None


def _diagnostic(
    code: DiagnosticCode,
    message: str,
    *,
    issues: tuple[JsonObject, ...] = (),
    details: JsonObject | None = None,
) -> Diagnostic:
    return Diagnostic(code, IssueKind.BLOCKING, message, issues=issues, details=details or {})
