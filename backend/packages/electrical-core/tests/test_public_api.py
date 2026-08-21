import heatcalc_electrical_core as core
from heatcalc_electrical_core import api

EXPECTED = {
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
}


def test_root_and_api_have_one_identical_explicit_public_surface() -> None:
    assert set(core.__all__) == EXPECTED
    assert core.__all__ == api.__all__
    assert all(hasattr(core, item) for item in EXPECTED)
    assert "SelectionFailure" not in core.__all__
