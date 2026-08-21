"""Database predicate for the current TT result-snapshot contract."""

from __future__ import annotations

from sqlalchemy import and_, func, or_
from sqlalchemy.sql.elements import ColumnElement

from app.formulas.electrical.tt_contract import (
    ELECTRICAL_TT_FORMULA_FINGERPRINT,
    ELECTRICAL_TT_FORMULA_VERSION,
)
from app.models.electrical_calculation import ElectricalCalculation


def current_tt_result_sql_predicate() -> ColumnElement[bool]:
    """True for non-TT rows or TT rows carrying every current v3 fingerprint."""
    results = ElectricalCalculation.results
    mark = func.coalesce(
        ElectricalCalculation.cable_mark,
        results["cable_mark"].astext,
        results["selected_cable"].astext,
    )
    voltage = func.btrim(
        func.coalesce(
            results["electrical"]["nominal_voltage_v"].astext,
            results["resolved_inputs"]["nominal_voltage_v"].astext,
            results["voltage"].astext,
            "",
        )
    )
    current_limit = func.nullif(
        func.btrim(
            func.coalesce(
                results["resolved_inputs"]["max_section_start_current_a"].astext,
                results["section_plan"]["max_start_current_a"].astext,
                "",
            )
        ),
        "",
    )
    catalog_checks = [
        func.nullif(
            func.btrim(
                func.coalesce(
                    results["catalogs"][kind]["source_checksum"].astext,
                    results["catalogs"][kind]["payload_checksum"].astext,
                    results["provenance"]["catalogs"][kind]["source_checksum"].astext,
                    results["provenance"]["catalogs"][kind]["payload_checksum"].astext,
                    "",
                )
            ),
            "",
        ).is_not(None)
        for kind in ("power", "section", "bom")
    ]
    current_tt = and_(
        func.upper(func.coalesce(mark, "")).not_like("ТЛТ-%"),
        voltage.op("~")(r"^(?:[0-9]*[1-9][0-9]*(?:\.[0-9]+)?|0*\.[0-9]*[1-9][0-9]*)$"),
        results["provenance"]["formula_version"].astext == ELECTRICAL_TT_FORMULA_VERSION,
        results["provenance"]["formula_fingerprint"].astext == ELECTRICAL_TT_FORMULA_FINGERPRINT,
        current_limit.is_not(None),
        *catalog_checks,
    )
    return or_(
        ElectricalCalculation.cable_type != "self_regulating_tt",
        current_tt,
    )
