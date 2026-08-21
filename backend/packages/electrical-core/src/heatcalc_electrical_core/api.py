"""Stable high-level interface for dependency-free TT calculations."""

from .cable_options import CableOption, OptionsOutcome, list_tt_cable_options
from .catalogs import (
    BomCatalogRow,
    CatalogBundle,
    PowerCatalogRow,
    SectionCatalogRow,
    catalog_bundle_from_payload,
)
from .contracts import PipeLayout, TankLayout, TTFormulaResult, TTPreparationInput
from .errors import TTFormulaDomainError
from .formula_outcome import TTFormulaOutcome
from .geometry import compute_tank_cable_length
from .sections import EqualSection
from .tt_contract import ELECTRICAL_TT_FORMULA_FINGERPRINT, ELECTRICAL_TT_FORMULA_VERSION
from .tt_formula import run_tt_formula
from .validation import TTFormulaIssue, TTFormulaReport

__all__ = [
    "BomCatalogRow",
    "CableOption",
    "CatalogBundle",
    "ELECTRICAL_TT_FORMULA_FINGERPRINT",
    "ELECTRICAL_TT_FORMULA_VERSION",
    "EqualSection",
    "OptionsOutcome",
    "PipeLayout",
    "PowerCatalogRow",
    "SectionCatalogRow",
    "TTFormulaDomainError",
    "TTFormulaIssue",
    "TTFormulaOutcome",
    "TTFormulaReport",
    "TTFormulaResult",
    "TTPreparationInput",
    "TankLayout",
    "catalog_bundle_from_payload",
    "compute_tank_cable_length",
    "list_tt_cable_options",
    "run_tt_formula",
]
