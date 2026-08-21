"""Application adapter for the core TT physical final-acceptance gate."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from decimal import Decimal
from typing import Any, Never

from heatcalc_electrical_core import EqualSection, TTFormulaIssue, TTFormulaReport
from heatcalc_electrical_core.final_gate import validate_final_physical_gate
from heatcalc_electrical_core.sections import SectionPlan

from app.electrical_domain import ElectricalFormulaError
from app.formulas.electrical.decimal_math import decimal_value
from app.formulas.electrical.outcome_errors import (
    electrical_error_from_report,
    raise_electrical_formula_report,
)


def _mapping_error(index: int, field: str, value: object = None) -> Never:
    details: dict[str, Any] = {"check": "equal_sections", "left": {"index": index, "field": field}}
    if value is not None:
        details["left"]["value"] = value
    report = TTFormulaReport((TTFormulaIssue("ELECTRICAL_FINAL_GATE_FAILED", details=details),))
    raise electrical_error_from_report(report)


def _core_sections(sections: Sequence[Mapping[str, Any]]) -> tuple[EqualSection, ...]:
    projected: list[EqualSection] = []
    for index, item in enumerate(sections, start=1):
        if not isinstance(item, Mapping):
            _mapping_error(index, "section", item)
        values: dict[str, Decimal] = {}
        for field in (
            "length_m",
            "voltage_v",
            "power_w",
            "working_current_a",
            "start_current_a",
        ):
            raw = item.get(field)
            if raw is None:
                _mapping_error(index, field)
            try:
                values[field] = decimal_value(raw)
            except (ArithmeticError, TypeError, ValueError):
                _mapping_error(index, field, raw)
        projected.append(
            EqualSection(
                length_m=values["length_m"],
                voltage_v=values["voltage_v"],
                power_w=values["power_w"],
                working_current_a=values["working_current_a"],
                start_current_a=values["start_current_a"],
            )
        )
    return tuple(projected)


def _assert_catalog_identity(catalogs: Mapping[str, Any]) -> None:
    """Catalog version/checksum policy is app authority, not core physics."""
    for kind in ("power", "section", "bom"):
        catalog = catalogs.get(kind)
        if not isinstance(catalog, Mapping):
            raise ElectricalFormulaError(
                "ELECTRICAL_FINAL_GATE_FAILED",
                f"Отсутствует snapshot каталога {kind}",
                details={"check": "catalog_missing", "left": kind, "right": None},
            )
        checksum = catalog.get("source_checksum") or catalog.get("payload_checksum")
        version = catalog.get("version")
        if not (isinstance(checksum, str) and checksum.strip()) and not (
            isinstance(version, str) and version.strip()
        ):
            raise ElectricalFormulaError(
                "ELECTRICAL_FINAL_GATE_FAILED",
                f"Каталог {kind} без version/checksum",
                details={"check": "catalog_identity", "left": kind, "right": None},
            )


def _legacy_physical_report(report: TTFormulaReport) -> TTFormulaReport:
    """Restore the legacy equal-section detail shape after core validation."""
    if report.is_valid:
        return report
    issue = report.issues[0]
    details = issue.details_dict()
    if details.get("check") != "equal_sections":
        return report
    left = details.get("left")
    field = details.get("field")
    index = details.get("index")
    if field is None or index is None:
        return report
    return TTFormulaReport(
        (
            TTFormulaIssue(
                issue.code,
                details={
                    "check": "equal_sections",
                    "left": {"index": index, "field": field, "value": left},
                    "right": details.get("right"),
                },
            ),
        )
    )


def assert_electrical_tt_ready(
    *,
    cable_mark: str | None,
    series: str | None,
    threads: int,
    voltage_v: float | int | Decimal,
    required_power_per_meter_w: float | Decimal,
    installed_power_per_meter_w: float | Decimal,
    plan: SectionPlan,
    sections: Sequence[Mapping[str, Any]],
    catalogs: Mapping[str, Any] | None = None,
) -> None:
    """Raise the legacy localized error if core physical acceptance rejects it."""
    report = validate_final_physical_gate(
        cable_mark=str(cable_mark or "").strip(),
        series=str(series or "").strip(),
        threads=threads,
        voltage_v=decimal_value(voltage_v),
        required_power_per_meter_w=decimal_value(required_power_per_meter_w),
        installed_power_per_meter_w=decimal_value(installed_power_per_meter_w),
        plan=plan,
        sections=_core_sections(sections),
    )
    raise_electrical_formula_report(_legacy_physical_report(report))
    if catalogs is not None:
        _assert_catalog_identity(catalogs)
