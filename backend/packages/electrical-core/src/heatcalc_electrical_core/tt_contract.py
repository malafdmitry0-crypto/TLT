"""Formula identity and deterministic finite/range/cross-field validation."""

from __future__ import annotations

import hashlib
from decimal import Decimal

from .catalogs import CatalogBundle, PowerCatalogRow, SectionCatalogRow
from .contracts import PipeLayout, TTPreparationInput
from .validation import VALID_TT_FORMULA_REPORT, TTFormulaIssue, TTFormulaPath, TTFormulaReport

ELECTRICAL_TT_FORMULA_VERSION = "electrical-tt-v3-case1-r6"
_FORMULA_CONTRACT = (
    "case1-r6;P_req=q*K;P_cable=nominal_power;all-full-mark-candidates;"
    "T_product<=T_max;T_env>=T_min;manual-missing-N=1;"
    "sort=N,P_cable,P_cable*N,series(TTN<TTV<TTX),execution(ST<SR),full_mark;"
    "execution-source-warning;user-U-downstream;"
    "winding-pitch;Idop=project-setting??Lmax*Ist_ud;equal-sections;"
    "Lfact-totals;order=ceil(Lfact*1.10,0.001)"
)
ELECTRICAL_TT_FORMULA_FINGERPRINT = (
    "sha256:" + hashlib.sha256(_FORMULA_CONTRACT.encode("utf-8")).hexdigest()
)


def _report(code: str, path: str | TTFormulaPath, **details: object) -> TTFormulaReport:
    normalized_path = (path,) if isinstance(path, str) else path
    return TTFormulaReport((TTFormulaIssue.with_details(code, path=normalized_path, **details),))


def _validate_decimal(
    value: object,
    path: str | TTFormulaPath,
    *,
    minimum: Decimal | None = None,
    maximum: Decimal | None = None,
    minimum_exclusive: bool = False,
) -> TTFormulaReport:
    """Return a report before a public Decimal can reach an operation/comparison."""

    if not isinstance(value, Decimal) or not value.is_finite():
        return _report("ELECTRICAL_INPUT_NOT_FINITE", path, value=value)
    if minimum is not None and (value <= minimum if minimum_exclusive else value < minimum):
        return _report(
            "ELECTRICAL_INPUT_OUT_OF_RANGE",
            path,
            value=value,
            minimum=minimum,
            minimum_exclusive=minimum_exclusive,
        )
    if maximum is not None and value > maximum:
        return _report("ELECTRICAL_INPUT_OUT_OF_RANGE", path, value=value, maximum=maximum)
    return VALID_TT_FORMULA_REPORT


def validate_tt_catalog_bundle(bundle: CatalogBundle) -> TTFormulaReport:
    """Validate every Decimal in an already-typed catalog snapshot.

    Raw payload adaptation deliberately keeps legacy section-row skipping rules.
    A caller that constructs immutable DTOs directly, however, must never be able
    to inject a non-finite Decimal into selection, ordering, or section math.
    """

    power_checks: tuple[tuple[str, Decimal | None, Decimal | None, bool], ...] = (
        ("nominal_power", Decimal("0"), None, True),
        ("max_product_temperature", None, None, False),
    )
    for index, row in enumerate(bundle.power_rows):
        if not isinstance(row, PowerCatalogRow):
            return _report("ELECTRICAL_CATALOG_ROW_INVALID", ("catalogs", "power_rows", index))
        for name, minimum, maximum, minimum_exclusive in power_checks:
            report = _validate_decimal(
                getattr(row, name),
                ("catalogs", "power_rows", index, name),
                minimum=minimum,
                maximum=maximum,
                minimum_exclusive=minimum_exclusive,
            )
            if not report.is_valid:
                return report

    section_checks: tuple[tuple[str, Decimal | None, bool], ...] = (
        ("cold_start_temperature", None, False),
        ("l_max_m", Decimal("0"), True),
        ("i_st_ud_a_per_m", Decimal("0"), True),
        ("voltage_v", Decimal("0"), True),
        ("i_dop_a", Decimal("0"), True),
    )
    for index, section_row in enumerate(bundle.section_rows):
        if not isinstance(section_row, SectionCatalogRow):
            return _report("ELECTRICAL_CATALOG_ROW_INVALID", ("catalogs", "section_rows", index))
        for name, minimum, minimum_exclusive in section_checks:
            value = getattr(section_row, name)
            if value is None and name != "cold_start_temperature":
                continue
            report = _validate_decimal(
                value,
                ("catalogs", "section_rows", index, name),
                minimum=minimum,
                minimum_exclusive=minimum_exclusive,
            )
            if not report.is_valid:
                return report
    return VALID_TT_FORMULA_REPORT


def validate_tt_option_inputs(
    bundle: CatalogBundle, *, product_temperature: object, ambient_temperature: object
) -> TTFormulaReport:
    """Validate the typed inputs of the public cable-options entry point."""

    for path, value in (
        ("product_temperature", product_temperature),
        ("ambient_temperature", ambient_temperature),
    ):
        report = _validate_decimal(value, path)
        if not report.is_valid:
            return report
    return validate_tt_catalog_bundle(bundle)


def validate_tt_contract(data: TTPreparationInput) -> TTFormulaReport:
    """Validate scalar and cross-field inputs in a stable, deterministic order."""
    checks: tuple[tuple[str | TTFormulaPath, object, Decimal | None, Decimal | None, bool], ...] = (
        ("required_power_per_meter_w", data.required_power_per_meter_w, Decimal("0"), None, True),
        ("product_temperature_c", data.product_temperature_c, None, None, False),
        ("ambient_temperature_c", data.ambient_temperature_c, None, None, False),
        ("supply_voltage_v", data.supply_voltage_v, Decimal("0"), None, True),
        ("safety_factor", data.safety_factor, Decimal("1"), Decimal("2"), False),
        ("cold_start_temperature_c", data.cold_start_temperature_c, None, None, False),
        (("layout", "base_length_m"), data.layout.base_length_m, Decimal("0"), None, True),
    )
    for path, value, minimum, maximum, minimum_exclusive in checks:
        report = _validate_decimal(
            value,
            path,
            minimum=minimum,
            maximum=maximum,
            minimum_exclusive=minimum_exclusive,
        )
        if not report.is_valid:
            return report
    if data.number_of_threads is not None and (
        type(data.number_of_threads) is not int or data.number_of_threads not in {1, 2, 3}
    ):
        return _report("ELECTRICAL_THREAD_COUNT_INVALID", "number_of_threads")
    if data.selection_policy != "technical_minimum":
        return _report(
            "ELECTRICAL_SELECTION_POLICY_UNSUPPORTED",
            "selection_policy",
            selection_policy=data.selection_policy,
        )
    current = data.max_start_current_per_section_a
    if current is not None:
        report = _validate_decimal(
            current,
            "max_start_current_per_section_a",
            minimum=Decimal("0"),
            minimum_exclusive=True,
        )
        if not report.is_valid:
            return report
    if not isinstance(data.layout, PipeLayout):
        return validate_tt_catalog_bundle(data.catalogs)
    diameter = data.layout.outer_diameter_mm
    pitch = data.layout.winding_pitch_mm
    if pitch is not None and diameter is None:
        return _report(
            "ELECTRICAL_WINDING_PITCH_INVALID",
            ("layout", "outer_diameter_mm"),
            outer_diameter_mm=None,
            winding_pitch_mm=pitch,
        )
    if diameter is not None:
        report = _validate_decimal(
            diameter,
            ("layout", "outer_diameter_mm"),
            minimum=Decimal("0"),
            minimum_exclusive=True,
        )
        if not report.is_valid:
            return report
    if pitch is not None:
        report = _validate_decimal(
            pitch,
            ("layout", "winding_pitch_mm"),
            minimum=Decimal("0"),
            minimum_exclusive=True,
        )
        if not report.is_valid:
            return report
    if pitch is not None and pitch <= (diameter or Decimal("0")):
        return _report(
            "ELECTRICAL_WINDING_PITCH_INVALID",
            ("layout", "winding_pitch_mm"),
            outer_diameter_mm=diameter,
            winding_pitch_mm=pitch,
        )
    return validate_tt_catalog_bundle(data.catalogs)
