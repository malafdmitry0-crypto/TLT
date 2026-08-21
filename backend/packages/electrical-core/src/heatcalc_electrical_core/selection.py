"""Candidate construction and technical-minimum TT selection."""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal

from .catalogs import BomCatalogRow, CatalogBundle, PowerCatalogRow, normalize_mark
from .validation import TTFormulaIssue, TTFormulaReport

MAX_SELF_REG_AUTO_THREADS = 3
_TT_SERIES = frozenset({"ТТН", "ТТВ", "ТТХ"})
_SERIES_TIE_RANK = {"ТТН": 0, "ТТВ": 1, "ТТХ": 2}


@dataclass(frozen=True, slots=True)
class TTCatalogCandidate:
    power: PowerCatalogRow
    bom: BomCatalogRow
    base_model: str
    full_mark: str
    series: str
    passport_power: Decimal
    min_ambient_temperature: Decimal
    max_product_temperature: Decimal


@dataclass(frozen=True, slots=True)
class CableSelectionInput:
    required_power_per_meter: Decimal
    product_temperature: Decimal
    ambient_temperature: Decimal
    safety_factor: Decimal
    winding_factor: Decimal
    number_of_threads: int | None = None
    manual_cable_mark: str | None = None
    selection_policy: str = "technical_minimum"


@dataclass(frozen=True, slots=True)
class CableSelection:
    candidate: TTCatalogCandidate
    num_circuits: int
    required_power_per_meter: Decimal
    installed_power_per_meter: Decimal
    execution_defaulted: bool


def _report(code: str, /, **details: object) -> TTFormulaReport:
    return TTFormulaReport((TTFormulaIssue(code, details=details),))


def _series(row: PowerCatalogRow) -> str | None:
    explicit = (row.series or "").strip().upper()
    if explicit in _TT_SERIES:
        return explicit
    model = normalize_mark(row.model)
    return next((item for item in ("ТТН", "ТТВ", "ТТХ") if item in model), None)


def _execution_rank(mark: str) -> int:
    return 0 if mark.endswith("-СТ") else 1 if mark.endswith("-СР") else 2


def build_tt_catalog_candidates(
    bundle: CatalogBundle,
) -> tuple[TTCatalogCandidate, ...] | TTFormulaReport:
    if not bundle.power_rows:
        return _report(
            "ELECTRICAL_CATALOG_ROW_INVALID", model=None, missing_fields=("catalog_rows",)
        )
    candidates: list[TTCatalogCandidate] = []
    seen: set[str] = set()
    for power in bundle.power_rows:
        base = normalize_mark(power.model)
        series = _series(power)
        if not base:
            return _report(
                "ELECTRICAL_CATALOG_ROW_INVALID", model=power.model, missing_fields=("model",)
            )
        if series is None:
            return _report("ELECTRICAL_CATALOG_ROW_INVALID", model=power.model)
        section_rows = tuple(
            row for row in bundle.section_rows if normalize_mark(row.base_model) == base
        )
        if not section_rows:
            return _report(
                "ELECTRICAL_CATALOG_ROW_INVALID", model=base, missing_fields=("min_temperature",)
            )
        boms = tuple(
            row for row in bundle.bom_rows if normalize_mark(row.full_mark).startswith(f"{base}-")
        )
        if not boms:
            return _report(
                "ELECTRICAL_CATALOG_ROW_INVALID", model=base, missing_fields=("full_mark",)
            )
        for bom in boms:
            mark = normalize_mark(bom.full_mark)
            if not mark or not bom.nomenclature_code:
                return _report(
                    "ELECTRICAL_CATALOG_ROW_INVALID",
                    model=base,
                    missing_fields=("full_mark" if not mark else "nomenclature_code",),
                )
            if mark in seen:
                return _report(
                    "ELECTRICAL_CATALOG_ROW_INVALID", model=base, duplicate_full_mark=mark
                )
            seen.add(mark)
            candidates.append(
                TTCatalogCandidate(
                    power,
                    bom,
                    base,
                    mark,
                    series,
                    power.nominal_power,
                    min(row.cold_start_temperature for row in section_rows),
                    power.max_product_temperature,
                )
            )
    return tuple(candidates)


def select_tt_cable(
    bundle: CatalogBundle, selection: CableSelectionInput
) -> CableSelection | TTFormulaReport:
    if selection.selection_policy != "technical_minimum":
        return _report(
            "ELECTRICAL_SELECTION_POLICY_UNSUPPORTED", selection_policy=selection.selection_policy
        )
    if selection.number_of_threads is not None and selection.number_of_threads not in {1, 2, 3}:
        return _report("ELECTRICAL_THREAD_COUNT_INVALID")
    candidates = build_tt_catalog_candidates(bundle)
    if isinstance(candidates, TTFormulaReport):
        return candidates
    manual = (
        normalize_mark(selection.manual_cable_mark)
        if selection.manual_cable_mark is not None
        else None
    )
    if manual is not None:
        if manual.startswith("ТЛТ-"):
            return _report("ELECTRICAL_LEGACY_CABLE_MARK_UNSUPPORTED", requested_model=manual)
        candidates = tuple(row for row in candidates if row.full_mark == manual)
        if not candidates:
            return _report(
                "ELECTRICAL_CABLE_NOT_FOUND", requested_model=manual, manual_cable_model=manual
            )
    eligible = tuple(
        row
        for row in candidates
        if selection.ambient_temperature >= row.min_ambient_temperature
        and selection.product_temperature <= row.max_product_temperature
    )
    if not eligible:
        min_ambient = min(row.min_ambient_temperature for row in candidates)
        max_product = max(row.max_product_temperature for row in candidates)
        violations = tuple(
            name
            for name, condition in (
                ("ambient_below_minimum", selection.ambient_temperature < min_ambient),
                ("product_above_maximum", selection.product_temperature > max_product),
            )
            if condition
        ) or ("temperature_combination_unsupported",)
        return _report(
            "ELECTRICAL_CABLE_TEMPERATURE_LIMIT_EXCEEDED",
            product_temperature_c=selection.product_temperature,
            ambient_temperature_c=selection.ambient_temperature,
            minimum_supported_ambient_temperature_c=min_ambient,
            maximum_supported_product_temperature_c=max_product,
            violations=violations,
            manual_cable_model=manual,
        )
    threads = (
        (selection.number_of_threads,)
        if selection.number_of_threads is not None
        else (1,)
        if manual is not None
        else (1, 2, 3)
    )
    required = selection.required_power_per_meter * selection.safety_factor
    covered = tuple(
        (number, row)
        for number in threads
        for row in eligible
        if row.passport_power * selection.winding_factor * number >= required
    )
    if not covered:
        maximum = max(
            row.passport_power * selection.winding_factor * number
            for number in threads
            for row in eligible
        )
        return _report(
            "ELECTRICAL_CABLE_POWER_INSUFFICIENT",
            required_power_per_meter_w=required,
            maximum_available_power_per_meter_w=maximum,
            maximum_threads=threads[-1],
            manual_cable_model=manual,
        )
    number, candidate = min(
        covered,
        key=lambda item: (
            item[0],
            item[1].passport_power,
            item[1].passport_power * item[0],
            _SERIES_TIE_RANK[item[1].series],
            _execution_rank(item[1].full_mark),
            item[1].full_mark,
        ),
    )
    defaulted = manual is None and any(
        row.base_model == candidate.base_model and row.full_mark != candidate.full_mark
        for row in eligible
    )
    return CableSelection(
        candidate,
        number,
        required,
        candidate.passport_power * selection.winding_factor * number,
        defaulted,
    )
