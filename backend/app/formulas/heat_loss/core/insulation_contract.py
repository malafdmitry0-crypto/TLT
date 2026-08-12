"""Catalog-free contract validation for a parsed insulation layer."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from .insulation_validation import validate_insulation_layer_ranges
from .material_validation import validate_temperature_interval
from .validation import (
    FormulaValidationCode,
    FormulaValidationIssue,
    FormulaValidationPath,
    FormulaValidationReport,
)

InsulationSource = Literal["manual", "reference"]
InsulationPlacement = Literal["indoor", "outdoor", "underground"]

ALLOWED_INSULATION_BASES_BY_PLACEMENT: dict[InsulationPlacement, frozenset[str]] = {
    "indoor": frozenset({"indoor", "attic", "basement"}),
    "outdoor": frozenset({"outdoor_summer", "outdoor_winter"}),
    "underground": frozenset({"channel", "tunnel", "technical_subfloor"}),
}


@dataclass(frozen=True)
class InsulationContractInput:
    """Parsed layer data needed without catalog or Pydantic dependencies.

    Presence flags deliberately remain available for reference-backed layers.
    This core validator does not decide whether such values conflict with a
    reference material; that legacy/catalog policy belongs to its parent.
    """

    thickness_m: float
    source: InsulationSource
    conductivity_w_mk: float | None
    temperature_range_c: tuple[float, float] | None
    conductivity_supplied: bool = False
    temperature_range_supplied: bool = False


def validate_insulation_contract(
    data: InsulationContractInput,
    *,
    path: FormulaValidationPath = (),
) -> FormulaValidationReport:
    """Validate numeric values, then manual-layer requirements in phase order.

    Reference-backed layers are intentionally catalog-free: their identity,
    existence, and any supplied-manual-value conflict are caller policy.
    """

    range_report = validate_insulation_layer_ranges(
        data.thickness_m,
        data.conductivity_w_mk,
        path=path,
    )
    if not range_report.is_valid:
        return range_report

    if data.source == "reference":
        return FormulaValidationReport()

    if data.conductivity_w_mk is None:
        return _issue("manual_layer_conductivity_required", (*path, "conductivity"))
    if data.temperature_range_c is None:
        return _issue("manual_layer_temperature_range_required", (*path, "temperature_range"))

    return validate_temperature_interval(
        minimum_c=data.temperature_range_c[0],
        maximum_c=data.temperature_range_c[1],
        path=(*path, "temperature_range"),
    )


def validate_insulation_basis_for_placement(
    *,
    basis: str | None,
    placement: InsulationPlacement,
    path: FormulaValidationPath = ("insulation_temperature_basis",),
) -> FormulaValidationReport:
    """Validate the selected insulation-temperature basis for a placement."""

    if basis is None or basis in ALLOWED_INSULATION_BASES_BY_PLACEMENT[placement]:
        return FormulaValidationReport()
    return _issue("insulation_basis_not_allowed_for_placement", path)


def _issue(code: FormulaValidationCode, path: FormulaValidationPath) -> FormulaValidationReport:
    return FormulaValidationReport((FormulaValidationIssue.with_details(code, path=path),))
